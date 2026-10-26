import type { HiddenItem, Track } from "../../types";
import { isFolderWithin, normalizeFolderPath } from "../workspaces/scope";

export function isTrackHidden(track: Track, items: HiddenItem[]): boolean {
  return items.some(item => {
    switch (item.kind) {
      case "track": return normalizeFolderPath(track.filePath) === normalizeFolderPath(item.value);
      case "folder": return isFolderWithin(track.folderPath, item.value);
      case "album": return (track.album || "Unknown Album") === item.value;
      case "artist": return (track.artist || "Unknown Artist") === item.value || track.albumArtist === item.value;
      default: return false;
    }
  });
}
