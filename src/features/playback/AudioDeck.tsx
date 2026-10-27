import { ChevronDown, Heart, Shuffle, Repeat1, Repeat } from "lucide-react";
import { formatDuration } from "../../utils/lrc";
import { NativePrevIcon, NativePauseIcon, NativePlayIcon, NativeNextIcon, DraggableSlider, VolumeControl } from "../../components/TransportControls";
import { useAudioAppContext } from "../../app/AppContext";

export function AudioDeck() {
  const {
    nowPlayingOpen,
    setNowPlayingOpen,
    activeCover,
    activeTrack,
    handleToggleFavorite,
    shuffle,
    setShuffle,
    handlePrevTrack,
    handleTogglePlay,
    playback,
    handleNextTrack,
    repeatMode,
    setRepeatMode,
    effectivePositionSecs,
    effectiveDurationSecs,
    handleSeekPreview,
    handleSeek,
    handleCycleSpeed,
    isMuted,
    handleToggleMute,
    handleSetVolume,
    handleRowContextMenu,
  } = useAudioAppContext();
  return (<footer className="audio-deck">
    <div className="deck-track">
      <div
        className={`deck-art-wrap ${nowPlayingOpen ? "active" : ""}`}
        onClick={() => setNowPlayingOpen((prev) => !prev)}
        onContextMenu={(e) => activeTrack && handleRowContextMenu(activeTrack, e)}
        title={
          nowPlayingOpen
            ? "보관함 화면으로 돌아가기"
            : "클릭하여 재생 화면 열기"
        }
      >
        <img className="deck-art" src={activeCover} alt="" />
        <div className="deck-art-overlay">
          <ChevronDown
            size={16}
            style={{
              transform: nowPlayingOpen ? "rotate(0deg)" : "rotate(180deg)",
              transition: "transform 0.18s ease",
            }}
          />
        </div>
      </div>
      <div className="deck-meta">
        <div
          className="deck-title clickable"
          title={
            activeTrack?.title
              ? `${activeTrack.title} — 클릭하여 재생 화면 열기`
              : ""
          }
          onClick={() => setNowPlayingOpen((prev) => !prev)}
        >
          {activeTrack?.title || "재생 대기 중"}
        </div>
        <div
          className="deck-artist"
          title={
            activeTrack
              ? `${activeTrack.artist} · ${activeTrack.album}`
              : ""
          }
        >
          {activeTrack
            ? `${activeTrack.artist} · ${activeTrack.album}`
            : "트랙을 선택하세요"}
        </div>
      </div>
      {activeTrack && (
        <button
          className="flat-icon-btn"
          onClick={() => handleToggleFavorite(activeTrack.id)}
          title="즐겨찾기"
        >
          <Heart
            size={15}
            fill={
              activeTrack.isFavorite ? "var(--accent-play)" : "none"
            }
            color={
              activeTrack.isFavorite
                ? "var(--accent-play)"
                : "currentColor"
            }
          />
        </button>
      )}
    </div>

    <div className="deck-center">
      <div className="deck-buttons">
        <button
          className={`flat-icon-btn ${shuffle ? "active" : ""}`}
          onClick={() => setShuffle(!shuffle)}
          title={shuffle ? "셔플 켜짐" : "셔플 꺼짐"}
        >
          <Shuffle size={14} />
        </button>
        <button
          className="flat-icon-btn"
          onClick={handlePrevTrack}
          title="이전 곡"
        >
          <NativePrevIcon size={18} />
        </button>
        <button
          className="deck-play"
          onClick={handleTogglePlay}
          title="재생 / 일시정지"
        >
          {playback.isPlaying ? (
            <NativePauseIcon size={18} />
          ) : (
            <NativePlayIcon size={18} />
          )}
        </button>
        <button
          className="flat-icon-btn"
          onClick={() => handleNextTrack(false)}
          title="다음 곡"
        >
          <NativeNextIcon size={18} />
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
            <Repeat1 size={14} />
          ) : (
            <Repeat size={14} />
          )}
        </button>
      </div>

      <div className="deck-seek">
        <span className="deck-time">
          {formatDuration(effectivePositionSecs)}
        </span>
        <DraggableSlider
          value={effectivePositionSecs}
          max={effectiveDurationSecs}
          onChange={(val) => handleSeekPreview(val)}
          onCommit={(val) => handleSeek(val)}
        />
        <span className="deck-time">
          {formatDuration(effectiveDurationSecs)}
        </span>
      </div>
    </div>

    <div className="deck-right">
      <button
        className="ui-btn ghost"
        style={{ height: 24, padding: "0 6px", fontSize: 11.5 }}
        onClick={handleCycleSpeed}
        title="재생 배속 변경"
      >
        {playback.speed}x
      </button>

      <VolumeControl
        className="deck-volume"
        volume={playback.volume}
        muted={isMuted}
        onToggleMute={handleToggleMute}
        onChange={handleSetVolume}
        iconSize={15}
        sliderStyle={{ maxWidth: 84 }}
      />
    </div>
  </footer>);
}
