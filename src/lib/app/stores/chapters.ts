// Novel chapters: add, rename, move, delete.
// Part of the app's state; see docs/technical/frontend-structure.md.
import { moveChapterTo } from "../../model/model";
import type { Chapter } from "../../model/types";
import { project, touch, uid } from "./core";

/** Append a chapter at the end. Returns its id. */
export function addChapter(title?: string): string {
  const id = uid("ch");
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    const chapter: Chapter = {
      id,
      title: title?.trim() || `Chapter ${proj.chapters.length + 1}`,
      summary: "",
    };
    return { ...proj, chapters: [...proj.chapters, chapter] };
  });
  return id;
}

export function updateChapter(
  chapterId: string,
  fields: Partial<Pick<Chapter, "title" | "summary">>
) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      chapters: proj.chapters.map((c) =>
        c.id === chapterId ? { ...c, ...fields } : c
      ),
    };
  });
}

/** Move a chapter so it ends up at `toIndex` (0-based) in the book. */
export function moveChapter(chapterId: string, toIndex: number) {
  project.update((proj) => {
    if (!proj) return proj;
    const chapters = moveChapterTo(proj.chapters, chapterId, toIndex);
    if (chapters === proj.chapters) return proj;
    touch();
    return { ...proj, chapters };
  });
}

/**
 * Delete a chapter. Only empty chapters can be deleted (scenes are never
 * deleted as a side effect). Returns whether it was deleted.
 */
export function deleteChapter(chapterId: string): boolean {
  let deleted = false;
  project.update((proj) => {
    if (!proj) return proj;
    if (proj.scenes.some((s) => s.chapter_id === chapterId)) return proj;
    touch();
    deleted = true;
    return { ...proj, chapters: proj.chapters.filter((c) => c.id !== chapterId) };
  });
  return deleted;
}
