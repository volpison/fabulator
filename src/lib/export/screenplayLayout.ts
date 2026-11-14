/**
 * Screenplay page layout in a monospace grid (12 pt Courier, 10 characters an inch): 55 lines a
 * page, columns counted from the left margin. Pure, so it is tested without rendering anything.
 */
import { LINES_PER_PAGE } from "../screenplay";
import type { DocElement, ScriptDoc } from "./screenplayDoc";

export const ACTION_WIDTH = 60;
export const DIALOGUE = { indent: 10, width: 35 };
export const PAREN = { indent: 16, width: 25 };
export const NAME_INDENT = 22;

export type Item = { text: string; col: number; row: number };
export type Page = { items: Item[] };
type Line = { text: string; col: number; num?: number };

/** Word-wrap to a width (a longer word is cut); newlines are kept, an empty line stays an empty line. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (let w of words) {
      while (w.length > width) {
        if (line) { out.push(line); line = ""; }
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= width) line += " " + w;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

type Block = {
  kind: "slug" | "action" | "dialogue" | "transition";
  lines: Line[];
  /** Dialogue: lines that stay with the first words (name, parenthetical). */
  fixed: number;
  name?: string;
  contd?: boolean;
};

const nameLine = (name: string, contd: boolean) => `${name}${contd ? " (CONT'D)" : ""}`;

function blocksOf(doc: ScriptDoc, numbers: boolean): Block[] {
  const blocks: Block[] = [];
  for (const sc of doc.scenes) {
    if (sc.slug) {
      const lines = wrap(sc.slug, ACTION_WIDTH).map((t, i): Line => ({ text: t, col: 0, num: i === 0 && numbers ? sc.number : undefined }));
      blocks.push({ kind: "slug", lines, fixed: 0 });
    }
    for (const e of sc.elements) blocks.push(elementBlock(e));
  }
  return blocks;
}

function elementBlock(e: DocElement): Block {
  if (e.kind === "action") return { kind: "action", lines: wrap(e.text, ACTION_WIDTH).map((t) => ({ text: t, col: 0 })), fixed: 0 };
  if (e.kind === "transition") return { kind: "transition", lines: [{ text: e.text, col: Math.max(0, ACTION_WIDTH - e.text.length) }], fixed: 0 };
  const lines: Line[] = [{ text: nameLine(e.name, e.contd), col: NAME_INDENT }];
  if (e.parenthetical) for (const t of wrap(`(${e.parenthetical})`, PAREN.width)) lines.push({ text: t, col: PAREN.indent });
  const fixed = lines.length;
  for (const t of wrap(e.text, DIALOGUE.width)) lines.push({ text: t, col: DIALOGUE.indent });
  return { kind: "dialogue", lines, fixed, name: e.name, contd: e.contd };
}

/** Place the blocks on pages: slug lines never end a page, dialogue and action split with (MORE) / (CONT'D). */
export function paginate(doc: ScriptDoc, sceneNumbersOn = false): Page[] {
  const queue = blocksOf(doc, sceneNumbersOn);
  const pages: Line[][] = [[]];
  const cur = () => pages[pages.length - 1];
  const newPage = () => pages.push([]);
  const push = (lines: Line[], blank: boolean) => {
    if (blank && cur().length) cur().push({ text: "", col: 0 });
    cur().push(...lines);
  };

  while (queue.length) {
    const b = queue.shift()!;
    const blank = cur().length ? 1 : 0;
    const need = blank + b.lines.length;
    const next = queue[0];
    const keep = b.kind === "slug" ? need + 1 + Math.min(2, next?.lines.length ?? 0) : need;
    if (cur().length + keep <= LINES_PER_PAGE) { push(b.lines, true); continue; }

    // Try to split it: at least two lines stay here and two go on.
    const body = b.lines.length - b.fixed;
    const more = b.kind === "dialogue" ? 1 : 0;
    const canSplit = (b.kind === "dialogue" || b.kind === "action") && body >= 4;
    let k = 0;
    if (canSplit) {
      for (let t = body - 2; t >= 2; t--) {
        if (cur().length + blank + b.fixed + t + more <= LINES_PER_PAGE) { k = t; break; }
      }
    }
    if (k > 0 && cur().length > 0) {
      push(b.lines.slice(0, b.fixed + k), true);
      if (more) cur().push({ text: "(MORE)", col: NAME_INDENT });
      newPage();
      queue.unshift(rest(b, k));
      continue;
    }
    if (cur().length === 0) {
      // Taller than a page: cut it where the page ends.
      const room = LINES_PER_PAGE - more;
      push(b.lines.slice(0, room), false);
      if (more) cur().push({ text: "(MORE)", col: NAME_INDENT });
      newPage();
      queue.unshift(rest(b, room - b.fixed));
      continue;
    }
    newPage();
    queue.unshift(b);
  }

  return pages
    .filter((p) => p.length)
    .map((lines, pi) => {
      const items: Item[] = [];
      lines.forEach((l, row) => {
        if (!l.text) return;
        items.push({ text: l.text, col: l.col, row });
        if (l.num !== undefined) {
          const n = String(l.num);
          items.push({ text: n, col: -(n.length + 2), row }, { text: n, col: ACTION_WIDTH + 2, row });
        }
      });
      if (pi > 0) {
        const n = `${pi + 1}.`;
        items.push({ text: n, col: ACTION_WIDTH - n.length, row: -2 });
      }
      return { items };
    });
}

/** What follows after a split: the rest of the body (dialogue picks up with NAME (CONT'D)). */
function rest(b: Block, taken: number): Block {
  const tail = b.lines.slice(b.fixed + taken);
  if (b.kind === "dialogue") {
    const lines: Line[] = [{ text: nameLine(b.name ?? "", true), col: NAME_INDENT }, ...tail];
    return { ...b, lines, fixed: 1, contd: true };
  }
  return { ...b, lines: tail, fixed: 0 };
}

/** Title page lines, centred in the 60-column text area. */
export function titlePage(doc: ScriptDoc): Item[] {
  const centre = (t: string) => ({ text: t, col: Math.max(0, Math.floor((ACTION_WIDTH - t.length) / 2)) });
  const out: Item[] = [];
  let row = 20;
  for (const t of wrap((doc.title || "Untitled").toUpperCase(), ACTION_WIDTH)) out.push({ ...centre(t), row: row++ });
  if (doc.author) {
    row += 2;
    out.push({ ...centre("written by"), row: row++ });
    row += 1;
    out.push({ ...centre(doc.author), row: row++ });
  }
  return out;
}
