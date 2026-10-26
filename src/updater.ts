import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Update } from "@tauri-apps/plugin-updater";
import { UpdateChannel } from "./settings";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "latest"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export interface AvailableUpdate {
  version: string;
  date?: string;
  notes?: string;
}

/**
 * Checks the channel's latest.json through the Rust `update_check` command and
 * drives download/install with the plugin's `Update` handle.
 */
export function useAppUpdater({
  channel,
  configured,
  beforeInstall,
}: {
  channel: UpdateChannel;
  configured: boolean;
  beforeInstall: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const updateRef = useRef<Update | null>(null);
  // Bumped on each check so a slow response for an old channel can't overwrite a newer one
  const generation = useRef(0);
  const beforeInstallRef = useRef(beforeInstall);
  beforeInstallRef.current = beforeInstall;

  const reset = useCallback(() => {
    generation.current += 1;
    void updateRef.current?.close().catch(() => {});
    updateRef.current = null;
    setAvailable(null);
    setProgress(null);
    setError("");
    setPhase("idle");
  }, []);

  // A candidate found on one channel is not valid for another
  useEffect(() => reset(), [channel, reset]);

  const checkNow = useCallback(async (): Promise<AvailableUpdate | null> => {
    if (!configured) return null;
    const current = ++generation.current;
    setPhase("checking");
    setError("");
    try {
      const metadata = await invoke<ConstructorParameters<typeof Update>[0] | null>(
        "update_check",
        { channel },
      );
      if (current !== generation.current) return null;
      void updateRef.current?.close().catch(() => {});
      updateRef.current = metadata ? new Update(metadata) : null;
      const found = metadata
        ? { version: metadata.version, date: metadata.date, notes: metadata.body }
        : null;
      setAvailable(found);
      setPhase(found ? "available" : "latest");
      return found;
    } catch (e) {
      if (current === generation.current) {
        setError(String(e instanceof Error ? e.message : e));
        setPhase("error");
      }
      return null;
    }
  }, [channel, configured]);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update || phase === "downloading" || phase === "installing") return;
    const current = generation.current;
    setError("");
    setProgress(null);
    setPhase("downloading");
    try {
      let received = 0;
      let total = 0;
      await update.download(
        (event) => {
          if (current !== generation.current) return;
          if (event.event === "Started") total = event.data.contentLength || 0;
          if (event.event === "Progress") received += event.data.chunkLength;
          setProgress(total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null);
        },
        { timeout: 120000 },
      );
      if (current !== generation.current) return;
      setPhase("installing");
      await beforeInstallRef.current();
      // On Windows the installer closes the app and relaunches it when done
      await update.install({ restartAfterInstall: true });
    } catch (e) {
      if (current === generation.current) {
        setError(String(e instanceof Error ? e.message : e));
        setPhase("error");
      }
    }
  }, [phase]);

  return { phase, available, progress, error, checkNow, install };
}
