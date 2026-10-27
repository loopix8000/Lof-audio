import { useState, useRef, useEffect } from "react";
import { PlaybackState, RepeatMode } from "../../types";
import { api } from "../../api";

export function usePlaybackState() {
  const [playback, setPlayback] = useState<PlaybackState>({
    currentTrackId: null,
    filePath: null,
    isPlaying: false,
    positionSecs: 0,
    durationSecs: 0,
    volume: 0.85,
    speed: 1.0,
    isEnded: false,
  });

  const [seekPreviewSecs, setSeekPreviewSecs] = useState<number | null>(null);

  const isDraggingSeekRef = useRef(false);

  const seekGuardUntilRef = useRef(0);

  const volumeGuardUntilRef = useRef(0);

  const [shuffle, setShuffle] = useState(false);

  const [repeatMode, setRepeatMode] = useState<RepeatMode>("all");

  const [isMuted, setIsMuted] = useState(false);

  const [prevVolume, setPrevVolume] = useState(0.85);

  // User-queued tracks (duplicates allowed): `upNext` plays right after the current track,
  // `queueTail` after the current list runs out ("재생 대기열에 추가").
  const [upNext, setUpNext] = useState<number[]>([]);
  const [queueTail, setQueueTail] = useState<number[]>([]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let playing = false;
      try {
        if (!isDraggingSeekRef.current) {
          const state = await api.getPlaybackState();
          if (disposed) return;
          playing = state.isPlaying;
          if (!isDraggingSeekRef.current) {
            const now = Date.now();
            setPlayback(previous => {
              const next = { ...state, positionSecs: now < seekGuardUntilRef.current ? previous.positionSecs : state.positionSecs, volume: now < volumeGuardUntilRef.current ? previous.volume : state.volume };
              return (Object.keys(next) as (keyof PlaybackState)[]).every(key => next[key] === previous[key]) ? previous : next;
            });
          }
        }
      } catch { /* A later poll can recover after a transient IPC error. */ }
      if (!disposed) timer = setTimeout(poll, playing ? 160 : 500);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);

  return {
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
    setShuffle,
    setRepeatMode,
    upNext,
    setUpNext,
    queueTail,
    setQueueTail,
  };
}

export type PlaybackStateModel = ReturnType<typeof usePlaybackState>;
