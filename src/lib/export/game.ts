/**
 * Game exports (Game Prototyping, step 6). Pure (no Svelte, no Tauri).
 *
 *   quest bible   every quest and node as readable text: the same `Book` Word, EPUB, Markdown and
 *                 plain text already understand (quest → "chapter", node → "scene"), with
 *                 conditions and effects written as sentences, then a State chapter
 *   nodes CSV     one row per node (for a spreadsheet: numbers, status, rules, where it leads)
 *   state CSV     one row per flag, number and item, and where each is set and read
 */
import type { Condition, Effect, GameElement, GameNode, Project } from "../model/types";
import { nodesInQuest } from "../game/game";
import { contextOf, describeConditions, describeEffects, type RuleContext } from "../game/gamerules";
import { nodeLabels, nodeWordCount } from "../game/gameedit";
import type { Block, Run } from "./html";
import type { Book, BookChapter, BookScene, ExportOptions } from "./book";

export type GameExportKind = "bible" | "nodes-csv" | "state-csv";
export const GAME_EXPORT_KINDS: { id: GameExportKind; label: string; hint: string }[] = [
  { id: "bible", label: "Quest bible", hint: "Every quest and node as readable text, with conditions and effects in words" },
  { id: "nodes-csv", label: "Node list (CSV)", hint: "One row per node: status, rules, where it leads (opens in Excel, Sheets)" },
  { id: "state-csv", label: "State table (CSV)", hint: "Every flag, number and item, and where each is set and read" },
];

export const isGameCsv = (k: GameExportKind | undefined): boolean => k === "nodes-csv" || k === "state-csv";

const text = (t: string, style: { bold?: boolean; italic?: boolean } = {}): Run => ({ text: t, ...style });
const para = (...runs: Run[]): Block => ({ type: "p", runs });
const withBreaks = (s: string, style: { italic?: boolean } = {}): Run[] => {
  const runs: Run[] = [];
  s.trim().split(/\r?\n/).forEach((ln, i) => {
    if (i > 0) runs.push({ br: true });
    runs.push(text(ln, style));
  });
  return runs;
};
const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "Main quest 1: Title" */
export const questHeading = (index: number, title: string, kind: "main" | "side"): string =>
  `${kind === "main" ? "Main quest" : "Side-quest"} ${index + 1}: ${title.trim() || "Untitled quest"}`;

const nodeTitle = (n: GameNode) => n.title.trim() || "Untitled node";

/** The nodes an export covers: all, the quest of the selected node, or just that node. */
export function gameNodesFor(project: Project, options: Pick<ExportOptions, "scope" | "sceneId">): GameNode[] {
  const g = project.game;
  if (!g) return [];
  const all = g.quests.flatMap((q) => nodesInQuest(g.nodes, q.id));
  if (options.scope === "all") return all;
  const target = all.find((n) => n.id === options.sceneId);
  return !target ? [] : options.scope === "scene" ? [target] : all.filter((n) => n.quest_id === target.quest_id);
}

function elementBlocks(el: GameElement, ctx: RuleContext, nameOf: (id: string) => string, titleOf: (id: string) => string, labelOf: (id: string) => string): Block[] {
  const body = el.text.trim();
  switch (el.kind) {
    case "narration":
      return body ? [para(...withBreaks(body))] : [];
    case "dialogue": {
      if (!body && !el.parenthetical.trim()) return [];
      const runs: Run[] = [text(nameOf(el.speaker_id) || "UNKNOWN", { bold: true })];
      if (el.parenthetical.trim()) runs.push(text(` (${el.parenthetical.trim()})`, { italic: true }));
      runs.push(text(`: ${body}`));
      return [para(...runs)];
    }
    case "note":
      return body ? [{ type: "quote", runs: withBreaks(body, { italic: true }) }] : [];
    case "choice": {
      const out: Block[] = [];
      out.push(para(text("Choice", { bold: true }), ...(body ? [text(`: ${body}`)] : [])));
      el.options.forEach((o, i) => {
        const rules: string[] = [];
        if (o.requires.length) rules.push(`offered when ${describeConditions(ctx, o.requires)}`);
        if (o.effects.length) rules.push(`then ${describeEffects(ctx, o.effects)}`);
        const to = o.to ? ` → ${labelOf(o.to)} ${titleOf(o.to)}`.replace("  ", " ") : " → (nowhere yet)";
        out.push({ type: "li", ordered: true, index: i + 1, runs: [text(`${o.text.trim() || "…"}${to}${rules.length ? ` (${rules.join("; ")})` : ""}`)] });
      });
      return out;
    }
  }
}

/** `lean`: leave out what a file header already says (conditions, cast, places, effects). */
export function nodeBlocks(p: Project, n: GameNode, ctx: RuleContext, label: string, lean = false): Block[] {
  const g = p.game!;
  const chars = new Map(p.characters.map((c) => [c.id, c.name]));
  const places = new Map(p.places.map((x) => [x.id, x.name]));
  const nameOf = (id: string) => (id ? (chars.get(id) ?? "").toUpperCase() : "");
  const nodeBy = new Map(g.nodes.map((x) => [x.id, x]));
  const titleOf = (id: string) => (nodeBy.get(id) ? `“${nodeTitle(nodeBy.get(id)!)}”` : "(missing node)");
  const labels = nodeLabels(p);
  const labelOf = (id: string) => labels.get(id) ?? "";

  const blocks: Block[] = [{ type: "h", level: 2, runs: [text(`${label} ${nodeTitle(n)}${n.ending ? " (ending)" : ""}`)] }];
  if (n.summary.trim()) blocks.push(para(...withBreaks(n.summary, { italic: true })));
  if (!lean && n.requires.length) blocks.push(para(text("Available when ", { bold: true }), text(describeConditions(ctx, n.requires))));
  const cast = n.character_ids.map((id) => chars.get(id)).filter((x): x is string => !!x);
  const where = n.place_ids.map((id) => places.get(id)).filter((x): x is string => !!x);
  if (!lean && cast.length) blocks.push(para(text("Characters: ", { bold: true }), text(cast.join(", "))));
  if (!lean && where.length) blocks.push(para(text("Places: ", { bold: true }), text(where.join(", "))));
  for (const el of n.elements) blocks.push(...elementBlocks(el, ctx, nameOf, titleOf, labelOf));
  if (!lean && n.effects.length) blocks.push(para(text("Then ", { bold: true }), text(describeEffects(ctx, n.effects))));
  if (n.links.length) {
    blocks.push(para(text("Leads to", { bold: true })));
    n.links.forEach((l, i) => {
      const cond = l.requires.length ? ` (only when ${describeConditions(ctx, l.requires)})` : "";
      const lbl = l.label.trim() ? `${l.label.trim()} → ` : "";
      blocks.push({ type: "li", ordered: true, index: i + 1, runs: [text(`${lbl}${labelOf(l.to)} ${titleOf(l.to)}${cond}`.replace(/\s{2,}/g, " "))] });
    });
  }
  return blocks;
}

/** Where a flag, number or item is read or set, as short phrases ("Node 2.3 “Title”"). */
export type StateUse = { read: string[]; written: string[] };

export function stateUsage(p: Project): { variables: Map<string, StateUse>; items: Map<string, StateUse> } {
  const g = p.game;
  const variables = new Map<string, StateUse>();
  const items = new Map<string, StateUse>();
  if (!g) return { variables, items };
  const labels = nodeLabels(p);
  const slot = (m: Map<string, StateUse>, id: string) => m.get(id) ?? m.set(id, { read: [], written: [] }).get(id)!;
  const put = (list: string[], where: string) => {
    if (!list.includes(where)) list.push(where);
  };
  const reads = (where: string, conds: Condition[]) => {
    for (const k of conds.flatMap((c) => (c.kind === "any" ? c.of : [c]))) {
      if (k.kind === "flag" || k.kind === "number") put(slot(variables, k.variable_id).read, where);
      else if (k.kind === "item") put(slot(items, k.item_id).read, where);
    }
  };
  const writes = (where: string, effs: Effect[]) => {
    for (const e of effs) {
      if (e.kind === "set" || e.kind === "add") put(slot(variables, e.variable_id).written, where);
      else if (e.kind === "give") put(slot(items, e.item_id).written, where);
    }
  };
  g.quests.forEach((q, qi) => reads(`Quest ${qi + 1} “${q.title.trim() || "Untitled quest"}”`, q.requires));
  for (const n of g.nodes) {
    const where = `Node ${labels.get(n.id) ?? ""} “${nodeTitle(n)}”`.replace("  ", " ");
    reads(where, n.requires);
    writes(where, n.effects);
    for (const l of n.links) reads(where, l.requires);
    for (const e of n.elements) for (const o of e.options) {
      reads(where, o.requires);
      writes(where, o.effects);
    }
  }
  return { variables, items };
}

export function buildGameBook(project: Project, options: ExportOptions): Book {
  const g = project.game;
  const ctx = contextOf(project);
  const labels = nodeLabels(project);
  const nodes = gameNodesFor(project, options);
  const chapters: BookChapter[] = [];

  g?.quests.forEach((q, qi) => {
    const own = nodes.filter((n) => n.quest_id === q.id);
    if (own.length === 0) return;
    const intro: Block[] = [];
    if (q.summary.trim()) intro.push(para(...withBreaks(q.summary, { italic: true })));
    if (q.requires.length) intro.push(para(text("Offered when ", { bold: true }), text(describeConditions(ctx, q.requires))));
    const scenes: BookScene[] = own.map((n, i) => ({
      title: `${labels.get(n.id) ?? ""} ${nodeTitle(n)}`.trim(),
      blocks: [...(i === 0 ? intro : []), ...nodeBlocks(project, n, ctx, labels.get(n.id) ?? "")],
    }));
    chapters.push({ number: qi + 1, title: questHeading(qi, q.title, q.kind), scenes });
  });

  // The whole bible ends with the state the rules use.
  if (g && options.scope === "all" && (g.variables.length > 0 || g.items.length > 0)) {
    const { variables, items } = stateUsage(project);
    const blocks: Block[] = [];
    const line = (name: string, kind: string, use: StateUse | undefined, notes: string) => {
      const bits: string[] = [];
      if (notes.trim()) bits.push(notes.trim());
      bits.push(use?.read.length ? `read in ${use.read.join(", ")}` : "never read");
      bits.push(use?.written.length ? `set in ${use.written.join(", ")}` : "never set");
      blocks.push({ type: "li", ordered: false, index: 0, runs: [text(name, { bold: true }), text(` (${kind}): ${bits.join("; ")}.`)] });
    };
    for (const v of g.variables) line(v.label.trim() || v.id, v.kind, variables.get(v.id), v.notes);
    for (const i of g.items) line(i.name.trim() || i.id, "item", items.get(i.id), i.description);
    chapters.push({ number: g.quests.length + 1, title: "State", scenes: [{ title: "Flags, numbers and items", blocks: [{ type: "h", level: 2, runs: [text("Flags, numbers and items")] }, ...blocks] }] });
  }

  return {
    id: project.id,
    title: project.title || "Untitled",
    author: options.author.trim(),
    language: options.language || "en",
    chapters,
    // Nodes carry their own headings; no chapter-style breaks or ornaments between them.
    options: { ...options, chapterHeadings: true, sceneTitles: false, sceneBreak: "none" },
    layout: "script",
    fileStem: "quest bible",
  };
}

// ─── CSV ───

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export function nodesCsv(project: Project, options: Pick<ExportOptions, "scope" | "sceneId"> = { scope: "all" }): string {
  const g = project.game;
  const ctx = contextOf(project);
  const labels = nodeLabels(project);
  const chars = new Map(project.characters.map((c) => [c.id, c.name]));
  const places = new Map(project.places.map((x) => [x.id, x.name]));
  const plots = new Map(project.plotlines.map((x) => [x.id, x.name]));
  const quests = new Map((g?.quests ?? []).map((q) => [q.id, q]));
  const byId = new Map((g?.nodes ?? []).map((n) => [n.id, n]));
  const rows: (string | number)[][] = [["Node", "Quest", "Kind", "Title", "Status", "Ending", "Plotline", "Characters", "Places", "Words", "Available when", "Effects", "Leads to", "Summary"]];
  for (const n of gameNodesFor(project, options)) {
    const q = quests.get(n.quest_id);
    const exits = [
      ...n.links.map((l) => ({ to: l.to, cond: l.requires })),
      ...n.elements.flatMap((e) => e.options.filter((o) => o.to).map((o) => ({ to: o.to, cond: o.requires }))),
    ].map((x) => `${labels.get(x.to) ?? "?"} ${byId.get(x.to) ? nodeTitle(byId.get(x.to)!) : "(missing)"}${x.cond.length ? ` [if ${describeConditions(ctx, x.cond)}]` : ""}`);
    rows.push([
      labels.get(n.id) ?? "",
      q?.title.trim() ?? "",
      q?.kind === "side" ? "Side-quest" : "Main quest",
      nodeTitle(n),
      n.status,
      n.ending ? "yes" : "",
      plots.get(n.plotline_id) ?? "",
      n.character_ids.map((id) => chars.get(id) ?? "").filter(Boolean).join("; "),
      n.place_ids.map((id) => places.get(id) ?? "").filter(Boolean).join("; "),
      nodeWordCount(n),
      sentence(describeConditions(ctx, n.requires)),
      sentence(describeEffects(ctx, n.effects)),
      exits.join("; "),
      n.summary.replace(/\s+/g, " ").trim(),
    ]);
  }
  return csv(rows);
}

export function stateCsv(project: Project): string {
  const g = project.game;
  const { variables, items } = stateUsage(project);
  const rows: (string | number)[][] = [["Kind", "Name", "Notes", "Read in", "Set in", "Read", "Set"]];
  for (const v of g?.variables ?? []) {
    const u = variables.get(v.id);
    rows.push([v.kind === "flag" ? "Flag" : "Number", v.label.trim() || v.id, v.notes.replace(/\s+/g, " ").trim(), (u?.read ?? []).join("; "), (u?.written ?? []).join("; "), u?.read.length ?? 0, u?.written.length ?? 0]);
  }
  for (const i of g?.items ?? []) {
    const u = items.get(i.id);
    rows.push(["Item", i.name.trim() || i.id, i.description.replace(/\s+/g, " ").trim(), (u?.read ?? []).join("; "), (u?.written ?? []).join("; "), u?.read.length ?? 0, u?.written.length ?? 0]);
  }
  return csv(rows);
}
