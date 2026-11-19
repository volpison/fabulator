// Screenplay acts, scenes and elements (the rules are in screenplay/screenplayedit.ts).
// Part of the app's state; see docs/technical/frontend-structure.md.
import {
  addAct as addActTo,
  addElement as addScriptElementTo,
  addScene as addScriptSceneTo,
  deleteAct as deleteActFrom,
  deleteElement as deleteScriptElementFrom,
  moveAct as moveActIn,
  moveElement as moveScriptElementIn,
  moveScene as moveScriptSceneIn,
  updateAct as updateActIn,
  updateElement as updateScriptElementIn,
  updateScene as updateScriptSceneIn,
} from "../../screenplay/screenplayedit";
import { deleteScriptSceneKeeping } from "../../tools/snapshots";
import type { ElementKind } from "../../model/types";
import { project, uid } from "./core";
import { editProject } from "./edit";
import { selectedScriptSceneId } from "./ui";

export function addScreenplayAct(title?: string): string {
  let id = "";
  editProject((p) => {
    const r = addActTo(p, uid, title);
    id = r.id;
    return r.project;
  });
  return id;
}

export function renameScreenplayAct(id: string, fields: { title?: string; summary?: string }) {
  editProject((p) => updateActIn(p, id, fields));
}

/** Only an empty act can be deleted. Returns whether it was. */
export function deleteScreenplayAct(id: string): boolean {
  let deleted = false;
  editProject((p) => {
    const next = deleteActFrom(p, id);
    deleted = next !== p;
    return next;
  });
  return deleted;
}

export function moveScreenplayAct(id: string, toIndex: number) {
  editProject((p) => moveActIn(p, id, toIndex));
}

/** Add a scene (to the given act, or the last one) and select it. Returns its id. */
export function addScreenplayScene(actId?: string, atIndex?: number): string {
  let id = "";
  editProject((p) => {
    const r = addScriptSceneTo(p, uid, actId, atIndex);
    id = r.id;
    return r.project;
  });
  if (id) selectedScriptSceneId.set(id);
  return id;
}

export function updateScreenplayScene(id: string, fields: Parameters<typeof updateScriptSceneIn>[2]) {
  editProject((p) => updateScriptSceneIn(p, id, fields));
}

export function moveScreenplayScene(id: string, actId: string, index: number) {
  editProject((p) => moveScriptSceneIn(p, id, actId, index));
}

export function deleteScreenplayScene(id: string) {
  editProject((p) => deleteScriptSceneKeeping(p, id, Date.now(), () => uid("snap")));
  selectedScriptSceneId.update((cur) => (cur === id ? null : cur));
}

// Game: quests and nodes (the Timeline).

export function addScreenplayElement(
  sceneId: string,
  kind: ElementKind = "action",
  atIndex?: number,
  speakerId = ""
): string {
  let id = "";
  editProject((p) => {
    const r = addScriptElementTo(p, uid, sceneId, kind, atIndex, speakerId);
    id = r.id;
    return r.project;
  });
  return id;
}

export function updateScreenplayElement(sceneId: string, elementId: string, fields: Parameters<typeof updateScriptElementIn>[3]) {
  editProject((p) => updateScriptElementIn(p, sceneId, elementId, fields));
}

export function moveScreenplayElement(sceneId: string, elementId: string, toIndex: number) {
  editProject((p) => moveScriptElementIn(p, sceneId, elementId, toIndex));
}

export function deleteScreenplayElement(sceneId: string, elementId: string) {
  editProject((p) => deleteScriptElementFrom(p, sceneId, elementId));
}

// Panels and lines of the selected comic page (the writing view).
