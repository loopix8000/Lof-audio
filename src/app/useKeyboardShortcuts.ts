import { useEffect } from "react";
import type { MetadataStateModel } from "../features/metadata/useMetadataState";
import type { PreferencesModel } from "../features/settings/usePreferences";
import type { TrackEditorStateModel } from "../features/track-editor/useTrackEditorState";
import type { WindowLayoutModel } from "../features/layout/useWindowLayout";
import type { PlaybackControlsModel } from "../features/playback/usePlaybackControls";
import type { TrackEditorModel } from "../features/track-editor/useTrackEditor";
import type { LibraryStateModel } from "../features/library/useLibraryState";
import type { LibraryViewModel } from "../features/library/useLibraryView";
import type { LibraryActionsModel } from "../features/library/useLibraryActions";
import type { PlaybackStateModel } from "../features/playback/usePlaybackState";

interface Inputs {
  metadataState: MetadataStateModel;
  preferences: PreferencesModel;
  trackEditorState: TrackEditorStateModel;
  windowLayout: WindowLayoutModel;
  playbackControls: PlaybackControlsModel;
  trackEditor: TrackEditorModel;
  libraryState: LibraryStateModel;
  libraryView: LibraryViewModel;
  libraryActions: LibraryActionsModel;
  playbackState: PlaybackStateModel;
}

export function useKeyboardShortcuts({
  metadataState,
  preferences,
  trackEditorState,
  windowLayout,
  playbackControls,
  trackEditor,
  libraryState,
  libraryView,
  libraryActions,
  playbackState,
}: Inputs) {
  const { coverZoom, setCoverZoom } = metadataState;
  const { settingsOpen, setSettingsOpen } = preferences;
  const { dialogOpen, setDialogOpen } = trackEditorState;
  const { nowPlayingOpen, setNowPlayingOpen } = windowLayout;
  const { handleTogglePlay, handlePlayTrack, handleSeek } = playbackControls;
  const { openPropertiesDialog } = trackEditor;
  const { selectedIds, setSelectedIds } = libraryState;
  const { displayedTracks } = libraryView;
  const { handleDeleteSelected } = libraryActions;
  const { playback } = playbackState;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.code === "Escape" && coverZoom) {
        setCoverZoom(null);
        return;
      }
      if (e.code === "Escape" && settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (e.code === "Escape" && dialogOpen) {
        setDialogOpen(false);
        return;
      }
      if (e.code === "Escape" && nowPlayingOpen) {
        setNowPlayingOpen(false);
        return;
      }
      if (dialogOpen || settingsOpen) return;

      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === "Enter" && e.altKey) {
        e.preventDefault();
        openPropertiesDialog("tags");
      } else if (e.code === "Enter" && selectedIds.length > 0) {
        e.preventDefault();
        handlePlayTrack(selectedIds[0]);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(displayedTracks.map((t) => t.id));
      } else if (e.code === "Delete" && selectedIds.length > 0) {
        e.preventDefault();
        handleDeleteSelected();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSeek(Math.min(playback.durationSecs, playback.positionSecs + 5));
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleSeek(Math.max(0, playback.positionSecs - 5));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playback, selectedIds, displayedTracks, dialogOpen, nowPlayingOpen, coverZoom, settingsOpen]);

}
