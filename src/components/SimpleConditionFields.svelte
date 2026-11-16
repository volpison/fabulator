<script lang="ts">
  import { project } from "../lib/stores";
  import { CONDITION_KINDS, CONDITION_LABEL, blankCondition, contextOf } from "../lib/gamerules";
  import { COMPARE_OPS } from "../lib/game";
  import type { CompareOp, Condition, SimpleCondition } from "../lib/types";

  /** The condition being edited (a simple one; the "any of" group is edited by RulesEditor). */
  export let cond: SimpleCondition;
  /** May the kind menu offer "Any of…"? (Not inside an "any of" group.) */
  export let allowAny = true;
  export let onchange: (c: Condition) => void;
  export let onremove: () => void;

  type Opt = { id: string; label: string };

  $: ctx = contextOf($project ?? { game: undefined, characters: [], abilities: [] });
  $: flags = ctx.game.variables.filter((v) => v.kind === "flag").map((v) => ({ id: v.id, label: v.label.trim() || v.id }));
  $: numbers = ctx.game.variables.filter((v) => v.kind === "number").map((v) => ({ id: v.id, label: v.label.trim() || v.id }));
  $: items = ctx.game.items.map((i) => ({ id: i.id, label: i.name.trim() || i.id }));
  $: abilities = ctx.abilities.map((a) => ({ id: a.id, label: a.name.trim() || a.id }));
  $: characters = [{ id: "", label: "The player" }, ...ctx.characters.map((c) => ({ id: c.id, label: c.name.trim() || c.id }))];
  $: nodes = ctx.game.nodes.map((n) => ({ id: n.id, label: n.title.trim() || "Untitled node" }));

  /** The choices, plus the current one when nobody declared it (so it is shown, not lost). */
  function options(list: Opt[], current: string, allowEmpty = false): Opt[] {
    const out = [...list];
    if (current && !list.some((o) => o.id === current)) out.push({ id: current, label: `“${current}” (not declared)` });
    if (!current && !allowEmpty) out.unshift({ id: "", label: "Choose…" });
    return out;
  }

  const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;

  function onKind(e: Event) {
    const kind = valueOf(e) as Condition["kind"];
    if (kind === "any") onchange({ kind: "any", of: [cond] });
    else onchange(blankCondition(ctx, kind));
  }

  function number(e: Event, fallback: number): number {
    const n = Number(valueOf(e));
    return Number.isFinite(n) ? n : fallback;
  }
</script>

<div class="row">
  <select class="kind" value={cond.kind} aria-label="Kind of condition" on:change={onKind}>
    {#each CONDITION_KINDS.filter((k) => allowAny || k !== "any") as k}
      <option value={k}>{CONDITION_LABEL[k]}</option>
    {/each}
  </select>

  {#if cond.kind === "flag"}
    <select value={cond.variable_id} aria-label="Flag" on:change={(e) => onchange({ ...cond, variable_id: valueOf(e) })}>
      {#each options(flags, cond.variable_id) as o}<option value={o.id}>{o.label}</option>{/each}
    </select>
    <select value={cond.set ? "yes" : "no"} aria-label="Set or not set" on:change={(e) => onchange({ ...cond, set: valueOf(e) === "yes" })}>
      <option value="yes">is set</option>
      <option value="no">is not set</option>
    </select>
  {:else if cond.kind === "number"}
    <select value={cond.variable_id} aria-label="Number" on:change={(e) => onchange({ ...cond, variable_id: valueOf(e) })}>
      {#each options(numbers, cond.variable_id) as o}<option value={o.id}>{o.label}</option>{/each}
    </select>
    <select class="op" value={cond.op} aria-label="Comparison" on:change={(e) => onchange({ ...cond, op: valueOf(e) as CompareOp })}>
      {#each COMPARE_OPS as op}<option value={op}>{op === "!=" ? "≠" : op === "<=" ? "≤" : op === ">=" ? "≥" : op}</option>{/each}
    </select>
    <input class="num" type="number" value={cond.value} aria-label="Value" on:change={(e) => onchange({ ...cond, value: number(e, cond.value) })} />
  {:else if cond.kind === "item"}
    <select value={cond.item_id} aria-label="Item" on:change={(e) => onchange({ ...cond, item_id: valueOf(e) })}>
      {#each options(items, cond.item_id) as o}<option value={o.id}>{o.label}</option>{/each}
    </select>
    <span class="word">at least</span>
    <input class="num" type="number" min="1" value={cond.min} aria-label="How many" on:change={(e) => onchange({ ...cond, min: Math.max(1, Math.round(number(e, cond.min))) })} />
  {:else if cond.kind === "ability"}
    <select value={cond.character_id} aria-label="Who" on:change={(e) => onchange({ ...cond, character_id: valueOf(e) })}>
      {#each options(characters, cond.character_id, true) as o}<option value={o.id}>{o.label}</option>{/each}
    </select>
    <span class="word">can</span>
    <select value={cond.ability_id} aria-label="Ability" on:change={(e) => onchange({ ...cond, ability_id: valueOf(e) })}>
      {#each options(abilities, cond.ability_id) as o}<option value={o.id}>{o.label}</option>{/each}
    </select>
  {:else if cond.kind === "done"}
    <select value={cond.node_id} aria-label="Node" on:change={(e) => onchange({ ...cond, node_id: valueOf(e) })}>
      {#each options(nodes, cond.node_id) as o}<option value={o.id}>{o.label}</option>{/each}
    </select>
    <span class="word">is done</span>
  {/if}

  <button class="x" title="Remove" aria-label="Remove this condition" on:click={onremove}>✕</button>
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
  .op {
    width: 3.2rem;
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
