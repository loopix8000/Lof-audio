import { useEffect, useState } from "react";
import { Copy, Download, RefreshCw } from "lucide-react";
import { api, pickSkillsFolderDialog } from "../../api";
import { useAudioAppContext } from "../../app/AppContext";
import type { AutomationInfo, AudioSkillStatus } from "../../types";

export function AutomationSettings() {
  const { settingsTab, notify } = useAudioAppContext();
  const [info, setInfo] = useState<AutomationInfo | null>(null);
  const [skill, setSkill] = useState<AudioSkillStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settingsTab !== "automation") return;
    let disposed = false;
    Promise.all([api.getAutomationInfo(), api.getSkillStatus()]).then(([connection, bundle]) => {
      if (!disposed) { setInfo(connection); setSkill(bundle); setError(""); }
    }).catch(error => { if (!disposed) setError(String(error)); });
    return () => { disposed = true; };
  }, [settingsTab]);

  const copy = async (value: unknown) => {
    try { await navigator.clipboard.writeText(JSON.stringify(value, null, 2)); notify("연결 정보를 복사했습니다."); }
    catch (error) { notify(`복사 실패: ${error}`); }
  };
  const install = async () => {
    setBusy(true);
    try {
      const directory = await pickSkillsFolderDialog();
      if (!directory) return;
      const current = await api.getSkillStatus(directory);
      const result = await api.installSkill(directory, current.revision, current.installed?.revision);
      setSkill(result);
      if (result.installed?.upToDate) notify(result.changed ? "스킬을 설치했습니다. AI 클라이언트에서 스킬을 새로고침하세요." : "이미 최신 스킬입니다.");
      else notify("스킬 설치 상태를 확인하지 못했습니다.");
    } catch (error) { notify(`스킬 설치 실패: ${error}`); }
    finally { setBusy(false); }
  };

  if (settingsTab !== "automation") return null;
  return <>
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-title">MCP 연결</span>
        <span className="settings-row-desc">앱이 실행 중일 때 워크스페이스·음악·재생·태그·가사 도구를 사용할 수 있습니다.</span>
      </div>
      <span className="settings-value">{info ? `${info.toolCount}개 도구` : error || "불러오는 중..."}</span>
    </div>
    <div className="automation-buttons">
      <button className="ui-btn" disabled={!info} onClick={() => info && void copy(info.mcpConfig)}><Copy size={13} /> MCP 설정 복사</button>
      <button className="ui-btn" disabled={!info} onClick={() => info && void copy({ mcpServers: { "lof-audio": { url: info.mcpUrl, headers: info.headers } } })}><Copy size={13} /> HTTP MCP 설정 복사</button>
      <button className="ui-btn" disabled={!info} onClick={() => info && void copy({ url: info.url, headers: info.headers })}><Copy size={13} /> API 연결 정보 복사</button>
    </div>
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-title">로컬 HTTP API</span>
        <span className="settings-row-desc settings-path">{info?.url ?? "-"}</span>
        <span className="settings-row-desc">같은 기기의 클라이언트에서 사용합니다. HTTP 연결 정보는 앱을 재실행하면 바뀝니다.</span>
      </div>
    </div>
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-title">Lof Audio 스킬</span>
        <span className="settings-row-desc">AI 클라이언트의 스킬 상위 폴더를 선택하세요. 기존 설치본은 별도 폴더에 백업합니다.</span>
      </div>
      <button className="ui-btn" disabled={busy || !skill} onClick={() => void install()}>
        {busy ? <RefreshCw size={13} className="spin" /> : <Download size={13} />} 스킬 설치 / 업데이트
      </button>
    </div>
    {skill && <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-desc">번들 버전 {skill.version} · revision {skill.revision.slice(0, 12)}</span>
        {skill.backupPath && <span className="settings-row-desc settings-path">백업: {skill.backupPath}</span>}
      </div>
    </div>}
  </>;
}
