/**
 * Saving, loading, autosave and "don't lose my work" guards.
 * All file I/O goes through the Rust commands `load_project`, `save_project`
 * and `sample_project`.
 */
import { get } from "svelte/store";
import type { Project } from "./types";
import { migrateProject } from "./migrate";
import { toFolder, fromFolder } from "./folder";
import { platform } from "./platform";
import { blankProject } from "./blank";
import { MIRROR_DEBOUNCE_MS, parseLive, restorePrompt, shouldAskBeforeRestoring, type LiveCopy } from "./mirror";
import {
  project,
  currentPath,
  isDirty,
  revision,
  markClean,
  markDirty,
  selectedSceneId,
  saveState,
  uid,
} from "./stores";

const FILE_FILTERS = [
  { name: "Fabulator Project", extensions: ["fabulator.json", "json"] },
];

/** Autosave fires this long after the last edit… */
const AUTOSAVE_DEBOUNCE_MS = 3_000;
/** …but never later than this after the first unsaved edit. */
const AUTOSAVE_MAX_WAIT_MS = 15_000;

type SaveOptions = {
  /** Always snapshot the previous file into the backups folder. */
  forceBackup?: boolean;
  /** Allow showing a "Save as" dialog when the project has no file yet. */
  interactive?: boolean;
  /** Save to this path instead of the current one (Save As). */
  pathOverride?: string;
};

// Saves run one at a time, in order.
let queue: Promise<unknown> = Promise.resolve();

export function saveNow(opts: SaveOptions = {}): Promise<boolean> {
  const run = queue.then(() => doSave(opts));
  queue = run.catch(() => undefined);
  return run;
}

async function pickSavePath(proj: Project): Promise<string | null> {
  const safeName = proj.title.replace(/[<>:"/\\|?*]/g, "_") || "Untitled";
  return platform().pickSaveFile({
    title: "Save Fabulator Project",
    defaultName: `${safeName}.fabulator.json`,
    filters: FILE_FILTERS,
  });
}

async function doSave(opts: SaveOptions): Promise<boolean> {
  const proj = get(project);
  if (!proj) return false;

  let path = opts.pathOverride ?? get(currentPath);
  if (!path) {
    if (!opts.interactive) return false; // autosave never opens dialogs
    path = await pickSavePath(proj);
    if (!path) return false; // cancelled
  }

  const startedAt = get(revision);
  const previous = get(saveState);
  saveState.set({ status: "saving", at: previous.at, message: null });

  try {
    await platform().saveProject(path, proj, { forceBackup: !!opts.forceBackup });
    currentPath.set(path);
    void clearRecovery(false); // it has a real file now
    // Only mark clean if the user didn't keep typing during the save.
    if (get(revision) === startedAt) markClean();
    saveState.set({ status: "saved", at: Date.now(), message: null });
    return true;
  } catch (e) {
    saveState.set({ status: "error", at: previous.at, message: String(e) });
    return false;
  }
}

/** Manual save (Ctrl+S / Save button). Asks for a location the first time. */
export function manualSave(): Promise<boolean> {
  return saveNow({ interactive: true, forceBackup: true });
}

export async function saveAs(): Promise<boolean> {
  const proj = get(project);
  if (!proj) return false;
  const chosen = await pickSavePath(proj);
  if (!chosen) return false;
  return saveNow({ pathOverride: chosen, forceBackup: true });
}

/**
 * Returns true when it is safe to replace/close the current project:
 * nothing unsaved, or it was just saved, or the user explicitly agreed to
 * discard changes.
 */
export async function ensureSafeToLeave(question: string): Promise<boolean> {
  if (!get(isDirty)) return true;
  if (get(currentPath) && (await saveNow({ forceBackup: true }))) return true;
  return platform().confirm(`You have unsaved changes. ${question}`, {
    title: "Unsaved changes",
    kind: "warning",
    okLabel: "Discard changes",
    cancelLabel: "Cancel",
  });
}

// ─── Recovery copy for projects with no file yet ───────────

/** Best-effort: recovery must never get in the way of writing. */
async function clearRecovery(keep: boolean): Promise<void> {
  try {
    await platform().recovery.clear(keep);
    await platform().live.clear(); // the live mirror only exists while work is unsaved
  } catch {
    /* nothing to clear, or not possible: fine */
  }
}

async function writeRecovery(): Promise<void> {
  const proj = get(project);
  if (!proj || get(currentPath)) return;
  try {
    await platform().recovery.write(proj);
  } catch (e) {
    console.warn("recovery copy failed", e);
  }
}

function showProject(proj: Project, path: string | null) {
  project.set(proj);
  currentPath.set(path);
  selectedSceneId.set(proj.scenes[0]?.id ?? null);
  markClean();
  saveState.set({ status: "idle", at: null, message: null });
}

export async function openProject(): Promise<void> {
  if (!(await ensureSafeToLeave("Open another project anyway?"))) return;
  await clearRecovery(false);

  const chosen = await platform().pickOpenFile({ title: "Open Fabulator Project", filters: FILE_FILTERS });
  if (!chosen) return;

  try {
    const raw = await platform().readProject(chosen);
    const { project: loaded, migratedFrom } = migrateProject(raw);

    if (migratedFrom !== null) {
      // Keep an untouched copy of the old-format file before it can be
      // overwritten, then flag the project so the upgrade gets saved.
      await platform().backupProject(chosen);
      showProject(loaded, chosen);
      markDirty(); // autosave then writes the upgraded file
    } else {
      showProject(loaded, chosen);
    }
  } catch (e) {
    saveState.set({ status: "error", at: null, message: `Open failed: ${e}` });
  }
}

/** File → Export as folder: the story as Markdown files (good for git). */
export async function exportFolder(): Promise<void> {
  const proj = get(project);
  if (!proj) return;
  const chosen = await platform().pickFolder({
    title: "Choose an empty folder (or an earlier export) for the Markdown files",
  });
  if (!chosen) return;
  try {
    const files = toFolder(proj);
    const r = await platform().writeProjectFolder(chosen, files);
    await platform().notify(
      `Exported ${proj.scenes.length} scene${proj.scenes.length === 1 ? "" : "s"} to the folder.\n` +
        `${r.written} file${r.written === 1 ? "" : "s"} written, ${r.unchanged} unchanged` +
        (r.removed ? `, ${r.removed} no longer needed and removed` : "") +
        ".\n\nSaved versions (snapshots) are not included.",
      { title: "Export as folder", kind: "info" }
    );
  } catch (e) {
    await platform().notify(`${e}`, { title: "Export as folder failed", kind: "error" });
  }
}

/** File → Open folder: a project folder of Markdown files becomes the open project. */
export async function openFolder(): Promise<void> {
  if (!(await ensureSafeToLeave("Open another project anyway?"))) return;
  const chosen = await platform().pickFolder({ title: "Open a project folder" });
  if (!chosen) return;
  try {
    const files = await platform().readProjectFolder(chosen);
    const result = fromFolder(files, uid);
    if (!result.ok) {
      await platform().notify(result.error, { title: "Open folder", kind: "error" });
      return;
    }
    await clearRecovery(false);
    showProject(result.project, null);
    markDirty(); // it has no .fabulator.json yet: ask to save before closing
    if (result.warnings.length) {
      const shown = result.warnings.slice(0, 8).join("\n");
      const more = result.warnings.length > 8 ? `\n…and ${result.warnings.length - 8} more.` : "";
      await platform().notify(`Opened with notes:\n\n${shown}${more}`, { title: "Open folder", kind: "warning" });
    }
  } catch (e) {
    await platform().notify(`${e}`, { title: "Open folder failed", kind: "error" });
  }
}

/** File → New story. */
export async function newProject(): Promise<void> {
  if (!(await ensureSafeToLeave("Start a new story anyway?"))) return;
  await clearRecovery(false);
  showProject(blankProject(uid), null);
}

export async function loadSample(): Promise<void> {
  if (!(await ensureSafeToLeave("Load the sample project anyway?"))) return;
  await clearRecovery(false);
  showProject(await platform().sampleProject(), null);
}

/** Initial project on startup. */
export async function loadInitialProject(): Promise<void> {
  const live = await readLive();
  if (live) {
    // Reload of the web view: Rust still has the work, so just carry on.
    // After a restart (copy from disk) ask first.
    const adopt =
      !shouldAskBeforeRestoring(live) ||
      (await platform().confirm(restorePrompt(live), {
        title: "Recover unsaved work",
        kind: "info",
        okLabel: "Restore",
        cancelLabel: "Start fresh",
      }));
    if (adopt) {
      showProject(live.project, live.path);
      markDirty(); // still unsaved: guards closing, autosaves, keeps mirroring
      return;
    }
    await clearRecovery(true);
  }
  const recovered = await readRecovery();
  if (recovered) {
    const restore = await platform().confirm(
      `Fabulator closed before “${recovered.title || "Untitled"}” was saved to a file. Restore that unsaved work?`,
      {
        title: "Recover unsaved work",
        kind: "info",
        okLabel: "Restore",
        cancelLabel: "Start fresh",
      }
    );
    if (restore) {
      showProject(recovered, null);
      markDirty(); // still unsaved: keeps the recovery copy going and guards closing
      return;
    }
    await clearRecovery(true); // kept aside as "discarded", not deleted
  }
  showProject(blankProject(uid), null); // a new session starts with an empty story
}

async function readLive(): Promise<LiveCopy | null> {
  try {
    return parseLive(await platform().live.read());
  } catch (e) {
    console.warn("could not read live copy", e);
    return null;
  }
}

async function readRecovery(): Promise<Project | null> {
  try {
    const raw = await platform().recovery.read();
    return raw ? migrateProject(raw).project : null;
  } catch (e) {
    console.warn("could not read recovery copy", e);
    return null;
  }
}

/**
 * Autosave: projects with a file are saved to it; projects without one get a
 * recovery copy in the app's data folder. Returns a cleanup function.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstUnsavedAt = 0;

  const unsubscribe = revision.subscribe(() => {
    if (!get(isDirty)) return;
    const hasFile = !!get(currentPath);

    const now = Date.now();
    if (!firstUnsavedAt) firstUnsavedAt = now;
    const untilMaxWait = firstUnsavedAt + AUTOSAVE_MAX_WAIT_MS - now;

    clearTimeout(timer);
    timer = setTimeout(
      () => {
        firstUnsavedAt = 0;
        // With a file: a real autosave. Without one: a recovery copy only
        // (autosave never opens a "Save as" dialog while you write).
        if (hasFile || get(currentPath)) void saveNow();
        else void writeRecovery();
      },
      Math.max(0, Math.min(AUTOSAVE_DEBOUNCE_MS, untilMaxWait))
    );
  });

  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

/**
 * Live mirror: while there are unsaved changes, send the whole project to Rust
 * shortly after each edit (and when the window is hidden or unloading). Once
 * everything is saved the mirror is cleared. Returns a cleanup function.
 */
export function startMirror(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<unknown> = Promise.resolve();

  // Sends happen one at a time, and always read the state at the moment they run,
  // so a late send can never overwrite a newer clear (or the other way round).
  const sync = () => {
    chain = chain
      .then(async () => {
        const proj = get(project);
        if (proj && get(isDirty)) {
          await platform().live.mirror(proj, get(currentPath));
        } else {
          await platform().live.clear();
        }
      })
      .catch((e) => console.warn("live mirror failed", e));
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(sync, MIRROR_DEBOUNCE_MS);
  };
  const flush = () => {
    clearTimeout(timer);
    if (get(isDirty)) sync(); // never clear on the way out
  };
  const onHide = () => {
    if (document.visibilityState === "hidden") flush();
  };

  const unsubscribe = revision.subscribe(() => {
    if (get(isDirty)) schedule();
  });
  const unsubscribeDirty = isDirty.subscribe((dirty) => {
    if (!dirty) {
      clearTimeout(timer);
      sync(); // saved or replaced: drop the mirror right away
    }
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", onHide);

  return () => {
    clearTimeout(timer);
    unsubscribe();
    unsubscribeDirty();
    window.removeEventListener("pagehide", flush);
    window.removeEventListener("beforeunload", flush);
    document.removeEventListener("visibilitychange", onHide);
  };
}

/**
 * Intercept the window close button: save first if there is a file,
 * otherwise ask before throwing away unsaved work.
 */
export async function installCloseGuard(): Promise<() => void> {
  return platform().onCloseRequested(async () => {
    if (!(await ensureSafeToLeave("Close Fabulator and discard them?"))) return false;
    await clearRecovery(false); // closed on purpose: nothing to recover
    return true;
  });
}
