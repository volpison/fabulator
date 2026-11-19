import { test } from "node:test";
import assert from "node:assert/strict";
import { blankProjectFor } from "../src/lib/files/blank.ts";
import { addElement, addItem, addLink, addNode, addOption, addQuest, addVariable, setRules, updateElement, updateQuest, updateNode, updateOption } from "../src/lib/game/gameedit.ts";
import { DEFAULT_OPTIONS, exportPreview, exportProject } from "../src/lib/export/index.ts";
import { buildGameBook, gameNodesFor, nodesCsv, stateCsv, stateUsage } from "../src/lib/export/game.ts";
import { renderMarkdown } from "../src/lib/export/markdown.ts";
import { gameToFolder } from "../src/lib/files/gamefolder.ts";
import { fromFolder } from "../src/lib/files/folder.ts";
import type { Project } from "../src/lib/model/types.ts";

let n = 0;
const id = (p: string) => `${p}-${++n}`;

function story() {
  let p: Project = blankProjectFor("game", id);
  p = { ...p, title: "Test Game", characters: [{ id: "c-ann", name: "Ann", aliases: [], description: "", role: "", category: "", traits: [], notes: "" }] };
  // a new game starts with one empty main quest: use it
  const q = { id: p.game!.quests[0].id };
  p = updateQuest(p, q.id, { title: "The Fall" });
  const q2 = addQuest(p, id, "Side job"); p = q2.project;
  const a = addNode(p, id, q.id); p = a.project;
  const b = addNode(p, id, q.id); p = b.project;
  const s = addNode(p, id, q2.id); p = s.project;
  p = updateNode(p, a.id, { title: "The well", summary: "Ann finds a key." });
  p = updateNode(p, b.id, { title: "The cellar", ending: true });
  p = updateNode(p, s.id, { title: "Odd job" });
  const flag = addVariable(p, id, "flag", "Met, the beggar"); p = flag.project;
  const key = addItem(p, id, "Cellar key"); p = key.project;
  p = addVariable(p, id, "number", "Unused").project;
  const nar = addElement(p, id, a.id, "narration"); p = nar.project;
  p = updateElement(p, a.id, nar.id, { text: "It is dark." });
  const dia = addElement(p, id, a.id, "dialogue", undefined, "c-ann"); p = dia.project;
  p = updateElement(p, a.id, dia.id, { text: "Hello there", parenthetical: "whispers" });
  const ch = addElement(p, id, a.id, "choice"); p = ch.project;
  p = updateElement(p, a.id, ch.id, { text: "Go down?" });
  const o = addOption(p, id, a.id, ch.id); p = o.project;
  p = updateOption(p, a.id, ch.id, o.id, { text: "Yes", to: b.id });
  p = setRules(p, { kind: "option", nodeId: a.id, elementId: ch.id, optionId: o.id }, "effects", [{ kind: "set", variable_id: flag.id, to: true }]);
  p = setRules(p, { kind: "node", nodeId: a.id }, "effects", [{ kind: "give", item_id: key.id, amount: 1 }]);
  p = setRules(p, { kind: "node", nodeId: b.id }, "requires", [{ kind: "item", item_id: key.id, min: 1 }]);
  p = addLink(p, id, s.id, a.id).project;
  return { p, q: q.id, q2: q2.id, a: a.id, b: b.id, s: s.id, flag: flag.id, key: key.id };
}

const opts = (over = {}) => ({ ...DEFAULT_OPTIONS, ...over });

test("scope: all, the quest of a node, one node", () => {
  const { p, a, b, s } = story();
  assert.deepEqual(gameNodesFor(p, opts()).map((x) => x.id), [a, b, s]);
  assert.deepEqual(gameNodesFor(p, opts({ scope: "chapter", sceneId: b })).map((x) => x.id), [a, b]);
  assert.deepEqual(gameNodesFor(p, opts({ scope: "scene", sceneId: s })).map((x) => x.id), [s]);
  assert.deepEqual(gameNodesFor(p, opts({ scope: "scene", sceneId: "nope" })), []);
  assert.deepEqual(gameNodesFor(blankProjectFor("novel", id), opts()), []);
});

test("the quest bible reads as text with rules in words", () => {
  const { p } = story();
  const md = renderMarkdown(buildGameBook(p, opts()));
  assert.match(md, /# Test Game/);
  assert.match(md, /Main quest 1: The Fall/);
  assert.match(md, /1\.1 The well/);
  assert.match(md, /It is dark\./);
  assert.match(md, /\*\*ANN\*\* \*\(whispers\)\*: Hello there/);
  assert.match(md, /Go down\?/);
  assert.match(md, /Yes → 1\.2 “The cellar” \(then sets Met, the beggar\)/);
  assert.match(md, /\*\*Available when\*\* has Cellar key/);
  assert.match(md, /\*\*Then\*\* gives 1 × Cellar key/);
  assert.match(md, /1\.2 The cellar \(ending\)/);
  assert.match(md, /## State/);
  assert.match(md, /Cellar key\*\* \(item\): read in Node 1\.2/);
  assert.match(md, /Unused\*\* \(number\): never read; never set/);
});

test("a node scope leaves out the State chapter", () => {
  const { p, a } = story();
  const book = buildGameBook(p, opts({ scope: "scene", sceneId: a }));
  assert.equal(book.chapters.length, 1);
  assert.equal(book.chapters[0].scenes.length, 1);
});

test("counts count nodes and quests, not the State chapter", () => {
  const { p } = story();
  assert.deepEqual(exportPreview(p, opts()), { scenes: 3, chapters: 2 });
  const r = exportProject(p, opts({ format: "markdown" }));
  assert.equal(r.scenes, 3);
  assert.equal(r.chapters, 2);
  assert.match(r.fileName, /Test Game \(quest bible\)\.md$/);
  assert.ok(exportProject(p, opts({ format: "docx" })).bytes.length > 500);
});

test("node CSV: one row per node, quoted properly", () => {
  const { p } = story();
  const rows = nodesCsv(p).trimEnd().split("\r\n");
  assert.equal(rows.length, 4);
  assert.match(rows[0], /^Node,Quest,Kind,Title/);
  assert.match(rows[1], /^1\.1,The Fall,Main quest,The well,/);
  assert.match(rows[1], /1\.2 The cellar/);
  assert.match(rows[2], /Available when|Has Cellar key/i);
  assert.match(rows[2], /,yes,/);
  const r = exportProject(p, opts({ gameKind: "nodes-csv" }));
  assert.equal(r.fileName, "Test Game (nodes).csv");
  assert.equal(r.bytes[0], 0xef); // byte-order mark
  assert.equal(r.scenes, 3);
});

test("state CSV: where each is read and set; commas are quoted", () => {
  const { p } = story();
  const text = stateCsv(p);
  assert.match(text, /"Met, the beggar"/);
  const u = stateUsage(p);
  assert.equal(u.items.size, 1);
  const rows = text.trimEnd().split("\r\n");
  assert.equal(rows.length, 4);
  assert.match(rows[0], /^Kind,Name,Notes,Read in,Set in,Read,Set$/);
  const r = exportProject(p, opts({ gameKind: "state-csv" }));
  assert.equal(r.fileName, "Test Game (state).csv");
  assert.equal(r.scenes, 3);
});

test("the folder: project, state, a folder per quest, a file per node", () => {
  const { p } = story();
  const files = gameToFolder(p);
  const paths = files.map((f) => f.path);
  assert.ok(paths.includes("project.json"));
  assert.ok(paths.includes("state.md"));
  assert.ok(paths.includes("quests/01-the-fall/_quest.md"));
  assert.ok(paths.includes("quests/01-the-fall/01-the-well.md"));
  assert.ok(paths.includes("quests/01-the-fall/02-the-cellar.md"));
  assert.ok(paths.includes("quests/02-side-job/01-odd-job.md"));
  const well = files.find((f) => f.path.endsWith("01-the-well.md"))!.text;
  assert.match(well, /^---\n/);
  assert.match(well, /number: "1\.1"/);
  assert.match(well, /effects: \["gives 1 × Cellar key"\]/);
  assert.match(well, /It is dark\./);
  assert.ok(!well.includes("Then gives")); // the header already says it
  const meta = JSON.parse(files.find((f) => f.path === "project.json")!.text);
  assert.equal(meta.story_format, "game");
  assert.equal(meta.game.items.length, 1);
});

test("a game folder is not opened as a novel", () => {
  const { p } = story();
  const r = fromFolder(gameToFolder(p), id);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /holds a game/);
});
