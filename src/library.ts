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
