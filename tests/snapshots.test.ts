import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_INTERVAL_MS, AUTO_KEEP_PER_SCENE, AUTO_KEEP_TOTAL,
  makeSnapshot, maybeAutoSnapshot, pruneAuto, snapshotsFor,
  restoreInto, recreateScene, deletedScenes, timeAgo, wordsOf, applyRestore,
} from "../src/lib/snapshots.ts";
import type { Project, Scene, Snapshot } from "../src/lib/types.ts";

const scene = (over: Partial<Scene> = {}): Scene => ({
  id: "s1", title: "Title", summary: "Syn", content: "<p>Original text here.</p>",
  chapter_id: "c1", order: 0, plotline_id: "pl", character_ids: ["a"], place_ids: ["p"], tags: ["t"], ...over,
});
let n = 0;
const nid = () => `snap-${++n}`;
const T0 = 1_000_000_000_000;

test("makeSnapshot copies everything and doesn't alias arrays", () => {
  const s = scene();
  const snap = makeSnapshot(s, "manual", "Before rewrite", T0, "x");
  assert.deepEqual([snap.scene_id, snap.kind, snap.label, snap.created_at], ["s1", "manual", "Before rewrite", T0]);
  assert.equal(snap.content, s.content);
  s.tags.push("later");
  assert.deepEqual(snap.tags, ["t"]);
});

test("auto snapshot: first edit of a scene with text saves the pre-edit state", () => {
  const out = maybeAutoSnapshot([], scene(), "<p>New</p>", T0, nid);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "auto");
  assert.equal(out[0].content, "<p>Original text here.</p>");
});

test("auto snapshot: skipped for blank scenes, unchanged text, and within the interval", () => {
  const empty = scene({ content: "<p></p>" });
  assert.deepEqual(maybeAutoSnapshot([], empty, "<p>x</p>", T0, nid), []);
  const same = maybeAutoSnapshot([], scene(), scene().content, T0, nid);
  assert.deepEqual(same, []);

  const first = maybeAutoSnapshot([], scene(), "<p>v2</p>", T0, nid);
  const soon = maybeAutoSnapshot(first, scene({ content: "<p>v2</p>" }), "<p>v3</p>", T0 + AUTO_INTERVAL_MS - 1, nid);
  assert.equal(soon, first); // same array = nothing to do
  const later = maybeAutoSnapshot(first, scene({ content: "<p>v2</p>" }), "<p>v3</p>", T0 + AUTO_INTERVAL_MS, nid);
  assert.equal(later.length, 2);
  assert.equal(later[1].content, "<p>v2</p>");
});

test("auto snapshot: not duplicated when that exact state is already the latest snapshot", () => {
  const manual = [makeSnapshot(scene(), "manual", "m", T0, "m1")];
  const out = maybeAutoSnapshot(manual, scene(), "<p>changed</p>", T0 + AUTO_INTERVAL_MS * 5, nid);
  assert.equal(out, manual);
});

test("pruning: per-scene limit drops the oldest autos only; manual and safety survive", () => {
  const list: Snapshot[] = [];
  for (let i = 0; i < AUTO_KEEP_PER_SCENE + 3; i++) list.push(makeSnapshot(scene({ content: `<p>${i}</p>` }), "auto", "a", T0 + i, `a${i}`));
  list.push(makeSnapshot(scene(), "manual", "mine", T0 - 5, "m"));
  list.push(makeSnapshot(scene(), "safety", "safe", T0 - 6, "sf"));
  const out = pruneAuto(list);
  const autos = out.filter((s) => s.kind === "auto");
  assert.equal(autos.length, AUTO_KEEP_PER_SCENE);
  assert.ok(autos.every((s) => s.created_at >= T0 + 3)); // the 3 oldest are gone
  assert.ok(out.some((s) => s.id === "m") && out.some((s) => s.id === "sf"));
});

test("pruning: global cap across scenes", () => {
  const list: Snapshot[] = [];
  for (let sc = 0; sc < 30; sc++) {
    for (let i = 0; i < 10; i++) list.push(makeSnapshot(scene({ id: `s${sc}` }), "auto", "a", T0 + sc * 100 + i, `a${sc}-${i}`));
  }
  assert.equal(list.length, 300);
  assert.equal(pruneAuto(list).length, AUTO_KEEP_TOTAL);
});

test("snapshotsFor: only that scene, newest first", () => {
  const list = [
    makeSnapshot(scene(), "auto", "1", T0, "1"),
    makeSnapshot(scene({ id: "other" }), "auto", "x", T0 + 5, "x"),
    makeSnapshot(scene(), "manual", "2", T0 + 10, "2"),
  ];
  assert.deepEqual(snapshotsFor(list, "s1").map((s) => s.id), ["2", "1"]);
});

test("restoreInto replaces title, synopsis and text only", () => {
  const snap = makeSnapshot(scene({ title: "Old", summary: "Old syn", content: "<p>old</p>" }), "manual", "", T0, "x");
  const current = scene({ title: "New", summary: "New syn", content: "<p>new</p>", chapter_id: "c9", tags: ["keep"] });
  const r = restoreInto(current, snap);
  assert.deepEqual([r.title, r.summary, r.content], ["Old", "Old syn", "<p>old</p>"]);
  assert.deepEqual([r.chapter_id, r.tags, r.id], ["c9", ["keep"], "s1"]);
});

const proj = (scenes: Scene[]) => ({
  chapters: [{ id: "c1", title: "One", summary: "" }, { id: "c2", title: "Two", summary: "" }],
  plotlines: [{ id: "pl", name: "Main", color: "#000" }],
  scenes,
  characters: [{ id: "a" }] as never[],
  places: [] as never[],
});

test("recreateScene: keeps id/chapter/plotline when possible, drops dead links, goes last in its chapter", () => {
  const snap = makeSnapshot(scene({ id: "gone", chapter_id: "c1" }), "safety", "Deleted scene", T0, "x");
  const r = recreateScene(proj([scene({ id: "other", order: 4 })]), snap, () => "fresh");
  assert.equal(r.id, "gone");
  assert.equal(r.chapter_id, "c1");
  assert.equal(r.order, 5);
  assert.deepEqual(r.character_ids, ["a"]);
  assert.deepEqual(r.place_ids, []); // place "p" no longer exists
});

test("recreateScene: falls back when chapter/plotline are gone or the id is taken", () => {
  const snap = makeSnapshot(scene({ id: "s1", chapter_id: "deleted-ch", plotline_id: "deleted-pl" }), "safety", "", T0, "x");
  const r = recreateScene(proj([scene({ id: "s1" })]), snap, () => "fresh");
  assert.equal(r.id, "fresh");
  assert.equal(r.chapter_id, "c1");
  assert.equal(r.plotline_id, "pl");
});

test("deletedScenes: scenes with snapshots but no scene, newest first, with version counts", () => {
  const snaps = [
    makeSnapshot(scene({ id: "gone1" }), "auto", "a", T0, "1"),
    makeSnapshot(scene({ id: "gone1" }), "safety", "Deleted scene", T0 + 50, "2"),
    makeSnapshot(scene({ id: "gone2" }), "safety", "Deleted scene", T0 + 100, "3"),
    makeSnapshot(scene({ id: "alive" }), "manual", "m", T0 + 200, "4"),
  ];
  const d = deletedScenes({ scenes: [scene({ id: "alive" })], snapshots: snaps });
  assert.deepEqual(d.map((x) => [x.sceneId, x.versions, x.snapshot.id]), [["gone2", 1, "3"], ["gone1", 2, "2"]]);
});

test("timeAgo and wordsOf", () => {
  assert.equal(timeAgo(T0 + 10_000, T0), "just now");
  assert.equal(timeAgo(T0 + 5 * 60_000, T0), "5 min ago");
  assert.equal(timeAgo(T0 + 3 * 3_600_000, T0), "3 h ago");
  assert.equal(timeAgo(T0 + 2 * 86_400_000, T0), "2 d ago");
  assert.equal(wordsOf("<p>Shep<strong>herd</strong> boy sat.</p>"), 3);
});

// ── applyRestore ──────────────────────────────────────────────

const fullProject = (scenes: Scene[], snapshots: Snapshot[], chapters = [{ id: "c1", title: "One", summary: "" }]): Project =>
  ({ ...proj(scenes), chapters, snapshots, notes: [], schema_version: 3 }) as unknown as Project;
let k = 0;
const ids = (p: string) => `${p}-new-${++k}`;

test("applyRestore on an existing scene: text replaced, current version saved as a safety snapshot first", () => {
  const old = makeSnapshot(scene({ content: "<p>old draft</p>", title: "Old title" }), "manual", "Draft 1", T0, "snapA");
  const p = fullProject([scene({ content: "<p>rewritten</p>" })], [old]);
  const r = applyRestore(p, "snapA", T0 + 99, ids);
  assert.equal(r.sceneId, "s1");
  assert.equal(r.project.scenes[0].content, "<p>old draft</p>");
  assert.equal(r.project.scenes[0].title, "Old title");
  assert.equal(r.project.snapshots.length, 2);
  const safety = r.project.snapshots[1];
  assert.deepEqual([safety.kind, safety.content, safety.created_at], ["safety", "<p>rewritten</p>", T0 + 99]);
  assert.ok(safety.label.includes("Draft 1"));
  assert.equal(p.scenes[0].content, "<p>rewritten</p>"); // input untouched
});

test("applyRestore is undoable: restoring the safety snapshot brings the rewrite back", () => {
  const old = makeSnapshot(scene({ content: "<p>old</p>" }), "manual", "", T0, "snapA");
  const p1 = fullProject([scene({ content: "<p>new</p>" })], [old]);
  const r1 = applyRestore(p1, "snapA", T0 + 1, ids);
  const safetyId = r1.project.snapshots.find((s) => s.kind === "safety")!.id;
  const r2 = applyRestore(r1.project, safetyId, T0 + 2, ids);
  assert.equal(r2.project.scenes[0].content, "<p>new</p>");
});

test("applyRestore of an identical version changes nothing (same object, no clutter)", () => {
  const snap = makeSnapshot(scene(), "manual", "", T0, "snapA");
  const p = fullProject([scene()], [snap]);
  const r = applyRestore(p, "snapA", T0 + 1, ids);
  assert.equal(r.project, p);
  assert.equal(r.sceneId, "s1");
});

test("applyRestore of a deleted scene recreates it; unknown snapshot does nothing", () => {
  const snap = makeSnapshot(scene({ id: "gone", content: "<p>lost words</p>" }), "safety", "Deleted scene", T0, "snapA");
  const p = fullProject([scene({ id: "other" })], [snap]);
  const r = applyRestore(p, "snapA", T0 + 1, ids);
  assert.equal(r.sceneId, "gone");
  assert.equal(r.project.scenes.length, 2);
  assert.equal(r.project.scenes.find((s) => s.id === "gone")!.content, "<p>lost words</p>");
  assert.equal(applyRestore(p, "nope", T0, ids).sceneId, null);
  assert.equal(applyRestore(p, "nope", T0, ids).project, p);
});

test("applyRestore into a project with no chapters creates one so the scene isn't orphaned", () => {
  const snap = makeSnapshot(scene({ id: "gone" }), "safety", "Deleted scene", T0, "snapA");
  const p = fullProject([], [snap], []);
  const r = applyRestore(p, "snapA", T0 + 1, ids);
  assert.equal(r.project.chapters.length, 1);
  assert.equal(r.project.scenes[0].chapter_id, r.project.chapters[0].id);
});
