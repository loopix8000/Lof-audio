import { useMemo } from "react";
import { getFallbackCoverUrl } from "../../utils/lrc";
import type { LibraryStateModel } from "../library/useLibraryState";
import type { PlaybackStateModel } from "./usePlaybackState";
import type { LibraryViewModel } from "../library/useLibraryView";

interface Inputs {
  libraryState: LibraryStateModel;
  playbackState: PlaybackStateModel;
  libraryView: LibraryViewModel;
}

export function useActiveTrack({
  libraryState,
  playbackState,
  libraryView,
}: Inputs) {
  const { tracks, selectedIds } = libraryState;
  const { playback } = playbackState;
  const { displayedTracks } = libraryView;
  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === playback.currentTrackId) || null,
    [tracks, playback.currentTrackId]
  );

  const primarySelectedTrack = useMemo(() => {
    if (selectedIds.length > 0) {
      const found = tracks.find((t) => t.id === selectedIds[0]);
      if (found) return found;
    }
    return currentTrack || displayedTracks[0] || tracks[0] || null;
  }, [tracks, displayedTracks, selectedIds, currentTrack]);

  const activeTrack = currentTrack || primarySelectedTrack;

  const activeCover =
    activeTrack?.coverDataUrl ||
    getFallbackCoverUrl(
      activeTrack?.title || "Lof",
      activeTrack?.artist || "Audio"
    );

  return {
    activeTrack,
    activeCover,
  };
}

export type ActiveTrackModel = ReturnType<typeof useActiveTrack>;
