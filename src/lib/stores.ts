import { defaultStatusFor, EMPTY_FILTER, type SceneFilter } from "./labels";
import { addPlotline, updatePlotlineIn, removePlotline, movePlotlineBy } from "./plotlines";
import { writable, derived } from "svelte/store";
import {
  compactOrders,
  moveChapterTo,
  moveSceneTo,
  scenesInChapter,
  type SceneTarget,
} from "./model";
import type { SearchHit } from "./search";
import { applyReplace, type ReplaceFields, type ReplaceOptions } from "./replace";
import {
  applyRestore,
  hasContent,
  makeSnapshot,
  maybeAutoSnapshot,
} from "./snapshots";
import type {
  Project,
  MainView,
  SidePanel,
  Scene,
  Chapter,
  Character,
  Place,
  Note,
} from "./types";

export const project = writable<Project | null>(null);
export const loading = writable(true);
export const error = writable<string | null>(null);

/** Absolute path of the file currently open, or null if unsaved sample. */
export const currentPath = writable<string | null>(null);

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

export const mainView = writable<MainView>("timeline");
export const sidePanel = writable<SidePanel>("characters");
export const selectedSceneId = writable<string | null>(null);

// ─── Search ───────────────────────────────────────────────

export const searchOpen = writable(false);

/** Scene to underline search words in (cleared with the chip in the manuscript view). */
export const sceneHighlight = writable<{ sceneId: string; terms: string[] } | null>(null);

/** Ask the side panel to expand this character / place / note card. */
export const sidePanelFocus = writable<string | null>(null);

/** Jump to a search result and close the search dialog. */
export function openSearchHit(hit: SearchHit, terms: string[]) {
  switch (hit.kind) {
    case "scene":
      selectedSceneId.set(hit.id);
      sceneHighlight.set({ sceneId: hit.id, terms });
      mainView.set("manuscript");
      break;
    case "character":
      sidePanel.set("characters");
      sidePanelFocus.set(hit.id);
      break;
    case "place":
      sidePanel.set("places");
      sidePanelFocus.set(hit.id);
      break;
    case "note":
      sidePanel.set("notes");
      sidePanelFocus.set(hit.id);
      break;
    case "chapter":
      mainView.set("timeline");
      break;
  }
  searchOpen.set(false);
}

export const selectedScene = derived(
  [project, selectedSceneId],
  ([$project, $selectedSceneId]) => {
    if (!$project || !$selectedSceneId) return null;
    return $project.scenes.find((s) => s.id === $selectedSceneId) ?? null;
  }
);

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

function touch() {
  isDirty.set(true);
  revision.update((n) => n + 1);
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Scenes ───────────────────────────────────────────────

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
  fields: Partial<Pick<Scene, "title" | "summary" | "plotline_id" | "tags" | "status" | "color">>
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

// ─── Plotlines ────────────────────────────────────────────

/** Append a plotline (lane) with the next free colour. Returns its id. */
export function addPlotlineToProject(name?: string): string {
  const id = uid("pl");
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return { ...proj, plotlines: addPlotline(proj.plotlines, id, name) };
  });
  return id;
}

export function updatePlotline(id: string, fields: { name?: string; color?: string }) {
  project.update((proj) => {
    if (!proj) return proj;
    const plotlines = updatePlotlineIn(proj.plotlines, id, fields);
    if (plotlines === proj.plotlines) return proj;
    touch();
    return { ...proj, plotlines };
  });
}

/** Delete a plotline; its scenes move to another one. False if it is the last. */
export function deletePlotline(id: string): boolean {
  let done = false;
  project.update((proj) => {
    if (!proj) return proj;
    const r = removePlotline(proj.plotlines, proj.scenes, id);
    if (!r) return proj;
    touch();
    done = true;
    return { ...proj, ...r };
  });
  return done;
}

export function movePlotline(id: string, delta: number) {
  project.update((proj) => {
    if (!proj) return proj;
    const plotlines = movePlotlineBy(proj.plotlines, id, delta);
    if (plotlines === proj.plotlines) return proj;
    touch();
    return { ...proj, plotlines };
  });
}

// ─── Chapters ─────────────────────────────────────────────

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

// ─── Snapshots ────────────────────────────────────────────

export const snapshotsOpen = writable(false);
export const exportOpen = writable(false);
export const replaceOpen = writable(false);
/** Distraction-free writing: only the manuscript is shown. */
export const focusMode = writable(false);

/**
 * Replace text in the chosen scenes (see replace.ts). Each changed scene gets a
 * safety snapshot first. Returns how many scenes / replacements were changed.
 */
export function replaceInScenes(
  find: string,
  replacement: string,
  opts: ReplaceOptions,
  fields: ReplaceFields,
  sceneIds: string[]
): { scenes: number; replacements: number } {
  let result = { scenes: 0, replacements: 0 };
  project.update((proj) => {
    if (!proj) return proj;
    const r = applyReplace(proj, find, replacement, opts, fields, new Set(sceneIds), Date.now(), () => uid("snap"));
    result = { scenes: r.scenes, replacements: r.replacements };
    if (r.project !== proj) touch();
    return r.project;
  });
  return result;
}

/** Save the scene as it is now. Returns the snapshot id. */
export function takeSnapshot(sceneId: string, label: string): string | null {
  const id = uid("snap");
  let taken = false;
  project.update((proj) => {
    if (!proj) return proj;
    const scene = proj.scenes.find((s) => s.id === sceneId);
    if (!scene) return proj;
    touch();
    taken = true;
    return {
      ...proj,
      snapshots: [
        ...proj.snapshots,
        makeSnapshot(scene, "manual", label.trim(), Date.now(), id),
      ],
    };
  });
  return taken ? id : null;
}

export function deleteSnapshot(snapshotId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return { ...proj, snapshots: proj.snapshots.filter((s) => s.id !== snapshotId) };
  });
}

/** Permanently forget every snapshot of a scene that no longer exists. */
export function deleteSceneSnapshots(sceneId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return { ...proj, snapshots: proj.snapshots.filter((s) => s.scene_id !== sceneId) };
  });
}

/**
 * Bring a snapshot back. If the scene still exists its title, synopsis and
 * text are replaced (the current version is saved as a safety snapshot first,
 * so this can be undone). If the scene was deleted it is recreated.
 * Returns the id of the restored scene, or null if nothing happened.
 */
export function restoreSnapshot(snapshotId: string): string | null {
  let restored: string | null = null;
  project.update((proj) => {
    if (!proj) return proj;
    const result = applyRestore(proj, snapshotId, Date.now(), uid);
    restored = result.sceneId;
    if (result.project !== proj) touch();
    return result.project;
  });
  return restored;
}

// ─── Characters ───────────────────────────────────────────

export function updateCharacter(id: string, fields: Partial<Character>) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      characters: proj.characters.map((c) =>
        c.id === id ? { ...c, ...fields } : c
      ),
    };
  });
}

export function addCharacter(name?: string): string {
  const id = uid("char");
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    const character: Character = {
      id,
      name: name?.trim() || "New Character",
      aliases: [],
      description: "",
      role: "",
      category: "Main",
      traits: [],
      notes: "",
    };
    return { ...proj, characters: [...proj.characters, character] };
  });
  return id;
}

export function deleteCharacter(id: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      characters: proj.characters.filter((c) => c.id !== id),
      // Also remove from scene references
      scenes: proj.scenes.map((s) => ({
        ...s,
        character_ids: s.character_ids.filter((cid) => cid !== id),
      })),
    };
  });
}

// ─── Places ───────────────────────────────────────────────

export function updatePlace(id: string, fields: Partial<Place>) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      places: proj.places.map((p) => (p.id === id ? { ...p, ...fields } : p)),
    };
  });
}

export function addPlace(name?: string): string {
  const id = uid("place");
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    const place: Place = {
      id,
      name: name?.trim() || "New Place",
      aliases: [],
      description: "",
      location: "",
      notes: "",
    };
    return { ...proj, places: [...proj.places, place] };
  });
  return id;
}

export function deletePlace(id: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      places: proj.places.filter((p) => p.id !== id),
      scenes: proj.scenes.map((s) => ({
        ...s,
        place_ids: s.place_ids.filter((pid) => pid !== id),
      })),
    };
  });
}

// ─── Notes ────────────────────────────────────────────────

export function updateNote(id: string, fields: Partial<Note>) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      notes: proj.notes.map((n) => (n.id === id ? { ...n, ...fields } : n)),
    };
  });
}

export function addNote(): string {
  const id = uid("note");
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    const note: Note = {
      id,
      title: "New Note",
      content: "",
      tags: [],
    };
    return { ...proj, notes: [...proj.notes, note] };
  });
  return id;
}

export function deleteNote(id: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      notes: proj.notes.filter((n) => n.id !== id),
    };
  });
}

export function markClean() {
  isDirty.set(false);
}

// ─── Scene ↔ Character / Place links ──────────────────────

export function linkCharacterToScene(sceneId: string, characterId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      scenes: proj.scenes.map((s) => {
        if (s.id !== sceneId) return s;
        if (s.character_ids.includes(characterId)) return s;
        return { ...s, character_ids: [...s.character_ids, characterId] };
      }),
    };
  });
}

export function unlinkCharacterFromScene(sceneId: string, characterId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      scenes: proj.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              character_ids: s.character_ids.filter((id) => id !== characterId),
            }
          : s
      ),
    };
  });
}

export function linkPlaceToScene(sceneId: string, placeId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      scenes: proj.scenes.map((s) => {
        if (s.id !== sceneId) return s;
        if (s.place_ids.includes(placeId)) return s;
        return { ...s, place_ids: [...s.place_ids, placeId] };
      }),
    };
  });
}

export function unlinkPlaceFromScene(sceneId: string, placeId: string) {
  project.update((proj) => {
    if (!proj) return proj;
    touch();
    return {
      ...proj,
      scenes: proj.scenes.map((s) =>
        s.id === sceneId
          ? { ...s, place_ids: s.place_ids.filter((id) => id !== placeId) }
          : s
      ),
    };
  });
}

/** Timeline filter (session only; not saved in the project). */
export const sceneFilter = writable<SceneFilter>(EMPTY_FILTER);

/** Theme gallery dialog. */
export const galleryOpen = writable(false);

/** Themes browser dialog. */
export const themesOpen = writable(false);
