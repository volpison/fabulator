<script lang="ts">
  import Appearances from "../Appearances.svelte";
  import { updatePlace } from "../../../lib/app/stores/cast";
  import { stringToTraits, traitsToString } from "../../../lib/model/traits";
  import type { Project } from "../../../lib/model/types";

  export let editingId: string | null;
  /** Ask first, then delete (kept in SidePanel, which knows which panel is open). */
  export let onDelete: (id: string, label: string) => void;
  export let project: Project;
</script>

{#each project.places as place (place.id)}
  <div class="card" id="card-{place.id}" class:editing={editingId === place.id}>
    <button class="card-head" on:click={() => (editingId = editingId === place.id ? null : place.id)}>
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
