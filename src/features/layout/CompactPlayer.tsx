import { CompactDeck } from "../playback/CompactDeck";
import { CompactLyrics } from "../lyrics/CompactLyrics";
import { CompactLibrary } from "../library/CompactLibrary";
import { useAudioAppContext } from "../../app/AppContext";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function CompactPlayer() {
  const { appMode, activeTrack, activeCover } = useAudioAppContext();
  const [lyricsOpen, setLyricsOpen] = useState(true);
  return (appMode === "player" && (
    <div className="pm-container">
      {/* 1. TOP FLAT PLAYER SECTION */}
      <CompactDeck />

      {/* 2. LYRICS: toggle + lyrics share one blurred-cover backdrop while open */}
      <div className="pm-lyrics-area">
        {lyricsOpen && (
          <div className="cover-backdrop pm-lyrics-backdrop" aria-hidden="true">
            {activeTrack && <img src={activeCover} alt="" />}
          </div>
        )}
        <button className="pm-lyrics-toggle" onClick={() => setLyricsOpen(open => !open)} aria-expanded={lyricsOpen} aria-controls="compact-lyrics" aria-label={lyricsOpen ? "가사 접기" : "가사 펼치기"} title={lyricsOpen ? "가사 접기" : "가사 펼치기"}>
          {lyricsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {lyricsOpen && <CompactLyrics />}
      </div>

      {/* 3. BOTTOM FLAT TRACK LIST & COLLECTION SWITCHER SECTION */}
      <CompactLibrary />
    </div>
  ));
}
