import { getFallbackCoverUrl, formatDuration } from "../../utils/lrc";
import { Upload } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function TagsTab() {
  const {
    dialogTab,
    dialogTrackIds,
    tagTitle,
    setTagTitle,
    tagArtist,
    setTagArtist,
    tagAlbum,
    setTagAlbum,
    tagAlbumArtist,
    setTagAlbumArtist,
    tagAutoNumber,
    tagTrackNum,
    setTagTrackNum,
    tagYear,
    setTagYear,
    setTagAutoNumber,
    tagGenre,
    setTagGenre,
    tagCoverUrl,
    setTagCoverUrl,
    dialogPrimaryTrack,
    coverFileInputRef,
    handleCoverUpload,
    setDialogOpen,
    handleSaveTags,
  } = useAudioAppContext();
  return (dialogTab === "tags" && (
    <>
      <div className="modal-content tag-editor-content">
        <div className="editor-section-heading">
          <div>
            <h2>기본 정보</h2>
            <p>{dialogTrackIds.length > 1 ? "입력한 값은 선택한 모든 곡에 적용됩니다. 빈 항목은 기존 값이 유지됩니다." : "곡의 태그와 앨범 커버를 수정합니다."}</p>
          </div>
        </div>
        <div className="tag-editor-layout">
        <div className="form-grid tag-editor-fields">
          {dialogTrackIds.length <= 1 && (
            <>
              <label className="form-label" htmlFor="tag-title">제목</label>
              <input
                id="tag-title"
                className="form-field"
                value={tagTitle}
                onChange={(e) => setTagTitle(e.target.value)}
              />
            </>
          )}

          <label className="form-label" htmlFor="tag-artist">아티스트</label>
          <input
            id="tag-artist"
            className="form-field"
            placeholder={
              dialogTrackIds.length > 1
                ? "(기존 값 유지 시 비워두세요)"
                : ""
            }
            value={tagArtist}
            onChange={(e) => setTagArtist(e.target.value)}
          />

          <label className="form-label" htmlFor="tag-album">앨범</label>
          <input
            id="tag-album"
            className="form-field"
            placeholder={
              dialogTrackIds.length > 1
                ? "(기존 값 유지 시 비워두세요)"
                : ""
            }
            value={tagAlbum}
            onChange={(e) => setTagAlbum(e.target.value)}
          />

          <label className="form-label" htmlFor="tag-album-artist">앨범 아티스트</label>
          <input
            id="tag-album-artist"
            className="form-field"
            placeholder={dialogTrackIds.length > 1 ? "빈칸은 기존 값 유지" : ""}
            value={tagAlbumArtist}
            onChange={(e) => setTagAlbumArtist(e.target.value)}
          />

          <label className="form-label">트랙 / 연도</label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <input
              className="form-field"
              style={{ width: 72 }}
              type="number"
              placeholder="번호"
              aria-label="트랙 번호"
              disabled={tagAutoNumber}
              value={tagTrackNum}
              onChange={(e) => setTagTrackNum(e.target.value)}
            />
            <input
              className="form-field"
              style={{ width: 84 }}
              type="number"
              placeholder="연도"
              aria-label="발매 연도"
              value={tagYear}
              onChange={(e) => setTagYear(e.target.value)}
            />
            {dialogTrackIds.length > 1 && (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={tagAutoNumber}
                  onChange={(e) => setTagAutoNumber(e.target.checked)}
                />
                자동 번호 (1~N)
              </label>
            )}
          </div>

          <label className="form-label" htmlFor="tag-genre">장르</label>
          <input
            id="tag-genre"
            className="form-field"
            placeholder={dialogTrackIds.length > 1 ? "빈칸은 기존 값 유지" : ""}
            value={tagGenre}
            onChange={(e) => setTagGenre(e.target.value)}
          />

        </div>
          <div className="tag-cover-panel">
            <span className="form-label">앨범 커버</span>
            <img
              className="tag-cover-image"
              src={
                tagCoverUrl ||
                dialogPrimaryTrack?.coverDataUrl ||
                getFallbackCoverUrl(
                  dialogPrimaryTrack?.title || "Lof",
                  dialogPrimaryTrack?.artist || "Audio"
                )
              }
              alt=""
            />
            {dialogTrackIds.length > 1 && <span className="tag-cover-hint">첫 곡의 커버입니다. 변경하지 않으면 각 곡의 커버가 유지됩니다.</span>}
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleCoverUpload}
            />
            <button
              className="ui-btn"
              onClick={() => coverFileInputRef.current?.click()}
            >
              <Upload size={13} /> 이미지 변경...
            </button>
            {tagCoverUrl && <>
              <span className="tag-cover-status">새 이미지 준비됨</span>
              <button className="ui-btn ghost" onClick={() => { setTagCoverUrl(""); if (coverFileInputRef.current) coverFileInputRef.current.value = ""; }}>이미지 변경 취소</button>
            </>}
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <span
          className="modal-foot-left"
          title={dialogPrimaryTrack?.filePath || ""}
        >
          {dialogTrackIds.length === 1 && dialogPrimaryTrack
            ? `${dialogPrimaryTrack.format} · ${formatDuration(
              dialogPrimaryTrack.durationSecs
            )} · ${dialogPrimaryTrack.fileName}`
            : `${dialogTrackIds.length}개 오디오 파일 선택됨`}
        </span>
        <div className="modal-foot-right">
          <button
            className="ui-btn"
            onClick={() => setDialogOpen(false)}
          >
            취소
          </button>
          <button className="ui-btn solid" onClick={handleSaveTags}>
            저장
          </button>
        </div>
      </div>
    </>
  ));
}
