import { useNotifications } from "./useNotifications";
import { usePlaybackState } from "../features/playback/usePlaybackState";
import { useTrackEditorState } from "../features/track-editor/useTrackEditorState";
import { useMetadataState } from "../features/metadata/useMetadataState";
import { useLyricsEditorState } from "../features/lyrics/useLyricsEditorState";
import { usePreferences } from "../features/settings/usePreferences";
import { useWindowLayout } from "../features/layout/useWindowLayout";
import { useLibraryState } from "../features/library/useLibraryState";
import { useLibraryView } from "../features/library/useLibraryView";
import { useSettingsSync } from "../features/settings/useSettingsSync";
import { useActiveTrack } from "../features/playback/useActiveTrack";
import { useLibraryActions } from "../features/library/useLibraryActions";
import { usePlaybackControls } from "../features/playback/usePlaybackControls";
import { useTrackEditor } from "../features/track-editor/useTrackEditor";
import { useMetadataMatching } from "../features/metadata/useMetadataMatching";
import { useLyricsEditor } from "../features/lyrics/useLyricsEditor";
import { useLyricsDisplay } from "../features/lyrics/useLyricsDisplay";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useWorkspaces } from "../features/workspaces/useWorkspaces";

export function useAudioApp() {
  const notifications = useNotifications();
  const playbackState = usePlaybackState();
  const trackEditorState = useTrackEditorState();
  const metadataState = useMetadataState();
  const lyricsEditorState = useLyricsEditorState();
  const preferences = usePreferences();
  const windowLayout = useWindowLayout({
    notifications,
  });
  const libraryState = useLibraryState({
    notifications,
  });
  const workspaceActions = useWorkspaces({ libraryState, playbackState, trackEditorState, metadataState, windowLayout, notifications });
  const libraryView = useLibraryView({
    libraryState,
  });
  const settingsSync = useSettingsSync({
    preferences,
    windowLayout,
    playbackState,
    libraryState,
    metadataState,
    notifications,
  });
  const trackSelection = useActiveTrack({
    libraryState,
    playbackState,
    libraryView,
  });
  const libraryActions = useLibraryActions({
    notifications,
    libraryState,
    libraryView,
  });
  const playbackControls = usePlaybackControls({
    playbackState,
    trackSelection,
    notifications,
    libraryState,
    libraryView,
  });
  const trackEditor = useTrackEditor({
    trackEditorState,
    libraryState,
    trackSelection,
    notifications,
    metadataState,
    lyricsEditorState,
  });
  const metadataMatching = useMetadataMatching({
    metadataState,
    trackEditorState,
    notifications,
    trackEditor,
    libraryState,
  });
  const lyricsEditor = useLyricsEditor({
    lyricsEditorState,
    notifications,
    trackEditor,
    preferences,
    libraryState,
    trackEditorState,
  });
  const lyricsDisplay = useLyricsDisplay({
    trackSelection,
    playbackControls,
    windowLayout,
    libraryState,
  });
  useKeyboardShortcuts({
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
  });

  return {
    ...notifications,
    ...playbackState,
    ...trackEditorState,
    ...metadataState,
    ...lyricsEditorState,
    ...preferences,
    ...windowLayout,
    ...libraryState,
    ...workspaceActions,
    ...libraryView,
    ...settingsSync,
    ...trackSelection,
    ...libraryActions,
    ...playbackControls,
    ...trackEditor,
    ...metadataMatching,
    ...lyricsEditor,
    ...lyricsDisplay,
  };
}
