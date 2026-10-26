import { LibrarySidebar } from "../library/LibrarySidebar";
import { NowPlayingScreen } from "../playback/NowPlayingScreen";
import { LibraryBrowser } from "../library/LibraryBrowser";
import { LibraryLyricsPanel } from "../lyrics/LibraryLyricsPanel";
import { AudioDeck } from "../playback/AudioDeck";
import { useAudioAppContext } from "../../app/AppContext";

export function LibraryLayout() {
  const { appMode, nowPlayingOpen } = useAudioAppContext();
  return (appMode === "library" && (
    <>
      <div className="app-body">
        <LibrarySidebar />

        {/* Main Surface: Dedicated Now Playing Screen OR Library Browser */}
        <div className="inset-surface">
          {nowPlayingOpen ? (
            <NowPlayingScreen />
          ) : (
            <>
              <LibraryBrowser />

              {/* Right Collapsible Lyrics Panel inside Library Mode */}
              <LibraryLyricsPanel />
            </>
          )}
        </div>
      </div>

      {/* Bottom Audio Deck (in Library Mode) */}
      <AudioDeck />
    </>
  ));
}
