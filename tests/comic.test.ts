import { test } from "node:test";
import assert from "node:assert/strict";
import { blankComic, blankProject, blankProjectFor } from "../src/lib/blank.ts";
import { migrateProject, CURRENT_SCHEMA_VERSION } from "../src/lib/migrate.ts";
import { STORY_FORMATS, readyFormats, formatOf, noun } from "../src/lib/formats.ts";
import {
  cleanIssues, cleanPages, cleanStage, cleanScriptStyle, COMIC_STAGES, STAGE_LABEL, SCRIPT_STYLES,
  pagesInIssue, comicReadingOrder, pageNumber, pageSide, spreadOf, isAfterPageTurn,
  panelCount, wordsIn, lettersWordCount, plotWordCount, newPage, newPanel, newLine,
} from "../src/lib/comic.ts";
import { diffProject, applyPatch, LIST_FIELDS } from "../src/lib/patch.ts";
import { toFolder } from "../src/lib/folder.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function sampleComic(): Project {
  const p = blankComic(newId);
  const issueId = p.issues[0].id;
  p.issues.push({ id: newId("is"), title: "Issue 2", summary: "" });
  p.pages = [0, 1, 2, 3].map((i) => newPage(newId, issueId, i));
  p.pages[0].plot = "The bridge collapses under the cart.";
  const panel = newPanel(newId);
  panel.description = "Wide shot of the bridge";
  const line = newLine(newId, "dialogue", "char-1");
  line.text = "Hold on to me!";
  const sfx = newLine(newId, "sfx");
  sfx.text = "KRAK";
  const cap = newLine(newId, "caption");
  cap.text = "Three days earlier";
  panel.lines = [line, sfx, cap];
  p.pages[0].panels = [panel];
  return p;
}

test("the comic format exists but is not ready: it is not offered for new stories", () => {
  assert.equal(STORY_FORMATS.comic.ready, false);
  assert.deepEqual(readyFormats().map((f) => f.id), ["novel"]);
  const p = sampleComic();
  assert.equal(formatOf(p).label, "Comic");
  assert.equal(noun(p, "group", 2), "issues");
  assert.equal(noun(p, "unit", 1, true), "Page");
});

test("a new comic is a valid current-version project with one issue and one page", () => {
  const p = blankComic(newId);
  assert.equal(p.story_format, "comic");
  assert.equal(p.script_style, "plot-first");
  assert.equal(p.issues.length, 1);
  assert.equal(p.pages.length, 1);
  assert.equal(p.pages[0].issue_id, p.issues[0].id);
  assert.deepEqual([p.chapters.length, p.scenes.length], [0, 0]);
  const r = migrateProject(clone(p));
  assert.equal(r.migratedFrom, null);
  assert.deepEqual(r.project, p);
  assert.equal(blankProjectFor("comic", newId).story_format, "comic");
  assert.equal(blankProjectFor("novel", newId).story_format, "novel");
});

test("a novel has no comic content or style, and a v7 file upgrades to v8 as a novel", () => {
  const novel = blankProject(newId);
  assert.deepEqual([novel.issues, novel.pages, novel.script_style], [[], [], undefined]);
  const old = clone(novel) as Record<string, unknown>;
  old.schema_version = 7;
  delete old.issues;
  delete old.pages;
  const r = migrateProject(old);
  assert.equal(r.migratedFrom, 7);
  assert.equal(r.project.schema_version, CURRENT_SCHEMA_VERSION);
  assert.deepEqual([r.project.issues, r.project.pages], [[], []]);
  // A stray style on a novel is dropped (it only means something in a comic).
  const stray = migrateProject({ ...clone(novel), script_style: "full" });
  assert.equal("script_style" in stray.project, false);
});

test("a comic survives migrate unchanged, and a damaged one is repaired, never dropped", () => {
  const p = sampleComic();
  assert.deepEqual(migrateProject(clone(p)).project, p);

  const damaged = clone(p) as Record<string, any>;
  damaged.pages[1].issue_id = "nope"; // points nowhere → first issue
  damaged.pages[2].stage = "painted"; // unknown stage → plot
  damaged.pages[3].panels = "oops"; // not a list → none
  damaged.pages.push({ plot: "No id, no issue" }); // repaired in place
  damaged.script_style = "sideways"; // → default
  const fixed = migrateProject(damaged).project;
  assert.equal(fixed.pages.length, 5);
  assert.equal(fixed.pages[1].issue_id, fixed.issues[0].id);
  assert.equal(fixed.pages[2].stage, "plot");
  assert.deepEqual(fixed.pages[3].panels, []);
  assert.ok(fixed.pages.every((pg) => pg.id));
  assert.equal(new Set(fixed.pages.map((pg) => pg.id)).size, 5);
  assert.equal(fixed.script_style, "plot-first");
});

test("pages with no issues get one; orders are dense per issue; duplicate ids are made unique", () => {
  const raw = { ...clone(blankComic(newId)), issues: [], pages: [
    { id: "a", order: 5, plot: "x" }, { id: "a", order: 1, plot: "y" }, { id: "b", order: 3, plot: "z" },
  ] };
  const p = migrateProject(raw).project;
  assert.equal(p.issues.length, 1);
  assert.deepEqual(p.pages.map((pg) => pg.order).sort(), [0, 1, 2]);
  assert.equal(new Set(p.pages.map((pg) => pg.id)).size, 3);
  assert.deepEqual(cleanIssues([{ id: "i" }, { id: "i" }, 5, null]).map((i) => i.id), ["i", "i-2"]);
  assert.deepEqual(cleanPages([{ plot: "x" }], []), []); // nowhere to put it
});

test("panel and line ids stay unique across the whole document", () => {
  const raw = clone(sampleComic()) as Record<string, any>;
  raw.pages[1].panels = clone(raw.pages[0].panels); // a copy-paste with the same ids
  const p = migrateProject(raw).project;
  const ids = p.pages.flatMap((pg) => pg.panels.flatMap((pn) => [pn.id, ...pn.lines.map((l) => l.id)]));
  assert.equal(new Set(ids).size, ids.length);
});

test("stages and styles", () => {
  assert.deepEqual([...COMIC_STAGES], ["plot", "art", "dialogue", "lettered"]);
  for (const s of COMIC_STAGES) assert.ok(STAGE_LABEL[s]);
  assert.equal(cleanStage("art"), "art");
  assert.equal(cleanStage("x"), "plot");
  assert.deepEqual([...SCRIPT_STYLES], ["plot-first", "full"]);
  assert.equal(cleanScriptStyle("full"), "full");
  assert.equal(cleanScriptStyle(undefined), "plot-first");
});

test("both scripting styles are the same data: a page can have only a plot, or panels, or both", () => {
  const p = sampleComic();
  const plotOnly = p.pages[1];
  assert.equal(plotOnly.panels.length, 0);
  plotOnly.plot = "They argue on the road.";
  assert.deepEqual(migrateProject(clone(p)).project.pages[1], plotOnly);
  // Switching the style changes nothing in the pages.
  const full = clone(p);
  full.script_style = "full";
  assert.deepEqual(migrateProject(full).project.pages, migrateProject(clone(p)).project.pages);
});

test("reading order, page numbers, sides, spreads and page turns", () => {
  const p = sampleComic();
  p.pages.push(newPage(newId, p.issues[1].id, 0));
  const order = comicReadingOrder(p);
  assert.equal(order.length, 5);
  assert.equal(order[4].issue_id, p.issues[1].id);
  assert.deepEqual(pagesInIssue(p.pages, p.issues[0].id).map(pageNumber), [1, 2, 3, 4]);

  assert.deepEqual([1, 2, 3, 4, 5].map(pageSide), ["right", "left", "right", "left", "right"]);
  assert.deepEqual(spreadOf(1, 6), [1]);
  assert.deepEqual(spreadOf(2, 6), [2, 3]);
  assert.deepEqual(spreadOf(3, 6), [2, 3]);
  assert.deepEqual(spreadOf(6, 6), [6]); // the last left page has nothing facing it
  assert.deepEqual(spreadOf(6, 7), [6, 7]);
  assert.deepEqual(spreadOf(0, 6), []);
  assert.deepEqual(spreadOf(7, 6), []);
  assert.deepEqual([1, 2, 3, 4, 5, 6].filter(isAfterPageTurn), [2, 4, 6]);
});

test("counting: panels, words the reader reads (not sound effects), words of the plot", () => {
  const p = sampleComic();
  assert.equal(panelCount(p.pages[0]), 1);
  assert.equal(wordsIn("  Hold on   to me! "), 4);
  assert.equal(wordsIn(""), 0);
  assert.equal(lettersWordCount(p.pages[0]), 4 + 3); // dialogue + caption, no KRAK
  assert.equal(plotWordCount(p.pages[0]), 6);
});

test("new lines: only speech and thoughts have a speaker", () => {
  assert.equal(newLine(newId, "dialogue", "c1").speaker_id, "c1");
  assert.equal(newLine(newId, "thought", "c1").speaker_id, "c1");
  assert.equal(newLine(newId, "caption", "c1").speaker_id, "");
  assert.equal(newLine(newId, "sfx", "c1").speaker_id, "");
});

test("patches describe page and panel edits, and rebuild the exact comic", () => {
  assert.ok((LIST_FIELDS as readonly string[]).includes("pages"));
  assert.ok((LIST_FIELDS as readonly string[]).includes("issues"));
  const prev = sampleComic();
  const next = clone(prev);
  next.pages[0].panels[0].lines[0].text = "Hold on!";
  next.pages.splice(2, 1);
  next.issues[1].title = "Renamed";
  next.script_style = "full";
  const d = diffProject(prev, next);
  assert.equal(d.kind, "patch");
  if (d.kind === "patch") {
    assert.deepEqual(applyPatch(prev, d.patch), next);
    assert.deepEqual(Object.keys(d.patch.lists ?? {}).sort(), ["issues", "pages"]);
  }
});

test("the Markdown folder header records the format", () => {
  const files = toFolder(sampleComic());
  const header = JSON.parse(files.find((f) => f.path === "project.json")!.text);
  assert.equal(header.story_format, "comic"); // the format is recorded, so a re-import can refuse or handle it
});

import { get } from "svelte/store";
import {
  project, selectedPageId, isDirty, markClean, addComicIssue, addComicPage, updateComicPage, moveComicPage,
  deleteComicPage, deleteComicIssue, renameComicIssue, deleteCharacter, addCharacter,
} from "../src/lib/stores.ts";

test("the comic format has a Timeline but no Manuscript yet", () => {
  assert.deepEqual(STORY_FORMATS.comic.views, { timeline: true, manuscript: false });
  assert.deepEqual(STORY_FORMATS.novel.views, { timeline: true, manuscript: true });
});

test("page and issue edits through the stores mark the project changed, and no-ops do not", () => {
  project.set(blankComic(newId));
  markClean();
  const id = addComicPage();
  assert.equal(get(isDirty), true);
  assert.equal(get(selectedPageId), id); // a new page is selected
  assert.equal(get(project)!.pages.length, 2);

  markClean();
  updateComicPage(id, { plot: "" }); // already empty: nothing changed
  moveComicPage(id, get(project)!.pages[1].issue_id, 1); // already there
  assert.equal(get(isDirty), false);

  updateComicPage(id, { plot: "The wolf appears." });
  assert.equal(get(isDirty), true);
  assert.equal(get(project)!.pages[1].plot, "The wolf appears.");

  const issue = addComicIssue("Finale");
  renameComicIssue(issue, { title: "The Finale" });
  assert.equal(get(project)!.issues[1].title, "The Finale");
  assert.equal(deleteComicIssue(get(project)!.issues[0].id), false); // it has pages
  assert.equal(deleteComicIssue(issue), true);

  deleteComicPage(id);
  assert.equal(get(selectedPageId), null);
  assert.equal(get(project)!.pages.length, 1);
});

test("deleting a character removes them from comic pages too", () => {
  project.set(blankComic(newId));
  const c = addCharacter("Mara");
  const pageId = get(project)!.pages[0].id;
  project.update((p) => ({ ...p!, pages: p!.pages.map((pg) => ({ ...pg, character_ids: [c] })) }));
  assert.deepEqual(get(project)!.pages.find((pg) => pg.id === pageId)!.character_ids, [c]);
  deleteCharacter(c);
  assert.deepEqual(get(project)!.pages[0].character_ids, []);
});
