import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { blankScreenplay } from "../src/lib/blank.ts";
import { newElement, scenesInAct, newScriptScene } from "../src/lib/screenplay.ts";
import {
  addAct, updateAct, deleteAct, moveAct, addScene, updateScene, moveScene, deleteScene, removeCastFromScenes,
  sceneIsEmpty, actSummary,
} from "../src/lib/screenplayedit.ts";
import {
  project, selectedScriptSceneId, isDirty, markClean, addScreenplayAct, renameScreenplayAct, deleteScreenplayAct,
  moveScreenplayAct, addScreenplayScene, updateScreenplayScene, moveScreenplayScene, deleteScreenplayScene,
  deleteCharacter, addCharacter, deletePlace, addPlace,
} from "../src/lib/stores.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;
const ids = (p: Project, actId: string) => scenesInAct(p.script_scenes, actId).map((s) => s.id);

function sample(): Project {
  const p = blankScreenplay(newId);
  let q = addAct(p, newId).project; // Act 2
  q = addScene(q, newId, q.acts[0].id).project;
  q = addScene(q, newId, q.acts[0].id).project; // act 1 now has 3 scenes (the blank one + 2)
  q = addScene(q, newId, q.acts[1].id).project;
  return q;
}

test("acts: add, rename, only an empty act can be deleted, move", () => {
  const p = blankScreenplay(newId);
  const r = addAct(p, newId);
  assert.equal(r.project.acts[1].title, "Act 2");
  assert.equal(addAct(p, newId, "  Finale ").project.acts[1].title, "Finale");
  assert.equal(updateAct(r.project, r.id, { title: "Act 2" }), r.project); // no change: same object
  assert.equal(updateAct(r.project, r.id, { title: "Two" }).acts[1].title, "Two");
  assert.equal(updateAct(r.project, "nope", { title: "x" }), r.project);
  assert.equal(deleteAct(r.project, r.project.acts[0].id), r.project); // it has a scene
  assert.equal(deleteAct(r.project, r.id).acts.length, 1);
  const moved = moveAct(r.project, r.id, 0);
  assert.deepEqual(moved.acts.map((a) => a.id), [r.id, p.acts[0].id]);
  assert.equal(moveAct(r.project, r.id, 99), r.project); // already last
});

test("scenes: add at an index keeps orders dense; a scene is created in an act when none exists", () => {
  const p = blankScreenplay(newId);
  const a = addScene(p, newId, p.acts[0].id, 0);
  assert.deepEqual(a.project.script_scenes.map((s) => s.order).sort(), [0, 1]);
  assert.equal(scenesInAct(a.project.script_scenes, p.acts[0].id)[0].id, a.id);
  assert.equal(a.project.script_scenes.find((s) => s.id === a.id)!.plotline_id, p.plotlines[0].id);
  const bare = { ...p, acts: [], script_scenes: [] } as Project;
  const made = addScene(bare, newId);
  assert.equal(made.project.acts.length, 1);
  assert.equal(made.project.script_scenes[0].act_id, made.project.acts[0].id);
});

test("scene fields: slug parts are cleaned, bad values and no-ops change nothing", () => {
  const p = blankScreenplay(newId);
  const id = p.script_scenes[0].id;
  const r = updateScene(p, id, { int_ext: "EXT", location: "  Maria's   car ", time: "NIGHT" });
  assert.deepEqual([r.script_scenes[0].int_ext, r.script_scenes[0].location, r.script_scenes[0].time], ["EXT", " Maria's car ", "NIGHT"]);
  assert.equal(updateScene(r, id, { time: "NIGHT" }), r);
  assert.equal(updateScene(p, id, { status: "weird" as never }), p);
  assert.equal(updateScene(p, id, { int_ext: "OUTSIDE" as never }).script_scenes[0].int_ext, "");
  assert.equal(updateScene(p, "nope", { title: "x" }), p);
  assert.equal(updateScene(p, id, { color: "pink" as never }), p); // unknown colour becomes "" which is what it was
  assert.equal(updateScene(p, id, { color: "red" }).script_scenes[0].color, "red");
});

test("moving scenes inside an act and across acts keeps orders dense", () => {
  const p = sample();
  const [a1, a2] = p.acts.map((a) => a.id);
  const [s0, s1, s2] = ids(p, a1);
  const [t0] = ids(p, a2);
  assert.deepEqual(ids(moveScene(p, s0, a1, 2), a1), [s1, s2, s0]);
  assert.equal(moveScene(p, s0, a1, 0), p); // already there
  const across = moveScene(p, s1, a2, 0);
  assert.deepEqual(ids(across, a1), [s0, s2]);
  assert.deepEqual(ids(across, a2), [s1, t0]);
  assert.deepEqual(scenesInAct(across.script_scenes, a1).map((s) => s.order), [0, 1]);
  assert.equal(moveScene(p, s0, "nope", 0), p);
});

test("deleting a scene closes the gap; deleted cast is removed from scenes", () => {
  const p = sample();
  const a1 = p.acts[0].id;
  const [s0, s1, s2] = ids(p, a1);
  const q = deleteScene(p, s1);
  assert.deepEqual(ids(q, a1), [s0, s2]);
  assert.deepEqual(scenesInAct(q.script_scenes, a1).map((s) => s.order), [0, 1]);
  assert.equal(deleteScene(p, "nope"), p);
  const withCast = { ...p, script_scenes: p.script_scenes.map((s) => ({ ...s, character_ids: ["c1", "c2"], place_ids: ["pl1"] })) };
  const cleaned = removeCastFromScenes(withCast, "character", "c1");
  assert.ok(cleaned.script_scenes.every((s) => s.character_ids.join() === "c2" && s.place_ids.join() === "pl1"));
  assert.equal(removeCastFromScenes(p, "character", "c1"), p);
});

test("an empty scene is not worth a question; one with words, a summary, notes or a slug is", () => {
  const s = newScriptScene(newId, "a", 0);
  assert.equal(sceneIsEmpty(s), true);
  assert.equal(sceneIsEmpty({ ...s, summary: "x" }), false);
  assert.equal(sceneIsEmpty({ ...s, location: "KITCHEN" }), false);
  const e = newElement(newId, "action"); e.text = "A door opens.";
  assert.equal(sceneIsEmpty({ ...s, elements: [e] }), false);
  assert.equal(sceneIsEmpty({ ...s, elements: [newElement(newId, "action")] }), true); // an empty element is nothing
});

test("act summary: scenes, words, elements and an estimated page length", () => {
  const p = sample();
  const a1 = p.acts[0].id;
  const e = newElement(newId, "action"); e.text = "One two three four five.";
  const withText = { ...p, script_scenes: p.script_scenes.map((s, i) => (i === 0 ? { ...s, elements: [e] } : s)) };
  const sum = actSummary(withText, a1);
  assert.equal(sum.scenes, 3);
  assert.equal(sum.words, 5);
  assert.equal(sum.elements, 1);
  assert.ok(sum.pages > 0 && sum.pages < 1);
  assert.equal(actSummary(withText, p.acts[1].id).words, 0);
});

test("screenplay edits through the stores mark the project changed, and no-ops do not", () => {
  project.set(blankScreenplay(newId));
  markClean();
  const id = addScreenplayScene();
  assert.equal(get(isDirty), true);
  assert.equal(get(selectedScriptSceneId), id); // a new scene is selected
  assert.equal(get(project)!.script_scenes.length, 2);

  markClean();
  updateScreenplayScene(id, { location: "" }); // already empty
  moveScreenplayScene(id, get(project)!.script_scenes[1].act_id, 1); // already there
  assert.equal(get(isDirty), false);

  updateScreenplayScene(id, { int_ext: "INT", location: "Kitchen", time: "Day" });
  assert.equal(get(isDirty), true);
  assert.equal(get(project)!.script_scenes[1].location, "Kitchen");

  const act = addScreenplayAct("Finale");
  renameScreenplayAct(act, { title: "The Finale" });
  moveScreenplayAct(act, 0);
  assert.equal(get(project)!.acts[0].title, "The Finale");
  assert.equal(deleteScreenplayAct(get(project)!.acts[1].id), false); // it has scenes
  assert.equal(deleteScreenplayAct(act), true);

  deleteScreenplayScene(id);
  assert.equal(get(selectedScriptSceneId), null);
  assert.equal(get(project)!.script_scenes.length, 1);
});

test("deleting a character or a place removes them from screenplay scenes too", () => {
  project.set(blankScreenplay(newId));
  const c = addCharacter("Maria");
  const pl = addPlace("Kitchen");
  project.update((p) => ({ ...p!, script_scenes: p!.script_scenes.map((s) => ({ ...s, character_ids: [c], place_ids: [pl] })) }));
  deleteCharacter(c);
  assert.deepEqual(get(project)!.script_scenes[0].character_ids, []);
  assert.deepEqual(get(project)!.script_scenes[0].place_ids, [pl]);
  deletePlace(pl);
  assert.deepEqual(get(project)!.script_scenes[0].place_ids, []);
});
