/**
 * Project-wide search. Pure functions (no Svelte/Tauri), unit-tested.
 *
 * - Case- and accent-insensitive ("jose" finds "José"), substring matching
 *   ("pastur" finds "pasture").
 * - Several words = all of them must appear in the same item, in any of its
 *   fields. Use "double quotes" for an exact phrase.
 * - Searches scene titles, synopses, text and tags; characters, places,
 *   notes and chapters (names, aliases, descriptions, notes…). In a comic:
 *   pages (title, plot, every panel's description and lettering, tags) and issues.
 */
import type { Project } from "./types";
import { readingOrder } from "./model";
import { comicReadingOrder, pageNumber } from "./comic";
import {
  blockTextWithPositions,
  foldText,
  htmlToPlainText,
  type BlockLike,
} from "./mentions";

export type SearchKind = "scene" | "page" | "character" | "place" | "note" | "chapter" | "issue";

/** Display order of result groups. */
export const KIND_ORDER: SearchKind[] = [
  "scene",
  "page",
  "character",
  "place",
  "note",
  "chapter",
  "issue",
];

export const KIND_LABEL: Record<SearchKind, string> = {
  scene: "Scenes",
  page: "Pages",
  character: "Characters",
  place: "Places",
  note: "Notes",
  chapter: "Chapters",
  issue: "Issues",
};

export type Snippet = { before: string; match: string; after: string };

export type SearchHit = {
  kind: SearchKind;
  /** Scene / character / place / note / chapter id. */
  id: string;
  title: string;
  subtitle: string;
  /** Which field the snippet comes from ("Text", "Synopsis", "Notes"…). */
  field: string;
  snippet: Snippet;
  /** Total occurrences of the search words in this item. */
  matches: number;
};

export type SearchResult = {
  /** Hits grouped in KIND_ORDER; at most `perKindLimit` per kind. */
  hits: SearchHit[];
  /** Real number of matching items per kind (before the cap). */
  counts: Record<SearchKind, number>;
  /** The parsed search words (use these to highlight inside the editor). */
  terms: string[];
};

const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 70;
const DEFAULT_PER_KIND_LIMIT = 40;

// ─── query ────────────────────────────────────────────────────

/** "red fox" "the north pasture" -> ["red", "fox", "the north pasture"]. */
export function parseQuery(query: string): string[] {
  const out = new Map<string, string>();
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    const raw = m[1] ?? (m[2] ?? "").replace(/^"+|"+$/g, "");
    const term = raw.trim().replace(/\s+/g, " ");
    if (!term) continue;
    const key = foldText(term).folded;
    if (key && !out.has(key)) out.set(key, term);
  }
  return [...out.values()];
}

// ─── scanning one field ───────────────────────────────────────

type Field = {
  label: string;
  text: string;
  /** True for the item's name/title: a hit there ranks higher. */
  isTitle?: boolean;
  /** Pre-folded form (cached for big scene texts). */
  folded?: { folded: string; map: number[] };
};

type FieldScan = {
  /** Occurrences per term. */
  counts: number[];
  /** Earliest match: indices into the folded text, and which term. */
  first: { start: number; end: number } | null;
};

function scanField(folded: string, foldedTerms: string[]): FieldScan {
  const counts = foldedTerms.map(() => 0);
  let first: FieldScan["first"] = null;
  foldedTerms.forEach((term, t) => {
    let from = 0;
    for (;;) {
      const idx = folded.indexOf(term, from);
      if (idx === -1) break;
      counts[t]++;
      if (!first || idx < first.start) first = { start: idx, end: idx + term.length };
      from = idx + Math.max(1, term.length);
    }
  });
  return { counts, first };
}

function makeSnippet(text: string, start: number, end: number): Snippet {
  const a = Math.max(0, start - SNIPPET_BEFORE);
  const b = Math.min(text.length, end + SNIPPET_AFTER);
  const tidy = (s: string) => s.replace(/\s+/g, " ");
  return {
    before: (a > 0 ? "…" : "") + tidy(text.slice(a, start)),
    match: tidy(text.slice(start, end)),
    after: tidy(text.slice(end, b)) + (b < text.length ? "…" : ""),
  };
}

// Scene text is the expensive part; cache its plain+folded form per scene.
const sceneTextCache = new Map<
  string,
  { content: string; text: string; folded: { folded: string; map: number[] } }
>();

export function clearSearchCache(): void {
  sceneTextCache.clear();
}

function sceneText(id: string, content: string) {
  const hit = sceneTextCache.get(id);
  if (hit && hit.content === content) return hit;
  const text = htmlToPlainText(content);
  const entry = { content, text, folded: foldText(text) };
  sceneTextCache.set(id, entry);
  return entry;
}

/** Evaluate one item: null if not every term occurs somewhere in it. */
function evaluate(
  fields: Field[],
  foldedTerms: string[]
): { field: Field; snippet: Snippet; matches: number; titleHit: boolean } | null {
  const totals = foldedTerms.map(() => 0);
  let best: { field: Field; distinct: number; scan: FieldScan; folded: Field["folded"] } | null =
    null;
  let titleHit = false;

  for (const field of fields) {
    if (!field.text) continue;
    const folded = field.folded ?? foldText(field.text);
    const scan = scanField(folded.folded, foldedTerms);
    scan.counts.forEach((c, i) => (totals[i] += c));
    const distinct = scan.counts.filter((c) => c > 0).length;
    if (distinct > 0 && field.isTitle) titleHit = true;
    if (distinct > 0 && (!best || distinct > best.distinct)) {
      best = { field, distinct, scan, folded };
    }
  }

  if (!best || totals.some((t) => t === 0) || !best.scan.first || !best.folded) {
    return null;
  }
  const { map } = best.folded;
  const start = map[best.scan.first.start];
  const end = map[best.scan.first.end];
  return {
    field: best.field,
    snippet: makeSnippet(best.field.text, start, end),
    matches: totals.reduce((a, b) => a + b, 0),
    titleHit,
  };
}

// ─── the search ───────────────────────────────────────────────

export function search(
  project: Project,
  query: string,
  perKindLimit: number = DEFAULT_PER_KIND_LIMIT
): SearchResult {
  const terms = parseQuery(query);
  const counts: Record<SearchKind, number> = {
    scene: 0, page: 0, character: 0, place: 0, note: 0, chapter: 0, issue: 0,
  };
  if (terms.length === 0) return { hits: [], counts, terms };

  const foldedTerms = terms.map((t) => foldText(t).folded);
  const byKind: Record<SearchKind, { hit: SearchHit; score: number }[]> = {
    scene: [], page: [], character: [], place: [], note: [], chapter: [], issue: [],
  };

  const consider = (
    kind: SearchKind,
    id: string,
    title: string,
    subtitle: string,
    fields: Field[]
  ) => {
    const r = evaluate(fields, foldedTerms);
    if (!r) return;
    counts[kind]++;
    byKind[kind].push({
      score: (r.titleHit ? 100 : 0) + Math.min(r.matches, 50),
      hit: {
        kind, id, title: title || "Untitled", subtitle,
        field: r.field.label, snippet: r.snippet, matches: r.matches,
      },
    });
  };

  const chapterTitle = new Map(project.chapters.map((c, i) => [c.id, `Ch ${i + 1} · ${c.title}`]));

  for (const s of readingOrder(project)) {
    const cached = sceneText(s.id, s.content);
    consider("scene", s.id, s.title, chapterTitle.get(s.chapter_id) ?? "", [
      { label: "Title", text: s.title, isTitle: true },
      { label: "Synopsis", text: s.summary },
      { label: "Text", text: cached.text, folded: cached.folded },
      { label: "Tags", text: s.tags.join(", ") },
    ]);
  }
  // Comic pages: plot, then each panel (its description and its lettering), then tags.
  const issues = project.issues ?? [];
  const issueIndex = new Map(issues.map((i, n) => [i.id, n + 1]));
  const names = new Map(project.characters.map((c) => [c.id, c.name]));
  for (const pg of comicReadingOrder({ issues, pages: project.pages ?? [] })) {
    const panelFields: Field[] = pg.panels.map((pn, k) => ({
      label: `Panel ${k + 1}`,
      text: [
        pn.description,
        ...pn.lines.map((ln) => {
          const who = ln.kind === "sfx" ? "SFX" : ln.kind === "caption" ? "Caption" : names.get(ln.speaker_id) ?? "";
          return [who, ln.text, ln.note].filter(Boolean).join(": ");
        }),
      ].filter(Boolean).join("\n"),
    }));
    consider("page", pg.id, pg.title || `Page ${pageNumber(pg)}`, `Issue ${issueIndex.get(pg.issue_id) ?? "?"} · Page ${pageNumber(pg)}`, [
      { label: "Title", text: pg.title, isTitle: true },
      { label: "Plot", text: pg.plot },
      ...panelFields,
      { label: "Tags", text: pg.tags.join(", ") },
    ]);
  }
  for (const c of project.characters) {
    consider("character", c.id, c.name, [c.role, c.category].filter(Boolean).join(" · "), [
      { label: "Name", text: c.name, isTitle: true },
      { label: "Aliases", text: (c.aliases ?? []).join(", "), isTitle: true },
      { label: "Role", text: c.role },
      { label: "Description", text: c.description },
      { label: "Traits", text: c.traits.join(", ") },
      { label: "Notes", text: c.notes },
    ]);
  }
  for (const p of project.places) {
    consider("place", p.id, p.name, p.location, [
      { label: "Name", text: p.name, isTitle: true },
      { label: "Aliases", text: (p.aliases ?? []).join(", "), isTitle: true },
      { label: "Location", text: p.location },
      { label: "Description", text: p.description },
      { label: "Notes", text: p.notes },
    ]);
  }
  for (const n of project.notes) {
    consider("note", n.id, n.title, n.tags.join(", "), [
      { label: "Title", text: n.title, isTitle: true },
      { label: "Text", text: n.content },
      { label: "Tags", text: n.tags.join(", ") },
    ]);
  }
  project.chapters.forEach((c, i) => {
    consider("chapter", c.id, c.title, `Chapter ${i + 1}`, [
      { label: "Title", text: c.title, isTitle: true },
      { label: "Summary", text: c.summary },
    ]);
  });

  issues.forEach((c, i) => {
    consider("issue", c.id, c.title, `Issue ${i + 1}`, [
      { label: "Title", text: c.title, isTitle: true },
      { label: "Summary", text: c.summary },
    ]);
  });

  const hits: SearchHit[] = [];
  for (const kind of KIND_ORDER) {
    // Stable sort: equal scores keep reading / list order.
    const sorted = [...byKind[kind]].sort((a, b) => b.score - a.score);
    for (const { hit } of sorted.slice(0, perKindLimit)) hits.push(hit);
  }
  return { hits, counts, terms };
}

// ─── in-editor highlighting ───────────────────────────────────

/** Non-overlapping [start, end) ranges (original offsets) where any term occurs in `text`. */
export function findTermRanges(
  text: string,
  terms: string[]
): { start: number; end: number }[] {
  if (!text || terms.length === 0) return [];
  const { folded, map } = foldText(text);
  const taken = new Uint8Array(folded.length);
  const out: { start: number; end: number }[] = [];

  // Longest terms first so a phrase claims its words before a single word can.
  const foldedTerms = terms
    .map((t) => foldText(t).folded)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const term of foldedTerms) {
    let from = 0;
    for (;;) {
      const idx = folded.indexOf(term, from);
      if (idx === -1) break;
      const end = idx + term.length;
      from = idx + 1;
      let overlaps = false;
      for (let i = idx; i < end; i++) {
        if (taken[i]) { overlaps = true; break; }
      }
      if (overlaps) continue;
      taken.fill(1, idx, end);
      out.push({ start: map[idx], end: map[end] });
      from = end;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Search-term ranges inside one editor text block, as document positions. */
export function termRangesInBlock(
  block: BlockLike,
  blockPos: number,
  terms: string[]
): { from: number; to: number }[] {
  const { text, posOf } = blockTextWithPositions(block, blockPos);
  return findTermRanges(text, terms).map((r) => ({
    from: posOf[r.start],
    to: posOf[r.end - 1] + 1,
  }));
}
