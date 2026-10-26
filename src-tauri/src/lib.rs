pub mod audio;
mod automation;
pub mod db;
mod metadata;
pub mod models;
mod operations;
pub mod scanner;
pub mod services;
mod skills;
pub mod tags;
mod tray;
pub mod updater;
mod workspaces;
mod visibility;

use audio::AudioEngine;
use db::Database;
use models::{
    AlbumCandidate, AlbumTrackMatch, ConfirmTrackMatchItem, FilenamePatternInput, LrcLibTrack,
    MusicBrainzCandidate, PlaybackState, Playlist, TagUpdateInput, Track, WorkspaceState,
};
use scanner::{ScanProgress, ScanQueue};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Mutex};
use tauri::{Manager, State};

pub struct AppState {
    pub db: Database,
    pub audio: AudioEngine,
    pub app_data_dir: PathBuf,
    pub scanner: ScanQueue,
    pub metadata_lock: Mutex<()>,
    pub visibility_lock: tokio::sync::RwLock<()>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub tracks: Vec<Track>,
    pub folders: Vec<String>,
    pub playlists: Vec<Playlist>,
    pub hidden_items: Vec<models::HiddenItem>,
    #[serde(flatten)]
    pub workspace_state: WorkspaceState,
}

pub(crate) fn is_supported_audio(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext = ext.to_ascii_lowercase();
        SUPPORTED_AUDIO_EXTENSIONS.contains(&ext.as_str())
    } else {
        false
    }
}

async fn receive_audio<T: Send + 'static>(rx: mpsc::Receiver<T>) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || rx.recv().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
fn nonempty(value: Option<String>) -> Option<String> {
    value.filter(|v| !v.trim().is_empty())
}
fn require_track(state: &AppState, id: i64) -> Result<Track, String> {
    state.db.get_public_track(id)
}
fn edit_track(
    state: &AppState,
    id: i64,
    save_lrc: bool,
    edit: impl FnOnce(&mut Track),
) -> Result<Track, String> {
    metadata::edit_track(&state.db, &state.metadata_lock, id, save_lrc, edit)
}

fn build_snapshot(state: &AppState) -> Result<LibrarySnapshot, String> {
    let visibility = state.db.visibility()?;
    let tracks = state.db.get_all_tracks()?;
    let folders = state.db.get_folders()?.into_iter().filter(|folder| visibility.allows_folder(folder)).collect();
    let playlists = state.db.get_playlists()?.into_iter().filter(|playlist| visibility.allows_playlist(playlist.id)).collect();
    let workspace_state = state.db.get_workspace_state()?;
    Ok(LibrarySnapshot {
        tracks,
        folders,
        playlists,
        hidden_items: state.db.get_hidden_items()?,
        workspace_state,
    })
}

#[tauri::command]
async fn hide_library_items(targets: Vec<models::HideTarget>, state: State<'_, AppState>, app: tauri::AppHandle) -> Result<LibrarySnapshot, String> {
    let _visibility = state.visibility_lock.write().await;
    {
        let _metadata = state.metadata_lock.lock().map_err(|e| e.to_string())?;
        state.db.hide_items(targets)?;
    }
    if let Ok(playback) = operations::get_playback_state(&state).await {
        if playback.current_track_id.is_some_and(|id| state.db.get_public_track(id).is_err()) {
            let _ = operations::stop_playback(&state).await;
        }
    }
    tauri::Emitter::emit(&app, "automation-library-changed", ()).map_err(|e| e.to_string())?;
    build_snapshot(&state)
}

#[tauri::command]
async fn unhide_library_item(id: i64, state: State<'_, AppState>, app: tauri::AppHandle) -> Result<LibrarySnapshot, String> {
    let _visibility = state.visibility_lock.write().await;
    state.db.unhide_item(id)?;
    tauri::Emitter::emit(&app, "automation-library-changed", ()).map_err(|e| e.to_string())?;
    build_snapshot(&state)
}

#[tauri::command]
async fn get_library_state(state: State<'_, AppState>) -> Result<LibrarySnapshot, String> {
    operations::get_library_state(&state).await
}

#[tauri::command]
async fn get_library_tracks(
    track_ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    operations::get_library_tracks(track_ids, &state).await
}

#[tauri::command]
async fn scan_folder(
    folder_path: String,
    workspace_id: i64,
    state: State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    operations::scan_folder(folder_path, workspace_id, &state).await
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
    operations::get_settings(&state).await
}

#[tauri::command]
async fn save_settings(
    patch: serde_json::Map<String, serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    operations::save_settings(patch, &state).await
}

/// Queues every registered folder for re-indexing; `force` ignores the size/mtime cache.
#[tauri::command]
async fn rescan_library(
    force: bool,
    workspace_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    operations::rescan_library(force, workspace_id, &state).await
}

#[tauri::command]
async fn get_app_info(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<AppInfo, String> {
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
    operations::get_scan_status(&state).await
}

#[tauri::command]
async fn import_files(
    file_paths: Vec<String>,
    workspace_id: i64,
    state: State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    operations::import_files(file_paths, workspace_id, &state).await
}

#[tauri::command]
async fn remove_folder(
    folder_path: String,
    workspace_id: i64,
    state: State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    operations::remove_folder(folder_path, workspace_id, &state).await
}

#[tauri::command]
async fn delete_tracks_from_library(
    track_ids: Vec<i64>,
    workspace_id: i64,
    state: State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    operations::delete_tracks_from_library(track_ids, workspace_id, &state).await
}

#[tauri::command]
async fn play_track(track_id: i64, state: State<'_, AppState>) -> Result<PlaybackState, String> {
    operations::play_track(track_id, &state).await
}

#[tauri::command]
async fn pause_playback(state: State<'_, AppState>) -> Result<PlaybackState, String> {
    operations::pause_playback(&state).await
}

#[tauri::command]
async fn resume_playback(state: State<'_, AppState>) -> Result<PlaybackState, String> {
    operations::resume_playback(&state).await
}

#[tauri::command]
async fn stop_playback(state: State<'_, AppState>) -> Result<PlaybackState, String> {
    operations::stop_playback(&state).await
}

#[tauri::command]
async fn seek_playback(
    position_secs: f64,
    state: State<'_, AppState>,
) -> Result<PlaybackState, String> {
    operations::seek_playback(position_secs, &state).await
}

#[tauri::command]
async fn set_volume(volume: f32, state: State<'_, AppState>) -> Result<PlaybackState, String> {
    operations::set_volume(volume, &state).await
}

#[tauri::command]
async fn set_speed(speed: f32, state: State<'_, AppState>) -> Result<PlaybackState, String> {
    operations::set_speed(speed, &state).await
}

#[tauri::command]
async fn get_playback_state(state: State<'_, AppState>) -> Result<PlaybackState, String> {
    operations::get_playback_state(&state).await
}

#[tauri::command]
async fn update_tags(
    input: TagUpdateInput,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    operations::update_tags(input, &state).await
}

#[tauri::command]
async fn preview_filename_pattern(
    track_ids: Vec<i64>,
    pattern: String,
    state: State<'_, AppState>,
) -> Result<HashMap<i64, HashMap<String, String>>, String> {
    operations::preview_filename_pattern(track_ids, pattern, &state).await
}
#[tauri::command]
async fn apply_filename_pattern(
    input: FilenamePatternInput,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    operations::apply_filename_pattern(input, &state).await
}

#[tauri::command]
async fn toggle_favorite(track_id: i64, state: State<'_, AppState>) -> Result<bool, String> {
    operations::toggle_favorite(track_id, &state).await
}

#[tauri::command]
async fn update_lyric_offset(
    track_id: i64,
    offset_ms: i64,
    state: State<'_, AppState>,
) -> Result<Track, String> {
    operations::update_lyric_offset(track_id, offset_ms, &state).await
}

#[tauri::command]
async fn search_lyrics_manual(query: String) -> Result<Vec<LrcLibTrack>, String> {
    operations::search_lyrics_manual(query).await
}

#[tauri::command]
async fn apply_lyrics_to_track(
    track_id: i64,
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
    save_lrc_file: bool,
    state: State<'_, AppState>,
) -> Result<Track, String> {
    operations::apply_lyrics_to_track(track_id, synced_lyrics, plain_lyrics, save_lrc_file, &state)
        .await
}

#[tauri::command]
async fn search_track_metadata(
    track_id: i64,
    custom_query: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<MusicBrainzCandidate>, String> {
    operations::search_track_metadata(track_id, custom_query, &state).await
}

#[tauri::command]
async fn preview_match_lyrics(
    track_id: i64,
    candidate: Option<MusicBrainzCandidate>,
    state: State<'_, AppState>,
) -> Result<Option<LrcLibTrack>, String> {
    operations::preview_match_lyrics(track_id, candidate, &state).await
}

#[tauri::command]
async fn search_album_metadata(
    track_id: i64,
    custom_query: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<AlbumCandidate>, String> {
    operations::search_album_metadata(track_id, custom_query, &state).await
}

#[tauri::command]
async fn preview_album_metadata(
    track_ids: Vec<i64>,
    release_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<AlbumTrackMatch>, String> {
    operations::preview_album_metadata(track_ids, release_id, &state).await
}
#[tauri::command]
async fn apply_confirmed_matches(
    items: Vec<ConfirmTrackMatchItem>,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    operations::apply_confirmed_matches(items, &state).await
}

#[tauri::command]
async fn create_playlist(
    name: String,
    workspace_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<Playlist>, String> {
    operations::create_playlist(name, workspace_id, &state).await
}

#[tauri::command]
async fn delete_playlist(
    playlist_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<Playlist>, String> {
    operations::delete_playlist(playlist_id, &state).await
}

#[tauri::command]
async fn add_tracks_to_playlist(
    playlist_id: i64,
    track_ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<Playlist>, String> {
    operations::add_tracks_to_playlist(playlist_id, track_ids, &state).await
}

#[tauri::command]
async fn remove_track_from_playlist(
    playlist_id: i64,
    track_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<Playlist>, String> {
    operations::remove_track_from_playlist(playlist_id, track_id, &state).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if automation::cli() {
        return;
    }
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("lof-cover", |context, request, responder| {
            let app = context.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let cover = request
                    .uri()
                    .path()
                    .trim_start_matches('/')
                    .parse::<i64>()
                    .ok()
                    .and_then(|id| {
                        app.try_state::<AppState>()
                            .and_then(|state| state.db.get_cover(id).ok().flatten())
                    })
                    .and_then(|data| tags::decode_data_url(&data));
                let response = match cover.filter(|(mime, _)| {
                    [
                        "image/png",
                        "image/jpeg",
                        "image/jpg",
                        "image/gif",
                        "image/webp",
                        "image/bmp",
                        "image/tiff",
                    ]
                    .contains(&mime.as_str())
                }) {
                    Some((mime, bytes)) => tauri::http::Response::builder()
                        .header("Content-Type", mime)
                        .header("Cache-Control", "private, max-age=31536000, immutable")
                        .header("X-Content-Type-Options", "nosniff")
                        .body(bytes)
                        .unwrap(),
                    None => tauri::http::Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap(),
                };
                responder.respond(response);
            });
        })
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
                metadata_lock: Mutex::new(()),
                visibility_lock: tokio::sync::RwLock::new(()),
            };

            app.manage(state);
            app.manage(automation::ApiServer::start(
                &app.state::<AppState>().app_data_dir.join("runtime.json"),
                automation::handler(app.handle().clone()),
            )?);

            // Library loads from the SQLite cache; changed files are re-indexed in the background.
            scanner::spawn_worker(app.handle().clone(), scan_rx);
            let state = app.state::<AppState>();
            for folder in &folders {
                state.scanner.enqueue(folder);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tray::minimize_to_tray,
            automation::get_automation_info,
            automation::get_audio_skill_status,
            automation::install_audio_skill,
            get_library_state,
            get_library_tracks,
            hide_library_items,
            unhide_library_item,
            workspaces::create_workspace,
            workspaces::rename_workspace,
            workspaces::select_workspace,
            workspaces::delete_workspace,
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
            preview_filename_pattern,
            preview_match_lyrics,
            search_album_metadata,
            preview_album_metadata,
            toggle_favorite,
            update_lyric_offset,
            search_lyrics_manual,
            apply_lyrics_to_track,
            search_track_metadata,
            apply_confirmed_matches,
            create_playlist,
            delete_playlist,
            add_tracks_to_playlist,
            remove_track_from_playlist,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(server) = app.try_state::<automation::ApiServer>() {
                    server.shutdown();
                }
            }
        });
}
