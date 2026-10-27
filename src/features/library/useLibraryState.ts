import { useState, useMemo, useRef, useEffect } from "react";
import { Track, Playlist, ScanProgress, Workspace, WorkspaceState, LibrarySnapshot, HiddenItem } from "../../types";
import { DEFAULT_SETTINGS, FolderViewMode, SortField } from "../../settings";
import { api, onLibraryScanProgress, onLibraryChanged, onAutomationLibraryChanged } from "../../api";
import { followRenamedCollection, mergeTrackChanges } from "../../library";
import { NavCategory, ContextMenuState } from "../../app/types";
import type { NotificationsModel } from "../../app/useNotifications";
import { useEvent } from "../../useEvent";
import { scopeWorkspaceTracks, scopeWorkspacePlaylists, isFolderWithin } from "../workspaces/scope";
import { isTrackHidden } from "./visibility";

interface Inputs {
  notifications: NotificationsModel;
}

export function useLibraryState({
  notifications,
}: Inputs) {
  const { notify } = notifications;
  const [allTracks, setTracks] = useState<Track[]>([]);
  const [hiddenItems, setHiddenItems] = useState<HiddenItem[]>([]);
  const [allPlaylists, setPlaylists] = useState<Playlist[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const workspaceRevisionRef = useRef(-1);
  const refreshingSnapshotRef = useRef(false);
  const activeWorkspace = useMemo(() => workspaces.find(w => w.id === activeWorkspaceId) ?? null, [workspaces, activeWorkspaceId]);
  const folders = useMemo(() => (activeWorkspace?.folders ?? []).filter(folder => !hiddenItems.some(item => item.kind === "folder" && isFolderWithin(folder, item.value))), [activeWorkspace, hiddenItems]);
  const tracks = useMemo(() => scopeWorkspaceTracks(allTracks, folders, activeWorkspace?.excludedTrackIds).filter(track => !isTrackHidden(track, hiddenItems)), [allTracks, folders, activeWorkspace, hiddenItems]);
  const playlists = useMemo(() => scopeWorkspacePlaylists(allPlaylists, activeWorkspaceId, tracks).filter(playlist => !hiddenItems.some(item => item.kind === "playlist" && item.value === String(playlist.id))), [allPlaylists, activeWorkspaceId, tracks, hiddenItems]);

  const applyWorkspaceState = useEvent((state: WorkspaceState, restoreSelection = true) => {
    if (state.workspaceRevision < workspaceRevisionRef.current) return;
    workspaceRevisionRef.current = state.workspaceRevision;
    setWorkspaces(state.workspaces);
    setActiveWorkspaceId(current => restoreSelection || !state.workspaces.some(w => w.id === current) ? state.activeWorkspaceId : current);
  });
  const applySnapshot = useEvent((snapshot: LibrarySnapshot, restoreSelection = false) => {
    // A folder request can finish after creating or switching workspaces. Refresh stale
    // snapshots so they cannot hide a newly created workspace or revert its folders.
    if (snapshot.workspaceRevision < workspaceRevisionRef.current) {
      if (!refreshingSnapshotRef.current) {
        refreshingSnapshotRef.current = true;
        void (async () => {
          try {
            let fresh: LibrarySnapshot;
            do { fresh = await api.getLibraryState(); }
            while (fresh.workspaceRevision < workspaceRevisionRef.current);
            applySnapshot(fresh);
          } catch (error) { notify(`라이브러리 갱신 오류: ${error}`); }
          finally { refreshingSnapshotRef.current = false; }
        })();
      }
      return;
    }
    setTracks(snapshot.tracks);
    setHiddenItems(snapshot.hiddenItems ?? []);
    setPlaylists(snapshot.playlists);
    applyWorkspaceState(snapshot, restoreSelection);
  });

  const [navCategory, setNavCategory] = useState<NavCategory>("all");

  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);

  const [subFilter, setSubFilter] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [sortField, setSortField] = useState<SortField>("album");

  const [sortAsc, setSortAsc] = useState(true);
  const [folderViewMode, setFolderViewMode] = useState<FolderViewMode>(DEFAULT_SETTINGS.folderViewMode);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const [lastClickedId, setLastClickedId] = useState<number | null>(null);

  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  const [addingPlaylist, setAddingPlaylist] = useState(false);

  const [newPlaylistName, setNewPlaylistName] = useState("");

  const creatingPlaylistRef = useRef(false);

  const [allScanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const scanProgress = allScanProgress && folders.some(folder => isFolderWithin(allScanProgress.folder, folder)) ? allScanProgress : null;

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    let ready = false;
    let updating = false;
    const dirty = new Set<number>();
    const flushChanges = async () => {
      if (!ready || updating || disposed) return;
      updating = true;
      while (dirty.size && !disposed) {
        const ids = [...dirty];
        dirty.clear();
        try {
          const changes = await api.getLibraryTracks(ids);
          if (disposed) break;
          const present = new Set(changes.map(t => t.id));
          const removed = new Set(ids.filter(id => !present.has(id)));
          setTracks(previous => mergeTrackChanges(previous, ids, changes));
          if (removed.size) {
            setPlaylists(previous => previous.map(p => ({ ...p, trackIds: p.trackIds.filter(id => !removed.has(id)) })));
            setSelectedIds(previous => previous.filter(id => !removed.has(id)));
          }
        } catch (error) {
          ids.forEach(id => dirty.add(id));
          notify(`라이브러리 갱신 오류: ${error}`);
          break;
        }
      }
      updating = false;
    };
    const loadLibrary = async () => {
      try {
        const snap = await api.getLibraryState();
        if (disposed) return;
        applySnapshot(snap, true);
        ready = true;
        await flushChanges();
      } catch (error) { notify(`라이브러리 로드 오류: ${error}`); }
    };

    (async () => {
      // Subscribe before the first fetch so no background update is missed.
      unlisteners.push(
        await onLibraryScanProgress((p) => setScanProgress(p.done ? null : p)),
        await onLibraryChanged(ids => { ids.forEach(id => dirty.add(id)); void flushChanges(); }),
        await onAutomationLibraryChanged(() => { void loadLibrary(); }),
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

  useEffect(() => {
    setNavCategory("all");
    setSubFilter(null);
    setActivePlaylistId(null);
    setSearchQuery("");
    setCtxMenu(null);
    setAddingPlaylist(false);
    setNewPlaylistName("");
  }, [activeWorkspaceId]);

  // Renaming the album/artist being viewed (tag edit, album match) moves the view to the new name.
  const followedRenameRef = useRef(false);
  const previousViewRef = useRef({ tracks, activeWorkspaceId });
  useEffect(() => {
    const previous = previousViewRef.current;
    previousViewRef.current = { tracks, activeWorkspaceId };
    if (subFilter === null || previous.activeWorkspaceId !== activeWorkspaceId) return;
    if (navCategory !== "albums" && navCategory !== "artists") return;
    const renamed = followRenamedCollection(previous.tracks, tracks, navCategory === "albums" ? "album" : "artist", subFilter);
    if (renamed === null) return;
    followedRenameRef.current = true;
    setSubFilter(renamed);
  }, [tracks]);

  useEffect(() => {
    // Following a rename is the same view, so the selection being edited stays.
    if (followedRenameRef.current) {
      followedRenameRef.current = false;
      return;
    }
    setSelectedIds([]);
    setLastClickedId(null);
  }, [navCategory, subFilter, activePlaylistId, activeWorkspaceId, folderViewMode]);

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  return {
    hiddenItems,
    tracks,
    navCategory,
    activePlaylistId,
    playlists,
    subFilter,
    searchQuery,
    sortField,
    sortAsc,
    folderViewMode,
    setFolderViewMode,
    selectedIds,
    setTracks,
    lastClickedId,
    setSelectedIds,
    setLastClickedId,
    selectedIdSet,
    setCtxMenu,
    setPlaylists,
    creatingPlaylistRef,
    newPlaylistName,
    setAddingPlaylist,
    setNewPlaylistName,
    setNavCategory,
    setActivePlaylistId,
    setSortAsc,
    setSortField,
    setSearchQuery,
    setSubFilter,
    folders,
    addingPlaylist,
    scanProgress,
    ctxMenu,
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    applyWorkspaceState,
    applySnapshot,
  };
}

export type LibraryStateModel = ReturnType<typeof useLibraryState>;
