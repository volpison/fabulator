/**
 * Finding character / place names (and their aliases) in prose.
 *
 * Pure functions, no Svelte/Tauri, so they are unit-tested (npm test).
 *
 * Matching rules:
 *  - whole words only, using Unicode letters/digits as word characters
 *    (so "Ana" does not match inside "Anão" or "Joana", and "José" works);
 *  - case-insensitive and accent-insensitive ("Jose" matches "José" and
 *    vice versa), curly apostrophes match straight ones;
 *  - longest name first, so "The Shepherd Boy" claims its text before the
 *    alias "Boy" can.
 */
import type { Project, Scene } from "./types";

export type EntityType = "character" | "place";

export type Entity = {
  type: EntityType;
  id: string;
  /** Display name. */
  name: string;
  /** Everything that counts as a mention: the name plus its aliases. */
  terms: string[];
};

export type Mention = {
  type: EntityType;
  id: string;
  name: string;
  /** UTF-16 offsets into the text that was searched: text.slice(start, end). */
  start: number;
  end: number;
};

export type MentionSuggestion = {
  type: EntityType;
  id: string;
  name: string;
};

const MIN_TERM_LENGTH = 2;

/** Characters + places as searchable entities (name and aliases, de-duplicated). */
export function entitiesOf(
  project: Pick<Project, "characters" | "places">
): Entity[] {
  const build = (
    type: EntityType,
    e: { id: string; name: string; aliases?: string[] }
  ): Entity => {
    const seen = new Set<string>();
    const terms: string[] = [];
    for (const raw of [e.name, ...(e.aliases ?? [])]) {
      const term = (raw ?? "").trim();
      if (term.length < MIN_TERM_LENGTH) continue;
      const key = foldText(term).folded;
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push(term);
    }
    return { type, id: e.id, name: e.name, terms };
  };

  return [
    ...project.characters.map((c) => build("character", c)),
    ...project.places.map((p) => build("place", p)),
  ].filter((e) => e.terms.length > 0);
}

/**
 * Lower-case, strip accents, unify apostrophes and whitespace. `map[i]` is
 * the original UTF-16 index that folded unit `i` came from (with one extra
 * entry at the end for the text length), so matches can be mapped back.
 */
export function foldText(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  let original = 0;
  for (const ch of text) {
    let f: string;
    if (/\s/u.test(ch)) {
      f = " ";
    } else if (ch === "’" || ch === "‘" || ch === "`") {
      f = "'";
    } else {
      f = ch.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    }
    for (let k = 0; k < f.length; k++) map.push(original);
    folded += f;
    original += ch.length;
  }
  map.push(text.length);
  return { folded, map };
}

const isWordChar = /[\p{L}\p{N}]/u;

/**
 * All mentions of the given entities in `text`, non-overlapping, sorted by
 * position. Offsets refer to the original `text`.
 */
export function findMentionsInText(text: string, entities: Entity[]): Mention[] {
  if (!text || entities.length === 0) return [];

  const { folded, map } = foldText(text);

  type Candidate = { term: string; entity: Entity };
  const candidates: Candidate[] = [];
  for (const entity of entities) {
    for (const t of entity.terms) {
      const term = foldText(t.trim()).folded;
      if (term.length >= MIN_TERM_LENGTH) candidates.push({ term, entity });
    }
  }
  // Longest first (stable: earlier entities win ties).
  candidates.sort((a, b) => b.term.length - a.term.length);

  const taken = new Uint8Array(folded.length);
  const found: Mention[] = [];

  for (const { term, entity } of candidates) {
    let from = 0;
    while (from <= folded.length - term.length) {
      const idx = folded.indexOf(term, from);
      if (idx === -1) break;
      const end = idx + term.length;
      from = idx + 1;

      // Whole-word check on code points (handles astral characters too).
      const before = folded.slice(Math.max(0, idx - 2), idx);
      const after = folded.slice(end, end + 2);
      if (before && isWordChar.test(Array.from(before).pop() as string)) continue;
      if (after && isWordChar.test(Array.from(after)[0])) continue;

      let overlaps = false;
      for (let i = idx; i < end; i++) {
        if (taken[i]) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      taken.fill(1, idx, end);
      found.push({
        type: entity.type,
        id: entity.id,
        name: entity.name,
        start: map[idx],
        end: map[end],
      });
      from = end;
    }
  }

  return found.sort((a, b) => a.start - b.start);
}

/** Strip scene HTML to plain text (inline tags vanish, block tags become newlines). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|blockquote|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(apos|#39);/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

/**
 * Characters/places named in the scene text but not yet linked to the scene
 * (one suggestion per entity).
 */
export function findUnlinkedMentions(
  contentHtml: string,
  scene: Scene,
  project: Project
): MentionSuggestion[] {
  const text = htmlToPlainText(contentHtml);
  if (!text) return [];

  const seen = new Set<string>();
  const out: MentionSuggestion[] = [];
  for (const m of findMentionsInText(text, entitiesOf(project))) {
    const linked =
      m.type === "character"
        ? scene.character_ids.includes(m.id)
        : scene.place_ids.includes(m.id);
    const key = `${m.type}:${m.id}`;
    if (linked || seen.has(key)) continue;
    seen.add(key);
    out.push({ type: m.type, id: m.id, name: m.name });
  }
  return out;
}

// ─── Editor support (structural types so this stays testable without ProseMirror) ───

/** What the hover card shows for a mention. */
export type MentionInfo = {
  title: string;
  subtitle?: string;
  body?: string;
  chips?: string[];
  aka?: string[];
};

type InlineLike = { isText: boolean; text?: string | null };
/** The part of a ProseMirror text block we need. */
export type BlockLike = {
  forEach(cb: (child: InlineLike, offset: number) => void): void;
};

export type MentionRange = { from: number; to: number; mention: Mention };

/**
 * The plain text of one text block plus the document position of every
 * UTF-16 unit of it. `blockPos` is the position of the block node itself
 * (its content starts at blockPos + 1). Non-text inline nodes (e.g. hard
 * breaks) count as one newline so positions stay exact.
 */
export function blockTextWithPositions(
  block: BlockLike,
  blockPos: number
): { text: string; posOf: number[] } {
  let text = "";
  const posOf: number[] = [];
  block.forEach((child, offset) => {
    const start = blockPos + 1 + offset;
    if (child.isText && child.text) {
      for (let i = 0; i < child.text.length; i++) posOf.push(start + i);
      text += child.text;
    } else {
      posOf.push(start);
      text += "\n";
    }
  });
  return { text, posOf };
}

/** Mentions inside one text block as document ranges (see blockTextWithPositions). */
export function mentionRangesInBlock(
  block: BlockLike,
  blockPos: number,
  entities: Entity[]
): MentionRange[] {
  const { text, posOf } = blockTextWithPositions(block, blockPos);
  return findMentionsInText(text, entities).map((m) => ({
    from: posOf[m.start],
    to: posOf[m.end - 1] + 1,
    mention: m,
  }));
}
