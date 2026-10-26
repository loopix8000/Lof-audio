use super::{musicbrainz_json, normalized};
use crate::models::{AlbumCandidate, AlbumTrackMatch, MusicBrainzCandidate, Track};
use serde_json::Value;

pub struct AlbumRecording {
    pub candidate: MusicBrainzCandidate,
    pub duration_secs: Option<f64>,
}

fn artist_credit(value: &Value) -> String {
    value
        .as_array()
        .map(|credits| {
            credits
                .iter()
                .map(|credit| {
                    format!(
                        "{}{}",
                        credit["name"]
                            .as_str()
                            .or_else(|| credit["artist"]["name"].as_str())
                            .unwrap_or_default(),
                        credit["joinphrase"].as_str().unwrap_or_default()
                    )
                })
                .collect::<String>()
        })
        .unwrap_or_default()
}

pub async fn search_albums(
    album: &str,
    artist: &str,
    query: Option<String>,
) -> Result<Vec<AlbumCandidate>, String> {
    let quoted = |text: &str| text.replace('\\', "\\\\").replace('"', "\\\"");
    let query = query.filter(|q| !q.trim().is_empty()).unwrap_or_else(|| {
        if artist.trim().is_empty() || artist == "Unknown Artist" {
            format!("release:\"{}\"", quoted(album))
        } else {
            format!(
                "release:\"{}\" AND artist:\"{}\"",
                quoted(album),
                quoted(artist)
            )
        }
    });
    let json = musicbrainz_json(
        "release",
        &[("query", &query), ("fmt", "json"), ("limit", "12")],
    )
    .await?;
    Ok(json["releases"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|release| {
            Some(AlbumCandidate {
                release_id: release["id"].as_str()?.into(),
                album: release["title"].as_str()?.into(),
                artist: artist_credit(&release["artist-credit"]),
                date: release["date"].as_str().map(String::from),
                country: release["country"].as_str().map(String::from),
                track_count: release["track-count"].as_u64().unwrap_or(0) as u32,
            })
        })
        .collect())
}

pub fn valid_release_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}

pub async fn fetch_album_tracks(release_id: &str) -> Result<Vec<AlbumRecording>, String> {
    if !valid_release_id(release_id) {
        return Err("INVALID_ARGUMENT: releaseId는 MusicBrainz 발매판 ID여야 합니다.".into());
    }
    let json = musicbrainz_json(
        &format!("release/{release_id}"),
        &[("inc", "recordings+artist-credits"), ("fmt", "json")],
    )
    .await?;
    Ok(parse_album(&json, release_id))
}

fn parse_album(json: &Value, release_id: &str) -> Vec<AlbumRecording> {
    let artist = artist_credit(&json["artist-credit"]);
    let album = json["title"].as_str().unwrap_or_default();
    let year = json["date"]
        .as_str()
        .and_then(|s| s.get(..4))
        .and_then(|s| s.parse().ok());
    let mut tracks = Vec::new();
    for media in json["media"].as_array().into_iter().flatten() {
        for track in media["tracks"].as_array().into_iter().flatten() {
            let recording = &track["recording"];
            let Some(id) = recording["id"].as_str() else {
                continue;
            };
            let credit = if track["artist-credit"].is_array() {
                &track["artist-credit"]
            } else {
                &recording["artist-credit"]
            };
            let credited_artist = artist_credit(credit);
            tracks.push(AlbumRecording {
                candidate: MusicBrainzCandidate {
                    recording_id: id.into(),
                    title: track["title"]
                        .as_str()
                        .or_else(|| recording["title"].as_str())
                        .unwrap_or_default()
                        .into(),
                    artist: if credited_artist.is_empty() {
                        artist.clone()
                    } else {
                        credited_artist
                    },
                    album: album.into(),
                    release_id: Some(release_id.into()),
                    year,
                    track_number: track["number"]
                        .as_str()
                        .and_then(|n| n.parse().ok())
                        .or_else(|| track["position"].as_u64().map(|n| n as u32)),
                    score: None,
                    cover_url: Some(format!(
                        "https://coverartarchive.org/release/{release_id}/front-500"
                    )),
                },
                duration_secs: track["length"]
                    .as_f64()
                    .or_else(|| recording["length"].as_f64())
                    .map(|ms| ms / 1000.0),
            });
        }
    }
    tracks
}

pub fn album_matches(tracks: &[Track], recordings: &[AlbumRecording]) -> Vec<AlbumTrackMatch> {
    tracks
        .iter()
        .map(|track| {
            let title = normalized(&track.title);
            let mut matching: Vec<_> = recordings
                .iter()
                .filter(|recording| {
                    !title.is_empty()
                        && normalized(&recording.candidate.title) == title
                        && !recording.duration_secs.is_some_and(|seconds| {
                            track.duration_secs > 5.0
                                && (seconds - track.duration_secs).abs() > 12.0
                        })
                })
                .collect();
            matching.sort_by_key(|recording| {
                (
                    recording.candidate.track_number != track.track_number,
                    normalized(&recording.candidate.artist) != normalized(&track.artist),
                )
            });
            AlbumTrackMatch {
                track_id: track.id,
                candidates: matching.into_iter().map(|r| r.candidate.clone()).collect(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn local(id: i64, title: &str, number: u32, duration: f64) -> Track {
        serde_json::from_value(json!({"id":id,"filePath":"fixture.flac","fileName":"fixture.flac","folderPath":"fixture","title":title,"artist":"Artist","album":"Album","albumArtist":"Artist","trackNumber":number,"year":null,"genre":"","durationSecs":duration,"bitrate":null,"sampleRate":null,"channels":null,"format":"FLAC","coverDataUrl":null,"syncedLyrics":null,"plainLyrics":null,"lyricOffsetMs":0,"mbidRecording":null,"mbidRelease":null,"isFavorite":false,"playCount":0})).unwrap()
    }

    #[test]
    fn album_lookup_matches_titles_not_file_order_and_rejects_wrong_versions() {
        let release = json!({"title":"Album","date":"2026-02-01","artist-credit":[{"name":"Artist"}],"media":[{"tracks":[
            {"number":"1","position":1,"title":"First Song","length":120000,"recording":{"id":"first"}},
            {"number":"2","position":2,"title":"Second Song","length":180000,"artist-credit":[{"name":"Singer"}],"recording":{"id":"second"}},
            {"number":"3","position":3,"title":"First Song","length":320000,"recording":{"id":"live"}}
        ]}]});
        let recordings = parse_album(&release, "release");
        let result = album_matches(
            &[
                local(1, "SECOND SONG", 1, 180.0),
                local(2, "First-Song", 2, 120.0),
                local(3, "Different Song", 3, 320.0),
            ],
            &recordings,
        );
        assert_eq!(result[0].candidates[0].recording_id, "second");
        assert_eq!(result[0].candidates[0].artist, "Singer");
        assert_eq!(result[0].candidates[0].track_number, Some(2));
        assert_eq!(result[1].candidates.len(), 1);
        assert_eq!(result[1].candidates[0].recording_id, "first");
        assert!(result[2].candidates.is_empty());
        assert_eq!(result[0].candidates[0].year, Some(2026));
    }

    #[test]
    fn release_id_cannot_change_the_request_path() {
        assert!(valid_release_id("22b48d61-1822-47fc-980c-fd597424c28a"));
        assert!(!valid_release_id("../../recording?query=other"));
        assert!(!valid_release_id("zzb48d61-1822-47fc-980c-fd597424c28a"));
    }
}
