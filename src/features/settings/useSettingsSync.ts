import { useAppUpdater } from "../../updater";
import { api, toggleWindowPin } from "../../api";
import { useEffect, useRef, useMemo } from "react";
import { normalizeSettings, AppSettings } from "../../settings";
import { THEME_CACHE_KEY } from "./constants";
import type { PreferencesModel } from "./usePreferences";
import type { WindowLayoutModel } from "../layout/useWindowLayout";
import type { PlaybackStateModel } from "../playback/usePlaybackState";
import type { LibraryStateModel } from "../library/useLibraryState";
import type { MetadataStateModel } from "../metadata/useMetadataState";
import type { NotificationsModel } from "../../app/useNotifications";

interface Inputs {
  preferences: PreferencesModel;
  windowLayout: WindowLayoutModel;
  playbackState: PlaybackStateModel;
  libraryState: LibraryStateModel;
  metadataState: MetadataStateModel;
  notifications: NotificationsModel;
}

export function useSettingsSync({
  preferences,
  windowLayout,
  playbackState,
  libraryState,
  metadataState,
  notifications,
}: Inputs) {
  const {
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
    saveLrcFile,
    lyricOffsetStepMs,
  } = preferences;
  const {
    setAlwaysOnTop,
    setShowLeftSidebar,
    setShowRightLyricsInLib,
    setLyricsPaneWidth,
    setNpHeroRatio,
    setNpQueueWidth,
    setColWidths,
    alwaysOnTop,
    showLeftSidebar,
    showRightLyricsInLib,
    lyricsPaneWidth,
    npHeroRatio,
    npQueueWidth,
    colWidths,
  } = windowLayout;
  const {
    setShuffle,
    setRepeatMode,
    setPrevVolume,
    setIsMuted,
    volumeGuardUntilRef,
    setPlayback,
    isMuted,
    prevVolume,
    playback,
    shuffle,
    repeatMode,
  } = playbackState;
  const { setSortField, setSortAsc, sortField, sortAsc, folderViewMode, setFolderViewMode } = libraryState;
  const {
    setApplyFieldTitle,
    setApplyFieldArtist,
    setApplyFieldAlbum,
    setApplyFieldCover,
    setApplyFieldLyrics,
    applyFieldTitle,
    applyFieldArtist,
    applyFieldAlbum,
    applyFieldCover,
    applyFieldLyrics,
  } = metadataState;
  const { notify } = notifications;
  const updater = useAppUpdater({
    channel: updateChannel,
    configured: Boolean(appInfo?.updaterConfigured),
    // The installer closes the app; stop audio first so playback doesn't cut off mid-file
    beforeInstall: async () => {
      await api.stopPlayback().catch(() => { });
    },
  });

  useEffect(() => {
    api
      .getSettings()
      .catch(() => ({}))
      .then((raw) => {
        const st = normalizeSettings(raw);
        setTheme(st.theme);
        setAlwaysOnTop(st.alwaysOnTop);
        if (st.alwaysOnTop) void toggleWindowPin(true);
        setRescanOnStartup(st.rescanOnStartup);
        setShuffle(st.shuffle);
        setRepeatMode(st.repeatMode);
        setNpArtMax(st.npArtMax);
        setShowLeftSidebar(st.showLeftSidebar);
        setShowRightLyricsInLib(st.showRightLyricsInLib);
        setLyricsPaneWidth(st.lyricsPaneWidth);
        setNpHeroRatio(st.npHeroRatio);
        setNpQueueWidth(st.npQueueWidth);
        setColWidths(st.colWidths);
        setSortField(st.sortField);
        setSortAsc(st.sortAsc);
        setFolderViewMode(st.folderViewMode);
        setSaveLrcFile(st.saveLrcFile);
        setApplyFieldTitle(st.matchApplyFields.title);
        setApplyFieldArtist(st.matchApplyFields.artist);
        setApplyFieldAlbum(st.matchApplyFields.album);
        setApplyFieldCover(st.matchApplyFields.cover);
        setApplyFieldLyrics(st.matchApplyFields.lyrics);
        setLyricOffsetStepMs(st.lyricOffsetStepMs);
        setUpdateChannel(st.updateChannel);
        setAutoCheckUpdates(st.autoCheckUpdates);

        const vol = st.muted ? 0 : st.volume;
        setPrevVolume(st.volume);
        setIsMuted(st.muted);
        volumeGuardUntilRef.current = Date.now() + 500;
        setPlayback((prev) => ({ ...prev, volume: vol }));
        api.setVolume(vol).catch(() => { });
        setSettingsLoaded(true);
      });
    api.getAppInfo().then(setAppInfo).catch(() => { });
  }, []);

  const autoCheckDoneRef = useRef(false);

  useEffect(() => {
    if (!settingsLoaded || !appInfo?.updaterConfigured || autoCheckDoneRef.current) return;
    autoCheckDoneRef.current = true;
    if (!autoCheckUpdates) return;
    updater.checkNow().then((found) => {
      if (found) notify(`새 버전(v${found.version})이 있습니다. 설정 > 업데이트에서 설치할 수 있습니다.`);
    });
  }, [settingsLoaded, appInfo, autoCheckUpdates, updater.checkNow]);

  const currentSettings = useMemo<AppSettings>(
    () => ({
      theme,
      alwaysOnTop,
      rescanOnStartup,
      volume: isMuted ? prevVolume : playback.volume,
      muted: isMuted,
      shuffle,
      repeatMode,
      npArtMax,
      showLeftSidebar,
      showRightLyricsInLib,
      lyricsPaneWidth,
      npHeroRatio,
      npQueueWidth,
      colWidths,
      sortField,
      sortAsc,
      folderViewMode,
      saveLrcFile,
      matchApplyFields: {
        title: applyFieldTitle,
        artist: applyFieldArtist,
        album: applyFieldAlbum,
        cover: applyFieldCover,
        lyrics: applyFieldLyrics,
      },
      lyricOffsetStepMs,
      updateChannel,
      autoCheckUpdates,
    }),
    [
      updateChannel, autoCheckUpdates,
      theme, alwaysOnTop, rescanOnStartup, isMuted, prevVolume, playback.volume, shuffle,
      repeatMode, npArtMax, showLeftSidebar, showRightLyricsInLib, lyricsPaneWidth,
      npHeroRatio, npQueueWidth, colWidths, sortField, sortAsc, folderViewMode, saveLrcFile, applyFieldTitle,
      applyFieldArtist, applyFieldAlbum, applyFieldCover, applyFieldLyrics, lyricOffsetStepMs,
    ],
  );

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem(THEME_CACHE_KEY, currentSettings.theme);
    } catch {
      // ignore
    }
    const timer = setTimeout(() => {
      api.saveSettings({ ...currentSettings }).catch(() => { });
    }, 400);
    return () => clearTimeout(timer);
  }, [settingsLoaded, currentSettings]);

  return {
    updater,
  };
}

export type SettingsSyncModel = ReturnType<typeof useSettingsSync>;
