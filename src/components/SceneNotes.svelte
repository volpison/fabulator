<script lang="ts">
  import { selectedScene, focusMode, updateSceneFields, uid } from "../lib/stores";
  import type { SceneTodo } from "../lib/types";
  import { addTodoTo, toggleTodoIn, editTodoIn, removeTodoFrom, clearDone, todoCounts, summaryLine } from "../lib/scenenotes";

  const KEY = "fabulator.sceneNotesOpen";
  let open = (() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  })();
  function toggle() {
    open = !open;
    try {
      localStorage.setItem(KEY, open ? "1" : "0");
    } catch {
      /* private window etc.: fine */
    }
  }

  let draft = "";
  let editingId: string | null = null;
  let editDraft = "";

  $: scene = $selectedScene;
  $: counts = todoCounts(scene?.todos ?? []);
  $: summary = scene ? summaryLine(scene.notes, scene.todos) : "";

  function setNotes(e: Event) {
    if (scene) updateSceneFields(scene.id, { notes: (e.currentTarget as HTMLTextAreaElement).value });
  }
  function setTodos(todos: SceneTodo[]) {
    if (scene) updateSceneFields(scene.id, { todos });
  }
  function add() {
    if (!scene) return;
    setTodos(addTodoTo(scene.todos, uid("td"), draft));
    draft = "";
  }
  function startEdit(id: string, text: string) {
    editingId = id;
    editDraft = text;
  }
  function commitEdit() {
    if (!scene || editingId === null) return;
    const id = editingId;
    editingId = null;
    setTodos(editTodoIn(scene.todos, id, editDraft));
  }
  function focusSelect(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

{#if scene && !$focusMode}
  <section class="notes" class:open aria-label="Scene notes and to-dos">
    <button type="button" class="bar" aria-expanded={open} on:click={toggle}>
      <span class="chev">{open ? "▾" : "▸"}</span>
      <span class="title">Notes &amp; to-dos</span>
      {#if summary}<span class="sum" class:pending={counts.open > 0}>{summary}</span>{/if}
    </button>

    {#if open}
      {#key scene.id}
        <div class="body">
          <label class="col">
            <span class="cap">Private notes <em>(not exported)</em></span>
            <textarea rows="6" placeholder="Reminders, research, things to fix later…" value={scene.notes} on:input={setNotes}></textarea>
          </label>

          <div class="col">
            <span class="cap">
              To-do {#if counts.total > 0}· {counts.done}/{counts.total} done{/if}
              {#if counts.done > 0}
                <button type="button" class="link" on:click={() => setTodos(clearDone(scene.todos))}>Clear done</button>
              {/if}
            </span>
            <ul>
              {#each scene.todos as t (t.id)}
                <li class:done={t.done}>
                  <input type="checkbox" checked={t.done} aria-label="Done: {t.text}" on:change={() => setTodos(toggleTodoIn(scene.todos, t.id))} />
                  {#if editingId === t.id}
                    <input
                      class="edit"
                      type="text"
                      bind:value={editDraft}
                      use:focusSelect
                      on:keydown={(e) => (e.key === "Enter" ? commitEdit() : e.key === "Escape" && (editingId = null))}
                      on:blur={commitEdit}
                    />
                  {:else}
                    <span
                      class="text"
                      role="button"
                      tabindex="0"
                      title="Double-click to edit"
                      on:dblclick={() => startEdit(t.id, t.text)}
                      on:keydown={(e) => (e.key === "F2" || e.key === "Enter") && startEdit(t.id, t.text)}>{t.text}</span
                    >
                    <button type="button" class="x" title="Delete to-do" aria-label="Delete to-do: {t.text}" on:click={() => setTodos(removeTodoFrom(scene.todos, t.id))}>✕</button>
                  {/if}
                </li>
              {/each}
            </ul>
            <input
              class="add"
              type="text"
              placeholder="Add a to-do and press Enter"
              bind:value={draft}
              on:keydown={(e) => e.key === "Enter" && add()}
            />
          </div>
        </div>
      {/key}
    {/if}
  </section>
{/if}

<style>
  .notes {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--bg-panel);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.35rem 1.75rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: left;
  }
  .bar:hover { color: var(--text); }
  .title { font-weight: 600; }
  .sum { font-size: 0.7rem; }
  .sum.pending { color: #b45309; font-weight: 600; }
  .body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    padding: 0.25rem 1.75rem 0.85rem;
    max-height: 260px;
    overflow-y: auto;
  }
  .col { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
  .cap { font-size: 0.68rem; font-weight: 600; color: var(--text-muted); display: flex; gap: 0.5rem; align-items: baseline; }
  .cap em { font-weight: 400; }
  textarea, .add, .edit {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.35rem 0.5rem;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  textarea { resize: vertical; min-height: 4rem; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; }
  li { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; }
  li.done .text { text-decoration: line-through; color: var(--text-muted); }
  .text { flex: 1; min-width: 0; overflow-wrap: anywhere; cursor: text; }
  .edit { flex: 1; min-width: 0; padding: 0.1rem 0.3rem; }
  .x, .link { font-size: 0.68rem; color: var(--text-muted); padding: 0.05rem 0.3rem; border-radius: 4px; }
  .x:hover, .link:hover { background: var(--bg-sidebar); color: var(--text); }
  @media (max-width: 800px) { .body { grid-template-columns: 1fr; } }
</style>
