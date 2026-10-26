import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Folder, FolderPlus, Folders } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";
import { VirtualTrackTable } from "../../components/TrackRows";
import { TrackTableHeader } from "./TrackTableHeader";
import { normalizeFolderPath } from "../workspaces/scope";

export function FolderDirectory() {
  const {
    subFilter, setSubFilter, tableEntries, displayedTracks, directoryFolders, folderLocation,
    selectedIdSet, playback, handleRowClick, handlePlayTrack, handleRowContextMenu,
    handleToggleFavorite, setSelectedIds, handleCollectionContextMenu, handleAddFolder, folders,
    activeWorkspaceId,
  } = useAudioAppContext();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [history, setHistory] = useState({ paths: [subFilter], index: 0 });
  const workspaceRef = useRef(activeWorkspaceId);
  const viewport = useRef<HTMLDivElement>(null);
  const { current, ancestors, parent } = folderLocation;

  useEffect(() => {
    if (subFilter !== null && !current) setSubFilter(null);
  }, [subFilter, current, setSubFilter]);

  useEffect(() => {
    if (workspaceRef.current !== activeWorkspaceId) {
      workspaceRef.current = activeWorkspaceId;
      setHistory({ paths: [null], index: 0 });
    } else {
      setHistory(previous => previous.paths[previous.index] === subFilter ? previous : {
        paths: [...previous.paths.slice(0, previous.index + 1), subFilter], index: previous.index + 1,
      });
    }
    setSelectedFolder(null);
    if (viewport.current) viewport.current.scrollTop = 0;
  }, [subFilter, activeWorkspaceId]);

  const go = (offset: number) => {
    const index = history.index + offset;
    if (index < 0 || index >= history.paths.length) return;
    setHistory(previous => ({ ...previous, index }));
    setSubFilter(history.paths[index]);
  };
  const navigate = (path: string | null) => setSubFilter(path);

  return (
    <section className="folder-directory" aria-label="폴더 탐색기" onKeyDown={event => {
      if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
      if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); go(1); }
      if (event.altKey && event.key === "ArrowUp" && current) { event.preventDefault(); navigate(parent); }
    }}>
      <div className="folder-explorer-toolbar">
        <div className="folder-explorer-navigation">
          <button className="ui-btn ghost icon-only" title="뒤로 (Alt+←)" aria-label="뒤로" disabled={history.index === 0} onClick={() => go(-1)}><ArrowLeft size={15} /></button>
          <button className="ui-btn ghost icon-only" title="앞으로 (Alt+→)" aria-label="앞으로" disabled={history.index >= history.paths.length - 1} onClick={() => go(1)}><ArrowRight size={15} /></button>
          <button className="ui-btn ghost icon-only" title="상위 폴더 (Alt+↑)" aria-label="상위 폴더" disabled={!current} onClick={() => navigate(parent)}><ArrowUp size={15} /></button>
        </div>
        <nav className="folder-explorer-breadcrumbs" aria-label="현재 폴더 경로">
          <button className="folder-explorer-crumb" onClick={() => navigate(null)} aria-current={!current ? "location" : undefined}><Folders size={15} /><span>모든 폴더</span></button>
          {ancestors.map((folder, index) => <div className="folder-explorer-path-part" key={normalizeFolderPath(folder.path)}>
            <ChevronRight size={12} aria-hidden="true" />
            <button className="folder-explorer-crumb" title={folder.path} aria-current={index === ancestors.length - 1 ? "location" : undefined} onClick={() => navigate(folder.path)}>{folder.name}</button>
          </div>)}
        </nav>
      </div>
      <div className="table-viewport folder-explorer-viewport" ref={viewport} onClick={event => {
        if (event.target === event.currentTarget) { setSelectedIds([]); setSelectedFolder(null); }
      }}>
        <table className="track-grid folder-explorer-table" aria-label="현재 폴더의 폴더와 음악">
          <TrackTableHeader titleLabel="이름" />
          <tbody>
            {directoryFolders.map(folder => <tr
              key={normalizeFolderPath(folder.path)}
              className={`folder-explorer-row ${selectedFolder === folder.path ? "selected" : ""}`}
              onClick={() => { setSelectedFolder(folder.path); setSelectedIds([]); }}
              onDoubleClick={() => navigate(folder.path)}
              onContextMenu={event => { setSelectedFolder(folder.path); setSelectedIds([]); handleCollectionContextMenu({ kind: "folder", value: folder.path, label: folder.name }, event); }}
            >
              <td className="folder-explorer-icon"><Folder size={21} /></td>
              <td colSpan={3}><button className="folder-explorer-name" title={folder.path} onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(folder.path); }
              }}>{folder.name}</button></td>
              <td className="t-num">—</td><td className="t-num">폴더</td>
              <td className="t-num folder-explorer-count">{folder.trackCount}곡</td><td />
            </tr>)}
          </tbody>
          <VirtualTrackTable rows={tableEntries} grouped={false} selected={selectedIdSet} currentId={playback.currentTrackId} isPlaying={playback.isPlaying} onSelect={(id, event) => { setSelectedFolder(null); handleRowClick(id, event); }} onPlay={handlePlayTrack} onContext={(track, event) => { setSelectedFolder(null); handleRowContextMenu(track, event); }} onFavorite={handleToggleFavorite} onSelectAlbum={setSelectedIds} />
        </table>
        {directoryFolders.length === 0 && displayedTracks.length === 0 && <div className="folder-directory-empty">
          <Folder size={32} strokeWidth={1.25} />
          <span>{folders.length === 0 ? "이 워크스페이스에 음악 폴더를 추가하세요" : "표시할 폴더나 음악이 없습니다"}</span>
          {folders.length === 0 && <button className="ui-btn" onClick={handleAddFolder}><FolderPlus size={14} /> 음악 폴더 추가</button>}
        </div>}
      </div>
    </section>
  );
}
