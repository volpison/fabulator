import { test } from "node:test";
import assert from "node:assert/strict";
import { toFolder, fromFolder, splitHeader, slug, PROJECT_FILE, type FolderFile } from "../src/lib/folder.ts";
import { migrateProject } from "../src/lib/migrate.ts";
import { htmlToMd } from "../src/lib/mdbody.ts";

const mkProject = () =>
  migrateProject({
    schema_version: 4, id: "proj-1", title: "A Fábula: “Test”", premise: "p", genre: "g", theme: "t",
    chapters: [
      { id: "ch-a", title: "The Start", summary: "Opening.\nTwo lines." },
      { id: "ch-b", title: "Ünïcode & Co: #2", summary: "" },
    ],
    plotlines: [{ id: "pl-main", name: "Main", color: "#123456" }, { id: "pl-b", name: "B-plot", color: "#654321" }],
    characters: [{ id: "c1", name: "Ana", aliases: ["A."], description: "d", role: "", category: "", traits: [] }],
    places: [{ id: "p1", name: "Farm", aliases: [], description: "", location: "" }],
    notes: [{ id: "n1", title: "Core theme", content: "Line one\n\n---\nline three: with colon", tags: ["Theme", "x y"] }],
    scenes: [
      { id: "s1", title: "Opening", summary: "Sum: with colon", content: "<p>Hello <strong>world</strong>.</p><ul><li><p>a</p></li></ul>", chapter_id: "ch-a", order: 0, plotline_id: "pl-main", character_ids: ["c1"], place_ids: ["p1"], tags: ["Act I", "Setup"], status: "revised", color: "blue" },
      { id: "s2", title: "Second", summary: "", content: "", chapter_id: "ch-a", order: 1, plotline_id: "pl-b", character_ids: [], place_ids: [], tags: [], status: "idea", color: "" },
      { id: "s3", title: "Same title", summary: "", content: "<p>x</p>", chapter_id: "ch-b", order: 0, plotline_id: "pl-main", character_ids: [], place_ids: [], tags: [], status: "draft", color: "" },
      { id: "s4", title: "Same title", summary: "", content: "<p>y</p>", chapter_id: "ch-b", order: 1, plotline_id: "pl-main", character_ids: [], place_ids: [], tags: [], status: "final", color: "red" },
    ],
  }).project;

let counter = 0;
const newId = (prefix: string) => `${prefix}-new${++counter}`;
const ok = (r: ReturnType<typeof fromFolder>) => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r as Extract<typeof r, { ok: true }>;
};

test("layout: names carry the order, chapters are folders", () => {
  const paths = toFolder(mkProject()).map((f) => f.path);
  assert.deepEqual(paths, [
    "project.json",
    "manuscript/01-the-start/_chapter.md",
    "manuscript/01-the-start/01-opening.md",
    "manuscript/01-the-start/02-second.md",
    "manuscript/02-unicode-co-2/_chapter.md",
    "manuscript/02-unicode-co-2/01-same-title.md",
    "manuscript/02-unicode-co-2/02-same-title.md",
    "notes/01-core-theme.md",
  ]);
  assert.equal(slug("¡Ñandú!"), "nandu");
  assert.equal(slug("???"), "untitled");
});

test("a scene file reads like a document", () => {
  const f = toFolder(mkProject()).find((x) => x.path.endsWith("01-opening.md"))!;
  assert.equal(
    f.text,
    `---
id: s1
title: Opening
summary: "Sum: with colon"
plotline: pl-main
status: revised
color: blue
characters: ["c1"]
places: ["p1"]
tags: ["Act I", "Setup"]
---

Hello **world**.

- a
`
  );
});

test("round trip: export -> import gives the same story", () => {
  const original = mkProject();
  const r = ok(fromFolder(toFolder(original), newId));
  assert.deepEqual(r.warnings, []);
  const back = r.project;
  assert.equal(back.title, original.title);
  assert.equal(back.id, original.id);
  assert.deepEqual(back.chapters, original.chapters.map((c) => ({ ...c, summary: c.summary })));
  assert.deepEqual(back.plotlines, original.plotlines);
  assert.deepEqual(back.characters, original.characters);
  assert.deepEqual(back.places, original.places);
  assert.deepEqual(back.notes, original.notes);
  assert.equal(back.snapshots.length, 0);
  assert.equal(back.scenes.length, 4);
  for (const s of original.scenes) {
    const t = back.scenes.find((x) => x.id === s.id)!;
    const { content: c1, ...rest1 } = s;
    const { content: c2, ...rest2 } = t;
    assert.deepEqual(rest2, rest1);
    assert.equal(htmlToMd(c2), htmlToMd(c1));
  }
});

test("exporting twice gives identical files (stable for git)", () => {
  const p = mkProject();
  const first = toFolder(p);
  const second = toFolder(fromFolder(first, newId).project as never);
  assert.deepEqual(second, first);
});

test("renaming a file prefix reorders the story", () => {
  const files = toFolder(mkProject()).map((f) =>
    f.path.endsWith("01-opening.md") ? { ...f, path: f.path.replace("01-opening", "03-opening") }
    : f.path.endsWith("02-second.md") ? { ...f, path: f.path.replace("02-second", "00-second") } : f);
  const r = ok(fromFolder(files, newId)).project;
  const ids = r.scenes.filter((s) => s.chapter_id === "ch-a").sort((a, b) => a.order - b.order).map((s) => s.id);
  assert.deepEqual(ids, ["s2", "s1"]);
});

test("hand-made files: missing header, names for ids, unknown things warn", () => {
  const files: FolderFile[] = [
    { path: PROJECT_FILE, text: JSON.stringify({ format: "fabulator-folder", version: 1, title: "Hand", plotlines: [{ id: "pl1", name: "Main", color: "#000" }], characters: [{ id: "c1", name: "Ana", aliases: ["A."] }], places: [] }) },
    { path: "manuscript/10-the-long-night/01-first-light.md", text: "Just text, no header.\n" },
    { path: "manuscript/10-the-long-night/02-with-header.md", text: "---\ntitle: Named\nplotline: nope\ncharacters: [ana, Zed]\nstatus: final\n---\nBody *here*\n" },
    { path: "manuscript/9-short/01-x.md", text: "---\ntags:\n  - one\n  - two\n---\nx" },
    { path: "manuscript/stray.md", text: "ignored" },
    { path: "notes/readme.md", text: "A note without a header." },
  ];
  const r = ok(fromFolder(files, newId));
  assert.deepEqual(r.project.chapters.map((c) => c.title), ["Short", "The long night"]); // natural sort: 9 before 10
  const first = r.project.scenes.find((s) => s.title === "First light")!;
  assert.equal(first.status, "draft");
  assert.equal(first.plotline_id, "pl1");
  assert.equal(first.content, "<p>Just text, no header.</p>");
  const named = r.project.scenes.find((s) => s.title === "Named")!;
  assert.deepEqual(named.character_ids, ["c1"]);
  assert.equal(named.status, "final");
  assert.equal(named.content, "<p>Body <em>here</em></p>");
  assert.deepEqual(r.project.scenes.find((s) => s.title === "X")!.tags, ["one", "two"]);
  assert.equal(r.project.notes[0].title, "Readme");
  assert.equal(r.warnings.filter((w) => /unknown plotline/.test(w)).length, 1);
  assert.equal(r.warnings.filter((w) => /unknown character “Zed”/.test(w)).length, 1);
  assert.equal(r.warnings.filter((w) => /stray\.md/.test(w)).length, 1);
});

test("duplicate ids get fresh ones with a warning", () => {
  const files = toFolder(mkProject());
  const dup = files.map((f) => (f.path.endsWith("02-second.md") ? { ...f, text: f.text.replace("id: s2", "id: s1") } : f));
  const r = ok(fromFolder(dup, newId));
  assert.equal(new Set(r.project.scenes.map((s) => s.id)).size, 4);
  assert.match(r.warnings.join("\n"), /share the id “s1”/);
});

test("errors: no project.json, wrong format, newer version, broken JSON", () => {
  const bad = (files: FolderFile[]) => { const r = fromFolder(files, newId); assert.equal(r.ok, false); return (r as { error: string }).error; };
  assert.match(bad([]), /no project\.json/);
  assert.match(bad([{ path: PROJECT_FILE, text: "{}" }]), /not a Fabulator folder/);
  assert.match(bad([{ path: PROJECT_FILE, text: JSON.stringify({ format: "fabulator-folder", version: 99 }) }]), /newer version/);
  assert.match(bad([{ path: PROJECT_FILE, text: "{ nope" }]), /not valid JSON/);
});

test("header parsing: quotes, CRLF, missing close", () => {
  assert.deepEqual(splitHeader('---\r\ntitle: "A: b"\r\ntags: [a, "b c"]\r\n---\r\nbody').header, { title: "A: b", tags: ["a", "b c"] });
  assert.equal(splitHeader("---\ntitle: x\nno close").body, "---\ntitle: x\nno close");
  assert.equal(splitHeader("no header").body, "no header");
  assert.equal(splitHeader("---\ntitle: x\n---").body, "");
});

test("a folder with no chapters or notes imports as an empty story", () => {
  const r = ok(fromFolder([{ path: PROJECT_FILE, text: JSON.stringify({ format: "fabulator-folder", version: 1, title: "E" }) }], newId));
  assert.equal(r.project.scenes.length, 0);
  assert.equal(r.project.plotlines.length, 1);
});
