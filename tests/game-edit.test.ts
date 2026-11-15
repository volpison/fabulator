import { test } from "node:test";
import assert from "node:assert/strict";
import { blankProjectFor } from "../src/lib/blank.ts";
import { nodesInQuest } from "../src/lib/game.ts";
import {
  addNode, addQuest, deleteNode, deleteQuest, exitsOf, moveNode, moveQuest, nodeBadges, nodeIsEmpty, questSummary,
  removeCastFromNodes, updateNode, updateQuest,
} from "../src/lib/gameedit.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const id = (p: string) => `${p}-${++n}`;
const fresh = (): Project => blankProjectFor("game", id);
const orders = (p: Project, q: string) => nodesInQuest(p.game!.nodes, q).map((x) => [x.id, x.order]);

test("the first quest is the main quest, later ones are side-quests", () => {
  let p = fresh();
  p = addQuest(p, id).project;
  assert.deepEqual(p.game!.quests.map((q) => q.kind), ["main", "side"]);
  const empty = { ...p, game: { ...p.game!, quests: [] } };
  assert.equal(addQuest(empty, id).project.game!.quests[0].kind, "main");
});

test("nodes are added in order, into the chosen quest and position", () => {
  let p = fresh();
  const q = p.game!.quests[0].id;
  const a = addNode(p, id, q); p = a.project;
  const b = addNode(p, id, q); p = b.project;
  const c = addNode(p, id, q, 0); p = c.project; // at the front
  assert.deepEqual(orders(p, q), [[c.id, 0], [a.id, 1], [b.id, 2]]);
  assert.equal(p.game!.nodes.find((x) => x.id === a.id)!.plotline_id, p.plotlines[0].id);
});

test("adding a node to a game with no quest makes one", () => {
  const p = { ...fresh(), game: { quests: [], nodes: [], variables: [], items: [] } };
  const r = addNode(p, id);
  assert.equal(r.project.game!.quests.length, 1);
  assert.equal(r.project.game!.nodes[0].quest_id, r.project.game!.quests[0].id);
});

test("moving a node keeps the orders dense in both quests", () => {
  let p = fresh();
  p = addQuest(p, id).project;
  const [q1, q2] = p.game!.quests.map((q) => q.id);
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) { const r = addNode(p, id, q1); p = r.project; ids.push(r.id); }
  const r2 = addNode(p, id, q2); p = r2.project;
  p = moveNode(p, ids[0], q2, 0);
  assert.deepEqual(orders(p, q1), [[ids[1], 0], [ids[2], 1]]);
  assert.deepEqual(orders(p, q2), [[ids[0], 0], [r2.id, 1]]);
  assert.equal(moveNode(p, ids[0], q2, 0), p); // nothing to do: the same object
  p = moveNode(p, ids[2], q1, 0);
  assert.deepEqual(orders(p, q1), [[ids[2], 0], [ids[1], 1]]);
});

test("deleting a node closes the gap and cuts the links that led to it", () => {
  let p = fresh();
  const q = p.game!.quests[0].id;
  const a = addNode(p, id, q); p = a.project;
  const b = addNode(p, id, q); p = b.project;
  const c = addNode(p, id, q); p = c.project;
  p = {
    ...p,
    game: {
      ...p.game!,
      nodes: p.game!.nodes.map((x) =>
        x.id === a.id
          ? {
              ...x,
              links: [{ id: "l1", to: b.id, label: "", requires: [] }, { id: "l2", to: c.id, label: "", requires: [] }],
              elements: [{ id: "e1", kind: "choice" as const, speaker_id: "", parenthetical: "", text: "?", options: [{ id: "o1", text: "go", requires: [], effects: [], to: b.id }] }],
            }
          : x
      ),
    },
  };
  p = deleteNode(p, b.id);
  assert.deepEqual(orders(p, q), [[a.id, 0], [c.id, 1]]);
  const na = p.game!.nodes.find((x) => x.id === a.id)!;
  assert.deepEqual(na.links.map((l) => l.to), [c.id]);
  assert.equal(na.elements[0].options[0].to, ""); // the option stays, without a target
  assert.equal(na.elements[0].options[0].text, "go");
  assert.equal(deleteNode(p, "nope"), p);
});

test("only an empty quest can be deleted; quests can be moved and edited", () => {
  let p = fresh();
  p = addQuest(p, id).project;
  const [q1, q2] = p.game!.quests.map((q) => q.id);
  p = addNode(p, id, q1).project;
  assert.equal(deleteQuest(p, q1), p);
  assert.equal(deleteQuest(p, q2).game!.quests.length, 1);
  p = moveQuest(p, q2, 0);
  assert.deepEqual(p.game!.quests.map((q) => q.id), [q2, q1]);
  assert.equal(updateQuest(p, q1, { title: p.game!.quests[1].title }), p);
  assert.equal(updateQuest(p, q1, { kind: "bogus" as never }), p);
  assert.equal(updateQuest(p, q1, { kind: "side" }).game!.quests[1].kind, "side");
});

test("updating a node ignores bad values and no-op edits", () => {
  let p = fresh();
  const a = addNode(p, id); p = a.project;
  assert.equal(updateNode(p, a.id, { status: "nonsense" as never }), p);
  assert.equal(updateNode(p, a.id, { title: "" }), p);
  const q = updateNode(p, a.id, { title: "Search the well", ending: true, color: "bogus" });
  const node = q.game!.nodes.find((x) => x.id === a.id)!;
  assert.equal(node.title, "Search the well");
  assert.equal(node.ending, true);
  assert.equal(node.color, "");
});

test("badges, exits, summary and emptiness", () => {
  let p = fresh();
  const a = addNode(p, id); p = a.project;
  const b = addNode(p, id); p = b.project;
  const node = p.game!.nodes.find((x) => x.id === a.id)!;
  assert.equal(nodeIsEmpty(node), true);
  const rich = {
    ...node,
    requires: [{ kind: "flag" as const, variable_id: "v", set: true }],
    effects: [{ kind: "set" as const, variable_id: "v", to: true }],
    links: [{ id: "l", to: b.id, label: "", requires: [] }],
    elements: [{ id: "e", kind: "choice" as const, speaker_id: "", parenthetical: "", text: "Go?", options: [{ id: "o", text: "x", requires: [], effects: [], to: a.id }] }],
  };
  assert.equal(nodeIsEmpty(rich), false);
  assert.deepEqual(nodeBadges(rich), { requires: 1, effects: 1, exits: 2 });
  assert.deepEqual(exitsOf(rich), [b.id, a.id]);
  const q = p.game!.quests[0].id;
  const withRich = { ...p, game: { ...p.game!, nodes: p.game!.nodes.map((x) => (x.id === a.id ? rich : x)) } };
  assert.deepEqual(questSummary(withRich, q), { nodes: 2, words: 1, branches: 1 });
});

test("a deleted character or place leaves the nodes", () => {
  let p = fresh();
  const a = addNode(p, id); p = a.project;
  p = { ...p, game: { ...p.game!, nodes: p.game!.nodes.map((x) => ({ ...x, character_ids: ["c1", "c2"], place_ids: ["p1"] })) } };
  p = removeCastFromNodes(p, "character", "c1");
  assert.deepEqual(p.game!.nodes[0].character_ids, ["c2"]);
  assert.equal(removeCastFromNodes(p, "character", "zzz"), p);
  assert.deepEqual(removeCastFromNodes(p, "place", "p1").game!.nodes[0].place_ids, []);
});
