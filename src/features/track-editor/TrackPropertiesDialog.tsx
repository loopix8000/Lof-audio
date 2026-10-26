import { X } from "lucide-react";
import { TagsTab } from "./TagsTab";
import { FilenamePatternTab } from "./FilenamePatternTab";
import { MetadataMatchTab } from "../metadata/MetadataMatchTab";
import { LyricsEditorTab } from "../lyrics/LyricsEditorTab";
import { useAudioAppContext } from "../../app/AppContext";

export function TrackPropertiesDialog() {
  const {
    dialogOpen,
    setDialogOpen,
    dialogTrackIds,
    dialogPrimaryTrack,
    dialogTab,
    setDialogTab,
  } = useAudioAppContext();
  return (dialogOpen && (
    <div
      className="modal-backdrop"
      onClick={() => setDialogOpen(false)}
    >
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span
            className="modal-head-title"
            title={
              dialogTrackIds.length > 1
                ? `속성·태그 편집 (${dialogTrackIds.length}곡 선택됨)`
                : dialogPrimaryTrack?.title || ""
            }
          >
            {dialogTrackIds.length > 1
              ? `속성·태그 편집 (${dialogTrackIds.length}곡 선택됨)`
              : `속성·태그 편집 — ${dialogPrimaryTrack?.title || ""}`}
          </span>
          <button
            className="ui-btn ghost icon-only"
            onClick={() => setDialogOpen(false)}
            title="닫기 (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`modal-tab ${dialogTab === "tags" ? "active" : ""}`}
            onClick={() => setDialogTab("tags")}
          >
            기본 정보
          </button>
          <button
            className={`modal-tab ${dialogTab === "pattern" ? "active" : ""
              }`}
            onClick={() => setDialogTab("pattern")}
          >
            파일명 규칙
          </button>
          <button
            className={`modal-tab ${dialogTab === "online" ? "active" : ""}`}
            onClick={() => setDialogTab("online")}
          >
            자동 정보 매칭
          </button>
          <button
            className={`modal-tab ${dialogTab === "lyrics" ? "active" : ""}`}
            onClick={() => setDialogTab("lyrics")}
          >
            가사 편집
          </button>
        </div>

        {/* Sub-menu 1: Metadata Form */}
        <TagsTab />

        {/* Sub-menu 2: Filename Pattern Extractor with Live Preview */}
        <FilenamePatternTab />

        {/* Sub-menu 3: Auto Info Matching (Preview -> User Check -> Confirm!) */}
        <MetadataMatchTab />

        {/* Sub-menu 4: Lyrics Search & Edit (Preview in Editor before Saving!) */}
        <LyricsEditorTab />
      </div>
    </div>
  ));
}
