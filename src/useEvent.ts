import { useCallback, useRef } from "react";

/** Stable event identity with the latest render's state. */
export function useEvent<T extends (...args: any[]) => any>(handler: T): T {
  const ref = useRef(handler);
  ref.current = handler;
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, []);
}
