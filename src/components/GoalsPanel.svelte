<script lang="ts">
  import { project } from "../lib/stores";
  import { stats, progress, goalState, setGoals, restartTodayCount } from "../lib/goalsStore";
  import { formatCount } from "../lib/wordcount";

  let open = false;
  let root: HTMLElement | undefined;
  let button: HTMLButtonElement | undefined;

  const dailyPresets = [250, 500, 1000, 2000];

  $: daily = $progress.daily;
  $: manuscript = $progress.manuscript;
  $: isComic = $project?.story_format === "comic";
  $: chapters = (isComic ? ($project?.issues ?? []) : ($project?.chapters ?? [])).map((c, i) => ({
    number: i + 1,
    title: c.title || "Untitled",
    words: $stats.byChapter.get(c.id) ?? 0,
  }));
  $: biggest = Math.max(1, ...chapters.map((c) => c.words));

  function onKey(e: KeyboardEvent) {
    if (open && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      open = false;
      button?.focus();
    }
  }

  function onWindowPointer(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }

  const fromInput = (e: Event) => (e.currentTarget as HTMLInputElement).value;
</script>

<svelte:window on:pointerdown={onWindowPointer} on:blur={() => (open = false)} />

<div class="goals" bind:this={root} on:keydown={onKey}>
  <button
    class="trigger"
    class:open
    bind:this={button}
    on:click={() => (open = !open)}
    aria-haspopup="dialog"
    aria-expanded={open}
    title="Word count and writing goals"
  >
    <span class="total">{formatCount($stats.total)} words</span>
    <span class="dot" aria-hidden="true">·</span>
    {#if daily}
      <span class="today" class:done={daily.done}>Today {formatCount(daily.value)} / {formatCount(daily.goal)}</span>
      <span class="bar" aria-hidden="true"><i class:done={daily.done} style="width: {daily.ratio * 100}%"></i></span>
    {:else}
      <span class="today">Today +{formatCount($progress.writtenToday)}</span>
    {/if}
  </button>

  {#if open}
    <div class="panel" role="dialog" aria-label="Word count and writing goals">
      <section>
        <div class="big">
          <strong>{formatCount($progress.writtenToday)}</strong>
          <span>words written today</span>
        </div>
        {#if daily}
          <div class="meter"><i class:done={daily.done} style="width: {daily.ratio * 100}%"></i></div>
          <p class="note">
            {#if daily.done}
              Daily goal reached ({daily.percent}%).
            {:else}
              {daily.percent}% of {formatCount(daily.goal)} · {formatCount(daily.remaining)} to go
            {/if}
          </p>
        {/if}
        <button class="link" on:click={restartTodayCount} title="Count today's words from where the manuscript is now">
          Restart today's count
        </button>
      </section>

      <section>
        <h3>Goals</h3>
        <label class="field">
          <span>Daily goal</span>
          <input
            type="number"
            min="0"
            step="50"
            inputmode="numeric"
            placeholder="Off"
            value={$goalState.goals.daily || ""}
            on:change={(e) => setGoals({ daily: fromInput(e) })}
          />
        </label>
        <div class="presets">
          {#each dailyPresets as n}
            <button class:on={$goalState.goals.daily === n} on:click={() => setGoals({ daily: n })}>{formatCount(n)}</button>
          {/each}
          <button on:click={() => setGoals({ daily: 0 })} disabled={!$goalState.goals.daily}>Off</button>
        </div>

        <label class="field">
          <span>Manuscript target</span>
          <input
            type="number"
            min="0"
            step="1000"
            inputmode="numeric"
            placeholder="Off"
            value={$goalState.goals.total || ""}
            on:change={(e) => setGoals({ total: fromInput(e) })}
          />
        </label>
        {#if manuscript}
          <div class="meter"><i class:done={manuscript.done} style="width: {manuscript.ratio * 100}%"></i></div>
          <p class="note">
            {formatCount(manuscript.value)} of {formatCount(manuscript.goal)} words · {manuscript.percent}%
            {#if !manuscript.done}· {formatCount(manuscript.remaining)} to go{/if}
          </p>
        {/if}
      </section>

      <section>
        <h3>{isComic ? "By issue" : "By chapter"}</h3>
        {#if chapters.length === 0}
          <p class="note">{isComic ? "No issues yet." : "No chapters yet."}</p>
        {:else}
          <ul class="chapters">
            {#each chapters as c}
              <li>
                <span class="n">{c.number}</span>
                <span class="t" title={c.title}>{c.title}</span>
                <span class="share" aria-hidden="true"><i style="width: {(c.words / biggest) * 100}%"></i></span>
                <span class="w">{formatCount(c.words)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .goals {
    position: relative;
    height: 100%;
  }

  .trigger {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    height: 100%;
    padding: 0 0.6rem;
    font-size: 0.74rem;
    color: var(--text-muted);
    border-radius: 6px;
    white-space: nowrap;
  }

  .trigger:hover,
  .trigger.open {
    background: var(--bg-sidebar);
    color: var(--text);
  }

  .total {
    color: var(--text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .today {
    font-variant-numeric: tabular-nums;
  }

  .today.done {
    color: var(--ok-fg);
    font-weight: 600;
  }

  .bar {
    width: 4.5rem;
    height: 5px;
    border-radius: 3px;
    background: var(--border);
    overflow: hidden;
  }

  .bar i,
  .meter i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width 0.25s;
  }

  .bar i.done,
  .meter i.done {
    background: var(--place);
  }

  .panel {
    position: absolute;
    right: 0;
    bottom: calc(100% + 6px);
    z-index: 90;
    width: 22rem;
    max-height: min(32rem, calc(100vh - 6rem));
    overflow-y: auto;
    padding: 0.75rem 0.9rem;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: var(--text);
    font-size: 0.82rem;
    white-space: normal;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  h3 {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .big {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .big strong {
    font-size: 1.9rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .big span {
    color: var(--text-muted);
  }

  .meter {
    height: 8px;
    border-radius: 4px;
    background: var(--bg-sidebar);
    overflow: hidden;
  }

  .note {
    font-size: 0.76rem;
    color: var(--text-muted);
  }

  .link {
    align-self: flex-start;
    font-size: 0.74rem;
    color: var(--accent);
    padding: 0.1rem 0;
  }

  .link:hover {
    text-decoration: underline;
  }

  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .field input {
    width: 7.5rem;
    padding: 0.3rem 0.5rem;
    font: inherit;
    text-align: right;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .field input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .presets {
    display: flex;
    gap: 0.3rem;
    justify-content: flex-end;
    margin-bottom: 0.4rem;
  }

  .presets button {
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.72rem;
    color: var(--text-muted);
    background: var(--bg-sidebar);
  }

  .presets button:hover:not(:disabled) {
    color: var(--text);
  }

  .presets button.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .presets button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .chapters {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .chapters li {
    display: grid;
    grid-template-columns: 1.3rem minmax(0, 1fr) 4rem 3.2rem;
    align-items: center;
    gap: 0.5rem;
  }

  .n {
    color: var(--text-faint);
    font-size: 0.72rem;
    text-align: right;
  }

  .t {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .share {
    height: 5px;
    border-radius: 3px;
    background: var(--bg-sidebar);
    overflow: hidden;
  }

  .share i {
    display: block;
    height: 100%;
    background: var(--char);
    border-radius: inherit;
  }

  .w {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
</style>
