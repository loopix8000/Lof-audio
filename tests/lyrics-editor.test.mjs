import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext },
}).outputText;
const { createLyricsEntries, lookupLyricsBatch } = await import(
  `data:text/javascript;base64,${Buffer.from(compile("../src/features/lyrics/lyricsBatch.ts")).toString("base64")}`
);
// The hook's state and API boundaries let these tests exercise async handlers without a WebView.
const hookSource = compile("../src/features/lyrics/useLyricsEditor.ts")
  .replace(/^import .*;\r?$/gm, "")
  .replace("export function useLyricsEditor", "function useLyricsEditor");
const makeHook = new Function("api", "useEffect", "lookupLyricsBatch", `${hookSource}\nreturn useLyricsEditor;`);
const tracks = [
  { id: 1, title: "First", artist: "Artist", syncedLyrics: "[00:01.00]old first" },
  { id: 2, title: "Second", artist: "Artist", plainLyrics: "old second" },
  { id: 3, title: "Third", artist: "Unknown Artist", plainLyrics: "old third" },
];
const lyrics = id => ({ id, syncedLyrics: id === 1 ? "[00:03.00]first lyrics" : null, plainLyrics: `lyrics ${id}` });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function editor(api) {
  const state = {
    lyricsEntries: createLyricsEntries(tracks),
    lyricsEditingTrackId: 1,
    lyricsSessionVersion: { current: 0 },
    lyricsBusy: { current: false },
  };
  for (const key of ["lyricsEntries", "lrcLoading", "lyricsSaving"]) {
    state[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => {
      state[key] = typeof value === "function" ? value(state[key]) : value;
    };
  }
  const messages = [], refreshed = [];
  const inputs = {
    lyricsEditorState: state,
    trackEditor: { dialogTracks: tracks, refreshEditedTracks: async ids => refreshed.push(...ids), runTagWrite: (_title, _total, task) => task(() => {}) },
    preferences: { saveLrcFile: true },
    libraryState: { tracks, setTracks: update => { inputs.libraryState.tracks = update(inputs.libraryState.tracks); } },
    trackEditorState: { dialogOpen: true, setDialogOpen: open => { inputs.trackEditorState.dialogOpen = open; } },
    notifications: { notify: message => messages.push(message) },
  };
  let previousOpen;
  const useHook = makeHook(api, (effect, [open]) => {
    if (open !== previousOpen) { previousOpen = open; effect(); }
  }, lookupLyricsBatch);
  return { state, inputs, messages, refreshed, render: () => useHook(inputs) };
}

test("each selected track has its own initial lyrics, query, and edited draft", () => {
  const view = editor({});
  assert.equal(view.render().lyricDraft, "[00:01.00]old first");
  view.render().setLyricDraft("edited first");
  view.state.lyricsEditingTrackId = 2;
  assert.equal(view.render().lyricDraft, "old second");
  assert.equal(view.render().lrcSearchQuery, "Artist Second");
  view.render().setLyricDraft("edited second");
  view.state.lyricsEditingTrackId = 1;
  assert.equal(view.render().lyricDraft, "edited first");
  assert.equal(view.render().lyricsDirtyCount, 2);
  assert.equal(view.state.lyricsEntries[3].query, "Third");
});

test("batch lookup and save use every selected track's own lyrics", async () => {
  const searched = [], saved = [];
  const view = editor({
    previewMatchLyrics: async (id, candidate) => { searched.push(id); assert.equal(candidate, null); return lyrics(id); },
    applyLyricsToTrack: async (id, synced, plain, saveLrc) => {
      saved.push({ id, synced, plain, saveLrc });
      return { ...tracks.find(track => track.id === id), syncedLyrics: synced, plainLyrics: plain };
    },
  });
  await view.render().handleSearchAllLyrics();
  assert.deepEqual(searched.sort(), [1, 2, 3]);
  assert.equal(view.render().lyricsDirtyCount, 3);
  await view.render().handleSaveEditedLyrics();
  assert.deepEqual(saved, [
    { id: 1, synced: "[00:03.00]first lyrics", plain: "[00:03.00]first lyrics", saveLrc: true },
    { id: 2, synced: null, plain: "lyrics 2", saveLrc: true },
    { id: 3, synced: null, plain: "lyrics 3", saveLrc: true },
  ]);
  assert.equal(view.inputs.trackEditorState.dialogOpen, false);
  assert.equal(view.render().lyricsDirtyCount, 0);
});

test("missing lyrics and a failed lookup preserve existing drafts and do not prevent other matches", async () => {
  const view = editor({ previewMatchLyrics: async id => {
    if (id === 1) return null;
    if (id === 2) throw Error("HTTP 503");
    return lyrics(id);
  } });
  await view.render().handleSearchAllLyrics();
  assert.equal(view.state.lyricsEntries[1].draft, "[00:01.00]old first");
  assert.equal(view.state.lyricsEntries[1].dirty, false);
  assert.equal(view.state.lyricsEntries[2].draft, "old second");
  assert.match(view.state.lyricsEntries[2].status, /503/);
  assert.equal(view.state.lyricsEntries[3].draft, "lyrics 3");
  assert.equal(view.render().lyricsDirtyCount, 1);
});

test("switching the displayed track while searching keeps results attached to the requested track", async () => {
  const response = deferred();
  const view = editor({ searchLyricsManual: () => response.promise });
  const pending = view.render().handleSearchLrcManual();
  view.state.lyricsEditingTrackId = 2;
  response.resolve([lyrics(1)]);
  await pending;
  assert.deepEqual(view.render().lrcResults, []);
  view.state.lyricsEditingTrackId = 1;
  assert.deepEqual(view.render().lrcResults, [lyrics(1)]);
});

test("failed saves retain the draft for retry while other tracks save once", async () => {
  const saved = [];
  let shouldFail = true;
  const view = editor({ applyLyricsToTrack: async (id, synced, plain) => {
    saved.push(id);
    if (id === 2 && shouldFail) throw Error("locked file");
    return { ...tracks.find(track => track.id === id), syncedLyrics: synced, plainLyrics: plain };
  } });
  for (const id of [1, 2, 3]) {
    view.state.lyricsEditingTrackId = id;
    view.render().setLyricDraft(`edited ${id}`);
  }
  await view.render().handleSaveEditedLyrics();
  assert.deepEqual(saved, [1, 2, 3]);
  assert.deepEqual(view.refreshed, [2]);
  assert.equal(view.inputs.trackEditorState.dialogOpen, true);
  assert.equal(view.render().lyricsDirtyCount, 1);
  assert.equal(view.state.lyricsEntries[2].draft, "edited 2");
  shouldFail = false;
  await view.render().handleSaveEditedLyrics();
  assert.deepEqual(saved, [1, 2, 3, 2]);
  assert.equal(view.inputs.trackEditorState.dialogOpen, false);
});

test("saving an empty edited draft clears only that track's lyrics", async () => {
  const saved = [];
  const view = editor({ applyLyricsToTrack: async (id, synced, plain) => {
    saved.push({ id, synced, plain });
    return { ...tracks.find(track => track.id === id), syncedLyrics: synced, plainLyrics: plain };
  } });
  view.state.lyricsEditingTrackId = 2;
  view.render().setLyricDraft("");
  await view.render().handleSaveEditedLyrics();
  assert.deepEqual(saved, [{ id: 2, synced: null, plain: "" }]);
  assert.equal(view.inputs.libraryState.tracks[0], tracks[0]);
  assert.equal(view.inputs.libraryState.tracks[2], tracks[2]);
});

test("closing the dialog discards pending responses and stops queued lyric searches", async () => {
  const response = deferred(), searched = [];
  const view = editor({ previewMatchLyrics: id => { searched.push(id); return response.promise; } });
  const pending = view.render().handleSearchAllLyrics();
  view.inputs.trackEditorState.dialogOpen = false;
  view.render();
  response.resolve(lyrics(1));
  await pending;
  assert.deepEqual(searched, [1, 2]);
  assert.equal(view.render().lyricsDirtyCount, 0);
  assert.equal(view.state.lyricsEntries[2].draft, "old second");
  assert.equal(view.state.lrcLoading, false);
});
