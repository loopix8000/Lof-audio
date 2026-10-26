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

/** Include intermediate directories even when they contain no audio files themselves. */
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
