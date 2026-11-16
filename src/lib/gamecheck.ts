/**
 * Check: reads the whole game and reports what looks wrong or unfinished. Pure.
 *
 * The analysis is *optimistic*: it assumes the player does whatever helps. A thing is "possible"
 * if some reachable node or option could make it so. So a problem reported here is a real problem
 * (nothing in the story can ever satisfy it); a clean report does not prove the game is winnable,
 * because it does not look at the order of things or at numbers that must hit an exact value.
 */
import type { Condition, Effect, GameNode, Project, SimpleCondition } from "./types";
import { nodesInQuest } from "./game";
import { contextOf, describeCondition } from "./gamerules";

export type CheckSeverity = "error" | "warning" | "info";
export type CheckKind =
  | "unreachable"
  | "quest-closed"
  | "quest-empty"
  | "dead-end"
  | "may-stick"
  | "option-nowhere"
  | "undeclared"
  | "never-set"
  | "set-never-read"
  | "unused"
  | "ambiguous";

export type CheckIssue = {
  severity: CheckSeverity;
  kind: CheckKind;
  message: string;
  nodeId?: string;
  questId?: string;
};

type Game = NonNullable<Project["game"]>;
type Subject = Pick<Project, "game" | "characters" | "abilities">;

const SEVERITY_ORDER: Record<CheckSeverity, number> = { error: 0, warning: 1, info: 2 };

// ─── What can happen (optimistic) ───

type Possible = {
  flags: Set<string>;
  max: Map<string, number>;
  min: Map<string, number>;
  items: Map<string, number>;
  abilities: Set<string>;
  done: Set<string>;
};

const simplesOf = (list: Condition[]): SimpleCondition[] => list.flatMap((k) => (k.kind === "any" ? k.of : [k]));

function simplePossible(p: Pick<Project, "characters">, w: Possible, k: SimpleCondition): boolean {
  switch (k.kind) {
    case "flag":
      return k.set ? w.flags.has(k.variable_id) : true; // everything starts unset
    case "number": {
      const lo = w.min.get(k.variable_id) ?? 0;
      const hi = w.max.get(k.variable_id) ?? 0;
      switch (k.op) {
        case "=": return k.value >= lo && k.value <= hi;
        case "!=": return !(lo === hi && lo === k.value);
        case "<": return lo < k.value;
        case "<=": return lo <= k.value;
        case ">": return hi > k.value;
        case ">=": return hi >= k.value;
      }
      return false;
    }
    case "item":
      return (w.items.get(k.item_id) ?? 0) >= k.min;
    case "ability":
      return (
        (p.characters.find((c) => c.id === k.character_id)?.ability_ids ?? []).includes(k.ability_id) ||
        w.abilities.has(`${k.character_id}|${k.ability_id}`)
      );
    case "done":
      return w.done.has(k.node_id);
  }
}

const possible = (p: Pick<Project, "characters">, w: Possible, k: Condition): boolean =>
  k.kind === "any" ? k.of.some((m) => simplePossible(p, w, m)) : simplePossible(p, w, k);
const allPossible = (p: Pick<Project, "characters">, w: Possible, list: Condition[]): boolean => list.every((k) => possible(p, w, k));

function addEffects(w: Possible, list: Effect[]): boolean {
  let changed = false;
  for (const e of list) {
    if (e.kind === "set" && e.to && !w.flags.has(e.variable_id)) {
      w.flags.add(e.variable_id);
      changed = true;
    } else if (e.kind === "add") {
      if (e.amount > 0) w.max.set(e.variable_id, (w.max.get(e.variable_id) ?? 0) + e.amount), (changed = true);
      if (e.amount < 0) w.min.set(e.variable_id, (w.min.get(e.variable_id) ?? 0) + e.amount), (changed = true);
    } else if (e.kind === "give" && e.amount > 0) {
      w.items.set(e.item_id, (w.items.get(e.item_id) ?? 0) + e.amount);
      changed = true;
    } else if (e.kind === "grant" && !w.abilities.has(`${e.character_id}|${e.ability_id}`)) {
      w.abilities.add(`${e.character_id}|${e.ability_id}`);
      changed = true;
    }
  }
  return changed;
}

/** Ways out of a node: links and options that lead somewhere. */
type Exit = { to: string; requires: Condition[]; effects: Effect[]; kind: "link" | "option" };
export function exitsFor(n: GameNode): Exit[] {
  const out: Exit[] = n.links.map((l) => ({ to: l.to, requires: l.requires, effects: [], kind: "link" as const }));
  for (const e of n.elements) {
    if (e.kind !== "choice") continue;
    for (const o of e.options) if (o.to) out.push({ to: o.to, requires: o.requires, effects: o.effects, kind: "option" });
  }
  return out;
}

/** Nodes reachable by walking from the first node of every quest, ignoring all conditions. */
function structuralReach(g: Game): Set<string> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const stack = g.quests.map((q) => nodesInQuest(g.nodes, q.id)[0]?.id).filter((x): x is string => !!x);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byId.get(id);
    if (n) for (const e of exitsFor(n)) if (byId.has(e.to)) stack.push(e.to);
  }
  return seen;
}

/** The optimistic fixed point: which nodes can be reached, and what can become true on the way. */
export function analyse(p: Subject): { reachable: Set<string>; world: Possible } {
  const g = p.game;
  const world: Possible = { flags: new Set(), max: new Map(), min: new Map(), items: new Map(), abilities: new Set(), done: new Set() };
  const reachable = new Set<string>();
  if (!g) return { reachable, world };
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const handledOptions = new Set<string>();

  let changed = true;
  while (changed) {
    changed = false;
    const reach = (n: GameNode | undefined) => {
      if (!n || reachable.has(n.id) || !allPossible(p, world, n.requires)) return;
      reachable.add(n.id);
      world.done.add(n.id);
      addEffects(world, n.effects);
      changed = true;
    };
    for (const q of g.quests) {
      const first = nodesInQuest(g.nodes, q.id)[0];
      if (first && allPossible(p, world, q.requires)) reach(first);
    }
    for (const id of [...reachable]) {
      const n = byId.get(id);
      if (!n) continue;
      for (const e of n.elements) {
        if (e.kind !== "choice") continue;
        for (const o of e.options) {
          const key = `${n.id}/${o.id}`;
          if (!handledOptions.has(key) && allPossible(p, world, o.requires)) {
            handledOptions.add(key);
            if (addEffects(world, o.effects)) changed = true;
          }
        }
      }
      for (const x of exitsFor(n)) if (allPossible(p, world, x.requires)) reach(byId.get(x.to));
    }
  }
  return { reachable, world };
}

// ─── The report ───

const nodeTitle = (n: GameNode) => `“${n.title.trim() || "Untitled node"}”`;

/** Describe why a condition cannot hold, if it cannot. */
function whyNot(p: Subject, k: Condition): string {
  const ctx = contextOf(p);
  const text = describeCondition(ctx, k);
  const one = (m: SimpleCondition): string => {
    switch (m.kind) {
      case "flag": return `nothing sets ${describeCondition(ctx, { ...m, set: true }).replace(/ is set$/, "")}`;
      case "number": return `${describeCondition(ctx, m)} can never hold with what the story changes`;
      case "item": return `nothing gives enough of the item (“${text}”)`;
      case "ability": return `nothing gives that ability (“${text}”)`;
      case "done": return `that node is never reached (“${text}”)`;
    }
  };
  return k.kind === "any" ? `none of “${text}” can ever hold` : one(k);
}

export function checkGame(p: Subject): CheckIssue[] {
  const g = p.game;
  if (!g) return [];
  const ctx = contextOf(p);
  const issues: CheckIssue[] = [];
  const add = (i: CheckIssue) => issues.push(i);
  const { reachable, world } = analyse(p);
  const structural = structuralReach(g);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const questTitle = (id: string) => g.quests.find((q) => q.id === id)?.title.trim() || "Untitled quest";

  // Quests
  for (const q of g.quests) {
    const first = nodesInQuest(g.nodes, q.id)[0];
    if (!first) {
      add({ severity: "info", kind: "quest-empty", questId: q.id, message: `Quest “${questTitle(q.id)}” has no nodes yet.` });
      continue;
    }
    const bad = q.requires.find((k) => !possible(p, world, k));
    if (bad && !reachable.has(first.id)) {
      add({ severity: "error", kind: "quest-closed", questId: q.id, nodeId: first.id, message: `Quest “${questTitle(q.id)}” is never offered: ${whyNot(p, bad)}.` });
    }
  }

  // Nodes
  for (const n of g.nodes) {
    const where = `Node ${nodeTitle(n)} (${questTitle(n.quest_id)})`;
    if (!reachable.has(n.id)) {
      const questFirst = nodesInQuest(g.nodes, n.quest_id)[0]?.id === n.id;
      const closedQuest = g.quests.find((q) => q.id === n.quest_id)?.requires.find((k) => !possible(p, world, k));
      const bad = n.requires.find((k) => !possible(p, world, k));
      let why: string;
      if (!structural.has(n.id)) why = "no way out of any other node leads here, and it is not the first node of its quest";
      else if (bad) why = whyNot(p, bad);
      else if (questFirst && closedQuest) continue; // already reported as the quest being closed
      else why = "every way in needs something that can never happen";
      add({ severity: "warning", kind: "unreachable", nodeId: n.id, questId: n.quest_id, message: `${where} can never be reached: ${why}.` });
      continue;
    }
    const exits = exitsFor(n);
    if (exits.length === 0 && !n.ending) {
      add({ severity: "warning", kind: "dead-end", nodeId: n.id, questId: n.quest_id, message: `${where} is a dead end: nothing leads out of it and it is not marked as an ending.` });
    } else if (exits.length > 0 && exits.every((x) => x.requires.length > 0) && !n.ending) {
      add({ severity: "info", kind: "may-stick", nodeId: n.id, questId: n.quest_id, message: `${where}: every way out has a condition, so the player could get stuck if none holds.` });
    }
    for (const e of n.elements) {
      if (e.kind !== "choice") continue;
      for (const o of e.options) {
        if (!o.to) add({ severity: "info", kind: "option-nowhere", nodeId: n.id, questId: n.quest_id, message: `${where}: the option “${o.text.trim() || "…"}” leads nowhere yet.` });
      }
    }
    // Several ways out with the very same conditions: the player cannot tell which is meant.
    const seen = new Map<string, string>();
    for (const l of n.links) {
      const key = JSON.stringify(l.requires);
      const other = seen.get(key);
      if (other !== undefined) {
        add({ severity: "warning", kind: "ambiguous", nodeId: n.id, questId: n.quest_id, message: `${where}: two ways out (“${other || "…"}” and “${l.label.trim() || "…"}”) have the same conditions, so both are open at once.` });
      } else seen.set(key, l.label.trim());
    }
  }

  // Conditions that can never hold (reported where they are written)
  const checkRules = (loc: string, list: Condition[], nodeId?: string, questId?: string) => {
    for (const k of list) {
      if (!possible(p, world, k)) {
        add({ severity: "error", kind: "never-set", nodeId, questId, message: `${loc}: “${describeCondition(ctx, k)}” can never hold — ${whyNot(p, k)}.` });
      }
    }
  };
  for (const q of g.quests) checkRules(`Quest “${questTitle(q.id)}”`, q.requires, undefined, q.id);
  for (const n of g.nodes) {
    checkRules(`Node ${nodeTitle(n)}`, n.requires, n.id, n.quest_id);
    for (const l of n.links) checkRules(`Node ${nodeTitle(n)}, way out → ${byId.has(l.to) ? nodeTitle(byId.get(l.to)!) : "?"}`, l.requires, n.id, n.quest_id);
    for (const e of n.elements) for (const o of e.options) checkRules(`Node ${nodeTitle(n)}, option “${o.text.trim() || "…"}”`, o.requires, n.id, n.quest_id);
  }

  // Undeclared references
  const varIds = new Set(g.variables.map((v) => v.id));
  const itemIds = new Set(g.items.map((i) => i.id));
  const charIds = new Set(p.characters.map((c) => c.id));
  const abilityIds = new Set(p.abilities.map((a) => a.id));
  const checkRefs = (loc: string, conds: Condition[], effects: Effect[], nodeId?: string, questId?: string) => {
    const missing: string[] = [];
    for (const k of simplesOf(conds)) {
      if ((k.kind === "flag" || k.kind === "number") && !varIds.has(k.variable_id)) missing.push(`variable “${k.variable_id}”`);
      if (k.kind === "item" && !itemIds.has(k.item_id)) missing.push(`item “${k.item_id}”`);
      if (k.kind === "ability") {
        if (k.character_id && !charIds.has(k.character_id)) missing.push(`character “${k.character_id}”`);
        if (!abilityIds.has(k.ability_id)) missing.push(`ability “${k.ability_id}”`);
      }
      if (k.kind === "done" && !byId.has(k.node_id)) missing.push(`node “${k.node_id}”`);
    }
    for (const e of effects) {
      if ((e.kind === "set" || e.kind === "add") && !varIds.has(e.variable_id)) missing.push(`variable “${e.variable_id}”`);
      if (e.kind === "give" && !itemIds.has(e.item_id)) missing.push(`item “${e.item_id}”`);
      if (e.kind === "grant") {
        if (e.character_id && !charIds.has(e.character_id)) missing.push(`character “${e.character_id}”`);
        if (!abilityIds.has(e.ability_id)) missing.push(`ability “${e.ability_id}”`);
      }
    }
    for (const m of new Set(missing)) add({ severity: "warning", kind: "undeclared", nodeId, questId, message: `${loc} uses ${m}, which is not declared.` });
  };
  for (const q of g.quests) checkRefs(`Quest “${questTitle(q.id)}”`, q.requires, [], undefined, q.id);
  for (const n of g.nodes) {
    checkRefs(`Node ${nodeTitle(n)}`, n.requires, n.effects, n.id, n.quest_id);
    for (const l of n.links) checkRefs(`Node ${nodeTitle(n)}, way out`, l.requires, [], n.id, n.quest_id);
    for (const e of n.elements) for (const o of e.options) checkRefs(`Node ${nodeTitle(n)}, option “${o.text.trim() || "…"}”`, o.requires, o.effects, n.id, n.quest_id);
  }

  // State that is set but never read, or declared but never used
  const read = { vars: new Set<string>(), items: new Set<string>() };
  const written = { vars: new Set<string>(), items: new Set<string>() };
  const rules: { requires: Condition[]; effects: Effect[] }[] = [];
  for (const q of g.quests) rules.push({ requires: q.requires, effects: [] });
  for (const n of g.nodes) {
    rules.push({ requires: n.requires, effects: n.effects });
    for (const l of n.links) rules.push({ requires: l.requires, effects: [] });
    for (const e of n.elements) for (const o of e.options) rules.push({ requires: o.requires, effects: o.effects });
  }
  for (const r of rules) {
    for (const k of simplesOf(r.requires)) {
      if (k.kind === "flag" || k.kind === "number") read.vars.add(k.variable_id);
      if (k.kind === "item") read.items.add(k.item_id);
    }
    for (const e of r.effects) {
      if (e.kind === "set" || e.kind === "add") written.vars.add(e.variable_id);
      if (e.kind === "give") written.items.add(e.item_id);
    }
  }
  for (const v of g.variables) {
    const label = v.label.trim() || v.id;
    if (!read.vars.has(v.id) && !written.vars.has(v.id)) add({ severity: "info", kind: "unused", message: `Variable “${label}” is declared but nothing uses it.` });
    else if (written.vars.has(v.id) && !read.vars.has(v.id)) add({ severity: "info", kind: "set-never-read", message: `Variable “${label}” is changed but no condition ever looks at it.` });
  }
  for (const i of g.items) {
    const label = i.name.trim() || i.id;
    if (!read.items.has(i.id) && !written.items.has(i.id)) add({ severity: "info", kind: "unused", message: `Item “${label}” is declared but nothing uses it.` });
    else if (written.items.has(i.id) && !read.items.has(i.id)) add({ severity: "info", kind: "set-never-read", message: `Item “${label}” is given but nothing ever needs it.` });
  }

  return issues
    .map((i, idx) => ({ i, idx }))
    .sort((a, b) => SEVERITY_ORDER[a.i.severity] - SEVERITY_ORDER[b.i.severity] || a.idx - b.idx)
    .map((x) => x.i);
}

/** Counts per severity, for the dialog header. */
export const countIssues = (list: CheckIssue[]): Record<CheckSeverity, number> => ({
  error: list.filter((i) => i.severity === "error").length,
  warning: list.filter((i) => i.severity === "warning").length,
  info: list.filter((i) => i.severity === "info").length,
});
