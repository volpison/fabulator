import { test } from "node:test";
import assert from "node:assert/strict";
import { blankComic } from "../src/lib/blank.ts";
import { newPage, newPanel, newLine } from "../src/lib/comic.ts";
import { migrateProject } from "../src/lib/migrate.ts";
import { search } from "../src/lib/search.ts";
import { planReplace, applyReplace, DEFAULT_REPLACE_OPTIONS } from "../src/lib/replace.ts";
import {
  makePageSnapshot, applyRestore, deletedScenes, autoSnapshotPages, deletePageKeeping, snapshotText,
  snapshotWords, maybeAutoPageSnapshot, AUTO_INTERVAL_MS,
} from "../src/lib/snapshots.ts";
import { pageWords, wordStats } from "../src/lib/wordcount.ts";
import { diffProject, applyPatch } from "../src/lib/patch.ts";
import { updatePage, updatePanel } from "../src/lib/comicedit.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const newId = (p: string) => `${p}-${++n}`;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const F = { content: true, title: true, summary: false };

function sample(): Project {
  const p = blankComic(newId);
  p.issues[0].title = "Falling";
  p.characters = [{ id: "ch-1", name: "Mara", aliases: [], description: "", role: "", category: "", traits: [], notes: "" }] as unknown as Project["characters"];
  p.pages = [0, 1].map((i) => newPage(newId, p.issues[0].id, i));
  const [a, b] = p.pages;
  a.title = "The bridge";
  a.plot = "The wolf crosses the bridge.";
  const pn = newPanel(newId);
  pn.description = "A wolf on a bridge at dawn";
  const l1 = newLine(newId, "dialogue", "ch-1"); l1.text = "Careful, the wolf is near!"; l1.note = "whisper";
  const l2 = newLine(newId, "sfx"); l2.text = "CRACK";
  pn.lines = [l1, l2];
  a.panels = [pn];
  b.plot = "Quiet morning.";
  return p;
}

test("search finds pages by plot, panel description, lettering and speaker; and issues", () => {
  const p = sample();
  const r = search(p, "wolf");
  assert.equal(r.counts.page, 1);
  assert.equal(r.hits.find((h) => h.kind === "page")!.id, p.pages[0].id);
  assert.equal(search(p, "mara careful").counts.page, 1); // speaker + line text of the same page
  assert.equal(search(p, "crack").hits[0].field, "Panel 1");
  assert.equal(search(p, "falling").counts.issue, 1);
  assert.equal(search(p, "wolf").counts.scene, 0);
  assert.equal(search(p, "quiet").hits[0].subtitle, "Issue 1 · Page 2");
});

test("replace in a comic: plot, descriptions, lines and notes; titles only when asked; safety snapshot of each page", () => {
  const p = sample();
  const plan = planReplace(p, "wolf", "fox", DEFAULT_REPLACE_OPTIONS, { content: true, title: false, summary: false });
  assert.equal(plan.scenes, 1);
  assert.equal(plan.total, 3); // plot, description, line
  const r = applyReplace(p, "wolf", "fox", DEFAULT_REPLACE_OPTIONS, F, new Set([p.pages[0].id]), 1000, () => newId("snap"));
  const pg = r.project.pages[0];
  assert.equal(pg.plot, "The fox crosses the bridge.");
  assert.equal(pg.panels[0].description, "A fox on a bridge at dawn");
  assert.equal(pg.panels[0].lines[0].text, "Careful, the fox is near!");
  assert.equal(pg.panels[0].lines[0].note, "whisper");
  assert.equal(r.project.snapshots.length, 1);
  assert.equal(r.project.snapshots[0].kind, "safety");
  assert.match(snapshotText(r.project.snapshots[0]), /wolf/);
  // a title match
  const t = planReplace(p, "bridge", "river", DEFAULT_REPLACE_OPTIONS, { content: false, title: true, summary: false });
  assert.equal(t.total, 1);
  assert.equal(planReplace(p, "zzz", "x", DEFAULT_REPLACE_OPTIONS, F).scenes, 0);
  // the original is untouched
  assert.equal(p.pages[0].plot, "The wolf crosses the bridge.");
});

test("page snapshots: restore, recreate a deleted page, deleted list", () => {
  const p = sample();
  const snap = makePageSnapshot(p.pages[0], "manual", "v1", 1, "snap-a");
  assert.equal(snap.scene_id, p.pages[0].id);
  assert.equal(snapshotWords(snap), pageWords(p.pages[0]));
  // edit, then restore: a safety snapshot keeps the edit
  let q: Project = { ...p, snapshots: [snap] };
  q = updatePage(q, p.pages[0].id, { plot: "Rewritten." });
  const r = applyRestore(q, "snap-a", 5, newId);
  assert.equal(r.sceneId, p.pages[0].id);
  assert.equal(r.project.pages[0].plot, "The wolf crosses the bridge.");
  assert.equal(r.project.pages[0].panels[0].lines.length, 2);
  assert.equal(r.project.snapshots.filter((s) => s.kind === "safety").length, 1);
  // restoring an identical page changes nothing
  assert.equal(applyRestore(p, makeAndAdd(p), 5, newId).project.pages, p.pages);
  // delete (keeps a copy), see it in "deleted", bring it back at the end of its issue
  const gone = deletePageKeeping(p, p.pages[0].id, 10, () => newId("snap"));
  assert.equal(gone.pages.length, 1);
  assert.equal(gone.pages[0].order, 0);
  assert.equal(deletedScenes(gone).length, 1);
  const back = applyRestore(gone, gone.snapshots[0].id, 11, newId);
  assert.equal(back.project.pages.length, 2);
  const restored = back.project.pages.find((x) => x.id === back.sceneId)!;
  assert.equal(restored.order, 1);
  assert.equal(restored.plot, "The wolf crosses the bridge.");
  assert.equal(deletedScenes(back.project).length, 0);
  // an empty page is not worth a copy
  const fresh = sample();
  const empty = { ...fresh, pages: [newPage(newId, p.issues[0].id, 0)] };
  assert.equal(deletePageKeeping(empty, empty.pages[0].id, 1, () => "s").snapshots.length, 0);
});
function makeAndAdd(p: Project): string {
  p.snapshots = [makePageSnapshot(p.pages[0], "manual", "same", 1, "snap-same")];
  return "snap-same";
}

test("auto snapshots of pages: when the writing changes, at most every 30 minutes, never for a no-op or an empty page", () => {
  const p = sample();
  const before = p;
  const after = updatePage(p, p.pages[0].id, { plot: "New plot." });
  const withSnap = autoSnapshotPages(before, after, 1_000, () => newId("snap"));
  assert.equal(withSnap.snapshots.length, 1);
  assert.equal(withSnap.snapshots[0].kind, "auto");
  assert.match(snapshotText(withSnap.snapshots[0]), /The wolf crosses/); // how it WAS
  // another edit soon after: no second one
  const again = updatePage(withSnap, p.pages[0].id, { plot: "Newer plot." });
  assert.equal(autoSnapshotPages(withSnap, again, 2_000, () => newId("snap")).snapshots.length, 1);
  // after the interval: yes
  assert.equal(autoSnapshotPages(withSnap, again, 1_000 + AUTO_INTERVAL_MS + 1, () => newId("snap")).snapshots.length, 2);
  // metadata-only edits (stage, notes) are not "writing"
  const meta = updatePage(p, p.pages[0].id, { stage: "art" });
  assert.equal(autoSnapshotPages(p, meta, 1, () => "s"), meta);
  // panel text counts
  const panelEdit = updatePanel(p, p.pages[0].id, p.pages[0].panels[0].id, { description: "Changed" });
  assert.equal(autoSnapshotPages(p, panelEdit, 1, () => newId("snap")).snapshots.length, 1);
  // an empty page gets none
  const e = { ...p, pages: [newPage(newId, p.issues[0].id, 0)] };
  assert.equal(maybeAutoPageSnapshot([], e.pages[0], 1, () => "s").length, 0);
});

test("word counts: pages count plot + descriptions + lines; issues sum their pages", () => {
  const p = sample();
  assert.equal(pageWords(p.pages[0]), 5 + 7 + 5 + 1);
  const st = wordStats(p);
  assert.equal(st.byScene.get(p.pages[0].id), 18);
  assert.equal(st.byScene.get(p.pages[1].id), 2);
  assert.equal(st.byChapter.get(p.issues[0].id), 20);
  assert.equal(st.total, 20);
  // a novel is unchanged
  assert.equal(wordStats({ chapters: [], scenes: [] }).total, 0);
});

test("schema 9: page snapshots survive save, reopen and patches; a malformed page snapshot is dropped, not the snapshot", () => {
  const p = sample();
  p.snapshots = [makePageSnapshot(p.pages[0], "manual", "v1", 1, "snap-1")];
  const reopened = migrateProject(clone(p)).project;
  assert.equal(reopened.schema_version, 10);
  assert.deepEqual(reopened.snapshots[0].page, p.pages[0]);
  const delta = diffProject({ ...p, snapshots: [] }, p);
  assert.equal(delta.kind, "patch");
  if (delta.kind === "patch") assert.deepEqual(applyPatch({ ...p, snapshots: [] }, delta.patch).snapshots, p.snapshots);
  const old = clone(p) as any;
  old.schema_version = 8;
  old.snapshots[0].page = "garbage";
  const fixed = migrateProject(old).project;
  assert.equal(fixed.snapshots.length, 1);
  assert.equal("page" in fixed.snapshots[0], false);
  // a novel's snapshots never gain a `page` key
  const novel = migrateProject({ schema_version: 8, id: "x", title: "t", chapters: [], scenes: [], snapshots: [{ id: "s", scene_id: "sc", content: "<p>x</p>" }] }).project;
  assert.equal("page" in novel.snapshots[0], false);
});
