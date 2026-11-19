/**
 * Game documents: quests, nodes, conditions and effects, and the cleaning that keeps a loaded
 * file sound. Pure (no Svelte, no Tauri). The views come in later steps; this is the data they
 * stand on.
 *
 * A game is a graph with state: a *quest* (main or side) groups *nodes*; a node may need
 * something (`requires`), changes something (`effects`) and leads somewhere (`links`, and the
 * options of a choice). Conditions and effects are small structured rows over a registry of
 * declared variables and items, so they can be shown as text and checked without running anything.
 * Design: docs/technical/game-prototyping.md.
 *
 * Cleaning keeps anything that is merely *odd* (a condition that names a variable nobody declared
 * is reported by the checks, not deleted) and only drops what cannot be read (an unknown kind of
 * condition) or points at a node that no longer exists.
 */
import type {
  ChoiceOption,
  CompareOp,
  Condition,
  Effect,
  Game,
  GameElement,
  GameElementKind,
  GameItem,
  GameLink,
  GameNode,
  GameVariable,
  Quest,
  QuestKind,
  SimpleCondition,
} from "../model/types";
import { cleanColor, cleanStatus } from "../model/labels";
import { cleanTodos } from "../model/scenenotes";

type Raw = Record<string, unknown>;
const isObject = (x: unknown): x is Raw => typeof x === "object" && x !== null && !Array.isArray(x);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, fallback = ""): string => (typeof x === "string" ? x : fallback);
const strings = (x: unknown): string[] => arr(x).filter((v): v is string => typeof v === "string");
const finite = (x: unknown, fallback = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : fallback);

export const COMPARE_OPS: readonly CompareOp[] = ["=", "!=", "<", "<=", ">", ">="];
export const ELEMENT_KINDS = ["narration", "dialogue", "choice", "note"] as const;
export const ELEMENT_LABEL: Record<GameElementKind, string> = {
  narration: "Narration",
  dialogue: "Dialogue",
  choice: "Choice",
  note: "Note (private)",
};

export const emptyGame = (): Game => ({ quests: [], nodes: [], variables: [], items: [] });

// ─── Conditions and effects ───

function cleanSimpleCondition(raw: unknown): SimpleCondition | null {
  if (!isObject(raw)) return null;
  switch (raw.kind) {
    case "flag":
      return { kind: "flag", variable_id: str(raw.variable_id), set: raw.set !== false };
    case "number":
      return {
        kind: "number",
        variable_id: str(raw.variable_id),
        op: (COMPARE_OPS as readonly unknown[]).includes(raw.op) ? (raw.op as CompareOp) : "=",
        value: finite(raw.value),
      };
    case "item":
      return { kind: "item", item_id: str(raw.item_id), min: Math.max(1, Math.round(finite(raw.min, 1))) };
    case "ability":
      return { kind: "ability", character_id: str(raw.character_id), ability_id: str(raw.ability_id) };
    case "done":
      return { kind: "done", node_id: str(raw.node_id) };
    default:
      return null;
  }
}

/** A list of conditions, every one readable. An empty "any of" is dropped (it could never hold). */
export function cleanConditions(list: unknown): Condition[] {
  const out: Condition[] = [];
  for (const raw of arr(list)) {
    if (isObject(raw) && raw.kind === "any") {
      const of = arr(raw.of).map(cleanSimpleCondition).filter((c): c is SimpleCondition => c !== null);
      if (of.length > 0) out.push({ kind: "any", of });
      continue;
    }
    const c = cleanSimpleCondition(raw);
    if (c) out.push(c);
  }
  return out;
}

export function cleanEffects(list: unknown): Effect[] {
  const out: Effect[] = [];
  for (const raw of arr(list)) {
    if (!isObject(raw)) continue;
    switch (raw.kind) {
      case "set":
        out.push({ kind: "set", variable_id: str(raw.variable_id), to: raw.to !== false });
        break;
      case "add":
        out.push({ kind: "add", variable_id: str(raw.variable_id), amount: finite(raw.amount, 1) });
        break;
      case "give":
        out.push({ kind: "give", item_id: str(raw.item_id), amount: Math.round(finite(raw.amount, 1)) });
        break;
      case "grant":
        out.push({ kind: "grant", character_id: str(raw.character_id), ability_id: str(raw.ability_id) });
        break;
    }
  }
  return out;
}

// ─── Cleaning a whole game ───

/** Ids in a list are made unique: a repeat gets a suffix; a missing one a fixed id. */
function uniqueId(raw: unknown, prefix: string, index: number, seen: Set<string>): string {
  let id = str(raw) || `${prefix}-fixed-${index + 1}`;
  if (seen.has(id)) id = `${id}-${index + 1}`;
  seen.add(id);
  return id;
}

function cleanOptions(list: unknown, nodeIds: Set<string>, used: Set<string>): ChoiceOption[] {
  return arr(list)
    .filter(isObject)
    .map((o, i) => ({
      id: uniqueId(o.id, "opt", i, used),
      text: str(o.text),
      requires: cleanConditions(o.requires),
      effects: cleanEffects(o.effects),
      to: nodeIds.has(str(o.to)) ? str(o.to) : "",
    }));
}

function cleanElements(list: unknown, nodeIds: Set<string>, used: Set<string>): GameElement[] {
  return arr(list)
    .filter(isObject)
    .map((e, i) => {
      const kind = (ELEMENT_KINDS as readonly unknown[]).includes(e.kind) ? (e.kind as GameElementKind) : "narration";
      return {
        id: uniqueId(e.id, "ge", i, used),
        kind,
        speaker_id: kind === "dialogue" ? str(e.speaker_id) : "",
        parenthetical: kind === "dialogue" ? str(e.parenthetical) : "",
        text: str(e.text),
        options: kind === "choice" ? cleanOptions(e.options, nodeIds, used) : [],
      };
    });
}

const hasWords = (els: GameElement[]) => els.some((e) => e.kind !== "note" && e.text.trim() !== "");

/**
 * Make a game sound: quests get unique ids, nodes live in a real quest (the first one if theirs is
 * gone; a quest is made if there are nodes but none), nodes are numbered 0..n-1 inside their quest,
 * links and options never point at a node that does not exist, and the registry has unique ids.
 */
export function cleanGame(raw: unknown, plotlineIds: ReadonlySet<string> = new Set()): Game {
  const g: Raw = isObject(raw) ? raw : {};

  const seenQuest = new Set<string>();
  let quests: Quest[] = arr(g.quests)
    .filter(isObject)
    .map((q, i) => ({
      ...q,
      id: uniqueId(q.id, "q", i, seenQuest),
      title: str(q.title, `Quest ${i + 1}`),
      kind: (q.kind === "main" ? "main" : "side") as QuestKind,
      summary: str(q.summary),
      plotline_id: plotlineIds.has(str(q.plotline_id)) ? str(q.plotline_id) : "",
      requires: cleanConditions(q.requires),
    }));
  const rawNodes = arr(g.nodes).filter(isObject);
  if (quests.length === 0 && rawNodes.length > 0) {
    quests = [{ id: "q-1", title: "Quest 1", kind: "main", summary: "", plotline_id: "", requires: [] }];
  }
  const questIds = new Set(quests.map((q) => q.id));

  // Node ids first, so links and options can be checked against them.
  const seenNode = new Set<string>();
  const nodeIdOf = rawNodes.map((n, i) => uniqueId(n.id, "n", i, seenNode));
  const nodeIds = new Set(nodeIdOf);
  const usedInner = new Set<string>();

  const nodes: GameNode[] = [];
  if (quests.length > 0) {
    rawNodes.forEach((n, i) => {
      const id = nodeIdOf[i];
      const elements = cleanElements(n.elements, nodeIds, usedInner);
      const seenLink = new Set<string>();
      const links: GameLink[] = arr(n.links)
        .filter(isObject)
        .filter((l) => nodeIds.has(str(l.to)))
        .map((l, k) => ({
          id: uniqueId(l.id, "ln", k, seenLink),
          to: str(l.to),
          label: str(l.label),
          requires: cleanConditions(l.requires),
        }));
      nodes.push({
        ...n,
        id,
        quest_id: questIds.has(str(n.quest_id)) ? str(n.quest_id) : quests[0].id,
        order: finite(n.order, i),
        title: str(n.title),
        summary: str(n.summary),
        elements,
        requires: cleanConditions(n.requires),
        effects: cleanEffects(n.effects),
        links,
        ending: n.ending === true,
        status: cleanStatus(n.status, hasWords(elements) ? "draft" : "idea"),
        plotline_id: plotlineIds.has(str(n.plotline_id)) ? str(n.plotline_id) : "",
        character_ids: strings(n.character_ids),
        place_ids: strings(n.place_ids),
        tags: strings(n.tags),
        color: cleanColor(n.color),
        notes: str(n.notes),
        todos: cleanTodos(n.todos),
        when: str(n.when),
      });
    });
  }
  const byQuest = new Map<string, GameNode[]>();
  for (const n of nodes) byQuest.set(n.quest_id, [...(byQuest.get(n.quest_id) ?? []), n]);
  for (const group of byQuest.values()) [...group].sort((a, b) => a.order - b.order).forEach((n, k) => (n.order = k));

  const seenVar = new Set<string>();
  const variables: GameVariable[] = arr(g.variables)
    .filter(isObject)
    .map((v, i) => ({
      ...v,
      id: uniqueId(v.id, "var", i, seenVar),
      kind: (v.kind === "number" ? "number" : "flag") as GameVariable["kind"],
      label: str(v.label),
      notes: str(v.notes),
    }));
  const seenItem = new Set<string>();
  const items: GameItem[] = arr(g.items)
    .filter(isObject)
    .map((it, i) => ({
      ...it,
      id: uniqueId(it.id, "it", i, seenItem),
      name: str(it.name),
      description: str(it.description),
    }));

  return { ...g, quests, nodes, variables, items };
}

// ─── Reading order ───

/** The nodes of one quest, in order. */
export const nodesInQuest = (nodes: GameNode[], questId: string): GameNode[] =>
  nodes.filter((n) => n.quest_id === questId).sort((a, b) => a.order - b.order);

/**
 * A node kept whole inside a snapshot: repaired like any node, or dropped if it is not one. Its links and
 * options still point at the nodes it knew (checked against the live game when it is restored, not here).
 */
export function cleanNodeSnapshot(raw: unknown): GameNode | undefined {
  if (!isObject(raw) || !str(raw.id)) return undefined;
  const id = str(raw.id);
  const quest = str(raw.quest_id) || "q-snapshot";
  const targets = new Set<string>();
  for (const l of arr(raw.links)) if (isObject(l) && str(l.to)) targets.add(str(l.to));
  for (const e of arr(raw.elements)) {
    if (isObject(e)) for (const o of arr(e.options)) if (isObject(o) && str(o.to)) targets.add(str(o.to));
  }
  targets.delete(id);
  const stubs = [...targets].map((t) => ({ id: t, quest_id: quest }));
  const g = cleanGame({ quests: [{ id: quest }], nodes: [{ ...raw, quest_id: quest }, ...stubs] });
  const node = g.nodes.find((n) => n.id === id);
  return node ? { ...node, quest_id: str(raw.quest_id) } : undefined;
}
