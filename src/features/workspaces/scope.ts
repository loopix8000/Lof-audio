import type { Playlist, Track } from "../../types";

/** Windows drive and UNC paths are case insensitive; POSIX paths retain their case. */
export function normalizeFolderPath(path: string): string {
  const normalized = path.replace(/^\\\\\?\\UNC\\/i, "//")
    .replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/, "");
  const root = normalized || "/";
  return /^[a-z]:/i.test(root) || root.startsWith("//") ? root.toLowerCase() : root;
}

export function isFolderWithin(path: string, folder: string): boolean {
  const child = normalizeFolderPath(path);
  const root = normalizeFolderPath(folder);
  return child === root || child.startsWith(root === "/" ? "/" : `${root}/`);
}

export function scopeWorkspaceTracks(tracks: Track[], folders: string[], excludedTrackIds: number[] = []): Track[] {
  const roots = folders.map(normalizeFolderPath);
  const excluded = new Set(excludedTrackIds);
  return tracks.filter(track => {
    if (excluded.has(track.id)) return false;
    const path = normalizeFolderPath(track.folderPath);
    return roots.some(root => path === root || path.startsWith(root === "/" ? "/" : `${root}/`));
  });
}

export function scopeWorkspacePlaylists(playlists: Playlist[], workspaceId: number | null, tracks: Track[]): Playlist[] {
  const visible = new Set(tracks.map(track => track.id));
  return playlists.filter(playlist => playlist.workspaceId === workspaceId)
    .map(playlist => ({ ...playlist, trackIds: playlist.trackIds.filter(id => visible.has(id)) }));
}
