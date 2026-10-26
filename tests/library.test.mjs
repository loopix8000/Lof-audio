import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/library.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext } }).outputText;
const { mergeTrackChanges } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("scan deltas update, append and delete requested tracks while preserving other objects", () => {
  const untouched = { id: 1, title: "unchanged" };
  const old = [{ id: 2, title: "old" }, untouched, { id: 3, title: "removed" }];
  const updated = { id: 2, title: "new" }, added = { id: 4, title: "added" };
  const result = mergeTrackChanges(old, [2, 3, 4], [updated, added]);
  assert.deepEqual(result, [updated, untouched, added]);
  assert.equal(result[1], untouched);
  assert.deepEqual(old.map(t => t.id), [2, 1, 3]);
});
