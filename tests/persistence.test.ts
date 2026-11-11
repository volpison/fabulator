import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { setPlatform, toLocation } from "../src/lib/platform/index.ts";
import { recentFiles, clearRecents } from "../src/lib/recentStore.ts";
import {
  loadInitialProject, manualSave, saveNow, ensureSafeToLeave, newProject, loadSample, openProject, startMirror,
} from "../src/lib/persistence.ts";
import { project, currentPath, isDirty, markDirty, markClean, saveState, updateSceneTitle } from "../src/lib/stores.ts";
import { blankProject } from "../src/lib/blank.ts";
import { createFakePlatform, type Fake } from "./fakePlatform.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;
const sampleProject = () => ({ ...blankProject(newId), title: "The Boy Who Cried Wolf" });

let fake: Fake;
beforeEach(() => {
  fake = createFakePlatform(sampleProject());
  setPlatform(fake.platform);
  project.set(null as any);
  currentPath.set(null);
  markClean();
  clearRecents();
});

const liveEnvelope = (title: string, path: string | null, source: "memory" | "disk") => {
  const p = { ...blankProject(newId), title };
  return { project: p, path, source };
};

test("start-up with nothing saved opens a BLANK story, not the sample", async () => {
  await loadInitialProject();
  const p = get(project)!;
  assert.notEqual(p.title, "The Boy Who Cried Wolf");
  assert.equal(p.scenes.length, 1);
  assert.equal(p.scenes[0].content, "");
  assert.equal(get(currentPath), null);
  assert.equal(get(isDirty), false);
});

test("File → Load sample story really loads the sample", async () => {
  await loadInitialProject();
  await loadSample(); // clean project: no question asked
  assert.equal(get(project)!.title, "The Boy Who Cried Wolf");
  assert.equal(get(isDirty), false);
});

test("a reload of the view (live copy in memory) is adopted silently, still unsaved, with its path", async () => {
  fake.state.unsaved = liveEnvelope("My draft", "C:\\Stories\\a.fabulator.json", "memory");
  await loadInitialProject();
  assert.equal(get(project)!.title, "My draft");
  assert.equal(get(currentPath), "C:\\Stories\\a.fabulator.json");
  assert.equal(get(isDirty), true);
  assert.equal(fake.state.confirms.length, 0); // no question
});

test("after a restart the live copy asks first; Restore adopts it", async () => {
  fake.state.unsaved = liveEnvelope("Recovered", null, "disk");
  fake.state.confirmAnswers.push(true);
  await loadInitialProject();
  assert.equal(fake.state.confirms.length, 1);
  assert.equal(get(project)!.title, "Recovered");
  assert.equal(get(isDirty), true);
});

test("'Start fresh' opens a BLANK story and drops the live copy", async () => {
  fake.state.unsaved = liveEnvelope("Recovered", null, "disk");
  fake.state.confirmAnswers.push(false);
  await loadInitialProject();
  assert.notEqual(get(project)!.title, "Recovered");
  assert.notEqual(get(project)!.title, "The Boy Who Cried Wolf");
  assert.equal(get(isDirty), false);
  assert.equal(fake.state.unsaved, null);
});

test("a recovery copy left by an older version is still offered (and asks first)", async () => {
  fake.state.unsaved = { project: { ...blankProject(newId), title: "Old recovery" }, path: null, source: "legacy" };
  fake.state.confirmAnswers.push(true);
  await loadInitialProject();
  assert.equal(fake.state.confirms.length, 1);
  assert.equal(get(project)!.title, "Old recovery");
  assert.equal(get(isDirty), true);
});

test("Ctrl+S on a story with no file asks where, saves and remembers the path", async () => {
  await loadInitialProject();
  markDirty();
  fake.state.saveAnswers.push("C:\\Stories\\new.fabulator.json");
  assert.equal(await manualSave(), true);
  assert.equal(get(currentPath), "C:\\Stories\\new.fabulator.json");
  assert.equal(get(isDirty), false);
  assert.ok(fake.state.files.has("C:\\Stories\\new.fabulator.json"));
  assert.equal(get(saveState).status, "saved");
});

test("cancelling the Save dialog saves nothing", async () => {
  await loadInitialProject();
  markDirty();
  fake.state.saveAnswers.push(null);
  assert.equal(await manualSave(), false);
  assert.equal(fake.state.files.size, 0);
  assert.equal(get(isDirty), true);
});

test("autosave never opens a dialog for a story with no file", async () => {
  await loadInitialProject();
  markDirty();
  assert.equal(await saveNow(), false);
  assert.equal(fake.state.files.size, 0);
});

test("a failed save reports the error and leaves the story marked unsaved", async () => {
  await loadInitialProject();
  currentPath.set(toLocation("C:\\a.fabulator.json"));
  markDirty();
  fake.state.failNext = "save";
  assert.equal(await saveNow(), false);
  assert.equal(get(saveState).status, "error");
  assert.equal(get(isDirty), true);
});

test("leaving: clean → no question; dirty with a file → saves, no question; dirty without → asks", async () => {
  await loadInitialProject();
  assert.equal(await ensureSafeToLeave("Go?"), true);
  assert.equal(fake.state.confirms.length, 0);

  currentPath.set(toLocation("C:\\a.fabulator.json"));
  markDirty();
  assert.equal(await ensureSafeToLeave("Go?"), true);
  assert.equal(fake.state.confirms.length, 0);
  assert.equal(get(isDirty), false);

  currentPath.set(null);
  markDirty();
  fake.state.confirmAnswers.push(false);
  assert.equal(await ensureSafeToLeave("Go?"), false);
  assert.match(fake.state.confirms[0], /unsaved changes/i);
});

test("New story: declined keeps the work; accepted replaces it with a blank story and clears the mirror", async () => {
  await loadInitialProject();
  updateSceneTitle(get(project)!.scenes[0].id, "Precious work");
  fake.state.confirmAnswers.push(false);
  await newProject();
  assert.equal(get(project)!.scenes[0].title, "Precious work");

  fake.state.confirmAnswers.push(true);
  await newProject();
  assert.notEqual(get(project)!.scenes[0].title, "Precious work");
  assert.equal(get(isDirty), false);
  assert.ok(fake.state.log.includes("unsaved.discard"));
});

test("opening an old-format file backs it up first and marks the upgrade for saving", async () => {
  await loadInitialProject();
  const old: any = blankProject(newId);
  old.schema_version = 4;
  for (const s of old.scenes) { delete s.notes; delete s.todos; delete s.when; }
  fake.state.files.set("C:\\old.fabulator.json", old);
  fake.state.openAnswers.push("C:\\old.fabulator.json");
  await openProject();
  assert.ok(fake.state.log.includes("backup C:\\old.fabulator.json"));
  assert.equal(get(currentPath), "C:\\old.fabulator.json");
  assert.equal(get(isDirty), true);
  assert.equal(get(project)!.schema_version, 6);
});

test("opening a missing file shows an error and keeps the current story", async () => {
  await loadInitialProject();
  const before = get(project);
  fake.state.openAnswers.push("C:\\nope.fabulator.json");
  await openProject();
  assert.equal(get(project), before);
  assert.equal(get(saveState).status, "error");
});

test("the live mirror sends unsaved work after a pause and clears when saved", async (t) => {
  (globalThis as any).window = { addEventListener() {}, removeEventListener() {} };
  (globalThis as any).document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await loadInitialProject();
  const stop = startMirror();
  fake.state.log.length = 0;

  updateSceneTitle(get(project)!.scenes[0].id, "Typing…");
  t.mock.timers.tick(499);
  assert.ok(!fake.state.log.includes("unsaved.keep")); // still waiting
  t.mock.timers.tick(2);
  await new Promise((r) => setImmediate(r));
  assert.ok(fake.state.log.includes("unsaved.keep"));
  assert.equal((fake.state.unsaved as any).project.scenes[0].title, "Typing…");

  markClean();
  await new Promise((r) => setImmediate(r));
  assert.equal(fake.state.unsaved, null);
  stop();
});

import { openRecent } from "../src/lib/persistence.ts";

test("opening or saving a file puts it at the top of the recent list", async () => {
  await loadInitialProject();
  markDirty();
  fake.state.saveAnswers.push("C:\\Stories\\one.fabulator.json");
  await manualSave();
  assert.deepEqual(get(recentFiles).map((r) => r.name), ["one.fabulator.json"]);

  fake.state.files.set("C:\\Stories\\two.fabulator.json", blankProject(newId));
  fake.state.openAnswers.push("C:\\Stories\\two.fabulator.json");
  await openProject();
  assert.deepEqual(get(recentFiles).map((r) => r.name), ["two.fabulator.json", "one.fabulator.json"]);
});

test("Open recent opens that file; a missing one is reported and removed from the list", async () => {
  await loadInitialProject();
  const good = toLocation("C:\\Stories\\good.fabulator.json");
  const gone = toLocation("C:\\Stories\\gone.fabulator.json");
  fake.state.files.set(good, { ...blankProject(newId), title: "Good one" });
  recentFiles.set([
    { location: good, name: "good.fabulator.json", at: 2 },
    { location: gone, name: "gone.fabulator.json", at: 1 },
  ]);

  await openRecent(gone);
  assert.equal(get(saveState).status, "error");
  assert.match(get(saveState).message ?? "", /gone\.fabulator\.json.*removed from recent/);
  assert.deepEqual(get(recentFiles).map((r) => r.name), ["good.fabulator.json"]);

  await openRecent(good);
  assert.equal(get(project)!.title, "Good one");
  assert.equal(get(currentPath), good);
  assert.equal(get(isDirty), false);
});

test("Open recent still protects unsaved work", async () => {
  await loadInitialProject();
  updateSceneTitle(get(project)!.scenes[0].id, "Unsaved");
  const loc = toLocation("C:\\x.fabulator.json");
  fake.state.files.set(loc, blankProject(newId));
  fake.state.confirmAnswers.push(false); // "Cancel"
  await openRecent(loc);
  assert.equal(get(project)!.scenes[0].title, "Unsaved");
  assert.match(fake.state.confirms[0], /unsaved changes/i);
});

function fakeBrowserGlobals() {
  (globalThis as any).window = { addEventListener() {}, removeEventListener() {} };
  (globalThis as any).document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };
}
const flush = () => new Promise((r) => setImmediate(r));

test("after a save, the unsaved copy is dropped once nothing is unsaved", async (t) => {
  fakeBrowserGlobals();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await loadInitialProject();
  const stop = startMirror();

  updateSceneTitle(get(project)!.scenes[0].id, "Draft");
  t.mock.timers.tick(501);
  await flush();
  assert.ok(fake.state.unsaved);

  fake.state.saveAnswers.push("C:\\Stories\\s.fabulator.json");
  assert.equal(await manualSave(), true);
  await flush();
  assert.equal(fake.state.unsaved, null);
  stop();
});

test("typing while a save runs never loses the newer text: the unsaved copy survives the save", async (t) => {
  fakeBrowserGlobals();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await loadInitialProject();
  currentPath.set(toLocation("C:\\Stories\\s.fabulator.json"));
  const stop = startMirror();
  const id = get(project)!.scenes[0].id;

  updateSceneTitle(id, "v1");
  t.mock.timers.tick(501);
  await flush();
  assert.equal((fake.state.unsaved as any).project.scenes[0].title, "v1");

  fake.state.duringSave = () => updateSceneTitle(id, "v2"); // typed during the save
  assert.equal(await saveNow(), true);
  await flush();
  assert.equal(get(isDirty), true); // the save did not cover "v2"
  assert.ok(fake.state.unsaved); // and the safety copy was NOT thrown away by the save

  t.mock.timers.tick(501);
  await flush();
  assert.equal((fake.state.unsaved as any).project.scenes[0].title, "v2");
  stop();
});

test("autosave for a story with no file writes nothing (the mirror covers it)", async (t) => {
  fakeBrowserGlobals();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { startAutosave } = await import("../src/lib/persistence.ts");
  await loadInitialProject();
  const stop = startAutosave();
  updateSceneTitle(get(project)!.scenes[0].id, "Typing");
  t.mock.timers.tick(20_000);
  await flush();
  assert.equal(fake.state.files.size, 0);
  stop();
});

test("the mirror sends the whole project once, then only the changes", async (t) => {
  fakeBrowserGlobals();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await loadInitialProject();
  const stop = startMirror();
  const id = get(project)!.scenes[0].id;

  updateSceneTitle(id, "One");
  t.mock.timers.tick(501);
  await flush();
  updateSceneTitle(id, "Two");
  t.mock.timers.tick(501);
  await flush();

  assert.deepEqual(fake.state.log.filter((l) => l.startsWith("unsaved.keep")), ["unsaved.keep", "unsaved.keepChanges"]);
  assert.equal((fake.state.unsaved as any).project.scenes[0].title, "Two");
  stop();
});

test("saving uses the kept copy when the platform has the current project", async (t) => {
  fakeBrowserGlobals();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await loadInitialProject();
  currentPath.set(toLocation("C:\\Stories\\k.fabulator.json"));
  const stop = startMirror();
  updateSceneTitle(get(project)!.scenes[0].id, "Kept");
  t.mock.timers.tick(501);
  await flush();

  assert.equal(await saveNow(), true);
  assert.equal(fake.state.keptSaves, 1);
  assert.equal((fake.state.files.get("C:\\Stories\\k.fabulator.json") as any).scenes[0].title, "Kept");
  stop();
});

test("saving catches the kept copy up first, and falls back to sending the project when there is none", async () => {
  fakeBrowserGlobals();
  await loadInitialProject();
  currentPath.set(toLocation("C:\\Stories\\f.fabulator.json"));
  updateSceneTitle(get(project)!.scenes[0].id, "Fresh"); // the mirror never ran: no kept copy yet
  assert.equal(await saveNow(), true);
  assert.equal((fake.state.files.get("C:\\Stories\\f.fabulator.json") as any).scenes[0].title, "Fresh");

  // A kept copy that vanished (e.g. the app restarted) is replaced, never trusted.
  fake.state.unsaved = null;
  updateSceneTitle(get(project)!.scenes[0].id, "Again");
  assert.equal(await saveNow(), true);
  assert.equal((fake.state.files.get("C:\\Stories\\f.fabulator.json") as any).scenes[0].title, "Again");
});

test("a failed save from the kept copy reports the error and keeps the story unsaved", async (t) => {
  fakeBrowserGlobals();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await loadInitialProject();
  currentPath.set(toLocation("C:\\Stories\\e.fabulator.json"));
  const stop = startMirror();
  updateSceneTitle(get(project)!.scenes[0].id, "x");
  t.mock.timers.tick(501);
  await flush();
  fake.state.failNext = "save";
  assert.equal(await saveNow(), true === false);
  assert.equal(get(isDirty), true);
  stop();
});
