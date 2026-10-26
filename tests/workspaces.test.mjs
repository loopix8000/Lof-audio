import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/features/workspaces/scope.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext } }).outputText;
const { isFolderWithin, scopeWorkspaceTracks, scopeWorkspacePlaylists } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("workspace folders include descendants, deduplicate overlapping roots and respect literal boundaries", () => {
  const tracks = [
    { id: 1, folderPath: "C:\\Music\\Album" },
    { id: 2, folderPath: "c:/music" },
    { id: 3, folderPath: "C:/MusicBackup" },
    { id: 4, folderPath: "D:/Other" },
  ];
  assert.deepEqual(scopeWorkspaceTracks(tracks, ["C:/Music/", "C:/Music/Album"]).map(t => t.id), [1, 2]);
  assert.deepEqual(scopeWorkspaceTracks(tracks, ["D:/Other"]).map(t => t.id), [4]);
  assert.deepEqual(scopeWorkspaceTracks(tracks, []), []);
  assert.equal(isFolderWithin("C:/Mix_X", "C:/Mix_%"), false);
  assert.equal(isFolderWithin("\\\\?\\C:\\Music\\Album", "c:/music"), true);
  assert.equal(isFolderWithin("\\\\server\\Share\\Album", "//SERVER/share"), true);
  assert.equal(isFolderWithin("/Music/Album", "/music"), false);
  assert.equal(isFolderWithin("/Music/Album", "/"), true);
});

test("playlists and removed tracks stay scoped even when the same music folder is shared", () => {
  const all = [{ id: 1, folderPath: "/shared" }, { id: 2, folderPath: "/private" }];
  const tracks = scopeWorkspaceTracks(all, ["/shared"], [1]);
  assert.deepEqual(tracks, []);
  assert.equal(scopeWorkspaceTracks(all, ["/shared"]).length, 1);
  const playlists = [{ id: 1, workspaceId: 1, trackIds: [1, 2] }, { id: 2, workspaceId: 2, trackIds: [1] }];
  assert.deepEqual(scopeWorkspacePlaylists(playlists, 1, scopeWorkspaceTracks(all, ["/shared"])), [{ id: 1, workspaceId: 1, trackIds: [1] }]);
  assert.deepEqual(scopeWorkspacePlaylists(playlists, 2, tracks), [{ id: 2, workspaceId: 2, trackIds: [] }]);
  assert.deepEqual(playlists[0].trackIds, [1, 2]);
});
