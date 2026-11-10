/**
 * Word counts for scenes, chapters and the whole project. Pure (no
 * Svelte/Tauri), unit-tested.
 *
 * A word is a run of letters/digits, optionally joined by an apostrophe or
 * hyphen: "don't", "well-known", "1,000" and "3.14" each count once;
 * "word—word" is two. Unicode-aware, so accents and non-Latin scripts count.
 * HTML tags are not words, and neither are the gaps between paragraphs.
 */
import type { Project, Scene } from "./types";
import { htmlToPlainText } from "./mentions";

const WORD = /\p{N}+(?:[.,]\p{N}+)+|[\p{L}\p{N}]+(?:['’\u2010-][\p{L}\p{N}]+)*/gu;

export function countWordsInText(text: string): number {
  if (!text) return 0;
  let n = 0;
  for (const _ of text.matchAll(WORD)) n++;
  return n;
}

/** Words in a scene's stored text (HTML or legacy plain text). */
export function wordsOfHtml(html: string): number {
  return html ? countWordsInText(htmlToPlainText(html)) : 0;
}

// Typing in one scene must not recount the others.
const cache = new Map<string, { content: string; words: number }>();

export function clearWordCache(): void {
  cache.clear();
}

export function sceneWords(scene: Pick<Scene, "id" | "content">): number {
  const hit = cache.get(scene.id);
  if (hit && hit.content === scene.content) return hit.words;
  const words = wordsOfHtml(scene.content);
  cache.set(scene.id, { content: scene.content, words });
  return words;
}

export type WordStats = {
  total: number;
  byScene: Map<string, number>;
  byChapter: Map<string, number>;
};

export function wordStats(project: Pick<Project, "scenes" | "chapters">): WordStats {
  const byScene = new Map<string, number>();
  const byChapter = new Map<string, number>(project.chapters.map((c) => [c.id, 0]));
  let total = 0;
  for (const s of project.scenes) {
    const n = sceneWords(s);
    byScene.set(s.id, n);
    byChapter.set(s.chapter_id, (byChapter.get(s.chapter_id) ?? 0) + n);
    total += n;
  }
  // Forget scenes that no longer exist so the cache cannot grow without bound.
  if (cache.size > byScene.size + 50) {
    for (const id of cache.keys()) if (!byScene.has(id)) cache.delete(id);
  }
  return { total, byScene, byChapter };
}

/** 12345 -> "12,345" (uses the reader's locale). */
export const formatCount = (n: number) => n.toLocaleString();
