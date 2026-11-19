/**
 * What counts as a word. Pure (no Svelte/Tauri), unit-tested through
 * tools/wordcount.ts.
 *
 * A word is a run of letters/digits, optionally joined by an apostrophe or
 * hyphen: "don't", "well-known", "1,000" and "3.14" each count once;
 * "word—word" is two. Unicode-aware, so accents and non-Latin scripts count.
 */

const WORD = /\p{N}+(?:[.,]\p{N}+)+|[\p{L}\p{N}]+(?:['’\u2010-][\p{L}\p{N}]+)*/gu;

export function countWordsInText(text: string): number {
  if (!text) return 0;
  let n = 0;
  for (const _ of text.matchAll(WORD)) n++;
  return n;
}
