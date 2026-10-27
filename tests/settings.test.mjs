import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/settings.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext } }).outputText;
const { normalizeSettings, normalizeLastPlayback } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("resume on startup defaults to on and keeps a stored choice", () => {
  assert.equal(normalizeSettings({}).resumeOnStartup, true);
  assert.equal(normalizeSettings({ resumeOnStartup: false }).resumeOnStartup, false);
  assert.equal(normalizeSettings({ resumeOnStartup: "no" }).resumeOnStartup, true);
});

test("the restored track starts from the beginning unless set to resume", () => {
  assert.equal(normalizeSettings({}).resumePosition, "start");
  assert.equal(normalizeSettings({ resumePosition: "last" }).resumePosition, "last");
  assert.equal(normalizeSettings({ resumePosition: "middle" }).resumePosition, "start");
});

test("opening the playback screen on play defaults to on and keeps a stored choice", () => {
  assert.equal(normalizeSettings({}).openNowPlayingOnPlay, true);
  assert.equal(normalizeSettings({ openNowPlayingOnPlay: false }).openNowPlayingOnPlay, false);
  assert.equal(normalizeSettings({ openNowPlayingOnPlay: 1 }).openNowPlayingOnPlay, true);
});

test("last playback needs an integer track id and a numeric position", () => {
  assert.deepEqual(normalizeLastPlayback({ trackId: 7, positionSecs: 83.5 }), { trackId: 7, positionSecs: 83.5 });
  assert.deepEqual(normalizeLastPlayback({ trackId: 7, positionSecs: -3 }), { trackId: 7, positionSecs: 0 });
  assert.equal(normalizeLastPlayback(null), null);
  assert.equal(normalizeLastPlayback({ trackId: "7", positionSecs: 1 }), null);
  assert.equal(normalizeLastPlayback({ trackId: 7.5, positionSecs: 1 }), null);
  assert.equal(normalizeLastPlayback({ trackId: 7, positionSecs: Number.NaN }), null);
});
