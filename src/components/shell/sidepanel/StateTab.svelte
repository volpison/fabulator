<script lang="ts">
  import { itemUsage, variableUsage } from "../../../lib/game/gamerules";
  import {
    addGameItem,
    addGameVariable,
    updateGameItem,
    updateGameVariable,
  } from "../../../lib/app/stores/game";
  import type { Game } from "../../../lib/model/types";

  export let editingId: string | null;
  /** Ask first, then delete (kept in SidePanel, which knows which panel is open). */
  export let onDelete: (id: string, label: string) => void;
  export let game: Game;
</script>

<p class="hint">
  What the game remembers. Declare a flag (yes/no) or a number once here, then use it in conditions and effects.
</p>
<div class="group-title">Variables</div>
{#each game.variables as v (v.id)}
  {@const use = variableUsage(game, v.id)}
  <div class="card" id="card-{v.id}" class:editing={editingId === v.id}>
    <button class="card-head" on:click={() => (editingId = editingId === v.id ? null : v.id)}>
      <div class="card-title">{v.label || "Untitled"}</div>
      <div class="card-meta">{v.kind === "number" ? "Number" : "Flag"} · set {use.written}× · used {use.read}×</div>
    </button>
    {#if editingId === v.id}
      <div class="form">
        <label>
          Name
          <input type="text" value={v.label} on:input={(e) => updateGameVariable(v.id, { label: e.currentTarget.value })} />
        </label>
        <label>
          Kind
          <select value={v.kind} on:change={(e) => updateGameVariable(v.id, { kind: e.currentTarget.value === "number" ? "number" : "flag" })}>
            <option value="flag">Flag (yes / no)</option>
            <option value="number">Number</option>
          </select>
        </label>
        <label>
          Notes
          <textarea rows="2" value={v.notes} on:input={(e) => updateGameVariable(v.id, { notes: e.currentTarget.value })}></textarea>
        </label>
        {#if use.read + use.written > 0}
          <p class="hint">Used in {use.read} condition{use.read === 1 ? "" : "s"} and set by {use.written} effect{use.written === 1 ? "" : "s"}. Deleting it leaves those showing “not declared”.</p>
        {/if}
        <div class="form-actions">
          <button class="danger" on:click={() => onDelete(v.id, v.label)}>Delete</button>
        </div>
      </div>
    {/if}
  </div>
{/each}
<div class="form-actions start">
  <button class="add-btn" on:click={() => (editingId = addGameVariable("flag"))}>+ Flag</button>
  <button class="add-btn" on:click={() => (editingId = addGameVariable("number"))}>+ Number</button>
</div>

<div class="group-title">Items</div>
{#each game.items as it (it.id)}
  {@const use = itemUsage(game, it.id)}
  <div class="card" id="card-{it.id}" class:editing={editingId === it.id}>
    <button class="card-head" on:click={() => (editingId = editingId === it.id ? null : it.id)}>
      <div class="card-title">{it.name || "Untitled"}</div>
      <div class="card-meta">given or taken {use.written}× · needed {use.read}×</div>
    </button>
    {#if editingId === it.id}
      <div class="form">
        <label>
          Name
          <input type="text" value={it.name} on:input={(e) => updateGameItem(it.id, { name: e.currentTarget.value })} />
        </label>
        <label>
          Description
          <textarea rows="2" value={it.description} on:input={(e) => updateGameItem(it.id, { description: e.currentTarget.value })}></textarea>
        </label>
        <div class="form-actions">
          <button class="danger" on:click={() => onDelete(it.id, it.name)}>Delete</button>
        </div>
      </div>
    {/if}
  </div>
{/each}
<div class="form-actions start">
  <button class="add-btn" on:click={() => (editingId = addGameItem())}>+ Item</button>
</div>
