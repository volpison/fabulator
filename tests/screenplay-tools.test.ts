import { test } from "node:test";
import assert from "node:assert/strict";
import { blankScreenplay } from "../src/lib/blank.ts";
import { migrateProject } from "../src/lib/migrate.ts";
import { search } from "../src/lib/search.ts";
import { applyReplace, planReplace, DEFAULT_REPLACE_OPTIONS } from "../src/lib/replace.ts";
import {
  applyRestore, deletedScenes, deleteScriptSceneKeeping, autoSnapshotScriptScenes, makeScriptSnapshot, snapshotText,
  snapshotWords, scriptSceneToText, snapshotsFor,
} from "../src/lib/snapshots.ts";
import { wordStats } from "../src/lib/wordcount.ts";
import { addScene, updateScene, addElement, updateElement } from "../src/lib/screenplayedit.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const newId = (p = "x") => `${p}-${++n}`;
const F = { content: true, title: true, summary: true };

function sample(): Project {
  let p = blankScreenplay(newId);
  p = { ...p, characters: [{ id: "c1", name: "Maria", aliases: [], traits: [], role: "", category: "", description: "", notes: "" }] as any };
  const sc = p.script_scenes[0].id;
  p = updateScene(p, sc, { int_ext: "INT", location: "Kitchen", time: "Day", summary: "Maria cooks the wolf stew", title: "Stew" });
  const add = (kind: any, text: string, extra: any = {}) => {
    const r = addElement(p, newId, sc, kind);
    p = updateElement(r.project, sc, r.id, { text, ...extra });
  };
  add("action", "The wolf stew bubbles.");
  add("dialogue", "Is the wolf ready?", { speaker_id: "c1", parenthetical: "softly" });
  add("note", "check wolf budget");
  const r2 = addScene(p, newId, p.acts[0].id);
  p = updateScene(r2.project, r2.id, { int_ext: "EXT", location: "Bridge", time: "Night" });
  return p;
}

test("search finds screenplay scenes by slug, dialogue, speaker and notes, and acts by title", () => {
  const p = sample();
  assert.equal(search(p, "kitchen").counts.script_scene, 1);
  assert.equal(search(p, "ready").hits[0].kind, "script_scene");
  assert.equal(search(p, "maria wolf").counts.script_scene, 1); // speaker + words in one scene
  assert.equal(search(p, "budget").hits[0].field, "Notes");
  assert.equal(search(p, "bridge").hits[0].subtitle, "Act 1 · Scene 2");
  assert.equal(search(p, "act 1").counts.act, 1);
  assert.equal(search(p, "nothingtofind").hits.length, 0);
});

test("replace: counts, safety snapshot, slug and speaker untouched", () => {
  const p = sample();
  const plan = planReplace(p, "wolf", "fox", DEFAULT_REPLACE_OPTIONS, F);
  assert.equal(plan.scenes, 1);
  assert.deepEqual(plan.changes[0].counts, { content: 3, title: 0, summary: 1 }); // action, dialogue, note; summary
  assert.equal(plan.changes[0].title, "INT. KITCHEN - DAY");
  const only = planReplace(p, "wolf", "fox", DEFAULT_REPLACE_OPTIONS, { content: false, title: false, summary: true });
  assert.equal(only.total, 1);
  const r = applyReplace(p, "wolf", "fox", DEFAULT_REPLACE_OPTIONS, F, new Set([p.script_scenes[0].id]), 1000, () => newId("snap"));
  assert.equal(r.replacements, 4);
  const sc = r.project.script_scenes[0];
  assert.equal(sc.elements[0].text, "The fox stew bubbles.");
  assert.equal(sc.elements[1].speaker_id, "c1");
  assert.equal(sc.location, "Kitchen");
  assert.equal(sc.summary, "Maria cooks the fox stew");
  assert.equal(r.project.snapshots.length, 1);
  assert.equal(r.project.snapshots[0].script_scene!.elements[0].text, "The wolf stew bubbles.");
  // restoring the safety snapshot undoes it
  const back = applyRestore(r.project, r.project.snapshots[0].id, 2000, newId);
  assert.equal(back.project.script_scenes[0].elements[0].text, "The wolf stew bubbles.");
  assert.equal(applyReplace(p, "zzz", "y", DEFAULT_REPLACE_OPTIONS, F, new Set([p.script_scenes[0].id]), 1, newId).project, p);
});

test("deleting a scene keeps a copy that can bring it back at the end of its act", () => {
  const p = sample();
  const id = p.script_scenes[0].id;
  const gone = deleteScriptSceneKeeping(p, id, 10, () => newId("snap"));
  assert.equal(gone.script_scenes.length, 1);
  assert.equal(gone.snapshots.length, 1);
  assert.equal(deletedScenes(gone)[0].sceneId, id);
  assert.equal(deletedScenes(p).length, 0);
  const back = applyRestore(gone, gone.snapshots[0].id, 20, newId);
  assert.equal(back.sceneId, id);
  assert.equal(back.project.script_scenes.length, 2);
  assert.equal(back.project.script_scenes.find((s) => s.id === id)!.order, 1);
  assert.equal(deletedScenes(back.project).length, 0);
  // an empty scene leaves no copy
  const empty = deleteScriptSceneKeeping(p, p.script_scenes[1].id, 10, newId);
  assert.equal(empty.snapshots.length, 0);
});

test("auto snapshots: once per interval, of the old writing, never of an empty scene", () => {
  const p = sample();
  const id = p.script_scenes[0].id;
  const el = p.script_scenes[0].elements[0].id;
  const after = updateElement(p, id, el, { text: "Changed." });
  const a = autoSnapshotScriptScenes(p, after, 1_000_000, () => newId("snap"));
  assert.equal(a.snapshots.length, 1);
  assert.equal(a.snapshots[0].kind, "auto");
  assert.equal(a.snapshots[0].script_scene!.elements[0].text, "The wolf stew bubbles.");
  const again = autoSnapshotScriptScenes(a, updateElement(a, id, el, { text: "Changed again." }), 1_000_100, () => newId("snap"));
  assert.equal(again.snapshots.length, 1); // too soon
  const blank = sample();
  const e2 = blank.script_scenes[1].id;
  const aft = updateScene(blank, e2, { location: "Roof" });
  assert.equal(autoSnapshotScriptScenes(blank, aft, 5, newId).snapshots.length, 0);
  assert.equal(autoSnapshotScriptScenes(p, p, 5, newId), p);
});

test("snapshot text and words; manual snapshots list by scene", () => {
  const p = sample();
  const sc = p.script_scenes[0];
  const snap = makeScriptSnapshot(sc, "manual", "v1", 5, "s1");
  const text = snapshotText(snap, (id) => (id === "c1" ? "Maria" : ""));
  assert.match(text, /^INT\. KITCHEN - DAY\n\nSummary: Maria cooks/);
  assert.ok(text.includes("Maria (softly): Is the wolf ready?"));
  assert.ok(text.includes("Note: check wolf budget"));
  assert.equal(snapshotWords(snap), 4 + 4); // action 4, dialogue 4; notes not counted
  assert.equal(snapshotsFor([snap], sc.id).length, 1);
  assert.equal(scriptSceneToText({ ...sc, elements: [], summary: "" }), "INT. KITCHEN - DAY");
});

test("word counts: scenes and acts", () => {
  const p = sample();
  const st = wordStats(p);
  assert.equal(st.byScene.get(p.script_scenes[0].id), 8);
  assert.equal(st.byChapter.get(p.acts[0].id), 8);
  assert.equal(st.total, 8);
});

test("schema v11: older files open, a snapshot of a scene survives and is repaired", () => {
  const p = sample();
  const withSnap = { ...p, snapshots: [makeScriptSnapshot(p.script_scenes[0], "manual", "v1", 5, "s1")] };
  const { project } = migrateProject(JSON.parse(JSON.stringify({ ...withSnap, schema_version: 10 })));
  assert.equal(project.schema_version, 13);
  assert.equal(project.snapshots[0].script_scene!.elements.length, 3);
  const bad = migrateProject({ ...withSnap, snapshots: [{ ...withSnap.snapshots[0], script_scene: { id: "x", elements: "nope" } }] }).project;
  assert.ok(bad.snapshots[0].script_scene === undefined || Array.isArray(bad.snapshots[0].script_scene.elements));
  const plain = migrateProject({ ...p, snapshots: [{ ...withSnap.snapshots[0], script_scene: 5 }] }).project;
  assert.equal(plain.snapshots[0].script_scene, undefined);
});
