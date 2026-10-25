use crate::models::{Playlist, Track};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let conn = Connection::open(db_path).map_err(|e| format!("DB 열기 실패: {}", e))?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
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

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id INTEGER NOT NULL,
                track_id INTEGER NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (playlist_id, track_id),
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            DELETE FROM tracks WHERE folder_path LIKE '%demo_music%';
            DELETE FROM folders WHERE path LIKE '%demo_music%';
            INSERT OR IGNORE INTO folders (path) SELECT DISTINCT folder_path FROM tracks WHERE folder_path != '';
            ",
        )
        .map_err(|e| format!("테이블 초기화 실패: {}", e))?;
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
        for r in rows.flatten() {
            out.push(r);
        }
        Ok(out)
    }

    pub fn remove_folder(&self, folder_path: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM folders WHERE path = ?1", params![folder_path])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM tracks WHERE folder_path LIKE ?1",
            params![format!("{}%", folder_path)],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn upsert_track(&self, track: &Track) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let existing: Option<(i64, Option<String>, Option<String>, Option<String>, i64, bool, u32)> = conn
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

        if let Some((
            id,
            old_cover,
            old_synced,
            old_plain,
            old_offset,
            is_fav,
            play_cnt,
        )) = existing
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
                    play_count = ?20
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
                    id
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
                    mbid_recording, mbid_release, is_favorite, play_count
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                    ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                    ?15, ?16, ?17, ?18, ?19,
                    ?20, ?21, ?22, ?23
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
                    track.play_count
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    }

    pub fn get_all_tracks(&self) -> Result<Vec<Track>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT
                    id, file_path, file_name, folder_path, title, artist, album, album_artist,
                    track_number, year, genre, duration_secs, bitrate, sample_rate, channels,
                    format, cover_data_url, synced_lyrics, plain_lyrics, lyric_offset_ms,
                    mbid_recording, mbid_release, is_favorite, play_count
                FROM tracks
                ORDER BY album ASC, COALESCE(track_number, 9999) ASC, file_name ASC, title ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
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
            })
            .map_err(|e| e.to_string())?;

        let mut tracks = Vec::new();
        for r in rows.flatten() {
            tracks.push(r);
        }
        Ok(tracks)
    }

    pub fn get_track_by_id(&self, track_id: i64) -> Result<Option<Track>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let track = conn
            .query_row(
                "SELECT
                    id, file_path, file_name, folder_path, title, artist, album, album_artist,
                    track_number, year, genre, duration_secs, bitrate, sample_rate, channels,
                    format, cover_data_url, synced_lyrics, plain_lyrics, lyric_offset_ms,
                    mbid_recording, mbid_release, is_favorite, play_count
                FROM tracks WHERE id = ?1",
                params![track_id],
                |row| {
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
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(track)
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
                mbid_release = ?13
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
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        for id in track_ids {
            conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn create_playlist(&self, name: &str) -> Result<Playlist, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO playlists (name) VALUES (?1)",
            params![name.trim()],
        )
        .map_err(|e| format!("플레이리스트 생성 실패: {}", e))?;
        let id = conn.last_insert_rowid();
        Ok(Playlist {
            id,
            name: name.trim().to_string(),
            track_ids: Vec::new(),
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

    pub fn add_tracks_to_playlist(&self, playlist_id: i64, track_ids: &[i64]) -> Result<(), String> {
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

    pub fn remove_track_from_playlist(&self, playlist_id: i64, track_id: i64) -> Result<(), String> {
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
            .prepare("SELECT id, name FROM playlists ORDER BY id ASC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;

        let mut playlists = Vec::new();
        for item in rows.flatten() {
            let (pid, name) = item;
            let mut t_stmt = conn
                .prepare("SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position ASC")
                .map_err(|e| e.to_string())?;
            let t_rows = t_stmt
                .query_map(params![pid], |r| r.get::<_, i64>(0))
                .map_err(|e| e.to_string())?;
            let track_ids: Vec<i64> = t_rows.flatten().collect();
            playlists.push(Playlist {
                id: pid,
                name,
                track_ids,
            });
        }
        Ok(playlists)
    }
}
