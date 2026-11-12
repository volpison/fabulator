import { test } from "node:test";
import assert from "node:assert/strict";
import { blankProject } from "../src/lib/blank.ts";
import { migrateProject, CURRENT_SCHEMA_VERSION } from "../src/lib/migrate.ts";
import {
  STORY_FORMATS, STORY_FORMAT_IDS, DEFAULT_STORY_FORMAT, isStoryFormatId, formatOf, noun, readStoryFormat,
} from "../src/lib/formats.ts";
import { toFolder, fromFolder } from "../src/lib/folder.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

test("every known format is complete, and the default is one of them", () => {
  assert.ok(isStoryFormatId(DEFAULT_STORY_FORMAT));
  for (const id of STORY_FORMAT_IDS) {
    const f = STORY_FORMATS[id];
    assert.equal(f.id, id);
    assert.ok(f.label && f.description);
    for (const w of [f.vocabulary.group, f.vocabulary.unit]) assert.ok(w.one && w.many && w.one !== w.many);
  }
});

test("only known ids count as formats", () => {
  assert.ok(isStoryFormatId("novel"));
  for (const bad of ["comic", "Novel", "", null, undefined, 3, {}]) assert.ok(!isStoryFormatId(bad), String(bad));
});

test("a new story is a novel, with the novel's words", () => {
  const p = blankProject(newId);
  assert.equal(p.story_format, "novel");
  assert.equal(formatOf(p).label, "Novel");
  assert.equal(noun(p, "unit"), "scene");
  assert.equal(noun(p, "unit", 3), "scenes");
  assert.equal(noun(p, "group", 1, true), "Chapter");
  assert.equal(noun(p, "group", 0, true), "Chapters");
});

test("a file from before formats opens as a novel, and the upgrade is reported", () => {
  const old = clone(blankProject(newId)) as Record<string, unknown>;
  old.schema_version = 6;
  delete old.story_format;
  const r = migrateProject(old);
  assert.equal(r.migratedFrom, 6);
  assert.equal(r.project.story_format, "novel");
  assert.equal(r.project.schema_version, CURRENT_SCHEMA_VERSION);
  assert.equal(CURRENT_SCHEMA_VERSION, 7);
});

test("every older version reaches the current one as a novel", () => {
  for (let v = 1; v <= 6; v++) {
    const old = clone(blankProject(newId)) as Record<string, unknown>;
    old.schema_version = v;
    delete old.story_format;
    const r = migrateProject(old);
    assert.equal(r.project.story_format, "novel", `from v${v}`);
    assert.equal(r.migratedFrom, v);
  }
});

test("a current file keeps its format and is not reported as upgraded", () => {
  const r = migrateProject(clone(blankProject(newId)));
  assert.equal(r.migratedFrom, null);
  assert.equal(r.project.story_format, "novel");
});

test("a format this version does not know is refused with a clear message, never opened as a novel", () => {
  const raw = clone(blankProject(newId)) as Record<string, unknown>;
  raw.story_format = "comic";
  assert.throws(() => migrateProject(raw), /“comic” format.*Update Fabulator/);
  assert.throws(() => readStoryFormat("hologram"), /“hologram”/);
  assert.throws(() => readStoryFormat(42), /unknown format/);
  assert.equal(readStoryFormat(undefined), "novel");
  assert.equal(readStoryFormat(""), "novel");
});

test("the format survives the Markdown folder round trip; an unknown one is refused there too", () => {
  const p = blankProject(newId);
  const files = toFolder(p);
  const header = JSON.parse(files.find((f) => f.path === "project.json")!.text);
  assert.equal(header.story_format, "novel");
  assert.equal(header.format, "fabulator-folder"); // the folder's own tag is a different thing
  const back = fromFolder(files, newId);
  assert.ok(back.ok);
  if (back.ok) assert.equal(back.project.story_format, "novel");

  const edited = files.map((f) =>
    f.path === "project.json" ? { ...f, text: JSON.stringify({ ...header, story_format: "comic" }) } : f
  );
  const refused = fromFolder(edited, newId);
  assert.ok(!refused.ok);
  if (!refused.ok) assert.match(refused.error, /“comic” format/);

  const legacy = files.map((f) => {
    if (f.path !== "project.json") return f;
    const { story_format: _gone, ...rest } = header;
    return { ...f, text: JSON.stringify(rest) };
  });
  const old = fromFolder(legacy, newId);
  assert.ok(old.ok);
  if (old.ok) assert.equal(old.project.story_format, "novel");
});
