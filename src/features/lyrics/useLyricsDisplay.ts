import { useRef, useMemo, useEffect } from "react";
import { buildDisplayLyricLines, findActiveLyricIndex } from "../../utils/lrc";
import { api } from "../../api";
import type { ActiveTrackModel } from "../playback/useActiveTrack";
import type { PlaybackControlsModel } from "../playback/usePlaybackControls";
import type { WindowLayoutModel } from "../layout/useWindowLayout";
import type { LibraryStateModel } from "../library/useLibraryState";

interface Inputs {
  trackSelection: ActiveTrackModel;
  playbackControls: PlaybackControlsModel;
  windowLayout: WindowLayoutModel;
  libraryState: LibraryStateModel;
}

export function useLyricsDisplay({
  trackSelection,
  playbackControls,
  windowLayout,
  libraryState,
}: Inputs) {
  const { activeTrack } = trackSelection;
  const { effectivePositionSecs } = playbackControls;
  const { appMode, showRightLyricsInLib, nowPlayingOpen } = windowLayout;
  const { setTracks } = libraryState;
  const lyricsBoxRef = useRef<HTMLDivElement | null>(null);

  const playerLyricsRef = useRef<HTMLDivElement | null>(null);

  const npLyricsRef = useRef<HTMLDivElement | null>(null);

  const lyricLines = useMemo(() => {
    if (!activeTrack) return [];
    return buildDisplayLyricLines(
      activeTrack.syncedLyrics,
      activeTrack.plainLyrics,
      activeTrack.lyricOffsetMs,
      activeTrack.durationSecs
    );
  }, [activeTrack]);

  const activeLyricIdx = useMemo(
    () => findActiveLyricIndex(lyricLines, effectivePositionSecs),
    [lyricLines, effectivePositionSecs]
  );

  useEffect(() => {
    if (activeLyricIdx < 0) return;
    const scrollTarget = (box: HTMLDivElement | null) => {
      if (!box) return;
      const el = box.querySelector(
        `[data-lrc-idx="${activeLyricIdx}"]`
      ) as HTMLElement | null;
      if (el) {
        const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
        box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    };
    scrollTarget(lyricsBoxRef.current);
    scrollTarget(playerLyricsRef.current);
  }, [activeLyricIdx, activeTrack?.id, appMode, showRightLyricsInLib, nowPlayingOpen]);

  const handleOffsetChange = async (deltaMs: number) => {
    if (!activeTrack) return;
    const next = deltaMs === 0 ? 0 : activeTrack.lyricOffsetMs + deltaMs;
    try {
      const updated = await api.updateLyricOffset(activeTrack.id, next);
      setTracks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
    } catch {
      // ignore
    }
  };

  return {
    lyricLines,
    handleOffsetChange,
    npLyricsRef,
    activeLyricIdx,
    lyricsBoxRef,
    playerLyricsRef,
  };
}

export type LyricsDisplayModel = ReturnType<typeof useLyricsDisplay>;
