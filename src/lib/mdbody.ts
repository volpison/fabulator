/**
 * Scene text <-> Markdown, for the "project as a folder" format.
 *
 * Covers exactly what the editor can produce: paragraphs, headings (## ###),
 * bullet/numbered lists, quotes, rules, line breaks, bold/italic/strike.
 * Written so that  html -> markdown -> html  keeps the same blocks (the HTML
 * is normalised: empty paragraphs and unsupported formatting do not survive).
 *
 * Use *asterisks* for emphasis; underscores are plain text, so snake_case
 * and filenames need no escaping when you edit the files by hand.
 */
import { htmlToBlocks, type Block, type Run, type TextRun } from "./export/html";

// ─── Blocks -> Markdown ────────────────────────────────────

const esc = (s: string) => s.replace(/([\\`*_\[\]<>])/g, "\\$1").replace(/~~/g, "\\~\\~");

/** Stop a line's first characters being read as block syntax. */
const guardLine = (s: string) => s.replace(/^(#{1,6}\s|[-+]\s|\d+[.)]\s|---+$)/, (m) => "\\" + m);

function inline(runs: Run[]): string {
  let out = "";
  for (const r of runs) {
    if ("br" in r) {
      out += "  \n";
      continue;
    }
    const m = r.text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    if (!m[2]) {
      out += r.text;
      continue;
    }
    let core = esc(m[2]);
    if (r.strike) core = `~~${core}~~`;
    if (r.italic) core = `*${core}*`;
    if (r.bold) core = `**${core}**`;
    out += m[1] + core + m[3];
  }
  return out;
}

export function blocksToMd(blocks: Block[]): string {
  const chunks: string[] = [];
  let list: string[] | null = null;
  let listOrdered = false;

  const closeList = () => {
    if (list) chunks.push(list.join("\n"));
    list = null;
  };

  for (const b of blocks) {
    if (b.type === "li") {
      if (list && listOrdered !== b.ordered) closeList();
      if (!list) {
        list = [];
        listOrdered = b.ordered;
      }
      const marker = b.ordered ? `${b.index}.` : "-";
      list.push(`${marker} ${inline(b.runs).replace(/\n/g, "\n" + " ".repeat(marker.length + 1))}`);
      continue;
    }
    closeList();
    switch (b.type) {
      case "hr":
        chunks.push("---");
        break;
      case "h":
        chunks.push(`${"#".repeat(b.level)} ${inline(b.runs)}`);
        break;
      case "quote":
        chunks.push(`> ${inline(b.runs).replace(/\n/g, "\n> ")}`);
        break;
      default:
        chunks.push(inline(b.runs).split("\n").map(guardLine).join("\n"));
    }
  }
  closeList();
  return chunks.join("\n\n");
}

export const htmlToMd = (html: string) => blocksToMd(htmlToBlocks(html));

// ─── Markdown -> runs ──────────────────────────────────────

const sameFormat = (a: TextRun, b: TextRun) =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.strike === !!b.strike;

export function parseInline(text: string): Run[] {
  const runs: Run[] = [];
  let buf = "";
  let bold = false, italic = false, strike = false;

  const flush = () => {
    if (!buf) return;
    const run: TextRun = { text: buf };
    if (bold) run.bold = true;
    if (italic) run.italic = true;
    if (strike) run.strike = true;
    const last = runs[runs.length - 1];
    if (last && "text" in last && sameFormat(last, run)) last.text += buf;
    else runs.push(run);
    buf = "";
  };
  const pushBreak = () => {
    buf = buf.replace(/ +$/, "");
    flush();
    runs.push({ br: true });
  };

  const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];

    if (c === "\\" && next !== undefined) {
      if (next === "\n") {
        pushBreak();
        i += 2;
        continue;
      }
      if (/[^\sA-Za-z]/.test(next)) {
        buf += next;
        i += 2;
        continue;
      }
    }

    if (c === "\n") {
      if (/ {2,}$/.test(buf)) pushBreak();
      else buf += " ";
      i++;
      continue;
    }

    // A marker opens only before a non-space and closes only after one.
    const canToggle = (on: boolean, len: number) =>
      on ? !isSpace(text[i - 1]) : !isSpace(text[i + len]);

    if (c === "*" && next === "*" && canToggle(bold, 2)) {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    if (c === "~" && next === "~" && canToggle(strike, 2)) {
      flush();
      strike = !strike;
      i += 2;
      continue;
    }
    if (c === "*" && canToggle(italic, 1)) {
      flush();
      italic = !italic;
      i++;
      continue;
    }

    buf += c;
    i++;
  }
  flush();
  return runs;
}

// ─── Markdown -> blocks ────────────────────────────────────

const HR = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*)$/;
const QUOTE = /^ {0,3}>[ ]?/;
const ITEM = /^ *([-+*]|\d{1,9}[.)])[ \t]+(.*)$/;

const hasText = (runs: Run[]) => runs.some((r) => "text" in r && r.text.trim() !== "");

function trimRuns(runs: Run[]): Run[] {
  const first = runs[0];
  if (first && "text" in first) first.text = first.text.replace(/^\s+/, "");
  const last = runs[runs.length - 1];
  if (last && "text" in last) last.text = last.text.replace(/\s+$/, "");
  return runs;
}

export function mdToBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const startsBlock = (l: string) => HR.test(l) || HEADING.test(l) || QUOTE.test(l) || ITEM.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      const runs = trimRuns(parseInline(h[2]));
      if (hasText(runs)) blocks.push({ type: "h", level: h[1].length <= 2 ? 2 : 3, runs });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) parts.push(lines[i++].replace(QUOTE, ""));
      const runs = trimRuns(parseInline(parts.join("\n")));
      if (hasText(runs)) blocks.push({ type: "quote", runs });
      continue;
    }
    const first = ITEM.exec(line);
    if (first) {
      const ordered = /\d/.test(first[1]);
      let index = 0;
      while (i < lines.length) {
        const m = ITEM.exec(lines[i]);
        if (!m || /\d/.test(m[1]) !== ordered) break;
        const parts = [m[2]];
        i++;
        // Continuation lines: indented text that is not itself a new item.
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !ITEM.test(lines[i])) parts.push(lines[i++].trim());
        const runs = trimRuns(parseInline(parts.join("\n")));
        if (hasText(runs)) blocks.push({ type: "li", ordered, index: ++index, runs });
        // A blank line between items keeps the same list going.
        let j = i;
        while (j < lines.length && lines[j].trim() === "") j++;
        if (j > i && j < lines.length && ITEM.test(lines[j])) i = j;
      }
      continue;
    }
    // Paragraph: until a blank line or the start of another block.
    const parts = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) parts.push(lines[i++]);
    const runs = trimRuns(parseInline(parts.join("\n")));
    if (hasText(runs)) blocks.push({ type: "p", runs });
  }
  return blocks;
}

// ─── Blocks -> HTML (what the editor stores) ───────────────

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function runsToHtml(runs: Run[]): string {
  return runs
    .map((r) => {
      if ("br" in r) return "<br>";
      let h = escHtml(r.text);
      if (r.strike) h = `<s>${h}</s>`;
      if (r.italic) h = `<em>${h}</em>`;
      if (r.bold) h = `<strong>${h}</strong>`;
      return h;
    })
    .join("");
}

export function blocksToHtml(blocks: Block[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === "li") {
      const tag = b.ordered ? "ol" : "ul";
      const items: string[] = [];
      while (i < blocks.length) {
        const x = blocks[i];
        if (x.type !== "li" || x.ordered !== b.ordered) break;
        items.push(`<li><p>${runsToHtml(x.runs)}</p></li>`);
        i++;
      }
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }
    i++;
    if (b.type === "hr") out.push("<hr>");
    else if (b.type === "h") out.push(`<h${b.level}>${runsToHtml(b.runs)}</h${b.level}>`);
    else if (b.type === "quote") out.push(`<blockquote><p>${runsToHtml(b.runs)}</p></blockquote>`);
    else out.push(`<p>${runsToHtml(b.runs)}</p>`);
  }
  return out.join("");
}

export const mdToHtml = (md: string) => blocksToHtml(mdToBlocks(md));
