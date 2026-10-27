import { useEffect, useRef } from "react";
import { api } from "../../api";
import { LAST_PLAYBACK_KEY, normalizeLastPlayback } from "../../settings";
import type { PlaybackStateModel } from "./usePlaybackState";
import type { LibraryStateModel } from "../library/useLibraryState";
import type { PreferencesModel } from "../settings/usePreferences";

interface Inputs {
  playbackState: PlaybackStateModel;
  libraryState: LibraryStateModel;
  preferences: PreferencesModel;
}

// How often the position is written while playing; resuming on restart lands at most this far back.
const SAVE_INTERVAL_MS = 5000;

/** Remembers the current track and position, and loads it (paused) on the next launch when enabled. */
export function useResumePlayback({ playbackState, libraryState, preferences }: Inputs) {
  const { playback, setPlayback } = playbackState;
  const { tracks } = libraryState;
  const { settingsLoaded, resumeOnStartup, resumePosition } = preferences;

  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const save = () => {
    const { currentTrackId, positionSecs } = playbackRef.current;
    if (currentTrackId === null) return;
    api.saveSettings({ [LAST_PLAYBACK_KEY]: { trackId: currentTrackId, positionSecs } }).catch(() => { });
  };

  // Restore once, after both the settings (for the option) and the library (to find the track) have loaded.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !settingsLoaded || tracks.length === 0) return;
    restoredRef.current = true;
    // The backend outlives a webview reload; never interrupt something it is already playing.
    if (!resumeOnStartup || playbackRef.current.currentTrackId !== null) return;
    void (async () => {
      try {
        const last = normalizeLastPlayback((await api.getSettings())[LAST_PLAYBACK_KEY]);
        const track = last && tracks.find(t => t.id === last.trackId);
        if (!last || !track) return;
        // The track comes back paused; play starts only when the user asks for it.
        let state = await api.loadTrack(track.id);
        // Near the end, start the track over rather than resuming into its last second.
        const beforeEnd = track.durationSecs <= 0 || last.positionSecs < track.durationSecs - 2;
        if (resumePosition === "last" && last.positionSecs > 1 && beforeEnd) {
          state = await api.seekPlayback(last.positionSecs);
        }
        setPlayback(state);
      } catch { /* Missing file or IPC error: just start idle, as without the option. */ }
    })();
  }, [settingsLoaded, tracks, resumeOnStartup]);

  // Save right away on track change and pause/resume, and periodically while playing.
  useEffect(() => { save(); }, [playback.currentTrackId, playback.isPlaying]);
  useEffect(() => {
    if (!playback.isPlaying) return;
    const timer = setInterval(save, SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playback.isPlaying]);
}
