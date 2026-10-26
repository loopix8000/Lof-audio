import { useState, useRef } from "react";
import { AlbumCandidate, TrackMatchPreview } from "../../types";

export function useMetadataState() {
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState("");
  const matchLookupVersion = useRef(0);
  const [matchMode, setMatchMode] = useState<"track" | "album">("track");
  const [albumQuery, setAlbumQuery] = useState("");
  const [albumCandidates, setAlbumCandidates] = useState<AlbumCandidate[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState("");

  const [matchPreviews, setMatchPreviews] = useState<TrackMatchPreview[]>([]);

  const [matchCheckedMap, setMatchCheckedMap] = useState<Record<number, boolean>>({});

  const [matchSelectedCandIdx, setMatchSelectedCandIdx] = useState<Record<number, number>>({});

  const [lyricsPendingIds, setLyricsPendingIds] = useState<Set<number>>(new Set());

  const matchRequestVersion = useRef<Record<number, number>>({});

  const matchDialogVersion = useRef(0);

  const [failedCoverUrls, setFailedCoverUrls] = useState<Record<string, boolean>>({});

  const [coverZoom, setCoverZoom] = useState<{
    current: string;
    candidate?: string;
    caption: string;
  } | null>(null);

  const [applyFieldTitle, setApplyFieldTitle] = useState(true);

  const [applyFieldArtist, setApplyFieldArtist] = useState(true);

  const [applyFieldAlbum, setApplyFieldAlbum] = useState(true);

  const [applyFieldCover, setApplyFieldCover] = useState(true);

  const [applyFieldLyrics, setApplyFieldLyrics] = useState(true);

  const [manualMbQuery, setManualMbQuery] = useState("");

  return {
    matchMode, setMatchMode,
    albumQuery, setAlbumQuery,
    albumCandidates, setAlbumCandidates,
    selectedReleaseId, setSelectedReleaseId,
    matchError,
    setMatchError,
    matchLookupVersion,
    setManualMbQuery,
    matchDialogVersion,
    matchRequestVersion,
    setLyricsPendingIds,
    setMatchPreviews,
    setMatchCheckedMap,
    setMatchSelectedCandIdx,
    setMatchLoading,
    manualMbQuery,
    matchPreviews,
    matchCheckedMap,
    matchSelectedCandIdx,
    applyFieldTitle,
    applyFieldArtist,
    applyFieldAlbum,
    applyFieldCover,
    applyFieldLyrics,
    setApplyFieldTitle,
    setApplyFieldArtist,
    setApplyFieldAlbum,
    setApplyFieldCover,
    setApplyFieldLyrics,
    coverZoom,
    setCoverZoom,
    matchLoading,
    failedCoverUrls,
    setFailedCoverUrls,
    lyricsPendingIds,
  };
}

export type MetadataStateModel = ReturnType<typeof useMetadataState>;
