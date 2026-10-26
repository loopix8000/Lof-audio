import { formatOffsetStep } from "../../settings";
import { useAudioAppContext } from "../../app/AppContext";

export function LibraryLyricsPanel() {
  const {
    showRightLyricsInLib,
    lyricsPaneWidth,
    resizingLyricsPane,
    handleLyricsResizeStart,
    handleLyricsResizeMove,
    handleLyricsResizeEnd,
    openPropertiesDialog,
    activeTrack,
    lyricsBoxRef,
    lyricLines,
    activeLyricIdx,
    handleSeek,
    handleOffsetChange,
    lyricOffsetStepMs,
  } = useAudioAppContext();
  return (showRightLyricsInLib && (
    <aside
      className="side-inspector"
      style={{ width: lyricsPaneWidth, minWidth: lyricsPaneWidth }}
    >
      <div
        className={`pane-resizer-v ${resizingLyricsPane ? "active" : ""
          }`}
        onPointerDown={handleLyricsResizeStart}
        onPointerMove={handleLyricsResizeMove}
        onPointerUp={handleLyricsResizeEnd}
        onPointerCancel={handleLyricsResizeEnd}
      />
      <div className="inspector-top">
        <span style={{ fontWeight: 600, fontSize: 12.5 }}>가사</span>
        <button
          className="ui-btn ghost"
          style={{ height: 24, padding: "0 8px", fontSize: 11.5 }}
          onClick={() =>
            openPropertiesDialog(
              "lyrics",
              activeTrack ? [activeTrack.id] : undefined
            )
          }
        >
          검색·편집
        </button>
      </div>

      <div className="lyrics-scroll-box" ref={lyricsBoxRef}>
        {lyricLines.length > 0 ? (
          lyricLines.map((line, idx) => (
            <div
              key={`${idx}-${line.timeSecs}`}
              data-lrc-idx={idx}
              className={`lyric-line-item ${idx === activeLyricIdx ? "active" : ""
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
              lineHeight: 1.65,
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
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>가사 정보가 없습니다</span>
            {activeTrack && (
              <button
                className="ui-btn"
                onClick={() =>
                  openPropertiesDialog("lyrics", [activeTrack.id])
                }
              >
                가사 검색·편집
              </button>
            )}
          </div>
        )}
      </div>

      {lyricLines.length > 0 && (
        <div className="inspector-bottom">
          <span>싱크 {activeTrack?.lyricOffsetMs || 0}ms</span>
          <div style={{ display: "flex", gap: 2 }}>
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
        </div>
      )}
    </aside>
  ));
}
