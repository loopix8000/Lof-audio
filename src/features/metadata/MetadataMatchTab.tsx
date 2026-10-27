import { Disc, Sparkles } from "lucide-react";
import { getFallbackCoverUrl } from "../../utils/lrc";
import { useAudioAppContext } from "../../app/AppContext";
import { Select } from "../../components/Select";

function MatchDiff({ label, before, after }: { label: string; before: string; after: string }) {
  if (before === after) return null;
  return (
    <span className="match-diff-line" title={`${label}: ${before || "—"} → ${after || "—"}`}>
      <span className="match-diff-label">{label}:</span>
      <span className="match-before">{before || "—"}</span><span aria-hidden="true">→</span><span className="match-after">{after || "—"}</span>
    </span>
  );
}

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
  const selectableIds = matchPreviews.filter(preview => {
    const index = matchSelectedCandIdx[preview.trackId] ?? 0;
    return Boolean((index >= 0 && preview.candidates[index]) || preview.matchedSyncedLyrics || preview.matchedPlainLyrics);
  }).map(preview => preview.trackId);
  const setAllMatchesChecked = (checked: boolean) => setMatchCheckedMap(previous => {
    const next = { ...previous };
    for (const id of checked ? selectableIds : matchPreviews.map(preview => preview.trackId)) next[id] = checked;
    return next;
  });
  return (dialogTab === "online" && (
    <>
      <div className="modal-content metadata-editor-content">
        <div className="editor-section-heading">
          <div><h2>자동 정보 매칭</h2><p>후보를 검색하고 곡별 변경 내용을 확인한 뒤 적용하세요.</p></div>
        </div>
        <div className="match-workspace">
        <div className="match-options">
        <div className="match-mode-controls">
          <button className={`ui-btn ${matchMode === "track" ? "solid" : ""}`} disabled={matchLoading} onClick={() => setMatchMode("track")}>곡별 조회</button>
          <button className={`ui-btn ${matchMode === "album" ? "solid" : ""}`} disabled={matchLoading} onClick={() => setMatchMode("album")}><Disc size={13} /> 앨범 조회</button>
        </div>
        {/* Top Lookup Bar */}
        {matchMode === "album" ? (
          <>
            <div className="match-query-controls">
              <input className="form-field" aria-label="앨범 검색어" value={albumQuery} onChange={event => setAlbumQuery(event.target.value)} placeholder={`${dialogPrimaryTrack?.artist || ""} ${dialogPrimaryTrack?.album || "앨범명 또는 아티스트"}`} onKeyDown={event => event.key === "Enter" && handleSearchAlbum()} />
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
        <div className="match-query-controls match-track-query">
          {dialogTrackIds.length === 1 && (
            <input
              className="form-field"
              aria-label="곡 검색어"
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
            앨범·연도·번호
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

        </div>
        <div className="match-results">
        <div className="match-review-heading">
          <div><strong>곡별 변경 미리보기</strong><span>{matchPreviews.length > 0 ? `${confirmedMatchCount} / ${dialogTrackIds.length}곡 선택` : "검색 결과가 여기에 표시됩니다"}</span></div>
          {matchPreviews.length > 0 && <div className="match-review-actions">
            <button className="ui-btn ghost" disabled={selectableIds.length === 0 || matchLoading || lyricsPendingIds.size > 0} onClick={() => setAllMatchesChecked(true)}>전체 선택</button>
            <button className="ui-btn ghost" disabled={confirmedMatchCount === 0 || matchLoading || lyricsPendingIds.size > 0} onClick={() => setAllMatchesChecked(false)}>선택 해제</button>
          </div>}
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
              const changes = cand ? [
                { label: "제목", before: orig.title, after: applyFieldTitle ? cand.title : orig.title },
                { label: "아티스트", before: orig.artist, after: applyFieldArtist ? cand.artist : orig.artist },
                { label: "앨범", before: orig.album, after: applyFieldAlbum ? cand.album : orig.album },
                { label: "연도 · 번호", before: `${orig.year ?? "—"} · ${orig.trackNumber ?? "—"}`, after: `${applyFieldAlbum ? cand.year ?? orig.year ?? "—" : orig.year ?? "—"} · ${applyFieldAlbum ? cand.trackNumber ?? orig.trackNumber ?? "—" : orig.trackNumber ?? "—"}` },
              ].filter(change => change.before !== change.after) : [];

              return (
                <div
                  key={p.trackId}
                  className={`match-card ${isChecked ? "checked" : ""}`}
                >
                  <label className="match-card-heading">
                    <input
                      type="checkbox"
                      aria-label={`${orig.title} 변경 사항 적용`}
                      checked={isChecked}
                      disabled={!hasMatch}
                      onChange={(e) =>
                        setMatchCheckedMap((prev) => ({
                          ...prev,
                          [p.trackId]: e.target.checked,
                        }))
                      }
                    />
                    <span className="match-track-identity"><strong>{orig.title}</strong><span title={orig.fileName}>{orig.fileName}</span></span>
                  </label>

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

                  <div className="match-card-details">
                    {p.candidates.length > 0 && (
                      <Select
                        aria-label={`${orig.title} 메타데이터 후보`}
                        className="match-candidate-select"
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
                      <div className="match-changes">
                        {changes.length ? changes.map(change => <MatchDiff key={change.label} {...change} />) : <span className="match-unchanged">선택한 태그 변경 없음</span>}
                      </div>
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

                    <div className="match-card-badges">
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
