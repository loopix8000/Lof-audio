use crate::db::FileStamp;
use crate::models::Track;
use crate::{is_supported_audio, tags, AppState};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use walkdir::WalkDir;

/// Number of tag reads committed to SQLite per transaction.
const BATCH_SIZE: usize = 200;
/// Minimum gap between `library-changed` events while a scan is running.
const CHANGE_EMIT_INTERVAL: Duration = Duration::from_millis(1500);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub folder: String,
    pub processed: usize,
    pub total: usize,
    pub added_or_updated: usize,
    pub removed: usize,
    pub done: bool,
}

/// Serializes folder scans onto one background worker so the UI never waits on indexing.
pub struct ScanQueue {
    tx: Mutex<Sender<String>>,
    pending: Mutex<HashSet<String>>,
    current: Mutex<Option<ScanProgress>>,
}

impl ScanQueue {
    pub fn new() -> (Self, Receiver<String>) {
        let (tx, rx) = mpsc::channel();
        let queue = Self {
            tx: Mutex::new(tx),
            pending: Mutex::new(HashSet::new()),
            current: Mutex::new(None),
        };
        (queue, rx)
    }

    /// Queues a folder for an incremental rescan; duplicate requests collapse into one.
    pub fn enqueue(&self, folder: &str) {
        let mut pending = self.pending.lock().unwrap();
        if pending.insert(folder.to_string()) {
            let _ = self.tx.lock().unwrap().send(folder.to_string());
        }
    }

    pub fn status(&self) -> Option<ScanProgress> {
        self.current.lock().unwrap().clone()
    }

    pub fn pending_folders(&self) -> Vec<String> {
        let mut folders: Vec<_> = self.pending.lock().unwrap().iter().cloned().collect();
        folders.sort();
        folders
    }
}

pub fn spawn_worker(app: AppHandle, rx: Receiver<String>) {
    std::thread::spawn(move || {
        for folder in rx {
            let state = app.state::<AppState>();
            state.scanner.pending.lock().unwrap().remove(&folder);
            if let Err(e) = scan_folder(&app, &state, &folder) {
                eprintln!("폴더 색인 실패 ({}): {}", folder, e);
            }
            *state.scanner.current.lock().unwrap() = None;
        }
    });
}

fn report(app: &AppHandle, state: &AppState, progress: &ScanProgress) {
    *state.scanner.current.lock().unwrap() = Some(progress.clone());
    let _ = app.emit("library-scan-progress", progress);
}

fn scan_folder(app: &AppHandle, state: &AppState, folder: &str) -> Result<(), String> {
    let root = Path::new(folder);
    let mut progress = ScanProgress {
        folder: folder.to_string(),
        processed: 0,
        total: 0,
        added_or_updated: 0,
        removed: 0,
        done: false,
    };

    // An unplugged drive or missing folder must not wipe the cached index.
    if !root.is_dir() {
        progress.done = true;
        report(app, state, &progress);
        return Ok(());
    }

    let mut walk_failed = false;
    let mut files: Vec<(PathBuf, FileStamp)> = Vec::new();
    for entry in WalkDir::new(root).follow_links(true) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => {
                walk_failed = true;
                continue;
            }
        };
        let p = entry.path();
        if !entry.file_type().is_file() || !is_supported_audio(p) {
            continue;
        }
        match FileStamp::of_path(p) {
            Ok(stamp) => files.push((p.to_path_buf(), stamp)),
            Err(_) => walk_failed = true,
        }
    }

    let cached = state.db.get_file_stamps_under(folder)?;
    let seen: HashSet<String> = files
        .iter()
        .map(|(p, _)| p.to_string_lossy().to_string())
        .collect();
    let changed: Vec<(PathBuf, FileStamp)> = files
        .into_iter()
        .filter(|(p, stamp)| {
            let key = p.to_string_lossy();
            cached.get(key.as_ref()).and_then(|(_, s)| *s) != Some(*stamp)
        })
        .collect();

    progress.total = changed.len();
    report(app, state, &progress);

    let mut last_emit = Instant::now();
    let mut changed_ids = Vec::new();
    for chunk in changed.chunks(BATCH_SIZE) {
        let _guard = state.metadata_lock.lock().map_err(|e| e.to_string())?;
        let items = read_tags_parallel(chunk);
        // The folder may have been removed by the user mid-scan.
        if !state.db.has_folder(folder)? {
            progress.done = true;
            report(app, state, &progress);
            return Ok(());
        }
        changed_ids.extend(state.db.upsert_tracks(&items)?);
        progress.processed += chunk.len();
        progress.added_or_updated += items.len();
        report(app, state, &progress);
        if !items.is_empty() && last_emit.elapsed() >= CHANGE_EMIT_INTERVAL {
            let _ = app.emit("library-changed", std::mem::take(&mut changed_ids));
            last_emit = Instant::now();
        }
    }

    // Only prune when the walk saw everything; a permission error would look like deletions.
    if !walk_failed {
        let stale: Vec<i64> = cached
            .iter()
            .filter(|(path, _)| Path::new(path.as_str()).starts_with(root) && !seen.contains(*path))
            .map(|(_, (id, _))| *id)
            .collect();
        if !stale.is_empty() {
            state.db.delete_tracks(&stale)?;
            progress.removed = stale.len();
            changed_ids.extend(stale);
        }
    }

    progress.done = true;
    report(app, state, &progress);
    if !changed_ids.is_empty() {
        let _ = app.emit("library-changed", changed_ids);
    }
    Ok(())
}

/// Reads tags for a chunk of files across the available CPU cores.
fn read_tags_parallel(chunk: &[(PathBuf, FileStamp)]) -> Vec<(Track, FileStamp)> {
    let workers = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .min(8);
    let per_worker = chunk.len().div_ceil(workers).max(1);
    std::thread::scope(|s| {
        let handles: Vec<_> = chunk
            .chunks(per_worker)
            .map(|part| {
                s.spawn(move || {
                    part.iter()
                        .filter_map(|(p, stamp)| tags::read_track_from_path(p).map(|t| (t, *stamp)))
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|h| h.join().unwrap_or_default())
            .collect()
    })
}
