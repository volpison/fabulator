import { test } from "node:test";
import assert from "node:assert/strict";
import { blankComic } from "../src/lib/blank.ts";
import { newPanel, pagesInIssue } from "../src/lib/comic.ts";
import {
  addIssue, updateIssue, deleteIssue, moveIssue, addPage, updatePage, movePage, deletePage,
  removeCastFromPages, spreadRows, issueSummary,
} from "../src/lib/comicedit.ts";
import { migrateProject } from "../src/lib/migrate.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function titles(p: Project, issueId = p.issues[0].id) {
  return pagesInIssue(p.pages, issueId).map((pg) => pg.title);
}
/** A comic with `count` pages in one issue, titled P1… so orders are easy to read. */
function build(count: number): Project {
  let p: Project = { ...blankComic(newId), pages: [] };
  for (let i = 0; i < count; i++) {
    const r = addPage(p, newId);
    p = updatePage(r.project, r.id, { title: `P${i + 1}` });
  }
  return p;
}
const valid = (p: Project) => assert.deepEqual(migrateProject(clone(p)).project.pages, p.pages); // dense, clean

test("issues: add, rename, move, delete only when empty", () => {
  let p = build(2);
  const added = addIssue(p, newId);
  p = added.project;
  assert.equal(p.issues[1].title, "Issue 2");
  assert.equal(addIssue(p, newId, "  Finale ").project.issues[2].title, "Finale");

  assert.equal(updateIssue(p, p.issues[0].id, { title: p.issues[0].title }), p); // no change → same object
  p = updateIssue(p, p.issues[0].id, { title: "Origins" });
  assert.equal(p.issues[0].title, "Origins");
  assert.equal(updateIssue(p, "nope", { title: "x" }), p);

  assert.equal(deleteIssue(p, p.issues[0].id), p); // has pages: refused
  const p2 = deleteIssue(p, added.id);
  assert.equal(p2.issues.length, 1);
  assert.equal(deleteIssue(p2, "nope"), p2);

  const moved = moveIssue(addIssue(p, newId).project, p.issues[0].id, 1);
  assert.equal(moved.issues[1].title, "Origins");
  assert.equal(moveIssue(p, p.issues[0].id, 0), p);
  assert.equal(moveIssue(p, "nope", 0), p);
});

test("a page is added at the end, or at a position, with dense orders", () => {
  let p = build(3);
  assert.deepEqual(titles(p), ["P1", "P2", "P3"]);
  const r = addPage(p, newId, undefined, 1);
  p = updatePage(r.project, r.id, { title: "NEW" });
  assert.deepEqual(titles(p), ["P1", "NEW", "P2", "P3"]);
  valid(p);
  assert.deepEqual(titles(addPage(p, newId, undefined, 99).project).slice(-1), [""]); // clamped to the end
  assert.deepEqual(titles(updatePage(addPage(p, newId, undefined, -5).project, p.pages[0].id, {})).slice(1), ["P1", "NEW", "P2", "P3"]);
});

test("adding a page to a comic with no issue creates one; a new page takes the first plotline", () => {
  const empty: Project = { ...blankComic(newId), issues: [], pages: [] };
  const r = addPage(empty, newId);
  assert.equal(r.project.issues.length, 1);
  assert.equal(r.project.pages[0].issue_id, r.project.issues[0].id);
  assert.equal(r.project.pages[0].plotline_id, empty.plotlines[0].id);
  // An unknown issue falls back to the last one.
  const two = addIssue(build(1), newId).project;
  assert.equal(addPage(two, newId, "nope").project.pages.at(-1)!.issue_id, two.issues[1].id);
});

test("editing a page changes only what was given; nothing to change returns the same project", () => {
  const p = build(2);
  const id = p.pages[0].id;
  const q = updatePage(p, id, { plot: "A storm.", layout: "splash", stage: "art", notes: "ref: storm.png" });
  assert.deepEqual([q.pages[0].plot, q.pages[0].layout, q.pages[0].stage, q.pages[0].notes], ["A storm.", "splash", "art", "ref: storm.png"]);
  assert.equal(q.pages[0].title, "P1");
  assert.equal(q.pages[1], p.pages[1]); // the other page is the very same object
  assert.equal(updatePage(q, id, { plot: "A storm." }), q);
  assert.equal(updatePage(q, "nope", { plot: "x" }), q);
  assert.equal(updatePage(q, id, { stage: "painted" as never }), q); // an unknown stage is refused
});

test("moving pages inside an issue", () => {
  const p = build(4);
  const ids = p.pages.map((pg) => pg.id);
  assert.deepEqual(titles(movePage(p, ids[0], p.issues[0].id, 2)), ["P2", "P3", "P1", "P4"]);
  assert.deepEqual(titles(movePage(p, ids[3], p.issues[0].id, 0)), ["P4", "P1", "P2", "P3"]);
  assert.equal(movePage(p, ids[1], p.issues[0].id, 1), p); // already there
  assert.deepEqual(titles(movePage(p, ids[0], p.issues[0].id, 99)), ["P2", "P3", "P4", "P1"]);
  valid(movePage(p, ids[0], p.issues[0].id, 2));
});

test("moving a page to another issue closes the gap and keeps both issues dense", () => {
  let p = addIssue(build(3), newId).project;
  const [i1, i2] = p.issues.map((i) => i.id);
  p = movePage(p, p.pages[1].id, i2, 0);
  assert.deepEqual(titles(p, i1), ["P1", "P3"]);
  assert.deepEqual(titles(p, i2), ["P2"]);
  valid(p);
  assert.equal(movePage(p, p.pages[0].id, "nope", 0), p);
  assert.equal(movePage(p, "nope", i1, 0), p);
});

test("deleting a page closes the gap", () => {
  const p = build(4);
  const q = deletePage(p, p.pages[1].id);
  assert.deepEqual(titles(q), ["P1", "P3", "P4"]);
  valid(q);
  assert.equal(deletePage(q, "nope"), q);
});

test("a deleted character or place disappears from the pages", () => {
  let p = build(2);
  p = { ...p, pages: p.pages.map((pg, i) => ({ ...pg, character_ids: i === 0 ? ["c1", "c2"] : ["c2"], place_ids: ["pl1"] })) };
  const q = removeCastFromPages(p, "character", "c1");
  assert.deepEqual(q.pages.map((pg) => pg.character_ids), [["c2"], ["c2"]]);
  assert.equal(q.pages[1], p.pages[1]);
  assert.deepEqual(removeCastFromPages(q, "place", "pl1").pages.map((pg) => pg.place_ids), [[], []]);
  assert.equal(removeCastFromPages(p, "character", "nobody"), p);
});

test("spread rows: 1 alone, then 2–3, 4–5; an even last page stands alone", () => {
  const rows = (k: number) => {
    const p = build(k);
    return spreadRows(pagesInIssue(p.pages, p.issues[0].id)).map((r) => r.numbers);
  };
  assert.deepEqual(rows(0), []);
  assert.deepEqual(rows(1), [[1]]);
  assert.deepEqual(rows(4), [[1], [2, 3], [4]]);
  assert.deepEqual(rows(7), [[1], [2, 3], [4, 5], [6, 7]]);
  const p = build(5);
  const r = spreadRows(pagesInIssue(p.pages, p.issues[0].id));
  assert.deepEqual(r.map((row) => row.pages.map((pg) => pg.title)), [["P1"], ["P2", "P3"], ["P4", "P5"]]);
});

test("issue summary counts pages, panels and stages", () => {
  let p = build(3);
  p = updatePage(p, p.pages[0].id, { stage: "art" });
  p = updatePage(p, p.pages[1].id, { stage: "lettered" });
  p = { ...p, pages: p.pages.map((pg, i) => (i === 0 ? { ...pg, panels: [newPanel(newId), newPanel(newId)] } : pg)) };
  const s = issueSummary(p, p.issues[0].id);
  assert.deepEqual([s.pages, s.panels], [3, 2]);
  assert.deepEqual(s.byStage, { plot: 1, art: 1, dialogue: 0, lettered: 1 });
  assert.deepEqual(issueSummary(p, "nope"), { pages: 0, panels: 0, byStage: { plot: 0, art: 0, dialogue: 0, lettered: 0 } });
});

import {
  addPanel, updatePanel, movePanel, deletePanel, addLine, updateLine, moveLine, deleteLine,
} from "../src/lib/comicedit.ts";
import {
  lineWords, balloonTooLong, panelWords, panelTooWordy, pageTooBusy, BALLOON_WORD_LIMIT, PANEL_WORD_LIMIT, PAGE_PANEL_LIMIT,
} from "../src/lib/comic.ts";

const words = (k: number) => Array.from({ length: k }, () => "w").join(" ");

test("panels: add at a position, edit, move, delete", () => {
  let p = build(1);
  const page = p.pages[0].id;
  const a = addPanel(p, newId, page); p = a.project;
  const b = addPanel(p, newId, page); p = b.project;
  const c = addPanel(p, newId, page, 0); p = c.project;
  assert.deepEqual(p.pages[0].panels.map((x) => x.id), [c.id, a.id, b.id]);
  assert.equal(addPanel(p, newId, "nope").project, p);
  assert.equal(addPanel(p, newId, "nope").id, "");

  p = updatePanel(p, page, a.id, { description: "Wide shot" });
  assert.equal(p.pages[0].panels[1].description, "Wide shot");
  assert.equal(updatePanel(p, page, a.id, { description: "Wide shot" }), p);
  assert.equal(updatePanel(p, page, "nope", { description: "x" }), p);

  assert.deepEqual(movePanel(p, page, c.id, 2).pages[0].panels.map((x) => x.id), [a.id, b.id, c.id]);
  assert.equal(movePanel(p, page, c.id, 0), p);
  assert.equal(movePanel(p, page, "nope", 0), p);
  p = deletePanel(p, page, a.id);
  assert.deepEqual(p.pages[0].panels.map((x) => x.id), [c.id, b.id]);
  assert.equal(deletePanel(p, page, a.id), p);
});

test("lines: add, edit, reorder (balloon order), delete", () => {
  let p = build(1);
  const page = p.pages[0].id;
  const pn = addPanel(p, newId, page); p = pn.project;
  const l1 = addLine(p, newId, page, pn.id); p = l1.project;
  const l2 = addLine(p, newId, page, pn.id, "caption"); p = l2.project;
  const l3 = addLine(p, newId, page, pn.id, "sfx", 0); p = l3.project;
  const lines = () => p.pages[0].panels[0].lines;
  assert.deepEqual(lines().map((l) => l.id), [l3.id, l1.id, l2.id]);
  assert.deepEqual(lines().map((l) => l.kind), ["sfx", "dialogue", "caption"]);
  assert.equal(addLine(p, newId, page, "nope").project, p);

  p = updateLine(p, page, pn.id, l1.id, { text: "Hold on!" });
  assert.equal(lines()[1].text, "Hold on!");
  assert.equal(updateLine(p, page, pn.id, l1.id, { text: "Hold on!" }), p); // nothing changed
  assert.equal(updateLine(p, page, pn.id, l1.id, { kind: "shout" as never }), p); // unknown kind refused
  assert.equal(updateLine(p, page, pn.id, "nope", { text: "x" }), p);

  assert.deepEqual(moveLine(p, page, pn.id, l2.id, 0).pages[0].panels[0].lines.map((l) => l.id), [l2.id, l3.id, l1.id]);
  assert.equal(moveLine(p, page, pn.id, l2.id, 2), p);
  p = deleteLine(p, page, pn.id, l3.id);
  assert.deepEqual(lines().map((l) => l.id), [l1.id, l2.id]);
  assert.equal(deleteLine(p, page, pn.id, l3.id), p);
});

test("a caption or sound effect has no speaker; speaking puts the character on the page", () => {
  let p = build(1);
  const page = p.pages[0].id;
  const pn = addPanel(p, newId, page); p = pn.project;
  const ln = addLine(p, newId, page, pn.id); p = ln.project;

  p = updateLine(p, page, pn.id, ln.id, { speaker_id: "char-mara" });
  assert.equal(p.pages[0].panels[0].lines[0].speaker_id, "char-mara");
  assert.deepEqual(p.pages[0].character_ids, ["char-mara"]); // now in the page's cast
  // Speaking again does not duplicate the cast entry.
  p = updateLine(p, page, pn.id, ln.id, { text: "Hi" });
  assert.deepEqual(p.pages[0].character_ids, ["char-mara"]);
  // Turning it into a caption drops the speaker (the cast entry stays: they may still be on the page).
  p = updateLine(p, page, pn.id, ln.id, { kind: "caption" });
  assert.equal(p.pages[0].panels[0].lines[0].speaker_id, "");
  assert.deepEqual(p.pages[0].character_ids, ["char-mara"]);
  p = updateLine(p, page, pn.id, ln.id, { kind: "sfx", speaker_id: "char-other" });
  assert.equal(p.pages[0].panels[0].lines[0].speaker_id, "");
  assert.deepEqual(p.pages[0].character_ids, ["char-mara"]); // a sound effect adds nobody
  valid(p);
});

test("gentle limits: long balloons, wordy panels, busy pages; sound effects are not words", () => {
  const long = { kind: "dialogue" as const, text: words(BALLOON_WORD_LIMIT + 1) };
  const ok = { kind: "dialogue" as const, text: words(BALLOON_WORD_LIMIT) };
  assert.ok(balloonTooLong(long) && !balloonTooLong(ok));
  assert.equal(lineWords({ kind: "sfx", text: "KRAKOOM BOOM" }), 0);
  assert.ok(!balloonTooLong({ kind: "sfx", text: words(99) }));
  const panel = (k: number) => ({ lines: [{ id: "a", kind: "dialogue" as const, speaker_id: "", note: "", text: words(k) }] });
  assert.equal(panelWords(panel(10)), 10);
  assert.ok(panelTooWordy(panel(PANEL_WORD_LIMIT + 1)) && !panelTooWordy(panel(PANEL_WORD_LIMIT)));
  const page = (k: number) => ({ panels: Array.from({ length: k }, () => ({ id: "x", description: "", lines: [] })) });
  assert.ok(pageTooBusy(page(PAGE_PANEL_LIMIT + 1)) && !pageTooBusy(page(PAGE_PANEL_LIMIT)));
});
