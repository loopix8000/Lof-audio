import { api } from "../../api";
import { useEffect } from "react";
import { LrcLibTrack } from "../../types";
import { lookupLyricsBatch } from "./lyricsBatch";
import type { LyricsEntry } from "./lyricsBatch";
import type { LyricsEditorStateModel } from "./useLyricsEditorState";
import type { NotificationsModel } from "../../app/useNotifications";
import type { TrackEditorModel } from "../track-editor/useTrackEditor";
import type { PreferencesModel } from "../settings/usePreferences";
import type { LibraryStateModel } from "../library/useLibraryState";
import type { TrackEditorStateModel } from "../track-editor/useTrackEditorState";

interface Inputs {
  lyricsEditorState: LyricsEditorStateModel;
  notifications: NotificationsModel;
  trackEditor: TrackEditorModel;
  preferences: PreferencesModel;
  libraryState: LibraryStateModel;
  trackEditorState: TrackEditorStateModel;
}

export function useLyricsEditor({
  lyricsEditorState,
  notifications,
  trackEditor,
  preferences,
  libraryState,
  trackEditorState,
}: Inputs) {
  const {
    lyricsEntries,
    setLyricsEntries,
    lyricsEditingTrackId,
    lyricsSessionVersion,
    lyricsBusy,
    setLrcLoading,
    setLyricsSaving,
  } = lyricsEditorState;
  const { notify } = notifications;
  const { dialogTracks, refreshEditedTracks, runTagWrite } = trackEditor;
  const { saveLrcFile } = preferences;
  const { setTracks } = libraryState;
  const { dialogOpen, setDialogOpen } = trackEditorState;
  const entry = lyricsEditingTrackId === null ? undefined : lyricsEntries[lyricsEditingTrackId];
  const lrcSearchQuery = entry?.query || "";
  const lyricDraft = entry?.draft || "";
  const lrcResults = entry?.results || [];
  const lyricsDirtyCount = dialogTracks.filter(track => lyricsEntries[track.id]?.dirty).length;

  useEffect(() => {
    if (!dialogOpen) {
      lyricsSessionVersion.current += 1;
      lyricsBusy.current = false;
      setLrcLoading(false);
      setLyricsSaving(false);
    }
  }, [dialogOpen]);

  const updateEntry = (trackId: number, changes: Partial<LyricsEntry>) => {
    setLyricsEntries(previous => previous[trackId]
      ? { ...previous, [trackId]: { ...previous[trackId], ...changes } }
      : previous);
  };

  const setLrcSearchQuery = (query: string) => {
    if (lyricsEditingTrackId !== null) updateEntry(lyricsEditingTrackId, { query });
  };
  const setLyricDraft = (draft: string) => {
    if (lyricsEditingTrackId !== null && !lyricsBusy.current) {
      updateEntry(lyricsEditingTrackId, { draft, dirty: true, status: "" });
    }
  };

  const handleSearchLrcManual = async () => {
    const trackId = lyricsEditingTrackId;
    if (trackId === null || !lrcSearchQuery.trim() || lyricsBusy.current) return;
    const version = lyricsSessionVersion.current;
    const isCurrent = () => version === lyricsSessionVersion.current;
    lyricsBusy.current = true;
    setLrcLoading(true);
    updateEntry(trackId, { status: "조회 중…" });
    try {
      const list = await api.searchLyricsManual(lrcSearchQuery.trim());
      if (!isCurrent()) return;
      updateEntry(trackId, { results: list, status: list.length ? `${list.length}개 후보` : "검색 결과 없음" });
    } catch (err) {
      if (isCurrent()) updateEntry(trackId, { results: [], status: `가사 검색 실패: ${err}` });
    } finally {
      if (isCurrent()) {
        lyricsBusy.current = false;
        setLrcLoading(false);
      }
    }
  };

  const handleSearchAllLyrics = async () => {
    if (lyricsBusy.current || dialogTracks.length === 0) return;
    const version = lyricsSessionVersion.current;
    const isCurrent = () => version === lyricsSessionVersion.current;
    lyricsBusy.current = true;
    setLrcLoading(true);
    try {
      await lookupLyricsBatch(dialogTracks.map(track => track.id), {
        isCurrent,
        lookup: trackId => {
          updateEntry(trackId, { status: "조회 중…" });
          return api.previewMatchLyrics(trackId, null);
        },
        onResult: (trackId, lyrics) => {
          const draft = lyrics?.syncedLyrics || lyrics?.plainLyrics;
          updateEntry(trackId, lyrics && draft
            ? { draft, results: [lyrics], dirty: true, status: "가사 불러옴" }
            : { results: [], status: "검색 결과 없음" });
        },
        onError: (trackId, error) => updateEntry(trackId, { results: [], status: `가사 검색 실패: ${error}` }),
      });
    } finally {
      if (isCurrent()) {
        lyricsBusy.current = false;
        setLrcLoading(false);
      }
    }
  };

  const handleLoadLrcCandidateToDraft = (cand: LrcLibTrack) => {
    if (lyricsBusy.current) return;
    const text = cand.syncedLyrics || cand.plainLyrics || "";
    setLyricDraft(text);
    notify("가사를 불러왔습니다.");
  };

  const handleSaveEditedLyrics = async () => {
    const targets = dialogTracks.filter(track => lyricsEntries[track.id]?.dirty);
    if (lyricsBusy.current || targets.length === 0) return;
    const version = lyricsSessionVersion.current;
    const isCurrent = () => version === lyricsSessionVersion.current;
    lyricsBusy.current = true;
    setLyricsSaving(true);
    let saved = 0;
    let failed = 0;
    try {
      await runTagWrite("가사 저장 중", targets.length, step => saveAll(step));
      if (!isCurrent()) return;
      if (failed === 0) setDialogOpen(false);
      notify(failed ? `${saved}곡 저장, ${failed}곡 저장 실패` : `${saved}곡의 가사를 저장했습니다.`);
    } finally {
      if (isCurrent()) {
        lyricsBusy.current = false;
        setLyricsSaving(false);
      }
    }

    async function saveAll(step: (done: number) => void) {
      for (const [index, track] of targets.entries()) {
        if (!isCurrent()) return;
        const draft = lyricsEntries[track.id].draft;
        try {
          const hasTime = /\[\d{1,3}:\d{2}/.test(draft);
          const updated = await api.applyLyricsToTrack(track.id, hasTime ? draft : null, draft, saveLrcFile);
          setTracks(previous => previous.map(item => item.id === updated.id ? updated : item));
          if (!isCurrent()) return;
          saved++;
          updateEntry(track.id, { dirty: false, status: "저장됨" });
        } catch (error) {
          if (!isCurrent()) return;
          failed++;
          updateEntry(track.id, { status: `저장 실패: ${error}` });
          await refreshEditedTracks([track.id]);
        }
        step(index + 1);
      }
    }
  };

  return {
    lrcSearchQuery,
    setLrcSearchQuery,
    lyricDraft,
    setLyricDraft,
    lrcResults,
    lyricsDirtyCount,
    handleSearchLrcManual,
    handleSearchAllLyrics,
    handleLoadLrcCandidateToDraft,
    handleSaveEditedLyrics,
  };
}

export type LyricsEditorModel = ReturnType<typeof useLyricsEditor>;
