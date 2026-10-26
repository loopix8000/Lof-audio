use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: i64,
    pub file_path: String,
    pub file_name: String,
    pub folder_path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub track_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: String,
    pub duration_secs: f64,
    pub bitrate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
    pub format: String,
    pub cover_data_url: Option<String>,
    pub synced_lyrics: Option<String>,
    pub plain_lyrics: Option<String>,
    pub lyric_offset_ms: i64,
    pub mbid_recording: Option<String>,
    pub mbid_release: Option<String>,
    pub is_favorite: bool,
    pub play_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub current_track_id: Option<i64>,
    pub file_path: Option<String>,
    pub is_playing: bool,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub volume: f32,
    pub speed: f32,
    pub is_ended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagUpdateInput {
    pub track_ids: Vec<i64>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub auto_number: bool,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
    pub cover_data_url: Option<String>,
    pub save_lrc_file: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilenamePatternInput {
    pub track_ids: Vec<i64>,
    pub pattern: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LrcLibTrack {
    pub id: i64,
    pub name: Option<String>,
    pub track_name: Option<String>,
    pub artist_name: Option<String>,
    pub album_name: Option<String>,
    pub duration: Option<f64>,
    pub instrumental: Option<bool>,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzCandidate {
    pub recording_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub release_id: Option<String>,
    pub year: Option<u32>,
    pub track_number: Option<u32>,
    pub score: Option<u32>,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub track_ids: Vec<i64>,
    pub workspace_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: i64,
    pub name: String,
    pub folders: Vec<String>,
    pub excluded_track_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub workspaces: Vec<Workspace>,
    pub active_workspace_id: i64,
    pub workspace_revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMatchPreview {
    pub track_id: i64,
    pub candidates: Vec<MusicBrainzCandidate>,
    pub matched_synced_lyrics: Option<String>,
    pub matched_plain_lyrics: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmTrackMatchItem {
    pub track_id: i64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<u32>,
    pub track_number: Option<u32>,
    pub recording_id: Option<String>,
    pub release_id: Option<String>,
    pub apply_cover: bool,
    pub synced_lyrics: Option<String>,
    pub plain_lyrics: Option<String>,
}
