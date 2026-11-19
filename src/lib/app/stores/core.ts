// The open project and its save state: the shared base every other store module builds on.
// Part of the app's state; see docs/technical/frontend-structure.md.
import { derived, writable } from "svelte/store";
import { scenesInChapter } from "../../model/model";
import type { Location } from "../../platform/types";
import type { Project, Scene } from "../../model/types";

export const project = writable<Project | null>(null);

export const loading = writable(true);

export const error = writable<string | null>(null);

/** Absolute path of the file currently open, or null if unsaved sample. */
export const currentPath = writable<Location | null>(null);

/** True when in-memory project differs from last save (simple flag). */
export const isDirty = writable(false);

/**
 * Incremented on every edit. A save remembers the revision it started with and
 * only marks the project clean if nothing changed while it was writing.
 */
export const revision = writable(0);

export type SaveState = {
  status: "idle" | "saving" | "saved" | "error";
  /** Time of the last successful save (ms since epoch). */
  at: number | null;
  message: string | null;
};

export const saveState = writable<SaveState>({
  status: "idle",
  at: null,
  message: null,
});

/** chapter id -> its scenes in order. */
export const scenesByChapter = derived(project, ($project) => {
  const map = new Map<string, Scene[]>();
  if (!$project) return map;
  for (const chapter of $project.chapters) {
    map.set(chapter.id, scenesInChapter($project.scenes, chapter.id));
  }
  return map;
});

/** Mark the project as changed without editing it (e.g. after a format upgrade). */
export function markDirty() {
  touch();
}

export function touch() {
  isDirty.set(true);
  revision.update((n) => n + 1);
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function markClean() {
  isDirty.set(false);
}
