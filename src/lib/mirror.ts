/**
 * The live mirror: pure helpers. The web view owns the project; Rust keeps
 * the latest unsaved copy so a WebView reload or crash cannot lose it.
 */
import type { Project } from "./types";
import { toLocation, type Location } from "./platform/types";
import { migrateProject } from "./migrate";

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
