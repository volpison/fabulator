import type { StoryFormatId } from "./formats";
/** Shared types that mirror the Rust data model */

export interface Plotline {
  id: string;
  name: string;
  color: string;
}

export interface Chapter {
  id: string;
  title: string;
  summary: string;
}

import type { SceneStatus } from "./labels";

export interface Scene {
  id: string;
  title: string;
  summary: string;
  content: string;
  /** Which chapter this scene belongs to (see Project.chapters). */
  chapter_id: string;
  /** Position inside its chapter (0-based, across all plotlines). */
  order: number;
  plotline_id: string;
  character_ids: string[];
  place_ids: string[];
  tags: string[];
  /** Writing progress: idea, draft, revised or final. */
  status: SceneStatus;
  /** Optional colour label (a SCENE_COLORS id) or "" for none. */
  color: string;
  /** Private notes about the scene (never exported with the story). */
  notes: string;
  /** Private to-do list for the scene. */
  todos: SceneTodo[];
  /** When the scene happens inside the story ("Day 3 evening", "1342-05-02"); free text. */
  when: string;
}

// ─── Comic documents (story_format "comic": issue → page → panel) ───

/** How far a page has got in the comic pipeline (plot-first: plot → art → dialogue → lettered). */
export type ComicStage = "plot" | "art" | "dialogue" | "lettered";
/** Which way of scripting the project favours; both are always possible (see comic.ts). */
export type ScriptStyle = "plot-first" | "full";
export type LineKind = "dialogue" | "caption" | "thought" | "sfx";

/** An issue (like a chapter): ordered, groups pages. */
export interface Issue {
  id: string;
  title: string;
  summary: string;
}

/** One balloon, caption or sound effect inside a panel. */
export interface ComicLine {
  id: string;
  kind: LineKind;
  /** The character who says it (a Character id), or "" for a caption or SFX. */
  speaker_id: string;
  text: string;
  /** Lettering note ("off-panel", "small", "whispered"). */
  note: string;
}

export interface ComicPanel {
  id: string;
  /** What the artist should draw. */
  description: string;
  lines: ComicLine[];
}

/**
 * A page. In the plot-first (Marvel) method only `plot` is written at first and the panels are added
 * after the art comes back; in a full script the panels are written up front. Either way it is the
 * same page. The shared fields (plotline, cast, places, tags, colour, notes, to-dos, story time)
 * behave exactly as they do on a novel's scene.
 */
export interface ComicPage {
  id: string;
  /** Which issue this page belongs to (see Project.issues). */
  issue_id: string;
  /** Position inside its issue (0-based); the page number is order + 1. */
  order: number;
  /** Optional name ("Splash: the bridge"). */
  title: string;
  /** What happens on the page, in the writer's own words (the plot-first text). */
  plot: string;
  /** Planned layout, free text ("3 tiers: 2/1/3", "splash"). */
  layout: string;
  panels: ComicPanel[];
  stage: ComicStage;
  plotline_id: string;
  character_ids: string[];
  place_ids: string[];
  tags: string[];
  color: string;
  notes: string;
  todos: SceneTodo[];
  when: string;
}

export interface SceneTodo {
  id: string;
  text: string;
  done: boolean;
}

export interface Character {
  id: string;
  name: string;
  /** Other ways the text refers to them (nicknames, titles…). */
  aliases: string[];
  description: string;
  role: string;
  category: string;
  traits: string[];
  notes: string;
}

export interface Place {
  id: string;
  name: string;
  /** Other ways the text refers to it. */
  aliases: string[];
  description: string;
  location: string;
  notes: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export type SnapshotKind =
  /** Taken by you. Never removed automatically. */
  | "manual"
  /** Taken while you write; the oldest are pruned. */
  | "auto"
  /** Taken before a restore or a scene delete so those can be undone. Never pruned. */
  | "safety";

/** A saved version of a scene (what a rewrite changes, plus enough to recreate a deleted scene). */
export interface Snapshot {
  id: string;
  scene_id: string;
  kind: SnapshotKind;
  label: string;
  /** ms since epoch. */
  created_at: number;
  title: string;
  summary: string;
  content: string;
  chapter_id: string;
  plotline_id: string;
  character_ids: string[];
  place_ids: string[];
  tags: string[];
  /** Comics: the whole page as it was (then `scene_id` holds the page id and `content` is empty). */
  page?: ComicPage;
}

// ─── Screenplay documents (story_format "screenplay": act → scene → elements) ───

/** What the camera sees first: inside, outside, or both. "" = not set yet. */
export type SlugPlace = "INT" | "EXT" | "INT/EXT" | "";
/** A script element. Dialogue carries its speaker (and an optional parenthetical); `note` is never exported. */
export type ElementKind = "action" | "dialogue" | "transition" | "note";

/** An act (like a chapter): ordered, groups scenes. */
export interface Act {
  id: string;
  title: string;
  summary: string;
}

export interface ScriptElement {
  id: string;
  kind: ElementKind;
  /** Dialogue: the character who speaks (a Character id). */
  speaker_id: string;
  /** Dialogue: how the voice is heard ("V.O.", "O.S.", "O.C."…), free text, shown after the name. */
  extension: string;
  /** Dialogue: a short direction between the name and the words ("beat", "whispering"), without brackets. */
  parenthetical: string;
  /** Action text, the spoken words, the transition ("CUT TO:") or the private note. */
  text: string;
}

/**
 * A screenplay scene: a slug line (INT./EXT. + location + time of day) and its elements.
 * The shared fields behave exactly as they do on a novel's scene.
 */
export interface ScriptScene {
  id: string;
  /** Which act this scene belongs to (see Project.acts). */
  act_id: string;
  /** Position inside its act (0-based). */
  order: number;
  /** Optional working name for the Timeline ("The bridge fight"). Never exported. */
  title: string;
  int_ext: SlugPlace;
  /** The slug's location ("KITCHEN", "Maria's car"). */
  location: string;
  /** The slug's time ("DAY", "NIGHT", "LATER"). */
  time: string;
  summary: string;
  elements: ScriptElement[];
  status: "idea" | "draft" | "revised" | "final";
  plotline_id: string;
  character_ids: string[];
  place_ids: string[];
  tags: string[];
  color: string;
  notes: string;
  todos: SceneTodo[];
  when: string;
}

export interface Project {
  /** File-format version; see migrate.ts. */
  schema_version: number;
  /** What kind of document this is (see formats.ts). */
  story_format: StoryFormatId;
  id: string;
  title: string;
  premise: string;
  genre: string;
  theme: string;
  /** Ordered: array position is the chapter's position in the book. */
  chapters: Chapter[];
  scenes: Scene[];
  /** Comic documents only (empty in a novel): issues in order, and their pages. */
  issues: Issue[];
  pages: ComicPage[];
  /** Screenplay documents only (empty in other formats): acts in order, and their scenes. */
  acts: Act[];
  script_scenes: ScriptScene[];
  /** Comic only: which scripting style the project favours. */
  script_style?: ScriptStyle;
  /** Saved scene versions (see Snapshot). */
  snapshots: Snapshot[];
  characters: Character[];
  places: Place[];
  notes: Note[];
  plotlines: Plotline[];
}

export type MainView = "timeline" | "manuscript" | "cast";
export type SidePanel = "characters" | "places" | "notes" | null;
