pub mod audio;
pub mod db;
pub mod models;
pub mod scanner;
pub mod services;
pub mod tags;
pub mod updater;

use audio::{AudioCommand, AudioEngine};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use db::{Database, FileStamp};
use models::{
    ConfirmTrackMatchItem, FilenamePatternInput, LrcLibTrack, MusicBrainzCandidate, PlaybackState,
    Playlist, TagUpdateInput, Track, TrackMatchPreview,
};
use scanner::{ScanProgress, ScanQueue};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use tauri::{Manager, State};

pub struct AppState {
    pub db: Database,
    pub audio: AudioEngine,
    pub app_data_dir: PathBuf,
    pub scanner: ScanQueue,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub tracks: Vec<Track>,
    pub folders: Vec<String>,
    pub playlists: Vec<Playlist>,
}

pub(crate) fn is_supported_audio(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext = ext.to_ascii_lowercase();
        SUPPORTED_AUDIO_EXTENSIONS.contains(&ext.as_str())
    } else {
        false
    }
}

fn build_snapshot(state: &AppState) -> Result<LibrarySnapshot, String> {
    let tracks = state.db.get_all_tracks()?;
    let folders = state.db.get_folders()?;
    let playlists = state.db.get_playlists()?;
    Ok(LibrarySnapshot {
        tracks,
        folders,
        playlists,
    })
}

#[tauri::command]
async fn get_library_state(state: State<'_, AppState>) -> Result<LibrarySnapshot, String> {
    build_snapshot(&state)
}

#[tauri::command]
async fn scan_folder(
    folder_path: String,
    state: State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    let root = Path::new(&folder_path);
    if !root.exists() {
        return Err("선택한 폴더가 존재하지 않습니다.".to_string());
    }

    state.db.add_folder(&folder_path)?;
    // Indexing runs on the scanner worker; the UI gets the cached snapshot right away.
    state.scanner.enqueue(&folder_path);

    build_snapshot(&state)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub supported_formats: Vec<&'static str>,
    pub updater_configured: bool,
}

pub(crate) const SUPPORTED_AUDIO_EXTENSIONS: [&str; 8] =
    ["mp3", "flac", "wav", "ogg", "m4a", "aac", "alac", "opus"];

#[tauri::command]
async fn get_settings(
    state: State<'_, AppState>,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    state.db.get_settings()
}

#[tauri::command]
async fn save_settings(
    patch: serde_json::Map<String, serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.db.save_settings(&patch)
}

/// Queues every registered folder for re-indexing; `force` ignores the size/mtime cache.
#[tauri::command]
async fn rescan_library(force: bool, state: State<'_, AppState>) -> Result<(), String> {
    if force {
        state.db.clear_file_stamps()?;
    }
    for folder in state.db.get_folders()? {
        state.scanner.enqueue(&folder);
    }
    Ok(())
}

#[tauri::command]
async fn get_app_info(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: state.app_data_dir.to_string_lossy().to_string(),
        supported_formats: SUPPORTED_AUDIO_EXTENSIONS.to_vec(),
        updater_configured: updater::updater_configured(&app),
    })
}

/// Opens the app data folder (library DB lives here) in the OS file manager.
#[tauri::command]
async fn reveal_data_dir(state: State<'_, AppState>) -> Result<(), String> {
    let dir = &state.app_data_dir;
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(dir)
        .spawn()
        .map_err(|e| format!("폴더 열기 실패: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn get_scan_status(state: State<'_, AppState>) -> Result<Option<ScanProgress>, String> {
    Ok(state.scanner.status())
}

#[tauri::command]
async fn import_files(
    file_paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    let mut items = Vec::new();
    for fp in file_paths {
        let p = Path::new(&fp);
        if !is_supported_audio(p) {
            continue;
        }
        let Ok(meta) = std::fs::metadata(p) else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        if let Some(track) = tags::read_track_from_path(p) {
            if !track.folder_path.is_empty() {
                let _ = state.db.add_folder(&track.folder_path);
            }
            items.push((track, FileStamp::of(&meta)));
        }
    }
    state.db.upsert_tracks(&items)?;
    build_snapshot(&state)
}

#[tauri::command]
async fn remove_folder(
    folder_path: String,
    state: State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    state.db.remove_folder(&folder_path)?;
    build_snapshot(&state)
}

#[tauri::command]
async fn delete_tracks_from_library(
    track_ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    state.db.delete_tracks(&track_ids)?;
    build_snapshot(&state)
}

fn make_svg_cover_data_url(bg1: &str, bg2: &str, accent: &str, title: &str, sub: &str) -> String {
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
            <defs>
                <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="{bg1}"/>
                    <stop offset="100%" stop-color="{bg2}"/>
                </linearGradient>
            </defs>
            <rect width="500" height="500" fill="url(#g)"/>
            <circle cx="250" cy="215" r="115" fill="none" stroke="{accent}" stroke-width="6" opacity="0.75"/>
            <circle cx="250" cy="215" r="42" fill="{accent}" opacity="0.9"/>
            <circle cx="250" cy="215" r="14" fill="{bg1}"/>
            <text x="250" y="395" font-family="sans-serif" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">{title}</text>
            <text x="250" y="432" font-family="sans-serif" font-size="18" font-weight="500" fill="{accent}" text-anchor="middle">{sub}</text>
        </svg>"##
    );
    format!("data:image/svg+xml;base64,{}", BASE64.encode(svg.as_bytes()))
}

#[tauri::command]
async fn load_demo_tracks(state: State<'_, AppState>) -> Result<LibrarySnapshot, String> {
    let demo_dir = state.app_data_dir.join("demo_music");
    let paths = services::create_demo_tracks_in_dir(&demo_dir)?;
    state
        .db
        .add_folder(&demo_dir.to_string_lossy().to_string())?;

    let covers = [
        (
            "Cyberpunk Dreams",
            2026u32,
            1u32,
            "Synthwave",
            make_svg_cover_data_url("#140b29", "#3b0d54", "#ff2a85", "MIDNIGHT NEON", "LOF SYNTH"),
        ),
        (
            "Late Night Coding",
            2025u32,
            2u32,
            "Lo-Fi Chillhop",
            make_svg_cover_data_url("#0d1b2a", "#1b263b", "#38bdf8", "SEOUL RAINY", "AURORA BEATS"),
        ),
        (
            "Cosmos Anthology",
            2026u32,
            3u32,
            "Ambient Electronic",
            make_svg_cover_data_url("#0f172a", "#311042", "#a855f7", "STARLIGHT", "VELVET HORIZON"),
        ),
    ];

    for (idx, p_str) in paths.iter().enumerate() {
        let p = Path::new(p_str);
        if let Some(mut track) = tags::read_track_from_path(p) {
            if idx < covers.len() {
                let (album, year, tn, genre, cover_url) = &covers[idx];
                track.album = album.to_string();
                track.year = Some(*year);
                track.track_number = Some(*tn);
                track.genre = genre.to_string();
                track.cover_data_url = Some(cover_url.clone());
                track.bitrate = Some(1411);
                track.sample_rate = Some(44100);
                track.channels = Some(2);
            }
            let _ = state.db.upsert_track(&track);
        }
    }

    build_snapshot(&state)
}

#[tauri::command]
async fn play_track(track_id: i64, state: State<'_, AppState>) -> Result<PlaybackState, String> {
    let track = state
        .db
        .get_track_by_id(track_id)?
        .ok_or_else(|| "트랙을 찾을 수 없습니다.".to_string())?;

    let _ = state.db.increment_play_count(track_id);

    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::Play {
        track_id: track.id,
        file_path: track.file_path,
        duration_secs: track.duration_secs,
        reply: tx,
    })?;

    rx.recv().map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pause_playback(state: State<'_, AppState>) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::Pause { reply: tx })?;
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
async fn resume_playback(state: State<'_, AppState>) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::Resume { reply: tx })?;
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_playback(state: State<'_, AppState>) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::Stop { reply: tx })?;
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
async fn seek_playback(
    position_secs: f64,
    state: State<'_, AppState>,
) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::Seek {
        position_secs,
        reply: tx,
    })?;
    rx.recv().map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_volume(volume: f32, state: State<'_, AppState>) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state
        .audio
        .send_cmd(AudioCommand::SetVolume { volume, reply: tx })?;
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_speed(speed: f32, state: State<'_, AppState>) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state
        .audio
        .send_cmd(AudioCommand::SetSpeed { speed, reply: tx })?;
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_playback_state(state: State<'_, AppState>) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::GetState { reply: tx })?;
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_tags(
    input: TagUpdateInput,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    let is_single = input.track_ids.len() == 1;

    for (idx, tid) in input.track_ids.iter().enumerate() {
        if let Some(mut track) = state.db.get_track_by_id(*tid)? {
            if let Some(ref t) = input.title {
                if !t.trim().is_empty() {
                    track.title = t.trim().to_string();
                }
            }
            if let Some(ref a) = input.artist {
                if !a.trim().is_empty() {
                    track.artist = a.trim().to_string();
                }
            }
            if let Some(ref al) = input.album {
                if !al.trim().is_empty() {
                    track.album = al.trim().to_string();
                }
            }
            if let Some(ref aa) = input.album_artist {
                if !aa.trim().is_empty() {
                    track.album_artist = aa.trim().to_string();
                }
            }
            if input.auto_number {
                track.track_number = Some((idx + 1) as u32);
            } else if let Some(tn) = input.track_number {
                track.track_number = Some(tn);
            } else if is_single {
                track.track_number = None;
            }

            if let Some(y) = input.year {
                track.year = Some(y);
            } else if is_single {
                track.year = None;
            }

            if let Some(ref g) = input.genre {
                if !g.trim().is_empty() || is_single {
                    track.genre = g.trim().to_string();
                }
            } else if is_single {
                track.genre = String::new();
            }

            if let Some(ref pl) = input.plain_lyrics {
                if !pl.trim().is_empty() || is_single {
                    track.plain_lyrics = Some(pl.clone());
                }
            }
            if let Some(ref sl) = input.synced_lyrics {
                if !sl.trim().is_empty() || is_single {
                    track.synced_lyrics = Some(sl.clone());
                }
            }
            if let Some(ref cov) = input.cover_data_url {
                if !cov.trim().is_empty() {
                    track.cover_data_url = Some(cov.clone());
                }
            }

            let _ = tags::write_tags_to_file(
                &track.file_path,
                Some(&track.title),
                Some(&track.artist),
                Some(&track.album),
                Some(&track.album_artist),
                track.track_number,
                track.year,
                Some(&track.genre),
                track.plain_lyrics.as_deref(),
                track.cover_data_url.as_deref(),
                input.save_lrc_file,
                track.synced_lyrics.as_deref(),
            );

            state.db.update_track_metadata(&track)?;
        }
    }

    state.db.get_all_tracks()
}

#[tauri::command]
async fn apply_filename_pattern(
    input: FilenamePatternInput,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    for tid in &input.track_ids {
        if let Some(mut track) = state.db.get_track_by_id(*tid)? {
            let map = tags::parse_filename_with_pattern(&track.file_name, &input.pattern);
            if let Some(t) = map.get("title").filter(|s| !s.is_empty()) {
                track.title = t.clone();
            }
            if let Some(a) = map.get("artist").filter(|s| !s.is_empty()) {
                track.artist = a.clone();
            }
            if let Some(al) = map.get("album").filter(|s| !s.is_empty()) {
                track.album = al.clone();
            }
            if let Some(tn) = map
                .get("track")
                .or_else(|| map.get("tracknumber"))
                .and_then(|s| s.parse::<u32>().ok())
            {
                track.track_number = Some(tn);
            }
            if let Some(y) = map.get("year").and_then(|s| s.parse::<u32>().ok()) {
                track.year = Some(y);
            }

            let _ = tags::write_tags_to_file(
                &track.file_path,
                Some(&track.title),
                Some(&track.artist),
                Some(&track.album),
                Some(&track.album_artist),
                track.track_number,
                track.year,
                Some(&track.genre),
                track.plain_lyrics.as_deref(),
                track.cover_data_url.as_deref(),
                false,
                track.synced_lyrics.as_deref(),
            );
            state.db.update_track_metadata(&track)?;
        }
    }

    state.db.get_all_tracks()
}

#[tauri::command]
async fn toggle_favorite(track_id: i64, state: State<'_, AppState>) -> Result<bool, String> {
    state.db.toggle_favorite(track_id)
}

#[tauri::command]
async fn update_lyric_offset(
    track_id: i64,
    offset_ms: i64,
    state: State<'_, AppState>,
) -> Result<Track, String> {
    state.db.set_lyric_offset(track_id, offset_ms)?;
    state
        .db
        .get_track_by_id(track_id)?
        .ok_or_else(|| "트랙을 찾을 수 없습니다.".to_string())
}

#[tauri::command]
async fn auto_fetch_lyrics(
    track_id: i64,
    save_lrc_file: bool,
    state: State<'_, AppState>,
) -> Result<Track, String> {
    let mut track = state
        .db
        .get_track_by_id(track_id)?
        .ok_or_else(|| "트랙을 찾을 수 없습니다.".to_string())?;

    let found = services::fetch_lrclib_auto(
        &track.title,
        &track.artist,
        &track.album,
        track.duration_secs,
    )
    .await?;

    if let Some(lrc_item) = found {
        if let Some(synced) = lrc_item.synced_lyrics.filter(|s| !s.trim().is_empty()) {
            track.synced_lyrics = Some(synced);
        }
        if let Some(plain) = lrc_item.plain_lyrics.filter(|s| !s.trim().is_empty()) {
            track.plain_lyrics = Some(plain);
        } else if let Some(ref synced) = track.synced_lyrics {
            track.plain_lyrics = Some(tags::strip_lrc_timestamps(synced));
        }

        if save_lrc_file {
            if let Some(ref lrc) = track.synced_lyrics {
                if !lrc.trim().is_empty() {
                    let lrc_path = Path::new(&track.file_path).with_extension("lrc");
                    let _ = std::fs::write(lrc_path, lrc);
                }
            }
        }
        state.db.update_track_metadata(&track)?;
        Ok(track)
    } else {
        Err("일치하는 싱크 가사를 찾지 못했습니다.".to_string())
    }
}

#[tauri::command]
async fn search_lyrics_manual(query: String) -> Result<Vec<LrcLibTrack>, String> {
    services::search_lrclib(&query).await
}

#[tauri::command]
async fn apply_lyrics_to_track(
    track_id: i64,
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
    save_lrc_file: bool,
    state: State<'_, AppState>,
) -> Result<Track, String> {
    let mut track = state
        .db
        .get_track_by_id(track_id)?
        .ok_or_else(|| "트랙을 찾을 수 없습니다.".to_string())?;

    track.synced_lyrics = synced_lyrics.filter(|s| !s.trim().is_empty());
    track.plain_lyrics = plain_lyrics.filter(|s| !s.trim().is_empty()).or_else(|| {
        track
            .synced_lyrics
            .as_ref()
            .map(|s| tags::strip_lrc_timestamps(s))
    });

    if save_lrc_file {
        if let Some(ref lrc) = track.synced_lyrics {
            if !lrc.trim().is_empty() {
                let lrc_path = Path::new(&track.file_path).with_extension("lrc");
                let _ = std::fs::write(lrc_path, lrc);
            }
        }
    }

    state.db.update_track_metadata(&track)?;
    Ok(track)
}

#[tauri::command]
async fn search_track_metadata(
    track_id: i64,
    custom_query: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<MusicBrainzCandidate>, String> {
    let track = state
        .db
        .get_track_by_id(track_id)?
        .ok_or_else(|| "트랙을 찾을 수 없습니다.".to_string())?;

    services::search_musicbrainz(&track.title, &track.artist, custom_query).await
}

#[tauri::command]
async fn apply_musicbrainz_metadata(
    track_id: i64,
    candidate: MusicBrainzCandidate,
    fetch_cover: bool,
    state: State<'_, AppState>,
) -> Result<Track, String> {
    let mut track = state
        .db
        .get_track_by_id(track_id)?
        .ok_or_else(|| "트랙을 찾을 수 없습니다.".to_string())?;

    track.title = candidate.title;
    track.artist = candidate.artist.clone();
    track.album = candidate.album;
    if track.album_artist.is_empty() || track.album_artist == "Unknown Artist" {
        track.album_artist = candidate.artist;
    }
    if let Some(y) = candidate.year {
        track.year = Some(y);
    }
    if let Some(tn) = candidate.track_number {
        track.track_number = Some(tn);
    }
    track.mbid_recording = Some(candidate.recording_id);
    track.mbid_release = candidate.release_id.clone();

    if fetch_cover {
        if let Some(ref rel_mbid) = candidate.release_id {
            if let Ok(data_url) = services::fetch_cover_art_by_mbid(rel_mbid).await {
                track.cover_data_url = Some(data_url);
            }
        }
    }

    let _ = tags::write_tags_to_file(
        &track.file_path,
        Some(&track.title),
        Some(&track.artist),
        Some(&track.album),
        Some(&track.album_artist),
        track.track_number,
        track.year,
        Some(&track.genre),
        track.plain_lyrics.as_deref(),
        track.cover_data_url.as_deref(),
        false,
        track.synced_lyrics.as_deref(),
    );

    state.db.update_track_metadata(&track)?;
    Ok(track)
}

#[tauri::command]
async fn preview_auto_match(
    track_ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<TrackMatchPreview>, String> {
    let mut results = Vec::new();

    for tid in track_ids {
        let Some(track) = state.db.get_track_by_id(tid)? else {
            continue;
        };

        let candidates = services::search_musicbrainz(&track.title, &track.artist, None)
            .await
            .unwrap_or_default();

        let search_title = candidates
            .first()
            .map(|c| c.title.as_str())
            .unwrap_or(&track.title);
        let search_artist = candidates
            .first()
            .map(|c| c.artist.as_str())
            .unwrap_or(&track.artist);
        let search_album = candidates
            .first()
            .map(|c| c.album.as_str())
            .unwrap_or(&track.album);

        let mut matched_synced = None;
        let mut matched_plain = None;

        if let Ok(Some(lrc_item)) = services::fetch_lrclib_auto(
            search_title,
            search_artist,
            search_album,
            track.duration_secs,
        )
        .await
        {
            matched_synced = lrc_item.synced_lyrics.filter(|s| !s.trim().is_empty());
            matched_plain = lrc_item.plain_lyrics.filter(|s| !s.trim().is_empty());
        } else if search_title != track.title || search_artist != track.artist {
            if let Ok(Some(lrc_item)) = services::fetch_lrclib_auto(
                &track.title,
                &track.artist,
                &track.album,
                track.duration_secs,
            )
            .await
            {
                matched_synced = lrc_item.synced_lyrics.filter(|s| !s.trim().is_empty());
                matched_plain = lrc_item.plain_lyrics.filter(|s| !s.trim().is_empty());
            }
        }

        results.push(TrackMatchPreview {
            track_id: tid,
            candidates,
            matched_synced_lyrics: matched_synced,
            matched_plain_lyrics: matched_plain,
        });
    }

    Ok(results)
}

#[tauri::command]
async fn apply_confirmed_matches(
    items: Vec<ConfirmTrackMatchItem>,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    for item in items {
        let Some(mut track) = state.db.get_track_by_id(item.track_id)? else {
            continue;
        };

        if let Some(title) = item.title.filter(|s| !s.trim().is_empty()) {
            track.title = title;
        }
        if let Some(artist) = item.artist.filter(|s| !s.trim().is_empty()) {
            track.artist = artist.clone();
            if track.album_artist.is_empty() || track.album_artist == "Unknown Artist" {
                track.album_artist = artist;
            }
        }
        if let Some(album) = item.album.filter(|s| !s.trim().is_empty()) {
            track.album = album;
        }
        if let Some(year) = item.year {
            track.year = Some(year);
        }
        if let Some(tn) = item.track_number {
            track.track_number = Some(tn);
        }
        if let Some(rec_id) = item.recording_id {
            track.mbid_recording = Some(rec_id);
        }
        if let Some(ref rel_id) = item.release_id {
            track.mbid_release = Some(rel_id.clone());
        }

        if item.apply_cover {
            if let Some(ref rel_mbid) = item.release_id {
                if let Ok(cov) = services::fetch_cover_art_by_mbid(rel_mbid).await {
                    track.cover_data_url = Some(cov);
                }
            }
        }

        let mut save_lrc = false;
        if let Some(synced) = item.synced_lyrics.filter(|s| !s.trim().is_empty()) {
            track.synced_lyrics = Some(synced.clone());
            if item.plain_lyrics.is_none() {
                track.plain_lyrics = Some(tags::strip_lrc_timestamps(&synced));
            }
            save_lrc = state.db.get_setting_bool("saveLrcFile", true);
        }
        if let Some(plain) = item.plain_lyrics.filter(|s| !s.trim().is_empty()) {
            track.plain_lyrics = Some(plain);
        }

        let _ = tags::write_tags_to_file(
            &track.file_path,
            Some(&track.title),
            Some(&track.artist),
            Some(&track.album),
            Some(&track.album_artist),
            track.track_number,
            track.year,
            Some(&track.genre),
            track.plain_lyrics.as_deref(),
            track.cover_data_url.as_deref(),
            save_lrc,
            track.synced_lyrics.as_deref(),
        );
        let _ = state.db.update_track_metadata(&track);
    }

    state.db.get_all_tracks()
}

#[tauri::command]
async fn batch_auto_enrich(
    track_ids: Vec<i64>,
    fetch_metadata: bool,
    fetch_cover: bool,
    fetch_lyrics: bool,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    let save_lrc = state.db.get_setting_bool("saveLrcFile", true);
    for tid in track_ids {
        let maybe_track = state.db.get_track_by_id(tid)?;
        let Some(mut track) = maybe_track else {
            continue;
        };

        if fetch_metadata {
            if let Ok(candidates) =
                services::search_musicbrainz(&track.title, &track.artist, None).await
            {
                if let Some(best) = candidates.into_iter().next() {
                    track.title = best.title;
                    track.artist = best.artist.clone();
                    track.album = best.album;
                    track.album_artist = best.artist;
                    if let Some(y) = best.year {
                        track.year = Some(y);
                    }
                    if let Some(tn) = best.track_number {
                        track.track_number = Some(tn);
                    }
                    track.mbid_recording = Some(best.recording_id);
                    track.mbid_release = best.release_id.clone();

                    if fetch_cover {
                        if let Some(ref rel_mbid) = best.release_id {
                            if let Ok(cov) = services::fetch_cover_art_by_mbid(rel_mbid).await {
                                track.cover_data_url = Some(cov);
                            }
                        }
                    }
                }
            }
        } else if fetch_cover {
            if let Some(ref rel_mbid) = track.mbid_release {
                if let Ok(cov) = services::fetch_cover_art_by_mbid(rel_mbid).await {
                    track.cover_data_url = Some(cov);
                }
            }
        }

        if fetch_lyrics {
            if let Ok(Some(lrc_item)) = services::fetch_lrclib_auto(
                &track.title,
                &track.artist,
                &track.album,
                track.duration_secs,
            )
            .await
            {
                if let Some(s) = lrc_item.synced_lyrics.filter(|x| !x.trim().is_empty()) {
                    track.synced_lyrics = Some(s);
                }
                if let Some(p) = lrc_item.plain_lyrics.filter(|x| !x.trim().is_empty()) {
                    track.plain_lyrics = Some(p);
                }
            }
        }

        let _ = tags::write_tags_to_file(
            &track.file_path,
            Some(&track.title),
            Some(&track.artist),
            Some(&track.album),
            Some(&track.album_artist),
            track.track_number,
            track.year,
            Some(&track.genre),
            track.plain_lyrics.as_deref(),
            track.cover_data_url.as_deref(),
            save_lrc,
            track.synced_lyrics.as_deref(),
        );
        let _ = state.db.update_track_metadata(&track);
    }

    state.db.get_all_tracks()
}

#[tauri::command]
async fn create_playlist(name: String, state: State<'_, AppState>) -> Result<Vec<Playlist>, String> {
    let _ = state.db.create_playlist(&name)?;
    state.db.get_playlists()
}

#[tauri::command]
async fn delete_playlist(
    playlist_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<Playlist>, String> {
    state.db.delete_playlist(playlist_id)?;
    state.db.get_playlists()
}

#[tauri::command]
async fn add_tracks_to_playlist(
    playlist_id: i64,
    track_ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<Playlist>, String> {
    state.db.add_tracks_to_playlist(playlist_id, &track_ids)?;
    state.db.get_playlists()
}

#[tauri::command]
async fn remove_track_from_playlist(
    playlist_id: i64,
    track_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<Playlist>, String> {
    state.db.remove_track_from_playlist(playlist_id, track_id)?;
    state.db.get_playlists()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app: &mut tauri::App| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("./lof_audio_data"));
            let _ = std::fs::create_dir_all(&app_data_dir);
            let db_path = app_data_dir.join("lof_library.sqlite3");

            let db = Database::new(&db_path).expect("Failed to initialize SQLite database");
            let audio = AudioEngine::new();
            let (scanner, scan_rx) = ScanQueue::new();
            let folders = if db.get_setting_bool("rescanOnStartup", true) {
                db.get_folders().unwrap_or_default()
            } else {
                Vec::new()
            };

            let state = AppState {
                db,
                audio,
                app_data_dir,
                scanner,
            };

            app.manage(state);

            // Library loads from the SQLite cache; changed files are re-indexed in the background.
            scanner::spawn_worker(app.handle().clone(), scan_rx);
            let state = app.state::<AppState>();
            for folder in &folders {
                state.scanner.enqueue(folder);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_library_state,
            scan_folder,
            get_scan_status,
            get_settings,
            save_settings,
            rescan_library,
            get_app_info,
            reveal_data_dir,
            updater::update_check,
            import_files,
            remove_folder,
            delete_tracks_from_library,
            load_demo_tracks,
            play_track,
            pause_playback,
            resume_playback,
            stop_playback,
            seek_playback,
            set_volume,
            set_speed,
            get_playback_state,
            update_tags,
            apply_filename_pattern,
            toggle_favorite,
            update_lyric_offset,
            auto_fetch_lyrics,
            search_lyrics_manual,
            apply_lyrics_to_track,
            search_track_metadata,
            apply_musicbrainz_metadata,
            preview_auto_match,
            apply_confirmed_matches,
            batch_auto_enrich,
            create_playlist,
            delete_playlist,
            add_tracks_to_playlist,
            remove_track_from_playlist,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
