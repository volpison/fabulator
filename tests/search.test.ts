import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseQuery, search, findTermRanges, termRangesInBlock, clearSearchCache } from "../src/lib/search.ts";
import type { Project } from "../src/lib/types.ts";

beforeEach(() => clearSearchCache());

function proj(over: Partial<Project> = {}): Project {
  return {
    schema_version: 2, id: "p", title: "T", premise: "", genre: "", theme: "",
    chapters: [
      { id: "c1", title: "The Setup", summary: "" },
      { id: "c2", title: "The Reckoning", summary: "wolf arrives" },
    ],
    scenes: [
      { id: "late", title: "Aftermath", summary: "", content: "<p>The wolf was gone.</p>", chapter_id: "c2", order: 0, plotline_id: "pl", character_ids: [], place_ids: [], tags: [] },
      { id: "early", title: "The Pasture", summary: "A quiet hillside", content: "<p>Sheep grazed. The Shep<strong>herd</strong> Boy yawned near the José's fence.</p>", chapter_id: "c1", order: 0, plotline_id: "pl", character_ids: [], place_ids: [], tags: ["calm"] },
      { id: "mid", title: "Wolf!", summary: "", content: "<p>Nothing but a cry.</p>", chapter_id: "c1", order: 1, plotline_id: "pl", character_ids: [], place_ids: [], tags: [] },
    ],
    characters: [{ id: "boy", name: "The Shepherd Boy", aliases: ["Pip"], description: "Bored lad", role: "Protagonist", category: "Main", traits: ["Clever"], notes: "Fears the wolf" }],
    places: [{ id: "past", name: "North Pasture", aliases: [], description: "A hillside", location: "Above the village", notes: "" }],
    notes: [{ id: "n1", title: "Theme", content: "Trust is currency. Wolf = consequence.", tags: ["Theme"] }],
    plotlines: [{ id: "pl", name: "Main", color: "#000" }],
    ...over,
  } as Project;
}

test("parseQuery: words, quoted phrases, dedupe, unbalanced quotes, empty", () => {
  assert.deepEqual(parseQuery('red  fox'), ["red", "fox"]);
  assert.deepEqual(parseQuery('"north pasture" wolf'), ["north pasture", "wolf"]);
  assert.deepEqual(parseQuery("Wolf wolf WOLF"), ["Wolf"]);
  assert.deepEqual(parseQuery('"wolf'), ["wolf"]);
  assert.deepEqual(parseQuery('  "" '), []);
  assert.deepEqual(parseQuery(""), []);
});

test("empty / whitespace query returns nothing", () => {
  assert.equal(search(proj(), "   ").hits.length, 0);
});

test("finds across kinds; scenes come in reading order; counts are per kind", () => {
  const r = search(proj(), "wolf");
  assert.deepEqual(r.hits.filter((h) => h.kind === "scene").map((h) => h.id), ["mid", "late"]); // title hit ranks first
  assert.deepEqual(r.hits.map((h) => h.kind), ["scene", "scene", "character", "note", "chapter"]);
  assert.deepEqual(r.counts, { scene: 2, character: 1, place: 0, note: 1, chapter: 1 });
});

test("case-, accent- and substring-insensitive", () => {
  assert.equal(search(proj(), "JOSE").hits[0].id, "early"); // José's fence
  assert.equal(search(proj(), "pastur").hits.length > 0, true);
});

test("a name split by formatting tags is still found in scene text", () => {
  const r = search(proj(), "shepherd boy");
  const scene = r.hits.find((h) => h.kind === "scene")!;
  assert.equal(scene.id, "early");
  assert.equal(scene.snippet.match.toLowerCase(), "shepherd");   // earliest term in text
});

test("every word must be present; they may be in different fields of the same item", () => {
  assert.equal(search(proj(), "wolf trust").hits.length, 1);       // only the note has both
  assert.equal(search(proj(), "wolf zebra").hits.length, 0);
  const r = search(proj(), "bored protagonist");                    // description + role of the same character
  assert.deepEqual(r.hits.map((h) => h.id), ["boy"]);
});

test("quoted phrase must match as a phrase", () => {
  assert.equal(search(proj(), '"north pasture"').hits.length, 1);
  assert.equal(search(proj(), '"pasture north"').hits.length, 0);
});

test("aliases are searchable and rank as name hits", () => {
  const r = search(proj(), "pip");
  assert.deepEqual(r.hits.map((h) => [h.kind, h.id, h.field]), [["character", "boy", "Aliases"]]);
});

test("snippet: original text, accents intact, ellipses, whitespace collapsed", () => {
  const long = "Início. " + "palavra ".repeat(30) + "José   atravessou\nthe rio. " + "fim ".repeat(40);
  const p = proj({ notes: [{ id: "n", title: "Long", content: long, tags: [] }] });
  const hit = search(p, "jose").hits.find((h) => h.kind === "note")!;
  assert.equal(hit.snippet.match, "José");
  assert.ok(hit.snippet.before.startsWith("…"));
  assert.ok(hit.snippet.after.endsWith("…"));
  assert.ok(!/\s{2,}/.test(hit.snippet.after) && !hit.snippet.after.includes("\n"));
  assert.ok(hit.snippet.after.startsWith(" atravessou the rio"));
});

test("title matches rank above body matches within a kind", () => {
  const r = search(proj(), "wolf");
  assert.equal(r.hits[0].id, "mid"); // scene titled "Wolf!" before the body mention in "late"
  assert.equal(r.hits[0].field, "Title");
});

test("per-kind cap limits hits but counts report the real total", () => {
  const scenes = Array.from({ length: 5 }, (_, i) => ({
    id: `s${i}`, title: `S${i}`, summary: "", content: "<p>wolf</p>", chapter_id: "c1", order: i,
    plotline_id: "pl", character_ids: [], place_ids: [], tags: [],
  }));
  const r = search(proj({ scenes } as Partial<Project>), "wolf", 2);
  assert.equal(r.hits.filter((h) => h.kind === "scene").length, 2);
  assert.equal(r.counts.scene, 5);
});

test("edited scene text is re-searched (cache invalidation)", () => {
  const p = proj();
  assert.equal(search(p, "zebra").hits.length, 0);
  const edited = { ...p, scenes: p.scenes.map((s) => (s.id === "mid" ? { ...s, content: "<p>A zebra!</p>" } : s)) };
  assert.deepEqual(search(edited, "zebra").hits.map((h) => h.id), ["mid"]);
});

test("findTermRanges: non-overlapping, phrase beats single word, accent-insensitive offsets", () => {
  const text = "Olá, José foi ao North Pasture. Jose voltou.";
  const ranges = findTermRanges(text, ["north pasture", "pasture", "jose"]);
  assert.deepEqual(ranges.map((r) => text.slice(r.start, r.end)), ["José", "North Pasture", "Jose"]);
});

test("termRangesInBlock: document positions across formatting runs", () => {
  const block = {
    forEach(cb: (c: { isText: boolean; text?: string }, o: number) => void) {
      cb({ isText: true, text: "The Shep" }, 0);
      cb({ isText: true, text: "herd Boy" }, 8);
    },
  };
  const r = termRangesInBlock(block, 10, ["shepherd"]);
  assert.deepEqual(r, [{ from: 15, to: 23 }]); // content starts at 11; "Shepherd" at index 4
});
