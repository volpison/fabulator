<script lang="ts">
  import { platform } from "../lib/platform";
  import { project, reportsOpen, selectedScriptSceneId, mainView } from "../lib/app/stores";
  import { characterReport, locationReport, reportCsv, sceneReport, type ReportKind } from "../lib/screenplay/screenplayreports";
  import { formatPages } from "../lib/screenplay/screenplay";

  const tabs: { id: ReportKind; label: string; hint: string }[] = [
    { id: "scenes", label: "Scenes", hint: "Every scene: length and who speaks" },
    { id: "characters", label: "Characters", hint: "Scenes, lines and words of dialogue" },
    { id: "locations", label: "Locations", hint: "Where the script goes, and how much happens there" },
  ];
  let tab: ReportKind = "scenes";
  let message = "";

  $: scenes = $project ? sceneReport($project) : [];
  $: characters = $project ? characterReport($project) : [];
  $: locations = $project ? locationReport($project) : [];

  const close = () => reportsOpen.set(false);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  function goTo(id: string) {
    selectedScriptSceneId.set(id);
    mainView.set("manuscript");
    close();
  }

  async function save() {
    if (!$project) return;
    message = "";
    try {
      const base = ($project.title || "screenplay").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim() || "screenplay";
      const path = await platform().pickSaveFile({
        title: "Save report",
        defaultName: `${base} (${tab} report).csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!path) return;
      // A byte-order mark makes Excel read accents correctly.
      await platform().writeBytes(path, new TextEncoder().encode("﻿" + reportCsv($project, tab)));
      message = `Saved to ${path}`;
    } catch (e) {
      message = `Could not save: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="backdrop" role="presentation" on:mousedown|self={close}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Reports">
    <header>
      <div class="tabs">
        {#each tabs as t}
          <button class:active={tab === t.id} title={t.hint} on:click={() => (tab = t.id)}>{t.label}</button>
        {/each}
      </div>
      <button class="x" title="Close (Esc)" on:click={close}>✕</button>
    </header>

    <div class="body">
      {#if tab === "scenes"}
        {#if scenes.length === 0}<p class="empty">No scenes yet.</p>{:else}
          <table>
            <thead><tr><th>#</th><th>Slug line</th><th>Act</th><th class="n">Pages</th><th class="n">Words</th><th>Speaking</th></tr></thead>
            <tbody>
              {#each scenes as r}
                <tr>
                  <td>{r.number}</td>
                  <td><button class="link" on:click={() => goTo(r.id)}>{r.slug}</button></td>
                  <td>{r.act}</td>
                  <td class="n">{formatPages(r.pages)}</td>
                  <td class="n">{r.words}</td>
                  <td>{r.speakers.join(", ")}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      {:else if tab === "characters"}
        {#if characters.length === 0}<p class="empty">No character speaks or is listed on a scene yet.</p>{:else}
          <table>
            <thead><tr><th>Character</th><th class="n">Scenes</th><th class="n">Speaking in</th><th class="n">Lines</th><th class="n">Words</th><th>Scene numbers</th></tr></thead>
            <tbody>
              {#each characters as r}
                <tr><td>{r.name}</td><td class="n">{r.scenes.length}</td><td class="n">{r.speaking}</td><td class="n">{r.lines}</td><td class="n">{r.words}</td><td>{r.scenes.join(", ")}</td></tr>
              {/each}
            </tbody>
          </table>
        {/if}
      {:else if locations.length === 0}
        <p class="empty">No scene has a location yet.</p>
      {:else}
        <table>
          <thead><tr><th>Location</th><th>INT/EXT</th><th>Times</th><th class="n">Scenes</th><th class="n">Pages</th><th>Scene numbers</th></tr></thead>
          <tbody>
            {#each locations as r}
              <tr><td>{r.location}</td><td>{r.int_ext.join("/")}</td><td>{r.times.join(", ")}</td><td class="n">{r.scenes.length}</td><td class="n">{formatPages(r.pages)}</td><td>{r.scenes.join(", ")}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    <footer>
      <span class="msg">{message}</span>
      <button class="primary" on:click={save}>Save as CSV…</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 100; display: flex; justify-content: center; align-items: flex-start; padding-top: 6vh; background: var(--backdrop); }
  .dialog { display: flex; flex-direction: column; width: min(860px, 96vw); max-height: 86vh; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 1rem; border-bottom: 1px solid var(--border); }
  .tabs { display: flex; gap: 0.25rem; }
  .tabs button { padding: 0.3rem 0.7rem; border-radius: 6px; font-size: 0.85rem; color: var(--text-muted); }
  .tabs button.active { background: var(--bg-sidebar); color: var(--text); font-weight: 600; }
  .x { color: var(--text-muted); }
  .body { padding: 0.5rem 1rem 0.75rem; overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); padding: 0.35rem 0.5rem; position: sticky; top: 0; background: var(--bg-panel); }
  td { padding: 0.3rem 0.5rem; border-top: 1px solid var(--border); vertical-align: top; }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  .link { color: var(--accent); text-align: left; }
  .link:hover { text-decoration: underline; }
  .empty { color: var(--text-muted); font-size: 0.85rem; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.6rem 1rem; border-top: 1px solid var(--border); }
  .msg { font-size: 0.75rem; color: var(--text-muted); word-break: break-all; }
  .primary { background: var(--accent); color: var(--on-accent); border-radius: 6px; padding: 0.4rem 0.9rem; font-weight: 600; }
</style>
