import type { Track } from "../../types";
import { isFolderWithin, normalizeFolderPath } from "../workspaces/scope";
import { naturalCompare } from "./filtering";

export interface FolderNode {
  path: string;
  name: string;
  trackCount: number;
  children: FolderNode[];
}

function displayPath(path: string): string {
  return path.replace(/^\\\\\?\\UNC\\/i, "//")
    .replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/, "") || "/";
}

/** 음원이 없는 중간 폴더도 탐색 경로에 포함합니다. */
export function buildFolderTree(folders: string[], tracks: Track[]): FolderNode[] {
  const roots: FolderNode[] = [];
  for (const path of [...folders].sort((a, b) => normalizeFolderPath(a).length - normalizeFolderPath(b).length)) {
    if (roots.some(root => isFolderWithin(path, root.path))) continue;
    roots.push({ path, name: displayPath(path).split("/").pop() || path, trackCount: 0, children: [] });
  }
  const nodes = new Map(roots.map(root => [normalizeFolderPath(root.path), root]));
  for (const track of tracks) {
    const root = roots.find(root => isFolderWithin(track.folderPath, root.path));
    if (!root) continue;
    root.trackCount++;
    let parent = root;
    let path = displayPath(root.path);
    const segments = displayPath(track.folderPath).slice(path === "/" ? 0 : path.length).split("/").filter(Boolean);
    for (const segment of segments) {
      path = `${path === "/" ? "" : path}/${segment}`;
      const key = normalizeFolderPath(path);
      let node = nodes.get(key);
      if (!node) {
        node = { path, name: segment, trackCount: 0, children: [] };
        nodes.set(key, node);
        parent.children.push(node);
      }
      node.trackCount++;
      parent = node;
    }
  }
  const sort = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => naturalCompare(a.name, b.name));
    nodes.forEach(node => sort(node.children));
  };
  sort(roots);
  return roots;
}

export function getFolderLocation(roots: FolderNode[], path: string | null) {
  const find = (nodes: FolderNode[], ancestors: FolderNode[]): FolderNode[] | null => {
    for (const node of nodes) {
      if (path === null || !isFolderWithin(path, node.path)) continue;
      const chain = [...ancestors, node];
      if (normalizeFolderPath(path) === normalizeFolderPath(node.path)) return chain;
      const found = find(node.children, chain);
      if (found) return found;
    }
    return null;
  };
  const ancestors = find(roots, []) ?? [];
  const current = ancestors[ancestors.length - 1] ?? null;
  return { current, ancestors, children: current?.children ?? roots, parent: ancestors[ancestors.length - 2]?.path ?? null };
}

export function isTrackInDirectory(track: Track, path: string | null): boolean {
  return path !== null && normalizeFolderPath(track.folderPath) === normalizeFolderPath(path);
}
