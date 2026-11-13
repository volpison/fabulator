<script lang="ts">
  import {
    project,
    selectedScriptSceneId,
    addScreenplayAct,
    renameScreenplayAct,
    deleteScreenplayAct,
    addScreenplayScene,
    updateScreenplayScene,
    moveScreenplayScene,
    deleteScreenplayScene,
  } from "../lib/stores";
  import { platform } from "../lib/platform";
  import {
    SLUG_PLACES,
    SLUG_PLACE_LABEL,
    TIMES_OF_DAY,
    formatPages,
    scenePages,
    sceneWordCount,
    scenesInAct,
    sceneNumbers,
    slugLine,
    screenplayLength,
  } from "../lib/screenplay";
  import { actSummary, sceneIsEmpty } from "../lib/screenplayedit";
  import { SCENE_COLORS, SCENE_STATUSES, STATUS_LABEL, colorHex, type SceneStatus } from "../lib/labels";
  import type { ScriptScene, SlugPlace } from "../lib/types";

  $: acts = $project?.acts ?? [];
  $: selected = $project?.script_scenes.find((s) => s.id === $selectedScriptSceneId) ?? null;
  $: selectedAct = selected ? acts.find((a) => a.id === selected.act_id) ?? null : null;
  $: numbers = $project ? sceneNumbers($project) : new Map<string, number>();
  $: total = $project ? screenplayLength($project) : { lines: 0, pages: 0, minutes: 0 };
  $: placeNames = ($project?.places ?? []).map((p) => p.name.toUpperCase());

  const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;

  function snippet(text: string, max = 140): string {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }

  function select(id: string) {
    selectedScriptSceneId.set(id);
  }

  function onCardKey(id: string, e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return; // keys typed in the card's own controls are theirs
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      select(id);
    }
  }

  function onAddScene() {
    addScreenplayScene(selected?.act_id);
  }

  /** Scene `sc` one place earlier (-1) or later (+1) inside its act. */
  function nudge(sc: ScriptScene, delta: number) {
    moveScreenplayScene(sc.id, sc.act_id, sc.order + delta);
  }

  async function onDeleteScene(sc: ScriptScene) {
    if (
      !sceneIsEmpty(sc) &&
      !(await platform().confirm(
        `Delete scene ${numbers.get(sc.id) ?? ""}${slugLine(sc) ? ` (${slugLine(sc)})` : ""}? Its action, dialogue and notes will be removed.`,
        { title: "Delete scene", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" }
      ))
    ) {
      return;
    }
    deleteScreenplayScene(sc.id);
  }

  function setStatus(id: string, e: Event) {
    updateScreenplayScene(id, { status: valueOf(e) as SceneStatus });
  }
  function setField(id: string, field: "title" | "location" | "time" | "summary" | "notes" | "plotline_id" | "color", e: Event) {
    updateScreenplayScene(id, { [field]: valueOf(e) });
  }
  function setSlugPlace(id: string, e: Event) {
    updateScreenplayScene(id, { int_ext: valueOf(e) as SlugPlace });
  }
</script>

{#if $project}
  <div class="sp-timeline">
    <div class="toolbar">
      <button class="add" on:click={onAddScene}>+ Add scene</button>
      <button class="add" on:click={() => addScreenplayAct()}>+ Add act</button>
      <span class="length" title="About 55 lines of 12 pt Courier per page; one page is roughly one minute on screen">
        {formatPages(total.pages)} page{total.pages === 1 ? "" : "s"} · about {total.minutes} min
      </span>
      <span class="hint">Click a scene to edit its slug line, summary and notes · Page lengths are estimates (the usual script rule of thumb)</span>
    </div>

    <div class="scroll">
      {#each acts as act (act.id)}
        {@const sum = actSummary($project, act.id)}
        {@const scenes = scenesInAct($project.script_scenes, act.id)}
        <section class="act" aria-label={act.title}>
          <header class="act-head">
            <input
              class="act-title"
              value={act.title}
              aria-label="Act title"
              on:change={(e) => renameScreenplayAct(act.id, { title: valueOf(e).trim() || act.title })}
            />
            <span class="counts">
              {sum.scenes} scene{sum.scenes === 1 ? "" : "s"} · {formatPages(sum.pages)} page{sum.pages === 1 ? "" : "s"} · {sum.words} words
            </span>
            {#if sum.scenes === 0}
              <button class="icon" title="Delete this empty act" aria-label="Delete empty act" on:click={() => deleteScreenplayAct(act.id)}>✕</button>
            {/if}
          </header>

          {#if scenes.length === 0}
            <p class="empty">
              No scenes yet.
              <button class="link" on:click={() => addScreenplayScene(act.id)}>Add the first scene</button>
            </p>
          {/if}

          <div class="cards">
            {#each scenes as sc (sc.id)}
              {@const hex = colorHex(sc.color)}
              <div
                class="card"
                class:selected={sc.id === $selectedScriptSceneId}
                style={hex ? `border-left: 4px solid ${hex}` : ""}
                role="button"
                tabindex="0"
                aria-pressed={sc.id === $selectedScriptSceneId}
                aria-label="Scene {numbers.get(sc.id)}{slugLine(sc) ? ': ' + slugLine(sc) : ''}"
                on:click={() => select(sc.id)}
                on:keydown={(e) => onCardKey(sc.id, e)}
              >
                <div class="card-top">
                  <span class="num">{numbers.get(sc.id)}</span>
                  <span class="spacer"></span>
                  <button class="icon" title="Move earlier" aria-label="Move scene earlier" disabled={sc.order === 0} on:click|stopPropagation={() => nudge(sc, -1)}>◀</button>
                  <button class="icon" title="Move later" aria-label="Move scene later" disabled={sc.order >= scenes.length - 1} on:click|stopPropagation={() => nudge(sc, 1)}>▶</button>
                  <button class="icon" title="Delete scene" aria-label="Delete scene" on:click|stopPropagation={() => onDeleteScene(sc)}>✕</button>
                </div>
                <div class="slug" class:none={!slugLine(sc)}>{slugLine(sc) || "No slug line yet"}</div>
                {#if sc.title.trim()}<div class="card-title">{sc.title}</div>{/if}
                {#if sc.summary.trim()}
                  <div class="card-summary">{snippet(sc.summary)}</div>
                {:else}
                  <div class="card-summary none">No summary yet</div>
                {/if}
                <div class="card-bottom">
                  <span title="Estimated length on the page">{formatPages(scenePages(sc))} pg</span>
                  <span title="Words of action and dialogue">{sceneWordCount(sc)} w</span>
                  <span class="spacer"></span>
                  <select
                    class="status status-{sc.status}"
                    aria-label="Status of scene {numbers.get(sc.id)}"
                    value={sc.status}
                    on:click|stopPropagation
                    on:keydown|stopPropagation
                    on:change={(e) => setStatus(sc.id, e)}
                  >
                    {#each SCENE_STATUSES as st}
                      <option value={st}>{STATUS_LABEL[st]}</option>
                    {/each}
                  </select>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>

    {#if selected}
      {@const sc = selected}
      <section class="details" aria-label="Scene details">
        <h3>Scene {numbers.get(sc.id)}{selectedAct ? ` · ${selectedAct.title}` : ""}{slugLine(sc) ? ` · ${slugLine(sc)}` : ""}</h3>
        <div class="slug-fields">
          <label class="field">
            <span>INT / EXT</span>
            <select value={sc.int_ext} on:change={(e) => setSlugPlace(sc.id, e)}>
              <option value="">—</option>
              {#each SLUG_PLACES as sp}
                <option value={sp}>{SLUG_PLACE_LABEL[sp]}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>Location</span>
            <input value={sc.location} list="sp-places" placeholder="KITCHEN" on:input={(e) => setField(sc.id, "location", e)} />
          </label>
          <label class="field">
            <span>Time</span>
            <input value={sc.time} list="sp-times" placeholder="DAY" on:input={(e) => setField(sc.id, "time", e)} />
          </label>
          <label class="field">
            <span>Status</span>
            <select value={sc.status} on:change={(e) => setStatus(sc.id, e)}>
              {#each SCENE_STATUSES as st}
                <option value={st}>{STATUS_LABEL[st]}</option>
              {/each}
            </select>
          </label>
        </div>
        <datalist id="sp-places">
          {#each placeNames as n}<option value={n}></option>{/each}
        </datalist>
        <datalist id="sp-times">
          {#each TIMES_OF_DAY as t}<option value={t}></option>{/each}
        </datalist>

        <div class="meta-fields">
          <label class="field">
            <span>Working title <em>never exported</em></span>
            <input value={sc.title} placeholder="Optional, e.g. The bridge fight" on:input={(e) => setField(sc.id, "title", e)} />
          </label>
          <label class="field">
            <span>Plotline</span>
            <select value={sc.plotline_id} on:change={(e) => setField(sc.id, "plotline_id", e)}>
              <option value="">—</option>
              {#each $project.plotlines as pl}
                <option value={pl.id}>{pl.name}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>Colour</span>
            <select value={sc.color} on:change={(e) => setField(sc.id, "color", e)}>
              <option value="">None</option>
              {#each SCENE_COLORS as c}
                <option value={c.id}>{c.label}</option>
              {/each}
            </select>
          </label>
        </div>
        <label class="field wide">
          <span>Summary</span>
          <textarea
            rows="4"
            value={sc.summary}
            placeholder="What happens in this scene, in your own words. The writing view (coming next) is where the action and dialogue go."
            on:input={(e) => setField(sc.id, "summary", e)}
          ></textarea>
        </label>
        <label class="field wide">
          <span>Notes <em>private</em></span>
          <textarea rows="2" value={sc.notes} on:input={(e) => setField(sc.id, "notes", e)}></textarea>
        </label>
      </section>
    {/if}
  </div>
{/if}

<style>
  .sp-timeline {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--text);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .add {
    font-size: 0.8rem;
    padding: 0.3rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .add:hover {
    border-color: var(--accent);
  }
  .length {
    font-size: 0.72rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .hint {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1rem 1.25rem 1.5rem;
  }

  .act {
    margin-bottom: 2rem;
  }
  .act-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }
  .act-title {
    font-size: 1.05rem;
    font-weight: 700;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--text);
    padding: 0.15rem 0.4rem;
    min-width: 8rem;
  }
  .act-title:hover,
  .act-title:focus {
    border-color: var(--border);
    outline: none;
  }
  .counts {
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .empty {
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .link {
    color: var(--accent);
    text-decoration: underline;
    font-size: inherit;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    gap: 0.75rem;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-panel);
    cursor: pointer;
  }
  .card:hover {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .card.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg-panel));
  }
  .card-top,
  .card-bottom {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .num {
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .spacer {
    flex: 1;
  }
  .icon {
    width: 1.35rem;
    height: 1.35rem;
    font-size: 0.7rem;
    border-radius: 4px;
    color: var(--text-muted);
  }
  .icon:hover:not(:disabled) {
    background: var(--bg-sidebar);
    color: var(--text);
  }
  .icon:disabled {
    opacity: 0.3;
    cursor: default;
  }
  /* The slug line is set the way a script sets it: monospace capitals. */
  .slug {
    font-family: "Courier New", Courier, monospace;
    font-weight: 700;
    font-size: 0.82rem;
    letter-spacing: 0.01em;
    overflow-wrap: anywhere;
  }
  .slug.none {
    font-weight: 400;
    font-style: italic;
    opacity: 0.6;
  }
  .card-title {
    font-size: 0.82rem;
    font-weight: 600;
  }
  .card-summary {
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--text-muted);
    min-height: 2.2rem;
  }
  .card-summary.none {
    font-style: italic;
    opacity: 0.7;
  }
  select {
    font-size: 0.72rem;
    padding: 0.1rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    color: var(--text);
  }

  .details {
    flex-shrink: 0;
    max-height: 48%;
    overflow-y: auto;
    padding: 0.75rem 1.25rem 1rem;
    border-top: 1px solid var(--border);
    background: var(--bg-panel);
  }
  .details h3 {
    margin: 0 0 0.6rem;
    font-size: 0.9rem;
    font-family: "Courier New", Courier, monospace;
  }
  .slug-fields {
    display: grid;
    grid-template-columns: 1fr 3fr 2fr 1fr;
    gap: 0.75rem;
    margin-bottom: 0.6rem;
  }
  .meta-fields {
    display: grid;
    grid-template-columns: 3fr 2fr 1fr;
    gap: 0.75rem;
    margin-bottom: 0.6rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.72rem;
    color: var(--text-muted);
    min-width: 0;
  }
  .field.wide {
    margin-bottom: 0.6rem;
  }
  .field em {
    font-style: normal;
    opacity: 0.7;
    margin-left: 0.35rem;
  }
  .field input,
  .field textarea,
  .field select {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .slug-fields .field input {
    font-family: "Courier New", Courier, monospace;
    text-transform: uppercase;
  }
  .field textarea {
    resize: vertical;
    line-height: 1.5;
  }
</style>
