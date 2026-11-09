import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/utils/lrc.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext } }).outputText;
const { parseLrc, parseVtt, findActiveLyricIndex, buildDisplayLyricLines } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

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

test("VTT의 식별자·시간·설정·여러 줄과 태그를 읽고 주석과 스타일은 제외한다", () => {
  const vtt = "\uFEFFWEBVTT 제목\r\n\r\nNOTE 주석\r\n00:00.000 --> 00:01.000\r\n무시\r\n\r\nSTYLE\r\n::cue { color: red; }\r\n\r\nREGION\r\nid:main\r\n\r\ncue-1\r\n01:02:03.456 --> 01:02:05.000 align:start\r\n<v 가수><b>첫 줄</b> &amp;\r\n<01:02:04.000>둘째 줄\r\n";
  const expected = [{ timeSecs: 3723.456, endTimeSecs: 3725, text: "첫 줄 &\n둘째 줄" }];
  assert.deepEqual(parseVtt(vtt), expected);
  assert.deepEqual(buildDisplayLyricLines(vtt, null), expected);
  assert.deepEqual(parseVtt("WEBVTT\n\n00:02.000 --> 00:03.000\n&lt;b&gt; &amp; &nbsp;끝\n"), [
    { timeSecs: 2, endTimeSecs: 3, text: "<b> & \u00a0끝" },
  ]);
  assert.deepEqual(parseVtt("WEBVTT\r\r\r\r00:02.000 --> 00:03.000\r가사\r"), [
    { timeSecs: 2, endTimeSecs: 3, text: "가사" },
  ]);
});

test("VTT 시작 전·빈 구간·종료 후에는 하이라이트하지 않고 오프셋을 적용한다", () => {
  const lines = parseLrc("WEBVTT\n\n00:01.250 --> 00:02.500\n첫 줄\n\n00:04.000 --> 00:06.000\n끝\n", 500);
  assert.equal(lines[0].timeSecs, 1.75);
  assert.equal(lines[0].endTimeSecs, 3);
  assert.equal(findActiveLyricIndex(lines, 0), -1);
  assert.equal(findActiveLyricIndex(lines, 2), 0);
  assert.equal(findActiveLyricIndex(lines, 3), -1);
  assert.equal(findActiveLyricIndex(lines, 5), 1);
  assert.equal(findActiveLyricIndex(lines, 6.5), -1);
});

test("VTT의 잘못된 시간은 무시하고 겹친 구간에서는 아직 재생 중인 가사를 찾는다", () => {
  const lines = parseVtt("WEBVTT\n\n00:01.000 --> 00:10.000\n긴 가사\n\n00:02.000 --> 00:03.000\n짧은 가사\n\n00:61.000 --> 00:62.000\n오류\n\n00:05.000 --> 00:04.000\n역순\n");
  assert.equal(lines.length, 2);
  assert.equal(findActiveLyricIndex(lines, 2.5), 1);
  assert.equal(findActiveLyricIndex(lines, 4), 0);
  assert.equal(findActiveLyricIndex(lines, 10), -1);
});

test("LRC로 변환된 여러 줄 VTT 가사는 같은 시각에 함께 표시한다", () => {
  assert.deepEqual(parseLrc("[00:01.250]첫 줄\n[00:01.250]번역\n[00:02.500]"), [
    { timeSecs: 1.25, text: "첫 줄\n번역" }, { timeSecs: 2.5, text: "" },
  ]);
});
