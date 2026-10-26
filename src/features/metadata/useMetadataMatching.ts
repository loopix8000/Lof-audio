import { api } from "../../api";
import { MusicBrainzCandidate, TrackMatchPreview, ConfirmTrackMatchItem } from "../../types";
import { mergeTrackChanges } from "../../library";
import { useMemo } from "react";
import type { MetadataStateModel } from "./useMetadataState";
import type { TrackEditorStateModel } from "../track-editor/useTrackEditorState";
import type { NotificationsModel } from "../../app/useNotifications";
import type { TrackEditorModel } from "../track-editor/useTrackEditor";
import type { LibraryStateModel } from "../library/useLibraryState";

interface Inputs {
  metadataState: MetadataStateModel;
  trackEditorState: TrackEditorStateModel;
  notifications: NotificationsModel;
  trackEditor: TrackEditorModel;
  libraryState: LibraryStateModel;
}

export function useMetadataMatching({
  metadataState,
  trackEditorState,
  notifications,
  trackEditor,
  libraryState,
}: Inputs) {
  const {
    matchDialogVersion,
    setMatchLoading,
    setMatchPreviews,
    setMatchCheckedMap,
    setMatchSelectedCandIdx,
    matchRequestVersion,
    setLyricsPendingIds,
    manualMbQuery,
    matchPreviews,
    matchCheckedMap,
    matchSelectedCandIdx,
    applyFieldTitle,
    applyFieldArtist,
    applyFieldAlbum,
    applyFieldCover,
    applyFieldLyrics,
  } = metadataState;
  const { dialogTrackIds, setDialogOpen } = trackEditorState;
  const { notify } = notifications;
  const { dialogPrimaryTrack, refreshEditedTracks } = trackEditor;
  const { setTracks } = libraryState;
  const handleLookupAutoMatchPreview = async () => {
    const dialogVersion = matchDialogVersion.current;
    if (dialogTrackIds.length === 0) return;
    setMatchLoading(true);
    try {
      const previews = await api.previewAutoMatch(dialogTrackIds);
      if (dialogVersion !== matchDialogVersion.current) return;
      setMatchPreviews(previews);
      const nextChecked: Record<number, boolean> = {};
      const nextCandIdx: Record<number, number> = {};
      for (const p of previews) {
        const hasMatch =
          p.candidates.length > 0 ||
          Boolean(p.matchedSyncedLyrics) ||
          Boolean(p.matchedPlainLyrics);
        nextChecked[p.trackId] = hasMatch;
        nextCandIdx[p.trackId] = 0;
      }
      setMatchCheckedMap(nextChecked);
      setMatchSelectedCandIdx(nextCandIdx);
    } catch (err) {
      notify(`매칭 후보 조회 실패: ${err}`);
    } finally {
      if (dialogVersion === matchDialogVersion.current) setMatchLoading(false);
    }
  };

  const handleSelectMatchCandidate = async (trackId: number, index: number, candidate: MusicBrainzCandidate | null) => {
    const dialogVersion = matchDialogVersion.current;
    const version = (matchRequestVersion.current[trackId] || 0) + 1;
    matchRequestVersion.current[trackId] = version;
    setLyricsPendingIds(previous => new Set(previous).add(trackId));
    setMatchSelectedCandIdx(previous => ({ ...previous, [trackId]: index }));
    setMatchPreviews(previous => previous.map(p => p.trackId === trackId ? { ...p, matchedSyncedLyrics: null, matchedPlainLyrics: null } : p));
    try {
      const lyrics = await api.previewMatchLyrics(trackId, candidate);
      if (dialogVersion !== matchDialogVersion.current || version !== matchRequestVersion.current[trackId]) return;
      setMatchPreviews(previous => previous.map(p => p.trackId === trackId ? { ...p, matchedSyncedLyrics: lyrics?.syncedLyrics || null, matchedPlainLyrics: lyrics?.plainLyrics || null } : p));
    } catch (error) { if (dialogVersion === matchDialogVersion.current && version === matchRequestVersion.current[trackId]) notify(`가사 후보 조회 실패: ${error}`); } finally {
      if (dialogVersion === matchDialogVersion.current && version === matchRequestVersion.current[trackId]) {
        setLyricsPendingIds(previous => { const next = new Set(previous); next.delete(trackId); return next; });
      }
    }
  };

  const handleManualMbSearch = async () => {
    const dialogVersion = matchDialogVersion.current;
    const t = dialogPrimaryTrack;
    if (!t) return;
    setMatchLoading(true);
    try {
      const cands = await api.searchTrackMetadata(
        t.id,
        manualMbQuery.trim() || undefined
      );
      if (dialogVersion !== matchDialogVersion.current) return;
      setMatchPreviews((prev) => {
        const entry: TrackMatchPreview = {
          trackId: t.id,
          candidates: cands,
          matchedSyncedLyrics: null,
          matchedPlainLyrics: null,
        };
        const others = prev.filter((p) => p.trackId !== t.id);
        return [entry, ...others];
      });
      setMatchCheckedMap((prev) => ({
        ...prev,
        [t.id]: cands.length > 0,
      }));
      setMatchSelectedCandIdx((prev) => ({
        ...prev,
        [t.id]: 0,
      }));
      void handleSelectMatchCandidate(t.id, 0, cands[0] || null);
      if (cands.length === 0) {
        notify("일치하는 온라인 후보를 찾지 못했습니다.");
      }
    } catch (err) {
      notify(`검색 오류: ${err}`);
    } finally {
      if (dialogVersion === matchDialogVersion.current) setMatchLoading(false);
    }
  };

  const handleConfirmApplyMatches = async () => {
    const items: ConfirmTrackMatchItem[] = [];
    for (const p of matchPreviews) {
      if (!matchCheckedMap[p.trackId]) continue;
      const candIdx = matchSelectedCandIdx[p.trackId] ?? 0;
      const cand: MusicBrainzCandidate | undefined =
        candIdx >= 0 ? p.candidates[candIdx] : undefined;

      items.push({
        trackId: p.trackId,
        title: applyFieldTitle && cand ? cand.title : null,
        artist: applyFieldArtist && cand ? cand.artist : null,
        album: applyFieldAlbum && cand ? cand.album : null,
        year: applyFieldAlbum && cand ? cand.year : null,
        trackNumber: applyFieldAlbum && cand ? cand.trackNumber : null,
        recordingId: cand ? cand.recordingId : null,
        releaseId: cand ? cand.releaseId : null,
        applyCover: Boolean(applyFieldCover && cand && cand.releaseId),
        syncedLyrics: applyFieldLyrics ? p.matchedSyncedLyrics : null,
        plainLyrics: applyFieldLyrics ? p.matchedPlainLyrics : null,
      });
    }

    if (items.length === 0) {
      notify("적용할 항목을 먼저 선택하세요.");
      return;
    }

    setMatchLoading(true);
    try {
      const updated = await api.applyConfirmedMatches(items);
      setTracks(previous => mergeTrackChanges(previous, updated.map(t => t.id), updated));
      setDialogOpen(false);
      notify(`${items.length}곡의 선택한 매칭 정보가 적용되었습니다.`);
    } catch (err) {
      await refreshEditedTracks(dialogTrackIds);
      notify(`매칭 적용 실패: ${err}`);
    } finally {
      setMatchLoading(false);
    }
  };

  const confirmedMatchCount = useMemo(
    () =>
      matchPreviews.filter((p) => Boolean(matchCheckedMap[p.trackId])).length,
    [matchPreviews, matchCheckedMap]
  );

  return {
    handleManualMbSearch,
    handleLookupAutoMatchPreview,
    handleSelectMatchCandidate,
    confirmedMatchCount,
    handleConfirmApplyMatches,
  };
}

export type MetadataMatchingModel = ReturnType<typeof useMetadataMatching>;
