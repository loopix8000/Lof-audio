import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { api } from "../../api";
import type { HideTarget } from "../../types";
import type { LibraryStateModel } from "./useLibraryState";
import type { NotificationsModel } from "../../app/useNotifications";
import type { TrackEditorStateModel } from "../track-editor/useTrackEditorState";
import { isFolderWithin } from "../workspaces/scope";

export function useLibraryVisibility({ libraryState, notifications, trackEditorState }: {
  libraryState: LibraryStateModel;
  notifications: NotificationsModel;
  trackEditorState: TrackEditorStateModel;
}) {
  const [collectionContextMenu, setCollectionContextMenu] = useState<{ x: number; y: number; target: HideTarget } | null>(null);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const { applySnapshot, selectedIds, tracks, setCtxMenu, setSelectedIds, setSubFilter, setNavCategory, navCategory, subFilter, activePlaylistId } = libraryState;
  const { notify } = notifications;

  useEffect(() => {
    const close = () => setCollectionContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", escape);
    };
  }, []);

  useEffect(() => { setCollectionContextMenu(null); }, [libraryState.activeWorkspaceId]);
  useEffect(() => { if (libraryState.ctxMenu) setCollectionContextMenu(null); }, [libraryState.ctxMenu]);

  const handleCollectionContextMenu = (target: HideTarget, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setCtxMenu(null);
    setCollectionContextMenu({ target, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 52)) });
  };

  const handleHideItems = async (targets: HideTarget[]) => {
    if (visibilityBusy || targets.length === 0) return;
    setVisibilityBusy(true);
    setCtxMenu(null);
    setCollectionContextMenu(null);
    try {
      const snapshot = await api.hideLibraryItems(targets);
      applySnapshot(snapshot);
      setSelectedIds([]);
      trackEditorState.setDialogOpen(false);
      if (targets.some(target => subFilter !== null && (
        (navCategory === "folders" && target.kind === "folder" && isFolderWithin(subFilter, target.value)) ||
        (navCategory === "albums" && target.kind === "album" && subFilter === target.value) ||
        (navCategory === "artists" && target.kind === "artist" && subFilter === target.value)
      ))) setSubFilter(null);
      if (navCategory === "playlist" && targets.some(target => target.kind === "playlist" && target.value === String(activePlaylistId))) setNavCategory("all");
      notify("숨겼습니다.");
    } catch (error) {
      notify(`숨기기 실패: ${error}`);
    } finally { setVisibilityBusy(false); }
  };

  const handleHideSelected = () => handleHideItems(tracks.filter(track => selectedIds.includes(track.id)).map(track => ({ kind: "track", value: track.filePath, label: `${track.title} · ${track.artist}` })));

  const handleUnhideItem = async (id: number) => {
    if (visibilityBusy) return;
    setVisibilityBusy(true);
    try {
      applySnapshot(await api.unhideLibraryItem(id));
      notify("숨김을 해제했습니다.");
    } catch (error) { notify(`숨김 해제 실패: ${error}`); }
    finally { setVisibilityBusy(false); }
  };

  return { collectionContextMenu, handleCollectionContextMenu, handleHideItems, handleHideSelected, handleUnhideItem, visibilityBusy };
}
