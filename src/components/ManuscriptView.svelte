<script lang="ts">
  import {
    project,
    selectedScene,
    selectedSceneId,
    sceneHighlight,
    snapshotsOpen,
    focusMode,
    updateSceneContent,
    updateSceneTitle,
    updateSceneSummary,
    linkCharacterToScene,
    unlinkCharacterFromScene,
    linkPlaceToScene,
    unlinkPlaceFromScene,
    moveScene,
  } from "../lib/stores";
  import type { Scene, Character, Place } from "../lib/types";
  import { readingOrder, chapterNumber, sceneDropTarget } from "../lib/model";
  import RichTextEditor from "./RichTextEditor.svelte";
  import { stats } from "../lib/goalsStore";
  import { formatCount } from "../lib/wordcount";
  import SceneLabels from "./SceneLabels.svelte";
  import {
    entitiesOf,
    findUnlinkedMentions,
    type EntityType,
    type MentionInfo,
    type MentionSuggestion,
  } from "../lib/mentions";

  /** Dismissed suggestion keys for this session: "sceneId:type:entityId" */
  let dismissed = new Set<string>();

  function selectScene(id: string) {
    selectedSceneId.set(id);
  }

  // ─── Reordering scenes in the list ───
  let dragId: string | null = null;
  let overId: string | null = null;
  let overAfter = false;

  function onDragStart(id: string, e: DragEvent) {
    dragId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }

  function onDragOver(id: string, e: DragEvent) {
    if (!dragId || !$project) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    // Only show a drop line where a drop would change something.
    if (!sceneDropTarget($project, dragId, id, after)) {
      overId = null;
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    overId = id;
    overAfter = after;
  }

  function endDrag() {
    dragId = null;
    overId = null;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    if (dragId && overId && $project) {
      const target = sceneDropTarget($project, dragId, overId, overAfter);
      if (target) moveScene(dragId, target);
    }
    endDrag();
  }

  /** Alt+Up / Alt+Down moves the scene one step in reading order. */
  function onItemKey(scene: Scene, e: KeyboardEvent) {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown") || !$project) return;
    e.preventDefault();
    const list = readingOrder($project);
    const i = list.findIndex((s) => s.id === scene.id);
    const up = e.key === "ArrowUp";
    const other = list[i + (up ? -1 : 1)];
    if (!other) return;
    const target = sceneDropTarget($project, scene.id, other.id, !up);
    if (target) moveScene(scene.id, target);
    // The list re-renders in the new order; keep keyboard focus on the moved scene.
    const id = scene.id;
    requestAnimationFrame(() => document.getElementById(`scene-item-${id}`)?.focus());
  }

  function scenesSorted(): Scene[] {
    if (!$project) return [];
    return readingOrder($project);
  }

  function onTitleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    if ($selectedSceneId) {
      updateSceneTitle($selectedSceneId, target.value);
    }
  }

  function onSummaryInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    if ($selectedSceneId) {
      updateSceneSummary($selectedSceneId, target.value);
    }
  }

  function onBodyUpdate(html: string) {
    if ($selectedSceneId) {
      updateSceneContent($selectedSceneId, html);
    }
  }


  function linkedCharacters(scene: Scene): Character[] {
    if (!$project) return [];
    return scene.character_ids
      .map((id) => $project!.characters.find((c) => c.id === id))
      .filter((c): c is Character => !!c);
  }

  function linkedPlaces(scene: Scene): Place[] {
    if (!$project) return [];
    return scene.place_ids
      .map((id) => $project!.places.find((p) => p.id === id))
      .filter((p): p is Place => !!p);
  }

  function availableCharacters(scene: Scene): Character[] {
    if (!$project) return [];
    return $project.characters.filter(
      (c) => !scene.character_ids.includes(c.id)
    );
  }

  function availablePlaces(scene: Scene): Place[] {
    if (!$project) return [];
    return $project.places.filter((p) => !scene.place_ids.includes(p.id));
  }

  function onAddCharacter(e: Event, sceneId: string) {
    const select = e.currentTarget as HTMLSelectElement;
    const id = select.value;
    if (id) {
      linkCharacterToScene(sceneId, id);
      select.value = "";
    }
  }

  function onAddPlace(e: Event, sceneId: string) {
    const select = e.currentTarget as HTMLSelectElement;
    const id = select.value;
    if (id) {
      linkPlaceToScene(sceneId, id);
      select.value = "";
    }
  }

  function suggestionKey(sceneId: string, s: MentionSuggestion): string {
    return `${sceneId}:${s.type}:${s.id}`;
  }

  function acceptSuggestion(sceneId: string, s: MentionSuggestion) {
    if (s.type === "character") {
      linkCharacterToScene(sceneId, s.id);
    } else {
      linkPlaceToScene(sceneId, s.id);
    }
  }

  function dismissSuggestion(sceneId: string, s: MentionSuggestion) {
    dismissed = new Set(dismissed).add(suggestionKey(sceneId, s));
  }

  function dismissAll(sceneId: string, list: MentionSuggestion[]) {
    const next = new Set(dismissed);
    for (const s of list) next.add(suggestionKey(sceneId, s));
    dismissed = next;
  }

  $: highlightTerms =
    $sceneHighlight && $selectedScene && $sceneHighlight.sceneId === $selectedScene.id
      ? $sceneHighlight.terms
      : [];

  $: entities = $project ? entitiesOf($project) : [];

  function describeMention(type: EntityType, id: string): MentionInfo | null {
    if (!$project) return null;
    if (type === "character") {
      const c = $project.characters.find((x) => x.id === id);
      if (!c) return null;
      return {
        title: c.name,
        subtitle: [c.role, c.category].filter(Boolean).join(" · "),
        body: c.description,
        chips: c.traits,
        aka: c.aliases,
      };
    }
    const p = $project.places.find((x) => x.id === id);
    if (!p) return null;
    return {
      title: p.name,
      subtitle: p.location,
      body: p.description,
      aka: p.aliases,
    };
  }

  $: wordCount = $selectedScene ? ($stats.byScene.get($selectedScene.id) ?? 0) : 0;

  $: suggestions =
    $selectedScene && $project
      ? findUnlinkedMentions(
          $selectedScene.content,
          $selectedScene,
          $project
        ).filter((s) => !dismissed.has(suggestionKey($selectedScene!.id, s)))
      : [];
</script>

<div class="manuscript">
  {#if !$focusMode}
  <aside class="scene-list">
    <div class="list-header">Scenes</div>
    {#each scenesSorted() as scene (scene.id)}
      <button
        id="scene-item-{scene.id}"
        class="scene-item"
        class:active={$selectedSceneId === scene.id}
        class:dragging={dragId === scene.id}
        class:drop-before={overId === scene.id && !overAfter}
        class:drop-after={overId === scene.id && overAfter}
        draggable="true"
        title="Drag to reorder · Alt+↑/↓ moves the scene"
        on:click={() => selectScene(scene.id)}
        on:dragstart={(e) => onDragStart(scene.id, e)}
        on:dragover={(e) => onDragOver(scene.id, e)}
        on:drop={onDrop}
        on:dragend={endDrag}
        on:keydown={(e) => onItemKey(scene, e)}
      >
        <span class="ch">Ch {$project ? chapterNumber($project, scene) : "?"}</span>
        <span class="name">{scene.title || "Untitled"}</span>
        <span class="links-hint">
          {formatCount($stats.byScene.get(scene.id) ?? 0)} w
          {#if scene.character_ids.length}· {scene.character_ids.length} char{/if}
          {#if scene.place_ids.length}· {scene.place_ids.length} place{/if}
        </span>
      </button>
    {/each}
  </aside>
  {/if}

  <section class="editor">
    {#if $selectedScene}
      <header class="editor-header">
        <input
          class="title-input"
          type="text"
          value={$selectedScene.title}
          on:input={onTitleInput}
          placeholder="Scene title"
        />
        <textarea
          class="summary-input"
          value={$selectedScene.summary}
          on:input={onSummaryInput}
          placeholder="Short synopsis / summary…"
          rows="2"
        ></textarea>
        <div class="meta">
          <SceneLabels scene={$selectedScene} />
          <span>{formatCount(wordCount)} word{wordCount === 1 ? "" : "s"}</span>
          <button
            type="button"
            class="snap-btn"
            title="Saved versions of this scene"
            on:click={() => snapshotsOpen.set(true)}
          >
            Snapshots
          </button>
          {#if highlightTerms.length > 0}
            <button
              type="button"
              class="hl-chip"
              title="Stop highlighting search results"
              on:click={() => sceneHighlight.set(null)}
            >
              Highlighting “{highlightTerms.join(" ")}” ✕
            </button>
          {/if}
        </div>

        <!-- Cast & Setting -->
        <div class="links">
          <div class="link-row">
            <span class="link-label">Characters</span>
            <div class="chips">
              {#each linkedCharacters($selectedScene) as char (char.id)}
                <span class="chip char">
                  {char.name}
                  <button
                    type="button"
                    class="chip-x"
                    title="Remove from scene"
                    on:click={() =>
                      unlinkCharacterFromScene($selectedScene.id, char.id)}
                  >
                    ×
                  </button>
                </span>
              {/each}
              {#if availableCharacters($selectedScene).length > 0}
                <select
                  class="add-select"
                  on:change={(e) => onAddCharacter(e, $selectedScene.id)}
                >
                  <option value="">+ Add…</option>
                  {#each availableCharacters($selectedScene) as c}
                    <option value={c.id}>{c.name}</option>
                  {/each}
                </select>
              {:else if $project && $project.characters.length === 0}
                <span class="empty-hint"
                  >No characters yet — add some in the side panel</span
                >
              {/if}
            </div>
          </div>

          <div class="link-row">
            <span class="link-label">Places</span>
            <div class="chips">
              {#each linkedPlaces($selectedScene) as place (place.id)}
                <span class="chip place">
                  {place.name}
                  <button
                    type="button"
                    class="chip-x"
                    title="Remove from scene"
                    on:click={() =>
                      unlinkPlaceFromScene($selectedScene.id, place.id)}
                  >
                    ×
                  </button>
                </span>
              {/each}
              {#if availablePlaces($selectedScene).length > 0}
                <select
                  class="add-select"
                  on:change={(e) => onAddPlace(e, $selectedScene.id)}
                >
                  <option value="">+ Add…</option>
                  {#each availablePlaces($selectedScene) as p}
                    <option value={p.id}>{p.name}</option>
                  {/each}
                </select>
              {:else if $project && $project.places.length === 0}
                <span class="empty-hint"
                  >No places yet — add some in the side panel</span
                >
              {/if}
            </div>
          </div>
        </div>
      </header>

      <!-- Auto-link suggestions -->
      {#if suggestions.length > 0}
        <div class="suggest-bar">
          <span class="suggest-label">Mentioned in text:</span>
          <div class="suggest-list">
            {#each suggestions as s (s.type + s.id)}
              <div class="suggest-item" class:char={s.type === "character"} class:place={s.type === "place"}>
                <span class="suggest-name">{s.name}</span>
                <span class="suggest-type"
                  >{s.type === "character" ? "character" : "place"}</span
                >
                <button
                  type="button"
                  class="suggest-link"
                  on:click={() => acceptSuggestion($selectedScene.id, s)}
                >
                  Link
                </button>
                <button
                  type="button"
                  class="suggest-dismiss"
                  title="Dismiss"
                  on:click={() => dismissSuggestion($selectedScene.id, s)}
                >
                  ×
                </button>
              </div>
            {/each}
          </div>
          {#if suggestions.length > 1}
            <button
              type="button"
              class="suggest-dismiss-all"
              on:click={() => dismissAll($selectedScene.id, suggestions)}
            >
              Dismiss all
            </button>
          {/if}
        </div>
      {/if}

      {#key $selectedScene.id}
        <div class="editor-body">
          <RichTextEditor
            content={$selectedScene.content}
            placeholder="Start writing this scene…"
            onUpdate={onBodyUpdate}
            {entities}
            {describeMention}
            {highlightTerms}
          />
        </div>
      {/key}
    {:else}
      <div class="empty">Select a scene from the list to write.</div>
    {/if}
  </section>
</div>

<style>
  .manuscript {
    display: flex;
    height: 100%;
  }

  .scene-list {
    width: 240px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    background: var(--bg-panel);
    overflow-y: auto;
  }

  .list-header {
    padding: 0.75rem 1rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .scene-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: 0.65rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
  }

  .scene-item:hover {
    background: var(--bg-sidebar);
  }

  .scene-item.dragging {
    opacity: 0.4;
  }

  .scene-item.drop-before {
    box-shadow: inset 0 3px 0 var(--accent);
  }

  .scene-item.drop-after {
    box-shadow: inset 0 -3px 0 var(--accent);
  }

  .scene-item.active {
    background: var(--accent-soft);
  }

  .ch {
    font-size: 0.65rem;
    color: var(--text-muted);
    margin-bottom: 0.15rem;
  }

  .name {
    font-size: 0.85rem;
    font-weight: 500;
    line-height: 1.3;
  }

  .links-hint {
    font-size: 0.65rem;
    color: var(--text-muted);
    margin-top: 0.2rem;
  }

  .editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .editor-header {
    padding: 1rem 1.75rem 0.75rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .title-input {
    font-size: 1.25rem;
    font-weight: 650;
    border: none;
    background: transparent;
    color: var(--text);
    width: 100%;
    outline: none;
    font-family: inherit;
  }

  .title-input::placeholder {
    color: var(--text-muted);
  }

  .summary-input {
    font-size: 0.85rem;
    color: var(--text-muted);
    border: none;
    background: transparent;
    width: 100%;
    resize: none;
    outline: none;
    font-family: inherit;
    line-height: 1.45;
  }

  .summary-input::placeholder {
    color: var(--text-faint);
  }

  .meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem 0.9rem;
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .links {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.25rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
  }

  .link-row {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
  }

  .link-label {
    flex-shrink: 0;
    width: 72px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted);
    padding-top: 0.35rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    padding: 0.2rem 0.35rem 0.2rem 0.55rem;
    border-radius: 999px;
    line-height: 1.2;
  }

  .chip.char {
    background: var(--char-bg);
    color: var(--char-fg);
  }

  .chip.place {
    background: var(--place-bg);
    color: var(--place-fg);
  }

  .chip-x {
    font-size: 0.85rem;
    line-height: 1;
    opacity: 0.6;
    padding: 0 0.15rem;
    border-radius: 50%;
  }

  .chip-x:hover {
    opacity: 1;
    background: color-mix(in srgb, currentColor 14%, transparent);
  }

  .add-select {
    font-size: 0.75rem;
    font-family: inherit;
    color: var(--text-muted);
    border: 1px dashed var(--border);
    border-radius: 999px;
    padding: 0.2rem 0.5rem;
    background: transparent;
    outline: none;
    max-width: 140px;
  }

  .add-select:hover,
  .add-select:focus {
    border-color: var(--accent);
    color: var(--accent);
  }

  .empty-hint {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Auto-link suggestion bar */
  .suggest-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1.75rem;
    background: var(--warn-bg-soft);
    border-bottom: 1px solid var(--warn-border);
    flex-shrink: 0;
  }

  .suggest-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--warn-fg);
    flex-shrink: 0;
  }

  .suggest-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    flex: 1;
  }

  .suggest-item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    padding: 0.2rem 0.3rem 0.2rem 0.55rem;
    border-radius: 6px;
    background: var(--bg-panel);
    border: 1px solid var(--warn-border);
  }

  .suggest-item.char .suggest-name {
    color: var(--char-fg);
  }

  .suggest-item.place .suggest-name {
    color: var(--place-fg);
  }

  .suggest-name {
    font-weight: 600;
  }

  .suggest-type {
    font-size: 0.65rem;
    color: var(--text-muted);
  }

  .suggest-link {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--accent);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    background: var(--accent-soft);
  }

  .suggest-link:hover {
    filter: brightness(0.97);
  }

  .suggest-dismiss {
    font-size: 0.85rem;
    color: var(--text-muted);
    padding: 0 0.2rem;
    border-radius: 3px;
  }

  .suggest-dismiss:hover {
    color: var(--text);
    background: var(--bg-sidebar);
  }

  .suggest-dismiss-all {
    font-size: 0.7rem;
    color: var(--warn-fg);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .suggest-dismiss-all:hover {
    background: var(--warn-bg);
  }

  .editor-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .empty {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--text-muted);
  }

  .snap-btn {
    margin-left: 0.75rem;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-soft);
    border-radius: 999px;
    padding: 0.05rem 0.6rem;
  }

  .hl-chip {
    margin-left: 0.75rem;
    font-size: 0.68rem;
    color: var(--warn-fg);
    background: var(--warn-bg);
    border-radius: 999px;
    padding: 0.05rem 0.55rem;
  }

  .hl-chip:hover {
    background: var(--warn-border);
  }
</style>
