import { useState, useEffect } from "react";
import { AppInfo } from "../../types";
import { DEFAULT_SETTINGS, UpdateChannel } from "../../settings";
import { api } from "../../api";
import { THEME_CACHE_KEY } from "./constants";
import { SettingsTab } from "../../app/types";

export function usePreferences() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return localStorage.getItem(THEME_CACHE_KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [rescanOnStartup, setRescanOnStartup] = useState(DEFAULT_SETTINGS.rescanOnStartup);

  const [saveLrcFile, setSaveLrcFile] = useState(DEFAULT_SETTINGS.saveLrcFile);

  const [npArtMax, setNpArtMax] = useState(DEFAULT_SETTINGS.npArtMax);

  const [lyricOffsetStepMs, setLyricOffsetStepMs] = useState(
    DEFAULT_SETTINGS.lyricOffsetStepMs,
  );

  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>(
    DEFAULT_SETTINGS.updateChannel,
  );

  const [autoCheckUpdates, setAutoCheckUpdates] = useState(DEFAULT_SETTINGS.autoCheckUpdates);

  const openSettings = (tab: SettingsTab = "general") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
    api.getAppInfo().then(setAppInfo).catch(() => { });
  };

  return {
    saveLrcFile,
    updateChannel,
    appInfo,
    setTheme,
    setRescanOnStartup,
    setNpArtMax,
    setSaveLrcFile,
    setLyricOffsetStepMs,
    setUpdateChannel,
    setAutoCheckUpdates,
    setSettingsLoaded,
    setAppInfo,
    settingsLoaded,
    autoCheckUpdates,
    theme,
    rescanOnStartup,
    npArtMax,
    lyricOffsetStepMs,
    settingsOpen,
    setSettingsOpen,
    openSettings,
    settingsTab,
    setSettingsTab,
  };
}

export type PreferencesModel = ReturnType<typeof usePreferences>;
