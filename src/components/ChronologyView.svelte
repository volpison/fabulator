<script lang="ts">
  import { project, selectedSceneId, mainView } from "../lib/stores";
  import { chronology } from "../lib/storytime";
  import { STATUS_LABEL, cleanStatus } from "../lib/labels";
  import WhenField from "./WhenField.svelte";

  $: chrono = $project ? chronology($project) : null;
  $: plotColor = new Map(($project?.plotlines ?? []).map((p) => [p.id, p.color]));
  $: chapterTitle = new Map(($project?.chapters ?? []).map((c, i) => [c.id, `${i + 1}. ${c.title}`]));

  function open(id: string) {
    selectedSceneId.set(id);
    mainView.set("manuscript");
  }

  const REASON: Record<string, string> = {
    empty: "no time yet",
    unreadable: "not understood",
    "other-style": "different style from the rest",
  };
</script>

{#if chrono}
  <div class="chrono">
    {#if chrono.rows.length === 0}
      <p class="intro">
        Give scenes a <strong>When</strong> (here, or under the scene title in the Manuscript) and they will line up in
        story order. Try <em>Day 3 evening</em>, <em>2026-11-10 14:30</em> or <em>10/11/2026</em>.
      </p>
    {:else}
      <p class="intro">
        Story order ({chrono.kind === "date" ? "dates" : "days"}). <span class="pos">#n</span> is the scene's place in the
        book; <span class="back">↩ out of book order</span> marks a flashback or a jump.
      </p>
    {/if}

    {#each chrono.rows as row (row.scene.id)}
      {#if row.gap}<div class="gap">{row.gap}</div>{/if}
      <div class="row" class:selected={$selectedSceneId === row.scene.id}>
        <span class="pos" title="Place in the book">#{row.position}</span>
        <div class="when"><WhenField scene={row.scene} compact /></div>
        <button type="button" class="scene" on:click={() => open(row.scene.id)} title="Open in the Manuscript">
          <span class="dot" style="background: {plotColor.get(row.scene.plotline_id) ?? 'var(--accent)'}"></span>
          <span class="title">{row.scene.title || "Untitled scene"}</span>
          <span class="chap">{chapterTitle.get(row.scene.chapter_id) ?? ""}</span>
          <span class="badge s-{cleanStatus(row.scene.status)}">{STATUS_LABEL[cleanStatus(row.scene.status)]}</span>
          {#if row.backward}<span class="back" title="Earlier in the story than the scene before it in the book">↩ out of book order</span>{/if}
        </button>
      </div>
    {/each}

    {#if chrono.unplaced.length > 0}
      <h3>Not placed in story time ({chrono.unplaced.length})</h3>
      {#each chrono.unplaced as u (u.scene.id)}
        <div class="row dim">
          <span class="pos" title="Place in the book">#{u.position}</span>
          <div class="when"><WhenField scene={u.scene} compact /></div>
          <button type="button" class="scene" on:click={() => open(u.scene.id)}>
            <span class="dot" style="background: {plotColor.get(u.scene.plotline_id) ?? 'var(--accent)'}"></span>
            <span class="title">{u.scene.title || "Untitled scene"}</span>
            <span class="chap">{chapterTitle.get(u.scene.chapter_id) ?? ""}</span>
            <span class="why">{REASON[u.reason]}</span>
          </button>
        </div>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .chrono { padding: 0.75rem 1.25rem 2rem; overflow-y: auto; min-height: 0; flex: 1; }
  .intro { font-size: 0.8rem; color: var(--text-muted); margin: 0 0 0.75rem; max-width: 60rem; }
  h3 { font-size: 0.75rem; color: var(--text-muted); margin: 1.25rem 0 0.4rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .row {
    display: grid;
    grid-template-columns: 2.5rem 12.5rem 1fr;
    align-items: center;
    gap: 0.6rem;
    padding: 0.25rem 0.4rem;
    border-radius: 8px;
  }
  .row.selected { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .row.dim { opacity: 0.85; }
  .pos { font-size: 0.7rem; color: var(--text-muted); font-variant-numeric: tabular-nums; text-align: right; }
  .gap { margin-left: 3.1rem; font-size: 0.68rem; color: var(--text-muted); padding: 0.1rem 0 0.1rem 0.5rem; border-left: 2px solid var(--border); }
  .scene {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.35rem 0.6rem;
    text-align: left;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 0.82rem;
  }
  .scene:hover { border-color: var(--accent); }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chap, .why { font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; }
  .why { margin-left: auto; color: #b45309; }
  .back { font-size: 0.68rem; color: #b45309; font-weight: 600; margin-left: auto; white-space: nowrap; }
  .intro .back { margin-left: 0; }
  .badge { font-size: 0.65rem; padding: 0.05rem 0.4rem; border-radius: 999px; border: 1px solid var(--border); color: var(--text-muted); white-space: nowrap; }
</style>
