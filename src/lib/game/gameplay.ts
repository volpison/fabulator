/**
 * Playtest: what a player could do, given a hand-set state. Pure (no Svelte, no Tauri).
 *
 * This is a planning aid, not a game engine. It follows the conditions and effects stored in the
 * project: a node is *available* when its quest is offered, its own conditions hold, and it is
 * either the first node of its quest or an open way out of a node that is already done. Playing a
 * node applies its effects and marks it done; choosing an option applies the option's effects.
 */
import type { Condition, Effect, GameNode, Project, Quest, SimpleCondition } from "../model/types";
import { nodesInQuest } from "./game";
import { describeCondition, contextOf } from "./gamerules";

/** The remembered state, as plain data (so it can be held in a Svelte variable and copied). */
export type GameState = {
  /** Flags that are set. */
  flags: string[];
  /** Number variables that are not 0. */
  numbers: Record<string, number>;
  /** Items the player has (more than 0). */
  items: Record<string, number>;
  /** Abilities learned in play: "characterId|abilityId" ("" is the player's own character). */
  abilities: string[];
  /** Nodes that have happened. */
  done: string[];
};

export const emptyState = (): GameState => ({ flags: [], numbers: {}, items: {}, abilities: [], done: [] });

export const abilityKey = (characterId: string, abilityId: string) => `${characterId}|${abilityId}`;

const cloneState = (s: GameState): GameState => ({
  flags: [...s.flags],
  numbers: { ...s.numbers },
  items: { ...s.items },
  abilities: [...s.abilities],
  done: [...s.done],
});

// ─── Conditions and effects against a state ───

function holdsSimple(p: Pick<Project, "characters">, s: GameState, k: SimpleCondition): boolean {
  switch (k.kind) {
    case "flag":
      return s.flags.includes(k.variable_id) === k.set;
    case "number": {
      const v = s.numbers[k.variable_id] ?? 0;
      switch (k.op) {
        case "=": return v === k.value;
        case "!=": return v !== k.value;
        case "<": return v < k.value;
        case "<=": return v <= k.value;
        case ">": return v > k.value;
        case ">=": return v >= k.value;
      }
      return false;
    }
    case "item":
      return (s.items[k.item_id] ?? 0) >= k.min;
    case "ability": {
      // A character's own abilities (Abilities panel) count, as do ones learned in play.
      const innate = p.characters.find((c) => c.id === k.character_id)?.ability_ids?.includes(k.ability_id) ?? false;
      return innate || s.abilities.includes(abilityKey(k.character_id, k.ability_id));
    }
    case "done":
      return s.done.includes(k.node_id);
  }
}

export function holds(p: Pick<Project, "characters">, s: GameState, k: Condition): boolean {
  return k.kind === "any" ? k.of.some((m) => holdsSimple(p, s, m)) : holdsSimple(p, s, k);
}

/** Every condition of a list holds (an empty list always does). */
export const holdsAll = (p: Pick<Project, "characters">, s: GameState, list: Condition[]): boolean =>
  list.every((k) => holds(p, s, k));

export function applyEffect(s: GameState, e: Effect): GameState {
  const next = cloneState(s);
  switch (e.kind) {
    case "set":
      next.flags = next.flags.filter((f) => f !== e.variable_id);
      if (e.to) next.flags.push(e.variable_id);
      break;
    case "add": {
      const v = (next.numbers[e.variable_id] ?? 0) + e.amount;
      if (v === 0) delete next.numbers[e.variable_id];
      else next.numbers[e.variable_id] = v;
      break;
    }
    case "give": {
      const v = Math.max(0, (next.items[e.item_id] ?? 0) + e.amount);
      if (v === 0) delete next.items[e.item_id];
      else next.items[e.item_id] = v;
      break;
    }
    case "grant": {
      const key = abilityKey(e.character_id, e.ability_id);
      if (!next.abilities.includes(key)) next.abilities.push(key);
      break;
    }
  }
  return next;
}

export const applyEffects = (s: GameState, list: Effect[]): GameState => list.reduce(applyEffect, s);

// ─── What is available ───

export type OpenExit = { to: string; label: string; kind: "link" | "option"; optionId: string; elementId: string };

/** The ways out of a node that are open in this state: links, then the options of its choices. */
export function openExits(p: Pick<Project, "characters">, s: GameState, n: GameNode): OpenExit[] {
  const out: OpenExit[] = [];
  for (const l of n.links) if (holdsAll(p, s, l.requires)) out.push({ to: l.to, label: l.label, kind: "link", optionId: "", elementId: "" });
  for (const e of n.elements) {
    if (e.kind !== "choice") continue;
    for (const o of e.options) if (holdsAll(p, s, o.requires)) out.push({ to: o.to, label: o.text, kind: "option", optionId: o.id, elementId: e.id });
  }
  return out;
}

export const questOffered = (p: Pick<Project, "characters">, s: GameState, q: Quest): boolean => holdsAll(p, s, q.requires);

export type Availability = {
  node: GameNode;
  /** Why it is a candidate: the first node of its quest, or a way out of a done node. */
  entry: boolean;
  from: string[];
  /** Conditions (as text) that do not hold. Empty = available. */
  unmet: string[];
};

/**
 * Every node that is *reachable in principle* right now (an entry of an offered quest, or an exit of a
 * done node), each with the conditions that still do not hold. Done nodes are not listed.
 */
export function candidates(p: Pick<Project, "game" | "characters" | "abilities">, s: GameState): Availability[] {
  const g = p.game;
  if (!g) return [];
  const ctx = contextOf(p);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out = new Map<string, Availability>();

  const consider = (node: GameNode, entry: boolean, from: string, edgeUnmet: string[]) => {
    if (s.done.includes(node.id)) return;
    const quest = g.quests.find((q) => q.id === node.quest_id);
    const unmet = [
      ...(entry && quest ? quest.requires.filter((k) => !holds(p, s, k)).map((k) => describeCondition(ctx, k)) : []),
      ...edgeUnmet,
      ...node.requires.filter((k) => !holds(p, s, k)).map((k) => describeCondition(ctx, k)),
    ];
    const known = out.get(node.id);
    if (!known) out.set(node.id, { node, entry, from: from ? [from] : [], unmet });
    else {
      if (entry) known.entry = true;
      if (from && !known.from.includes(from)) known.from.push(from);
      if (unmet.length < known.unmet.length) known.unmet = unmet;
    }
  };

  for (const q of g.quests) {
    const first = nodesInQuest(g.nodes, q.id)[0];
    if (first) consider(first, true, "", []);
  }
  for (const id of s.done) {
    const n = byId.get(id);
    if (!n) continue;
    for (const l of n.links) {
      const target = byId.get(l.to);
      if (target) consider(target, false, n.id, l.requires.filter((k) => !holds(p, s, k)).map((k) => describeCondition(ctx, k)));
    }
    for (const e of n.elements) {
      if (e.kind !== "choice") continue;
      for (const o of e.options) {
        const target = byId.get(o.to);
        if (target) consider(target, false, n.id, o.requires.filter((k) => !holds(p, s, k)).map((k) => describeCondition(ctx, k)));
      }
    }
  }
  return [...out.values()];
}

/** Candidates whose conditions all hold: what the player can do now. */
export const availableNodes = (p: Pick<Project, "game" | "characters" | "abilities">, s: GameState): Availability[] =>
  candidates(p, s).filter((c) => c.unmet.length === 0);

/** Play a node: its effects apply and it is done. Playing a done node changes nothing. */
export function playNode(p: Pick<Project, "game">, s: GameState, nodeId: string): GameState {
  const n = p.game?.nodes.find((x) => x.id === nodeId);
  if (!n || s.done.includes(nodeId)) return s;
  const next = applyEffects(s, n.effects);
  return { ...next, done: [...next.done, nodeId] };
}

/** Choose an option of a node: the option's effects apply (the node itself is not played again). */
export function chooseOption(p: Pick<Project, "game">, s: GameState, nodeId: string, elementId: string, optionId: string): GameState {
  const o = p.game?.nodes.find((x) => x.id === nodeId)?.elements.find((e) => e.id === elementId)?.options.find((x) => x.id === optionId);
  return o ? applyEffects(s, o.effects) : s;
}
