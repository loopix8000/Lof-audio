import { LoaderCircle } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function TagProgressModal() {
  const { tagProgress } = useAudioAppContext();
  if (!tagProgress) return null;
  const { title, done, total } = tagProgress;
  // A single file has no steps to count, so it only spins.
  const counted = total > 1;
  return (
    <div className="tag-progress-backdrop">
      <div className="tag-progress-box" role="alertdialog" aria-busy="true" aria-label={title}>
        <div className="tag-progress-head">
          <LoaderCircle size={16} className="tag-progress-spin" />
          <span className="tag-progress-title">{title}</span>
          {counted && <span className="tag-progress-count">{done}/{total}곡</span>}
        </div>
        <div className="update-progress">
          <div
            className={`update-progress-fill ${counted ? "" : "indeterminate"}`}
            style={{ width: counted ? `${(done / total) * 100}%` : "30%" }}
          />
        </div>
        <span className="tag-progress-desc">파일에 저장하는 동안 잠시 기다려 주세요.</span>
      </div>
    </div>
  );
}
