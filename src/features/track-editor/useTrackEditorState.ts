import { useState, useRef } from "react";
import { DialogTab } from "../../app/types";

export function useTrackEditorState() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const [dialogTab, setDialogTab] = useState<DialogTab>("tags");

  const [dialogTrackIds, setDialogTrackIds] = useState<number[]>([]);

  const [tagTitle, setTagTitle] = useState("");

  const [tagArtist, setTagArtist] = useState("");

  const [tagAlbum, setTagAlbum] = useState("");

  const [tagAlbumArtist, setTagAlbumArtist] = useState("");

  const [tagTrackNum, setTagTrackNum] = useState("");

  const [tagAutoNumber, setTagAutoNumber] = useState(false);

  const [tagYear, setTagYear] = useState("");

  const [tagGenre, setTagGenre] = useState("");

  const [tagCoverUrl, setTagCoverUrl] = useState("");

  const [patternPreview, setPatternPreview] = useState<Record<number, Record<string, string>>>({});

  const [patternError, setPatternError] = useState("");

  const [filenamePattern, setFilenamePattern] = useState("%track%. %title%");

  const coverFileInputRef = useRef<HTMLInputElement | null>(null);

  return {
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
    coverFileInputRef,
    setFilenamePattern,
    patternPreview,
    patternError,
  };
}

export type TrackEditorStateModel = ReturnType<typeof useTrackEditorState>;
