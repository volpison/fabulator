// Comic issues, pages, panels and lettering lines (the rules are in comic/comicedit.ts).
// Part of the app's state; see docs/technical/frontend-structure.md.
import {
  addIssue as addIssueTo,
  addLine as addLineTo,
  addPage as addPageTo,
  addPanel as addPanelTo,
  deleteIssue as deleteIssueFrom,
  deleteLine as deleteLineFrom,
  deletePanel as deletePanelFrom,
  moveIssue as moveIssueIn,
  moveLine as moveLineIn,
  movePage as movePageIn,
  movePanel as movePanelIn,
  updateIssue as updateIssueIn,
  updateLine as updateLineIn,
  updatePage as updatePageIn,
  updatePanel as updatePanelIn,
} from "../../comic/comicedit";
import { deletePageKeeping } from "../../tools/snapshots";
import type { LineKind } from "../../model/types";
import { project, uid } from "./core";
import { editProject } from "./edit";
import { selectedPageId } from "./ui";

export function addComicIssue(title?: string): string {
  let id = "";
  editProject((p) => {
    const r = addIssueTo(p, uid, title);
    id = r.id;
    return r.project;
  });
  return id;
}

export function renameComicIssue(id: string, fields: { title?: string; summary?: string }) {
  editProject((p) => updateIssueIn(p, id, fields));
}

/** Only an empty issue can be deleted. Returns whether it was. */
export function deleteComicIssue(id: string): boolean {
  let deleted = false;
  editProject((p) => {
    const next = deleteIssueFrom(p, id);
    deleted = next !== p;
    return next;
  });
  return deleted;
}

export function moveComicIssue(id: string, toIndex: number) {
  editProject((p) => moveIssueIn(p, id, toIndex));
}

/** Add a page (to the given issue, or the last one) and select it. Returns its id. */
export function addComicPage(issueId?: string, atIndex?: number): string {
  let id = "";
  editProject((p) => {
    const r = addPageTo(p, uid, issueId, atIndex);
    id = r.id;
    return r.project;
  });
  if (id) selectedPageId.set(id);
  return id;
}

export function updateComicPage(
  id: string,
  fields: Parameters<typeof updatePageIn>[2]
) {
  editProject((p) => updatePageIn(p, id, fields));
}

export function moveComicPage(id: string, issueId: string, index: number) {
  editProject((p) => movePageIn(p, id, issueId, index));
}

export function deleteComicPage(id: string) {
  // The page is kept in Snapshots → Deleted pages, like a deleted scene with text.
  editProject((p) => deletePageKeeping(p, id, Date.now(), () => uid("snap")));
  selectedPageId.update((cur) => (cur === id ? null : cur));
}

// Screenplay: acts and scenes (the Timeline).

export function addComicPanel(pageId: string, atIndex?: number): string {
  let id = "";
  editProject((p) => {
    const r = addPanelTo(p, uid, pageId, atIndex);
    id = r.id;
    return r.project;
  });
  return id;
}

export function updateComicPanel(pageId: string, panelId: string, fields: { description?: string }) {
  editProject((p) => updatePanelIn(p, pageId, panelId, fields));
}

export function moveComicPanel(pageId: string, panelId: string, toIndex: number) {
  editProject((p) => movePanelIn(p, pageId, panelId, toIndex));
}

export function deleteComicPanel(pageId: string, panelId: string) {
  editProject((p) => deletePanelFrom(p, pageId, panelId));
}

export function addComicLine(pageId: string, panelId: string, kind: LineKind = "dialogue", atIndex?: number): string {
  let id = "";
  editProject((p) => {
    const r = addLineTo(p, uid, pageId, panelId, kind, atIndex);
    id = r.id;
    return r.project;
  });
  return id;
}

export function updateComicLine(
  pageId: string,
  panelId: string,
  lineId: string,
  fields: Parameters<typeof updateLineIn>[4]
) {
  editProject((p) => updateLineIn(p, pageId, panelId, lineId, fields));
}

export function moveComicLine(pageId: string, panelId: string, lineId: string, toIndex: number) {
  editProject((p) => moveLineIn(p, pageId, panelId, lineId, toIndex));
}

export function deleteComicLine(pageId: string, panelId: string, lineId: string) {
  editProject((p) => deleteLineFrom(p, pageId, panelId, lineId));
}
