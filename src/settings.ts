import { RepeatMode } from "./types";

export type SortField = "trackNumber" | "title" | "artist" | "album" | "durationSecs" | "year";

export type UpdateChannel = "stable" | "beta";
export type FolderViewMode = "grid" | "directory" | "category";

export interface ColumnWidths {
  num: number;
  artist: number;
  album: number;
  year: number;
  format: number;
  duration: number;
}

export interface MatchApplyFields {
  title: boolean;
  artist: boolean;
  album: boolean;
  cover: boolean;
  lyrics: boolean;
}

/** User preferences persisted in the library SQLite DB (settings table, one JSON value per key). */
export interface AppSettings {
  // General
  theme: "light" | "dark";
  alwaysOnTop: boolean;
  rescanOnStartup: boolean;
  // Playback
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  npArtMax: number;
  // Layout
  showLeftSidebar: boolean;
  showRightLyricsInLib: boolean;
  lyricsPaneWidth: number;
  npHeroRatio: number;
  colWidths: ColumnWidths;
  sortField: SortField;
  sortAsc: boolean;
  folderViewMode: FolderViewMode;
  // Lyrics & metadata
  saveLrcFile: boolean;
  matchApplyFields: MatchApplyFields;
  lyricOffsetStepMs: number;
  // Updates
  updateChannel: UpdateChannel;
  autoCheckUpdates: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  alwaysOnTop: false,
  rescanOnStartup: true,
  volume: 0.85,
  muted: false,
  shuffle: false,
  repeatMode: "all",
  npArtMax: 480,
  showLeftSidebar: true,
  showRightLyricsInLib: true,
  lyricsPaneWidth: 290,
  npHeroRatio: 0.52,
  colWidths: { num: 46, artist: 180, album: 180, year: 60, format: 64, duration: 68 },
  sortField: "album",
  sortAsc: true,
  folderViewMode: "grid",
  saveLrcFile: true,
  matchApplyFields: { title: true, artist: true, album: true, cover: true, lyrics: true },
  lyricOffsetStepMs: 100,
  updateChannel: "stable",
  autoCheckUpdates: true,
};

export const NP_ART_MAX_RANGE = { min: 280, max: 640, step: 20 };
export const LYRIC_OFFSET_STEPS = [50, 100, 250, 500];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const pick = <T>(value: unknown, fallback: T, valid: (v: unknown) => boolean): T =>
  valid(value) ? (value as T) : fallback;

const isBool = (v: unknown) => typeof v === "boolean";
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Merges stored values over defaults, dropping anything malformed or out of range. */
export function normalizeSettings(raw: Record<string, unknown>): AppSettings {
  const d = DEFAULT_SETTINGS;
  const cols = (raw.colWidths && typeof raw.colWidths === "object" ? raw.colWidths : {}) as Record<string, unknown>;
  const match = (raw.matchApplyFields && typeof raw.matchApplyFields === "object" ? raw.matchApplyFields : {}) as Record<string, unknown>;
  const colWidths = Object.fromEntries(
    Object.entries(d.colWidths).map(([k, def]) => [
      k,
      clamp(pick(cols[k], def, isNum), 30, 600),
    ]),
  ) as unknown as ColumnWidths;
  const matchApplyFields = Object.fromEntries(
    Object.entries(d.matchApplyFields).map(([k, def]) => [k, pick(match[k], def, isBool)]),
  ) as unknown as MatchApplyFields;

  return {
    theme: pick(raw.theme, d.theme, (v) => v === "light" || v === "dark"),
    alwaysOnTop: pick(raw.alwaysOnTop, d.alwaysOnTop, isBool),
    rescanOnStartup: pick(raw.rescanOnStartup, d.rescanOnStartup, isBool),
    volume: clamp(pick(raw.volume, d.volume, isNum), 0, 1),
    muted: pick(raw.muted, d.muted, isBool),
    shuffle: pick(raw.shuffle, d.shuffle, isBool),
    repeatMode: pick(raw.repeatMode, d.repeatMode, (v) => v === "off" || v === "all" || v === "one"),
    npArtMax: clamp(
      pick(raw.npArtMax, d.npArtMax, isNum),
      NP_ART_MAX_RANGE.min,
      NP_ART_MAX_RANGE.max,
    ),
    showLeftSidebar: pick(raw.showLeftSidebar, d.showLeftSidebar, isBool),
    showRightLyricsInLib: pick(raw.showRightLyricsInLib, d.showRightLyricsInLib, isBool),
    lyricsPaneWidth: clamp(pick(raw.lyricsPaneWidth, d.lyricsPaneWidth, isNum), 190, 560),
    npHeroRatio: clamp(pick(raw.npHeroRatio, d.npHeroRatio, isNum), 0.2, 0.75),
    colWidths,
    sortField: pick(raw.sortField, d.sortField, (v) =>
      ["trackNumber", "title", "artist", "album", "durationSecs", "year"].includes(v as string),
    ),
    sortAsc: pick(raw.sortAsc, d.sortAsc, isBool),
    folderViewMode: pick(raw.folderViewMode, d.folderViewMode, v => v === "grid" || v === "directory" || v === "category"),
    saveLrcFile: pick(raw.saveLrcFile, d.saveLrcFile, isBool),
    matchApplyFields,
    lyricOffsetStepMs: pick(raw.lyricOffsetStepMs, d.lyricOffsetStepMs, (v) =>
      LYRIC_OFFSET_STEPS.includes(v as number),
    ),
    updateChannel: pick(raw.updateChannel, d.updateChannel, (v) => v === "stable" || v === "beta"),
    autoCheckUpdates: pick(raw.autoCheckUpdates, d.autoCheckUpdates, isBool),
  };
}

export function formatOffsetStep(ms: number): string {
  return `${(ms / 1000).toFixed(ms % 100 === 0 ? 1 : 2)}s`;
}
