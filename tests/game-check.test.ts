import { test } from "node:test";
import assert from "node:assert/strict";
import { blankProjectFor } from "../src/lib/blank.ts";
import { addElement, addItem, addLink, addNode, addOption, addQuest, addVariable, setRules, updateNode, updateOption } from "../src/lib/gameedit.ts";
import { analyse, checkGame, countIssues } from "../src/lib/gamecheck.ts";
import { abilityKey, applyEffects, availableNodes, candidates, chooseOption, emptyState, holds, openExits, playNode } from "../src/lib/gameplay.ts";
import { layoutGraph } from "../src/lib/gamegraph.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const id = (p: string) => `${p}-${++n}`;

/** A quest with three nodes: A → B → C, plus a flag, a number and an item. */
function story() {
  let p: Project = blankProjectFor("game", id);
  const q = addQuest(p, id, "Main"); p = q.project;
  const a = addNode(p, id, q.id); p = a.project;
  const b = addNode(p, id, q.id); p = b.project;
  const c = addNode(p, id, q.id); p = c.project;
  p = updateNode(p, a.id, { title: "A" });
  p = updateNode(p, b.id, { title: "B" });
  p = updateNode(p, c.id, { title: "C", ending: true });
  p = addLink(p, id, a.id, b.id).project;
  p = addLink(p, id, b.id, c.id).project;
  const flag = addVariable(p, id, "flag", "Met"); p = flag.project;
  const num = addVariable(p, id, "number", "Rep"); p = num.project;
  const key = addItem(p, id, "Key"); p = key.project;
  return { p, q: q.id, a: a.id, b: b.id, c: c.id, flag: flag.id, num: num.id, key: key.id };
}

const kinds = (p: Project) => checkGame(p).map((i) => i.kind);

test("a clean chain has nothing to report but unused state", () => {
  const { p } = story();
  const k = kinds(p);
  assert.deepEqual(k.filter((x) => x !== "unused" && x !== "quest-empty"), []);
});

test("unreachable: nothing leads to a node", () => {
  let { p, q } = story();
  const d = addNode(p, id, q); p = d.project;
  p = updateNode(p, d.id, { title: "Island", ending: true });
  const issues = checkGame(p).filter((i) => i.kind === "unreachable");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].nodeId, d.id);
  assert.match(issues[0].message, /no way out of any other node leads here/);
});

test("unreachable: a condition nothing can satisfy", () => {
  let { p, b, flag } = story();
  p = setRules(p, { kind: "node", nodeId: b }, "requires", [{ kind: "flag", variable_id: flag, set: true }]);
  const issues = checkGame(p);
  assert.ok(issues.some((i) => i.kind === "unreachable" && i.nodeId === b));
  assert.ok(issues.some((i) => i.kind === "never-set" && i.nodeId === b));
});

test("a condition something does satisfy is fine", () => {
  let { p, a, b, flag } = story();
  p = setRules(p, { kind: "node", nodeId: a }, "effects", [{ kind: "set", variable_id: flag, to: true }]);
  p = setRules(p, { kind: "node", nodeId: b }, "requires", [{ kind: "flag", variable_id: flag, set: true }]);
  assert.deepEqual(kinds(p).filter((x) => x === "unreachable" || x === "never-set"), []);
});

test("numbers: reachable bounds decide", () => {
  let { p, a, b, num } = story();
  p = setRules(p, { kind: "node", nodeId: a }, "effects", [{ kind: "add", variable_id: num, amount: 2 }]);
  p = setRules(p, { kind: "node", nodeId: b }, "requires", [{ kind: "number", variable_id: num, op: ">=", value: 3 }]);
  assert.ok(kinds(p).includes("unreachable"));
  p = setRules(p, { kind: "node", nodeId: b }, "requires", [{ kind: "number", variable_id: num, op: ">=", value: 2 }]);
  assert.ok(!kinds(p).includes("unreachable"));
});

test("an item given by an option on the way counts", () => {
  let { p, a, b, key } = story();
  const e = addElement(p, id, a, "choice"); p = e.project;
  const o = addOption(p, id, a, e.id); p = o.project;
  p = setRules(p, { kind: "option", nodeId: a, elementId: e.id, optionId: o.id }, "effects", [{ kind: "give", item_id: key, amount: 1 }]);
  p = setRules(p, { kind: "node", nodeId: b }, "requires", [{ kind: "item", item_id: key, min: 1 }]);
  assert.ok(!kinds(p).includes("unreachable"));
});

test("a quest that is never offered", () => {
  let { p, q, flag } = story();
  p = setRules(p, { kind: "quest", questId: q }, "requires", [{ kind: "flag", variable_id: flag, set: true }]);
  const issues = checkGame(p);
  assert.ok(issues.some((i) => i.kind === "quest-closed" && i.questId === q));
  // the first node is not also reported on its own account
  assert.equal(issues.filter((i) => i.kind === "unreachable" && i.message.includes("“A”")).length, 0);
});

test("an empty quest is only a note", () => {
  let { p } = story();
  p = addQuest(p, id, "Side").project;
  const i = checkGame(p).find((x) => x.kind === "quest-empty");
  assert.equal(i?.severity, "info");
});

test("dead end, and an ending is not one", () => {
  let { p, c } = story();
  assert.ok(!kinds(p).includes("dead-end"));
  p = updateNode(p, c, { ending: false });
  assert.ok(kinds(p).includes("dead-end"));
});

test("every way out conditional: the player may get stuck", () => {
  let { p, a, flag } = story();
  const link = p.game!.nodes.find((x) => x.id === a)!.links[0];
  p = setRules(p, { kind: "link", nodeId: a, linkId: link.id }, "requires", [{ kind: "flag", variable_id: flag, set: false }]);
  assert.ok(kinds(p).includes("may-stick"));
});

test("an option that leads nowhere, and one that does", () => {
  let { p, a, b } = story();
  const e = addElement(p, id, a, "choice"); p = e.project;
  const o = addOption(p, id, a, e.id); p = o.project;
  assert.ok(kinds(p).includes("option-nowhere"));
  p = updateOption(p, a, e.id, o.id, { to: b });
  assert.ok(!kinds(p).includes("option-nowhere"));
});

test("undeclared references are named", () => {
  let { p, a } = story();
  p = setRules(p, { kind: "node", nodeId: a }, "effects", [{ kind: "give", item_id: "ghost", amount: 1 }]);
  const i = checkGame(p).find((x) => x.kind === "undeclared");
  assert.match(i!.message, /item “ghost”/);
  assert.equal(i!.nodeId, a);
});

test("two ways out with the same conditions are ambiguous", () => {
  let { p, a, c } = story();
  p = addLink(p, id, a, c).project;
  assert.ok(kinds(p).includes("ambiguous"));
});

test("state that is set but never read, and declared but unused", () => {
  let { p, a, flag, num } = story();
  p = setRules(p, { kind: "node", nodeId: a }, "effects", [{ kind: "set", variable_id: flag, to: true }]);
  const msgs = checkGame(p).filter((i) => i.severity === "info");
  assert.ok(msgs.some((i) => i.kind === "set-never-read" && i.message.includes("Met")));
  assert.ok(msgs.some((i) => i.kind === "unused" && i.message.includes("Rep")));
  assert.ok(num);
});

test("issues are sorted by severity and counted", () => {
  let { p, q, flag } = story();
  p = setRules(p, { kind: "quest", questId: q }, "requires", [{ kind: "flag", variable_id: flag, set: true }]);
  const list = checkGame(p);
  const order = list.map((i) => i.severity);
  assert.deepEqual(order, [...order].sort((x, y) => ["error", "warning", "info"].indexOf(x) - ["error", "warning", "info"].indexOf(y)));
  const c = countIssues(list);
  assert.equal(c.error + c.warning + c.info, list.length);
});

test("a project without a game has nothing to check", () => {
  const p = blankProjectFor("novel", id);
  assert.deepEqual(checkGame(p), []);
  assert.equal(analyse(p).reachable.size, 0);
});

// ─── Playtest ───

test("playtest: first node is available, playing it opens the next", () => {
  const { p, a, b } = story();
  let s = emptyState();
  assert.deepEqual(availableNodes(p, s).map((x) => x.node.id), [a]);
  s = playNode(p, s, a);
  assert.deepEqual(s.done, [a]);
  assert.deepEqual(availableNodes(p, s).map((x) => x.node.id), [b]);
  assert.equal(playNode(p, s, a), s); // already done: unchanged
});

test("playtest: effects change the state, conditions gate nodes", () => {
  let { p, a, b, flag, num, key } = story();
  p = setRules(p, { kind: "node", nodeId: a }, "effects", [
    { kind: "set", variable_id: flag, to: true },
    { kind: "add", variable_id: num, amount: 3 },
    { kind: "give", item_id: key, amount: 2 },
    { kind: "grant", character_id: "", ability_id: "ab-x" },
  ]);
  p = setRules(p, { kind: "node", nodeId: b }, "requires", [{ kind: "number", variable_id: num, op: ">=", value: 4 }]);
  const s = playNode(p, emptyState(), a);
  assert.deepEqual(s.flags, [flag]);
  assert.equal(s.numbers[num], 3);
  assert.equal(s.items[key], 2);
  assert.deepEqual(s.abilities, [abilityKey("", "ab-x")]);
  assert.equal(availableNodes(p, s).length, 0);
  const c = candidates(p, s).find((x) => x.node.id === b)!;
  assert.deepEqual(c.unmet, ["Rep ≥ 4"]);
  assert.deepEqual(c.from, [a]);
  const more = applyEffects(s, [{ kind: "add", variable_id: num, amount: 1 }]);
  assert.deepEqual(availableNodes(p, more).map((x) => x.node.id), [b]);
});

test("playtest: taking items never goes below zero and zero is removed", () => {
  const s = applyEffects(emptyState(), [{ kind: "give", item_id: "k", amount: 1 }, { kind: "give", item_id: "k", amount: -5 }, { kind: "add", variable_id: "v", amount: 2 }, { kind: "add", variable_id: "v", amount: -2 }]);
  assert.deepEqual(s.items, {});
  assert.deepEqual(s.numbers, {});
});

test("playtest: choosing an option applies its effects; closed options are not open", () => {
  let { p, a, b, flag } = story();
  const e = addElement(p, id, a, "choice"); p = e.project;
  const o = addOption(p, id, a, e.id); p = o.project;
  p = updateOption(p, a, e.id, o.id, { to: b });
  p = setRules(p, { kind: "option", nodeId: a, elementId: e.id, optionId: o.id }, "effects", [{ kind: "set", variable_id: flag, to: true }]);
  let s = playNode(p, emptyState(), a);
  assert.equal(openExits(p, s, p.game!.nodes.find((x) => x.id === a)!).length, 2);
  s = chooseOption(p, s, a, e.id, o.id);
  assert.deepEqual(s.flags, [flag]);
  p = setRules(p, { kind: "option", nodeId: a, elementId: e.id, optionId: o.id }, "requires", [{ kind: "flag", variable_id: "other", set: true }]);
  assert.equal(openExits(p, s, p.game!.nodes.find((x) => x.id === a)!).length, 1);
});

test("playtest: conditions on abilities, done nodes and 'any'", () => {
  const p = blankProjectFor("game", id);
  const withAnn: Pick<Project, "characters"> = { characters: [{ ...(p.characters[0] ?? { id: "", name: "", aliases: [], description: "", role: "", category: "", traits: [], notes: "" }), id: "c1", ability_ids: ["ab1"] }] };
  const s = { ...emptyState(), done: ["n1"] };
  assert.ok(holds(withAnn, s, { kind: "ability", character_id: "c1", ability_id: "ab1" }));
  assert.ok(!holds(withAnn, s, { kind: "ability", character_id: "", ability_id: "ab1" }));
  assert.ok(holds(withAnn, s, { kind: "done", node_id: "n1" }));
  assert.ok(holds(withAnn, s, { kind: "any", of: [{ kind: "done", node_id: "zz" }, { kind: "done", node_id: "n1" }] }));
  assert.ok(!holds(withAnn, s, { kind: "any", of: [] }));
});

// ─── Graph ───

test("graph: a chain goes left to right, one row", () => {
  const { p, a, b, c } = story();
  const g = layoutGraph(p, null);
  const at = (x: string) => g.nodes.find((y) => y.id === x)!;
  assert.deepEqual([at(a).layer, at(b).layer, at(c).layer], [0, 1, 2]);
  assert.ok(at(b).x > at(a).x);
  assert.equal(g.edges.length, 2);
  assert.ok(g.edges.every((e) => !e.back));
  assert.ok(g.width > 0 && g.height > 0);
});

test("graph: a branch puts siblings in the same layer, different rows", () => {
  let { p, a, b, c } = story();
  p = addLink(p, id, a, c).project;
  const g = layoutGraph(p, null);
  const at = (x: string) => g.nodes.find((y) => y.id === x)!;
  assert.equal(at(c).layer, 2); // longest path wins
  assert.equal(at(b).layer, 1);
  p = { ...p, game: { ...p.game!, nodes: p.game!.nodes.map((x) => x) } };
});

test("graph: a loop back is marked and does not break the layers", () => {
  let { p, a, c } = story();
  p = updateNode(p, c, { ending: false });
  p = addLink(p, id, c, a).project;
  const g = layoutGraph(p, null);
  const back = g.edges.filter((e) => e.back);
  assert.equal(back.length, 1);
  assert.equal(back[0].from, c);
  assert.equal(g.nodes.find((x) => x.id === a)!.layer, 0);
});

test("graph: conditional edges are flagged; one quest only shows its own nodes", () => {
  let { p, q, a, flag } = story();
  const link = p.game!.nodes.find((x) => x.id === a)!.links[0];
  p = setRules(p, { kind: "link", nodeId: a, linkId: link.id }, "requires", [{ kind: "flag", variable_id: flag, set: true }]);
  const side = addQuest(p, id, "Side"); p = side.project;
  const s1 = addNode(p, id, side.id); p = s1.project;
  const g = layoutGraph(p, q);
  assert.equal(g.nodes.length, 3);
  assert.ok(g.edges.some((e) => e.conditional));
  assert.equal(layoutGraph(p, null).nodes.length, 4);
  assert.equal(layoutGraph(p, side.id).nodes[0].id, s1.id);
  assert.equal(layoutGraph(p, "nope").nodes.length, 0);
});

test("graph: no game, no graph", () => {
  const g = layoutGraph(blankProjectFor("novel", id), null);
  assert.deepEqual(g, { nodes: [], edges: [], width: 0, height: 0 });
});
