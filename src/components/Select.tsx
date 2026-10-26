import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

interface SelectProps<T extends string | number> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  "aria-label": string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  placeholder?: string;
}

/** Focus stays on the combobox; the portalled list can escape scrolling panels. */
export function Select<T extends string | number>({
  value, options, onChange, className = "", style, disabled = false,
  placeholder = "선택...", "aria-label": label,
}: SelectProps<T>) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const selectedIndex = options.findIndex(option => option.value === value);
  const selected = options[selectedIndex];
  const expanded = open && !disabled && options.length > 0;

  useEffect(() => { if (disabled || options.length === 0) setOpen(false); }, [disabled, options.length]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const gap = 4;
      const below = window.innerHeight - rect.bottom - margin - gap;
      const above = rect.top - margin - gap;
      const height = Math.min(248, options.length * 30 + 8);
      const upwards = below < height && above > below;
      const maxHeight = Math.max(0, Math.min(248, upwards ? above : below));
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - margin * 2);
      setPosition({
        width, maxHeight,
        left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
        ...(upwards ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
      });
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !triggerRef.current?.contains(event.target) && !listRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    place();
    const observer = new ResizeObserver(place);
    if (triggerRef.current) observer.observe(triggerRef.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [expanded, options.length]);

  useLayoutEffect(() => {
    if (!expanded) return;
    if (activeIndex >= options.length) { setActiveIndex(Math.max(0, selectedIndex)); return; }
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [expanded, activeIndex, options.length, selectedIndex]);

  const show = (index = Math.max(0, selectedIndex)) => {
    searchRef.current = { text: "", time: 0 };
    setActiveIndex(index);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    setOpen(false);
    triggerRef.current?.focus();
    if (option.value !== value) onChange(option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Let a second Escape reach the enclosing dialog after the list has closed.
    if (event.key === "Escape" && !expanded) return;
    event.stopPropagation();
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!expanded) show(selectedIndex < 0 && event.key === "ArrowUp" ? options.length - 1 : Math.max(0, selectedIndex));
      else if (event.altKey && event.key === "ArrowUp") choose(activeIndex);
      else setActiveIndex(index => Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const index = event.key === "Home" ? 0 : options.length - 1;
      if (!expanded) show(index); else setActiveIndex(index);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (expanded) choose(activeIndex); else show();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const now = Date.now();
      const previous = searchRef.current;
      const text = (now - previous.time < 700 ? previous.text : "") + event.key.toLocaleLowerCase();
      searchRef.current = { text, time: now };
      const query = [...text].every(char => char === text[0]) ? text[0] : text;
      const start = expanded ? activeIndex : selectedIndex;
      for (let offset = 1; offset <= options.length; offset++) {
        const index = (start + offset) % options.length;
        if (options[index].label.toLocaleLowerCase().startsWith(query)) {
          if (!expanded) { setOpen(true); }
          setActiveIndex(index);
          break;
        }
      }
    }
  };

  return <>
    <button
      ref={triggerRef}
      type="button"
      role="combobox"
      className={`form-field custom-select ${className}`}
      style={style}
      disabled={disabled || options.length === 0}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={expanded}
      aria-controls={expanded ? `${id}-list` : undefined}
      aria-activedescendant={expanded && options[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
      title={selected?.label}
      onClick={() => expanded ? setOpen(false) : show()}
      onBlur={() => setOpen(false)}
      onKeyDown={onKeyDown}
    >
      <span className="custom-select-value">{selected?.label ?? placeholder}</span>
      <ChevronDown size={14} className="custom-select-chevron" aria-hidden="true" />
    </button>
    {expanded && createPortal(
      <div
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        className="custom-select-list"
        style={position}
        onMouseDown={event => event.preventDefault()}
        onClick={event => event.stopPropagation()}
      >
        {options.map((option, index) => <div
          key={option.value}
          id={`${id}-option-${index}`}
          role="option"
          aria-selected={option.value === value}
          data-index={index}
          className={`custom-select-option ${index === activeIndex ? "active" : ""}`}
          title={option.label}
          onPointerMove={() => setActiveIndex(index)}
          onClick={() => choose(index)}
        >
          <span className="custom-select-value">{option.label}</span>
          {option.value === value && <Check size={13} aria-hidden="true" />}
        </div>)}
      </div>, document.body,
    )}
  </>;
}
