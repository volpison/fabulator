import type { Project } from "../types";
import { buildBook, sceneCount, suggestedFileName, type ExportOptions } from "./book";
import { renderMarkdown } from "./markdown";
import { renderText } from "./text";
import { renderDocx } from "./docx";
import { renderEpub } from "./epub";
import { renderThumbnailSheet } from "./thumbnails";
import { comicPagesFor } from "./comic";
import { buildScript, type ScriptDoc } from "./screenplayDoc";
import { paginate, titlePage } from "./screenplayLayout";
import { renderPdf } from "./pdf";
import { renderFountain } from "./fountain";
import { renderScreenplayDocx } from "./screenplayDocx";

export * from "./book";

export type ExportResult = { bytes: Uint8Array; fileName: string; scenes: number; chapters: number };

const isSheet = (project: Project, options: ExportOptions) =>
  project.story_format === "comic" && options.comicKind === "thumbnails";

/** The thumbnail sheet is HTML whatever format was picked; its counts are pages and issues (empty pages included). */
function sheetCounts(project: Project, options: ExportOptions) {
  const pages = comicPagesFor(project, options);
  return { scenes: pages.length, chapters: new Set(pages.map((p) => p.issue_id)).size };
}

const isScript = (project: Project) => project.story_format === "screenplay";
export const SCREENPLAY_FORMATS: ExportOptions["format"][] = ["pdf", "docx", "fountain"];

function scriptFileName(doc: ScriptDoc, format: ExportOptions["format"]) {
  const base = (doc.title || "screenplay").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim() || "screenplay";
  return `${base}.${format === "fountain" ? "fountain" : format === "docx" ? "docx" : "pdf"}`;
}

function exportScreenplay(project: Project, options: ExportOptions): ExportResult {
  const doc = buildScript(project, options);
  const titleOn = options.spTitlePage !== false;
  const numbers = !!options.spSceneNumbers;
  // Anything but Word or Fountain (a leftover choice from another format) is a PDF.
  const format = options.format === "docx" || options.format === "fountain" ? options.format : "pdf";
  let bytes: Uint8Array;
  if (format === "fountain") bytes = new TextEncoder().encode(renderFountain(doc, { titlePage: titleOn, numbers }));
  else if (format === "docx") bytes = renderScreenplayDocx(doc, { titlePage: titleOn, numbers, pageSize: options.pageSize ?? "a4" });
  else {
    const pages = paginate(doc, numbers);
    const all = titleOn && (doc.title || doc.author) ? [{ items: titlePage(doc) }, ...pages] : pages;
    bytes = renderPdf(all, options.pageSize ?? "a4", doc.title);
  }
  return { bytes, fileName: scriptFileName(doc, format), scenes: doc.scenes.length, chapters: doc.acts };
}

export function exportProject(project: Project, options: ExportOptions): ExportResult {
  if (isScript(project)) return exportScreenplay(project, options);
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
    case "epub": bytes = renderEpub(book); break;
    default: bytes = renderDocx(book); // "docx"; PDF and Fountain are screenplay formats
  }
  return { bytes, fileName: suggestedFileName(book), scenes: sceneCount(book), chapters: book.chapters.length };
}

/** Cheap counts for the dialog (no rendering). */
export function exportPreview(project: Project, options: ExportOptions) {
  if (isScript(project)) {
    const doc = buildScript(project, options);
    return { scenes: doc.scenes.length, chapters: doc.acts };
  }
  if (isSheet(project, options)) return sheetCounts(project, options);
  const book = buildBook(project, options);
  return { scenes: sceneCount(book), chapters: book.chapters.length };
}
