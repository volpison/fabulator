/**
 * Scene HTML -> a small block model every exporter understands.
 *
 * Handles what the editor produces (paragraphs, headings, lists, quotes,
 * bold/italic/strike, line breaks, rules) and legacy plain-text scenes
 * (paragraphs separated by blank lines). Pure; no DOM needed.
 */

export type TextRun = { text: string; bold?: boolean; italic?: boolean; strike?: boolean };
export type BreakRun = { br: true };
export type Run = TextRun | BreakRun;

export type Block =
  | { type: "p"; runs: Run[] }
  | { type: "h"; level: 2 | 3; runs: Run[] }
  | { type: "li"; ordered: boolean; index: number; runs: Run[] }
  | { type: "quote"; runs: Run[] }
  | { type: "hr" };

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Does it contain HTML tags (vs. a legacy plain-text scene)? Same test as the editor uses. */
export const looksLikeHtml = (raw: string) => /<[a-z][\s\S]*>/i.test(raw);

const sameFormat = (a: TextRun, b: TextRun) =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.strike === !!b.strike;

/** Add a run, merging with the previous one when the formatting is identical. */
function pushRun(runs: Run[], run: Run) {
  const last = runs[runs.length - 1];
  if ("text" in run) {
    if (!run.text) return;
    if (last && "text" in last && sameFormat(last, run)) {
      last.text += run.text;
      return;
    }
    runs.push({ ...run });
  } else {
    runs.push(run);
  }
}

const hasText = (runs: Run[]) => runs.some((r) => "text" in r && r.text.trim() !== "");

function plainTextBlocks(raw: string): Block[] {
  return raw
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => {
      const runs: Run[] = [];
      para.split("\n").forEach((line, i) => {
        if (i > 0) pushRun(runs, { br: true });
        pushRun(runs, { text: line.trim() });
      });
      return { type: "p", runs } as Block;
    });
}

export function htmlToBlocks(raw: string): Block[] {
  if (!raw || raw.trim() === "") return [];
  if (!looksLikeHtml(raw)) return plainTextBlocks(raw);

  const blocks: Block[] = [];
  const lists: { ordered: boolean; count: number }[] = [];
  let quoteDepth = 0;
  let bold = 0, italic = 0, strike = 0;

  type Open = { kind: "p" | "h2" | "h3" | "li" | "quote"; ordered?: boolean; index?: number };
  let open: Open | null = null;
  let runs: Run[] = [];

  const flush = () => {
    if (!open) return;
    if (hasText(runs)) {
      // Trim the visible ends of the paragraph (never touches inner spacing).
      const first = runs[0];
      if ("text" in first) first.text = first.text.replace(/^\s+/, "");
      const last = runs[runs.length - 1];
      if ("text" in last) last.text = last.text.replace(/\s+$/, "");
      if (open.kind === "li") {
        blocks.push({ type: "li", ordered: !!open.ordered, index: open.index ?? 1, runs });
      } else if (open.kind === "h2" || open.kind === "h3") {
        blocks.push({ type: "h", level: open.kind === "h2" ? 2 : 3, runs });
      } else if (open.kind === "quote") {
        blocks.push({ type: "quote", runs });
      } else {
        blocks.push({ type: "p", runs });
      }
    }
    open = null;
    runs = [];
  };

  const startBlock = (kind: Open["kind"]) => {
    flush();
    if (kind === "li") {
      const list = lists[lists.length - 1];
      const index = list ? ++list.count : 1;
      open = { kind, ordered: list?.ordered ?? false, index };
    } else {
      open = { kind };
    }
  };

  const addText = (text: string) => {
    if (!text) return;
    if (!open) {
      if (text.trim() === "") return; // whitespace between blocks
      open = { kind: quoteDepth > 0 ? "quote" : "p" };
    }
    const run: TextRun = { text };
    if (bold > 0) run.bold = true;
    if (italic > 0) run.italic = true;
    if (strike > 0) run.strike = true;
    pushRun(runs, run);
  };

  const tokens = raw.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>|([^<]+)|(<)/g);
  for (const m of tokens) {
    if (m[4] !== undefined) {
      addText(decodeEntities(m[4]));
      continue;
    }
    if (m[5] !== undefined) {
      addText("<"); // stray "<"
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();

    switch (tag) {
      case "p":
      case "div": {
        const inLi = open !== null && (open as Open).kind === "li";
        if (inLi) {
          // <li><p>…</p></li>: the paragraph belongs to the list item.
          if (!closing && runs.length > 0) pushRun(runs, { br: true });
        } else if (closing) flush();
        else startBlock(quoteDepth > 0 ? "quote" : "p");
        break;
      }
      case "h1":
      case "h2":
        if (closing) flush();
        else startBlock("h2");
        break;
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        if (closing) flush();
        else startBlock("h3");
        break;
      case "blockquote":
        flush();
        quoteDepth = Math.max(0, quoteDepth + (closing ? -1 : 1));
        break;
      case "ul":
      case "ol":
        flush();
        if (closing) lists.pop();
        else lists.push({ ordered: tag === "ol", count: 0 });
        break;
      case "li":
        if (closing) flush();
        else startBlock("li");
        break;
      case "pre":
        if (closing) flush();
        else startBlock("p");
        break;
      case "br":
        if (!open) startBlock(quoteDepth > 0 ? "quote" : "p");
        pushRun(runs, { br: true });
        break;
      case "hr":
        flush();
        blocks.push({ type: "hr" });
        break;
      case "strong":
      case "b":
        bold = Math.max(0, bold + (closing ? -1 : 1));
        break;
      case "em":
      case "i":
        italic = Math.max(0, italic + (closing ? -1 : 1));
        break;
      case "s":
      case "strike":
      case "del":
        strike = Math.max(0, strike + (closing ? -1 : 1));
        break;
      default:
        break; // span, code, a, … : keep their text, ignore the tag
    }
  }
  flush();
  return blocks;
}

/** All plain text of some runs (line breaks become "\n"). */
export function runsToText(runs: Run[]): string {
  return runs.map((r) => ("text" in r ? r.text : "\n")).join("");
}
