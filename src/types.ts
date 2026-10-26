export interface Track {
  id: number;
  filePath: string;
  fileName: string;
  folderPath: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  trackNumber: number | null;
  year: number | null;
  genre: string;
  durationSecs: number;
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
  format: string;
  coverDataUrl: string | null;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  lyricOffsetMs: number;
  mbidRecording: string | null;
  mbidRelease: string | null;
  isFavorite: boolean;
  playCount: number;
}

export interface PlaybackState {
  currentTrackId: number | null;
  filePath: string | null;
  isPlaying: boolean;
  positionSecs: number;
  durationSecs: number;
  volume: number;
  speed: number;
  isEnded: boolean;
}

export interface Playlist {
  id: number;
  name: string;
  trackIds: number[];
}

export interface LibrarySnapshot {
  tracks: Track[];
  folders: string[];
  playlists: Playlist[];
}

export interface AppInfo {
  version: string;
  dataDir: string;
  supportedFormats: string[];
}

export interface ScanProgress {
  folder: string;
  processed: number;
  total: number;
  addedOrUpdated: number;
  removed: number;
  done: boolean;
}

export interface TagUpdateInput {
  trackIds: number[];
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumArtist?: string | null;
  trackNumber?: number | null;
  autoNumber: boolean;
  year?: number | null;
  genre?: string | null;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  coverDataUrl?: string | null;
  saveLrcFile: boolean;
}

export interface FilenamePatternInput {
  trackIds: number[];
  pattern: string;
}

export interface LrcLibTrack {
  id: number;
  name: string | null;
  trackName: string | null;
  artistName: string | null;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean | null;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface MusicBrainzCandidate {
  recordingId: string;
  title: string;
  artist: string;
  album: string;
  releaseId: string | null;
  year: number | null;
  trackNumber: number | null;
  score: number | null;
  coverUrl: string | null;
}

export interface TrackMatchPreview {
  trackId: number;
  candidates: MusicBrainzCandidate[];
  matchedSyncedLyrics: string | null;
  matchedPlainLyrics: string | null;
}

export interface ConfirmTrackMatchItem {
  trackId: number;
  title: string | null;
  artist: string | null;
  album: string | null;
  year: number | null;
  trackNumber: number | null;
  recordingId: string | null;
  releaseId: string | null;
  applyCover: boolean;
  syncedLyrics: string | null;
  plainLyrics: string | null;
}

export interface LyricLine {
  timeSecs: number;
  text: string;
}

export type UIMode = "desktop" | "player";
export type RepeatMode = "off" | "all" | "one";
export type RightTab = "lyrics" | "tags" | "metadata" | "queue";
export type CenterViewMode = "table" | "grid";
export type PlayerSubTab = "now" | "lyrics" | "library" | "tags";
