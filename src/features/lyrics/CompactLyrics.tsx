import { formatOffsetStep } from "../../settings";
import { Edit3 } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function CompactLyrics() {
  const {
    playerLyricsRef,
    lyricLines,
    activeLyricIdx,
    handleSeek,
    activeTrack,
    handleOffsetChange,
    lyricOffsetStepMs,
    openPropertiesDialog,
  } = useAudioAppContext();
  return (<section id="compact-lyrics" className="pm-lyrics-section">
    <div className="pm-lyrics-scroll" ref={playerLyricsRef}>
      {lyricLines.length > 0 ? (
        lyricLines.map((line, idx) => (
          <div
            key={`${idx}-${line.timeSecs}`}
            data-lrc-idx={idx}
            className={`pm-lyric-line ${idx === activeLyricIdx ? "active" : ""
              }`}
            onClick={() => handleSeek(line.timeSecs)}
          >
            {line.text}
          </div>
        ))
      ) : activeTrack?.plainLyrics ? (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontFamily: "inherit",
            textAlign: "center",
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
          }}
        >
          {activeTrack.plainLyrics}
        </pre>
      ) : (
        <div
          style={{
            margin: "auto",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 12,
          }}
        >
          가사 정보가 없습니다
        </div>
      )}
    </div>

    <div className="pm-lyrics-footer">
      <div style={{ display: "flex", gap: 2 }}>
        <button
          className="pm-micro-btn"
          onClick={() => handleOffsetChange(-lyricOffsetStepMs)}
          title={`싱크 ${formatOffsetStep(lyricOffsetStepMs)} 빠르게`}
        >
          -{formatOffsetStep(lyricOffsetStepMs)}
        </button>
        <button
          className="pm-micro-btn"
          onClick={() => handleOffsetChange(0)}
          title="싱크 초기화"
        >
          {activeTrack?.lyricOffsetMs
            ? `${(activeTrack.lyricOffsetMs / 1000).toFixed(1)}s`
            : "0.0s"}
        </button>
        <button
          className="pm-micro-btn"
          onClick={() => handleOffsetChange(lyricOffsetStepMs)}
          title={`싱크 ${formatOffsetStep(lyricOffsetStepMs)} 느리게`}
        >
          +{formatOffsetStep(lyricOffsetStepMs)}
        </button>
      </div>

      <button
        className="pm-micro-btn"
        onClick={() =>
          openPropertiesDialog(
            "lyrics",
            activeTrack ? [activeTrack.id] : undefined
          )
        }
        title="가사 검색 및 편집"
      >
        <Edit3 size={11} /> 가사 편집
      </button>
    </div>
  </section>);
}
