// Run with: npm test   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateProject, CURRENT_SCHEMA_VERSION } from "../src/lib/migrate.ts";
import {
  readingOrder,
  chapterNumber,
  compactOrders,
  moveChapterTo,
  moveSceneTo,
  sceneDropTarget,
  scenesInChapter,
} from "../src/lib/model.ts";

const v0 = (scenes: object[]) => ({
  id: "p",
  title: "Old story",
  premise: "",
  genre: "",
  theme: "",
  scenes,
  characters: [{ id: "c1", name: "Ana" }],
  places: [],
  notes: [],
  plotlines: [{ id: "pl-main", name: "Main", color: "#000" }],
});
const oldScene = (id: string, chapter: number, plotline_id = "pl-main") => ({
  id, title: id, summary: "", content: `<p>${id}</p>`,
  chapter, plotline_id, character_ids: ["c1"], place_ids: [], tags: ["t"],
});

test("v0 file is upgraded: chapters created, numbers preserved in titles", () => {
  const { project, migratedFrom } = migrateProject(
    v0([oldScene("a", 1), oldScene("b", 2), oldScene("c", 3)])
  );
  assert.equal(migratedFrom, 0);
  assert.equal(project.schema_version, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(project.chapters.map((c) => c.title), ["Chapter 1", "Chapter 2", "Chapter 3"]);
  assert.deepEqual(readingOrder(project).map((s) => s.id), ["a", "b", "c"]);
  assert.ok(project.scenes.every((s) => !("chapter" in s)));
});

test("v0 gaps in chapter numbers collapse but keep their titles", () => {
  const { project } = migrateProject(v0([oldScene("a", 1), oldScene("b", 5), oldScene("c", 2)]));
  assert.deepEqual(project.chapters.map((c) => c.title), ["Chapter 1", "Chapter 2", "Chapter 5"]);
  assert.deepEqual(readingOrder(project).map((s) => s.id), ["a", "c", "b"]);
});

test("v0 scenes sharing a chapter keep file order across plotlines", () => {
  const { project } = migrateProject(
    v0([oldScene("x", 1, "pl-a"), oldScene("y", 1, "pl-b"), oldScene("z", 1, "pl-a")])
  );
  assert.equal(project.chapters.length, 1);
  assert.deepEqual(readingOrder(project).map((s) => s.id), ["x", "y", "z"]);
  assert.deepEqual(project.scenes.map((s) => s.order), [0, 1, 2]);
});

test("all scene content and links survive migration untouched", () => {
  const { project } = migrateProject(v0([oldScene("a", 1)]));
  const s = project.scenes[0];
  assert.equal(s.content, "<p>a</p>");
  assert.deepEqual(s.character_ids, ["c1"]);
  assert.deepEqual(s.tags, ["t"]);
  assert.equal(project.characters.length, 1);
});

test("empty v0 project migrates to zero chapters", () => {
  const { project } = migrateProject(v0([]));
  assert.deepEqual(project.chapters, []);
  assert.deepEqual(project.scenes, []);
});

test("current-version file is not reported as migrated and is idempotent", () => {
  const first = migrateProject(v0([oldScene("a", 1), oldScene("b", 2)])).project;
  const again = migrateProject(JSON.parse(JSON.stringify(first)));
  assert.equal(again.migratedFrom, null);
  assert.deepEqual(again.project, first);
});

test("a newer file format is refused instead of being silently damaged", () => {
  assert.throws(
    () => migrateProject({ ...v0([]), schema_version: CURRENT_SCHEMA_VERSION + 1 }),
    /newer version of Fabulator/
  );
});

test("non-project JSON is rejected", () => {
  assert.throws(() => migrateProject(null), /not a Fabulator project/);
  assert.throws(() => migrateProject([1, 2]), /not a Fabulator project/);
  assert.throws(() => migrateProject("hi"), /not a Fabulator project/);
});

test("scene pointing at a missing chapter is repaired, not lost", () => {
  const { project } = migrateProject({
    ...v0([]),
    schema_version: 1,
    chapters: [{ id: "ch-1", title: "One", summary: "" }],
    scenes: [{ ...oldScene("a", 1), chapter: undefined, chapter_id: "ghost", order: 0 }],
  });
  assert.equal(project.scenes.length, 1);
  assert.equal(project.scenes[0].chapter_id, "ch-1");
});

test("duplicate / gapped order values are compacted per chapter", () => {
  const { project } = migrateProject({
    ...v0([]),
    schema_version: 1,
    chapters: [{ id: "ch-1", title: "One", summary: "" }],
    scenes: [
      { ...oldScene("a", 1), chapter_id: "ch-1", order: 7 },
      { ...oldScene("b", 1), chapter_id: "ch-1", order: 7 },
      { ...oldScene("c", 1), chapter_id: "ch-1", order: 2 },
    ],
  });
  assert.deepEqual(readingOrder(project).map((s) => s.id), ["c", "a", "b"]);
  assert.deepEqual(readingOrder(project).map((s) => s.order), [0, 1, 2]);
});

test("model helpers: chapterNumber, compactOrders", () => {
  const { project } = migrateProject(v0([oldScene("a", 1), oldScene("b", 2)]));
  assert.equal(chapterNumber(project, project.scenes[1]), 2);
  assert.equal(chapterNumber(project, { chapter_id: "nope" }), 0);

  const gapped = project.scenes.map((s) => ({ ...s, order: s.order * 10 + 5 }));
  assert.deepEqual(compactOrders(gapped).map((s) => s.order), [0, 0]);

});

// ── moving things ────────────────────────────────────────────────

const sc = (id: string, chapter_id: string, order: number, plotline_id: string) => ({
  id, title: id, summary: "", content: "", chapter_id, order, plotline_id,
  character_ids: [], place_ids: [], tags: [],
});
const ids = (scenes: ReturnType<typeof sc>[], chapterId: string) =>
  scenesInChapter(scenes, chapterId).map((s) => s.id);

test("moveChapterTo reorders, clamps, and ignores unknown ids", () => {
  const ch = ["a", "b", "c", "d"].map((id) => ({ id, title: id, summary: "" }));
  assert.deepEqual(moveChapterTo(ch, "a", 2).map((c) => c.id), ["b", "c", "a", "d"]);
  assert.deepEqual(moveChapterTo(ch, "d", 0).map((c) => c.id), ["d", "a", "b", "c"]);
  assert.deepEqual(moveChapterTo(ch, "b", 99).map((c) => c.id), ["a", "c", "d", "b"]);
  assert.deepEqual(moveChapterTo(ch, "b", -5).map((c) => c.id), ["b", "a", "c", "d"]);
  assert.equal(moveChapterTo(ch, "b", 1), ch);
  assert.equal(moveChapterTo(ch, "zzz", 0), ch);
});

test("moveSceneTo: reorder inside a cell with beforeSceneId", () => {
  const s = [sc("a", "c1", 0, "p1"), sc("b", "c1", 1, "p1"), sc("c", "c1", 2, "p1")];
  assert.deepEqual(ids(moveSceneTo(s, "c", { chapterId: "c1", plotlineId: "p1", beforeSceneId: "a" }), "c1"), ["c", "a", "b"]);
  assert.deepEqual(ids(moveSceneTo(s, "a", { chapterId: "c1", plotlineId: "p1", beforeSceneId: "c" }), "c1"), ["b", "a", "c"]);
});

test("moveSceneTo: no beforeSceneId = end of that plotline's cell", () => {
  const s = [
    sc("a", "c1", 0, "p1"), sc("x", "c1", 1, "p2"), sc("b", "c1", 2, "p1"), sc("y", "c1", 3, "p2"),
  ];
  const out = moveSceneTo(s, "a", { chapterId: "c1", plotlineId: "p2" });
  assert.deepEqual(ids(out, "c1"), ["x", "b", "y", "a"]);
  assert.equal(out.find((x) => x.id === "a")!.plotline_id, "p2");
});

test("moveSceneTo: empty cell goes to end of the chapter; empty chapter works too", () => {
  const s = [sc("a", "c1", 0, "p1"), sc("b", "c1", 1, "p1"), sc("z", "c2", 0, "p1")];
  assert.deepEqual(ids(moveSceneTo(s, "z", { chapterId: "c1", plotlineId: "p2" }), "c1"), ["a", "b", "z"]);
  const out = moveSceneTo(s, "a", { chapterId: "empty", plotlineId: "p1" });
  assert.deepEqual(ids(out, "empty"), ["a"]);
});

test("moveSceneTo: moving between chapters compacts the chapter it left", () => {
  const s = [sc("a", "c1", 0, "p1"), sc("b", "c1", 1, "p1"), sc("c", "c1", 2, "p1"), sc("z", "c2", 0, "p1")];
  const out = moveSceneTo(s, "b", { chapterId: "c2", plotlineId: "p1", beforeSceneId: "z" });
  assert.deepEqual(ids(out, "c1"), ["a", "c"]);
  assert.deepEqual(scenesInChapter(out, "c1").map((x) => x.order), [0, 1]);
  assert.deepEqual(ids(out, "c2"), ["b", "z"]);
  assert.deepEqual(scenesInChapter(out, "c2").map((x) => x.order), [0, 1]);
});

test("moveSceneTo: dropping on itself or an unknown scene changes nothing", () => {
  const s = [sc("a", "c1", 0, "p1"), sc("b", "c1", 1, "p1")];
  assert.equal(moveSceneTo(s, "a", { chapterId: "c1", plotlineId: "p1", beforeSceneId: "a" }), s);
  assert.equal(moveSceneTo(s, "nope", { chapterId: "c1", plotlineId: "p1" }), s);
});

test("moveSceneTo never loses or duplicates scenes and keeps their content", () => {
  const s = [sc("a", "c1", 0, "p1"), sc("b", "c1", 1, "p2"), sc("c", "c2", 0, "p1")];
  const out = moveSceneTo(s.map((x) => ({ ...x, content: `<p>${x.id}</p>` })), "a", {
    chapterId: "c2", plotlineId: "p2", beforeSceneId: "c",
  });
  assert.deepEqual(out.map((x) => x.id).sort(), ["a", "b", "c"]);
  assert.equal(out.find((x) => x.id === "a")!.content, "<p>a</p>");
});

test("v1 file (chapters, no aliases) upgrades to v2 with empty aliases and keeps data", () => {
  const v1 = {
    schema_version: 1, id: "p", title: "T", premise: "", genre: "", theme: "",
    chapters: [{ id: "ch-1", title: "One", summary: "" }],
    scenes: [{ ...oldScene("a", 1), chapter: undefined, chapter_id: "ch-1", order: 0 }],
    characters: [{ id: "c1", name: "Ana", role: "lead" }],
    places: [{ id: "pl1", name: "Mill", aliases: [" mill ", "", 7, "Old Mill"] }],
    notes: [], plotlines: [],
  };
  const { project, migratedFrom } = migrateProject(v1);
  assert.equal(migratedFrom, 1);
  assert.equal(project.schema_version, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(project.characters[0].aliases, []);
  assert.equal((project.characters[0] as { role?: string }).role, "lead"); // other fields kept
  assert.deepEqual(project.places[0].aliases, ["mill", "Old Mill"]); // cleaned
});

test("a v0 file goes all the way to the current version", () => {
  const { project, migratedFrom } = migrateProject(v0([oldScene("a", 1)]));
  assert.equal(migratedFrom, 0);
  assert.equal(project.schema_version, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(project.characters[0].aliases, []);
});

test("v2 file upgrades to v3 with an empty snapshot list and keeps everything", () => {
  const { project, migratedFrom } = migrateProject({
    schema_version: 2, id: "p", title: "T", premise: "", genre: "", theme: "",
    chapters: [{ id: "ch-1", title: "One", summary: "" }],
    scenes: [{ ...oldScene("a", 1), chapter: undefined, chapter_id: "ch-1", order: 0 }],
    characters: [{ id: "c1", name: "Ana", aliases: ["A"] }], places: [], notes: [], plotlines: [],
  });
  assert.equal(migratedFrom, 2);
  assert.equal(project.schema_version, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(project.snapshots, []);
  assert.deepEqual(project.characters[0].aliases, ["A"]);
});

test("snapshots are sanitised: bad entries dropped, small gaps repaired, ids unique", () => {
  const good = { id: "s1", scene_id: "a", kind: "auto", label: "L", created_at: 5, title: "T", summary: "", content: "<p>x</p>", chapter_id: "ch-1", plotline_id: "pl", character_ids: ["c1", 7], place_ids: [], tags: [] };
  const { project } = migrateProject({
    ...v0([]), schema_version: 2, chapters: [], scenes: [],
    snapshots: [
      good,
      { ...good },                                  // duplicate id
      { id: "", scene_id: "a" },                    // no id
      { id: "x", scene_id: "" },                    // no scene
      "junk", null,
      { id: "s2", scene_id: "a", kind: "weird", created_at: "nope" }, // repaired
    ],
  });
  assert.deepEqual(project.snapshots.map((s) => s.id), ["s1", "s2"]);
  assert.deepEqual(project.snapshots[0].character_ids, ["c1"]);
  assert.equal(project.snapshots[1].kind, "manual");
  assert.equal(project.snapshots[1].created_at, 0);
  assert.equal(project.snapshots[1].content, "");
});

test("current-version projects with snapshots round-trip unchanged", () => {
  const first = migrateProject({
    ...v0([oldScene("a", 1)]),
  }).project;
  first.snapshots.push({ id: "s1", scene_id: "a", kind: "manual", label: "x", created_at: 9, title: "t", summary: "", content: "<p>c</p>", chapter_id: "ch-1", plotline_id: "pl-main", character_ids: [], place_ids: [], tags: [] });
  const again = migrateProject(JSON.parse(JSON.stringify(first)));
  assert.equal(again.migratedFrom, null);
  assert.deepEqual(again.project, first);
});

test("atEnd puts a scene after every scene of the chapter, whatever its plotline", () => {
  const s = [sc("a", "c1", 0, "p1"), sc("b", "c1", 1, "p2"), sc("x", "c2", 0, "p1")];
  assert.deepEqual(ids(moveSceneTo(s, "x", { chapterId: "c1", plotlineId: "p1", atEnd: true }), "c1"), ["a", "b", "x"]);
});

test("sceneDropTarget: before/after, across chapters, and no-ops", () => {
  const s = [sc("a", "c1", 0, "p1"), sc("b", "c1", 1, "p1"), sc("c", "c1", 2, "p1"), sc("x", "c2", 0, "p2")];
  const p = { chapters: [{ id: "c1", title: "", summary: "" }, { id: "c2", title: "", summary: "" }], scenes: s };
  const run = (m: string, o: string, after: boolean) => {
    const t = sceneDropTarget(p, m, o, after);
    return t ? ids(moveSceneTo(s, m, t), t.chapterId) : null;
  };
  assert.deepEqual(run("c", "a", false), ["c", "a", "b"]);
  assert.deepEqual(run("a", "c", true), ["b", "c", "a"]);
  assert.deepEqual(run("a", "b", false), null);   // already just before b
  assert.deepEqual(run("b", "a", true), null);    // already just after a
  assert.equal(sceneDropTarget(p, "a", "a", true), null);
  assert.deepEqual(run("x", "b", true), ["a", "b", "x", "c"]);
  const t = sceneDropTarget(p, "a", "x", true);
  assert.deepEqual(t, { chapterId: "c2", plotlineId: "p1", atEnd: true });
});
