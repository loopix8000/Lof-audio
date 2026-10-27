import { Track } from "./types";

/** A requested ID absent from the response was removed from the database. */
export function mergeTrackChanges(previous: Track[], requested: number[], changes: Track[]): Track[] {
  const ids = new Set(requested);
  const replacements = new Map(changes.map(track => [track.id, track]));
  const next: Track[] = [];
  for (const track of previous) {
    if (!ids.has(track.id)) next.push(track);
    else if (replacements.has(track.id)) {
      next.push(replacements.get(track.id)!);
      replacements.delete(track.id);
    }
  }
  next.push(...replacements.values());
  return next;
}

/**
 * When every track of the album/artist being viewed was renamed to one same name, that name
 * (so the view can follow the edit); null while the old name still has tracks or they went apart.
 */
export function followRenamedCollection(previous: Track[], next: Track[], field: "album" | "artist", value: string): string | null {
  if (next.some(track => track[field] === value)) return null;
  const members = new Set(previous.filter(track => track[field] === value).map(track => track.id));
  const names = new Set(next.filter(track => members.has(track.id)).map(track => track[field]));
  const [name] = names;
  return names.size === 1 && name ? name : null;
}
