use crate::{
    metadata,
    models::{Track, Workspace},
    operations, skills, AppState,
};
use serde_json::{json, Value};
use std::{collections::HashSet, path::Path};

pub fn folder_key(path: &str) -> String {
    let path = path
        .strip_prefix(r"\\?\UNC\")
        .map(|p| format!("//{p}"))
        .unwrap_or_else(|| path.strip_prefix(r"\\?\").unwrap_or(path).to_string());
    let key = path.replace('\\', "/").trim_end_matches('/').to_string();
    if key.starts_with("//") || key.as_bytes().get(1) == Some(&b':') {
        key.to_lowercase()
    } else if key.is_empty() {
        "/".into()
    } else {
        key
    }
}

pub fn contains(workspace: &Workspace, track: &Track) -> bool {
    let key = folder_key(&track.folder_path);
    !workspace.excluded_track_ids.contains(&track.id)
        && workspace.folders.iter().any(|folder| {
            let root = folder_key(folder);
            key == root
                || key.starts_with(&if root == "/" {
                    root
                } else {
                    format!("{root}/")
                })
        })
}

fn workspace(state: &AppState, id: i64) -> Result<Workspace, String> {
    state
        .db
        .get_workspace_state()?
        .workspaces
        .into_iter()
        .find(|w| w.id == id)
        .ok_or_else(|| "NOT_FOUND: 워크스페이스를 찾을 수 없습니다.".into())
}

pub(super) fn require_track(state: &AppState, workspace_id: i64, id: i64) -> Result<Track, String> {
    let ws = workspace(state, workspace_id)?;
    let track = state.db.get_public_track(id)?;
    if !contains(&ws, &track) {
        return Err("NOT_FOUND: 이 워크스페이스에 속한 트랙이 아닙니다.".into());
    }
    Ok(track)
}

fn require_playlist(state: &AppState, workspace_id: i64, id: i64) -> Result<(), String> {
    workspace(state, workspace_id)?;
    if !state
        .db
        .get_playlists()?
        .iter()
        .any(|p| p.id == id && p.workspace_id == workspace_id)
    {
        return Err("NOT_FOUND: 이 워크스페이스의 플레이리스트가 아닙니다.".into());
    }
    Ok(())
}

fn playlists(state: &AppState, id: i64) -> Result<Value, String> {
    let ws = workspace(state, id)?;
    let visible: HashSet<_> = state
        .db
        .get_all_tracks()?
        .iter()
        .filter(|t| contains(&ws, t))
        .map(|t| t.id)
        .collect();
    let mut playlists = state.db.get_playlists()?;
    playlists.retain(|p| p.workspace_id == id);
    for p in &mut playlists {
        p.track_ids.retain(|track_id| visible.contains(track_id));
    }
    Ok(json!({"playlists":playlists}))
}

fn track_read(
    state: &AppState,
    workspace_id: i64,
    id: i64,
    include_cover: bool,
) -> Result<Value, String> {
    let _guard = state.metadata_lock.lock().map_err(|e| e.to_string())?;
    let mut public = require_track(state, workspace_id, id)?;
    let full = state
        .db
        .get_track_by_id(id)?
        .ok_or("NOT_FOUND: 트랙을 찾을 수 없습니다.")?;
    if include_cover {
        public.cover_data_url = full.cover_data_url.clone();
    }
    Ok(json!({"track":public,"revision":metadata::revision(&full)}))
}

fn track_update(state: &AppState, args: &Value) -> Result<Value, String> {
    let id = args["trackId"].as_i64().unwrap();
    require_track(state, args["workspaceId"].as_i64().unwrap(), id)?;
    metadata::edit_track_checked(
        &state.db,
        &state.metadata_lock,
        id,
        args["expectedRevision"].as_str(),
        args["saveLrcFile"]
            .as_bool()
            .unwrap_or_else(|| state.db.get_setting_bool("saveLrcFile", true)),
        |track| {
            require_track(state, args["workspaceId"].as_i64().unwrap(), id)?;
            apply_track_changes(track, args["changes"].as_object().unwrap())
        },
    )?;
    track_read(state, args["workspaceId"].as_i64().unwrap(), id, false)
}

pub(super) fn apply_track_changes(
    track: &mut Track,
    changes: &serde_json::Map<String, Value>,
) -> Result<(), String> {
    if let Some(cover) = changes.get("coverDataUrl").and_then(Value::as_str) {
        let (mime, _) = crate::tags::decode_data_url(cover)
            .ok_or("INVALID_ARGUMENT: coverDataUrl은 이미지 data URL이어야 합니다.")?;
        if ![
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/bmp",
            "image/tiff",
        ]
        .contains(&mime.as_str())
        {
            return Err("INVALID_ARGUMENT: 지원하지 않는 이미지 형식입니다.".into());
        }
    }
    let mut value = serde_json::to_value(&*track).map_err(|e| e.to_string())?;
    for (key, value_to_set) in changes {
        value[key] = value_to_set.clone();
    }
    *track = serde_json::from_value(value).map_err(|e| e.to_string())?;
    if changes.contains_key("syncedLyrics") && !changes.contains_key("plainLyrics") {
        if let Some(lrc) = &track.synced_lyrics {
            track.plain_lyrics = Some(crate::tags::strip_lrc_timestamps(lrc));
        }
    } else if changes.contains_key("plainLyrics") && !changes.contains_key("syncedLyrics") {
        track.synced_lyrics = None;
    }
    Ok(())
}

pub async fn call(state: &AppState, tool: &str, args: &Value) -> Result<Value, String> {
    let definition = super::tools::definitions()
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["name"] == tool)
        .ok_or_else(|| "UNKNOWN_TOOL: 지원하지 않는 도구입니다.".to_string())?;
    super::tools::validate(args, &definition["inputSchema"], "arguments")?;
    let integer = |key: &str| args[key].as_i64().unwrap_or(0);
    let string = |key: &str| args[key].as_str().unwrap_or("").to_string();
    let ids = || {
        args["trackIds"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_i64().unwrap())
            .collect::<Vec<_>>()
    };
    let ws = integer("workspaceId");
    let id = integer("trackId");
    Ok(match tool {
        "app_status" => {
            json!({"name":"Lof Audio","version":env!("CARGO_PKG_VERSION"),"workspaceState":state.db.get_workspace_state()?,"scan":state.scanner.status()})
        }
        "workspace_list" => json!(state.db.get_workspace_state()?),
        "workspace_create" => json!(state.db.create_workspace(&string("name"))?),
        "workspace_rename" => json!(state.db.rename_workspace(ws, &string("name"))?),
        "workspace_select" => json!(state.db.select_workspace(ws)?),
        "workspace_delete" => {
            let _guard = state.metadata_lock.lock().map_err(|e| e.to_string())?;
            json!(state.db.delete_workspace(ws)?)
        }
        "folder_add" | "folder_remove" => {
            let path = string("folderPath");
            if !Path::new(&path).is_absolute() {
                return Err("INVALID_ARGUMENT: 폴더의 절대 경로가 필요합니다.".into());
            }
            if tool == "folder_add" {
                operations::scan_folder(path, ws, state).await?;
            } else {
                operations::remove_folder(path, ws, state).await?;
            }
            json!(state.db.get_workspace_state()?)
        }
        "library_rescan" => {
            operations::rescan_library(args["force"].as_bool().unwrap_or(false), ws, state).await?;
            json!({"requested":true})
        }
        "scan_status" => {
            let workspace = workspace(state, ws)?;
            let progress = state.scanner.status().filter(|p| {
                workspace
                    .folders
                    .iter()
                    .any(|f| folder_key(f) == folder_key(&p.folder))
            });
            let pending: Vec<_> = state
                .scanner
                .pending_folders()
                .into_iter()
                .filter(|p| {
                    workspace
                        .folders
                        .iter()
                        .any(|f| folder_key(f) == folder_key(p))
                })
                .collect();
            json!({"busy":!pending.is_empty() || progress.as_ref().is_some_and(|p| !p.done),"pendingFolders":pending,"scan":progress})
        }
        "library_search" => {
            let workspace = workspace(state, ws)?;
            let query = string("query").to_lowercase();
            let favorites = args["favoritesOnly"].as_bool().unwrap_or(false);
            let offset = args["offset"].as_u64().unwrap_or(0) as usize;
            let limit = args["limit"].as_u64().unwrap_or(100) as usize;
            let tracks = state.db.get_all_tracks()?;
            let filtered: Vec<_> = tracks
                .iter()
                .filter(|t| {
                    contains(&workspace, t)
                        && (!favorites || t.is_favorite)
                        && [&t.title, &t.artist, &t.album, &t.genre, &t.file_name]
                            .iter()
                            .any(|text| text.to_lowercase().contains(&query))
                })
                .collect();
            let result: Vec<_> = filtered.iter().skip(offset).take(limit).map(|t| json!({"id":t.id,"title":t.title,"artist":t.artist,"album":t.album,"fileName":t.file_name,"folderPath":t.folder_path,"durationSecs":t.duration_secs,"format":t.format,"isFavorite":t.is_favorite})).collect();
            json!({"tracks":result,"total":filtered.len(),"offset":offset,"limit":limit,"truncated":offset.saturating_add(result.len()) < filtered.len()})
        }
        "track_read" => track_read(
            state,
            ws,
            id,
            args["includeCover"].as_bool().unwrap_or(false),
        )?,
        "track_update" => track_update(state, args)?,
        "metadata_research_prepare" => super::research::prepare(state, args)?,
        "metadata_research_preview" => super::research::preview(state, args)?,
        "metadata_research_apply" => super::research::apply(state, args)?,
        "metadata_research_history" => super::research::history(state, args)?,
        "track_remove" => {
            let ids = ids();
            for id in &ids {
                require_track(state, ws, *id)?;
            }
            operations::delete_tracks_from_library(ids, ws, state).await?;
            json!(state.db.get_workspace_state()?)
        }
        "track_favorite" => {
            require_track(state, ws, id)?;
            state
                .db
                .set_favorite(id, args["favorite"].as_bool().unwrap())?;
            json!({"track":state.db.get_public_track(id)?})
        }
        "playback_status" => json!(operations::get_playback_state(state).await?),
        "playback_play" => {
            require_track(state, ws, id)?;
            state.db.select_workspace(ws)?;
            json!(operations::play_track(id, state).await?)
        }
        "playback_pause" => json!(operations::pause_playback(state).await?),
        "playback_resume" => json!(operations::resume_playback(state).await?),
        "playback_stop" => json!(operations::stop_playback(state).await?),
        "playback_seek" => {
            json!(operations::seek_playback(args["positionSecs"].as_f64().unwrap(), state).await?)
        }
        "playback_volume" => {
            json!(operations::set_volume(args["volume"].as_f64().unwrap() as f32, state).await?)
        }
        "playback_speed" => {
            json!(operations::set_speed(args["speed"].as_f64().unwrap() as f32, state).await?)
        }
        "lyrics_search" => {
            json!({"candidates":operations::search_lyrics_manual(string("query")).await?})
        }
        "metadata_search" => {
            require_track(state, ws, id)?;
            json!({"candidates":operations::search_track_metadata(id, args["query"].as_str().map(String::from), state).await?})
        }
        "album_search" => {
            require_track(state, ws, id)?;
            json!({"candidates":operations::search_album_metadata(id, args["query"].as_str().map(String::from), state).await?})
        }
        "album_preview" => {
            let ids = ids();
            for id in &ids {
                require_track(state, ws, *id)?;
            }
            json!({"matches":operations::preview_album_metadata(ids, string("releaseId"), state).await?})
        }
        "playlist_list" => playlists(state, ws)?,
        "playlist_create" => {
            workspace(state, ws)?;
            operations::create_playlist(string("name"), ws, state).await?;
            playlists(state, ws)?
        }
        "playlist_delete" => {
            require_playlist(state, ws, integer("playlistId"))?;
            operations::delete_playlist(integer("playlistId"), state).await?;
            playlists(state, ws)?
        }
        "playlist_add_tracks" => {
            require_playlist(state, ws, integer("playlistId"))?;
            let ids = ids();
            for id in &ids {
                require_track(state, ws, *id)?;
            }
            operations::add_tracks_to_playlist(integer("playlistId"), ids, state).await?;
            playlists(state, ws)?
        }
        "playlist_remove_track" => {
            require_playlist(state, ws, integer("playlistId"))?;
            operations::remove_track_from_playlist(integer("playlistId"), id, state).await?;
            playlists(state, ws)?
        }
        "skill_status" => skills::status(args["skillsDirectory"].as_str())?,
        "skill_get" => skills::get(args["knownRevision"].as_str())?,
        "skill_install" => skills::install(
            &string("skillsDirectory"),
            &string("expectedRevision"),
            args["expectedInstalledRevision"].as_str(),
        )?,
        _ => return Err("UNKNOWN_TOOL: 지원하지 않는 도구입니다.".into()),
    })
}
