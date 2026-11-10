<script lang="ts">
  import {
    project,
    selectedScene,
    linkCharacterToScene,
    linkPlaceToScene,
    unlinkCharacterFromScene,
    unlinkPlaceFromScene,
  } from "../lib/stores";
  import {
    sceneContinuity,
    type ContinuityItem,
  } from "../lib/appearances";

  /** Session-only dismissals: "sceneId:type:id:kind" */
  let dismissed = new Set<string>();

  function key(sceneId: string, item: ContinuityItem, kind: string): string {
    return `${sceneId}:${item.type}:${item.id}:${kind}`;
  }

  function dismiss(sceneId: string, item: ContinuityItem, kind: string) {
    dismissed = new Set(dismissed).add(key(sceneId, item, kind));
  }

  function link(item: ContinuityItem) {
    if (!$selectedScene) return;
    if (item.type === "character") linkCharacterToScene($selectedScene.id, item.id);
    else linkPlaceToScene($selectedScene.id, item.id);
  }

  function unlink(item: ContinuityItem) {
    if (!$selectedScene) return;
    if (item.type === "character")
      unlinkCharacterFromScene($selectedScene.id, item.id);
    else unlinkPlaceFromScene($selectedScene.id, item.id);
  }

  $: report =
    $project && $selectedScene
      ? sceneContinuity($project, $selectedScene)
      : null;

  $: linkedNotNamed =
    report && $selectedScene
      ? report.linkedNotNamed.filter(
          (i) => !dismissed.has(key($selectedScene!.id, i, "linked"))
        )
      : [];

  $: namedNotLinked =
    report && $selectedScene
      ? report.namedNotLinked.filter(
          (i) => !dismissed.has(key($selectedScene!.id, i, "named"))
        )
      : [];

  $: issueCount = linkedNotNamed.length + namedNotLinked.length;
  $: hasAnything =
    !!report &&
    (report.matched.length > 0 ||
      report.linkedNotNamed.length > 0 ||
      report.namedNotLinked.length > 0);
</script>

{#if $selectedScene && hasAnything}
  <div class="continuity" class:has-issues={issueCount > 0}>
    <div class="head">
      <span class="title">Continuity</span>
      {#if issueCount === 0}
        <span class="ok">Cast matches the text</span>
      {:else}
        <span class="issues"
          >{issueCount} issue{issueCount === 1 ? "" : "s"}</span
        >
      {/if}
    </div>

    {#if namedNotLinked.length > 0}
      <div class="section">
        <div class="section-label">Named in text · not on cast</div>
        <div class="items">
          {#each namedNotLinked as item (item.type + item.id)}
            <div
              class="item"
              class:char={item.type === "character"}
              class:place={item.type === "place"}
            >
              <span class="name">{item.name}</span>
              <span class="meta"
                >{item.type}
                {#if item.mentions > 1}
                  · ×{item.mentions}
                {/if}</span
              >
              <button type="button" class="action primary" on:click={() => link(item)}
                >Link</button
              >
              <button
                type="button"
                class="action"
                title="Dismiss"
                on:click={() => dismiss($selectedScene.id, item, "named")}
                >×</button
              >
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if linkedNotNamed.length > 0}
      <div class="section">
        <div class="section-label">On cast · not named in text</div>
        <div class="items">
          {#each linkedNotNamed as item (item.type + item.id)}
            <div
              class="item"
              class:char={item.type === "character"}
              class:place={item.type === "place"}
            >
              <span class="name">{item.name}</span>
              <span class="meta">{item.type}</span>
              <button
                type="button"
                class="action"
                title="Remove from this scene's cast"
                on:click={() => unlink(item)}
                >Unlink</button
              >
              <button
                type="button"
                class="action"
                title="Dismiss"
                on:click={() => dismiss($selectedScene.id, item, "linked")}
                >×</button
              >
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if issueCount === 0 && report && report.matched.length > 0}
      <div class="matched">
        {#each report.matched as item (item.type + item.id)}
          <span
            class="chip"
            class:char={item.type === "character"}
            class:place={item.type === "place"}
            title="{item.mentions} mention{item.mentions === 1 ? '' : 's'} in text"
          >
            {item.name}
            {#if item.mentions > 1}
              <span class="n">×{item.mentions}</span>
            {/if}
          </span>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .continuity {
    flex-shrink: 0;
    padding: 0.5rem 1.75rem 0.65rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
  }

  .continuity.has-issues {
    background: color-mix(in srgb, var(--bg-panel) 88%, #f59e0b 12%);
    border-bottom-color: color-mix(in srgb, var(--border) 60%, #f59e0b 40%);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin-bottom: 0.35rem;
  }

  .title {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .ok {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .issues {
    font-size: 0.7rem;
    font-weight: 600;
    color: #b45309;
  }

  .section {
    margin-top: 0.35rem;
  }

  .section-label {
    font-size: 0.65rem;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
  }

  .items {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    padding: 0.2rem 0.3rem 0.2rem 0.55rem;
    border-radius: 6px;
    background: var(--bg);
    border: 1px solid var(--border);
  }

  .item.char .name {
    color: #1d4ed8;
    font-weight: 600;
  }

  .item.place .name {
    color: #15803d;
    font-weight: 600;
  }

  :global([data-theme="dark"]) .item.char .name,
  :global(.theme-dark) .item.char .name {
    color: #93c5fd;
  }

  :global([data-theme="dark"]) .item.place .name,
  :global(.theme-dark) .item.place .name {
    color: #86efac;
  }

  .meta {
    font-size: 0.65rem;
    color: var(--text-muted);
  }

  .action {
    font-size: 0.7rem;
    color: var(--text-muted);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }

  .action:hover {
    background: var(--bg-sidebar);
    color: var(--text);
  }

  .action.primary {
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-soft);
  }

  .matched {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.25rem;
  }

  .chip {
    font-size: 0.7rem;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--border);
  }

  .chip.char {
    color: #1d4ed8;
  }

  .chip.place {
    color: #15803d;
  }

  .chip .n {
    opacity: 0.7;
    margin-left: 0.15rem;
  }
</style>
