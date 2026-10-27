import React, { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Folder, Heart, X } from "lucide-react";
import { Track } from "../types";
import { formatDuration, getFallbackCoverUrl } from "../utils/lrc";

export interface AlbumGroup {
  key: string;
  album: string;
  artist: string;
  year: number | null;
  cover: string;
  tracks: Track[];
}
export interface FolderGroup {
  key: string;
  path: string;
  name: string;
  tracks: Track[];
}
export type TableEntry = { kind: "album"; group: AlbumGroup; collapsed: boolean } | { kind: "folder"; group: FolderGroup; collapsed: boolean } | { kind: "track"; track: Track; index: number; previous?: number; next?: number };
interface Actions {
  onSelect: (id: number, event: React.MouseEvent) => void;
  onPlay: (id: number) => void;
  onContext: (track: Track, event: React.MouseEvent) => void;
  onFavorite: (id: number, event: React.MouseEvent) => void;
  onSelectAlbum: (ids: number[]) => void;
  onAlbumContext?: (group: AlbumGroup, event: React.MouseEvent) => void;
  onToggleAlbum?: (key: string) => void;
  onFolderContext?: (group: FolderGroup, event: React.MouseEvent) => void;
  onToggleFolder?: (key: string) => void;
}
interface RowProps extends Actions {
  track: Track;
  index: number;
  selected: boolean;
  previousSelected: boolean;
  nextSelected: boolean;
  playing: boolean;
  active: boolean;
  showCover?: boolean;
}
const Equalizer = () => <span className="eq-indicator"><span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" /></span>;
const rowClass = (p: RowProps, base: string) => `${base} ${p.selected ? "selected" : ""} ${p.active ? "playing" : ""} ${p.previousSelected ? "sel-has-prev" : ""} ${p.nextSelected ? "sel-has-next" : ""}`;

const TableTrackRow = memo(function TableTrackRow(p: RowProps) {
  const t = p.track;
  return <tr className={rowClass(p, "t-row")} onClick={e => p.onSelect(t.id, e)} onDoubleClick={() => p.onPlay(t.id)} onContextMenu={e => p.onContext(t, e)}>
    <td className="t-num">{p.playing ? <Equalizer /> : t.trackNumber ?? p.index + 1}</td>
    <td title={t.title}><div className="t-cell-title">{p.showCover && <img className="t-row-thumb" loading="lazy" src={t.coverDataUrl || getFallbackCoverUrl(t.title, t.artist)} alt="" />}<span>{t.title}</span></div></td>
    <td className="t-sub" title={t.artist}>{t.artist}</td><td className="t-sub" title={t.album}>{t.album}</td>
    <td className="t-num">{t.year ?? "-"}</td><td className="t-num">{t.format}</td>
    <td className="t-num" style={{ textAlign: "right" }}>{formatDuration(t.durationSecs)}</td>
    <td style={{ textAlign: "center" }} onClick={e => p.onFavorite(t.id, e)}><Heart size={13} fill={t.isFavorite ? "var(--accent-play)" : "none"} color={t.isFavorite ? "var(--accent-play)" : "var(--text-muted)"} /></td>
  </tr>;
});
const PlayerTrackRow = memo(function PlayerTrackRow(p: RowProps) {
  const t = p.track;
  return <div className={rowClass(p, "pm-track-row")} onClick={e => p.onSelect(t.id, e)} onDoubleClick={() => p.onPlay(t.id)} onContextMenu={e => p.onContext(t, e)}>
    <div className="pm-col-num">{p.playing ? <Equalizer /> : t.trackNumber ?? p.index + 1}</div>
    <div className="pm-col-main" title={`${t.title} · ${t.artist}`}><span className="pm-col-title">{t.title}</span>{t.artist && t.artist !== "Unknown Artist" && <span className="pm-col-artist">{t.artist}</span>}</div>
    <div className="pm-col-time">{formatDuration(t.durationSecs)}</div>
  </div>;
});

/** Prefix sums keep scrolling logarithmic even when album headers and track rows differ in height. */
function useWindow(sizes: number[], body: React.RefObject<HTMLElement>, scroller?: React.RefObject<HTMLDivElement>) {
  const offsets = useMemo(() => sizes.reduce((a, size) => { a.push(a[a.length - 1] + size); return a; }, [0]), [sizes]);
  const [view, setView] = useState({ top: 0, height: 600 });
  useLayoutEffect(() => {
    const content = body.current;
    const scroll = scroller?.current ?? content?.closest<HTMLElement>(".table-viewport");
    if (!content || !scroll) return;
    const measure = () => {
      const origin = content.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
      const max = Math.max(0, origin + offsets[offsets.length - 1] - scroll.clientHeight);
      if (scroll.scrollTop > max) scroll.scrollTop = max;
      setView({ top: Math.max(0, scroll.scrollTop - origin), height: scroll.clientHeight });
    };
    measure();
    scroll.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    return () => { scroll.removeEventListener("scroll", measure); observer.disconnect(); };
  }, [body, scroller, offsets]);
  const locate = (position: number) => {
    let lo = 0, hi = sizes.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (offsets[mid + 1] <= position) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const start = Math.max(0, locate(view.top) - 8);
  const end = Math.min(sizes.length, locate(view.top + view.height) + 9);
  return { start, end, before: offsets[start], after: offsets[sizes.length] - offsets[end] };
}
interface ListProps extends Actions {
  selected: Set<number>;
  currentId: number | null;
  isPlaying: boolean;
}
export const VirtualTrackTable = memo(function VirtualTrackTable(p: ListProps & { rows: TableEntry[]; grouped: boolean; showTrackCovers?: boolean }) {
  const body = useRef<HTMLTableSectionElement>(null);
  const sizes = useMemo(() => p.rows.map(row => row.kind === "track" ? 34 : 60), [p.rows]);
  const range = useWindow(sizes, body);
  const spacer = (height: number) => height > 0 ? <tr aria-hidden="true"><td colSpan={8} style={{ height, padding: 0, border: 0 }} /></tr> : null;
  return <tbody ref={body}>{spacer(range.before)}{p.rows.slice(range.start, range.end).map(row => {
    if (row.kind === "album") {
      const g = row.group;
      return <tr key={`album:${g.key}`} className="album-group-row" style={{ height: 60 }} onContextMenu={event => p.onAlbumContext?.(g, event)} onClick={() => p.onSelectAlbum(g.tracks.map(t => t.id))}><td colSpan={8}><div className="album-header-box">
        <button type="button" className="album-group-toggle" aria-label={`${g.album || "Unknown Album"} ${row.collapsed ? "펼치기" : "접기"}`} aria-expanded={!row.collapsed} onClick={event => { event.stopPropagation(); p.onToggleAlbum?.(g.key); }}>
          {row.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <img className="album-header-art" src={g.cover} alt="" loading="lazy" /><div className="album-header-info"><span className="album-header-name">{g.album}</span><span className="album-header-meta">{g.artist}{g.year ? ` · ${g.year}` : ""} · {g.tracks.length}곡</span></div><div className="album-header-rule" />
      </div></td></tr>;
    }
    if (row.kind === "folder") {
      const g = row.group;
      return <tr key={`folder:${g.key}`} className="album-group-row" style={{ height: 60 }} onContextMenu={event => p.onFolderContext?.(g, event)} onClick={() => p.onSelectAlbum(g.tracks.map(t => t.id))}><td colSpan={8}><div className="album-header-box">
        <button type="button" className="album-group-toggle" aria-label={`${g.path} ${row.collapsed ? "펼치기" : "접기"}`} aria-expanded={!row.collapsed} onClick={event => { event.stopPropagation(); p.onToggleFolder?.(g.key); }}>
          {row.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <span className="folder-group-icon" aria-hidden="true"><Folder size={22} /></span>
        <div className="album-header-info folder-group-info"><span className="album-header-name" title={g.path}>{g.name}</span><span className="folder-group-path" title={g.path}>{g.path}</span><span className="album-header-meta">{g.tracks.length}곡</span></div><div className="album-header-rule" />
      </div></td></tr>;
    }
    const t = row.track;
    return <TableTrackRow key={t.id} track={t} index={row.index} selected={p.selected.has(t.id)} previousSelected={row.previous !== undefined && p.selected.has(row.previous)} nextSelected={row.next !== undefined && p.selected.has(row.next)} active={p.currentId === t.id} playing={p.currentId === t.id && p.isPlaying} showCover={p.showTrackCovers ?? !p.grouped} onSelect={p.onSelect} onPlay={p.onPlay} onContext={p.onContext} onFavorite={p.onFavorite} onSelectAlbum={p.onSelectAlbum} />;
  })}{spacer(range.after)}</tbody>;
});
export const VirtualTrackList = memo(function VirtualTrackList(p: ListProps & { tracks: Track[] }) {
  const scroll = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null);
  const sizes = useMemo(() => p.tracks.map(() => 34), [p.tracks]);
  const range = useWindow(sizes, body, scroll);
  return <div className="pm-track-list" ref={scroll}><div ref={body}><div style={{ height: range.before }} aria-hidden="true" />{p.tracks.slice(range.start, range.end).map((track, i) => {
    const index = range.start + i;
    return <PlayerTrackRow key={track.id} track={track} index={index} selected={p.selected.has(track.id)} previousSelected={index > 0 && p.selected.has(p.tracks[index - 1].id)} nextSelected={index + 1 < p.tracks.length && p.selected.has(p.tracks[index + 1].id)} active={p.currentId === track.id} playing={p.currentId === track.id && p.isPlaying} onSelect={p.onSelect} onPlay={p.onPlay} onContext={p.onContext} onFavorite={p.onFavorite} onSelectAlbum={p.onSelectAlbum} />;
  })}<div style={{ height: range.after }} aria-hidden="true" /></div></div>;
});

const QueueRow = memo(function QueueRow({ track: t, index, active, playing, onPlay, onContext }: Pick<RowProps, "track" | "index" | "active" | "playing" | "onPlay" | "onContext">) {
  return <div style={{ height: 46 }}><div className={`np-queue-item ${active ? "playing" : ""}`} style={{ height: 44 }} onClick={() => onPlay(t.id)} onContextMenu={e => onContext(t, e)}>
    <div className="np-queue-num">{playing ? <Equalizer /> : t.trackNumber ?? index + 1}</div>
    <img className="np-queue-thumb" src={t.coverDataUrl || getFallbackCoverUrl(t.title, t.artist)} alt="" loading="lazy" />
    <div className="np-queue-meta"><div className="np-queue-title" title={t.title}>{t.title}</div><div className="np-queue-sub" title={`${t.artist} · ${t.album}`}>{t.artist}</div></div>
    <div className="np-queue-dur">{formatDuration(t.durationSecs)}</div>
  </div></div>;
});
/** Tracks the user queued; short, so not virtualised. Rows are addressed by index (duplicates allowed).
 *  Rows reorder by pointer drag (not HTML5 drag-and-drop, which the Tauri webview's file drop can swallow):
 *  the grabbed row follows the pointer, the rows it passes shift by one slot, and the move commits on release. */
export const UpNextList = memo(function UpNextList(p: { tracks: Track[]; onPlay: (index: number) => void; onRemove: (index: number) => void; onMove: (from: number, to: number) => void; onContext: RowProps["onContext"] }) {
  const [drag, setDrag] = useState<{ from: number; dy: number; step: number } | null>(null);
  const press = useRef<{ index: number; y: number; step: number; pointerId: number } | null>(null);
  const moved = useRef(false);
  const target = drag ? Math.max(0, Math.min(p.tracks.length - 1, drag.from + Math.round(drag.dy / drag.step))) : -1;
  const offset = (i: number) => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < target && i > drag.from && i <= target) return -drag.step;
    if (drag.from > target && i >= target && i < drag.from) return drag.step;
    return 0;
  };
  return <div className={`np-upnext-list ${drag ? "dragging" : ""}`}>{p.tracks.map((t, index) => <div key={`${index}-${t.id}`}
    className={`np-queue-item ${drag?.from === index ? "drag-source" : ""}`}
    style={drag ? { transform: `translateY(${offset(index)}px)` } : undefined}
    onPointerDown={e => {
      if (e.button !== 0) return;
      // Row height plus the list's 2px gap: the distance one slot moves
      press.current = { index, y: e.clientY, step: e.currentTarget.getBoundingClientRect().height + 2, pointerId: e.pointerId };
      moved.current = false;
    }}
    onPointerMove={e => {
      const start = press.current;
      if (!start || start.pointerId !== e.pointerId) return;
      const dy = e.clientY - start.y;
      if (!drag && Math.abs(dy) < 4) return; // still a click
      if (!drag) e.currentTarget.setPointerCapture(e.pointerId);
      moved.current = true;
      setDrag({ from: start.index, dy, step: start.step });
    }}
    onPointerUp={() => {
      press.current = null;
      if (!drag) return;
      if (target !== drag.from) p.onMove(drag.from, target);
      setDrag(null);
    }}
    onPointerCancel={() => { press.current = null; setDrag(null); }}
    onClick={() => { if (moved.current) moved.current = false; else p.onPlay(index); }}
    onContextMenu={e => p.onContext(t, e)}>
    <div className="np-queue-num">{index + 1}</div>
    <img className="np-queue-thumb" src={t.coverDataUrl || getFallbackCoverUrl(t.title, t.artist)} alt="" loading="lazy" draggable={false} />
    <div className="np-queue-meta"><div className="np-queue-title" title={t.title}>{t.title}</div><div className="np-queue-sub" title={`${t.artist} · ${t.album}`}>{t.artist}</div></div>
    <button type="button" className="np-upnext-remove" title="대기열에서 빼기" aria-label={`${t.title} 대기열에서 빼기`} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); p.onRemove(index); }}><X size={13} /></button>
  </div>)}</div>;
});
export const VirtualQueue = memo(function VirtualQueue(p: Pick<ListProps, "currentId" | "isPlaying" | "onPlay" | "onContext"> & { tracks: Track[] }) {
  const scroll = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null);
  const sizes = useMemo(() => p.tracks.map(() => 46), [p.tracks]);
  const range = useWindow(sizes, body, scroll);
  return <div className="np-queue-list" ref={scroll}><div ref={body} style={{ flexShrink: 0 }}><div style={{ height: range.before }} aria-hidden="true" />{p.tracks.slice(range.start, range.end).map((track, index) => <QueueRow key={track.id} track={track} index={range.start + index} active={p.currentId === track.id} playing={p.currentId === track.id && p.isPlaying} onPlay={p.onPlay} onContext={p.onContext} />)}<div style={{ height: range.after }} aria-hidden="true" /></div></div>;
});
