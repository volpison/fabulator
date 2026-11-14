<script lang="ts">
  import { tick } from "svelte";
  import {
    project,
    selectedScriptSceneId,
    mainView,
    addCharacter,
    updateScreenplayScene,
    addScreenplayElement,
    updateScreenplayElement,
    moveScreenplayElement,
    deleteScreenplayElement,
  } from "../lib/stores";
  import {
    ELEMENT_KINDS,
    ELEMENT_LABEL,
    EXTENSIONS,
    SLUG_PLACES,
    SLUG_PLACE_LABEL,
    TIMES_OF_DAY,
    TRANSITIONS,
    formatPages,
    needsContd,
    sceneNumbers,
    scenePages,
    sceneWordCount,
    screenplayReadingOrder,
    slugLine,
  } from "../lib/screenplay";
  import { characterNamed, replySpeaker } from "../lib/screenplayedit";
  import { SCENE_STATUSES, STATUS_LABEL, type SceneStatus } from "../lib/labels";
  import type { ElementKind, ScriptElement, ScriptScene, SlugPlace } from "../lib/types";

  $: scenes = $project ? screenplayReadingOrder($project) : [];
  $: scene = $project?.script_scenes.find((s) => s.id === $selectedScriptSceneId) ?? null;
  $: act = scene ? $project?.acts.find((a) => a.id === scene.act_id) ?? null : null;
  $: numbers = $project ? sceneNumbers($project) : new Map<string, number>();
  $: characters = $project?.characters ?? [];
  $: names = new Map(characters.map((c) => [c.id, c.name]));
  $: placeNames = ($project?.places ?? []).map((p) => p.name.toUpperCase());

  // Nothing picked yet (or the picked scene was deleted): start from the first scene.
  $: if ($project && !scene && scenes.length > 0) selectedScriptSceneId.set(scenes[0].id);

  const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;

  function snippet(text: string, max = 60): string {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }

  /** A textarea as tall as its text. */
  function autosize(node: HTMLTextAreaElement, _text: string) {
    const fit = () => {
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    };
    fit();
    return { update: fit };
  }

  async function focusText(id: string, atEnd = true) {
    await tick();
    const t = document.getElementById(`sp-text-${id}`) as HTMLTextAreaElement | HTMLInputElement | null;
    if (!t) return;
    t.focus();
    const pos = atEnd ? t.value.length : 0;
    t.setSelectionRange(pos, pos);
  }
  async function focusSpeaker(id: string) {
    await tick();
    (document.getElementById(`sp-speaker-${id}`) as HTMLInputElement | null)?.focus();
  }

  function addAfter(sc: ScriptScene, index: number, kind: ElementKind, speakerId = "") {
    const id = addScreenplayElement(sc.id, kind, index + 1, speakerId);
    if (!id) return;
    if (kind === "dialogue" && !speakerId) void focusSpeaker(id);
    else void focusText(id);
  }

  /** The keys that make writing fast: see the hint at the top of the page. */
  function onKey(e: KeyboardEvent, sc: ScriptScene, i: number) {
    const el = sc.elements[i];
    const t = e.target as HTMLTextAreaElement | HTMLInputElement;
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) addAfter(sc, i, "dialogue", replySpeaker(sc.elements, i));
      else addAfter(sc, i, "action");
    } else if (e.key === "Backspace" && t.value === "" && t.selectionStart === 0 && t.selectionEnd === 0) {
      // An empty element goes away with Backspace, and the cursor moves to its neighbour.
      if (el.kind === "dialogue" && (el.speaker_id || el.extension || el.parenthetical)) return;
      e.preventDefault();
      const neighbour = sc.elements[i - 1] ?? sc.elements[i + 1];
      deleteScreenplayElement(sc.id, el.id);
      if (neighbour) void focusText(neighbour.id, i > 0);
    } else if (e.key === "ArrowUp" && t.selectionStart === 0 && t.selectionEnd === 0 && i > 0) {
      e.preventDefault();
      void focusText(sc.elements[i - 1].id, true);
    } else if (e.key === "ArrowDown" && t.selectionStart === t.value.length && t.selectionEnd === t.value.length && i < sc.elements.length - 1) {
      e.preventDefault();
      void focusText(sc.elements[i + 1].id, false);
    }
  }

  const titleCaseIfShouting = (name: string) =>
    name === name.toUpperCase() && name !== name.toLowerCase()
      ? name.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
      : name;

  /** Typing a name picks that character, or makes a new one (like a screenwriting program does). */
  function onSpeaker(sc: ScriptScene, el: ScriptElement, e: Event) {
    const typed = valueOf(e).trim();
    if (!typed) {
      updateScreenplayElement(sc.id, el.id, { speaker_id: "" });
      return;
    }
    let id = $project ? characterNamed($project, typed) : "";
    if (!id) id = addCharacter(titleCaseIfShouting(typed));
    updateScreenplayElement(sc.id, el.id, { speaker_id: id });
  }

  function onText(sc: ScriptScene, el: ScriptElement, e: Event) {
    updateScreenplayElement(sc.id, el.id, { text: valueOf(e) });
  }
  function onKind(sc: ScriptScene, el: ScriptElement, e: Event) {
    updateScreenplayElement(sc.id, el.id, { kind: valueOf(e) as ElementKind });
  }

  function onStatus(id: string, e: Event) {
    updateScreenplayScene(id, { status: valueOf(e) as SceneStatus });
  }
  function onSlugPlace(id: string, e: Event) {
    updateScreenplayScene(id, { int_ext: valueOf(e) as SlugPlace });
  }
  function onSlugText(id: string, field: "location" | "time" | "summary", e: Event) {
    updateScreenplayScene(id, { [field]: valueOf(e) });
  }
</script>

{#if $project}
  <div class="sp-manuscript">
    <nav class="scenes" aria-label="Scenes">
      <button class="back" on:click={() => mainView.set("timeline")} title="Back to the scene Timeline (Ctrl+1)">← Timeline</button>
      {#each scenes as sc (sc.id)}
        <button
          class="scene-item"
          class:selected={sc.id === $selectedScriptSceneId}
          aria-current={sc.id === $selectedScriptSceneId ? "true" : undefined}
          on:click={() => selectedScriptSceneId.set(sc.id)}
        >
          <span class="si-top">
            <span class="si-num">{numbers.get(sc.id)}</span>
            <span class="si-pages">{formatPages(scenePages(sc))} pg</span>
          </span>
          <span class="si-slug" class:none={!slugLine(sc)}>{slugLine(sc) || sc.title || snippet(sc.summary) || "Empty scene"}</span>
        </button>
      {/each}
    </nav>

    {#if scene}
      {@const sc = scene}
      <div class="editor">
        <header class="head">
          <h2>Scene {numbers.get(sc.id)}{act ? ` · ${act.title}` : ""}</h2>
          <span class="stats" title="Estimated length on the page, and words of action and dialogue">
            {formatPages(scenePages(sc))} pg · {sceneWordCount(sc)} words
          </span>
          <span class="spacer"></span>
          <select value={sc.status} aria-label="Status" on:change={(e) => onStatus(sc.id, e)}>
            {#each SCENE_STATUSES as st}
              <option value={st}>{STATUS_LABEL[st]}</option>
            {/each}
          </select>
        </header>

        <div class="slug-row">
          <select value={sc.int_ext} aria-label="INT or EXT" on:change={(e) => onSlugPlace(sc.id, e)}>
            <option value="">—</option>
            {#each SLUG_PLACES as sp}
              <option value={sp}>{SLUG_PLACE_LABEL[sp]}</option>
            {/each}
          </select>
          <input class="loc" value={sc.location} list="sp-places" placeholder="LOCATION" aria-label="Location" on:input={(e) => onSlugText(sc.id, "location", e)} />
          <span class="dash">-</span>
          <input class="time" value={sc.time} list="sp-times" placeholder="TIME" aria-label="Time of day" on:input={(e) => onSlugText(sc.id, "time", e)} />
        </div>
        <datalist id="sp-places">{#each placeNames as n}<option value={n}></option>{/each}</datalist>
        <datalist id="sp-times">{#each TIMES_OF_DAY as t}<option value={t}></option>{/each}</datalist>
        <datalist id="sp-ext">{#each EXTENSIONS as x}<option value={x}></option>{/each}</datalist>
        <datalist id="sp-trans">{#each TRANSITIONS as t}<option value={t}></option>{/each}</datalist>
        <datalist id="sp-chars">{#each characters as c}<option value={c.name}></option>{/each}</datalist>

        <details class="summary" open={!sc.elements.length}>
          <summary>Summary</summary>
          <textarea rows="3" value={sc.summary} placeholder="What happens in this scene, in your own words." on:input={(e) => onSlugText(sc.id, "summary", e)}></textarea>
        </details>

        <p class="hint">
          <b>Enter</b> next element · <b>Shift+Enter</b> new line · <b>Ctrl+Enter</b> reply (the other speaker) ·
          <b>Backspace</b> on an empty element removes it · <b>↑ ↓</b> at the edge move between elements ·
          typing a new name in a dialogue adds that character
        </p>

        <div class="paper">
          {#if sc.elements.length === 0}
            <p class="empty">Nothing written in this scene yet. Add the first element:</p>
          {/if}

          {#each sc.elements as el, i (el.id)}
            <div class="el {el.kind}">
              <div class="gutter">
                <select class="kind" value={el.kind} aria-label="Element type" on:change={(e) => onKind(sc, el, e)}>
                  {#each ELEMENT_KINDS as k}
                    <option value={k}>{ELEMENT_LABEL[k]}</option>
                  {/each}
                </select>
                <span class="tools">
                  <button title="Move up" aria-label="Move element up" disabled={i === 0} on:click={() => moveScreenplayElement(sc.id, el.id, i - 1)}>▲</button>
                  <button title="Move down" aria-label="Move element down" disabled={i === sc.elements.length - 1} on:click={() => moveScreenplayElement(sc.id, el.id, i + 1)}>▼</button>
                  <button title="Delete element" aria-label="Delete element" on:click={() => deleteScreenplayElement(sc.id, el.id)}>✕</button>
                </span>
              </div>

              <div class="body">
                {#if el.kind === "dialogue"}
                  <div class="cue">
                    <input
                      id="sp-speaker-{el.id}"
                      class="speaker"
                      class:missing={!el.speaker_id}
                      value={names.get(el.speaker_id) ?? ""}
                      list="sp-chars"
                      placeholder="CHARACTER"
                      aria-label="Who speaks"
                      on:change={(e) => onSpeaker(sc, el, e)}
                      on:keydown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void focusText(el.id);
                        }
                      }}
                    />
                    {#if needsContd(sc.elements, i)}<span class="contd">(CONT'D)</span>{/if}
                    <input class="ext" value={el.extension} list="sp-ext" placeholder="V.O." aria-label="Extension (V.O., O.S.…)" on:change={(e) => updateScreenplayElement(sc.id, el.id, { extension: valueOf(e) })} />
                  </div>
                  <div class="paren">
                    (<input
                      value={el.parenthetical}
                      placeholder="parenthetical"
                      aria-label="Parenthetical"
                      on:change={(e) => updateScreenplayElement(sc.id, el.id, { parenthetical: valueOf(e) })}
                    />)
                  </div>
                  <textarea
                    id="sp-text-{el.id}"
                    class="text"
                    rows="1"
                    use:autosize={el.text}
                    value={el.text}
                    placeholder="Dialogue"
                    on:input={(e) => onText(sc, el, e)}
                    on:keydown={(e) => onKey(e, sc, i)}
                  ></textarea>
                {:else if el.kind === "transition"}
                  <input
                    id="sp-text-{el.id}"
                    class="text"
                    value={el.text}
                    list="sp-trans"
                    placeholder="CUT TO:"
                    aria-label="Transition"
                    on:input={(e) => onText(sc, el, e)}
                    on:keydown={(e) => onKey(e, sc, i)}
                  />
                {:else}
                  <textarea
                    id="sp-text-{el.id}"
                    class="text"
                    rows="1"
                    use:autosize={el.text}
                    value={el.text}
                    placeholder={el.kind === "note" ? "Private note (never exported)" : "Action"}
                    on:input={(e) => onText(sc, el, e)}
                    on:keydown={(e) => onKey(e, sc, i)}
                  ></textarea>
                {/if}
              </div>
            </div>
          {/each}

          <div class="adders">
            <button on:click={() => addAfter(sc, sc.elements.length - 1, "action")}>+ Action</button>
            <button on:click={() => addAfter(sc, sc.elements.length - 1, "dialogue")}>+ Dialogue</button>
            <button on:click={() => addAfter(sc, sc.elements.length - 1, "transition")}>+ Transition</button>
            <button on:click={() => addAfter(sc, sc.elements.length - 1, "note")}>+ Note</button>
          </div>
        </div>
      </div>
    {:else}
      <div class="editor"><p class="empty">No scenes yet. Add one in the Timeline.</p></div>
    {/if}
  </div>
{/if}

<style>
  .sp-manuscript {
    display: flex;
    height: 100%;
    min-height: 0;
    color: var(--text);
  }

  .scenes {
    width: 14rem;
    flex-shrink: 0;
    overflow-y: auto;
    padding: 0.5rem;
    border-right: 1px solid var(--border);
    background: var(--bg-sidebar);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .back {
    text-align: left;
    font-size: 0.78rem;
    padding: 0.35rem 0.5rem;
    color: var(--accent);
    border-radius: 6px;
  }
  .back:hover {
    background: var(--accent-soft);
  }
  .scene-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    text-align: left;
    padding: 0.4rem 0.55rem;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--text);
  }
  .scene-item:hover {
    background: var(--bg);
  }
  .scene-item.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg-panel));
  }
  .si-top {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  .si-num {
    font-weight: 700;
    color: var(--text);
  }
  .si-slug {
    font-family: "Courier New", Courier, monospace;
    font-size: 0.74rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .si-slug.none {
    font-weight: 400;
    font-style: italic;
    opacity: 0.65;
  }

  .editor {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 1rem 1.5rem 2rem;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    max-width: 44rem;
    margin: 0 auto 0.6rem;
  }
  .head h2 {
    margin: 0;
    font-size: 0.95rem;
  }
  .stats {
    font-size: 0.74rem;
    color: var(--text-muted);
  }
  .spacer {
    flex: 1;
  }
  select,
  .summary textarea {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.25rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }

  .slug-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 44rem;
    margin: 0 auto 0.6rem;
    font-family: "Courier New", Courier, monospace;
  }
  .slug-row input {
    font: inherit;
    font-weight: 700;
    text-transform: uppercase;
    padding: 0.3rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    min-width: 0;
  }
  .slug-row .loc {
    flex: 3;
  }
  .slug-row .time {
    flex: 1.5;
  }

  .summary {
    max-width: 44rem;
    margin: 0 auto 0.6rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .summary summary {
    cursor: pointer;
    margin-bottom: 0.3rem;
  }
  .summary textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    line-height: 1.5;
  }
  .hint {
    max-width: 44rem;
    margin: 0 auto 0.8rem;
    font-size: 0.7rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  /* The page: monospace, like a script. */
  .paper {
    max-width: 44rem;
    margin: 0 auto;
    padding: 1.25rem 1.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-panel);
    font-family: "Courier New", Courier, monospace;
    font-size: 0.95rem;
    line-height: 1.45;
  }
  .empty {
    color: var(--text-muted);
    font-family: system-ui, sans-serif;
    font-size: 0.85rem;
  }

  .el {
    display: grid;
    grid-template-columns: 1fr;
    position: relative;
    margin-bottom: 0.9rem;
  }
  /* The tools sit above the element and only show when it is pointed at or being written. */
  .gutter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 1.3rem;
    opacity: 0;
    transition: opacity 0.12s;
    font-family: system-ui, sans-serif;
  }
  .el:hover .gutter,
  .el:focus-within .gutter {
    opacity: 1;
  }
  .kind {
    font-size: 0.66rem;
    padding: 0 0.25rem;
  }
  .tools button {
    width: 1.3rem;
    height: 1.2rem;
    font-size: 0.62rem;
    color: var(--text-muted);
    border-radius: 4px;
  }
  .tools button:hover:not(:disabled) {
    background: var(--bg-sidebar);
    color: var(--text);
  }
  .tools button:disabled {
    opacity: 0.3;
  }

  .body input,
  .body textarea {
    font: inherit;
    color: var(--text);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 0.1rem 0.25rem;
    box-sizing: border-box;
    width: 100%;
  }
  .body input:hover,
  .body textarea:hover,
  .body input:focus,
  .body textarea:focus {
    border-color: var(--border);
    outline: none;
  }
  .body textarea {
    resize: none;
    overflow: hidden;
    display: block;
  }

  /* Dialogue: the name starts about 3.7 in from the left, the words about 2.5 in, like the page. */
  .dialogue .body {
    margin: 0 auto;
    max-width: 24rem;
  }
  .cue {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    margin-left: 7rem;
  }
  .cue .speaker {
    width: 11rem;
    text-transform: uppercase;
    font-weight: 700;
  }
  .cue .speaker.missing {
    border-color: color-mix(in srgb, #d9534f 60%, var(--border));
  }
  .cue .ext {
    width: 4.5rem;
    text-transform: uppercase;
    font-size: 0.8rem;
  }
  .contd {
    font-size: 0.8rem;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .paren {
    margin-left: 3.5rem;
    display: flex;
    align-items: baseline;
    color: var(--text-muted);
  }
  .paren input {
    width: 14rem;
    font-style: italic;
  }

  .transition .body {
    text-align: right;
  }
  .transition .body input {
    text-align: right;
    text-transform: uppercase;
    max-width: 16rem;
    margin-left: auto;
    display: block;
  }

  .note .body textarea {
    background: color-mix(in srgb, #d9b72b 14%, transparent);
    border: 1px dashed color-mix(in srgb, #d9b72b 70%, var(--border));
    font-style: italic;
    font-size: 0.85rem;
  }

  .adders {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1rem;
    font-family: system-ui, sans-serif;
  }
  .adders button {
    font-size: 0.75rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .adders button:hover {
    border-color: var(--accent);
  }
</style>
