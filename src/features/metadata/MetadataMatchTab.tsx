import { Sparkles } from "lucide-react";
import { getFallbackCoverUrl } from "../../utils/lrc";
import { useAudioAppContext } from "../../app/AppContext";

export function MetadataMatchTab() {
  const {
    dialogTab,
    dialogTrackIds,
    manualMbQuery,
    setManualMbQuery,
    handleManualMbSearch,
    matchLoading,
    handleLookupAutoMatchPreview,
    applyFieldTitle,
    setApplyFieldTitle,
    applyFieldArtist,
    setApplyFieldArtist,
    applyFieldAlbum,
    setApplyFieldAlbum,
    applyFieldCover,
    setApplyFieldCover,
    applyFieldLyrics,
    setApplyFieldLyrics,
    matchPreviews,
    tracks,
    matchCheckedMap,
    matchSelectedCandIdx,
    setMatchCheckedMap,
    failedCoverUrls,
    setCoverZoom,
    setFailedCoverUrls,
    handleSelectMatchCandidate,
    lyricsPendingIds,
    confirmedMatchCount,
    setDialogOpen,
    handleConfirmApplyMatches,
  } = useAudioAppContext();
  return (dialogTab === "online" && (
    <>
      <div className="modal-content">
        {/* Top Lookup Bar */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {dialogTrackIds.length === 1 && (
            <input
              className="form-field"
              value={manualMbQuery}
              onChange={(e) => setManualMbQuery(e.target.value)}
              placeholder="아티스트 또는 곡 제목 검색어..."
              onKeyDown={(e) =>
                e.key === "Enter" && handleManualMbSearch()
              }
            />
          )}
          {dialogTrackIds.length === 1 && (
            <button
              className="ui-btn"
              onClick={handleManualMbSearch}
              disabled={matchLoading}
            >
              검색어 조회
            </button>
          )}
          <button
            className="ui-btn solid"
            style={{
              marginLeft: dialogTrackIds.length > 1 ? "auto" : 0,
            }}
            onClick={handleLookupAutoMatchPreview}
            disabled={matchLoading}
          >
            <Sparkles size={13} />
            {matchLoading
              ? "매칭 후보 조회 중..."
              : `자동 매칭 후보 조회 (${dialogTrackIds.length}곡)`}
          </button>
        </div>

        {/* Field Selection Toggles */}
        <div className="match-field-toggles">
          <span
            style={{
              fontWeight: 700,
              color: "var(--text-secondary)",
              marginRight: 2,
            }}
          >
            반영할 항목:
          </span>
          <label>
            <input
              type="checkbox"
              checked={applyFieldTitle}
              onChange={(e) => setApplyFieldTitle(e.target.checked)}
            />
            제목
          </label>
          <label>
            <input
              type="checkbox"
              checked={applyFieldArtist}
              onChange={(e) => setApplyFieldArtist(e.target.checked)}
            />
            아티스트
          </label>
          <label>
            <input
              type="checkbox"
              checked={applyFieldAlbum}
              onChange={(e) => setApplyFieldAlbum(e.target.checked)}
            />
            앨범·연도
          </label>
          <label>
            <input
              type="checkbox"
              checked={applyFieldCover}
              onChange={(e) => setApplyFieldCover(e.target.checked)}
            />
            앨범 커버
          </label>
          <label>
            <input
              type="checkbox"
              checked={applyFieldLyrics}
              onChange={(e) => setApplyFieldLyrics(e.target.checked)}
            />
            가사(LRC)
          </label>
        </div>

        {/* Per-Track Before -> After Comparison & Confirmation List */}
        <div className="preview-box">
          {matchPreviews.length === 0 ? (
            <div
              style={{
                margin: "auto",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {matchLoading
                ? "온라인 데이터베이스에서 매칭 후보를 조회하고 있습니다..."
                : "[자동 매칭 후보 조회]를 누르면 기존 태그를 덮어쓰기 전에 변경될 제목·아티스트·앨범·커버·가사 내역을 미리 비교하고 선택할 수 있습니다."}
            </div>
          ) : (
            matchPreviews.map((p) => {
              const orig = tracks.find((t) => t.id === p.trackId);
              if (!orig) return null;
              const isChecked = Boolean(matchCheckedMap[p.trackId]);
              const selIdx = matchSelectedCandIdx[p.trackId] ?? 0;
              const cand =
                selIdx >= 0 ? p.candidates[selIdx] : undefined;
              const hasMatch =
                Boolean(cand) ||
                Boolean(p.matchedSyncedLyrics) ||
                Boolean(p.matchedPlainLyrics);

              return (
                <div
                  key={p.trackId}
                  className={`match-card ${isChecked ? "checked" : ""}`}
                >
                  <input
                    type="checkbox"
                    style={{ marginTop: 4, cursor: "pointer" }}
                    checked={isChecked}
                    disabled={!hasMatch}
                    onChange={(e) =>
                      setMatchCheckedMap((prev) => ({
                        ...prev,
                        [p.trackId]: e.target.checked,
                      }))
                    }
                  />

                  {(() => {
                    const currentCover =
                      orig.coverDataUrl ||
                      getFallbackCoverUrl(orig.title, orig.artist);
                    const candCover =
                      applyFieldCover && cand?.coverUrl
                        ? cand.coverUrl
                        : undefined;
                    const candCoverOk =
                      candCover && !failedCoverUrls[candCover]
                        ? candCover
                        : undefined;
                    const caption = cand
                      ? `${cand.album}${cand.year ? ` (${cand.year})` : ""}`
                      : orig.album;
                    const openZoom = () =>
                      setCoverZoom({
                        current: currentCover,
                        candidate: candCoverOk,
                        caption,
                      });
                    return (
                      <div className="match-cover-compare">
                        <button
                          type="button"
                          className={`match-cover ${candCover ? "small" : ""}`}
                          onClick={openZoom}
                          title="크게 보기"
                        >
                          <img src={currentCover} alt="" />
                          <span className="match-cover-label">현재</span>
                        </button>
                        {candCover && (
                          <>
                            <span className="match-cover-arrow">→</span>
                            <button
                              type="button"
                              className="match-cover"
                              onClick={openZoom}
                              title="크게 보기"
                            >
                              {candCoverOk ? (
                                <img
                                  src={candCoverOk}
                                  alt=""
                                  onError={() =>
                                    setFailedCoverUrls((prev) => ({
                                      ...prev,
                                      [candCover]: true,
                                    }))
                                  }
                                />
                              ) : (
                                <span className="match-cover-missing">
                                  커버 없음
                                </span>
                              )}
                              <span className="match-cover-label">후보</span>
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={orig.fileName}
                    >
                      파일: {orig.fileName}
                    </div>

                    {p.candidates.length > 0 && (
                      <select
                        className="form-field"
                        style={{ height: 24, fontSize: 11, padding: "0 6px" }}
                        value={selIdx}
                        onChange={(e) =>
                          void handleSelectMatchCandidate(p.trackId, Number(e.target.value), p.candidates[Number(e.target.value)] || null)
                        }
                      >
                        {p.candidates.map((c, idx) => (
                          <option
                            key={`${c.recordingId}-${c.releaseId || idx}`}
                            value={idx}
                          >
                            후보 #{idx + 1}: {c.title} — {c.artist} ({c.album}
                            {c.year ? `, ${c.year}` : ""})
                          </option>
                        ))}
                        <option value={-1}>
                          메타데이터 변경 안 함 (가사만 적용)
                        </option>
                      </select>
                    )}

                    {cand ? (
                      <>
                        <div className="match-diff-line">
                          <span>제목:</span>
                          {applyFieldTitle && cand.title !== orig.title ? (
                            <>
                              <span className="match-before">
                                {orig.title}
                              </span>
                              <span>→</span>
                              <span className="match-after">
                                {cand.title}
                              </span>
                            </>
                          ) : (
                            <span className="match-after">
                              {orig.title} (유지)
                            </span>
                          )}
                        </div>
                        <div className="match-diff-line">
                          <span>아티스트·앨범:</span>
                          <span className="match-after">
                            {applyFieldArtist ? cand.artist : orig.artist} ·{" "}
                            {applyFieldAlbum ? cand.album : orig.album}
                            {applyFieldAlbum && cand.year
                              ? ` (${cand.year})`
                              : ""}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--text-muted)",
                        }}
                      >
                        일치하는 메타데이터 후보 없음 (기존 태그 유지)
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 2,
                      }}
                    >
                      {lyricsPendingIds.has(p.trackId) ? <span className="match-badge">가사 후보 조회 중…</span> : p.matchedSyncedLyrics ? (
                        <span className="match-badge synced">
                          싱크 가사 매칭됨
                        </span>
                      ) : p.matchedPlainLyrics ? (
                        <span className="match-badge">
                          일반 가사 매칭됨
                        </span>
                      ) : (
                        <span className="match-badge">
                          매칭된 가사 없음
                        </span>
                      )}
                      {cand?.coverUrl &&
                        applyFieldCover &&
                        !failedCoverUrls[cand.coverUrl] && (
                          <span className="match-badge">
                            앨범 커버 포함
                          </span>
                        )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="modal-foot">
        <span className="modal-foot-left">
          {matchPreviews.length > 0
            ? `선택된 적용 대상: ${confirmedMatchCount} / ${dialogTrackIds.length}곡`
            : "사용자가 확인·선택한 항목만 반영됩니다"}
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
            disabled={confirmedMatchCount === 0 || matchLoading || lyricsPendingIds.size > 0}
            onClick={handleConfirmApplyMatches}
          >
            선택 항목 적용 ({confirmedMatchCount}곡)
          </button>
        </div>
      </div>
    </>
  ));
}
