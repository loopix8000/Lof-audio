import { useAudioAppContext } from "../../app/AppContext";

export function GeneralSettings() {
  const {
    settingsTab,
    theme,
    setTheme,
    alwaysOnTop,
    setPinned,
    rescanOnStartup,
    setRescanOnStartup,
  } = useAudioAppContext();
  return (settingsTab === "general" && (
    <>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">테마</span>
          <span className="settings-row-desc">
            제목 표시줄의 달·해 아이콘으로도 바꿀 수 있습니다.
          </span>
        </div>
        <select
          className="form-field settings-control"
          value={theme}
          onChange={(e) => setTheme(e.target.value as "light" | "dark")}
        >
          <option value="light">라이트</option>
          <option value="dark">다크</option>
        </select>
      </div>
      <label className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">창 항상 위에 고정</span>
          <span className="settings-row-desc">
            다른 창 위에 Lof 창을 계속 표시합니다.
          </span>
        </div>
        <input
          type="checkbox"
          checked={alwaysOnTop}
          onChange={(e) => void setPinned(e.target.checked)}
        />
      </label>
      <label className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">
            시작할 때 변경된 파일 다시 색인
          </span>
          <span className="settings-row-desc">
            앱을 켤 때 등록된 폴더에서 추가·수정·삭제된 파일만 백그라운드로 반영합니다.
          </span>
        </div>
        <input
          type="checkbox"
          checked={rescanOnStartup}
          onChange={(e) => setRescanOnStartup(e.target.checked)}
        />
      </label>
    </>
  ));
}
