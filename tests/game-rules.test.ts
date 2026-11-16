import { test } from "node:test";
import assert from "node:assert/strict";
import { blankProjectFor } from "../src/lib/blank.ts";
import { addElement, addLink, addNode, addOption, addItem, addQuest, addVariable, deleteItem, deleteVariable, setRules, updateItem, updateVariable } from "../src/lib/gameedit.ts";
import { blankCondition, blankEffect, contextOf, describeCondition, describeConditions, describeEffect, describeEffects, itemUsage, variableUsage } from "../src/lib/gamerules.ts";
import type { Project } from "../src/lib/types.ts";

let n = 0;
const id = (p: string) => `${p}-${++n}`;

function world() {
  let p: Project = blankProjectFor("game", id);
  p = { ...p, characters: [{ id: "c-ann", name: "Ann", aliases: [], description: "", role: "", category: "", traits: [], notes: "" }], abilities: [{ id: "ab-climb", name: "Climbing", aliases: [], description: "", notes: "" }] };
  const flag = addVariable(p, id, "flag", "Met the beggar"); p = flag.project;
  const num = addVariable(p, id, "number", "Reputation"); p = num.project;
  const key = addItem(p, id, "Cellar key"); p = key.project;
  const a = addNode(p, id); p = a.project;
  p = { ...p, game: { ...p.game!, nodes: p.game!.nodes.map((x) => ({ ...x, title: "Search the well" })) } };
  return { p, flag: flag.id, num: num.id, key: key.id, node: a.id };
}

test("conditions read as plain text", () => {
  const { p, flag, num, key, node } = world();
  const c = contextOf(p);
  assert.equal(describeCondition(c, { kind: "flag", variable_id: flag, set: true }), "Met the beggar is set");
  assert.equal(describeCondition(c, { kind: "flag", variable_id: flag, set: false }), "Met the beggar is not set");
  assert.equal(describeCondition(c, { kind: "number", variable_id: num, op: ">=", value: 1 }), "Reputation ≥ 1");
  assert.equal(describeCondition(c, { kind: "number", variable_id: num, op: "!=", value: 0 }), "Reputation ≠ 0");
  assert.equal(describeCondition(c, { kind: "item", item_id: key, min: 1 }), "has Cellar key");
  assert.equal(describeCondition(c, { kind: "item", item_id: key, min: 3 }), "has 3 × Cellar key");
  assert.equal(describeCondition(c, { kind: "ability", character_id: "", ability_id: "ab-climb" }), "The player can Climbing");
  assert.equal(describeCondition(c, { kind: "ability", character_id: "c-ann", ability_id: "ab-climb" }), "Ann can Climbing");
  assert.equal(describeCondition(c, { kind: "done", node_id: node }), "“Search the well” is done");
  assert.equal(
    describeCondition(c, { kind: "any", of: [{ kind: "flag", variable_id: flag, set: true }, { kind: "item", item_id: key, min: 1 }] }),
    "any of: Met the beggar is set or has Cellar key"
  );
  assert.equal(
    describeConditions(c, [{ kind: "flag", variable_id: flag, set: true }, { kind: "number", variable_id: num, op: "<", value: 5 }]),
    "Met the beggar is set and Reputation < 5"
  );
  assert.equal(describeConditions(c, []), "");
});

test("something nobody declared is shown, not hidden", () => {
  const { p } = world();
  const c = contextOf(p);
  assert.equal(describeCondition(c, { kind: "flag", variable_id: "ghost", set: true }), "“ghost” (not declared) is set");
  assert.equal(describeCondition(c, { kind: "done", node_id: "gone" }), "“gone” (not declared) is done");
  assert.equal(describeEffect(c, { kind: "give", item_id: "nothing", amount: 1 }), "gives 1 × “nothing” (not declared)");
});

test("effects read as plain text", () => {
  const { p, flag, num, key } = world();
  const c = contextOf(p);
  assert.equal(describeEffect(c, { kind: "set", variable_id: flag, to: true }), "sets Met the beggar");
  assert.equal(describeEffect(c, { kind: "set", variable_id: flag, to: false }), "clears Met the beggar");
  assert.equal(describeEffect(c, { kind: "add", variable_id: num, amount: 2 }), "Reputation +2");
  assert.equal(describeEffect(c, { kind: "add", variable_id: num, amount: -1 }), "Reputation −1");
  assert.equal(describeEffect(c, { kind: "give", item_id: key, amount: 2 }), "gives 2 × Cellar key");
  assert.equal(describeEffect(c, { kind: "give", item_id: key, amount: -1 }), "takes 1 × Cellar key");
  assert.equal(describeEffect(c, { kind: "grant", character_id: "c-ann", ability_id: "ab-climb" }), "Ann learns Climbing");
  assert.equal(describeEffects(c, [{ kind: "set", variable_id: flag, to: true }, { kind: "add", variable_id: num, amount: 1 }]), "sets Met the beggar, Reputation +1");
});

test("the registry: add, rename, change kind, delete", () => {
  const { p, flag, key } = world();
  assert.equal(p.game!.variables.length, 2);
  const renamed = updateVariable(p, flag, { label: "Knows the beggar" });
  assert.equal(renamed.game!.variables[0].label, "Knows the beggar");
  assert.equal(updateVariable(renamed, flag, { label: "Knows the beggar" }), renamed);
  assert.equal(updateVariable(p, flag, { kind: "weird" as never }), p);
  assert.equal(deleteVariable(p, flag).game!.variables.length, 1);
  assert.equal(deleteVariable(p, "nope"), p);
  assert.equal(updateItem(p, key, { name: "Rusty key" }).game!.items[0].name, "Rusty key");
  assert.equal(deleteItem(p, key).game!.items.length, 0);
});

test("setRules puts cleaned conditions and effects on a node, a link, an option and a quest", () => {
  const { p: p0, flag, key, node } = world();
  let p = p0;
  const b = addNode(p, id); p = b.project;
  const l = addLink(p, id, node, b.id); p = l.project;
  const choice = addElement(p, id, node, "choice"); p = choice.project;
  const opt = addOption(p, id, node, choice.id); p = opt.project;
  const quest = p.game!.quests[0].id;

  p = setRules(p, { kind: "node", nodeId: node }, "requires", [{ kind: "flag", variable_id: flag, set: true }, { kind: "bogus" }]);
  assert.deepEqual(p.game!.nodes[0].requires, [{ kind: "flag", variable_id: flag, set: true }]); // the bogus row was dropped
  p = setRules(p, { kind: "node", nodeId: node }, "effects", [{ kind: "give", item_id: key, amount: 1 }]);
  assert.equal(p.game!.nodes[0].effects.length, 1);
  p = setRules(p, { kind: "link", nodeId: node, linkId: l.id }, "requires", [{ kind: "item", item_id: key, min: 1 }]);
  assert.equal(p.game!.nodes[0].links[0].requires.length, 1);
  p = setRules(p, { kind: "option", nodeId: node, elementId: choice.id, optionId: opt.id }, "effects", [{ kind: "set", variable_id: flag, to: true }]);
  assert.equal(p.game!.nodes[0].elements[0].options[0].effects.length, 1);
  p = setRules(p, { kind: "quest", questId: quest }, "requires", [{ kind: "done", node_id: node }]);
  assert.equal(p.game!.quests[0].requires.length, 1);

  // No change, or a list the target does not have: the same project comes back.
  assert.equal(setRules(p, { kind: "node", nodeId: node }, "effects", [{ kind: "give", item_id: key, amount: 1 }]), p);
  assert.equal(setRules(p, { kind: "quest", questId: quest }, "effects", []), p);
  assert.equal(setRules(p, { kind: "link", nodeId: node, linkId: l.id }, "effects", []), p);
  assert.equal(setRules(p, { kind: "node", nodeId: "ghost" }, "requires", []), p);
  void addQuest;
});

test("usage counts read and written places, including inside 'any of'", () => {
  const { p: p0, flag, num, key, node } = world();
  let p = p0;
  p = setRules(p, { kind: "node", nodeId: node }, "requires", [
    { kind: "flag", variable_id: flag, set: true },
    { kind: "any", of: [{ kind: "flag", variable_id: flag, set: false }, { kind: "item", item_id: key, min: 1 }] },
  ]);
  p = setRules(p, { kind: "node", nodeId: node }, "effects", [{ kind: "set", variable_id: flag, to: true }, { kind: "add", variable_id: num, amount: 1 }, { kind: "give", item_id: key, amount: 1 }]);
  assert.deepEqual(variableUsage(p.game!, flag), { read: 2, written: 1 });
  assert.deepEqual(variableUsage(p.game!, num), { read: 0, written: 1 });
  assert.deepEqual(itemUsage(p.game!, key), { read: 1, written: 1 });
});

test("new rows start filled with something that exists", () => {
  const { p, flag, num, key } = world();
  const c = contextOf(p);
  assert.deepEqual(blankCondition(c, "flag"), { kind: "flag", variable_id: flag, set: true });
  assert.deepEqual(blankCondition(c, "number"), { kind: "number", variable_id: num, op: ">=", value: 1 });
  assert.deepEqual(blankCondition(c, "item"), { kind: "item", item_id: key, min: 1 });
  assert.deepEqual(blankCondition(c, "ability"), { kind: "ability", character_id: "", ability_id: "ab-climb" });
  assert.deepEqual(blankEffect(c, "set"), { kind: "set", variable_id: flag, to: true });
  assert.deepEqual(blankEffect(c, "grant"), { kind: "grant", character_id: "c-ann", ability_id: "ab-climb" });
  // With nothing declared, the reference is empty (shown as "not declared" until chosen).
  const empty = contextOf({ game: undefined, characters: [], abilities: [] });
  assert.deepEqual(blankCondition(empty, "item"), { kind: "item", item_id: "", min: 1 });
  assert.deepEqual(blankEffect(empty, "give"), { kind: "give", item_id: "", amount: 1 });
});
