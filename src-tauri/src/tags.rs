use crate::models::Track;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::{Accessor, ItemKey};
use lofty::probe::Probe;
use lofty::tag::Tag;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

pub fn read_track_from_path(path: &Path) -> Option<Track> {
    let file_path = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let folder_path = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_uppercase())
        .unwrap_or_else(|| "AUDIO".to_string());

    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file_name.clone());

    // Default fallback values parsed from filename stem
    let (parsed_lead_num, stem_after_num) = parse_leading_track_number(&stem);
    let (default_artist, default_title) = if let Some((a, t)) = stem_after_num.split_once(" - ") {
        (a.trim().to_string(), t.trim().to_string())
    } else {
        ("Unknown Artist".to_string(), stem.clone())
    };

    let mut title = default_title;
    let mut artist = default_artist;
    let mut album = "Unknown Album".to_string();
    let mut album_artist = String::new();
    let mut track_number = parsed_lead_num;
    let mut year = None;
    let mut genre = String::new();
    let mut duration_secs = 0.0;
    let mut bitrate = None;
    let mut sample_rate = None;
    let mut channels = None;
    let mut cover_data_url = None;
    let mut plain_lyrics = None;
    let mut synced_lyrics = None;

    if let Ok( probed ) = Probe::open(path) {
        if let Ok(tagged_file) = probed.read() {
            let props = tagged_file.properties();
            duration_secs = props.duration().as_secs_f64();
            bitrate = props.audio_bitrate();
            sample_rate = props.sample_rate();
            channels = props.channels();

            if let Some(tag) = tagged_file
                .primary_tag()
                .or_else(|| tagged_file.first_tag())
            {
                if let Some(t) = tag.title() {
                    let s = t.trim();
                    if !s.is_empty() {
                        title = s.to_string();
                    }
                }
                if let Some(a) = tag.artist() {
                    let s = a.trim();
                    if !s.is_empty() {
                        artist = s.to_string();
                    }
                }
                if let Some(al) = tag.album() {
                    let s = al.trim();
                    if !s.is_empty() {
                        album = s.to_string();
                    }
                }
                if let Some(aa) = tag.get_string(&ItemKey::AlbumArtist) {
                    album_artist = aa.trim().to_string();
                }
                track_number = tag.track().or(parsed_lead_num);
                year = tag.year();
                if let Some(g) = tag.genre() {
                    genre = g.trim().to_string();
                }
                if let Some(lyr) = tag.get_string(&ItemKey::Lyrics) {
                    let trimmed = lyr.trim().to_string();
                    if !trimmed.is_empty() {
                        if is_lrc_format(&trimmed) {
                            synced_lyrics = Some(trimmed.clone());
                        }
                        plain_lyrics = Some(strip_lrc_timestamps(&trimmed));
                    }
                }
                if let Some(pic) = tag.pictures().first() {
                    let mime = pic
                        .mime_type()
                        .map(|m| m.as_str())
                        .unwrap_or("image/jpeg");
                    let encoded = BASE64.encode(pic.data());
                    cover_data_url = Some(format!("data:{};base64,{}", mime, encoded));
                }
            }
        }
    }

    if album_artist.is_empty() {
        album_artist = artist.clone();
    }

    // Check sidecar .lrc file
    let lrc_path = path.with_extension("lrc");
    if lrc_path.exists() {
        if let Ok(lrc_content) = fs::read_to_string(&lrc_path) {
            let trimmed = lrc_content.trim().to_string();
            if !trimmed.is_empty() {
                synced_lyrics = Some(trimmed.clone());
                if plain_lyrics.is_none() {
                    plain_lyrics = Some(strip_lrc_timestamps(&trimmed));
                }
            }
        }
    }

    Some(Track {
        id: 0,
        file_path,
        file_name,
        folder_path,
        title,
        artist,
        album,
        album_artist,
        track_number,
        year,
        genre,
        duration_secs,
        bitrate,
        sample_rate,
        channels,
        format: ext,
        cover_data_url,
        synced_lyrics,
        plain_lyrics,
        lyric_offset_ms: 0,
        mbid_recording: None,
        mbid_release: None,
        is_favorite: false,
        play_count: 0,
    })
}

pub fn write_tags_to_file(
    file_path: &str,
    title: Option<&str>,
    artist: Option<&str>,
    album: Option<&str>,
    album_artist: Option<&str>,
    track_number: Option<u32>,
    year: Option<u32>,
    genre: Option<&str>,
    lyrics: Option<&str>,
    cover_data_url: Option<&str>,
    save_lrc_file: bool,
    synced_lyrics: Option<&str>,
) -> Result<(), String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err("오디오 파일이 존재하지 않습니다.".to_string());
    }

    if save_lrc_file {
        if let Some(lrc) = synced_lyrics {
            if !lrc.trim().is_empty() {
                let lrc_path = path.with_extension("lrc");
                let _ = fs::write(lrc_path, lrc);
            }
        }
    }

    let probed = Probe::open(path).map_err(|e| format!("파일 열기 실패: {}", e))?;
    let mut tagged_file = probed.read().map_err(|e| format!("태그 읽기 실패: {}", e))?;

    let tag_type = tagged_file.primary_tag_type();
    if tagged_file.primary_tag().is_none() {
        tagged_file.insert_tag(Tag::new(tag_type));
    }

    if let Some(tag) = tagged_file.primary_tag_mut() {
        if let Some(t) = title {
            tag.set_title(t.to_string());
        }
        if let Some(a) = artist {
            tag.set_artist(a.to_string());
        }
        if let Some(al) = album {
            tag.set_album(al.to_string());
        }
        if let Some(aa) = album_artist {
            tag.insert_text(ItemKey::AlbumArtist, aa.to_string());
        }
        if let Some(tn) = track_number {
            tag.set_track(tn);
        }
        if let Some(y) = year {
            tag.set_year(y);
        }
        if let Some(g) = genre {
            tag.set_genre(g.to_string());
        }
        if let Some(lyr) = synced_lyrics.or(lyrics) {
            if !lyr.is_empty() {
                tag.insert_text(ItemKey::Lyrics, lyr.to_string());
            }
        }
        if let Some(data_url) = cover_data_url {
            if let Some((mime_str, bytes)) = decode_data_url(data_url) {
                let mime = if mime_str.contains("png") {
                    MimeType::Png
                } else {
                    MimeType::Jpeg
                };
                let pic = Picture::new_unchecked(
                    PictureType::CoverFront,
                    Some(mime),
                    None,
                    bytes,
                );
                // Remove old front covers first
                tag.remove_picture_type(PictureType::CoverFront);
                tag.push_picture(pic);
            }
        }

        // Attempt to save to physical file (ignore if read-only or unsupported container)
        let _ = tagged_file.save_to_path(path, WriteOptions::default());
    }

    Ok(())
}

pub fn parse_leading_track_number(stem: &str) -> (Option<u32>, &str) {
    let trimmed = stem.trim();
    let bytes = trimmed.as_bytes();
    let mut idx = 0;
    while idx < bytes.len() && bytes[idx].is_ascii_digit() {
        idx += 1;
    }
    if idx > 0 && idx <= 3 {
        let rest = &trimmed[idx..];
        if let Some(after_dot) = rest.strip_prefix('.') {
            if let Ok(num) = trimmed[..idx].parse::<u32>() {
                return (Some(num), after_dot.trim());
            }
        } else if let Some(after_dash) = rest.strip_prefix(" - ") {
            if let Ok(num) = trimmed[..idx].parse::<u32>() {
                return (Some(num), after_dash.trim());
            }
        }
    }
    (None, trimmed)
}

pub fn decode_data_url(data_url: &str) -> Option<(String, Vec<u8>)> {
    let rest = data_url.strip_prefix("data:")?;
    let (meta, b64) = rest.split_once(";base64,")?;
    let bytes = BASE64.decode(b64.trim()).ok()?;
    Some((meta.to_string(), bytes))
}

pub fn is_lrc_format(text: &str) -> bool {
    text.lines().any(|line| {
        let l = line.trim();
        l.starts_with('[') && l.contains(':') && l.contains(']')
    })
}

pub fn strip_lrc_timestamps(text: &str) -> String {
    let mut out = Vec::new();
    for line in text.lines() {
        let mut s = line.trim();
        while s.starts_with('[') {
            if let Some(idx) = s.find(']') {
                let inside = &s[1..idx];
                // Skip metadata tags like [ar:...], [ti:...]
                if inside.starts_with("ar:")
                    || inside.starts_with("ti:")
                    || inside.starts_with("al:")
                    || inside.starts_with("by:")
                    || inside.starts_with("offset:")
                    || inside.starts_with("length:")
                {
                    s = "";
                    break;
                }
                s = s[idx + 1..].trim();
            } else {
                break;
            }
        }
        if !s.is_empty() {
            out.push(s);
        }
    }
    out.join("\n")
}

/// Parses a filename stem using a foobar2000-style pattern like "%artist% - %title%" or "%track%. %artist% - %title%"
pub fn parse_filename_with_pattern(file_name: &str, pattern: &str) -> HashMap<String, String> {
    let stem = Path::new(file_name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file_name.to_string());

    let mut result = HashMap::new();
    let mut tokens: Vec<String> = Vec::new();
    let mut literals: Vec<String> = Vec::new();

    let mut rest = pattern;
    while let Some(start) = rest.find('%') {
        let before = &rest[..start];
        let after_start = &rest[start + 1..];
        if let Some(end) = after_start.find('%') {
            let token = &after_start[..end];
            if !tokens.is_empty() {
                literals.push(before.to_string());
            }
            tokens.push(token.to_lowercase());
            rest = &after_start[end + 1..];
        } else {
            break;
        }
    }

    if tokens.is_empty() {
        return result;
    }

    let mut current_str = stem.as_str();
    for i in 0..tokens.len() {
        if i < literals.len() {
            let sep = &literals[i];
            if !sep.is_empty() {
                if let Some((val, remainder)) = current_str.split_once(sep.as_str()) {
                    result.insert(tokens[i].clone(), val.trim().to_string());
                    current_str = remainder;
                    continue;
                }
            }
        } else {
            result.insert(tokens[i].clone(), current_str.trim().to_string());
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lrc_detection_and_strip() {
        let lrc = "[ar:Artist]\n[00:05.20]첫 번째 가사\n[00:10.00]두 번째 가사";
        assert!(is_lrc_format(lrc));
        let stripped = strip_lrc_timestamps(lrc);
        assert_eq!(stripped, "첫 번째 가사\n두 번째 가사");
    }

    #[test]
    fn test_filename_pattern_parser() {
        let parsed = parse_filename_with_pattern(
            "03. IU - Love wins all.flac",
            "%track%. %artist% - %title%",
        );
        assert_eq!(parsed.get("track").map(|s| s.as_str()), Some("03"));
        assert_eq!(parsed.get("artist").map(|s| s.as_str()), Some("IU"));
        assert_eq!(
            parsed.get("title").map(|s| s.as_str()),
            Some("Love wins all")
        );
    }
}

