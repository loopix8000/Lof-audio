import { VirtualQueue } from "../../components/TrackRows";
import { useAudioAppContext } from "../../app/AppContext";

export function NowPlayingQueue() {
  const {
    displayedTracks,
    playback,
    handlePlayTrack,
    handleRowContextMenu,
  } = useAudioAppContext();
  return (<div className="np-queue-pane">
    <div className="np-pane-head">
      <span>재생 대기열</span>
      <span className="np-queue-count">
        {displayedTracks.length}곡
      </span>
    </div>

    <VirtualQueue tracks={displayedTracks} currentId={playback.currentTrackId} isPlaying={playback.isPlaying} onPlay={handlePlayTrack} onContext={handleRowContextMenu} />
  </div>);
}
