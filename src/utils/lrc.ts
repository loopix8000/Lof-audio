import { LyricLine } from "../types";

const TIME_REGEX = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(lrcText: string | null | undefined, offsetMs = 0): LyricLine[] {
  if (!lrcText || !lrcText.trim()) return [];

  const lines: LyricLine[] = [];
  const offsetSecs = offsetMs / 1000;

  for (const rawLine of lrcText.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(TIME_REGEX)];
    if (matches.length === 0) continue;

    const text = rawLine.replace(TIME_REGEX, "").trim();
    for (const m of matches) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      let frac = 0;
      if (m[3]) {
        const rawFrac = m[3];
        frac =
          rawFrac.length === 1
            ? parseInt(rawFrac, 10) / 10
            : rawFrac.length === 2
              ? parseInt(rawFrac, 10) / 100
              : parseInt(rawFrac, 10) / 1000;
      }
      const timeSecs = Math.max(0, mins * 60 + secs + frac + offsetSecs);
      lines.push({
        timeSecs,
        text: text || "♪",
      });
    }
  }

  lines.sort((a, b) => a.timeSecs - b.timeSecs);
  return lines;
}

export function findActiveLyricIndex(lines: LyricLine[], positionSecs: number): number {
  if (lines.length === 0) return -1;
  let activeIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (positionSecs + 0.08 >= lines[i].timeSecs) {
      activeIdx = i;
    } else {
      break;
    }
  }
  return activeIdx;
}

export function buildDisplayLyricLines(
  syncedLyrics: string | null | undefined,
  plainLyrics: string | null | undefined,
  offsetMs = 0,
  durationSecs = 0
): LyricLine[] {
  const synced = parseLrc(syncedLyrics || plainLyrics, offsetMs);
  if (synced.length > 0) return synced;

  if (!plainLyrics || !plainLyrics.trim()) return [];
  const rawLines = plainLyrics
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (rawLines.length === 0) return [];

  const totalDur = durationSecs > 0 ? durationSecs : rawLines.length * 4;
  const step = totalDur / rawLines.length;
  return rawLines.map((text, idx) => ({
    timeSecs: idx * step,
    text,
  }));
}

export function formatDuration(secs: number | null | undefined): string {
  if (secs === null || secs === undefined || !isFinite(secs) || secs < 0) {
    return "0:00";
  }
  const total = Math.floor(secs);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const rem = total % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
  }
  return `${mins}:${rem.toString().padStart(2, "0")}`;
}

export function parseFilenamePatternPreview(
  fileName: string,
  pattern: string
): Record<string, string> {
  const stem = fileName.replace(/\.[^/.]+$/, "");
  const tokens: string[] = [];
  const literals: string[] = [];

  let rest = pattern;
  while (true) {
    const start = rest.indexOf("%");
    if (start === -1) break;
    const before = rest.slice(0, start);
    const afterStart = rest.slice(start + 1);
    const end = afterStart.indexOf("%");
    if (end === -1) break;
    const token = afterStart.slice(0, end);
    if (tokens.length > 0) {
      literals.push(before);
    }
    tokens.push(token.toLowerCase());
    rest = afterStart.slice(end + 1);
  }

  const out: Record<string, string> = {};
  if (tokens.length === 0) return out;

  let cur = stem;
  for (let i = 0; i < tokens.length; i++) {
    if (i < literals.length) {
      const sep = literals[i];
      if (sep) {
        const idx = cur.indexOf(sep);
        if (idx !== -1) {
          out[tokens[i]] = cur.slice(0, idx).trim();
          cur = cur.slice(idx + sep.length);
          continue;
        }
      }
    } else {
      out[tokens[i]] = cur.trim();
    }
  }
  return out;
}

export function getFallbackCoverUrl(title: string, artist: string): string {
  const palettes = [
    ["#f1f5f9", "#e2e8f0", "#64748b"],
    ["#fef2f2", "#fee2e2", "#ef4444"],
    ["#eff6ff", "#dbeafe", "#3b82f6"],
    ["#f0fdf4", "#dcfce7", "#10b981"],
    ["#faf5ff", "#f3e8ff", "#8b5cf6"],
    ["#fffbeb", "#fef3c7", "#d97706"],
  ];
  const seed = (title || "").length * 11 + (artist || "").length * 7;
  const [bg1, bg2, fg] = palettes[seed % palettes.length];
  const initial = ((title || "♪").trim()[0] || "♪").toUpperCase().replace(/[<>&"']/g, "");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bg1}"/>
        <stop offset="100%" stop-color="${bg2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#g)"/>
    <circle cx="200" cy="200" r="110" fill="none" stroke="${fg}" stroke-width="2" opacity="0.22"/>
    <circle cx="200" cy="200" r="72" fill="none" stroke="${fg}" stroke-width="1.5" opacity="0.18"/>
    <text x="200" y="226" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="76" font-weight="600" fill="${fg}" opacity="0.65" text-anchor="middle">${initial}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
