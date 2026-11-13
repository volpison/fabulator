/**
 * Find & replace across the project. Pure functions (no Svelte/Tauri), tested.
 *
 * Scene text is stored as HTML, so the replacement works on the *visible text
 * only*: tags and attributes are never touched. Matches may span inline
 * formatting ("Shep<strong>herd</strong>") - the replacement takes the
 * formatting of the place where the match starts (an inline element emptied
 * by a match is dropped). Matches never span
 * paragraphs or line breaks.
 *
 * Matching is literal (no regular expressions for the user), optionally
 * case-sensitive and/or whole-word. Accents always count here ("José" does
 * not match "Jose"), because replacing the wrong thing silently is worse
 * than missing something; the search dialog is the accent-insensitive tool.
 */
import type { ComicPage, Project, Scene } from "./types";
import { comicReadingOrder, pageNumber } from "./comic";
import { readingOrder } from "./model";
import { decodeEntities, looksLikeHtml } from "./export/html";
import { htmlToPlainText } from "./mentions";
import { hasContent, makePageSnapshot, makeSnapshot, pageHasContent, pageToText } from "./snapshots";

export type ReplaceOptions = { matchCase: boolean; wholeWord: boolean };
export type ReplaceFields = { content: boolean; title: boolean; summary: boolean };

export const DEFAULT_REPLACE_OPTIONS: ReplaceOptions = { matchCase: false, wholeWord: false };
export const DEFAULT_REPLACE_FIELDS: ReplaceFields = { content: true, title: false, summary: false };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A global matcher for the literal text, or null for an empty search. */
export function buildMatcher(find: string, opts: ReplaceOptions): RegExp | null {
  if (!find) return null;
  let src = escapeRegExp(find);
  if (opts.wholeWord) {
    // Unicode-aware word edges (only where the search text itself starts/ends with a word character).
    if (/^[\p{L}\p{N}]/u.test(find)) src = `(?<![\\p{L}\\p{N}])${src}`;
    if (/[\p{L}\p{N}]$/u.test(find)) src = `${src}(?![\\p{L}\\p{N}])`;
  }
  return new RegExp(src, opts.matchCase ? "gu" : "giu");
}

function matchesOf(re: RegExp, text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

const encodeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\u00a0/g, "&nbsp;");

/** Inline formatting left empty because a match swallowed all of its text. */
const EMPTY_INLINE = /<(strong|em|b|i|s|u|strike|del|span)(?:\s[^>]*)?><\/\1>/gi;

// ─── plain strings (titles, synopses, legacy plain-text scenes) ───

export function replaceInPlain(text: string, re: RegExp, replacement: string) {
  const ms = matchesOf(re, text);
  if (ms.length === 0) return { text, count: 0 };
  let out = "";
  let cursor = 0;
  for (const m of ms) {
    out += text.slice(cursor, m.start) + replacement;
    cursor = m.end;
  }
  return { text: out + text.slice(cursor), count: ms.length };
}

// ─── HTML ─────────────────────────────────────────────────────

const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol",
  "blockquote", "pre", "br", "hr", "table", "tr", "td", "th",
]);

type Segment = { token: number; text: string };

/** Replace in the visible text of an HTML string. Tags are left byte-for-byte untouched. */
export function replaceInHtml(html: string, re: RegExp, replacement: string) {
  if (!html) return { html, count: 0 };
  if (!looksLikeHtml(html)) {
    const r = replaceInPlain(html, re, replacement);
    return { html: r.text, count: r.count };
  }

  const tokens: string[] = [];
  const isText: boolean[] = [];
  for (const m of html.matchAll(/<[^>]*>|[^<]+|</g)) {
    tokens.push(m[0]);
    isText.push(!(m[0].length > 1 && m[0].startsWith("<") && m[0].endsWith(">")));
  }

  let total = 0;
  let segments: Segment[] = [];

  const flush = () => {
    if (segments.length === 0) return;
    const virtual = segments.map((s) => s.text).join("");
    const ms = matchesOf(re, virtual);
    if (ms.length > 0) {
      total += ms.length;
      let a = 0;
      for (const seg of segments) {
        const b = a + seg.text.length;
        let cursor = a;
        let out = "";
        for (const m of ms) {
          if (m.end <= a || m.start >= b) continue;
          const from = Math.max(m.start, a);
          out += virtual.slice(cursor, from);
          if (m.start >= a) out += replacement; // the match starts in this segment
          cursor = Math.min(m.end, b);
        }
        out += virtual.slice(cursor, b);
        if (out !== seg.text) tokens[seg.token] = encodeText(out);
        a = b;
      }
    }
    segments = [];
  };

  tokens.forEach((tok, i) => {
    if (isText[i]) {
      const text = decodeEntities(tok);
      if (text) segments.push({ token: i, text });
      return;
    }
    const name = /^<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(tok)?.[1]?.toLowerCase();
    if (name && BLOCK_TAGS.has(name)) flush();
  });
  flush();

  if (total === 0) return { html, count: 0 };
  return { html: tokens.join("").replace(EMPTY_INLINE, ""), count: total };
}

// ─── whole-project plan ───────────────────────────────────────

export type Snip = { before: string; match: string; replacement: string; after: string };

export type SceneChange = {
  sceneId: string;
  title: string;
  chapterLabel: string;
  counts: { content: number; title: number; summary: number };
  total: number;
  /** First match, for the preview line. */
  snippet: Snip | null;
};

export type ReplacePlan = { changes: SceneChange[]; total: number; scenes: number };

function snipOf(text: string, re: RegExp, replacement: string): Snip | null {
  const first = matchesOf(re, text)[0];
  if (!first) return null;
  const tidy = (s: string) => s.replace(/\s+/g, " ");
  const a = Math.max(0, first.start - 40);
  const b = Math.min(text.length, first.end + 60);
  return {
    before: (a > 0 ? "…" : "") + tidy(text.slice(a, first.start)),
    match: tidy(text.slice(first.start, first.end)),
    replacement,
    after: tidy(text.slice(first.end, b)) + (b < text.length ? "…" : ""),
  };
}

// ─── comic pages ───
// For a comic, "text" is the page's writing (plot, panel descriptions, lines and lettering notes);
// "title" is the page title; there is no separate synopsis (the plot is part of the writing).

function replaceInPageText(pg: ComicPage, re: RegExp, replacement: string): { page: ComicPage; count: number } {
  let count = 0;
  const one = (t: string) => {
    const r = replaceInPlain(t, re, replacement);
    count += r.count;
    return r.text;
  };
  const plot = one(pg.plot);
  const panels = pg.panels.map((pn) => ({
    ...pn,
    description: one(pn.description),
    lines: pn.lines.map((ln) => ({ ...ln, text: one(ln.text), note: one(ln.note) })),
  }));
  return count === 0 ? { page: pg, count: 0 } : { page: { ...pg, plot, panels }, count };
}

function planReplaceComic(
  project: Project,
  re: RegExp,
  replacement: string,
  fields: ReplaceFields,
  onlyId?: string | null
): ReplacePlan {
  const issueLabel = new Map(project.issues.map((i, n) => [i.id, `Issue ${n + 1}${i.title ? ` · ${i.title}` : ""}`]));
  const changes: SceneChange[] = [];
  for (const pg of comicReadingOrder(project)) {
    if (onlyId && pg.id !== onlyId) continue;
    const counts = {
      content: fields.content ? replaceInPageText(pg, re, replacement).count : 0,
      title: fields.title ? replaceInPlain(pg.title, re, replacement).count : 0,
      summary: 0,
    };
    const total = counts.content + counts.title;
    if (total === 0) continue;
    const snippet =
      (counts.content && snipOf(pageToText(pg), re, replacement)) ||
      (counts.title && snipOf(pg.title, re, replacement)) ||
      null;
    changes.push({
      sceneId: pg.id,
      title: pg.title || `Page ${pageNumber(pg)}`,
      chapterLabel: `${issueLabel.get(pg.issue_id) ?? ""} · Page ${pageNumber(pg)}`.replace(/^ · /, ""),
      counts,
      total,
      snippet,
    });
  }
  return { changes, total: changes.reduce((n, c) => n + c.total, 0), scenes: changes.length };
}

function applyReplaceComic(
  project: Project,
  re: RegExp,
  find: string,
  replacement: string,
  fields: ReplaceFields,
  ids: Set<string>,
  now: number,
  newId: () => string
): { project: Project; scenes: number; replacements: number } {
  const label = `Before replace “${find}” → “${replacement}”`;
  const snapshots = [...project.snapshots];
  let scenes = 0;
  let replacements = 0;
  const pages = project.pages.map((pg): ComicPage => {
    if (!ids.has(pg.id)) return pg;
    const c = fields.content ? replaceInPageText(pg, re, replacement) : { page: pg, count: 0 };
    const t = fields.title ? replaceInPlain(pg.title, re, replacement) : { text: pg.title, count: 0 };
    const n = c.count + t.count;
    if (n === 0) return pg;
    scenes++;
    replacements += n;
    if (pageHasContent(pg) || pg.title) snapshots.push(makePageSnapshot(pg, "safety", label, now, newId()));
    return { ...c.page, title: t.text };
  });
  if (scenes === 0) return { project, scenes: 0, replacements: 0 };
  return { project: { ...project, pages, snapshots }, scenes, replacements };
}

/** What a replace would change, scene by scene (nothing is modified). */
export function planReplace(
  project: Project,
  find: string,
  replacement: string,
  opts: ReplaceOptions,
  fields: ReplaceFields,
  onlySceneId?: string | null
): ReplacePlan {
  const re = buildMatcher(find, opts);
  if (!re) return { changes: [], total: 0, scenes: 0 };
  if (project.story_format === "comic") return planReplaceComic(project, re, replacement, fields, onlySceneId);
  const chapterLabel = new Map(project.chapters.map((c, i) => [c.id, `Ch ${i + 1} · ${c.title}`]));
  const changes: SceneChange[] = [];

  for (const s of readingOrder(project)) {
    if (onlySceneId && s.id !== onlySceneId) continue;
    const counts = {
      content: fields.content ? replaceInHtml(s.content, re, replacement).count : 0,
      title: fields.title ? replaceInPlain(s.title, re, replacement).count : 0,
      summary: fields.summary ? replaceInPlain(s.summary, re, replacement).count : 0,
    };
    const total = counts.content + counts.title + counts.summary;
    if (total === 0) continue;
    const snippet =
      (counts.content && snipOf(htmlToPlainText(s.content), re, replacement)) ||
      (counts.title && snipOf(s.title, re, replacement)) ||
      (counts.summary && snipOf(s.summary, re, replacement)) ||
      null;
    changes.push({
      sceneId: s.id,
      title: s.title || "Untitled",
      chapterLabel: chapterLabel.get(s.chapter_id) ?? "",
      counts,
      total,
      snippet,
    });
  }
  return { changes, total: changes.reduce((n, c) => n + c.total, 0), scenes: changes.length };
}

/**
 * Apply the replacement to the chosen scenes. Every scene that changes first
 * gets a *safety* snapshot of its previous state (never pruned), so each one
 * can be undone from the Snapshots dialog.
 */
export function applyReplace(
  project: Project,
  find: string,
  replacement: string,
  opts: ReplaceOptions,
  fields: ReplaceFields,
  sceneIds: Set<string>,
  now: number,
  newId: () => string
): { project: Project; scenes: number; replacements: number } {
  const re = buildMatcher(find, opts);
  if (!re || sceneIds.size === 0) return { project, scenes: 0, replacements: 0 };
  if (project.story_format === "comic") return applyReplaceComic(project, re, find, replacement, fields, sceneIds, now, newId);

  const label = `Before replace “${find}” → “${replacement}”`;
  const snapshots = [...project.snapshots];
  let scenes = 0;
  let replacements = 0;

  const next = project.scenes.map((s): Scene => {
    if (!sceneIds.has(s.id)) return s;
    const c = fields.content ? replaceInHtml(s.content, re, replacement) : { html: s.content, count: 0 };
    const t = fields.title ? replaceInPlain(s.title, re, replacement) : { text: s.title, count: 0 };
    const y = fields.summary ? replaceInPlain(s.summary, re, replacement) : { text: s.summary, count: 0 };
    const n = c.count + t.count + y.count;
    if (n === 0) return s;
    scenes++;
    replacements += n;
    if (hasContent(s) || s.title) snapshots.push(makeSnapshot(s, "safety", label, now, newId()));
    return { ...s, content: c.html, title: t.text, summary: y.text };
  });

  if (scenes === 0) return { project, scenes: 0, replacements: 0 };
  return { project: { ...project, scenes: next, snapshots }, scenes, replacements };
}
