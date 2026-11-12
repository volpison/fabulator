/**
 * Editing a comic's issues and pages. Pure functions over a Project (no Svelte, no Tauri): each
 * returns a new project, or the very same object when nothing would change (so callers can tell).
 * The stores wrap these and mark the project as changed.
 */
import type { ComicLine, ComicPage, ComicPanel, ComicStage, Issue, LineKind, Project } from "./types";
import { COMIC_STAGES, LINE_KINDS, newLine, newPage, newPanel, pagesInIssue, panelCount, type NewId } from "./comic";
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

// ─── Panels and lines (the writing view) ───

function editPage(p: Project, pageId: string, fn: (pg: ComicPage) => ComicPage): Project {
  const pg = p.pages.find((x) => x.id === pageId);
  if (!pg) return p;
  const next = fn(pg);
  return next === pg ? p : { ...p, pages: p.pages.map((x) => (x.id === pageId ? next : x)) };
}

function editPanel(pg: ComicPage, panelId: string, fn: (pn: ComicPanel) => ComicPanel): ComicPage {
  const pn = pg.panels.find((x) => x.id === panelId);
  if (!pn) return pg;
  const next = fn(pn);
  return next === pn ? pg : { ...pg, panels: pg.panels.map((x) => (x.id === panelId ? next : x)) };
}

/** The same list with `id` moved to `toIndex` (clamped), or the very same list when nothing moves. */
function moveInList<T extends { id: string }>(list: T[], id: string, toIndex: number): T[] {
  const from = list.findIndex((x) => x.id === id);
  if (from === -1) return list;
  const to = Math.max(0, Math.min(list.length - 1, Math.floor(toIndex)));
  if (to === from) return list;
  const out = [...list];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

/** Add a panel to a page, at `atIndex` (the end by default). */
export function addPanel(p: Project, newId: NewId, pageId: string, atIndex?: number): { project: Project; id: string } {
  const panel = newPanel(newId);
  const project = editPage(p, pageId, (pg) => {
    const at = atIndex === undefined ? pg.panels.length : Math.max(0, Math.min(pg.panels.length, Math.floor(atIndex)));
    return { ...pg, panels: [...pg.panels.slice(0, at), panel, ...pg.panels.slice(at)] };
  });
  return { project, id: project === p ? "" : panel.id };
}

export function updatePanel(p: Project, pageId: string, panelId: string, fields: { description?: string }): Project {
  return editPage(p, pageId, (pg) =>
    editPanel(pg, panelId, (pn) =>
      fields.description === undefined || fields.description === pn.description ? pn : { ...pn, description: fields.description }
    )
  );
}

export function movePanel(p: Project, pageId: string, panelId: string, toIndex: number): Project {
  return editPage(p, pageId, (pg) => {
    const panels = moveInList(pg.panels, panelId, toIndex);
    return panels === pg.panels ? pg : { ...pg, panels };
  });
}

export function deletePanel(p: Project, pageId: string, panelId: string): Project {
  return editPage(p, pageId, (pg) =>
    pg.panels.some((x) => x.id === panelId) ? { ...pg, panels: pg.panels.filter((x) => x.id !== panelId) } : pg
  );
}

/** Add a line (balloon, caption, thought or sound effect) to a panel, at `atIndex` (the end by default). */
export function addLine(
  p: Project,
  newId: NewId,
  pageId: string,
  panelId: string,
  kind: LineKind = "dialogue",
  atIndex?: number
): { project: Project; id: string } {
  const line = newLine(newId, kind);
  const project = editPage(p, pageId, (pg) =>
    editPanel(pg, panelId, (pn) => {
      const at = atIndex === undefined ? pn.lines.length : Math.max(0, Math.min(pn.lines.length, Math.floor(atIndex)));
      return { ...pn, lines: [...pn.lines.slice(0, at), line, ...pn.lines.slice(at)] };
    })
  );
  return { project, id: project === p ? "" : line.id };
}

/**
 * Change a line. A caption or sound effect has no speaker. Giving a line to a character also
 * puts that character on the page's cast (so the cast check and appearances stay true).
 */
export function updateLine(
  p: Project,
  pageId: string,
  panelId: string,
  lineId: string,
  fields: Partial<Pick<ComicLine, "kind" | "speaker_id" | "text" | "note">>
): Project {
  if (fields.kind !== undefined && !(LINE_KINDS as readonly string[]).includes(fields.kind)) return p;
  return editPage(p, pageId, (pg) => {
    let cast = pg.character_ids;
    const withLine = editPanel(pg, panelId, (pn) => {
      const line = pn.lines.find((x) => x.id === lineId);
      if (!line) return pn;
      const next: ComicLine = { ...line, ...fields };
      if (next.kind === "caption" || next.kind === "sfx") next.speaker_id = "";
      if (next.kind === line.kind && next.speaker_id === line.speaker_id && next.text === line.text && next.note === line.note) return pn;
      if (next.speaker_id && !cast.includes(next.speaker_id)) cast = [...cast, next.speaker_id];
      return { ...pn, lines: pn.lines.map((x) => (x.id === lineId ? next : x)) };
    });
    if (withLine === pg) return pg;
    return cast === pg.character_ids ? withLine : { ...withLine, character_ids: cast };
  });
}

export function moveLine(p: Project, pageId: string, panelId: string, lineId: string, toIndex: number): Project {
  return editPage(p, pageId, (pg) =>
    editPanel(pg, panelId, (pn) => {
      const lines = moveInList(pn.lines, lineId, toIndex);
      return lines === pn.lines ? pn : { ...pn, lines };
    })
  );
}

export function deleteLine(p: Project, pageId: string, panelId: string, lineId: string): Project {
  return editPage(p, pageId, (pg) =>
    editPanel(pg, panelId, (pn) => (pn.lines.some((x) => x.id === lineId) ? { ...pn, lines: pn.lines.filter((x) => x.id !== lineId) } : pn))
  );
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
