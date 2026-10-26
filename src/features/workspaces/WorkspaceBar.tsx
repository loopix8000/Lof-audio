import { useEffect, useState } from "react";
import { Layers, Plus, Edit3, Trash2, FolderPlus, X } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function WorkspaceBar() {
  const {
    workspaces, activeWorkspace, activeWorkspaceId, workspaceBusy, folders,
    handleSelectWorkspace, handleCreateWorkspace, handleRenameWorkspace, handleDeleteWorkspace, handleAddFolder,
  } = useAudioAppContext();
  const [mode, setMode] = useState<"create" | "rename" | "delete" | null>(null);
  const [name, setName] = useState("");

  useEffect(() => { setMode(null); setName(""); }, [activeWorkspaceId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const saved = mode === "create" ? await handleCreateWorkspace(name) : await handleRenameWorkspace(name);
    if (saved) setMode(null);
  };

  return <section className="workspace-bar" aria-label="워크스페이스 관리">
    <div className="workspace-picker">
      <Layers size={14} aria-hidden="true" />
      <select className="form-field workspace-select" aria-label="워크스페이스" value={activeWorkspaceId ?? ""}
        disabled={workspaceBusy || !activeWorkspace} onChange={event => void handleSelectWorkspace(Number(event.target.value))}>
        {!activeWorkspace && <option value="">불러오는 중...</option>}
        {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
      <span className="workspace-folder-count">폴더 {folders.length}</span>
    </div>
    <div className="workspace-actions">
      <button className="ui-btn ghost icon-only" title="워크스페이스 만들기" disabled={workspaceBusy || !activeWorkspace}
        onClick={() => { setName(""); setMode("create"); }}><Plus size={14} /></button>
      <button className="ui-btn ghost icon-only" title="워크스페이스 이름 변경" disabled={workspaceBusy || !activeWorkspace}
        onClick={() => { setName(activeWorkspace?.name ?? ""); setMode("rename"); }}><Edit3 size={13} /></button>
      <button className="ui-btn ghost icon-only" title="워크스페이스 삭제" disabled={workspaceBusy || workspaces.length < 2}
        onClick={() => setMode("delete")}><Trash2 size={13} /></button>
      <button className="ui-btn" disabled={workspaceBusy || !activeWorkspace} onClick={() => void handleAddFolder()}>
        <FolderPlus size={13} /> 폴더 추가
      </button>
    </div>
    {(mode === "create" || mode === "rename") && <form className="workspace-form" onSubmit={event => void submit(event)}>
      <input autoFocus required maxLength={80} className="form-field" aria-label="워크스페이스 이름" value={name}
        placeholder={mode === "create" ? "새 워크스페이스 이름" : "워크스페이스 이름"}
        disabled={workspaceBusy} onChange={event => setName(event.target.value)}
        onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setMode(null); } }} />
      <button type="submit" className="ui-btn solid" disabled={workspaceBusy || !name.trim()}>{mode === "create" ? "만들기" : "저장"}</button>
      <button type="button" className="ui-btn ghost icon-only" title="취소" disabled={workspaceBusy} onClick={() => setMode(null)}><X size={14} /></button>
    </form>}
    {mode === "delete" && <div className="workspace-form workspace-delete-confirm" role="group" aria-label="워크스페이스 삭제 확인">
      <span>‘{activeWorkspace?.name}’의 폴더 연결과 플레이리스트를 삭제합니다. 음악 파일은 유지됩니다.</span>
      <button className="ui-btn" disabled={workspaceBusy} onClick={async () => { if (await handleDeleteWorkspace()) setMode(null); }}>삭제</button>
      <button className="ui-btn ghost" disabled={workspaceBusy} onClick={() => setMode(null)}>취소</button>
    </div>}
  </section>;
}
