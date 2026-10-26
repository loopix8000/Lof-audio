import { CompactDeck } from "../playback/CompactDeck";
import { CompactLyrics } from "../lyrics/CompactLyrics";
import { CompactLibrary } from "../library/CompactLibrary";
import { useAudioAppContext } from "../../app/AppContext";

export function CompactPlayer() {
  const { appMode } = useAudioAppContext();
  return (appMode === "player" && (
    <div className="pm-container">
      {/* 1. TOP FLAT PLAYER SECTION */}
      <CompactDeck />

      {/* 2. MIDDLE FLAT SYNCED LYRICS SECTION (Always Visible) */}
      <CompactLyrics />

      {/* 3. BOTTOM FLAT TRACK LIST & COLLECTION SWITCHER SECTION */}
      <CompactLibrary />
    </div>
  ));
}
