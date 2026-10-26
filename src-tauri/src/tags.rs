use crate::models::Track;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::{Accessor, ItemKey, TagExt};
use lofty::probe::Probe;
use lofty::tag::Tag;
use std::collections::HashMap;
use std::fs;
use std::io::Seek;
use std::panic::{catch_unwind, AssertUnwindSafe};
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

/// 외부 태그 라이브러리의 패닉이 메타데이터 잠금까지 오염시키지 않게 한다.
pub fn write_track(track: &Track, save_lrc_file: bool) -> Result<(), String> {
    guard_tag_write(&track.file_name, || write_track_inner(track, save_lrc_file))
}

fn guard_tag_write(
    file_name: &str,
    write: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    catch_unwind(AssertUnwindSafe(write)).unwrap_or_else(|panic| {
        let message = panic
            .downcast_ref::<String>()
            .map(String::as_str)
            .or_else(|| panic.downcast_ref::<&str>().copied())
            .unwrap_or("알 수 없는 내부 오류");
        Err(format!(
            "태그 처리 중 내부 오류 ({}): {}",
            file_name, message
        ))
    })
}

fn write_track_inner(track: &Track, save_lrc_file: bool) -> Result<(), String> {
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
    let lrc_path = path.with_extension("lrc");
    if (save_lrc_file || lrc_path.exists()) && lrc_path.is_dir() {
        return Err("LRC 경로가 디렉터리여서 저장할 수 없습니다.".into());
    }
    // 기존 ID3v1 등 보조 태그는 원시 바이트 그대로 두고 기본 태그만 저장한다.
    // 재생 파일의 해제는 오디오 스레드에서 확인하고 완성된 파일만 교체한다.
    replace_audio_file(path, |file| {
        tag.save_to(file, WriteOptions::default())
            .map_err(|e| format!("태그 저장 실패 ({}): {}", track.file_name, e))
    })?;
    // 새 사이드카 생성을 꺼도 기존 파일은 현재 가사와 일치시킨다.
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

fn replace_audio_file(
    path: &Path,
    write: impl FnOnce(&mut fs::File) -> Result<(), String>,
) -> Result<(), String> {
    // 심볼릭 링크가 있으면 링크 자체 대신 실제 음원 파일을 교체한다.
    let target = fs::canonicalize(path).map_err(|e| format!("음원 경로 확인 실패: {}", e))?;
    let permissions = fs::metadata(&target)
        .map_err(|e| format!("음원 속성 확인 실패: {}", e))?
        .permissions();
    if permissions.readonly() {
        return Err("읽기 전용 음원에는 태그를 저장할 수 없습니다.".into());
    }
    let mut staged =
        tempfile::NamedTempFile::new_in(target.parent().ok_or("음원의 상위 폴더가 없습니다.")?)
            .map_err(|e| format!("태그 임시 파일 생성 실패: {}", e))?;
    let mut original = fs::File::open(&target).map_err(|e| format!("음원 읽기 실패: {}", e))?;
    std::io::copy(&mut original, staged.as_file_mut())
        .map_err(|e| format!("음원 복사 실패: {}", e))?;
    drop(original);
    staged
        .as_file_mut()
        .rewind()
        .map_err(|e| format!("태그 파일 탐색 실패: {}", e))?;
    write(staged.as_file_mut())?;
    staged
        .as_file()
        .set_permissions(permissions)
        .map_err(|e| format!("음원 속성 저장 실패: {}", e))?;
    staged
        .as_file()
        .sync_all()
        .map_err(|e| format!("태그 파일 동기화 실패: {}", e))?;
    staged
        .persist(&target)
        .map_err(|e| format!("음원 교체 실패: {}", e.error))?;
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

    #[test]
    fn multibyte_id3v1_is_preserved_without_reserializing_it() {
        use std::io::Write;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tone.mp3");
        fs::copy(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone.mp3"),
            &path,
        )
        .unwrap();
        let mut legacy = [0; 128];
        legacy[..3].copy_from_slice(b"TAG");
        // Latin-1로 읽으면 UTF-8 30바이트 경계가 문자 중간에 걸리는 제목이다.
        legacy[3] = b'a';
        legacy[4..33].fill(0xa4);
        fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(&legacy)
            .unwrap();
        let mut track = read_track_from_path(&path).unwrap();
        track.title = "한국어 제목은 길어도 온전히 보존합니다".into();
        track.artist = "hat_shop".into();
        write_track(&track, false).unwrap();
        let reread = read_track_from_path(&path).unwrap();
        assert_eq!(reread.title, track.title);
        assert_eq!(reread.artist, track.artist);
        assert!(fs::read(&path).unwrap().ends_with(&legacy));
    }

    #[test]
    fn failed_or_panicking_serialization_keeps_original_and_lock_usable() {
        use std::io::Write;
        let (_dir, path) = audio_copy();
        let original = fs::read(&path).unwrap();
        let lock = std::sync::Mutex::new(());
        for panic in [false, true] {
            let _guard = lock.lock().unwrap();
            let result = guard_tag_write("tone.wav", || {
                replace_audio_file(&path, |file| {
                    file.write_all("저장 실패를 재현하는 임시 내용".as_bytes())
                        .unwrap();
                    if panic {
                        panic!("태그 직렬화 패닉 재현");
                    }
                    Err("태그 직렬화 실패 재현".into())
                })
            });
            assert!(result.is_err());
            assert_eq!(fs::read(&path).unwrap(), original);
            assert!(!lock.is_poisoned());
        }
        let mut track = read_track_from_path(&path).unwrap();
        track.title = "오류 이후 정상 저장".into();
        write_track(&track, false).unwrap();
        assert_eq!(read_track_from_path(&path).unwrap().title, track.title);
    }

    #[test]
    fn atomic_tag_writes_preserve_supported_audio_formats() {
        let dir = tempfile::tempdir().unwrap();
        for name in [
            "tone.mp3",
            "tone.wav",
            "tone.flac",
            "tone.ogg",
            "tone.opus",
            "tone.m4a",
        ] {
            let path = dir.path().join(name);
            fs::copy(
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("tests/fixtures")
                    .join(name),
                &path,
            )
            .unwrap();
            let mut track = read_track_from_path(&path).unwrap();
            let duration = track.duration_secs;
            track.title = "형식별 저장 확인".into();
            track.artist = "아티스트".into();
            write_track(&track, false).unwrap_or_else(|e| panic!("{}: {}", name, e));
            let reread = read_track_from_path(&path).unwrap();
            assert_eq!(reread.title, track.title, "{}", name);
            assert_eq!(reread.artist, track.artist, "{}", name);
            assert!((reread.duration_secs - duration).abs() < 0.01, "{}", name);
        }
    }

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
