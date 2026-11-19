// Jumping to a search result, and Replace over scenes.
// Part of the app's state; see docs/technical/frontend-structure.md.
import type { SearchHit } from "../../tools/search";
import { applyReplace, type ReplaceFields, type ReplaceOptions } from "../../tools/replace";
import { project, touch, uid } from "./core";
import {
  mainView,
  sceneHighlight,
  searchOpen,
  selectedNodeId,
  selectedPageId,
  selectedSceneId,
  selectedScriptSceneId,
  sidePanel,
  sidePanelFocus,
} from "./ui";

/** Jump to a search result and close the search dialog. */
export function openSearchHit(hit: SearchHit, terms: string[]) {
  switch (hit.kind) {
    case "scene":
      selectedSceneId.set(hit.id);
      sceneHighlight.set({ sceneId: hit.id, terms });
      mainView.set("manuscript");
      break;
    case "page":
      selectedPageId.set(hit.id);
      mainView.set("manuscript");
      break;
    case "script_scene":
      selectedScriptSceneId.set(hit.id);
      mainView.set("manuscript");
      break;
    case "node":
      selectedNodeId.set(hit.id);
      mainView.set("manuscript");
      break;
    case "issue":
    case "act":
    case "quest":
      mainView.set("timeline");
      break;
    case "character":
      sidePanel.set("characters");
      sidePanelFocus.set(hit.id);
      break;
    case "place":
      sidePanel.set("places");
      sidePanelFocus.set(hit.id);
      break;
    case "ability":
      sidePanel.set("abilities");
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
