import { AudioAppContext } from "./app/AppContext";
import { useAudioApp } from "./app/useAudioApp";
import { Titlebar } from "./features/layout/Titlebar";
import { LibraryLayout } from "./features/layout/LibraryLayout";
import { CompactPlayer } from "./features/layout/CompactPlayer";
import { TrackContextMenu } from "./features/library/TrackContextMenu";
import { CollectionContextMenu } from "./features/library/CollectionContextMenu";
import { TrackPropertiesDialog } from "./features/track-editor/TrackPropertiesDialog";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import { TagProgressModal } from "./features/track-editor/TagProgressModal";
import { CoverPreview } from "./features/metadata/CoverPreview";
import { StatusToast } from "./app/StatusToast";

export function App() {
  const app = useAudioApp();
  return (
    <AudioAppContext.Provider value={app}>
      <div className="tauri-app">
        <Titlebar />
        <LibraryLayout />
        <CompactPlayer />
        <TrackContextMenu />
        <CollectionContextMenu />
        <TrackPropertiesDialog />
        <TagProgressModal />
        <SettingsDialog />
        <CoverPreview />
        <StatusToast />
      </div>
    </AudioAppContext.Provider>
  );
}
