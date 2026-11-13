<script lang="ts">
  import {
    mainView,
    sidePanel,
    searchOpen,
    snapshotsOpen,
    exportOpen,
    replaceOpen,
  } from "../lib/stores";
  import { manualSave, saveAs, openProject, openRecent, openFolder, exportFolder, loadSample, newProject } from "../lib/persistence";
  import { recentFiles, clearRecents } from "../lib/recentStore";
  import { recentLabels } from "../lib/recent";
  import { platform } from "../lib/platform";
  import type { MenuItem } from "../lib/menu";
  import type { MainView, SidePanel } from "../lib/types";
  import Menu from "./Menu.svelte";
  import ViewMenu from "./ViewMenu.svelte";

  $: recentNames = recentLabels($recentFiles, (l) => platform().describe(l));
  $: recentItems = ($recentFiles.length === 0
    ? [{ label: "No recent files", disabled: true }]
    : [
        ...$recentFiles.map((r, i) => ({ label: recentNames[i], action: () => void openRecent(r.location) })),
        { separator: true },
        { label: "Clear list", action: () => clearRecents() },
      ]) as MenuItem[];

  $: fileItems = [
    { label: "New story", shortcut: "Ctrl+N", action: () => void newProject() },
    { label: "New comic", action: () => void newProject("comic") },
    { separator: true },
    { label: "Open…", shortcut: "Ctrl+O", action: () => void openProject() },
    { label: "Open recent", children: recentItems },
    { label: "Open folder…", action: () => void openFolder() },
    { separator: true },
    { label: "Save", shortcut: "Ctrl+S", action: () => void manualSave() },
    { label: "Save as…", shortcut: "Ctrl+Shift+S", action: () => void saveAs() },
    { separator: true },
    { label: "Export…", shortcut: "Ctrl+E", action: () => exportOpen.set(true) },
    { label: "Export as folder (Markdown)…", action: () => void exportFolder() },
    { separator: true },
    {
      label: "Load sample story",
      children: [{ label: "The Boy Who Cried Wolf", action: () => void loadSample() }],
    },
  ] as MenuItem[];

  const toolItems: MenuItem[] = [
    { label: "Search…", shortcut: "Ctrl+F", action: () => searchOpen.set(true) },
    { label: "Find & replace…", shortcut: "Ctrl+H", action: () => replaceOpen.set(true) },
    { separator: true },
    { label: "Snapshots…", shortcut: "Ctrl+Shift+H", action: () => snapshotsOpen.set(true) },
  ];

  const views: { id: MainView; label: string; hint: string }[] = [
    { id: "timeline", label: "Timeline", hint: "Plan chapters and scenes, or a comic's pages (Ctrl+1)" },
    { id: "manuscript", label: "Manuscript", hint: "Write (Ctrl+2)" },
    { id: "cast", label: "Cast", hint: "Who appears in which scenes (Ctrl+3)" },
  ];

  const panels: { id: Exclude<SidePanel, null>; label: string }[] = [
    { id: "characters", label: "Characters" },
    { id: "places", label: "Places" },
    { id: "notes", label: "Notes" },
  ];

  function togglePanel(panel: SidePanel) {
    sidePanel.update((current) => (current === panel ? null : panel));
  }
</script>

<header class="topbar">
  <div class="zone left">
    <span class="logo">Fabulator</span>
    <Menu label="File" items={fileItems} />
    <Menu label="Tools" items={toolItems} />
  </div>

  <nav class="seg views" aria-label="Views">
    {#each views as v}
      <button
        class:active={$mainView === v.id}
        aria-current={$mainView === v.id ? "page" : undefined}
        title={v.hint}
        on:click={() => mainView.set(v.id)}
      >
        {v.label}
      </button>
    {/each}
  </nav>

  <div class="zone right">
    <div class="seg panels" role="group" aria-label="Side panel (Ctrl+\)">
      {#each panels as p}
        <button
          class:active={$sidePanel === p.id}
          aria-pressed={$sidePanel === p.id}
          title="{p.label} panel (Ctrl+\)"
          on:click={() => togglePanel(p.id)}
        >
          {p.label}
        </button>
      {/each}
    </div>
    <ViewMenu />
  </div>
</header>

<style>
  .topbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 1rem;
    height: 2.9rem;
    padding: 0 0.75rem 0 1rem;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .zone {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .right {
    justify-content: flex-end;
    gap: 0.6rem;
  }

  .logo {
    margin-right: 0.6rem;
    font-weight: 700;
    font-size: 1.05rem;
    color: var(--accent);
    letter-spacing: -0.01em;
  }

  .seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: var(--bg-sidebar);
    border-radius: 8px;
  }

  .seg button {
    padding: 0.3rem 0.85rem;
    border-radius: 6px;
    font-size: 0.82rem;
    color: var(--text-muted);
    transition: background 0.12s, color 0.12s;
  }

  .seg button:hover:not(.active) {
    color: var(--text);
  }

  .seg button.active {
    background: var(--bg-panel);
    color: var(--text);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
  }

  .panels button {
    padding: 0.3rem 0.65rem;
    font-size: 0.78rem;
  }

  @media (max-width: 1000px) {
    .logo {
      display: none;
    }
    .panels button {
      padding: 0.3rem 0.45rem;
    }
  }
</style>
