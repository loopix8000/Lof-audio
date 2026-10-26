use crate::models::{LrcLibTrack, MusicBrainzCandidate};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use reqwest::{Client, Response, StatusCode};
use serde_json::Value;
use std::time::Duration;

fn build_http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("LofAudio/0.1.0 (https://github.com/lof-audio; contact@lof-audio.local)")
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| format!("HTTP 클라이언트 생성 실패: {}", e))
}

/// Backoff before each retry; LRCLIB intermittently answers 503 under load.
const LRCLIB_RETRY_DELAYS: [Duration; 2] = [Duration::from_millis(700), Duration::from_millis(1800)];

fn is_retryable_status(status: StatusCode) -> bool {
    status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS
}

/// GETs an LRCLIB endpoint, retrying transient failures (5xx, 429, timeouts, connection errors).
/// Returns the last response as-is when it is not retryable or retries are exhausted.
async fn lrclib_get(
    client: &Client,
    url: &str,
    query: &[(&str, String)],
) -> Result<Response, String> {
    let mut attempt = 0;
    loop {
        let result = client.get(url).query(query).send().await;
        let retryable = match &result {
            Ok(resp) => is_retryable_status(resp.status()),
            Err(e) => e.is_timeout() || e.is_connect(),
        };
        if !retryable || attempt >= LRCLIB_RETRY_DELAYS.len() {
            return result.map_err(|e| format!("LRCLIB 요청 실패: {}", e));
        }
        tokio::time::sleep(LRCLIB_RETRY_DELAYS[attempt]).await;
        attempt += 1;
    }
}

pub async fn fetch_lrclib_auto(
    track_name: &str,
    artist_name: &str,
    album_name: &str,
    duration_secs: f64,
) -> Result<Option<LrcLibTrack>, String> {
    let client = build_http_client()?;

    // 1. Try exact /api/get first if we have track_name and artist_name
    if !track_name.trim().is_empty()
        && !artist_name.trim().is_empty()
        && artist_name != "Unknown Artist"
    {
        let mut params = vec![
            ("track_name", track_name.trim().to_string()),
            ("artist_name", artist_name.trim().to_string()),
        ];
        if !album_name.trim().is_empty() && album_name != "Unknown Album" {
            params.push(("album_name", album_name.trim().to_string()));
        }
        if duration_secs > 1.0 {
            params.push(("duration", format!("{:.0}", duration_secs)));
        }

        if let Ok(resp) = lrclib_get(&client, "https://lrclib.net/api/get", &params).await {
            if resp.status().is_success() {
                if let Ok(item) = resp.json::<LrcLibTrack>().await {
                    if item.synced_lyrics.is_some() || item.plain_lyrics.is_some() {
                        return Ok(Some(item));
                    }
                }
            }
        }
    }

    // 2. Fallback to /api/search
    let query = if artist_name != "Unknown Artist" && !artist_name.trim().is_empty() {
        format!("{} {}", artist_name.trim(), track_name.trim())
    } else {
        track_name.trim().to_string()
    };

    let results = search_lrclib(&query).await?;
    let matching: Vec<LrcLibTrack> = results
        .into_iter()
        .filter(|r| {
            if duration_secs > 5.0 {
                if let Some(d) = r.duration {
                    if (d - duration_secs).abs() > 8.0 {
                        return false;
                    }
                }
            }
            true
        })
        .collect();

    // Prefer a result that has synced_lyrics
    if let Some(best_synced) = matching.iter().find(|r| {
        r.synced_lyrics
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
    }) {
        return Ok(Some(best_synced.clone()));
    }

    Ok(matching.into_iter().next())
}

pub async fn search_lrclib(query: &str) -> Result<Vec<LrcLibTrack>, String> {
    let client = build_http_client()?;
    let resp = lrclib_get(
        &client,
        "https://lrclib.net/api/search",
        &[("q", query.trim().to_string())],
    )
    .await?;

    let status = resp.status();
    if is_retryable_status(status) {
        return Err(format!(
            "LRCLIB 서버가 일시적으로 응답하지 않습니다 (HTTP {}). 잠시 후 다시 시도해 주세요.",
            status.as_u16()
        ));
    }
    if !status.is_success() {
        return Err(format!("LRCLIB 응답 오류: HTTP {}", status));
    }

    let items = resp
        .json::<Vec<LrcLibTrack>>()
        .await
        .map_err(|e| format!("LRCLIB 응답 파싱 실패: {}", e))?;
    Ok(items)
}

pub async fn search_musicbrainz(
    title: &str,
    artist: &str,
    query_override: Option<String>,
) -> Result<Vec<MusicBrainzCandidate>, String> {
    let client = build_http_client()?;

    let lucene_query = if let Some(q) = query_override.filter(|s| !s.trim().is_empty()) {
        q
    } else if !artist.trim().is_empty() && artist != "Unknown Artist" {
        format!(
            "recording:\"{}\" AND artist:\"{}\"",
            title.replace('"', ""),
            artist.replace('"', "")
        )
    } else {
        format!("recording:\"{}\"", title.replace('"', ""))
    };

    let resp = client
        .get("https://musicbrainz.org/ws/2/recording")
        .query(&[
            ("query", lucene_query.as_str()),
            ("fmt", "json"),
            ("limit", "12"),
        ])
        .send()
        .await
        .map_err(|e| format!("MusicBrainz 검색 실패: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("MusicBrainz HTTP 오류: {}", resp.status()));
    }

    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("MusicBrainz JSON 파싱 실패: {}", e))?;

    let mut candidates = Vec::new();
    if let Some(recordings) = json.get("recordings").and_then(|v| v.as_array()) {
        for rec in recordings {
            let rec_id = rec
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            if rec_id.is_empty() {
                continue;
            }
            let rec_title = rec
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or(title)
                .to_string();
            let score = rec.get("score").and_then(|v| v.as_u64()).map(|n| n as u32);

            let rec_artist = rec
                .get("artist-credit")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|first| {
                    first
                        .get("name")
                        .and_then(|n| n.as_str())
                        .or_else(|| first.get("artist").and_then(|a| a.get("name")).and_then(|n| n.as_str()))
                })
                .unwrap_or(artist)
                .to_string();

            let releases = rec.get("releases").and_then(|v| v.as_array());
            if let Some(rel_list) = releases {
                if let Some(first_rel) = rel_list.first() {
                    let rel_id = first_rel
                        .get("id")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let album_title = first_rel
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown Album")
                        .to_string();
                    let year = first_rel
                        .get("date")
                        .and_then(|v| v.as_str())
                        .and_then(|d| d.get(0..4))
                        .and_then(|y| y.parse::<u32>().ok());
                    let track_num = first_rel
                        .get("media")
                        .and_then(|v| v.as_array())
                        .and_then(|m| m.first())
                        .and_then(|m| m.get("track"))
                        .and_then(|t| t.as_array())
                        .and_then(|t| t.first())
                        .and_then(|t| t.get("number"))
                        .and_then(|n| n.as_str())
                        .and_then(|n| n.parse::<u32>().ok());

                    let cover_url = rel_id
                        .as_ref()
                        .map(|id| format!("https://coverartarchive.org/release/{}/front-500", id));

                    candidates.push(MusicBrainzCandidate {
                        recording_id: rec_id,
                        title: rec_title,
                        artist: rec_artist,
                        album: album_title,
                        release_id: rel_id,
                        year,
                        track_number: track_num,
                        score,
                        cover_url,
                    });
                    continue;
                }
            }

            candidates.push(MusicBrainzCandidate {
                recording_id: rec_id,
                title: rec_title,
                artist: rec_artist,
                album: "Single".to_string(),
                release_id: None,
                year: None,
                track_number: None,
                score,
                cover_url: None,
            });
        }
    }

    Ok(candidates)
}

pub async fn fetch_cover_art_by_mbid(release_mbid: &str) -> Result<String, String> {
    let client = build_http_client()?;
    let urls = [
        format!(
            "https://coverartarchive.org/release/{}/front-500",
            release_mbid.trim()
        ),
        format!(
            "https://coverartarchive.org/release/{}/front",
            release_mbid.trim()
        ),
    ];

    for url in urls {
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                let mime = resp
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("image/jpeg")
                    .to_string();
                if let Ok(bytes) = resp.bytes().await {
                    if !bytes.is_empty() {
                        let b64 = BASE64.encode(&bytes);
                        return Ok(format!("data:{};base64,{}", mime, b64));
                    }
                }
            }
        }
    }

    Err("해당 Release MBID에서 앨범 아트를 찾을 수 없습니다.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Hits the live LRCLIB API; run with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn test_search_lrclib_survives_transient_errors() {
        for _ in 0..6 {
            let items = search_lrclib("tayori 風のたより").await.unwrap();
            assert!(!items.is_empty());
        }
    }
}
