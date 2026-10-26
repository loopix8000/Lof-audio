import { useEffect, useRef, useState } from "react";
import { api, onAutomationPlayback } from "../../api";
import { useEvent } from "../../useEvent";
import type { WorkspaceState } from "../../types";
import type { LibraryStateModel } from "../library/useLibraryState";
import type { PlaybackStateModel } from "../playback/usePlaybackState";
import type { TrackEditorStateModel } from "../track-editor/useTrackEditorState";
import type { MetadataStateModel } from "../metadata/useMetadataState";
import type { WindowLayoutModel } from "../layout/useWindowLayout";
import type { NotificationsModel } from "../../app/useNotifications";

interface Inputs {
  libraryState: LibraryStateModel;
  playbackState: PlaybackStateModel;
  trackEditorState: TrackEditorStateModel;
  metadataState: MetadataStateModel;
  windowLayout: WindowLayoutModel;
  notifications: NotificationsModel;
}

export function useWorkspaces({ libraryState, playbackState, trackEditorState, metadataState, windowLayout, notifications }: Inputs) {
  const { activeWorkspaceId, activeWorkspace, tracks, applyWorkspaceState, applySnapshot } = libraryState;
  const { playback, setPlayback, setSeekPreviewSecs, isDraggingSeekRef } = playbackState;
  const { notify } = notifications;
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    trackEditorState.setDialogOpen(false);
    metadataState.setCoverZoom(null);
    windowLayout.setNowPlayingOpen(false);
    windowLayout.setShowPlayerBrowser(false);
    windowLayout.setShowPlayerSearch(false);
  }, [activeWorkspaceId]);

  // A disconnected folder or a workspace switch must not leave an invisible track playing.
  useEffect(() => {
    if (!activeWorkspace || playback.currentTrackId === null || tracks.some(t => t.id === playback.currentTrackId)) return;
    isDraggingSeekRef.current = false;
    setSeekPreviewSecs(null);
    setPlayback(previous => ({ ...previous, currentTrackId: null, filePath: null, isPlaying: false, positionSecs: 0, durationSecs: 0, isEnded: false }));
    void api.stopPlayback().catch(error => notify(`재생 중지 실패: ${error}`));
  }, [activeWorkspace, tracks]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    onAutomationPlayback(async value => {
      try {
        if (value.action === "playback_play") {
          // Reconcile the library and audio together, including tracks just indexed by the API.
          const [snapshot, current] = await Promise.all([api.getLibraryState(), api.getPlaybackState()]);
          if (disposed) return;
          applySnapshot(snapshot, true);
          setPlayback(current);
          setSeekPreviewSecs(null);
          isDraggingSeekRef.current = false;
        } else if (!disposed) {
          applyWorkspaceState(value.workspaceState);
          setPlayback(value.playback);
        }
        if (!disposed) {
          playbackState.setIsMuted(value.playback.volume === 0);
          if (value.playback.volume > 0) playbackState.setPrevVolume(value.playback.volume);
        }
      } catch (error) { if (!disposed) notify(`외부 재생 상태 갱신 실패: ${error}`); }
    }).then(stop => { if (disposed) stop(); else unlisten = stop; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const changeWorkspace = useEvent(async (change: () => Promise<WorkspaceState>) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setWorkspaceBusy(true);
    try {
      applyWorkspaceState(await change());
      return true;
    } catch (error) {
      notify(`워크스페이스 변경 실패: ${error}`);
      return false;
    } finally {
      busyRef.current = false;
      setWorkspaceBusy(false);
    }
  });

  const handleSelectWorkspace = (id: number) => id === activeWorkspaceId
    ? Promise.resolve(true) : changeWorkspace(() => api.selectWorkspace(id));
  const handleCreateWorkspace = (name: string) => changeWorkspace(() => api.createWorkspace(name.trim()));
  const handleRenameWorkspace = (name: string) => activeWorkspaceId === null
    ? Promise.resolve(false) : changeWorkspace(() => api.renameWorkspace(activeWorkspaceId, name.trim()));
  const handleDeleteWorkspace = () => activeWorkspaceId === null
    ? Promise.resolve(false) : changeWorkspace(() => api.deleteWorkspace(activeWorkspaceId));

  return { workspaceBusy, handleSelectWorkspace, handleCreateWorkspace, handleRenameWorkspace, handleDeleteWorkspace };
}
