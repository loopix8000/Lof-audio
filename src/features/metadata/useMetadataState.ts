import { useState, useRef } from "react";
import { TrackMatchPreview } from "../../types";

export function useMetadataState() {
  const [matchLoading, setMatchLoading] = useState(false);

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
