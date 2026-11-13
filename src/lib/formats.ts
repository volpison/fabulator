/**
 * Story formats: what kind of document a project is.
 *
 * Every project has a `story_format`. The *shared* parts are the same in every format:
 * characters, places, notes, plotlines, story time, snapshots, themes, backups, recovery.
 * What differs is the document itself: its units, its editor, and the Timeline/Manuscript
 * views built on it.
 *
 *   novel        chapters → scenes (long prose)                    ← the only one so far
 *   comic        issues → pages → panels (plot-first or full script)  ← data, Timeline, writing view, search, replace, snapshots, goals, exports
 *   screenplay   acts → scenes → slug line + elements (action, dialogue, transition)  ← data only so far (`ready: false`)
 *
 * The document fields of each format live on `Project` (novel: chapters + scenes; comic: issues +
 * pages; screenplay: acts + script_scenes), and the other format's fields are simply empty.
 *
 * A new format is added by: a new id here, its own document fields on `Project` (with a
 * schema migration and the same fields in src-tauri/src/models/mod.rs), and its views.
 * The Rust side never interprets the format: it stores the project as written.
 *
 * Pure (no Svelte, no Tauri).
 */
import type { Project } from "./types";

/** The ids this version of Fabulator can open. */
export const STORY_FORMAT_IDS = ["novel", "comic", "screenplay"] as const;
export type StoryFormatId = (typeof STORY_FORMAT_IDS)[number];

/** The format of every project written before formats existed, and of a new story. */
export const DEFAULT_STORY_FORMAT: StoryFormatId = "novel";

export type Noun = { one: string; many: string };

export type StoryFormat = {
  id: StoryFormatId;
  /** Shown to the person (a format chooser, the project's details). */
  label: string;
  description: string;
  /**
   * Can the app show and edit this format yet? A format that is not ready can be saved and
   * opened (its data is kept safe) but is not offered for new stories, and its views say so.
   */
  ready: boolean;
  /** Which main views exist for this format (Cast always does). A missing one shows a short explanation. */
  views: { timeline: boolean; manuscript: boolean };
  /** What the format calls its units, for labels like "Add chapter". */
  vocabulary: {
    /** The big unit that groups the small ones: a chapter, an issue, an act. */
    group: Noun;
    /** The small unit the Timeline plans and the Manuscript writes: a scene, a page. */
    unit: Noun;
  };
};

export const STORY_FORMATS: Record<StoryFormatId, StoryFormat> = {
  novel: {
    id: "novel",
    label: "Novel",
    description: "Chapters and scenes of long prose.",
    ready: true,
    views: { timeline: true, manuscript: true },
    vocabulary: {
      group: { one: "chapter", many: "chapters" },
      unit: { one: "scene", many: "scenes" },
    },
  },
  comic: {
    id: "comic",
    label: "Comic",
    description: "Issues, pages and panels: a plot-first or full script.",
    ready: true,
    views: { timeline: true, manuscript: true },
    vocabulary: {
      group: { one: "issue", many: "issues" },
      unit: { one: "page", many: "pages" },
    },
  },
  screenplay: {
    id: "screenplay",
    label: "Screenplay",
    description: "Acts and scenes with slug lines, action, dialogue and transitions.",
    ready: false,
    views: { timeline: false, manuscript: false },
    vocabulary: {
      group: { one: "act", many: "acts" },
      unit: { one: "scene", many: "scenes" },
    },
  },
};

/** The formats a person can start a new story in. */
export const readyFormats = (): StoryFormat[] => STORY_FORMAT_IDS.map((id) => STORY_FORMATS[id]).filter((f) => f.ready);

export function isStoryFormatId(x: unknown): x is StoryFormatId {
  return typeof x === "string" && (STORY_FORMAT_IDS as readonly string[]).includes(x);
}

/** The format of a project. */
export function formatOf(p: Pick<Project, "story_format">): StoryFormat {
  return STORY_FORMATS[p.story_format] ?? STORY_FORMATS[DEFAULT_STORY_FORMAT];
}

/** "chapter", "chapters", or capitalised: the format's word for a unit, for building labels. */
export function noun(
  p: Pick<Project, "story_format">,
  which: "group" | "unit",
  count = 1,
  capitalise = false
): string {
  const n = formatOf(p).vocabulary[which];
  const word = count === 1 ? n.one : n.many;
  return capitalise ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/**
 * What a file says its format is → a format id. Missing (a file from before formats) means the
 * default. A format this version does not know is an error with a message the person can act on,
 * never a silent fallback: treating a comic as a novel could damage it.
 */
export function readStoryFormat(raw: unknown): StoryFormatId {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_STORY_FORMAT;
  if (isStoryFormatId(raw)) return raw;
  const name = typeof raw === "string" ? `“${raw}”` : "an unknown";
  throw new Error(
    `This project uses the ${name} format, which this version of Fabulator does not know. ` +
      `Update Fabulator to open it.`
  );
}
