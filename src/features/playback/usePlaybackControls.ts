import { useEffect, useRef } from "react";
import { useEvent } from "../../useEvent";
import { api } from "../../api";
import type { PlaybackStateModel } from "./usePlaybackState";
import type { ActiveTrackModel } from "./useActiveTrack";
import type { NotificationsModel } from "../../app/useNotifications";
import type { LibraryStateModel } from "../library/useLibraryState";
import type { LibraryViewModel } from "../library/useLibraryView";
import type { WindowLayoutModel } from "../layout/useWindowLayout";
import type { PreferencesModel } from "../settings/usePreferences";

export type QueueKind = "next" | "tail";

interface Inputs {
  playbackState: PlaybackStateModel;
  trackSelection: ActiveTrackModel;
  notifications: NotificationsModel;
  libraryState: LibraryStateModel;
  libraryView: LibraryViewModel;
  windowLayout: WindowLayoutModel;
  preferences: PreferencesModel;
}

export function usePlaybackControls({
  playbackState,
  trackSelection,
  notifications,
  libraryState,
  libraryView,
  windowLayout,
  preferences,
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
    upNext,
    setUpNext,
    queueTail,
    setQueueTail,
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

  // Drop queued tracks that left the library (deleted, hidden, other workspace) so the queue
  // and the up-next list shown from it stay index-aligned.
  useEffect(() => {
    const ids = new Set(tracks.map(track => track.id));
    const prune = (previous: number[]) => previous.every(id => ids.has(id)) ? previous : previous.filter(id => ids.has(id));
    setUpNext(prune);
    setQueueTail(prune);
  }, [tracks]);

  // While a queued track plays, the list position to continue from afterwards.
  const playingFromQueueRef = useRef(false);
  const queueAnchorRef = useRef<number | null>(null);

  const handlePlayTrack = useEvent(async (trackId: number) => {
    if (!tracks.some(track => track.id === trackId)) return;
    playingFromQueueRef.current = false;
    try {
      const state = await api.playTrack(trackId);
      setPlayback(state);
    } catch (err) {
      notify(`재생 실패: ${err}`);
    }
  });

  // Starting a track from the library also opens the playback screen (library mode, when enabled).
  const handlePlayFromLibrary = useEvent(async (trackId: number) => {
    if (windowLayout.appMode === "library" && preferences.openNowPlayingOnPlay) windowLayout.setNowPlayingOpen(true);
    await handlePlayTrack(trackId);
  });

  // "next": play right after the current track; "tail": after the current list runs out.
  const handleQueueTracks = useEvent((ids: number[], playNext: boolean) => {
    const valid = ids.filter(id => tracks.some(track => track.id === id));
    if (valid.length === 0) return;
    if (playNext) setUpNext(previous => [...valid, ...previous]);
    else setQueueTail(previous => [...previous, ...valid]);
    notify(playNext ? `${valid.length}곡을 다음에 재생합니다.` : `재생 대기열 끝에 ${valid.length}곡을 추가했습니다.`);
  });

  const setQueue = (kind: QueueKind) => kind === "next" ? setUpNext : setQueueTail;

  const handleRemoveFromQueue = useEvent((kind: QueueKind, index: number) => {
    setQueue(kind)(previous => previous.filter((_, i) => i !== index));
  });

  const handleClearQueue = useEvent((kind: QueueKind) => setQueue(kind)([]));

  const handleMoveInQueue = useEvent((kind: QueueKind, from: number, to: number) => {
    setQueue(kind)(previous => {
      if (from === to || from < 0 || from >= previous.length) return previous;
      const next = [...previous];
      const [moved] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
      return next;
    });
  });

  // Plays a queued track now (removing it from its queue) while remembering where the list was.
  const handlePlayQueued = useEvent(async (kind: QueueKind, index: number) => {
    const id = (kind === "next" ? upNext : queueTail)[index];
    if (id === undefined) return;
    const anchor = listPositionId();
    setQueue(kind)(previous => previous.filter((_, i) => i !== index));
    await handlePlayTrack(id);
    playingFromQueueRef.current = true;
    queueAnchorRef.current = anchor;
  });

  // The list track that "next"/"previous" count from: the anchor while a queued track plays.
  const listPositionId = () => playingFromQueueRef.current ? queueAnchorRef.current : playback.currentTrackId;

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
    const fromId = listPositionId();
    if (
      dispIds.length > 0 &&
      (fromId === null || dispIds.includes(fromId))
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

    if (upNext.length > 0) {
      await handlePlayQueued("next", 0);
      return;
    }

    const fromId = listPositionId();
    // Shuffle never reaches the end of the list, so tracks added to the queue's end go first there.
    if (shuffle && queueTail.length > 0) {
      await handlePlayQueued("tail", 0);
      return;
    }
    if (shuffle && q.length > 1) {
      const rest = q.filter((id) => id !== fromId);
      const pick = rest[Math.floor(Math.random() * rest.length)];
      await handlePlayTrack(pick);
      return;
    }

    const idx = fromId !== null ? q.indexOf(fromId) : -1;
    if (idx >= 0 && idx + 1 < q.length) {
      await handlePlayTrack(q[idx + 1]);
    } else if (queueTail.length > 0) {
      // End of the list: play what was added to the queue's end before wrapping or stopping.
      await handlePlayQueued("tail", 0);
    } else if (repeatMode === "all" || !fromAutoEnd) {
      await handlePlayTrack(q[0]);
    }
  };

  const handlePrevTrack = async () => {
    if (playback.positionSecs > 3.5) {
      await handleSeek(0);
      return;
    }
    // From a queued track, "previous" returns to the list track it interrupted.
    if (playingFromQueueRef.current && queueAnchorRef.current !== null) {
      await handlePlayTrack(queueAnchorRef.current);
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
    handlePlayFromLibrary,
    handleQueueTracks,
    handleRemoveFromQueue,
    handleClearQueue,
    handleMoveInQueue,
    handlePlayQueued,
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
