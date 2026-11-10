/** Turns a Project + options into the ordered book every writer consumes. */
import type { Project } from "../types";
import { readingOrder } from "../model";
import { htmlToBlocks, type Block } from "./html";

export type ExportFormat = "markdown" | "text" | "docx" | "epub";
export type ExportScope = "all" | "chapter" | "scene";
export type SceneBreak = "ornament" | "blank" | "none";

export type ExportOptions = {
  format: ExportFormat;
  scope: ExportScope;
  /** Used by scope "chapter" (that scene's chapter) and "scene". */
  sceneId?: string | null;
  author: string;
  chapterHeadings: boolean;
  sceneTitles: boolean;
  sceneBreak: SceneBreak;
  pageSize?: "a4" | "letter";
  language?: string;
};

export const DEFAULT_OPTIONS: ExportOptions = {
  format: "docx",
  scope: "all",
  sceneId: null,
  author: "",
  chapterHeadings: true,
  sceneTitles: false,
  sceneBreak: "ornament",
  pageSize: "a4",
  language: "en",
};

export type BookScene = { title: string; blocks: Block[] };
export type BookChapter = { number: number; title: string; scenes: BookScene[] };
export type Book = {
  id: string;
  title: string;
  author: string;
  language: string;
  chapters: BookChapter[];
  options: ExportOptions;
};

export const ORNAMENT = "* * *";

export function buildBook(project: Project, options: ExportOptions): Book {
  let scenes = readingOrder(project);
  if (options.scope !== "all") {
    const target = scenes.find((s) => s.id === options.sceneId);
    scenes = !target
      ? []
      : options.scope === "scene"
        ? [target]
        : scenes.filter((s) => s.chapter_id === target.chapter_id);
  }

  const chapters: BookChapter[] = [];
  project.chapters.forEach((c, i) => {
    const own = scenes
      .filter((s) => s.chapter_id === c.id)
      .map((s) => ({ title: s.title, blocks: htmlToBlocks(s.content) }));
    // A scene with no text still counts when its title is exported; otherwise skip it.
    const kept = own.filter((s) => s.blocks.length > 0);
    if (kept.length > 0) chapters.push({ number: i + 1, title: c.title, scenes: kept });
  });

  return {
    id: project.id,
    title: project.title || "Untitled",
    author: options.author.trim(),
    language: options.language || "en",
    chapters,
    options,
  };
}

export const sceneCount = (b: Book) => b.chapters.reduce((n, c) => n + c.scenes.length, 0);

export function suggestedFileName(b: Book): string {
  const base = (b.title || "story").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim() || "story";
  const ext = { markdown: "md", text: "txt", docx: "docx", epub: "epub" }[b.options.format];
  return `${base}.${ext}`;
}

/** Remove characters XML 1.0 forbids. */
export const xmlSafe = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "");

export const escapeXml = (s: string) =>
  xmlSafe(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
