import { useEffect } from "react";
import { useEvent } from "../../useEvent";
import { api } from "../../api";
import type { PlaybackStateModel } from "./usePlaybackState";
import type { ActiveTrackModel } from "./useActiveTrack";
import type { NotificationsModel } from "../../app/useNotifications";
import type { LibraryStateModel } from "../library/useLibraryState";
import type { LibraryViewModel } from "../library/useLibraryView";

interface Inputs {
  playbackState: PlaybackStateModel;
  trackSelection: ActiveTrackModel;
  notifications: NotificationsModel;
  libraryState: LibraryStateModel;
  libraryView: LibraryViewModel;
}

export function usePlaybackControls({
  playbackState,
  trackSelection,
  notifications,
  libraryState,
  libraryView,
}: Inputs) {
  const {
    playback,
    seekPreviewSecs,
    setPlayback,
    repeatMode,
    shuffle,
    isDraggingSeekRef,
    seekGuardUntilRef,
    setSeekPreviewSecs,
    volumeGuardUntilRef,
    setIsMuted,
    setPrevVolume,
    isMuted,
    prevVolume,
  } = playbackState;
  const { activeTrack } = trackSelection;
  const { notify } = notifications;
  const { selectedIds, tracks } = libraryState;
  const { displayedTracks } = libraryView;
  useEffect(() => {
    if (playback.isEnded && playback.currentTrackId !== null) {
      handleNextTrack(true);
    }
  }, [playback.isEnded, playback.currentTrackId]);

  const effectivePositionSecs =
    seekPreviewSecs !== null ? seekPreviewSecs : playback.positionSecs;

  const effectiveDurationSecs =
    playback.durationSecs || activeTrack?.durationSecs || 0;

  const handlePlayTrack = useEvent(async (trackId: number) => {
    if (!tracks.some(track => track.id === trackId)) return;
    try {
      const state = await api.playTrack(trackId);
      setPlayback(state);
    } catch (err) {
      notify(`재생 실패: ${err}`);
    }
  });

  const handleTogglePlay = async () => {
    try {
      if (playback.currentTrackId === null || !tracks.some(track => track.id === playback.currentTrackId)) {
        const first = selectedIds[0] || displayedTracks[0]?.id || tracks[0]?.id;
        if (first) await handlePlayTrack(first);
        return;
      }
      if (playback.isPlaying) {
        const state = await api.pausePlayback();
        setPlayback(state);
      } else {
        if (
          playback.durationSecs > 0 &&
          playback.positionSecs >= playback.durationSecs - 0.25
        ) {
          await handlePlayTrack(playback.currentTrackId);
        } else {
          const state = await api.resumePlayback();
          setPlayback(state);
        }
      }
    } catch (err) {
      notify(`재생 제어 오류: ${err}`);
    }
  };

  const getActiveQueueIds = (): number[] => {
    const dispIds = displayedTracks.map((t) => t.id);
    if (
      dispIds.length > 0 &&
      (playback.currentTrackId === null ||
        dispIds.includes(playback.currentTrackId))
    ) {
      return dispIds;
    }
    return tracks.map((t) => t.id);
  };

  const handleNextTrack = async (fromAutoEnd = false) => {
    if (fromAutoEnd && !tracks.some(track => track.id === playback.currentTrackId)) return;
    const q = getActiveQueueIds();
    if (q.length === 0) return;

    if (fromAutoEnd && repeatMode === "one" && playback.currentTrackId !== null) {
      await handlePlayTrack(playback.currentTrackId);
      return;
    }

    if (shuffle && q.length > 1) {
      const rest = q.filter((id) => id !== playback.currentTrackId);
      const pick = rest[Math.floor(Math.random() * rest.length)];
      await handlePlayTrack(pick);
      return;
    }

    const idx =
      playback.currentTrackId !== null ? q.indexOf(playback.currentTrackId) : -1;
    if (idx >= 0 && idx + 1 < q.length) {
      await handlePlayTrack(q[idx + 1]);
    } else if (repeatMode === "all" || !fromAutoEnd) {
      await handlePlayTrack(q[0]);
    }
  };

  const handlePrevTrack = async () => {
    if (playback.positionSecs > 3.5) {
      await handleSeek(0);
      return;
    }
    const q = getActiveQueueIds();
    if (q.length === 0) return;
    const idx =
      playback.currentTrackId !== null ? q.indexOf(playback.currentTrackId) : 0;
    const prevIdx = idx > 0 ? idx - 1 : q.length - 1;
    await handlePlayTrack(q[prevIdx]);
  };

  const handleSeekPreview = (posSecs: number) => {
    isDraggingSeekRef.current = true;
    seekGuardUntilRef.current = Date.now() + 800;
    setSeekPreviewSecs(posSecs);
  };

  const handleSeek = async (posSecs: number) => {
    const clampedPos = Math.max(
      0,
      Math.min(effectiveDurationSecs || posSecs, posSecs)
    );
    isDraggingSeekRef.current = false;
    seekGuardUntilRef.current = Date.now() + 700;
    // Optimistically update playback.positionSecs in the same synchronous batch as clearing seekPreviewSecs
    // so the slider NEVER snaps backward to the old position while awaiting IPC!
    setPlayback((prev) => ({ ...prev, positionSecs: clampedPos }));
    setSeekPreviewSecs(null);

    try {
      if (playback.currentTrackId === null && activeTrack) {
        await api.playTrack(activeTrack.id);
      }
      const state = await api.seekPlayback(clampedPos);
      seekGuardUntilRef.current = Date.now() + 250;
      setPlayback((prev) => ({
        ...state,
        positionSecs: clampedPos,
        volume:
          Date.now() < volumeGuardUntilRef.current ? prev.volume : state.volume,
      }));
    } catch {
      // ignore
    }
  };

  const handleSetVolume = async (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    volumeGuardUntilRef.current = Date.now() + 500;
    setIsMuted(clamped === 0);
    if (clamped > 0) setPrevVolume(clamped);
    setPlayback((prev) => ({ ...prev, volume: clamped }));
    try {
      await api.setVolume(clamped);
    } catch {
      // ignore
    }
  };

  const handleToggleMute = async () => {
    if (isMuted || playback.volume === 0) {
      setIsMuted(false);
      const state = await api.setVolume(prevVolume || 0.85);
      setPlayback(state);
    } else {
      setPrevVolume(playback.volume);
      setIsMuted(true);
      const state = await api.setVolume(0);
      setPlayback(state);
    }
  };

  const handleCycleSpeed = async () => {
    const speeds = [0.75, 1.0, 1.25, 1.5];
    const idx = speeds.findIndex((s) => Math.abs(s - playback.speed) < 0.05);
    const next = speeds[(idx + 1) % speeds.length];
    const state = await api.setSpeed(next);
    setPlayback(state);
    notify(`재생 배속: ${next}x`);
  };

  return {
    effectivePositionSecs,
    handleTogglePlay,
    handlePlayTrack,
    handleSeek,
    handlePrevTrack,
    handleNextTrack,
    effectiveDurationSecs,
    handleSeekPreview,
    handleCycleSpeed,
    handleToggleMute,
    handleSetVolume,
  };
}

export type PlaybackControlsModel = ReturnType<typeof usePlaybackControls>;
