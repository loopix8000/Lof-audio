import { createContext, useContext } from "react";
import type { useAudioApp } from "./useAudioApp";

export const AudioAppContext = createContext<ReturnType<typeof useAudioApp> | null>(null);

export function useAudioAppContext() {
  const app = useContext(AudioAppContext);
  if (!app) throw new Error("AudioAppContext provider is missing");
  return app;
}
