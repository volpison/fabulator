/**
 * Snapshots of a whole game node: the pure helpers (the lists of snapshots and the auto-snapshot rules
 * are in snapshots.ts). `scene_id` of such a snapshot holds the node id, so every list of snapshots works unchanged.
 * Pure (no Svelte, no Tauri).
 */
import type { GameElement, GameNode, Project, Snapshot, SnapshotKind } from "../model/types";
import { nodesInQuest } from "./game";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Does the node hold anything worth protecting (text, a summary, or rules)? */
export function nodeHasContent(n: Pick<GameNode, "summary" | "elements" | "requires" | "effects" | "links">): boolean {
  return (
    n.summary.trim() !== "" ||
    n.requires.length > 0 ||
    n.effects.length > 0 ||
    n.links.length > 0 ||
    n.elements.some((e) => e.text.trim() !== "" || e.parenthetical.trim() !== "" || e.options.length > 0)
  );
}

/** A snapshot of a whole node. */
export function makeNodeSnapshot(n: GameNode, kind: SnapshotKind, label: string, now: number, id: string): Snapshot {
  return {
    id,
    scene_id: n.id,
    kind,
    label,
    created_at: now,
    title: n.title,
    summary: n.summary,
    content: "",
    chapter_id: n.quest_id,
    plotline_id: n.plotline_id,
    character_ids: [...n.character_ids],
    place_ids: [...n.place_ids],
    tags: [...n.tags],
    node: clone(n),
  };
}

/** The node as readable text: what Compare shows (title, summary, then each element; choices list their options). */
export function nodeToText(n: Pick<GameNode, "title" | "summary" | "elements" | "ending">, nameOf: (id: string) => string = () => ""): string {
  const out: string[] = [];
  if (n.title.trim()) out.push(n.title.trim());
  if (n.summary.trim()) out.push(`Summary: ${n.summary.trim()}`);
  for (const e of n.elements) {
    const text = e.text.trim();
    if (e.kind === "dialogue") {
      const par = e.parenthetical.trim() ? ` (${e.parenthetical.trim()})` : "";
      const who = nameOf(e.speaker_id);
      if (text || par) out.push(`${who}${par}${text ? `: ${text}` : ""}`.trim());
    } else if (e.kind === "choice") {
      const lines = [text ? `Choice: ${text}` : "Choice", ...e.options.map((o, i) => `  ${i + 1}. ${o.text.trim() || "…"}`)];
      out.push(lines.join("\n"));
    } else if (text) out.push(e.kind === "note" ? `Note: ${text}` : text);
  }
  if (n.ending) out.push("(The story may end here.)");
  return out.join("\n\n");
}

/** What changing a node means for snapshots: the part that counts (not its place, colour, status, cast, notes). */
export const nodeWriting = (n: GameNode): string => JSON.stringify([n.title, n.summary, n.elements, n.requires, n.effects, n.links, n.ending]);

/** Links and option targets only to nodes that exist (`alive`) and are not the node itself. */
function pointOnlyAt(n: GameNode, alive: ReadonlySet<string>): Pick<GameNode, "links" | "elements"> {
  const ok = (to: string) => to !== "" && to !== n.id && alive.has(to);
  const elements: GameElement[] = n.elements.map((e) =>
    e.options.some((o) => o.to && !ok(o.to)) ? { ...e, options: e.options.map((o) => (o.to && !ok(o.to) ? { ...o, to: "" } : o)) } : e
  );
  return { links: n.links.filter((l) => ok(l.to)), elements };
}

/**
 * The node with its writing (title, summary, elements, rules, ways out, ending) taken from a snapshot; its place,
 * status, colour, cast, tags and private notes stay. Ways out to nodes that no longer exist are left out.
 */
export function restoreNodeInto(n: GameNode, snap: Snapshot, alive: ReadonlySet<string>): GameNode {
  const was = snap.node;
  if (!was) return n;
  const c = clone(was);
  const { links, elements } = pointOnlyAt({ ...c, id: n.id }, alive);
  return { ...n, title: c.title, summary: c.summary, elements, requires: c.requires, effects: c.effects, links, ending: c.ending };
}

/** A node rebuilt from a snapshot of a deleted node: back at the end of its quest (or the first one). */
export function recreateNode(project: Pick<Project, "game" | "plotlines" | "characters" | "places">, snap: Snapshot, questId: string, freshId: () => string): GameNode {
  const g = project.game;
  const was = clone(snap.node as GameNode);
  const alive = new Set((g?.nodes ?? []).map((x) => x.id));
  const id = alive.has(was.id) ? freshId() : was.id;
  const { links, elements } = pointOnlyAt({ ...was, id }, alive);
  return {
    ...was,
    id,
    quest_id: questId,
    order: g ? nodesInQuest(g.nodes, questId).length : 0,
    links,
    elements,
    plotline_id: project.plotlines.some((x) => x.id === was.plotline_id) ? was.plotline_id : "",
    character_ids: was.character_ids.filter((c) => project.characters.some((x) => x.id === c)),
    place_ids: was.place_ids.filter((c) => project.places.some((x) => x.id === c)),
  };
}
