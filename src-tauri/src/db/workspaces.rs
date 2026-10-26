use super::Database;
use crate::models::{Workspace, WorkspaceState};
use rusqlite::{params, Connection, OptionalExtension};

/// Rebuild playlists with a workspace namespace while retaining IDs and track membership.
pub(super) fn migrate(conn: &mut Connection) -> Result<(), String> {
    let migrated = conn
        .prepare("SELECT 1 FROM pragma_table_info('playlists') WHERE name = 'workspace_id'")
        .and_then(|mut stmt| stmt.exists([]))
        .map_err(|e| e.to_string())?;
    if migrated {
        return Ok(());
    }
    // SQLite requires foreign keys off outside the transaction when replacing a referenced table.
    conn.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|e| e.to_string())?;
    let result = (|| {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(
            "CREATE TABLE workspaces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE
             );
             INSERT INTO workspaces (id, name) VALUES (1, '기본 워크스페이스');
             INSERT OR IGNORE INTO folders (path)
                SELECT DISTINCT folder_path FROM tracks WHERE folder_path != '';
             CREATE TABLE workspace_folders (
                workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
                PRIMARY KEY (workspace_id, folder_id)
             );
             INSERT INTO workspace_folders (workspace_id, folder_id) SELECT 1, id FROM folders;
             CREATE TABLE workspace_excluded_tracks (
                workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                PRIMARY KEY (workspace_id, track_id)
             );
             CREATE TABLE workspace_playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                UNIQUE (workspace_id, name)
             );
             INSERT INTO workspace_playlists (id, name, created_at, workspace_id)
                SELECT id, name, created_at, 1 FROM playlists;
             DROP TABLE playlists;
             ALTER TABLE workspace_playlists RENAME TO playlists;",
        )
        .map_err(|e| format!("워크스페이스 마이그레이션 실패: {e}"))?;
        tx.commit().map_err(|e| e.to_string())
    })();
    let restore = conn
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string());
    result.and(restore)
}

fn valid_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("워크스페이스 이름은 1~80자로 입력하세요.".into());
    }
    Ok(name)
}

fn require_workspace(conn: &Connection, id: i64) -> Result<(), String> {
    if !conn
        .prepare("SELECT 1 FROM workspaces WHERE id = ?1")
        .and_then(|mut stmt| stmt.exists([id]))
        .map_err(|e| e.to_string())?
    {
        return Err("워크스페이스를 찾을 수 없습니다.".into());
    }
    Ok(())
}

fn save_selection(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('activeWorkspaceId', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [id.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn bump_revision(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('workspaceRevision', '1')
        ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn folders(conn: &Connection, id: i64) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT f.path FROM folders f JOIN workspace_folders wf ON wf.folder_id = f.id
         WHERE wf.workspace_id = ?1 ORDER BY f.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn state(conn: &Connection) -> Result<WorkspaceState, String> {
    let mut stmt = conn
        .prepare("SELECT id, name FROM workspaces ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut workspaces = Vec::new();
    for row in rows {
        let (id, name) = row.map_err(|e| e.to_string())?;
        let mut excluded = conn.prepare("SELECT track_id FROM workspace_excluded_tracks WHERE workspace_id = ?1 ORDER BY track_id").map_err(|e| e.to_string())?;
        let excluded_track_ids = excluded
            .query_map([id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        workspaces.push(Workspace {
            id,
            name,
            folders: folders(conn, id)?,
            excluded_track_ids,
        });
    }
    let selected: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'activeWorkspaceId'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let active_workspace_id = selected
        .and_then(|v| v.parse::<i64>().ok())
        .filter(|id| workspaces.iter().any(|w| w.id == *id))
        .or_else(|| workspaces.first().map(|w| w.id))
        .ok_or_else(|| "워크스페이스가 없습니다.".to_string())?;
    Ok(WorkspaceState {
        workspaces,
        active_workspace_id,
        workspace_revision: conn
            .query_row(
                "SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'workspaceRevision'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(0),
    })
}

impl Database {
    pub fn get_workspace_state(&self) -> Result<WorkspaceState, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        state(&conn)
    }

    pub fn create_workspace(&self, name: &str) -> Result<WorkspaceState, String> {
        let name = valid_name(name)?;
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO workspaces (name) VALUES (?1)", [name])
            .map_err(|e| format!("워크스페이스 생성 실패 (이름 중복 확인): {e}"))?;
        save_selection(&tx, tx.last_insert_rowid())?;
        bump_revision(&tx)?;
        tx.commit().map_err(|e| e.to_string())?;
        state(&conn)
    }

    pub fn rename_workspace(&self, id: i64, name: &str) -> Result<WorkspaceState, String> {
        let name = valid_name(name)?;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        require_workspace(&conn, id)?;
        conn.execute(
            "UPDATE workspaces SET name = ?1 WHERE id = ?2",
            params![name, id],
        )
        .map_err(|e| format!("워크스페이스 이름 변경 실패 (이름 중복 확인): {e}"))?;
        bump_revision(&conn)?;
        state(&conn)
    }

    pub fn select_workspace(&self, id: i64) -> Result<WorkspaceState, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        require_workspace(&conn, id)?;
        save_selection(&conn, id)?;
        bump_revision(&conn)?;
        state(&conn)
    }

    pub fn delete_workspace(&self, id: i64) -> Result<WorkspaceState, String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        require_workspace(&tx, id)?;
        let count: i64 = tx
            .query_row("SELECT count(*) FROM workspaces", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if count <= 1 {
            return Err("마지막 워크스페이스는 삭제할 수 없습니다.".into());
        }
        tx.execute("DELETE FROM workspaces WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM folders WHERE id NOT IN (SELECT folder_id FROM workspace_folders)",
            [],
        )
        .map_err(|e| e.to_string())?;
        let next = state(&tx)?.active_workspace_id;
        save_selection(&tx, next)?;
        bump_revision(&tx)?;
        tx.commit().map_err(|e| e.to_string())?;
        state(&conn)
    }

    pub fn get_workspace_folders(&self, id: i64) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        require_workspace(&conn, id)?;
        folders(&conn, id)
    }

    pub fn add_workspace_folder(&self, id: i64, path: &str) -> Result<(), String> {
        if path.trim().is_empty() {
            return Err("폴더 경로가 비어 있습니다.".into());
        }
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        require_workspace(&tx, id)?;
        tx.execute("INSERT OR IGNORE INTO folders (path) VALUES (?1)", [path])
            .map_err(|e| e.to_string())?;
        let added = tx
            .execute(
                "INSERT OR IGNORE INTO workspace_folders (workspace_id, folder_id)
                    SELECT ?1, id FROM folders WHERE path = ?2",
                params![id, path],
            )
            .map_err(|e| e.to_string())?;
        if added > 0 {
            let (root, prefix) = super::folder_bounds(path);
            tx.execute(
                &format!(
                    "DELETE FROM workspace_excluded_tracks WHERE workspace_id = ?3
                AND track_id IN (SELECT id FROM tracks WHERE {})",
                    super::folder_predicate("folder_path")
                ),
                params![root, prefix, id],
            )
            .map_err(|e| e.to_string())?;
            bump_revision(&tx)?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn remove_workspace_folder(&self, id: i64, path: &str) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        require_workspace(&tx, id)?;
        tx.execute(
            "DELETE FROM workspace_folders WHERE workspace_id = ?1
                    AND folder_id IN (SELECT id FROM folders WHERE path = ?2)",
            params![id, path],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM folders WHERE id NOT IN (SELECT folder_id FROM workspace_folders)",
            [],
        )
        .map_err(|e| e.to_string())?;
        bump_revision(&tx)?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn clear_file_stamps_under(&self, path: &str) -> Result<(), String> {
        let (root, prefix) = super::folder_bounds(path);
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            &format!(
                "UPDATE tracks SET file_mtime = NULL, file_size = NULL WHERE {}",
                super::folder_predicate("folder_path")
            ),
            params![root, prefix],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn exclude_workspace_tracks(&self, id: i64, track_ids: &[i64]) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        require_workspace(&tx, id)?;
        for track_id in track_ids {
            tx.execute(
                "INSERT OR IGNORE INTO workspace_excluded_tracks (workspace_id, track_id)
                        SELECT ?1, id FROM tracks WHERE id = ?2",
                params![id, track_id],
            )
            .map_err(|e| e.to_string())?;
        }
        bump_revision(&tx)?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn include_workspace_tracks(&self, id: i64, track_ids: &[i64]) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        require_workspace(&tx, id)?;
        for track_id in track_ids {
            tx.execute(
                "DELETE FROM workspace_excluded_tracks WHERE workspace_id = ?1 AND track_id = ?2",
                params![id, track_id],
            )
            .map_err(|e| e.to_string())?;
        }
        bump_revision(&tx)?;
        tx.commit().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn add_track(db: &Database) -> i64 {
        let conn = db.conn.lock().unwrap();
        conn.execute("INSERT INTO tracks (file_path, file_name, folder_path, title, artist, album, album_artist, is_favorite, play_count, synced_lyrics, lyric_offset_ms)
            VALUES ('/music/song.flac', 'song.flac', '/music', 'Song', 'Artist', 'Album', 'Artist', 1, 7, '[00:01]Line', 250)", []).unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn legacy_migration_preserves_tracks_playlists_and_folder_membership() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("legacy.sqlite3");
        let db = Database::new(&path).unwrap();
        let track_id = add_track(&db);
        db.add_workspace_folder(1, "/music").unwrap();
        let playlist = db.create_playlist("Favorites", 1).unwrap();
        db.add_tracks_to_playlist(playlist.id, &[track_id]).unwrap();
        db.conn.lock().unwrap().execute_batch("PRAGMA foreign_keys = OFF;
            CREATE TABLE legacy_playlists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            INSERT INTO legacy_playlists SELECT id, name, created_at FROM playlists;
            DROP TABLE playlists;
            ALTER TABLE legacy_playlists RENAME TO playlists;
            DROP TABLE workspace_folders;
            DROP TABLE workspace_excluded_tracks;
            DROP TABLE workspaces;
            PRAGMA foreign_keys = ON;").unwrap();
        drop(db);

        let db = Database::new(&path).unwrap();
        let state = db.get_workspace_state().unwrap();
        assert_eq!(state.workspaces.len(), 1);
        assert_eq!(state.workspaces[0].folders, ["/music"]);
        let track = db.get_track_by_id(track_id).unwrap().unwrap();
        assert!(track.is_favorite);
        assert_eq!(track.play_count, 7);
        assert_eq!(track.lyric_offset_ms, 250);
        assert_eq!(track.synced_lyrics.as_deref(), Some("[00:01]Line"));
        let playlists = db.get_playlists().unwrap();
        assert_eq!(playlists[0].id, playlist.id);
        assert_eq!(playlists[0].workspace_id, 1);
        assert_eq!(playlists[0].track_ids, [track_id]);
        let foreign_key_errors: i64 = db
            .conn
            .lock()
            .unwrap()
            .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(foreign_key_errors, 0);

        db.remove_workspace_folder(1, "/music").unwrap();
        drop(db);
        let db = Database::new(&path).unwrap();
        assert!(db.get_workspace_state().unwrap().workspaces[0]
            .folders
            .is_empty());
        assert!(db.get_folders().unwrap().is_empty());
        assert_eq!(db.get_all_tracks().unwrap().len(), 1);
    }

    #[test]
    fn shared_folders_tracks_and_playlists_remain_isolated() {
        let db = Database::new(Path::new(":memory:")).unwrap();
        let track_id = add_track(&db);
        db.add_workspace_folder(1, "/music").unwrap();
        let second = db.create_workspace("Second").unwrap().active_workspace_id;
        db.add_workspace_folder(second, "/music").unwrap();
        db.add_workspace_folder(second, "/music/child").unwrap();
        db.create_playlist("Mix", 1).unwrap();
        let second_playlist = db.create_playlist("Mix", second).unwrap();
        db.add_tracks_to_playlist(second_playlist.id, &[track_id])
            .unwrap();
        db.exclude_workspace_tracks(1, &[track_id]).unwrap();
        let state = db.get_workspace_state().unwrap();
        assert_eq!(state.workspaces[0].excluded_track_ids, [track_id]);
        assert!(state.workspaces[1].excluded_track_ids.is_empty());
        db.remove_workspace_folder(1, "/music").unwrap();
        assert_eq!(db.get_workspace_folders(second).unwrap().len(), 2);
        assert!(db.has_folder("/music").unwrap());
        assert_eq!(db.get_all_tracks().unwrap().len(), 1);
        db.add_workspace_folder(1, "/music").unwrap();
        assert!(db.get_workspace_state().unwrap().workspaces[0]
            .excluded_track_ids
            .is_empty());
        db.delete_workspace(1).unwrap();
        let state = db.get_workspace_state().unwrap();
        assert_eq!(state.active_workspace_id, second);
        assert_eq!(db.get_playlists().unwrap().len(), 1);
        assert_eq!(db.get_playlists().unwrap()[0].track_ids, [track_id]);
        assert!(db.delete_workspace(second).is_err());
    }

    #[test]
    fn selection_and_names_survive_reopening_and_invalid_changes_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.sqlite3");
        let db = Database::new(&path).unwrap();
        let created = db.create_workspace("  Work  ").unwrap();
        let second = created.active_workspace_id;
        assert!(db.create_workspace("work").is_err());
        assert!(db.create_workspace(" ").is_err());
        assert!(db.select_workspace(999).is_err());
        assert!(db.add_workspace_folder(999, "/missing").is_err());
        db.rename_workspace(second, "Writing").unwrap();
        db.select_workspace(1).unwrap();
        db.select_workspace(second).unwrap();
        let revision = db.get_workspace_state().unwrap().workspace_revision;
        assert!(revision > created.workspace_revision);
        drop(db);
        let db = Database::new(&path).unwrap();
        let state = db.get_workspace_state().unwrap();
        assert_eq!(state.active_workspace_id, second);
        assert_eq!(state.workspaces[1].name, "Writing");
        assert_eq!(state.workspace_revision, revision);
        assert!(db.rename_workspace(second, "기본 워크스페이스").is_err());
    }
}
