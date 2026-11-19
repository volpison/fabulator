<script lang="ts">
  import { onMount } from "svelte";
  import { error, loading, project } from "./lib/app/stores/core";
  import {
    exportOpen,
    focusMode,
    galleryOpen,
    gameCheckOpen,
    mainView,
    replaceOpen,
    reportsOpen,
    searchOpen,
    sidePanel,
    snapshotsOpen,
    themesOpen,
  } from "./lib/app/stores/ui";
  import {
    loadInitialProject,
    manualSave,
    newProject,
    openProject,
    saveAs,
    startAutosave,
    startMirror,
    installCloseGuard,
  } from "./lib/files/persistence";
  import { loadUserThemes } from "./lib/appearance/userthemes";
  import { settings, updateSettings } from "./lib/appearance/appearance";
  import { startGoals } from "./lib/app/goalsStore";

  import TopBar from "./components/shell/TopBar.svelte";
  import FormatNotReady from "./components/shell/FormatNotReady.svelte";
  import ComicTimeline from "./components/comic/ComicTimeline.svelte";
  import ScreenplayTimeline from "./components/screenplay/ScreenplayTimeline.svelte";
  import GameTimeline from "./components/game/GameTimeline.svelte";
  import GameManuscript from "./components/game/GameManuscript.svelte";
  import ScreenplayManuscript from "./components/screenplay/ScreenplayManuscript.svelte";
  import ComicManuscript from "./components/comic/ComicManuscript.svelte";
  import { formatOf } from "./lib/model/formats";
  import StatusBar from "./components/shell/StatusBar.svelte";
  import TimelineView from "./components/novel/TimelineView.svelte";
  import ManuscriptView from "./components/novel/ManuscriptView.svelte";
  import CastView from "./components/shell/CastView.svelte";
  import SearchDialog from "./components/dialogs/SearchDialog.svelte";
  import SnapshotsDialog from "./components/dialogs/SnapshotsDialog.svelte";
  import ExportDialog from "./components/dialogs/ExportDialog.svelte";
  import ThemeGallery from "./components/dialogs/ThemeGallery.svelte";
  import ThemesDialog from "./components/dialogs/ThemesDialog.svelte";
  import ReplaceDialog from "./components/dialogs/ReplaceDialog.svelte";
  import ReportsDialog from "./components/screenplay/ReportsDialog.svelte";
  import GameCheckDialog from "./components/game/GameCheckDialog.svelte";
  import SidePanel from "./components/shell/SidePanel.svelte";

  onMount(() => {
    const stopAutosave = startAutosave();
    let stopMirror: (() => void) | undefined;
    const stopGoals = startGoals();
    let removeCloseGuard: (() => void) | undefined;
    let disposed = false;

    (async () => {
      try {
        void loadUserThemes();
        await loadInitialProject();
        // Only after the live copy was read: starting earlier would clear it.
        if (!disposed) stopMirror = startMirror();
        const un = await installCloseGuard();
        if (disposed) un();
        else removeCloseGuard = un;
      } catch (e) {
        error.set(String(e));
      } finally {
        loading.set(false);
      }
    })();

    return () => {
      disposed = true;
      stopAutosave();
      stopMirror?.();
      stopGoals();
      removeCloseGuard?.();
    };
  });

  const anyDialogOpen = () =>
    $searchOpen || $snapshotsOpen || $exportOpen || $replaceOpen || $reportsOpen || $gameCheckOpen || $galleryOpen || $themesOpen;

  // Leaving the manuscript always leaves focus mode (its chrome is hidden there).
  $: if ($mainView !== "manuscript") focusMode.set(false);

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && $focusMode && !anyDialogOpen()) {
      e.preventDefault();
      focusMode.set(false);
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();

    if (e.shiftKey) {
      if (key === "s") {
        e.preventDefault();
        void saveAs();
      } else if (key === "f") {
        e.preventDefault();
        if ($focusMode) focusMode.set(false);
        else {
          mainView.set("manuscript");
          focusMode.set(true);
        }
      } else if (key === "h") {
        e.preventDefault();
        snapshotsOpen.set(true);
      } else if (key === "t") {
        e.preventDefault();
        updateSettings({ typewriter: $settings.typewriter === "off" ? "center" : "off" });
      }
      return;
    }

    if (key === "n") {
      e.preventDefault();
      void newProject();
    } else if (key === "s") {
      e.preventDefault();
      void manualSave();
    } else if (key === "o") {
      e.preventDefault();
      void openProject();
    } else if (key === "f") {
      e.preventDefault();
      searchOpen.set(true);
    } else if (key === "h") {
      e.preventDefault();
      replaceOpen.set(true);
    } else if (key === "e") {
      e.preventDefault();
      exportOpen.set(true);
    } else if (key === "1" || key === "2" || key === "3") {
      e.preventDefault();
      mainView.set(key === "1" ? "timeline" : key === "2" ? "manuscript" : "cast");
    } else if (key === "\\") {
      e.preventDefault();
      sidePanel.update((p) => (p ? null : "characters"));
    }
  }
</script>

<svelte:window on:keydown|capture={onKeydown} />

{#if $loading}
  <div class="center">Loading project…</div>
{:else if $error}
  <div class="center error">Error: {$error}</div>
{:else if $project}
  <div class="shell">
    {#if !$focusMode}
      <TopBar />
    {/if}

    <div class="body">
      <main class="main">
        {#if $mainView === "cast"}
          <CastView />
        {:else if $mainView === "timeline"}
          {#if !formatOf($project).views.timeline}
            <FormatNotReady view="Timeline" />
          {:else if $project.story_format === "comic"}
            <ComicTimeline />
          {:else if $project.story_format === "screenplay"}
            <ScreenplayTimeline />
          {:else if $project.story_format === "game"}
            <GameTimeline />
          {:else}
            <TimelineView />
          {/if}
        {:else if !formatOf($project).views.manuscript}
          <FormatNotReady view="Manuscript" />
        {:else if $project.story_format === "comic"}
          <ComicManuscript />
        {:else if $project.story_format === "screenplay"}
          <ScreenplayManuscript />
        {:else if $project.story_format === "game"}
          <GameManuscript />
        {:else}
          <ManuscriptView />
        {/if}
      </main>

      {#if $sidePanel && !$focusMode}
        <SidePanel />
      {/if}
    </div>

    {#if $focusMode}
      <button class="exit-focus" on:click={() => focusMode.set(false)} title="Leave focus mode (Esc)">
        Leave focus mode · Esc
      </button>
    {:else}
      <StatusBar />
    {/if}

    {#if $searchOpen}
      <SearchDialog />
    {/if}

    {#if $snapshotsOpen}
      <SnapshotsDialog />
    {/if}

    {#if $exportOpen}
      <ExportDialog />
    {/if}

    {#if $replaceOpen}
      <ReplaceDialog />
    {/if}

    {#if $reportsOpen}
      <ReportsDialog />
    {/if}

    {#if $gameCheckOpen}
      <GameCheckDialog />
    {/if}

    {#if $galleryOpen}
      <ThemeGallery />
    {/if}

    {#if $themesOpen}
      <ThemesDialog />
    {/if}
  </div>
{/if}

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .main {
    flex: 1;
    min-width: 0;
    overflow: auto;
    background: var(--bg);
  }

  .exit-focus {
    position: fixed;
    top: 0.6rem;
    right: 0.8rem;
    z-index: 50;
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    font-size: 0.72rem;
    color: var(--text-muted);
    background: var(--bg-panel);
    border: 1px solid var(--border);
    opacity: 0.35;
    transition: opacity 0.15s;
  }

  .exit-focus:hover,
  .exit-focus:focus-visible {
    opacity: 1;
  }

  .center {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--text-muted);
  }

  .error {
    color: var(--danger);
  }
</style>
