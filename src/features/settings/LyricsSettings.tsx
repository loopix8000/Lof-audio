import { LYRIC_OFFSET_STEPS, formatOffsetStep } from "../../settings";
import { useAudioAppContext } from "../../app/AppContext";
import { Select } from "../../components/Select";

export function LyricsSettings() {
  const {
    settingsTab,
    saveLrcFile,
    setSaveLrcFile,
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
    lyricOffsetStepMs,
    setLyricOffsetStepMs,
  } = useAudioAppContext();
  return (settingsTab === "lyrics" && (
    <>
      <label className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">.lrc 파일 함께 저장</span>
          <span className="settings-row-desc">
            싱크 가사를 저장할 때 음악 파일 옆에 같은 이름의 .lrc 파일도 만듭니다.
          </span>
        </div>
        <input
          type="checkbox"
          checked={saveLrcFile}
          onChange={(e) => setSaveLrcFile(e.target.checked)}
        />
      </label>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">자동 매칭 기본 반영 항목</span>
          <span className="settings-row-desc">
            자동 정보 매칭 창을 열 때 미리 체크될 항목입니다.
          </span>
        </div>
      </div>
      <div className="match-field-toggles">
        {(
          [
            ["제목", applyFieldTitle, setApplyFieldTitle],
            ["아티스트", applyFieldArtist, setApplyFieldArtist],
            ["앨범·연도", applyFieldAlbum, setApplyFieldAlbum],
            ["앨범 커버", applyFieldCover, setApplyFieldCover],
            ["가사(LRC)", applyFieldLyrics, setApplyFieldLyrics],
          ] as [string, boolean, (v: boolean) => void][]
        ).map(([label, value, set]) => (
          <label key={label}>
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => set(e.target.checked)}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">가사 싱크 조정 단위</span>
          <span className="settings-row-desc">
            가사 패널의 -/+ 버튼을 한 번 누를 때 움직이는 시간입니다.
          </span>
        </div>
        <Select
          aria-label="가사 싱크 조정 단위"
          className="settings-control"
          value={lyricOffsetStepMs}
          onChange={setLyricOffsetStepMs}
          options={LYRIC_OFFSET_STEPS.map(ms => ({ value: ms, label: formatOffsetStep(ms) }))}
        />
      </div>
    </>
  ));
}
