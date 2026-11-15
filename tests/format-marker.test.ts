import { test } from "node:test";
import assert from "node:assert/strict";
import { CURRENT_SCHEMA_VERSION, FILE_TYPE, migrateProject } from "../src/lib/migrate.ts";
import { blankProject } from "../src/lib/blank.ts";

const blank = () => JSON.parse(JSON.stringify(blankProject((p) => `${p}-1`)));

test("a new project carries the marker and the minimum reader version", () => {
  const p = blankProject((x) => `${x}-1`);
  assert.equal(p.file_type, FILE_TYPE);
  assert.equal(p.min_reader_version, CURRENT_SCHEMA_VERSION);
});

test("an older file gets the marker when it is upgraded", () => {
  const old = blank();
  delete old.file_type;
  delete old.min_reader_version;
  old.schema_version = 11;
  const r = migrateProject(old);
  assert.equal(r.migratedFrom, 11);
  assert.equal(r.project.file_type, "fabulator-project");
  assert.equal(r.project.min_reader_version, 12);
  assert.equal(r.project.schema_version, CURRENT_SCHEMA_VERSION);
});

test("another kind of file is refused with a clear message", () => {
  const other = { ...blank(), file_type: "something-else" };
  assert.throws(() => migrateProject(other), /not a Fabulator project/);
});

test("a newer file with no minimum reader is refused, as before", () => {
  const newer = { ...blank(), schema_version: CURRENT_SCHEMA_VERSION + 1, min_reader_version: undefined };
  assert.throws(() => migrateProject(newer), /newer version of Fabulator/);
});

test("a newer file that says this reader is enough is opened, and keeps its version and unknown fields", () => {
  const newer = {
    ...blank(),
    schema_version: CURRENT_SCHEMA_VERSION + 1,
    min_reader_version: CURRENT_SCHEMA_VERSION,
    game: { quests: [{ id: "q-1" }] },
  };
  const r = migrateProject(newer);
  assert.equal(r.migratedFrom, null);
  assert.equal(r.project.schema_version, CURRENT_SCHEMA_VERSION + 1);
  assert.equal(r.project.min_reader_version, CURRENT_SCHEMA_VERSION);
  assert.deepEqual((r.project as unknown as { game: unknown }).game, { quests: [{ id: "q-1" }] });
});

test("a newer file that needs a newer reader is refused", () => {
  const newer = { ...blank(), schema_version: CURRENT_SCHEMA_VERSION + 2, min_reader_version: CURRENT_SCHEMA_VERSION + 1 };
  assert.throws(() => migrateProject(newer), /newer version of Fabulator/);
});
