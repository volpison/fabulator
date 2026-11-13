import { test } from "node:test";
import assert from "node:assert/strict";
import { blankScreenplay, blankProject, blankProjectFor } from "../src/lib/blank.ts";
import { migrateProject, CURRENT_SCHEMA_VERSION } from "../src/lib/migrate.ts";
import { STORY_FORMATS, readyFormats, formatOf, noun } from "../src/lib/formats.ts";
import {
  cleanActs, cleanScriptScenes, scenesInAct, screenplayReadingOrder, sceneNumbers, slugLine, parseSlug, needsContd,
  sceneWordCount, sceneLines, pagesFromLines, formatPages, scenePages, screenplayLength, newElement, newScriptScene,
  LINES_PER_PAGE,
} from "../src/lib/screenplay.ts";
import { diffProject, applyPatch, LIST_FIELDS } from "../src/lib/patch.ts";
import type { Project, ScriptElement } from "../src/lib/types.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function sample(): Project {
  const p = blankScreenplay(newId);
  const act1 = p.acts[0].id;
  p.acts.push({ id: newId("act"), title: "Act 2", summary: "" });
  p.script_scenes = [0, 1, 2].map((i) => newScriptScene(newId, act1, i));
  p.script_scenes.push(newScriptScene(newId, p.acts[1].id, 0));
  const s = p.script_scenes[0];
  Object.assign(s, { int_ext: "INT", location: "Kitchen", time: "Day", summary: "Maria burns the toast." });
  const a = newElement(newId, "action"); a.text = "Maria stares at the smoking toaster.";
  const d = newElement(newId, "dialogue", "ch-1"); d.text = "Not again."; d.parenthetical = "sighing"; d.extension = "O.S.";
  s.elements = [a, d];
  return p;
}

test("the screenplay format has its Timeline, but is not ready: not offered, the writing view says so", () => {
  assert.equal(STORY_FORMATS.screenplay.ready, false);
  assert.deepEqual(STORY_FORMATS.screenplay.views, { timeline: true, manuscript: false });
  assert.deepEqual(readyFormats().map((f) => f.id), ["novel", "comic"]);
  const p = sample();
  assert.equal(formatOf(p).label, "Screenplay");
  assert.equal(noun(p, "group", 2), "acts");
  assert.equal(noun(p, "unit", 1, true), "Scene");
});

test("a new screenplay is a valid current-version project with one act and one scene", () => {
  const p = blankScreenplay(newId);
  assert.equal(p.story_format, "screenplay");
  assert.equal(p.acts.length, 1);
  assert.equal(p.script_scenes.length, 1);
  assert.equal(p.script_scenes[0].act_id, p.acts[0].id);
  assert.deepEqual([p.chapters.length, p.scenes.length, p.issues.length, p.pages.length], [0, 0, 0, 0]);
  const r = migrateProject(clone(p));
  assert.equal(r.migratedFrom, null);
  assert.deepEqual(r.project, p);
  assert.equal(r.project.schema_version, CURRENT_SCHEMA_VERSION);
  assert.equal(blankProjectFor("screenplay", newId).story_format, "screenplay");
  assert.equal(blankProjectFor("comic", newId).story_format, "comic");
});

test("a novel and a comic have no screenplay content; a v9 file upgrades to v10 as it was", () => {
  const novel = blankProject(newId);
  assert.deepEqual([novel.acts, novel.script_scenes], [[], []]);
  const old = clone(novel) as Record<string, unknown>;
  old.schema_version = 9;
  delete old.acts;
  delete old.script_scenes;
  const r = migrateProject(old);
  assert.equal(r.migratedFrom, 9);
  assert.deepEqual([r.project.acts, r.project.script_scenes], [[], []]);
  assert.equal(r.project.story_format, "novel");
});

test("a screenplay survives migrate unchanged, and a damaged one is repaired, never dropped", () => {
  const p = sample();
  assert.deepEqual(migrateProject(clone(p)).project, p);
  const bad = clone(p) as any;
  delete bad.acts; // scenes with no act: an act is made for them
  bad.script_scenes[1].act_id = "nope";
  bad.script_scenes[0].elements[1].id = bad.script_scenes[0].elements[0].id; // duplicate ids
  bad.script_scenes[0].elements.push({ kind: "dance", text: 5 }); // unknown kind, wrong text type
  bad.script_scenes[2].int_ext = "OUTSIDE";
  bad.script_scenes[2].order = 99;
  const r = migrateProject(bad).project;
  assert.equal(r.acts.length, 1);
  assert.equal(r.script_scenes.length, 4);
  assert.ok(r.script_scenes.every((s) => s.act_id === r.acts[0].id));
  const els = r.script_scenes[0].elements;
  assert.equal(new Set(els.map((e) => e.id)).size, els.length);
  assert.equal(els[2].kind, "action");
  assert.equal(els[2].text, "");
  assert.equal(r.script_scenes[2].int_ext, "");
  // all four land in the one new act; the stray order 99 goes last, the tie keeps file order
  assert.deepEqual(r.script_scenes.map((s) => s.order), [0, 2, 3, 1]);
});

test("cleaning: only dialogue keeps a speaker, extension and parenthetical (brackets are not stored)", () => {
  const acts = cleanActs([{ id: "a" }]);
  const [s] = cleanScriptScenes(
    [{ id: "s", act_id: "a", elements: [
      { id: "e1", kind: "action", speaker_id: "x", extension: "V.O.", parenthetical: "(beat)", text: "t" },
      { id: "e2", kind: "dialogue", speaker_id: "x", extension: " V.O. ", parenthetical: "(beat)", text: "t" },
    ] }],
    acts
  );
  assert.deepEqual([s.elements[0].speaker_id, s.elements[0].extension, s.elements[0].parenthetical], ["", "", ""]);
  assert.deepEqual([s.elements[1].speaker_id, s.elements[1].extension, s.elements[1].parenthetical], ["x", "V.O.", "beat"]);
  assert.equal(s.status, "draft"); // it has words
  assert.deepEqual(cleanScriptScenes([{ id: "s" }], []), []); // no act to live in
});

test("reading order and scene numbers run act by act", () => {
  const p = sample();
  assert.equal(scenesInAct(p.script_scenes, p.acts[0].id).length, 3);
  const order = screenplayReadingOrder(p);
  assert.equal(order.length, 4);
  assert.equal(order[3].act_id, p.acts[1].id);
  assert.equal(sceneNumbers(p).get(order[3].id), 4);
});

test("slug lines are built in capitals from their parts and read back from typed text", () => {
  assert.equal(slugLine({ int_ext: "INT", location: "Maria's car", time: "night" }), "INT. MARIA'S CAR - NIGHT");
  assert.equal(slugLine({ int_ext: "INT/EXT", location: "hall", time: "" }), "INT./EXT. HALL");
  assert.equal(slugLine({ int_ext: "", location: "", time: "" }), "");
  assert.equal(slugLine({ int_ext: "EXT", location: "", time: "DAWN" }), "EXT. - DAWN");
  assert.deepEqual(parseSlug("int. kitchen - day"), { int_ext: "INT", location: "KITCHEN", time: "DAY" });
  assert.deepEqual(parseSlug("EXT./INT. HALL"), { int_ext: "INT/EXT", location: "HALL", time: "" });
  assert.deepEqual(parseSlug("I/E BAR - MOMENTS LATER"), { int_ext: "INT/EXT", location: "BAR", time: "MOMENTS LATER" });
  assert.deepEqual(parseSlug("The old mill - night"), { int_ext: "", location: "THE OLD MILL", time: "NIGHT" });
  // only the LAST " - " separates the time, so a location may contain a dash
  assert.deepEqual(parseSlug("INT. CAFE - BACK ROOM - NIGHT"), { int_ext: "INT", location: "CAFE - BACK ROOM", time: "NIGHT" });
  assert.deepEqual(parseSlug("INTERIOR HALL"), { int_ext: "", location: "INTERIOR HALL", time: "" }); // not a marker
  assert.deepEqual(parseSlug(""), { int_ext: "", location: "", time: "" });
  const s = parseSlug("EXT. BRIDGE - DAY");
  assert.equal(slugLine(s), "EXT. BRIDGE - DAY");
});

const el = (kind: ScriptElement["kind"], speaker = ""): ScriptElement => ({ ...newElement(newId, kind, speaker), text: "x" });

test("CONT'D: same speaker again with only action between; not after someone else, a transition or the first line", () => {
  const els = [el("dialogue", "a"), el("action"), el("dialogue", "a"), el("dialogue", "b"), el("dialogue", "a"), el("note"), el("dialogue", "a"), el("transition"), el("dialogue", "a")];
  assert.deepEqual(els.map((_, i) => needsContd(els, i)), [false, false, true, false, false, false, true, false, false]);
  assert.equal(needsContd(els, 99), false);
  assert.equal(needsContd([{ ...el("dialogue"), speaker_id: "" }], 0), false);
});

test("word count: action, dialogue and transitions; not notes or the slug", () => {
  const p = sample();
  assert.equal(sceneWordCount(p.script_scenes[0]), 6 + 2);
  const withNote = { elements: [...p.script_scenes[0].elements, { ...el("note"), text: "remember to fix this later" }] };
  assert.equal(sceneWordCount(withNote), 8);
});

test("page estimate: lines, eighths of a page, and a rule-of-thumb running time", () => {
  const empty = newScriptScene(newId, "a", 0);
  assert.equal(sceneLines(empty), 0);
  const s = sample().script_scenes[0];
  // slug(2) + action 1 line + blank + dialogue (name + parenthetical + 1 line + blank)
  assert.equal(sceneLines(s), 2 + (1 + 1) + (1 + 1 + 1 + 1));
  const long = { ...empty, elements: [{ ...el("action"), text: "word ".repeat(100).trim() }] };
  assert.ok(sceneLines(long) > 8); // wraps at about 60 characters
  assert.equal(sceneLines({ ...empty, elements: [{ ...el("note"), text: "private" }] }), 0); // notes take no page
  assert.equal(pagesFromLines(0), 0);
  assert.equal(pagesFromLines(LINES_PER_PAGE), 1);
  assert.equal(pagesFromLines(LINES_PER_PAGE + 1), 1.125);
  assert.deepEqual([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 1, 1.125, 2.5].map(formatPages), ["0", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "1", "1 1/8", "2 1/2"]);
  assert.equal(formatPages(scenePages(s)), "1/4");
  const p = sample();
  const len = screenplayLength(p);
  assert.equal(len.lines, p.script_scenes.reduce((a, sc) => a + sceneLines(sc), 0));
  assert.equal(len.minutes, Math.round(len.pages));
});

test("screenplay lists go through patches like any other list", () => {
  assert.ok((LIST_FIELDS as readonly string[]).includes("acts"));
  assert.ok((LIST_FIELDS as readonly string[]).includes("script_scenes"));
  const a = sample();
  const b = clone(a);
  b.script_scenes[0].elements[0].text = "Changed.";
  b.script_scenes.push(newScriptScene(newId, b.acts[1].id, 1));
  b.acts[1].title = "Second act";
  const d = diffProject(a, b);
  assert.equal(d.kind, "patch");
  if (d.kind === "patch") {
    assert.deepEqual(Object.keys(d.patch.lists ?? {}).sort(), ["acts", "script_scenes"]);
    assert.deepEqual(applyPatch(a, d.patch), b);
  }
});
