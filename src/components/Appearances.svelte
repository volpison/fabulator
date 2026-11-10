<script lang="ts">
  import {
    project,
    selectedSceneId,
    mainView,
    linkCharacterToScene,
    linkPlaceToScene,
  } from "../lib/stores";
  import { appearanceReport } from "../lib/appearances";
  import type { EntityType } from "../lib/mentions";

  export let type: EntityType;
  export let id: string;

  $: report = $project ? appearanceReport($project, type, id) : null;

  function openScene(sceneId: string) {
    selectedSceneId.set(sceneId);
    mainView.set("manuscript");
  }

  function linkAllNamed() {
    if (!report) return;
    for (const a of report.namedNotLinked) {
      if (type === "character") linkCharacterToScene(a.scene.id, id);
      else linkPlaceToScene(a.scene.id, id);
    }
  }
</script>

{#if report}
  <div class="appearances">
    <div class="head">Appearances</div>

    {#if !report.first}
      <div class="muted">
        Not linked to, or named in, any scene yet.
      </div>
    {:else}
      <div class="summary">
        In {report.appearances.length} of {report.totalScenes} scene{report.totalScenes ===
        1
          ? ""
          : "s"} · first: Ch {report.first.chapterNumber}, “{report.first.scene
          .title || "Untitled"}”
      </div>

      <div class="list">
        {#each report.appearances as a (a.scene.id)}
          <button
            class="item"
            title="Open this scene"
            on:click={() => openScene(a.scene.id)}
          >
            <span class="ch">Ch {a.chapterNumber}</span>
            <span class="name">{a.scene.title || "Untitled"}</span>
            {#if a.linked && a.mentions > 0}
              <span class="tag">×{a.mentions}</span>
            {:else if a.linked}
              <span class="tag warn" title="Linked to the scene, but the text never names them"
                >not named</span
              >
            {:else}
              <span class="tag warn" title="Named in the text, but not linked to the scene"
                >×{a.mentions} · not linked</span
              >
            {/if}
          </button>
        {/each}
      </div>

      {#if report.longestGap}
        <div class="note">
          Longest absence: {report.longestGap.length} scene{report.longestGap
            .length === 1
            ? ""
            : "s"} after scene #{report.longestGap.afterPosition}.
        </div>
      {/if}
      {#if report.scenesSinceLast > 0}
        <div class="note">
          Not seen in the last {report.scenesSinceLast} scene{report.scenesSinceLast ===
          1
            ? ""
            : "s"}.
        </div>
      {/if}
      {#if report.namedNotLinked.length > 0}
        <button class="link-all" on:click={linkAllNamed}>
          Link to the {report.namedNotLinked.length} scene{report.namedNotLinked
            .length === 1
            ? ""
            : "s"} where named
        </button>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .appearances {
    border-top: 1px solid var(--border);
    margin-top: 0.25rem;
    padding-top: 0.5rem;
    font-size: 0.72rem;
  }

  .head {
    font-weight: 650;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
  }

  .muted,
  .note {
    color: var(--text-muted);
    margin-top: 0.3rem;
  }

  .summary {
    margin-bottom: 0.3rem;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 11rem;
    overflow-y: auto;
  }

  .item {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    width: 100%;
    text-align: left;
    padding: 0.2rem 0.3rem;
    border-radius: 4px;
    font-size: 0.72rem;
  }

  .item:hover {
    background: var(--bg-sidebar);
  }

  .ch {
    flex-shrink: 0;
    color: var(--text-muted);
    min-width: 2.2rem;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag {
    flex-shrink: 0;
    font-size: 0.65rem;
    color: var(--text-muted);
    background: var(--bg-sidebar);
    border-radius: 999px;
    padding: 0 0.4rem;
  }

  .tag.warn {
    color: var(--warn-fg);
    background: var(--warn-bg);
  }

  .link-all {
    margin-top: 0.4rem;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-soft);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }
</style>
