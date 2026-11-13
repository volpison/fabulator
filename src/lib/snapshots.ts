/**
 * Scene and comic-page snapshots: pure logic (no Svelte/Tauri), unit-tested.
 *
 * Three kinds (see SnapshotKind): manual (yours), auto (taken as you write,
 * pruned), safety (before a restore / a scene delete; never pruned).
 * Snapshots live in the project file, so they are saved, backed up and moved
 * together with the story.
 */
import { defaultStatusFor } from "./labels";
import type { ComicPage, Project, Scene, Snapshot, SnapshotKind } from "./types";
import { pageWords, wordsOfHtml } from "./wordcount";
import { pagesInIssue } from "./comic";
import { deletePage } from "./comicedit";
import { htmlToPlainText } from "./mentions";

/** An auto snapshot is taken at most this often per scene. */
export const AUTO_INTERVAL_MS = 30 * 60 * 1000;
/** Auto snapshots kept per scene / in the whole project (oldest go first). */
export const AUTO_KEEP_PER_SCENE = 10;
export const AUTO_KEEP_TOTAL = 200;

const isBlank = (html: string) => htmlToPlainText(html).trim() === "";

/** Does the scene hold anything worth protecting (text or a synopsis)? */
export function hasContent(scene: Pick<Scene, "content" | "summary">): boolean {
  return !isBlank(scene.content) || scene.summary.trim() !== "";
}

export function makeSnapshot(
  scene: Scene,
  kind: SnapshotKind,
  label: string,
  now: number,
  id: string
): Snapshot {
  return {
    id,
    scene_id: scene.id,
    kind,
    label,
    created_at: now,
    title: scene.title,
    summary: scene.summary,
    content: scene.content,
    chapter_id: scene.chapter_id,
    plotline_id: scene.plotline_id,
    character_ids: [...scene.character_ids],
    place_ids: [...scene.place_ids],
    tags: [...scene.tags],
  };
}

// ─── Comic pages ───

const clonePage = (pg: ComicPage): ComicPage => JSON.parse(JSON.stringify(pg));

/** Does the page hold anything worth protecting (a plot, or any panel text)? */
export function pageHasContent(pg: Pick<ComicPage, "plot" | "panels">): boolean {
  return (
    pg.plot.trim() !== "" ||
    pg.panels.some((pn) => pn.description.trim() !== "" || pn.lines.some((ln) => ln.text.trim() !== ""))
  );
}

/** A snapshot of a whole page. `scene_id` holds the page id so every list of snapshots works unchanged. */
export function makePageSnapshot(pg: ComicPage, kind: SnapshotKind, label: string, now: number, id: string): Snapshot {
  return {
    id,
    scene_id: pg.id,
    kind,
    label,
    created_at: now,
    title: pg.title,
    summary: pg.plot,
    content: "",
    chapter_id: pg.issue_id,
    plotline_id: pg.plotline_id,
    character_ids: [...pg.character_ids],
    place_ids: [...pg.place_ids],
    tags: [...pg.tags],
    page: clonePage(pg),
  };
}

/** The page as readable text (plot, then each panel with its lettering): what Compare shows. */
export function pageToText(pg: Pick<ComicPage, "plot" | "panels" | "title">, nameOf: (id: string) => string = () => ""): string {
  const out: string[] = [];
  if (pg.plot.trim()) out.push(pg.plot.trim());
  pg.panels.forEach((pn, k) => {
    out.push(`Panel ${k + 1}`);
    if (pn.description.trim()) out.push(pn.description.trim());
    for (const ln of pn.lines) {
      const who = ln.kind === "sfx" ? "SFX" : ln.kind === "caption" ? "Caption" : nameOf(ln.speaker_id);
      out.push([who, ln.text.trim()].filter(Boolean).join(": "));
    }
  });
  return out.join("\n\n");
}

/** The text of what a snapshot holds (scene text, or a page as readable text). */
export function snapshotText(snap: Snapshot, nameOf?: (id: string) => string): string {
  return snap.page ? pageToText(snap.page, nameOf) : htmlToPlainText(snap.content);
}

export function snapshotWords(snap: Snapshot): number {
  return snap.page ? pageWords(snap.page) : wordsOfHtml(snap.content);
}

/** What changing a page's writing means for snapshots: the part that counts. */
const writing = (pg: ComicPage) => JSON.stringify([pg.title, pg.plot, pg.layout, pg.panels]);

/**
 * Like maybeAutoSnapshot, for a page that is about to change from `before`.
 * Same rules: at most one per AUTO_INTERVAL_MS per page, never of an empty page,
 * never when that exact state is already saved.
 */
export function maybeAutoPageSnapshot(snapshots: Snapshot[], before: ComicPage, now: number, newId: () => string): Snapshot[] {
  if (!pageHasContent(before)) return snapshots;
  let latest: Snapshot | null = null;
  for (const s of snapshots) if (s.scene_id === before.id && (!latest || s.created_at > latest.created_at)) latest = s;
  if (latest) {
    if (now - latest.created_at < AUTO_INTERVAL_MS) return snapshots;
    if (latest.page && writing(latest.page) === writing(before)) return snapshots;
  }
  return pruneAuto([...snapshots, makePageSnapshot(before, "auto", "Autosaved version", now, newId())]);
}

/** After an edit: give every page whose writing changed an auto snapshot of how it was. Same object when none. */
export function autoSnapshotPages(before: Project, after: Project, now: number, newId: () => string): Project {
  if (before.pages === after.pages) return after;
  const old = new Map(before.pages.map((pg) => [pg.id, pg]));
  let snapshots = after.snapshots;
  for (const pg of after.pages) {
    const was = old.get(pg.id);
    if (!was || was === pg || writing(was) === writing(pg)) continue;
    snapshots = maybeAutoPageSnapshot(snapshots, was, now, newId);
  }
  return snapshots === after.snapshots ? after : { ...after, snapshots };
}

/** Delete a page, first keeping a safety copy (like deleting a scene with text). */
export function deletePageKeeping(p: Project, pageId: string, now: number, newId: () => string): Project {
  const page = p.pages.find((pg) => pg.id === pageId);
  if (!page) return p;
  const kept = pageHasContent(page) ? [...p.snapshots, makePageSnapshot(page, "safety", "Deleted page", now, newId())] : p.snapshots;
  return { ...deletePage(p, pageId), snapshots: kept };
}

/** The page with its title, plot, layout and panels taken from a snapshot (cast, stage, notes stay as they are). */
export function restorePageInto(pg: ComicPage, snap: Snapshot): ComicPage {
  const was = snap.page;
  if (!was) return pg;
  return { ...pg, title: was.title, plot: was.plot, layout: was.layout, panels: clonePage(was).panels };
}

/** A page rebuilt from a snapshot of a deleted page: back at the end of its issue (or the first one). */
export function recreatePage(
  project: Pick<Project, "issues" | "plotlines" | "pages" | "characters" | "places">,
  snap: Snapshot,
  freshId: () => string
): ComicPage {
  const was = clonePage(snap.page as ComicPage);
  const issueId = project.issues.some((i) => i.id === was.issue_id) ? was.issue_id : (project.issues[0]?.id ?? was.issue_id);
  return {
    ...was,
    id: project.pages.some((pg) => pg.id === was.id) ? freshId() : was.id,
    issue_id: issueId,
    order: pagesInIssue(project.pages, issueId).length,
    plotline_id: project.plotlines.some((x) => x.id === was.plotline_id) ? was.plotline_id : "",
    character_ids: was.character_ids.filter((c) => project.characters.some((x) => x.id === c)),
    place_ids: was.place_ids.filter((c) => project.places.some((x) => x.id === c)),
  };
}

/** Snapshots of one scene, newest first. */
export function snapshotsFor(snapshots: Snapshot[], sceneId: string): Snapshot[] {
  return snapshots
    .filter((s) => s.scene_id === sceneId)
    .sort((a, b) => b.created_at - a.created_at);
}

/** Drop the oldest auto snapshots beyond the per-scene and global limits. */
export function pruneAuto(snapshots: Snapshot[]): Snapshot[] {
  const drop = new Set<string>();

  const perScene = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    if (s.kind !== "auto") continue;
    const list = perScene.get(s.scene_id) ?? [];
    list.push(s);
    perScene.set(s.scene_id, list);
  }
  for (const list of perScene.values()) {
    list
      .sort((a, b) => b.created_at - a.created_at)
      .slice(AUTO_KEEP_PER_SCENE)
      .forEach((s) => drop.add(s.id));
  }

  const survivors = snapshots
    .filter((s) => s.kind === "auto" && !drop.has(s.id))
    .sort((a, b) => b.created_at - a.created_at);
  survivors.slice(AUTO_KEEP_TOTAL).forEach((s) => drop.add(s.id));

  return drop.size === 0 ? snapshots : snapshots.filter((s) => !drop.has(s.id));
}

/**
 * Called right before a scene's text is replaced with `newContent`.
 * Adds an auto snapshot of the scene as it is NOW (the pre-edit state) when
 * the last snapshot of that scene is older than AUTO_INTERVAL_MS (or there is
 * none) and the text actually differs from it. Returns the same array when
 * nothing needs saving, so callers can cheaply detect "no change".
 */
export function maybeAutoSnapshot(
  snapshots: Snapshot[],
  scene: Scene,
  newContent: string,
  now: number,
  newId: () => string
): Snapshot[] {
  if (newContent === scene.content || isBlank(scene.content)) return snapshots;

  let latest: Snapshot | null = null;
  for (const s of snapshots) {
    if (s.scene_id === scene.id && (!latest || s.created_at > latest.created_at)) {
      latest = s;
    }
  }
  if (latest) {
    if (now - latest.created_at < AUTO_INTERVAL_MS) return snapshots;
    if (
      latest.content === scene.content &&
      latest.title === scene.title &&
      latest.summary === scene.summary
    ) {
      return snapshots; // that exact state is already saved
    }
  }
  return pruneAuto([...snapshots, makeSnapshot(scene, "auto", "Autosaved version", now, newId())]);
}

/** The scene with its title, synopsis and text taken from a snapshot. */
export function restoreInto(scene: Scene, snap: Snapshot): Scene {
  return { ...scene, title: snap.title, summary: snap.summary, content: snap.content };
}

/**
 * A scene rebuilt from a snapshot of a deleted scene. Keeps its original id
 * when free; falls back to the first chapter/plotline if the originals are gone.
 */
export function recreateScene(
  project: Pick<Project, "chapters" | "plotlines" | "scenes" | "characters" | "places">,
  snap: Snapshot,
  freshId: () => string
): Scene {
  const chapterId = project.chapters.some((c) => c.id === snap.chapter_id)
    ? snap.chapter_id
    : (project.chapters[0]?.id ?? snap.chapter_id);
  const plotlineId = project.plotlines.some((p) => p.id === snap.plotline_id)
    ? snap.plotline_id
    : (project.plotlines[0]?.id ?? snap.plotline_id);
  const id = project.scenes.some((s) => s.id === snap.scene_id)
    ? freshId()
    : snap.scene_id;
  const inChapter = project.scenes.filter((s) => s.chapter_id === chapterId);

  return {
    id,
    title: snap.title,
    summary: snap.summary,
    content: snap.content,
    chapter_id: chapterId,
    order: inChapter.length ? Math.max(...inChapter.map((s) => s.order)) + 1 : 0,
    plotline_id: plotlineId,
    // Only keep links that still point at something.
    character_ids: snap.character_ids.filter((c) => project.characters.some((x) => x.id === c)),
    place_ids: snap.place_ids.filter((p) => project.places.some((x) => x.id === p)),
    tags: [...snap.tags],
    // Snapshots do not record these; a recreated scene starts unlabelled.
    status: defaultStatusFor(snap.content),
    color: "",
    notes: "",
    todos: [],
    when: "",
  };
}

/**
 * Bring a snapshot back. If its scene still exists, title/synopsis/text are
 * replaced and the current version is first saved as a "safety" snapshot (so
 * the restore can be undone). If the scene was deleted it is recreated.
 * Returns the same project object when nothing changes.
 */
export function applyRestore(
  project: Project,
  snapshotId: string,
  now: number,
  newId: (prefix: "snap" | "sc" | "ch") => string
): { project: Project; sceneId: string | null } {
  const snap = project.snapshots.find((s) => s.id === snapshotId);
  if (!snap) return { project, sceneId: null };

  if (snap.page) {
    // A comic page: `sceneId` in the result is the page id.
    const here = project.pages.find((pg) => pg.id === snap.scene_id);
    if (here) {
      if (writing(here) === writing(snap.page)) return { project, sceneId: here.id };
      const safety = makePageSnapshot(here, "safety", `Before restoring “${snap.label || "a snapshot"}”`, now, newId("snap"));
      return {
        sceneId: here.id,
        project: {
          ...project,
          snapshots: [...project.snapshots, safety],
          pages: project.pages.map((pg) => (pg.id === here.id ? restorePageInto(pg, snap) : pg)),
        },
      };
    }
    const issues = project.issues.length > 0 ? project.issues : [{ id: newId("ch"), title: "", summary: "" }];
    const page = recreatePage({ ...project, issues }, snap, () => newId("sc"));
    return { sceneId: page.id, project: { ...project, issues, pages: [...project.pages, page] } };
  }

  const existing = project.scenes.find((s) => s.id === snap.scene_id);
  if (existing) {
    const identical =
      existing.title === snap.title &&
      existing.summary === snap.summary &&
      existing.content === snap.content;
    if (identical) return { project, sceneId: existing.id };

    const safety = makeSnapshot(
      existing,
      "safety",
      `Before restoring “${snap.label || "a snapshot"}”`,
      now,
      newId("snap")
    );
    return {
      sceneId: existing.id,
      project: {
        ...project,
        snapshots: [...project.snapshots, safety],
        scenes: project.scenes.map((s) => (s.id === existing.id ? restoreInto(s, snap) : s)),
      },
    };
  }

  const chapters =
    project.chapters.length > 0
      ? project.chapters
      : [{ id: newId("ch"), title: "Chapter 1", summary: "" }];
  const scene = recreateScene({ ...project, chapters }, snap, () => newId("sc"));
  return {
    sceneId: scene.id,
    project: { ...project, chapters, scenes: [...project.scenes, scene] },
  };
}

export type DeletedScene = {
  sceneId: string;
  /** Most recent snapshot of the deleted scene. */
  snapshot: Snapshot;
  /** How many snapshots exist for it. */
  versions: number;
};

/** Scenes that no longer exist but still have snapshots, most recently saved first. */
export function deletedScenes(project: Pick<Project, "scenes" | "snapshots"> & Partial<Pick<Project, "pages">>): DeletedScene[] {
  const alive = new Set([...project.scenes.map((s) => s.id), ...(project.pages ?? []).map((pg) => pg.id)]);
  const by = new Map<string, Snapshot[]>();
  for (const s of project.snapshots) {
    if (alive.has(s.scene_id)) continue;
    const list = by.get(s.scene_id) ?? [];
    list.push(s);
    by.set(s.scene_id, list);
  }
  return [...by.entries()]
    .map(([sceneId, list]) => {
      const newest = [...list].sort((a, b) => b.created_at - a.created_at)[0];
      return { sceneId, snapshot: newest, versions: list.length };
    })
    .sort((a, b) => b.snapshot.created_at - a.snapshot.created_at);
}

/** Words in a scene's HTML (same counter the diff uses). */
export function wordsOf(html: string): number {
  return wordsOfHtml(html);
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", else a date. */
export function timeAgo(now: number, then: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(then).toLocaleDateString();
}
