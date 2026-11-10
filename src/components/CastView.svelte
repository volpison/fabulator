<script lang="ts">
  import { project, selectedSceneId, mainView, sidePanel, sidePanelFocus } from "../lib/stores";
  import { castGrid, type CastGrid, type CellState } from "../lib/appearances";

  type Density = "compact" | "comfortable" | "spacious";
  const DENSITIES: Record<Density, { label: string; cell: number; box: number; titles: boolean }> = {
    compact: { label: "Compact", cell: 24, box: 14, titles: false },
    comfortable: { label: "Comfortable", cell: 42, box: 24, titles: true },
    spacious: { label: "Spacious", cell: 54, box: 32, titles: true },
  };
  const STORE_KEY = "fabulator.cast.density";

  function loadDensity(): Density {
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (v === "compact" || v === "comfortable" || v === "spacious") return v;
    } catch {
      /* optional */
    }
    return "comfortable";
  }

  let density: Density = loadDensity();
  function setDensity(d: Density) {
    density = d;
    try {
      localStorage.setItem(STORE_KEY, d);
    } catch {
      /* optional */
    }
  }

  let hoverRow = -1;
  let hoverCol = -1;

  $: dens = DENSITIES[density];
  $: grid = $project ? castGrid($project) : null;
  $: spans = grid ? chapterSpans(grid) : [];
  $: characterCount = grid ? grid.rows.filter((r) => r.type === "character").length : 0;
  $: placeCount = grid ? grid.rows.filter((r) => r.type === "place").length : 0;

  /** Consecutive scene columns that belong to the same chapter. */
  function chapterSpans(g: CastGrid) {
    const out: { number: number; title: string; count: number }[] = [];
    for (const s of g.scenes) {
      const last = out[out.length - 1];
      if (last && last.number === s.chapterNumber) last.count += 1;
      else out.push({ number: s.chapterNumber, title: s.chapterTitle, count: 1 });
    }
    return out;
  }

  function openScene(sceneId: string) {
    selectedSceneId.set(sceneId);
    mainView.set("manuscript");
  }

  function openEntity(type: "character" | "place", id: string) {
    sidePanel.set(type === "character" ? "characters" : "places");
    sidePanelFocus.set(id);
  }

  const meaning: Record<CellState, string> = {
    both: "linked and named in the text",
    linked: "linked, but never named in the text",
    named: "named in the text, but not linked",
    "": "not in this scene",
  };

  $: info =
    grid && hoverRow >= 0 && hoverCol >= 0
      ? `${grid.rows[hoverRow].name || "Untitled"} · Ch ${grid.scenes[hoverCol].chapterNumber}, “${
          grid.scenes[hoverCol].scene.title || "Untitled"
        }” — ${meaning[grid.rows[hoverRow].cells[hoverCol]]}`
      : "";
</script>

{#if grid}
  <div class="cast" style="--cell: {dens.cell}px; --box: {dens.box}px;">
    <div class="legend">
      <span class="key"><i class="swatch both"></i> linked + named</span>
      <span class="key"><i class="swatch linked"></i> linked only</span>
      <span class="key"><i class="swatch named"></i> named only</span>

      <span class="info" aria-live="polite">
        {#if info}{info}{:else}{characterCount} characters · {placeCount} places · {grid.scenes.length} scenes — click a cell to open the scene{/if}
      </span>

      <div class="seg" role="group" aria-label="Grid size">
        {#each Object.entries(DENSITIES) as [id, d]}
          <button class:on={density === id} on:click={() => setDensity(id as Density)}>{d.label}</button>
        {/each}
      </div>
    </div>

    {#if grid.scenes.length === 0 || grid.rows.length === 0}
      <p class="empty">Add some scenes, characters and places to see who appears where.</p>
    {:else}
      <div class="scroll">
        <table>
          <thead>
            <tr class="chapters">
              <th class="name-col corner"></th>
              {#each spans as sp}
                <th class="chapter" colspan={sp.count} title="Ch {sp.number} · {sp.title}">
                  <span class="chnum">{sp.count > 1 || dens.cell >= 40 ? `Ch ${sp.number}` : sp.number}</span>
                  {#if sp.count * dens.cell >= 130}<span class="chtitle">{sp.title}</span>{/if}
                </th>
              {/each}
              <th class="count-col"></th>
            </tr>
            <tr class="scenes">
              <th class="name-col corner">Characters &amp; places</th>
              {#each grid.scenes as s, i (s.scene.id)}
                <th
                  class="scene-col"
                  class:hot={hoverCol === i}
                  class:sel={$selectedSceneId === s.scene.id}
                >
                  <button
                    title="Ch {s.chapterNumber} · {s.scene.title || 'Untitled'}"
                    on:click={() => openScene(s.scene.id)}
                  >
                    {#if dens.titles}<span class="vtitle">{s.scene.title || "Untitled"}</span>{/if}
                    <span class="pos">{s.position}</span>
                  </button>
                </th>
              {/each}
              <th class="count-col" title="Scenes appeared in">Scenes</th>
            </tr>
          </thead>
          <tbody on:mouseleave={() => ((hoverRow = -1), (hoverCol = -1))}>
            {#each grid.rows as row, ri (row.type + ":" + row.id)}
              {#if ri === 0 || grid.rows[ri - 1].type !== row.type}
                <tr class="section">
                  <th colspan={grid.scenes.length + 2}>
                    {row.type === "character" ? `Characters · ${characterCount}` : `Places · ${placeCount}`}
                  </th>
                </tr>
              {/if}
              <tr class="{row.type} entity" class:absent={row.count === 0} class:hot={hoverRow === ri}>
                <th class="name-col" scope="row">
                  <button
                    class="entity-name"
                    title="Show {row.name || 'Untitled'} in the side panel"
                    on:click={() => openEntity(row.type, row.id)}
                  >
                    <span class="dot"></span><span class="label">{row.name || "Untitled"}</span>
                  </button>
                </th>
                {#each row.cells as cell, i}
                  <td
                    class:colhot={hoverCol === i}
                    class:sel={$selectedSceneId === grid.scenes[i].scene.id}
                  >
                    <button
                      class="cell {cell}"
                      aria-label="{row.name}: {meaning[cell]} — {grid.scenes[i].scene.title || 'Untitled'}"
                      on:mouseenter={() => ((hoverRow = ri), (hoverCol = i))}
                      on:focus={() => ((hoverRow = ri), (hoverCol = i))}
                      on:click={() => openScene(grid.scenes[i].scene.id)}
                    ></button>
                  </td>
                {/each}
                <td class="count-col"><span class="count">{row.count}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
{/if}

<style>
  .cast {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 1.1rem;
    padding: 0.6rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    font-size: 0.8rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .key {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    white-space: nowrap;
  }

  .info {
    margin-left: auto;
    min-width: 0;
    font-size: 0.78rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
  }

  .seg {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: var(--bg-sidebar);
    border-radius: 7px;
    flex-shrink: 0;
  }

  .seg button {
    padding: 0.25rem 0.6rem;
    border-radius: 5px;
    font-size: 0.74rem;
    color: var(--text-muted);
  }

  .seg button.on {
    background: var(--bg-panel);
    color: var(--text);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
  }

  .empty {
    padding: 1.5rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .scroll {
    flex: 1;
    overflow: auto;
    padding: 0 1.25rem 1.5rem;
  }

  table {
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.82rem;
  }

  th,
  td {
    padding: 0;
  }

  /* ── sticky headers ── */
  thead th {
    position: sticky;
    background: var(--bg);
    z-index: 3;
  }

  thead .chapters th {
    top: 0;
    height: 2rem;
  }

  thead .scenes th {
    top: 2rem;
    border-bottom: 1px solid var(--border);
  }

  .name-col {
    position: sticky;
    left: 0;
    z-index: 2;
    background: var(--bg);
    text-align: left;
    width: 14rem;
    min-width: 14rem;
    max-width: 14rem;
    padding: 0 0.75rem 0 0;
  }

  thead .name-col {
    z-index: 4;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    vertical-align: bottom;
    padding-bottom: 0.5rem;
  }

  .chapter {
    text-align: left;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-muted);
    padding: 0.55rem 0.25rem 0.3rem 0.5rem;
    border-left: 1px solid var(--border);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 0;
  }

  .chtitle {
    margin-left: 0.4rem;
    font-weight: 500;
  }

  .chnum {
    color: var(--text);
  }

  /* ── scene headers ── */
  .scene-col {
    min-width: var(--cell);
    width: var(--cell);
    vertical-align: bottom;
  }

  .scene-col button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 0.3rem;
    width: 100%;
    padding: 0.3rem 0 0.4rem;
    color: var(--text-muted);
    font-size: 0.74rem;
    border-radius: 6px;
  }

  .scene-col button:hover,
  .scene-col.hot button {
    color: var(--text);
  }

  .vtitle {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    height: 7.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.74rem;
    text-align: left;
  }

  .pos {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .scene-col.sel button {
    color: var(--accent);
  }

  .scene-col.sel {
    box-shadow: inset 0 -3px 0 var(--accent);
  }

  /* ── rows ── */
  .section th {
    position: sticky;
    left: 0;
    text-align: left;
    padding: 1.1rem 0 0.35rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .entity .name-col {
    height: calc(var(--cell) + 2px);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  }

  .entity td {
    border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  }

  .entity-name {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 0.55rem;
    padding: 0 0.5rem;
    height: calc(var(--cell) - 2px);
    border-radius: 6px;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text);
    text-align: left;
  }

  .entity-name:hover {
    background: var(--bg-sidebar);
    color: var(--accent);
  }

  .entity-name .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entity.hot .entity-name {
    background: var(--bg-sidebar);
  }

  .entity.absent .label {
    color: var(--text-faint);
    font-weight: 500;
  }

  tr.character {
    --c: var(--char);
  }

  tr.place {
    --c: var(--place);
  }

  .dot {
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
  }

  td {
    width: var(--cell);
    min-width: var(--cell);
    height: calc(var(--cell) + 2px);
  }

  td.colhot,
  tr.hot td {
    background: color-mix(in srgb, var(--accent) 7%, transparent);
  }

  td.sel {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .cell {
    display: block;
    width: var(--box);
    height: var(--box);
    margin: 0 auto;
    border-radius: 7px;
    border: 2px solid transparent;
    transition: transform 0.08s;
  }

  .cell.both {
    background: var(--c);
    border-color: var(--c);
  }

  .cell.linked {
    background: linear-gradient(135deg, var(--c) 50%, transparent 50%);
    border-color: var(--c);
  }

  .cell.named {
    border-color: var(--c);
    background: transparent;
  }

  .cell:not(.both):not(.linked):not(.named) {
    background: color-mix(in srgb, var(--border) 45%, transparent);
    border-radius: 50%;
    transform: scale(0.32);
  }

  .cell:hover {
    transform: scale(1.12);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .cell:not(.both):not(.linked):not(.named):hover {
    transform: scale(0.5);
  }

  .count-col {
    padding-left: 1rem;
    text-align: left;
    color: var(--text-muted);
    font-size: 0.75rem;
    white-space: nowrap;
  }

  thead .count-col {
    vertical-align: bottom;
    padding-bottom: 0.5rem;
  }

  .count {
    display: inline-block;
    min-width: 1.6rem;
    padding: 0.05rem 0.5rem;
    text-align: center;
    border-radius: 999px;
    background: var(--bg-sidebar);
    color: var(--text);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  /* legend swatches reuse the same look, in the character colour */
  .swatch {
    --c: var(--char);
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 5px;
    border: 2px solid var(--c);
  }

  .swatch.both {
    background: var(--c);
  }

  .swatch.linked {
    background: linear-gradient(135deg, var(--c) 50%, transparent 50%);
  }
</style>
