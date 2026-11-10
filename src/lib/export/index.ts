import type { Project } from "../types";
import { buildBook, sceneCount, suggestedFileName, type ExportOptions } from "./book";
import { renderMarkdown } from "./markdown";
import { renderText } from "./text";
import { renderDocx } from "./docx";
import { renderEpub } from "./epub";

export * from "./book";

export type ExportResult = { bytes: Uint8Array; fileName: string; scenes: number; chapters: number };

export function exportProject(project: Project, options: ExportOptions): ExportResult {
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
  const book = buildBook(project, options);
  return { scenes: sceneCount(book), chapters: book.chapters.length };
}
