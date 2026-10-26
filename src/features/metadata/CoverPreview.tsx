import { useAudioAppContext } from "../../app/AppContext";

export function CoverPreview() {
  const { coverZoom, setCoverZoom } = useAudioAppContext();
  return (coverZoom && (
    <div className="cover-zoom-backdrop" onClick={() => setCoverZoom(null)}>
      <div className="cover-zoom-body">
        <figure>
          <img src={coverZoom.current} alt="" />
          <figcaption>현재 커버</figcaption>
        </figure>
        {coverZoom.candidate && (
          <figure>
            <img src={coverZoom.candidate} alt="" />
            <figcaption>후보 커버 · {coverZoom.caption}</figcaption>
          </figure>
        )}
      </div>
      <span className="cover-zoom-hint">클릭하거나 Esc를 눌러 닫기</span>
    </div>
  ));
}
