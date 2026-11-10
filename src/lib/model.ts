/**
 * Pure helpers over the chapter/scene model (no Svelte, no Tauri).
 *
 * Book order = chapters in array order, then scenes by `order` inside each
 * chapter. Plotlines are a planning lens only; they don't affect reading order.
 */
import type { Chapter, Project, Scene } from "./types";

/** Scenes of one chapter, in order. */
export function scenesInChapter(scenes: Scene[], chapterId: string): Scene[] {
  return scenes
    .filter((s) => s.chapter_id === chapterId)
    .sort((a, b) => a.order - b.order);
}

/** Every scene in book (reading) order. */
export function readingOrder(p: Pick<Project, "chapters" | "scenes">): Scene[] {
  return p.chapters.flatMap((c) => scenesInChapter(p.scenes, c.id));
}

/** 1-based position of the scene's chapter in the book; 0 if it has none. */
export function chapterNumber(
  p: Pick<Project, "chapters">,
  scene: Pick<Scene, "chapter_id">
): number {
  return p.chapters.findIndex((c) => c.id === scene.chapter_id) + 1;
}

/** Re-number `order` to 0..n-1 inside every chapter, keeping relative order. */
export function compactOrders(scenes: Scene[]): Scene[] {
  const byChapter = new Map<string, Scene[]>();
  for (const s of scenes) {
    const list = byChapter.get(s.chapter_id) ?? [];
    list.push(s);
    byChapter.set(s.chapter_id, list);
  }
  const newOrder = new Map<string, number>();
  for (const list of byChapter.values()) {
    [...list]
      .sort((a, b) => a.order - b.order)
      .forEach((s, i) => newOrder.set(s.id, i));
  }
  return scenes.map((s) => ({ ...s, order: newOrder.get(s.id) ?? s.order }));
}

/** Move a chapter so it ends up at index `toIndex` (clamped) in the result. */
export function moveChapterTo(
  chapters: Chapter[],
  chapterId: string,
  toIndex: number
): Chapter[] {
  const from = chapters.findIndex((c) => c.id === chapterId);
  if (from === -1) return chapters;
  const to = Math.max(0, Math.min(chapters.length - 1, Math.floor(toIndex)));
  if (to === from) return chapters;
  const out = [...chapters];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

export type SceneTarget = {
  chapterId: string;
  plotlineId: string;
  /**
   * Insert right before this scene (it must be in the target chapter).
   * Omit / null: put it at the end of the target cell, i.e. after the last
   * scene of that plotline in that chapter (or at the end of the chapter if
   * that plotline has no scene there yet).
   */
  beforeSceneId?: string | null;
  /** Put it after every scene of the target chapter (exact end of the chapter). */
  atEnd?: boolean;
};

/**
 * Move one scene to a chapter + plotline at a given position. Positions are
 * kept dense (0..n-1) in every affected chapter. Dropping a scene before
 * itself changes nothing.
 */
export function moveSceneTo(
  scenes: Scene[],
  sceneId: string,
  target: SceneTarget
): Scene[] {
  const moving = scenes.find((s) => s.id === sceneId);
  if (!moving || target.beforeSceneId === sceneId) return scenes;

  const rest = scenes.filter((s) => s.id !== sceneId);
  const siblings = scenesInChapter(rest, target.chapterId);

  let index = siblings.length;
  const before = target.atEnd ? -1 : target.beforeSceneId
    ? siblings.findIndex((s) => s.id === target.beforeSceneId)
    : -1;
  if (before !== -1) {
    index = before;
  } else if (!target.atEnd) {
    for (let i = siblings.length - 1; i >= 0; i--) {
      if (siblings[i].plotline_id === target.plotlineId) {
        index = i + 1;
        break;
      }
    }
  }

  const placed: Scene = {
    ...moving,
    chapter_id: target.chapterId,
    plotline_id: target.plotlineId,
  };
  const ordered = [...siblings];
  ordered.splice(index, 0, placed);
  const newOrder = new Map(ordered.map((s, i) => [s.id, i]));

  const result = scenes.map((s) => {
    if (s.id === sceneId) return { ...placed, order: newOrder.get(s.id) ?? 0 };
    const o = newOrder.get(s.id);
    return o === undefined ? s : { ...s, order: o };
  });
  return compactOrders(result); // also tidies the chapter the scene left
}

/**
 * Where a scene lands when dropped on the top or bottom half of another scene
 * in the reading-order list. The scene keeps its plotline. Returns null when
 * the drop would not change anything.
 */
export function sceneDropTarget(
  p: Pick<Project, "chapters" | "scenes">,
  movingId: string,
  overId: string,
  after: boolean
): SceneTarget | null {
  const moving = p.scenes.find((s) => s.id === movingId);
  const over = p.scenes.find((s) => s.id === overId);
  if (!moving || !over || movingId === overId) return null;

  const siblings = scenesInChapter(p.scenes, over.chapter_id);
  const insertAt = siblings.findIndex((s) => s.id === overId) + (after ? 1 : 0);

  if (moving.chapter_id === over.chapter_id) {
    const j = siblings.findIndex((s) => s.id === movingId);
    if (insertAt === j || insertAt === j + 1) return null; // already there
  }

  const next = siblings.slice(insertAt).find((s) => s.id !== movingId);
  return next
    ? { chapterId: over.chapter_id, plotlineId: moving.plotline_id, beforeSceneId: next.id }
    : { chapterId: over.chapter_id, plotlineId: moving.plotline_id, atEnd: true };
}
