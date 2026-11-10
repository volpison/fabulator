<script lang="ts">
  import { stats } from "../lib/goalsStore";
  import FilterBar from "./FilterBar.svelte";
  import SceneLabels from "./SceneLabels.svelte";
  import PlotlineLabel from "./PlotlineLabel.svelte";
  import { sceneFilter } from "../lib/stores";
  import { colorHex, isFilterActive, matchScene, STATUS_LABEL, cleanStatus } from "../lib/labels";
  import { formatCount } from "../lib/wordcount";
  import { ask } from "@tauri-apps/plugin-dialog";
  import {
    project,
    selectedSceneId,
    mainView,
    updateSceneFields,
    moveScene,
    addScene,
    deleteScene,
    addChapter,
    updateChapter,
    moveChapter,
    deleteChapter,
    addPlotlineToProject,
  } from "../lib/stores";
  import type { Project, Scene } from "../lib/types";
  import { scenesInChapter } from "../lib/model";

  $: filterOn = isFilterActive($sceneFilter);

  type SceneDrop = {
    chapterId: string;
    plotlineId: string;
    /** Insert before this scene, or null = end of the cell. */
    beforeSceneId: string | null;
  };

  /** Scene being edited inline. */
  let editingId: string | null = null;

  /** Chapter whose title is being edited, and the text typed so far. */
  let editingChapterId: string | null = null;
  let chapterDraft = "";

  let dragSceneId: string | null = null;
  let sceneDrop: SceneDrop | null = null;

  let dragChapterId: string | null = null;
  /** Insertion slot for a dragged chapter: 0 = before the first … n = after the last. */
  let chapterDropIndex: number | null = null;

  function selectScene(id: string) {
    selectedSceneId.set(id);
    mainView.set("manuscript");
  }

  function startEdit(id: string, e: MouseEvent) {
    e.stopPropagation();
    editingId = id;
    selectedSceneId.set(id);
  }

  function stopEdit() {
    editingId = null;
  }

  // ─── Reading the model (project is passed in so the template re-runs) ───

  function cellScenes(p: Project, chapterId: string, plotlineId: string): Scene[] {
    return scenesInChapter(p.scenes, chapterId).filter(
      (s) => s.plotline_id === plotlineId
    );
  }

  function chapterSceneCount(p: Project, chapterId: string): number {
    return p.scenes.filter((s) => s.chapter_id === chapterId).length;
  }

  function dropIsIn(d: SceneDrop | null, chapterId: string, plotlineId: string): boolean {
    return !!d && d.chapterId === chapterId && d.plotlineId === plotlineId;
  }

  // ─── Adding / deleting scenes ───────────────────────────

  function onAddScene() {
    const id = addScene();
    editingId = id;
    selectedSceneId.set(id);
  }

  function onAddSceneToCell(chapterId: string, plotlineId: string) {
    const id = addScene({ chapter_id: chapterId, plotline_id: plotlineId });
    editingId = id;
    selectedSceneId.set(id);
  }

  async function onDeleteScene(id: string, title: string, e: MouseEvent) {
    e.stopPropagation();
    const ok = await ask(`Delete scene “${title}”? This cannot be undone.`, {
      title: "Delete scene",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    deleteScene(id);
    if (editingId === id) editingId = null;
  }

  // ─── Chapters ───────────────────────────────────────────

  function onAddChapter() {
    const id = addChapter();
    startChapterEdit(id, "");
  }

  function startChapterEdit(id: string, currentTitle: string) {
    editingChapterId = id;
    chapterDraft = currentTitle;
  }

  function commitChapterEdit(id: string) {
    if (editingChapterId !== id) return; // already committed or cancelled
    const title = chapterDraft.trim();
    if (title) updateChapter(id, { title });
    editingChapterId = null;
  }

  function onChapterKey(id: string, e: KeyboardEvent) {
    if (e.key === "Enter") {
      commitChapterEdit(id);
    } else if (e.key === "Escape") {
      editingChapterId = null; // cancel: blur on unmount then does nothing
    }
  }

  function focusSelect(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  async function onDeleteChapter(id: string, title: string) {
    const ok = await ask(`Delete the empty chapter “${title}”?`, {
      title: "Delete chapter",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (ok) deleteChapter(id);
  }

  // ─── Drag scenes ────────────────────────────────────────

  function onSceneDragStart(sceneId: string, e: DragEvent) {
    dragSceneId = sceneId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", sceneId);
    }
  }

  function endSceneDrag() {
    dragSceneId = null;
    sceneDrop = null;
  }

  /** Over a card: land before it (upper half) or after it (lower half). */
  function onCardDragOver(
    chapterId: string,
    plotlineId: string,
    list: Scene[],
    index: number,
    e: DragEvent
  ) {
    if (!dragSceneId) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const lowerHalf = e.clientY > rect.top + rect.height / 2;
    sceneDrop = {
      chapterId,
      plotlineId,
      beforeSceneId: lowerHalf ? (list[index + 1]?.id ?? null) : list[index].id,
    };
  }

  /** Over the empty part of a cell: land at the end of the cell. */
  function onCellDragOver(chapterId: string, plotlineId: string, e: DragEvent) {
    if (!dragSceneId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    sceneDrop = { chapterId, plotlineId, beforeSceneId: null };
  }

  function onCellDragLeave(chapterId: string, plotlineId: string, e: DragEvent) {
    const next = e.relatedTarget as Node | null;
    if ((e.currentTarget as HTMLElement).contains(next)) return;
    if (dropIsIn(sceneDrop, chapterId, plotlineId)) sceneDrop = null;
  }

  function onCellDrop(e: DragEvent) {
    if (!dragSceneId || !sceneDrop) return;
    e.preventDefault();
    moveScene(dragSceneId, sceneDrop);
    endSceneDrag();
  }

  /** Dropping on the trailing "new chapter" cell creates a chapter first. */
  function onNewChapterDrop(plotlineId: string, e: DragEvent) {
    if (!dragSceneId) return;
    e.preventDefault();
    const sceneId = dragSceneId;
    const chapterId = addChapter();
    moveScene(sceneId, { chapterId, plotlineId });
    endSceneDrag();
  }

  // ─── Drag chapters ──────────────────────────────────────

  function onChapterDragStart(id: string, e: DragEvent) {
    dragChapterId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }

  function endChapterDrag() {
    dragChapterId = null;
    chapterDropIndex = null;
  }

  function onChapterDragOver(index: number, e: DragEvent) {
    if (!dragChapterId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    chapterDropIndex = e.clientX > rect.left + rect.width / 2 ? index + 1 : index;
  }

  function onChapterDrop(e: DragEvent) {
    if (!dragChapterId || chapterDropIndex === null || !$project) return;
    e.preventDefault();
    const from = $project.chapters.findIndex((c) => c.id === dragChapterId);
    // The slot index counts the dragged chapter itself; account for removal.
    const to = from !== -1 && from < chapterDropIndex ? chapterDropIndex - 1 : chapterDropIndex;
    moveChapter(dragChapterId, to);
    endChapterDrag();
  }
</script>

{#if $project}
  <div class="timeline-wrap">
    <div class="toolbar">
      <button class="add-scene" on:click={onAddScene}>+ Add Scene</button>
      <button class="add-scene" on:click={onAddChapter}>+ Add Chapter</button>
      <span class="hint">
        Drag cards to move or reorder · Drag chapter headers to reorder chapters ·
        Double-click a title to rename · Click a card to write
      </span>
    </div>

    <FilterBar />

    <div class="timeline">
      <div class="header-row">
        <div class="lane-spacer"></div>
        {#each $project.chapters as chapter, i (chapter.id)}
          <div
            class="chapter-header"
            class:drop-left={dragChapterId !== null && chapterDropIndex === i}
            class:dragging={dragChapterId === chapter.id}
            role="group"
            aria-label={chapter.title}
            draggable={editingChapterId !== chapter.id}
            on:dragstart={(e) => onChapterDragStart(chapter.id, e)}
            on:dragend={endChapterDrag}
            on:dragover={(e) => onChapterDragOver(i, e)}
            on:drop={onChapterDrop}
          >
            <button
              class="ch-move"
              title="Move chapter left"
              disabled={i === 0}
              on:click={() => moveChapter(chapter.id, i - 1)}>◀</button
            >

            {#if editingChapterId === chapter.id}
              <input
                class="ch-title-input"
                type="text"
                placeholder="Chapter title"
                bind:value={chapterDraft}
                use:focusSelect
                on:keydown={(e) => onChapterKey(chapter.id, e)}
                on:blur={() => commitChapterEdit(chapter.id)}
              />
            {:else}
              <span
                class="ch-title"
                role="button"
                tabindex="0"
                title="Double-click to rename · drag to reorder"
                on:dblclick={() => startChapterEdit(chapter.id, chapter.title)}
                on:keydown={(e) => {
                  if (e.key === "F2" || e.key === "Enter")
                    startChapterEdit(chapter.id, chapter.title);
                }}
              >
                {chapter.title}
              </span>
              <span class="ch-count">
                {chapterSceneCount($project, chapter.id)}
              </span>
              <span class="ch-words" title="Words in this chapter">
                {formatCount($stats.byChapter.get(chapter.id) ?? 0)} w
              </span>
            {/if}

            {#if chapterSceneCount($project, chapter.id) === 0 && editingChapterId !== chapter.id}
              <button
                class="ch-delete"
                title="Delete empty chapter"
                on:click={() => onDeleteChapter(chapter.id, chapter.title)}
                >✕</button
              >
            {/if}

            <button
              class="ch-move"
              title="Move chapter right"
              disabled={i === $project.chapters.length - 1}
              on:click={() => moveChapter(chapter.id, i + 1)}>▶</button
            >
          </div>
        {/each}

        <div
          class="chapter-add"
          class:drop-left={dragChapterId !== null &&
            chapterDropIndex === $project.chapters.length}
          role="group"
          on:dragover={(e) => onChapterDragOver($project.chapters.length, e)}
          on:drop={onChapterDrop}
        >
          <button class="ch-add-btn" on:click={onAddChapter}>+ Chapter</button>
        </div>
      </div>

      {#each $project.plotlines as plotline, laneIndex (plotline.id)}
        <div class="lane">
          <PlotlineLabel
            {plotline}
            index={laneIndex}
            count={$project.plotlines.length}
            sceneCount={$project.scenes.filter((s) => s.plotline_id === plotline.id).length}
          />

          <div class="cards">
            {#each $project.chapters as chapter (chapter.id)}
              {@const list = cellScenes($project, chapter.id, plotline.id)}
              {@const isTarget = dropIsIn(sceneDrop, chapter.id, plotline.id)}
              <div
                class="cell"
                class:drop-target={dragSceneId !== null}
                class:drag-over={isTarget}
                role="list"
                on:dragover={(e) => onCellDragOver(chapter.id, plotline.id, e)}
                on:dragleave={(e) => onCellDragLeave(chapter.id, plotline.id, e)}
                on:drop={onCellDrop}
              >
                {#each list as scene, i (scene.id)}
                  {#if isTarget && sceneDrop?.beforeSceneId === scene.id && dragSceneId !== scene.id}
                    <div class="drop-line"></div>
                  {/if}

                  <div
                    class="slot"
                    role="listitem"
                    on:dragover={(e) =>
                      onCardDragOver(chapter.id, plotline.id, list, i, e)}
                  >
                    {#if editingId === scene.id}
                      <div
                        class="card editing"
                        style="border-color: {plotline.color}"
                      >
                        <input
                          class="edit-title"
                          type="text"
                          value={scene.title}
                          on:input={(e) =>
                            updateSceneFields(scene.id, {
                              title: e.currentTarget.value,
                            })}
                          placeholder="Scene title"
                        />
                        <textarea
                          class="edit-summary"
                          rows="3"
                          value={scene.summary}
                          on:input={(e) =>
                            updateSceneFields(scene.id, {
                              summary: e.currentTarget.value,
                            })}
                          placeholder="Synopsis…"
                        ></textarea>
                        <SceneLabels {scene} />
                        <div class="edit-row">
                          <select
                            title="Chapter"
                            value={scene.chapter_id}
                            on:change={(e) =>
                              moveScene(scene.id, {
                                chapterId: e.currentTarget.value,
                                plotlineId: scene.plotline_id,
                              })}
                          >
                            {#each $project.chapters as ch (ch.id)}
                              <option value={ch.id}>{ch.title}</option>
                            {/each}
                          </select>
                          <select
                            title="Plotline"
                            value={scene.plotline_id}
                            on:change={(e) =>
                              updateSceneFields(scene.id, {
                                plotline_id: e.currentTarget.value,
                              })}
                          >
                            {#each $project.plotlines as pl (pl.id)}
                              <option value={pl.id}>{pl.name}</option>
                            {/each}
                          </select>
                        </div>
                        <div class="edit-actions">
                          <button
                            class="danger"
                            on:click={(e) =>
                              onDeleteScene(scene.id, scene.title, e)}
                          >
                            Delete
                          </button>
                          <button class="done" on:click={stopEdit}>Done</button>
                        </div>
                      </div>
                    {:else}
                      <div
                        class="card"
                        class:selected={$selectedSceneId === scene.id}
                        class:is-dragging={dragSceneId === scene.id}
                        class:dimmed={filterOn && !matchScene(scene, $sceneFilter)}
                        style="border-color: {plotline.color}"
                        role="button"
                        tabindex="0"
                        draggable="true"
                        on:dragstart={(e) => onSceneDragStart(scene.id, e)}
                        on:dragend={endSceneDrag}
                        on:click={() => selectScene(scene.id)}
                        on:dblclick={(e) => startEdit(scene.id, e)}
                        on:keydown={(e) => {
                          if (e.key === "Enter") selectScene(scene.id);
                        }}
                      >
                        {#if colorHex(scene.color)}
                          <span class="strip" style="background: {colorHex(scene.color)}" aria-hidden="true"></span>
                        {/if}
                        <div class="card-title">{scene.title}</div>
                        {#if scene.summary}
                          <div class="card-summary">{scene.summary}</div>
                        {/if}
                        <div class="card-foot">
                          <span class="badge s-{cleanStatus(scene.status)}">{STATUS_LABEL[cleanStatus(scene.status)]}</span>
                          <span class="card-words">
                            {formatCount($stats.byScene.get(scene.id) ?? 0)} words
                          </span>
                        </div>
                        <button
                          class="edit-btn"
                          title="Edit scene"
                          on:click={(e) => startEdit(scene.id, e)}
                        >
                          Edit
                        </button>
                      </div>
                    {/if}
                  </div>
                {/each}

                {#if isTarget && sceneDrop?.beforeSceneId === null}
                  <div class="drop-line"></div>
                {:else if list.length === 0 && dragSceneId}
                  <div class="empty-slot">Drop here</div>
                {/if}

                {#if !dragSceneId}
                  <button
                    class="cell-add"
                    title="Add a scene here"
                    on:click={() => onAddSceneToCell(chapter.id, plotline.id)}
                  >
                    +
                  </button>
                {/if}
              </div>
            {/each}

            {#if dragSceneId}
              <div
                class="cell new-col"
                role="group"
                on:dragover={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                }}
                on:drop={(e) => onNewChapterDrop(plotline.id, e)}
              >
                <div class="empty-slot">Drop for a new chapter</div>
              </div>
            {/if}
          </div>
        </div>
      {/each}

      <div class="add-plotline">
        <button class="ch-add-btn" on:click={() => addPlotlineToProject()}>+ Plotline</button>
      </div>

      {#if $project.chapters.length === 0}
        <p class="empty-hint">
          No chapters yet. Use “+ Add Chapter” or “+ Add Scene” to begin.
        </p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .timeline-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    flex-shrink: 0;
  }

  .add-scene {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--accent);
    padding: 0.3rem 0.65rem;
    border-radius: 4px;
    background: var(--accent-soft);
  }

  .add-scene:hover {
    filter: brightness(0.97);
  }

  .hint {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .timeline {
    padding: 1.25rem;
    min-width: max-content;
    overflow: auto;
    flex: 1;
  }

  .header-row,
  .lane {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .add-plotline {
    margin: 0.25rem 0 0.75rem;
  }

  .lane-spacer {
    width: 150px;
    flex-shrink: 0;
  }

  .lane-label {
    width: 150px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }



  .cards {
    display: flex;
    gap: 0.5rem;
  }


  .cell.drop-target {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .cell.drag-over {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .empty-slot {
    flex: 1;
    height: 100%;
    min-height: 72px;
    display: grid;
    place-items: center;
    font-size: 0.7rem;
    color: var(--accent);
    border: 1.5px dashed var(--accent);
    border-radius: var(--radius);
    opacity: 0.7;
  }

  .card {
    position: relative;
    width: 100%;
    text-align: left;
    padding: 0.65rem 0.75rem;
    background: var(--bg-panel);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    transition: box-shadow 0.15s, border-color 0.15s, opacity 0.15s;
    cursor: grab;
  }

  .card:active {
    cursor: grabbing;
  }

  .card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .card.selected {
    box-shadow: 0 0 0 2px var(--accent);
  }

  .card.editing {
    cursor: default;
    box-shadow: 0 0 0 2px var(--accent);
  }

  .card.is-dragging,
  .card:global(.dragging) {
    opacity: 0.45;
  }

  .card-title {
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
    line-height: 1.3;
    padding-right: 2rem;
  }

  .card-summary {
    font-size: 0.7rem;
    color: var(--text-muted);
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .edit-btn {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    font-size: 0.65rem;
    color: var(--text-muted);
    padding: 0.15rem 0.35rem;
    border-radius: 3px;
    opacity: 0;
    transition: opacity 0.15s;
    cursor: pointer;
  }

  .card:hover .edit-btn {
    opacity: 1;
  }

  .edit-btn:hover {
    background: var(--bg-sidebar);
    color: var(--text);
  }

  .edit-title {
    width: 100%;
    font-size: 0.8rem;
    font-weight: 600;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.3rem 0.4rem;
    margin-bottom: 0.35rem;
    font-family: inherit;
    outline: none;
  }

  .edit-title:focus {
    border-color: var(--accent);
  }

  .edit-summary {
    width: 100%;
    font-size: 0.7rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.3rem 0.4rem;
    font-family: inherit;
    resize: vertical;
    outline: none;
    color: var(--text-muted);
    line-height: 1.35;
  }

  .edit-summary:focus {
    border-color: var(--accent);
  }

  .edit-row {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.4rem;
    align-items: center;
  }



  .edit-row select {
    flex: 1;
    min-width: 0;
    font-size: 0.7rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.2rem;
    font-family: inherit;
    background: var(--bg-panel);
  }

  .edit-actions {
    display: flex;
    justify-content: space-between;
    margin-top: 0.5rem;
  }

  .edit-actions .danger {
    font-size: 0.7rem;
    color: var(--danger);
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
  }

  .edit-actions .danger:hover {
    background: var(--danger-bg);
  }

  .edit-actions .done {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--accent);
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    background: var(--accent-soft);
  }

  .chapter-header {
    width: 200px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.3rem;
    margin-bottom: 0.1rem;
    border-radius: 6px;
    border-left: 3px solid transparent;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    cursor: grab;
    user-select: none;
  }

  .chapter-header.drop-left,
  .chapter-add.drop-left {
    border-left-color: var(--accent);
  }

  .chapter-header.dragging {
    opacity: 0.45;
  }

  .ch-title {
    flex: 1;
    min-width: 0;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
  }

  .ch-words {
    font-size: 0.65rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }

  .card-words {
    font-size: 0.66rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .badge {
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-muted);
    background: var(--bg-sidebar);
  }

  .badge.s-revised {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .badge.s-final {
    color: var(--ok-fg);
    background: var(--ok-bg);
  }

  .badge.s-idea {
    font-style: italic;
  }

  .strip {
    position: absolute;
    left: 0;
    top: 0.45rem;
    bottom: 0.45rem;
    width: 4px;
    border-radius: 0 3px 3px 0;
  }

  .card.dimmed {
    opacity: 0.28;
  }

  .card.dimmed:hover,
  .card.dimmed:focus-visible {
    opacity: 0.8;
  }

  .ch-count {
    font-size: 0.65rem;
    font-weight: 500;
    background: var(--bg-sidebar);
    border-radius: 999px;
    padding: 0 0.4rem;
  }

  .ch-title-input {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    border: 1px solid var(--accent);
    border-radius: 4px;
    padding: 0.15rem 0.3rem;
    outline: none;
    text-align: center;
  }

  .ch-move,
  .ch-delete {
    font-size: 0.6rem;
    color: var(--text-muted);
    padding: 0.2rem 0.3rem;
    border-radius: 3px;
    opacity: 0.35;
    transition: opacity 0.12s;
  }

  .chapter-header:hover .ch-move,
  .chapter-header:hover .ch-delete {
    opacity: 1;
  }

  .ch-move:hover:not(:disabled),
  .ch-delete:hover {
    background: var(--bg-sidebar);
    color: var(--text);
  }

  .ch-move:disabled {
    visibility: hidden;
  }

  .chapter-add {
    width: 120px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-left: 3px solid transparent;
  }

  .ch-add-btn {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--accent);
    padding: 0.25rem 0.55rem;
    border-radius: 4px;
    background: var(--accent-soft);
  }

  .empty-hint {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 1rem;
  }

  .cell {
    position: relative;
    width: 200px;
    flex-shrink: 0;
    min-height: 72px;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-bottom: 0.1rem;
    border-radius: var(--radius);
    transition: background 0.12s, box-shadow 0.12s;
  }

  .cell.new-col {
    width: 120px;
  }

  .slot {
    width: 100%;
  }

  .drop-line {
    height: 3px;
    margin: -0.2rem 0;
    border-radius: 2px;
    background: var(--accent);
    flex-shrink: 0;
  }

  .cell-add {
    align-self: center;
    font-size: 0.8rem;
    line-height: 1;
    color: var(--text-muted);
    padding: 0.15rem 0.6rem;
    border-radius: 4px;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .cell:hover .cell-add,
  .cell-add:focus-visible {
    opacity: 1;
  }

  .cell-add:hover {
    background: var(--bg-sidebar);
    color: var(--text);
  }
</style>
