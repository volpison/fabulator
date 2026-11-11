<script lang="ts">
  import { updateSceneFields } from "../lib/stores";
  import { parseWhen } from "../lib/storytime";
  import type { Scene } from "../lib/types";

  export let scene: Pick<Scene, "id" | "when">;
  export let compact = false;

  $: unreadable = scene.when.trim() !== "" && parseWhen(scene.when) === null;

  function commit(e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value.trim();
    if (value !== scene.when) updateSceneFields(scene.id, { when: value });
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
  }
</script>

<label class="when" class:compact>
  {#if !compact}<span class="cap">When</span>{/if}
  <input
    type="text"
    class:unreadable
    value={scene.when}
    placeholder="Day 3 evening, 1342-05-02…"
    aria-label="When this scene happens in the story"
    title={unreadable
      ? "Kept as a label, but not understood for sorting. Try “Day 3 evening”, “2026-11-10 14:30” or “10/11/2026”."
      : "When this scene happens in the story (used by the Story time view)"}
    on:change={commit}
    on:keydown={onKey}
  />
</label>

<style>
  .when { display: inline-flex; align-items: center; gap: 0.35rem; }
  .cap { font-size: 0.7rem; color: var(--text-muted); }
  input {
    font: inherit;
    font-size: 0.75rem;
    width: 11.5rem;
    padding: 0.1rem 0.4rem;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 5px;
  }
  .compact input { width: 100%; }
  input.unreadable { border-color: #b45309; }
</style>
