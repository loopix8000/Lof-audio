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
    let mut cover_data_url = None;
    let mut plain_lyrics = None;
    let mut synced_lyrics = None;

    let tagged_file = Probe::open(path).ok()?.read().ok()?;
    let props = tagged_file.properties();
    let duration_secs = props.duration().as_secs_f64();
    let bitrate = props.audio_bitrate();
    let sample_rate = props.sample_rate();
    let channels = props.channels();

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
            let mime = pic.mime_type().map(|m| m.as_str()).unwrap_or("image/jpeg");
            let encoded = BASE64.encode(pic.data());
            cover_data_url = Some(format!("data:{};base64,{}", mime, encoded));
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
                plain_lyrics = Some(strip_lrc_timestamps(&trimmed));
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

/// Writes a complete metadata snapshot; absent optional fields remove old tags.
pub fn write_track(track: &Track, save_lrc_file: bool) -> Result<(), String> {
    let path = Path::new(&track.file_path);
    let probed =
        Probe::open(path).map_err(|e| format!("파일 열기 실패 ({}): {}", track.file_name, e))?;
    let mut tagged_file = probed
        .read()
        .map_err(|e| format!("태그 읽기 실패 ({}): {}", track.file_name, e))?;
    let tag_type = tagged_file.primary_tag_type();
    if tagged_file.primary_tag().is_none() {
        tagged_file.insert_tag(Tag::new(tag_type));
    }
    let tag = tagged_file
        .primary_tag_mut()
        .ok_or_else(|| "이 형식은 태그 저장을 지원하지 않습니다.".to_string())?;
    tag.set_title(track.title.clone());
    tag.set_artist(track.artist.clone());
    tag.set_album(track.album.clone());
    tag.insert_text(ItemKey::AlbumArtist, track.album_artist.clone());
    match track.track_number {
        Some(n) => tag.set_track(n),
        None => tag.remove_track(),
    }
    match track.year {
        Some(y) => tag.set_year(y),
        None => tag.remove_year(),
    }
    tag.set_genre(track.genre.clone());
    tag.remove_key(&ItemKey::Lyrics);
    if let Some(lyrics) = track
        .synced_lyrics
        .as_deref()
        .or(track.plain_lyrics.as_deref())
        .filter(|s| !s.trim().is_empty())
    {
        tag.insert_text(ItemKey::Lyrics, lyrics.to_string());
    }
    if let Some(data_url) = &track.cover_data_url {
        let (mime_str, bytes) = decode_data_url(data_url)
            .ok_or_else(|| "앨범 아트 데이터가 올바르지 않습니다.".to_string())?;
        if ![
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/gif",
            "image/bmp",
            "image/tiff",
            "image/webp",
        ]
        .contains(&mime_str.as_str())
        {
            return Err("지원하지 않는 앨범 아트 형식입니다.".to_string());
        }
        let mime = MimeType::from_str(&mime_str);
        tag.remove_picture_type(PictureType::CoverFront);
        tag.push_picture(Picture::new_unchecked(
            PictureType::CoverFront,
            Some(mime),
            None,
            bytes,
        ));
    }
    tagged_file
        .save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("태그 저장 실패 ({}): {}", track.file_name, e))?;
    // Keep an existing sidecar consistent even when creating new sidecars is disabled.
    let lrc_path = path.with_extension("lrc");
    if save_lrc_file || lrc_path.exists() {
        if let Some(lrc) = track
            .synced_lyrics
            .as_deref()
            .filter(|s| !s.trim().is_empty())
        {
            fs::write(&lrc_path, lrc).map_err(|e| format!("LRC 저장 실패: {}", e))?;
        } else {
            match fs::remove_file(&lrc_path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(format!("이전 LRC 제거 실패: {}", e)),
            }
        }
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
pub fn parse_filename_with_pattern(
    file_name: &str,
    pattern: &str,
) -> Result<HashMap<String, String>, String> {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    let mut tokens = Vec::new();
    let mut literals = Vec::new();
    let mut rest = pattern;
    while let Some(start) = rest.find('%') {
        literals.push(&rest[..start]);
        let after = &rest[start + 1..];
        let end = after
            .find('%')
            .ok_or_else(|| "닫히지 않은 패턴 토큰입니다.".to_string())?;
        let token = after[..end].to_lowercase();
        if !["title", "artist", "album", "track", "tracknumber", "year"].contains(&token.as_str())
            || tokens.contains(&token)
        {
            return Err(format!("지원하지 않거나 중복된 패턴 토큰: %{}%", token));
        }
        tokens.push(token);
        rest = &after[end + 1..];
    }
    literals.push(rest);
    if tokens.is_empty() {
        return Err("하나 이상의 태그 토큰을 입력해 주세요.".to_string());
    }
    let mut value = stem
        .strip_prefix(literals[0])
        .ok_or_else(|| "파일명 앞부분이 패턴과 다릅니다.".to_string())?;
    value = value
        .strip_suffix(literals[tokens.len()])
        .ok_or_else(|| "파일명 뒷부분이 패턴과 다릅니다.".to_string())?;
    let mut result = HashMap::new();
    for (i, token) in tokens.iter().enumerate() {
        let (part, remaining) = if i + 1 == tokens.len() {
            (value, "")
        } else {
            let separator = literals[i + 1];
            if separator.is_empty() {
                return Err("토큰 사이에 구분자가 필요합니다.".to_string());
            }
            value
                .split_once(separator)
                .ok_or_else(|| "파일명 구분자가 패턴과 다릅니다.".to_string())?
        };
        if part.trim().is_empty() {
            return Err(format!("%{}% 값이 비어 있습니다.", token));
        }
        if ["track", "tracknumber", "year"].contains(&token.as_str())
            && part.trim().parse::<u32>().is_err()
        {
            return Err(format!("%{}% 값은 숫자여야 합니다.", token));
        }
        result.insert(token.clone(), part.trim().to_string());
        value = remaining;
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn audio_copy() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tone.wav");
        fs::copy(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone.wav"),
            &path,
        )
        .unwrap();
        (dir, path)
    }

    #[test]
    fn cleared_tags_and_sidecar_stay_cleared_after_reading_again() {
        let (_dir, path) = audio_copy();
        let mut track = read_track_from_path(&path).unwrap();
        track.track_number = Some(7);
        track.year = Some(2020);
        track.synced_lyrics = Some("[00:01]old lyrics".into());
        write_track(&track, true).unwrap();
        assert!(path.with_extension("lrc").exists());
        track.track_number = None;
        track.year = None;
        track.synced_lyrics = None;
        track.plain_lyrics = Some("new plain lyrics".into());
        write_track(&track, false).unwrap();
        let reread = read_track_from_path(&path).unwrap();
        assert_eq!(reread.track_number, None);
        assert_eq!(reread.year, None);
        assert_eq!(reread.synced_lyrics, None);
        assert_eq!(reread.plain_lyrics.as_deref(), Some("new plain lyrics"));
        assert!(!path.with_extension("lrc").exists());
        track.plain_lyrics = None;
        write_track(&track, false).unwrap();
        assert!(read_track_from_path(&path).unwrap().plain_lyrics.is_none());
    }

    #[test]
    fn read_only_file_and_unwritable_sidecar_return_errors() {
        let (_dir, path) = audio_copy();
        let mut track = read_track_from_path(&path).unwrap();
        let original = fs::metadata(&path).unwrap().permissions();
        let mut readonly = original.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&path, readonly).unwrap();
        track.title = "must not be reported as saved".into();
        let result = write_track(&track, false);
        fs::set_permissions(&path, original).unwrap();
        assert!(result.is_err());
        fs::create_dir(path.with_extension("lrc")).unwrap();
        track.synced_lyrics = Some("[00:01]lyrics".into());
        assert!(write_track(&track, true).is_err());
    }

    #[test]
    fn filename_pattern_requires_all_literals_and_valid_fields() {
        let parsed =
            parse_filename_with_pattern("prefix Song suffix.mp3", "prefix %title% suffix").unwrap();
        assert_eq!(parsed["title"], "Song");
        assert!(parse_filename_with_pattern("Artist Song.mp3", "%artist% - %title%").is_err());
        assert!(parse_filename_with_pattern("Song.mp3", "%artist%%title%").is_err());
        assert!(parse_filename_with_pattern("no. Song.mp3", "%track%. %title%").is_err());
        assert!(parse_filename_with_pattern("Song.mp3", "%unknown%").is_err());
        assert!(parse_filename_with_pattern("wrong Song.mp3", "prefix %title%").is_err());
    }

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
        )
        .unwrap();
        assert_eq!(parsed.get("track").map(|s| s.as_str()), Some("03"));
        assert_eq!(parsed.get("artist").map(|s| s.as_str()), Some("IU"));
        assert_eq!(
            parsed.get("title").map(|s| s.as_str()),
            Some("Love wins all")
        );
    }
}
