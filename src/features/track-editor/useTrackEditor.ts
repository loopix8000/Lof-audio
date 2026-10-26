import React, { useMemo, useEffect } from "react";
import { api } from "../../api";
import { mergeTrackChanges } from "../../library";
import { createLyricsEntries } from "../lyrics/lyricsBatch";
import { DialogTab } from "../../app/types";
import type { TrackEditorStateModel } from "./useTrackEditorState";
import type { LibraryStateModel } from "../library/useLibraryState";
import type { ActiveTrackModel } from "../playback/useActiveTrack";
import type { NotificationsModel } from "../../app/useNotifications";
import type { MetadataStateModel } from "../metadata/useMetadataState";
import type { LyricsEditorStateModel } from "../lyrics/useLyricsEditorState";

interface Inputs {
  trackEditorState: TrackEditorStateModel;
  libraryState: LibraryStateModel;
  trackSelection: ActiveTrackModel;
  notifications: NotificationsModel;
  metadataState: MetadataStateModel;
  lyricsEditorState: LyricsEditorStateModel;
}

export function useTrackEditor({
  trackEditorState,
  libraryState,
  trackSelection,
  notifications,
  metadataState,
  lyricsEditorState,
}: Inputs) {
  const {
    dialogTrackIds,
    dialogOpen,
    dialogTab,
    setPatternPreview,
    setPatternError,
    filenamePattern,
    setDialogTrackIds,
    setTagTitle,
    setTagArtist,
    setTagAlbum,
    setTagAlbumArtist,
    setTagTrackNum,
    setTagYear,
    setTagGenre,
    setTagCoverUrl,
    setTagAutoNumber,
    setDialogTab,
    setDialogOpen,
    tagTitle,
    tagArtist,
    tagAlbum,
    tagAlbumArtist,
    tagTrackNum,
    tagAutoNumber,
    tagYear,
    tagGenre,
    tagCoverUrl,
  } = trackEditorState;
  const { tracks, selectedIds, setTracks } = libraryState;
  const { activeTrack } = trackSelection;
  const { notify } = notifications;
  const {
    setManualMbQuery,
    matchDialogVersion,
    matchRequestVersion,
    setLyricsPendingIds,
    setMatchPreviews,
    setMatchCheckedMap,
    setMatchSelectedCandIdx,
    setMatchLoading,
    setMatchError,
    setMatchMode,
    setAlbumQuery,
    setAlbumCandidates,
    setSelectedReleaseId,
  } = metadataState;
  const { setLyricsEntries, setLyricsEditingTrackId, lyricsSessionVersion, lyricsBusy, setLrcLoading, setLyricsSaving } = lyricsEditorState;
  const dialogTrackIdSet = useMemo(() => new Set(dialogTrackIds), [dialogTrackIds]);

  const dialogTracks = useMemo(
    () => tracks.filter((t) => dialogTrackIdSet.has(t.id)),
    [tracks, dialogTrackIdSet]
  );

  const dialogPrimaryTrack = dialogTracks[0] || activeTrack;

  useEffect(() => {
    if (!dialogOpen || dialogTab !== "pattern") return;
    let disposed = false;
    setPatternPreview({}); setPatternError("");
    const timer = setTimeout(() => {
      api.previewFilenamePattern(dialogTrackIds, filenamePattern).then(result => {
        if (!disposed) setPatternPreview(result);
      }).catch(error => { if (!disposed) setPatternError(String(error)); });
    }, 150);
    return () => { disposed = true; clearTimeout(timer); };
  }, [dialogOpen, dialogTab, dialogTrackIds, filenamePattern]);

  const openPropertiesDialog = (
    initialTab: DialogTab = "tags",
    overrideIds?: number[]
  ) => {
    const targetIds =
      overrideIds && overrideIds.length > 0
        ? overrideIds
        : selectedIds.length > 0
          ? selectedIds
          : activeTrack
            ? [activeTrack.id]
            : [];
    if (targetIds.length === 0) {
      notify("편집할 곡을 먼저 선택하세요.");
      return;
    }

    const targets = new Set(targetIds);
    const selTracks = tracks.filter((t) => targets.has(t.id));
    if (selTracks.length === 0) return;

    setDialogTrackIds(targetIds);

    if (selTracks.length === 1) {
      const t = selTracks[0];
      setTagTitle(t.title);
      setTagArtist(t.artist);
      setTagAlbum(t.album);
      setTagAlbumArtist(t.albumArtist);
      setTagTrackNum(t.trackNumber ? String(t.trackNumber) : "");
      setTagYear(t.year ? String(t.year) : "");
      setTagGenre(t.genre);
      setTagCoverUrl("");
      setTagAutoNumber(false);
      const q =
        t.artist && t.artist !== "Unknown Artist"
          ? `${t.artist} ${t.title}`
          : t.title;
      setManualMbQuery(q);
    } else {
      const artists = new Set(selTracks.map((t) => t.artist));
      const albums = new Set(selTracks.map((t) => t.album));
      const albumArtists = new Set(selTracks.map((t) => t.albumArtist));
      const years = new Set(selTracks.map((t) => t.year));
      const genres = new Set(selTracks.map((t) => t.genre));

      setTagTitle("");
      setTagArtist(artists.size === 1 ? [...artists][0] : "");
      setTagAlbum(albums.size === 1 ? [...albums][0] : "");
      setTagAlbumArtist(albumArtists.size === 1 ? [...albumArtists][0] : "");
      setTagTrackNum("");
      setTagYear(
        years.size === 1 && [...years][0] ? String([...years][0]) : ""
      );
      setTagGenre(genres.size === 1 ? [...genres][0] : "");
      setTagCoverUrl("");
      setTagAutoNumber(false);
      const first = selTracks[0];
      const q =
        first.artist && first.artist !== "Unknown Artist"
          ? `${first.artist} ${first.title}`
          : first.title;
      setManualMbQuery(q);
    }

    matchDialogVersion.current += 1;
    setMatchLoading(false);
    setMatchError("");
    setMatchMode("track");
    setAlbumQuery("");
    setAlbumCandidates([]);
    setSelectedReleaseId("");
    matchRequestVersion.current = {};
    setLyricsPendingIds(new Set());
    setMatchPreviews([]);
    setMatchCheckedMap({});
    setMatchSelectedCandIdx({});
    lyricsSessionVersion.current += 1;
    lyricsBusy.current = false;
    setLrcLoading(false);
    setLyricsSaving(false);
    setLyricsEntries(createLyricsEntries(selTracks));
    setLyricsEditingTrackId(selTracks[0].id);
    setDialogTab(initialTab);
    setDialogOpen(true);
  };

  const refreshEditedTracks = async (ids: number[]) => {
    try {
      const changes = await api.getLibraryTracks(ids);
      setTracks(previous => mergeTrackChanges(previous, ids, changes));
    } catch { /* The original save error remains visible. */ }
  };

  const handleSaveTags = async () => {
    if (dialogTrackIds.length === 0) return;

    try {
      const updated = await api.updateTags({
        trackIds: dialogTrackIds,
        title: tagTitle.trim() || null,
        artist: tagArtist.trim() || null,
        album: tagAlbum.trim() || null,
        albumArtist: tagAlbumArtist.trim() || null,
        trackNumber: tagTrackNum ? parseInt(tagTrackNum, 10) : null,
        autoNumber: tagAutoNumber,
        year: tagYear ? parseInt(tagYear, 10) : null,
        genre: tagGenre.trim() || null,
        coverDataUrl: tagCoverUrl.trim() || null,
        saveLrcFile: false,
      });
      setTracks(previous => mergeTrackChanges(previous, updated.map(t => t.id), updated));
      setDialogOpen(false);
      notify(`${dialogTrackIds.length}곡 태그가 저장되었습니다.`);
    } catch (err) {
      await refreshEditedTracks(dialogTrackIds);
      notify(`태그 저장 실패: ${err}`);
    }
  };

  const handleApplyPattern = async () => {
    if (dialogTrackIds.length === 0 || !filenamePattern.trim()) return;
    try {
      const updated = await api.applyFilenamePattern({
        trackIds: dialogTrackIds,
        pattern: filenamePattern.trim(),
      });
      setTracks(previous => mergeTrackChanges(previous, updated.map(t => t.id), updated));
      setDialogOpen(false);
      notify(`${dialogTrackIds.length}곡 파일명에서 태그를 추출했습니다.`);
    } catch (err) {
      await refreshEditedTracks(dialogTrackIds);
      notify(`추출 실패: ${err}`);
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setTagCoverUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return {
    openAlbumMatchDialog: (ids: number[]) => {
      openPropertiesDialog("online", ids);
      setMatchMode("album");
    },
    dialogPrimaryTrack,
    refreshEditedTracks,
    openPropertiesDialog,
    handleCoverUpload,
    handleSaveTags,
    dialogTracks,
    handleApplyPattern,
  };
}

export type TrackEditorModel = ReturnType<typeof useTrackEditor>;
