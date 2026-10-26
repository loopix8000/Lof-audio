import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AppInfo,
  ConfirmTrackMatchItem,
  FilenamePatternInput,
  LibrarySnapshot,
  LrcLibTrack,
  MusicBrainzCandidate,
  AlbumCandidate,
  AlbumTrackMatch,
  PlaybackState,
  Playlist,
  ScanProgress,
  TagUpdateInput,
  Track,
  WorkspaceState,
  AutomationInfo,
  AudioSkillStatus,
  HideTarget,
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

/** Reports the window's maximized state now and after every resize (maximize, restore, snap, drag). */
export async function watchWindowMaximized(
  handler: (maximized: boolean) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  const win = getCurrentWindow();
  const report = () => {
    win.isMaximized().then(handler).catch(() => {});
  };
  report();
  return win.onResized(report);
}

export async function closeWindow(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().close();
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

export async function onLibraryScanProgress(
  handler: (progress: ScanProgress) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<ScanProgress>("library-scan-progress", (e) => handler(e.payload));
}

export async function onLibraryChanged(handler: (trackIds: number[]) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<number[]>("library-changed", event => handler(event.payload));
}

export async function onAutomationLibraryChanged(handler: () => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen("automation-library-changed", handler);
}

export async function onAutomationPlayback(handler: (value: { action: string; playback: PlaybackState; workspaceState: WorkspaceState }) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<{ action: string; playback: PlaybackState; workspaceState: WorkspaceState }>("automation-playback", event => handler(event.payload));
}

export async function pickSkillsFolderDialog(): Promise<string | null> {
  const path = await open({ directory: true, multiple: false, title: "AI 클라이언트의 스킬 상위 폴더 선택" });
  return typeof path === "string" ? path : null;
}

export const api = {
  hideLibraryItems: (targets: HideTarget[]): Promise<LibrarySnapshot> => invoke("hide_library_items", { targets }),
  unhideLibraryItem: (id: number): Promise<LibrarySnapshot> => invoke("unhide_library_item", { id }),
  getAutomationInfo: (): Promise<AutomationInfo> => invoke("get_automation_info"),
  getSkillStatus: (skillsDirectory?: string): Promise<AudioSkillStatus> => invoke("get_audio_skill_status", { skillsDirectory: skillsDirectory ?? null }),
  installSkill: (skillsDirectory: string, expectedRevision: string, expectedInstalledRevision?: string | null): Promise<AudioSkillStatus> =>
    invoke("install_audio_skill", { skillsDirectory, expectedRevision, expectedInstalledRevision: expectedInstalledRevision ?? null }),
  getLibraryState: (): Promise<LibrarySnapshot> =>
    invoke("get_library_state"),

  getLibraryTracks: (trackIds: number[]): Promise<Track[]> =>
    invoke("get_library_tracks", { trackIds }),

  scanFolder: (folderPath: string, workspaceId: number): Promise<LibrarySnapshot> =>
    invoke("scan_folder", { folderPath, workspaceId }),

  getScanStatus: (): Promise<ScanProgress | null> =>
    invoke("get_scan_status"),

  rescanLibrary: (force: boolean, workspaceId: number): Promise<void> =>
    invoke("rescan_library", { force, workspaceId }),

  createWorkspace: (name: string): Promise<WorkspaceState> =>
    invoke("create_workspace", { name }),

  renameWorkspace: (workspaceId: number, name: string): Promise<WorkspaceState> =>
    invoke("rename_workspace", { workspaceId, name }),

  selectWorkspace: (workspaceId: number): Promise<WorkspaceState> =>
    invoke("select_workspace", { workspaceId }),

  deleteWorkspace: (workspaceId: number): Promise<WorkspaceState> =>
    invoke("delete_workspace", { workspaceId }),

  getSettings: (): Promise<Record<string, unknown>> =>
    invoke("get_settings"),

  saveSettings: (patch: Record<string, unknown>): Promise<void> =>
    invoke("save_settings", { patch }),

  getAppInfo: (): Promise<AppInfo> =>
    invoke("get_app_info"),

  revealDataDir: (): Promise<void> =>
    invoke("reveal_data_dir"),

  importFiles: (filePaths: string[], workspaceId: number): Promise<LibrarySnapshot> =>
    invoke("import_files", { filePaths, workspaceId }),

  removeFolder: (folderPath: string, workspaceId: number): Promise<LibrarySnapshot> =>
    invoke("remove_folder", { folderPath, workspaceId }),

  deleteTracksFromLibrary: (trackIds: number[], workspaceId: number): Promise<LibrarySnapshot> =>
    invoke("delete_tracks_from_library", { trackIds, workspaceId }),

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

  previewFilenamePattern: (trackIds: number[], pattern: string): Promise<Record<number, Record<string, string>>> =>
    invoke("preview_filename_pattern", { trackIds, pattern }),

  previewMatchLyrics: (trackId: number, candidate: MusicBrainzCandidate | null): Promise<LrcLibTrack | null> =>
    invoke("preview_match_lyrics", { trackId, candidate }),

  applyFilenamePattern: (input: FilenamePatternInput): Promise<Track[]> =>
    invoke("apply_filename_pattern", { input }),

  toggleFavorite: (trackId: number): Promise<boolean> =>
    invoke("toggle_favorite", { trackId }),

  updateLyricOffset: (trackId: number, offsetMs: number): Promise<Track> =>
    invoke("update_lyric_offset", { trackId, offsetMs }),

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

  searchAlbumMetadata: (trackId: number, customQuery?: string): Promise<AlbumCandidate[]> =>
    invoke("search_album_metadata", { trackId, customQuery: customQuery || null }),

  previewAlbumMetadata: (trackIds: number[], releaseId: string): Promise<AlbumTrackMatch[]> =>
    invoke("preview_album_metadata", { trackIds, releaseId }),

  applyConfirmedMatches: (
    items: ConfirmTrackMatchItem[]
  ): Promise<Track[]> =>
    invoke("apply_confirmed_matches", { items }),

  createPlaylist: (name: string, workspaceId: number): Promise<Playlist[]> =>
    invoke("create_playlist", { name, workspaceId }),

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
