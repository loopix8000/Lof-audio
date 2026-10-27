import { UpNextList, VirtualQueue } from "../../components/TrackRows";
import { useAudioAppContext } from "../../app/AppContext";
import { useMemo, useRef, useState } from "react";
import type { Track } from "../../types";
import type { QueueKind } from "./usePlaybackControls";

export function NowPlayingQueue() {
  const {
    displayedTracks,
    playback,
    handlePlayTrack,
    handleRowContextMenu,
    npQueueWidth,
    setNpQueueWidth,
    tracks,
    upNext,
    queueTail,
    handlePlayQueued,
    handleRemoveFromQueue,
    handleClearQueue,
    handleMoveInQueue,
  } = useAudioAppContext();
  // Both queues are pruned to library tracks, so these stay index-aligned with them.
  const byId = useMemo(() => new Map(tracks.map(track => [track.id, track])), [tracks]);
  const upNextTracks = useMemo(() => upNext.flatMap(id => byId.get(id) ?? []), [byId, upNext]);
  const tailTracks = useMemo(() => queueTail.flatMap(id => byId.get(id) ?? []), [byId, queueTail]);
  const queueSection = (kind: QueueKind, label: string, list: Track[]) => list.length > 0 && (
    <section className={`np-upnext np-upnext--${kind}`} aria-label={label}>
      <div className="np-upnext-head">
        <span>{label} · {list.length}곡</span>
        <button type="button" className="np-text-btn" onClick={() => handleClearQueue(kind)}>비우기</button>
      </div>
      <UpNextList tracks={list} onPlay={index => void handlePlayQueued(kind, index)} onRemove={index => handleRemoveFromQueue(kind, index)} onMove={(from, to) => handleMoveInQueue(kind, from, to)} onContext={handleRowContextMenu} />
    </section>
  );
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

    {queueSection("next", "다음에 재생", upNextTracks)}

    <VirtualQueue tracks={displayedTracks} currentId={playback.currentTrackId} isPlaying={playback.isPlaying} onPlay={handlePlayTrack} onContext={handleRowContextMenu} />

    {/* Played after the list above runs out */}
    {queueSection("tail", "대기열 끝에 추가", tailTracks)}
  </div>);
}
