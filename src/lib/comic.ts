/**
 * Comic documents: stages, cleaning and the small helpers over issues, pages and panels.
 * Pure (no Svelte, no Tauri). The views come in later steps; this is the data they stand on.
 *
 * Plot-first and full script are one structure at different depths: a page always has a `plot`,
 * and may have `panels`. A plot-first page starts as plot only; a full-script page is written
 * panel by panel. The project's `script_style` only chooses defaults and emphasis; nothing is lost
 * by switching it.
 */
import type {
  ComicLine,
  ComicPage,
  ComicPanel,
  ComicStage,
  Issue,
  LineKind,
  Project,
  ScriptStyle,
} from "./types";
import { cleanColor } from "./labels";
import { cleanTodos } from "./scenenotes";

export const COMIC_STAGES = ["plot", "art", "dialogue", "lettered"] as const;
export const STAGE_LABEL: Record<ComicStage, string> = {
  plot: "Plot",
  art: "Art received",
  dialogue: "Dialogue",
  lettered: "Lettered",
};

export const SCRIPT_STYLES = ["plot-first", "full"] as const;
export const SCRIPT_STYLE_LABEL: Record<ScriptStyle, string> = {
  "plot-first": "Plot-first (Marvel method)",
  full: "Full script",
};
export const DEFAULT_SCRIPT_STYLE: ScriptStyle = "plot-first";

export const LINE_KINDS = ["dialogue", "caption", "thought", "sfx"] as const;

export const cleanStage = (x: unknown, fallback: ComicStage = "plot"): ComicStage =>
  (COMIC_STAGES as readonly string[]).includes(x as string) ? (x as ComicStage) : fallback;

export const cleanScriptStyle = (x: unknown): ScriptStyle =>
  (SCRIPT_STYLES as readonly string[]).includes(x as string) ? (x as ScriptStyle) : DEFAULT_SCRIPT_STYLE;

// ─── Cleaning (used when a file is read; repairs small gaps instead of dropping things) ───

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const isObject = (x: unknown): x is Raw => typeof x === "object" && x !== null && !Array.isArray(x);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, fallback = ""): string => (typeof x === "string" ? x : fallback);
const strings = (x: unknown): string[] => arr(x).filter((v): v is string => typeof v === "string");

/** Issues with ids and titles, never two with the same id. */
export function cleanIssues(list: unknown): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  arr(list).forEach((raw, i) => {
    if (!isObject(raw)) return;
    let id = str(raw.id) || `is-fixed-${i + 1}`;
    if (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    out.push({ ...raw, id, title: str(raw.title, `Issue ${out.length + 1}`), summary: str(raw.summary) });
  });
  return out;
}

function cleanLines(list: unknown, ids: Set<string>): ComicLine[] {
  const out: ComicLine[] = [];
  arr(list).forEach((raw, i) => {
    if (!isObject(raw)) return;
    let id = str(raw.id) || `ln-fixed-${out.length + 1}`;
    if (ids.has(id)) id = `${id}-${i + 1}`;
    ids.add(id);
    out.push({
      ...raw,
      id,
      kind: (LINE_KINDS as readonly string[]).includes(raw.kind) ? (raw.kind as LineKind) : "dialogue",
      speaker_id: str(raw.speaker_id),
      text: str(raw.text),
      note: str(raw.note),
    });
  });
  return out;
}

function cleanPanels(list: unknown, ids: Set<string>): ComicPanel[] {
  const out: ComicPanel[] = [];
  arr(list).forEach((raw, i) => {
    if (!isObject(raw)) return;
    let id = str(raw.id) || `pn-fixed-${out.length + 1}`;
    if (ids.has(id)) id = `${id}-${i + 1}`;
    ids.add(id);
    out.push({ ...raw, id, description: str(raw.description), lines: cleanLines(raw.lines, ids) });
  });
  return out;
}

/**
 * Pages that always point at a real issue, with dense 0..n-1 orders inside each issue, clean
 * panels and lines (ids unique across the whole page set), and a valid stage.
 * `issues` must be the already-cleaned list.
 */
export function cleanPages(list: unknown, issues: Issue[]): ComicPage[] {
  const known = new Set(issues.map((i) => i.id));
  const ids = new Set<string>(); // panel and line ids are unique across the document
  const seenPages = new Set<string>();
  const pages: ComicPage[] = [];
  arr(list).forEach((raw, i) => {
    if (!isObject(raw) || issues.length === 0) return;
    let id = str(raw.id) || `pg-fixed-${i + 1}`;
    if (seenPages.has(id)) id = `${id}-${i + 1}`;
    seenPages.add(id);
    const panels = cleanPanels(raw.panels, ids);
    pages.push({
      ...raw,
      id,
      issue_id: known.has(raw.issue_id) ? raw.issue_id : issues[0].id,
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : i,
      title: str(raw.title),
      plot: str(raw.plot),
      layout: str(raw.layout),
      panels,
      stage: cleanStage(raw.stage),
      plotline_id: str(raw.plotline_id),
      character_ids: strings(raw.character_ids),
      place_ids: strings(raw.place_ids),
      tags: strings(raw.tags),
      color: cleanColor(raw.color),
      notes: str(raw.notes),
      todos: cleanTodos(raw.todos),
      when: str(raw.when),
    });
  });
  // Dense orders per issue; ties keep the file's order (the sort is stable).
  const byIssue = new Map<string, ComicPage[]>();
  for (const pg of pages) byIssue.set(pg.issue_id, [...(byIssue.get(pg.issue_id) ?? []), pg]);
  for (const group of byIssue.values()) [...group].sort((a, b) => a.order - b.order).forEach((pg, n) => (pg.order = n));
  return pages;
}

// ─── Reading order and layout ───

/** The pages of one issue, in order. */
export const pagesInIssue = (pages: ComicPage[], issueId: string): ComicPage[] =>
  pages.filter((p) => p.issue_id === issueId).sort((a, b) => a.order - b.order);

/** Every page in reading order: issues in order, then pages by `order`. */
export const comicReadingOrder = (p: Pick<Project, "issues" | "pages">): ComicPage[] =>
  p.issues.flatMap((i) => pagesInIssue(p.pages, i.id));

/** The page number shown to people (1-based) inside its issue. */
export const pageNumber = (page: Pick<ComicPage, "order">): number => page.order + 1;

/**
 * Which side of an open book a page is on. Page 1 is a right-hand page (the first one you see
 * when you open the issue), so odd pages are right and even pages are left.
 */
export const pageSide = (number: number): "left" | "right" => (number % 2 === 1 ? "right" : "left");

/**
 * The page numbers that are seen together as a spread: 2–3, 4–5, …  Page 1 stands alone on the
 * right; so does the last page when it falls on a left page with nothing facing it.
 */
export function spreadOf(number: number, totalPages: number): number[] {
  if (number < 1 || number > totalPages) return [];
  if (number === 1) return [1];
  const left = number % 2 === 0 ? number : number - 1;
  return left + 1 <= totalPages ? [left, left + 1] : [left];
}

/**
 * A page turn is what happens when a reader turns from a right-hand page to the next left-hand
 * one: nothing on the next spread is visible until then. These are the pages that follow a turn
 * (the first page of each new spread; the usual place for reveals).
 */
export const isAfterPageTurn = (number: number): boolean => number >= 2 && number % 2 === 0;

// ─── Counting ───

export const panelCount = (page: Pick<ComicPage, "panels">): number => page.panels.length;

export const wordsIn = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** Words a reader has to read on the page (dialogue, captions and thoughts; sound effects are art). */
export function lettersWordCount(page: Pick<ComicPage, "panels">): number {
  let n = 0;
  for (const pn of page.panels) for (const ln of pn.lines) if (ln.kind !== "sfx") n += wordsIn(ln.text);
  return n;
}

/** Words of the writer's plot (what the plot-first page is written in). */
export const plotWordCount = (page: Pick<ComicPage, "plot">): number => wordsIn(page.plot);

// ─── Making new things ───

export type NewId = (prefix: string) => string;

export const newPanel = (newId: NewId): ComicPanel => ({ id: newId("pn"), description: "", lines: [] });

export const newLine = (newId: NewId, kind: LineKind = "dialogue", speakerId = ""): ComicLine => ({
  id: newId("ln"),
  kind,
  speaker_id: kind === "dialogue" || kind === "thought" ? speakerId : "",
  text: "",
  note: "",
});

export function newPage(newId: NewId, issueId: string, order: number, plotlineId = ""): ComicPage {
  return {
    id: newId("pg"),
    issue_id: issueId,
    order,
    title: "",
    plot: "",
    layout: "",
    panels: [],
    stage: "plot",
    plotline_id: plotlineId,
    character_ids: [],
    place_ids: [],
    tags: [],
    color: "",
    notes: "",
    todos: [],
    when: "",
  };
}

// ─── Gentle limits (shown as warnings, never enforced) ───

/** A balloon that is longer than this is hard to letter and hard to read. */
export const BALLOON_WORD_LIMIT = 25;
/** More than this much lettering in one panel crowds the art. */
export const PANEL_WORD_LIMIT = 45;
/** More panels than this on one page makes them small. */
export const PAGE_PANEL_LIMIT = 9;

const readWords = (ln: Pick<ComicLine, "kind" | "text">) => (ln.kind === "sfx" ? 0 : wordsIn(ln.text));

/** Words a reader reads in one line (sound effects are art, so 0). */
export const lineWords = readWords;

export const balloonTooLong = (ln: Pick<ComicLine, "kind" | "text">): boolean => readWords(ln) > BALLOON_WORD_LIMIT;

/** Words of lettering in one panel. */
export const panelWords = (pn: Pick<ComicPanel, "lines">): number => pn.lines.reduce((n, ln) => n + readWords(ln), 0);

export const panelTooWordy = (pn: Pick<ComicPanel, "lines">): boolean => panelWords(pn) > PANEL_WORD_LIMIT;

export const pageTooBusy = (page: Pick<ComicPage, "panels">): boolean => page.panels.length > PAGE_PANEL_LIMIT;
