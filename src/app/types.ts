import { Track } from "../types";

export type AppViewMode = "library" | "player";

export type NavCategory = "all" | "favorites" | "artists" | "albums" | "folders" | "playlist";

export type DialogTab = "tags" | "pattern" | "online" | "lyrics";

export type SettingsTab = "general" | "library" | "playback" | "lyrics" | "automation" | "update" | "about";

export interface ContextMenuState {
  x: number;
  y: number;
  track: Track;
}
