<script lang="ts">
  import { platform } from "../lib/platform";
  import { PLOTLINE_COLORS } from "../lib/plotlines";
  import { updatePlotline, deletePlotline, movePlotline } from "../lib/stores";
  import type { Plotline } from "../lib/types";

  export let plotline: Plotline;
  export let index: number;
  export let count: number;
  export let sceneCount: number;

  let editing = false;
  let draft = "";
  let palette = false;

  function startEdit() {
    draft = plotline.name;
    editing = true;
  }
  function commit() {
    if (!editing) return;
    editing = false;
    updatePlotline(plotline.id, { name: draft });
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") editing = false;
  }
  function focusSelect(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
  function pick(color: string) {
    updatePlotline(plotline.id, { color });
    palette = false;
  }
  async function remove() {
    const msg =
      sceneCount > 0
        ? `Delete the plotline “${plotline.name}”? Its ${sceneCount} scene${sceneCount === 1 ? "" : "s"} will move to another plotline.`
        : `Delete the plotline “${plotline.name}”?`;
    if (await platform().confirm(msg, { title: "Delete plotline", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" })) {
      deletePlotline(plotline.id);
    }
  }
</script>

<div class="lane-label">
  <div class="dot-wrap">
    <button
      class="dot"
      style="background: {plotline.color}"
      title="Change colour"
      aria-label="Change colour of {plotline.name}"
      on:click={() => (palette = !palette)}
    ></button>
    {#if palette}
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div class="backdrop" on:click={() => (palette = false)}></div>
      <div class="palette" role="dialog" aria-label="Plotline colour">
        {#each PLOTLINE_COLORS as c}
          <button
            class="swatch"
            class:on={c === plotline.color.toLowerCase()}
            style="background: {c}"
            aria-label={c}
            on:click={() => pick(c)}
          ></button>
        {/each}
        <label class="custom" title="Any colour">
          <input type="color" value={plotline.color} on:change={(e) => pick(e.currentTarget.value)} />
          Custom…
        </label>
      </div>
    {/if}
  </div>

  {#if editing}
    <input class="name-input" type="text" bind:value={draft} use:focusSelect on:keydown={onKey} on:blur={commit} />
  {:else}
    <span
      class="name"
      role="button"
      tabindex="0"
      title="Double-click to rename"
      on:dblclick={startEdit}
      on:keydown={(e) => (e.key === "F2" || e.key === "Enter") && startEdit()}>{plotline.name}</span
    >
    <span class="tools">
      <button title="Move up" disabled={index === 0} on:click={() => movePlotline(plotline.id, -1)}>▲</button>
      <button title="Move down" disabled={index === count - 1} on:click={() => movePlotline(plotline.id, 1)}>▼</button>
      <button title={count <= 1 ? "The last plotline cannot be deleted" : "Delete plotline"} disabled={count <= 1} on:click={remove}>✕</button>
    </span>
  {/if}
</div>

<style>
  .lane-label {
    width: 150px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    position: relative;
  }
  .dot-wrap { position: relative; display: flex; }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--text-muted) 40%, transparent);
    padding: 0;
    cursor: pointer;
  }
  .backdrop { position: fixed; inset: 0; z-index: 20; }
  .palette {
    position: absolute;
    top: 20px;
    left: 0;
    z-index: 21;
    display: grid;
    grid-template-columns: repeat(5, 20px);
    gap: 6px;
    padding: 8px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  }
  .swatch { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; padding: 0; cursor: pointer; }
  .swatch.on { border-color: var(--text); }
  .custom { grid-column: 1 / -1; font-size: 0.72rem; font-weight: 500; display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .custom input { width: 24px; height: 20px; padding: 0; border: none; background: none; cursor: pointer; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: text; }
  .name-input { flex: 1; min-width: 0; font: inherit; padding: 1px 4px; background: var(--bg); color: var(--text); border: 1px solid var(--accent); border-radius: 4px; }
  .tools { display: none; gap: 1px; }
  .lane-label:hover .tools, .lane-label:focus-within .tools { display: flex; }
  .tools button { background: none; border: none; color: var(--text-muted); font-size: 0.6rem; padding: 2px 3px; cursor: pointer; border-radius: 3px; }
  .tools button:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--text); }
  .tools button:disabled { opacity: 0.3; cursor: default; }
</style>
