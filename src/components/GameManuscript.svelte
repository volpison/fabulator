<script lang="ts">
  import { tick } from "svelte";
  import {
    project,
    selectedNodeId,
    mainView,
    addCharacter,
    updateGameNode,
    addGameElement,
    updateGameElement,
    moveGameElement,
    deleteGameElement,
    addGameOption,
    updateGameOption,
    deleteGameOption,
    addGameLink,
    updateGameLink,
    deleteGameLink,
    setGameRules,
  } from "../lib/stores";
  import { ELEMENT_KINDS, ELEMENT_LABEL, nodesInQuest } from "../lib/game";
  import { gameReadingOrder, nodeLabels, nodeWordCount, replySpeaker } from "../lib/gameedit";
  import { characterNamed } from "../lib/screenplayedit";
  import { SCENE_STATUSES, STATUS_LABEL, type SceneStatus } from "../lib/labels";
  import RulesEditor from "./RulesEditor.svelte";
  import type { Condition, Effect, GameElement, GameElementKind, GameNode } from "../lib/types";

  $: game = $project?.game ?? null;
  $: quests = game?.quests ?? [];
  $: ordered = $project ? gameReadingOrder($project) : [];
  $: node = game?.nodes.find((n) => n.id === $selectedNodeId) ?? null;
  $: quest = node ? quests.find((q) => q.id === node.quest_id) ?? null : null;
  $: labels = $project ? nodeLabels($project) : new Map<string, string>();
  $: characters = $project?.characters ?? [];
  $: names = new Map(characters.map((c) => [c.id, c.name]));
  $: titleOf = new Map((game?.nodes ?? []).map((n) => [n.id, `${labels.get(n.id) ?? ""} ${n.title.trim() || "Untitled node"}`.trim()]));

  // Nothing picked yet (or the picked node was deleted): start from the first node.
  $: if ($project && !node && ordered.length > 0) selectedNodeId.set(ordered[0].id);

  const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;

  /** A textarea as tall as its text. */
  function autosize(el: HTMLTextAreaElement, _text: string) {
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    return { update: fit };
  }

  async function focusText(id: string, atEnd = true) {
    await tick();
    const t = document.getElementById(`gm-text-${id}`) as HTMLTextAreaElement | HTMLInputElement | null;
    if (!t) return;
    t.focus();
    const pos = atEnd ? t.value.length : 0;
    t.setSelectionRange(pos, pos);
  }
  async function focusSpeaker(id: string) {
    await tick();
    (document.getElementById(`gm-speaker-${id}`) as HTMLInputElement | null)?.focus();
  }

  function addAfter(n: GameNode, index: number, kind: GameElementKind, speakerId = "") {
    const id = addGameElement(n.id, kind, index + 1, speakerId);
    if (!id) return;
    if (kind === "dialogue" && !speakerId) void focusSpeaker(id);
    else void focusText(id);
  }

  /** The keys that make writing fast: see the hint above the page. */
  function onKey(e: KeyboardEvent, n: GameNode, i: number) {
    const el = n.elements[i];
    const t = e.target as HTMLTextAreaElement | HTMLInputElement;
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) addAfter(n, i, "dialogue", replySpeaker(n.elements, i));
      else addAfter(n, i, "narration");
    } else if (e.key === "Backspace" && t.value === "" && t.selectionStart === 0 && t.selectionEnd === 0) {
      // An empty element goes away with Backspace, and the cursor moves to its neighbour.
      if (el.kind === "dialogue" && (el.speaker_id || el.parenthetical)) return;
      if (el.kind === "choice" && el.options.length > 0) return;
      e.preventDefault();
      const neighbour = n.elements[i - 1] ?? n.elements[i + 1];
      deleteGameElement(n.id, el.id);
      if (neighbour) void focusText(neighbour.id, i > 0);
    } else if (e.key === "ArrowUp" && t.selectionStart === 0 && t.selectionEnd === 0 && i > 0) {
      e.preventDefault();
      void focusText(n.elements[i - 1].id, true);
    } else if (e.key === "ArrowDown" && t.selectionStart === t.value.length && t.selectionEnd === t.value.length && i < n.elements.length - 1) {
      e.preventDefault();
      void focusText(n.elements[i + 1].id, false);
    }
  }

  const titleCaseIfShouting = (name: string) =>
    name === name.toUpperCase() && name !== name.toLowerCase()
      ? name.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
      : name;

  /** Typing a name picks that character, or makes a new one. */
  function onSpeaker(n: GameNode, el: GameElement, e: Event) {
    const typed = valueOf(e).trim();
    if (!typed) {
      updateGameElement(n.id, el.id, { speaker_id: "" });
      return;
    }
    let id = $project ? characterNamed($project, typed) : "";
    if (!id) id = addCharacter(titleCaseIfShouting(typed));
    updateGameElement(n.id, el.id, { speaker_id: id });
  }

  const onText = (n: GameNode, el: GameElement, e: Event) => updateGameElement(n.id, el.id, { text: valueOf(e) });
  const onKind = (n: GameNode, el: GameElement, e: Event) => updateGameElement(n.id, el.id, { kind: valueOf(e) as GameElementKind });

  async function addOption(n: GameNode, el: GameElement) {
    const id = addGameOption(n.id, el.id);
    if (!id) return;
    await tick();
    document.getElementById(`gm-opt-${id}`)?.focus();
  }

  /** The nodes a choice or link may lead to: every node of the game, in reading order. */
  $: targets = ordered.filter((o) => o.id !== node?.id);
</script>

{#if $project}
  <div class="gm">
    <nav class="nodes" aria-label="Nodes">
      <button class="back" on:click={() => mainView.set("timeline")} title="Back to the Timeline (Ctrl+1)">← Timeline</button>
      {#each quests as q (q.id)}
        <div class="q-title">{q.title}</div>
        {#each nodesInQuest(game?.nodes ?? [], q.id) as n (n.id)}
          <button
            class="node-item"
            class:selected={n.id === $selectedNodeId}
            aria-current={n.id === $selectedNodeId ? "true" : undefined}
            on:click={() => selectedNodeId.set(n.id)}
          >
            <span class="ni-top">
              <span class="ni-num">{labels.get(n.id)}</span>
              <span class="ni-words">{nodeWordCount(n)} w</span>
            </span>
            <span class="ni-title" class:none={!n.title.trim()}>{n.title.trim() || "Untitled node"}</span>
          </button>
        {/each}
      {/each}
    </nav>

    {#if node}
      {@const n = node}
      <div class="editor">
        <header class="head">
          <h2>{quest ? `${quest.title} · ` : ""}Node {labels.get(n.id)}</h2>
          <span class="stats">{nodeWordCount(n)} words</span>
          <span class="spacer"></span>
          <select value={n.status} aria-label="Status" on:change={(e) => updateGameNode(n.id, { status: valueOf(e) as SceneStatus })}>
            {#each SCENE_STATUSES as st}
              <option value={st}>{STATUS_LABEL[st]}</option>
            {/each}
          </select>
        </header>

        <input class="title" value={n.title} placeholder="Node title (e.g. Search the well)" aria-label="Node title" on:input={(e) => updateGameNode(n.id, { title: valueOf(e) })} />
        <datalist id="gm-chars">{#each characters as c}<option value={c.name}></option>{/each}</datalist>

        <details class="summary" open={!n.elements.length}>
          <summary>Summary</summary>
          <textarea rows="3" value={n.summary} placeholder="What happens here, in your own words." on:input={(e) => updateGameNode(n.id, { summary: valueOf(e) })}></textarea>
        </details>

        <p class="hint">
          <b>Enter</b> next paragraph · <b>Shift+Enter</b> new line · <b>Ctrl+Enter</b> reply (the other speaker) ·
          <b>Backspace</b> on an empty element removes it · <b>↑ ↓</b> at the edge move between elements ·
          typing a new name in a dialogue adds that character
        </p>

        <div class="paper">
          {#if n.elements.length === 0}
            <p class="empty">Nothing written in this node yet. Add the first element:</p>
          {/if}

          {#each n.elements as el, i (el.id)}
            <div class="el {el.kind}">
              <div class="gutter">
                <select
                  class="kind"
                  value={el.kind}
                  aria-label="Element type"
                  disabled={el.kind === "choice" && el.options.length > 0}
                  title={el.kind === "choice" && el.options.length > 0 ? "Remove the options first to change the type" : ""}
                  on:change={(e) => onKind(n, el, e)}
                >
                  {#each ELEMENT_KINDS as k}
                    <option value={k}>{ELEMENT_LABEL[k]}</option>
                  {/each}
                </select>
                <span class="tools">
                  <button title="Move up" aria-label="Move element up" disabled={i === 0} on:click={() => moveGameElement(n.id, el.id, i - 1)}>▲</button>
                  <button title="Move down" aria-label="Move element down" disabled={i === n.elements.length - 1} on:click={() => moveGameElement(n.id, el.id, i + 1)}>▼</button>
                  <button title="Delete element" aria-label="Delete element" on:click={() => deleteGameElement(n.id, el.id)}>✕</button>
                </span>
              </div>

              <div class="body">
                {#if el.kind === "dialogue"}
                  <div class="cue">
                    <input
                      id="gm-speaker-{el.id}"
                      class="speaker"
                      class:missing={!el.speaker_id}
                      value={names.get(el.speaker_id) ?? ""}
                      list="gm-chars"
                      placeholder="Character"
                      aria-label="Who speaks"
                      on:change={(e) => onSpeaker(n, el, e)}
                      on:keydown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void focusText(el.id);
                        }
                      }}
                    />
                    <span class="paren">
                      (<input
                        value={el.parenthetical}
                        placeholder="how it is said"
                        aria-label="Parenthetical"
                        on:change={(e) => updateGameElement(n.id, el.id, { parenthetical: valueOf(e) })}
                      />)
                    </span>
                  </div>
                  <textarea
                    id="gm-text-{el.id}"
                    class="text"
                    rows="1"
                    use:autosize={el.text}
                    value={el.text}
                    placeholder="Dialogue"
                    on:input={(e) => onText(n, el, e)}
                    on:keydown={(e) => onKey(e, n, i)}
                  ></textarea>
                {:else if el.kind === "choice"}
                  <textarea
                    id="gm-text-{el.id}"
                    class="text"
                    rows="1"
                    use:autosize={el.text}
                    value={el.text}
                    placeholder="What the player is asked (optional)"
                    on:input={(e) => onText(n, el, e)}
                    on:keydown={(e) => onKey(e, n, i)}
                  ></textarea>
                  <ol class="options">
                    {#each el.options as o (o.id)}
                      <li>
                        <input
                          id="gm-opt-{o.id}"
                          class="opt-text"
                          value={o.text}
                          placeholder="What the player can say or do"
                          aria-label="Option text"
                          on:input={(e) => updateGameOption(n.id, el.id, o.id, { text: valueOf(e) })}
                        />
                        <select
                          class="opt-to"
                          value={o.to}
                          aria-label="Where this option leads"
                          on:change={(e) => updateGameOption(n.id, el.id, o.id, { to: valueOf(e) })}
                        >
                          <option value="">→ nowhere yet</option>
                          {#each targets as t}
                            <option value={t.id}>→ {titleOf.get(t.id)}</option>
                          {/each}
                        </select>
                        <button class="x" title="Remove option" aria-label="Remove option" on:click={() => deleteGameOption(n.id, el.id, o.id)}>✕</button>
                        <details class="rules-d">
                          <summary>Conditions and effects{o.requires.length + o.effects.length ? ` (${o.requires.length + o.effects.length})` : ""}</summary>
                          <RulesEditor
                            mode="conditions"
                            title="Offered only when"
                            rows={o.requires}
                            onchange={(rows) => setGameRules({ kind: "option", nodeId: n.id, elementId: el.id, optionId: o.id }, "requires", rows as Condition[])}
                          />
                          <RulesEditor
                            mode="effects"
                            title="Choosing it"
                            rows={o.effects}
                            onchange={(rows) => setGameRules({ kind: "option", nodeId: n.id, elementId: el.id, optionId: o.id }, "effects", rows as Effect[])}
                          />
                        </details>
                      </li>
                    {/each}
                  </ol>
                  <button class="small" on:click={() => addOption(n, el)}>+ Option</button>
                {:else}
                  <textarea
                    id="gm-text-{el.id}"
                    class="text"
                    rows="1"
                    use:autosize={el.text}
                    value={el.text}
                    placeholder={el.kind === "note" ? "Private note (never exported)" : "Narration"}
                    on:input={(e) => onText(n, el, e)}
                    on:keydown={(e) => onKey(e, n, i)}
                  ></textarea>
                {/if}
              </div>
            </div>
          {/each}

          <div class="adders">
            <button on:click={() => addAfter(n, n.elements.length - 1, "narration")}>+ Narration</button>
            <button on:click={() => addAfter(n, n.elements.length - 1, "dialogue")}>+ Dialogue</button>
            <button on:click={() => addAfter(n, n.elements.length - 1, "choice")}>+ Choice</button>
            <button on:click={() => addAfter(n, n.elements.length - 1, "note")}>+ Note</button>
          </div>
        </div>

        <section class="node-rules" aria-label="Rules of this node">
          <RulesEditor
            mode="conditions"
            title="This node is available when"
            rows={n.requires}
            onchange={(rows) => setGameRules({ kind: "node", nodeId: n.id }, "requires", rows as Condition[])}
          />
          <RulesEditor
            mode="effects"
            title="When this node happens"
            rows={n.effects}
            onchange={(rows) => setGameRules({ kind: "node", nodeId: n.id }, "effects", rows as Effect[])}
          />
        </section>

        <section class="links" aria-label="Where this node leads">
          <h3>Leads to</h3>
          <p class="hint">Ways out of this node besides the options of a choice. A way out may be open only when some conditions hold.</p>
          {#each n.links as l (l.id)}
            <div class="link-row">
              <select value={l.to} aria-label="Leads to" on:change={(e) => updateGameLink(n.id, l.id, { to: valueOf(e) })}>
                {#each targets as t}
                  <option value={t.id}>→ {titleOf.get(t.id)}</option>
                {/each}
                {#if !targets.some((t) => t.id === l.to)}<option value={l.to}>→ {titleOf.get(l.to) ?? "?"}</option>{/if}
              </select>
              <input value={l.label} placeholder="Label (optional)" aria-label="Label" on:input={(e) => updateGameLink(n.id, l.id, { label: valueOf(e) })} />
              <button class="x" title="Remove" aria-label="Remove this way out" on:click={() => deleteGameLink(n.id, l.id)}>✕</button>
            </div>
            <details class="rules-d link-rules">
              <summary>Open only when{l.requires.length ? ` (${l.requires.length})` : ""}</summary>
              <RulesEditor
                mode="conditions"
                title="This way out is open when"
                rows={l.requires}
                onchange={(rows) => setGameRules({ kind: "link", nodeId: n.id, linkId: l.id }, "requires", rows as Condition[])}
              />
            </details>
          {/each}
          {#if targets.length > 0}
            <select class="add-link" value="" aria-label="Add a way out" on:change={(e) => { const to = valueOf(e); if (to) addGameLink(n.id, to); e.currentTarget.value = ""; }}>
              <option value="">+ Add a way out…</option>
              {#each targets as t}
                <option value={t.id}>→ {titleOf.get(t.id)}</option>
              {/each}
            </select>
          {:else}
            <p class="empty">Add another node in the Timeline to link to it.</p>
          {/if}
        </section>
      </div>
    {:else}
      <div class="editor"><p class="empty">No nodes yet. Add one in the Timeline.</p></div>
    {/if}
  </div>
{/if}

<style>
  .gm {
    display: flex;
    height: 100%;
    min-height: 0;
    color: var(--text);
  }

  .nodes {
    width: 15rem;
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
  .q-title {
    margin-top: 0.5rem;
    padding: 0 0.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .node-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    text-align: left;
    padding: 0.4rem 0.55rem;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--text);
  }
  .node-item:hover {
    background: var(--bg);
  }
  .node-item.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg-panel));
  }
  .ni-top {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  .ni-num {
    font-weight: 700;
    color: var(--text);
  }
  .ni-title {
    font-size: 0.8rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .ni-title.none {
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
  .head,
  .title,
  .summary,
  .hint,
  .paper,
  .links {
    max-width: 44rem;
    margin-left: auto;
    margin-right: auto;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.6rem;
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
  .title {
    display: block;
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: 1.15rem;
    font-weight: 700;
    padding: 0.35rem 0.5rem;
    margin-bottom: 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .summary {
    margin-bottom: 0.6rem;
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
    margin-bottom: 0.8rem;
    font-size: 0.7rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .paper {
    padding: 1.25rem 1.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-panel);
    font-size: 0.95rem;
    line-height: 1.5;
  }
  .empty {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .el {
    display: grid;
    grid-template-columns: 1fr;
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

  .dialogue .cue {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .cue .speaker {
    width: 11rem;
    font-weight: 700;
  }
  .cue .speaker.missing {
    border-color: color-mix(in srgb, #d9534f 60%, var(--border));
  }
  .paren {
    display: flex;
    align-items: baseline;
    color: var(--text-muted);
    flex: 1;
  }
  .paren input {
    font-style: italic;
  }
  .dialogue .text {
    margin-left: 1rem;
    width: calc(100% - 1rem);
  }

  .choice .body {
    padding: 0.5rem 0.65rem;
    border-left: 3px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    border-radius: 0 6px 6px 0;
  }
  .options {
    list-style: decimal;
    margin: 0.4rem 0 0.3rem;
    padding-left: 1.4rem;
  }
  .options li {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    margin-bottom: 0.25rem;
  }
  .options .opt-text {
    flex: 3;
  }
  .options .opt-to {
    flex: 2;
    min-width: 0;
  }
  .x {
    width: 1.3rem;
    height: 1.3rem;
    font-size: 0.65rem;
    color: var(--text-muted);
    border-radius: 4px;
  }
  .x:hover {
    background: var(--bg-sidebar);
    color: var(--text);
  }
  .small,
  .adders button {
    font-size: 0.75rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .small:hover,
  .adders button:hover {
    border-color: var(--accent);
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
  }

  .links {
    margin-top: 1.25rem;
  }
  .links h3 {
    margin: 0 0 0.3rem;
    font-size: 0.9rem;
  }
  .link-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    margin-bottom: 0.3rem;
  }
  .link-row select {
    flex: 2;
    min-width: 0;
  }
  .link-row input {
    flex: 2;
    font: inherit;
    font-size: 0.8rem;
    padding: 0.25rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    min-width: 0;
  }
  .node-rules {
    max-width: 44rem;
    margin: 1rem auto 0;
  }
  .rules-d {
    flex-basis: 100%;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .rules-d summary {
    cursor: pointer;
  }
  .options li {
    flex-wrap: wrap;
  }
  .link-rules {
    margin: -0.1rem 0 0.4rem 0.4rem;
  }
  .add-link {
    margin-top: 0.3rem;
  }
</style>
