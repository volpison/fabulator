<script lang="ts">
  import { onMount, tick } from "svelte";
  import { project, searchOpen, openSearchHit } from "../lib/stores";
  import { search, KIND_LABEL, type SearchKind } from "../lib/search";

  let input: HTMLInputElement | undefined;
  let list: HTMLDivElement | undefined;

  /** What is typed, and the (slightly delayed) query actually searched. */
  let query = "";
  let applied = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = 0;

  onMount(() => {
    input?.focus();
    return () => clearTimeout(timer);
  });

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      applied = query;
      active = 0;
    }, 120);
  }

  $: result = $project && applied.trim() ? search($project, applied) : null;
  $: hits = result?.hits ?? [];
  $: shown = hits.reduce(
    (acc, h) => ({ ...acc, [h.kind]: (acc[h.kind] ?? 0) + 1 }),
    {} as Partial<Record<SearchKind, number>>
  );

  function close() {
    searchOpen.set(false);
  }

  async function reveal() {
    await tick();
    list?.querySelector(".hit.active")?.scrollIntoView({ block: "nearest" });
  }

  async function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hits.length) active = (active + 1) % hits.length;
      await reveal();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hits.length) active = (active - 1 + hits.length) % hits.length;
      await reveal();
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Don't wait for the typing delay if Enter was pressed quickly.
      if (applied !== query) {
        clearTimeout(timer);
        applied = query;
        active = 0;
        await tick();
      }
      openHit(active);
    }
  }

  function openHit(i: number) {
    const hit = hits[i];
    if (hit && result) openSearchHit(hit, result.terms);
  }
</script>

<div class="backdrop" role="presentation" on:mousedown|self={close}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Search project">
    <input
      bind:this={input}
      bind:value={query}
      on:input={onInput}
      on:keydown={onKeydown}
      class="box"
      type="text"
      placeholder="Search scenes, characters, places, notes…"
      spellcheck="false"
      autocomplete="off"
    />

    <div class="results" bind:this={list}>
      {#if !result}
        <p class="hint">
          Type to search your whole project. All words must match; use “quotes”
          for an exact phrase. Case and accents are ignored.
        </p>
      {:else if hits.length === 0}
        <p class="hint">No results for “{applied.trim()}”.</p>
      {:else}
        {#each hits as hit, i (hit.kind + ":" + hit.id)}
          {#if i === 0 || hits[i - 1].kind !== hit.kind}
            <div class="group">
              {KIND_LABEL[hit.kind]}
              <span class="count">{result.counts[hit.kind]}</span>
              {#if result.counts[hit.kind] > (shown[hit.kind] ?? 0)}
                <span class="more">· showing the first {shown[hit.kind]}</span>
              {/if}
            </div>
          {/if}

          <button
            type="button"
            class="hit"
            class:active={i === active}
            on:mouseenter={() => (active = i)}
            on:click={() => openHit(i)}
          >
            <div class="top">
              <span class="title">{hit.title}</span>
              {#if hit.subtitle}<span class="sub">{hit.subtitle}</span>{/if}
              {#if hit.matches > 1}<span class="n">{hit.matches}×</span>{/if}
            </div>
            <div class="snip">
              <span class="field">{hit.field}</span>
              {hit.snippet.before}<mark>{hit.snippet.match}</mark
              >{hit.snippet.after}
            </div>
          </button>
        {/each}
      {/if}
    </div>

    <div class="foot">↑ ↓ navigate · Enter open · Esc close</div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
    background: var(--backdrop);
  }

  .dialog {
    display: flex;
    flex-direction: column;
    width: min(680px, 92vw);
    max-height: 70vh;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }

  .box {
    flex-shrink: 0;
    width: 100%;
    font: inherit;
    font-size: 1rem;
    padding: 0.9rem 1.1rem;
    border: none;
    border-bottom: 1px solid var(--border);
    outline: none;
    background: transparent;
    color: var(--text);
  }

  .results {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.3rem 0.4rem 0.5rem;
  }

  .hint {
    padding: 1rem 0.75rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .group {
    padding: 0.6rem 0.7rem 0.2rem;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .count {
    font-weight: 500;
    background: var(--bg-sidebar);
    border-radius: 999px;
    padding: 0 0.4rem;
    margin-left: 0.25rem;
  }

  .more {
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
  }

  .hit {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.45rem 0.7rem;
    border-radius: 8px;
  }

  .hit.active {
    background: var(--accent-soft);
  }

  .top {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .title {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .sub {
    font-size: 0.7rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .n {
    margin-left: auto;
    font-size: 0.65rem;
    color: var(--text-muted);
  }

  .snip {
    margin-top: 0.15rem;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }

  .field {
    font-size: 0.62rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: var(--bg-sidebar);
    border-radius: 3px;
    padding: 0 0.3rem;
    margin-right: 0.3rem;
  }

  mark {
    background: var(--mark-bg);
    color: var(--mark-fg);
    border-radius: 2px;
    padding: 0 1px;
  }

  .foot {
    flex-shrink: 0;
    padding: 0.4rem 0.9rem;
    border-top: 1px solid var(--border);
    font-size: 0.65rem;
    color: var(--text-muted);
  }
</style>
