// What is on screen: the current view, the selection, open dialogs, the scene filter.
// Part of the app's state; see docs/technical/frontend-structure.md.
import { EMPTY_FILTER, type SceneFilter } from "../../model/labels";
import { derived, writable } from "svelte/store";
import type { MainView, SidePanel } from "../../model/types";
import { project } from "./core";

export const mainView = writable<MainView>("timeline");

export const sidePanel = writable<SidePanel>("characters");

export const selectedSceneId = writable<string | null>(null);

/** The comic page picked in the page Timeline. */
export const selectedPageId = writable<string | null>(null);

/** The selected scene of a screenplay. */
export const selectedScriptSceneId = writable<string | null>(null);

/** The selected node of a game. */
export const selectedNodeId = writable<string | null>(null);

export const searchOpen = writable(false);

/** Scene to underline search words in (cleared with the chip in the manuscript view). */
export const sceneHighlight = writable<{ sceneId: string; terms: string[] } | null>(null);

/** Ask the side panel to expand this character / place / note card. */
export const sidePanelFocus = writable<string | null>(null);

export const selectedScene = derived(
  [project, selectedSceneId],
  ([$project, $selectedSceneId]) => {
    if (!$project || !$selectedSceneId) return null;
    return $project.scenes.find((s) => s.id === $selectedSceneId) ?? null;
  }
);

export const snapshotsOpen = writable(false);

export const exportOpen = writable(false);

export const replaceOpen = writable(false);

/** Screenplay reports (scenes, characters, locations). */
export const reportsOpen = writable(false);

/** Check and Playtest dialog for game projects. */
export const gameCheckOpen = writable(false);

/** Distraction-free writing: only the manuscript is shown. */
export const focusMode = writable(false);

/** Timeline filter (session only; not saved in the project). */
export const sceneFilter = writable<SceneFilter>(EMPTY_FILTER);

/** Theme gallery dialog. */
export const galleryOpen = writable(false);

/** Themes browser dialog. */
export const themesOpen = writable(false);
