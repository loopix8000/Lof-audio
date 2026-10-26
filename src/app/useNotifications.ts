import { useState } from "react";

export function useNotifications() {
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    // Longer messages stay up longer so they can be read in full
    const duration = Math.min(7000, 2600 + Math.max(0, msg.length - 30) * 60);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, duration);
  };

  return {
    notify,
    toast,
  };
}

export type NotificationsModel = ReturnType<typeof useNotifications>;
