import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  Disc,
  Edit3,
  FilePlus,
  Folder,
  FolderPlus,
  Heart,
  Layers,
  ListMusic,
  Mic2,
  Minus,
  Moon,
  Music,
  PanelLeft,
  PanelRight,
  Pin,
  Plus,
  RefreshCw,
  Repeat,
  Repeat1,
  Search,
  Settings as SettingsIcon,
  Shuffle,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  api,
  closeWindow,
  minimizeWindow,
  onLibraryChanged,
  onLibraryScanProgress,
  pickAudioFilesDialog,
  pickFolderDialog,
  setWindowMode,
  startWindowDrag,
  toggleMaximizeWindow,
  toggleWindowPin,
  watchWindowMaximized,
} from "./api";
import {
  AppInfo,
  ConfirmTrackMatchItem,
  LrcLibTrack,
  MusicBrainzCandidate,
  PlaybackState,
  Playlist,
  RepeatMode,
  ScanProgress,
  Track,
  TrackMatchPreview,
} from "./types";
import {
  buildDisplayLyricLines,
  findActiveLyricIndex,
  formatDuration,
  getFallbackCoverUrl,
  parseFilenamePatternPreview,
} from "./utils/lrc";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  LYRIC_OFFSET_STEPS,
  NP_ART_MAX_RANGE,
  SortField,
  formatOffsetStep,
  normalizeSettings,
} from "./settings";

type AppViewMode = "library" | "player";
type NavCategory = "all" | "favorites" | "artists" | "albums" | "folders" | "playlist";
type LibraryLayout = "grouped" | "flat" | "grid";
type DialogTab = "tags" | "pattern" | "online" | "lyrics";
type SettingsTab = "general" | "library" | "playback" | "lyrics" | "about";

const THEME_CACHE_KEY = "lof.theme";

interface ContextMenuState {
  x: number;
  y: number;
  track: Track;
}

/* ============================================================================
   PIXEL-SNAPPED NATIVE TRANSPORT SVG ICONS (20x20 Grid, Optically Centered)
   ============================================================================ */
function NativePlayIcon({ size = 20 }: { size?: number }) {
  // Optical centroid of triangle (6.8, 4.5) -> (16.4, 10.0) -> (6.8, 15.5) is x = (6.8+6.8+16.4)/3 = 10.0, y = 10.0
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M6.8 5.2C6.8 4.41 7.67 3.93 8.35 4.35L16.05 9.15C16.69 9.54 16.69 10.46 16.05 10.85L8.35 15.65C7.67 16.07 6.8 15.59 6.8 14.8V5.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function NativePauseIcon({ size = 20 }: { size?: number }) {
  // Symmetric bars: x=5.0..8.2 (w=3.2) and x=11.8..15.0 (w=3.2), y=4.5..15.5 (h=11)
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="5" y="4.5" width="3.2" height="11" rx="1.2" fill="currentColor" />
      <rect x="11.8" y="4.5" width="3.2" height="11" rx="1.2" fill="currentColor" />
    </svg>
  );
}

function NativePrevIcon({ size = 18 }: { size?: number }) {
  // Symmetric horizontal bounds: x=4.5 to x=15.5 (center=10.0), y=4.5 to y=15.5 (center=10.0)
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="4.5" y="5" width="2" height="10" rx="1" fill="currentColor" />
      <path
        d="M15.5 5.45C15.5 4.74 14.71 4.32 14.12 4.71L8.12 8.76C7.61 9.11 7.61 9.89 8.12 10.24L14.12 14.29C14.71 14.68 15.5 14.26 15.5 13.55V5.45Z"
        transform="translate(0, 0.5)"
        fill="currentColor"
      />
    </svg>
  );
}

function NativeNextIcon({ size = 18 }: { size?: number }) {
  // Exact horizontal mirror of NativePrevIcon: x=4.5 to x=15.5 (center=10.0)
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M4.5 5.45C4.5 4.74 5.29 4.32 5.88 4.71L11.88 8.76C12.39 9.11 12.39 9.89 11.88 10.24L5.88 14.29C5.29 14.68 4.5 14.26 4.5 13.55V5.45Z"
        transform="translate(0, 0.5)"
        fill="currentColor"
      />
      <rect x="13.5" y="5" width="2" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}

interface DraggableSliderProps {
  value: number;
  max: number;
  onChange?: (val: number) => void;
  onCommit?: (val: number) => void;
  style?: React.CSSProperties;
  title?: string;
}

function DraggableSlider({
  value,
  max,
  onChange,
  onCommit,
  style,
  title,
}: DraggableSliderProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragVal, setDragVal] = useState(0);

  const safeMax = max > 0 ? max : 1;
  const shownVal = dragging ? dragVal : value;
  const percent = Math.min(100, Math.max(0, (shownVal / safeMax) * 100));

  const calcValue = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * safeMax;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || max <= 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = calcValue(e.clientX);
    setDragging(true);
    setDragVal(next);
    onChange?.(next);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const next = calcValue(e.clientX);
    setDragVal(next);
    onChange?.(next);
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const next = calcValue(e.clientX);
    setDragging(false);
    onCommit?.(next);
  };

  return (
    <div
      ref={wrapRef}
      className={`slider-wrap ${dragging ? "dragging" : ""}`}
      style={style}
      title={title}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <div className="slider-track">
        <div className="slider-fill" style={{ width: `${percent}%` }} />
        <div className="slider-thumb" style={{ left: `${percent}%` }} />
      </div>
    </div>
  );
}

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export function App() {
  // Theme & Responsive Mode ("library" when width >= 740, "player" when width < 740)
  // Cached locally only to avoid a light→dark flash before SQLite settings load
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return localStorage.getItem(THEME_CACHE_KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
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

  // Dedicated Now Playing Screen inside Library Mode (opened by clicking album art)
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

  // Desktop Library Mode Panes & Resizable Dimensions
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightLyricsInLib, setShowRightLyricsInLib] = useState(true);
  const [lyricsPaneWidth, setLyricsPaneWidth] = useState(290);
  const [resizingLyricsPane, setResizingLyricsPane] = useState(false);
  const lyricsResizeRef = useRef<{
    startX: number;
    startWidth: number;
    pointerId: number;
  } | null>(null);

  // Now-Playing split between artwork and lyrics (fraction of the shared width given to artwork)
  const NP_HERO_RATIO_DEFAULT = 0.52;
  const [npHeroRatio, setNpHeroRatio] = useState(NP_HERO_RATIO_DEFAULT);
  const [resizingNpSplit, setResizingNpSplit] = useState(false);
  const npHeroPaneRef = useRef<HTMLDivElement | null>(null);
  const npLyricsPaneRef = useRef<HTMLDivElement | null>(null);
  const npSplitResizeRef = useRef<{ pointerId: number } | null>(null);

  // Table Column Widths (title column uses 'auto' to fill remaining width smoothly)
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

  // Player Mode Inline Search & Collection Browser Toggles
  const [showPlayerSearch, setShowPlayerSearch] = useState(false);
  const [showPlayerBrowser, setShowPlayerBrowser] = useState(false);
  const [playerBrowserTab, setPlayerBrowserTab] = useState<
    "playlists" | "albums" | "artists" | "folders"
  >("albums");

  // Library Data
  const [tracks, setTracks] = useState<Track[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  // Filtering & Sorting (Contextual Layout per Category — No Manual View Switcher)
  const [navCategory, setNavCategory] = useState<NavCategory>("all");
  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("album");
  const [sortAsc, setSortAsc] = useState(true);

  // Selection & Context Menu
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [lastClickedId, setLastClickedId] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  // Playback State
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

  // Properties / Tag Dialog Modal (with locked target track IDs)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<DialogTab>("tags");
  const [dialogTrackIds, setDialogTrackIds] = useState<number[]>([]);
  const [tagTitle, setTagTitle] = useState("");
  const [tagArtist, setTagArtist] = useState("");
  const [tagAlbum, setTagAlbum] = useState("");
  const [tagAlbumArtist, setTagAlbumArtist] = useState("");
  const [tagTrackNum, setTagTrackNum] = useState("");
  const [tagAutoNumber, setTagAutoNumber] = useState(false);
  const [tagYear, setTagYear] = useState("");
  const [tagGenre, setTagGenre] = useState("");
  const [tagCoverUrl, setTagCoverUrl] = useState("");
  const [filenamePattern, setFilenamePattern] = useState("%track%. %title%");

  // Sub-menu 3: Auto Info Matching (Preview & User Confirmation State)
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchPreviews, setMatchPreviews] = useState<TrackMatchPreview[]>([]);
  const [matchCheckedMap, setMatchCheckedMap] = useState<Record<number, boolean>>({});
  const [matchSelectedCandIdx, setMatchSelectedCandIdx] = useState<Record<number, number>>({});
  // Candidate cover URLs that failed to load (Cover Art Archive has no art for some releases)
  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, boolean>>({});
  const [coverZoom, setCoverZoom] = useState<{
    current: string;
    candidate?: string;
    caption: string;
  } | null>(null);
  const [applyFieldTitle, setApplyFieldTitle] = useState(true);
  const [applyFieldArtist, setApplyFieldArtist] = useState(true);
  const [applyFieldAlbum, setApplyFieldAlbum] = useState(true);
  const [applyFieldCover, setApplyFieldCover] = useState(true);
  const [applyFieldLyrics, setApplyFieldLyrics] = useState(true);
  const [manualMbQuery, setManualMbQuery] = useState("");

  // Sub-menu 4: Lyrics Search & Edit inside Dialog
  const [lrcSearchQuery, setLrcSearchQuery] = useState("");
  const [lrcLoading, setLrcLoading] = useState(false);
  const [lrcResults, setLrcResults] = useState<LrcLibTrack[]>([]);
  const [lyricDraft, setLyricDraft] = useState("");

  // Playlist creation & Status
  const [addingPlaylist, setAddingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const creatingPlaylistRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  const lyricsBoxRef = useRef<HTMLDivElement | null>(null);
  const playerLyricsRef = useRef<HTMLDivElement | null>(null);
  const npLyricsRef = useRef<HTMLDivElement | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    // Longer messages stay up longer so they can be read in full
    const duration = Math.min(7000, 2600 + Math.max(0, msg.length - 30) * 60);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, duration);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Responsive Window Width Listener (Auto-switches between Wide Library & Compact Player)
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Settings Screen & Persisted Preferences (stored in the SQLite settings table)
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
        setColWidths(st.colWidths);
        setSortField(st.sortField);
        setSortAsc(st.sortAsc);
        setSaveLrcFile(st.saveLrcFile);
        setApplyFieldTitle(st.matchApplyFields.title);
        setApplyFieldArtist(st.matchApplyFields.artist);
        setApplyFieldAlbum(st.matchApplyFields.album);
        setApplyFieldCover(st.matchApplyFields.cover);
        setApplyFieldLyrics(st.matchApplyFields.lyrics);
        setLyricOffsetStepMs(st.lyricOffsetStepMs);

        const vol = st.muted ? 0 : st.volume;
        setPrevVolume(st.volume);
        setIsMuted(st.muted);
        volumeGuardUntilRef.current = Date.now() + 500;
        setPlayback((prev) => ({ ...prev, volume: vol }));
        api.setVolume(vol).catch(() => {});
        setSettingsLoaded(true);
      });
  }, []);

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
      colWidths,
      sortField,
      sortAsc,
      saveLrcFile,
      matchApplyFields: {
        title: applyFieldTitle,
        artist: applyFieldArtist,
        album: applyFieldAlbum,
        cover: applyFieldCover,
        lyrics: applyFieldLyrics,
      },
      lyricOffsetStepMs,
    }),
    [
      theme, alwaysOnTop, rescanOnStartup, isMuted, prevVolume, playback.volume, shuffle,
      repeatMode, npArtMax, showLeftSidebar, showRightLyricsInLib, lyricsPaneWidth,
      npHeroRatio, colWidths, sortField, sortAsc, saveLrcFile, applyFieldTitle,
      applyFieldArtist, applyFieldAlbum, applyFieldCover, applyFieldLyrics, lyricOffsetStepMs,
    ],
  );

  // Debounced so drags (pane widths, volume) don't write on every frame
  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem(THEME_CACHE_KEY, currentSettings.theme);
    } catch {
      // ignore
    }
    const timer = setTimeout(() => {
      api.saveSettings({ ...currentSettings }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [settingsLoaded, currentSettings]);

  const openSettings = (tab: SettingsTab = "general") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
    api.getAppInfo().then(setAppInfo).catch(() => {});
  };

  const handleRescanLibrary = async (force: boolean) => {
    try {
      await api.rescanLibrary(force);
      notify(force ? "전체 라이브러리를 다시 색인합니다." : "변경된 파일을 다시 색인합니다.");
    } catch (err) {
      notify(`색인 시작 실패: ${err}`);
    }
  };

  // Initial Library Load (served from the SQLite index cache; the backend
  // re-indexes changed files in the background and signals via events)
  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const loadLibrary = () =>
      api
        .getLibraryState()
        .then((snap) => {
          if (disposed) return;
          setTracks(snap.tracks);
          setFolders(snap.folders);
          setPlaylists(snap.playlists);
        })
        .catch((err) => notify(`라이브러리 로드 오류: ${err}`));

    (async () => {
      // Subscribe before the first fetch so no background update is missed.
      unlisteners.push(
        await onLibraryScanProgress((p) => setScanProgress(p.done ? null : p)),
        await onLibraryChanged(() => void loadLibrary()),
      );
      if (disposed) {
        unlisteners.forEach((fn) => fn());
        return;
      }
      await loadLibrary();
      const status = await api.getScanStatus().catch(() => null);
      if (!disposed && status && !status.done) setScanProgress(status);
    })();

    return () => {
      disposed = true;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  // Clear track selection whenever navigating between categories or sub-views
  useEffect(() => {
    setSelectedIds([]);
    setLastClickedId(null);
  }, [navCategory, subFilter, activePlaylistId]);

  // Playback State Polling (Protected against overwriting active seek/volume drags)
  useEffect(() => {
    const timer = setInterval(async () => {
      if (isDraggingSeekRef.current) return;
      try {
        const s = await api.getPlaybackState();
        if (isDraggingSeekRef.current) return;
        const now = Date.now();
        setPlayback((prev) => ({
          ...s,
          positionSecs:
            now < seekGuardUntilRef.current ? prev.positionSecs : s.positionSecs,
          volume:
            now < volumeGuardUntilRef.current ? prev.volume : s.volume,
        }));
      } catch {
        // ignore
      }
    }, 160);
    return () => clearInterval(timer);
  }, []);

  // Advance track on completion
  useEffect(() => {
    if (playback.isEnded && playback.currentTrackId !== null) {
      handleNextTrack(true);
    }
  }, [playback.isEnded]);

  // Close context menu on click anywhere
  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
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

  // Filtered & Sorted Tracks (Natural Sort Guaranteed)
  const displayedTracks = useMemo(() => {
    let list = [...tracks];

    if (navCategory === "favorites") {
      list = list.filter((t) => t.isFavorite);
    } else if (navCategory === "playlist" && activePlaylistId !== null) {
      const pl = playlists.find((p) => p.id === activePlaylistId);
      if (pl) {
        const set = new Set(pl.trackIds);
        list = list.filter((t) => set.has(t.id));
      }
    } else if (navCategory === "artists" && subFilter) {
      list = list.filter((t) => t.artist === subFilter);
    } else if (navCategory === "albums" && subFilter) {
      list = list.filter((t) => t.album === subFilter);
    } else if (navCategory === "folders" && subFilter) {
      list = list.filter((t) => t.folderPath === subFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q) ||
          t.genre.toLowerCase().includes(q) ||
          t.fileName.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "trackNumber") {
        cmp =
          (a.trackNumber ?? 99999) - (b.trackNumber ?? 99999) ||
          naturalCompare(a.fileName, b.fileName) ||
          naturalCompare(a.title, b.title);
      } else if (sortField === "title") {
        cmp =
          naturalCompare(a.title, b.title) ||
          naturalCompare(a.fileName, b.fileName);
      } else if (sortField === "artist") {
        cmp =
          naturalCompare(a.artist, b.artist) ||
          naturalCompare(a.album, b.album) ||
          (a.trackNumber ?? 99999) - (b.trackNumber ?? 99999) ||
          naturalCompare(a.title, b.title);
      } else if (sortField === "album") {
        cmp =
          naturalCompare(a.album, b.album) ||
          (a.trackNumber ?? 99999) - (b.trackNumber ?? 99999) ||
          naturalCompare(a.fileName, b.fileName) ||
          naturalCompare(a.title, b.title);
      } else if (sortField === "durationSecs") {
        cmp =
          a.durationSecs - b.durationSecs ||
          naturalCompare(a.title, b.title);
      } else if (sortField === "year") {
        cmp =
          (a.year ?? 0) - (b.year ?? 0) ||
          naturalCompare(a.album, b.album) ||
          naturalCompare(a.title, b.title);
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [
    tracks,
    navCategory,
    activePlaylistId,
    playlists,
    subFilter,
    searchQuery,
    sortField,
    sortAsc,
  ]);

  // Currently playing track & inspected track
  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === playback.currentTrackId) || null,
    [tracks, playback.currentTrackId]
  );

  const primarySelectedTrack = useMemo(() => {
    if (selectedIds.length > 0) {
      const found = tracks.find((t) => t.id === selectedIds[0]);
      if (found) return found;
    }
    return currentTrack || displayedTracks[0] || tracks[0] || null;
  }, [tracks, displayedTracks, selectedIds, currentTrack]);

  const activeTrack = currentTrack || primarySelectedTrack;

  const dialogTracks = useMemo(
    () => tracks.filter((t) => dialogTrackIds.includes(t.id)),
    [tracks, dialogTrackIds]
  );
  const dialogPrimaryTrack = dialogTracks[0] || activeTrack;

  // Total duration of displayed tracks
  const totalDisplayedDuration = useMemo(
    () => displayedTracks.reduce((acc, t) => acc + (t.durationSecs || 0), 0),
    [displayedTracks]
  );

  // Contextual View Mode per Category:
  // - "all" -> "grouped"
  // - "favorites" / "playlist" -> "flat"
  // - "artists" / "albums" / "folders" -> Grid when subFilter === null, "grouped" when drilled down!
  const effectiveLibView = useMemo<
    "grouped" | "flat" | "artist-grid" | "album-grid" | "folder-grid"
  >(() => {
    if (navCategory === "all") return "grouped";
    if (navCategory === "favorites" || navCategory === "playlist") return "flat";
    if (navCategory === "artists") {
      return subFilter === null ? "artist-grid" : "grouped";
    }
    if (navCategory === "albums") {
      return subFilter === null ? "album-grid" : "grouped";
    }
    if (navCategory === "folders") {
      return subFilter === null ? "folder-grid" : "grouped";
    }
    return "grouped";
  }, [navCategory, subFilter]);

  // Search-filtered base tracks for Grid views (Artists / Albums / Folders)
  const searchFilteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const q = searchQuery.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        t.genre.toLowerCase().includes(q) ||
        t.fileName.toLowerCase().includes(q)
    );
  }, [tracks, searchQuery]);

  // Artist Grid Cards (for "artists" top-level grid & Player Mode browser)
  const artistCards = useMemo(() => {
    const map = new Map<
      string,
      {
        artist: string;
        cover: string;
        albums: Set<string>;
        tracks: Track[];
      }
    >();
    for (const t of searchFilteredTracks) {
      const key = t.artist || "Unknown Artist";
      if (!map.has(key)) {
        map.set(key, {
          artist: key,
          cover: t.coverDataUrl || getFallbackCoverUrl(key, t.album),
          albums: new Set([t.album]),
          tracks: [t],
        });
      } else {
        const entry = map.get(key)!;
        entry.albums.add(t.album);
        entry.tracks.push(t);
        if (!entry.cover.startsWith("data:image/jpeg") && t.coverDataUrl) {
          entry.cover = t.coverDataUrl;
        }
      }
    }
    return Array.from(map.values())
      .map((item) => ({
        artist: item.artist,
        cover: item.cover,
        albumCount: item.albums.size,
        trackCount: item.tracks.length,
        tracks: item.tracks,
      }))
      .sort((a, b) => naturalCompare(a.artist, b.artist));
  }, [searchFilteredTracks]);

  // Album Grid Cards (for "albums" top-level grid & Player Mode browser)
  const albumCards = useMemo(() => {
    const map = new Map<
      string,
      {
        album: string;
        artist: string;
        year: number | null;
        cover: string;
        tracks: Track[];
      }
    >();
    for (const t of searchFilteredTracks) {
      const key = t.album || "Unknown Album";
      if (!map.has(key)) {
        map.set(key, {
          album: key,
          artist: t.albumArtist || t.artist,
          year: t.year,
          cover: t.coverDataUrl || getFallbackCoverUrl(key, t.artist),
          tracks: [t],
        });
      } else {
        const entry = map.get(key)!;
        entry.tracks.push(t);
        if (!entry.cover.startsWith("data:image/jpeg") && t.coverDataUrl) {
          entry.cover = t.coverDataUrl;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      naturalCompare(a.album, b.album)
    );
  }, [searchFilteredTracks]);

  // Folder Grid Cards (for "folders" top-level grid & Player Mode browser)
  const folderCards = useMemo(() => {
    const map = new Map<
      string,
      {
        folderPath: string;
        folderName: string;
        cover: string;
        tracks: Track[];
      }
    >();
    for (const t of searchFilteredTracks) {
      const key = t.folderPath;
      if (!map.has(key)) {
        const folderName = key.split(/[\\/]/).pop() || key;
        map.set(key, {
          folderPath: key,
          folderName,
          cover: t.coverDataUrl || getFallbackCoverUrl(folderName, t.artist),
          tracks: [t],
        });
      } else {
        const entry = map.get(key)!;
        entry.tracks.push(t);
        if (!entry.cover.startsWith("data:image/jpeg") && t.coverDataUrl) {
          entry.cover = t.coverDataUrl;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      naturalCompare(a.folderName, b.folderName)
    );
  }, [searchFilteredTracks]);

  // Album Groups (for Grouped View of displayedTracks)
  const albumGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        album: string;
        artist: string;
        year: number | null;
        cover: string;
        tracks: Track[];
      }
    >();
    for (const t of displayedTracks) {
      const key = `${t.album}__${t.albumArtist || t.artist}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          album: t.album,
          artist: t.albumArtist || t.artist,
          year: t.year,
          cover: t.coverDataUrl || getFallbackCoverUrl(t.album, t.artist),
          tracks: [t],
        });
      } else {
        const g = map.get(key)!;
        g.tracks.push(t);
        if (!g.cover.startsWith("data:image/jpeg") && t.coverDataUrl) {
          g.cover = t.coverDataUrl;
        }
      }
    }
    return Array.from(map.values());
  }, [displayedTracks]);

  const effectivePositionSecs =
    seekPreviewSecs !== null ? seekPreviewSecs : playback.positionSecs;
  const effectiveDurationSecs =
    playback.durationSecs || activeTrack?.durationSecs || 0;

  // Synced & Plain Lyrics Line Parsing & Centered Auto-Scroll
  const lyricLines = useMemo(() => {
    if (!activeTrack) return [];
    return buildDisplayLyricLines(
      activeTrack.syncedLyrics,
      activeTrack.plainLyrics,
      activeTrack.lyricOffsetMs,
      activeTrack.durationSecs
    );
  }, [activeTrack]);

  const activeLyricIdx = useMemo(
    () => findActiveLyricIndex(lyricLines, effectivePositionSecs),
    [lyricLines, effectivePositionSecs]
  );

  useEffect(() => {
    if (activeLyricIdx < 0) return;
    const scrollTarget = (box: HTMLDivElement | null) => {
      if (!box) return;
      const el = box.querySelector(
        `[data-lrc-idx="${activeLyricIdx}"]`
      ) as HTMLElement | null;
      if (el) {
        const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
        box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    };
    scrollTarget(lyricsBoxRef.current);
    scrollTarget(playerLyricsRef.current);
    scrollTarget(npLyricsRef.current);
  }, [activeLyricIdx, activeTrack?.id, appMode, showRightLyricsInLib, nowPlayingOpen]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.code === "Escape" && coverZoom) {
        setCoverZoom(null);
        return;
      }
      if (e.code === "Escape" && settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (e.code === "Escape" && dialogOpen) {
        setDialogOpen(false);
        return;
      }
      if (e.code === "Escape" && nowPlayingOpen) {
        setNowPlayingOpen(false);
        return;
      }
      if (dialogOpen || settingsOpen) return;

      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === "Enter" && e.altKey) {
        e.preventDefault();
        openPropertiesDialog("tags");
      } else if (e.code === "Enter" && selectedIds.length > 0) {
        e.preventDefault();
        handlePlayTrack(selectedIds[0]);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(displayedTracks.map((t) => t.id));
      } else if (e.code === "Delete" && selectedIds.length > 0) {
        e.preventDefault();
        handleDeleteSelected();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSeek(Math.min(playback.durationSecs, playback.positionSecs + 5));
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleSeek(Math.max(0, playback.positionSecs - 5));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playback, selectedIds, displayedTracks, dialogOpen, nowPlayingOpen, coverZoom, settingsOpen]);

  // Playback Handlers
  const handlePlayTrack = async (trackId: number) => {
    try {
      const state = await api.playTrack(trackId);
      setPlayback(state);
    } catch (err) {
      notify(`재생 실패: ${err}`);
    }
  };

  const handleTogglePlay = async () => {
    try {
      if (playback.currentTrackId === null) {
        const first = selectedIds[0] || displayedTracks[0]?.id || tracks[0]?.id;
        if (first) await handlePlayTrack(first);
        return;
      }
      if (playback.isPlaying) {
        const state = await api.pausePlayback();
        setPlayback(state);
      } else {
        if (
          playback.durationSecs > 0 &&
          playback.positionSecs >= playback.durationSecs - 0.25
        ) {
          await handlePlayTrack(playback.currentTrackId);
        } else {
          const state = await api.resumePlayback();
          setPlayback(state);
        }
      }
    } catch (err) {
      notify(`재생 제어 오류: ${err}`);
    }
  };

  const getActiveQueueIds = (): number[] => {
    const dispIds = displayedTracks.map((t) => t.id);
    if (
      dispIds.length > 0 &&
      (playback.currentTrackId === null ||
        dispIds.includes(playback.currentTrackId))
    ) {
      return dispIds;
    }
    return tracks.map((t) => t.id);
  };

  const handleNextTrack = async (fromAutoEnd = false) => {
    const q = getActiveQueueIds();
    if (q.length === 0) return;

    if (fromAutoEnd && repeatMode === "one" && playback.currentTrackId !== null) {
      await handlePlayTrack(playback.currentTrackId);
      return;
    }

    if (shuffle && q.length > 1) {
      const rest = q.filter((id) => id !== playback.currentTrackId);
      const pick = rest[Math.floor(Math.random() * rest.length)];
      await handlePlayTrack(pick);
      return;
    }

    const idx =
      playback.currentTrackId !== null ? q.indexOf(playback.currentTrackId) : -1;
    if (idx >= 0 && idx + 1 < q.length) {
      await handlePlayTrack(q[idx + 1]);
    } else if (repeatMode === "all" || !fromAutoEnd) {
      await handlePlayTrack(q[0]);
    }
  };

  const handlePrevTrack = async () => {
    if (playback.positionSecs > 3.5) {
      await handleSeek(0);
      return;
    }
    const q = getActiveQueueIds();
    if (q.length === 0) return;
    const idx =
      playback.currentTrackId !== null ? q.indexOf(playback.currentTrackId) : 0;
    const prevIdx = idx > 0 ? idx - 1 : q.length - 1;
    await handlePlayTrack(q[prevIdx]);
  };

  const handleSeekPreview = (posSecs: number) => {
    isDraggingSeekRef.current = true;
    seekGuardUntilRef.current = Date.now() + 800;
    setSeekPreviewSecs(posSecs);
  };

  const handleSeek = async (posSecs: number) => {
    const clampedPos = Math.max(
      0,
      Math.min(effectiveDurationSecs || posSecs, posSecs)
    );
    isDraggingSeekRef.current = false;
    seekGuardUntilRef.current = Date.now() + 700;
    // Optimistically update playback.positionSecs in the same synchronous batch as clearing seekPreviewSecs
    // so the slider NEVER snaps backward to the old position while awaiting IPC!
    setPlayback((prev) => ({ ...prev, positionSecs: clampedPos }));
    setSeekPreviewSecs(null);

    try {
      if (playback.currentTrackId === null && activeTrack) {
        await api.playTrack(activeTrack.id);
      }
      const state = await api.seekPlayback(clampedPos);
      seekGuardUntilRef.current = Date.now() + 250;
      setPlayback((prev) => ({
        ...state,
        positionSecs: clampedPos,
        volume:
          Date.now() < volumeGuardUntilRef.current ? prev.volume : state.volume,
      }));
    } catch {
      // ignore
    }
  };

  const handleSetVolume = async (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    volumeGuardUntilRef.current = Date.now() + 500;
    setIsMuted(clamped === 0);
    if (clamped > 0) setPrevVolume(clamped);
    setPlayback((prev) => ({ ...prev, volume: clamped }));
    try {
      await api.setVolume(clamped);
    } catch {
      // ignore
    }
  };

  const handleToggleMute = async () => {
    if (isMuted || playback.volume === 0) {
      setIsMuted(false);
      const state = await api.setVolume(prevVolume || 0.85);
      setPlayback(state);
    } else {
      setPrevVolume(playback.volume);
      setIsMuted(true);
      const state = await api.setVolume(0);
      setPlayback(state);
    }
  };

  const handleCycleSpeed = async () => {
    const speeds = [0.75, 1.0, 1.25, 1.5];
    const idx = speeds.findIndex((s) => Math.abs(s - playback.speed) < 0.05);
    const next = speeds[(idx + 1) % speeds.length];
    const state = await api.setSpeed(next);
    setPlayback(state);
    notify(`재생 배속: ${next}x`);
  };

  // Selection & Context Menu
  const handleRowClick = (trackId: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedId !== null) {
      const ids = displayedTracks.map((t) => t.id);
      const a = ids.indexOf(lastClickedId);
      const b = ids.indexOf(trackId);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedIds(ids.slice(lo, hi + 1));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) =>
        prev.includes(trackId)
          ? prev.filter((id) => id !== trackId)
          : [...prev, trackId]
      );
      setLastClickedId(trackId);
      return;
    }
    setSelectedIds([trackId]);
    setLastClickedId(trackId);
  };

  const handleRowContextMenu = (track: Track, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedIds.includes(track.id)) {
      setSelectedIds([track.id]);
      setLastClickedId(track.id);
    }
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - 235));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - 250));
    setCtxMenu({ x, y, track });
  };

  // Folder & File Import
  const handleAddFolder = async () => {
    const folder = await pickFolderDialog();
    if (!folder) return;
    try {
      const snap = await api.scanFolder(folder);
      setTracks(snap.tracks);
      setFolders(snap.folders);
      setPlaylists(snap.playlists);
      notify("폴더를 추가했습니다. 백그라운드에서 색인합니다.");
    } catch (err) {
      notify(`스캔 실패: ${err}`);
    }
  };

  const handleAddFiles = async () => {
    const files = await pickAudioFilesDialog();
    if (files.length === 0) return;
    try {
      const snap = await api.importFiles(files);
      setTracks(snap.tracks);
      setFolders(snap.folders);
      setPlaylists(snap.playlists);
      if (selectedIds.length === 0 && snap.tracks.length > 0) {
        setSelectedIds([snap.tracks[0].id]);
      }
      notify(`${files.length}개 파일 추가 완료`);
    } catch (err) {
      notify(`파일 추가 실패: ${err}`);
    }
  };

  const handleToggleFavorite = async (trackId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const fav = await api.toggleFavorite(trackId);
      setTracks((prev) =>
        prev.map((t) => (t.id === trackId ? { ...t, isFavorite: fav } : t))
      );
    } catch {
      // ignore
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) {
      notify("제거할 곡을 먼저 선택하세요.");
      return;
    }
    try {
      if (navCategory === "playlist" && activePlaylistId !== null) {
        let updatedPls = playlists;
        for (const tid of selectedIds) {
          updatedPls = await api.removeTrackFromPlaylist(activePlaylistId, tid);
        }
        setPlaylists(updatedPls);
        setSelectedIds([]);
        notify("플레이리스트에서 선택 곡이 제거되었습니다.");
      } else {
        const snap = await api.deleteTracksFromLibrary(selectedIds);
        setTracks(snap.tracks);
        setFolders(snap.folders);
        setPlaylists(snap.playlists);
        setSelectedIds([]);
        notify("라이브러리에서 선택 곡이 제거되었습니다.");
      }
    } catch (err) {
      notify(`${err}`);
    }
  };

  // Properties / Tag Dialog Logic (Includes Auto-Matching Sub-menu with User Confirmation!)
  const openPropertiesDialog = (
    initialTab: DialogTab = "tags",
    overrideIds?: number[]
  ) => {
    const targetIds =
      overrideIds && overrideIds.length > 0
        ? overrideIds
        : selectedIds.length > 0
          ? selectedIds
          : activeTrack
            ? [activeTrack.id]
            : [];
    if (targetIds.length === 0) {
      notify("편집할 곡을 먼저 선택하세요.");
      return;
    }

    const selTracks = tracks.filter((t) => targetIds.includes(t.id));
    if (selTracks.length === 0) return;

    setDialogTrackIds(targetIds);

    if (selTracks.length === 1) {
      const t = selTracks[0];
      setTagTitle(t.title);
      setTagArtist(t.artist);
      setTagAlbum(t.album);
      setTagAlbumArtist(t.albumArtist);
      setTagTrackNum(t.trackNumber ? String(t.trackNumber) : "");
      setTagYear(t.year ? String(t.year) : "");
      setTagGenre(t.genre);
      setTagCoverUrl("");
      setTagAutoNumber(false);
      const q =
        t.artist && t.artist !== "Unknown Artist"
          ? `${t.artist} ${t.title}`
          : t.title;
      setManualMbQuery(q);
      setLrcSearchQuery(q);
      setLyricDraft(t.syncedLyrics || t.plainLyrics || "");
    } else {
      const artists = new Set(selTracks.map((t) => t.artist));
      const albums = new Set(selTracks.map((t) => t.album));
      const albumArtists = new Set(selTracks.map((t) => t.albumArtist));
      const years = new Set(selTracks.map((t) => t.year));
      const genres = new Set(selTracks.map((t) => t.genre));

      setTagTitle("");
      setTagArtist(artists.size === 1 ? [...artists][0] : "");
      setTagAlbum(albums.size === 1 ? [...albums][0] : "");
      setTagAlbumArtist(albumArtists.size === 1 ? [...albumArtists][0] : "");
      setTagTrackNum("");
      setTagYear(
        years.size === 1 && [...years][0] ? String([...years][0]) : ""
      );
      setTagGenre(genres.size === 1 ? [...genres][0] : "");
      setTagCoverUrl("");
      setTagAutoNumber(false);
      const first = selTracks[0];
      const q =
        first.artist && first.artist !== "Unknown Artist"
          ? `${first.artist} ${first.title}`
          : first.title;
      setManualMbQuery(q);
      setLrcSearchQuery(q);
      setLyricDraft(first.syncedLyrics || first.plainLyrics || "");
    }

    setMatchPreviews([]);
    setMatchCheckedMap({});
    setMatchSelectedCandIdx({});
    setLrcResults([]);
    setDialogTab(initialTab);
    setDialogOpen(true);
  };

  const handleSaveTags = async () => {
    if (dialogTrackIds.length === 0) return;

    try {
      const updated = await api.updateTags({
        trackIds: dialogTrackIds,
        title: tagTitle.trim() || null,
        artist: tagArtist.trim() || null,
        album: tagAlbum.trim() || null,
        albumArtist: tagAlbumArtist.trim() || null,
        trackNumber: tagTrackNum ? parseInt(tagTrackNum, 10) : null,
        autoNumber: tagAutoNumber,
        year: tagYear ? parseInt(tagYear, 10) : null,
        genre: tagGenre.trim() || null,
        coverDataUrl: tagCoverUrl.trim() || null,
        saveLrcFile: false,
      });
      setTracks(updated);
      setDialogOpen(false);
      notify(`${dialogTrackIds.length}곡 태그가 저장되었습니다.`);
    } catch (err) {
      notify(`태그 저장 실패: ${err}`);
    }
  };

  const handleApplyPattern = async () => {
    if (dialogTrackIds.length === 0 || !filenamePattern.trim()) return;
    try {
      const updated = await api.applyFilenamePattern({
        trackIds: dialogTrackIds,
        pattern: filenamePattern.trim(),
      });
      setTracks(updated);
      setDialogOpen(false);
      notify(`${dialogTrackIds.length}곡 파일명에서 태그를 추출했습니다.`);
    } catch (err) {
      notify(`추출 실패: ${err}`);
    }
  };

  // Read-only Auto-Match Preview Lookup (NEVER overwrites without user confirmation!)
  const handleLookupAutoMatchPreview = async () => {
    if (dialogTrackIds.length === 0) return;
    setMatchLoading(true);
    try {
      const previews = await api.previewAutoMatch(dialogTrackIds);
      setMatchPreviews(previews);
      const nextChecked: Record<number, boolean> = {};
      const nextCandIdx: Record<number, number> = {};
      for (const p of previews) {
        const hasMatch =
          p.candidates.length > 0 ||
          Boolean(p.matchedSyncedLyrics) ||
          Boolean(p.matchedPlainLyrics);
        nextChecked[p.trackId] = hasMatch;
        nextCandIdx[p.trackId] = 0;
      }
      setMatchCheckedMap(nextChecked);
      setMatchSelectedCandIdx(nextCandIdx);
    } catch (err) {
      notify(`매칭 후보 조회 실패: ${err}`);
    } finally {
      setMatchLoading(false);
    }
  };

  // Manual keyword search for single track inside Auto-Match tab (stages into preview list)
  const handleManualMbSearch = async () => {
    const t = dialogPrimaryTrack;
    if (!t) return;
    setMatchLoading(true);
    try {
      const cands = await api.searchTrackMetadata(
        t.id,
        manualMbQuery.trim() || undefined
      );
      setMatchPreviews((prev) => {
        const existing = prev.find((p) => p.trackId === t.id);
        const entry: TrackMatchPreview = {
          trackId: t.id,
          candidates: cands,
          matchedSyncedLyrics: existing?.matchedSyncedLyrics || null,
          matchedPlainLyrics: existing?.matchedPlainLyrics || null,
        };
        const others = prev.filter((p) => p.trackId !== t.id);
        return [entry, ...others];
      });
      setMatchCheckedMap((prev) => ({
        ...prev,
        [t.id]: cands.length > 0,
      }));
      setMatchSelectedCandIdx((prev) => ({
        ...prev,
        [t.id]: 0,
      }));
      if (cands.length === 0) {
        notify("일치하는 온라인 후보를 찾지 못했습니다.");
      }
    } catch (err) {
      notify(`검색 오류: ${err}`);
    } finally {
      setMatchLoading(false);
    }
  };

  // User explicitly confirms and applies checked matches & checked fields
  const handleConfirmApplyMatches = async () => {
    const items: ConfirmTrackMatchItem[] = [];
    for (const p of matchPreviews) {
      if (!matchCheckedMap[p.trackId]) continue;
      const candIdx = matchSelectedCandIdx[p.trackId] ?? 0;
      const cand: MusicBrainzCandidate | undefined =
        candIdx >= 0 ? p.candidates[candIdx] : undefined;

      items.push({
        trackId: p.trackId,
        title: applyFieldTitle && cand ? cand.title : null,
        artist: applyFieldArtist && cand ? cand.artist : null,
        album: applyFieldAlbum && cand ? cand.album : null,
        year: applyFieldAlbum && cand ? cand.year : null,
        trackNumber: applyFieldAlbum && cand ? cand.trackNumber : null,
        recordingId: cand ? cand.recordingId : null,
        releaseId: cand ? cand.releaseId : null,
        applyCover: Boolean(applyFieldCover && cand && cand.releaseId),
        syncedLyrics: applyFieldLyrics ? p.matchedSyncedLyrics : null,
        plainLyrics: applyFieldLyrics ? p.matchedPlainLyrics : null,
      });
    }

    if (items.length === 0) {
      notify("적용할 항목을 먼저 선택하세요.");
      return;
    }

    setMatchLoading(true);
    try {
      const updated = await api.applyConfirmedMatches(items);
      setTracks(updated);
      setDialogOpen(false);
      notify(`${items.length}곡의 선택한 매칭 정보가 적용되었습니다.`);
    } catch (err) {
      notify(`매칭 적용 실패: ${err}`);
    } finally {
      setMatchLoading(false);
    }
  };

  // Lyrics Search & Preview Load (Loads into lyricDraft for inspection before saving!)
  const handleSearchLrcManual = async () => {
    if (!lrcSearchQuery.trim()) return;
    setLrcLoading(true);
    try {
      const list = await api.searchLyricsManual(lrcSearchQuery.trim());
      setLrcResults(list);
      if (list.length === 0) notify("검색된 가사가 없습니다.");
    } catch (err) {
      notify(`가사 검색 실패: ${err}`);
    } finally {
      setLrcLoading(false);
    }
  };

  const handleLoadLrcCandidateToDraft = (cand: LrcLibTrack) => {
    const text = cand.syncedLyrics || cand.plainLyrics || "";
    setLyricDraft(text);
    notify("가사 편집창에 미리보기가 로드되었습니다. 확인 후 [가사 저장]을 누르세요.");
  };

  const handleSaveEditedLyrics = async () => {
    const t = dialogPrimaryTrack;
    if (!t) return;
    try {
      const hasTime = /\[\d{1,3}:\d{2}/.test(lyricDraft);
      const updated = await api.applyLyricsToTrack(
        t.id,
        hasTime ? lyricDraft : null,
        lyricDraft,
        saveLrcFile
      );
      setTracks((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      setDialogOpen(false);
      notify("가사가 저장되었습니다.");
    } catch (err) {
      notify(`저장 실패: ${err}`);
    }
  };

  const handleOffsetChange = async (deltaMs: number) => {
    if (!activeTrack) return;
    const next = deltaMs === 0 ? 0 : activeTrack.lyricOffsetMs + deltaMs;
    try {
      const updated = await api.updateLyricOffset(activeTrack.id, next);
      setTracks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
    } catch {
      // ignore
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setTagCoverUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreatePlaylist = async () => {
    if (creatingPlaylistRef.current) return;
    const trimmed = newPlaylistName.trim();
    if (!trimmed) {
      setAddingPlaylist(false);
      return;
    }
    creatingPlaylistRef.current = true;
    try {
      const list = await api.createPlaylist(trimmed);
      setPlaylists(list);
      setNewPlaylistName("");
      setAddingPlaylist(false);
      notify(`'${trimmed}' 플레이리스트가 생성되었습니다.`);
    } catch (err) {
      notify(`${err}`);
    } finally {
      creatingPlaylistRef.current = false;
    }
  };

  const handleDeletePlaylist = async (pl: Playlist, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const list = await api.deletePlaylist(pl.id);
      setPlaylists(list);
      if (navCategory === "playlist" && activePlaylistId === pl.id) {
        setNavCategory("all");
        setActivePlaylistId(null);
      }
      notify(`'${pl.name}' 플레이리스트가 삭제되었습니다.`);
    } catch (err) {
      notify(`${err}`);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const cycleStackSort = () => {
    const order: SortField[] = ["album", "title", "artist", "durationSecs"];
    const next = order[(order.indexOf(sortField) + 1) % order.length];
    setSortField(next);
    const label =
      next === "album"
        ? "앨범·트랙순"
        : next === "title"
          ? "제목순"
          : next === "artist"
            ? "아티스트순"
            : "재생시간순";
    notify(`정렬: ${label}`);
  };

  const activeCover =
    activeTrack?.coverDataUrl ||
    getFallbackCoverUrl(
      activeTrack?.title || "Lof",
      activeTrack?.artist || "Audio"
    );

  const currentViewTitle =
    navCategory === "all"
      ? "모든 음악"
      : navCategory === "favorites"
        ? "즐겨찾기"
        : navCategory === "artists"
          ? subFilter || "아티스트"
          : navCategory === "albums"
            ? subFilter || "앨범"
            : navCategory === "folders"
              ? subFilter
                ? subFilter.split(/[\\/]/).pop()
                : "폴더"
              : playlists.find((p) => p.id === activePlaylistId)?.name ||
                "플레이리스트";

  const confirmedMatchCount = useMemo(
    () =>
      matchPreviews.filter((p) => Boolean(matchCheckedMap[p.trackId])).length,
    [matchPreviews, matchCheckedMap]
  );

  return (
    <div className="tauri-app">
      {/* ======================== UNIFIED 3-COLUMN GRID TITLEBAR ======================== */}
      <header
        className="titlebar"
        // One handler for both gestures: the OS swallows `dblclick` once a drag starts,
        // so the second press (detail === 2) toggles maximize instead of dragging again.
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
          if (e.detail === 2) {
            toggleMaximizeWindow();
          } else {
            startWindowDrag();
          }
        }}
      >
        <div className="titlebar-left">
          <div className="app-badge">
            <div className="app-badge-dot">
              {/* viewBox cropped to the note glyph (the 1024 app-icon canvas leaves it tiny at badge size) */}
              <svg width="13" height="13" viewBox="165 140 704 704" fill="none">
                <path
                  d="M 464 292 C 464 246, 488 222, 528 212 L 728 160 C 766 150, 788 170, 788 208 L 788 286 C 788 326, 764 348, 726 359 L 560 403 C 528 412, 516 430, 516 466 L 516 680 C 516 756, 442 824, 354 824 C 284 824, 246 776, 246 716 C 246 634, 326 554, 410 554 C 426 554, 438 556, 448 559 C 460 561, 464 554, 464 538 Z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <span>Lof</span>
          </div>

          {appMode === "library" && (
            <button
              className={`ui-btn ghost icon-only ${showLeftSidebar ? "active" : ""}`}
              onClick={() => setShowLeftSidebar(!showLeftSidebar)}
              title="좌측 사이드바 표시/숨기기"
            >
              <PanelLeft size={14} />
            </button>
          )}
        </div>

        {/* Center Drag Area (Responsive Layout switches automatically by window width) */}
        <div className="titlebar-center" />

        {/* Right Theme / Pin & Native Window Caption Controls */}
        <div className="titlebar-right">
          <div className="titlebar-actions">
            <button
              className={`ui-btn ghost icon-only ${alwaysOnTop ? "active" : ""}`}
              onClick={handleTogglePin}
              title={alwaysOnTop ? "항상 위 고정 해제" : "창 항상 위에 고정"}
            >
              <Pin size={13} />
            </button>
            <button
              className={`ui-btn ghost icon-only ${settingsOpen ? "active" : ""}`}
              onClick={() => openSettings()}
              title="설정"
            >
              <SettingsIcon size={14} />
            </button>
            <button
              className="ui-btn ghost icon-only"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={theme === "light" ? "다크 테마로 전환" : "라이트 테마로 전환"}
            >
              {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
            </button>
          </div>

          <div className="win-controls">
            <button className="win-btn" onClick={minimizeWindow} title="최소화">
              <Minus size={14} />
            </button>
            <button
              className="win-btn"
              onClick={toggleMaximizeWindow}
              title={isMaximized ? "이전 크기로 복원" : "최대화"}
            >
              {isMaximized ? (
                // Restore glyph: two overlapping windows, as in native title bars
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                >
                  <rect x="1" y="3.5" width="7.5" height="7.5" rx="1" />
                  <path d="M3.5 3.5V2a1 1 0 0 1 1-1H10a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H8.5" />
                </svg>
              ) : (
                <Square size={12} />
              )}
            </button>
            <button
              className="win-btn close"
              onClick={closeWindow}
              title="종료"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* ===========================================================================
          MODE 1: WIDE LIBRARY WORKSPACE (Flat Split Workspace)
         =========================================================================== */}
      {appMode === "library" && (
        <>
          <div className="app-body">
            {showLeftSidebar && (
              <aside className="app-sidebar">
                {/* Search Box inside Sidebar */}
                <div className="sidebar-search-wrap">
                  <Search size={13} className="sidebar-search-icon" />
                  <input
                    className="sidebar-search-input"
                    placeholder="곡, 아티스트, 앨범 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      className="sidebar-search-clear"
                      onClick={() => setSearchQuery("")}
                      title="검색어 지우기"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="sidebar-section">
                  <div className="sidebar-heading">보관함</div>
                  <button
                    className={`sidebar-item ${
                      !nowPlayingOpen && navCategory === "all" ? "active" : ""
                    }`}
                    onClick={() => {
                      setNavCategory("all");
                      setSubFilter(null);
                      setNowPlayingOpen(false);
                    }}
                  >
                    <span className="sidebar-item-left">
                      <Music size={14} /> 모든 음악
                    </span>
                    <span className="sidebar-count">{tracks.length}</span>
                  </button>
                  <button
                    className={`sidebar-item ${
                      !nowPlayingOpen && navCategory === "favorites"
                        ? "active"
                        : ""
                    }`}
                    onClick={() => {
                      setNavCategory("favorites");
                      setSubFilter(null);
                      setNowPlayingOpen(false);
                    }}
                  >
                    <span className="sidebar-item-left">
                      <Heart size={14} /> 즐겨찾기
                    </span>
                    <span className="sidebar-count">
                      {tracks.filter((t) => t.isFavorite).length}
                    </span>
                  </button>
                  <button
                    className={`sidebar-item ${
                      !nowPlayingOpen && navCategory === "artists" ? "active" : ""
                    }`}
                    onClick={() => {
                      setNavCategory("artists");
                      setSubFilter(null);
                      setNowPlayingOpen(false);
                    }}
                  >
                    <span className="sidebar-item-left">
                      <Mic2 size={14} /> 아티스트
                    </span>
                    <span className="sidebar-count">
                      {new Set(tracks.map((t) => t.artist)).size}
                    </span>
                  </button>
                  <button
                    className={`sidebar-item ${
                      !nowPlayingOpen && navCategory === "albums" ? "active" : ""
                    }`}
                    onClick={() => {
                      setNavCategory("albums");
                      setSubFilter(null);
                      setNowPlayingOpen(false);
                    }}
                  >
                    <span className="sidebar-item-left">
                      <Disc size={14} /> 앨범
                    </span>
                    <span className="sidebar-count">
                      {new Set(tracks.map((t) => t.album)).size}
                    </span>
                  </button>
                  <button
                    className={`sidebar-item ${
                      !nowPlayingOpen && navCategory === "folders" ? "active" : ""
                    }`}
                    onClick={() => {
                      setNavCategory("folders");
                      setSubFilter(null);
                      setNowPlayingOpen(false);
                    }}
                  >
                    <span className="sidebar-item-left">
                      <FolderPlus size={14} /> 폴더
                    </span>
                    <span className="sidebar-count">{folders.length}</span>
                  </button>
                </div>

                {/* Playlists */}
                <div className="sidebar-section">
                  <div className="sidebar-heading">
                    <span>플레이리스트</span>
                    <button
                      className="ui-btn ghost icon-only"
                      style={{ width: 20, height: 20 }}
                      onClick={() => setAddingPlaylist(true)}
                      title="새 플레이리스트 만들기"
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {addingPlaylist && (
                    <div style={{ padding: "2px 4px" }}>
                      <input
                        className="form-field"
                        style={{ height: 26, fontSize: 12 }}
                        autoFocus
                        placeholder="이름 입력 후 Enter"
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreatePlaylist();
                          } else if (e.key === "Escape") {
                            setNewPlaylistName("");
                            setAddingPlaylist(false);
                          }
                        }}
                        onBlur={handleCreatePlaylist}
                      />
                    </div>
                  )}

                  {playlists.map((pl) => (
                    <div
                      key={pl.id}
                      className={`sidebar-item ${
                        !nowPlayingOpen &&
                        navCategory === "playlist" &&
                        activePlaylistId === pl.id
                          ? "active"
                          : ""
                      }`}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setNavCategory("playlist");
                        setActivePlaylistId(pl.id);
                        setNowPlayingOpen(false);
                      }}
                    >
                      <span className="sidebar-item-left">
                        <ListMusic size={14} /> {pl.name}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span className="sidebar-count">{pl.trackIds.length}</span>
                        <button
                          className="ui-btn ghost icon-only"
                          style={{ width: 18, height: 18 }}
                          onClick={(e) => handleDeletePlaylist(pl, e)}
                          title="플레이리스트 삭제"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Registered Folders */}
                {folders.length > 0 && (
                  <div className="sidebar-section">
                    <div className="sidebar-heading">
                      등록된 폴더
                      {scanProgress && (
                        <span
                          className="scan-indicator"
                          title={`색인 중: ${scanProgress.folder}`}
                        >
                          <RefreshCw size={10} className="spin" />
                          {scanProgress.total > 0
                            ? `${scanProgress.processed}/${scanProgress.total}`
                            : "확인 중"}
                        </span>
                      )}
                    </div>
                    {folders.map((f) => (
                      <div
                        key={f}
                        className="sidebar-item"
                        style={{ fontSize: 11.5, cursor: "pointer" }}
                        title={f}
                        onClick={() => {
                          setNavCategory("folders");
                          setSubFilter(f);
                          setNowPlayingOpen(false);
                        }}
                      >
                        <span className="sidebar-item-left">
                          {f.split(/[\\/]/).pop() || f}
                        </span>
                        <div style={{ display: "flex", gap: 2 }}>
                          <button
                            className="ui-btn ghost icon-only"
                            style={{ width: 20, height: 20 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              api.scanFolder(f).then((s) => {
                                setTracks(s.tracks);
                                setFolders(s.folders);
                                notify("변경된 파일을 백그라운드에서 색인합니다.");
                              });
                            }}
                            title="폴더 다시 스캔"
                          >
                            <RefreshCw size={11} />
                          </button>
                          <button
                            className="ui-btn ghost icon-only"
                            style={{ width: 20, height: 20 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              api.removeFolder(f).then((s) => {
                                setTracks(s.tracks);
                                setFolders(s.folders);
                                notify("폴더가 보관함에서 제거되었습니다.");
                              });
                            }}
                            title="폴더 제거"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bottom Sidebar Action Buttons */}
                <div
                  style={{
                    marginTop: "auto",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6,
                    paddingTop: 8,
                  }}
                >
                  <button className="ui-btn" onClick={handleAddFolder}>
                    <FolderPlus size={13} /> 폴더 추가
                  </button>
                  <button className="ui-btn" onClick={handleAddFiles}>
                    <FilePlus size={13} /> 파일 열기
                  </button>
                </div>
              </aside>
            )}

            {/* Main Surface: Dedicated Now Playing Screen OR Library Browser */}
            <div className="inset-surface">
              {nowPlayingOpen ? (
                <div className="np-screen">
                  <div className="np-header">
                    <div className="surface-title-group">
                      <button
                        className="surface-back-btn"
                        onClick={() => setNowPlayingOpen(false)}
                        title="라이브러리 목록으로 돌아가기 (Esc)"
                      >
                        <ChevronLeft size={14} />
                        <span>보관함으로 돌아가기</span>
                      </button>
                      <span className="surface-title">재생 화면</span>
                      <span className="surface-subtitle">
                        {currentViewTitle} · {displayedTracks.length}곡 대기열
                      </span>
                    </div>

                    <div className="surface-controls">
                      {activeTrack && (
                        <button
                          className="ui-btn"
                          onClick={() =>
                            openPropertiesDialog("lyrics", [activeTrack.id])
                          }
                        >
                          <Sparkles size={13} /> 가사 검색·편집
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    className="np-body"
                    style={
                      {
                        // Scaled so the factors sum above 1; grid underfills when fr totals < 1
                        "--np-hero-fr": `${npHeroRatio * 10}fr`,
                        "--np-lyrics-fr": `${(1 - npHeroRatio) * 10}fr`,
                      } as React.CSSProperties
                    }
                  >
                    {/* Left: Hero Artwork & Track Info */}
                    <div className="np-hero-pane" ref={npHeroPaneRef}>
                      <div
                        className="np-art-frame"
                        style={{ "--np-art-max": `${npArtMax}px` } as React.CSSProperties}
                      >
                        <img
                          className="np-art-img"
                          src={activeCover}
                          alt=""
                        />
                      </div>

                      <div className="np-track-info">
                        <div className="np-badges">
                          {activeTrack?.format && (
                            <span className="pm-format-badge">
                              {activeTrack.format}
                            </span>
                          )}
                          {activeTrack?.year && (
                            <span className="np-year-badge">
                              {activeTrack.year}
                            </span>
                          )}
                        </div>

                        <div
                          className="np-track-title"
                          title={activeTrack?.title}
                        >
                          {activeTrack?.title || "재생 중인 곡 없음"}
                        </div>

                        <div
                          className="np-track-artist"
                          title={
                            activeTrack?.artist
                              ? `${activeTrack.artist} — 클릭하여 이 아티스트 보기`
                              : ""
                          }
                          onClick={() => {
                            if (activeTrack?.artist) {
                              setNavCategory("artists");
                              setSubFilter(activeTrack.artist);
                              setNowPlayingOpen(false);
                            }
                          }}
                        >
                          {activeTrack?.artist || "트랙을 선택해 주세요"}
                        </div>

                        <div
                          className="np-track-album"
                          title={
                            activeTrack?.album
                              ? `${activeTrack.album} — 클릭하여 이 앨범 보기`
                              : ""
                          }
                          onClick={() => {
                            if (activeTrack?.album) {
                              setNavCategory("albums");
                              setSubFilter(activeTrack.album);
                              setNowPlayingOpen(false);
                            }
                          }}
                        >
                          <Disc size={13} />
                          <span>{activeTrack?.album || "-"}</span>
                        </div>

                        {activeTrack && (
                          <div className="np-hero-actions">
                            <button
                              className={`ui-btn ${
                                activeTrack.isFavorite ? "solid" : ""
                              }`}
                              onClick={() =>
                                handleToggleFavorite(activeTrack.id)
                              }
                            >
                              <Heart
                                size={13}
                                fill={
                                  activeTrack.isFavorite
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                              {activeTrack.isFavorite ? "좋아요 표시됨" : "좋아요"}
                            </button>
                            <button
                              className="ui-btn"
                              onClick={() =>
                                openPropertiesDialog("tags", [activeTrack.id])
                              }
                            >
                              <Edit3 size={13} /> 속성·태그 편집
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Center: Large Synced Lyrics Stage */}
                    <div className="np-lyrics-pane" ref={npLyricsPaneRef}>
                      <div
                        className={`pane-resizer-v ${
                          resizingNpSplit ? "active" : ""
                        }`}
                        title="드래그해서 크기 조절 · 더블클릭으로 초기화"
                        onPointerDown={handleNpSplitResizeStart}
                        onPointerMove={handleNpSplitResizeMove}
                        onPointerUp={handleNpSplitResizeEnd}
                        onPointerCancel={handleNpSplitResizeEnd}
                        onDoubleClick={() => setNpHeroRatio(NP_HERO_RATIO_DEFAULT)}
                      />
                      <div className="np-pane-head">
                        <span>가사</span>
                        {lyricLines.length > 0 && (
                          <div className="np-sync-controls">
                            <span className="np-sync-label">
                              싱크 {activeTrack?.lyricOffsetMs || 0}ms
                            </span>
                            <button
                              className="ui-btn ghost"
                              style={{ height: 22, padding: "0 6px", fontSize: 11 }}
                              onClick={() => handleOffsetChange(-lyricOffsetStepMs)}
                            >
                              -{formatOffsetStep(lyricOffsetStepMs)}
                            </button>
                            <button
                              className="ui-btn ghost"
                              style={{ height: 22, padding: "0 6px", fontSize: 11 }}
                              onClick={() => handleOffsetChange(0)}
                            >
                              0.0s
                            </button>
                            <button
                              className="ui-btn ghost"
                              style={{ height: 22, padding: "0 6px", fontSize: 11 }}
                              onClick={() => handleOffsetChange(lyricOffsetStepMs)}
                            >
                              +{formatOffsetStep(lyricOffsetStepMs)}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="np-lyrics-scroll" ref={npLyricsRef}>
                        {lyricLines.length > 0 ? (
                          lyricLines.map((line, idx) => (
                            <div
                              key={`${idx}-${line.timeSecs}`}
                              data-lrc-idx={idx}
                              className={`np-lyric-line ${
                                idx === activeLyricIdx ? "active" : ""
                              }`}
                              onClick={() => handleSeek(line.timeSecs)}
                            >
                              {line.text}
                            </div>
                          ))
                        ) : activeTrack?.plainLyrics ? (
                          <pre className="np-plain-lyrics">
                            {activeTrack.plainLyrics}
                          </pre>
                        ) : (
                          <div className="np-empty-lyrics">
                            <Music size={28} strokeWidth={1.5} />
                            <span>등록된 가사가 없습니다</span>
                            {activeTrack && (
                              <button
                                className="ui-btn"
                                onClick={() =>
                                  openPropertiesDialog("lyrics", [
                                    activeTrack.id,
                                  ])
                                }
                              >
                                가사 검색·편집
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Up Next Playback Queue */}
                    <div className="np-queue-pane">
                      <div className="np-pane-head">
                        <span>재생 대기열</span>
                        <span className="np-queue-count">
                          {displayedTracks.length}곡
                        </span>
                      </div>

                      <div className="np-queue-list">
                        {displayedTracks.map((t, idx) => {
                          const isPlay = t.id === playback.currentTrackId;
                          return (
                            <div
                              key={t.id}
                              className={`np-queue-item ${
                                isPlay ? "playing" : ""
                              }`}
                              onClick={() => handlePlayTrack(t.id)}
                              onContextMenu={(e) => handleRowContextMenu(t, e)}
                            >
                              <div className="np-queue-num">
                                {isPlay && playback.isPlaying ? (
                                  <span className="eq-indicator">
                                    <span className="eq-bar" />
                                    <span className="eq-bar" />
                                    <span className="eq-bar" />
                                  </span>
                                ) : (
                                  t.trackNumber ?? idx + 1
                                )}
                              </div>
                              <img
                                className="np-queue-thumb"
                                src={
                                  t.coverDataUrl ||
                                  getFallbackCoverUrl(t.title, t.artist)
                                }
                                alt=""
                              />
                              <div className="np-queue-meta">
                                <div
                                  className="np-queue-title"
                                  title={t.title}
                                >
                                  {t.title}
                                </div>
                                <div
                                  className="np-queue-sub"
                                  title={`${t.artist} · ${t.album}`}
                                >
                                  {t.artist}
                                </div>
                              </div>
                              <div className="np-queue-dur">
                                {formatDuration(t.durationSecs)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
              <div className="main-column">
                <div className="surface-header">
                  <div className="surface-title-group">
                    {subFilter !== null &&
                      (navCategory === "artists" ||
                        navCategory === "albums" ||
                        navCategory === "folders") && (
                        <button
                          className="surface-back-btn"
                          onClick={() => setSubFilter(null)}
                          title="상위 그리드 목록으로 돌아가기"
                        >
                          <ChevronLeft size={14} />
                          <span>
                            {navCategory === "artists"
                              ? "아티스트"
                              : navCategory === "albums"
                                ? "앨범"
                                : "폴더"}
                          </span>
                        </button>
                      )}
                    <span className="surface-title" title={currentViewTitle}>
                      {currentViewTitle}
                    </span>
                    <span className="surface-subtitle">
                      {effectiveLibView === "artist-grid"
                        ? `${artistCards.length}명의 아티스트 · 총 ${searchFilteredTracks.length}곡`
                        : effectiveLibView === "album-grid"
                          ? `${albumCards.length}개의 앨범 · 총 ${searchFilteredTracks.length}곡`
                          : effectiveLibView === "folder-grid"
                            ? `${folderCards.length}개의 폴더 · 총 ${searchFilteredTracks.length}곡`
                            : `${displayedTracks.length}곡 · 총 ${formatDuration(totalDisplayedDuration)}${
                                selectedIds.length > 1
                                  ? ` · ${selectedIds.length}곡 선택됨`
                                  : ""
                              }`}
                    </span>
                  </div>

                  <div className="surface-controls">
                    {selectedIds.length > 0 && (
                      <button
                        className="ui-btn"
                        onClick={() => openPropertiesDialog("tags")}
                      >
                        <Edit3 size={13} />
                        {selectedIds.length > 1
                          ? `속성·태그 편집 (${selectedIds.length}곡)`
                          : "속성·태그 편집"}
                      </button>
                    )}

                    <button
                      className={`ui-btn ghost icon-only ${
                        showRightLyricsInLib ? "active" : ""
                      }`}
                      onClick={() =>
                        setShowRightLyricsInLib(!showRightLyricsInLib)
                      }
                      title="우측 가사 패널 표시/숨기기"
                    >
                      <PanelRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Contextual Content Viewport:
                    - All Music -> Grouped Table
                    - Favorites / Playlist -> Flat Table
                    - Artists / Albums / Folders -> Grid View at top level, Grouped Table when clicked! */}
                {displayedTracks.length === 0 ? (
                  <div
                    style={{
                      margin: "auto",
                      textAlign: "center",
                      color: "var(--text-muted)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Music size={32} strokeWidth={1.5} />
                    <div style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                      표시할 오디오 트랙이 없습니다
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button className="ui-btn solid" onClick={handleAddFolder}>
                        <FolderPlus size={13} /> 음악 폴더 추가
                      </button>
                      <button className="ui-btn" onClick={handleAddFiles}>
                        <FilePlus size={13} /> 파일 열기
                      </button>
                    </div>
                  </div>
                ) : effectiveLibView === "artist-grid" ? (
                  <div className="album-grid-view">
                    {artistCards.map((card) => (
                      <div
                        key={card.artist}
                        className="album-card-item"
                        onClick={() => {
                          setSubFilter(card.artist);
                        }}
                        onDoubleClick={() => {
                          setSubFilter(card.artist);
                          if (card.tracks[0]) handlePlayTrack(card.tracks[0].id);
                        }}
                      >
                        <div className="album-card-cover">
                          <img src={card.cover} alt="" />
                        </div>
                        <div className="album-card-name" title={card.artist}>
                          {card.artist}
                        </div>
                        <div className="album-card-artist">
                          앨범 {card.albumCount}개 · {card.trackCount}곡
                        </div>
                      </div>
                    ))}
                  </div>
                ) : effectiveLibView === "album-grid" ? (
                  <div className="album-grid-view">
                    {albumCards.map((card) => (
                      <div
                        key={card.album}
                        className="album-card-item"
                        onClick={() => {
                          setSubFilter(card.album);
                        }}
                        onDoubleClick={() => {
                          setSubFilter(card.album);
                          if (card.tracks[0]) handlePlayTrack(card.tracks[0].id);
                        }}
                      >
                        <div className="album-card-cover">
                          <img src={card.cover} alt="" />
                        </div>
                        <div className="album-card-name" title={card.album}>
                          {card.album}
                        </div>
                        <div className="album-card-artist" title={card.artist}>
                          {card.artist} · {card.tracks.length}곡
                        </div>
                      </div>
                    ))}
                  </div>
                ) : effectiveLibView === "folder-grid" ? (
                  <div className="album-grid-view">
                    {folderCards.map((card) => (
                      <div
                        key={card.folderPath}
                        className="album-card-item"
                        onClick={() => {
                          setSubFilter(card.folderPath);
                        }}
                        onDoubleClick={() => {
                          setSubFilter(card.folderPath);
                          if (card.tracks[0]) handlePlayTrack(card.tracks[0].id);
                        }}
                      >
                        <div className="album-card-cover">
                          <img src={card.cover} alt="" />
                        </div>
                        <div
                          className="album-card-name"
                          title={card.folderPath}
                        >
                          {card.folderName}
                        </div>
                        <div
                          className="album-card-artist"
                          title={card.folderPath}
                        >
                          {card.tracks.length}곡
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="table-viewport"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setSelectedIds([]);
                      }
                    }}
                  >
                    <table className="track-grid">
                      <thead>
                        <tr>
                          <th
                            style={{ width: colWidths.num }}
                            onClick={() => toggleSort("trackNumber")}
                          >
                            <span className="th-label">
                              #{" "}
                              {sortField === "trackNumber" &&
                                (sortAsc ? "↑" : "↓")}
                            </span>
                            <div
                              className={`col-resizer ${
                                activeColResizer === 0 ? "active" : ""
                              }`}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => handleColResizeStart(0, e)}
                              onPointerMove={handleColResizeMove}
                              onPointerUp={handleColResizeEnd}
                              onPointerCancel={handleColResizeEnd}
                            />
                          </th>
                          <th
                            style={{ width: "auto" }}
                            onClick={() => toggleSort("title")}
                          >
                            <span className="th-label">
                              제목{" "}
                              {sortField === "title" && (sortAsc ? "↑" : "↓")}
                            </span>
                            <div
                              className={`col-resizer ${
                                activeColResizer === 1 ? "active" : ""
                              }`}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => handleColResizeStart(1, e)}
                              onPointerMove={handleColResizeMove}
                              onPointerUp={handleColResizeEnd}
                              onPointerCancel={handleColResizeEnd}
                            />
                          </th>
                          <th
                            style={{ width: colWidths.artist }}
                            onClick={() => toggleSort("artist")}
                          >
                            <span className="th-label">
                              아티스트{" "}
                              {sortField === "artist" && (sortAsc ? "↑" : "↓")}
                            </span>
                            <div
                              className={`col-resizer ${
                                activeColResizer === 2 ? "active" : ""
                              }`}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => handleColResizeStart(2, e)}
                              onPointerMove={handleColResizeMove}
                              onPointerUp={handleColResizeEnd}
                              onPointerCancel={handleColResizeEnd}
                            />
                          </th>
                          <th
                            style={{ width: colWidths.album }}
                            onClick={() => toggleSort("album")}
                          >
                            <span className="th-label">
                              앨범{" "}
                              {sortField === "album" && (sortAsc ? "↑" : "↓")}
                            </span>
                            <div
                              className={`col-resizer ${
                                activeColResizer === 3 ? "active" : ""
                              }`}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => handleColResizeStart(3, e)}
                              onPointerMove={handleColResizeMove}
                              onPointerUp={handleColResizeEnd}
                              onPointerCancel={handleColResizeEnd}
                            />
                          </th>
                          <th
                            style={{ width: colWidths.year }}
                            onClick={() => toggleSort("year")}
                          >
                            <span className="th-label">
                              연도{" "}
                              {sortField === "year" && (sortAsc ? "↑" : "↓")}
                            </span>
                            <div
                              className={`col-resizer ${
                                activeColResizer === 4 ? "active" : ""
                              }`}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => handleColResizeStart(4, e)}
                              onPointerMove={handleColResizeMove}
                              onPointerUp={handleColResizeEnd}
                              onPointerCancel={handleColResizeEnd}
                            />
                          </th>
                          <th style={{ width: colWidths.format }}>
                            <span className="th-label">포맷</span>
                            <div
                              className={`col-resizer ${
                                activeColResizer === 5 ? "active" : ""
                              }`}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => handleColResizeStart(5, e)}
                              onPointerMove={handleColResizeMove}
                              onPointerUp={handleColResizeEnd}
                              onPointerCancel={handleColResizeEnd}
                            />
                          </th>
                          <th
                            style={{
                              width: colWidths.duration,
                              textAlign: "right",
                            }}
                            onClick={() => toggleSort("durationSecs")}
                          >
                            <span className="th-label">
                              시간{" "}
                              {sortField === "durationSecs" &&
                                (sortAsc ? "↑" : "↓")}
                            </span>
                          </th>
                          <th style={{ width: 38, textAlign: "center" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {effectiveLibView === "grouped"
                          ? albumGroups.map((grp) => (
                              <React.Fragment key={grp.key}>
                                <tr
                                  className="album-group-row"
                                  onClick={() =>
                                    setSelectedIds(grp.tracks.map((t) => t.id))
                                  }
                                >
                                  <td colSpan={8}>
                                    <div className="album-header-box">
                                      <img
                                        className="album-header-art"
                                        src={grp.cover}
                                        alt=""
                                      />
                                      <div className="album-header-info">
                                        <span
                                          className="album-header-name"
                                          title={grp.album}
                                        >
                                          {grp.album}
                                        </span>
                                        <span className="album-header-meta">
                                          {grp.artist}
                                          {grp.year ? ` · ${grp.year}` : ""} ·{" "}
                                          {grp.tracks.length}곡
                                        </span>
                                      </div>
                                      <div className="album-header-rule" />
                                    </div>
                                  </td>
                                </tr>
                                {grp.tracks.map((track, idx) => {
                                  const isSel = selectedIds.includes(track.id);
                                  const isPlay =
                                    track.id === playback.currentTrackId;
                                  const prevSel =
                                    idx > 0 &&
                                    selectedIds.includes(grp.tracks[idx - 1].id);
                                  const nextSel =
                                    idx + 1 < grp.tracks.length &&
                                    selectedIds.includes(grp.tracks[idx + 1].id);
                                  return (
                                    <tr
                                      key={track.id}
                                      className={`t-row ${
                                        isSel ? "selected" : ""
                                      } ${isPlay ? "playing" : ""} ${
                                        prevSel ? "sel-has-prev" : ""
                                      } ${nextSel ? "sel-has-next" : ""}`}
                                      onClick={(e) =>
                                        handleRowClick(track.id, e)
                                      }
                                      onDoubleClick={() =>
                                        handlePlayTrack(track.id)
                                      }
                                      onContextMenu={(e) =>
                                        handleRowContextMenu(track, e)
                                      }
                                    >
                                      <td className="t-num">
                                        {isPlay && playback.isPlaying ? (
                                          <span className="eq-indicator">
                                            <span className="eq-bar" />
                                            <span className="eq-bar" />
                                            <span className="eq-bar" />
                                          </span>
                                        ) : (
                                          track.trackNumber ?? idx + 1
                                        )}
                                      </td>
                                      <td title={track.title}>
                                        <div className="t-cell-title">
                                          <span>{track.title}</span>
                                        </div>
                                      </td>
                                      <td className="t-sub" title={track.artist}>
                                        {track.artist}
                                      </td>
                                      <td className="t-sub" title={track.album}>
                                        {track.album}
                                      </td>
                                      <td className="t-num">
                                        {track.year ?? "-"}
                                      </td>
                                      <td className="t-num">{track.format}</td>
                                      <td
                                        className="t-num"
                                        style={{ textAlign: "right" }}
                                      >
                                        {formatDuration(track.durationSecs)}
                                      </td>
                                      <td
                                        style={{ textAlign: "center" }}
                                        onClick={(e) =>
                                          handleToggleFavorite(track.id, e)
                                        }
                                      >
                                        <Heart
                                          size={13}
                                          fill={
                                            track.isFavorite
                                              ? "var(--accent-play)"
                                              : "none"
                                          }
                                          color={
                                            track.isFavorite
                                              ? "var(--accent-play)"
                                              : "var(--text-muted)"
                                          }
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            ))
                          : displayedTracks.map((track, idx) => {
                              const isSel = selectedIds.includes(track.id);
                              const isPlay =
                                track.id === playback.currentTrackId;
                              const prevSel =
                                idx > 0 &&
                                selectedIds.includes(
                                  displayedTracks[idx - 1].id
                                );
                              const nextSel =
                                idx + 1 < displayedTracks.length &&
                                selectedIds.includes(
                                  displayedTracks[idx + 1].id
                                );
                              return (
                                <tr
                                  key={track.id}
                                  className={`t-row ${
                                    isSel ? "selected" : ""
                                  } ${isPlay ? "playing" : ""} ${
                                    prevSel ? "sel-has-prev" : ""
                                  } ${nextSel ? "sel-has-next" : ""}`}
                                  onClick={(e) => handleRowClick(track.id, e)}
                                  onDoubleClick={() =>
                                    handlePlayTrack(track.id)
                                  }
                                  onContextMenu={(e) =>
                                    handleRowContextMenu(track, e)
                                  }
                                >
                                  <td className="t-num">
                                    {isPlay && playback.isPlaying ? (
                                      <span className="eq-indicator">
                                        <span className="eq-bar" />
                                        <span className="eq-bar" />
                                        <span className="eq-bar" />
                                      </span>
                                    ) : (
                                      track.trackNumber ?? idx + 1
                                    )}
                                  </td>
                                  <td title={track.title}>
                                    <div className="t-cell-title">
                                      <img
                                        className="t-row-thumb"
                                        src={
                                          track.coverDataUrl ||
                                          getFallbackCoverUrl(
                                            track.title,
                                            track.artist
                                          )
                                        }
                                        alt=""
                                      />
                                      <span>{track.title}</span>
                                    </div>
                                  </td>
                                  <td className="t-sub" title={track.artist}>
                                    {track.artist}
                                  </td>
                                  <td className="t-sub" title={track.album}>
                                    {track.album}
                                  </td>
                                  <td className="t-num">{track.year ?? "-"}</td>
                                  <td className="t-num">{track.format}</td>
                                  <td
                                    className="t-num"
                                    style={{ textAlign: "right" }}
                                  >
                                    {formatDuration(track.durationSecs)}
                                  </td>
                                  <td
                                    style={{ textAlign: "center" }}
                                    onClick={(e) =>
                                      handleToggleFavorite(track.id, e)
                                    }
                                  >
                                    <Heart
                                      size={13}
                                      fill={
                                        track.isFavorite
                                          ? "var(--accent-play)"
                                          : "none"
                                      }
                                      color={
                                        track.isFavorite
                                          ? "var(--accent-play)"
                                          : "var(--text-muted)"
                                      }
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Right Collapsible Lyrics Panel inside Library Mode */}
              {showRightLyricsInLib && (
                <aside
                  className="side-inspector"
                  style={{ width: lyricsPaneWidth, minWidth: lyricsPaneWidth }}
                >
                  <div
                    className={`pane-resizer-v ${
                      resizingLyricsPane ? "active" : ""
                    }`}
                    onPointerDown={handleLyricsResizeStart}
                    onPointerMove={handleLyricsResizeMove}
                    onPointerUp={handleLyricsResizeEnd}
                    onPointerCancel={handleLyricsResizeEnd}
                  />
                  <div className="inspector-top">
                    <span style={{ fontWeight: 600, fontSize: 12.5 }}>가사</span>
                    <button
                      className="ui-btn ghost"
                      style={{ height: 24, padding: "0 8px", fontSize: 11.5 }}
                      onClick={() =>
                        openPropertiesDialog(
                          "lyrics",
                          activeTrack ? [activeTrack.id] : undefined
                        )
                      }
                    >
                      검색·편집
                    </button>
                  </div>

                  <div className="lyrics-scroll-box" ref={lyricsBoxRef}>
                    {lyricLines.length > 0 ? (
                      lyricLines.map((line, idx) => (
                        <div
                          key={`${idx}-${line.timeSecs}`}
                          data-lrc-idx={idx}
                          className={`lyric-line-item ${
                            idx === activeLyricIdx ? "active" : ""
                          }`}
                          onClick={() => handleSeek(line.timeSecs)}
                        >
                          {line.text}
                        </div>
                      ))
                    ) : activeTrack?.plainLyrics ? (
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          fontFamily: "inherit",
                          textAlign: "center",
                          lineHeight: 1.65,
                          color: "var(--text-secondary)",
                        }}
                      >
                        {activeTrack.plainLyrics}
                      </pre>
                    ) : (
                      <div
                        style={{
                          margin: "auto",
                          textAlign: "center",
                          color: "var(--text-muted)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span>가사 정보가 없습니다</span>
                        {activeTrack && (
                          <button
                            className="ui-btn"
                            onClick={() =>
                              openPropertiesDialog("lyrics", [activeTrack.id])
                            }
                          >
                            가사 검색·편집
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {lyricLines.length > 0 && (
                    <div className="inspector-bottom">
                      <span>싱크 {activeTrack?.lyricOffsetMs || 0}ms</span>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button
                          className="ui-btn ghost"
                          style={{ height: 22, padding: "0 6px", fontSize: 11 }}
                          onClick={() => handleOffsetChange(-lyricOffsetStepMs)}
                        >
                          -{formatOffsetStep(lyricOffsetStepMs)}
                        </button>
                        <button
                          className="ui-btn ghost"
                          style={{ height: 22, padding: "0 6px", fontSize: 11 }}
                          onClick={() => handleOffsetChange(0)}
                        >
                          0.0s
                        </button>
                        <button
                          className="ui-btn ghost"
                          style={{ height: 22, padding: "0 6px", fontSize: 11 }}
                          onClick={() => handleOffsetChange(lyricOffsetStepMs)}
                        >
                          +{formatOffsetStep(lyricOffsetStepMs)}
                        </button>
                      </div>
                    </div>
                  )}
                </aside>
              )}
                </>
              )}
            </div>
          </div>

          {/* Bottom Audio Deck (in Library Mode) */}
          <footer className="audio-deck">
            <div className="deck-track">
              <div
                className={`deck-art-wrap ${nowPlayingOpen ? "active" : ""}`}
                onClick={() => setNowPlayingOpen((prev) => !prev)}
                title={
                  nowPlayingOpen
                    ? "보관함 화면으로 돌아가기"
                    : "클릭하여 재생 화면 열기"
                }
              >
                <img className="deck-art" src={activeCover} alt="" />
                <div className="deck-art-overlay">
                  <ChevronDown
                    size={16}
                    style={{
                      transform: nowPlayingOpen ? "rotate(0deg)" : "rotate(180deg)",
                      transition: "transform 0.18s ease",
                    }}
                  />
                </div>
              </div>
              <div className="deck-meta">
                <div
                  className="deck-title clickable"
                  title={
                    activeTrack?.title
                      ? `${activeTrack.title} — 클릭하여 재생 화면 열기`
                      : ""
                  }
                  onClick={() => setNowPlayingOpen((prev) => !prev)}
                >
                  {activeTrack?.title || "재생 대기 중"}
                </div>
                <div
                  className="deck-artist"
                  title={
                    activeTrack
                      ? `${activeTrack.artist} · ${activeTrack.album}`
                      : ""
                  }
                >
                  {activeTrack
                    ? `${activeTrack.artist} · ${activeTrack.album}`
                    : "트랙을 선택하세요"}
                </div>
              </div>
              {activeTrack && (
                <button
                  className="flat-icon-btn"
                  onClick={() => handleToggleFavorite(activeTrack.id)}
                  title="즐겨찾기"
                >
                  <Heart
                    size={15}
                    fill={
                      activeTrack.isFavorite ? "var(--accent-play)" : "none"
                    }
                    color={
                      activeTrack.isFavorite
                        ? "var(--accent-play)"
                        : "currentColor"
                    }
                  />
                </button>
              )}
            </div>

            <div className="deck-center">
              <div className="deck-buttons">
                <button
                  className={`flat-icon-btn ${shuffle ? "active" : ""}`}
                  onClick={() => setShuffle(!shuffle)}
                  title={shuffle ? "셔플 켜짐" : "셔플 꺼짐"}
                >
                  <Shuffle size={14} />
                </button>
                <button
                  className="flat-icon-btn"
                  onClick={handlePrevTrack}
                  title="이전 곡"
                >
                  <NativePrevIcon size={18} />
                </button>
                <button
                  className="deck-play"
                  onClick={handleTogglePlay}
                  title="재생 / 일시정지"
                >
                  {playback.isPlaying ? (
                    <NativePauseIcon size={18} />
                  ) : (
                    <NativePlayIcon size={18} />
                  )}
                </button>
                <button
                  className="flat-icon-btn"
                  onClick={() => handleNextTrack(false)}
                  title="다음 곡"
                >
                  <NativeNextIcon size={18} />
                </button>
                <button
                  className={`flat-icon-btn ${
                    repeatMode !== "off" ? "active" : ""
                  }`}
                  onClick={() =>
                    setRepeatMode(
                      repeatMode === "off"
                        ? "all"
                        : repeatMode === "all"
                          ? "one"
                          : "off"
                    )
                  }
                  title={
                    repeatMode === "all"
                      ? "전체 반복"
                      : repeatMode === "one"
                        ? "한 곡 반복"
                        : "반복 꺼짐"
                  }
                >
                  {repeatMode === "one" ? (
                    <Repeat1 size={14} />
                  ) : (
                    <Repeat size={14} />
                  )}
                </button>
              </div>

              <div className="deck-seek">
                <span className="deck-time">
                  {formatDuration(effectivePositionSecs)}
                </span>
                <DraggableSlider
                  value={effectivePositionSecs}
                  max={effectiveDurationSecs}
                  onChange={(val) => handleSeekPreview(val)}
                  onCommit={(val) => handleSeek(val)}
                />
                <span className="deck-time">
                  {formatDuration(effectiveDurationSecs)}
                </span>
              </div>
            </div>

            <div className="deck-right">
              <button
                className="ui-btn ghost"
                style={{ height: 24, padding: "0 6px", fontSize: 11.5 }}
                onClick={handleCycleSpeed}
                title="재생 배속 변경"
              >
                {playback.speed}x
              </button>

              <button
                className="flat-icon-btn"
                onClick={handleToggleMute}
                title="음소거 토글"
              >
                {isMuted || playback.volume === 0 ? (
                  <VolumeX size={15} />
                ) : (
                  <Volume2 size={15} />
                )}
              </button>

              <DraggableSlider
                value={playback.volume}
                max={1}
                style={{ maxWidth: 84 }}
                onChange={(val) => handleSetVolume(val)}
                onCommit={(val) => handleSetVolume(val)}
              />
            </div>
          </footer>
        </>
      )}

      {/* ===========================================================================
          MODE 2: MODERN FLAT 3-TIER PLAYER (Spotify / YouTube Music Flat Design)
         =========================================================================== */}
      {appMode === "player" && (
        <div className="pm-container">
          {/* 1. TOP FLAT PLAYER SECTION */}
          <section className="pm-deck">
            <div className="pm-hero">
              <img className="pm-cover" src={activeCover} alt="" />
              <div className="pm-meta">
                <div className="pm-title-row">
                  <div className="pm-title" title={activeTrack?.title}>
                    {activeTrack?.title || "재생 중인 곡 없음"}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    {activeTrack && (
                      <button
                        className="flat-icon-btn"
                        style={{ width: 26, height: 26 }}
                        onClick={() => handleToggleFavorite(activeTrack.id)}
                        title="즐겨찾기"
                      >
                        <Heart
                          size={14}
                          fill={
                            activeTrack.isFavorite
                              ? "var(--accent-play)"
                              : "none"
                          }
                          color={
                            activeTrack.isFavorite
                              ? "var(--accent-play)"
                              : "currentColor"
                          }
                        />
                      </button>
                    )}
                    <button
                      className="flat-icon-btn"
                      style={{ width: 26, height: 26 }}
                      onClick={() => openPropertiesDialog("tags")}
                      title="속성·태그 편집"
                    >
                      <Edit3 size={13} />
                    </button>
                  </div>
                </div>

                <div
                  className="pm-artist clickable"
                  title={
                    activeTrack?.artist
                      ? `${activeTrack.artist} — 클릭하여 이 아티스트의 곡 보기`
                      : ""
                  }
                  onClick={() => {
                    if (activeTrack?.artist) {
                      setNavCategory("artists");
                      setSubFilter(activeTrack.artist);
                      setShowPlayerBrowser(false);
                    }
                  }}
                >
                  {activeTrack?.artist || "트랙을 추가해 주세요"}
                </div>

                <div
                  className="pm-submeta"
                  title={
                    activeTrack?.album
                      ? `${activeTrack.album} — 클릭하여 이 앨범의 곡 보기`
                      : ""
                  }
                >
                  {activeTrack && (
                    <span className="pm-format-badge">
                      {activeTrack.format}
                    </span>
                  )}
                  <span
                    className={activeTrack?.album ? "pm-album-link" : ""}
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => {
                      if (activeTrack?.album) {
                        setNavCategory("albums");
                        setSubFilter(activeTrack.album);
                        setShowPlayerBrowser(false);
                      }
                    }}
                  >
                    {activeTrack?.album || "폴더 또는 파일을 열어 재생하세요"}
                  </span>
                </div>
              </div>
            </div>

            {/* Flat Seek Bar */}
            <div className="pm-seek-row">
              <span className="pm-time">
                {formatDuration(effectivePositionSecs)}
              </span>
              <DraggableSlider
                value={effectivePositionSecs}
                max={effectiveDurationSecs}
                onChange={(val) => handleSeekPreview(val)}
                onCommit={(val) => handleSeek(val)}
              />
              <span className="pm-time right">
                {formatDuration(effectiveDurationSecs)}
              </span>
            </div>

            {/* Centered Flat Transport Controls */}
            <div className="pm-controls-row">
              <div className="pm-ctrl-left">
                <button
                  className={`flat-icon-btn ${shuffle ? "active" : ""}`}
                  onClick={() => setShuffle(!shuffle)}
                  title={shuffle ? "셔플 켜짐" : "셔플 꺼짐"}
                >
                  <Shuffle size={14} />
                </button>
                <button
                  className={`flat-icon-btn ${
                    repeatMode !== "off" ? "active" : ""
                  }`}
                  onClick={() =>
                    setRepeatMode(
                      repeatMode === "off"
                        ? "all"
                        : repeatMode === "all"
                          ? "one"
                          : "off"
                    )
                  }
                  title={
                    repeatMode === "all"
                      ? "전체 반복"
                      : repeatMode === "one"
                        ? "한 곡 반복"
                        : "반복 꺼짐"
                  }
                >
                  {repeatMode === "one" ? (
                    <Repeat1 size={15} />
                  ) : (
                    <Repeat size={14} />
                  )}
                </button>
              </div>

              <div className="pm-ctrl-center">
                <button
                  className="flat-icon-btn"
                  onClick={handlePrevTrack}
                  title="이전 곡"
                >
                  <NativePrevIcon size={18} />
                </button>
                <button
                  className="pm-play-btn"
                  onClick={handleTogglePlay}
                  title="재생 / 일시정지"
                >
                  {playback.isPlaying ? (
                    <NativePauseIcon size={20} />
                  ) : (
                    <NativePlayIcon size={20} />
                  )}
                </button>
                <button
                  className="flat-icon-btn"
                  onClick={() => handleNextTrack(false)}
                  title="다음 곡"
                >
                  <NativeNextIcon size={18} />
                </button>
              </div>

              <div className="pm-ctrl-right">
                <div className="pm-vol-box">
                  <button
                    className="flat-icon-btn"
                    style={{ width: 26, height: 26 }}
                    onClick={handleToggleMute}
                    title="음소거"
                  >
                    {isMuted || playback.volume === 0 ? (
                      <VolumeX size={14} />
                    ) : (
                      <Volume2 size={14} />
                    )}
                  </button>
                  <DraggableSlider
                    value={playback.volume}
                    max={1}
                    onChange={(val) => handleSetVolume(val)}
                    onCommit={(val) => handleSetVolume(val)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 2. MIDDLE FLAT SYNCED LYRICS SECTION (Always Visible) */}
          <section className="pm-lyrics-section">
            <div className="pm-lyrics-scroll" ref={playerLyricsRef}>
              {lyricLines.length > 0 ? (
                lyricLines.map((line, idx) => (
                  <div
                    key={`${idx}-${line.timeSecs}`}
                    data-lrc-idx={idx}
                    className={`pm-lyric-line ${
                      idx === activeLyricIdx ? "active" : ""
                    }`}
                    onClick={() => handleSeek(line.timeSecs)}
                  >
                    {line.text}
                  </div>
                ))
              ) : activeTrack?.plainLyrics ? (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    textAlign: "center",
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: "var(--text-secondary)",
                  }}
                >
                  {activeTrack.plainLyrics}
                </pre>
              ) : (
                <div
                  style={{
                    margin: "auto",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 12,
                  }}
                >
                  가사 정보가 없습니다
                </div>
              )}
            </div>

            <div className="pm-lyrics-footer">
              <div style={{ display: "flex", gap: 2 }}>
                <button
                  className="pm-micro-btn"
                  onClick={() => handleOffsetChange(-lyricOffsetStepMs)}
                  title={`싱크 ${formatOffsetStep(lyricOffsetStepMs)} 빠르게`}
                >
                  -{formatOffsetStep(lyricOffsetStepMs)}
                </button>
                <button
                  className="pm-micro-btn"
                  onClick={() => handleOffsetChange(0)}
                  title="싱크 초기화"
                >
                  {activeTrack?.lyricOffsetMs
                    ? `${(activeTrack.lyricOffsetMs / 1000).toFixed(1)}s`
                    : "0.0s"}
                </button>
                <button
                  className="pm-micro-btn"
                  onClick={() => handleOffsetChange(lyricOffsetStepMs)}
                  title={`싱크 ${formatOffsetStep(lyricOffsetStepMs)} 느리게`}
                >
                  +{formatOffsetStep(lyricOffsetStepMs)}
                </button>
              </div>

              <button
                className="pm-micro-btn"
                onClick={() =>
                  openPropertiesDialog(
                    "lyrics",
                    activeTrack ? [activeTrack.id] : undefined
                  )
                }
                title="가사 검색 및 편집"
              >
                <Edit3 size={11} /> 가사 편집
              </button>
            </div>
          </section>

          {/* 3. BOTTOM FLAT TRACK LIST & COLLECTION SWITCHER SECTION */}
          <section className="pm-playlist-section">
            <div className="pm-collection-bar">
              <div className="pm-collection-left">
                <button
                  className={`pm-collection-trigger ${
                    showPlayerBrowser ? "active" : ""
                  }`}
                  onClick={() => setShowPlayerBrowser(!showPlayerBrowser)}
                  title="클릭하여 재생목록 · 앨범 · 아티스트 · 폴더 변경"
                >
                  {navCategory === "all" ? (
                    <Music size={13} />
                  ) : navCategory === "favorites" ? (
                    <Heart size={13} />
                  ) : navCategory === "albums" ? (
                    <Disc size={13} />
                  ) : navCategory === "artists" ? (
                    <Mic2 size={13} />
                  ) : navCategory === "folders" ? (
                    <Folder size={13} />
                  ) : (
                    <ListMusic size={13} />
                  )}
                  <span className="pm-collection-name">{currentViewTitle}</span>
                  <ChevronDown
                    size={13}
                    className={`pm-chevron ${showPlayerBrowser ? "open" : ""}`}
                  />
                </button>

                {(navCategory !== "all" || subFilter !== null) && (
                  <button
                    className="pm-reset-filter-btn"
                    onClick={() => {
                      setNavCategory("all");
                      setSubFilter(null);
                      setShowPlayerBrowser(false);
                    }}
                    title="모든 음악으로 돌아가기"
                  >
                    전체 음악
                  </button>
                )}
              </div>

              <button
                className={`pm-micro-btn ${showPlayerBrowser ? "active" : ""}`}
                onClick={() => setShowPlayerBrowser(!showPlayerBrowser)}
              >
                {showPlayerBrowser ? "곡 목록 보기" : "앨범·목록 변경"}
              </button>
            </div>

            {showPlayerSearch && (
              <div className="pm-search-bar">
                <Search size={13} color="var(--text-muted)" />
                <input
                  className="form-field"
                  style={{ height: 26, fontSize: 12 }}
                  placeholder="곡, 앨범, 아티스트 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searchQuery && (
                  <button
                    className="pm-micro-btn"
                    onClick={() => setSearchQuery("")}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {showPlayerBrowser ? (
              <div className="pm-browser-pane">
                <div className="pm-browser-tabs">
                  <button
                    className={playerBrowserTab === "albums" ? "active" : ""}
                    onClick={() => setPlayerBrowserTab("albums")}
                  >
                    <Disc size={12} /> 앨범 ({albumCards.length})
                  </button>
                  <button
                    className={playerBrowserTab === "playlists" ? "active" : ""}
                    onClick={() => setPlayerBrowserTab("playlists")}
                  >
                    <ListMusic size={12} /> 재생목록
                  </button>
                  <button
                    className={playerBrowserTab === "artists" ? "active" : ""}
                    onClick={() => setPlayerBrowserTab("artists")}
                  >
                    <Mic2 size={12} /> 아티스트 ({artistCards.length})
                  </button>
                  <button
                    className={playerBrowserTab === "folders" ? "active" : ""}
                    onClick={() => setPlayerBrowserTab("folders")}
                  >
                    <Folder size={12} /> 폴더 ({folderCards.length})
                  </button>
                </div>

                <div className="pm-browser-list">
                  {playerBrowserTab === "albums" &&
                    albumCards.map((alb) => {
                      const isCurrent =
                        navCategory === "albums" && subFilter === alb.album;
                      return (
                        <div
                          key={alb.album}
                          className={`pm-browser-item ${
                            isCurrent ? "active" : ""
                          }`}
                          onClick={() => {
                            setNavCategory("albums");
                            setSubFilter(alb.album);
                            setShowPlayerBrowser(false);
                          }}
                        >
                          <img
                            className="pm-browser-thumb"
                            src={alb.cover}
                            alt=""
                          />
                          <div className="pm-browser-meta">
                            <div className="pm-browser-title">{alb.album}</div>
                            <div className="pm-browser-sub">
                              {alb.artist} · {alb.tracks.length}곡
                            </div>
                          </div>
                          <button
                            className="flat-icon-btn"
                            style={{ width: 26, height: 26 }}
                            title="이 앨범 바로 재생"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNavCategory("albums");
                              setSubFilter(alb.album);
                              setShowPlayerBrowser(false);
                              if (alb.tracks[0]) {
                                handlePlayTrack(alb.tracks[0].id);
                              }
                            }}
                          >
                            <NativePlayIcon size={15} />
                          </button>
                        </div>
                      );
                    })}

                  {playerBrowserTab === "playlists" && (
                    <>
                      <div
                        className={`pm-browser-item ${
                          navCategory === "all" ? "active" : ""
                        }`}
                        onClick={() => {
                          setNavCategory("all");
                          setSubFilter(null);
                          setShowPlayerBrowser(false);
                        }}
                      >
                        <div className="pm-browser-icon-box">
                          <Music size={15} />
                        </div>
                        <div className="pm-browser-meta">
                          <div className="pm-browser-title">모든 음악</div>
                          <div className="pm-browser-sub">
                            전체 보관함 · {tracks.length}곡
                          </div>
                        </div>
                      </div>

                      <div
                        className={`pm-browser-item ${
                          navCategory === "favorites" ? "active" : ""
                        }`}
                        onClick={() => {
                          setNavCategory("favorites");
                          setSubFilter(null);
                          setShowPlayerBrowser(false);
                        }}
                      >
                        <div className="pm-browser-icon-box">
                          <Heart size={15} />
                        </div>
                        <div className="pm-browser-meta">
                          <div className="pm-browser-title">즐겨찾기</div>
                          <div className="pm-browser-sub">
                            좋아요 표시한 곡 ·{" "}
                            {tracks.filter((t) => t.isFavorite).length}곡
                          </div>
                        </div>
                      </div>

                      {playlists.map((pl) => {
                        const isCurrent =
                          navCategory === "playlist" &&
                          activePlaylistId === pl.id;
                        return (
                          <div
                            key={pl.id}
                            className={`pm-browser-item ${
                              isCurrent ? "active" : ""
                            }`}
                            onClick={() => {
                              setNavCategory("playlist");
                              setActivePlaylistId(pl.id);
                              setSubFilter(null);
                              setShowPlayerBrowser(false);
                            }}
                          >
                            <div className="pm-browser-icon-box">
                              <ListMusic size={15} />
                            </div>
                            <div className="pm-browser-meta">
                              <div className="pm-browser-title">{pl.name}</div>
                              <div className="pm-browser-sub">
                                플레이리스트 · {pl.trackIds.length}곡
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {playerBrowserTab === "artists" &&
                    artistCards.map((art) => {
                      const isCurrent =
                        navCategory === "artists" && subFilter === art.artist;
                      return (
                        <div
                          key={art.artist}
                          className={`pm-browser-item ${
                            isCurrent ? "active" : ""
                          }`}
                          onClick={() => {
                            setNavCategory("artists");
                            setSubFilter(art.artist);
                            setShowPlayerBrowser(false);
                          }}
                        >
                          <img
                            className="pm-browser-thumb"
                            src={art.cover}
                            alt=""
                          />
                          <div className="pm-browser-meta">
                            <div className="pm-browser-title">{art.artist}</div>
                            <div className="pm-browser-sub">
                              앨범 {art.albumCount}개 · {art.trackCount}곡
                            </div>
                          </div>
                          <button
                            className="flat-icon-btn"
                            style={{ width: 26, height: 26 }}
                            title="이 아티스트 곡 바로 재생"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNavCategory("artists");
                              setSubFilter(art.artist);
                              setShowPlayerBrowser(false);
                              if (art.tracks[0]) {
                                handlePlayTrack(art.tracks[0].id);
                              }
                            }}
                          >
                            <NativePlayIcon size={15} />
                          </button>
                        </div>
                      );
                    })}

                  {playerBrowserTab === "folders" &&
                    folderCards.map((fld) => {
                      const isCurrent =
                        navCategory === "folders" &&
                        subFilter === fld.folderPath;
                      return (
                        <div
                          key={fld.folderPath}
                          className={`pm-browser-item ${
                            isCurrent ? "active" : ""
                          }`}
                          onClick={() => {
                            setNavCategory("folders");
                            setSubFilter(fld.folderPath);
                            setShowPlayerBrowser(false);
                          }}
                        >
                          <img
                            className="pm-browser-thumb"
                            src={fld.cover}
                            alt=""
                          />
                          <div className="pm-browser-meta">
                            <div className="pm-browser-title">
                              {fld.folderName}
                            </div>
                            <div
                              className="pm-browser-sub"
                              title={fld.folderPath}
                            >
                              {fld.tracks.length}곡 · {fld.folderPath}
                            </div>
                          </div>
                          <button
                            className="flat-icon-btn"
                            style={{ width: 26, height: 26 }}
                            title="이 폴더 바로 재생"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNavCategory("folders");
                              setSubFilter(fld.folderPath);
                              setShowPlayerBrowser(false);
                              if (fld.tracks[0]) {
                                handlePlayTrack(fld.tracks[0].id);
                              }
                            }}
                          >
                            <NativePlayIcon size={15} />
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : (
              <div className="pm-track-list">
              {displayedTracks.map((track, idx) => {
                const isPlay = track.id === playback.currentTrackId;
                const isSel = selectedIds.includes(track.id);
                const prevSel =
                  idx > 0 && selectedIds.includes(displayedTracks[idx - 1].id);
                const nextSel =
                  idx + 1 < displayedTracks.length &&
                  selectedIds.includes(displayedTracks[idx + 1].id);
                return (
                  <div
                    key={track.id}
                    className={`pm-track-row ${isPlay ? "playing" : ""} ${
                      isSel ? "selected" : ""
                    } ${prevSel ? "sel-has-prev" : ""} ${
                      nextSel ? "sel-has-next" : ""
                    }`}
                    onClick={(e) => handleRowClick(track.id, e)}
                    onDoubleClick={() => handlePlayTrack(track.id)}
                    onContextMenu={(e) => handleRowContextMenu(track, e)}
                  >
                    <div className="pm-col-num">
                      {isPlay && playback.isPlaying ? (
                        <span className="eq-indicator">
                          <span className="eq-bar" />
                          <span className="eq-bar" />
                          <span className="eq-bar" />
                        </span>
                      ) : (
                        track.trackNumber ?? idx + 1
                      )}
                    </div>
                    <div
                      className="pm-col-main"
                      title={`${track.title} · ${track.artist}`}
                    >
                      <span className="pm-col-title">{track.title}</span>
                      {track.artist && track.artist !== "Unknown Artist" && (
                        <span className="pm-col-artist">{track.artist}</span>
                      )}
                    </div>
                    <div className="pm-col-time">
                      {formatDuration(track.durationSecs)}
                    </div>
                  </div>
                );
              })}
              </div>
            )}

            <div className="pm-pl-footer">
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  className="flat-icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={handleAddFolder}
                  title="음악 폴더 추가"
                >
                  <FolderPlus size={14} />
                </button>
                <button
                  className="flat-icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={handleAddFiles}
                  title="오디오 파일 추가"
                >
                  <Plus size={15} />
                </button>
                <button
                  className="flat-icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={handleDeleteSelected}
                  title="선택 곡 제거"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  className="flat-icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={() => {
                    if (
                      selectedIds.length === displayedTracks.length &&
                      displayedTracks.length > 0
                    ) {
                      setSelectedIds([]);
                    } else {
                      setSelectedIds(displayedTracks.map((t) => t.id));
                    }
                  }}
                  title="전체 선택 / 해제"
                >
                  <CheckSquare size={13} />
                </button>
              </div>

              <span className="pm-pl-summary">
                {displayedTracks.length}곡 ·{" "}
                {formatDuration(totalDisplayedDuration)}
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  className="flat-icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={() => openPropertiesDialog("tags")}
                  title="속성·태그 편집"
                >
                  <Edit3 size={13} />
                </button>
                <button
                  className="flat-icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={cycleStackSort}
                  title="정렬 기준 변경"
                >
                  <ArrowUpDown size={13} />
                </button>
                <button
                  className={`flat-icon-btn ${
                    showPlayerSearch ? "active" : ""
                  }`}
                  style={{ width: 28, height: 28 }}
                  onClick={() => setShowPlayerSearch(!showPlayerSearch)}
                  title="목록 검색"
                >
                  <Search size={13} />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ======================== NATIVE RIGHT-CLICK CONTEXT MENU ======================== */}
      {ctxMenu && (
        <div
          className="native-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="native-menu-item"
            onClick={() => {
              handlePlayTrack(ctxMenu.track.id);
              setCtxMenu(null);
            }}
          >
            <span>재생</span>
            <span className="menu-kbd">Enter</span>
          </button>
          <div className="native-menu-sep" />
          <button
            className="native-menu-item"
            onClick={() => {
              setCtxMenu(null);
              openPropertiesDialog("tags");
            }}
          >
            <span>
              {selectedIds.length > 1
                ? `속성·태그 편집 (${selectedIds.length}곡)...`
                : "속성·태그 편집..."}
            </span>
            <span className="menu-kbd">Alt+Enter</span>
          </button>
          <button
            className="native-menu-item"
            onClick={() => {
              setCtxMenu(null);
              openPropertiesDialog("pattern");
            }}
          >
            <span>파일명 규칙으로 태그 추출...</span>
          </button>
          <button
            className="native-menu-item"
            onClick={() => {
              setCtxMenu(null);
              openPropertiesDialog("online");
            }}
          >
            <span>자동 정보 매칭 (확인 후 적용)...</span>
          </button>
          <button
            className="native-menu-item"
            onClick={() => {
              setCtxMenu(null);
              openPropertiesDialog("lyrics");
            }}
          >
            <span>가사 검색 및 편집...</span>
          </button>

          {playlists.length > 0 && (
            <>
              <div className="native-menu-sep" />
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  className="native-menu-item"
                  onClick={() => {
                    api
                      .addTracksToPlaylist(pl.id, selectedIds)
                      .then(setPlaylists);
                    setCtxMenu(null);
                    notify(`'${pl.name}'에 추가되었습니다.`);
                  }}
                >
                  <span>플레이리스트 추가: {pl.name}</span>
                </button>
              ))}
            </>
          )}

          <div className="native-menu-sep" />
          <button
            className="native-menu-item"
            onClick={() => {
              setCtxMenu(null);
              handleDeleteSelected();
            }}
          >
            <span>
              {navCategory === "playlist"
                ? "플레이리스트에서 제거"
                : "보관함에서 제거"}
            </span>
            <span className="menu-kbd">Del</span>
          </button>
        </div>
      )}

      {/* ======================== FIXED-SIZE PROPERTIES & TAG EDITOR MODAL ======================== */}
      {dialogOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setDialogOpen(false)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span
                className="modal-head-title"
                title={
                  dialogTrackIds.length > 1
                    ? `속성·태그 편집 (${dialogTrackIds.length}곡 선택됨)`
                    : dialogPrimaryTrack?.title || ""
                }
              >
                {dialogTrackIds.length > 1
                  ? `속성·태그 편집 (${dialogTrackIds.length}곡 선택됨)`
                  : `속성·태그 편집 — ${dialogPrimaryTrack?.title || ""}`}
              </span>
              <button
                className="ui-btn ghost icon-only"
                onClick={() => setDialogOpen(false)}
                title="닫기 (Esc)"
              >
                <X size={15} />
              </button>
            </div>

            <div className="modal-tabs">
              <button
                className={`modal-tab ${dialogTab === "tags" ? "active" : ""}`}
                onClick={() => setDialogTab("tags")}
              >
                기본 정보
              </button>
              <button
                className={`modal-tab ${
                  dialogTab === "pattern" ? "active" : ""
                }`}
                onClick={() => setDialogTab("pattern")}
              >
                파일명 규칙
              </button>
              <button
                className={`modal-tab ${dialogTab === "online" ? "active" : ""}`}
                onClick={() => setDialogTab("online")}
              >
                자동 정보 매칭
              </button>
              <button
                className={`modal-tab ${dialogTab === "lyrics" ? "active" : ""}`}
                onClick={() => setDialogTab("lyrics")}
              >
                가사 편집
              </button>
            </div>

            {/* Sub-menu 1: Metadata Form */}
            {dialogTab === "tags" && (
              <>
                <div className="modal-content">
                  <div className="form-grid">
                    {dialogTrackIds.length <= 1 && (
                      <>
                        <label className="form-label">제목</label>
                        <input
                          className="form-field"
                          value={tagTitle}
                          onChange={(e) => setTagTitle(e.target.value)}
                        />
                      </>
                    )}

                    <label className="form-label">아티스트</label>
                    <input
                      className="form-field"
                      placeholder={
                        dialogTrackIds.length > 1
                          ? "(기존 값 유지 시 비워두세요)"
                          : ""
                      }
                      value={tagArtist}
                      onChange={(e) => setTagArtist(e.target.value)}
                    />

                    <label className="form-label">앨범</label>
                    <input
                      className="form-field"
                      placeholder={
                        dialogTrackIds.length > 1
                          ? "(기존 값 유지 시 비워두세요)"
                          : ""
                      }
                      value={tagAlbum}
                      onChange={(e) => setTagAlbum(e.target.value)}
                    />

                    <label className="form-label">앨범 아티스트</label>
                    <input
                      className="form-field"
                      value={tagAlbumArtist}
                      onChange={(e) => setTagAlbumArtist(e.target.value)}
                    />

                    <label className="form-label">트랙 / 연도</label>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        className="form-field"
                        style={{ width: 72 }}
                        type="number"
                        placeholder="번호"
                        disabled={tagAutoNumber}
                        value={tagTrackNum}
                        onChange={(e) => setTagTrackNum(e.target.value)}
                      />
                      <input
                        className="form-field"
                        style={{ width: 84 }}
                        type="number"
                        placeholder="연도"
                        value={tagYear}
                        onChange={(e) => setTagYear(e.target.value)}
                      />
                      {dialogTrackIds.length > 1 && (
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 11.5,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={tagAutoNumber}
                            onChange={(e) => setTagAutoNumber(e.target.checked)}
                          />
                          자동 번호 (1~N)
                        </label>
                      )}
                    </div>

                    <label className="form-label">장르</label>
                    <input
                      className="form-field"
                      value={tagGenre}
                      onChange={(e) => setTagGenre(e.target.value)}
                    />

                    <label className="form-label">앨범 커버</label>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <img
                        className="t-row-thumb"
                        style={{ width: 36, height: 36, borderRadius: 6 }}
                        src={
                          tagCoverUrl ||
                          dialogPrimaryTrack?.coverDataUrl ||
                          getFallbackCoverUrl(
                            dialogPrimaryTrack?.title || "Lof",
                            dialogPrimaryTrack?.artist || "Audio"
                          )
                        }
                        alt=""
                      />
                      <input
                        ref={coverFileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleCoverUpload}
                      />
                      <button
                        className="ui-btn"
                        onClick={() => coverFileInputRef.current?.click()}
                      >
                        <Upload size={13} /> 이미지 변경...
                      </button>
                      {tagCoverUrl && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--accent)",
                            fontWeight: 600,
                          }}
                        >
                          새 이미지 준비됨
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="modal-foot">
                  <span
                    className="modal-foot-left"
                    title={dialogPrimaryTrack?.filePath || ""}
                  >
                    {dialogTrackIds.length === 1 && dialogPrimaryTrack
                      ? `${dialogPrimaryTrack.format} · ${formatDuration(
                          dialogPrimaryTrack.durationSecs
                        )} · ${dialogPrimaryTrack.fileName}`
                      : `${dialogTrackIds.length}개 오디오 파일 선택됨`}
                  </span>
                  <div className="modal-foot-right">
                    <button
                      className="ui-btn"
                      onClick={() => setDialogOpen(false)}
                    >
                      취소
                    </button>
                    <button className="ui-btn solid" onClick={handleSaveTags}>
                      저장
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Sub-menu 2: Filename Pattern Extractor with Live Preview */}
            {dialogTab === "pattern" && (
              <>
                <div className="modal-content">
                  <div className="form-grid">
                    <label className="form-label">추출 규칙</label>
                    <input
                      className="form-field"
                      value={filenamePattern}
                      onChange={(e) => setFilenamePattern(e.target.value)}
                      placeholder="%track%. %title%"
                    />
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {[
                      "%track%. %title%",
                      "%artist% - %title%",
                      "%track%. %artist% - %title%",
                      "%track% - %title%",
                    ].map((preset) => (
                      <button
                        key={preset}
                        className={`chip-btn ${
                          filenamePattern === preset ? "active" : ""
                        }`}
                        onClick={() => setFilenamePattern(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <div className="preview-box">
                    {dialogTracks.map((t) => {
                      const parsed = parseFilenamePatternPreview(
                        t.fileName,
                        filenamePattern
                      );
                      const summaryParts: string[] = [];
                      if (parsed.track || parsed.tracknumber) {
                        summaryParts.push(
                          `#${parsed.track || parsed.tracknumber}`
                        );
                      }
                      if (parsed.artist) summaryParts.push(`아티스트: ${parsed.artist}`);
                      if (parsed.title) summaryParts.push(`제목: ${parsed.title}`);
                      if (parsed.album) summaryParts.push(`앨범: ${parsed.album}`);

                      return (
                        <div key={t.id} className="preview-row">
                          <div className="preview-row-file" title={t.fileName}>
                            원본: {t.fileName}
                          </div>
                          <div className="preview-row-parsed">
                            {summaryParts.length > 0
                              ? summaryParts.join(" · ")
                              : "일치하는 토큰 없음"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="modal-foot">
                  <span className="modal-foot-left">
                    미리보기 확인 후 [규칙 적용]을 누르면 반영됩니다 ({dialogTrackIds.length}곡)
                  </span>
                  <div className="modal-foot-right">
                    <button
                      className="ui-btn"
                      onClick={() => setDialogOpen(false)}
                    >
                      취소
                    </button>
                    <button
                      className="ui-btn solid"
                      onClick={handleApplyPattern}
                    >
                      규칙 적용
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Sub-menu 3: Auto Info Matching (Preview -> User Check -> Confirm!) */}
            {dialogTab === "online" && (
              <>
                <div className="modal-content">
                  {/* Top Lookup Bar */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {dialogTrackIds.length === 1 && (
                      <input
                        className="form-field"
                        value={manualMbQuery}
                        onChange={(e) => setManualMbQuery(e.target.value)}
                        placeholder="아티스트 또는 곡 제목 검색어..."
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleManualMbSearch()
                        }
                      />
                    )}
                    {dialogTrackIds.length === 1 && (
                      <button
                        className="ui-btn"
                        onClick={handleManualMbSearch}
                        disabled={matchLoading}
                      >
                        검색어 조회
                      </button>
                    )}
                    <button
                      className="ui-btn solid"
                      style={{
                        marginLeft: dialogTrackIds.length > 1 ? "auto" : 0,
                      }}
                      onClick={handleLookupAutoMatchPreview}
                      disabled={matchLoading}
                    >
                      <Sparkles size={13} />
                      {matchLoading
                        ? "매칭 후보 조회 중..."
                        : `자동 매칭 후보 조회 (${dialogTrackIds.length}곡)`}
                    </button>
                  </div>

                  {/* Field Selection Toggles */}
                  <div className="match-field-toggles">
                    <span
                      style={{
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                        marginRight: 2,
                      }}
                    >
                      반영할 항목:
                    </span>
                    <label>
                      <input
                        type="checkbox"
                        checked={applyFieldTitle}
                        onChange={(e) => setApplyFieldTitle(e.target.checked)}
                      />
                      제목
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={applyFieldArtist}
                        onChange={(e) => setApplyFieldArtist(e.target.checked)}
                      />
                      아티스트
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={applyFieldAlbum}
                        onChange={(e) => setApplyFieldAlbum(e.target.checked)}
                      />
                      앨범·연도
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={applyFieldCover}
                        onChange={(e) => setApplyFieldCover(e.target.checked)}
                      />
                      앨범 커버
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={applyFieldLyrics}
                        onChange={(e) => setApplyFieldLyrics(e.target.checked)}
                      />
                      가사(LRC)
                    </label>
                  </div>

                  {/* Per-Track Before -> After Comparison & Confirmation List */}
                  <div className="preview-box">
                    {matchPreviews.length === 0 ? (
                      <div
                        style={{
                          margin: "auto",
                          textAlign: "center",
                          color: "var(--text-muted)",
                          fontSize: 12,
                          lineHeight: 1.6,
                        }}
                      >
                        {matchLoading
                          ? "온라인 데이터베이스에서 매칭 후보를 조회하고 있습니다..."
                          : "[자동 매칭 후보 조회]를 누르면 기존 태그를 덮어쓰기 전에 변경될 제목·아티스트·앨범·커버·가사 내역을 미리 비교하고 선택할 수 있습니다."}
                      </div>
                    ) : (
                      matchPreviews.map((p) => {
                        const orig = tracks.find((t) => t.id === p.trackId);
                        if (!orig) return null;
                        const isChecked = Boolean(matchCheckedMap[p.trackId]);
                        const selIdx = matchSelectedCandIdx[p.trackId] ?? 0;
                        const cand =
                          selIdx >= 0 ? p.candidates[selIdx] : undefined;
                        const hasMatch =
                          Boolean(cand) ||
                          Boolean(p.matchedSyncedLyrics) ||
                          Boolean(p.matchedPlainLyrics);

                        return (
                          <div
                            key={p.trackId}
                            className={`match-card ${isChecked ? "checked" : ""}`}
                          >
                            <input
                              type="checkbox"
                              style={{ marginTop: 4, cursor: "pointer" }}
                              checked={isChecked}
                              disabled={!hasMatch}
                              onChange={(e) =>
                                setMatchCheckedMap((prev) => ({
                                  ...prev,
                                  [p.trackId]: e.target.checked,
                                }))
                              }
                            />

                            {(() => {
                              const currentCover =
                                orig.coverDataUrl ||
                                getFallbackCoverUrl(orig.title, orig.artist);
                              const candCover =
                                applyFieldCover && cand?.coverUrl
                                  ? cand.coverUrl
                                  : undefined;
                              const candCoverOk =
                                candCover && !failedCoverUrls[candCover]
                                  ? candCover
                                  : undefined;
                              const caption = cand
                                ? `${cand.album}${cand.year ? ` (${cand.year})` : ""}`
                                : orig.album;
                              const openZoom = () =>
                                setCoverZoom({
                                  current: currentCover,
                                  candidate: candCoverOk,
                                  caption,
                                });
                              return (
                                <div className="match-cover-compare">
                                  <button
                                    type="button"
                                    className={`match-cover ${candCover ? "small" : ""}`}
                                    onClick={openZoom}
                                    title="크게 보기"
                                  >
                                    <img src={currentCover} alt="" />
                                    <span className="match-cover-label">현재</span>
                                  </button>
                                  {candCover && (
                                    <>
                                      <span className="match-cover-arrow">→</span>
                                      <button
                                        type="button"
                                        className="match-cover"
                                        onClick={openZoom}
                                        title="크게 보기"
                                      >
                                        {candCoverOk ? (
                                          <img
                                            src={candCoverOk}
                                            alt=""
                                            onError={() =>
                                              setFailedCoverUrls((prev) => ({
                                                ...prev,
                                                [candCover]: true,
                                              }))
                                            }
                                          />
                                        ) : (
                                          <span className="match-cover-missing">
                                            커버 없음
                                          </span>
                                        )}
                                        <span className="match-cover-label">후보</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              );
                            })()}

                            <div
                              style={{
                                flex: 1,
                                minWidth: 0,
                                display: "flex",
                                flexDirection: "column",
                                gap: 3,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 10.5,
                                  color: "var(--text-muted)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                                title={orig.fileName}
                              >
                                파일: {orig.fileName}
                              </div>

                              {p.candidates.length > 0 && (
                                <select
                                  className="form-field"
                                  style={{ height: 24, fontSize: 11, padding: "0 6px" }}
                                  value={selIdx}
                                  onChange={(e) =>
                                    setMatchSelectedCandIdx((prev) => ({
                                      ...prev,
                                      [p.trackId]: Number(e.target.value),
                                    }))
                                  }
                                >
                                  {p.candidates.map((c, idx) => (
                                    <option
                                      key={`${c.recordingId}-${c.releaseId || idx}`}
                                      value={idx}
                                    >
                                      후보 #{idx + 1}: {c.title} — {c.artist} ({c.album}
                                      {c.year ? `, ${c.year}` : ""})
                                    </option>
                                  ))}
                                  <option value={-1}>
                                    메타데이터 변경 안 함 (가사만 적용)
                                  </option>
                                </select>
                              )}

                              {cand ? (
                                <>
                                  <div className="match-diff-line">
                                    <span>제목:</span>
                                    {applyFieldTitle && cand.title !== orig.title ? (
                                      <>
                                        <span className="match-before">
                                          {orig.title}
                                        </span>
                                        <span>→</span>
                                        <span className="match-after">
                                          {cand.title}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="match-after">
                                        {orig.title} (유지)
                                      </span>
                                    )}
                                  </div>
                                  <div className="match-diff-line">
                                    <span>아티스트·앨범:</span>
                                    <span className="match-after">
                                      {applyFieldArtist ? cand.artist : orig.artist} ·{" "}
                                      {applyFieldAlbum ? cand.album : orig.album}
                                      {applyFieldAlbum && cand.year
                                        ? ` (${cand.year})`
                                        : ""}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <div
                                  style={{
                                    fontSize: 11.5,
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  일치하는 메타데이터 후보 없음 (기존 태그 유지)
                                </div>
                              )}

                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  marginTop: 2,
                                }}
                              >
                                {p.matchedSyncedLyrics ? (
                                  <span className="match-badge synced">
                                    싱크 가사 매칭됨
                                  </span>
                                ) : p.matchedPlainLyrics ? (
                                  <span className="match-badge">
                                    일반 가사 매칭됨
                                  </span>
                                ) : (
                                  <span className="match-badge">
                                    매칭된 가사 없음
                                  </span>
                                )}
                                {cand?.coverUrl &&
                                  applyFieldCover &&
                                  !failedCoverUrls[cand.coverUrl] && (
                                    <span className="match-badge">
                                      앨범 커버 포함
                                    </span>
                                  )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="modal-foot">
                  <span className="modal-foot-left">
                    {matchPreviews.length > 0
                      ? `선택된 적용 대상: ${confirmedMatchCount} / ${dialogTrackIds.length}곡`
                      : "사용자가 확인·선택한 항목만 반영됩니다"}
                  </span>
                  <div className="modal-foot-right">
                    <button
                      className="ui-btn"
                      onClick={() => setDialogOpen(false)}
                    >
                      취소
                    </button>
                    <button
                      className="ui-btn solid"
                      disabled={confirmedMatchCount === 0 || matchLoading}
                      onClick={handleConfirmApplyMatches}
                    >
                      선택 항목 적용 ({confirmedMatchCount}곡)
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Sub-menu 4: Lyrics Search & Edit (Preview in Editor before Saving!) */}
            {dialogTab === "lyrics" && (
              <>
                <div className="modal-content">
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      className="form-field"
                      value={lrcSearchQuery}
                      onChange={(e) => setLrcSearchQuery(e.target.value)}
                      placeholder="가사 검색어 (아티스트 제목)..."
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleSearchLrcManual()
                      }
                    />
                    <button
                      className="ui-btn solid"
                      onClick={handleSearchLrcManual}
                      disabled={lrcLoading}
                    >
                      {lrcLoading ? "조회 중..." : "가사 후보 검색"}
                    </button>
                  </div>

                  {lrcResults.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        maxHeight: 105,
                        overflowY: "auto",
                        padding: 4,
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        background: "var(--bg-subtle)",
                      }}
                    >
                      {lrcResults.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 8,
                            padding: "5px 8px",
                            borderRadius: 4,
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 11.5,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.trackName || item.name}
                            </div>
                            <div
                              style={{
                                fontSize: 10.5,
                                color: "var(--text-secondary)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.artistName} · {item.albumName}
                              {item.syncedLyrics ? " · [싱크 가사]" : " · [일반 가사]"}
                            </div>
                          </div>
                          <button
                            className="ui-btn"
                            style={{ height: 24, padding: "0 8px" }}
                            onClick={() => handleLoadLrcCandidateToDraft(item)}
                          >
                            미리보기 로드
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <textarea
                    className="form-textarea"
                    placeholder="[00:12.34] 형식의 LRC 싱크 가사 또는 일반 가사를 입력·확인한 뒤 [가사 저장]을 누르세요..."
                    value={lyricDraft}
                    onChange={(e) => setLyricDraft(e.target.value)}
                  />
                </div>
                <div className="modal-foot">
                  <span className="modal-foot-left">
                    내용 확인 후 [가사 저장]을 누르면 트랙 및 .lrc 파일에 반영됩니다
                  </span>
                  <div className="modal-foot-right">
                    <button
                      className="ui-btn"
                      onClick={() => setDialogOpen(false)}
                    >
                      취소
                    </button>
                    <button
                      className="ui-btn solid"
                      onClick={handleSaveEditedLyrics}
                    >
                      가사 저장
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ======================== STATUS TOAST ======================== */}
      {/* ======================== SETTINGS MODAL ======================== */}
      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div
            className="modal-box settings-box"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <span className="modal-head-title">설정</span>
              <button
                className="ui-btn ghost icon-only"
                onClick={() => setSettingsOpen(false)}
                title="닫기 (Esc)"
              >
                <X size={15} />
              </button>
            </div>

            <div className="modal-tabs">
              {(
                [
                  ["general", "일반"],
                  ["library", "라이브러리"],
                  ["playback", "재생"],
                  ["lyrics", "가사·메타데이터"],
                  ["about", "정보"],
                ] as [SettingsTab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`modal-tab ${settingsTab === key ? "active" : ""}`}
                  onClick={() => setSettingsTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="modal-content">
              {settingsTab === "general" && (
                <>
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">테마</span>
                      <span className="settings-row-desc">
                        제목 표시줄의 달·해 아이콘으로도 바꿀 수 있습니다.
                      </span>
                    </div>
                    <select
                      className="form-field settings-control"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as "light" | "dark")}
                    >
                      <option value="light">라이트</option>
                      <option value="dark">다크</option>
                    </select>
                  </div>
                  <label className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">창 항상 위에 고정</span>
                      <span className="settings-row-desc">
                        다른 창 위에 Lof 창을 계속 표시합니다.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={alwaysOnTop}
                      onChange={(e) => void setPinned(e.target.checked)}
                    />
                  </label>
                  <label className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">
                        시작할 때 변경된 파일 다시 색인
                      </span>
                      <span className="settings-row-desc">
                        앱을 켤 때 등록된 폴더에서 추가·수정·삭제된 파일만 백그라운드로 반영합니다.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={rescanOnStartup}
                      onChange={(e) => setRescanOnStartup(e.target.checked)}
                    />
                  </label>
                </>
              )}

              {settingsTab === "library" && (
                <>
                  <div className="settings-section-head">
                    <span>등록된 폴더</span>
                    <button className="ui-btn" onClick={handleAddFolder}>
                      <FolderPlus size={13} /> 폴더 추가
                    </button>
                  </div>
                  {folders.length === 0 ? (
                    <div className="settings-empty">등록된 폴더가 없습니다.</div>
                  ) : (
                    <div className="settings-folder-list">
                      {folders.map((f) => (
                        <div key={f} className="settings-folder-item" title={f}>
                          <Folder size={13} />
                          <span className="settings-folder-path">{f}</span>
                          <button
                            className="ui-btn ghost icon-only"
                            title="폴더 제거 (파일은 삭제되지 않음)"
                            onClick={() =>
                              api.removeFolder(f).then((snap) => {
                                setTracks(snap.tracks);
                                setFolders(snap.folders);
                                setPlaylists(snap.playlists);
                                notify("폴더를 라이브러리에서 제거했습니다.");
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">다시 색인</span>
                      <span className="settings-row-desc">
                        {scanProgress
                          ? `색인 중: ${scanProgress.processed}/${scanProgress.total}`
                          : "변경분만 다시 읽거나, 캐시를 무시하고 모든 파일의 태그를 다시 읽습니다."}
                      </span>
                    </div>
                    <div className="settings-control-group">
                      <button
                        className="ui-btn"
                        disabled={folders.length === 0}
                        onClick={() => handleRescanLibrary(false)}
                      >
                        변경분 색인
                      </button>
                      <button
                        className="ui-btn"
                        disabled={folders.length === 0}
                        onClick={() => handleRescanLibrary(true)}
                      >
                        전체 다시 색인
                      </button>
                    </div>
                  </div>
                </>
              )}

              {settingsTab === "playback" && (
                <>
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">볼륨</span>
                      <span className="settings-row-desc">
                        마지막 볼륨은 다음 실행 때도 유지됩니다.
                      </span>
                    </div>
                    <div className="settings-control-group">
                      <input
                        type="range"
                        className="settings-range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={isMuted ? 0 : playback.volume}
                        onChange={(e) => handleSetVolume(Number(e.target.value))}
                      />
                      <span className="settings-value">
                        {Math.round((isMuted ? 0 : playback.volume) * 100)}%
                      </span>
                    </div>
                  </div>
                  <label className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">셔플</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={shuffle}
                      onChange={(e) => setShuffle(e.target.checked)}
                    />
                  </label>
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">반복</span>
                    </div>
                    <select
                      className="form-field settings-control"
                      value={repeatMode}
                      onChange={(e) => setRepeatMode(e.target.value as RepeatMode)}
                    >
                      <option value="off">반복 안 함</option>
                      <option value="all">전체 반복</option>
                      <option value="one">한 곡 반복</option>
                    </select>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">재생 화면 앨범아트 최대 크기</span>
                      <span className="settings-row-desc">
                        창이 낮으면 이보다 작게 표시될 수 있습니다.
                      </span>
                    </div>
                    <div className="settings-control-group">
                      <input
                        type="range"
                        className="settings-range"
                        min={NP_ART_MAX_RANGE.min}
                        max={NP_ART_MAX_RANGE.max}
                        step={NP_ART_MAX_RANGE.step}
                        value={npArtMax}
                        onChange={(e) => setNpArtMax(Number(e.target.value))}
                      />
                      <span className="settings-value">{npArtMax}px</span>
                    </div>
                  </div>
                </>
              )}

              {settingsTab === "lyrics" && (
                <>
                  <label className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">.lrc 파일 함께 저장</span>
                      <span className="settings-row-desc">
                        싱크 가사를 저장할 때 음악 파일 옆에 같은 이름의 .lrc 파일도 만듭니다.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={saveLrcFile}
                      onChange={(e) => setSaveLrcFile(e.target.checked)}
                    />
                  </label>
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">자동 매칭 기본 반영 항목</span>
                      <span className="settings-row-desc">
                        자동 정보 매칭 창을 열 때 미리 체크될 항목입니다.
                      </span>
                    </div>
                  </div>
                  <div className="match-field-toggles">
                    {(
                      [
                        ["제목", applyFieldTitle, setApplyFieldTitle],
                        ["아티스트", applyFieldArtist, setApplyFieldArtist],
                        ["앨범·연도", applyFieldAlbum, setApplyFieldAlbum],
                        ["앨범 커버", applyFieldCover, setApplyFieldCover],
                        ["가사(LRC)", applyFieldLyrics, setApplyFieldLyrics],
                      ] as [string, boolean, (v: boolean) => void][]
                    ).map(([label, value, set]) => (
                      <label key={label}>
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={(e) => set(e.target.checked)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">가사 싱크 조정 단위</span>
                      <span className="settings-row-desc">
                        가사 패널의 -/+ 버튼을 한 번 누를 때 움직이는 시간입니다.
                      </span>
                    </div>
                    <select
                      className="form-field settings-control"
                      value={lyricOffsetStepMs}
                      onChange={(e) => setLyricOffsetStepMs(Number(e.target.value))}
                    >
                      {LYRIC_OFFSET_STEPS.map((ms) => (
                        <option key={ms} value={ms}>
                          {formatOffsetStep(ms)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {settingsTab === "about" && (
                <>
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">버전</span>
                    </div>
                    <span className="settings-value">{appInfo?.version ?? "-"}</span>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">데이터 폴더</span>
                      <span className="settings-row-desc settings-path">
                        {appInfo?.dataDir ?? "-"}
                      </span>
                    </div>
                    <button
                      className="ui-btn"
                      disabled={!appInfo}
                      onClick={() =>
                        api.revealDataDir().catch((err) => notify(`폴더 열기 실패: ${err}`))
                      }
                    >
                      <Folder size={13} /> 열기
                    </button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-title">지원 형식</span>
                      <span className="settings-row-desc">
                        {appInfo?.supportedFormats.map((f) => f.toUpperCase()).join(", ") ??
                          "-"}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Album art comparison lightbox (opened from auto-match candidates) */}
      {coverZoom && (
        <div className="cover-zoom-backdrop" onClick={() => setCoverZoom(null)}>
          <div className="cover-zoom-body">
            <figure>
              <img src={coverZoom.current} alt="" />
              <figcaption>현재 커버</figcaption>
            </figure>
            {coverZoom.candidate && (
              <figure>
                <img src={coverZoom.candidate} alt="" />
                <figcaption>후보 커버 · {coverZoom.caption}</figcaption>
              </figure>
            )}
          </div>
          <span className="cover-zoom-hint">클릭하거나 Esc를 눌러 닫기</span>
        </div>
      )}

      {toast && <div className="status-toast">{toast}</div>}
    </div>
  );
}
export default App;
