/**
 * The thumbnail sheet: a printable page for the artist. Every page of the comic is a blank frame
 * (2:3, like a comic page) laid out the way a reader sees it (page 1 alone on the right, then
 * spreads 2–3, 4–5, …), with the layout note, the plot (or, when there is none, the panel
 * descriptions), who is on the page and where. Self-contained HTML: open it in a browser and
 * print it or "Save as PDF". No dialogue.
 *
 * Pure (no Svelte, no Tauri).
 */
import type { ComicPage, Project } from "../types";
import { isAfterPageTurn, pageNumber, pagesInIssue, spreadOf } from "../comic";
import { escapeXml } from "./book";
import type { ExportOptions } from "./book";
import { comicPagesFor, issueHeading } from "./comic";

const esc = escapeXml;
const lines = (s: string) => esc(s.trim()).replace(/\r?\n/g, "<br>");

function card(pg: ComicPage, chars: Map<string, string>, places: Map<string, string>): string {
  const n = pageNumber(pg);
  const cast = pg.character_ids.map((id) => chars.get(id)).filter((x): x is string => !!x);
  const where = pg.place_ids.map((id) => places.get(id)).filter((x): x is string => !!x);
  const descriptions = pg.panels.map((pn) => pn.description.trim()).filter(Boolean);
  const notes: string[] = [];
  if (pg.plot.trim()) notes.push(`<p>${lines(pg.plot)}</p>`);
  else if (descriptions.length) notes.push(`<ol>${descriptions.map((d) => `<li>${lines(d)}</li>`).join("")}</ol>`);
  const facts: string[] = [];
  if (pg.layout.trim()) facts.push(`<b>Layout:</b> ${esc(pg.layout.trim())}`);
  if (pg.panels.length) facts.push(`<b>Panels:</b> ${pg.panels.length}`);
  if (cast.length) facts.push(`<b>Characters:</b> ${esc(cast.join(", "))}`);
  if (where.length) facts.push(`<b>Places:</b> ${esc(where.join(", "))}`);
  return `<figure class="page ${n % 2 === 1 ? "right" : "left"}">
<div class="frame"><span class="no">${n}</span>${isAfterPageTurn(n) ? '<span class="turn">page turn</span>' : ""}</div>
<figcaption>${pg.title.trim() ? `<h3>${esc(pg.title.trim())}</h3>` : ""}${notes.join("")}${facts.length ? `<p class="facts">${facts.join("<br>")}</p>` : ""}</figcaption>
</figure>`;
}

const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0 auto;max-width:860px;padding:24px;background:#fff;color:#222;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
h1{margin:0 0 4px;font-size:24px}
.by{margin:0 0 4px;color:#555}
.hint{margin:0 0 24px;color:#777;font-size:12px}
h2{margin:32px 0 12px;font-size:18px;border-bottom:2px solid #222;padding-bottom:4px}
.spread{display:flex;gap:16px;margin:0 0 24px;break-inside:avoid;page-break-inside:avoid}
.spread.alone-right{justify-content:flex-end}
.page{flex:0 0 calc(50% - 8px);max-width:calc(50% - 8px);margin:0}
.frame{position:relative;aspect-ratio:2/3;border:2px solid #222;background:#fff}
.no{position:absolute;left:8px;top:4px;font-size:34px;font-weight:700;color:#d4d4d4}
.turn{position:absolute;right:8px;top:8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border:1px solid #888;border-radius:4px;padding:1px 6px;color:#666}
figcaption{padding:8px 2px 0;font-size:12.5px}
figcaption h3{margin:0 0 4px;font-size:14px}
figcaption p{margin:0 0 6px}
figcaption ol{margin:0 0 6px;padding-left:18px}
.facts{color:#555}
@media print{body{padding:0}.hint{display:none}h2{break-after:avoid}}
@page{margin:12mm}
`;

/** The whole sheet as an HTML document. `scope`/`sceneId` pick all pages, one issue or one page. */
export function renderThumbnailSheet(project: Project, options: ExportOptions): string {
  const chars = new Map(project.characters.map((c) => [c.id, c.name]));
  const places = new Map(project.places.map((p) => [p.id, p.name]));
  const chosen = comicPagesFor(project, options);
  const inScope = new Set(chosen.map((p) => p.id));
  const lang = esc(options.language || "en");
  const title = project.title || "Untitled";

  const sections: string[] = [];
  project.issues.forEach((issue, i) => {
    const all = pagesInIssue(project.pages, issue.id);
    if (!all.some((p) => inScope.has(p.id))) return;
    const rows: string[] = [];
    all.forEach((_pg, idx) => {
      const n = idx + 1;
      const numbers = spreadOf(n, all.length);
      if (numbers[0] !== n) return;
      const pages = numbers.map((k) => all[k - 1]).filter((p) => inScope.has(p.id));
      if (pages.length === 0) return;
      // A lone right-hand page (page 1) sits on the right, where a reader sees it.
      const aloneRight = pages.length === 1 && pageNumber(pages[0]) % 2 === 1;
      rows.push(`<div class="spread${aloneRight ? " alone-right" : ""}">${pages.map((p) => card(p, chars, places)).join("")}</div>`);
    });
    sections.push(`<section><h2>${esc(issueHeading(i, issue.title))}</h2>${rows.join("")}</section>`);
  });

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — thumbnail sheet</title><style>${CSS}</style></head>
<body>
<h1>${esc(title)}</h1>
${options.author.trim() ? `<p class="by">by ${esc(options.author.trim())}</p>` : ""}
<p class="hint">Thumbnail sheet. Print it (or save as PDF) from your browser; each frame is a page to sketch.</p>
${sections.join("\n")}
</body></html>
`;
}
