<script lang="ts">
  import { updateAbility } from "../../../lib/app/stores/cast";
  import { stringToTraits, traitsToString } from "../../../lib/model/traits";
  import type { Project } from "../../../lib/model/types";

  export let editingId: string | null;
  /** Ask first, then delete (kept in SidePanel, which knows which panel is open). */
  export let onDelete: (id: string, label: string) => void;
  export let project: Project;
</script>

{#each project.abilities as ability (ability.id)}
  {@const holders = project.characters.filter((c) => (c.ability_ids ?? []).includes(ability.id))}
  <div class="card" id="card-{ability.id}" class:editing={editingId === ability.id}>
    <button class="card-head" on:click={() => (editingId = editingId === ability.id ? null : ability.id)}>
      <div class="card-title">{ability.name || "Untitled"}</div>
      <div class="card-meta">{holders.map((c) => c.name).join(", ") || "Nobody yet"}</div>
    </button>

    {#if editingId === ability.id}
      <div class="form">
        <label>
          Name
          <input
            type="text"
            value={ability.name}
            on:input={(e) => updateAbility(ability.id, { name: e.currentTarget.value })}
          />
        </label>
        <label>
          Aliases (comma-separated)
          <input
            type="text"
            placeholder="other names the text uses for it…"
            value={traitsToString(ability.aliases)}
            on:input={(e) =>
              updateAbility(ability.id, {
                aliases: stringToTraits(e.currentTarget.value),
              })}
          />
        </label>
        <label>
          Description
          <textarea
            rows="3"
            value={ability.description}
            on:input={(e) => updateAbility(ability.id, { description: e.currentTarget.value })}
          ></textarea>
        </label>
        <label>
          Notes
          <textarea
            rows="2"
            value={ability.notes}
            on:input={(e) => updateAbility(ability.id, { notes: e.currentTarget.value })}
          ></textarea>
        </label>
        <p class="hint">Give it to a character from that character's card.</p>
        <div class="form-actions">
          <button class="danger" on:click={() => onDelete(ability.id, ability.name)}>Delete</button>
        </div>
      </div>
    {:else if ability.description}
      <div class="card-desc">{ability.description}</div>
    {/if}
  </div>
{/each}
