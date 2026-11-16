<script lang="ts">
  import { project, gameCheckOpen, selectedNodeId, mainView } from "../lib/stores";
  import { checkGame, countIssues, type CheckSeverity } from "../lib/gamecheck";
  import { applyEffects, candidates, chooseOption, emptyState, holdsAll, openExits, playNode, type GameState } from "../lib/gameplay";
  import { describeEffects, contextOf } from "../lib/gamerules";
  import { nodeLabels } from "../lib/gameedit";

  let tab: "checks" | "playtest" = "checks";
  let state: GameState = emptyState();
  let current = "";
  let chosen = new Set<string>();
  let log: string[] = [];

  $: issues = $project ? checkGame($project) : [];
  $: counts = countIssues(issues);
  $: game = $project?.game;
  $: labels = $project ? nodeLabels($project) : new Map<string, string>();
  $: ctx = $project ? contextOf($project) : null;
  $: cands = $project ? candidates($project, state) : [];
  $: available = cands.filter((c) => c.unmet.length === 0);
  $: blocked = cands.filter((c) => c.unmet.length > 0);
  $: currentNode = game?.nodes.find((n) => n.id === current);
  $: exits = $project && currentNode ? openExits($project, state, currentNode) : [];
  $: choices = currentNode ? currentNode.elements.filter((e) => e.kind === "choice" && e.options.length > 0) : [];
  $: learned = state.abilities.map((a) => {
    const [ch, ab] = a.split("|");
    const who = !ch ? "The player" : ($project?.characters.find((c) => c.id === ch)?.name ?? ch);
    return `${who}: ${$project?.abilities.find((x) => x.id === ab)?.name ?? ab}`;
  });

  const SEV: Record<CheckSeverity, string> = { error: "Problem", warning: "Warning", info: "Note" };
  const title = (id: string) => game?.nodes.find((n) => n.id === id)?.title.trim() || "Untitled node";

  const close = () => gameCheckOpen.set(false);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  function goTo(nodeId?: string) {
    if (nodeId) {
      selectedNodeId.set(nodeId);
      mainView.set("manuscript");
    } else mainView.set("timeline");
    close();
  }

  const say = (t: string) => (log = [t, ...log].slice(0, 40));

  function play(id: string) {
    if (!$project) return;
    const n = game?.nodes.find((x) => x.id === id);
    state = playNode($project, state, id);
    current = id;
    say(`Played ${labels.get(id) ?? ""} “${n?.title.trim() || "Untitled node"}”${n && n.effects.length && ctx ? ` — ${describeEffects(ctx, n.effects)}` : ""}`);
  }

  function choose(elementId: string, optionId: string, text: string, effectsText: string) {
    if (!$project || !currentNode) return;
    const key = `${currentNode.id}/${optionId}`;
    if (chosen.has(key)) return;
    state = chooseOption($project, state, currentNode.id, elementId, optionId);
    chosen = new Set(chosen).add(key);
    say(`Chose “${text.trim() || "…"}”${effectsText ? ` — ${effectsText}` : ""}`);
  }

  function reset() {
    state = emptyState();
    current = "";
    chosen = new Set();
    log = [];
  }

  const setFlag = (id: string, on: boolean) => (state = applyEffects(state, [{ kind: "set", variable_id: id, to: on }]));
  const setNumber = (id: string, v: number) => (state = applyEffects(state, [{ kind: "add", variable_id: id, amount: (Number.isFinite(v) ? Math.trunc(v) : 0) - (state.numbers[id] ?? 0) }]));
  const setItem = (id: string, v: number) => (state = applyEffects(state, [{ kind: "give", item_id: id, amount: (Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0) - (state.items[id] ?? 0) }]));
  const isOn = (e: Event) => (e.currentTarget as HTMLInputElement).checked;
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);
  const optionEffects = (effects: Parameters<typeof describeEffects>[1]) => (ctx ? describeEffects(ctx, effects) : "");
</script>

<svelte:window on:keydown={onKey} />

<div class="backdrop" role="presentation" on:mousedown|self={close}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Check and playtest">
    <header>
      <div class="tabs">
        <button class:active={tab === "checks"} title="Problems found by reading the whole game" on:click={() => (tab = "checks")}>
          Checks{#if counts.error + counts.warning > 0}<span class="badge">{counts.error + counts.warning}</span>{/if}
        </button>
        <button class:active={tab === "playtest"} title="Set a state by hand and see what the player could do" on:click={() => (tab = "playtest")}>Playtest</button>
      </div>
      <button class="x" title="Close (Esc)" on:click={close}>✕</button>
    </header>

    <div class="body">
      {#if tab === "checks"}
        {#if issues.length === 0}
          <p class="ok">Nothing to report. Every node can be reached, and no condition is impossible.</p>
        {:else}
          <p class="summary">{counts.error} problem{counts.error === 1 ? "" : "s"}, {counts.warning} warning{counts.warning === 1 ? "" : "s"}, {counts.info} note{counts.info === 1 ? "" : "s"}.</p>
          <ul class="issues">
            {#each issues as i}
              <li class={i.severity}>
                <span class="sev">{SEV[i.severity]}</span>
                <span class="msg">{i.message}</span>
                {#if i.nodeId}<button class="link" on:click={() => goTo(i.nodeId)}>Open node</button>
                {:else if i.questId}<button class="link" on:click={() => goTo()}>Open timeline</button>{/if}
              </li>
            {/each}
          </ul>
        {/if}
        <p class="hint">The check assumes the player does whatever helps: a problem listed here is real, but a clean report does not prove the game can be finished. Use the Playtest to walk a path.</p>
      {:else if !game}
        <p class="empty">This project is not a game.</p>
      {:else}
        <div class="play">
          <section>
            <h3>State</h3>
            {#if game.variables.length === 0 && game.items.length === 0}<p class="empty">No variables or items declared yet (State panel).</p>{/if}
            {#each game.variables as v (v.id)}
              <label class="row">
                {#if v.kind === "flag"}
                  <input type="checkbox" checked={state.flags.includes(v.id)} on:change={(e) => setFlag(v.id, isOn(e))} />
                  <span>{v.label || v.id}</span>
                {:else}
                  <input class="small" type="number" value={state.numbers[v.id] ?? 0} on:change={(e) => setNumber(v.id, num(e))} />
                  <span>{v.label || v.id}</span>
                {/if}
              </label>
            {/each}
            {#each game.items as it (it.id)}
              <label class="row">
                <input class="small" type="number" min="0" value={state.items[it.id] ?? 0} on:change={(e) => setItem(it.id, num(e))} />
                <span>{it.name || it.id}</span>
              </label>
            {/each}
            {#if learned.length}<p class="hint">Learned: {learned.join(", ")}</p>{/if}
            <button class="ghost" on:click={reset}>Reset</button>
          </section>

          <section>
            <h3>Available now</h3>
            {#if available.length === 0}<p class="empty">{state.done.length ? "Nothing is open. The player is stuck, or the story is over." : "No quest is open to start."}</p>{/if}
            {#each available as a (a.node.id)}
              <div class="card">
                <button class="primary" on:click={() => play(a.node.id)}>Play</button>
                <span><strong>{labels.get(a.node.id) ?? ""}</strong> {a.node.title.trim() || "Untitled node"}{a.entry ? " · start of quest" : ""}</span>
              </div>
            {/each}
            {#if blocked.length}
              <h3 class="sub">Closed for now</h3>
              {#each blocked as b (b.node.id)}
                <div class="card dim">
                  <span><strong>{labels.get(b.node.id) ?? ""}</strong> {b.node.title.trim() || "Untitled node"}</span>
                  <span class="why">needs {b.unmet.join(" and ")}</span>
                </div>
              {/each}
            {/if}
          </section>

          <section>
            <h3>{currentNode ? `At “${title(currentNode.id)}”` : "Walk"}</h3>
            {#if !currentNode}<p class="empty">Play a node to see its choices and ways out.</p>{/if}
            {#each choices as c (c.id)}
              <p class="q">{c.text.trim() || "A choice"}</p>
              {#each c.options as o (o.id)}
                {@const open = $project ? holdsAll($project, state, o.requires) : false}
                {@const fx = optionEffects(o.effects)}
                <div class="card" class:dim={!open || chosen.has(`${currentNode?.id}/${o.id}`)}>
                  <button disabled={!open || chosen.has(`${currentNode?.id}/${o.id}`)} on:click={() => choose(c.id, o.id, o.text, fx)}>Choose</button>
                  <span>{o.text.trim() || "…"}{o.to ? ` → ${labels.get(o.to) ?? ""} ${title(o.to)}` : ""}{fx ? ` · ${fx}` : ""}{open ? "" : " · closed"}</span>
                </div>
              {/each}
            {/each}
            {#if currentNode}
              <p class="hint">{exits.length} way{exits.length === 1 ? "" : "s"} out open{currentNode.ending ? " · this is an ending" : ""}.</p>
            {/if}
            {#if log.length}
              <h3 class="sub">What happened</h3>
              <ol class="log">{#each log as l}<li>{l}</li>{/each}</ol>
            {/if}
          </section>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 100; display: flex; justify-content: center; align-items: flex-start; padding-top: 6vh; background: var(--backdrop); }
  .dialog { display: flex; flex-direction: column; width: min(980px, 96vw); max-height: 86vh; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 1rem; border-bottom: 1px solid var(--border); }
  .tabs { display: flex; gap: 0.25rem; }
  .tabs button { padding: 0.3rem 0.7rem; border-radius: 6px; font-size: 0.85rem; color: var(--text-muted); }
  .tabs button.active { background: var(--bg-sidebar); color: var(--text); font-weight: 600; }
  .badge { margin-left: 0.35rem; background: var(--accent); color: var(--on-accent); border-radius: 999px; padding: 0 0.4rem; font-size: 0.7rem; }
  .x { color: var(--text-muted); }
  .body { padding: 0.6rem 1rem 0.9rem; overflow: auto; }
  .summary { font-size: 0.85rem; margin: 0 0 0.5rem; }
  .ok { color: var(--text); font-size: 0.9rem; }
  .issues { list-style: none; margin: 0; padding: 0; }
  .issues li { display: flex; gap: 0.6rem; align-items: baseline; padding: 0.35rem 0; border-top: 1px solid var(--border); font-size: 0.85rem; }
  .sev { flex: none; width: 4.5rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 700; }
  li.error .sev { color: #c0392b; }
  li.warning .sev { color: #b9770e; }
  li.info .sev { color: var(--text-muted); }
  .msg { flex: 1; }
  .link { color: var(--accent); white-space: nowrap; }
  .link:hover { text-decoration: underline; }
  .hint, .empty { color: var(--text-muted); font-size: 0.8rem; }
  .play { display: grid; grid-template-columns: 1fr 1.2fr 1.2fr; gap: 1.2rem; }
  h3 { font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); margin: 0 0 0.4rem; }
  h3.sub { margin-top: 0.9rem; }
  .row { display: flex; gap: 0.5rem; align-items: center; font-size: 0.85rem; padding: 0.15rem 0; }
  .small { width: 4.2rem; }
  .card { display: flex; gap: 0.5rem; align-items: baseline; padding: 0.3rem 0; border-top: 1px solid var(--border); font-size: 0.85rem; }
  .card.dim { opacity: 0.6; }
  .why { color: var(--text-muted); font-size: 0.75rem; }
  .q { font-size: 0.85rem; font-style: italic; margin: 0.4rem 0 0.1rem; }
  .primary { background: var(--accent); color: var(--on-accent); border-radius: 6px; padding: 0.2rem 0.7rem; font-weight: 600; }
  .ghost { margin-top: 0.6rem; color: var(--text-muted); font-size: 0.8rem; }
  .log { margin: 0; padding-left: 1.1rem; font-size: 0.78rem; color: var(--text-muted); }
  @media (max-width: 800px) { .play { grid-template-columns: 1fr; } }
</style>
