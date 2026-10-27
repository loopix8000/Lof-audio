import { formatOffsetStep } from "../../settings";
import { Music, Sparkles } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";
import { useEffect } from "react";

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
  useEffect(() => {
    const box = npLyricsRef.current;
    if (!box || lyricLines.length === 0) return;
    const centerLine = (behavior: ScrollBehavior) => {
      const line = box.querySelector<HTMLElement>(`[data-lrc-idx="${Math.max(0, activeLyricIdx)}"]`);
      if (!line) return;
      const boxRect = box.getBoundingClientRect();
      const lineRect = line.getBoundingClientRect();
      box.scrollTo({ top: box.scrollTop + lineRect.top - boxRect.top - (box.clientHeight - lineRect.height) / 2, behavior });
    };
    centerLine("smooth");
    let width = box.clientWidth;
    let height = box.clientHeight;
    const observer = new ResizeObserver(() => {
      if (box.clientWidth === width && box.clientHeight === height) return;
      width = box.clientWidth;
      height = box.clientHeight;
      centerLine("instant");
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [activeLyricIdx, activeTrack?.id, lyricLines, npLyricsRef]);
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
            className="np-sync-btn"
            onClick={() => handleOffsetChange(-lyricOffsetStepMs)}
            aria-label={`가사 싱크 ${formatOffsetStep(lyricOffsetStepMs)} 빠르게`}
          >
            -{formatOffsetStep(lyricOffsetStepMs)}
          </button>
          <button
            className="np-sync-btn"
            onClick={() => handleOffsetChange(0)}
            aria-label="가사 싱크 초기화"
          >
            0.0s
          </button>
          <button
            className="np-sync-btn"
            onClick={() => handleOffsetChange(lyricOffsetStepMs)}
            aria-label={`가사 싱크 ${formatOffsetStep(lyricOffsetStepMs)} 느리게`}
          >
            +{formatOffsetStep(lyricOffsetStepMs)}
          </button>
        </div>
      )}
    </div>

    <div className="np-lyrics-scroll" ref={npLyricsRef}>
      {lyricLines.length > 0 ? (
        <>
        <div className="np-lyrics-spacer" aria-hidden="true" />
        {lyricLines.map((line, idx) => (
          <button
            type="button"
            key={`${idx}-${line.timeSecs}`}
            data-lrc-idx={idx}
            className={`np-lyric-line ${idx === activeLyricIdx ? "active" : ""
              }`}
            onClick={() => handleSeek(line.timeSecs)}
            aria-current={idx === activeLyricIdx ? "true" : undefined}
            title="이 가사부터 재생"
          >
            {line.text}
          </button>
        ))}
        <div className="np-lyrics-spacer" aria-hidden="true" />
        </>
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

    {/* The empty state has its own button, so the footer only shows alongside lyrics */}
    {activeTrack && (lyricLines.length > 0 || activeTrack.plainLyrics) && (
      <div className="np-lyrics-footer">
        <button
          type="button"
          className="np-text-btn"
          onClick={() => openPropertiesDialog("lyrics", [activeTrack.id])}
        >
          <Sparkles size={12} /> 가사 검색·편집
        </button>
      </div>
    )}
  </div>);
}
