import { api } from "../../api";
import { LrcLibTrack } from "../../types";
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
    lrcSearchQuery,
    setLrcLoading,
    setLrcResults,
    setLyricDraft,
    lyricDraft,
  } = lyricsEditorState;
  const { notify } = notifications;
  const { dialogPrimaryTrack } = trackEditor;
  const { saveLrcFile } = preferences;
  const { setTracks } = libraryState;
  const { setDialogOpen } = trackEditorState;
  const handleSearchLrcManual = async () => {
    if (!lrcSearchQuery.trim()) return;
    setLrcLoading(true);
    try {
      const list = await api.searchLyricsManual(lrcSearchQuery.trim());
      setLrcResults(list);
      if (list.length === 0) notify("검색된 가사가 없습니다.");
    } catch (err) {
      notify(`가사 검색 실패: ${err}`);
    } finally {
      setLrcLoading(false);
    }
  };

  const handleLoadLrcCandidateToDraft = (cand: LrcLibTrack) => {
    const text = cand.syncedLyrics || cand.plainLyrics || "";
    setLyricDraft(text);
    notify("가사 편집창에 미리보기가 로드되었습니다. 확인 후 [가사 저장]을 누르세요.");
  };

  const handleSaveEditedLyrics = async () => {
    const t = dialogPrimaryTrack;
    if (!t) return;
    try {
      const hasTime = /\[\d{1,3}:\d{2}/.test(lyricDraft);
      const updated = await api.applyLyricsToTrack(
        t.id,
        hasTime ? lyricDraft : null,
        lyricDraft,
        saveLrcFile
      );
      setTracks((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      setDialogOpen(false);
      notify("가사가 저장되었습니다.");
    } catch (err) {
      notify(`저장 실패: ${err}`);
    }
  };

  return {
    handleSearchLrcManual,
    handleLoadLrcCandidateToDraft,
    handleSaveEditedLyrics,
  };
}

export type LyricsEditorModel = ReturnType<typeof useLyricsEditor>;
