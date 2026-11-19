// Game quests, nodes, elements, options, links, variables, items and rules (the rules are in game/gameedit.ts).
// Part of the app's state; see docs/technical/frontend-structure.md.
import {
  addElement as addGameElementTo,
  addItem as addGameItemTo,
  addLink as addGameLinkTo,
  addNode as addNodeTo,
  addOption as addGameOptionTo,
  addQuest as addQuestTo,
  addVariable as addGameVariableTo,
  deleteElement as deleteGameElementFrom,
  deleteItem as deleteGameItemFrom,
  deleteLink as deleteGameLinkFrom,
  deleteOption as deleteGameOptionFrom,
  deleteQuest as deleteQuestFrom,
  deleteVariable as deleteGameVariableFrom,
  moveElement as moveGameElementIn,
  moveNode as moveNodeIn,
  moveQuest as moveQuestIn,
  type RuleTarget,
  setRules as setGameRulesIn,
  updateElement as updateGameElementIn,
  updateItem as updateGameItemIn,
  updateLink as updateGameLinkIn,
  updateNode as updateNodeIn,
  updateOption as updateGameOptionIn,
  updateQuest as updateQuestIn,
  updateVariable as updateGameVariableIn,
} from "../../game/gameedit";
import { deleteNodeKeeping } from "../../tools/snapshots";
import type { GameElementKind } from "../../model/types";
import { project, uid } from "./core";
import { editProject } from "./edit";
import { selectedNodeId } from "./ui";

export function addGameQuest(title?: string): string {
  let id = "";
  editProject((p) => {
    const r = addQuestTo(p, uid, title);
    id = r.id;
    return r.project;
  });
  return id;
}

export function updateGameQuest(id: string, fields: Parameters<typeof updateQuestIn>[2]) {
  editProject((p) => updateQuestIn(p, id, fields));
}

/** Only an empty quest can be deleted. Returns whether it was. */
export function deleteGameQuest(id: string): boolean {
  let deleted = false;
  editProject((p) => {
    const next = deleteQuestFrom(p, id);
    deleted = next !== p;
    return next;
  });
  return deleted;
}

export function moveGameQuest(id: string, toIndex: number) {
  editProject((p) => moveQuestIn(p, id, toIndex));
}

/** Add a node (to the given quest, or the last one) and select it. Returns its id. */
export function addGameNode(questId?: string, atIndex?: number): string {
  let id = "";
  editProject((p) => {
    const r = addNodeTo(p, uid, questId, atIndex);
    id = r.id;
    return r.project;
  });
  if (id) selectedNodeId.set(id);
  return id;
}

export function updateGameNode(id: string, fields: Parameters<typeof updateNodeIn>[2]) {
  editProject((p) => updateNodeIn(p, id, fields));
}

export function moveGameNode(id: string, questId: string, index: number) {
  editProject((p) => moveNodeIn(p, id, questId, index));
}

export function deleteGameNode(id: string) {
  editProject((p) => deleteNodeKeeping(p, id, Date.now(), () => uid("snap")));
  selectedNodeId.update((cur) => (cur === id ? null : cur));
}

// Elements, choice options and links of a game node (the writing view).

export function addGameElement(nodeId: string, kind: GameElementKind = "narration", atIndex?: number, speakerId = ""): string {
  let id = "";
  editProject((p) => {
    const r = addGameElementTo(p, uid, nodeId, kind, atIndex, speakerId);
    id = r.id;
    return r.project;
  });
  return id;
}

export function updateGameElement(nodeId: string, elementId: string, fields: Parameters<typeof updateGameElementIn>[3]) {
  editProject((p) => updateGameElementIn(p, nodeId, elementId, fields));
}

export function moveGameElement(nodeId: string, elementId: string, toIndex: number) {
  editProject((p) => moveGameElementIn(p, nodeId, elementId, toIndex));
}

export function deleteGameElement(nodeId: string, elementId: string) {
  editProject((p) => deleteGameElementFrom(p, nodeId, elementId));
}

export function addGameOption(nodeId: string, elementId: string): string {
  let id = "";
  editProject((p) => {
    const r = addGameOptionTo(p, uid, nodeId, elementId);
    id = r.id;
    return r.project;
  });
  return id;
}

export function updateGameOption(nodeId: string, elementId: string, optionId: string, fields: Parameters<typeof updateGameOptionIn>[4]) {
  editProject((p) => updateGameOptionIn(p, nodeId, elementId, optionId, fields));
}

export function deleteGameOption(nodeId: string, elementId: string, optionId: string) {
  editProject((p) => deleteGameOptionFrom(p, nodeId, elementId, optionId));
}

export function addGameLink(nodeId: string, to: string): string {
  let id = "";
  editProject((p) => {
    const r = addGameLinkTo(p, uid, nodeId, to);
    id = r.id;
    return r.project;
  });
  return id;
}

export function updateGameLink(nodeId: string, linkId: string, fields: Parameters<typeof updateGameLinkIn>[3]) {
  editProject((p) => updateGameLinkIn(p, nodeId, linkId, fields));
}

export function deleteGameLink(nodeId: string, linkId: string) {
  editProject((p) => deleteGameLinkFrom(p, nodeId, linkId));
}

// The game's registry (variables and items) and its conditions and effects.

export function addGameVariable(kind: "flag" | "number" = "flag", label?: string): string {
  let id = "";
  editProject((p) => {
    const r = addGameVariableTo(p, uid, kind, label);
    id = r.id;
    return r.project;
  });
  return id;
}

export function updateGameVariable(id: string, fields: Parameters<typeof updateGameVariableIn>[2]) {
  editProject((p) => updateGameVariableIn(p, id, fields));
}

export function deleteGameVariable(id: string) {
  editProject((p) => deleteGameVariableFrom(p, id));
}

export function addGameItem(name?: string): string {
  let id = "";
  editProject((p) => {
    const r = addGameItemTo(p, uid, name);
    id = r.id;
    return r.project;
  });
  return id;
}

export function updateGameItem(id: string, fields: Parameters<typeof updateGameItemIn>[2]) {
  editProject((p) => updateGameItemIn(p, id, fields));
}

export function deleteGameItem(id: string) {
  editProject((p) => deleteGameItemFrom(p, id));
}

/** Replace the conditions ("requires") or effects of a quest, node, link or choice option. */
export function setGameRules(target: RuleTarget, list: "requires" | "effects", rows: unknown) {
  editProject((p) => setGameRulesIn(p, target, list, rows));
}

// Elements of a screenplay scene (the writing view).
