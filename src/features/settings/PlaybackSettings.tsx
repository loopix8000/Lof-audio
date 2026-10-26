import { RepeatMode } from "../../types";
import { NP_ART_MAX_RANGE } from "../../settings";
import { useAudioAppContext } from "../../app/AppContext";

export function PlaybackSettings() {
  const {
    settingsTab,
    isMuted,
    playback,
    handleSetVolume,
    shuffle,
    setShuffle,
    repeatMode,
    setRepeatMode,
    npArtMax,
    setNpArtMax,
  } = useAudioAppContext();
  return (settingsTab === "playback" && (
    <>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">볼륨</span>
          <span className="settings-row-desc">
            마지막 볼륨은 다음 실행 때도 유지됩니다.
          </span>
        </div>
        <div className="settings-control-group">
          <input
            type="range"
            className="settings-range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : playback.volume}
            onChange={(e) => handleSetVolume(Number(e.target.value))}
          />
          <span className="settings-value">
            {Math.round((isMuted ? 0 : playback.volume) * 100)}%
          </span>
        </div>
      </div>
      <label className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">셔플</span>
        </div>
        <input
          type="checkbox"
          checked={shuffle}
          onChange={(e) => setShuffle(e.target.checked)}
        />
      </label>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">반복</span>
        </div>
        <select
          className="form-field settings-control"
          value={repeatMode}
          onChange={(e) => setRepeatMode(e.target.value as RepeatMode)}
        >
          <option value="off">반복 안 함</option>
          <option value="all">전체 반복</option>
          <option value="one">한 곡 반복</option>
        </select>
      </div>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">재생 화면 앨범아트 최대 크기</span>
          <span className="settings-row-desc">
            창이 낮으면 이보다 작게 표시될 수 있습니다.
          </span>
        </div>
        <div className="settings-control-group">
          <input
            type="range"
            className="settings-range"
            min={NP_ART_MAX_RANGE.min}
            max={NP_ART_MAX_RANGE.max}
            step={NP_ART_MAX_RANGE.step}
            value={npArtMax}
            onChange={(e) => setNpArtMax(Number(e.target.value))}
          />
          <span className="settings-value">{npArtMax}px</span>
        </div>
      </div>
    </>
  ));
}
