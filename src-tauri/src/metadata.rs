use crate::{db::Database, models::Track, tags};
use sha2::{Digest, Sha256};
use std::sync::Mutex;

pub fn revision(track: &Track) -> String {
    let mut value = serde_json::to_value(track).expect("Track is serializable");
    // Playing and favoriting a track do not conflict with editing its tags or lyrics.
    value.as_object_mut().unwrap().remove("playCount");
    value.as_object_mut().unwrap().remove("isFavorite");
    let stamp = crate::db::FileStamp::of_path(std::path::Path::new(&track.file_path))
        .ok()
        .map(|s| (s.size, s.mtime, s.lrc_size, s.lrc_mtime));
    hex::encode(Sha256::digest(
        serde_json::to_vec(&(value, stamp)).expect("Metadata is serializable"),
    ))
}

/// Reload under the indexing lock, then commit the database only after files were saved.
pub fn edit_track(
    db: &Database,
    lock: &Mutex<()>,
    id: i64,
    save_lrc: bool,
    edit: impl FnOnce(&mut Track),
) -> Result<Track, String> {
    edit_track_checked(db, lock, id, None, save_lrc, |track| {
        edit(track);
        Ok(())
    })
}

pub fn edit_track_checked(
    db: &Database,
    lock: &Mutex<()>,
    id: i64,
    expected_revision: Option<&str>,
    save_lrc: bool,
    edit: impl FnOnce(&mut Track) -> Result<(), String>,
) -> Result<Track, String> {
    edit_checked((db, lock), id, expected_revision, save_lrc, edit, |_| {
        db.get_public_track(id)
    })
}

pub fn edit_track_checked_with_revision(
    db: &Database,
    lock: &Mutex<()>,
    id: i64,
    expected_revision: Option<&str>,
    save_lrc: bool,
    edit: impl FnOnce(&mut Track) -> Result<(), String>,
) -> Result<(Track, String), String> {
    edit_checked((db, lock), id, expected_revision, save_lrc, edit, |track| {
        Ok((db.get_public_track(id)?, revision(track)))
    })
}

fn edit_checked<T>(
    store: (&Database, &Mutex<()>),
    id: i64,
    expected_revision: Option<&str>,
    save_lrc: bool,
    edit: impl FnOnce(&mut Track) -> Result<(), String>,
    after: impl FnOnce(&Track) -> Result<T, String>,
) -> Result<T, String> {
    let (db, lock) = store;
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    let mut track = db
        .get_track_by_id(id)?
        .ok_or_else(|| "트랙을 찾을 수 없습니다.".to_string())?;
    if expected_revision.is_some_and(|expected| expected != revision(&track)) {
        return Err("CONFLICT: 트랙이 변경되었습니다. 다시 읽고 요청한 변경만 적용하세요.".into());
    }
    edit(&mut track)?;
    tags::write_track(&track, save_lrc)?;
    db.update_track_metadata(&track)?;
    after(&track)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::Path};

    #[test]
    fn failed_file_save_keeps_database_metadata_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tone.wav");
        fs::copy(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone.wav"),
            &path,
        )
        .unwrap();
        let db = Database::new(Path::new(":memory:")).unwrap();
        let original = tags::read_track_from_path(&path).unwrap();
        let id = db.upsert_track(&original).unwrap();
        let permissions = fs::metadata(&path).unwrap().permissions();
        let mut readonly = permissions.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&path, readonly).unwrap();
        let result = edit_track(&db, &Mutex::new(()), id, false, |t| {
            t.title = "new title".into()
        });
        fs::set_permissions(&path, permissions).unwrap();
        assert!(result.is_err());
        assert_eq!(
            db.get_track_by_id(id).unwrap().unwrap().title,
            original.title
        );
    }

    #[test]
    fn delayed_metadata_apply_preserves_an_offset_edited_during_lookup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tone.wav");
        fs::copy(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone.wav"),
            &path,
        )
        .unwrap();
        let db = Database::new(Path::new(":memory:")).unwrap();
        let id = db
            .upsert_track(&tags::read_track_from_path(&path).unwrap())
            .unwrap();
        let stale_lookup = db.get_track_by_id(id).unwrap().unwrap();
        db.set_lyric_offset(id, 500).unwrap();
        let current = edit_track(&db, &Mutex::new(()), id, false, |t| {
            t.title = "downloaded title".into()
        })
        .unwrap();
        assert_eq!(stale_lookup.lyric_offset_ms, 0);
        assert_eq!(current.lyric_offset_ms, 500);
        assert_eq!(current.title, "downloaded title");
    }
}
