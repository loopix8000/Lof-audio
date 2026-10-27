import { api } from "../../api";
import { MusicBrainzCandidate, TrackMatchPreview, ConfirmTrackMatchItem } from "../../types";
import { mergeTrackChanges } from "../../library";
import { useEffect, useMemo } from "react";
import { lookupMatches } from "./lookupMatches";
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
    matchLookupVersion,
    setMatchError,
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
  const { dialogTrackIds, dialogOpen, setDialogOpen } = trackEditorState;
  const { notify } = notifications;
  const { dialogPrimaryTrack, refreshEditedTracks, runTagWrite } = trackEditor;
  const { setTracks } = libraryState;
  useEffect(() => {
    if (!dialogOpen) {
      matchDialogVersion.current += 1;
      matchLookupVersion.current += 1;
      setMatchLoading(false);
      setLyricsPendingIds(new Set());
    }
  }, [dialogOpen]);

  const beginLookup = () => {
    const version = ++matchLookupVersion.current;
    const dialogVersion = matchDialogVersion.current;
    matchRequestVersion.current = {};
    setLyricsPendingIds(new Set());
    setMatchPreviews([]);
    setMatchCheckedMap({});
    setMatchSelectedCandIdx({});
    setMatchError("");
    setMatchLoading(true);
    return () => dialogVersion === matchDialogVersion.current && version === matchLookupVersion.current;
  };

  const loadPreviews = async (isCurrent: () => boolean, searchMetadata: (id: number) => Promise<MusicBrainzCandidate[]>, lyricsForUnmatched = true) => {
    const order = new Map(dialogTrackIds.map((id, i) => [id, i]));
    await lookupMatches(dialogTrackIds, {
      isCurrent,
      searchMetadata,
      onPreview: preview => {
        setMatchPreviews(previous => [...previous, preview].sort((a, b) => order.get(a.trackId)! - order.get(b.trackId)!));
        setMatchCheckedMap(previous => ({ ...previous, [preview.trackId]: preview.candidates.length > 0 }));
        setMatchSelectedCandIdx(previous => ({ ...previous, [preview.trackId]: 0 }));
        if (applyFieldLyrics && (lyricsForUnmatched || preview.candidates.length)) {
          setLyricsPendingIds(previous => new Set(previous).add(preview.trackId));
        }
      },
      onMetadataComplete: () => setMatchLoading(false),
      loadLyrics: async preview => {
        // A user selection takes precedence over a queued automatic lookup.
        if (applyFieldLyrics && (lyricsForUnmatched || preview.candidates.length) && !matchRequestVersion.current[preview.trackId]) {
          await handleSelectMatchCandidate(preview.trackId, 0, preview.candidates[0] || null);
        }
      },
    });
  };

  const handleLookupAutoMatchPreview = async () => {
    if (dialogTrackIds.length === 0 || metadataState.matchLoading) return;
    const isCurrent = beginLookup();
    try {
      await loadPreviews(isCurrent, id => api.searchTrackMetadata(id));
    } catch (err) {
      if (isCurrent()) setMatchError(`매칭 후보 조회 실패: ${err}`);
    } finally {
      if (isCurrent()) setMatchLoading(false);
    }
  };

  const handleSearchAlbum = async () => {
    if (!dialogPrimaryTrack || metadataState.matchLoading) return;
    const isCurrent = beginLookup();
    metadataState.setAlbumCandidates([]);
    metadataState.setSelectedReleaseId("");
    try {
      const albums = await api.searchAlbumMetadata(dialogPrimaryTrack.id, metadataState.albumQuery.trim() || undefined);
      if (!isCurrent()) return;
      metadataState.setAlbumCandidates(albums);
      if (!albums.length) setMatchError("일치하는 앨범을 찾지 못했습니다. 앨범명이나 아티스트를 바꿔 검색해 보세요.");
    } catch (error) {
      if (isCurrent()) setMatchError(`앨범 조회 실패: ${error}`);
    } finally {
      if (isCurrent()) setMatchLoading(false);
    }
  };

  const handleSelectAlbum = async (releaseId: string) => {
    if (!releaseId || metadataState.matchLoading) return;
    const isCurrent = beginLookup();
    metadataState.setSelectedReleaseId(releaseId);
    try {
      const matches = await api.previewAlbumMetadata(dialogTrackIds, releaseId);
      if (!isCurrent()) return;
      const byTrack = new Map(matches.map(match => [match.trackId, match.candidates]));
      await loadPreviews(isCurrent, async id => byTrack.get(id) || [], false);
      if (isCurrent() && !matches.some(match => match.candidates.length)) {
        setMatchError("선택한 앨범에서 제목과 재생 시간이 일치하는 곡을 찾지 못했습니다.");
      }
    } catch (error) {
      if (isCurrent()) setMatchError(`앨범 곡 조회 실패: ${error}`);
    } finally {
      if (isCurrent()) setMatchLoading(false);
    }
  };

  const handleSelectMatchCandidate = async (trackId: number, index: number, candidate: MusicBrainzCandidate | null) => {
    const dialogVersion = matchDialogVersion.current;
    const lookupVersion = matchLookupVersion.current;
    const version = (matchRequestVersion.current[trackId] || 0) + 1;
    matchRequestVersion.current[trackId] = version;
    const isCurrent = () => dialogVersion === matchDialogVersion.current && lookupVersion === matchLookupVersion.current && version === matchRequestVersion.current[trackId];
    setMatchSelectedCandIdx(previous => ({ ...previous, [trackId]: index }));
    setMatchPreviews(previous => previous.map(p => p.trackId === trackId ? { ...p, matchedSyncedLyrics: null, matchedPlainLyrics: null, lyricsError: undefined } : p));
    if (!applyFieldLyrics) {
      setLyricsPendingIds(previous => { const next = new Set(previous); next.delete(trackId); return next; });
      return;
    }
    setLyricsPendingIds(previous => new Set(previous).add(trackId));
    try {
      const lyrics = await api.previewMatchLyrics(trackId, candidate);
      if (!isCurrent()) return;
      setMatchPreviews(previous => previous.map(p => p.trackId === trackId ? { ...p, matchedSyncedLyrics: lyrics?.syncedLyrics || null, matchedPlainLyrics: lyrics?.plainLyrics || null } : p));
      if (!candidate && (lyrics?.syncedLyrics || lyrics?.plainLyrics)) {
        setMatchCheckedMap(previous => ({ ...previous, [trackId]: true }));
      }
    } catch (error) {
      if (isCurrent()) setMatchPreviews(previous => previous.map(p => p.trackId === trackId ? { ...p, lyricsError: `가사 후보 조회 실패: ${error}` } : p));
    } finally {
      if (isCurrent()) {
        setLyricsPendingIds(previous => { const next = new Set(previous); next.delete(trackId); return next; });
      }
    }
  };

  const handleManualMbSearch = async () => {
    const t = dialogPrimaryTrack;
    if (!t || metadataState.matchLoading) return;
    const isCurrent = beginLookup();
    try {
      const cands = await api.searchTrackMetadata(
        t.id,
        manualMbQuery.trim() || undefined
      );
      if (!isCurrent()) return;
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
      if (isCurrent()) setMatchError(`검색 오류: ${err}`);
    } finally {
      if (isCurrent()) setMatchLoading(false);
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
      const updated = await runTagWrite("매칭 정보 적용 중", items.length, () => api.applyConfirmedMatches(items));
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
    handleSearchAlbum,
    handleSelectAlbum,
    handleManualMbSearch,
    handleLookupAutoMatchPreview,
    handleSelectMatchCandidate,
    confirmedMatchCount,
    handleConfirmApplyMatches,
  };
}

export type MetadataMatchingModel = ReturnType<typeof useMetadataMatching>;
