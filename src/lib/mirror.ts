/**
 * The live mirror: pure helpers. The web view owns the project; Rust keeps
 * the latest unsaved copy so a WebView reload or crash cannot lose it.
 */
import type { Project } from "./types";
import { migrateProject } from "./migrate";

/** How long after the last edit the project is sent to Rust. */
export const MIRROR_DEBOUNCE_MS = 500;

export type LiveCopy = {
  project: Project;
  /** The file the project belongs to, or null if it has none yet. */
  path: string | null;
  /** "memory": the web view was reloaded; "disk": the app was restarted. */
  source: "memory" | "disk";
};

/** Validate and upgrade what Rust returned. Anything odd → null (never throws). */
export function parseLive(raw: unknown): LiveCopy | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!r.project || typeof r.project !== "object") return null;
  try {
    const { project } = migrateProject(r.project);
    return {
      project,
      path: typeof r.path === "string" && r.path ? r.path : null,
      source: r.source === "memory" ? "memory" : "disk",
    };
  } catch {
    return null;
  }
}

/** A reload is silent; a restart asks first. */
export function shouldAskBeforeRestoring(live: LiveCopy): boolean {
  return live.source !== "memory";
}

/** What the Restore question says. */
export function restorePrompt(live: LiveCopy): string {
  const title = live.project.title || "Untitled";
  const file = live.path ? live.path.split(/[/\\]/).pop() : null;
  return file
    ? `Fabulator closed with unsaved changes to “${title}” (${file}). Restore those changes?`
    : `Fabulator closed before “${title}” was saved to a file. Restore that unsaved work?`;
}
