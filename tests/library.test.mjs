import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/library.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext } }).outputText;
const { mergeTrackChanges, followRenamedCollection } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("scan deltas update, append and delete requested tracks while preserving other objects", () => {
  const untouched = { id: 1, title: "unchanged" };
  const old = [{ id: 2, title: "old" }, untouched, { id: 3, title: "removed" }];
  const updated = { id: 2, title: "new" }, added = { id: 4, title: "added" };
  const result = mergeTrackChanges(old, [2, 3, 4], [updated, added]);
  assert.deepEqual(result, [updated, untouched, added]);
  assert.equal(result[1], untouched);
  assert.deepEqual(old.map(t => t.id), [2, 1, 3]);
});

test("a viewed album follows its tracks to the name they were renamed to", () => {
  const before = [{ id: 1, album: "Old" }, { id: 2, album: "Old" }, { id: 3, album: "Other" }];
  assert.equal(followRenamedCollection(before, [{ id: 1, album: "New" }, { id: 2, album: "New" }, before[2]], "album", "Old"), "New");
  // Only part of the album renamed: the old album still exists, so the view stays.
  assert.equal(followRenamedCollection(before, [{ id: 1, album: "New" }, before[1], before[2]], "album", "Old"), null);
  // Split across names: no single album to follow.
  assert.equal(followRenamedCollection(before, [{ id: 1, album: "A" }, { id: 2, album: "B" }, before[2]], "album", "Old"), null);
  assert.equal(followRenamedCollection(before, [before[2]], "album", "Old"), null);
});
