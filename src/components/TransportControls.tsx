import React, { useRef, useState, useEffect } from "react";
import { VolumeX, Volume2 } from "lucide-react";

export function NativePlayIcon({ size = 20 }: { size?: number }) {
  // Optical centroid of triangle (6.8, 4.5) -> (16.4, 10.0) -> (6.8, 15.5) is x = (6.8+6.8+16.4)/3 = 10.0, y = 10.0
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M6.8 5.2C6.8 4.41 7.67 3.93 8.35 4.35L16.05 9.15C16.69 9.54 16.69 10.46 16.05 10.85L8.35 15.65C7.67 16.07 6.8 15.59 6.8 14.8V5.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function NativePauseIcon({ size = 20 }: { size?: number }) {
  // Symmetric bars: x=5.0..8.2 (w=3.2) and x=11.8..15.0 (w=3.2), y=4.5..15.5 (h=11)
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="5" y="4.5" width="3.2" height="11" rx="1.2" fill="currentColor" />
      <rect x="11.8" y="4.5" width="3.2" height="11" rx="1.2" fill="currentColor" />
    </svg>
  );
}

export function NativePrevIcon({ size = 18 }: { size?: number }) {
  // Symmetric horizontal bounds: x=4.5 to x=15.5 (center=10.0), y=4.5 to y=15.5 (center=10.0)
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="4.5" y="5" width="2" height="10" rx="1" fill="currentColor" />
      <path
        d="M15.5 5.45C15.5 4.74 14.71 4.32 14.12 4.71L8.12 8.76C7.61 9.11 7.61 9.89 8.12 10.24L14.12 14.29C14.71 14.68 15.5 14.26 15.5 13.55V5.45Z"
        transform="translate(0, 0.5)"
        fill="currentColor"
      />
    </svg>
  );
}

export function NativeNextIcon({ size = 18 }: { size?: number }) {
  // Exact horizontal mirror of NativePrevIcon: x=4.5 to x=15.5 (center=10.0)
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M4.5 5.45C4.5 4.74 5.29 4.32 5.88 4.71L11.88 8.76C12.39 9.11 12.39 9.89 11.88 10.24L5.88 14.29C5.29 14.68 4.5 14.26 4.5 13.55V5.45Z"
        transform="translate(0, 0.5)"
        fill="currentColor"
      />
      <rect x="13.5" y="5" width="2" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}

export interface DraggableSliderProps {
  value: number;
  max: number;
  onChange?: (val: number) => void;
  onCommit?: (val: number) => void;
  style?: React.CSSProperties;
  title?: string;
}

export function DraggableSlider({
  value,
  max,
  onChange,
  onCommit,
  style,
  title,
}: DraggableSliderProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragVal, setDragVal] = useState(0);

  const safeMax = max > 0 ? max : 1;
  const shownVal = dragging ? dragVal : value;
  const percent = Math.min(100, Math.max(0, (shownVal / safeMax) * 100));

  const calcValue = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * safeMax;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || max <= 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = calcValue(e.clientX);
    setDragging(true);
    setDragVal(next);
    onChange?.(next);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const next = calcValue(e.clientX);
    setDragVal(next);
    onChange?.(next);
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const next = calcValue(e.clientX);
    setDragging(false);
    onCommit?.(next);
  };

  return (
    <div
      ref={wrapRef}
      className={`slider-wrap ${dragging ? "dragging" : ""}`}
      style={style}
      title={title}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <div className="slider-track">
        <div className="slider-fill" style={{ width: `${percent}%` }} />
        <div className="slider-thumb" style={{ left: `${percent}%` }} />
      </div>
    </div>
  );
}

export const VOLUME_WHEEL_STEP = 0.05;

export const WHEEL_NOTCH_PX = 100;

export interface VolumeControlProps {
  volume: number;
  muted: boolean;
  onToggleMute: () => void;
  onChange: (vol: number) => void;
  className: string;
  iconSize: number;
  buttonStyle?: React.CSSProperties;
  sliderStyle?: React.CSSProperties;
}

export function VolumeControl({
  volume,
  muted,
  onToggleMute,
  onChange,
  className,
  iconSize,
  buttonStyle,
  sliderStyle,
}: VolumeControlProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const shown = muted ? 0 : volume;
  // Wheel events can arrive faster than re-renders, so track the latest target locally
  const latestRef = useRef(shown);
  latestRef.current = shown;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let accumulated = 0;
    const onWheel = (e: WheelEvent) => {
      // Non-passive listener so hovering the control doesn't also scroll the page
      e.preventDefault();
      const px =
        e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      if (Math.sign(px) !== Math.sign(accumulated)) accumulated = 0;
      accumulated += px;
      // Trackpads send many small deltas; only step once a full notch has accumulated
      const notches = Math.trunc(accumulated / WHEEL_NOTCH_PX);
      if (notches === 0) return;
      accumulated -= notches * WHEEL_NOTCH_PX;
      const next = Math.max(0, Math.min(1, latestRef.current - notches * VOLUME_WHEEL_STEP));
      latestRef.current = Math.round(next * 100) / 100;
      onChangeRef.current(latestRef.current);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const pct = Math.round(shown * 100);
  return (
    <div
      ref={wrapRef}
      className={`volume-control ${className}`}
      title={`음량 ${pct}% · 마우스 휠로 조절`}
    >
      <button
        className="flat-icon-btn"
        style={buttonStyle}
        onClick={onToggleMute}
        title={muted || volume === 0 ? "음소거 해제" : "음소거"}
      >
        {muted || volume === 0 ? <VolumeX size={iconSize} /> : <Volume2 size={iconSize} />}
      </button>
      <DraggableSlider
        value={shown}
        max={1}
        style={sliderStyle}
        onChange={onChange}
        onCommit={onChange}
      />
      <span className="volume-percent">{pct}%</span>
    </div>
  );
}
