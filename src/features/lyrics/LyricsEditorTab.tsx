import { useAudioAppContext } from "../../app/AppContext";

export function LyricsEditorTab() {
  const {
    dialogTab,
    lrcSearchQuery,
    setLrcSearchQuery,
    handleSearchLrcManual,
    lrcLoading,
    lrcResults,
    handleLoadLrcCandidateToDraft,
    lyricDraft,
    setLyricDraft,
    setDialogOpen,
    handleSaveEditedLyrics,
  } = useAudioAppContext();
  return (dialogTab === "lyrics" && (
    <>
      <div className="modal-content">
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="form-field"
            value={lrcSearchQuery}
            onChange={(e) => setLrcSearchQuery(e.target.value)}
            placeholder="가사 검색어 (아티스트 제목)..."
            onKeyDown={(e) =>
              e.key === "Enter" && handleSearchLrcManual()
            }
          />
          <button
            className="ui-btn solid"
            onClick={handleSearchLrcManual}
            disabled={lrcLoading}
          >
            {lrcLoading ? "조회 중..." : "가사 후보 검색"}
          </button>
        </div>

        {lrcResults.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              maxHeight: 105,
              overflowY: "auto",
              padding: 4,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--bg-subtle)",
            }}
          >
            {lrcResults.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 8px",
                  borderRadius: 4,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 11.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.trackName || item.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.artistName} · {item.albumName}
                    {item.syncedLyrics ? " · [싱크 가사]" : " · [일반 가사]"}
                  </div>
                </div>
                <button
                  className="ui-btn"
                  style={{ height: 24, padding: "0 8px" }}
                  onClick={() => handleLoadLrcCandidateToDraft(item)}
                >
                  미리보기 로드
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          className="form-textarea"
          placeholder="[00:12.34] 형식의 LRC 싱크 가사 또는 일반 가사를 입력·확인한 뒤 [가사 저장]을 누르세요..."
          value={lyricDraft}
          onChange={(e) => setLyricDraft(e.target.value)}
        />
      </div>
      <div className="modal-foot">
        <span className="modal-foot-left">
          내용 확인 후 [가사 저장]을 누르면 트랙 및 .lrc 파일에 반영됩니다
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
            onClick={handleSaveEditedLyrics}
          >
            가사 저장
          </button>
        </div>
      </div>
    </>
  ));
}
