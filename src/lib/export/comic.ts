/**
 * Comic exports: turn a comic project into the same `Book` every writer already understands
 * (issue → "chapter", page → "scene"), so Word, EPUB, Markdown and plain text all work.
 *
 * Three kinds (plus the thumbnail sheet, see thumbnails.ts):
 *   script  the full script, panel by panel: description, then the lettering (dialogue, captions,
 *           thoughts, SFX), the way a letterer and an artist read it
 *   plot    the plot for the artist (Marvel-style): what happens on each page, who and where,
 *           with no dialogue
 *   lettering  for the letterer: only the balloons, captions and SFX, numbered per panel in reading order
 *
 * Pure (no Svelte, no Tauri).
 */
import type { ComicLine, ComicPage, Project } from "../types";
import { comicReadingOrder, isAfterPageTurn, pageNumber, pagesInIssue } from "../comic";
import type { Block, Run } from "./html";
import type { Book, BookChapter, BookScene, ExportOptions } from "./book";

export type ComicExportKind = "script" | "plot" | "lettering" | "thumbnails";
export const COMIC_EXPORT_KINDS: { id: ComicExportKind; label: string; hint: string }[] = [
  { id: "script", label: "Full script", hint: "Panel by panel, with every balloon, caption and SFX" },
  { id: "plot", label: "Plot for the artist", hint: "What happens on each page, no dialogue" },
  { id: "lettering", label: "Lettering script", hint: "Only the balloons, captions and SFX, numbered per panel" },
  { id: "thumbnails", label: "Thumbnail sheet", hint: "Printable page frames in spreads, with layout, plot and cast (HTML)" },
];

/** "Issue 2", or "Issue 2: Falling"; a title that only repeats the number ("Issue 2") is not repeated. */
export function issueHeading(index: number, title: string): string {
  const t = title.trim();
  return !t || t.toLowerCase() === `issue ${index + 1}` ? `Issue ${index + 1}` : `Issue ${index + 1}: ${t}`;
}

const text = (t: string, style: { bold?: boolean; italic?: boolean } = {}): Run => ({ text: t, ...style });
const para = (...runs: Run[]): Block => ({ type: "p", runs });
const withBreaks = (s: string, style: { italic?: boolean } = {}): Run[] => {
  const runs: Run[] = [];
  s.trim().split(/\r?\n/).forEach((ln, i) => {
    if (i > 0) runs.push({ br: true });
    runs.push(text(ln, style));
  });
  return runs;
};

function lineBlock(ln: ComicLine, nameOf: (id: string) => string, number?: number): Block {
  const note = ln.note.trim();
  const body = ln.text.trim();
  let label: string;
  switch (ln.kind) {
    case "caption": label = "CAPTION"; break;
    case "sfx": label = "SFX"; break;
    case "thought": label = `${nameOf(ln.speaker_id) || "UNKNOWN"} (thought)`; break;
    default: label = nameOf(ln.speaker_id) || "UNKNOWN";
  }
  const runs: Run[] = [];
  if (number !== undefined) runs.push(text(`${number}. `));
  runs.push(text(label, { bold: true }));
  if (note) runs.push(text(` (${note})`, { italic: true }));
  runs.push(text(`: ${body}`));
  return { type: "p", runs };
}

const lettered = (ln: ComicLine) => ln.text.trim() !== "" || ln.note.trim() !== "";

const hasContent = (pg: ComicPage, kind: ComicExportKind): boolean =>
  kind === "lettering"
    ? pg.panels.some((pn) => pn.lines.some(lettered))
    : pg.plot.trim() !== "" ||
      pg.panels.some((pn) => pn.description.trim() !== "" || (kind === "script" && pn.lines.length > 0));

function pageHeading(pg: ComicPage, kind: ComicExportKind): string {
  const n = pageNumber(pg);
  let h = `Page ${n}`;
  if (pg.title.trim()) h += `: ${pg.title.trim()}`;
  if (kind === "lettering") return h;
  if (kind === "script" && pg.panels.length > 0) h += ` — ${pg.panels.length} panel${pg.panels.length === 1 ? "" : "s"}`;
  if (kind === "script" && isAfterPageTurn(n)) h += " (page turn)";
  return h;
}

/** The pages an export covers: all, the issue of the selected page, or just that page (reading order). */
export function comicPagesFor(project: Project, options: ExportOptions): ComicPage[] {
  const pages = comicReadingOrder(project);
  if (options.scope === "all") return pages;
  const target = pages.find((p) => p.id === options.sceneId);
  return !target ? [] : options.scope === "scene" ? [target] : pagesInIssue(pages, target.issue_id);
}

export function buildComicBook(project: Project, options: ExportOptions): Book {
  const kind: ComicExportKind = options.comicKind === "plot" ? "plot" : options.comicKind === "lettering" ? "lettering" : "script";
  const includePlot = options.comicPlot !== false;
  const chars = new Map(project.characters.map((c) => [c.id, c.name]));
  const places = new Map(project.places.map((p) => [p.id, p.name]));
  const nameOf = (id: string) => (id ? (chars.get(id) ?? "").toUpperCase() : "");

  const pages = comicPagesFor(project, options);

  const chapters: BookChapter[] = [];
  project.issues.forEach((issue, i) => {
    const scenes: BookScene[] = [];
    for (const pg of pages.filter((p) => p.issue_id === issue.id)) {
      if (!hasContent(pg, kind)) continue; // an empty page adds nothing to read; the numbers keep their place
      const blocks: Block[] = [{ type: "h", level: 2, runs: [text(pageHeading(pg, kind))] }];
      const cast = pg.character_ids.map((id) => chars.get(id)).filter((n): n is string => !!n);
      const where = pg.place_ids.map((id) => places.get(id)).filter((n): n is string => !!n);

      if (kind === "plot") {
        if (pg.plot.trim()) blocks.push(para(...withBreaks(pg.plot)));
        else {
          // Nothing written as a plot yet: the panel descriptions are the plot.
          pg.panels.forEach((pn, k) => {
            if (pn.description.trim()) blocks.push({ type: "li", ordered: true, index: k + 1, runs: withBreaks(pn.description) });
          });
        }
        if (cast.length) blocks.push(para(text("Characters: ", { bold: true }), text(cast.join(", "))));
        if (where.length) blocks.push(para(text("Places: ", { bold: true }), text(where.join(", "))));
      } else if (kind === "lettering") {
        pg.panels.forEach((pn, k) => {
          const lines = pn.lines.filter(lettered);
          if (lines.length === 0) return;
          blocks.push(para(text(`Panel ${k + 1}`, { bold: true })));
          lines.forEach((ln, j) => blocks.push(lineBlock(ln, nameOf, j + 1)));
        });
      } else {
        if (includePlot && pg.plot.trim()) blocks.push(para(...withBreaks(pg.plot, { italic: true })));
        pg.panels.forEach((pn, k) => {
          blocks.push(para(text(`Panel ${k + 1}`, { bold: true })));
          if (pn.description.trim()) blocks.push(para(...withBreaks(pn.description)));
          for (const ln of pn.lines) if (ln.text.trim() || ln.note.trim()) blocks.push(lineBlock(ln, nameOf));
        });
      }
      scenes.push({ title: pageHeading(pg, kind), blocks });
    }
    if (scenes.length > 0) {
      chapters.push({ number: i + 1, title: issueHeading(i, issue.title), scenes });
    }
  });

  return {
    id: project.id,
    title: project.title || "Untitled",
    author: options.author.trim(),
    language: options.language || "en",
    chapters,
    // Pages carry their own headings; the writers must not add chapter-style breaks or ornaments between them.
    options: { ...options, chapterHeadings: true, sceneTitles: false, sceneBreak: "none" },
    layout: "script",
    fileStem: kind,
  };
}
