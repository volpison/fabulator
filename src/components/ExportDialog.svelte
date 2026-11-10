<script lang="ts">
  import { save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { project, selectedScene, exportOpen } from "../lib/stores";
  import {
    DEFAULT_OPTIONS,
    exportPreview,
    exportProject,
    type ExportFormat,
    type ExportOptions,
    type ExportScope,
    type SceneBreak,
  } from "../lib/export";

  const STORE_KEY = "fabulator.export.options";

  function loadSaved(): Partial<ExportOptions> {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  const saved = loadSaved();
  let format: ExportFormat = saved.format ?? DEFAULT_OPTIONS.format;
  let scope: ExportScope = "all";
  let author = saved.author ?? "";
  let chapterHeadings = saved.chapterHeadings ?? DEFAULT_OPTIONS.chapterHeadings;
  let sceneTitles = saved.sceneTitles ?? DEFAULT_OPTIONS.sceneTitles;
  let sceneBreak: SceneBreak = saved.sceneBreak ?? DEFAULT_OPTIONS.sceneBreak;
  let pageSize: "a4" | "letter" = saved.pageSize ?? "a4";
  let language = saved.language ?? "en";

  let busy = false;
  let message = "";
  let failed = false;

  const formats: { id: ExportFormat; label: string; hint: string }[] = [
    { id: "docx", label: "Word (.docx)", hint: "For editors, printing, submitting" },
    { id: "epub", label: "EPUB", hint: "For e-readers" },
    { id: "markdown", label: "Markdown (.md)", hint: "Plain text with light formatting" },
    { id: "text", label: "Plain text (.txt)", hint: "No formatting at all" },
  ];

  $: options = {
    format,
    scope,
    sceneId: $selectedScene?.id ?? null,
    author,
    chapterHeadings,
    sceneTitles,
    sceneBreak,
    pageSize,
    language: language.trim() || "en",
  } as ExportOptions;

  $: counts = $project ? exportPreview($project, options) : { scenes: 0, chapters: 0 };
  $: canChooseScope = !!$selectedScene;
  $: if (!canChooseScope) scope = "all";

  function close() {
    exportOpen.set(false);
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape" && !busy) {
      e.preventDefault();
      close();
    }
  }

  async function doExport() {
    if (!$project || busy || counts.scenes === 0) return;
    busy = true;
    failed = false;
    message = "";
    try {
      try {
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({ format, author, chapterHeadings, sceneTitles, sceneBreak, pageSize, language })
        );
      } catch {
        /* remembering options is optional */
      }

      const result = exportProject($project, options);
      const ext = result.fileName.split(".").pop() ?? "";
      const path = await save({
        title: "Export",
        defaultPath: result.fileName,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (!path) {
        busy = false;
        return; // cancelled
      }
      await invoke("write_export", { path, bytes: Array.from(result.bytes) });
      message = `Exported ${result.scenes} scene${result.scenes === 1 ? "" : "s"} to ${path}`;
    } catch (e) {
      failed = true;
      message = `Export failed: ${e}`;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window on:keydown={onWindowKey} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click|self={() => !busy && close()}>
  <div class="dialog" role="dialog" aria-label="Export">
    <header>
      <h2>Export</h2>
      <button class="x" on:click={close} disabled={busy} aria-label="Close">✕</button>
    </header>

    <div class="content">
      <fieldset>
        <legend>Format</legend>
        <div class="formats">
          {#each formats as f}
            <label class="format" class:active={format === f.id}>
              <input type="radio" bind:group={format} value={f.id} />
              <span class="name">{f.label}</span>
              <span class="hint">{f.hint}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      <fieldset>
        <legend>What to export</legend>
        <label class="row">
          <input type="radio" bind:group={scope} value="all" /> Whole story
        </label>
        <label class="row" class:disabled={!canChooseScope}>
          <input type="radio" bind:group={scope} value="chapter" disabled={!canChooseScope} />
          The chapter of the selected scene
        </label>
        <label class="row" class:disabled={!canChooseScope}>
          <input type="radio" bind:group={scope} value="scene" disabled={!canChooseScope} />
          Only the selected scene{$selectedScene ? ` (“${$selectedScene.title || "Untitled"}”)` : ""}
        </label>
      </fieldset>

      <fieldset>
        <legend>Layout</legend>
        <label class="field">
          Author
          <input type="text" bind:value={author} placeholder="Shown under the title" />
        </label>
        <label class="row"><input type="checkbox" bind:checked={chapterHeadings} /> Chapter headings</label>
        <label class="row"><input type="checkbox" bind:checked={sceneTitles} /> Scene titles (instead of scene breaks)</label>
        <label class="field" class:disabled={sceneTitles}>
          Between scenes
          <select bind:value={sceneBreak} disabled={sceneTitles}>
            <option value="ornament">* * *</option>
            <option value="blank">Blank line</option>
            <option value="none">Nothing</option>
          </select>
        </label>
        {#if format === "docx"}
          <label class="field">
            Page size
            <select bind:value={pageSize}>
              <option value="a4">A4</option>
              <option value="letter">US Letter</option>
            </select>
          </label>
        {/if}
        {#if format === "docx" || format === "epub"}
          <label class="field">
            Language code
            <input type="text" bind:value={language} placeholder="en, pt-BR, es…" />
          </label>
        {/if}
      </fieldset>

      {#if message}
        <p class="msg" class:failed>{message}</p>
      {/if}
    </div>

    <footer>
      <span class="count">
        {counts.scenes} scene{counts.scenes === 1 ? "" : "s"} in {counts.chapters}
        chapter{counts.chapters === 1 ? "" : "s"}{counts.scenes === 0 ? " — nothing with text to export" : ""}
      </span>
      <button class="primary" on:click={doExport} disabled={busy || counts.scenes === 0}>
        {busy ? "Exporting…" : "Export…"}
      </button>
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
    width: min(560px, 94vw);
    max-height: 86vh;
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
  .content {
    padding: 0.75rem 1rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem 0.75rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  legend { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); padding: 0 0.3rem; }
  .formats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
  .format {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
  }
  .format.active { border-color: var(--accent); background: var(--bg-sidebar); }
  .format input { position: absolute; opacity: 0; pointer-events: none; }
  .name { font-size: 0.85rem; font-weight: 600; }
  .hint { font-size: 0.7rem; color: var(--text-muted); }
  .row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
  .field { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; font-size: 0.85rem; }
  .field input[type="text"], .field select { width: 55%; }
  .disabled { opacity: 0.5; }
  .msg { margin: 0; font-size: 0.8rem; word-break: break-all; color: var(--text-muted); }
  .msg.failed { color: var(--danger); }
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
  }
  .primary:disabled { opacity: 0.5; cursor: default; }
</style>
