import { formatOffsetStep } from "../../settings";
import { Music } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function NowPlayingLyrics() {
  const {
    npLyricsPaneRef,
    resizingNpSplit,
    handleNpSplitResizeStart,
    handleNpSplitResizeMove,
    handleNpSplitResizeEnd,
    setNpHeroRatio,
    NP_HERO_RATIO_DEFAULT,
    lyricLines,
    activeTrack,
    handleOffsetChange,
    lyricOffsetStepMs,
    npLyricsRef,
    activeLyricIdx,
    handleSeek,
    openPropertiesDialog,
  } = useAudioAppContext();
  return (<div className="np-lyrics-pane" ref={npLyricsPaneRef}>
    <div
      className={`pane-resizer-v ${resizingNpSplit ? "active" : ""
        }`}
      title="드래그해서 크기 조절 · 더블클릭으로 초기화"
      onPointerDown={handleNpSplitResizeStart}
      onPointerMove={handleNpSplitResizeMove}
      onPointerUp={handleNpSplitResizeEnd}
      onPointerCancel={handleNpSplitResizeEnd}
      onDoubleClick={() => setNpHeroRatio(NP_HERO_RATIO_DEFAULT)}
    />
    <div className="np-pane-head">
      <span>가사</span>
      {lyricLines.length > 0 && (
        <div className="np-sync-controls">
          <span className="np-sync-label">
            싱크 {activeTrack?.lyricOffsetMs || 0}ms
          </span>
          <button
            className="ui-btn ghost"
            style={{ height: 22, padding: "0 6px", fontSize: 11 }}
            onClick={() => handleOffsetChange(-lyricOffsetStepMs)}
          >
            -{formatOffsetStep(lyricOffsetStepMs)}
          </button>
          <button
            className="ui-btn ghost"
            style={{ height: 22, padding: "0 6px", fontSize: 11 }}
            onClick={() => handleOffsetChange(0)}
          >
            0.0s
          </button>
          <button
            className="ui-btn ghost"
            style={{ height: 22, padding: "0 6px", fontSize: 11 }}
            onClick={() => handleOffsetChange(lyricOffsetStepMs)}
          >
            +{formatOffsetStep(lyricOffsetStepMs)}
          </button>
        </div>
      )}
    </div>

    <div className="np-lyrics-scroll" ref={npLyricsRef}>
      {lyricLines.length > 0 ? (
        lyricLines.map((line, idx) => (
          <div
            key={`${idx}-${line.timeSecs}`}
            data-lrc-idx={idx}
            className={`np-lyric-line ${idx === activeLyricIdx ? "active" : ""
              }`}
            onClick={() => handleSeek(line.timeSecs)}
          >
            {line.text}
          </div>
        ))
      ) : activeTrack?.plainLyrics ? (
        <pre className="np-plain-lyrics">
          {activeTrack.plainLyrics}
        </pre>
      ) : (
        <div className="np-empty-lyrics">
          <Music size={28} strokeWidth={1.5} />
          <span>등록된 가사가 없습니다</span>
          {activeTrack && (
            <button
              className="ui-btn"
              onClick={() =>
                openPropertiesDialog("lyrics", [
                  activeTrack.id,
                ])
              }
            >
              가사 검색·편집
            </button>
          )}
        </div>
      )}
    </div>
  </div>);
}
