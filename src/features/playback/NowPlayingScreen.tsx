import { ChevronLeft, PanelRight } from "lucide-react";
import React from "react";
import { NowPlayingArtwork } from "./NowPlayingArtwork";
import { NowPlayingLyrics } from "../lyrics/NowPlayingLyrics";
import { NowPlayingQueue } from "./NowPlayingQueue";
import { useAudioAppContext } from "../../app/AppContext";

export function NowPlayingScreen() {
  const [lyricsOverride, setLyricsOverride] = React.useState<{ trackId: number | null; hasLyrics: boolean; open: boolean } | null>(null);
  const {
    setNowPlayingOpen,
    currentViewTitle,
    displayedTracks,
    activeTrack,
    activeCover,
    lyricLines,
    npHeroRatio,
    npQueueWidth,
  } = useAudioAppContext();
  const trackId = activeTrack?.id ?? null;
  const hasLyrics = lyricLines.some(line => line.text.trim().length > 0) || Boolean(activeTrack?.plainLyrics?.trim());
  const lyricsOpen = lyricsOverride?.trackId === trackId && lyricsOverride.hasLyrics === hasLyrics
    ? lyricsOverride.open
    : hasLyrics;
  return (<div className="np-screen">
    <div
      className={`np-body ${lyricsOpen ? "" : "lyrics-collapsed"}`}
      style={
        {
          "--np-hero-fr": `${npHeroRatio * 10}fr`,
          "--np-lyrics-fr": `${(1 - npHeroRatio) * 10}fr`,
          "--np-queue-width": `${npQueueWidth}px`,
        } as React.CSSProperties
      }
    >
      <div className="cover-backdrop np-backdrop" aria-hidden="true">
        {activeTrack && <img src={activeCover} alt="" />}
      </div>
      {/* Top: header spans the backdrop columns; the queue runs full height beside it */}
      <div className="np-header">
        <div className="surface-title-group">
          <button
            className="surface-back-btn"
            onClick={() => setNowPlayingOpen(false)}
            title="라이브러리 목록으로 돌아가기 (Esc)"
          >
            <ChevronLeft size={14} />
            <span>보관함으로 돌아가기</span>
          </button>
          <span className="surface-title">재생 화면</span>
          <span className="surface-subtitle">
            {currentViewTitle} · {displayedTracks.length}곡 대기열
          </span>
        </div>

        <div className="surface-controls">
          <button className={`ui-btn ghost icon-only ${lyricsOpen ? "active" : ""}`} onClick={() => setLyricsOverride({ trackId, hasLyrics, open: !lyricsOpen })} title={lyricsOpen ? "가사 접기" : "가사 펼치기"} aria-label={lyricsOpen ? "가사 접기" : "가사 펼치기"} aria-expanded={lyricsOpen}>
            <PanelRight size={14} />
          </button>
        </div>
      </div>

      {/* Left: Hero Artwork & Track Info */}
      <NowPlayingArtwork />

      {/* Center: Large Synced Lyrics Stage */}
      {lyricsOpen && <NowPlayingLyrics />}

      {/* Right: Up Next Playback Queue */}
      <NowPlayingQueue />
    </div>
  </div>);
}
