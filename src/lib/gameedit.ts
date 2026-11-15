/**
 * Editing a game's quests and nodes (the Timeline). Pure functions over a Project (no Svelte, no
 * Tauri): each returns a new project, or the very same object when nothing would change (so
 * callers can tell). The stores wrap these and mark the project as changed.
 */
import type { Condition, Game, GameNode, Project, Quest, QuestKind } from "./types";
import { SCENE_STATUSES, cleanColor } from "./labels";
import { emptyGame, nodesInQuest } from "./game";

export type NewId = (prefix: string) => string;

const gameOf = (p: Project): Game => p.game ?? emptyGame();
const withGame = (p: Project, game: Game): Project => ({ ...p, game });

/** A new, empty node (the first plotline of the project is its default). */
export function newGameNode(newId: NewId, questId: string, order: number, plotlineId = ""): GameNode {
  return {
    id: newId("n"),
    quest_id: questId,
    order,
    title: "",
    summary: "",
    elements: [],
    requires: [],
    effects: [],
    links: [],
    ending: false,
    status: "idea",
    plotline_id: plotlineId,
    character_ids: [],
    place_ids: [],
    tags: [],
    color: "",
    notes: "",
    todos: [],
    when: "",
  };
}

// ─── Quests ───

/** Append a quest. The first one of a game is the main quest, the rest are side-quests. */
export function addQuest(p: Project, newId: NewId, title?: string): { project: Project; id: string } {
  const g = gameOf(p);
  const id = newId("q");
  const kind: QuestKind = g.quests.some((q) => q.kind === "main") ? "side" : "main";
  const quest: Quest = {
    id,
    title: title?.trim() || (kind === "main" ? "Main quest" : `Side-quest ${g.quests.length}`),
    kind,
    summary: "",
    plotline_id: "",
    requires: [],
  };
  return { project: withGame(p, { ...g, quests: [...g.quests, quest] }), id };
}

export type QuestFields = Partial<Pick<Quest, "title" | "summary" | "kind" | "plotline_id">>;

export function updateQuest(p: Project, id: string, fields: QuestFields): Project {
  const g = gameOf(p);
  const quest = g.quests.find((q) => q.id === id);
  if (!quest) return p;
  const clean: QuestFields = { ...fields };
  if (clean.kind !== undefined && clean.kind !== "main" && clean.kind !== "side") return p;
  const next = { ...quest, ...clean };
  if ((Object.keys(clean) as (keyof QuestFields)[]).every((k) => next[k] === quest[k])) return p;
  return withGame(p, { ...g, quests: g.quests.map((q) => (q.id === id ? next : q)) });
}

/** Delete a quest. Only an empty quest can go (nodes are never deleted as a side effect). */
export function deleteQuest(p: Project, id: string): Project {
  const g = gameOf(p);
  if (g.nodes.some((n) => n.quest_id === id) || !g.quests.some((q) => q.id === id)) return p;
  return withGame(p, { ...g, quests: g.quests.filter((q) => q.id !== id) });
}

/** Move a quest so it ends up at `toIndex` (clamped). */
export function moveQuest(p: Project, id: string, toIndex: number): Project {
  const g = gameOf(p);
  const from = g.quests.findIndex((q) => q.id === id);
  if (from === -1) return p;
  const to = Math.max(0, Math.min(g.quests.length - 1, Math.floor(toIndex)));
  if (to === from) return p;
  const quests = [...g.quests];
  const [moved] = quests.splice(from, 1);
  quests.splice(to, 0, moved);
  return withGame(p, { ...g, quests });
}

// ─── Nodes ───

/**
 * Add a node to a quest (the last one by default; a quest is made if there is none) at `atIndex`
 * (the end by default). The new node takes the project's first plotline.
 */
export function addNode(p: Project, newId: NewId, questId?: string, atIndex?: number): { project: Project; id: string } {
  let project = p;
  let g = gameOf(p);
  let target = questId && g.quests.some((q) => q.id === questId) ? questId : g.quests[g.quests.length - 1]?.id;
  if (!target) {
    const made = addQuest(p, newId);
    project = made.project;
    g = gameOf(project);
    target = made.id;
  }
  const node = newGameNode(newId, target, 0, project.plotlines[0]?.id ?? "");
  const list = nodesInQuest(g.nodes, target);
  const at = atIndex === undefined ? list.length : Math.max(0, Math.min(list.length, Math.floor(atIndex)));
  list.splice(at, 0, node);
  const order = new Map(list.map((n, i) => [n.id, i]));
  const nodes = [
    ...g.nodes.map((n) => (order.has(n.id) ? { ...n, order: order.get(n.id)! } : n)),
    { ...node, order: at },
  ];
  return { project: withGame(project, { ...g, nodes }), id: node.id };
}

export type NodeFields = Partial<
  Pick<GameNode, "title" | "summary" | "status" | "plotline_id" | "color" | "notes" | "ending">
>;

export function updateNode(p: Project, id: string, fields: NodeFields): Project {
  const g = gameOf(p);
  const node = g.nodes.find((n) => n.id === id);
  if (!node) return p;
  if (fields.status !== undefined && !(SCENE_STATUSES as readonly string[]).includes(fields.status)) return p;
  const clean: NodeFields = { ...fields };
  if (clean.color !== undefined) clean.color = cleanColor(clean.color);
  const next = { ...node, ...clean };
  if ((Object.keys(clean) as (keyof NodeFields)[]).every((k) => next[k] === node[k])) return p;
  return withGame(p, { ...g, nodes: g.nodes.map((n) => (n.id === id ? next : n)) });
}

/**
 * Put a node into `questId` at position `index` (clamped; counted among that quest's other nodes).
 * Orders stay dense in every quest touched.
 */
export function moveNode(p: Project, nodeId: string, questId: string, index: number): Project {
  const g = gameOf(p);
  const node = g.nodes.find((n) => n.id === nodeId);
  if (!node || !g.quests.some((q) => q.id === questId)) return p;
  const rest = g.nodes.filter((n) => n.id !== nodeId);
  const dest = nodesInQuest(rest, questId);
  const at = Math.max(0, Math.min(dest.length, Math.floor(index)));
  dest.splice(at, 0, { ...node, quest_id: questId });
  const updates = new Map<string, { quest_id: string; order: number }>();
  dest.forEach((n, i) => updates.set(n.id, { quest_id: questId, order: i }));
  if (node.quest_id !== questId) {
    nodesInQuest(rest, node.quest_id).forEach((n, i) => updates.set(n.id, { quest_id: node.quest_id, order: i }));
  }
  let changed = false;
  const nodes = g.nodes.map((n) => {
    const u = updates.get(n.id);
    if (!u || (u.quest_id === n.quest_id && u.order === n.order)) return n;
    changed = true;
    return { ...n, ...u };
  });
  return changed ? withGame(p, { ...g, nodes }) : p;
}

/**
 * Delete a node and close the gap in its quest. Links and choice options that led to it lose their
 * target (a link is removed, an option keeps its text with no target); conditions that mention it
 * are left for the checks to report.
 */
export function deleteNode(p: Project, nodeId: string): Project {
  const g = gameOf(p);
  const node = g.nodes.find((n) => n.id === nodeId);
  if (!node) return p;
  const rest = g.nodes.filter((n) => n.id !== nodeId);
  const order = new Map(nodesInQuest(rest, node.quest_id).map((n, i) => [n.id, i]));
  const nodes = rest.map((n) => {
    const links = n.links.filter((l) => l.to !== nodeId);
    const elements = n.elements.map((e) =>
      e.options.some((o) => o.to === nodeId)
        ? { ...e, options: e.options.map((o) => (o.to === nodeId ? { ...o, to: "" } : o)) }
        : e
    );
    const reordered = order.has(n.id) && order.get(n.id) !== n.order;
    const linked = links.length !== n.links.length;
    const optioned = elements.some((e, i) => e !== n.elements[i]);
    if (!reordered && !linked && !optioned) return n;
    return { ...n, order: order.has(n.id) ? order.get(n.id)! : n.order, links, elements };
  });
  return withGame(p, { ...g, nodes });
}

/** A deleted character or place no longer appears on any node. */
export function removeCastFromNodes(p: Project, kind: "character" | "place", id: string): Project {
  if (!p.game) return p;
  const key = kind === "character" ? "character_ids" : "place_ids";
  if (!p.game.nodes.some((n) => n[key].includes(id))) return p;
  return withGame(p, {
    ...p.game,
    nodes: p.game.nodes.map((n) => (n[key].includes(id) ? { ...n, [key]: n[key].filter((x) => x !== id) } : n)),
  });
}

// ─── Reading the Timeline ───

/** Does the node hold anything worth asking about before it is deleted? */
export const nodeIsEmpty = (n: GameNode): boolean =>
  n.elements.every((e) => !e.text.trim() && e.options.length === 0) &&
  !n.summary.trim() &&
  !n.notes.trim() &&
  !n.title.trim() &&
  n.requires.length === 0 &&
  n.effects.length === 0 &&
  n.links.length === 0;

const conditionCount = (list: Condition[]) => list.length;

/** What a card shows at a glance: how many conditions, effects and ways out a node has. */
export function nodeBadges(n: GameNode): { requires: number; effects: number; exits: number } {
  const optionExits = n.elements.reduce((sum, e) => sum + e.options.filter((o) => o.to).length, 0);
  return { requires: conditionCount(n.requires), effects: n.effects.length, exits: n.links.length + optionExits };
}

/** The ids of the nodes this node leads to (links, then choice options), without repeats. */
export function exitsOf(n: GameNode): string[] {
  const ids = [...n.links.map((l) => l.to), ...n.elements.flatMap((e) => e.options.map((o) => o.to))].filter(Boolean);
  return [...new Set(ids)];
}

export type QuestSummary = { nodes: number; words: number; branches: number };

/** Counts for a quest's header: nodes, words of text, and nodes that branch (two or more exits). */
export function questSummary(p: Pick<Project, "game">, questId: string): QuestSummary {
  const nodes = (p.game?.nodes ?? []).filter((n) => n.quest_id === questId);
  const words = nodes.reduce(
    (sum, n) =>
      sum +
      n.elements
        .filter((e) => e.kind !== "note")
        .reduce((w, e) => w + (e.text.trim() ? e.text.trim().split(/\s+/).length : 0), 0),
    0
  );
  return { nodes: nodes.length, words, branches: nodes.filter((n) => exitsOf(n).length >= 2).length };
}
