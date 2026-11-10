import { test } from "node:test";
import assert from "node:assert/strict";
import { blankProject } from "../src/lib/blank.ts";
import { migrateProject } from "../src/lib/migrate.ts";
import { toFolder, fromFolder } from "../src/lib/folder.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;

test("the blank story is valid and already current (nothing to migrate or repair)", () => {
  const p = blankProject(newId);
  const r = migrateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(r.migratedFrom, null);
  assert.deepEqual(r.project, p);
});

test("it has one chapter, one plotline and one empty scene to start writing in", () => {
  const p = blankProject(newId);
  assert.equal(p.chapters.length, 1);
  assert.equal(p.plotlines.length, 1);
  assert.equal(p.scenes.length, 1);
  assert.equal(p.scenes[0].chapter_id, p.chapters[0].id);
  assert.equal(p.scenes[0].plotline_id, p.plotlines[0].id);
  assert.equal(p.scenes[0].content, "");
  assert.equal(p.characters.length + p.places.length + p.notes.length, 0);
});

test("two blank stories never share ids; the folder export round-trips", () => {
  const a = blankProject(newId), b = blankProject(newId);
  assert.notEqual(a.id, b.id);
  const r = fromFolder(toFolder(a), newId);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.project.scenes.length, 1);
});
