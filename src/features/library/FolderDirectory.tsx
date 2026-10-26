import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, Folders } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";
import { VirtualTrackTable } from "../../components/TrackRows";
import { TrackTableHeader } from "./TrackTableHeader";
import { buildFolderTree } from "./folderTree";
import type { FolderNode } from "./folderTree";
import { isFolderWithin, normalizeFolderPath } from "../workspaces/scope";

export function FolderDirectory() {
  const {
    folders, tracks, subFilter, setSubFilter, tableEntries, displayedTracks,
    selectedIdSet, playback, handleRowClick, handlePlayTrack, handleRowContextMenu,
    handleToggleFavorite, setSelectedIds,
    handleCollectionContextMenu,
  } = useAudioAppContext();
  const roots = useMemo(() => buildFolderTree(folders, tracks), [folders, tracks]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpanded(previous => {
      const next = new Set(previous);
      const reveal = (nodes: FolderNode[]) => {
        for (const node of nodes) {
          if (subFilter && isFolderWithin(subFilter, node.path)) {
            next.add(normalizeFolderPath(node.path));
            reveal(node.children);
          }
        }
      };
      roots.forEach(root => next.add(normalizeFolderPath(root.path)));
      reveal(roots);
      return next;
    });
  }, [roots, subFilter]);

  const renderNode = (node: FolderNode, depth: number) => {
    const key = normalizeFolderPath(node.path);
    const open = expanded.has(key);
    const selected = subFilter !== null && normalizeFolderPath(subFilter) === key;
    return (
      <div key={key}>
        <div className={`folder-directory-row ${selected ? "active" : ""}`} style={{ paddingLeft: 6 + depth * 16 }} onContextMenu={event => handleCollectionContextMenu({ kind: "folder", value: node.path, label: node.path }, event)}>
          {node.children.length > 0 ? (
            <button
              className="folder-directory-toggle"
              aria-label={`${node.name} ${open ? "접기" : "펼치기"}`}
              aria-expanded={open}
              onClick={() => setExpanded(previous => {
                const next = new Set(previous);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              })}
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : <span className="folder-directory-spacer" />}
          <button className="folder-directory-name" onClick={() => setSubFilter(node.path)} title={node.path} aria-current={selected ? "location" : undefined}>
            {open ? <FolderOpen size={15} /> : <Folder size={15} />}
            <span>{node.name}</span>
            <span className="folder-directory-count">{node.trackCount}</span>
          </button>
        </div>
        {open && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="folder-directory">
      <nav className="folder-directory-tree" aria-label="음악 폴더">
        <div className={`folder-directory-row ${subFilter === null ? "active" : ""}`}>
          <button className="folder-directory-name" onClick={() => setSubFilter(null)} aria-current={subFilter === null ? "location" : undefined}>
            <Folders size={15} />
            <span>모든 폴더</span>
            <span className="folder-directory-count">{tracks.length}</span>
          </button>
        </div>
        {roots.map(root => renderNode(root, 0))}
      </nav>
      <div className="folder-directory-content">
        {subFilter && <div className="folder-directory-path" title={subFilter}>{subFilter}</div>}
        {displayedTracks.length > 0 ? (
          <div className="table-viewport" onClick={event => { if (event.target === event.currentTarget) setSelectedIds([]); }}>
            <table className="track-grid">
              <TrackTableHeader />
              <VirtualTrackTable rows={tableEntries} grouped={false} selected={selectedIdSet} currentId={playback.currentTrackId} isPlaying={playback.isPlaying} onSelect={handleRowClick} onPlay={handlePlayTrack} onContext={handleRowContextMenu} onFavorite={handleToggleFavorite} onSelectAlbum={setSelectedIds} />
            </table>
          </div>
        ) : <div className="folder-directory-empty">표시할 오디오 트랙이 없습니다</div>}
      </div>
    </div>
  );
}
