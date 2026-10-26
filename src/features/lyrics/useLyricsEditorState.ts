import { useState } from "react";
import { LrcLibTrack } from "../../types";

export function useLyricsEditorState() {
  const [lrcSearchQuery, setLrcSearchQuery] = useState("");

  const [lrcLoading, setLrcLoading] = useState(false);

  const [lrcResults, setLrcResults] = useState<LrcLibTrack[]>([]);

  const [lyricDraft, setLyricDraft] = useState("");

  return {
    setLrcSearchQuery,
    setLyricDraft,
    setLrcResults,
    lrcSearchQuery,
    setLrcLoading,
    lyricDraft,
    lrcLoading,
    lrcResults,
  };
}

export type LyricsEditorStateModel = ReturnType<typeof useLyricsEditorState>;
