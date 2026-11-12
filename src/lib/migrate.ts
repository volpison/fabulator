/**
 * Project file format versioning.
 *
 * `migrateProject` takes whatever JSON was on disk and returns a valid,
 * current-version Project. Keep CURRENT_SCHEMA_VERSION in sync with
 * SCHEMA_VERSION in src-tauri/src/models/mod.rs.
 *
 * To change the format later: bump the version, add a `migrations[n]` step that
 * turns version n into n+1, and add a test. Never edit an old step.
 */
import { cleanColor, cleanStatus, defaultStatusFor } from "./labels";
import { cleanTodos } from "./scenenotes";
import { DEFAULT_STORY_FORMAT, readStoryFormat } from "./formats";
import type { Chapter, Project, Scene, Snapshot, SnapshotKind } from "./types";

export const CURRENT_SCHEMA_VERSION = 7;

export type MigrationResult = {
  project: Project;
  /** The version found on disk if it was upgraded, otherwise null. */
  migratedFrom: number | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const isObject = (x: unknown): x is Raw =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, fallback = ""): string =>
  typeof x === "string" ? x : fallback;

/** v0 (no schema_version, scenes have a numeric `chapter`) -> v1 (Chapter entities). */
function v0ToV1(p: Raw): Raw {
  const scenes = arr(p.scenes).filter(isObject);
  const chapterNumber = (s: Raw): number =>
    Number.isFinite(Number(s.chapter)) ? Number(s.chapter) : 1;

  const numbers = [...new Set(scenes.map(chapterNumber))].sort((a, b) => a - b);
  const chapters: Chapter[] = numbers.map((n) => ({
    id: `ch-${n}`,
    title: `Chapter ${n}`,
    summary: "",
  }));

  const nextOrder = new Map<number, number>();
  const migratedScenes = scenes.map((s) => {
    const n = chapterNumber(s);
    const order = nextOrder.get(n) ?? 0;
    nextOrder.set(n, order + 1);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { chapter: _old, ...rest } = s;
    return { ...rest, chapter_id: `ch-${n}`, order };
  });

  return { ...p, schema_version: 1, chapters, scenes: migratedScenes };
}

/** v1 -> v2: characters and places gain `aliases` (empty; normalize() fills them). */
function v1ToV2(p: Raw): Raw {
  return { ...p, schema_version: 2 };
}

/** v2 -> v3: the project gains `snapshots` (empty; normalize() fills it). */
function v2ToV3(p: Raw): Raw {
  return { ...p, schema_version: 3 };
}

/** v3 -> v4: scenes gain `status` and `color` (normalize() fills them). */
function v3ToV4(p: Raw): Raw {
  return { ...p, schema_version: 4 };
}

/** v4 -> v5: scenes gain `notes` and `todos` (normalize() fills them). */
function v4ToV5(p: Raw): Raw {
  return { ...p, schema_version: 5 };
}

/** v5 -> v6: scenes gain `when` (story time; normalize() fills it). */
function v5ToV6(p: Raw): Raw {
  return { ...p, schema_version: 6 };
}

/** v6 -> v7: the project gains `story_format` (every older project is a novel). */
function v6ToV7(p: Raw): Raw {
  return { ...p, schema_version: 7, story_format: DEFAULT_STORY_FORMAT };
}

const migrations: Record<number, (p: Raw) => Raw> = {
  0: v0ToV1,
  1: v1ToV2,
  2: v2ToV3,
  3: v3ToV4,
  4: v4ToV5,
  5: v5ToV6,
  6: v6ToV7,
};

/** Entities (characters/places) always carry a clean `aliases` string list. */
function withAliases(list: unknown): Raw[] {
  return arr(list)
    .filter(isObject)
    .map((e) => ({
      ...e,
      aliases: arr(e.aliases)
        .filter((a): a is string => typeof a === "string")
        .map((a) => a.trim())
        .filter(Boolean),
    }));
}

const SNAPSHOT_KINDS: SnapshotKind[] = ["manual", "auto", "safety"];

/** Keep well-formed snapshots only; repair small gaps instead of dropping them. */
function cleanSnapshots(list: unknown): Snapshot[] {
  const seen = new Set<string>();
  const out: Snapshot[] = [];
  for (const raw of arr(list)) {
    if (!isObject(raw)) continue;
    const id = str(raw.id);
    const scene_id = str(raw.scene_id);
    if (!id || !scene_id || seen.has(id)) continue; // unusable without these
    seen.add(id);
    out.push({
      ...raw,
      id,
      scene_id,
      kind: SNAPSHOT_KINDS.includes(raw.kind) ? raw.kind : "manual",
      label: str(raw.label),
      created_at: Number.isFinite(Number(raw.created_at)) ? Number(raw.created_at) : 0,
      title: str(raw.title),
      summary: str(raw.summary),
      content: str(raw.content),
      chapter_id: str(raw.chapter_id),
      plotline_id: str(raw.plotline_id),
      character_ids: arr(raw.character_ids).filter((x): x is string => typeof x === "string"),
      place_ids: arr(raw.place_ids).filter((x): x is string => typeof x === "string"),
      tags: arr(raw.tags).filter((x): x is string => typeof x === "string"),
    });
  }
  return out;
}

/**
 * Make a project structurally sound: fill missing fields, make sure every
 * scene points at a real chapter, and give each chapter dense 0..n-1 orders.
 * Idempotent.
 */
function normalize(p: Raw): Project {
  let chapters: Chapter[] = arr(p.chapters)
    .filter(isObject)
    .map((c, i) => ({
      ...c,
      id: str(c.id) || `ch-fixed-${i + 1}`,
      title: str(c.title, `Chapter ${i + 1}`),
      summary: str(c.summary),
    }));

  const rawScenes = arr(p.scenes).filter(isObject);
  if (chapters.length === 0 && rawScenes.length > 0) {
    chapters = [{ id: "ch-1", title: "Chapter 1", summary: "" }];
  }
  const known = new Set(chapters.map((c) => c.id));

  const scenes: Scene[] = rawScenes.map((s, i) => ({
    ...s,
    id: str(s.id) || `sc-fixed-${i + 1}`,
    title: str(s.title),
    summary: str(s.summary),
    content: str(s.content),
    chapter_id: known.has(s.chapter_id) ? s.chapter_id : chapters[0].id,
    order: Number.isFinite(Number(s.order)) ? Number(s.order) : i,
    plotline_id: str(s.plotline_id),
    character_ids: arr(s.character_ids).filter((x) => typeof x === "string"),
    place_ids: arr(s.place_ids).filter((x) => typeof x === "string"),
    tags: arr(s.tags).filter((x) => typeof x === "string"),
    status: cleanStatus(s.status, defaultStatusFor(str(s.content))),
    color: cleanColor(s.color),
    notes: str(s.notes),
    todos: cleanTodos(s.todos),
    when: str(s.when).trim(),
  })) as Scene[];

  // Dense orders per chapter; ties keep original file order (sort is stable).
  const byChapter = new Map<string, Scene[]>();
  for (const s of scenes) {
    const list = byChapter.get(s.chapter_id) ?? [];
    list.push(s);
    byChapter.set(s.chapter_id, list);
  }
  for (const list of byChapter.values()) {
    [...list].sort((a, b) => a.order - b.order).forEach((s, i) => (s.order = i));
  }

  return {
    ...p,
    schema_version: CURRENT_SCHEMA_VERSION,
    story_format: readStoryFormat(p.story_format),
    id: str(p.id) || "proj-imported",
    title: str(p.title, "Untitled"),
    premise: str(p.premise),
    genre: str(p.genre),
    theme: str(p.theme),
    chapters,
    scenes,
    snapshots: cleanSnapshots(p.snapshots),
    characters: withAliases(p.characters) as Project["characters"],
    places: withAliases(p.places) as Project["places"],
    notes: arr(p.notes) as Project["notes"],
    plotlines: arr(p.plotlines) as Project["plotlines"],
  };
}

export function migrateProject(raw: unknown): MigrationResult {
  if (!isObject(raw)) {
    throw new Error("This file is not a Fabulator project.");
  }

  const found =
    typeof raw.schema_version === "number" && raw.schema_version >= 0
      ? raw.schema_version
      : 0;

  if (found > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `This project was saved by a newer version of Fabulator ` +
        `(format ${found}; this version understands up to ${CURRENT_SCHEMA_VERSION}). ` +
        `Update Fabulator to open it.`
    );
  }

  let current: Raw = raw;
  for (let v = found; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`No migration from format ${v}.`);
    current = step(current);
  }

  return {
    project: normalize(current),
    migratedFrom: found < CURRENT_SCHEMA_VERSION ? found : null,
  };
}
