/**
 * Editing a comic's issues and pages. Pure functions over a Project (no Svelte, no Tauri): each
 * returns a new project, or the very same object when nothing would change (so callers can tell).
 * The stores wrap these and mark the project as changed.
 */
import type { ComicPage, ComicStage, Issue, Project } from "./types";
import { COMIC_STAGES, newPage, pagesInIssue, panelCount, type NewId } from "./comic";
import { spreadOf } from "./comic";

// ─── Issues ───

/** Append an issue. */
export function addIssue(p: Project, newId: NewId, title?: string): { project: Project; id: string } {
  const id = newId("is");
  const issue: Issue = { id, title: title?.trim() || `Issue ${p.issues.length + 1}`, summary: "" };
  return { project: { ...p, issues: [...p.issues, issue] }, id };
}

export function updateIssue(p: Project, id: string, fields: Partial<Pick<Issue, "title" | "summary">>): Project {
  const issue = p.issues.find((i) => i.id === id);
  if (!issue) return p;
  const next = { ...issue, ...fields };
  if (next.title === issue.title && next.summary === issue.summary) return p;
  return { ...p, issues: p.issues.map((i) => (i.id === id ? next : i)) };
}

/** Delete an issue. Only an empty issue can go (pages are never deleted as a side effect). */
export function deleteIssue(p: Project, id: string): Project {
  if (p.pages.some((pg) => pg.issue_id === id) || !p.issues.some((i) => i.id === id)) return p;
  return { ...p, issues: p.issues.filter((i) => i.id !== id) };
}

/** Move an issue so it ends up at `toIndex` (clamped). */
export function moveIssue(p: Project, id: string, toIndex: number): Project {
  const from = p.issues.findIndex((i) => i.id === id);
  if (from === -1) return p;
  const to = Math.max(0, Math.min(p.issues.length - 1, Math.floor(toIndex)));
  if (to === from) return p;
  const issues = [...p.issues];
  const [moved] = issues.splice(from, 1);
  issues.splice(to, 0, moved);
  return { ...p, issues };
}

// ─── Pages ───

/**
 * Add a page to an issue (the last one by default; an issue is created if there is none) at
 * `atIndex` (the end by default). The new page takes the project's first plotline.
 */
export function addPage(
  p: Project,
  newId: NewId,
  issueId?: string,
  atIndex?: number
): { project: Project; id: string } {
  let project = p;
  let target = issueId && p.issues.some((i) => i.id === issueId) ? issueId : p.issues[p.issues.length - 1]?.id;
  if (!target) {
    const made = addIssue(p, newId);
    project = made.project;
    target = made.id;
  }
  const page = newPage(newId, target, 0, project.plotlines[0]?.id ?? "");
  const list = pagesInIssue(project.pages, target);
  const at = atIndex === undefined ? list.length : Math.max(0, Math.min(list.length, Math.floor(atIndex)));
  list.splice(at, 0, page);
  const order = new Map(list.map((pg, i) => [pg.id, i]));
  const pages = [...project.pages.map((pg) => (order.has(pg.id) ? { ...pg, order: order.get(pg.id)! } : pg)), { ...page, order: at }];
  return { project: { ...project, pages }, id: page.id };
}

export function updatePage(
  p: Project,
  id: string,
  fields: Partial<Pick<ComicPage, "title" | "plot" | "layout" | "stage" | "notes">>
): Project {
  const page = p.pages.find((pg) => pg.id === id);
  if (!page) return p;
  const next = { ...page, ...fields };
  if (fields.stage !== undefined && !(COMIC_STAGES as readonly string[]).includes(fields.stage)) return p;
  const same = (Object.keys(fields) as (keyof typeof fields)[]).every((k) => next[k] === page[k]);
  if (same) return p;
  return { ...p, pages: p.pages.map((pg) => (pg.id === id ? next : pg)) };
}

/**
 * Put a page into `issueId` at position `index` (clamped; counted among that issue's other
 * pages). Orders stay dense in every issue touched.
 */
export function movePage(p: Project, pageId: string, issueId: string, index: number): Project {
  const page = p.pages.find((pg) => pg.id === pageId);
  if (!page || !p.issues.some((i) => i.id === issueId)) return p;
  const rest = p.pages.filter((pg) => pg.id !== pageId);
  const dest = pagesInIssue(rest, issueId);
  const at = Math.max(0, Math.min(dest.length, Math.floor(index)));
  dest.splice(at, 0, { ...page, issue_id: issueId });
  const updates = new Map<string, { issue_id: string; order: number }>();
  dest.forEach((pg, i) => updates.set(pg.id, { issue_id: issueId, order: i }));
  if (page.issue_id !== issueId) {
    pagesInIssue(rest, page.issue_id).forEach((pg, i) => updates.set(pg.id, { issue_id: page.issue_id, order: i }));
  }
  let changed = false;
  const pages = p.pages.map((pg) => {
    const u = updates.get(pg.id);
    if (!u || (u.issue_id === pg.issue_id && u.order === pg.order)) return pg;
    changed = true;
    return { ...pg, ...u };
  });
  return changed ? { ...p, pages } : p;
}

/** Delete a page and close the gap in its issue. */
export function deletePage(p: Project, pageId: string): Project {
  const page = p.pages.find((pg) => pg.id === pageId);
  if (!page) return p;
  const rest = p.pages.filter((pg) => pg.id !== pageId);
  const order = new Map(pagesInIssue(rest, page.issue_id).map((pg, i) => [pg.id, i]));
  return { ...p, pages: rest.map((pg) => (order.has(pg.id) && order.get(pg.id) !== pg.order ? { ...pg, order: order.get(pg.id)! } : pg)) };
}

/** A deleted character or place no longer appears on any page. */
export function removeCastFromPages(p: Project, kind: "character" | "place", id: string): Project {
  const key = kind === "character" ? "character_ids" : "place_ids";
  if (!p.pages.some((pg) => pg[key].includes(id))) return p;
  return { ...p, pages: p.pages.map((pg) => (pg[key].includes(id) ? { ...pg, [key]: pg[key].filter((x) => x !== id) } : pg)) };
}

// ─── Reading for the Timeline ───

export type SpreadRow = {
  /** The page numbers seen together (one or two). */
  numbers: number[];
  pages: ComicPage[];
};

/** An issue's pages grouped the way a reader sees them: 1 alone, then 2–3, 4–5, … */
export function spreadRows(pagesOfIssue: ComicPage[]): SpreadRow[] {
  const rows: SpreadRow[] = [];
  const total = pagesOfIssue.length;
  for (let n = 1; n <= total; n++) {
    const numbers = spreadOf(n, total);
    if (numbers[0] !== n) continue; // the second page of a spread was already added
    rows.push({ numbers, pages: numbers.map((k) => pagesOfIssue[k - 1]) });
  }
  return rows;
}

export type IssueSummary = { pages: number; panels: number; byStage: Record<ComicStage, number> };

export function issueSummary(p: Pick<Project, "pages">, issueId: string): IssueSummary {
  const byStage: Record<ComicStage, number> = { plot: 0, art: 0, dialogue: 0, lettered: 0 };
  let panels = 0;
  const pages = p.pages.filter((pg) => pg.issue_id === issueId);
  for (const pg of pages) {
    byStage[pg.stage] += 1;
    panels += panelCount(pg);
  }
  return { pages: pages.length, panels, byStage };
}
