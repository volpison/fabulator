<script lang="ts">
  import { project } from "../lib/app/stores";
  import { blankCondition, blankEffect, contextOf, describeConditions, describeEffects } from "../lib/game/gamerules";
  import SimpleConditionFields from "./SimpleConditionFields.svelte";
  import EffectFields from "./EffectFields.svelte";
  import type { Condition, Effect, SimpleCondition } from "../lib/model/types";

  /** What the rows are: conditions ("Available when…") or effects ("When it happens…"). */
  export let mode: "conditions" | "effects";
  export let title: string;
  /** The rows (Condition[] or Effect[]). */
  export let rows: Condition[] | Effect[];
  /** Called with the whole new list after every change. */
  export let onchange: (rows: Condition[] | Effect[]) => void;

  $: ctx = contextOf($project ?? { game: undefined, characters: [], abilities: [] });
  $: conditions = (mode === "conditions" ? rows : []) as Condition[];
  $: effects = (mode === "effects" ? rows : []) as Effect[];
  $: text = mode === "conditions" ? describeConditions(ctx, conditions) : describeEffects(ctx, effects);

  function replaceAt<T>(list: T[], i: number, value: T): T[] {
    return list.map((x, k) => (k === i ? value : x));
  }
  function removeAt<T>(list: T[], i: number): T[] {
    return list.filter((_, k) => k !== i);
  }

  function addCondition() {
    onchange([...conditions, blankCondition(ctx, "flag")]);
  }
  function addEffect() {
    onchange([...effects, blankEffect(ctx, "set")]);
  }

  /** Inside an "any of" group: change one member, remove one (an empty group goes away), add one. */
  function changeMember(i: number, group: { kind: "any"; of: SimpleCondition[] }, k: number, c: Condition) {
    if (c.kind === "any") return; // a group never holds a group
    onchange(replaceAt(conditions, i, { kind: "any", of: replaceAt(group.of, k, c) }));
  }
  function removeMember(i: number, group: { kind: "any"; of: SimpleCondition[] }, k: number) {
    const of = removeAt(group.of, k);
    onchange(of.length === 0 ? removeAt(conditions, i) : replaceAt(conditions, i, { kind: "any", of }));
  }
  function addMember(i: number, group: { kind: "any"; of: SimpleCondition[] }) {
    onchange(replaceAt(conditions, i, { kind: "any", of: [...group.of, blankCondition(ctx, "flag")] }));
  }
</script>

<section class="rules" aria-label={title}>
  <h4>{title}</h4>

  {#if mode === "conditions"}
    {#each conditions as c, i}
      {#if c.kind === "any"}
        {@const group = c}
        <div class="group">
          <div class="group-head">
            <span>Any of these:</span>
            <button class="x" title="Remove the group" aria-label="Remove this group" on:click={() => onchange(removeAt(conditions, i))}>✕</button>
          </div>
          {#each group.of as m, k}
            <SimpleConditionFields
              cond={m}
              allowAny={false}
              onchange={(next) => changeMember(i, group, k, next)}
              onremove={() => removeMember(i, group, k)}
            />
          {/each}
          <button class="small" on:click={() => addMember(i, group)}>+ Another</button>
        </div>
      {:else}
        <SimpleConditionFields
          cond={c}
          onchange={(next) => onchange(replaceAt(conditions, i, next))}
          onremove={() => onchange(removeAt(conditions, i))}
        />
      {/if}
    {/each}
    <button class="small" on:click={addCondition}>+ Condition</button>
  {:else}
    {#each effects as e, i}
      <EffectFields
        effect={e}
        onchange={(next) => onchange(replaceAt(effects, i, next))}
        onremove={() => onchange(removeAt(effects, i))}
      />
    {/each}
    <button class="small" on:click={addEffect}>+ Effect</button>
  {/if}

  {#if text}
    <p class="read">{mode === "conditions" ? "Available when " : "Then "}{text}.</p>
  {/if}
</section>

<style>
  .rules {
    margin: 0.6rem 0;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }
  h4 {
    margin: 0 0 0.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .group {
    margin: 0 0 0.4rem;
    padding: 0.35rem 0.5rem;
    border-left: 3px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    border-radius: 0 6px 6px 0;
  }
  .group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
    font-weight: 600;
    margin-bottom: 0.3rem;
  }
  .small {
    font-size: 0.72rem;
    padding: 0.2rem 0.55rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-panel);
    color: var(--text);
  }
  .small:hover {
    border-color: var(--accent);
  }
  .x {
    width: 1.3rem;
    height: 1.3rem;
    font-size: 0.65rem;
    color: var(--text-muted);
    border-radius: 4px;
  }
  .x:hover {
    background: var(--bg-sidebar);
    color: var(--text);
  }
  .read {
    margin: 0.4rem 0 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
</style>
