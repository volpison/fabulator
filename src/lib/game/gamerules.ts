/**
 * Reading conditions and effects as text, and counting where the registry's variables and items
 * are used. Pure (no Svelte, no Tauri).
 *
 * Conditions and effects are stored as data (see types.ts); the app shows them as readable text
 * ("Reputation ≥ 1 and has Cellar key") and the checks of a later step read the same data. A
 * reference to something nobody declared is shown with "(not declared)" rather than hidden.
 */
import type { Ability, Character, Condition, Effect, Game, GameNode, Project, SimpleCondition } from "../model/types";

export type RuleContext = { game: Game; characters: Character[]; abilities: Ability[] };

export const contextOf = (p: Pick<Project, "game" | "characters" | "abilities">): RuleContext => ({
  game: p.game ?? { quests: [], nodes: [], variables: [], items: [] },
  characters: p.characters,
  abilities: p.abilities,
});

const OP_TEXT = { "=": "=", "!=": "≠", "<": "<", "<=": "≤", ">": ">", ">=": "≥" } as const;
const undeclared = (id: string) => `“${id || "?"}” (not declared)`;

const variableName = (c: RuleContext, id: string) => {
  const v = c.game.variables.find((x) => x.id === id);
  return v ? v.label.trim() || id : undeclared(id);
};
const itemName = (c: RuleContext, id: string) => {
  const i = c.game.items.find((x) => x.id === id);
  return i ? i.name.trim() || id : undeclared(id);
};
const abilityName = (c: RuleContext, id: string) => {
  const a = c.abilities.find((x) => x.id === id);
  return a ? a.name.trim() || id : undeclared(id);
};
/** "" means the player's own character. */
const characterName = (c: RuleContext, id: string) => {
  if (!id) return "The player";
  const ch = c.characters.find((x) => x.id === id);
  return ch ? ch.name.trim() || id : undeclared(id);
};
const nodeName = (c: RuleContext, id: string) => {
  const n = c.game.nodes.find((x) => x.id === id);
  return n ? `“${n.title.trim() || "Untitled node"}”` : undeclared(id);
};

function simpleText(c: RuleContext, k: SimpleCondition): string {
  switch (k.kind) {
    case "flag":
      return `${variableName(c, k.variable_id)} is ${k.set ? "set" : "not set"}`;
    case "number":
      return `${variableName(c, k.variable_id)} ${OP_TEXT[k.op]} ${k.value}`;
    case "item":
      return k.min > 1 ? `has ${k.min} × ${itemName(c, k.item_id)}` : `has ${itemName(c, k.item_id)}`;
    case "ability":
      return `${characterName(c, k.character_id)} can ${abilityName(c, k.ability_id)}`;
    case "done":
      return `${nodeName(c, k.node_id)} is done`;
  }
}

/** One condition as text. */
export function describeCondition(c: RuleContext, k: Condition): string {
  return k.kind === "any" ? `any of: ${k.of.map((s) => simpleText(c, s)).join(" or ")}` : simpleText(c, k);
}

/** All conditions of a list (every one must hold) as one line; "" for no conditions. */
export const describeConditions = (c: RuleContext, list: Condition[]): string =>
  list.map((k) => describeCondition(c, k)).join(" and ");

/** One effect as text. */
export function describeEffect(c: RuleContext, e: Effect): string {
  switch (e.kind) {
    case "set":
      return e.to ? `sets ${variableName(c, e.variable_id)}` : `clears ${variableName(c, e.variable_id)}`;
    case "add":
      return `${variableName(c, e.variable_id)} ${e.amount < 0 ? "−" : "+"}${Math.abs(e.amount)}`;
    case "give":
      return e.amount < 0
        ? `takes ${Math.abs(e.amount)} × ${itemName(c, e.item_id)}`
        : `gives ${e.amount} × ${itemName(c, e.item_id)}`;
    case "grant":
      return `${characterName(c, e.character_id)} learns ${abilityName(c, e.ability_id)}`;
  }
}

export const describeEffects = (c: RuleContext, list: Effect[]): string => list.map((e) => describeEffect(c, e)).join(", ");

// ─── Where things are used ───

type Rules = { requires: Condition[]; effects: Effect[] };

/** Every place that carries conditions or effects: quests, nodes, their links and choice options. */
function allRules(g: Game): Rules[] {
  const out: Rules[] = g.quests.map((q) => ({ requires: q.requires, effects: [] }));
  for (const n of g.nodes) {
    out.push({ requires: n.requires, effects: n.effects });
    for (const l of n.links) out.push({ requires: l.requires, effects: [] });
    for (const e of n.elements) for (const o of e.options) out.push({ requires: o.requires, effects: o.effects });
  }
  return out;
}

const simplesOf = (list: Condition[]): SimpleCondition[] => list.flatMap((k) => (k.kind === "any" ? k.of : [k]));

/** How many conditions and effects mention a variable. */
export function variableUsage(g: Game, variableId: string): { read: number; written: number } {
  let read = 0;
  let written = 0;
  for (const r of allRules(g)) {
    read += simplesOf(r.requires).filter((k) => (k.kind === "flag" || k.kind === "number") && k.variable_id === variableId).length;
    written += r.effects.filter((e) => (e.kind === "set" || e.kind === "add") && e.variable_id === variableId).length;
  }
  return { read, written };
}

/** How many conditions need an item and how many effects give or take it. */
export function itemUsage(g: Game, itemId: string): { read: number; written: number } {
  let read = 0;
  let written = 0;
  for (const r of allRules(g)) {
    read += simplesOf(r.requires).filter((k) => k.kind === "item" && k.item_id === itemId).length;
    written += r.effects.filter((e) => e.kind === "give" && e.item_id === itemId).length;
  }
  return { read, written };
}

/** A node's own conditions and effects as one-line text (for cards and lists). */
export const nodeRulesText = (c: RuleContext, n: Pick<GameNode, "requires" | "effects">): { requires: string; effects: string } => ({
  requires: describeConditions(c, n.requires),
  effects: describeEffects(c, n.effects),
});

// ─── New rows for the editors ───

export const CONDITION_KINDS = ["flag", "number", "item", "ability", "done", "any"] as const;
export const CONDITION_LABEL: Record<(typeof CONDITION_KINDS)[number], string> = {
  flag: "Flag",
  number: "Number",
  item: "Has item",
  ability: "Can do (ability)",
  done: "Node done",
  any: "Any of…",
};
export const EFFECT_KINDS = ["set", "add", "give", "grant"] as const;
export const EFFECT_LABEL: Record<(typeof EFFECT_KINDS)[number], string> = {
  set: "Set / clear a flag",
  add: "Change a number",
  give: "Give / take an item",
  grant: "Teach an ability",
};

/** A new simple condition of a kind, filled with the first thing of the right type that exists ("" if none). */
export function blankCondition(c: RuleContext, kind: SimpleCondition["kind"]): SimpleCondition {
  switch (kind) {
    case "flag":
      return { kind, variable_id: c.game.variables.find((v) => v.kind === "flag")?.id ?? "", set: true };
    case "number":
      return { kind, variable_id: c.game.variables.find((v) => v.kind === "number")?.id ?? "", op: ">=", value: 1 };
    case "item":
      return { kind, item_id: c.game.items[0]?.id ?? "", min: 1 };
    case "ability":
      return { kind, character_id: "", ability_id: c.abilities[0]?.id ?? "" };
    case "done":
      return { kind, node_id: c.game.nodes[0]?.id ?? "" };
  }
}

export function blankEffect(c: RuleContext, kind: Effect["kind"]): Effect {
  switch (kind) {
    case "set":
      return { kind, variable_id: c.game.variables.find((v) => v.kind === "flag")?.id ?? "", to: true };
    case "add":
      return { kind, variable_id: c.game.variables.find((v) => v.kind === "number")?.id ?? "", amount: 1 };
    case "give":
      return { kind, item_id: c.game.items[0]?.id ?? "", amount: 1 };
    case "grant":
      return { kind, character_id: c.characters[0]?.id ?? "", ability_id: c.abilities[0]?.id ?? "" };
  }
}
