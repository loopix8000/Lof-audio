import { Edit3, EyeOff, ListEnd, ListStart, Play, Search, Trash2, Unlink } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { api } from "../../api";
import { useAudioAppContext } from "../../app/AppContext";
import { isFolderWithin, normalizeFolderPath } from "../workspaces/scope";

export function CollectionContextMenu() {
  const {
    collectionContextMenu: menu, setCollectionContextMenu, handleHideItems, visibilityBusy,
    tracks, playlists, folders, activeWorkspaceId, applySnapshot, setSelectedIds,
    handlePlayFromLibrary, openPropertiesDialog, openAlbumMatchDialog, handleRemoveFolder,
    handleDeletePlaylist, notify, handleQueueTracks,
  } = useAudioAppContext();
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element || !menu) return;
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - height - 8))}px`;
  }, [menu]);
  if (!menu) return null;

  const { target } = menu;
  const playlist = target.kind === "playlist" ? playlists.find(item => String(item.id) === target.value) : undefined;
  const trackIds = menu.trackIds ?? (target.kind === "playlist"
    ? playlist?.trackIds ?? []
    : tracks.filter(track => {
      switch (target.kind) {
        case "album": return (track.album || "Unknown Album") === target.value;
        case "artist": return (track.artist || "Unknown Artist") === target.value;
        case "folder": return isFolderWithin(track.folderPath, target.value);
        case "track": return track.filePath === target.value;
        default: return false;
      }
    }).map(track => track.id));
  const visibleIds = new Set(tracks.map(track => track.id));
  const targetIds = trackIds.filter(id => visibleIds.has(id));
  const linkedFolder = target.kind === "folder" && menu.trackIds === undefined && folders.some(folder => normalizeFolderPath(folder) === normalizeFolderPath(target.value));
  const close = () => setCollectionContextMenu(null);
  const removeTracks = async () => {
    if (activeWorkspaceId === null || targetIds.length === 0) return;
    close();
    try {
      const snapshot = await api.deleteTracksFromLibrary(targetIds, activeWorkspaceId);
      applySnapshot(snapshot);
      const removed = new Set(targetIds);
      setSelectedIds(selected => selected.filter(id => !removed.has(id)));
      notify(`워크스페이스에서 ${targetIds.length}곡을 제거했습니다.`);
    } catch (error) {
      notify(`곡 제거 실패: ${error}`);
    }
  };

  return (
    <div ref={menuRef} className="native-menu native-menu--compact" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}>
      <button className="native-menu-item" disabled={targetIds.length === 0} onClick={() => { close(); void handlePlayFromLibrary(targetIds[0]); }}>
        <Play size={13} aria-hidden="true" /><span>첫 곡 재생</span>
      </button>
      <button className="native-menu-item" disabled={targetIds.length === 0} onClick={() => { close(); handleQueueTracks(targetIds, true); }}>
        <ListStart size={13} aria-hidden="true" /><span>다음에 재생 ({targetIds.length}곡)</span>
      </button>
      <button className="native-menu-item" disabled={targetIds.length === 0} onClick={() => { close(); handleQueueTracks(targetIds, false); }}>
        <ListEnd size={13} aria-hidden="true" /><span>재생 대기열에 추가 ({targetIds.length}곡)</span>
      </button>
      <button className="native-menu-item" disabled={targetIds.length === 0} onClick={() => { close(); openPropertiesDialog("tags", targetIds); }}>
        <Edit3 size={13} aria-hidden="true" /><span>속성·태그 편집 ({targetIds.length}곡)…</span>
      </button>
      {target.kind === "album" && (
        <button className="native-menu-item" disabled={targetIds.length === 0} onClick={() => { close(); openAlbumMatchDialog(targetIds); }}>
          <Search size={13} aria-hidden="true" /><span>앨범 정보 조회…</span>
        </button>
      )}
      <div className="native-menu-sep" />
      <button className="native-menu-item" disabled={visibilityBusy} onClick={() => void handleHideItems([target])}>
        <EyeOff size={13} aria-hidden="true" /><span>숨기기</span>
      </button>
      {linkedFolder ? (
        <button className="native-menu-item" onClick={() => { close(); void handleRemoveFolder(target.value); }}>
          <Unlink size={13} aria-hidden="true" /><span>워크스페이스에서 폴더 연결 해제</span>
        </button>
      ) : target.kind !== "playlist" && (
        <button className="native-menu-item" disabled={targetIds.length === 0 || activeWorkspaceId === null} onClick={() => void removeTracks()}>
          <Trash2 size={13} aria-hidden="true" /><span>워크스페이스에서 {targetIds.length}곡 제거</span>
        </button>
      )}
      {playlist && (
        <button className="native-menu-item" onClick={event => { close(); void handleDeletePlaylist(playlist, event); }}>
          <Trash2 size={13} aria-hidden="true" /><span>플레이리스트 삭제</span>
        </button>
      )}
    </div>
  );
}
