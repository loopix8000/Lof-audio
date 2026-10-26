use crate::audio::AudioCommand;
use crate::db::FileStamp;
use crate::models::*;
use crate::scanner::ScanProgress;
use crate::{
    build_snapshot, edit_track, is_supported_audio, nonempty, receive_audio, require_track,
    services, tags, AppState, LibrarySnapshot,
};
use std::{collections::HashMap, path::Path, sync::mpsc};

pub(crate) async fn get_library_state(state: &AppState) -> Result<LibrarySnapshot, String> {
    build_snapshot(state)
}

pub(crate) async fn get_library_tracks(
    track_ids: Vec<i64>,
    state: &AppState,
) -> Result<Vec<Track>, String> {
    state.db.get_public_tracks(&track_ids)
}

pub(crate) async fn scan_folder(
    folder_path: String,
    workspace_id: i64,
    state: &AppState,
) -> Result<LibrarySnapshot, String> {
    let root = Path::new(&folder_path);
    if !root.is_dir() {
        return Err("선택한 폴더가 존재하지 않습니다.".to_string());
    }

    state.db.add_workspace_folder(workspace_id, &folder_path)?;
    // Indexing runs on the scanner worker; the UI gets the cached snapshot right away.
    state.scanner.enqueue(&folder_path);

    build_snapshot(state)
}

pub(crate) async fn get_settings(
    state: &AppState,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    state.db.get_settings()
}

pub(crate) async fn save_settings(
    patch: serde_json::Map<String, serde_json::Value>,
    state: &AppState,
) -> Result<(), String> {
    state.db.save_settings(&patch)
}

pub(crate) async fn rescan_library(
    force: bool,
    workspace_id: i64,
    state: &AppState,
) -> Result<(), String> {
    for folder in state.db.get_workspace_folders(workspace_id)? {
        if force {
            state.db.clear_file_stamps_under(&folder)?;
        }
        state.scanner.enqueue(&folder);
    }
    Ok(())
}

pub(crate) async fn get_scan_status(state: &AppState) -> Result<Option<ScanProgress>, String> {
    Ok(state.scanner.status())
}

pub(crate) async fn import_files(
    file_paths: Vec<String>,
    workspace_id: i64,
    state: &AppState,
) -> Result<LibrarySnapshot, String> {
    let _guard = state.metadata_lock.lock().map_err(|e| e.to_string())?;
    state.db.get_workspace_folders(workspace_id)?;
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
                state
                    .db
                    .add_workspace_folder(workspace_id, &track.folder_path)?;
            }
            items.push((track, FileStamp::of_path(p).map_err(|e| e.to_string())?));
        }
    }
    let ids = state.db.upsert_tracks(&items)?;
    state.db.include_workspace_tracks(workspace_id, &ids)?;
    build_snapshot(state)
}

pub(crate) async fn remove_folder(
    folder_path: String,
    workspace_id: i64,
    state: &AppState,
) -> Result<LibrarySnapshot, String> {
    let _guard = state.metadata_lock.lock().map_err(|e| e.to_string())?;
    state
        .db
        .remove_workspace_folder(workspace_id, &folder_path)?;
    build_snapshot(state)
}

pub(crate) async fn delete_tracks_from_library(
    track_ids: Vec<i64>,
    workspace_id: i64,
    state: &AppState,
) -> Result<LibrarySnapshot, String> {
    let _guard = state.metadata_lock.lock().map_err(|e| e.to_string())?;
    state
        .db
        .exclude_workspace_tracks(workspace_id, &track_ids)?;
    build_snapshot(state)
}

pub(crate) async fn play_track(track_id: i64, state: &AppState) -> Result<PlaybackState, String> {
    let track = state
        .db
        .get_track_by_id(track_id)?
        .ok_or_else(|| "트랙을 찾을 수 없습니다.".to_string())?;

    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::Play {
        track_id: track.id,
        file_path: track.file_path,
        duration_secs: track.duration_secs,
        reply: tx,
    })?;

    let result = receive_audio(rx).await??;
    state.db.increment_play_count(track_id)?;
    Ok(result)
}

pub(crate) async fn pause_playback(state: &AppState) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::Pause { reply: tx })?;
    receive_audio(rx).await
}

pub(crate) async fn resume_playback(state: &AppState) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::Resume { reply: tx })?;
    receive_audio(rx).await
}

pub(crate) async fn stop_playback(state: &AppState) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::Stop { reply: tx })?;
    receive_audio(rx).await
}

pub(crate) async fn seek_playback(
    position_secs: f64,
    state: &AppState,
) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::Seek {
        position_secs,
        reply: tx,
    })?;
    receive_audio(rx).await?
}

pub(crate) async fn set_volume(volume: f32, state: &AppState) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state
        .audio
        .send_cmd(AudioCommand::SetVolume { volume, reply: tx })?;
    receive_audio(rx).await
}

pub(crate) async fn set_speed(speed: f32, state: &AppState) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state
        .audio
        .send_cmd(AudioCommand::SetSpeed { speed, reply: tx })?;
    receive_audio(rx).await
}

pub(crate) async fn get_playback_state(state: &AppState) -> Result<PlaybackState, String> {
    let (tx, rx) = mpsc::channel();
    state.audio.send_cmd(AudioCommand::GetState { reply: tx })?;
    receive_audio(rx).await
}

pub(crate) async fn update_tags(
    input: TagUpdateInput,
    state: &AppState,
) -> Result<Vec<Track>, String> {
    let single = input.track_ids.len() == 1;
    for (idx, id) in input.track_ids.iter().enumerate() {
        edit_track(state, *id, input.save_lrc_file, |track| {
            for (value, target) in [
                (&input.title, &mut track.title),
                (&input.artist, &mut track.artist),
                (&input.album, &mut track.album),
                (&input.album_artist, &mut track.album_artist),
            ] {
                if let Some(v) = value.as_ref().filter(|v| !v.trim().is_empty()) {
                    *target = v.trim().to_string();
                }
            }
            if input.auto_number {
                track.track_number = Some((idx + 1) as u32);
            } else if input.track_number.is_some() || single {
                track.track_number = input.track_number;
            }
            if input.year.is_some() || single {
                track.year = input.year;
            }
            if let Some(g) = &input.genre {
                if !g.trim().is_empty() || single {
                    track.genre = g.trim().to_string();
                }
            } else if single {
                track.genre.clear();
            }
            if let Some(lyrics) = &input.plain_lyrics {
                track.plain_lyrics = nonempty(Some(lyrics.clone()));
            }
            if let Some(lyrics) = &input.synced_lyrics {
                track.synced_lyrics = nonempty(Some(lyrics.clone()));
            }
            if let Some(cover) = &input.cover_data_url {
                track.cover_data_url = nonempty(Some(cover.clone()));
            }
        })?;
    }
    state.db.get_public_tracks(&input.track_ids)
}

pub(crate) async fn preview_filename_pattern(
    track_ids: Vec<i64>,
    pattern: String,
    state: &AppState,
) -> Result<HashMap<i64, HashMap<String, String>>, String> {
    let mut result = HashMap::new();
    for id in track_ids {
        let track = require_track(state, id)?;
        result.insert(
            id,
            tags::parse_filename_with_pattern(&track.file_name, &pattern)
                .map_err(|e| format!("{}: {}", track.file_name, e))?,
        );
    }
    Ok(result)
}

pub(crate) async fn apply_filename_pattern(
    input: FilenamePatternInput,
    state: &AppState,
) -> Result<Vec<Track>, String> {
    let mut parsed = Vec::new();
    for id in &input.track_ids {
        let track = require_track(state, *id)?;
        let fields = tags::parse_filename_with_pattern(&track.file_name, &input.pattern)
            .map_err(|e| format!("{}: {}", track.file_name, e))?;
        parsed.push((*id, fields));
    }
    for (id, fields) in parsed {
        edit_track(state, id, false, |track| {
            if let Some(v) = fields.get("title") {
                track.title = v.clone();
            }
            if let Some(v) = fields.get("artist") {
                track.artist = v.clone();
            }
            if let Some(v) = fields.get("album") {
                track.album = v.clone();
            }
            if let Some(v) = fields.get("track").or_else(|| fields.get("tracknumber")) {
                track.track_number = v.parse().ok();
            }
            if let Some(v) = fields.get("year") {
                track.year = v.parse().ok();
            }
        })?;
    }
    state.db.get_public_tracks(&input.track_ids)
}

pub(crate) async fn toggle_favorite(track_id: i64, state: &AppState) -> Result<bool, String> {
    state.db.toggle_favorite(track_id)
}

pub(crate) async fn update_lyric_offset(
    track_id: i64,
    offset_ms: i64,
    state: &AppState,
) -> Result<Track, String> {
    let _guard = state.metadata_lock.lock().map_err(|e| e.to_string())?;
    state.db.set_lyric_offset(track_id, offset_ms)?;
    state.db.get_public_track(track_id)
}

pub(crate) async fn search_lyrics_manual(query: String) -> Result<Vec<LrcLibTrack>, String> {
    services::search_lrclib(&query).await
}

pub(crate) async fn apply_lyrics_to_track(
    track_id: i64,
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
    save_lrc_file: bool,
    state: &AppState,
) -> Result<Track, String> {
    let synced = nonempty(synced_lyrics);
    let plain = if let Some(lrc) = &synced {
        Some(tags::strip_lrc_timestamps(lrc))
    } else {
        nonempty(plain_lyrics)
    };
    edit_track(state, track_id, save_lrc_file, |track| {
        track.synced_lyrics = synced;
        track.plain_lyrics = plain;
    })
}

pub(crate) async fn search_track_metadata(
    track_id: i64,
    custom_query: Option<String>,
    state: &AppState,
) -> Result<Vec<MusicBrainzCandidate>, String> {
    let track = state
        .db
        .get_track_by_id(track_id)?
        .ok_or_else(|| "트랙을 찾을 수 없습니다.".to_string())?;

    services::search_musicbrainz(&track.title, &track.artist, custom_query).await
}

pub(crate) async fn preview_match_lyrics(
    track_id: i64,
    candidate: Option<MusicBrainzCandidate>,
    state: &AppState,
) -> Result<Option<LrcLibTrack>, String> {
    let track = require_track(state, track_id)?;
    if let Some(c) = candidate {
        services::fetch_lrclib_auto(&c.title, &c.artist, &c.album, track.duration_secs).await
    } else {
        services::fetch_lrclib_auto(
            &track.title,
            &track.artist,
            &track.album,
            track.duration_secs,
        )
        .await
    }
}

pub(crate) async fn search_album_metadata(
    track_id: i64,
    custom_query: Option<String>,
    state: &AppState,
) -> Result<Vec<AlbumCandidate>, String> {
    let track = require_track(state, track_id)?;
    let artist = if track.album_artist.is_empty() || track.album_artist == "Unknown Artist" {
        &track.artist
    } else {
        &track.album_artist
    };
    services::search_albums(&track.album, artist, custom_query).await
}

pub(crate) async fn preview_album_metadata(
    track_ids: Vec<i64>,
    release_id: String,
    state: &AppState,
) -> Result<Vec<AlbumTrackMatch>, String> {
    if track_ids.is_empty() || track_ids.len() > 200 {
        return Err("INVALID_ARGUMENT: 한 번에 1~200곡을 조회할 수 있습니다.".into());
    }
    let tracks = track_ids
        .into_iter()
        .map(|id| require_track(state, id))
        .collect::<Result<Vec<_>, _>>()?;
    let recordings = services::fetch_album_tracks(&release_id).await?;
    Ok(services::album_matches(&tracks, &recordings))
}

pub(crate) async fn apply_confirmed_matches(
    items: Vec<ConfirmTrackMatchItem>,
    state: &AppState,
) -> Result<Vec<Track>, String> {
    let save_lrc = state.db.get_setting_bool("saveLrcFile", true);
    let ids: Vec<_> = items.iter().map(|item| item.track_id).collect();
    for item in items {
        let cover = if item.apply_cover {
            let release = item
                .release_id
                .as_deref()
                .ok_or_else(|| "앨범 아트 후보가 없습니다.".to_string())?;
            Some(services::fetch_cover_art_by_mbid(release).await?)
        } else {
            None
        };
        // Reload after network work, under the same lock as file writes and indexing.
        edit_track(state, item.track_id, save_lrc, |track| {
            if let Some(v) = nonempty(item.title) {
                track.title = v;
            }
            if let Some(v) = nonempty(item.artist) {
                if track.album_artist.is_empty() || track.album_artist == "Unknown Artist" {
                    track.album_artist = v.clone();
                }
                track.artist = v;
            }
            if let Some(v) = nonempty(item.album) {
                track.album = v;
            }
            if item.year.is_some() {
                track.year = item.year;
            }
            if item.track_number.is_some() {
                track.track_number = item.track_number;
            }
            if item.recording_id.is_some() {
                track.mbid_recording = item.recording_id;
            }
            if item.release_id.is_some() {
                track.mbid_release = item.release_id;
            }
            if let Some(v) = cover {
                track.cover_data_url = Some(v);
            }
            if let Some(v) = nonempty(item.synced_lyrics) {
                track.plain_lyrics = Some(tags::strip_lrc_timestamps(&v));
                track.synced_lyrics = Some(v);
            } else if let Some(v) = nonempty(item.plain_lyrics) {
                track.synced_lyrics = None;
                track.plain_lyrics = Some(v);
            }
        })?;
    }
    state.db.get_public_tracks(&ids)
}

pub(crate) async fn create_playlist(
    name: String,
    workspace_id: i64,
    state: &AppState,
) -> Result<Vec<Playlist>, String> {
    let _ = state.db.create_playlist(&name, workspace_id)?;
    state.db.get_playlists()
}

pub(crate) async fn delete_playlist(
    playlist_id: i64,
    state: &AppState,
) -> Result<Vec<Playlist>, String> {
    state.db.delete_playlist(playlist_id)?;
    state.db.get_playlists()
}

pub(crate) async fn add_tracks_to_playlist(
    playlist_id: i64,
    track_ids: Vec<i64>,
    state: &AppState,
) -> Result<Vec<Playlist>, String> {
    state.db.add_tracks_to_playlist(playlist_id, &track_ids)?;
    state.db.get_playlists()
}

pub(crate) async fn remove_track_from_playlist(
    playlist_id: i64,
    track_id: i64,
    state: &AppState,
) -> Result<Vec<Playlist>, String> {
    state.db.remove_track_from_playlist(playlist_id, track_id)?;
    state.db.get_playlists()
}
