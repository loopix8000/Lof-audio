import { FolderPlus, Folder, Trash2 } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function LibrarySettings() {
  const {
    settingsTab,
    handleAddFolder,
    folders,
    activeWorkspace,
    handleRemoveFolder,
    scanProgress,
    handleRescanLibrary,
  } = useAudioAppContext();
  return (settingsTab === "library" && (
    <>
      <div className="settings-section-head">
        <span>{activeWorkspace?.name} · 등록된 폴더</span>
        <button className="ui-btn" onClick={handleAddFolder}>
          <FolderPlus size={13} /> 폴더 추가
        </button>
      </div>
      {folders.length === 0 ? (
        <div className="settings-empty">등록된 폴더가 없습니다.</div>
      ) : (
        <div className="settings-folder-list">
          {folders.map((f) => (
            <div key={f} className="settings-folder-item" title={f}>
              <Folder size={13} />
              <span className="settings-folder-path">{f}</span>
              <button
                className="ui-btn ghost icon-only"
                title="이 워크스페이스에서 폴더 연결 해제"
                onClick={() => void handleRemoveFolder(f)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">다시 색인</span>
          <span className="settings-row-desc">
            {scanProgress
              ? `색인 중: ${scanProgress.processed}/${scanProgress.total}`
              : "변경분만 다시 읽거나, 캐시를 무시하고 모든 파일의 태그를 다시 읽습니다."}
          </span>
        </div>
        <div className="settings-control-group">
          <button
            className="ui-btn"
            disabled={folders.length === 0}
            onClick={() => handleRescanLibrary(false)}
          >
            변경분 색인
          </button>
          <button
            className="ui-btn"
            disabled={folders.length === 0}
            onClick={() => handleRescanLibrary(true)}
          >
            전체 다시 색인
          </button>
        </div>
      </div>
    </>
  ));
}
