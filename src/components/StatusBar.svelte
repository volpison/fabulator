<script lang="ts">
  import { project, currentPath, isDirty, saveState } from "../lib/stores";
  import GoalsPanel from "./GoalsPanel.svelte";

  $: fileLabel = $currentPath
    ? ($currentPath.split(/[/\\]/).pop() ?? $currentPath)
    : "Not saved to a file yet";

  $: statusText =
    $saveState.status === "saving"
      ? "Saving…"
      : $saveState.status === "error"
        ? `⚠ ${$saveState.message ?? "Save failed"}`
        : $isDirty
          ? $currentPath
            ? "Unsaved changes — autosaving…"
            : "Unsaved — press Ctrl+S to choose a file"
          : $saveState.at
            ? `Saved ${new Date($saveState.at).toLocaleTimeString()}`
            : "";
</script>

<footer class="statusbar">
  <div class="left">
    {#if $project}
      <span class="title" title={$currentPath ?? "Not saved yet"}>
        {$project.title}{#if $isDirty}<span class="dirty" aria-label="unsaved changes"> •</span>{/if}
      </span>
      <span class="file">{fileLabel}</span>
    {/if}
  </div>
  <GoalsPanel />
  <span class="status" class:error={$saveState.status === "error"} title={$saveState.message ?? ""} role="status">
    {statusText}
  </span>
</footer>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    height: 1.7rem;
    padding: 0 1rem;
    background: var(--bg-panel);
    border-top: 1px solid var(--border);
    font-size: 0.72rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .left {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    min-width: 0;
  }

  .title {
    color: var(--text);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dirty {
    color: var(--accent);
  }

  .file {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 40%;
    flex-shrink: 1;
  }

  .status.error {
    color: var(--danger);
  }
</style>
