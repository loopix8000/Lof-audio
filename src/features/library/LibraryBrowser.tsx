import { ChevronLeft, Edit3, PanelRight, Music, FolderPlus, FilePlus, Search, LayoutGrid, List } from "lucide-react";
import { formatDuration } from "../../utils/lrc";
import { VirtualTrackTable } from "../../components/TrackRows";
import { TrackTableHeader } from "./TrackTableHeader";
import { useAudioAppContext } from "../../app/AppContext";
import { FolderDirectory } from "./FolderDirectory";

export function LibraryBrowser() {
  const {
    subFilter,
    navCategory,
    setSubFilter,
    currentViewTitle,
    effectiveLibView,
    artistCards,
    searchFilteredTracks,
    albumCards,
    folderCards,
    directoryFolders,
    folderViewMode,
    setFolderViewMode,
    displayedTracks,
    totalDisplayedDuration,
    selectedIds,
    openPropertiesDialog,
    showRightLyricsInLib,
    setShowRightLyricsInLib,
    handleAddFolder,
    handleAddFiles,
    handlePlayTrack,
    setSelectedIds,
    tableEntries,
    selectedIdSet,
    playback,
    handleRowClick,
    handleRowContextMenu,
    handleToggleFavorite,
    folders,
    tracks,
    openAlbumMatchDialog,
    handleCollectionContextMenu,
  } = useAudioAppContext();
  return (<div className="main-column">
    <div className="surface-header">
      <div className="surface-title-group">
        {subFilter !== null &&
          (navCategory === "artists" ||
            navCategory === "albums" ||
            (navCategory === "folders" && effectiveLibView !== "folder-directory")) && (
            <button
              className="surface-back-btn"
              onClick={() => setSubFilter(null)}
              title="전체 목록으로 돌아가기"
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
        <span className="surface-title" title={currentViewTitle} onContextMenu={event => {
          if (subFilter !== null && (navCategory === "folders" || navCategory === "albums" || navCategory === "artists")) {
            handleCollectionContextMenu({ kind: navCategory === "folders" ? "folder" : navCategory === "albums" ? "album" : "artist", value: subFilter, label: currentViewTitle || subFilter }, event);
          }
        }}>
          {currentViewTitle}
        </span>
        <span className="surface-subtitle">
          {effectiveLibView === "artist-grid"
            ? `${artistCards.length}명의 아티스트 · 총 ${searchFilteredTracks.length}곡`
            : effectiveLibView === "album-grid"
              ? `${albumCards.length}개의 앨범 · 총 ${searchFilteredTracks.length}곡`
              : effectiveLibView === "folder-grid"
                ? `${folderCards.length}개의 폴더 · 총 ${searchFilteredTracks.length}곡`
                : `${effectiveLibView === "folder-directory" ? `${directoryFolders.length}개 폴더 · ` : ""}${displayedTracks.length}곡 · 총 ${formatDuration(totalDisplayedDuration)}${selectedIds.length > 1
                  ? ` · ${selectedIds.length}곡 선택됨`
                  : ""
                }`}
        </span>
      </div>

      <div className="surface-controls">
        {navCategory === "folders" && (
          <div className="folder-view-switch" role="group" aria-label="폴더 보기 방식">
            <button
              className="ui-btn ghost icon-only"
              title="그리드 보기"
              aria-label="그리드 보기"
              aria-pressed={folderViewMode === "grid"}
              onClick={() => setFolderViewMode("grid")}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              className="ui-btn ghost icon-only"
              title="탐색기 보기"
              aria-label="탐색기 보기"
              aria-pressed={folderViewMode === "directory"}
              onClick={() => setFolderViewMode("directory")}
            >
              <List size={14} />
            </button>
          </div>
        )}
        {navCategory === "albums" && subFilter !== null && (
          <button className="ui-btn" onClick={() => openAlbumMatchDialog(tracks.filter(track => track.album === subFilter).map(track => track.id))}>
            <Search size={13} /> 앨범 정보 조회
          </button>
        )}
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
          className={`ui-btn ghost icon-only ${showRightLyricsInLib ? "active" : ""
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

    {effectiveLibView === "folder-directory" ? (
      <FolderDirectory />
    ) : displayedTracks.length === 0 ? (
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
          {folders.length === 0 ? "이 워크스페이스에 음악 폴더를 추가하세요" : "표시할 오디오 트랙이 없습니다"}
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
            onContextMenu={event => handleCollectionContextMenu({ kind: "artist", value: card.artist, label: card.artist }, event)}
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
            onContextMenu={event => handleCollectionContextMenu({ kind: "album", value: card.album, label: card.album }, event)}
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
            onContextMenu={event => handleCollectionContextMenu({ kind: "folder", value: card.folderPath, label: card.folderPath }, event)}
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
          <TrackTableHeader />
          <VirtualTrackTable onAlbumContext={(group, event) => handleCollectionContextMenu({ kind: "album", value: group.album || "Unknown Album", label: group.album || "Unknown Album" }, event)} rows={tableEntries} grouped={effectiveLibView === "grouped"} selected={selectedIdSet} currentId={playback.currentTrackId} isPlaying={playback.isPlaying} onSelect={handleRowClick} onPlay={handlePlayTrack} onContext={handleRowContextMenu} onFavorite={handleToggleFavorite} onSelectAlbum={setSelectedIds} />
        </table>
      </div>
    )}
  </div>);
}
