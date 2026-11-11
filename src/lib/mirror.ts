/**
 * The live mirror: pure helpers. The web view owns the project; Rust keeps
 * the latest unsaved copy so a WebView reload or crash cannot lose it.
 */
import type { Project } from "./types";
import { toLocation, type Location } from "./platform/types";
import { migrateProject } from "./migrate";
import { diffProject, type ProjectPatch } from "./patch";

/** How long after the last edit the project is sent to Rust. */
export const MIRROR_DEBOUNCE_MS = 500;

export type UnsavedCopy = {
  project: Project;
  /** The file the project belongs to, or null if it has none yet. */
  path: Location | null;
  /** "memory": the web view was reloaded; "disk": the app was restarted; "legacy": a copy from an older version. */
  source: "memory" | "disk" | "legacy";
};

/** Validate and upgrade what Rust returned. Anything odd → null (never throws). */
export function parseUnsaved(raw: unknown): UnsavedCopy | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!r.project || typeof r.project !== "object") return null;
  try {
    const { project } = migrateProject(r.project);
    return {
      project,
      path: typeof r.path === "string" && r.path ? toLocation(r.path) : null,
      source: r.source === "memory" ? "memory" : r.source === "legacy" ? "legacy" : "disk",
    };
  } catch {
    return null;
  }
}

/** A reload is silent; a restart asks first. */
export function shouldAskBeforeRestoring(live: UnsavedCopy): boolean {
  return live.source !== "memory";
}

/** What the Restore question says. `nameOf` turns a location into a file name (the platform knows how). */
export function restorePrompt(live: UnsavedCopy, nameOf: (location: Location) => string): string {
  const title = live.project.title || "Untitled";
  const file = live.path ? nameOf(live.path) : null;
  return file
    ? `Fabulator closed with unsaved changes to “${title}” (${file}). Restore those changes?`
    : `Fabulator closed before “${title}” was saved to a file. Restore that unsaved work?`;
}

/** After this many patches the whole project is re-sent, so a drifting copy can never persist. */
export const FULL_RESYNC_EVERY = 100;

/** What the platform offers for keeping unsaved work (a subset of `Platform["unsaved"]`). */
export type UnsavedSink = {
  /** Replace the kept copy with the whole project. Returns the new revision. */
  keep(project: Project, path: Location | null): Promise<number>;
  /** Apply a patch on top of revision `base`. Returns the new revision, or null if the kept copy
   *  is not at `base` (restarted, discarded, damaged): then the caller sends everything. */
  keepChanges(base: number, patch: ProjectPatch, path: Location | null): Promise<number | null>;
  discard(keepCopy: boolean): Promise<void>;
};

/**
 * Keeps the platform's unsaved copy up to date with as little data as possible: the first
 * send is the whole project, later sends are patches. Any doubt → the whole project.
 * Everything runs one call at a time, in order, so two callers can never interleave.
 */
export function createUnsavedSync(sink: UnsavedSink) {
  let last: { project: Project; path: Location | null; revision: number; patches: number } | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  const inOrder = <T>(job: () => Promise<T>): Promise<T> => {
    const run = chain.then(job);
    chain = run.catch(() => undefined);
    return run;
  };

  /** Make the platform's copy equal to `project`; returns its revision. */
  async function bring(project: Project, path: Location | null): Promise<number> {
    if (last && last.project === project && last.path === path) return last.revision; // nothing new
    const previous = last;
    last = null; // if anything below throws, the next send starts from scratch
    if (previous && previous.patches < FULL_RESYNC_EVERY) {
      const delta = diffProject(previous.project, project);
      if (delta.kind === "none" && previous.path === path) {
        last = { ...previous, project };
        return previous.revision;
      }
      if (delta.kind !== "full") {
        const patch = delta.kind === "patch" ? delta.patch : {};
        const revision = await sink.keepChanges(previous.revision, patch, path);
        if (revision !== null) {
          last = { project, path, revision, patches: previous.patches + 1 };
          return revision;
        }
      }
    }
    const revision = await sink.keep(project, path);
    last = { project, path, revision, patches: 0 };
    return revision;
  }

  return {
    keep: (project: Project, path: Location | null): Promise<void> => inOrder(() => bring(project, path).then(() => {})),
    /**
     * Make the platform's copy equal to `project`, then run `use` with that copy's revision
     * (before anything else can change it). Used to save straight from the kept copy.
     */
    withKept: <T>(project: Project, path: Location | null, use: (revision: number) => Promise<T>): Promise<T> =>
      inOrder(async () => use(await bring(project, path))),
    discard: (keepCopy: boolean): Promise<void> =>
      inOrder(async () => {
        last = null;
        await sink.discard(keepCopy);
      }),
  };
}
