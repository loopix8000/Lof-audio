import { api, pickFolderDialog, pickAudioFilesDialog } from "../../api";
import { useEvent } from "../../useEvent";
import React from "react";
import { Track, Playlist } from "../../types";
import { SortField } from "../../settings";
import type { NotificationsModel } from "../../app/useNotifications";
import type { LibraryStateModel } from "./useLibraryState";
import type { LibraryViewModel } from "./useLibraryView";

interface Inputs {
  notifications: NotificationsModel;
  libraryState: LibraryStateModel;
  libraryView: LibraryViewModel;
}

export function useLibraryActions({
  notifications,
  libraryState,
  libraryView,
}: Inputs) {
  const { notify } = notifications;
  const {
    lastClickedId,
    setSelectedIds,
    setLastClickedId,
    selectedIdSet,
    setCtxMenu,
    setTracks,
    applySnapshot,
    activeWorkspaceId,
    setPlaylists,
    selectedIds,
    navCategory,
    activePlaylistId,
    playlists,
    creatingPlaylistRef,
    newPlaylistName,
    setAddingPlaylist,
    setNewPlaylistName,
    setNavCategory,
    setActivePlaylistId,
    sortField,
    setSortAsc,
    sortAsc,
    setSortField,
  } = libraryState;
  const { displayedTracks } = libraryView;
  const handleRescanLibrary = async (force: boolean) => {
    if (activeWorkspaceId === null) return;
    try {
      await api.rescanLibrary(force, activeWorkspaceId);
      notify(force ? "이 워크스페이스의 모든 폴더를 다시 색인합니다." : "이 워크스페이스의 변경된 파일을 다시 색인합니다.");
    } catch (err) {
      notify(`색인 시작 실패: ${err}`);
    }
  };

  const handleRowClick = useEvent((trackId: number, e: React.MouseEvent, visibleIds?: number[]) => {
    if (e.shiftKey && lastClickedId !== null) {
      const ids = visibleIds ?? displayedTracks.map((t) => t.id);
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
  });

  const handleRowContextMenu = useEvent((track: Track, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedIdSet.has(track.id)) {
      setSelectedIds([track.id]);
      setLastClickedId(track.id);
    }
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - 235));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - 250));
    setCtxMenu({ x, y, track });
  });

  const handleAddFolder = async () => {
    if (activeWorkspaceId === null) return;
    try {
      const folder = await pickFolderDialog();
      if (!folder) return;
      const snap = await api.scanFolder(folder, activeWorkspaceId);
      applySnapshot(snap);
      notify("폴더를 추가했습니다. 백그라운드에서 색인합니다.");
    } catch (err) {
      notify(`스캔 실패: ${err}`);
    }
  };

  const handleAddFiles = async () => {
    if (activeWorkspaceId === null) return;
    try {
      const files = await pickAudioFilesDialog();
      if (files.length === 0) return;
      const snap = await api.importFiles(files, activeWorkspaceId);
      applySnapshot(snap);
      notify(`${files.length}개 파일 추가 완료`);
    } catch (err) {
      notify(`파일 추가 실패: ${err}`);
    }
  };

  const handleScanFolder = async (folder: string) => {
    if (activeWorkspaceId === null) return;
    try {
      applySnapshot(await api.scanFolder(folder, activeWorkspaceId));
      notify("변경된 파일을 백그라운드에서 색인합니다.");
    } catch (error) { notify(`색인 실패: ${error}`); }
  };

  const handleRemoveFolder = async (folder: string) => {
    if (activeWorkspaceId === null) return;
    try {
      applySnapshot(await api.removeFolder(folder, activeWorkspaceId));
      notify("워크스페이스에서 폴더 연결을 해제했습니다.");
    } catch (error) { notify(`폴더 제거 실패: ${error}`); }
  };

  const handleToggleFavorite = useEvent(async (trackId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const fav = await api.toggleFavorite(trackId);
      setTracks((prev) =>
        prev.map((t) => (t.id === trackId ? { ...t, isFavorite: fav } : t))
      );
    } catch {
      // ignore
    }
  });

  const handleDeleteSelected = async () => {
    if (activeWorkspaceId === null) return;
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
        const snap = await api.deleteTracksFromLibrary(selectedIds, activeWorkspaceId);
        applySnapshot(snap);
        setSelectedIds([]);
        notify("워크스페이스에서 선택 곡이 제거되었습니다.");
      }
    } catch (err) {
      notify(`${err}`);
    }
  };

  const handleCreatePlaylist = async () => {
    if (creatingPlaylistRef.current || activeWorkspaceId === null) return;
    const trimmed = newPlaylistName.trim();
    if (!trimmed) {
      setAddingPlaylist(false);
      return;
    }
    creatingPlaylistRef.current = true;
    try {
      const list = await api.createPlaylist(trimmed, activeWorkspaceId);
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

  return {
    handleDeleteSelected,
    handleCreatePlaylist,
    handleDeletePlaylist,
    handleAddFolder,
    handleAddFiles,
    handleToggleFavorite,
    handleRowContextMenu,
    toggleSort,
    handleRowClick,
    cycleStackSort,
    handleRescanLibrary,
    handleScanFolder,
    handleRemoveFolder,
  };
}

export type LibraryActionsModel = ReturnType<typeof useLibraryActions>;
