import { test } from "node:test";
import assert from "node:assert/strict";
import { blankProject } from "../src/lib/blank.ts";
import { parseUnsaved, shouldAskBeforeRestoring, restorePrompt, MIRROR_DEBOUNCE_MS } from "../src/lib/mirror.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;
const env = (over: object = {}) => JSON.parse(JSON.stringify({ path: null, project: blankProject(newId), source: "memory", ...over }));

test("a reload copy is parsed, adopted silently and keeps its file path", () => {
  const live = parseUnsaved(env({ path: "C:\\Stories\\wolf.fabulator.json" }));
  assert.ok(live);
  assert.equal(live.path, "C:\\Stories\\wolf.fabulator.json");
  assert.equal(live.source, "memory");
  assert.equal(shouldAskBeforeRestoring(live), false);
});

test("a copy read from disk after a restart asks first; no path means no file yet", () => {
  const live = parseUnsaved(env({ source: "disk" }));
  assert.ok(live);
  assert.equal(live.path, null);
  assert.equal(shouldAskBeforeRestoring(live), true);
});

test("old-format projects are upgraded; garbage gives null, never an exception", () => {
  assert.equal(parseUnsaved(null), null);
  assert.equal(parseUnsaved("x"), null);
  assert.equal(parseUnsaved({ path: null }), null);
  assert.equal(parseUnsaved({ project: 5 }), null);
  const old = env();
  old.project.scenes[0].status = undefined;
  assert.ok(parseUnsaved(old)?.project.scenes[0].status);
});

test("the prompt names the project and the file", () => {
  const withFile = parseUnsaved(env({ source: "disk", path: "/home/a/wolf.fabulator.json" }))!;
  assert.match(restorePrompt(withFile, (l) => l.split("/").pop()!), /wolf\.fabulator\.json/);
  const noFile = parseUnsaved(env({ source: "disk" }))!;
  assert.match(restorePrompt(noFile, (l) => l.split("/").pop()!), /before .* was saved to a file/);
});

test("mirroring is quick but debounced", () => {
  assert.ok(MIRROR_DEBOUNCE_MS >= 200 && MIRROR_DEBOUNCE_MS <= 1000);
});
