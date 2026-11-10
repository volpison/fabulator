<script lang="ts">
  import { project, sceneFilter } from "../lib/stores";
  import {
    SCENE_STATUSES, STATUS_LABEL, SCENE_COLORS, EMPTY_FILTER,
    isFilterActive, matchScene, statusCounts, toggle,
  } from "../lib/labels";

  $: scenes = $project?.scenes ?? [];
  $: counts = statusCounts(scenes);
  $: matches = scenes.filter((s) => matchScene(s, $sceneFilter)).length;
  $: active = isFilterActive($sceneFilter);

  function patch(p: Partial<typeof EMPTY_FILTER>) {
    sceneFilter.update((f) => ({ ...f, ...p }));
  }
</script>

<div class="filter" role="search" aria-label="Filter scenes">
  <input
    class="q"
    type="search"
    placeholder="Filter scenes…"
    value={$sceneFilter.query}
    on:input={(e) => patch({ query: e.currentTarget.value })}
  />

  <div class="chips" role="group" aria-label="Status">
    {#each SCENE_STATUSES as s}
      <button
        type="button"
        class="chip s-{s}"
        class:on={$sceneFilter.statuses.includes(s)}
        aria-pressed={$sceneFilter.statuses.includes(s)}
        on:click={() => patch({ statuses: toggle($sceneFilter.statuses, s) })}
      >
        {STATUS_LABEL[s]} <b>{counts[s]}</b>
      </button>
    {/each}
  </div>

  <div class="dots" role="group" aria-label="Colour">
    {#each SCENE_COLORS as c}
      <button
        type="button"
        class="dot"
        class:on={$sceneFilter.colors.includes(c.id)}
        aria-pressed={$sceneFilter.colors.includes(c.id)}
        aria-label={c.label}
        title={c.label}
        style="background: {c.hex}"
        on:click={() => patch({ colors: toggle($sceneFilter.colors, c.id) })}
      ></button>
    {/each}
    <button
      type="button"
      class="chip small"
      class:on={$sceneFilter.colors.includes("none")}
      aria-pressed={$sceneFilter.colors.includes("none")}
      title="Scenes without a colour"
      on:click={() => patch({ colors: toggle($sceneFilter.colors, "none") })}
    >
      No colour
    </button>
  </div>

  <select value={$sceneFilter.characterId} aria-label="Character" on:change={(e) => patch({ characterId: e.currentTarget.value })}>
    <option value="">Any character</option>
    {#each $project?.characters ?? [] as c (c.id)}
      <option value={c.id}>{c.name}</option>
    {/each}
  </select>

  <select value={$sceneFilter.plotlineId} aria-label="Plotline" on:change={(e) => patch({ plotlineId: e.currentTarget.value })}>
    <option value="">Any plotline</option>
    {#each $project?.plotlines ?? [] as p (p.id)}
      <option value={p.id}>{p.name}</option>
    {/each}
  </select>

  {#if active}
    <span class="result" aria-live="polite">{matches} of {scenes.length} scenes</span>
    <button type="button" class="clear" on:click={() => sceneFilter.set(EMPTY_FILTER)}>Clear</button>
  {/if}
</div>

<style>
  .filter {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    padding: 0.45rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .q,
  select {
    padding: 0.28rem 0.5rem;
    font: inherit;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .q {
    width: 11rem;
  }

  .chips,
  .dots {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .chip {
    padding: 0.18rem 0.6rem;
    border-radius: 999px;
    color: var(--text-muted);
    background: var(--bg-sidebar);
    white-space: nowrap;
  }

  .chip b {
    font-variant-numeric: tabular-nums;
    color: var(--text);
    margin-left: 0.15rem;
  }

  .chip:hover {
    color: var(--text);
  }

  .chip.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .chip.on b {
    color: inherit;
  }

  .dot {
    width: 0.95rem;
    height: 0.95rem;
    padding: 0;
    border-radius: 50%;
    border: 2px solid transparent;
    box-shadow: 0 0 0 1px var(--border);
    opacity: 0.8;
  }

  .dot:hover {
    opacity: 1;
  }

  .dot.on {
    opacity: 1;
    border-color: var(--bg-panel);
    box-shadow: 0 0 0 2px var(--accent);
  }

  .result {
    color: var(--text-muted);
    margin-left: auto;
  }

  .clear {
    color: var(--accent);
  }

  .clear:hover {
    text-decoration: underline;
  }
</style>
