<script lang="ts">
  import { onMount } from "svelte";
  import { platform } from "../lib/platform";
  import {
    project,
    selectedScene,
    selectedSceneId,
    selectedPageId,
    mainView,
    snapshotsOpen,
    takeSnapshot,
    deleteSnapshot,
    deleteSceneSnapshots,
    restoreSnapshot,
  } from "../lib/stores";
  import {
    snapshotsFor,
    deletedScenes,
    snapshotText,
    snapshotWords,
    pageToText,
    timeAgo,
  } from "../lib/snapshots";
  import { diffText } from "../lib/diff";
  import { htmlToPlainText } from "../lib/mentions";
  import { pageWords, wordsOfHtml } from "../lib/wordcount";
  import { pageNumber } from "../lib/comic";
  import type { SnapshotKind } from "../lib/types";

  type Tab = "scene" | "deleted";

  $: isComic = $project?.story_format === "comic";
  $: unit = isComic ? "page" : "scene";
  $: names = new Map(($project?.characters ?? []).map((c) => [c.id, c.name]));
  $: nameOf = (id: string) => names.get(id) ?? "";
  /** What the snapshots are of right now: the selected scene, or the selected comic page. */
  $: subject = isComic
    ? (() => {
        const pg = $project?.pages.find((x) => x.id === $selectedPageId);
        return pg
          ? { id: pg.id, title: pg.title || `Page ${pageNumber(pg)}`, text: pageToText(pg, nameOf), words: pageWords(pg), shownTitle: pg.title }
          : null;
      })()
    : $selectedScene
      ? { id: $selectedScene.id, title: $selectedScene.title || "Untitled", text: htmlToPlainText($selectedScene.content), words: wordsOfHtml($selectedScene.content), shownTitle: $selectedScene.title }
      : null;

  let tab: Tab = subject ? "scene" : "deleted";
  let label = "";
  let expandedId: string | null = null;
  let now = Date.now();

  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  const kindLabel: Record<SnapshotKind, string> = {
    manual: "Yours",
    auto: "Auto",
    safety: "Safety",
  };

  const kindHelp: Record<SnapshotKind, string> = {
    manual: "A snapshot you took",
    auto: "Saved automatically while you wrote (the oldest are pruned)",
    safety: "Saved before a restore or a delete, so it can be undone (never pruned)",
  };

  $: if ($project) now = Date.now();
  $: items = $project && subject ? snapshotsFor($project.snapshots, subject.id) : [];
  $: deleted = $project ? deletedScenes($project) : [];

  $: expanded = items.find((s) => s.id === expandedId) ?? null;
  $: diff = expanded && subject ? diffText(snapshotText(expanded, nameOf), subject.text) : null;

  function close() {
    snapshotsOpen.set(false);
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function onTake() {
    if (!subject) return;
    takeSnapshot(subject.id, label);
    label = "";
  }

  function onLabelKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      onTake();
    }
  }

  async function onRestore(id: string, name: string, sceneExists: boolean) {
    const message = sceneExists
      ? `Restore “${name}”? Your current version of this ${unit} is saved as a snapshot first, so you can undo this.`
      : `Bring back the deleted ${unit} “${name}”?`;
    const ok = await platform().confirm(message, {
      title: sceneExists ? "Restore snapshot" : `Restore ${unit}`,
      kind: "info",
      okLabel: "Restore",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    const sceneId = restoreSnapshot(id);
    if (sceneId) {
      if (isComic) selectedPageId.set(sceneId);
      else selectedSceneId.set(sceneId);
      mainView.set("manuscript");
      close();
    }
  }

  async function onDelete(id: string) {
    const ok = await platform().confirm("Delete this snapshot? This cannot be undone.", {
      title: "Delete snapshot",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (ok) {
      if (expandedId === id) expandedId = null;
      deleteSnapshot(id);
    }
  }

  async function onForget(sceneId: string, name: string) {
    const ok = await platform().confirm(
      `Permanently forget “${name}” and all its saved versions? This cannot be undone.`,
      { title: `Forget deleted ${unit}`, kind: "warning", okLabel: "Forget", cancelLabel: "Cancel" }
    );
    if (ok) deleteSceneSnapshots(sceneId);
  }

  function chapterName(chapterId: string): string {
    if (isComic) {
      const n = $project?.issues.findIndex((c) => c.id === chapterId) ?? -1;
      return n === -1 || !$project ? "—" : `Issue ${n + 1}${$project.issues[n].title ? ` · ${$project.issues[n].title}` : ""}`;
    }
    const i = $project?.chapters.findIndex((c) => c.id === chapterId) ?? -1;
    return i === -1 || !$project ? "—" : `Ch ${i + 1} · ${$project.chapters[i].title}`;
  }

  function wordDelta(snapshotWordCount: number, currentWordCount: number): string {
    const d = currentWordCount - snapshotWordCount;
    return d === 0 ? "same length as now" : `${d > 0 ? "+" : "−"}${Math.abs(d)} words vs now`;
  }
</script>

<svelte:window on:keydown={onWindowKey} />

<div class="backdrop" role="presentation" on:mousedown|self={close}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Snapshots">
    <header>
      <div class="tabs">
        <button class:active={tab === "scene"} on:click={() => (tab = "scene")}>
          This {unit}
        </button>
        <button class:active={tab === "deleted"} on:click={() => (tab = "deleted")}>
          Deleted {unit}s
          {#if deleted.length > 0}<span class="badge">{deleted.length}</span>{/if}
        </button>
      </div>
      <button class="x" title="Close (Esc)" on:click={close}>✕</button>
    </header>

    {#if tab === "scene"}
      {#if !subject}
        <p class="hint">Select a {unit} first (Timeline or Manuscript) to see its snapshots.</p>
      {:else}
        <div class="take">
          <div class="scene-name">“{subject.title}”</div>
          <div class="take-row">
            <input
              type="text"
              placeholder="Name this version, e.g. “Before the rewrite” (optional)"
              bind:value={label}
              on:keydown={onLabelKey}
            />
            <button class="primary" on:click={onTake}>Take snapshot</button>
          </div>
          <p class="note">
            Fabulator also saves a version automatically as you write (at most every
            30 minutes), and before every restore or delete.
          </p>
        </div>

        <div class="list">
          {#if items.length === 0}
            <p class="hint">No snapshots of this {unit} yet.</p>
          {/if}

          {#each items as s (s.id)}
            <div class="row" class:open={expandedId === s.id}>
              <div class="main">
                <span class="kind {s.kind}" title={kindHelp[s.kind]}>{kindLabel[s.kind]}</span>
                <span class="label">{s.label || "Snapshot"}</span>
                <span class="when" title={new Date(s.created_at).toLocaleString()}>
                  {timeAgo(now, s.created_at)}
                </span>
                <span class="meta">
                  {snapshotWords(s)} words · {wordDelta(snapshotWords(s), subject.words)}
                </span>
                <span class="actions">
                  <button
                    on:click={() => (expandedId = expandedId === s.id ? null : s.id)}
                  >
                    {expandedId === s.id ? "Hide changes" : "Compare"}
                  </button>
                  <button class="restore" on:click={() => onRestore(s.id, s.label || "this snapshot", true)}>
                    Restore
                  </button>
                  <button class="del" title="Delete snapshot" on:click={() => onDelete(s.id)}>✕</button>
                </span>
              </div>

              {#if expandedId === s.id && diff}
                <div class="diff">
                  <div class="diff-head">
                    {#if diff.changed}
                      Since this snapshot:
                      <span class="add">+{diff.added} words</span>
                      <span class="del-text">−{diff.removed} words</span>
                    {:else}
                      No differences in the text.
                    {/if}
                    {#if s.title !== subject.shownTitle}
                      · title was “{s.title}”
                    {/if}
                    <span class="legend">
                      <span class="add">added</span> <span class="del-text">removed</span>
                    </span>
                  </div>
                  <div class="diff-body">{#each diff.segments as seg}<span class={seg.type}>{seg.text}</span>{/each}</div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="list">
        {#if deleted.length === 0}
          <p class="hint">
            No deleted {unit}s to recover. When you delete a {unit} that has {isComic ? "writing" : "text"},
            Fabulator keeps a copy here.
          </p>
        {/if}
        {#each deleted as d (d.sceneId)}
          <div class="row">
            <div class="main">
              <span class="label">{d.snapshot.title || "Untitled"}</span>
              <span class="when" title={new Date(d.snapshot.created_at).toLocaleString()}>
                saved {timeAgo(now, d.snapshot.created_at)}
              </span>
              <span class="meta">
                {chapterName(d.snapshot.chapter_id)} · {snapshotWords(d.snapshot)} words ·
                {d.versions} version{d.versions === 1 ? "" : "s"}
              </span>
              <span class="actions">
                <button
                  class="restore"
                  on:click={() => onRestore(d.snapshot.id, d.snapshot.title || "Untitled", false)}
                >
                  Restore {unit}
                </button>
                <button
                  class="del"
                  title="Forget this scene's saved versions"
                  on:click={() => onForget(d.sceneId, d.snapshot.title || "Untitled")}>✕</button
                >
              </span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 8vh;
    background: var(--backdrop);
  }

  .dialog {
    display: flex;
    flex-direction: column;
    width: min(820px, 94vw);
    max-height: 80vh;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem 0;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
  }

  .tabs button {
    padding: 0.5rem 0.8rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
  }

  .tabs button.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .badge {
    font-size: 0.65rem;
    background: var(--bg-sidebar);
    border-radius: 999px;
    padding: 0 0.4rem;
    margin-left: 0.25rem;
  }

  .x {
    color: var(--text-muted);
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
  }

  .x:hover {
    background: var(--bg-sidebar);
  }

  .take {
    padding: 0.8rem 1rem 0.2rem;
    flex-shrink: 0;
  }

  .scene-name {
    font-size: 0.8rem;
    font-weight: 650;
    margin-bottom: 0.4rem;
  }

  .take-row {
    display: flex;
    gap: 0.5rem;
  }

  .take-row input {
    flex: 1;
    font: inherit;
    font-size: 0.8rem;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    outline: none;
    background: var(--bg-panel);
    color: var(--text);
  }

  .take-row input:focus {
    border-color: var(--accent);
  }

  .primary {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--on-accent);
    background: var(--accent);
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
  }

  .note,
  .hint {
    font-size: 0.72rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .note {
    margin: 0.4rem 0 0.2rem;
  }

  .hint {
    padding: 1rem;
  }

  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.4rem 0.6rem 0.8rem;
  }

  .row {
    border-radius: 8px;
    padding: 0.1rem 0.2rem;
  }

  .row.open {
    background: var(--bg);
  }

  .main {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.2rem 0.6rem;
    padding: 0.45rem 0.4rem;
  }

  .kind {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    border-radius: 3px;
    padding: 0.05rem 0.35rem;
    background: var(--bg-sidebar);
    color: var(--text-muted);
  }

  .kind.manual {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .kind.safety {
    background: var(--warn-bg);
    color: var(--warn-fg);
  }

  .label {
    font-size: 0.82rem;
    font-weight: 600;
  }

  .when,
  .meta {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .actions {
    margin-left: auto;
    display: inline-flex;
    gap: 0.25rem;
  }

  .actions button {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    color: var(--text-muted);
  }

  .actions button:hover {
    background: var(--bg-sidebar);
    color: var(--text);
  }

  .actions .restore {
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-soft);
  }

  .actions .del:hover {
    color: var(--danger);
    background: var(--danger-bg);
  }

  .diff {
    margin: 0 0.4rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-panel);
  }

  .diff-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.45rem 0.7rem;
    font-size: 0.72rem;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .legend {
    margin-left: auto;
    display: inline-flex;
    gap: 0.5rem;
  }

  .diff-body {
    max-height: 42vh;
    overflow-y: auto;
    padding: 0.7rem 0.9rem;
    font-size: 0.85rem;
    line-height: 1.65;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .add {
    background: var(--ok-bg);
    color: var(--ok-fg);
    border-radius: 2px;
  }

  .del-text,
  .diff-body .del {
    background: var(--del-bg);
    color: var(--del-fg);
    text-decoration: line-through;
    border-radius: 2px;
  }

  .diff-body .add {
    background: var(--ok-bg);
    color: var(--ok-fg);
  }
</style>
