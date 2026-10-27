import { useCallback, useState } from "react";

const EMPTY_KEYS: ReadonlySet<string> = new Set();

/** Scope expansion state to the current workspace and group type. */
export function useGroupCollapse(workspaceId: number | null, groups: readonly { key: string }[]) {
  const [state, setState] = useState<{ workspaceId: number | null; keys: Set<string> }>(
    () => ({ workspaceId, keys: new Set() }),
  );
  const collapsed = state.workspaceId === workspaceId ? state.keys : EMPTY_KEYS;

  const toggle = useCallback((key: string) => {
    setState(previous => {
      const keys = new Set(previous.workspaceId === workspaceId ? previous.keys : []);
      if (keys.has(key)) keys.delete(key);
      else keys.add(key);
      return { workspaceId, keys };
    });
  }, [workspaceId]);

  const setAllCollapsed = useCallback((shouldCollapse: boolean) => {
    setState(previous => {
      const keys = new Set(previous.workspaceId === workspaceId ? previous.keys : []);
      for (const group of groups) {
        if (shouldCollapse) keys.add(group.key);
        else keys.delete(group.key);
      }
      return { workspaceId, keys };
    });
  }, [workspaceId, groups]);

  const collapsedCount = groups.reduce((count, group) => count + Number(collapsed.has(group.key)), 0);
  return { collapsed, collapsedCount, toggle, setAllCollapsed };
}
