import { api } from "../../api";
import { Folder } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function AboutSettings() {
  const { settingsTab, appInfo, notify } = useAudioAppContext();
  return (settingsTab === "about" && (
    <>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">버전</span>
        </div>
        <span className="settings-value">{appInfo?.version ?? "-"}</span>
      </div>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">데이터 폴더</span>
          <span className="settings-row-desc settings-path">
            {appInfo?.dataDir ?? "-"}
          </span>
        </div>
        <button
          className="ui-btn"
          disabled={!appInfo}
          onClick={() =>
            api.revealDataDir().catch((err) => notify(`폴더 열기 실패: ${err}`))
          }
        >
          <Folder size={13} /> 열기
        </button>
      </div>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">지원 형식</span>
          <span className="settings-row-desc">
            {appInfo?.supportedFormats.map((f) => f.toUpperCase()).join(", ") ??
              "-"}
          </span>
        </div>
      </div>
    </>
  ));
}
