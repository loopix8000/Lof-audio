import { useAudioAppContext } from "../../app/AppContext";
import { Select } from "../../components/Select";

export function LyricsEditorTab() {
  const {
    dialogTab,
    dialogTracks,
    lyricsEditingTrackId,
    setLyricsEditingTrackId,
    lyricsEntries,
    lyricsSaving,
    lyricsDirtyCount,
    handleSearchAllLyrics,
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
        <div className="editor-section-heading"><div><h2>가사 편집</h2><p>가사 후보를 불러오거나 직접 수정한 뒤 저장하세요.</p></div></div>
        {dialogTracks.length > 1 && (
          <div className="lyrics-editor-controls">
            <Select
              aria-label="가사 편집할 곡"
              value={lyricsEditingTrackId ?? ""}
              onChange={value => setLyricsEditingTrackId(Number(value))}
              options={dialogTracks.map(track => ({
                value: track.id,
                label: `${track.title} · ${track.artist}${lyricsEntries[track.id]?.dirty ? " · 수정됨" : ""}${lyricsEntries[track.id]?.status ? ` · ${lyricsEntries[track.id].status}` : ""}`,
              }))}
            />
            <button
              className="ui-btn solid"
              onClick={handleSearchAllLyrics}
              disabled={lrcLoading || lyricsSaving}
            >
              전체 가사 검색 ({dialogTracks.length}곡)
            </button>
          </div>
        )}
        <div className="lyrics-editor-controls">
          <input
            className="form-field"
            aria-label="가사 검색어"
            value={lrcSearchQuery}
            disabled={lrcLoading || lyricsSaving}
            onChange={(e) => setLrcSearchQuery(e.target.value)}
            placeholder="가사 검색어 (아티스트 제목)..."
            onKeyDown={(e) =>
              e.key === "Enter" && handleSearchLrcManual()
            }
          />
          <button
            className="ui-btn solid"
            onClick={handleSearchLrcManual}
            disabled={lrcLoading || lyricsSaving}
          >
            {lrcLoading ? "조회 중..." : "가사 후보 검색"}
          </button>
        </div>

        {lyricsEditingTrackId !== null && lyricsEntries[lyricsEditingTrackId]?.status && (
          <div className="lyrics-search-status" role="status">
            {lyricsEntries[lyricsEditingTrackId].status}
          </div>
        )}

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
                  disabled={lrcLoading || lyricsSaving}
                >
                  미리보기 로드
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          className="form-textarea lyrics-editor-textarea"
          aria-label="가사 내용"
          placeholder="일반 가사 또는 [00:12.34] 형식의 LRC 가사 입력..."
          value={lyricDraft}
          onChange={(e) => setLyricDraft(e.target.value)}
          disabled={lrcLoading || lyricsSaving}
        />
      </div>
      <div className="modal-foot">
        {dialogTracks.length > 1 && (
          <span className="modal-foot-left">{lyricsDirtyCount}곡 수정됨</span>
        )}
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
            disabled={lrcLoading || lyricsSaving || lyricsDirtyCount === 0}
          >
            {lyricsSaving ? "저장 중…" : dialogTracks.length > 1 ? `가사 저장 (${lyricsDirtyCount}곡)` : "가사 저장"}
          </button>
        </div>
      </div>
    </>
  ));
}
