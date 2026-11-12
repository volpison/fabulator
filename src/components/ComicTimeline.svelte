<script lang="ts">
  import {
    project,
    selectedPageId,
    addComicIssue,
    renameComicIssue,
    deleteComicIssue,
    addComicPage,
    updateComicPage,
    moveComicPage,
    deleteComicPage,
    mainView,
  } from "../lib/stores";
  import { platform } from "../lib/platform";
  import {
    COMIC_STAGES,
    STAGE_LABEL,
    pagesInIssue,
    pageNumber,
    pageSide,
    isAfterPageTurn,
    plotWordCount,
    SCRIPT_STYLE_LABEL,
  } from "../lib/comic";
  import { spreadRows, issueSummary } from "../lib/comicedit";
  import type { ComicPage, ComicStage } from "../lib/types";

  $: issues = $project?.issues ?? [];
  $: selected = $project?.pages.find((pg) => pg.id === $selectedPageId) ?? null;
  $: selectedIssue = selected ? issues.find((i) => i.id === selected.issue_id) ?? null : null;
  $: styleLabel = $project?.script_style ? SCRIPT_STYLE_LABEL[$project.script_style] : "";

  const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;

  function snippet(text: string, max = 150): string {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }

  function select(id: string) {
    selectedPageId.set(id);
  }

  /** Double-click (or Enter on the card) opens the page in the writing view, like a scene in a novel. */
  function open(id: string) {
    selectedPageId.set(id);
    mainView.set("manuscript");
  }

  function onCardKey(id: string, e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return; // keys typed in the card's own controls are theirs
    if (e.key === " ") {
      e.preventDefault();
      select(id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      open(id);
    }
  }

  function onAddPage() {
    addComicPage(selected?.issue_id);
  }

  /** Page `pg` one place earlier (-1) or later (+1) inside its issue. */
  function nudge(pg: ComicPage, delta: number) {
    moveComicPage(pg.id, pg.issue_id, pg.order + delta);
  }

  async function onDeletePage(pg: ComicPage) {
    const empty = !pg.plot.trim() && pg.panels.length === 0 && !pg.notes.trim() && !pg.title.trim();
    if (
      !empty &&
      !(await platform().confirm(`Delete page ${pageNumber(pg)}? Its plot, panels and notes will be removed.`, {
        title: "Delete page",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      }))
    ) {
      return;
    }
    deleteComicPage(pg.id);
  }

  function setStage(id: string, e: Event) {
    updateComicPage(id, { stage: valueOf(e) as ComicStage });
  }
  function setField(id: string, field: "title" | "layout" | "plot" | "notes", e: Event) {
    updateComicPage(id, { [field]: valueOf(e) });
  }
</script>

{#if $project}
  <div class="comic-timeline">
    <div class="toolbar">
      <button class="add" on:click={onAddPage}>+ Add page</button>
      <button class="add" on:click={() => addComicIssue()}>+ Add issue</button>
      {#if styleLabel}<span class="style" title="The scripting style of this comic">{styleLabel}</span>{/if}
      <span class="hint">
        Pages are grouped the way a reader sees them: page 1 alone, then facing pairs ·
        “Page turn” marks the pages revealed by turning · Click a page to edit its plot · Double-click (or Enter) to write its panels
      </span>
    </div>

    <div class="scroll">
      {#each issues as issue (issue.id)}
        {@const sum = issueSummary($project, issue.id)}
        {@const rows = spreadRows(pagesInIssue($project.pages, issue.id))}
        <section class="issue" aria-label={issue.title}>
          <header class="issue-head">
            <input
              class="issue-title"
              value={issue.title}
              aria-label="Issue title"
              on:change={(e) => renameComicIssue(issue.id, { title: valueOf(e).trim() || issue.title })}
            />
            <span class="counts">
              {sum.pages} page{sum.pages === 1 ? "" : "s"} · {sum.panels} panel{sum.panels === 1 ? "" : "s"}
            </span>
            <span class="stage-counts">
              {#each COMIC_STAGES as st}
                {#if sum.byStage[st] > 0}
                  <span class="chip stage-{st}" title="{STAGE_LABEL[st]}: {sum.byStage[st]}">{STAGE_LABEL[st]} {sum.byStage[st]}</span>
                {/if}
              {/each}
            </span>
            {#if sum.pages === 0}
              <button class="icon" title="Delete this empty issue" aria-label="Delete empty issue" on:click={() => deleteComicIssue(issue.id)}>✕</button>
            {/if}
          </header>

          {#if rows.length === 0}
            <p class="empty">
              No pages yet.
              <button class="link" on:click={() => addComicPage(issue.id)}>Add the first page</button>
            </p>
          {/if}

          <div class="spreads">
            {#each rows as row (row.numbers[0])}
              <div class="spread" class:alone-right={row.pages.length === 1 && pageSide(row.numbers[0]) === "right"} class:alone-left={row.pages.length === 1 && pageSide(row.numbers[0]) === "left"}>
                {#each row.pages as pg (pg.id)}
                  <div
                    class="card"
                    class:selected={pg.id === $selectedPageId}
                    role="button"
                    tabindex="0"
                    aria-pressed={pg.id === $selectedPageId}
                    aria-label="Page {pageNumber(pg)}{pg.title ? ': ' + pg.title : ''}"
                    on:click={() => select(pg.id)}
                    on:dblclick={() => open(pg.id)}
                    on:keydown={(e) => onCardKey(pg.id, e)}
                  >
                    <div class="card-top">
                      <span class="num">p. {pageNumber(pg)}</span>
                      <span class="side">{pageSide(pageNumber(pg)) === "right" ? "right" : "left"}</span>
                      {#if isAfterPageTurn(pageNumber(pg))}<span class="turn" title="The reader sees this page only after turning the page">Page turn</span>{/if}
                      <span class="spacer"></span>
                      <button class="icon" title="Move earlier" aria-label="Move page earlier" disabled={pg.order === 0} on:click|stopPropagation={() => nudge(pg, -1)}>◀</button>
                      <button class="icon" title="Move later" aria-label="Move page later" disabled={pg.order >= sum.pages - 1} on:click|stopPropagation={() => nudge(pg, 1)}>▶</button>
                      <button class="icon" title="Delete page" aria-label="Delete page" on:click|stopPropagation={() => onDeletePage(pg)}>✕</button>
                    </div>
                    <div class="card-title">{pg.title || "Untitled page"}</div>
                    {#if pg.plot.trim()}
                      <div class="card-plot">{snippet(pg.plot)}</div>
                    {:else}
                      <div class="card-plot none">No plot yet</div>
                    {/if}
                    <div class="card-bottom">
                      <span class="panels" title="Panels written on this page">▦ {pg.panels.length}</span>
                      {#if pg.layout.trim()}<span class="layout" title="Planned layout">{pg.layout}</span>{/if}
                      <span class="spacer"></span>
                      <select
                        class="stage stage-{pg.stage}"
                        aria-label="Stage of page {pageNumber(pg)}"
                        value={pg.stage}
                        on:click|stopPropagation
                        on:keydown|stopPropagation
                        on:change={(e) => setStage(pg.id, e)}
                      >
                        {#each COMIC_STAGES as st}
                          <option value={st}>{STAGE_LABEL[st]}</option>
                        {/each}
                      </select>
                    </div>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>

    {#if selected}
      {@const pg = selected}
      <section class="details" aria-label="Page details">
        <h3>Page {pageNumber(pg)}{selectedIssue ? ` · ${selectedIssue.title}` : ""}</h3>
        <div class="fields">
          <label class="field">
            <span>Title</span>
            <input value={pg.title} placeholder="Optional name, e.g. Splash: the bridge" on:input={(e) => setField(pg.id, "title", e)} />
          </label>
          <label class="field">
            <span>Layout</span>
            <input value={pg.layout} placeholder="e.g. 3 tiers: 2/1/3, or splash" on:input={(e) => setField(pg.id, "layout", e)} />
          </label>
          <label class="field">
            <span>Stage</span>
            <select value={pg.stage} on:change={(e) => setStage(pg.id, e)}>
              {#each COMIC_STAGES as st}
                <option value={st}>{STAGE_LABEL[st]}</option>
              {/each}
            </select>
          </label>
        </div>
        <label class="field wide">
          <span>Plot <em>{plotWordCount(pg)} words</em></span>
          <textarea
            rows="6"
            value={pg.plot}
            placeholder="What happens on this page, in your own words. The artist works from this; panels and dialogue can come later."
            on:input={(e) => setField(pg.id, "plot", e)}
          ></textarea>
        </label>
        <label class="field wide">
          <span>Notes <em>private</em></span>
          <textarea rows="2" value={pg.notes} on:input={(e) => setField(pg.id, "notes", e)}></textarea>
        </label>
      </section>
    {/if}
  </div>
{/if}

<style>
  .comic-timeline {
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
  .style {
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

  .issue {
    margin-bottom: 2rem;
  }
  .issue-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }
  .issue-title {
    font-size: 1.05rem;
    font-weight: 700;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--text);
    padding: 0.15rem 0.4rem;
    min-width: 8rem;
  }
  .issue-title:hover,
  .issue-title:focus {
    border-color: var(--border);
    outline: none;
  }
  .counts {
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .stage-counts {
    display: inline-flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .chip {
    font-size: 0.68rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--border);
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

  /* A spread is the two pages seen together; a lone page sits on its own side of the book. */
  .spreads {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    max-width: 46rem;
  }
  .spread {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-sidebar);
  }
  .spread.alone-right .card {
    grid-column: 2;
  }
  .spread.alone-left .card {
    grid-column: 1;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--border);
    border-radius: 5px;
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
    gap: 0.4rem;
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .num {
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .turn {
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.66rem;
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
  .card-title {
    font-weight: 600;
    font-size: 0.88rem;
  }
  .card-plot {
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--text-muted);
    min-height: 2.2rem;
  }
  .card-plot.none {
    font-style: italic;
    opacity: 0.7;
  }
  .layout {
    max-width: 8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    max-height: 45%;
    overflow-y: auto;
    padding: 0.75rem 1.25rem 1rem;
    border-top: 1px solid var(--border);
    background: var(--bg-panel);
  }
  .details h3 {
    margin: 0 0 0.6rem;
    font-size: 0.9rem;
  }
  .fields {
    display: grid;
    grid-template-columns: 2fr 2fr 1fr;
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
  .field textarea {
    resize: vertical;
    line-height: 1.5;
  }
</style>
