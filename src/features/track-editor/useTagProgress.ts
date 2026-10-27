import { useState } from "react";
import { onTagWriteProgress } from "../../api";

export interface TagProgress {
  title: string;
  done: number;
  total: number;
}

/** Progress of a running tag write, shown in a blocking modal until it finishes. */
export function useTagProgress() {
  const [tagProgress, setTagProgress] = useState<TagProgress | null>(null);

  const setDone = (done: number) => setTagProgress(previous => previous && { ...previous, done });

  // Backend writes report progress through events; frontend loops call `step` themselves.
  const runTagWrite = async <T,>(title: string, total: number, task: (step: (done: number) => void) => Promise<T>): Promise<T> => {
    setTagProgress({ title, done: 0, total });
    const unlisten = await onTagWriteProgress(done => setDone(done));
    try {
      return await task(setDone);
    } finally {
      unlisten();
      setTagProgress(null);
    }
  };

  return { tagProgress, runTagWrite };
}
