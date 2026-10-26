use crate::models::{LrcLibTrack, MusicBrainzCandidate};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use reqwest::{Client, Response, StatusCode};
use serde_json::Value;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
mod albums;
mod cache;
pub use albums::{album_matches, fetch_album_tracks, search_albums};
use cache::RequestCache;

fn normalized(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn has_lyrics(track: &LrcLibTrack) -> bool {
    [&track.synced_lyrics, &track.plain_lyrics]
        .iter()
        .any(|lyrics| lyrics.as_ref().is_some_and(|text| !text.trim().is_empty()))
}

fn build_http_client() -> Result<Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    static CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            Client::builder()
                .user_agent(concat!(
                    "LofAudio/",
                    env!("CARGO_PKG_VERSION"),
                    " (https://github.com/loopix8000/Lof-audio)"
                ))
                .timeout(Duration::from_secs(12))
                .build()
                .map_err(|e| format!("HTTP 클라이언트 생성 실패: {}", e))
        })
        .clone()
}

/// Backoff before each retry; LRCLIB intermittently answers 503 under load.
const LRCLIB_RETRY_DELAYS: [Duration; 2] =
    [Duration::from_millis(700), Duration::from_millis(1800)];

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
    static CACHE: OnceLock<RequestCache<Option<LrcLibTrack>>> = OnceLock::new();
    let key = serde_json::to_string(&(
        track_name.trim(),
        artist_name.trim(),
        album_name.trim(),
        duration_secs.round(),
    ))
    .map_err(|e| e.to_string())?;
    tokio::time::timeout(
        Duration::from_secs(20),
        CACHE
            .get_or_init(|| RequestCache::new(128, Duration::from_secs(300)))
            .get_or_fetch(key, || {
                fetch_lrclib_auto_inner(track_name, artist_name, album_name, duration_secs)
            }),
    )
    .await
    .map_err(|_| {
        "LRCLIB 가사 조회 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.".to_string()
    })?
}

async fn fetch_lrclib_auto_inner(
    track_name: &str,
    artist_name: &str,
    album_name: &str,
    duration_secs: f64,
) -> Result<Option<LrcLibTrack>, String> {
    let client = build_http_client()?;

    let exact = async {
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
                        if has_lyrics(&item) {
                            return Ok(Some(item));
                        }
                    }
                }
            }
        }
        Ok(None)
    };

    let query = if artist_name != "Unknown Artist" && !artist_name.trim().is_empty() {
        format!("{} {}", artist_name.trim(), track_name.trim())
    } else {
        track_name.trim().to_string()
    };

    let search = async {
        // Let a fast exact match finish without sending a second request.
        tokio::time::sleep(Duration::from_millis(300)).await;
        let results = search_lrclib(&query).await?;
        Ok(select_lyrics(
            results,
            track_name,
            artist_name,
            duration_secs,
        ))
    };
    first_lyrics(exact, search).await
}

async fn first_lyrics<A, B>(exact: A, search: B) -> Result<Option<LrcLibTrack>, String>
where
    A: std::future::Future<Output = Result<Option<LrcLibTrack>, String>>,
    B: std::future::Future<Output = Result<Option<LrcLibTrack>, String>>,
{
    tokio::pin!(exact, search);
    let (first, second) = tokio::select! {
        result = &mut exact => {
            if matches!(result, Ok(Some(_))) { return result; }
            (result, search.await)
        },
        result = &mut search => {
            if matches!(result, Ok(Some(_))) { return result; }
            (result, exact.await)
        }
    };
    match first {
        Ok(Some(item)) => Ok(Some(item)),
        _ => match second {
            Ok(Some(item)) => Ok(Some(item)),
            Err(error) => Err(error),
            Ok(None) => first,
        },
    }
}

fn select_lyrics(
    results: Vec<LrcLibTrack>,
    title: &str,
    artist: &str,
    duration_secs: f64,
) -> Option<LrcLibTrack> {
    let matching: Vec<LrcLibTrack> = results
        .into_iter()
        .filter(|r| {
            if !has_lyrics(r)
                || r.track_name
                    .as_deref()
                    .is_none_or(|name| normalized(name) != normalized(title))
            {
                return false;
            }
            if !artist.trim().is_empty()
                && artist != "Unknown Artist"
                && r.artist_name
                    .as_deref()
                    .is_none_or(|name| normalized(name) != normalized(artist))
            {
                return false;
            }
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
        return Some(best_synced.clone());
    }

    matching.into_iter().next()
}

pub async fn search_lrclib(query: &str) -> Result<Vec<LrcLibTrack>, String> {
    static CACHE: OnceLock<RequestCache<Vec<LrcLibTrack>>> = OnceLock::new();
    CACHE
        .get_or_init(|| RequestCache::new(128, Duration::from_secs(300)))
        .get_or_fetch(query.trim().to_string(), || search_lrclib_uncached(query))
        .await
}

async fn search_lrclib_uncached(query: &str) -> Result<Vec<LrcLibTrack>, String> {
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

async fn wait_for_musicbrainz_slot() -> Result<(), String> {
    // MusicBrainz permits one request per second per client, including MCP searches.
    static NEXT_REQUEST: OnceLock<Mutex<Instant>> = OnceLock::new();
    let slot = {
        let mut next = NEXT_REQUEST
            .get_or_init(|| Mutex::new(Instant::now()))
            .lock()
            .map_err(|e| e.to_string())?;
        let slot = (*next).max(Instant::now());
        *next = slot + Duration::from_millis(1100);
        slot
    };
    tokio::time::sleep_until(slot.into()).await;
    Ok(())
}

pub async fn search_musicbrainz(
    title: &str,
    artist: &str,
    query_override: Option<String>,
) -> Result<Vec<MusicBrainzCandidate>, String> {
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

    let json = musicbrainz_json(
        "recording",
        &[
            ("query", lucene_query.as_str()),
            ("fmt", "json"),
            ("limit", "12"),
        ],
    )
    .await?;

    Ok(parse_recordings(&json, title, artist))
}

async fn musicbrainz_json(endpoint: &str, params: &[(&str, &str)]) -> Result<Value, String> {
    static CACHE: OnceLock<RequestCache<Value>> = OnceLock::new();
    let key = serde_json::to_string(&(endpoint, params)).map_err(|e| e.to_string())?;
    CACHE
        .get_or_init(|| RequestCache::new(64, Duration::from_secs(600)))
        .get_or_fetch(key, || async {
            let client = build_http_client()?;
            wait_for_musicbrainz_slot().await?;
            let resp = client
                .get(format!("https://musicbrainz.org/ws/2/{endpoint}"))
                .query(params)
                .send()
                .await
                .map_err(|e| format!("MusicBrainz 검색 실패: {}", e))?;

            if !resp.status().is_success() {
                return Err(format!("MusicBrainz HTTP 오류: {}", resp.status()));
            }

            resp.json()
                .await
                .map_err(|e| format!("MusicBrainz JSON 파싱 실패: {}", e))
        })
        .await
}

fn parse_recordings(json: &Value, title: &str, artist: &str) -> Vec<MusicBrainzCandidate> {
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
                    first.get("name").and_then(|n| n.as_str()).or_else(|| {
                        first
                            .get("artist")
                            .and_then(|a| a.get("name"))
                            .and_then(|n| n.as_str())
                    })
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

    candidates
}

pub async fn fetch_cover_art_by_mbid(release_mbid: &str) -> Result<String, String> {
    static CACHE: OnceLock<RequestCache<String>> = OnceLock::new();
    CACHE
        .get_or_init(|| RequestCache::new(8, Duration::from_secs(1800)))
        .get_or_fetch(release_mbid.trim().to_string(), || {
            fetch_cover_art_uncached(release_mbid)
        })
        .await
}

async fn fetch_cover_art_uncached(release_mbid: &str) -> Result<String, String> {
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

    fn lyric(id: i64, artist: &str) -> LrcLibTrack {
        serde_json::from_value(serde_json::json!({"id":id,"name":null,"trackName":"Song","artistName":artist,"albumName":"Album","duration":120,"instrumental":false,"syncedLyrics":"[00:01]Lyrics","plainLyrics":"Lyrics"})).unwrap()
    }

    #[tokio::test]
    async fn a_valid_lyric_response_does_not_wait_for_the_other_endpoint() {
        let pending = || std::future::pending::<Result<Option<LrcLibTrack>, String>>();
        let first = tokio::time::timeout(
            Duration::from_millis(100),
            first_lyrics(async { Ok(Some(lyric(1, "Artist"))) }, pending()),
        )
        .await
        .unwrap()
        .unwrap();
        let second = tokio::time::timeout(
            Duration::from_millis(100),
            first_lyrics(pending(), async { Ok(Some(lyric(2, "Artist"))) }),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(first.unwrap().id, 1);
        assert_eq!(second.unwrap().id, 2);
        let fallback = first_lyrics(async { Err("unavailable".into()) }, async {
            tokio::task::yield_now().await;
            Ok(Some(lyric(3, "Artist")))
        })
        .await
        .unwrap();
        assert_eq!(fallback.unwrap().id, 3);
    }

    #[test]
    fn a_fast_search_must_not_select_another_artists_lyrics() {
        let result = select_lyrics(
            vec![lyric(1, "Other Artist"), lyric(2, "Artist")],
            "Song",
            "Artist",
            120.0,
        );
        assert_eq!(result.unwrap().id, 2);
        assert!(
            select_lyrics(vec![lyric(1, "Artist")], "Different Song", "Artist", 120.0).is_none()
        );
        assert!(select_lyrics(vec![lyric(1, "Artist")], "Song", "Artist", 320.0).is_none());
    }

    #[test]
    fn shared_client_initializes_tls_without_an_update_check() {
        assert!(build_http_client().is_ok());
        assert!(build_http_client().is_ok());
    }

    // Hits the live LRCLIB API; run with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn test_search_lrclib_survives_transient_errors() {
        for _ in 0..6 {
            let items = search_lrclib("tayori 風のたより").await.unwrap();
            assert!(!items.is_empty());
        }
    }

    // Read-only live probe using the public album used for manual verification.
    #[tokio::test]
    #[ignore]
    async fn live_album_cache_probe() {
        let start = Instant::now();
        let albums = search_albums("memento", "tayori", None).await.unwrap();
        let search_ms = start.elapsed().as_millis();
        assert!(!albums.is_empty());
        let start = Instant::now();
        let tracks = fetch_album_tracks(&albums[0].release_id).await.unwrap();
        let detail_ms = start.elapsed().as_millis();
        assert!(!tracks.is_empty());
        let start = Instant::now();
        let again = search_albums("memento", "tayori", None).await.unwrap();
        let cached = fetch_album_tracks(&albums[0].release_id).await.unwrap();
        let cached_us = start.elapsed().as_micros();
        assert_eq!(again.len(), albums.len());
        assert_eq!(cached.len(), tracks.len());
        println!("album search={search_ms}ms, full track list={detail_ms}ms, repeated search+list={cached_us}us, tracks={}", tracks.len());
    }
}
