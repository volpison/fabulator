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
import type { Location } from "./platform/types";
import { rememberRecent, forgetRecent } from "./recentStore";
import { blankProject, blankProjectFor } from "./blank";
import { DEFAULT_STORY_FORMAT, formatOf, type StoryFormatId } from "./formats";
import { MIRROR_DEBOUNCE_MS, createUnsavedSync, parseUnsaved, restorePrompt, shouldAskBeforeRestoring, type UnsavedCopy } from "./mirror";
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
  pathOverride?: Location;
};

// Saves run one at a time, in order.
let queue: Promise<unknown> = Promise.resolve();

export function saveNow(opts: SaveOptions = {}): Promise<boolean> {
  const run = queue.then(() => doSave(opts));
  queue = run.catch(() => undefined);
  return run;
}

async function pickSavePath(proj: Project): Promise<Location | null> {
  const safeName = proj.title.replace(/[<>:"/\\|?*]/g, "_") || "Untitled";
  return platform().pickSaveFile({
    title: "Save Fabulator Project",
    defaultName: `${safeName}.fabulator.json`,
    filters: FILE_FILTERS,
  });
}

/**
 * Write the project. Preferred: the platform already holds this exact project as its unsaved
 * copy (the mirror keeps it current), so it saves that and the project is not sent again.
 * Any doubt (no copy, another revision, the copy can't be brought up to date) → send it.
 */
async function writeProject(path: Location, proj: Project, forceBackup: boolean): Promise<void> {
  let writeError: unknown = null;
  try {
    const saved = await unsavedSync.withKept(proj, get(currentPath), async (rev) => {
      try {
        return await platform().unsaved.saveKept(path, rev, { forceBackup });
      } catch (e) {
        writeError = e; // the write itself failed: report it, don't write again
        throw e;
      }
    });
    if (saved) return;
  } catch (e) {
    if (writeError) throw writeError;
    // Only bringing the kept copy up to date failed: the ordinary way below still works.
    console.warn("could not use the kept copy; saving directly", e);
  }
  await platform().saveProject(path, proj, { forceBackup });
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
    await writeProject(path, proj, !!opts.forceBackup);
    currentPath.set(path);
    rememberRecent(path);
    // The unsaved-work copy is dropped by the mirror once nothing is unsaved (see startMirror):
    // only it knows whether more edits arrived while this save was running.
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

// ─── Unsaved work (kept by the platform: see startMirror) ───

/** Sends the platform small changes after the first full copy (see mirror.ts, patch.ts). */
const unsavedSync = createUnsavedSync({
  keep: (proj, path, dirty) => platform().unsaved.keep(proj, path, dirty),
  keepChanges: (base, patch, path, dirty) => platform().unsaved.keepChanges(base, patch, path, dirty),
  settle: () => platform().unsaved.settle(),
  discard: (keepCopy) => platform().unsaved.discard(keepCopy),
});

/** Best-effort: this must never get in the way of what the person is doing. */
async function discardUnsaved(keepCopy: boolean): Promise<void> {
  try {
    await unsavedSync.discard(keepCopy);
  } catch {
    /* nothing to discard, or not possible: fine */
  }
}

function showProject(proj: Project, path: Location | null) {
  project.set(proj);
  currentPath.set(path);
  selectedSceneId.set(proj.scenes[0]?.id ?? null);
  markClean();
  saveState.set({ status: "idle", at: null, message: null });
  // Let the platform hold the project from now on, so later changes and saves can be small.
  // Best-effort: if it fails, the next change or save sends the project anyway.
  unsavedSync.hold(proj, path).catch((e) => console.warn("could not hand the project to the platform", e));
}

/** File → Open…: ask which file, then open it. */
export async function openProject(): Promise<void> {
  if (!(await ensureSafeToLeave("Open another project anyway?"))) return;
  await discardUnsaved(false);

  const chosen = await platform().pickOpenFile({ title: "Open Fabulator Project", filters: FILE_FILTERS });
  if (!chosen) return;
  await openAt(chosen, false);
}

/** File → Open recent → a file from the list. */
export async function openRecent(location: Location): Promise<void> {
  if (!(await ensureSafeToLeave("Open another project anyway?"))) return;
  await discardUnsaved(false);
  await openAt(location, true);
}

async function openAt(location: Location, fromRecent: boolean): Promise<void> {
  try {
    // The platform has already backed up an older-format file before this returns.
    const { data } = await platform().openProject(location);
    const { project: loaded, migratedFrom } = migrateProject(data);

    if (migratedFrom !== null) {
      showProject(loaded, location);
      markDirty(); // flag the project so autosave writes the upgraded file
    } else {
      showProject(loaded, location);
    }
    rememberRecent(location);
  } catch (e) {
    if (fromRecent) {
      // A recent file that is gone (moved, deleted, drive unplugged) should not stay in the list.
      forgetRecent(location);
      saveState.set({
        status: "error",
        at: null,
        message: `Could not open ${platform().displayName(location)} (removed from recent files): ${e}`,
      });
    } else {
      saveState.set({ status: "error", at: null, message: `Open failed: ${e}` });
    }
  }
}

/** File → Export as folder: the story as Markdown files (good for git). */
export async function exportFolder(): Promise<void> {
  const proj = get(project);
  if (!proj) return;
  if (proj.story_format !== "novel") {
    // The folder format only knows chapters and scenes: refuse instead of writing a copy that lacks the pages.
    await platform().notify(
      `Exporting a ${formatOf(proj).label.toLowerCase()} as a Markdown folder is not supported yet.\n\nYour project file is not affected: save it as usual.`,
      { title: "Export as folder", kind: "warning" }
    );
    return;
  }
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
    await discardUnsaved(false);
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

/** File → New story (a novel unless another format is asked for). */
export async function newProject(format: StoryFormatId = DEFAULT_STORY_FORMAT): Promise<void> {
  if (!(await ensureSafeToLeave("Start a new story anyway?"))) return;
  await discardUnsaved(false);
  showProject(blankProjectFor(format, uid), null);
}

export async function loadSample(): Promise<void> {
  if (!(await ensureSafeToLeave("Load the sample project anyway?"))) return;
  await discardUnsaved(false);
  showProject(await platform().sampleProject(), null);
}

/** Initial project on startup. */
export async function loadInitialProject(): Promise<void> {
  const unsaved = await readUnsaved();
  if (unsaved) {
    // A reload of the web view: the platform still has the work, so just carry on.
    // After a restart or crash (a copy from disk) ask first.
    const adopt =
      !shouldAskBeforeRestoring(unsaved) ||
      (await platform().confirm(restorePrompt(unsaved, (l) => platform().displayName(l)), {
        title: "Recover unsaved work",
        kind: "info",
        okLabel: "Restore",
        cancelLabel: "Start fresh",
      }));
    if (adopt) {
      showProject(unsaved.project, unsaved.path);
      markDirty(); // still unsaved: guards closing, autosaves, keeps mirroring
      return;
    }
    await discardUnsaved(true); // kept aside as "discarded", not deleted
  }
  showProject(blankProject(uid), null); // a new session starts with an empty story
}

async function readUnsaved(): Promise<UnsavedCopy | null> {
  try {
    return parseUnsaved(await platform().unsaved.read());
  } catch (e) {
    console.warn("could not read unsaved work", e);
    return null;
  }
}

/**
 * Autosave: projects with a file are saved to it. (Projects without one are kept
 * safe by the mirror below.) Returns a cleanup function.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstUnsavedAt = 0;

  const unsubscribe = revision.subscribe(() => {
    if (!get(isDirty)) return;
    const now = Date.now();
    if (!firstUnsavedAt) firstUnsavedAt = now;
    const untilMaxWait = firstUnsavedAt + AUTOSAVE_MAX_WAIT_MS - now;

    clearTimeout(timer);
    timer = setTimeout(
      () => {
        firstUnsavedAt = 0;
        // With a file: a real autosave. Without one nothing is written (autosave never opens
        // a "Save as" dialog while you write); the mirror already keeps a copy for recovery.
        if (get(currentPath)) void saveNow();
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
 * Live mirror: while there are unsaved changes, send Rust the changes (the whole project the first time)
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
          await unsavedSync.keep(proj, get(currentPath));
        } else {
          await unsavedSync.settle();
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
    await discardUnsaved(false); // closed on purpose: nothing to recover
    return true;
  });
}
