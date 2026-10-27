import { useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes } from "react";

// Slide speed in px per second; the ends hold briefly so both edges can be read.
const SLIDE_PX_PER_SEC = 40;

/**
 * One line of text that is cut off with an ellipsis, and slides on hover to show the rest.
 * Expects a nowrap / overflow-hidden class, like the deck title.
 */
export function MarqueeText({ className = "", children, onMouseEnter, onMouseLeave, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const sliding = shift > 0;
  return (
    <div
      {...rest}
      ref={ref}
      className={`${className} marquee ${sliding ? "sliding" : ""}`}
      style={sliding ? {
        ...style,
        "--marquee-shift": `-${shift}px`,
        "--marquee-duration": `${Math.max(2, shift / SLIDE_PX_PER_SEC / 0.6)}s`,
      } as CSSProperties : style}
      onMouseEnter={(event) => {
        const box = ref.current;
        if (box) setShift(Math.max(0, box.scrollWidth - box.clientWidth));
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setShift(0);
        onMouseLeave?.(event);
      }}
    >
      <span className="marquee-inner">{children}</span>
    </div>
  );
}
