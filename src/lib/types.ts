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
}

export interface Project {
  /** File-format version; see migrate.ts. */
  schema_version: number;
  id: string;
  title: string;
  premise: string;
  genre: string;
  theme: string;
  /** Ordered: array position is the chapter's position in the book. */
  chapters: Chapter[];
  scenes: Scene[];
  /** Saved scene versions (see Snapshot). */
  snapshots: Snapshot[];
  characters: Character[];
  places: Place[];
  notes: Note[];
  plotlines: Plotline[];
}

export type MainView = "timeline" | "manuscript" | "cast";
export type SidePanel = "characters" | "places" | "notes" | null;
