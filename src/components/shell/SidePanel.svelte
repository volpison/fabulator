<script lang="ts">
  import { tick } from "svelte";
  import { platform } from "../../lib/platform";
  import { clampPanelWidth, PANEL_DEFAULT } from "../../lib/app/layout";
  import {
    addAbility,
    addCharacter,
    addPlace,
    deleteAbility,
    deleteCharacter,
    deletePlace,
  } from "../../lib/app/stores/cast";
  import { project } from "../../lib/app/stores/core";
  import {
    addGameVariable,
    deleteGameItem,
    deleteGameVariable,
  } from "../../lib/app/stores/game";
  import { addNote, deleteNote } from "../../lib/app/stores/notes";
  import { sidePanel, sidePanelFocus } from "../../lib/app/stores/ui";
  import AbilitiesTab from "./sidepanel/AbilitiesTab.svelte";
  import CharactersTab from "./sidepanel/CharactersTab.svelte";
  import NotesTab from "./sidepanel/NotesTab.svelte";
  import PlacesTab from "./sidepanel/PlacesTab.svelte";
  import StateTab from "./sidepanel/StateTab.svelte";

  // ─── Resizable width (drag the left edge, or focus it and use ←/→; double-click resets) ───
  const WIDTH_KEY = "fabulator.sidePanelWidth";
  let width = loadWidth();
  let resizing = false;

  function loadWidth(): number {
    try {
      return clampPanelWidth(Number(localStorage.getItem(WIDTH_KEY)) || PANEL_DEFAULT, window.innerWidth);
    } catch {
      return PANEL_DEFAULT;
    }
  }

  function setWidth(w: number, persist: boolean) {
    width = clampPanelWidth(w, window.innerWidth);
    if (!persist) return;
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* a remembered width is a convenience only */
    }
  }

  function startResize(e: PointerEvent) {
    resizing = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onResizeMove(e: PointerEvent) {
    if (resizing) setWidth(window.innerWidth - e.clientX, false);
  }

  function endResize() {
    if (!resizing) return;
    resizing = false;
    setWidth(width, true);
  }

  function onResizeKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 60 : 20;
    if (e.key === "ArrowLeft") setWidth(width + step, true);
    else if (e.key === "ArrowRight") setWidth(width - step, true);
    else if (e.key === "Home") setWidth(PANEL_DEFAULT, true);
    else return;
    e.preventDefault();
  }

  /** Which item is expanded for editing (id), or null. */
  let editingId: string | null = null;

  // Opened from a search result: expand that card and scroll it into view.
  $: if ($sidePanelFocus) focusCard($sidePanelFocus);

  async function focusCard(id: string) {
    editingId = id;
    sidePanelFocus.set(null);
    await tick();
    document.getElementById(`card-${id}`)?.scrollIntoView({ block: "nearest" });
  }

  function onAdd() {
    if ($sidePanel === "characters") {
      const id = addCharacter();
      editingId = id;
    } else if ($sidePanel === "places") {
      const id = addPlace();
      editingId = id;
    } else if ($sidePanel === "abilities") {
      const id = addAbility();
      editingId = id;
    } else if ($sidePanel === "state") {
      const id = addGameVariable("flag");
      editingId = id;
    } else if ($sidePanel === "notes") {
      const id = addNote();
      editingId = id;
    }
  }

  async function onDelete(id: string, label: string) {
    const panel = $sidePanel; // the panel could change while the dialog is open
    const ok = await platform().confirm(`Delete “${label}”?`, {
      title: "Delete",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    if (panel === "characters") deleteCharacter(id);
    else if (panel === "places") deletePlace(id);
    else if (panel === "abilities") deleteAbility(id);
    else if (panel === "state") {
      if ($project?.game?.items.some((i) => i.id === id)) deleteGameItem(id);
      else deleteGameVariable(id);
    }
    else if (panel === "notes") deleteNote(id);
    if (editingId === id) editingId = null;
  }
</script>

<aside class="panel" style="width: {width}px">
  <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
  <div
    class="resize"
    class:active={resizing}
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize panel"
    aria-valuenow={width}
    tabindex="0"
    title="Drag to resize · double-click to reset"
    on:pointerdown={startResize}
    on:pointermove={onResizeMove}
    on:pointerup={endResize}
    on:pointercancel={endResize}
    on:dblclick={() => setWidth(PANEL_DEFAULT, true)}
    on:keydown={onResizeKey}
  ></div>
  <header class="panel-header">
    <span>
      {#if $sidePanel === "characters"}
        Characters
      {:else if $sidePanel === "places"}
        Places
      {:else if $sidePanel === "abilities"}
        Abilities
      {:else if $sidePanel === "state"}
        State
      {:else if $sidePanel === "notes"}
        Notes
      {/if}
    </span>
    <button class="add-btn" on:click={onAdd} title="Add new">+ Add</button>
  </header>

  <div class="panel-body">
    {#if $sidePanel === "characters" && $project}
      <CharactersTab project={$project} bind:editingId {onDelete} />
    {:else if $sidePanel === "places" && $project}
      <PlacesTab project={$project} bind:editingId {onDelete} />
    {:else if $sidePanel === "abilities" && $project}
      <AbilitiesTab project={$project} bind:editingId {onDelete} />
    {:else if $sidePanel === "state" && $project?.game}
      <StateTab game={$project.game} bind:editingId {onDelete} />
    {:else if $sidePanel === "notes" && $project}
      <NotesTab project={$project} bind:editingId {onDelete} />
    {/if}
  </div>
</aside>

<style>
  .panel {
    position: relative;
    min-height: 0; /* lets the list inside scroll instead of growing past the window */
    flex-shrink: 0;
    border-left: 1px solid var(--border);
    background: var(--bg-panel);
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    padding: 0.65rem 0.85rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .add-btn {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    color: var(--accent);
    padding: 0.2rem 0.45rem;
    border-radius: 4px;
  }

  .add-btn:hover {
    background: var(--accent-soft);
  }

  .resize {
    position: absolute;
    left: -3px;
    top: 0;
    bottom: 0;
    width: 7px;
    z-index: 5;
    cursor: col-resize;
    touch-action: none;
  }

  .resize:hover,
  .resize.active,
  .resize:focus-visible {
    background: var(--accent);
    opacity: 0.55;
    outline: none;
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  /* the + Flag / + Number / + Item buttons inside the State tab (a child component) */
  .panel-body :global(.add-btn) {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    padding: 0.2rem 0.45rem;
    border-radius: 4px;
  }

  .panel-body :global(.add-btn:hover) {
    background: var(--accent-soft);
  }

  .panel-body :global(.card) {
    flex-shrink: 0; /* never squash a card; the list scrolls instead */
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .panel-body :global(.card.editing) {
    border-color: var(--accent);
  }

  .panel-body :global(.card-head) {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.7rem 0.75rem;
    cursor: pointer;
  }

  .panel-body :global(.card-head:hover) {
    background: var(--bg-sidebar);
  }

  .panel-body :global(.card-title) {
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: 0.1rem;
  }

  .panel-body :global(.card-meta) {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .panel-body :global(.card-desc) {
    padding: 0 0.75rem 0.7rem;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--text);
  }

  .panel-body :global(.form) {
    padding: 0 0.75rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border-top: 1px solid var(--border);
    padding-top: 0.65rem;
  }

  .panel-body :global(.form label) {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted);
  }

  .panel-body :global(.form input),
  .panel-body :global(.form textarea) {
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.35rem 0.5rem;
    background: var(--bg-panel);
    outline: none;
    resize: vertical;
  }

  .panel-body :global(.form input:focus),
  .panel-body :global(.form textarea:focus) {
    border-color: var(--accent);
  }

  .panel-body :global(.form fieldset.abilities) {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.4rem 0.6rem 0.5rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .panel-body :global(.form fieldset.abilities legend) {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted);
    padding: 0 0.25rem;
  }

  .panel-body :global(.form label.check) {
    flex-direction: row;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text);
  }

  .panel-body :global(.form label.check input) {
    padding: 0;
    margin: 0;
  }

  .panel-body :global(.hint) {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .panel-body :global(.group-title) {
    margin: 0.75rem 0 0.35rem;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .panel-body :global(.form-actions.start) {
    justify-content: flex-start;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .panel-body :global(.form-actions) {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  .panel-body :global(.danger) {
    font-size: 0.75rem;
    color: var(--danger);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .panel-body :global(.danger:hover) {
    background: var(--danger-bg);
  }
</style>
