import { EyeOff } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { useAudioAppContext } from "../../app/AppContext";

export function CollectionContextMenu() {
  const { collectionContextMenu: menu, handleHideItems, visibilityBusy } = useAudioAppContext();
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element || !menu) return;
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - height - 8))}px`;
  }, [menu]);
  if (!menu) return null;
  return (
    <div ref={menuRef} className="native-menu native-menu--compact" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}>
      <button className="native-menu-item" disabled={visibilityBusy} onClick={() => void handleHideItems([menu.target])}>
        <EyeOff size={13} aria-hidden="true" />
        <span>숨기기</span>
      </button>
    </div>
  );
}
