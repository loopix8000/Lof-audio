import { useAudioAppContext } from "../../app/AppContext";

export function FilenamePatternTab() {
  const {
    dialogTab,
    filenamePattern,
    setFilenamePattern,
    dialogTracks,
    patternPreview,
    patternError,
    dialogTrackIds,
    setDialogOpen,
    handleApplyPattern,
  } = useAudioAppContext();
  return (dialogTab === "pattern" && (
    <>
      <div className="modal-content">
        <div className="form-grid">
          <label className="form-label">추출 규칙</label>
          <input
            className="form-field"
            value={filenamePattern}
            onChange={(e) => setFilenamePattern(e.target.value)}
            placeholder="%track%. %title%"
          />
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {[
            "%track%. %title%",
            "%artist% - %title%",
            "%track%. %artist% - %title%",
            "%track% - %title%",
          ].map((preset) => (
            <button
              key={preset}
              className={`chip-btn ${filenamePattern === preset ? "active" : ""
                }`}
              onClick={() => setFilenamePattern(preset)}
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="preview-box">
          {dialogTracks.map((t) => {
            const parsed = patternPreview[t.id] || {};
            const summaryParts: string[] = [];
            if (parsed.track || parsed.tracknumber) {
              summaryParts.push(
                `#${parsed.track || parsed.tracknumber}`
              );
            }
            if (parsed.artist) summaryParts.push(`아티스트: ${parsed.artist}`);
            if (parsed.title) summaryParts.push(`제목: ${parsed.title}`);
            if (parsed.album) summaryParts.push(`앨범: ${parsed.album}`);

            return (
              <div key={t.id} className="preview-row">
                <div className="preview-row-file" title={t.fileName}>
                  원본: {t.fileName}
                </div>
                <div className="preview-row-parsed">
                  {summaryParts.length > 0
                    ? summaryParts.join(" · ")
                    : patternError || "패턴 확인 중…"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="modal-foot">
        <span className="modal-foot-left">
          {dialogTrackIds.length}곡 선택
        </span>
        <div className="modal-foot-right">
          <button
            className="ui-btn"
            onClick={() => setDialogOpen(false)}
          >
            취소
          </button>
          <button
            className="ui-btn solid"
            onClick={handleApplyPattern}
          >
            규칙 적용
          </button>
        </div>
      </div>
    </>
  ));
}
