import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadModule(path, imports = {}) {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [name, url] of Object.entries(imports)) source = source.replaceAll(`"${name}"`, `"${url}"`);
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}
const scope = loadModule("../src/features/workspaces/scope.ts");
const filtering = loadModule("../src/features/library/filtering.ts");
const { buildFolderTree, getFolderLocation, isTrackInDirectory } = await import(loadModule("../src/features/library/folderTree.ts", {
  "../workspaces/scope": scope,
  "./filtering": filtering,
}));
const tracks = [
  { id: 1, folderPath: "D:/Music/tayori" },
  { id: 2, folderPath: "D:/Music/tayori/magic" },
  { id: 3, folderPath: "D:/Music/tayori/live/disc 10" },
  { id: 4, folderPath: "D:/Music/tayori/live/disc 2" },
];
const roots = buildFolderTree(["D:/Music/tayori", "d:/music/tayori/magic", "E:/Empty"], tracks);

test("탐색기 처음에는 등록한 최상위 폴더만 표시하고 음악은 표시하지 않는다", () => {
  const location = getFolderLocation(roots, null);
  assert.equal(location.current, null);
  assert.deepEqual(location.children.map(folder => folder.name), ["Empty", "tayori"]);
  assert.deepEqual(tracks.filter(track => isTrackInDirectory(track, null)), []);
  assert.equal(roots[1].trackCount, 4);
});

test("하위 폴더는 한 단계씩 표시하고 현재 폴더의 음악만 표시한다", () => {
  const location = getFolderLocation(roots, "d:\\music\\TAYORI\\");
  assert.deepEqual(location.children.map(folder => folder.name), ["live", "magic"]);
  assert.deepEqual(tracks.filter(track => isTrackInDirectory(track, location.current.path)).map(track => track.id), [1]);
  assert.equal(location.parent, null);
});

test("직접 음원이 없는 중간 폴더를 거쳐 진입하고 경로와 상위 폴더를 찾는다", () => {
  const location = getFolderLocation(roots, "D:/Music/tayori/live");
  assert.deepEqual(location.children.map(folder => folder.name), ["disc 2", "disc 10"]);
  assert.deepEqual(location.ancestors.map(folder => folder.name), ["tayori", "live"]);
  assert.equal(location.parent, "D:/Music/tayori");
  const leaf = getFolderLocation(roots, "D:/Music/tayori/live/disc 2");
  assert.equal(leaf.children.length, 0);
  assert.equal(leaf.parent, location.current.path);
});

test("제거된 경로와 비어 있는 등록 폴더를 처리한다", () => {
  assert.equal(getFolderLocation(roots, "D:/Music/tayori-backup").current, null);
  const empty = getFolderLocation(roots, "E:/Empty");
  assert.equal(empty.current.name, "Empty");
  assert.equal(empty.children.length, 0);
});

test("UNC와 확장 Windows 경로는 같은 폴더로 비교하고 POSIX 대소문자는 구분한다", () => {
  assert.equal(isTrackInDirectory({ folderPath: "\\\\?\\UNC\\server\\Music\\Album" }, "//SERVER/music/album/"), true);
  assert.equal(isTrackInDirectory({ folderPath: "\\\\?\\D:\\Music\\Album" }, "d:/music/album"), true);
  assert.equal(isTrackInDirectory({ folderPath: "/Music/Album" }, "/music/album"), false);
  assert.equal(isTrackInDirectory({ folderPath: "D:/Music/Album/Disc1" }, "D:/Music/Album"), false);
});
