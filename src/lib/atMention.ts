/**
 * Pure logic for the "@" picker in the editor: when to open it, which
 * characters/places to offer, and when to offer creating a new one.
 */
import { foldText, type Entity, type EntityType } from "./mentions";

/** Longest query (in characters) the picker follows before it gives up. */
export const MAX_QUERY_LENGTH = 40;
/** At most this many existing matches are listed. */
export const MAX_MATCHES = 6;

export type AtQuery = {
  /** What was typed after the "@" (may contain spaces, e.g. "little red"). */
  query: string;
  /** Offset of the "@" inside the text that was searched. */
  start: number;
};

/**
 * Is the cursor right after "@something"? `textBefore` is the text of the
 * current block up to the cursor. The "@" must start a word (so e-mail
 * addresses like ana@site.com do not open it), the query may have up to
 * three words, and a second "@" or a newline ends it.
 */
export function findAtQuery(textBefore: string): AtQuery | null {
  const at = textBefore.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/[\s(\[{“"'‘’—–-]/u.test(textBefore[at - 1])) return null;
  const query = textBefore.slice(at + 1);
  if (query.length > MAX_QUERY_LENGTH || /[\n@]/.test(query)) return null;
  if (query.split(/\s+/).filter(Boolean).length > 3) return null;
  if (/\s{2,}/.test(query) || /[.!?;:]\s*$/.test(query)) return null; // a sentence went on
  return { query, start: at };
}

export type PickOption =
  | { kind: "existing"; type: EntityType; id: string; name: string; via: string | null }
  | { kind: "new"; type: EntityType; name: string };

const fold = (s: string) => foldText(s).folded.trim();

/** 0 = best. Name beats alias; start of the text beats start of a word beats anywhere. */
function score(q: string, e: Entity): { rank: number; via: string | null } | null {
  let best: { rank: number; via: string | null } | null = null;
  e.terms.forEach((term, i) => {
    const t = fold(term);
    let rank = -1;
    if (t.startsWith(q)) rank = 0;
    else if (t.split(" ").some((w) => w.startsWith(q))) rank = 2;
    else if (t.includes(q)) rank = 4;
    if (rank < 0) return;
    const isName = fold(e.name) === t || i === 0;
    const r = rank + (isName ? 0 : 1);
    if (!best || r < best.rank) best = { rank: r, via: isName ? null : term };
  });
  return best;
}

/** Existing matches first, then "create new" options when nothing has exactly that name. */
export function buildOptions(rawQuery: string, entities: Entity[]): PickOption[] {
  const q = fold(rawQuery);
  const options: PickOption[] = [];

  const scored = entities
    .map((e) => ({ e, s: q ? score(q, e) : { rank: 0, via: null } }))
    .filter((x): x is { e: Entity; s: { rank: number; via: string | null } } => x.s !== null)
    .sort((a, b) => a.s.rank - b.s.rank || (a.e.type === b.e.type ? 0 : a.e.type === "character" ? -1 : 1));

  for (const { e, s } of scored.slice(0, MAX_MATCHES)) {
    options.push({ kind: "existing", type: e.type, id: e.id, name: e.name, via: s.via });
  }

  const name = rawQuery.trim();
  const exact = entities.some((e) => e.terms.some((t) => fold(t) === q));
  if (name.length >= 2 && !/\s$/.test(rawQuery) && !exact) {
    options.push({ kind: "new", type: "character", name });
    options.push({ kind: "new", type: "place", name });
  }
  return options;
}

/** A name for a new character/place: trimmed, capitalised first letter. */
export function tidyNewName(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}
