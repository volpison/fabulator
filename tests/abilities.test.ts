import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateProject } from "../src/lib/migrate.ts";
import { blankProject } from "../src/lib/blank.ts";
import { toFolder, fromFolder } from "../src/lib/folder.ts";
import { LIST_FIELDS } from "../src/lib/patch.ts";

const base = () => JSON.parse(JSON.stringify(blankProject((p) => `${p}-1`)));

test("a project from before abilities has an empty list", () => {
  const old = base();
  delete old.abilities;
  const { project } = migrateProject(old);
  assert.deepEqual(project.abilities, []);
});

test("abilities and a character's ability_ids are kept, and unknown ids are dropped", () => {
  const raw = base();
  raw.abilities = [
    { id: "ab-1", name: "Flight", description: "", notes: "" },
    { id: "ab-1", name: "Flight again", description: "", notes: "" },
    { name: "no id" },
  ];
  raw.characters = [
    { id: "c1", name: "A", description: "", role: "", category: "", traits: [], notes: "", ability_ids: ["ab-1", "ab-1", "gone", 7] },
    { id: "c2", name: "B", description: "", role: "", category: "", traits: [], notes: "", ability_ids: ["gone"] },
  ];
  const { project } = migrateProject(raw);
  assert.equal(project.abilities[0].name, "Flight");
  assert.deepEqual(project.abilities[0].aliases, []);
  assert.deepEqual(project.characters[0].ability_ids, ["ab-1"]);
  assert.equal("ability_ids" in project.characters[1], false);
  assert.equal(project.abilities.every((a) => a.id), true);
});

test("abilities are a patchable list", () => {
  assert.ok((LIST_FIELDS as readonly string[]).includes("abilities"));
});

test("abilities survive the Markdown folder round trip", () => {
  const p = migrateProject({
    ...base(),
    abilities: [{ id: "ab-1", name: "Flight", aliases: [], description: "Fly", notes: "" }],
    characters: [{ id: "c1", name: "A", aliases: [], description: "", role: "", category: "", traits: [], notes: "", ability_ids: ["ab-1"] }],
  }).project;
  const back = fromFolder(toFolder(p), (x) => `${x}-n`);
  assert.equal(back.ok, true);
  if (back.ok) {
    assert.equal(back.project.abilities[0].name, "Flight");
    assert.deepEqual(back.project.characters[0].ability_ids, ["ab-1"]);
  }
});
