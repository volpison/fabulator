import type { Project } from "../types";
import { buildBook, sceneCount, suggestedFileName, type ExportOptions } from "./book";
import { renderMarkdown } from "./markdown";
import { renderText } from "./text";
import { renderDocx } from "./docx";
import { renderEpub } from "./epub";
import { renderThumbnailSheet } from "./thumbnails";
import { comicPagesFor } from "./comic";

export * from "./book";

export type ExportResult = { bytes: Uint8Array; fileName: string; scenes: number; chapters: number };

const isSheet = (project: Project, options: ExportOptions) =>
  project.story_format === "comic" && options.comicKind === "thumbnails";

/** The thumbnail sheet is HTML whatever format was picked; its counts are pages and issues (empty pages included). */
function sheetCounts(project: Project, options: ExportOptions) {
  const pages = comicPagesFor(project, options);
  return { scenes: pages.length, chapters: new Set(pages.map((p) => p.issue_id)).size };
}

export function exportProject(project: Project, options: ExportOptions): ExportResult {
  if (isSheet(project, options)) {
    const base = (project.title || "story").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim() || "story";
    return { bytes: new TextEncoder().encode(renderThumbnailSheet(project, options)), fileName: `${base} (thumbnails).html`, ...sheetCounts(project, options) };
  }
  const book = buildBook(project, options);
  const enc = new TextEncoder();
  let bytes: Uint8Array;
  switch (options.format) {
    case "markdown": bytes = enc.encode(renderMarkdown(book)); break;
    case "text": bytes = enc.encode(renderText(book)); break;
    case "docx": bytes = renderDocx(book); break;
    case "epub": bytes = renderEpub(book); break;
  }
  return { bytes, fileName: suggestedFileName(book), scenes: sceneCount(book), chapters: book.chapters.length };
}

/** Cheap counts for the dialog (no rendering). */
export function exportPreview(project: Project, options: ExportOptions) {
  if (isSheet(project, options)) return sheetCounts(project, options);
  const book = buildBook(project, options);
  return { scenes: sceneCount(book), chapters: book.chapters.length };
}
