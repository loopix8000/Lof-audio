import { toggleMaximizeWindow, startWindowDrag, minimizeWindow, closeWindow } from "../../api";
import { PanelLeft, Pin, Settings as SettingsIcon, Moon, Sun, Minus, Square, X } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function Titlebar() {
  const {
    appMode,
    showLeftSidebar,
    setShowLeftSidebar,
    alwaysOnTop,
    handleTogglePin,
    settingsOpen,
    openSettings,
    updater,
    setTheme,
    theme,
    isMaximized,
  } = useAudioAppContext();
  return (<header
    className="titlebar"
    // One handler for both gestures: the OS swallows `dblclick` once a drag starts,
    // so the second press (detail === 2) toggles maximize instead of dragging again.
    onMouseDown={(e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
      if (e.detail === 2) {
        toggleMaximizeWindow();
      } else {
        startWindowDrag();
      }
    }}
  >
    <div className="titlebar-left">
      <div className="app-badge">
        <div className="app-badge-dot">
          {/* viewBox cropped to the note glyph (the 1024 app-icon canvas leaves it tiny at badge size) */}
          <svg width="13" height="13" viewBox="165 140 704 704" fill="none">
            <path
              d="M 464 292 C 464 246, 488 222, 528 212 L 728 160 C 766 150, 788 170, 788 208 L 788 286 C 788 326, 764 348, 726 359 L 560 403 C 528 412, 516 430, 516 466 L 516 680 C 516 756, 442 824, 354 824 C 284 824, 246 776, 246 716 C 246 634, 326 554, 410 554 C 426 554, 438 556, 448 559 C 460 561, 464 554, 464 538 Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <span>Lof</span>
      </div>

      {appMode === "library" && (
        <button
          className={`ui-btn ghost icon-only ${showLeftSidebar ? "active" : ""}`}
          onClick={() => setShowLeftSidebar(!showLeftSidebar)}
          title="좌측 사이드바 표시/숨기기"
        >
          <PanelLeft size={14} />
        </button>
      )}
    </div>

    {/* Center Drag Area (Responsive Layout switches automatically by window width) */}
    <div className="titlebar-center" />

    {/* Right Theme / Pin & Native Window Caption Controls */}
    <div className="titlebar-right">
      <div className="titlebar-actions">
        <button
          className={`ui-btn ghost icon-only ${alwaysOnTop ? "active" : ""}`}
          onClick={handleTogglePin}
          title={alwaysOnTop ? "항상 위 고정 해제" : "창 항상 위에 고정"}
        >
          <Pin size={13} />
        </button>
        <button
          className={`ui-btn ghost icon-only ${settingsOpen ? "active" : ""}`}
          onClick={() => openSettings(updater.phase === "available" ? "update" : "general")}
          title={
            updater.phase === "available"
              ? `설정 — 새 버전(v${updater.available?.version}) 설치 가능`
              : "설정"
          }
        >
          <SettingsIcon size={14} />
          {updater.phase === "available" && <span className="titlebar-update-dot" />}
        </button>
        <button
          className="ui-btn ghost icon-only"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          title={theme === "light" ? "다크 테마로 전환" : "라이트 테마로 전환"}
        >
          {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
        </button>
      </div>

      <div className="win-controls">
        <button className="win-btn" onClick={minimizeWindow} title="최소화">
          <Minus size={14} />
        </button>
        <button
          className="win-btn"
          onClick={toggleMaximizeWindow}
          title={isMaximized ? "이전 크기로 복원" : "최대화"}
        >
          {isMaximized ? (
            // Restore glyph: two overlapping windows, as in native title bars
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <rect x="1" y="3.5" width="7.5" height="7.5" rx="1" />
              <path d="M3.5 3.5V2a1 1 0 0 1 1-1H10a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H8.5" />
            </svg>
          ) : (
            <Square size={12} />
          )}
        </button>
        <button
          className="win-btn close"
          onClick={closeWindow}
          title="종료"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  </header>);
}
