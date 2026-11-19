// Novel scenes: editing, adding, moving, deleting (a deleted scene keeps a safety snapshot).
// Part of the app's state; see docs/technical/frontend-structure.md.
import { defaultStatusFor } from "../../model/labels";
import { compactOrders, moveSceneTo, scenesInChapter, type SceneTarget } from "../../model/model";
import { hasContent, makeSnapshot, maybeAutoSnapshot } from "../../tools/snapshots";
import type { Scene } from "../../model/types";
import { project, touch, uid } from "./core";
import { selectedSceneId } from "./ui";

export function updateSceneContent(sceneId: string, content: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    const scene = proj.scenes.find((s) => s.id === sceneId);
    // Saves the pre-edit text now and then, so a bad rewrite is never fatal.
    const snapshots = scene
      ? maybeAutoSnapshot(proj.snapshots, scene, content, Date.now(), () => uid("snap"))
      : proj.snapshots;
    return {
      ...proj,
      snapshots,
      scenes: proj.scenes.map((s) =>
        s.id === sceneId ? { ...s, content } : s
      ),
    };
  });
}

export function updateSceneTitle(sceneId: string, title: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      scenes: proj.scenes.map((s) =>
        s.id === sceneId ? { ...s, title } : s
      ),
    };
  });
}

export function updateSceneSummary(sceneId: string, summary: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      scenes: proj.scenes.map((s) =>
        s.id === sceneId ? { ...s, summary } : s
      ),
    };
  });
}

export function updateSceneFields(
  sceneId: string,
  fields: Partial<Pick<Scene, "title" | "summary" | "plotline_id" | "tags" | "status" | "color" | "notes" | "todos" | "when">>
) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      scenes: proj.scenes.map((s) =>
        s.id === sceneId ? { ...s, ...fields } : s
      ),
    };
  });
}

export function addScene(partial?: Partial<Scene>): string {
  const id = uid("sc");
  project.update((proj) => {
    if (!proj) return proj;
    touch();

    // Default: the last chapter (creating "Chapter 1" in an empty project).
    let chapters = proj.chapters;
    if (!partial?.chapter_id && chapters.length === 0) {
      chapters = [{ id: uid("ch"), title: "Chapter 1", summary: "" }];
    }
    const chapterId: string =
      partial?.chapter_id ?? chapters[chapters.length - 1].id;

    const defaultPlotline = proj.plotlines[0]?.id ?? "pl-main";
    const scene: Scene = {
      id,
      title: partial?.title ?? "New Scene",
      summary: partial?.summary ?? "",
      content: partial?.content ?? "",
      chapter_id: chapterId,
      order: scenesInChapter(proj.scenes, chapterId).length,
      plotline_id: partial?.plotline_id ?? defaultPlotline,
      character_ids: partial?.character_ids ?? [],
      place_ids: partial?.place_ids ?? [],
      tags: partial?.tags ?? [],
      status: partial?.status ?? defaultStatusFor(partial?.content ?? ""),
      color: partial?.color ?? "",
      notes: partial?.notes ?? "",
      todos: partial?.todos ?? [],
      when: partial?.when ?? "",
    };
    return { ...proj, chapters, scenes: [...proj.scenes, scene] };
  });
  return id;
}

/** Move a scene to a chapter/plotline, before another scene or at the end of its cell. */
export function moveScene(sceneId: string, target: SceneTarget) {
  project.update((proj) => {
    if (!proj) return proj;
    const scenes = moveSceneTo(proj.scenes, sceneId, target);
    if (scenes === proj.scenes) return proj; // no-op drop
    touch();
    return { ...proj, scenes };
  });
}

export function deleteScene(sceneId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    const doomed = proj.scenes.find((s) => s.id === sceneId);
    // Keep a copy so a deleted scene can be recovered (Snapshots → Deleted scenes).
    const snapshots =
      doomed && hasContent(doomed)
        ? [
            ...proj.snapshots,
            makeSnapshot(doomed, "safety", "Deleted scene", Date.now(), uid("snap")),
          ]
        : proj.snapshots;
    return {
      ...proj,
      snapshots,
      scenes: compactOrders(proj.scenes.filter((s) => s.id !== sceneId)),
    };
  });
  selectedSceneId.update((id) => (id === sceneId ? null : id));
}
