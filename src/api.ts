import { invoke } from "@tauri-apps/api/core";
import {
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ConfirmTrackMatchItem,
  FilenamePatternInput,
  LibrarySnapshot,
  LrcLibTrack,
  MusicBrainzCandidate,
  PlaybackState,
  Playlist,
  TagUpdateInput,
  Track,
  TrackMatchPreview,
  UIMode,
} from "./types";

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function startWindowDrag(): Promise<void> {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().startDragging();
  } catch {
    // ignore
  }
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().close();
}

interface SavedWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

let savedDesktopBounds: SavedWindowBounds | null = null;
let savedPlayerBounds: SavedWindowBounds | null = null;

function loadBounds(key: string): SavedWindowBounds | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.x === "number" &&
      typeof parsed?.y === "number" &&
      typeof parsed?.width === "number" &&
      typeof parsed?.height === "number"
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveBounds(key: string, bounds: SavedWindowBounds): void {
  try {
    localStorage.setItem(key, JSON.stringify(bounds));
  } catch {
    // ignore
  }
}

export async function setWindowMode(
  mode: UIMode,
  alwaysOnTop = false
): Promise<void> {
  if (!isTauri()) return;
  try {
    const win = getCurrentWindow();
    const isMax = await win.isMaximized();

    if (mode === "player") {
      // 1. Save current Library ("desktop") window position, size, and maximized state
      if (isMax) {
        const prev = savedDesktopBounds || loadBounds("lof.bounds.desktop");
        if (prev) {
          savedDesktopBounds = { ...prev, isMaximized: true };
          saveBounds("lof.bounds.desktop", savedDesktopBounds);
        } else {
          savedDesktopBounds = {
            x: 100,
            y: 100,
            width: 1360,
            height: 840,
            isMaximized: true,
          };
        }
        await win.unmaximize();
      } else {
        const [pos, size] = await Promise.all([
          win.outerPosition(),
          win.innerSize(),
        ]);
        savedDesktopBounds = {
          x: pos.x,
          y: pos.y,
          width: size.width,
          height: size.height,
          isMaximized: false,
        };
        saveBounds("lof.bounds.desktop", savedDesktopBounds);
      }

      // 2. Apply Player mode window size & position (restoring previous Player bounds if available)
      await win.setMinSize(new LogicalSize(380, 560));
      const playerBounds = savedPlayerBounds || loadBounds("lof.bounds.player");
      if (playerBounds && playerBounds.width >= 360 && playerBounds.height >= 500) {
        await win.setSize(
          new PhysicalSize(playerBounds.width, playerBounds.height)
        );
        await win.setPosition(
          new PhysicalPosition(playerBounds.x, playerBounds.y)
        );
      } else {
        await win.setSize(new LogicalSize(410, 760));
      }
      await win.setAlwaysOnTop(alwaysOnTop);
    } else {
      // 1. Save current Player window position & size before switching back to Library mode
      if (!isMax) {
        const [pos, size] = await Promise.all([
          win.outerPosition(),
          win.innerSize(),
        ]);
        savedPlayerBounds = {
          x: pos.x,
          y: pos.y,
          width: size.width,
          height: size.height,
        };
        saveBounds("lof.bounds.player", savedPlayerBounds);
      } else {
        await win.unmaximize();
      }

      // 2. Restore exact Library ("desktop") window position, size, and maximized state
      await win.setAlwaysOnTop(alwaysOnTop);
      await win.setMinSize(new LogicalSize(920, 600));
      const desktopBounds =
        savedDesktopBounds || loadBounds("lof.bounds.desktop");
      if (desktopBounds) {
        if (desktopBounds.width >= 800 && desktopBounds.height >= 500) {
          await win.setSize(
            new PhysicalSize(desktopBounds.width, desktopBounds.height)
          );
        } else {
          await win.setSize(new LogicalSize(1360, 840));
        }
        await win.setPosition(
          new PhysicalPosition(desktopBounds.x, desktopBounds.y)
        );
        if (desktopBounds.isMaximized) {
          await win.maximize();
        }
      } else {
        await win.setSize(new LogicalSize(1360, 840));
      }
    }
  } catch (err) {
    console.warn("Window mode warning:", err);
  }
}

export async function resizePlayerStackWindow(
  showLyrics: boolean,
  showPlaylist: boolean
): Promise<void> {
  if (!isTauri()) return;
  try {
    const win = getCurrentWindow();
    let h = 216;
    if (showLyrics) h += 172;
    if (showPlaylist) h += 392;
    await win.setSize(new LogicalSize(400, h));
  } catch (err) {
    console.warn("Stack resize warning:", err);
  }
}

export async function toggleWindowPin(pin: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const win = getCurrentWindow();
    await win.setAlwaysOnTop(pin);
  } catch (err) {
    console.warn("Window pin warning:", err);
  }
}

export async function pickFolderDialog(): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({
    directory: true,
    multiple: false,
    title: "음악 폴더 선택",
  });
  if (typeof selected === "string") return selected;
  return null;
}

export async function pickAudioFilesDialog(): Promise<string[]> {
  if (!isTauri()) return [];
  const selected = await open({
    directory: false,
    multiple: true,
    title: "오디오 파일 추가",
    filters: [
      {
        name: "Audio Files",
        extensions: ["mp3", "flac", "wav", "ogg", "m4a", "aac", "alac", "opus"],
      },
    ],
  });
  if (Array.isArray(selected)) return selected;
  if (typeof selected === "string") return [selected];
  return [];
}

export const api = {
  getLibraryState: (): Promise<LibrarySnapshot> =>
    invoke("get_library_state"),

  scanFolder: (folderPath: string): Promise<LibrarySnapshot> =>
    invoke("scan_folder", { folderPath }),

  importFiles: (filePaths: string[]): Promise<LibrarySnapshot> =>
    invoke("import_files", { filePaths }),

  removeFolder: (folderPath: string): Promise<LibrarySnapshot> =>
    invoke("remove_folder", { folderPath }),

  deleteTracksFromLibrary: (trackIds: number[]): Promise<LibrarySnapshot> =>
    invoke("delete_tracks_from_library", { trackIds }),

  loadDemoTracks: (): Promise<LibrarySnapshot> =>
    invoke("load_demo_tracks"),

  playTrack: (trackId: number): Promise<PlaybackState> =>
    invoke("play_track", { trackId }),

  pausePlayback: (): Promise<PlaybackState> =>
    invoke("pause_playback"),

  resumePlayback: (): Promise<PlaybackState> =>
    invoke("resume_playback"),

  stopPlayback: (): Promise<PlaybackState> =>
    invoke("stop_playback"),

  seekPlayback: (positionSecs: number): Promise<PlaybackState> =>
    invoke("seek_playback", { positionSecs }),

  setVolume: (volume: number): Promise<PlaybackState> =>
    invoke("set_volume", { volume }),

  setSpeed: (speed: number): Promise<PlaybackState> =>
    invoke("set_speed", { speed }),

  getPlaybackState: (): Promise<PlaybackState> =>
    invoke("get_playback_state"),

  updateTags: (input: TagUpdateInput): Promise<Track[]> =>
    invoke("update_tags", { input }),

  applyFilenamePattern: (input: FilenamePatternInput): Promise<Track[]> =>
    invoke("apply_filename_pattern", { input }),

  toggleFavorite: (trackId: number): Promise<boolean> =>
    invoke("toggle_favorite", { trackId }),

  updateLyricOffset: (trackId: number, offsetMs: number): Promise<Track> =>
    invoke("update_lyric_offset", { trackId, offsetMs }),

  autoFetchLyrics: (trackId: number, saveLrcFile: boolean): Promise<Track> =>
    invoke("auto_fetch_lyrics", { trackId, saveLrcFile }),

  searchLyricsManual: (query: string): Promise<LrcLibTrack[]> =>
    invoke("search_lyrics_manual", { query }),

  applyLyricsToTrack: (
    trackId: number,
    syncedLyrics: string | null,
    plainLyrics: string | null,
    saveLrcFile: boolean
  ): Promise<Track> =>
    invoke("apply_lyrics_to_track", {
      trackId,
      syncedLyrics,
      plainLyrics,
      saveLrcFile,
    }),

  searchTrackMetadata: (
    trackId: number,
    customQuery?: string
  ): Promise<MusicBrainzCandidate[]> =>
    invoke("search_track_metadata", {
      trackId,
      customQuery: customQuery || null,
    }),

  applyMusicbrainzMetadata: (
    trackId: number,
    candidate: MusicBrainzCandidate,
    fetchCover: boolean
  ): Promise<Track> =>
    invoke("apply_musicbrainz_metadata", {
      trackId,
      candidate,
      fetchCover,
    }),

  previewAutoMatch: (trackIds: number[]): Promise<TrackMatchPreview[]> =>
    invoke("preview_auto_match", { trackIds }),

  applyConfirmedMatches: (
    items: ConfirmTrackMatchItem[]
  ): Promise<Track[]> =>
    invoke("apply_confirmed_matches", { items }),

  batchAutoEnrich: (
    trackIds: number[],
    fetchMetadata: boolean,
    fetchCover: boolean,
    fetchLyrics: boolean
  ): Promise<Track[]> =>
    invoke("batch_auto_enrich", {
      trackIds,
      fetchMetadata,
      fetchCover,
      fetchLyrics,
    }),

  createPlaylist: (name: string): Promise<Playlist[]> =>
    invoke("create_playlist", { name }),

  deletePlaylist: (playlistId: number): Promise<Playlist[]> =>
    invoke("delete_playlist", { playlistId }),

  addTracksToPlaylist: (
    playlistId: number,
    trackIds: number[]
  ): Promise<Playlist[]> =>
    invoke("add_tracks_to_playlist", { playlistId, trackIds }),

  removeTrackFromPlaylist: (
    playlistId: number,
    trackId: number
  ): Promise<Playlist[]> =>
    invoke("remove_track_from_playlist", { playlistId, trackId }),
};
