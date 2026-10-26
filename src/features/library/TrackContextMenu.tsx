import { api } from "../../api";
import { useAudioAppContext } from "../../app/AppContext";

export function TrackContextMenu() {
  const {
    ctxMenu,
    handlePlayTrack,
    setCtxMenu,
    openPropertiesDialog,
    selectedIds,
    playlists,
    setPlaylists,
    notify,
    handleDeleteSelected,
    navCategory,
  } = useAudioAppContext();
  return (ctxMenu && (
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
        <span>자동 정보 매칭...</span>
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
            : "워크스페이스에서 제거"}
        </span>
        <span className="menu-kbd">Del</span>
      </button>
    </div>
  ));
}
