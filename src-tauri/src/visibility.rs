use crate::models::{HiddenItem, HiddenKind, Track};
use std::collections::HashSet;

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

pub fn within(path: &str, root: &str) -> bool {
    path == root
        || path.starts_with(&if root == "/" {
            root.to_string()
        } else {
            format!("{root}/")
        })
}

#[derive(Default)]
pub struct Visibility {
    tracks: HashSet<String>,
    folders: Vec<String>,
    albums: HashSet<String>,
    artists: HashSet<String>,
    playlists: HashSet<String>,
}

impl Visibility {
    pub fn new(items: &[HiddenItem]) -> Self {
        let mut rules = Self::default();
        for item in items {
            match item.kind {
                HiddenKind::Track => {
                    rules.tracks.insert(folder_key(&item.value));
                }
                HiddenKind::Folder => rules.folders.push(folder_key(&item.value)),
                HiddenKind::Album => {
                    rules.albums.insert(item.value.clone());
                }
                HiddenKind::Artist => {
                    rules.artists.insert(item.value.clone());
                }
                HiddenKind::Playlist => {
                    rules.playlists.insert(item.value.clone());
                }
            }
        }
        rules
    }

    pub fn allows_folder(&self, path: &str) -> bool {
        let key = folder_key(path);
        !self.folders.iter().any(|root| within(&key, root))
    }

    pub fn allows_track(&self, track: &Track) -> bool {
        !self.tracks.contains(&folder_key(&track.file_path))
            && self.allows_folder(&track.folder_path)
            && !self.albums.contains(if track.album.is_empty() {
                "Unknown Album"
            } else {
                &track.album
            })
            && !self.artists.contains(if track.artist.is_empty() {
                "Unknown Artist"
            } else {
                &track.artist
            })
            && !self.artists.contains(&track.album_artist)
    }

    pub fn allows_playlist(&self, id: i64) -> bool {
        !self.playlists.contains(&id.to_string())
    }
}
