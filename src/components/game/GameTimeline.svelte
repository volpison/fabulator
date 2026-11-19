<script lang="ts">
  import { project } from "../../lib/app/stores/core";
  import {
    addGameNode,
    addGameQuest,
    deleteGameNode,
    deleteGameQuest,
    moveGameNode,
    moveGameQuest,
    setGameRules,
    updateGameNode,
    updateGameQuest,
  } from "../../lib/app/stores/game";
  import { mainView, selectedNodeId } from "../../lib/app/stores/ui";
  import { platform } from "../../lib/platform";
  import { nodesInQuest } from "../../lib/game/game";
  import { contextOf, describeConditions, describeEffects } from "../../lib/game/gamerules";
  import { exitsOf, nodeBadges, nodeIsEmpty, questSummary } from "../../lib/game/gameedit";
  import RulesEditor from "./RulesEditor.svelte";
  import GameGraph from "./GameGraph.svelte";
  import { SCENE_COLORS, SCENE_STATUSES, STATUS_LABEL, colorHex, type SceneStatus } from "../../lib/model/labels";
  import type { Condition, GameNode, QuestKind } from "../../lib/model/types";

  /** Lanes (one row of cards per quest) or the graph of how nodes lead to each other. */
  let layout: "lanes" | "graph" = "lanes";

  $: game = $project?.game ?? null;
  $: ctx = contextOf($project ?? { game: undefined, characters: [], abilities: [] });
  $: quests = game?.quests ?? [];
  $: selected = game?.nodes.find((n) => n.id === $selectedNodeId) ?? null;
  $: selectedQuest = selected ? quests.find((q) => q.id === selected.quest_id) ?? null : null;
  $: titleOf = new Map((game?.nodes ?? []).map((n) => [n.id, n.title.trim() || "Untitled node"]));

  const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;

  function snippet(text: string, max = 140): string {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }

  function select(id: string) {
    selectedNodeId.set(id);
  }

  /** Double-click (or Enter on the card) opens the node in the writing view. */
  function open(id: string) {
    selectedNodeId.set(id);
    mainView.set("manuscript");
  }

  function onCardKey(id: string, e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return; // keys typed in the card's own controls are theirs
    if (e.key === " ") {
      e.preventDefault();
      select(id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      open(id);
    }
  }

  function onAddNode() {
    addGameNode(selected?.quest_id);
  }

  /** Node `n` one place earlier (-1) or later (+1) inside its quest. */
  function nudge(n: GameNode, delta: number) {
    moveGameNode(n.id, n.quest_id, n.order + delta);
  }

  async function onDeleteNode(n: GameNode) {
    if (
      !nodeIsEmpty(n) &&
      !(await platform().confirm(
        `Delete “${n.title.trim() || "Untitled node"}”? Its text, conditions and links will be removed.`,
        { title: "Delete node", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" }
      ))
    ) {
      return;
    }
    deleteGameNode(n.id);
  }

  function setStatus(id: string, e: Event) {
    updateGameNode(id, { status: valueOf(e) as SceneStatus });
  }
  function setField(id: string, field: "title" | "summary" | "notes" | "plotline_id" | "color", e: Event) {
    updateGameNode(id, { [field]: valueOf(e) });
  }
</script>

{#if $project}
  <div class="game-timeline">
    <div class="toolbar">
      <button class="add" on:click={onAddNode}>+ Add node</button>
      <button class="add" on:click={() => addGameQuest()}>+ Add quest</button>
      <span class="seg" role="group" aria-label="Layout">
        <button class:on={layout === "lanes"} aria-pressed={layout === "lanes"} on:click={() => (layout = "lanes")}>Lanes</button>
        <button class:on={layout === "graph"} aria-pressed={layout === "graph"} on:click={() => (layout = "graph")}>Graph</button>
      </span>
      <span class="hint">Click a node to edit its details · Double-click (or Enter) to write it · 🔒 conditions · ⚡ effects · ⑂ a branch · Declare flags, numbers and items in the State panel</span>
    </div>

    {#if layout === "graph"}
      <GameGraph />
    {:else}
    <div class="scroll">
      {#each quests as quest, qi (quest.id)}
        {@const sum = questSummary($project, quest.id)}
        {@const nodes = nodesInQuest(game?.nodes ?? [], quest.id)}
        <section class="quest" aria-label={quest.title}>
          <header class="quest-head">
            <input
              class="quest-title"
              value={quest.title}
              aria-label="Quest title"
              on:change={(e) => updateGameQuest(quest.id, { title: valueOf(e).trim() || quest.title })}
            />
            <select
              class="kind kind-{quest.kind}"
              aria-label="Kind of quest"
              value={quest.kind}
              on:change={(e) => updateGameQuest(quest.id, { kind: valueOf(e) as QuestKind })}
            >
              <option value="main">Main quest</option>
              <option value="side">Side-quest</option>
            </select>
            <span class="counts">
              {sum.nodes} node{sum.nodes === 1 ? "" : "s"} · {sum.words} words{sum.branches ? ` · ${sum.branches} branching` : ""}
            </span>
            <span class="spacer"></span>
            <button class="icon" title="Move quest up" aria-label="Move quest up" disabled={qi === 0} on:click={() => moveGameQuest(quest.id, qi - 1)}>▲</button>
            <button class="icon" title="Move quest down" aria-label="Move quest down" disabled={qi >= quests.length - 1} on:click={() => moveGameQuest(quest.id, qi + 1)}>▼</button>
            {#if sum.nodes === 0}
              <button class="icon" title="Delete this empty quest" aria-label="Delete empty quest" on:click={() => deleteGameQuest(quest.id)}>✕</button>
            {/if}
          </header>

          <details class="quest-rules">
            <summary>Offered when{quest.requires.length ? ` (${quest.requires.length})` : ""}</summary>
            <RulesEditor
              mode="conditions"
              title="This quest is offered when"
              rows={quest.requires}
              onchange={(rows) => setGameRules({ kind: "quest", questId: quest.id }, "requires", rows as Condition[])}
            />
          </details>

          {#if nodes.length === 0}
            <p class="empty">
              No nodes yet.
              <button class="link" on:click={() => addGameNode(quest.id)}>Add the first node</button>
            </p>
          {/if}

          <div class="cards">
            {#each nodes as n (n.id)}
              {@const hex = colorHex(n.color)}
              {@const badges = nodeBadges(n)}
              {@const exits = exitsOf(n)}
              <div
                class="card"
                class:selected={n.id === $selectedNodeId}
                style={hex ? `border-left: 4px solid ${hex}` : ""}
                role="button"
                tabindex="0"
                aria-pressed={n.id === $selectedNodeId}
                aria-label="Node {n.order + 1}: {n.title.trim() || 'Untitled node'}"
                on:click={() => select(n.id)}
                on:dblclick={() => open(n.id)}
                on:keydown={(e) => onCardKey(n.id, e)}
              >
                <div class="card-top">
                  <span class="num">{n.order + 1}</span>
                  {#if n.ending}<span class="badge ending" title="The story may end here">End</span>{/if}
                  <span class="spacer"></span>
                  <button class="icon" title="Move earlier" aria-label="Move node earlier" disabled={n.order === 0} on:click|stopPropagation={() => nudge(n, -1)}>◀</button>
                  <button class="icon" title="Move later" aria-label="Move node later" disabled={n.order >= nodes.length - 1} on:click|stopPropagation={() => nudge(n, 1)}>▶</button>
                  <button class="icon" title="Delete node" aria-label="Delete node" on:click|stopPropagation={() => onDeleteNode(n)}>✕</button>
                </div>
                <div class="card-title" class:none={!n.title.trim()}>{n.title.trim() || "Untitled node"}</div>
                {#if n.summary.trim()}
                  <div class="card-summary">{snippet(n.summary)}</div>
                {:else}
                  <div class="card-summary none">No summary yet</div>
                {/if}
                {#if exits.length > 0}
                  <div class="exits" title="Where this node leads">
                    {#each exits.slice(0, 3) as to}<span>→ {titleOf.get(to) ?? "?"}</span>{/each}
                    {#if exits.length > 3}<span>+{exits.length - 3} more</span>{/if}
                  </div>
                {/if}
                <div class="card-bottom">
                  {#if badges.requires}<span class="badge" title={"Available when " + describeConditions(ctx, n.requires)}>🔒 {badges.requires}</span>{/if}
                  {#if badges.effects}<span class="badge" title={"Then " + describeEffects(ctx, n.effects)}>⚡ {badges.effects}</span>{/if}
                  {#if badges.exits > 1}<span class="badge" title="A branch: several ways out">⑂ {badges.exits}</span>{/if}
                  <span class="spacer"></span>
                  <select
                    class="status status-{n.status}"
                    aria-label="Status of node {n.order + 1}"
                    value={n.status}
                    on:click|stopPropagation
                    on:keydown|stopPropagation
                    on:change={(e) => setStatus(n.id, e)}
                  >
                    {#each SCENE_STATUSES as st}
                      <option value={st}>{STATUS_LABEL[st]}</option>
                    {/each}
                  </select>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
    {/if}

    {#if selected}
      {@const n = selected}
      <section class="details" aria-label="Node details">
        <h3>{selectedQuest ? `${selectedQuest.title} · ` : ""}Node {n.order + 1}</h3>
        <div class="meta-fields">
          <label class="field">
            <span>Title</span>
            <input value={n.title} placeholder="e.g. Search the well" on:input={(e) => setField(n.id, "title", e)} />
          </label>
          <label class="field">
            <span>Plotline</span>
            <select value={n.plotline_id} on:change={(e) => setField(n.id, "plotline_id", e)}>
              <option value="">—</option>
              {#each $project.plotlines as pl}
                <option value={pl.id}>{pl.name}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>Colour</span>
            <select value={n.color} on:change={(e) => setField(n.id, "color", e)}>
              <option value="">None</option>
              {#each SCENE_COLORS as c}
                <option value={c.id}>{c.label}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>Status</span>
            <select value={n.status} on:change={(e) => setStatus(n.id, e)}>
              {#each SCENE_STATUSES as st}
                <option value={st}>{STATUS_LABEL[st]}</option>
              {/each}
            </select>
          </label>
        </div>
        <label class="check">
          <input type="checkbox" checked={n.ending} on:change={(e) => updateGameNode(n.id, { ending: e.currentTarget.checked })} />
          The story may end here (not reported as a dead end)
        </label>
        <label class="field wide">
          <span>Summary</span>
          <textarea
            rows="4"
            value={n.summary}
            placeholder="What happens here, in your own words."
            on:input={(e) => setField(n.id, "summary", e)}
          ></textarea>
        </label>
        <label class="field wide">
          <span>Notes <em>private</em></span>
          <textarea rows="2" value={n.notes} on:input={(e) => setField(n.id, "notes", e)}></textarea>
        </label>
      </section>
    {/if}
  </div>
{/if}

<style>
  .game-timeline {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--text);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .add {
    font-size: 0.8rem;
    padding: 0.3rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .add:hover {
    border-color: var(--accent);
  }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .seg button { font-size: 0.8rem; padding: 0.3rem 0.7rem; background: var(--bg); color: var(--text-muted); }
  .seg button.on { background: var(--bg-sidebar); color: var(--text); font-weight: 600; }
  .hint {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1rem 1.25rem 1.5rem;
  }

  .quest {
    margin-bottom: 2rem;
  }
  .quest-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }
  .quest-title {
    font-size: 1.05rem;
    font-weight: 700;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--text);
    padding: 0.15rem 0.4rem;
    min-width: 8rem;
  }
  .quest-title:hover,
  .quest-title:focus {
    border-color: var(--border);
    outline: none;
  }
  .kind-main {
    font-weight: 700;
  }
  .counts {
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .empty {
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .link {
    color: var(--accent);
    text-decoration: underline;
    font-size: inherit;
  }

  .quest-rules {
    margin-bottom: 0.75rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .quest-rules summary {
    cursor: pointer;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    gap: 0.75rem;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-panel);
    cursor: pointer;
  }
  .card:hover {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .card.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg-panel));
  }
  .card-top,
  .card-bottom {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .num {
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .spacer {
    flex: 1;
  }
  .icon {
    width: 1.35rem;
    height: 1.35rem;
    font-size: 0.7rem;
    border-radius: 4px;
    color: var(--text-muted);
  }
  .icon:hover:not(:disabled) {
    background: var(--bg-sidebar);
    color: var(--text);
  }
  .icon:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .card-title {
    font-size: 0.9rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .card-title.none {
    font-weight: 400;
    font-style: italic;
    opacity: 0.6;
  }
  .card-summary {
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--text-muted);
    min-height: 2.2rem;
  }
  .card-summary.none {
    font-style: italic;
    opacity: 0.7;
  }
  .exits {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.74rem;
    color: var(--accent);
  }
  .badge {
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--bg-sidebar);
    color: var(--text);
    font-size: 0.7rem;
  }
  .badge.ending {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  select {
    font-size: 0.72rem;
    padding: 0.1rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    color: var(--text);
  }

  .details {
    flex-shrink: 0;
    max-height: 48%;
    overflow-y: auto;
    padding: 0.75rem 1.25rem 1rem;
    border-top: 1px solid var(--border);
    background: var(--bg-panel);
  }
  .details h3 {
    margin: 0 0 0.6rem;
    font-size: 0.9rem;
  }
  .meta-fields {
    display: grid;
    grid-template-columns: 3fr 2fr 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 0.6rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.72rem;
    color: var(--text-muted);
    min-width: 0;
  }
  .field.wide {
    margin-bottom: 0.6rem;
  }
  .field em {
    font-style: normal;
    opacity: 0.7;
    margin-left: 0.35rem;
  }
  .field input,
  .field textarea,
  .field select {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .field textarea {
    resize: vertical;
    line-height: 1.5;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    margin-bottom: 0.6rem;
  }
</style>
