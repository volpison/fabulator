import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sceneContinuity, clearAppearanceCache } from "../src/lib/appearances.ts";
import type { Project } from "../src/lib/types.ts";

beforeEach(() => clearAppearanceCache());

const ch = (id: string, name: string, ...aliases: string[]) =>
  ({ id, name, aliases, description: "", role: "", category: "", traits: [], notes: "" });
const place = (id: string, name: string, ...aliases: string[]) =>
  ({ id, name, aliases, description: "", location: "", notes: "" });
function proj(text: string, chars: string[] = [], places: string[] = []): Project {
  return {
    schema_version: 4, id: "p", title: "T", premise: "", genre: "", theme: "",
    chapters: [{ id: "c1", title: "One", summary: "" }],
    scenes: [{ id: "s1", title: "S", summary: "", content: `<p>${text}</p>`, chapter_id: "c1", order: 0,
      plotline_id: "pl", character_ids: chars, place_ids: places, tags: [], status: "draft", color: "" }],
    characters: [ch("ana", "Ana", "Aninha"), ch("bob", "Bob")],
    places: [place("mill", "The Mill", "mill")],
    notes: [], plotlines: [{ id: "pl", name: "Main", color: "#000" }],
    snapshots: [],
  } as unknown as Project;
}
const ids = (l: { id: string }[]) => l.map((i) => i.id).sort();

test("the three groups: matched, linked but never named, named but not linked", () => {
  const p = proj("Ana walked to the mill. Aninha smiled.", ["ana", "bob"]);
  const r = sceneContinuity(p, p.scenes[0]);
  assert.deepEqual(ids(r.matched), ["ana"]);
  assert.equal(r.matched[0].mentions, 2); // "Ana" and the alias "Aninha"
  assert.deepEqual(ids(r.linkedNotNamed), ["bob"]);
  assert.deepEqual(ids(r.namedNotLinked), ["mill"]);
});

test("characters and places are told apart", () => {
  const p = proj("The Mill was quiet.", [], ["mill"]);
  const r = sceneContinuity(p, p.scenes[0]);
  assert.deepEqual(r.matched.map((i) => [i.type, i.id]), [["place", "mill"]]);
});

test("a scene with no links and no names is quiet", () => {
  const p = proj("Nothing to see.");
  const r = sceneContinuity(p, p.scenes[0]);
  assert.deepEqual([r.matched, r.linkedNotNamed, r.namedNotLinked].map((l) => l.length), [0, 0, 0]);
});

test("it follows edits to the text and to the links (no stale cache)", () => {
  const p = proj("Ana here.", ["ana"]);
  assert.equal(sceneContinuity(p, p.scenes[0]).matched.length, 1);
  p.scenes[0].content = "<p>Silence.</p>";
  const r = sceneContinuity(p, p.scenes[0]);
  assert.deepEqual(ids(r.linkedNotNamed), ["ana"]);
  p.scenes[0].character_ids = [];
  assert.equal(sceneContinuity(p, p.scenes[0]).linkedNotNamed.length, 0);
});
