import { test } from "node:test";
import assert from "node:assert/strict";
import { CURRENT_SCHEMA_VERSION, MIN_READER_VERSION, migrateProject } from "../src/lib/migrate.ts";
import { blankProjectFor } from "../src/lib/blank.ts";
import { STORY_FORMATS, readyFormats, readStoryFormat } from "../src/lib/formats.ts";
import { cleanConditions, cleanEffects, cleanGame, nodesInQuest } from "../src/lib/game.ts";

const ids = (p: string) => `${p}-1`;
const blank = () => JSON.parse(JSON.stringify(blankProjectFor("game", ids)));

test("game is a known format that is not ready yet", () => {
  assert.equal(readStoryFormat("game"), "game");
  assert.equal(STORY_FORMATS.game.ready, false);
  assert.equal(readyFormats().some((f) => f.id === "game"), false);
  assert.equal(STORY_FORMATS.game.vocabulary.group.one, "quest");
});

test("a new game project has one main quest and keeps readers back at version 12", () => {
  const p = blankProjectFor("game", ids);
  assert.equal(p.story_format, "game");
  assert.equal(p.game?.quests.length, 1);
  assert.equal(p.game?.quests[0].kind, "main");
  assert.equal(p.schema_version, CURRENT_SCHEMA_VERSION);
  assert.equal(p.min_reader_version, MIN_READER_VERSION);
  assert.equal(MIN_READER_VERSION, 12);
});

test("a game project survives loading, and other formats carry no game", () => {
  const { project } = migrateProject(blank());
  assert.equal(project.game?.quests[0].title, "Main quest");
  const novel = blank();
  novel.story_format = "novel";
  assert.equal("game" in migrateProject(novel).project, false);
});

test("a v12 file is upgraded to v13 without changing anything else", () => {
  const old = JSON.parse(JSON.stringify(blankProjectFor("screenplay", ids)));
  old.schema_version = 12;
  const r = migrateProject(old);
  assert.equal(r.migratedFrom, 12);
  assert.equal(r.project.schema_version, 13);
  assert.equal(r.project.min_reader_version, 12);
});

test("unreadable conditions and effects are dropped, odd ones are kept", () => {
  const c = cleanConditions([
    { kind: "flag", variable_id: "undeclared", set: false },
    { kind: "number", variable_id: "rep", op: "??", value: "x" },
    { kind: "item", item_id: "key", min: 0 },
    { kind: "any", of: [{ kind: "done", node_id: "n" }, { kind: "bogus" }] },
    { kind: "any", of: [] },
    { kind: "nonsense" },
    "text",
  ]);
  assert.deepEqual(c, [
    { kind: "flag", variable_id: "undeclared", set: false },
    { kind: "number", variable_id: "rep", op: "=", value: 0 },
    { kind: "item", item_id: "key", min: 1 },
    { kind: "any", of: [{ kind: "done", node_id: "n" }] },
  ]);
  assert.deepEqual(cleanEffects([{ kind: "add", variable_id: "rep" }, { kind: "give", item_id: "key", amount: -1 }, { kind: "x" }]), [
    { kind: "add", variable_id: "rep", amount: 1 },
    { kind: "give", item_id: "key", amount: -1 },
  ]);
});

test("nodes live in a real quest, in order, and never link to a node that is gone", () => {
  const g = cleanGame({
    quests: [{ id: "q1", title: "A" }, { id: "q1", title: "B", kind: "main" }],
    nodes: [
      { id: "a", quest_id: "q1", order: 5, links: [{ to: "b" }, { to: "gone" }] },
      { id: "b", quest_id: "missing", order: 1, elements: [{ kind: "choice", text: "?", options: [{ text: "x", to: "a" }, { text: "y", to: "gone" }] }] },
    ],
  });
  assert.equal(new Set(g.quests.map((q) => q.id)).size, 2); // the repeated id was made unique
  assert.equal(g.quests[1].kind, "main");
  assert.equal(g.nodes[1].quest_id, "q1"); // moved to the first quest
  assert.deepEqual(nodesInQuest(g.nodes, "q1").map((n) => [n.id, n.order]), [["b", 0], ["a", 1]]);
  assert.deepEqual(g.nodes[0].links.map((l) => l.to), ["b"]);
  assert.deepEqual(g.nodes[1].elements[0].options.map((o) => o.to), ["a", ""]);
  assert.equal(g.nodes[0].status, "idea");
});

test("nodes without any quest get one, and unknown fields are kept", () => {
  const g = cleanGame({ nodes: [{ id: "n", title: "Start", future_field: 1 }], extra_top: true, variables: [{ id: "v", kind: "number", label: "Rep" }] });
  assert.equal(g.quests.length, 1);
  assert.equal(g.nodes[0].quest_id, g.quests[0].id);
  assert.equal((g.nodes[0] as unknown as { future_field: number }).future_field, 1);
  assert.equal((g as unknown as { extra_top: boolean }).extra_top, true);
  assert.equal(g.variables[0].kind, "number");
});

test("a game project round-trips through loading unchanged once clean", () => {
  const once = migrateProject(blank()).project;
  const twice = migrateProject(JSON.parse(JSON.stringify(once))).project;
  assert.deepEqual(twice, once);
});
