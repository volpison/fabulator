import { test } from "node:test";
import assert from "node:assert/strict";
import { blankProjectFor } from "../src/lib/files/blank.ts";
import { addElement, addLink, addNode, addOption, setRules, updateElement, updateNode, updateOption, updateQuest } from "../src/lib/game/gameedit.ts";
import { search } from "../src/lib/tools/search.ts";
import { applyReplace, DEFAULT_REPLACE_FIELDS, DEFAULT_REPLACE_OPTIONS, planReplace } from "../src/lib/tools/replace.ts";
import { applyRestore, autoSnapshotNodes, deleteNodeKeeping, deletedScenes, maybeAutoNodeSnapshot, snapshotText, snapshotWords, snapshotsFor } from "../src/lib/tools/snapshots.ts";
import { makeNodeSnapshot, nodeHasContent, nodeToText, recreateNode, restoreNodeInto } from "../src/lib/game/gamesnapshots.ts";
import { cleanNodeSnapshot } from "../src/lib/game/game.ts";
import { migrateProject } from "../src/lib/files/migrate.ts";
import { wordStats } from "../src/lib/tools/wordcount.ts";
import type { Project } from "../src/lib/model/types.ts";

let n = 0;
const id = (p: string) => `${p}-${++n}`;
const NOW = 1_700_000_000_000;

function story() {
  let p: Project = blankProjectFor("game", id);
  p = { ...p, characters: [{ id: "c-ann", name: "Ann", aliases: [], description: "", role: "", category: "", traits: [], notes: "" }] };
  const q = p.game!.quests[0].id;
  p = updateQuest(p, q, { title: "The Fall" });
  const a = addNode(p, id, q); p = a.project;
  const b = addNode(p, id, q); p = b.project;
  p = updateNode(p, a.id, { title: "The well", summary: "Ann finds a key by the well." });
  p = updateNode(p, b.id, { title: "The cellar" });
  const nar = addElement(p, id, a.id, "narration"); p = nar.project;
  p = updateElement(p, a.id, nar.id, { text: "The well is dark and deep." });
  const dia = addElement(p, id, a.id, "dialogue", undefined, "c-ann"); p = dia.project;
  p = updateElement(p, a.id, dia.id, { text: "Is anyone down there?", parenthetical: "whispers" });
  const ch = addElement(p, id, a.id, "choice"); p = ch.project;
  p = updateElement(p, a.id, ch.id, { text: "Climb down the well?" });
  const o = addOption(p, id, a.id, ch.id); p = o.project;
  p = updateOption(p, a.id, ch.id, o.id, { text: "Yes, climb", to: b.id });
  const note = addElement(p, id, a.id, "note"); p = note.project;
  p = updateElement(p, a.id, note.id, { text: "secret well note" });
  p = addLink(p, id, a.id, b.id).project;
  return { p, q, a: a.id, b: b.id, ch: ch.id, o: o.id };
}

// ─── Search ───

test("search finds nodes (text, dialogue, choices, notes) and quests", () => {
  const { p, a } = story();
  const r = search(p, "well");
  const node = r.hits.find((h) => h.kind === "node" && h.id === a)!;
  assert.ok(node);
  assert.equal(node.subtitle, "Quest 1 · Node 1.1");
  assert.equal(r.counts.node, 1);
  assert.equal(search(p, "anyone down").hits[0].kind, "node");
  assert.equal(search(p, "ann whispers").hits.length, 1);
  assert.equal(search(p, "climb").counts.node, 1); // an option's text
  assert.equal(search(p, "secret").hits[0].field, "Notes");
  assert.equal(search(p, "fall").hits[0].kind, "quest");
  assert.equal(search(p, "nothing here at all").hits.length, 0);
});

// ─── Replace ───

test("replace plans and applies in node text, titles and summaries, with a safety snapshot", () => {
  const { p, a, b } = story();
  const fields = { content: true, title: true, summary: true };
  const plan = planReplace(p, "well", "pit", DEFAULT_REPLACE_OPTIONS, fields);
  assert.equal(plan.scenes, 1);
  assert.equal(plan.changes[0].sceneId, a);
  assert.equal(plan.changes[0].counts.content, 3); // narration, the choice prompt and the note
  assert.equal(plan.changes[0].counts.title, 1);
  assert.equal(plan.changes[0].counts.summary, 1);
  assert.match(plan.changes[0].chapterLabel, /Quest 1 · The Fall · Node 1\.1/);
  const r = applyReplace(p, "well", "pit", DEFAULT_REPLACE_OPTIONS, fields, new Set([a, b]), NOW, () => id("snap"));
  assert.equal(r.scenes, 1);
  assert.equal(r.replacements, 5);
  const node = r.project.game!.nodes.find((x) => x.id === a)!;
  assert.equal(node.title, "The pit");
  assert.equal(node.summary, "Ann finds a key by the pit.");
  assert.equal(node.elements.find((e) => e.kind === "narration")!.text, "The pit is dark and deep.");
  assert.equal(r.project.snapshots.length, 1);
  assert.equal(r.project.snapshots[0].kind, "safety");
  assert.equal(r.project.snapshots[0].node!.title, "The well");
  // the original is untouched
  assert.equal(p.game!.nodes.find((x) => x.id === a)!.title, "The well");
});

test("replace reaches choice prompts, options and parentheticals but not the speaker", () => {
  const { p, a } = story();
  const r = applyReplace(p, "climb", "jump", DEFAULT_REPLACE_OPTIONS, DEFAULT_REPLACE_FIELDS, new Set([a]), NOW, () => id("snap"));
  const node = r.project.game!.nodes.find((x) => x.id === a)!;
  const choice = node.elements.find((e) => e.kind === "choice")!;
  assert.equal(choice.text, "jump down the well?");
  assert.equal(choice.options[0].text, "Yes, jump");
  assert.equal(choice.options[0].to, p.game!.nodes[1].id);
  const r2 = applyReplace(p, "ann", "Bea", DEFAULT_REPLACE_OPTIONS, { content: false, title: false, summary: true }, new Set([a]), NOW, () => id("snap"));
  assert.equal(r2.project.game!.nodes.find((x) => x.id === a)!.summary, "Bea finds a key by the well.");
  assert.equal(r2.project.characters[0].name, "Ann");
  const none = applyReplace(p, "zzz", "x", DEFAULT_REPLACE_OPTIONS, DEFAULT_REPLACE_FIELDS, new Set([a]), NOW, () => id("snap"));
  assert.equal(none.project, p);
});

test("only the selected node can be replaced", () => {
  const { p, b } = story();
  assert.equal(planReplace(p, "well", "x", DEFAULT_REPLACE_OPTIONS, { content: true, title: true, summary: true }, b).scenes, 0);
});

// ─── Snapshots ───

test("a node snapshot holds the whole node and reads as text", () => {
  const { p, a } = story();
  const node = p.game!.nodes.find((x) => x.id === a)!;
  const s = makeNodeSnapshot(node, "manual", "before", NOW, "snap-x");
  assert.equal(s.scene_id, a);
  assert.equal(s.node!.elements.length, node.elements.length);
  assert.notEqual(s.node, node); // a copy
  const text = snapshotText(s, (c) => (c === "c-ann" ? "Ann" : ""));
  assert.match(text, /^The well/);
  assert.match(text, /Summary: Ann finds a key/);
  assert.match(text, /Ann \(whispers\): Is anyone down there\?/);
  assert.match(text, /Choice: Climb down the well\?\n {2}1\. Yes, climb/);
  assert.match(text, /Note: secret well note/);
  assert.ok(snapshotWords(s) > 5);
  assert.ok(nodeHasContent(node));
  assert.ok(!nodeHasContent(p.game!.nodes.find((x) => x.id !== a)!));
  assert.match(nodeToText({ title: "T", summary: "", elements: [], ending: true }), /may end here/);
});

test("auto snapshots: only when the writing changed, at most every 30 minutes", () => {
  const { p, a } = story();
  const before = p.game!.nodes.find((x) => x.id === a)!;
  const first = maybeAutoNodeSnapshot([], before, NOW, () => id("snap"));
  assert.equal(first.length, 1);
  assert.equal(first[0].kind, "auto");
  assert.equal(maybeAutoNodeSnapshot(first, before, NOW + 60_000, () => id("snap")).length, 1); // too soon
  assert.equal(maybeAutoNodeSnapshot(first, before, NOW + 3_600_000, () => id("snap")).length, 1); // unchanged writing
  const moved = { ...before, color: "red", order: 5 };
  assert.equal(maybeAutoNodeSnapshot(first, moved, NOW + 3_600_000, () => id("snap")).length, 1); // place and colour are not writing
  const edited = { ...before, summary: "changed" };
  assert.equal(maybeAutoNodeSnapshot(first, edited, NOW + 3_600_000, () => id("snap")).length, 2);
  assert.equal(maybeAutoNodeSnapshot([], p.game!.nodes.find((x) => x.id !== a)!, NOW, () => id("snap")).length, 0); // empty node
});

test("autoSnapshotNodes looks at what an edit changed", () => {
  const { p, a, b } = story();
  const edited = updateNode(p, a, { summary: "A different summary." });
  const next = autoSnapshotNodes(p, edited, NOW, () => id("snap"));
  assert.equal(next.snapshots.length, 1);
  assert.equal(next.snapshots[0].node!.summary, "Ann finds a key by the well.");
  assert.equal(autoSnapshotNodes(p, p, NOW, () => id("snap")), p);
  const other = updateNode(p, b, { title: "Cellar door" }); // b had nothing worth protecting
  assert.equal(autoSnapshotNodes(p, other, NOW, () => id("snap")), other);
});

test("deleting a node keeps a safety copy, and it can be brought back", () => {
  const { p, a, b, q } = story();
  const gone = deleteNodeKeeping(p, a, NOW, () => id("snap"));
  assert.equal(gone.game!.nodes.some((x) => x.id === a), false);
  assert.equal(gone.snapshots.length, 1);
  assert.equal(gone.snapshots[0].label, "Deleted node");
  assert.deepEqual(deletedScenes(gone).map((d) => d.sceneId), [a]);
  const back = applyRestore(gone, gone.snapshots[0].id, NOW, (k) => id(k));
  assert.equal(back.sceneId, a);
  const node = back.project.game!.nodes.find((x) => x.id === a)!;
  assert.equal(node.quest_id, q);
  assert.equal(node.order, gone.game!.nodes.filter((x) => x.quest_id === q).length); // back at the end of its quest
  assert.equal(node.summary, "Ann finds a key by the well.");
  // its way out to a node that still exists is kept
  assert.equal(node.links.length, 1);
  assert.equal(node.links[0].to, b);
  assert.deepEqual(deletedScenes(back.project).length, 0);
  // an empty node leaves no snapshot
  assert.equal(deleteNodeKeeping(p, b, NOW, () => id("snap")).snapshots.length, 0);
});

test("a deleted node comes back without ways out to nodes that are gone", () => {
  const { p, a, b } = story();
  let gone = deleteNodeKeeping(p, a, NOW, () => id("snap"));
  gone = deleteNodeKeeping(gone, b, NOW, () => id("snap"));
  const back = applyRestore(gone, gone.snapshots[0].id, NOW, (k) => id(k));
  const node = back.project.game!.nodes.find((x) => x.id === a)!;
  assert.equal(node.links.length, 0);
  assert.equal(node.elements.find((e) => e.kind === "choice")!.options[0].to, "");
});

test("restoring over an existing node saves the current one first and keeps its place", () => {
  const { p, a } = story();
  const snap = makeNodeSnapshot(p.game!.nodes.find((x) => x.id === a)!, "manual", "v1", NOW, "snap-v1");
  let q = { ...p, snapshots: [snap] };
  q = updateNode(q, a, { title: "Rewritten", summary: "New.", color: "red" });
  const r = applyRestore(q, "snap-v1", NOW + 1000, (k) => id(k));
  const node = r.project.game!.nodes.find((x) => x.id === a)!;
  assert.equal(node.title, "The well");
  assert.equal(node.summary, "Ann finds a key by the well.");
  assert.equal(node.color, "red"); // colour is not part of the writing
  assert.equal(r.project.snapshots.length, 2);
  assert.equal(r.project.snapshots[1].kind, "safety");
  assert.equal(r.project.snapshots[1].node!.title, "Rewritten");
  // restoring the same writing again changes nothing
  const again = applyRestore(r.project, "snap-v1", NOW + 2000, (k) => id(k));
  assert.equal(again.project, r.project);
  assert.equal(snapshotsFor(r.project.snapshots, a).length, 2);
});

test("restoring rules: effects and conditions come back too", () => {
  const { p, a } = story();
  let q = setRules(p, { kind: "node", nodeId: a }, "effects", [{ kind: "set", variable_id: "v1", to: true }]);
  const snap = makeNodeSnapshot(q.game!.nodes.find((x) => x.id === a)!, "manual", "", NOW, "s1");
  q = setRules({ ...q, snapshots: [snap] }, { kind: "node", nodeId: a }, "effects", []);
  const r = applyRestore(q, "s1", NOW, (k) => id(k));
  assert.equal(r.project.game!.nodes.find((x) => x.id === a)!.effects.length, 1);
  const node = restoreNodeInto(q.game!.nodes.find((x) => x.id === a)!, { ...snap, node: undefined }, new Set());
  assert.equal(node.effects.length, 0); // a snapshot without a node changes nothing
});

test("recreating a node into a quest that is gone uses the first quest", () => {
  const { p, a } = story();
  const snap = makeNodeSnapshot({ ...p.game!.nodes.find((x) => x.id === a)!, quest_id: "q-gone", plotline_id: "pl-gone", character_ids: ["c-ann", "c-none"] }, "safety", "", NOW, "s2");
  const restored = applyRestore({ ...deleteNodeKeeping(p, a, NOW, () => id("snap")), snapshots: [snap] }, "s2", NOW, (k) => id(k));
  const node = restored.project.game!.nodes.find((x) => x.id === a)!;
  assert.equal(node.quest_id, p.game!.quests[0].id);
  assert.equal(node.plotline_id, "");
  assert.deepEqual(node.character_ids, ["c-ann"]);
  const fresh = recreateNode(p, snap, p.game!.quests[0].id, () => "fresh-id"); // a still exists: new id
  assert.equal(fresh.id, "fresh-id");
});

// ─── The file ───

test("a snapshot's node survives loading, and a broken one is dropped", () => {
  const { p, a } = story();
  const snap = makeNodeSnapshot(p.game!.nodes.find((x) => x.id === a)!, "manual", "x", NOW, "s3");
  const loaded = migrateProject(JSON.parse(JSON.stringify({ ...p, snapshots: [snap, { ...snap, id: "s4", node: "nonsense" }] }))).project;
  assert.equal(loaded.snapshots[0].node!.elements.length, p.game!.nodes.find((x) => x.id === a)!.elements.length);
  assert.equal(loaded.snapshots[0].node!.links.length, 1); // the way out is kept even though this snapshot has no game around it
  assert.equal(loaded.snapshots[0].node!.elements.find((e) => e.kind === "choice")!.options[0].to !== "", true);
  assert.equal(loaded.snapshots[1].node, undefined);
  assert.equal(cleanNodeSnapshot(null), undefined);
  assert.equal(cleanNodeSnapshot({ title: "no id" }), undefined);
});

// ─── Word count ───

test("word stats count nodes (not notes) and quests", () => {
  const { p, a, b, q } = story();
  const s = wordStats(p);
  // narration 6 + dialogue 4 + choice prompt 4 = 14; the note and the option text are not counted
  assert.equal(s.byScene.get(a), 14);
  assert.equal(s.byScene.get(b), 0);
  assert.equal(s.byChapter.get(q), 14);
  assert.equal(s.total, 14);
});
