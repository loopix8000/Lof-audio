import { Disc, ListMusic, Mic2, Folder, Music, Heart } from "lucide-react";
import { NativePlayIcon } from "../../components/TransportControls";
import { useAudioAppContext } from "../../app/AppContext";

export function CollectionBrowser() {
  const {
    playerBrowserTab,
    setPlayerBrowserTab,
    albumCards,
    artistCards,
    folderCards,
    navCategory,
    subFilter,
    setNavCategory,
    setSubFilter,
    setShowPlayerBrowser,
    handlePlayFromLibrary,
    tracks,
    libraryCounts,
    playlists,
    activePlaylistId,
    setActivePlaylistId,
    handleCollectionContextMenu,
  } = useAudioAppContext();
  return (<div className="pm-browser-pane">
    <div className="pm-browser-tabs">
      <button
        className={playerBrowserTab === "albums" ? "active" : ""}
        onClick={() => setPlayerBrowserTab("albums")}
      >
        <Disc size={12} /> 앨범 ({albumCards.length})
      </button>
      <button
        className={playerBrowserTab === "playlists" ? "active" : ""}
        onClick={() => setPlayerBrowserTab("playlists")}
      >
        <ListMusic size={12} /> 재생목록
      </button>
      <button
        className={playerBrowserTab === "artists" ? "active" : ""}
        onClick={() => setPlayerBrowserTab("artists")}
      >
        <Mic2 size={12} /> 아티스트 ({artistCards.length})
      </button>
      <button
        className={playerBrowserTab === "folders" ? "active" : ""}
        onClick={() => setPlayerBrowserTab("folders")}
      >
        <Folder size={12} /> 폴더 ({folderCards.length})
      </button>
    </div>

    <div className="pm-browser-list">
      {playerBrowserTab === "albums" &&
        albumCards.map((alb) => {
          const isCurrent =
            navCategory === "albums" && subFilter === alb.album;
          return (
            <div
              key={alb.album}
              onContextMenu={event => handleCollectionContextMenu({ kind: "album", value: alb.album, label: alb.album }, event, alb.tracks.map(track => track.id))}
              className={`pm-browser-item ${isCurrent ? "active" : ""
                }`}
              onClick={() => {
                setNavCategory("albums");
                setSubFilter(alb.album);
                setShowPlayerBrowser(false);
              }}
            >
              <img
                className="pm-browser-thumb"
                src={alb.cover}
                alt=""
              />
              <div className="pm-browser-meta">
                <div className="pm-browser-title">{alb.album}</div>
                <div className="pm-browser-sub">
                  {alb.artist} · {alb.tracks.length}곡
                </div>
              </div>
              <button
                className="flat-icon-btn"
                style={{ width: 26, height: 26 }}
                title="이 앨범 바로 재생"
                onClick={(e) => {
                  e.stopPropagation();
                  setNavCategory("albums");
                  setSubFilter(alb.album);
                  setShowPlayerBrowser(false);
                  if (alb.tracks[0]) {
                    handlePlayFromLibrary(alb.tracks[0].id);
                  }
                }}
              >
                <NativePlayIcon size={15} />
              </button>
            </div>
          );
        })}

      {playerBrowserTab === "playlists" && (
        <>
          <div
            className={`pm-browser-item ${navCategory === "all" ? "active" : ""
              }`}
            onClick={() => {
              setNavCategory("all");
              setSubFilter(null);
              setShowPlayerBrowser(false);
            }}
          >
            <div className="pm-browser-icon-box">
              <Music size={15} />
            </div>
            <div className="pm-browser-meta">
              <div className="pm-browser-title">모든 음악</div>
              <div className="pm-browser-sub">
                전체 보관함 · {tracks.length}곡
              </div>
            </div>
          </div>

          <div
            className={`pm-browser-item ${navCategory === "favorites" ? "active" : ""
              }`}
            onClick={() => {
              setNavCategory("favorites");
              setSubFilter(null);
              setShowPlayerBrowser(false);
            }}
          >
            <div className="pm-browser-icon-box">
              <Heart size={15} />
            </div>
            <div className="pm-browser-meta">
              <div className="pm-browser-title">즐겨찾기</div>
              <div className="pm-browser-sub">
                좋아요 표시한 곡 ·{" "}
                {libraryCounts.favorites}곡
              </div>
            </div>
          </div>

          {playlists.map((pl) => {
            const isCurrent =
              navCategory === "playlist" &&
              activePlaylistId === pl.id;
            return (
              <div
                key={pl.id}
                onContextMenu={event => handleCollectionContextMenu({ kind: "playlist", value: String(pl.id), label: pl.name }, event)}
                className={`pm-browser-item ${isCurrent ? "active" : ""
                  }`}
                onClick={() => {
                  setNavCategory("playlist");
                  setActivePlaylistId(pl.id);
                  setSubFilter(null);
                  setShowPlayerBrowser(false);
                }}
              >
                <div className="pm-browser-icon-box">
                  <ListMusic size={15} />
                </div>
                <div className="pm-browser-meta">
                  <div className="pm-browser-title">{pl.name}</div>
                  <div className="pm-browser-sub">
                    플레이리스트 · {pl.trackIds.length}곡
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {playerBrowserTab === "artists" &&
        artistCards.map((art) => {
          const isCurrent =
            navCategory === "artists" && subFilter === art.artist;
          return (
            <div
              key={art.artist}
              onContextMenu={event => handleCollectionContextMenu({ kind: "artist", value: art.artist, label: art.artist }, event, art.tracks.map(track => track.id))}
              className={`pm-browser-item ${isCurrent ? "active" : ""
                }`}
              onClick={() => {
                setNavCategory("artists");
                setSubFilter(art.artist);
                setShowPlayerBrowser(false);
              }}
            >
              <img
                className="pm-browser-thumb"
                src={art.cover}
                alt=""
              />
              <div className="pm-browser-meta">
                <div className="pm-browser-title">{art.artist}</div>
                <div className="pm-browser-sub">
                  앨범 {art.albumCount}개 · {art.trackCount}곡
                </div>
              </div>
              <button
                className="flat-icon-btn"
                style={{ width: 26, height: 26 }}
                title="이 아티스트 곡 바로 재생"
                onClick={(e) => {
                  e.stopPropagation();
                  setNavCategory("artists");
                  setSubFilter(art.artist);
                  setShowPlayerBrowser(false);
                  if (art.tracks[0]) {
                    handlePlayFromLibrary(art.tracks[0].id);
                  }
                }}
              >
                <NativePlayIcon size={15} />
              </button>
            </div>
          );
        })}

      {playerBrowserTab === "folders" &&
        folderCards.map((fld) => {
          const isCurrent =
            navCategory === "folders" &&
            subFilter === fld.folderPath;
          return (
            <div
              key={fld.folderPath}
              onContextMenu={event => handleCollectionContextMenu({ kind: "folder", value: fld.folderPath, label: fld.folderPath }, event, fld.tracks.map(track => track.id))}
              className={`pm-browser-item ${isCurrent ? "active" : ""
                }`}
              onClick={() => {
                setNavCategory("folders");
                setSubFilter(fld.folderPath);
                setShowPlayerBrowser(false);
              }}
            >
              <img
                className="pm-browser-thumb"
                src={fld.cover}
                alt=""
              />
              <div className="pm-browser-meta">
                <div className="pm-browser-title">
                  {fld.folderName}
                </div>
                <div
                  className="pm-browser-sub"
                  title={fld.folderPath}
                >
                  {fld.tracks.length}곡 · {fld.folderPath}
                </div>
              </div>
              <button
                className="flat-icon-btn"
                style={{ width: 26, height: 26 }}
                title="이 폴더 바로 재생"
                onClick={(e) => {
                  e.stopPropagation();
                  setNavCategory("folders");
                  setSubFilter(fld.folderPath);
                  setShowPlayerBrowser(false);
                  if (fld.tracks[0]) {
                    handlePlayFromLibrary(fld.tracks[0].id);
                  }
                }}
              >
                <NativePlayIcon size={15} />
              </button>
            </div>
          );
        })}
    </div>
  </div>);
}
