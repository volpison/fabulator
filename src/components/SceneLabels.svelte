<script lang="ts">
  import { SCENE_STATUSES, STATUS_LABEL, SCENE_COLORS, cleanStatus } from "../lib/labels";
  import { updateSceneFields } from "../lib/stores";
  import type { Scene } from "../lib/types";

  export let scene: Pick<Scene, "id" | "status" | "color">;
</script>

<div class="labels">
  <select
    class="status s-{cleanStatus(scene.status)}"
    title="Status"
    aria-label="Status"
    value={cleanStatus(scene.status)}
    on:change={(e) => updateSceneFields(scene.id, { status: cleanStatus(e.currentTarget.value) })}
  >
    {#each SCENE_STATUSES as s}
      <option value={s}>{STATUS_LABEL[s]}</option>
    {/each}
  </select>

  <div class="swatches" role="radiogroup" aria-label="Colour label">
    <button
      type="button"
      class="swatch none"
      class:on={!scene.color}
      role="radio"
      aria-checked={!scene.color}
      aria-label="No colour"
      title="No colour"
      on:click={() => updateSceneFields(scene.id, { color: "" })}
    ></button>
    {#each SCENE_COLORS as c}
      <button
        type="button"
        class="swatch"
        class:on={scene.color === c.id}
        role="radio"
        aria-checked={scene.color === c.id}
        aria-label={c.label}
        title={c.label}
        style="background: {c.hex}"
        on:click={() => updateSceneFields(scene.id, { color: scene.color === c.id ? "" : c.id })}
      ></button>
    {/each}
  </div>
</div>

<style>
  .labels {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  select {
    padding: 0.2rem 0.4rem;
    font: inherit;
    font-size: 0.74rem;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .swatches {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }

  .swatch {
    width: 1rem;
    height: 1rem;
    padding: 0;
    border-radius: 50%;
    border: 2px solid transparent;
    box-shadow: 0 0 0 1px var(--border);
  }

  .swatch.none {
    background: var(--bg);
    position: relative;
  }

  .swatch.none::after {
    content: "";
    position: absolute;
    inset: 45% 15%;
    background: var(--text-faint);
    transform: rotate(-45deg);
  }

  .swatch.on {
    border-color: var(--bg-panel);
    box-shadow: 0 0 0 2px var(--accent);
  }
</style>
