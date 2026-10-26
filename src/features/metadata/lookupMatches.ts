import type { MusicBrainzCandidate, TrackMatchPreview } from "../../types";

interface LookupCallbacks {
  searchMetadata: (trackId: number) => Promise<MusicBrainzCandidate[]>;
  onPreview: (preview: TrackMatchPreview) => void;
  onMetadataComplete: () => void;
  loadLyrics: (preview: TrackMatchPreview) => Promise<void>;
  isCurrent: () => boolean;
}

/** Overlap two metadata requests with four independent lyrics workers. */
export async function lookupMatches(trackIds: number[], callbacks: LookupCallbacks) {
  const lyrics = Array.from({ length: 4 }, () => Promise.resolve());
  const errors: unknown[] = [];
  let nextMetadata = 0, nextLyrics = 0;
  const worker = async () => {
    while (nextMetadata < trackIds.length) {
      if (!callbacks.isCurrent()) return;
      const trackId = trackIds[nextMetadata++];
      const preview: TrackMatchPreview = {
        trackId, candidates: [], matchedSyncedLyrics: null, matchedPlainLyrics: null,
      };
      try {
        preview.candidates = await callbacks.searchMetadata(trackId);
      } catch (error) {
        preview.metadataError = String(error);
      }
      if (!callbacks.isCurrent()) return;
      callbacks.onPreview(preview);
      const slot = nextLyrics++ % lyrics.length;
      lyrics[slot] = lyrics[slot].then(async () => {
        if (callbacks.isCurrent()) await callbacks.loadLyrics(preview);
      }).catch(error => { errors.push(error); });
    }
  };
  await Promise.all([worker(), worker()]);
  if (callbacks.isCurrent()) callbacks.onMetadataComplete();
  await Promise.all(lyrics);
  if (errors.length) throw errors[0];
}
