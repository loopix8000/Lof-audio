import { Heart, Edit3, Shuffle, Repeat1, Repeat } from "lucide-react";
import { formatDuration } from "../../utils/lrc";
import { DraggableSlider, NativePrevIcon, NativePauseIcon, NativePlayIcon, NativeNextIcon, VolumeControl } from "../../components/TransportControls";
import { useAudioAppContext } from "../../app/AppContext";

export function CompactDeck() {
  const {
    activeCover,
    activeTrack,
    handleToggleFavorite,
    openPropertiesDialog,
    setNavCategory,
    setSubFilter,
    setShowPlayerBrowser,
    effectivePositionSecs,
    effectiveDurationSecs,
    handleSeekPreview,
    handleSeek,
    shuffle,
    setShuffle,
    repeatMode,
    setRepeatMode,
    handlePrevTrack,
    handleTogglePlay,
    playback,
    handleNextTrack,
    isMuted,
    handleToggleMute,
    handleSetVolume,
    handleRowContextMenu,
  } = useAudioAppContext();
  return (<section className="pm-deck">
    <div className="pm-hero">
      <img className="pm-cover" src={activeCover} alt="" onContextMenu={(e) => activeTrack && handleRowContextMenu(activeTrack, e)} />
      <div className="pm-meta">
        <div className="pm-title-row">
          <div className="pm-title" title={activeTrack?.title}>
            {activeTrack?.title || "재생 중인 곡 없음"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {activeTrack && (
              <button
                className="flat-icon-btn"
                style={{ width: 26, height: 26 }}
                onClick={() => handleToggleFavorite(activeTrack.id)}
                title="즐겨찾기"
              >
                <Heart
                  size={14}
                  fill={
                    activeTrack.isFavorite
                      ? "var(--accent-play)"
                      : "none"
                  }
                  color={
                    activeTrack.isFavorite
                      ? "var(--accent-play)"
                      : "currentColor"
                  }
                />
              </button>
            )}
            <button
              className="flat-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={() => openPropertiesDialog("tags")}
              title="속성·태그 편집"
            >
              <Edit3 size={13} />
            </button>
          </div>
        </div>

        <div
          className="pm-artist clickable"
          title={
            activeTrack?.artist
              ? `${activeTrack.artist} — 클릭하여 이 아티스트의 곡 보기`
              : ""
          }
          onClick={() => {
            if (activeTrack?.artist) {
              setNavCategory("artists");
              setSubFilter(activeTrack.artist);
              setShowPlayerBrowser(false);
            }
          }}
        >
          {activeTrack?.artist || "트랙을 추가해 주세요"}
        </div>

        <div
          className="pm-submeta"
          title={
            activeTrack?.album
              ? `${activeTrack.album} — 클릭하여 이 앨범의 곡 보기`
              : ""
          }
        >
          {activeTrack && (
            <span className="pm-format-badge">
              {activeTrack.format}
            </span>
          )}
          <span
            className={activeTrack?.album ? "pm-album-link" : ""}
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            onClick={() => {
              if (activeTrack?.album) {
                setNavCategory("albums");
                setSubFilter(activeTrack.album);
                setShowPlayerBrowser(false);
              }
            }}
          >
            {activeTrack?.album || "폴더 또는 파일을 열어 재생하세요"}
          </span>
        </div>
      </div>
    </div>

    {/* Flat Seek Bar */}
    <div className="pm-seek-row">
      <span className="pm-time">
        {formatDuration(effectivePositionSecs)}
      </span>
      <DraggableSlider
        value={effectivePositionSecs}
        max={effectiveDurationSecs}
        onChange={(val) => handleSeekPreview(val)}
        onCommit={(val) => handleSeek(val)}
      />
      <span className="pm-time right">
        {formatDuration(effectiveDurationSecs)}
      </span>
    </div>

    {/* Centered Flat Transport Controls */}
    <div className="pm-controls-row">
      <div className="pm-ctrl-left">
        <button
          className={`flat-icon-btn ${shuffle ? "active" : ""}`}
          onClick={() => setShuffle(!shuffle)}
          title={shuffle ? "셔플 켜짐" : "셔플 꺼짐"}
        >
          <Shuffle size={14} />
        </button>
        <button
          className={`flat-icon-btn ${repeatMode !== "off" ? "active" : ""
            }`}
          onClick={() =>
            setRepeatMode(
              repeatMode === "off"
                ? "all"
                : repeatMode === "all"
                  ? "one"
                  : "off"
            )
          }
          title={
            repeatMode === "all"
              ? "전체 반복"
              : repeatMode === "one"
                ? "한 곡 반복"
                : "반복 꺼짐"
          }
        >
          {repeatMode === "one" ? (
            <Repeat1 size={15} />
          ) : (
            <Repeat size={14} />
          )}
        </button>
      </div>

      <div className="pm-ctrl-center">
        <button
          className="flat-icon-btn"
          onClick={handlePrevTrack}
          title="이전 곡"
        >
          <NativePrevIcon size={18} />
        </button>
        <button
          className="pm-play-btn"
          onClick={handleTogglePlay}
          title="재생 / 일시정지"
        >
          {playback.isPlaying ? (
            <NativePauseIcon size={20} />
          ) : (
            <NativePlayIcon size={20} />
          )}
        </button>
        <button
          className="flat-icon-btn"
          onClick={() => handleNextTrack(false)}
          title="다음 곡"
        >
          <NativeNextIcon size={18} />
        </button>
      </div>

      <div className="pm-ctrl-right">
        <VolumeControl
          className="pm-vol-box"
          volume={playback.volume}
          muted={isMuted}
          onToggleMute={handleToggleMute}
          onChange={handleSetVolume}
          iconSize={14}
          buttonStyle={{ width: 26, height: 26 }}
        />
      </div>
    </div>
  </section>);
}
