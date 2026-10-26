import type { LrcLibTrack, Track } from "../../types";

export interface LyricsEntry {
  query: string;
  draft: string;
  results: LrcLibTrack[];
  dirty: boolean;
  status: string;
}

export function createLyricsEntries(tracks: Track[]): Record<number, LyricsEntry> {
  return Object.fromEntries(tracks.map(track => [track.id, {
    query: track.artist && track.artist !== "Unknown Artist"
      ? `${track.artist} ${track.title}` : track.title,
    draft: track.syncedLyrics || track.plainLyrics || "",
    results: [],
    dirty: false,
    status: "",
  }]));
}

export async function lookupLyricsBatch(trackIds: number[], callbacks: {
  isCurrent: () => boolean;
  lookup: (trackId: number) => Promise<LrcLibTrack | null>;
  onResult: (trackId: number, lyrics: LrcLibTrack | null) => void;
  onError: (trackId: number, error: unknown) => void;
}) {
  let next = 0;
  const worker = async () => {
    while (callbacks.isCurrent() && next < trackIds.length) {
      const trackId = trackIds[next++];
      try {
        const lyrics = await callbacks.lookup(trackId);
        if (callbacks.isCurrent()) callbacks.onResult(trackId, lyrics);
      } catch (error) {
        if (callbacks.isCurrent()) callbacks.onError(trackId, error);
      }
    }
  };
  await Promise.all([worker(), worker()]);
}
