import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/features/metadata/lookupMatches.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext } }).outputText;
const { lookupMatches } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test("metadata is visible and search unlocks while lyrics are still pending", async () => {
  const lyrics = deferred();
  const started = deferred();
  const events = [];
  const candidate = { title: "test song" };
  const lookup = lookupMatches([1], {
    isCurrent: () => true,
    searchMetadata: async () => [candidate],
    onPreview: preview => events.push(["preview", preview.candidates]),
    onMetadataComplete: () => events.push(["unlocked"]),
    loadLyrics: async () => { events.push(["lyrics"]); started.resolve(); await lyrics.promise; },
  });
  await started.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events[0], ["preview", [candidate]]);
  assert.ok(events.some(event => event[0] === "unlocked"));
  lyrics.resolve();
  await lookup;
});

test("a metadata service error preserves other tracks and still allows lyrics lookup", async () => {
  const previews = [], lyricsIds = [];
  await lookupMatches([1, 2], {
    isCurrent: () => true,
    searchMetadata: async id => { if (id === 1) throw Error("HTTP 503"); return [{ title: "available" }]; },
    onPreview: preview => previews.push(preview),
    onMetadataComplete: () => {},
    loadLyrics: async preview => { lyricsIds.push(preview.trackId); },
  });
  assert.match(previews[0].metadataError, /503/);
  assert.equal(previews[1].candidates[0].title, "available");
  assert.deepEqual(lyricsIds, [1, 2]);
});

test("closing a dialog discards its late response and stops queued work", async () => {
  const response = deferred();
  const searched = [], previews = [];
  let current = true;
  const lookup = lookupMatches([1, 2, 3], {
    isCurrent: () => current,
    searchMetadata: async id => { searched.push(id); return response.promise; },
    onPreview: preview => previews.push(preview),
    onMetadataComplete: () => assert.fail("stale lookup must not unlock a newer dialog"),
    loadLyrics: async () => assert.fail("stale lookup must not request lyrics"),
  });
  current = false;
  response.resolve([]);
  await lookup;
  assert.deepEqual(searched, [1, 2]);
  assert.deepEqual(previews, []);
});

test("automatic lyric requests have bounded concurrency", async () => {
  let running = 0, maximum = 0;
  await lookupMatches([1, 2, 3, 4, 5], {
    isCurrent: () => true,
    searchMetadata: async () => [],
    onPreview: () => {},
    onMetadataComplete: () => {},
    loadLyrics: async () => {
      maximum = Math.max(maximum, ++running);
      await new Promise(resolve => setImmediate(resolve));
      running--;
    },
  });
  assert.equal(maximum, 4);
  assert.equal(running, 0);
});

test("lyrics start before another track's slow metadata request finishes", async () => {
  const slow = deferred(), lyricsStarted = deferred();
  const searched = [], previews = [];
  let metadataComplete = false;
  const lookup = lookupMatches([1, 2], {
    isCurrent: () => true,
    searchMetadata: async id => { searched.push(id); return id === 2 ? slow.promise : []; },
    onPreview: preview => previews.push(preview.trackId),
    onMetadataComplete: () => { metadataComplete = true; },
    loadLyrics: async preview => { if (preview.trackId === 1) lyricsStarted.resolve(); },
  });
  await lyricsStarted.promise;
  assert.deepEqual(searched, [1, 2]);
  assert.deepEqual(previews, [1]);
  assert.equal(metadataComplete, false);
  slow.resolve([]);
  await lookup;
  assert.equal(metadataComplete, true);
});
