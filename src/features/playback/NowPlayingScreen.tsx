import { ChevronLeft, Sparkles } from "lucide-react";
import React from "react";
import { NowPlayingArtwork } from "./NowPlayingArtwork";
import { NowPlayingLyrics } from "../lyrics/NowPlayingLyrics";
import { NowPlayingQueue } from "./NowPlayingQueue";
import { useAudioAppContext } from "../../app/AppContext";

export function NowPlayingScreen() {
  const {
    setNowPlayingOpen,
    currentViewTitle,
    displayedTracks,
    activeTrack,
    openPropertiesDialog,
    npHeroRatio,
  } = useAudioAppContext();
  return (<div className="np-screen">
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
        {activeTrack && (
          <button
            className="ui-btn"
            onClick={() =>
              openPropertiesDialog("lyrics", [activeTrack.id])
            }
          >
            <Sparkles size={13} /> 가사 검색·편집
          </button>
        )}
      </div>
    </div>

    <div
      className="np-body"
      style={
        {
          // Scaled so the factors sum above 1; grid underfills when fr totals < 1
          "--np-hero-fr": `${npHeroRatio * 10}fr`,
          "--np-lyrics-fr": `${(1 - npHeroRatio) * 10}fr`,
        } as React.CSSProperties
      }
    >
      {/* Left: Hero Artwork & Track Info */}
      <NowPlayingArtwork />

      {/* Center: Large Synced Lyrics Stage */}
      <NowPlayingLyrics />

      {/* Right: Up Next Playback Queue */}
      <NowPlayingQueue />
    </div>
  </div>);
}
