import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanStatus, cleanColor, defaultStatusFor, matchScene, isFilterActive,
  activeFilterCount, statusCounts, toggle, EMPTY_FILTER, colorHex,
} from "../src/lib/labels.ts";
import { migrateProject } from "../src/lib/migrate.ts";

const scene = (o: object = {}) => ({
  title: "The Wolf", summary: "A boy lies", tags: ["Act I"], status: "draft" as const,
  color: "", character_ids: ["c1"], plotline_id: "pl-main", ...o,
});

test("status and colour values are sanitised", () => {
  assert.equal(cleanStatus("final"), "final");
  assert.equal(cleanStatus("nope"), "draft");
  assert.equal(cleanStatus(undefined, "idea"), "idea");
  assert.equal(cleanColor("blue"), "blue");
  assert.equal(cleanColor("pink"), "");
  assert.equal(colorHex("red")?.startsWith("#"), true);
  assert.equal(colorHex(""), null);
});

test("old scenes get idea when empty and draft when they have text", () => {
  assert.equal(defaultStatusFor(""), "idea");
  assert.equal(defaultStatusFor("<p> </p>"), "idea");
  assert.equal(defaultStatusFor("<p>Hello</p>"), "draft");
});

test("v3 file upgrades to v4 with status from content and no colour", () => {
  const { project, migratedFrom } = migrateProject({
    schema_version: 3, id: "p", title: "T", premise: "", genre: "", theme: "",
    chapters: [{ id: "ch-1", title: "One", summary: "" }],
    scenes: [
      { id: "a", title: "A", summary: "", content: "<p>text</p>", chapter_id: "ch-1", order: 0, plotline_id: "", character_ids: [], place_ids: [], tags: [] },
      { id: "b", title: "B", summary: "", content: "", chapter_id: "ch-1", order: 1, plotline_id: "", character_ids: [], place_ids: [], tags: [], status: "final", color: "green" },
      { id: "c", title: "C", summary: "", content: "x", chapter_id: "ch-1", order: 2, plotline_id: "", character_ids: [], place_ids: [], tags: [], status: "bogus", color: "pink" },
    ],
    characters: [], places: [], notes: [], plotlines: [], snapshots: [],
  });
  assert.equal(migratedFrom, 3);
  assert.deepEqual(project.scenes.map((s) => [s.status, s.color]), [["draft", ""], ["final", "green"], ["draft", ""]]);
});

test("empty filter matches everything and is inactive", () => {
  assert.equal(isFilterActive(EMPTY_FILTER), false);
  assert.equal(matchScene(scene(), EMPTY_FILTER), true);
});

test("text matches title, summary and tags, case-insensitively", () => {
  assert.equal(matchScene(scene(), { ...EMPTY_FILTER, query: "wolf" }), true);
  assert.equal(matchScene(scene(), { ...EMPTY_FILTER, query: "LIES" }), true);
  assert.equal(matchScene(scene(), { ...EMPTY_FILTER, query: "act i" }), true);
  assert.equal(matchScene(scene(), { ...EMPTY_FILTER, query: "dragon" }), false);
});

test("values of one kind are OR, kinds are AND", () => {
  const f = { ...EMPTY_FILTER, statuses: ["draft", "final"] as const };
  assert.equal(matchScene(scene(), { ...EMPTY_FILTER, statuses: [...f.statuses] }), true);
  assert.equal(matchScene(scene({ status: "idea" }), { ...EMPTY_FILTER, statuses: [...f.statuses] }), false);
  assert.equal(matchScene(scene({ status: "idea" }), { ...EMPTY_FILTER, statuses: ["idea"], characterId: "c2" }), false);
  assert.equal(matchScene(scene(), { ...EMPTY_FILTER, statuses: ["draft"], characterId: "c1", plotlineId: "pl-main" }), true);
});

test('the colour filter can pick "none"', () => {
  assert.equal(matchScene(scene(), { ...EMPTY_FILTER, colors: ["none"] }), true);
  assert.equal(matchScene(scene({ color: "red" }), { ...EMPTY_FILTER, colors: ["none"] }), false);
  assert.equal(matchScene(scene({ color: "red" }), { ...EMPTY_FILTER, colors: ["red", "blue"] }), true);
});

test("counts and helpers", () => {
  assert.deepEqual(statusCounts([{ status: "idea" }, { status: "final" }, { status: "final" }]), { idea: 1, draft: 0, revised: 0, final: 2 });
  assert.equal(activeFilterCount({ ...EMPTY_FILTER, query: " x ", colors: ["red"] }), 2);
  assert.deepEqual(toggle(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggle(["a", "b"], "a"), ["b"]);
});
