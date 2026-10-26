use crate::models::{Playlist, Track};
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

mod research;
mod workspaces;

/// Size and modification time (ms since epoch) of an audio file when it was indexed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileStamp {
    pub size: i64,
    pub mtime: i64,
    pub lrc_size: Option<i64>,
    pub lrc_mtime: Option<i64>,
}

impl FileStamp {
    pub fn of(meta: &std::fs::Metadata) -> Self {
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        Self {
            size: meta.len() as i64,
            mtime,
            lrc_size: None,
            lrc_mtime: None,
        }
    }

    pub fn of_path(path: &Path) -> std::io::Result<Self> {
        let mut stamp = Self::of(&std::fs::metadata(path)?);
        match std::fs::metadata(path.with_extension("lrc")) {
            Ok(meta) => {
                let lrc = Self::of(&meta);
                stamp.lrc_size = Some(lrc.size);
                stamp.lrc_mtime = Some(lrc.mtime);
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
        Ok(stamp)
    }
}

pub struct Database {
    pub conn: Mutex<Connection>,
}

type ExistingTrack = (
    i64,
    Option<String>,
    Option<String>,
    Option<String>,
    i64,
    bool,
    u32,
);
fn folder_bounds(path: &str) -> (String, String) {
    let root = path.replace('\\', "/").trim_end_matches('/').to_string();
    let prefix = format!("{root}/");
    (root, prefix)
}
fn folder_predicate(column: &str) -> String {
    let collation = if cfg!(windows) { " COLLATE NOCASE" } else { "" };
    let path = format!("replace({column}, char(92), '/')");
    format!("({path} = ?1{collation} OR substr({path}, 1, length(?2)) = ?2{collation})")
}
fn track_columns(include_cover: bool) -> String {
    let cover = if include_cover {
        "cover_data_url".to_string()
    } else {
        let origin = if cfg!(any(windows, target_os = "android")) {
            "http://lof-cover.localhost"
        } else {
            "lof-cover://localhost"
        };
        format!("CASE WHEN cover_present = 1 THEN '{origin}/' || id || '?v=' || metadata_revision ELSE NULL END")
    };
    format!(
        "id, file_path, file_name, folder_path, title, artist, album, album_artist,
        track_number, year, genre, duration_secs, bitrate, sample_rate, channels,
        format, {cover}, synced_lyrics, plain_lyrics, lyric_offset_ms,
        mbid_recording, mbid_release, is_favorite, play_count"
    )
}
fn track_from_row(row: &Row<'_>) -> rusqlite::Result<Track> {
    Ok(Track {
        id: row.get(0)?,
        file_path: row.get(1)?,
        file_name: row.get(2)?,
        folder_path: row.get(3)?,
        title: row.get(4)?,
        artist: row.get(5)?,
        album: row.get(6)?,
        album_artist: row.get(7)?,
        track_number: row.get(8)?,
        year: row.get(9)?,
        genre: row.get(10)?,
        duration_secs: row.get(11)?,
        bitrate: row.get(12)?,
        sample_rate: row.get(13)?,
        channels: row.get(14)?,
        format: row.get(15)?,
        cover_data_url: row.get(16)?,
        synced_lyrics: row.get(17)?,
        plain_lyrics: row.get(18)?,
        lyric_offset_ms: row.get(19)?,
        mbid_recording: row.get(20)?,
        mbid_release: row.get(21)?,
        is_favorite: row.get::<_, i64>(22)? != 0,
        play_count: row.get(23)?,
    })
}
impl Database {
    pub fn new(db_path: &Path) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let conn = Connection::open(db_path).map_err(|e| format!("DB 열기 실패: {}", e))?;
        // WAL keeps UI reads responsive while the background indexer writes.
        conn.execute_batch(
            "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;",
        )
        .map_err(|e| format!("DB 설정 실패: {}", e))?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE NOT NULL,
                file_name TEXT NOT NULL,
                folder_path TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                album_artist TEXT NOT NULL,
                track_number INTEGER,
                year INTEGER,
                genre TEXT NOT NULL DEFAULT '',
                duration_secs REAL NOT NULL DEFAULT 0,
                bitrate INTEGER,
                sample_rate INTEGER,
                channels INTEGER,
                format TEXT NOT NULL DEFAULT '',
                cover_data_url TEXT,
                synced_lyrics TEXT,
                plain_lyrics TEXT,
                lyric_offset_ms INTEGER NOT NULL DEFAULT 0,
                mbid_recording TEXT,
                mbid_release TEXT,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                play_count INTEGER NOT NULL DEFAULT 0,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS metadata_research_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL,
                track_id INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                status TEXT NOT NULL,
                proposal_json TEXT NOT NULL,
                selected_fields_json TEXT NOT NULL,
                plan_hash TEXT NOT NULL,
                revision_before TEXT NOT NULL,
                revision_after TEXT,
                error TEXT
            );
            CREATE INDEX IF NOT EXISTS metadata_research_track ON metadata_research_log(workspace_id, track_id, id);

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id INTEGER NOT NULL,
                track_id INTEGER NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (playlist_id, track_id),
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            ",
        )
        .map_err(|e| format!("테이블 초기화 실패: {}", e))?;

        // Index cache columns: size + mtime let rescans skip unchanged files.
        let has_stamp = conn
            .prepare("SELECT 1 FROM pragma_table_info('tracks') WHERE name = 'file_mtime'")
            .and_then(|mut stmt| stmt.exists([]))
            .map_err(|e| e.to_string())?;
        if !has_stamp {
            conn.execute_batch(
                "ALTER TABLE tracks ADD COLUMN file_size INTEGER;
                 ALTER TABLE tracks ADD COLUMN file_mtime INTEGER;",
            )
            .map_err(|e| format!("테이블 마이그레이션 실패: {}", e))?;
        }
        for (name, definition) in [
            ("lrc_size", "INTEGER"),
            ("lrc_mtime", "INTEGER"),
            ("metadata_revision", "INTEGER NOT NULL DEFAULT 0"),
            ("cover_present", "INTEGER"),
        ] {
            let exists = conn
                .prepare("SELECT 1 FROM pragma_table_info('tracks') WHERE name = ?1")
                .and_then(|mut stmt| stmt.exists(params![name]))
                .map_err(|e| e.to_string())?;
            if !exists {
                conn.execute_batch(&format!(
                    "ALTER TABLE tracks ADD COLUMN {name} {definition}"
                ))
                .map_err(|e| e.to_string())?;
            }
        }
        conn.execute("UPDATE tracks SET cover_present = (cover_data_url IS NOT NULL AND length(cover_data_url) > 0) WHERE cover_present IS NULL", [])
            .map_err(|e| e.to_string())?;
        workspaces::migrate(&mut conn)?;
        Ok(())
    }

    pub fn add_folder(&self, folder_path: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO folders (path) VALUES (?1)",
            params![folder_path],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_folders(&self) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT path FROM folders ORDER BY id ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn remove_folder(&self, folder_path: &str) -> Result<(), String> {
        if folder_path.trim().is_empty() {
            return Err("제거할 폴더 경로가 비어 있습니다.".to_string());
        }
        let (root, prefix) = folder_bounds(folder_path);
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (table, column) in [("folders", "path"), ("tracks", "folder_path")] {
            let sql = format!("DELETE FROM {table} WHERE {}", folder_predicate(column));
            tx.execute(&sql, params![root, prefix])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn upsert_track(&self, track: &Track) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        Self::upsert_track_conn(&conn, track, None)
    }

    /// Upserts a batch of scanned tracks in a single transaction, recording each file's stamp.
    pub fn upsert_tracks(&self, items: &[(Track, FileStamp)]) -> Result<Vec<i64>, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let mut ids = Vec::with_capacity(items.len());
        for (track, stamp) in items {
            ids.push(Self::upsert_track_conn(&tx, track, Some(*stamp))?);
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(ids)
    }

    fn upsert_track_conn(
        conn: &Connection,
        track: &Track,
        stamp: Option<FileStamp>,
    ) -> Result<i64, String> {
        let (size, mtime) = match stamp {
            Some(s) => (Some(s.size), Some(s.mtime)),
            None => (None, None),
        };
        let existing: Option<ExistingTrack> = conn
            .query_row(
                "SELECT id, cover_data_url, synced_lyrics, plain_lyrics, lyric_offset_ms, is_favorite, play_count FROM tracks WHERE file_path = ?1",
                params![track.file_path],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get::<_, i64>(5)? != 0,
                        row.get(6)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if let Some((id, old_cover, old_synced, old_plain, old_offset, is_fav, play_cnt)) = existing
        {
            let cover = track.cover_data_url.clone().or(old_cover);
            let synced = track.synced_lyrics.clone().or(old_synced);
            let plain = track.plain_lyrics.clone().or(old_plain);
            conn.execute(
                "UPDATE tracks SET
                    file_name = ?1,
                    folder_path = ?2,
                    title = ?3,
                    artist = ?4,
                    album = ?5,
                    album_artist = ?6,
                    track_number = ?7,
                    year = ?8,
                    genre = ?9,
                    duration_secs = ?10,
                    bitrate = ?11,
                    sample_rate = ?12,
                    channels = ?13,
                    format = ?14,
                    cover_data_url = ?15,
                    synced_lyrics = ?16,
                    plain_lyrics = ?17,
                    lyric_offset_ms = ?18,
                    is_favorite = ?19,
                    play_count = ?20,
                    file_size = COALESCE(?22, file_size),
                    file_mtime = COALESCE(?23, file_mtime),
                    lrc_size = CASE WHEN ?22 IS NOT NULL THEN ?24 ELSE lrc_size END,
                    lrc_mtime = CASE WHEN ?22 IS NOT NULL THEN ?25 ELSE lrc_mtime END,
                    metadata_revision = metadata_revision + 1,
                    cover_present = (?15 IS NOT NULL AND length(?15) > 0)
                WHERE id = ?21",
                params![
                    track.file_name,
                    track.folder_path,
                    track.title,
                    track.artist,
                    track.album,
                    track.album_artist,
                    track.track_number,
                    track.year,
                    track.genre,
                    track.duration_secs,
                    track.bitrate,
                    track.sample_rate,
                    track.channels,
                    track.format,
                    cover,
                    synced,
                    plain,
                    old_offset,
                    if is_fav { 1 } else { 0 },
                    play_cnt,
                    id,
                    size,
                    mtime,
                    stamp.and_then(|s| s.lrc_size),
                    stamp.and_then(|s| s.lrc_mtime)
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(id)
        } else {
            conn.execute(
                "INSERT INTO tracks (
                    file_path, file_name, folder_path, title, artist, album, album_artist,
                    track_number, year, genre, duration_secs, bitrate, sample_rate, channels,
                    format, cover_data_url, synced_lyrics, plain_lyrics, lyric_offset_ms,
                    mbid_recording, mbid_release, is_favorite, play_count, file_size, file_mtime, lrc_size, lrc_mtime, cover_present
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                    ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                    ?15, ?16, ?17, ?18, ?19,
                    ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, (?16 IS NOT NULL AND length(?16) > 0)
                )",
                params![
                    track.file_path,
                    track.file_name,
                    track.folder_path,
                    track.title,
                    track.artist,
                    track.album,
                    track.album_artist,
                    track.track_number,
                    track.year,
                    track.genre,
                    track.duration_secs,
                    track.bitrate,
                    track.sample_rate,
                    track.channels,
                    track.format,
                    track.cover_data_url,
                    track.synced_lyrics,
                    track.plain_lyrics,
                    track.lyric_offset_ms,
                    track.mbid_recording,
                    track.mbid_release,
                    if track.is_favorite { 1 } else { 0 },
                    track.play_count,
                    size,
                    mtime,
                    stamp.and_then(|s| s.lrc_size),
                    stamp.and_then(|s| s.lrc_mtime)
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    }

    /// Cached file stamps for every track stored under `root`, keyed by file path.
    pub fn get_file_stamps_under(
        &self,
        root: &str,
    ) -> Result<HashMap<String, (i64, Option<FileStamp>)>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (root, prefix) = folder_bounds(root);
        let sql = format!(
            "SELECT id, file_path, file_size, file_mtime, lrc_size, lrc_mtime FROM tracks WHERE {}",
            folder_predicate("folder_path")
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![root, prefix], |row| {
                let size: Option<i64> = row.get(2)?;
                let mtime: Option<i64> = row.get(3)?;
                let stamp = match (size, mtime) {
                    (Some(size), Some(mtime)) => Some(FileStamp {
                        size,
                        mtime,
                        lrc_size: row.get(4)?,
                        lrc_mtime: row.get(5)?,
                    }),
                    _ => None,
                };
                Ok((row.get::<_, String>(1)?, (row.get::<_, i64>(0)?, stamp)))
            })
            .map_err(|e| e.to_string())?;
        let out = rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?;
        Ok(out)
    }

    /// Forgets cached file stamps so the next scan re-reads every file's tags.
    pub fn clear_file_stamps(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("UPDATE tracks SET file_size = NULL, file_mtime = NULL", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// All stored settings as a JSON object; values are JSON-encoded per key.
    pub fn get_settings(&self) -> Result<serde_json::Map<String, serde_json::Value>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        let mut out = serde_json::Map::new();
        for item in rows {
            let (key, raw) = item.map_err(|e| e.to_string())?;
            if let Ok(value) = serde_json::from_str(&raw) {
                out.insert(key, value);
            }
        }
        Ok(out)
    }

    /// Upserts the given keys; keys not present in `patch` are left untouched.
    pub fn save_settings(
        &self,
        patch: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (key, value) in patch {
            tx.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn get_setting_bool(&self, key: &str, default: bool) -> bool {
        self.get_settings()
            .ok()
            .and_then(|m| m.get(key).and_then(|v| v.as_bool()))
            .unwrap_or(default)
    }

    pub fn has_folder(&self, folder_path: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let exists = conn
            .prepare("SELECT 1 FROM folders WHERE path = ?1")
            .and_then(|mut stmt| stmt.exists(params![folder_path]))
            .map_err(|e| e.to_string())?;
        Ok(exists)
    }

    pub fn get_all_tracks(&self) -> Result<Vec<Track>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let sql = format!(
            "SELECT {} FROM tracks ORDER BY album, COALESCE(track_number, 9999), file_name, title",
            track_columns(false)
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], track_from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_track_by_id(&self, track_id: i64) -> Result<Option<Track>, String> {
        self.get_track(track_id, true)
    }

    pub fn get_public_track(&self, track_id: i64) -> Result<Track, String> {
        self.get_track(track_id, false)?
            .ok_or_else(|| "트랙을 찾을 수 없습니다.".to_string())
    }

    pub fn get_public_tracks(&self, ids: &[i64]) -> Result<Vec<Track>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let sql = format!("SELECT {} FROM tracks WHERE id = ?1", track_columns(false));
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut tracks = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(track) = stmt
                .query_row(params![id], track_from_row)
                .optional()
                .map_err(|e| e.to_string())?
            {
                tracks.push(track);
            }
        }
        Ok(tracks)
    }

    fn get_track(&self, track_id: i64, include_cover: bool) -> Result<Option<Track>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let sql = format!(
            "SELECT {} FROM tracks WHERE id = ?1",
            track_columns(include_cover)
        );
        conn.query_row(&sql, params![track_id], track_from_row)
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn get_cover(&self, track_id: i64) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT cover_data_url FROM tracks WHERE id = ?1",
            params![track_id],
            |row| row.get(0),
        )
        .optional()
        .map(|v| v.flatten())
        .map_err(|e| e.to_string())
    }

    pub fn update_track_metadata(&self, track: &Track) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE tracks SET
                title = ?1,
                artist = ?2,
                album = ?3,
                album_artist = ?4,
                track_number = ?5,
                year = ?6,
                genre = ?7,
                cover_data_url = ?8,
                synced_lyrics = ?9,
                plain_lyrics = ?10,
                lyric_offset_ms = ?11,
                mbid_recording = ?12,
                mbid_release = ?13,
                metadata_revision = metadata_revision + 1,
                cover_present = (?8 IS NOT NULL AND length(?8) > 0)
            WHERE id = ?14",
            params![
                track.title,
                track.artist,
                track.album,
                track.album_artist,
                track.track_number,
                track.year,
                track.genre,
                track.cover_data_url,
                track.synced_lyrics,
                track.plain_lyrics,
                track.lyric_offset_ms,
                track.mbid_recording,
                track.mbid_release,
                track.id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn toggle_favorite(&self, track_id: i64) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let current: i64 = conn
            .query_row(
                "SELECT is_favorite FROM tracks WHERE id = ?1",
                params![track_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let next = if current == 0 { 1 } else { 0 };
        conn.execute(
            "UPDATE tracks SET is_favorite = ?1 WHERE id = ?2",
            params![next, track_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(next != 0)
    }

    pub fn set_favorite(&self, track_id: i64, favorite: bool) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE tracks SET is_favorite = ?1 WHERE id = ?2",
            params![favorite, track_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn increment_play_count(&self, track_id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?1",
            params![track_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_lyric_offset(&self, track_id: i64, offset_ms: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE tracks SET lyric_offset_ms = ?1 WHERE id = ?2",
            params![offset_ms, track_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_tracks(&self, track_ids: &[i64]) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for id in track_ids {
            tx.execute(
                "DELETE FROM playlist_tracks WHERE track_id = ?1",
                params![id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM tracks WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn create_playlist(&self, name: &str, workspace_id: i64) -> Result<Playlist, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO playlists (name, workspace_id) VALUES (?1, ?2)",
            params![name.trim(), workspace_id],
        )
        .map_err(|e| format!("플레이리스트 생성 실패: {}", e))?;
        let id = conn.last_insert_rowid();
        Ok(Playlist {
            id,
            name: name.trim().to_string(),
            track_ids: Vec::new(),
            workspace_id,
        })
    }

    pub fn delete_playlist(&self, playlist_id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn add_tracks_to_playlist(
        &self,
        playlist_id: i64,
        track_ids: &[i64],
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        for (idx, tid) in track_ids.iter().enumerate() {
            conn.execute(
                "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
                params![playlist_id, tid, idx as i64],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn remove_track_from_playlist(
        &self,
        playlist_id: i64,
        track_id: i64,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
            params![playlist_id, track_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_playlists(&self) -> Result<Vec<Playlist>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, workspace_id FROM playlists ORDER BY id ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut playlists = Vec::new();
        for item in rows {
            let (pid, name, workspace_id) = item.map_err(|e| e.to_string())?;
            let mut t_stmt = conn
                .prepare("SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position ASC")
                .map_err(|e| e.to_string())?;
            let t_rows = t_stmt
                .query_map(params![pid], |r| r.get::<_, i64>(0))
                .map_err(|e| e.to_string())?;
            let track_ids: Vec<i64> = t_rows
                .collect::<Result<_, _>>()
                .map_err(|e| e.to_string())?;
            playlists.push(Playlist {
                id: pid,
                name,
                track_ids,
                workspace_id,
            });
        }
        Ok(playlists)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_track(path: &str) -> Track {
        Track {
            id: 0,
            file_path: path.to_string(),
            file_name: "a.mp3".to_string(),
            folder_path: "/music".to_string(),
            title: "A".to_string(),
            artist: "B".to_string(),
            album: "C".to_string(),
            album_artist: String::new(),
            track_number: None,
            year: None,
            genre: String::new(),
            duration_secs: 1.0,
            bitrate: None,
            sample_rate: None,
            channels: None,
            format: "MP3".to_string(),
            cover_data_url: None,
            synced_lyrics: None,
            plain_lyrics: None,
            lyric_offset_ms: 0,
            mbid_recording: None,
            mbid_release: None,
            is_favorite: false,
            play_count: 0,
        }
    }

    #[test]
    fn startup_preserves_real_folders_with_demo_names() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.sqlite3");
        let db = Database::new(&path).unwrap();
        for folder in ["/demo_music", "/demoXmusic"] {
            let mut track = sample_track(&format!("{folder}/song.mp3"));
            track.folder_path = folder.into();
            db.add_folder(folder).unwrap();
            db.upsert_track(&track).unwrap();
        }
        drop(db);
        let db = Database::new(&path).unwrap();
        assert_eq!(db.get_all_tracks().unwrap().len(), 2);
        assert_eq!(db.get_folders().unwrap().len(), 2);
    }

    #[test]
    fn removal_respects_path_boundaries_and_literal_wildcards() {
        let db = Database::new(Path::new(":memory:")).unwrap();
        for folder in ["/Music", "/Music/Child", "/MusicBackup", "/Mix_%", "/Mix_X"] {
            let mut track = sample_track(&format!("{folder}/song.mp3"));
            track.folder_path = folder.into();
            db.add_folder(folder).unwrap();
            db.upsert_track(&track).unwrap();
        }
        assert_eq!(db.get_file_stamps_under("/Music").unwrap().len(), 2);
        db.remove_folder("/Music/").unwrap();
        db.remove_folder("/Mix_%").unwrap();
        let paths: Vec<_> = db
            .get_all_tracks()
            .unwrap()
            .into_iter()
            .map(|t| t.folder_path)
            .collect();
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"/MusicBackup".into()));
        assert!(paths.contains(&"/Mix_X".into()));
        assert!(db.remove_folder("").is_err());
    }

    #[test]
    fn snapshot_defers_cover_payload_and_invalidates_changed_cover() {
        let db = Database::new(Path::new(":memory:")).unwrap();
        let mut track = sample_track("/music/a.mp3");
        track.cover_data_url = Some("data:image/png;base64,AQID".into());
        let id = db.upsert_track(&track).unwrap();
        let before = db.get_public_track(id).unwrap().cover_data_url.unwrap();
        assert!(!before.contains("base64"));
        assert_eq!(db.get_cover(id).unwrap(), track.cover_data_url);
        track.id = id;
        track.cover_data_url = Some("data:image/png;base64,BAUG".into());
        db.update_track_metadata(&track).unwrap();
        assert_ne!(
            before,
            db.get_public_track(id).unwrap().cover_data_url.unwrap()
        );
    }

    #[test]
    fn sidecar_edits_and_deletions_change_the_index_stamp() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("track.wav");
        std::fs::write(&path, b"audio").unwrap();
        let original = FileStamp::of_path(&path).unwrap();
        std::fs::write(path.with_extension("lrc"), "[00:01]first").unwrap();
        let first = FileStamp::of_path(&path).unwrap();
        assert_ne!(original, first);
        std::fs::write(path.with_extension("lrc"), "[00:01]longer lyrics").unwrap();
        assert_ne!(first, FileStamp::of_path(&path).unwrap());
        std::fs::remove_file(path.with_extension("lrc")).unwrap();
        assert_eq!(original, FileStamp::of_path(&path).unwrap());
    }

    #[test]
    fn test_file_stamps_cached_and_preserved() {
        let path = std::env::temp_dir().join(format!("lof_db_test_{}.sqlite3", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let db = Database::new(&path).unwrap();
        let fp = "/music/a.mp3";
        let stamp = FileStamp {
            size: 10,
            mtime: 20,
            lrc_size: None,
            lrc_mtime: None,
        };

        db.upsert_tracks(&[(sample_track(fp), stamp)]).unwrap();
        let stamps = db.get_file_stamps_under("/music").unwrap();
        assert_eq!(stamps.get(fp).unwrap().1, Some(stamp));

        // A plain upsert (no stamp) must keep the cached stamp.
        db.upsert_track(&sample_track(fp)).unwrap();
        let stamps = db.get_file_stamps_under("/music").unwrap();
        assert_eq!(stamps.get(fp).unwrap().1, Some(stamp));

        // Settings round-trip as JSON and patches merge per key.
        let mut patch = serde_json::Map::new();
        patch.insert("theme".into(), serde_json::json!("dark"));
        patch.insert("saveLrcFile".into(), serde_json::json!(false));
        db.save_settings(&patch).unwrap();
        let mut patch = serde_json::Map::new();
        patch.insert("theme".into(), serde_json::json!("light"));
        db.save_settings(&patch).unwrap();
        let settings = db.get_settings().unwrap();
        assert_eq!(settings.get("theme"), Some(&serde_json::json!("light")));
        assert!(!db.get_setting_bool("saveLrcFile", true));
        assert!(db.get_setting_bool("missingKey", true));

        db.clear_file_stamps().unwrap();
        let stamps = db.get_file_stamps_under("/music").unwrap();
        assert_eq!(stamps.get(fp).unwrap().1, None);

        // Reopening runs the migration check again without failing.
        drop(db);
        let db = Database::new(&path).unwrap();
        assert_eq!(db.get_all_tracks().unwrap().len(), 1);
        drop(db);
        let _ = std::fs::remove_file(&path);
    }
}
