<script lang="ts">
  import { tick } from "svelte";
  import { platform } from "../lib/platform";
  import Appearances from "./Appearances.svelte";
  import { clampPanelWidth, PANEL_DEFAULT } from "../lib/layout";
  import {
    project,
    sidePanel,
    sidePanelFocus,
    updateCharacter,
    addCharacter,
    deleteCharacter,
    updatePlace,
    addPlace,
    deletePlace,
    updateNote,
    addNote,
    deleteNote,
  } from "../lib/stores";

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

  function toggleEdit(id: string) {
    editingId = editingId === id ? null : id;
  }

  function traitsToString(traits: string[]): string {
    return traits.join(", ");
  }

  function stringToTraits(value: string): string[] {
    return value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function onAdd() {
    if ($sidePanel === "characters") {
      const id = addCharacter();
      editingId = id;
    } else if ($sidePanel === "places") {
      const id = addPlace();
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
      {:else if $sidePanel === "notes"}
        Notes
      {/if}
    </span>
    <button class="add-btn" on:click={onAdd} title="Add new">+ Add</button>
  </header>

  <div class="panel-body">
    {#if $sidePanel === "characters" && $project}
      {#each $project.characters as char (char.id)}
        <div class="card" id="card-{char.id}" class:editing={editingId === char.id}>
          <button class="card-head" on:click={() => toggleEdit(char.id)}>
            <div class="card-title">{char.name || "Untitled"}</div>
            <div class="card-meta">
              {[char.role, char.category].filter(Boolean).join(" · ") || "—"}
            </div>
          </button>

          {#if editingId === char.id}
            <div class="form">
              <label>
                Name
                <input
                  type="text"
                  value={char.name}
                  on:input={(e) =>
                    updateCharacter(char.id, {
                      name: e.currentTarget.value,
                    })}
                />
              </label>
              <label>
                Aliases (comma-separated)
                <input
                  type="text"
                  placeholder="nicknames, titles, other spellings…"
                  value={traitsToString(char.aliases)}
                  on:input={(e) =>
                    updateCharacter(char.id, {
                      aliases: stringToTraits(e.currentTarget.value),
                    })}
                />
              </label>
              <label>
                Role
                <input
                  type="text"
                  value={char.role}
                  on:input={(e) =>
                    updateCharacter(char.id, {
                      role: e.currentTarget.value,
                    })}
                />
              </label>
              <label>
                Category
                <input
                  type="text"
                  value={char.category}
                  on:input={(e) =>
                    updateCharacter(char.id, {
                      category: e.currentTarget.value,
                    })}
                />
              </label>
              <label>
                Description
                <textarea
                  rows="2"
                  value={char.description}
                  on:input={(e) =>
                    updateCharacter(char.id, {
                      description: e.currentTarget.value,
                    })}
                ></textarea>
              </label>
              <label>
                Traits (comma-separated)
                <input
                  type="text"
                  value={traitsToString(char.traits)}
                  on:input={(e) =>
                    updateCharacter(char.id, {
                      traits: stringToTraits(e.currentTarget.value),
                    })}
                />
              </label>
              <label>
                Notes
                <textarea
                  rows="3"
                  value={char.notes}
                  on:input={(e) =>
                    updateCharacter(char.id, {
                      notes: e.currentTarget.value,
                    })}
                ></textarea>
              </label>
              <Appearances type="character" id={char.id} />
              <div class="form-actions">
                <button class="danger" on:click={() => onDelete(char.id, char.name)}>
                  Delete
                </button>
              </div>
            </div>
          {:else if char.description}
            <div class="card-desc">{char.description}</div>
          {/if}
        </div>
      {/each}
    {:else if $sidePanel === "places" && $project}
      {#each $project.places as place (place.id)}
        <div class="card" id="card-{place.id}" class:editing={editingId === place.id}>
          <button class="card-head" on:click={() => toggleEdit(place.id)}>
            <div class="card-title">{place.name || "Untitled"}</div>
            <div class="card-meta">{place.location || "—"}</div>
          </button>

          {#if editingId === place.id}
            <div class="form">
              <label>
                Name
                <input
                  type="text"
                  value={place.name}
                  on:input={(e) =>
                    updatePlace(place.id, { name: e.currentTarget.value })}
                />
              </label>
              <label>
                Aliases (comma-separated)
                <input
                  type="text"
                  placeholder="other names the text uses for it…"
                  value={traitsToString(place.aliases)}
                  on:input={(e) =>
                    updatePlace(place.id, {
                      aliases: stringToTraits(e.currentTarget.value),
                    })}
                />
              </label>
              <label>
                Location
                <input
                  type="text"
                  value={place.location}
                  on:input={(e) =>
                    updatePlace(place.id, {
                      location: e.currentTarget.value,
                    })}
                />
              </label>
              <label>
                Description
                <textarea
                  rows="2"
                  value={place.description}
                  on:input={(e) =>
                    updatePlace(place.id, {
                      description: e.currentTarget.value,
                    })}
                ></textarea>
              </label>
              <label>
                Notes
                <textarea
                  rows="2"
                  value={place.notes}
                  on:input={(e) =>
                    updatePlace(place.id, { notes: e.currentTarget.value })}
                ></textarea>
              </label>
              <Appearances type="place" id={place.id} />
              <div class="form-actions">
                <button
                  class="danger"
                  on:click={() => onDelete(place.id, place.name)}
                >
                  Delete
                </button>
              </div>
            </div>
          {:else if place.description}
            <div class="card-desc">{place.description}</div>
          {/if}
        </div>
      {/each}
    {:else if $sidePanel === "notes" && $project}
      {#each $project.notes as note (note.id)}
        <div class="card" id="card-{note.id}" class:editing={editingId === note.id}>
          <button class="card-head" on:click={() => toggleEdit(note.id)}>
            <div class="card-title">{note.title || "Untitled"}</div>
          </button>

          {#if editingId === note.id}
            <div class="form">
              <label>
                Title
                <input
                  type="text"
                  value={note.title}
                  on:input={(e) =>
                    updateNote(note.id, { title: e.currentTarget.value })}
                />
              </label>
              <label>
                Content
                <textarea
                  rows="5"
                  value={note.content}
                  on:input={(e) =>
                    updateNote(note.id, { content: e.currentTarget.value })}
                ></textarea>
              </label>
              <label>
                Tags (comma-separated)
                <input
                  type="text"
                  value={note.tags.join(", ")}
                  on:input={(e) =>
                    updateNote(note.id, {
                      tags: stringToTraits(e.currentTarget.value),
                    })}
                />
              </label>
              <div class="form-actions">
                <button
                  class="danger"
                  on:click={() => onDelete(note.id, note.title)}
                >
                  Delete
                </button>
              </div>
            </div>
          {:else if note.content}
            <div class="card-desc">{note.content}</div>
          {/if}
        </div>
      {/each}
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

  .card {
    flex-shrink: 0; /* never squash a card; the list scrolls instead */
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .card.editing {
    border-color: var(--accent);
  }

  .card-head {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.7rem 0.75rem;
    cursor: pointer;
  }

  .card-head:hover {
    background: var(--bg-sidebar);
  }

  .card-title {
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: 0.1rem;
  }

  .card-meta {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .card-desc {
    padding: 0 0.75rem 0.7rem;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--text);
  }

  .form {
    padding: 0 0.75rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border-top: 1px solid var(--border);
    padding-top: 0.65rem;
  }

  .form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted);
  }

  .form input,
  .form textarea {
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

  .form input:focus,
  .form textarea:focus {
    border-color: var(--accent);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  .danger {
    font-size: 0.75rem;
    color: var(--danger);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .danger:hover {
    background: var(--danger-bg);
  }
</style>
