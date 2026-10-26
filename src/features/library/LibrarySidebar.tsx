import { Search, Music, Heart, Mic2, Disc, FolderPlus, Plus, ListMusic, Trash2, RefreshCw, FilePlus } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function LibrarySidebar() {
  const {
    showLeftSidebar,
    searchQuery,
    setSearchQuery,
    nowPlayingOpen,
    navCategory,
    setNavCategory,
    setSubFilter,
    setNowPlayingOpen,
    tracks,
    libraryCounts,
    folders,
    setAddingPlaylist,
    addingPlaylist,
    newPlaylistName,
    setNewPlaylistName,
    handleCreatePlaylist,
    playlists,
    activePlaylistId,
    setActivePlaylistId,
    handleDeletePlaylist,
    scanProgress,
    activeWorkspace,
    handleScanFolder,
    handleRemoveFolder,
    handleAddFolder,
    handleAddFiles,
  } = useAudioAppContext();
  return (showLeftSidebar && (
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
          className={`sidebar-item ${!nowPlayingOpen && navCategory === "all" ? "active" : ""
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
          className={`sidebar-item ${!nowPlayingOpen && navCategory === "favorites"
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
            {libraryCounts.favorites}
          </span>
        </button>
        <button
          className={`sidebar-item ${!nowPlayingOpen && navCategory === "artists" ? "active" : ""
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
            {libraryCounts.artists}
          </span>
        </button>
        <button
          className={`sidebar-item ${!nowPlayingOpen && navCategory === "albums" ? "active" : ""
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
            {libraryCounts.albums}
          </span>
        </button>
        <button
          className={`sidebar-item ${!nowPlayingOpen && navCategory === "folders" ? "active" : ""
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
            className={`sidebar-item ${!nowPlayingOpen &&
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
            <span title={activeWorkspace?.name}>워크스페이스 폴더</span>
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
                    void handleScanFolder(f);
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
                    void handleRemoveFolder(f);
                  }}
                  title="이 워크스페이스에서 폴더 연결 해제"
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
  ));
}
