import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/utils/lrc.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext } }).outputText;
const { parseLrc, findActiveLyricIndex, buildDisplayLyricLines } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("the first lyric stays inactive until its timestamp", () => {
  const lines = parseLrc("[00:30.00]first\n[00:40.00]second");
  assert.equal(findActiveLyricIndex(lines, 0), -1);
  assert.equal(findActiveLyricIndex(lines, 30), 0);
  assert.equal(findActiveLyricIndex(lines, 40), 1);
});

test("embedded offsets advance lyrics and user adjustments delay them", () => {
  assert.equal(parseLrc("[offset:500]\n[00:10.00]hello")[0].timeSecs, 9.5);
  assert.equal(parseLrc("[offset:-500]\n[00:10.00]hello", 100)[0].timeSecs, 10.6);
  assert.equal(parseLrc("[offset:100]\n[offset:500]\n[00:10.00]hello", 500)[0].timeSecs, 10);
});

test("빈 가사 줄은 음표로 대체하지 않고 시간과 순서를 유지한다", () => {
  const lines = parseLrc("[00:01]첫 줄\n[00:02][00:03]  \n[00:04]♪");
  assert.deepEqual(lines, [
    { timeSecs: 1, text: "첫 줄" },
    { timeSecs: 2, text: "" },
    { timeSecs: 3, text: "" },
    { timeSecs: 4, text: "♪" },
  ]);
  assert.equal(findActiveLyricIndex(lines, 2), 1);
});

test("multiple timestamps preserve text, ordering, and subsecond precision", () => {
  assert.deepEqual(parseLrc("[00:20.123][00:01.5]chorus"), [
    { timeSecs: 1.5, text: "chorus" }, { timeSecs: 20.123, text: "chorus" },
  ]);
  assert.deepEqual(buildDisplayLyricLines(null, "one\ntwo", 0, 10), [
    { timeSecs: 0, text: "one" }, { timeSecs: 5, text: "two" },
  ]);
});
