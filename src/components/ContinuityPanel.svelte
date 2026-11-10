<script lang="ts">
  import { project, selectedScene, focusMode, unlinkCharacterFromScene, unlinkPlaceFromScene } from "../lib/stores";
  import { sceneContinuity, type ContinuityItem } from "../lib/appearances";

  /** Session-only dismissals: "sceneId:type:id" (the text may name them in a later edit). */
  let dismissed = new Set<string>();
  const key = (sceneId: string, i: ContinuityItem) => `${sceneId}:${i.type}:${i.id}`;

  $: scene = $selectedScene;
  $: report = $project && scene ? sceneContinuity($project, scene) : null;
  $: unnamed = report && scene ? report.linkedNotNamed.filter((i) => !dismissed.has(key(scene.id, i))) : [];
  $: matched = report?.matched ?? [];

  function dismiss(i: ContinuityItem) {
    if (scene) dismissed = new Set(dismissed).add(key(scene.id, i));
  }
  function unlink(i: ContinuityItem) {
    if (!scene) return;
    if (i.type === "character") unlinkCharacterFromScene(scene.id, i.id);
    else unlinkPlaceFromScene(scene.id, i.id);
  }
</script>

{#if scene && !$focusMode && (unnamed.length > 0 || matched.length > 0)}
  <div class="continuity" class:warn={unnamed.length > 0} aria-label="Scene cast check">
    {#if unnamed.length > 0}
      <span class="label">On the cast, but not named in the text:</span>
      {#each unnamed as item (item.type + item.id)}
        <span class="chip {item.type}">
          {item.name}
          <button type="button" title="Take them off this scene's cast" aria-label="Unlink {item.name} from this scene" on:click={() => unlink(item)}>Unlink</button>
          <button type="button" title="Keep them (e.g. mentioned by pronoun) and hide this notice" aria-label="Keep {item.name} and hide this notice" on:click={() => dismiss(item)}>×</button>
        </span>
      {/each}
    {:else}
      <span class="label">Cast matches the text:</span>
      {#each matched as item (item.type + item.id)}
        <span class="chip {item.type}" title="{item.mentions} mention{item.mentions === 1 ? '' : 's'} in the text">
          {item.name}{#if item.mentions > 1}<span class="n">×{item.mentions}</span>{/if}
        </span>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .continuity {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 1.75rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .continuity.warn {
    background: color-mix(in srgb, var(--bg-panel) 90%, #f59e0b 10%);
  }
  .label { font-weight: 600; margin-right: 0.15rem; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.1rem 0.2rem 0.1rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
  }
  .chip.character { border-color: color-mix(in srgb, var(--char) 55%, var(--border)); }
  .chip.place { border-color: color-mix(in srgb, var(--place, var(--accent)) 55%, var(--border)); }
  .chip:not(:has(button)) { padding-right: 0.5rem; }
  .n { opacity: 0.7; margin-left: 0.25rem; }
  .chip button {
    font-size: 0.68rem;
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
    color: var(--text-muted);
  }
  .chip button:hover { background: var(--bg-sidebar); color: var(--text); }
</style>
