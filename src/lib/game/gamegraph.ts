/**
 * Graph view layout: nodes in layers from left to right, following the ways out. Pure.
 *
 * Layers come from the longest path from the first node of each quest. Edges that would close a loop
 * (they point back to a node already on the path) are marked `back` and do not affect the layers, so
 * a story with a "return to the hub" still lays out cleanly.
 */
import type { GameNode, Project } from "../model/types";
import { nodesInQuest } from "./game";
import { exitsFor } from "./gamecheck";

export const GRAPH_NODE_W = 150;
export const GRAPH_NODE_H = 52;
export const GRAPH_GAP_X = 70;
export const GRAPH_GAP_Y = 22;

export type GraphNode = { id: string; node: GameNode; layer: number; row: number; x: number; y: number };
export type GraphEdge = {
  from: string;
  to: string;
  kind: "link" | "option";
  label: string;
  /** Has conditions of its own. */
  conditional: boolean;
  /** Points back to an earlier node (a loop). */
  back: boolean;
};
export type GameGraph = { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number };

/** Lay out one quest (`questId`) or the whole game (`null`). */
export function layoutGraph(p: Pick<Project, "game">, questId: string | null): GameGraph {
  const g = p.game;
  const empty: GameGraph = { nodes: [], edges: [], width: 0, height: 0 };
  if (!g) return empty;
  const scope = g.quests.filter((q) => questId === null || q.id === questId);
  const ordered = scope.flatMap((q) => nodesInQuest(g.nodes, q.id));
  if (ordered.length === 0) return empty;
  const inScope = new Map(ordered.map((n, i) => [n.id, { n, i }]));

  // Edges within scope.
  const edges: GraphEdge[] = [];
  for (const n of ordered) {
    for (const x of exitsFor(n)) {
      if (!inScope.has(x.to)) continue;
      const label = x.kind === "link" ? (n.links.find((l) => l.to === x.to && l.requires === x.requires)?.label ?? "") : (n.elements.flatMap((e) => e.options).find((o) => o.to === x.to && o.requires === x.requires)?.text ?? "");
      edges.push({ from: n.id, to: x.to, kind: x.kind, label: label.trim(), conditional: x.requires.length > 0, back: false });
    }
  }
  const out = new Map<string, GraphEdge[]>();
  for (const e of edges) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e);

  // DFS from the entries (then from anything left) to find back edges.
  const state = new Map<string, 1 | 2>(); // 1 = on the path, 2 = finished
  const visit = (id: string) => {
    state.set(id, 1);
    for (const e of out.get(id) ?? []) {
      const s = state.get(e.to);
      if (s === 1 || e.to === id) e.back = true;
      else if (!s) visit(e.to);
    }
    state.set(id, 2);
  };
  const entries = scope.map((q) => nodesInQuest(g.nodes, q.id)[0]?.id).filter((x): x is string => !!x);
  for (const id of entries) if (!state.has(id)) visit(id);
  for (const { n } of inScope.values()) if (!state.has(n.id)) visit(n.id);

  // Layers: longest path over the forward edges. Entries sit in the first layer.
  const layerOf = new Map<string, number>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const e of edges) if (!e.back) (incoming.get(e.to) ?? incoming.set(e.to, []).get(e.to)!).push(e);
  const layer = (id: string): number => {
    const known = layerOf.get(id);
    if (known !== undefined) return known;
    layerOf.set(id, 0); // guards against any cycle left over
    const ins = incoming.get(id) ?? [];
    const v = ins.length === 0 ? 0 : Math.max(...ins.map((e) => layer(e.from) + 1));
    layerOf.set(id, v);
    return v;
  };
  for (const { n } of inScope.values()) layer(n.id);

  // Rows: within a layer, order by the average row of the nodes leading in (one pass), then reading order.
  const layers = new Map<number, GameNode[]>();
  for (const { n } of inScope.values()) (layers.get(layerOf.get(n.id)!) ?? layers.set(layerOf.get(n.id)!, []).get(layerOf.get(n.id)!)!).push(n);
  const rowOf = new Map<string, number>();
  const layerKeys = [...layers.keys()].sort((a, b) => a - b);
  for (const k of layerKeys) {
    const list = layers.get(k)!;
    const key = (n: GameNode) => {
      const ins = (incoming.get(n.id) ?? []).map((e) => rowOf.get(e.from)).filter((r): r is number => r !== undefined);
      return ins.length ? ins.reduce((a, b) => a + b, 0) / ins.length : Number.POSITIVE_INFINITY;
    };
    list.sort((a, b) => key(a) - key(b) || inScope.get(a.id)!.i - inScope.get(b.id)!.i);
    list.forEach((n, r) => rowOf.set(n.id, r));
  }

  const nodes: GraphNode[] = ordered.map((n) => {
    const l = layerOf.get(n.id)!;
    const r = rowOf.get(n.id)!;
    return { id: n.id, node: n, layer: l, row: r, x: l * (GRAPH_NODE_W + GRAPH_GAP_X), y: r * (GRAPH_NODE_H + GRAPH_GAP_Y) };
  });
  const maxLayer = Math.max(...nodes.map((x) => x.layer));
  const maxRow = Math.max(...nodes.map((x) => x.row));
  return {
    nodes,
    edges,
    width: (maxLayer + 1) * GRAPH_NODE_W + maxLayer * GRAPH_GAP_X,
    height: (maxRow + 1) * GRAPH_NODE_H + maxRow * GRAPH_GAP_Y,
  };
}
