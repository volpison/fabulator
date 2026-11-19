<script lang="ts">
  import Appearances from "../Appearances.svelte";
  import { updateCharacter } from "../../../lib/app/stores/cast";
  import { stringToTraits, traitsToString } from "../../../lib/model/traits";
  import type { Project } from "../../../lib/model/types";

  export let editingId: string | null;
  /** Ask first, then delete (kept in SidePanel, which knows which panel is open). */
  export let onDelete: (id: string, label: string) => void;
  export let project: Project;

  /** Give a character an ability, or take it away. */
  function setAbility(charId: string, abilityId: string, on: boolean) {
    const current = project.characters.find((c) => c.id === charId)?.ability_ids ?? [];
    const next = on ? [...current.filter((i) => i !== abilityId), abilityId] : current.filter((i) => i !== abilityId);
    updateCharacter(charId, { ability_ids: next });
  }
</script>

{#each project.characters as char (char.id)}
  <div class="card" id="card-{char.id}" class:editing={editingId === char.id}>
    <button class="card-head" on:click={() => (editingId = editingId === char.id ? null : char.id)}>
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
        {#if project.abilities.length > 0}
          <fieldset class="abilities">
            <legend>Abilities</legend>
            {#each project.abilities as ab (ab.id)}
              <label class="check">
                <input
                  type="checkbox"
                  checked={(char.ability_ids ?? []).includes(ab.id)}
                  on:change={(e) => setAbility(char.id, ab.id, e.currentTarget.checked)}
                />
                {ab.name || "Untitled"}
              </label>
            {/each}
          </fieldset>
        {/if}
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
