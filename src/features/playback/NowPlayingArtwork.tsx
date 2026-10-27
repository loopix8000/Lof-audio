import React from "react";
import { Disc, Heart, Edit3 } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function NowPlayingArtwork() {
  const {
    npHeroPaneRef,
    npArtMax,
    activeCover,
    activeTrack,
    setNavCategory,
    setSubFilter,
    handleToggleFavorite,
    openPropertiesDialog,
    handleRowContextMenu,
  } = useAudioAppContext();
  return (<div className="np-hero-pane" ref={npHeroPaneRef}>
    <div
      className="np-art-frame"
      style={{ "--np-art-max": `${npArtMax}px` } as React.CSSProperties}
    >
      <img
        className="np-art-img"
        src={activeCover}
        alt=""
        onContextMenu={(e) => activeTrack && handleRowContextMenu(activeTrack, e)}
      />
    </div>

    <div className="np-track-info">
      <div className="np-badges">
        {activeTrack?.format && (
          <span className="pm-format-badge">
            {activeTrack.format}
          </span>
        )}
        {activeTrack?.year && (
          <span className="np-year-badge">
            {activeTrack.year}
          </span>
        )}
      </div>

      <div
        className="np-track-title"
        title={activeTrack?.title}
      >
        {activeTrack?.title || "재생 중인 곡 없음"}
      </div>

      <div
        className="np-track-artist"
        title={
          activeTrack?.artist
            ? `${activeTrack.artist} — 클릭하여 이 아티스트 보기`
            : ""
        }
        onClick={() => {
          if (activeTrack?.artist) {
            setNavCategory("artists");
            setSubFilter(activeTrack.artist);
          }
        }}
      >
        {activeTrack?.artist || "트랙을 선택해 주세요"}
      </div>

      <div
        className="np-track-album"
        title={
          activeTrack?.album
            ? `${activeTrack.album} — 클릭하여 이 앨범 보기`
            : ""
        }
        onClick={() => {
          if (activeTrack?.album) {
            setNavCategory("albums");
            setSubFilter(activeTrack.album);
          }
        }}
      >
        <Disc size={13} />
        <span>{activeTrack?.album || "-"}</span>
      </div>

      {activeTrack && (
        <div className="np-hero-actions">
          <button
            className={`ui-btn ${activeTrack.isFavorite ? "solid" : ""}`}
            aria-pressed={activeTrack.isFavorite}
            onClick={() =>
              handleToggleFavorite(activeTrack.id)
            }
          >
            <Heart
              size={13}
              fill={
                activeTrack.isFavorite
                  ? "currentColor"
                  : "none"
              }
            />
            좋아요
          </button>
          <button
            className="ui-btn"
            onClick={() =>
              openPropertiesDialog("tags", [activeTrack.id])
            }
          >
            <Edit3 size={13} /> 속성·태그 편집
          </button>
        </div>
      )}
    </div>
  </div>);
}
