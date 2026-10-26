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
    dialogPrimaryTrack,
    coverFileInputRef,
    handleCoverUpload,
    setDialogOpen,
    handleSaveTags,
  } = useAudioAppContext();
  return (dialogTab === "tags" && (
    <>
      <div className="modal-content">
        <div className="form-grid">
          {dialogTrackIds.length <= 1 && (
            <>
              <label className="form-label">제목</label>
              <input
                className="form-field"
                value={tagTitle}
                onChange={(e) => setTagTitle(e.target.value)}
              />
            </>
          )}

          <label className="form-label">아티스트</label>
          <input
            className="form-field"
            placeholder={
              dialogTrackIds.length > 1
                ? "(기존 값 유지 시 비워두세요)"
                : ""
            }
            value={tagArtist}
            onChange={(e) => setTagArtist(e.target.value)}
          />

          <label className="form-label">앨범</label>
          <input
            className="form-field"
            placeholder={
              dialogTrackIds.length > 1
                ? "(기존 값 유지 시 비워두세요)"
                : ""
            }
            value={tagAlbum}
            onChange={(e) => setTagAlbum(e.target.value)}
          />

          <label className="form-label">앨범 아티스트</label>
          <input
            className="form-field"
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
              disabled={tagAutoNumber}
              value={tagTrackNum}
              onChange={(e) => setTagTrackNum(e.target.value)}
            />
            <input
              className="form-field"
              style={{ width: 84 }}
              type="number"
              placeholder="연도"
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

          <label className="form-label">장르</label>
          <input
            className="form-field"
            value={tagGenre}
            onChange={(e) => setTagGenre(e.target.value)}
          />

          <label className="form-label">앨범 커버</label>
          <div
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <img
              className="t-row-thumb"
              style={{ width: 36, height: 36, borderRadius: 6 }}
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
            {tagCoverUrl && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--accent)",
                  fontWeight: 600,
                }}
              >
                새 이미지 준비됨
              </span>
            )}
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
