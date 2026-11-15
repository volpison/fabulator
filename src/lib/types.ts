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
  /** Abilities this character has (see Project.abilities). Left out of the file when empty. */
  ability_ids?: string[];
}

/** Something a character can do (a power, skill, spell, trade…). Part of the shared world. */
export interface Ability {
  id: string;
  name: string;
  /** Other ways the text refers to it. */
  aliases: string[];
  description: string;
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
  /** Screenplays: the whole scene as it was (then `scene_id` holds the scene id and `content` is empty). */
  script_scene?: ScriptScene;
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

// ─── Game documents (story_format "game": quests → nodes, conditions and effects) ───

export type QuestKind = "main" | "side";
export type CompareOp = "=" | "!=" | "<" | "<=" | ">" | ">=";

/** One thing that must be true. Stored as data so it can be shown as text and checked. */
export type SimpleCondition =
  /** A flag is set (`set: true`) or not set (`set: false`). */
  | { kind: "flag"; variable_id: string; set: boolean }
  /** A number variable compares to a value. */
  | { kind: "number"; variable_id: string; op: CompareOp; value: number }
  /** The player has at least `min` of an item. */
  | { kind: "item"; item_id: string; min: number }
  /** A character has an ability ("" = the player's character). */
  | { kind: "ability"; character_id: string; ability_id: string }
  /** A node has been completed. */
  | { kind: "done"; node_id: string };
/** "Any of": at least one holds. One level deep (an `any` never holds another `any`). */
export type Condition = SimpleCondition | { kind: "any"; of: SimpleCondition[] };

/** One thing that changes when a node happens or an option is chosen. */
export type Effect =
  | { kind: "set"; variable_id: string; to: boolean }
  | { kind: "add"; variable_id: string; amount: number }
  /** Give (positive) or take (negative) items. */
  | { kind: "give"; item_id: string; amount: number }
  | { kind: "grant"; character_id: string; ability_id: string };

export type GameElementKind = "narration" | "dialogue" | "choice" | "note";

/** One option of a choice: what the player reads, when it is offered, what it does, where it leads. */
export interface ChoiceOption {
  id: string;
  text: string;
  requires: Condition[];
  effects: Effect[];
  /** The node it leads to ("" = nowhere yet). */
  to: string;
}

export interface GameElement {
  id: string;
  kind: GameElementKind;
  /** Dialogue: the character who speaks (a Character id). */
  speaker_id: string;
  /** Dialogue: a short direction ("whispering"), without brackets. */
  parenthetical: string;
  /** Narration, the spoken words, the choice's prompt or the private note. */
  text: string;
  /** Choice only: the options. */
  options: ChoiceOption[];
}

/** A way out of a node, optionally only when a condition holds. */
export interface GameLink {
  id: string;
  to: string;
  label: string;
  requires: Condition[];
}

export interface Quest {
  id: string;
  title: string;
  kind: QuestKind;
  summary: string;
  plotline_id: string;
  /** Offered only when all of these hold. */
  requires: Condition[];
}

/** A story beat, encounter or conversation. The shared fields behave as on a novel's scene. */
export interface GameNode {
  id: string;
  quest_id: string;
  /** Position inside its quest (0-based). */
  order: number;
  title: string;
  summary: string;
  elements: GameElement[];
  requires: Condition[];
  effects: Effect[];
  links: GameLink[];
  /** True when the story may stop here (so it is not reported as a dead end). */
  ending: boolean;
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

/** A named piece of state: a yes/no flag or a number. Declared once, used by conditions and effects. */
export interface GameVariable {
  id: string;
  kind: "flag" | "number";
  label: string;
  notes: string;
}

export interface GameItem {
  id: string;
  name: string;
  description: string;
}

export interface Game {
  quests: Quest[];
  nodes: GameNode[];
  variables: GameVariable[];
  items: GameItem[];
}

export interface Project {
  /** File-format version; see migrate.ts. */
  schema_version: number;
  /** Always "fabulator-project": says this file is a Fabulator project (see migrate.ts). */
  file_type: string;
  /** The lowest file-format version of Fabulator that can open this file safely. */
  min_reader_version: number;
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
  /** Game documents only (left out elsewhere): quests, nodes, and the variables and items they use. */
  game?: Game;
  /** Comic only: which scripting style the project favours. */
  script_style?: ScriptStyle;
  /** Saved scene versions (see Snapshot). */
  snapshots: Snapshot[];
  characters: Character[];
  places: Place[];
  abilities: Ability[];
  notes: Note[];
  plotlines: Plotline[];
}

export type MainView = "timeline" | "manuscript" | "cast";
export type SidePanel = "characters" | "places" | "abilities" | "notes" | null;
