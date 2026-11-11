<script lang="ts">
  import { onMount } from "svelte";
  import { platform } from "../lib/platform";
  import {
    project,
    selectedScene,
    selectedSceneId,
    mainView,
    replaceOpen,
    replaceInScenes,
  } from "../lib/stores";
  import {
    planReplace,
    DEFAULT_REPLACE_OPTIONS,
    DEFAULT_REPLACE_FIELDS,
    type ReplaceFields,
    type ReplaceOptions,
  } from "../lib/replace";

  const STORE_KEY = "fabulator.replace.options";

  function loadSaved(): { options?: Partial<ReplaceOptions>; fields?: Partial<ReplaceFields> } {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  const saved = loadSaved();

  let find = "";
  let replacement = "";
  let matchCase = saved.options?.matchCase ?? DEFAULT_REPLACE_OPTIONS.matchCase;
  let wholeWord = saved.options?.wholeWord ?? DEFAULT_REPLACE_OPTIONS.wholeWord;
  let inText = saved.fields?.content ?? DEFAULT_REPLACE_FIELDS.content;
  let inTitles = saved.fields?.title ?? DEFAULT_REPLACE_FIELDS.title;
  let inSynopsis = saved.fields?.summary ?? DEFAULT_REPLACE_FIELDS.summary;
  let onlyThisScene = false;

  /** Scene ids the user has unchecked. */
  let excluded = new Set<string>();
  let message = "";
  let findInput: HTMLInputElement | undefined;

  onMount(() => findInput?.focus());

  $: options = { matchCase, wholeWord } as ReplaceOptions;
  $: fields = { content: inText, title: inTitles, summary: inSynopsis } as ReplaceFields;
  $: plan = $project
    ? planReplace($project, find, replacement, options, fields, onlyThisScene ? $selectedScene?.id : null)
    : { changes: [], total: 0, scenes: 0 };
  $: chosen = plan.changes.filter((c) => !excluded.has(c.sceneId));
  $: chosenTotal = chosen.reduce((n, c) => n + c.total, 0);
  $: noField = !inText && !inTitles && !inSynopsis;
  // A new search starts with everything ticked again.
  $: find, matchCase, wholeWord, (excluded = new Set(), (message = ""));

  function close() {
    replaceOpen.set(false);
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function toggle(id: string) {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    excluded = next;
  }

  function open(id: string) {
    selectedSceneId.set(id);
    mainView.set("manuscript");
  }

  async function apply() {
    if (chosen.length === 0) return;
    const ok = await platform().confirm(
      `Replace “${find}” with “${replacement}” — ${chosenTotal} time${chosenTotal === 1 ? "" : "s"} in ${chosen.length} scene${chosen.length === 1 ? "" : "s"}?\n\nEach changed scene is saved as a snapshot first, so you can undo it from Snapshots.`,
      { title: "Replace", kind: "warning", okLabel: "Replace", cancelLabel: "Cancel" }
    );
    if (!ok) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ options, fields }));
    } catch {
      /* optional */
    }
    const r = replaceInScenes(find, replacement, options, fields, chosen.map((c) => c.sceneId));
    message = `Replaced ${r.replacements} time${r.replacements === 1 ? "" : "s"} in ${r.scenes} scene${r.scenes === 1 ? "" : "s"}. Undo any scene from Snapshots.`;
    excluded = new Set();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void apply();
    }
  }
</script>

<svelte:window on:keydown={onWindowKey} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click|self={close}>
  <div class="dialog" role="dialog" aria-label="Find and replace">
    <header>
      <h2>Find &amp; replace</h2>
      <button class="x" on:click={close} aria-label="Close">✕</button>
    </header>

    <div class="inputs">
      <label>
        Find
        <input type="text" bind:this={findInput} bind:value={find} on:keydown={onKey} placeholder="Text to find" />
      </label>
      <label>
        Replace with
        <input type="text" bind:value={replacement} on:keydown={onKey} placeholder="(leave empty to delete)" />
      </label>
      <div class="opts">
        <label class="chk"><input type="checkbox" bind:checked={matchCase} /> Match case</label>
        <label class="chk"><input type="checkbox" bind:checked={wholeWord} /> Whole word</label>
        <span class="sep"></span>
        <label class="chk"><input type="checkbox" bind:checked={inText} /> Text</label>
        <label class="chk"><input type="checkbox" bind:checked={inTitles} /> Titles</label>
        <label class="chk"><input type="checkbox" bind:checked={inSynopsis} /> Synopses</label>
        <span class="sep"></span>
        <label class="chk" class:disabled={!$selectedScene}>
          <input type="checkbox" bind:checked={onlyThisScene} disabled={!$selectedScene} /> Only the selected scene
        </label>
      </div>
    </div>

    <div class="results">
      {#if !find}
        <p class="empty">Type what to find. Only the visible text is changed, never formatting.</p>
      {:else if noField}
        <p class="empty">Choose where to replace: text, titles or synopses.</p>
      {:else if plan.changes.length === 0}
        <p class="empty">No matches.</p>
      {:else}
        {#each plan.changes as c (c.sceneId)}
          <div class="item" class:off={excluded.has(c.sceneId)}>
            <input
              type="checkbox"
              checked={!excluded.has(c.sceneId)}
              on:change={() => toggle(c.sceneId)}
              aria-label="Include {c.title}"
            />
            <div class="body">
              <div class="line1">
                <button class="link" on:click={() => open(c.sceneId)} title="Open this scene">{c.title}</button>
                <span class="sub">{c.chapterLabel}</span>
                <span class="n">{c.total}×</span>
              </div>
              {#if c.snippet}
                <div class="snip">
                  {c.snippet.before}<del>{c.snippet.match}</del><ins>{c.snippet.replacement}</ins>{c.snippet.after}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <footer>
      <span class="count">
        {#if message}
          {message}
        {:else if plan.changes.length > 0}
          {chosenTotal} replacement{chosenTotal === 1 ? "" : "s"} in {chosen.length} of {plan.scenes} scene{plan.scenes === 1 ? "" : "s"}
        {/if}
      </span>
      <button class="primary" on:click={apply} disabled={chosen.length === 0}>Replace all</button>
    </footer>
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
    padding-top: 6vh;
    background: var(--backdrop);
  }
  .dialog {
    display: flex;
    flex-direction: column;
    width: min(680px, 94vw);
    max-height: 84vh;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  h2 { margin: 0; font-size: 1rem; }
  .x { color: var(--text-muted); }
  .inputs {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  .inputs > label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); }
  .opts { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.9rem; }
  .chk { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; flex-direction: row; font-weight: 400; color: inherit; }
  .chk.disabled { opacity: 0.5; }
  .sep { width: 1px; height: 1rem; background: var(--border); }
  .results { overflow-y: auto; padding: 0.4rem 0.5rem; min-height: 5rem; flex: 1; }
  .empty { margin: 1rem; font-size: 0.85rem; color: var(--text-muted); }
  .item { display: flex; gap: 0.6rem; padding: 0.45rem 0.5rem; border-radius: 8px; align-items: flex-start; }
  .item:hover { background: var(--bg-sidebar); }
  .item.off { opacity: 0.5; }
  .body { min-width: 0; flex: 1; }
  .line1 { display: flex; align-items: baseline; gap: 0.5rem; }
  .link { font-weight: 600; font-size: 0.85rem; color: var(--accent); text-align: left; }
  .sub { font-size: 0.7rem; color: var(--text-muted); flex: 1; }
  .n { font-size: 0.7rem; background: var(--bg-sidebar); border-radius: 999px; padding: 0 0.45rem; }
  .snip { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.15rem; overflow-wrap: anywhere; }
  del { background: var(--del-bg); color: var(--del-fg); text-decoration: line-through; }
  ins { background: var(--ok-bg); color: var(--ok-fg); text-decoration: none; }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 1rem;
    border-top: 1px solid var(--border);
  }
  .count { font-size: 0.75rem; color: var(--text-muted); }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-radius: 6px;
    padding: 0.4rem 0.9rem;
    font-weight: 600;
    flex-shrink: 0;
  }
  .primary:disabled { opacity: 0.5; cursor: default; }
</style>
