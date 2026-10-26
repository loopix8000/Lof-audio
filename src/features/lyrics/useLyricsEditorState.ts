import { useRef, useState } from "react";
import type { LyricsEntry } from "./lyricsBatch";

export function useLyricsEditorState() {
  const [lyricsEntries, setLyricsEntries] = useState<Record<number, LyricsEntry>>({});
  const [lyricsEditingTrackId, setLyricsEditingTrackId] = useState<number | null>(null);
  const [lrcLoading, setLrcLoading] = useState(false);
  const [lyricsSaving, setLyricsSaving] = useState(false);
  const lyricsSessionVersion = useRef(0);
  const lyricsBusy = useRef(false);

  return {
    lyricsEntries,
    setLyricsEntries,
    lyricsEditingTrackId,
    setLyricsEditingTrackId,
    lyricsSessionVersion,
    lyricsBusy,
    setLrcLoading,
    lrcLoading,
    lyricsSaving,
    setLyricsSaving,
  };
}

export type LyricsEditorStateModel = ReturnType<typeof useLyricsEditorState>;
