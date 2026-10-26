import { useAudioAppContext } from "./AppContext";

export function StatusToast() {
  const { toast } = useAudioAppContext();
  return (toast && <div className="status-toast">{toast}</div>);
}
