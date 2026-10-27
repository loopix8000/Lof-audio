import { VirtualQueue } from "../../components/TrackRows";
import { useAudioAppContext } from "../../app/AppContext";
import { useRef, useState } from "react";

export function NowPlayingQueue() {
  const {
    displayedTracks,
    playback,
    handlePlayTrack,
    handleRowContextMenu,
    npQueueWidth,
    setNpQueueWidth,
  } = useAudioAppContext();
  const drag = useRef<{ x: number; width: number; pointerId: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  return (<div className="np-queue-pane">
    <div
      className={`pane-resizer-v ${resizing ? "active" : ""}`}
      role="separator"
      aria-label="재생 대기열 너비 조절"
      aria-orientation="vertical"
      aria-valuemin={200}
      aria-valuemax={560}
      aria-valuenow={npQueueWidth}
      tabIndex={0}
      title="드래그해서 너비 조절 · 더블클릭으로 초기화"
      onPointerDown={event => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width: event.currentTarget.parentElement?.getBoundingClientRect().width ?? npQueueWidth, pointerId: event.pointerId };
        setResizing(true);
      }}
      onPointerMove={event => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        setNpQueueWidth(Math.max(200, Math.min(560, drag.current.width + drag.current.x - event.clientX)));
      }}
      onPointerUp={event => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        setResizing(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
      onDoubleClick={() => setNpQueueWidth(290)}
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        setNpQueueWidth(Math.max(200, Math.min(560, npQueueWidth + (event.key === "ArrowLeft" ? 10 : -10))));
      }}
    />
    <div className="np-pane-head">
      <span>재생 대기열</span>
      <span className="np-queue-count">
        {displayedTracks.length}곡
      </span>
    </div>

    <VirtualQueue tracks={displayedTracks} currentId={playback.currentTrackId} isPlaying={playback.isPlaying} onPlay={handlePlayTrack} onContext={handleRowContextMenu} />
  </div>);
}
