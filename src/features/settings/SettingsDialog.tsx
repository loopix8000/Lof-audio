import { X } from "lucide-react";
import { SettingsTab } from "../../app/types";
import { GeneralSettings } from "./GeneralSettings";
import { LibrarySettings } from "./LibrarySettings";
import { PlaybackSettings } from "./PlaybackSettings";
import { LyricsSettings } from "./LyricsSettings";
import { UpdateSettings } from "./UpdateSettings";
import { AboutSettings } from "./AboutSettings";
import { AutomationSettings } from "../automation/AutomationSettings";
import { useAudioAppContext } from "../../app/AppContext";

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, settingsTab, setSettingsTab } = useAudioAppContext();
  return (settingsOpen && (
    <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
      <div
        className="modal-box settings-box"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-head-title">설정</span>
          <button
            className="ui-btn ghost icon-only"
            onClick={() => setSettingsOpen(false)}
            title="닫기 (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        <div className="modal-tabs">
          {(
            [
              ["general", "일반"],
              ["library", "라이브러리"],
              ["playback", "재생"],
              ["lyrics", "가사·메타데이터"],
              ["automation", "MCP / API"],
              ["update", "업데이트"],
              ["about", "정보"],
            ] as [SettingsTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={`modal-tab ${settingsTab === key ? "active" : ""}`}
              onClick={() => setSettingsTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="modal-content">
          <GeneralSettings />

          <LibrarySettings />

          <PlaybackSettings />

          <LyricsSettings />
          <AutomationSettings />

          <UpdateSettings />

          <AboutSettings />
        </div>
      </div>
    </div>
  ));
}
