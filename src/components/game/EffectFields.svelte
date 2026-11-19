<script lang="ts">
  import { project } from "../../lib/app/stores";
  import { EFFECT_KINDS, EFFECT_LABEL, blankEffect, contextOf } from "../../lib/game/gamerules";
  import type { Effect } from "../../lib/model/types";

  export let effect: Effect;
  export let onchange: (e: Effect) => void;
  export let onremove: () => void;

  type Opt = { id: string; label: string };

  $: ctx = contextOf($project ?? { game: undefined, characters: [], abilities: [] });
  $: flags = ctx.game.variables.filter((v) => v.kind === "flag").map((v) => ({ id: v.id, label: v.label.trim() || v.id }));
  $: numbers = ctx.game.variables.filter((v) => v.kind === "number").map((v) => ({ id: v.id, label: v.label.trim() || v.id }));
  $: items = ctx.game.items.map((i) => ({ id: i.id, label: i.name.trim() || i.id }));
  $: abilities = ctx.abilities.map((a) => ({ id: a.id, label: a.name.trim() || a.id }));
  $: characters = [{ id: "", label: "The player" }, ...ctx.characters.map((c) => ({ id: c.id, label: c.name.trim() || c.id }))];

  function options(list: Opt[], current: string, allowEmpty = false): Opt[] {
    const out = [...list];
    if (current && !list.some((o) => o.id === current)) out.push({ id: current, label: `“${current}” (not declared)` });
    if (!current && !allowEmpty) out.unshift({ id: "", label: "Choose…" });
    return out;
  }

  const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;

  function number(e: Event, fallback: number): number {
    const n = Number(valueOf(e));
    return Number.isFinite(n) ? n : fallback;
  }
</script>

<div class="row">
  <select class="kind" value={effect.kind} aria-label="Kind of effect" on:change={(e) => onchange(blankEffect(ctx, valueOf(e) as Effect["kind"]))}>
    {#each EFFECT_KINDS as k}
      <option value={k}>{EFFECT_LABEL[k]}</option>
    {/each}
  </select>

  {#if effect.kind === "set"}
    <select value={effect.variable_id} aria-label="Flag" on:change={(e) => onchange({ ...effect, variable_id: valueOf(e) })}>
      {#each options(flags, effect.variable_id) as o}<option value={o.id}>{o.label}</option>{/each}
    </select>
    <select value={effect.to ? "yes" : "no"} aria-label="Set or clear" on:change={(e) => onchange({ ...effect, to: valueOf(e) === "yes" })}>
      <option value="yes">set</option>
      <option value="no">clear</option>
    </select>
  {:else if effect.kind === "add"}
    <select value={effect.variable_id} aria-label="Number" on:change={(e) => onchange({ ...effect, variable_id: valueOf(e) })}>
      {#each options(numbers, effect.variable_id) as o}<option value={o.id}>{o.label}</option>{/each}
    </select>
    <span class="word">by</span>
    <input class="num" type="number" value={effect.amount} aria-label="Amount (negative lowers it)" on:change={(e) => onchange({ ...effect, amount: number(e, effect.amount) })} />
  {:else if effect.kind === "give"}
    <select value={effect.item_id} aria-label="Item" on:change={(e) => onchange({ ...effect, item_id: valueOf(e) })}>
      {#each options(items, effect.item_id) as o}<option value={o.id}>{o.label}</option>{/each}
    </select>
    <span class="word">×</span>
    <input class="num" type="number" value={effect.amount} aria-label="How many (negative takes them)" on:change={(e) => onchange({ ...effect, amount: Math.round(number(e, effect.amount)) })} />
  {:else if effect.kind === "grant"}
    <select value={effect.character_id} aria-label="Who" on:change={(e) => onchange({ ...effect, character_id: valueOf(e) })}>
      {#each options(characters, effect.character_id, true) as o}<option value={o.id}>{o.label}</option>{/each}
    </select>
    <span class="word">learns</span>
    <select value={effect.ability_id} aria-label="Ability" on:change={(e) => onchange({ ...effect, ability_id: valueOf(e) })}>
      {#each options(abilities, effect.ability_id) as o}<option value={o.id}>{o.label}</option>{/each}
    </select>
  {/if}

  <button class="x" title="Remove" aria-label="Remove this effect" on:click={onremove}>✕</button>
</div>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
    margin-bottom: 0.3rem;
  }
  select,
  input {
    font: inherit;
    font-size: 0.78rem;
    padding: 0.2rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    min-width: 0;
  }
  .kind {
    font-weight: 600;
  }
  .num {
    width: 4.5rem;
  }
  .word {
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .x {
    width: 1.3rem;
    height: 1.3rem;
    font-size: 0.65rem;
    color: var(--text-muted);
    border-radius: 4px;
    margin-left: auto;
  }
  .x:hover {
    background: var(--bg-sidebar);
    color: var(--text);
  }
</style>
