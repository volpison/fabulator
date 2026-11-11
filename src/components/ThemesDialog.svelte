<script lang="ts">
  import { onMount } from "svelte";
  import { platform } from "../lib/platform";
  import { themesOpen, galleryOpen } from "../lib/stores";
  import { settings, updateSettings, customThemes } from "../lib/appearance";
  import { THEMES, type ThemeInfo } from "../lib/themes";
  import {
    BUILT_IN,
    IMPORTED,
    collectionOf,
    collectionsOf,
    countByMode,
    filterThemes,
    type ThemeMode,
  } from "../lib/themelib";
  import {
    BUILT_IN_IDS,
    importThemeFolder,
    importThemeFromFile,
    removeCollection,
    type FolderImportOutcome,
  } from "../lib/userthemes";
  import type { ThemeChoice } from "../lib/settings";

  let mode: ThemeMode = "all";
  let query = "";
  let collection = "";
  let search: HTMLInputElement | undefined;

  let busy = false;
  let message = "";
  let failed = false;
  let skipped: { name: string; reason: string }[] = [];

  onMount(() => search?.focus());

  $: all = [...THEMES, ...$customThemes] as ThemeInfo[];
  $: collections = collectionsOf(all, BUILT_IN_IDS);
  // Counts for Dark / Light follow the search text and collection, not the mode itself.
  $: counts = countByMode(filterThemes(all, { mode: "all", query, collection }, BUILT_IN_IDS));
  $: shown = filterThemes(all, { mode, query, collection }, BUILT_IN_IDS);
  $: showSystem = mode === "all" && !query.trim() && (!collection || collection === BUILT_IN);
  $: removable = collection !== "" && collection !== BUILT_IN && collection !== IMPORTED;

  const swatch = (t: ThemeInfo) =>
    `linear-gradient(135deg, ${t.palette["bg"]} 0 40%, ${t.palette["bg-panel"]} 40% 62%, ${t.palette["accent"]} 62% 82%, ${t.palette["char"]} 82%)`;

  function close() {
    themesOpen.set(false);
  }

  function use(id: string) {
    updateSettings({ theme: id as ThemeChoice });
  }

  function report(r: FolderImportOutcome) {
    skipped = [];
    if (r.status === "cancelled") return;
    failed = r.status === "error";
    if (r.status === "error") {
      message = r.message;
      return;
    }
    skipped = r.skipped;
    const formats = Object.entries(r.formats)
      .map(([k, n]) => `${n} ${k === "base24" ? "Base24" : k === "base16" ? "Base16" : k === "vscode" ? "VS Code" : "Fabulator"}`)
      .join(", ");
    message =
      r.imported === 0
        ? `Nothing new to add from “${r.collection}”.` + (r.skipped.length ? ` ${r.skipped.length} file(s) skipped.` : "")
        : `Added ${r.imported} theme${r.imported === 1 ? "" : "s"} from “${r.collection}” (${formats})` +
          (r.renamed ? `, ${r.renamed} renamed to avoid replacing yours` : "") +
          (r.skipped.length ? `; ${r.skipped.length} skipped` : "") +
          ".";
    if (r.imported > 0) {
      collection = r.collection;
      mode = "all";
      query = "";
    }
  }

  async function onImportFolder() {
    busy = true;
    report(await importThemeFolder());
    busy = false;
  }

  async function onImportFile() {
    busy = true;
    const r = await importThemeFromFile();
    busy = false;
    if (r.status === "cancelled") return;
    skipped = [];
    failed = r.status === "error";
    message = r.status === "imported" ? `Imported “${r.name}”.${r.warnings.length ? " " + r.warnings.join(" ") : ""}` : r.status === "error" ? r.message : "";
  }

  async function onRemoveCollection() {
    const n = counts.all;
    const ok = await platform().confirm(`Remove all ${collections.find((c) => c.name === collection)?.count ?? n} themes in “${collection}”? This cannot be undone.`, {
      title: "Remove collection",
      kind: "warning",
      okLabel: "Remove",
      cancelLabel: "Keep",
    });
    if (!ok) return;
    const name = collection;
    const problem = await removeCollection(name);
    failed = !!problem;
    skipped = [];
    message = problem ?? `Removed “${name}”.`;
    if (!problem) collection = "";
  }

  function openGallery() {
    themesOpen.set(false);
    galleryOpen.set(true);
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }
</script>

<svelte:window on:keydown={onWindowKey} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click|self={close}>
  <div class="dialog" role="dialog" aria-label="Themes">
    <header>
      <h2>Themes <span class="total">{all.length}</span></h2>
      <button class="x" on:click={close} aria-label="Close">✕</button>
    </header>

    <div class="toolbar">
      <input
        bind:this={search}
        bind:value={query}
        class="search"
        type="search"
        placeholder="Search themes…"
        aria-label="Search themes"
      />
      <div class="seg" role="group" aria-label="Dark or light">
        <button class:on={mode === "all"} on:click={() => (mode = "all")}>All <b>{counts.all}</b></button>
        <button class:on={mode === "dark"} on:click={() => (mode = "dark")}>Dark <b>{counts.dark}</b></button>
        <button class:on={mode === "light"} on:click={() => (mode = "light")}>Light <b>{counts.light}</b></button>
      </div>
      <select bind:value={collection} aria-label="Collection">
        <option value="">All collections</option>
        {#each collections as c (c.name)}
          <option value={c.name}>{c.name} ({c.count})</option>
        {/each}
      </select>
    </div>

    <div class="actions">
      <button on:click={onImportFolder} disabled={busy} title="Import every Base16 / Base24 / VS Code / Fabulator theme file in a folder">Import folder…</button>
      <button on:click={onImportFile} disabled={busy}>Import file…</button>
      <button on:click={openGallery}>Gallery…</button>
      {#if removable}
        <button class="danger" on:click={onRemoveCollection} disabled={busy}>Remove “{collection}”</button>
      {/if}
    </div>

    {#if message}
      <div class="notice" class:failed role="status">
        <span>{message}</span>
        {#if skipped.length}
          <details>
            <summary>Show skipped files ({skipped.length})</summary>
            <ul>
              {#each skipped.slice(0, 200) as s}
                <li><code>{s.name}</code> {s.reason}</li>
              {/each}
              {#if skipped.length > 200}<li>…and {skipped.length - 200} more.</li>{/if}
            </ul>
          </details>
        {/if}
      </div>
    {/if}

    <div class="content">
      {#if shown.length === 0 && !showSystem}
        <p class="empty">No themes match. Try another search or filter, or import a folder of Base16 / Base24 schemes.</p>
      {:else}
        <div class="grid">
          {#if showSystem}
            <button
              class="card"
              class:selected={$settings.theme === "system"}
              on:click={() => use("system")}
              title="Follow the operating system's light / dark setting"
            >
              <span class="swatch" style="background: linear-gradient(90deg, #f8fafc 50%, #0b1220 50%)"></span>
              <span class="name">System</span>
              <span class="kind">auto</span>
            </button>
          {/if}
          {#each shown as t (t.id)}
            <button
              class="card"
              class:selected={$settings.theme === t.id}
              on:click={() => use(t.id)}
              aria-pressed={$settings.theme === t.id}
              title={`${t.label} · ${collectionOf(t, BUILT_IN_IDS)}`}
            >
              <span class="swatch" style="background: {swatch(t)}"></span>
              <span class="name">{t.label}</span>
              <span class="kind">{t.dark ? "dark" : "light"}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <footer>
      <span class="count">{shown.length} shown</span>
      <button class="done" on:click={close}>Done</button>
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
    padding-top: 5vh;
    background: var(--backdrop);
  }

  .dialog {
    display: flex;
    flex-direction: column;
    width: min(860px, 95vw);
    height: min(760px, 88vh);
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

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .total {
    margin-left: 0.4rem;
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--text-muted);
  }

  .x {
    color: var(--text-muted);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.7rem 1rem 0.4rem;
  }

  .search,
  select {
    padding: 0.32rem 0.55rem;
    font: inherit;
    font-size: 0.82rem;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .search {
    flex: 1 1 12rem;
    min-width: 9rem;
  }

  .seg {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .seg button {
    padding: 0.3rem 0.7rem;
    font-size: 0.78rem;
    color: var(--text-muted);
    background: var(--bg);
  }

  .seg button + button {
    border-left: 1px solid var(--border);
  }

  .seg button b {
    margin-left: 0.2rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }

  .seg button.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .seg button.on b {
    color: inherit;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.3rem 1rem 0.6rem;
  }

  .actions button {
    padding: 0.28rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.78rem;
    color: var(--text);
    background: var(--bg);
  }

  .actions button:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }

  .actions button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .actions .danger {
    margin-left: auto;
    color: var(--danger);
  }

  .notice {
    margin: 0 1rem 0.5rem;
    padding: 0.45rem 0.7rem;
    font-size: 0.78rem;
    color: var(--ok-fg);
    background: var(--ok-bg);
    border-radius: 6px;
  }

  .notice.failed {
    color: var(--del-fg);
    background: var(--del-bg);
  }

  .notice details {
    margin-top: 0.35rem;
  }

  .notice summary {
    cursor: pointer;
  }

  .notice ul {
    margin: 0.3rem 0 0;
    padding-left: 1rem;
    max-height: 9rem;
    overflow-y: auto;
    font-size: 0.72rem;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.4rem 1rem 1rem;
    border-top: 1px solid var(--border);
  }

  .empty {
    padding: 2rem 0;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.5rem;
    padding-top: 0.5rem;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.45rem;
    text-align: left;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    content-visibility: auto;
    contain-intrinsic-size: 5.5rem 9.5rem;
  }

  .card:hover {
    border-color: var(--accent);
  }

  .card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .swatch {
    height: 2.2rem;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.25);
  }

  .name {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kind {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-faint);
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.55rem 1rem;
    border-top: 1px solid var(--border);
  }

  .count {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .done {
    padding: 0.3rem 0.9rem;
    border-radius: 6px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
  }
</style>
