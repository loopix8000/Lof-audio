import { UpdateChannel } from "../../settings";
import { RefreshCw, Download } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function UpdateSettings() {
  const {
    settingsTab,
    appInfo,
    updateChannel,
    updater,
    setUpdateChannel,
    autoCheckUpdates,
    setAutoCheckUpdates,
  } = useAudioAppContext();
  return (settingsTab === "update" && (
    <>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">현재 버전</span>
          {appInfo && !appInfo.updaterConfigured && (
            <span className="settings-row-desc">
              개발 빌드에서는 업데이트를 확인할 수 없습니다. 릴리즈 설치 파일로 설치한 앱에서 사용하세요.
            </span>
          )}
        </div>
        <span className="settings-value">v{appInfo?.version ?? "-"}</span>
      </div>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">업데이트 채널</span>
          <span className="settings-row-desc">
            베타는 정식 버전과 시험 버전 중 가장 최신 버전을 받습니다. 채널을 바꿔도 이전 버전으로 내려가지 않습니다.
          </span>
        </div>
        <select
          className="form-field settings-control"
          value={updateChannel}
          disabled={updater.phase === "downloading" || updater.phase === "installing"}
          onChange={(e) => setUpdateChannel(e.target.value as UpdateChannel)}
        >
          <option value="stable">정식</option>
          <option value="beta">베타</option>
        </select>
      </div>
      <label className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">시작할 때 업데이트 확인</span>
          <span className="settings-row-desc">
            새 버전이 있으면 알림으로 알려 줍니다. 설치는 직접 시작해야 합니다.
          </span>
        </div>
        <input
          type="checkbox"
          checked={autoCheckUpdates}
          onChange={(e) => setAutoCheckUpdates(e.target.checked)}
        />
      </label>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">업데이트 상태</span>
          <span
            className={`settings-row-desc ${updater.phase === "error" ? "settings-error" : ""
              }`}
          >
            {{
              idle: "아직 확인하지 않았습니다.",
              checking: "업데이트를 확인하는 중…",
              latest: "최신 버전을 사용하고 있습니다.",
              available: `새 버전(v${updater.available?.version})을 설치할 수 있습니다.`,
              downloading:
                updater.progress === null
                  ? "다운로드하는 중…"
                  : `다운로드하는 중… ${updater.progress}%`,
              installing: "설치를 시작합니다. 앱이 종료된 뒤 다시 실행됩니다.",
              error: `업데이트 실패: ${updater.error}`,
            }[updater.phase]}
          </span>
        </div>
        <button
          className="ui-btn"
          disabled={
            !appInfo?.updaterConfigured ||
            ["checking", "downloading", "installing"].includes(updater.phase)
          }
          onClick={() => void updater.checkNow()}
        >
          <RefreshCw size={13} /> 업데이트 확인
        </button>
      </div>
      {updater.available &&
        ["available", "downloading", "installing", "error"].includes(updater.phase) && (
          <div className="update-card">
            <div className="update-card-head">
              <span className="settings-row-title">
                v{updater.available.version}
                {updater.available.date
                  ? ` · ${updater.available.date.slice(0, 10)}`
                  : ""}
              </span>
              <button
                className="ui-btn solid"
                disabled={updater.phase === "downloading" || updater.phase === "installing"}
                onClick={() => void updater.install()}
              >
                <Download size={13} />
                {updater.phase === "error" ? "다시 시도" : "다운로드 및 설치"}
              </button>
            </div>
            {updater.phase === "downloading" && (
              <div className="update-progress">
                <div
                  className={`update-progress-fill ${updater.progress === null ? "indeterminate" : ""
                    }`}
                  style={{ width: `${updater.progress ?? 30}%` }}
                />
              </div>
            )}
            <pre className="update-notes">
              {updater.available.notes?.trim() || "릴리즈 노트가 없습니다."}
            </pre>
          </div>
        )}
    </>
  ));
}
