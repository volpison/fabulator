/**
 * Where do characters and places show up?
 *
 * A scene counts as an appearance when the entity is LINKED to it (cast list)
 * and/or NAMED in its text (name or alias, see mentions.ts). Comparing the two
 * is what catches continuity slips: "linked but never named" and
 * "named but not linked".
 *
 * Pure functions (no Svelte/Tauri) so they are unit-tested.
 */
import type { Project, Scene } from "./types";
import { readingOrder } from "./model";
import {
  entitiesOf,
  findMentionsInText,
  htmlToPlainText,
  type Entity,
  type EntityType,
} from "./mentions";

export type Appearance = {
  scene: Scene;
  /** 1-based position of the scene in reading order. */
  position: number;
  chapterNumber: number;
  chapterTitle: string;
  /** Linked to the scene's cast / setting list. */
  linked: boolean;
  /** How many times the text names them (0 = never). */
  mentions: number;
};

export type AppearanceReport = {
  type: EntityType;
  id: string;
  totalScenes: number;
  /** Scenes where they are linked and/or named, in reading order. */
  appearances: Appearance[];
  first: Appearance | null;
  last: Appearance | null;
  /** Longest run of scenes between two appearances where they are absent. */
  longestGap: { length: number; afterPosition: number } | null;
  /** Scenes after the last appearance. */
  scenesSinceLast: number;
  /** Linked to the scene but the text never names them. */
  linkedNotNamed: Appearance[];
  /** Named in the text but not linked to the scene. */
  namedNotLinked: Appearance[];
};

export type CellState = "both" | "linked" | "named" | "";

export type CastGrid = {
  scenes: {
    scene: Scene;
    position: number;
    chapterNumber: number;
    chapterTitle: string;
  }[];
  rows: {
    type: EntityType;
    id: string;
    name: string;
    cells: CellState[];
    /** Scenes where they appear (linked and/or named). */
    count: number;
  }[];
};

// ─── per-scene mention cache ─────────────────────────────────
// Typing in one scene must not re-scan every other scene.

type Counts = Map<string, number>;
const cache = new Map<string, { content: string; key: string; counts: Counts }>();

export function clearAppearanceCache(): void {
  cache.clear();
}

const keyOf = (type: EntityType, id: string) => `${type}:${id}`;

function entitiesSignature(entities: Entity[]): string {
  return JSON.stringify(entities.map((e) => [e.type, e.id, e.terms]));
}

function sceneCounts(scene: Scene, entities: Entity[], signature: string): Counts {
  const hit = cache.get(scene.id);
  if (hit && hit.content === scene.content && hit.key === signature) {
    return hit.counts;
  }
  const counts: Counts = new Map();
  for (const m of findMentionsInText(htmlToPlainText(scene.content), entities)) {
    const k = keyOf(m.type, m.id);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  cache.set(scene.id, { content: scene.content, key: signature, counts });
  return counts;
}

function isLinked(scene: Scene, type: EntityType, id: string): boolean {
  return type === "character"
    ? scene.character_ids.includes(id)
    : scene.place_ids.includes(id);
}

function orderedScenes(project: Project) {
  const titles = new Map(project.chapters.map((c, i) => [c.id, [i + 1, c.title] as const]));
  return readingOrder(project).map((scene, i) => ({
    scene,
    position: i + 1,
    chapterNumber: titles.get(scene.chapter_id)?.[0] ?? 0,
    chapterTitle: titles.get(scene.chapter_id)?.[1] ?? "",
  }));
}

// ─── per-entity report ───────────────────────────────────────

/** Null if no such character/place exists. */
export function appearanceReport(
  project: Project,
  type: EntityType,
  id: string
): AppearanceReport | null {
  const exists =
    type === "character"
      ? project.characters.some((c) => c.id === id)
      : project.places.some((p) => p.id === id);
  if (!exists) return null;

  const entities = entitiesOf(project);
  const signature = entitiesSignature(entities);
  const scenes = orderedScenes(project);

  const appearances: Appearance[] = [];
  for (const s of scenes) {
    const linked = isLinked(s.scene, type, id);
    const mentions = sceneCounts(s.scene, entities, signature).get(keyOf(type, id)) ?? 0;
    if (linked || mentions > 0) {
      appearances.push({
        scene: s.scene,
        position: s.position,
        chapterNumber: s.chapterNumber,
        chapterTitle: s.chapterTitle,
        linked,
        mentions,
      });
    }
  }

  let longestGap: AppearanceReport["longestGap"] = null;
  for (let i = 1; i < appearances.length; i++) {
    const length = appearances[i].position - appearances[i - 1].position - 1;
    if (length > 0 && (!longestGap || length > longestGap.length)) {
      longestGap = { length, afterPosition: appearances[i - 1].position };
    }
  }

  const last = appearances[appearances.length - 1] ?? null;

  return {
    type,
    id,
    totalScenes: scenes.length,
    appearances,
    first: appearances[0] ?? null,
    last,
    longestGap,
    scenesSinceLast: last ? scenes.length - last.position : scenes.length,
    linkedNotNamed: appearances.filter((a) => a.linked && a.mentions === 0),
    namedNotLinked: appearances.filter((a) => !a.linked && a.mentions > 0),
  };
}

// ─── whole-cast grid ─────────────────────────────────────────

/** Every character and place against every scene, in reading order. */
export function castGrid(project: Project): CastGrid {
  const entities = entitiesOf(project);
  const signature = entitiesSignature(entities);
  const scenes = orderedScenes(project);
  const counts = scenes.map((s) => sceneCounts(s.scene, entities, signature));

  const row = (type: EntityType, id: string, name: string) => {
    const cells: CellState[] = scenes.map((s, i) => {
      const linked = isLinked(s.scene, type, id);
      const named = (counts[i].get(keyOf(type, id)) ?? 0) > 0;
      return linked && named ? "both" : linked ? "linked" : named ? "named" : "";
    });
    return { type, id, name, cells, count: cells.filter(Boolean).length };
  };

  return {
    scenes,
    rows: [
      ...project.characters.map((c) => row("character", c.id, c.name)),
      ...project.places.map((p) => row("place", p.id, p.name)),
    ],
  };
}

// ─── per-scene continuity ────────────────────────────────────

export type ContinuityItem = {
  type: EntityType;
  id: string;
  name: string;
  /** How many times the scene text names them (0 = never). */
  mentions: number;
  linked: boolean;
};

export type SceneContinuity = {
  /** Linked and named — everything lines up. */
  matched: ContinuityItem[];
  /** On the cast / setting list, but the prose never names them. */
  linkedNotNamed: ContinuityItem[];
  /** Named in the prose, but not linked to this scene. */
  namedNotLinked: ContinuityItem[];
  /** linkedNotNamed + namedNotLinked. */
  issueCount: number;
};

/**
 * Continuity for one scene while writing: who is on the cast vs who the
 * text actually names. Reuses the same mention rules as appearanceReport.
 */
export function sceneContinuity(
  project: Project,
  scene: Scene
): SceneContinuity {
  const entities = entitiesOf(project);
  const signature = entitiesSignature(entities);
  const counts = sceneCounts(scene, entities, signature);

  const matched: ContinuityItem[] = [];
  const linkedNotNamed: ContinuityItem[] = [];
  const namedNotLinked: ContinuityItem[] = [];

  const seen = new Set<string>();

  const push = (type: EntityType, id: string, name: string) => {
    const k = keyOf(type, id);
    if (seen.has(k)) return;
    seen.add(k);
    const linked = isLinked(scene, type, id);
    const mentions = counts.get(k) ?? 0;
    if (!linked && mentions === 0) return;
    const item: ContinuityItem = { type, id, name, mentions, linked };
    if (linked && mentions > 0) matched.push(item);
    else if (linked) linkedNotNamed.push(item);
    else namedNotLinked.push(item);
  };

  for (const c of project.characters) push("character", c.id, c.name);
  for (const p of project.places) push("place", p.id, p.name);

  for (const e of entities) {
    push(e.type, e.id, e.name);
  }

  return {
    matched,
    linkedNotNamed,
    namedNotLinked,
    issueCount: linkedNotNamed.length + namedNotLinked.length,
  };
}
