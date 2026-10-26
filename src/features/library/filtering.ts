import { Track } from "../../types";

export const matchesTrackQuery = (t: Track, query: string) =>
  [t.title, t.artist, t.album, t.genre, t.fileName].some(value => value.toLowerCase().includes(query));

export const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
