import type { Book } from "./book";
import { ORNAMENT } from "./book";
import type { Block, Run } from "./html";

const esc = (s: string) =>
  s.replace(/([\\`*_\[\]<>])/g, "\\$1").replace(/~~/g, "\\~\\~");

function inline(runs: Run[]): string {
  let out = "";
  for (const r of runs) {
    if ("br" in r) { out += "  \n"; continue; }
    const m = r.text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    if (!m[2]) { out += r.text; continue; }
    let core = esc(m[2]);
    if (r.strike) core = `~~${core}~~`;
    if (r.italic) core = `*${core}*`;
    if (r.bold) core = `**${core}**`;
    out += m[1] + core + m[3];
  }
  return out;
}

/** Stop a paragraph's first characters being read as block syntax. */
const guardStart = (s: string) =>
  s.replace(/^(#{1,6}\s|[-+]\s|\d+[.)]\s|---+$)/, (m) => "\\" + m);

export function renderMarkdown(book: Book): string {
  const o = book.options;
  const out: string[] = [`# ${esc(book.title)}`];
  if (book.author) out.push(`*${esc(book.author)}*`);

  book.chapters.forEach((ch) => {
    if (o.chapterHeadings) out.push(`## ${esc(ch.title || `Chapter ${ch.number}`)}`);
    ch.scenes.forEach((sc, i) => {
      if (o.sceneTitles && sc.title) out.push(`### ${esc(sc.title)}`);
      else if (i > 0 && o.sceneBreak === "ornament") out.push(ORNAMENT);
      else if (i > 0 && o.sceneBreak === "blank") out.push("&nbsp;");
      for (const b of sc.blocks) out.push(block(b));
    });
  });
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

function block(b: Block): string {
  switch (b.type) {
    case "hr": return "---";
    case "h": return `${"#".repeat(b.level + 1)} ${inline(b.runs)}`;
    case "quote": return `> ${inline(b.runs).replace(/\n/g, "\n> ")}`;
    case "li": return `${b.ordered ? `${b.index}.` : "-"} ${inline(b.runs).replace(/\n/g, "\n   ")}`;
    default: return guardStart(inline(b.runs));
  }
}
