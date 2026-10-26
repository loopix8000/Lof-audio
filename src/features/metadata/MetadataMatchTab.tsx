import { Disc, Sparkles } from "lucide-react";
import { getFallbackCoverUrl } from "../../utils/lrc";
import { useAudioAppContext } from "../../app/AppContext";
import { Select } from "../../components/Select";

export function MetadataMatchTab() {
  const {
    dialogTab,
    dialogTrackIds,
    manualMbQuery,
    setManualMbQuery,
    handleManualMbSearch,
    matchLoading,
    matchError,
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
    matchMode, setMatchMode,
    albumQuery, setAlbumQuery,
    albumCandidates, selectedReleaseId,
    handleSearchAlbum, handleSelectAlbum,
    dialogPrimaryTrack,
  } = useAudioAppContext();
  return (dialogTab === "online" && (
    <>
      <div className="modal-content">
        <div className="match-mode-controls">
          <button className={`ui-btn ${matchMode === "track" ? "solid" : ""}`} disabled={matchLoading} onClick={() => setMatchMode("track")}>곡별 조회</button>
          <button className={`ui-btn ${matchMode === "album" ? "solid" : ""}`} disabled={matchLoading} onClick={() => setMatchMode("album")}><Disc size={13} /> 앨범 조회</button>
        </div>
        {/* Top Lookup Bar */}
        {matchMode === "album" ? (
          <>
            <div className="match-query-controls">
              <input className="form-field" value={albumQuery} onChange={event => setAlbumQuery(event.target.value)} placeholder={`${dialogPrimaryTrack?.artist || ""} ${dialogPrimaryTrack?.album || "앨범명 또는 아티스트"}`} onKeyDown={event => event.key === "Enter" && handleSearchAlbum()} />
              <button className="ui-btn solid" disabled={matchLoading} onClick={handleSearchAlbum}>{matchLoading ? "앨범 조회 중…" : "앨범 검색"}</button>
            </div>
            {albumCandidates.length > 0 && <div className="album-match-releases" role="group" aria-label="앨범 후보">
              {albumCandidates.map(album => <button key={album.releaseId} className={`album-match-release ${selectedReleaseId === album.releaseId ? "selected" : ""}`} aria-pressed={selectedReleaseId === album.releaseId} disabled={matchLoading} onClick={() => handleSelectAlbum(album.releaseId)}>
                <strong>{album.album}</strong>
                <span>{[album.artist, album.date, album.country, `${album.trackCount}곡`].filter(Boolean).join(" · ")}</span>
              </button>)}
            </div>}
          </>
        ) : (
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
              ? `곡 정보 조회 중 (${matchPreviews.length}/${dialogTrackIds.length})`
              : `자동 매칭 후보 조회 (${dialogTrackIds.length}곡)`}
          </button>
        </div>
        )}
        {matchError && <div role="alert" className="match-error">{matchError}</div>}

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
                : "곡 정보를 검색하세요."}
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
                      <Select
                        aria-label={`${orig.title} 메타데이터 후보`}
                        style={{ height: 24, fontSize: 11 }}
                        value={selIdx}
                        onChange={value =>
                          void handleSelectMatchCandidate(p.trackId, value, p.candidates[value] || null)
                        }
                        options={[
                          ...p.candidates.map((c, idx) => ({
                            value: idx,
                            label: `후보 #${idx + 1}: ${c.title} — ${c.artist} (${c.album}${c.year ? `, ${c.year}` : ""})`,
                          })),
                          { value: -1, label: "메타데이터 변경 안 함 (가사만 적용)" },
                        ]}
                      />
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
                      {lyricsPendingIds.has(p.trackId) ? <span className="match-badge">가사 후보 조회 중…</span> : p.lyricsError ? <span className="match-badge">가사 조회 실패</span> : p.matchedSyncedLyrics ? (
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
                    {p.metadataError && <div role="alert" className="match-error">메타데이터 조회 실패: {p.metadataError}</div>}
                    {p.lyricsError && <div role="alert" className="match-error">{p.lyricsError}</div>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="modal-foot">
        {matchPreviews.length > 0 && (
          <span className="modal-foot-left">
            {confirmedMatchCount} / {dialogTrackIds.length}곡 선택
          </span>
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
            disabled={confirmedMatchCount === 0 || matchLoading || (applyFieldLyrics && lyricsPendingIds.size > 0)}
            onClick={handleConfirmApplyMatches}
          >
            선택 항목 적용 ({confirmedMatchCount}곡)
          </button>
        </div>
      </div>
    </>
  ));
}
