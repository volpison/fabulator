<script lang="ts">
  import {
    project,
    selectedPageId,
    mainView,
    updateComicPage,
    addComicPanel,
    updateComicPanel,
    moveComicPanel,
    deleteComicPanel,
    addComicLine,
    updateComicLine,
    moveComicLine,
    deleteComicLine,
  } from "../lib/stores";
  import { platform } from "../lib/platform";
  import {
    COMIC_STAGES,
    STAGE_LABEL,
    comicReadingOrder,
    pageNumber,
    isAfterPageTurn,
    plotWordCount,
    lettersWordCount,
    panelWords,
    lineWords,
    balloonTooLong,
    panelTooWordy,
    pageTooBusy,
    BALLOON_WORD_LIMIT,
    PANEL_WORD_LIMIT,
    PAGE_PANEL_LIMIT,
    LINE_KINDS,
  } from "../lib/comic";
  import type { ComicLine, ComicPanel, ComicStage, LineKind } from "../lib/types";

  const KIND_LABEL: Record<LineKind, string> = {
    dialogue: "Dialogue",
    caption: "Caption",
    thought: "Thought",
    sfx: "SFX",
  };

  $: pages = $project ? comicReadingOrder($project) : [];
  $: page = $project?.pages.find((pg) => pg.id === $selectedPageId) ?? null;
  $: issue = page ? $project?.issues.find((i) => i.id === page.issue_id) ?? null : null;
  $: plotFirst = $project?.script_style !== "full";
  $: characters = $project?.characters ?? [];

  // Nothing picked yet (or the picked page was deleted): start from the first page.
  $: if ($project && !page && pages.length > 0) selectedPageId.set(pages[0].id);

  const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;

  function snippet(text: string, max = 60): string {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }

  function issueTitle(issueId: string): string {
    return $project?.issues.find((i) => i.id === issueId)?.title ?? "";
  }

  function onPlot(pageId: string, e: Event) {
    updateComicPage(pageId, { plot: valueOf(e) });
  }
  function onStage(pageId: string, e: Event) {
    updateComicPage(pageId, { stage: valueOf(e) as ComicStage });
  }
  function onDescription(pageId: string, panelId: string, e: Event) {
    updateComicPanel(pageId, panelId, { description: valueOf(e) });
  }
  function onKind(pageId: string, panelId: string, lineId: string, e: Event) {
    updateComicLine(pageId, panelId, lineId, { kind: valueOf(e) as LineKind });
  }
  function onSpeaker(pageId: string, panelId: string, lineId: string, e: Event) {
    updateComicLine(pageId, panelId, lineId, { speaker_id: valueOf(e) });
  }
  function onText(pageId: string, panelId: string, lineId: string, e: Event) {
    updateComicLine(pageId, panelId, lineId, { text: valueOf(e) });
  }
  function onNote(pageId: string, panelId: string, lineId: string, e: Event) {
    updateComicLine(pageId, panelId, lineId, { note: valueOf(e) });
  }

  async function onDeletePanel(pageId: string, panel: ComicPanel) {
    const empty = !panel.description.trim() && panel.lines.length === 0;
    if (
      !empty &&
      !(await platform().confirm("Delete this panel and everything written in it?", {
        title: "Delete panel",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      }))
    ) {
      return;
    }
    deleteComicPanel(pageId, panel.id);
  }

  /** A short reminder of who can speak: the characters already on the page come first. */
  function speakerOptions(all: { id: string; name: string }[], castIds: string[]) {
    return {
      onPage: all.filter((c) => castIds.includes(c.id)),
      others: all.filter((c) => !castIds.includes(c.id)),
    };
  }

  function lineClass(ln: ComicLine): string {
    return balloonTooLong(ln) ? "too-long" : "";
  }
</script>

{#if $project}
  <div class="comic-manuscript">
    <nav class="pages" aria-label="Pages">
      <button class="back" on:click={() => mainView.set("timeline")} title="Back to the page Timeline (Ctrl+1)">← Timeline</button>
      {#each pages as pg (pg.id)}
        <button
          class="page-item"
          class:selected={pg.id === $selectedPageId}
          aria-current={pg.id === $selectedPageId ? "true" : undefined}
          on:click={() => selectedPageId.set(pg.id)}
        >
          <span class="pi-top">
            <span class="pi-num">{issueTitle(pg.issue_id) ? `${issueTitle(pg.issue_id)} · ` : ""}p. {pageNumber(pg)}</span>
            <span class="dot stage-{pg.stage}" title={STAGE_LABEL[pg.stage]}></span>
          </span>
          <span class="pi-text">{pg.title || snippet(pg.plot) || "Empty page"}</span>
        </button>
      {/each}
    </nav>

    {#if page}
      {@const pg = page}
      {@const speakers = speakerOptions(characters, pg.character_ids)}
      <div class="editor">
        <header class="head">
          <h2>
            {issue ? issue.title + " · " : ""}Page {pageNumber(pg)}
            {#if isAfterPageTurn(pageNumber(pg))}<span class="turn" title="The reader sees this page only after turning the page">Page turn</span>{/if}
          </h2>
          <span class="meta">
            {pg.panels.length} panel{pg.panels.length === 1 ? "" : "s"} · {lettersWordCount(pg)} words of lettering
          </span>
          {#if pageTooBusy(pg)}
            <span class="warn" title="More than {PAGE_PANEL_LIMIT} panels makes them small">Many panels</span>
          {/if}
          <span class="spacer"></span>
          <label class="inline">
            Stage
            <select value={pg.stage} on:change={(e) => onStage(pg.id, e)}>
              {#each COMIC_STAGES as st}
                <option value={st}>{STAGE_LABEL[st]}</option>
              {/each}
            </select>
          </label>
        </header>

        <details class="plot" open={plotFirst || pg.panels.length === 0}>
          <summary>
            {plotFirst ? "Plot" : "Page summary"}
            <em>{plotWordCount(pg)} words{pg.layout.trim() ? " · layout: " + pg.layout : ""}</em>
          </summary>
          <textarea
            rows="5"
            value={pg.plot}
            placeholder={plotFirst
              ? "What happens on this page, in your own words. The artist works from this; add the panels and dialogue once the art is back."
              : "A line or two about what this page does in the story."}
            on:input={(e) => onPlot(pg.id, e)}
          ></textarea>
        </details>

        <div class="panels-head">
          <h3>Panels</h3>
          <span class="hint">
            {plotFirst
              ? "Plot-first: describe the panels as the artist drew them, then letter them."
              : "Full script: describe each panel for the artist, then its dialogue."}
          </span>
        </div>

        {#if pg.panels.length === 0}
          <p class="empty">No panels yet.</p>
        {/if}

        {#each pg.panels as pn, pi (pn.id)}
          <section class="panel" aria-label="Panel {pi + 1}">
            <div class="panel-top">
              <h4>Panel {pi + 1}</h4>
              {#if panelTooWordy(pn)}
                <span class="warn" title="More than {PANEL_WORD_LIMIT} words of lettering crowds the art">{panelWords(pn)} words</span>
              {:else if pn.lines.length}
                <span class="meta">{panelWords(pn)} words</span>
              {/if}
              <span class="spacer"></span>
              <button class="icon" title="Move panel up" aria-label="Move panel up" disabled={pi === 0} on:click={() => moveComicPanel(pg.id, pn.id, pi - 1)}>▲</button>
              <button class="icon" title="Move panel down" aria-label="Move panel down" disabled={pi === pg.panels.length - 1} on:click={() => moveComicPanel(pg.id, pn.id, pi + 1)}>▼</button>
              <button class="icon" title="Delete panel" aria-label="Delete panel" on:click={() => onDeletePanel(pg.id, pn)}>✕</button>
            </div>

            <textarea
              class="desc"
              rows="3"
              value={pn.description}
              placeholder="What the artist draws: framing, action, mood…"
              aria-label="Description of panel {pi + 1}"
              on:input={(e) => onDescription(pg.id, pn.id, e)}
            ></textarea>

            {#each pn.lines as ln, li (ln.id)}
              <div class="line {lineClass(ln)}">
                <span class="order" title="Reading order of the balloons">{li + 1}</span>
                <select class="kind" value={ln.kind} aria-label="Kind of line {li + 1}" on:change={(e) => onKind(pg.id, pn.id, ln.id, e)}>
                  {#each LINE_KINDS as k}
                    <option value={k}>{KIND_LABEL[k]}</option>
                  {/each}
                </select>
                {#if ln.kind === "dialogue" || ln.kind === "thought"}
                  <select class="speaker" value={ln.speaker_id} aria-label="Speaker of line {li + 1}" on:change={(e) => onSpeaker(pg.id, pn.id, ln.id, e)}>
                    <option value="">— who? —</option>
                    {#if speakers.onPage.length}
                      <optgroup label="On this page">
                        {#each speakers.onPage as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
                      </optgroup>
                    {/if}
                    {#if speakers.others.length}
                      <optgroup label={speakers.onPage.length ? "Other characters" : "Characters"}>
                        {#each speakers.others as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
                      </optgroup>
                    {/if}
                  </select>
                {/if}
                <textarea
                  class="text"
                  rows="2"
                  value={ln.text}
                  placeholder={ln.kind === "sfx" ? "Sound effect, e.g. KRAK" : ln.kind === "caption" ? "Narration…" : "What they say…"}
                  aria-label="Text of line {li + 1}"
                  on:input={(e) => onText(pg.id, pn.id, ln.id, e)}
                ></textarea>
                <input
                  class="note"
                  value={ln.note}
                  placeholder="lettering note"
                  aria-label="Lettering note for line {li + 1}"
                  on:input={(e) => onNote(pg.id, pn.id, ln.id, e)}
                />
                {#if balloonTooLong(ln)}
                  <span class="warn" title="Balloons over {BALLOON_WORD_LIMIT} words are hard to letter">{lineWords(ln)} words</span>
                {/if}
                <span class="line-tools">
                  <button class="icon" title="Move up" aria-label="Move line up" disabled={li === 0} on:click={() => moveComicLine(pg.id, pn.id, ln.id, li - 1)}>▲</button>
                  <button class="icon" title="Move down" aria-label="Move line down" disabled={li === pn.lines.length - 1} on:click={() => moveComicLine(pg.id, pn.id, ln.id, li + 1)}>▼</button>
                  <button class="icon" title="Delete line" aria-label="Delete line" on:click={() => deleteComicLine(pg.id, pn.id, ln.id)}>✕</button>
                </span>
              </div>
            {/each}

            <div class="add-line">
              <span>Add</span>
              {#each LINE_KINDS as k}
                <button on:click={() => addComicLine(pg.id, pn.id, k)}>+ {KIND_LABEL[k]}</button>
              {/each}
            </div>
          </section>
        {/each}

        <button class="add-panel" on:click={() => addComicPanel(pg.id)}>+ Add panel</button>
      </div>
    {:else}
      <div class="editor none">
        <p>This comic has no pages yet. Add one in the <button class="link" on:click={() => mainView.set("timeline")}>Timeline</button>.</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .comic-manuscript {
    display: flex;
    height: 100%;
    min-height: 0;
    color: var(--text);
  }

  .pages {
    width: 15rem;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid var(--border);
    background: var(--bg-sidebar);
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .back {
    text-align: left;
    font-size: 0.75rem;
    color: var(--text-muted);
    padding: 0.3rem 0.4rem;
    margin-bottom: 0.25rem;
  }
  .back:hover {
    color: var(--text);
  }
  .page-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    text-align: left;
    padding: 0.4rem 0.55rem;
    border-radius: 6px;
    border: 1px solid transparent;
    color: var(--text);
  }
  .page-item:hover {
    background: var(--bg-panel);
  }
  .page-item.selected {
    background: var(--bg-panel);
    border-color: var(--accent);
  }
  .pi-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .pi-num {
    font-weight: 700;
    color: var(--text);
  }
  .pi-text {
    font-size: 0.78rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--border);
  }
  .dot.stage-art {
    background: #e8892b;
  }
  .dot.stage-dialogue {
    background: #4a8fd9;
  }
  .dot.stage-lettered {
    background: #4caf6d;
  }

  .editor {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 1rem 1.5rem 3rem;
    max-width: 52rem;
  }
  .editor.none {
    color: var(--text-muted);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.9rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  h4 {
    margin: 0;
    font-size: 0.85rem;
  }
  .turn {
    margin-left: 0.5rem;
    font-size: 0.66rem;
    font-weight: 400;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .meta {
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .warn {
    font-size: 0.68rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--danger, #d9534f);
    color: var(--danger, #d9534f);
  }
  .spacer {
    flex: 1;
  }
  .inline {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  textarea,
  input,
  select {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    min-width: 0;
  }
  textarea {
    resize: vertical;
    line-height: 1.5;
    width: 100%;
    box-sizing: border-box;
  }
  select {
    font-size: 0.78rem;
    padding: 0.25rem 0.35rem;
  }

  .plot {
    margin-bottom: 1.25rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem 0.75rem 0.75rem;
    background: var(--bg-panel);
  }
  .plot summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
    margin-bottom: 0.4rem;
  }
  .plot summary em {
    font-style: normal;
    font-weight: 400;
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-left: 0.5rem;
  }

  .panels-head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 0.6rem;
  }
  .hint {
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .empty {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .panel {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.75rem 0.7rem;
    margin-bottom: 0.9rem;
    background: var(--bg-panel);
  }
  .panel-top {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.4rem;
  }
  .desc {
    margin-bottom: 0.5rem;
  }

  .line {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }
  .line .kind,
  .line .speaker {
    flex-shrink: 0;
    max-width: 9rem;
  }
  .line .text {
    flex: 1;
    min-width: 8rem;
  }
  .line .note {
    width: 8rem;
    flex-shrink: 0;
  }
  .line .order {
    flex-shrink: 0;
    width: 1.2rem;
    font-size: 0.7rem;
    color: var(--text-muted);
    padding-top: 0.45rem;
    text-align: center;
  }
  .line.too-long .text {
    border-color: var(--danger, #d9534f);
  }
  .line-tools {
    display: inline-flex;
    flex-shrink: 0;
    gap: 2px;
    padding-top: 0.2rem;
  }
  .icon {
    width: 1.35rem;
    height: 1.35rem;
    font-size: 0.65rem;
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

  .add-line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-top: 0.4rem;
  }
  .add-line button,
  .add-panel {
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }
  .add-line button:hover,
  .add-panel:hover {
    border-color: var(--accent);
  }
  .add-panel {
    padding: 0.35rem 0.9rem;
  }
  .link {
    color: var(--accent);
    text-decoration: underline;
    font-size: inherit;
  }
</style>
