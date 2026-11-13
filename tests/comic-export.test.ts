import { test } from "node:test";
import assert from "node:assert/strict";
import { blankComic } from "../src/lib/blank.ts";
import { newPage, newPanel, newLine } from "../src/lib/comic.ts";
import { exportProject, exportPreview, DEFAULT_OPTIONS } from "../src/lib/export/index.ts";
import { buildComicBook } from "../src/lib/export/comic.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;

function sample(): Project {
  const p = blankComic(newId);
  p.title = "The Bridge";
  const i1 = p.issues[0].id;
  p.issues[0].title = "Falling";
  p.issues.push({ id: "is-2", title: "", summary: "" });
  p.characters = [
    { id: "ch-1", name: "Mara", aliases: [] },
    { id: "ch-2", name: "Old Tom", aliases: [] },
  ] as unknown as Project["characters"];
  p.places = [{ id: "pl-1", name: "The old bridge" }] as unknown as Project["places"];
  p.pages = [0, 1, 2].map((i) => newPage(newId, i1, i));
  p.pages.push(newPage(newId, "is-2", 0));
  const [a, b, c, d] = p.pages;
  a.plot = "The bridge collapses under the cart.";
  a.character_ids = ["ch-1", "ch-2"];
  a.place_ids = ["pl-1"];
  const pn = newPanel(newId);
  pn.description = "Wide shot of the bridge.\nDust everywhere.";
  const l1 = newLine(newId, "dialogue", "ch-1"); l1.text = "Hold on!"; l1.note = "shouting";
  const l2 = newLine(newId, "thought", "ch-2"); l2.text = "Not again.";
  const l3 = newLine(newId, "caption"); l3.text = "Three hours earlier.";
  const l4 = newLine(newId, "sfx"); l4.text = "KRAK";
  const l5 = newLine(newId, "dialogue", "nobody"); l5.text = "Who?";
  pn.lines = [l1, l2, l3, l4, l5];
  a.panels = [pn, Object.assign(newPanel(newId), { description: "Close on her hand." })];
  // b: no plot, only descriptions
  b.panels = [Object.assign(newPanel(newId), { description: "She climbs." })];
  // c: empty page, skipped
  d.plot = "Aftermath.";
  return p;
}
const opts = (o = {}) => ({ ...DEFAULT_OPTIONS, format: "text" as const, ...o });
const text = (p: Project, o = {}) => new TextDecoder().decode(exportProject(p, opts(o)).bytes);

test("full script: pages, panels and lettering in reading order", () => {
  const t = text(sample());
  assert.match(t, /Issue 1: Falling/);
  assert.match(t, /Issue 2/);
  assert.match(t, /Page 1 — 2 panels/);
  assert.match(t, /Page 2 \(page turn\)|Page 2 — 1 panel \(page turn\)/);
  assert.match(t, /Panel 1\n\nWide shot of the bridge\.\nDust everywhere\./);
  assert.match(t, /MARA \(shouting\): Hold on!/);
  assert.match(t, /OLD TOM \(thought\): Not again\./);
  assert.match(t, /CAPTION: Three hours earlier\./);
  assert.match(t, /SFX: KRAK/);
  assert.match(t, /UNKNOWN: Who\?/);
  assert.ok(t.indexOf("Panel 1") < t.indexOf("Panel 2"));
});

test("the page plot can be left out of the script", () => {
  assert.match(text(sample()), /The bridge collapses/);
  assert.doesNotMatch(text(sample(), { comicPlot: false }), /The bridge collapses/);
});

test("plot for the artist: no dialogue; cast and places; descriptions stand in for a missing plot", () => {
  const t = text(sample(), { comicKind: "plot" });
  assert.match(t, /The bridge collapses under the cart\./);
  assert.match(t, /Characters: Mara, Old Tom/);
  assert.match(t, /Places: The old bridge/);
  assert.doesNotMatch(t, /Hold on|KRAK|CAPTION/);
  assert.match(t, /1\. She climbs\./);
});

test("empty pages are skipped; counts follow pages and issues", () => {
  const p = sample();
  assert.deepEqual(exportPreview(p, opts()), { scenes: 3, chapters: 2 });
  assert.doesNotMatch(text(p), /Page 3/);
  assert.match(text(p), /Page 1/);
});

test("scope: the selected page, or its issue", () => {
  const p = sample();
  assert.deepEqual(exportPreview(p, opts({ scope: "scene", sceneId: p.pages[3].id })), { scenes: 1, chapters: 1 });
  assert.deepEqual(exportPreview(p, opts({ scope: "chapter", sceneId: p.pages[0].id })), { scenes: 2, chapters: 1 });
  assert.deepEqual(exportPreview(p, opts({ scope: "scene", sceneId: "missing" })), { scenes: 0, chapters: 0 });
});

test("file names say which export it is; the writers do not add ornaments between pages", () => {
  const p = sample();
  assert.equal(exportProject(p, opts()).fileName, "The Bridge (script).txt");
  assert.equal(exportProject(p, opts({ comicKind: "plot", format: "markdown" })).fileName, "The Bridge (plot).md");
  assert.doesNotMatch(text(p), /\* \* \*/);
  const b = buildComicBook(p, opts());
  assert.equal(b.options.sceneBreak, "none");
  assert.equal(b.layout, "script");
});

test("markdown, docx and epub render a comic without throwing", () => {
  const p = sample();
  const md = new TextDecoder().decode(exportProject(p, opts({ format: "markdown" })).bytes);
  assert.match(md, /^# The Bridge/);
  assert.match(md, /\*\*MARA\*\* \*\(shouting\)\*: Hold on!|\*\*MARA\*\*/);
  for (const format of ["docx", "epub"] as const) {
    const r = exportProject(p, opts({ format }));
    assert.ok(r.bytes.length > 500);
    assert.equal(r.bytes[0], 0x50); // zip "PK"
  }
});

test("a novel exports exactly as before (no comic fields leak in)", () => {
  const novel = { ...sample(), story_format: "novel", chapters: [], scenes: [], issues: [], pages: [] } as unknown as Project;
  assert.deepEqual(exportPreview(novel, opts()), { scenes: 0, chapters: 0 });
});
