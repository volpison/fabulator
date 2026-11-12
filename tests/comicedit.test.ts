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
