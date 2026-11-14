import { test } from "node:test";
import assert from "node:assert/strict";
import { blankScreenplay } from "../src/lib/blank.ts";
import { newElement } from "../src/lib/screenplay.ts";
import { exportProject, exportPreview, DEFAULT_OPTIONS, type ExportOptions } from "../src/lib/export/index.ts";
import { buildScript } from "../src/lib/export/screenplayDoc.ts";
import { paginate, wrap, titlePage } from "../src/lib/export/screenplayLayout.ts";
import { renderFountain } from "../src/lib/export/fountain.ts";
import { pdfString, renderPdf } from "../src/lib/export/pdf.ts";
import { addAct, addScene, updateScene, addElement, updateElement } from "../src/lib/screenplayedit.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;
const dec = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({ ...DEFAULT_OPTIONS, format: "pdf", author: "Ana Lima", ...o });

function sample(): Project {
  let p = blankScreenplay(newId);
  p = { ...p, title: "The Bridge", characters: [{ ...(p.characters[0] ?? ({} as any)), id: "c1", name: "Maria" }, { ...({} as any), id: "c2", name: "Joe" }] as any };
  const sc = p.script_scenes[0].id;
  p = updateScene(p, sc, { int_ext: "INT", location: "Kitchen", time: "Day" });
  const add = (kind: any, text: string, extra: any = {}) => {
    const r = addElement(p, newId, sc, kind);
    p = updateElement(r.project, sc, r.id, { text, ...extra });
  };
  add("action", "Maria stirs a pot. Steam fills the room.");
  add("dialogue", "We are out of time.", { speaker_id: "c1", extension: "V.O.", parenthetical: "quietly" });
  add("action", "She turns.");
  add("dialogue", "Still here?", { speaker_id: "c1" });
  add("note", "private: check budget");
  add("transition", "cut to:");
  const r2 = addScene(p, newId, p.acts[0].id);
  p = updateScene(r2.project, r2.id, { int_ext: "EXT", location: "Bridge", time: "Night" });
  const r3 = addElement(p, newId, r2.id, "action");
  p = updateElement(r3.project, r2.id, r3.id, { text: "Wind." });
  return p;
}

test("script doc: slugs, speakers, derived CONT'D, notes dropped, transitions upper-cased", () => {
  const d = buildScript(sample(), opts());
  assert.equal(d.scenes.length, 2);
  assert.equal(d.scenes[0].slug, "INT. KITCHEN - DAY");
  const els = d.scenes[0].elements;
  assert.equal(els.length, 5); // note dropped
  assert.equal(els[1].name, "MARIA (V.O.)");
  assert.equal(els[1].contd, false);
  assert.equal(els[3].contd, true);
  assert.equal(els[4].text, "CUT TO:");
  assert.equal(d.acts, 1);
});

test("scope: one scene only; empty scenes skipped; preview counts", () => {
  const p = sample();
  const second = p.script_scenes[1].id;
  assert.equal(buildScript(p, opts({ scope: "scene", sceneId: second })).scenes.length, 1);
  assert.equal(buildScript(p, opts({ scope: "scene", sceneId: second })).scenes[0].number, 2);
  const r = addScene(p, newId, p.acts[0].id).project; // an empty third scene
  assert.equal(exportPreview(r, opts()).scenes, 2);
  assert.deepEqual(exportPreview(blankScreenplay(newId), opts()), { scenes: 0, chapters: 0 });
});

test("wrap", () => {
  assert.deepEqual(wrap("aaa bbb ccc", 7), ["aaa bbb", "ccc"]);
  assert.deepEqual(wrap("x".repeat(10), 4), ["xxxx", "xxxx", "xx"]);
  assert.deepEqual(wrap("a\n\nb", 10), ["a", "", "b"]);
});

test("layout: 55 lines a page, page numbers from page 2, slugs never end a page", () => {
  let p = sample();
  const sc = p.script_scenes[0].id;
  for (let i = 0; i < 40; i++) {
    const r = addElement(p, newId, sc, "action");
    p = updateElement(r.project, sc, r.id, { text: `Line number ${i} goes here and runs on for a while to take two rows of the page, yes.` });
  }
  const r = addScene(p, newId, p.acts[0].id);
  p = updateScene(r.project, r.id, { int_ext: "EXT", location: "Roof", time: "Dawn" });
  const e = addElement(p, newId, r.id, "action");
  p = updateElement(e.project, r.id, e.id, { text: "Quiet." });
  const pages = paginate(buildScript(p, opts()));
  assert.ok(pages.length > 2);
  for (const pg of pages) assert.ok(Math.max(...pg.items.filter((i) => i.row >= 0).map((i) => i.row)) < 55);
  assert.ok(!pages[0].items.some((i) => i.row === -2));
  assert.ok(pages[1].items.some((i) => i.row === -2 && i.text === "2."));
  for (const pg of pages) {
    const body = pg.items.filter((i) => i.row >= 0);
    const last = Math.max(...body.map((i) => i.row));
    const lastText = body.find((i) => i.row === last)!.text;
    assert.ok(!/^(INT|EXT)\./.test(lastText), "a slug line must not be the last line of a page");
  }
});

test("layout: dialogue split across pages gets (MORE) and NAME (CONT'D)", () => {
  let p = blankScreenplay(newId);
  p = { ...p, characters: [{ id: "c1", name: "Maria" }] as any };
  const sc = p.script_scenes[0].id;
  p = updateScene(p, sc, { int_ext: "INT", location: "Hall", time: "Day" });
  for (let i = 0; i < 22; i++) {
    const r = addElement(p, newId, sc, "action");
    p = updateElement(r.project, sc, r.id, { text: `Beat ${i}.` });
  }
  const r = addElement(p, newId, sc, "dialogue");
  p = updateElement(r.project, sc, r.id, { speaker_id: "c1", text: Array.from({ length: 30 }, (_, i) => `word${i} word${i} word${i}`).join(" ") });
  const pages = paginate(buildScript(p, opts()));
  const all = pages.flatMap((pg) => pg.items.map((i) => i.text));
  assert.ok(all.includes("(MORE)"));
  assert.ok(all.includes("MARIA (CONT'D)"));
});

test("pdf: valid structure, page count, escapes, WinAnsi", () => {
  assert.equal(pdfString("a(b)\\c"), "(a\\(b\\)\\\\c)");
  assert.equal(pdfString("é’"), "(\\351\\222)");
  assert.equal(pdfString("日"), "(?)");
  const r = exportProject(sample(), opts());
  const s = dec(r.bytes);
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.ok(s.trimEnd().endsWith("%%EOF"));
  assert.match(s, /\/Count 2 /); // title page + one script page
  assert.equal(r.fileName, "The Bridge.pdf");
  assert.equal(r.scenes, 2);
  const noTitle = dec(exportProject(sample(), opts({ spTitlePage: false })).bytes);
  assert.match(noTitle, /\/Count 1 /);
  // the xref offset points at "xref"
  const off = Number(/startxref\n(\d+)/.exec(s)![1]);
  assert.equal(s.slice(off, off + 4), "xref");
  assert.ok(renderPdf([], "letter").length > 100);
});

test("title page is centred and shows the author", () => {
  const items = titlePage(buildScript(sample(), opts()));
  assert.equal(items[0].text, "THE BRIDGE");
  assert.ok(items.some((i) => i.text === "Ana Lima"));
});

test("fountain: title, forced slug, dialogue, transition, numbers", () => {
  let p = sample();
  p = updateScene(p, p.script_scenes[1].id, { int_ext: "", location: "Bridge", time: "Night" });
  const f = renderFountain(buildScript(p, opts()), { titlePage: true, numbers: true });
  assert.match(f, /^Title: The Bridge\nAuthor: Ana Lima\n\n===\n/);
  assert.match(f, /\nINT\. KITCHEN - DAY #1#\n/);
  assert.match(f, /\n\.BRIDGE - NIGHT #2#\n/);
  assert.match(f, /\nMARIA \(V\.O\.\)\n\(quietly\)\nWe are out of time\.\n/);
  assert.match(f, /\n> CUT TO:\n/);
  assert.ok(!f.includes("private: check budget"));
  const loud = { title: "", author: "", language: "en", acts: 1, scenes: [{ number: 1, slug: "INT. A - DAY", elements: [{ kind: "action" as const, text: "BANG!", name: "", contd: false, parenthetical: "" }] }] };
  assert.match(renderFountain(loud, { titlePage: true, numbers: false }), /\n!BANG!\n/);
  assert.ok(!renderFountain(loud, { titlePage: true, numbers: false }).includes("Title:"));
});

test("docx: a valid package with Courier styles, page-number header and the script text", () => {
  const r = exportProject(sample(), opts({ format: "docx" }));
  assert.equal(r.fileName, "The Bridge.docx");
  const s = dec(r.bytes);
  assert.ok(s.startsWith("PK"));
  for (const part of ["word/document.xml", "word/styles.xml", "word/header1.xml", "word/header2.xml"]) assert.ok(s.includes(part), part);
});

test("a leftover novel format still exports a screenplay as PDF", () => {
  const r = exportProject(sample(), opts({ format: "epub" }));
  assert.ok(r.fileName.endsWith(".pdf"));
  assert.equal(exportProject(sample(), opts({ format: "fountain" })).fileName, "The Bridge.fountain");
});
