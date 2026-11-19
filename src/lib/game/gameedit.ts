/**
 * Editing a game's quests and nodes (the Timeline). Pure functions over a Project (no Svelte, no
 * Tauri): each returns a new project, or the very same object when nothing would change (so
 * callers can tell). The stores wrap these and mark the project as changed.
 */
import type {
  ChoiceOption, Condition, Game, GameElement, GameElementKind, GameItem, GameLink, GameNode, GameVariable, Project, Quest, QuestKind,
} from "../model/types";
import { SCENE_STATUSES, cleanColor } from "../model/labels";
import { countWordsInText } from "../model/textcount";
import { ELEMENT_KINDS, cleanConditions, cleanEffects, emptyGame, nodesInQuest } from "./game";

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

// ─── Writing a node: elements, choice options and links ───

function editNode(p: Project, nodeId: string, fn: (n: GameNode) => GameNode): Project {
  const g = gameOf(p);
  const node = g.nodes.find((x) => x.id === nodeId);
  if (!node) return p;
  const next = fn(node);
  return next === node ? p : withGame(p, { ...g, nodes: g.nodes.map((x) => (x.id === nodeId ? next : x)) });
}

const nodeExists = (p: Project, id: string) => gameOf(p).nodes.some((n) => n.id === id);

/** A new element. Only dialogue has a speaker; only a choice has options. */
export function newGameElement(newId: NewId, kind: GameElementKind, speakerId = ""): GameElement {
  return {
    id: newId("ge"),
    kind,
    speaker_id: kind === "dialogue" ? speakerId : "",
    parenthetical: "",
    text: "",
    options: [],
  };
}

/** Insert an element at `atIndex` (the end by default). A new dialogue may already have its speaker. */
export function addElement(
  p: Project,
  newId: NewId,
  nodeId: string,
  kind: GameElementKind = "narration",
  atIndex?: number,
  speakerId = ""
): { project: Project; id: string } {
  const node = gameOf(p).nodes.find((x) => x.id === nodeId);
  if (!node || !(ELEMENT_KINDS as readonly string[]).includes(kind)) return { project: p, id: "" };
  const el = newGameElement(newId, kind, speakerId);
  const at = atIndex === undefined ? node.elements.length : Math.max(0, Math.min(node.elements.length, Math.floor(atIndex)));
  const elements = [...node.elements];
  elements.splice(at, 0, el);
  const cast = el.speaker_id && !node.character_ids.includes(el.speaker_id) ? [...node.character_ids, el.speaker_id] : node.character_ids;
  return { project: editNode(p, nodeId, (n) => ({ ...n, elements, character_ids: cast })), id: el.id };
}

export type ElementFields = Partial<Pick<GameElement, "kind" | "speaker_id" | "parenthetical" | "text">>;

/**
 * Change an element. Only dialogue has a speaker and a parenthetical (changing the kind away from
 * dialogue clears them). A choice that already has options cannot change kind (that would lose the
 * options): delete the options first. A speaker joins the node's cast. The first words written in
 * an "Idea" node make it a "Draft".
 */
export function updateElement(p: Project, nodeId: string, elementId: string, fields: ElementFields): Project {
  if (fields.kind !== undefined && !(ELEMENT_KINDS as readonly string[]).includes(fields.kind)) return p;
  return editNode(p, nodeId, (n) => {
    const at = n.elements.findIndex((e) => e.id === elementId);
    if (at === -1) return n;
    const el = n.elements[at];
    const kind = fields.kind ?? el.kind;
    if (el.kind === "choice" && kind !== "choice" && el.options.length > 0) return n;
    let next: GameElement = { ...el, ...fields, kind };
    if (kind !== "dialogue") next = { ...next, speaker_id: "", parenthetical: "" };
    else next = { ...next, parenthetical: next.parenthetical.trim().replace(/^\((.*)\)$/s, "$1") };
    if (kind !== "choice" && next.options.length > 0) next = { ...next, options: [] };
    const unchanged = (Object.keys(next) as (keyof GameElement)[]).every((k) => next[k] === el[k]);
    if (unchanged) return n;
    const elements = n.elements.map((e, i) => (i === at ? next : e));
    const cast = next.speaker_id && !n.character_ids.includes(next.speaker_id) ? [...n.character_ids, next.speaker_id] : n.character_ids;
    const status = n.status === "idea" && next.kind !== "note" && next.text.trim() ? "draft" : n.status;
    return { ...n, elements, character_ids: cast, status };
  });
}

/** Put an element at position `toIndex` (clamped) in its node. */
export function moveElement(p: Project, nodeId: string, elementId: string, toIndex: number): Project {
  return editNode(p, nodeId, (n) => {
    const from = n.elements.findIndex((e) => e.id === elementId);
    if (from === -1) return n;
    const to = Math.max(0, Math.min(n.elements.length - 1, Math.floor(toIndex)));
    if (to === from) return n;
    const elements = [...n.elements];
    const [moved] = elements.splice(from, 1);
    elements.splice(to, 0, moved);
    return { ...n, elements };
  });
}

export function deleteElement(p: Project, nodeId: string, elementId: string): Project {
  return editNode(p, nodeId, (n) =>
    n.elements.some((e) => e.id === elementId) ? { ...n, elements: n.elements.filter((e) => e.id !== elementId) } : n
  );
}

/**
 * Who answers? For the dialogue at `index`: the nearest earlier speaker in the node who is not the
 * same character ("" when nobody else has spoken yet). Used by "reply" (Ctrl+Enter).
 */
export function replySpeaker(elements: GameElement[], index: number): string {
  const current = elements[index]?.kind === "dialogue" ? elements[index].speaker_id : "";
  for (let i = Math.min(index, elements.length) - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.kind === "dialogue" && e.speaker_id && e.speaker_id !== current) return e.speaker_id;
  }
  return "";
}

function editChoice(p: Project, nodeId: string, elementId: string, fn: (options: ChoiceOption[]) => ChoiceOption[]): Project {
  return editNode(p, nodeId, (n) => {
    const at = n.elements.findIndex((e) => e.id === elementId && e.kind === "choice");
    if (at === -1) return n;
    const options = fn(n.elements[at].options);
    if (options === n.elements[at].options) return n;
    return { ...n, elements: n.elements.map((e, i) => (i === at ? { ...e, options } : e)) };
  });
}

/** Add an option to a choice. Its conditions and effects are edited in a later step. */
export function addOption(p: Project, newId: NewId, nodeId: string, elementId: string): { project: Project; id: string } {
  const id = newId("opt");
  const project = editChoice(p, nodeId, elementId, (opts) => [...opts, { id, text: "", requires: [], effects: [], to: "" }]);
  return { project, id: project === p ? "" : id };
}

/** Change an option's text or target (a node that exists, or "" for nowhere yet). */
export function updateOption(
  p: Project,
  nodeId: string,
  elementId: string,
  optionId: string,
  fields: Partial<Pick<ChoiceOption, "text" | "to">>
): Project {
  if (fields.to !== undefined && fields.to !== "" && !nodeExists(p, fields.to)) return p;
  return editChoice(p, nodeId, elementId, (opts) => {
    const at = opts.findIndex((o) => o.id === optionId);
    if (at === -1) return opts;
    const next = { ...opts[at], ...fields };
    if (next.text === opts[at].text && next.to === opts[at].to) return opts;
    return opts.map((o, i) => (i === at ? next : o));
  });
}

export function deleteOption(p: Project, nodeId: string, elementId: string, optionId: string): Project {
  return editChoice(p, nodeId, elementId, (opts) => (opts.some((o) => o.id === optionId) ? opts.filter((o) => o.id !== optionId) : opts));
}

/** Add a way out of a node to another node (a link needs a target that exists). Conditions come later. */
export function addLink(p: Project, newId: NewId, nodeId: string, to: string): { project: Project; id: string } {
  if (!nodeExists(p, to)) return { project: p, id: "" };
  const link: GameLink = { id: newId("ln"), to, label: "", requires: [] };
  const project = editNode(p, nodeId, (n) => ({ ...n, links: [...n.links, link] }));
  return { project, id: project === p ? "" : link.id };
}

export function updateLink(p: Project, nodeId: string, linkId: string, fields: Partial<Pick<GameLink, "to" | "label">>): Project {
  if (fields.to !== undefined && !nodeExists(p, fields.to)) return p;
  return editNode(p, nodeId, (n) => {
    const at = n.links.findIndex((l) => l.id === linkId);
    if (at === -1) return n;
    const next = { ...n.links[at], ...fields };
    if (next.to === n.links[at].to && next.label === n.links[at].label) return n;
    return { ...n, links: n.links.map((l, i) => (i === at ? next : l)) };
  });
}

export function deleteLink(p: Project, nodeId: string, linkId: string): Project {
  return editNode(p, nodeId, (n) => (n.links.some((l) => l.id === linkId) ? { ...n, links: n.links.filter((l) => l.id !== linkId) } : n));
}

// ─── Reading order and counts ───

/** Every node in reading order: quest by quest, node by node. */
export function gameReadingOrder(p: Pick<Project, "game">): GameNode[] {
  const g = p.game;
  return g ? g.quests.flatMap((q) => nodesInQuest(g.nodes, q.id)) : [];
}

/** A node's number: its quest's number and its own ("2.3" = third node of the second quest). */
export function nodeLabels(p: Pick<Project, "game">): Map<string, string> {
  const g = p.game;
  const out = new Map<string, string>();
  if (!g) return out;
  g.quests.forEach((q, qi) => nodesInQuest(g.nodes, q.id).forEach((n, i) => out.set(n.id, `${qi + 1}.${i + 1}`)));
  return out;
}

/** Words of narration, dialogue and choice text (private notes and options are not counted). */
export const nodeWordCount = (n: Pick<GameNode, "elements">): number =>
  n.elements
    .filter((e) => e.kind !== "note")
    .reduce((w, e) => w + countWordsInText(e.text), 0);

// ─── The registry: variables and items ───

export function addVariable(p: Project, newId: NewId, kind: GameVariable["kind"] = "flag", label?: string): { project: Project; id: string } {
  const g = gameOf(p);
  const id = newId("var");
  const variable: GameVariable = { id, kind: kind === "number" ? "number" : "flag", label: label?.trim() || (kind === "number" ? "New number" : "New flag"), notes: "" };
  return { project: withGame(p, { ...g, variables: [...g.variables, variable] }), id };
}

export type VariableFields = Partial<Pick<GameVariable, "label" | "kind" | "notes">>;

export function updateVariable(p: Project, id: string, fields: VariableFields): Project {
  const g = gameOf(p);
  const v = g.variables.find((x) => x.id === id);
  if (!v) return p;
  if (fields.kind !== undefined && fields.kind !== "flag" && fields.kind !== "number") return p;
  const next = { ...v, ...fields };
  if ((Object.keys(fields) as (keyof VariableFields)[]).every((k) => next[k] === v[k])) return p;
  return withGame(p, { ...g, variables: g.variables.map((x) => (x.id === id ? next : x)) });
}

/** Delete a variable. Conditions and effects that mention it are left (the checks report them). */
export function deleteVariable(p: Project, id: string): Project {
  const g = gameOf(p);
  return g.variables.some((x) => x.id === id) ? withGame(p, { ...g, variables: g.variables.filter((x) => x.id !== id) }) : p;
}

export function addItem(p: Project, newId: NewId, name?: string): { project: Project; id: string } {
  const g = gameOf(p);
  const id = newId("it");
  const item: GameItem = { id, name: name?.trim() || "New item", description: "" };
  return { project: withGame(p, { ...g, items: [...g.items, item] }), id };
}

export type ItemFields = Partial<Pick<GameItem, "name" | "description">>;

export function updateItem(p: Project, id: string, fields: ItemFields): Project {
  const g = gameOf(p);
  const it = g.items.find((x) => x.id === id);
  if (!it) return p;
  const next = { ...it, ...fields };
  if ((Object.keys(fields) as (keyof ItemFields)[]).every((k) => next[k] === it[k])) return p;
  return withGame(p, { ...g, items: g.items.map((x) => (x.id === id ? next : x)) });
}

export function deleteItem(p: Project, id: string): Project {
  const g = gameOf(p);
  return g.items.some((x) => x.id === id) ? withGame(p, { ...g, items: g.items.filter((x) => x.id !== id) }) : p;
}

// ─── Conditions and effects ───

/** Where a list of conditions or effects lives. A quest and a link have only conditions. */
export type RuleTarget =
  | { kind: "quest"; questId: string }
  | { kind: "node"; nodeId: string }
  | { kind: "link"; nodeId: string; linkId: string }
  | { kind: "option"; nodeId: string; elementId: string; optionId: string };

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Replace the conditions (`requires`) or effects of a target with `rows`. The rows are cleaned the
 * way a loaded file is (unreadable ones are dropped). Returns the same project when nothing
 * changes, or when the target does not have that kind of list.
 */
export function setRules(p: Project, target: RuleTarget, list: "requires" | "effects", rows: unknown): Project {
  const value = list === "requires" ? cleanConditions(rows) : cleanEffects(rows);
  const g = gameOf(p);
  switch (target.kind) {
    case "quest": {
      if (list !== "requires") return p;
      const q = g.quests.find((x) => x.id === target.questId);
      if (!q || sameJson(q.requires, value)) return p;
      return withGame(p, { ...g, quests: g.quests.map((x) => (x.id === q.id ? { ...x, requires: value as Condition[] } : x)) });
    }
    case "node":
      return editNode(p, target.nodeId, (n) => (sameJson(n[list], value) ? n : { ...n, [list]: value }));
    case "link":
      if (list !== "requires") return p;
      return editNode(p, target.nodeId, (n) => {
        const l = n.links.find((x) => x.id === target.linkId);
        if (!l || sameJson(l.requires, value)) return n;
        return { ...n, links: n.links.map((x) => (x.id === l.id ? { ...x, requires: value as Condition[] } : x)) };
      });
    case "option":
      return editNode(p, target.nodeId, (n) => {
        const at = n.elements.findIndex((e) => e.id === target.elementId && e.kind === "choice");
        if (at === -1) return n;
        const o = n.elements[at].options.find((x) => x.id === target.optionId);
        if (!o || sameJson(o[list], value)) return n;
        const options = n.elements[at].options.map((x) => (x.id === o.id ? { ...x, [list]: value } : x));
        return { ...n, elements: n.elements.map((e, i) => (i === at ? { ...e, options } : e)) };
      });
  }
}
