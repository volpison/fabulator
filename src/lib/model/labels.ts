/**
 * Scene status and colour labels, plus the Timeline filter.
 * Pure functions only; the UI lives in the components.
 */
import type { Scene } from "./types";

export const SCENE_STATUSES = ["idea", "draft", "revised", "final"] as const;
export type SceneStatus = (typeof SCENE_STATUSES)[number];

export const STATUS_LABEL: Record<SceneStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  revised: "Revised",
  final: "Final",
};

/** Fixed hues that read on every theme as small dots or edge strips. */
export const SCENE_COLORS = [
  { id: "red", label: "Red", hex: "#d9534f" },
  { id: "orange", label: "Orange", hex: "#e8892b" },
  { id: "yellow", label: "Yellow", hex: "#d9b72b" },
  { id: "green", label: "Green", hex: "#4caf6d" },
  { id: "blue", label: "Blue", hex: "#4a8fd9" },
  { id: "purple", label: "Purple", hex: "#9a6bd1" },
] as const;
export type SceneColor = (typeof SCENE_COLORS)[number]["id"] | "";

export const colorHex = (id: string): string | null =>
  SCENE_COLORS.find((c) => c.id === id)?.hex ?? null;

export function cleanStatus(x: unknown, fallback: SceneStatus = "draft"): SceneStatus {
  return (SCENE_STATUSES as readonly string[]).includes(x as string) ? (x as SceneStatus) : fallback;
}

export function cleanColor(x: unknown): SceneColor {
  return SCENE_COLORS.some((c) => c.id === x) ? (x as SceneColor) : "";
}

/** What a scene's status should be when an older file has none. */
export const defaultStatusFor = (content: string): SceneStatus =>
  content.replace(/<[^>]*>/g, "").trim() ? "draft" : "idea";

export interface SceneFilter {
  /** Case-insensitive text matched against title, summary and tags. */
  query: string;
  statuses: SceneStatus[];
  colors: string[]; // SceneColor ids; "none" matches scenes without a colour
  characterId: string;
  plotlineId: string;
}

export const EMPTY_FILTER: SceneFilter = {
  query: "",
  statuses: [],
  colors: [],
  characterId: "",
  plotlineId: "",
};

export function isFilterActive(f: SceneFilter): boolean {
  return !!(f.query.trim() || f.statuses.length || f.colors.length || f.characterId || f.plotlineId);
}

export function activeFilterCount(f: SceneFilter): number {
  return (
    (f.query.trim() ? 1 : 0) +
    (f.statuses.length ? 1 : 0) +
    (f.colors.length ? 1 : 0) +
    (f.characterId ? 1 : 0) +
    (f.plotlineId ? 1 : 0)
  );
}

type Matchable = Pick<Scene, "title" | "summary" | "tags" | "status" | "color" | "character_ids" | "plotline_id">;

/** Different kinds of criteria combine with AND; values inside one kind with OR. */
export function matchScene(scene: Matchable, f: SceneFilter): boolean {
  const q = f.query.trim().toLowerCase();
  if (q) {
    const hay = [scene.title, scene.summary, ...scene.tags].join("\n").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.statuses.length && !f.statuses.includes(scene.status)) return false;
  if (f.colors.length && !f.colors.includes(scene.color || "none")) return false;
  if (f.characterId && !scene.character_ids.includes(f.characterId)) return false;
  if (f.plotlineId && scene.plotline_id !== f.plotlineId) return false;
  return true;
}

export function statusCounts(scenes: Pick<Scene, "status">[]): Record<SceneStatus, number> {
  const out: Record<SceneStatus, number> = { idea: 0, draft: 0, revised: 0, final: 0 };
  for (const s of scenes) out[cleanStatus(s.status)]++;
  return out;
}

export const toggle = <T,>(list: T[], v: T): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
