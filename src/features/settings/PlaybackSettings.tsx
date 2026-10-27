import { RepeatMode } from "../../types";
import { NP_ART_MAX_RANGE, ResumePosition } from "../../settings";
import { useAudioAppContext } from "../../app/AppContext";
import { Select } from "../../components/Select";

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
    resumeOnStartup,
    setResumeOnStartup,
    resumePosition,
    setResumePosition,
    openNowPlayingOnPlay,
    setOpenNowPlayingOnPlay,
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
          <span className="settings-row-title">시작할 때 마지막 곡 불러오기</span>
          <span className="settings-row-desc">
            앱을 다시 열면 마지막으로 듣던 곡을 일시정지 상태로 준비합니다.
          </span>
        </div>
        <input
          type="checkbox"
          checked={resumeOnStartup}
          onChange={(e) => setResumeOnStartup(e.target.checked)}
        />
      </label>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">불러온 곡 위치</span>
          <span className="settings-row-desc">
            재생을 누르면 처음부터 들을지, 멈춘 위치부터 이어서 들을지 정합니다.
          </span>
        </div>
        <Select
          aria-label="불러온 곡 위치"
          className="settings-control"
          value={resumePosition}
          disabled={!resumeOnStartup}
          onChange={value => setResumePosition(value as ResumePosition)}
          options={[
            { value: "start", label: "처음부터" },
            { value: "last", label: "멈춘 위치부터" },
          ]}
        />
      </div>
      <label className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-title">재생할 때 재생 화면 열기</span>
          <span className="settings-row-desc">
            보관함에서 곡을 재생하면 재생 화면으로 바로 전환합니다.
          </span>
        </div>
        <input
          type="checkbox"
          checked={openNowPlayingOnPlay}
          onChange={(e) => setOpenNowPlayingOnPlay(e.target.checked)}
        />
      </label>
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
        <Select
          aria-label="반복"
          className="settings-control"
          value={repeatMode}
          onChange={value => setRepeatMode(value as RepeatMode)}
          options={[
            { value: "off", label: "반복 안 함" },
            { value: "all", label: "전체 반복" },
            { value: "one", label: "한 곡 반복" },
          ]}
        />
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
