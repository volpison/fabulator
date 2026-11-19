<script lang="ts">
  import { project, selectedNodeId, mainView } from "../lib/app/stores";
  import { layoutGraph, GRAPH_NODE_H, GRAPH_NODE_W } from "../lib/game/gamegraph";
  import { nodeLabels } from "../lib/game/gameedit";
  import { colorHex } from "../lib/model/labels";

  /** "" = every quest. */
  let scope = "";
  const PAD = 16;

  $: quests = $project?.game?.quests ?? [];
  $: if (scope && !quests.some((q) => q.id === scope)) scope = "";
  $: graph = $project ? layoutGraph($project, scope || null) : { nodes: [], edges: [], width: 0, height: 0 };
  $: labels = $project ? nodeLabels($project) : new Map<string, string>();
  $: at = new Map(graph.nodes.map((n) => [n.id, n]));

  const clip = (t: string, max: number) => (t.length > max ? t.slice(0, max - 1) + "…" : t);

  /** A path from the right edge of one node to the left edge of another; loops go round the top. */
  function path(from: string, to: string, back: boolean): string {
    const a = at.get(from);
    const b = at.get(to);
    if (!a || !b) return "";
    if (from === to || back) {
      const x1 = a.x + GRAPH_NODE_W / 2 + PAD;
      const x2 = b.x + GRAPH_NODE_W / 2 + PAD;
      const top = Math.min(a.y, b.y) + PAD - 14;
      return `M ${x1} ${a.y + PAD} C ${x1} ${top - 18}, ${x2} ${top - 18}, ${x2} ${b.y + PAD}`;
    }
    const x1 = a.x + GRAPH_NODE_W + PAD;
    const y1 = a.y + GRAPH_NODE_H / 2 + PAD;
    const x2 = b.x + PAD;
    const y2 = b.y + GRAPH_NODE_H / 2 + PAD;
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  }

  const open = (id: string) => {
    selectedNodeId.set(id);
    mainView.set("manuscript");
  };
  function onKey(id: string, e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      open(id);
    } else if (e.key === " ") {
      e.preventDefault();
      selectedNodeId.set(id);
    }
  }
</script>

<div class="wrap">
  <div class="bar">
    <label>
      Show
      <select bind:value={scope}>
        <option value="">All quests</option>
        {#each quests as q}<option value={q.id}>{q.title.trim() || "Untitled quest"}</option>{/each}
      </select>
    </label>
    <span class="legend">
      <svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke="currentColor" stroke-width="1.6" /></svg> a way out
      <svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 3" /></svg> has conditions
      <svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke="var(--accent)" stroke-width="1.6" /></svg> loops back
    </span>
  </div>

  {#if graph.nodes.length === 0}
    <p class="empty">No nodes to draw yet.</p>
  {:else}
    <div class="canvas">
      <svg width={graph.width + PAD * 2} height={graph.height + PAD * 2 + 20} role="group" aria-label="Story graph">
        <defs>
          <marker id="gg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <g transform="translate(0 14)">
          {#each graph.edges as e}
            <path
              d={path(e.from, e.to, e.back)}
              class="edge"
              class:back={e.back}
              stroke-dasharray={e.conditional ? "5 3" : undefined}
              fill="none"
              marker-end="url(#gg-arrow)"
            >
              <title>{e.label || (e.kind === "option" ? "Choice" : "Way out")}{e.conditional ? " (has conditions)" : ""}</title>
            </path>
          {/each}
          {#each graph.nodes as n (n.id)}
            {@const hex = colorHex(n.node.color)}
            <g
              class="node"
              class:selected={n.id === $selectedNodeId}
              transform="translate({n.x + PAD} {n.y + PAD})"
              role="button"
              tabindex="0"
              aria-label="{labels.get(n.id) ?? ''} {n.node.title.trim() || 'Untitled node'}"
              on:click={() => selectedNodeId.set(n.id)}
              on:dblclick={() => open(n.id)}
              on:keydown={(e) => onKey(n.id, e)}
            >
              <rect width={GRAPH_NODE_W} height={GRAPH_NODE_H} rx="8" />
              {#if hex}<rect width="5" height={GRAPH_NODE_H} rx="2" fill={hex} stroke="none" />{/if}
              <text x="12" y="20" class="num">{labels.get(n.id) ?? ""}{n.node.ending ? " · end" : ""}</text>
              <text x="12" y="39" class="ttl">{clip(n.node.title.trim() || "Untitled node", 20)}</text>
              <title>{n.node.title.trim() || "Untitled node"}</title>
            </g>
          {/each}
        </g>
      </svg>
    </div>
    <p class="hint">Click a node to edit its details · Double-click to write it</p>
  {/if}
</div>

<style>
  .wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .bar { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1.25rem; font-size: 0.8rem; color: var(--text-muted); flex-wrap: wrap; }
  .bar select { margin-left: 0.3rem; }
  .legend { display: inline-flex; align-items: center; gap: 0.4rem; }
  .legend svg { margin-left: 0.6rem; }
  .canvas { flex: 1; overflow: auto; padding: 0 1.25rem 0.5rem; color: var(--text-muted); }
  .edge { stroke: currentColor; stroke-width: 1.5; }
  .edge.back { stroke: var(--accent); }
  .node { cursor: pointer; color: var(--text); }
  .node rect { fill: var(--bg-panel); stroke: var(--border); stroke-width: 1.5; }
  .node:hover rect, .node:focus rect { stroke: var(--accent); }
  .node.selected rect { stroke: var(--accent); stroke-width: 2.5; }
  .node:focus { outline: none; }
  .num { font-size: 10px; fill: var(--text-muted); }
  .ttl { font-size: 12.5px; fill: var(--text); font-weight: 600; }
  .empty, .hint { color: var(--text-muted); font-size: 0.8rem; padding: 0 1.25rem; }
</style>
