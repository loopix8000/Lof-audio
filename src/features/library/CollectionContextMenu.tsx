import { EyeOff } from "lucide-react";
import { useAudioAppContext } from "../../app/AppContext";

export function CollectionContextMenu() {
  const { collectionContextMenu: menu, handleHideItems, visibilityBusy } = useAudioAppContext();
  if (!menu) return null;
  return (
    <div className="native-menu" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}>
      <button className="native-menu-item" disabled={visibilityBusy} onClick={() => void handleHideItems([menu.target])}>
        <span><EyeOff size={13} /> 숨기기</span>
      </button>
    </div>
  );
}
