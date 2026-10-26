import React, { useState, useEffect, useRef } from "react";
import { watchWindowMaximized, toggleWindowPin } from "../../api";
import { DEFAULT_SETTINGS } from "../../settings";
import { AppViewMode } from "../../app/types";
import type { NotificationsModel } from "../../app/useNotifications";

interface Inputs {
  notifications: NotificationsModel;
}

export function useWindowLayout({
  notifications,
}: Inputs) {
  const { notify } = notifications;
  const [windowWidth, setWindowWidth] = useState<number>(() => window.innerWidth);

  const appMode: AppViewMode = windowWidth < 740 ? "player" : "library";

  const [alwaysOnTop, setAlwaysOnTop] = useState(false);

  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    watchWindowMaximized(setIsMaximized).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

  const [showLeftSidebar, setShowLeftSidebar] = useState(true);

  const [showRightLyricsInLib, setShowRightLyricsInLib] = useState(true);

  const [lyricsPaneWidth, setLyricsPaneWidth] = useState(290);

  const [resizingLyricsPane, setResizingLyricsPane] = useState(false);

  const lyricsResizeRef = useRef<{
    startX: number;
    startWidth: number;
    pointerId: number;
  } | null>(null);

  const NP_HERO_RATIO_DEFAULT = 0.52;

  const [npHeroRatio, setNpHeroRatio] = useState(NP_HERO_RATIO_DEFAULT);

  const [resizingNpSplit, setResizingNpSplit] = useState(false);

  const npHeroPaneRef = useRef<HTMLDivElement | null>(null);

  const npLyricsPaneRef = useRef<HTMLDivElement | null>(null);

  const npSplitResizeRef = useRef<{ pointerId: number } | null>(null);

  const [colWidths, setColWidths] = useState(DEFAULT_SETTINGS.colWidths);

  const [activeColResizer, setActiveColResizer] = useState<number | null>(null);

  const colResizeRef = useRef<{
    dividerIdx: number;
    startX: number;
    startWidths: {
      num: number;
      artist: number;
      album: number;
      year: number;
      format: number;
      duration: number;
    };
    pointerId: number;
  } | null>(null);

  const handleColResizeStart = (
    dividerIdx: number,
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    colResizeRef.current = {
      dividerIdx,
      startX: e.clientX,
      startWidths: { ...colWidths },
      pointerId: e.pointerId,
    };
    setActiveColResizer(dividerIdx);
  };

  const handleColResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = colResizeRef.current;
    if (!st) return;
    const dx = e.clientX - st.startX;
    const s = st.startWidths;

    if (st.dividerIdx === 0) {
      // # | 제목
      const nextNum = Math.max(36, Math.min(120, s.num + dx));
      setColWidths((prev) => ({ ...prev, num: nextNum }));
    } else if (st.dividerIdx === 1) {
      // 제목 | 아티스트 (제목 is width: auto, so shrinking artist expands 제목 by +dx)
      const nextArtist = Math.max(65, Math.min(480, s.artist - dx));
      setColWidths((prev) => ({ ...prev, artist: nextArtist }));
    } else if (st.dividerIdx === 2) {
      // 아티스트 | 앨범
      const clampedDx = Math.max(65 - s.artist, Math.min(s.album - 65, dx));
      setColWidths((prev) => ({
        ...prev,
        artist: s.artist + clampedDx,
        album: s.album - clampedDx,
      }));
    } else if (st.dividerIdx === 3) {
      // 앨범 | 연도
      const clampedDx = Math.max(65 - s.album, Math.min(s.year - 46, dx));
      setColWidths((prev) => ({
        ...prev,
        album: s.album + clampedDx,
        year: s.year - clampedDx,
      }));
    } else if (st.dividerIdx === 4) {
      // 연도 | 포맷
      const clampedDx = Math.max(46 - s.year, Math.min(s.format - 48, dx));
      setColWidths((prev) => ({
        ...prev,
        year: s.year + clampedDx,
        format: s.format - clampedDx,
      }));
    } else if (st.dividerIdx === 5) {
      // 포맷 | 시간
      const clampedDx = Math.max(48 - s.format, Math.min(s.duration - 52, dx));
      setColWidths((prev) => ({
        ...prev,
        format: s.format + clampedDx,
        duration: s.duration - clampedDx,
      }));
    }
  };

  const handleColResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = colResizeRef.current;
    if (!st) return;
    if (e.currentTarget.hasPointerCapture(st.pointerId)) {
      e.currentTarget.releasePointerCapture(st.pointerId);
    }
    colResizeRef.current = null;
    setActiveColResizer(null);
  };

  const handleLyricsResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    lyricsResizeRef.current = {
      startX: e.clientX,
      startWidth: lyricsPaneWidth,
      pointerId: e.pointerId,
    };
    setResizingLyricsPane(true);
  };

  const handleLyricsResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = lyricsResizeRef.current;
    if (!st) return;
    const dx = e.clientX - st.startX;
    const nextW = Math.max(190, Math.min(560, st.startWidth - dx));
    setLyricsPaneWidth(nextW);
  };

  const handleNpSplitResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    npSplitResizeRef.current = { pointerId: e.pointerId };
    setResizingNpSplit(true);
  };

  const handleNpSplitResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const hero = npHeroPaneRef.current;
    const lyrics = npLyricsPaneRef.current;
    if (!npSplitResizeRef.current || !hero || !lyrics) return;
    const heroRect = hero.getBoundingClientRect();
    const total = heroRect.width + lyrics.getBoundingClientRect().width;
    if (total <= 0) return;
    const ratio = (e.clientX - heroRect.left) / total;
    setNpHeroRatio(Math.max(0.2, Math.min(0.75, ratio)));
  };

  const handleNpSplitResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = npSplitResizeRef.current;
    if (!st) return;
    if (e.currentTarget.hasPointerCapture(st.pointerId)) {
      e.currentTarget.releasePointerCapture(st.pointerId);
    }
    npSplitResizeRef.current = null;
    setResizingNpSplit(false);
  };

  const handleLyricsResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = lyricsResizeRef.current;
    if (!st) return;
    if (e.currentTarget.hasPointerCapture(st.pointerId)) {
      e.currentTarget.releasePointerCapture(st.pointerId);
    }
    lyricsResizeRef.current = null;
    setResizingLyricsPane(false);
  };

  const [showPlayerSearch, setShowPlayerSearch] = useState(false);

  const [showPlayerBrowser, setShowPlayerBrowser] = useState(false);

  const [playerBrowserTab, setPlayerBrowserTab] = useState<
    "playlists" | "albums" | "artists" | "folders"
  >("albums");

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setPinned = async (next: boolean) => {
    setAlwaysOnTop(next);
    await toggleWindowPin(next);
  };

  const handleTogglePin = async () => {
    const next = !alwaysOnTop;
    await setPinned(next);
    notify(next ? "창 항상 위에 고정 켜짐" : "창 항상 위에 고정 꺼짐");
  };

  return {
    appMode,
    showRightLyricsInLib,
    nowPlayingOpen,
    setAlwaysOnTop,
    setShowLeftSidebar,
    setShowRightLyricsInLib,
    setLyricsPaneWidth,
    setNpHeroRatio,
    setColWidths,
    alwaysOnTop,
    showLeftSidebar,
    lyricsPaneWidth,
    npHeroRatio,
    colWidths,
    setNowPlayingOpen,
    handleTogglePin,
    isMaximized,
    npHeroPaneRef,
    npLyricsPaneRef,
    resizingNpSplit,
    handleNpSplitResizeStart,
    handleNpSplitResizeMove,
    handleNpSplitResizeEnd,
    NP_HERO_RATIO_DEFAULT,
    activeColResizer,
    handleColResizeStart,
    handleColResizeMove,
    handleColResizeEnd,
    resizingLyricsPane,
    handleLyricsResizeStart,
    handleLyricsResizeMove,
    handleLyricsResizeEnd,
    setShowPlayerBrowser,
    showPlayerBrowser,
    showPlayerSearch,
    playerBrowserTab,
    setPlayerBrowserTab,
    setShowPlayerSearch,
    setPinned,
  };
}

export type WindowLayoutModel = ReturnType<typeof useWindowLayout>;
