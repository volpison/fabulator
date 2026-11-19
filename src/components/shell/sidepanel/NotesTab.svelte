<script lang="ts">
  import { updateNote } from "../../../lib/app/stores/notes";
  import { stringToTraits } from "../../../lib/model/traits";
  import type { Project } from "../../../lib/model/types";

  export let editingId: string | null;
  /** Ask first, then delete (kept in SidePanel, which knows which panel is open). */
  export let onDelete: (id: string, label: string) => void;
  export let project: Project;
</script>

{#each project.notes as note (note.id)}
  <div class="card" id="card-{note.id}" class:editing={editingId === note.id}>
    <button class="card-head" on:click={() => (editingId = editingId === note.id ? null : note.id)}>
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
