import { Music, Heart, Disc, Mic2, Folder, ListMusic, ChevronDown, Search, FolderPlus, Plus, Trash2, CheckSquare, ArrowUpDown } from "lucide-react";
import { VirtualTrackList } from "../../components/TrackRows";
import { formatDuration } from "../../utils/lrc";
import { CollectionBrowser } from "./CollectionBrowser";
import { useAudioAppContext } from "../../app/AppContext";

export function CompactLibrary() {
  const {
    showPlayerBrowser,
    setShowPlayerBrowser,
    navCategory,
    currentViewTitle,
    subFilter,
    setNavCategory,
    setSubFilter,
    showPlayerSearch,
    searchQuery,
    setSearchQuery,
    displayedTracks,
    selectedIdSet,
    playback,
    handleRowClick,
    handlePlayTrack,
    handleRowContextMenu,
    handleToggleFavorite,
    setSelectedIds,
    handleAddFolder,
    handleAddFiles,
    handleDeleteSelected,
    selectedIds,
    totalDisplayedDuration,
    cycleStackSort,
    setShowPlayerSearch,
  } = useAudioAppContext();
  return (<section className="pm-playlist-section">
    <div className="pm-collection-bar">
      <div className="pm-collection-left">
        <button
          className={`pm-collection-trigger ${showPlayerBrowser ? "active" : ""
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
      <CollectionBrowser />
    ) : (
      <VirtualTrackList tracks={displayedTracks} selected={selectedIdSet} currentId={playback.currentTrackId} isPlaying={playback.isPlaying} onSelect={handleRowClick} onPlay={handlePlayTrack} onContext={handleRowContextMenu} onFavorite={handleToggleFavorite} onSelectAlbum={setSelectedIds} />
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
          onClick={cycleStackSort}
          title="정렬 기준 변경"
        >
          <ArrowUpDown size={13} />
        </button>
        <button
          className={`flat-icon-btn ${showPlayerSearch ? "active" : ""
            }`}
          style={{ width: 28, height: 28 }}
          onClick={() => setShowPlayerSearch(!showPlayerSearch)}
          title="목록 검색"
        >
          <Search size={13} />
        </button>
      </div>
    </div>
  </section>);
}
