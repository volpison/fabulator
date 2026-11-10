import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { appearanceReport, castGrid, clearAppearanceCache, sceneContinuity } from "../src/lib/appearances.ts";
import type { Project } from "../src/lib/types.ts";

beforeEach(() => clearAppearanceCache());

type S = { id: string; ch: string; order: number; text: string; chars?: string[]; places?: string[] };
function project(scenes: S[], extra: Partial<Project> = {}): Project {
  return {
    schema_version: 2, id: "p", title: "T", premise: "", genre: "", theme: "",
    chapters: [
      { id: "c1", title: "One", summary: "" },
      { id: "c2", title: "Two", summary: "" },
    ],
    scenes: scenes.map((s) => ({
      id: s.id, title: s.id, summary: "", content: `<p>${s.text}</p>`,
      chapter_id: s.ch, order: s.order, plotline_id: "pl",
      character_ids: s.chars ?? [], place_ids: s.places ?? [], tags: [],
    })),
    characters: [{ id: "ana", name: "Ana", aliases: ["Aninha"], description: "", role: "", category: "", traits: [], notes: "" }],
    places: [{ id: "mill", name: "The Mill", aliases: ["mill"], description: "", location: "", notes: "" }],
    notes: [], plotlines: [{ id: "pl", name: "Main", color: "#000" }],
    ...extra,
  } as Project;
}

test("appearance = linked and/or named; first/last follow reading order, not array order", () => {
  const p = project([
    { id: "late", ch: "c2", order: 0, text: "Ana returns." },
    { id: "early", ch: "c1", order: 0, text: "Aninha arrives.", chars: ["ana"] },
    { id: "none", ch: "c1", order: 1, text: "Nothing here." },
  ]);
  const r = appearanceReport(p, "character", "ana")!;
  assert.deepEqual(r.appearances.map((a) => a.scene.id), ["early", "late"]);
  assert.equal(r.first!.scene.id, "early");
  assert.equal(r.last!.scene.id, "late");
  assert.equal(r.totalScenes, 3);
  assert.equal(r.first!.chapterTitle, "One");
  assert.equal(r.first!.chapterNumber, 1);
  assert.equal(r.first!.position, 1);
});

test("flags linked-but-never-named and named-but-not-linked scenes", () => {
  const p = project([
    { id: "a", ch: "c1", order: 0, text: "Ana laughed.", chars: ["ana"] },
    { id: "b", ch: "c1", order: 1, text: "Ana's coat hung there." },
    { id: "c", ch: "c1", order: 2, text: "A quiet room.", chars: ["ana"] },
  ]);
  const r = appearanceReport(p, "character", "ana")!;
  assert.deepEqual(r.linkedNotNamed.map((a) => a.scene.id), ["c"]);
  assert.deepEqual(r.namedNotLinked.map((a) => a.scene.id), ["b"]);
});

test("longest gap and scenes-since-last", () => {
  const p = project([
    { id: "a", ch: "c1", order: 0, text: "Ana.", chars: ["ana"] },
    { id: "b", ch: "c1", order: 1, text: "Silence." },
    { id: "c", ch: "c1", order: 2, text: "More silence." },
    { id: "d", ch: "c2", order: 0, text: "Ana again.", chars: ["ana"] },
    { id: "e", ch: "c2", order: 1, text: "End." },
    { id: "f", ch: "c2", order: 2, text: "Really the end." },
  ]);
  const r = appearanceReport(p, "character", "ana")!;
  assert.deepEqual(r.longestGap, { length: 2, afterPosition: 1 });
  assert.equal(r.scenesSinceLast, 2);
});

test("an entity that never appears: empty report, not an error", () => {
  const r = appearanceReport(project([{ id: "a", ch: "c1", order: 0, text: "nothing" }]), "character", "ana")!;
  assert.equal(r.appearances.length, 0);
  assert.equal(r.first, null);
  assert.equal(r.last, null);
  assert.equal(r.scenesSinceLast, 1);
});

test("unknown id gives null; places work like characters (alias 'mill')", () => {
  const p = project([{ id: "a", ch: "c1", order: 0, text: "They reached the mill." }]);
  assert.equal(appearanceReport(p, "character", "ghost"), null);
  const r = appearanceReport(p, "place", "mill")!;
  assert.equal(r.appearances.length, 1);
  assert.equal(r.appearances[0].mentions, 1);
});

test("mention counts are per scene", () => {
  const p = project([{ id: "a", ch: "c1", order: 0, text: "Ana, Aninha and Ana again." }]);
  assert.equal(appearanceReport(p, "character", "ana")!.appearances[0].mentions, 3);
});

test("editing a scene's text is picked up (cache invalidates), other scenes unaffected", () => {
  const before = project([
    { id: "a", ch: "c1", order: 0, text: "Nobody." },
    { id: "b", ch: "c1", order: 1, text: "Ana." },
  ]);
  assert.deepEqual(appearanceReport(before, "character", "ana")!.appearances.map((x) => x.scene.id), ["b"]);
  const after = project([
    { id: "a", ch: "c1", order: 0, text: "Now Ana is here." },
    { id: "b", ch: "c1", order: 1, text: "Ana." },
  ]);
  assert.deepEqual(appearanceReport(after, "character", "ana")!.appearances.map((x) => x.scene.id), ["a", "b"]);
});

test("sceneContinuity: matched, linked-not-named, named-not-linked", () => {
  const p = project([
    {
      id: "s1",
      ch: "c1",
      order: 0,
      text: "Ana walked to the mill. Aninha smiled.",
      chars: ["ana"],
      places: [],
    },
  ]);
  p.characters.push({
    id: "bob",
    name: "Bob",
    aliases: [],
    description: "",
    role: "",
    category: "",
    traits: [],
    notes: "",
  });
  p.scenes[0].character_ids = ["ana", "bob"];
  const r = sceneContinuity(p, p.scenes[0]);
  assert.equal(r.matched.some((i) => i.id === "ana"), true);
  assert.deepEqual(
    r.linkedNotNamed.map((i) => i.id).sort(),
    ["bob"]
  );
  assert.deepEqual(
    r.namedNotLinked.map((i) => i.id).sort(),
    ["mill"]
  );
  assert.equal(r.issueCount, 2);
  assert.ok(r.matched.find((i) => i.id === "ana")!.mentions >= 2);
});

test("sceneContinuity: empty scene with no links is quiet", () => {
  const p = project([{ id: "s1", ch: "c1", order: 0, text: "Nothing to see." }]);
  const r = sceneContinuity(p, p.scenes[0]);
  assert.equal(r.issueCount, 0);
  assert.equal(r.matched.length, 0);
  assert.equal(r.linkedNotNamed.length, 0);
  assert.equal(r.namedNotLinked.length, 0);
});
