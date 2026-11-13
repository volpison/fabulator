import type { Book } from "./book";
import { ORNAMENT, escapeXml } from "./book";
import type { Block, Run } from "./html";
import { makeZip } from "./zip";

function runsHtml(runs: Run[]): string {
  return runs
    .map((r) => {
      if ("br" in r) return "<br/>";
      let t = escapeXml(r.text);
      if (r.strike) t = `<s>${t}</s>`;
      if (r.italic) t = `<em>${t}</em>`;
      if (r.bold) t = `<strong>${t}</strong>`;
      return t;
    })
    .join("");
}

function blocksHtml(blocks: Block[]): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const b of blocks) {
    if (b.type === "li") {
      const want = b.ordered ? "ol" : "ul";
      if (list !== want) { closeList(); out.push(`<${want}>`); list = want; }
      out.push(`<li>${runsHtml(b.runs)}</li>`);
      continue;
    }
    closeList();
    if (b.type === "hr") out.push(`<hr/>`);
    else if (b.type === "h") out.push(`<h${b.level + 1}>${runsHtml(b.runs)}</h${b.level + 1}>`);
    else if (b.type === "quote") out.push(`<blockquote><p>${runsHtml(b.runs)}</p></blockquote>`);
    else out.push(`<p>${runsHtml(b.runs)}</p>`);
  }
  closeList();
  return out.join("\n");
}

const page = (lang: string, title: string, inner: string, extraNs = "") =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"${extraNs} lang="${lang}" xml:lang="${lang}"><head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${inner}</body></html>`;

const CSS = `body{font-family:serif;line-height:1.5;margin:5%}
h1,h2{text-align:center;font-weight:bold}
h1.book{margin-top:30%}
p{margin:0;text-indent:1.4em;text-align:justify}
h1+p,h2+p,h3+p,p.first,hr+p,p.break+p{text-indent:0}
p.break{text-align:center;text-indent:0;margin:1.2em 0}
p.by{text-align:center;text-indent:0;font-style:italic}
blockquote{margin:1em 2em;font-style:italic}
hr{border:0;margin:1.5em 0}
`;

export function renderEpub(book: Book, now: Date = new Date()): Uint8Array {
  const o = book.options;
  const lang = escapeXml(book.language);
  const modified = now.toISOString().replace(/\.\d+Z$/, "Z");

  const chapters = book.chapters.map((ch, i) => {
    const heading = ch.title || `Chapter ${ch.number}`;
    const parts: string[] = [];
    if (o.chapterHeadings) parts.push(`<h2>${escapeXml(heading)}</h2>`);
    ch.scenes.forEach((sc, j) => {
      if (o.sceneTitles && sc.title) parts.push(`<h3>${escapeXml(sc.title)}</h3>`);
      else if (j > 0 && o.sceneBreak === "ornament") parts.push(`<p class="break">${ORNAMENT}</p>`);
      else if (j > 0 && o.sceneBreak === "blank") parts.push(`<p class="break">&#160;</p>`);
      parts.push(blocksHtml(sc.blocks));
    });
    return { file: `chapter${i + 1}.xhtml`, id: `ch${i + 1}`, heading, html: page(lang, heading, parts.join("\n")) };
  });

  const titleHtml = page(
    lang, book.title,
    `<h1 class="book">${escapeXml(book.title)}</h1>${book.author ? `<p class="by">${escapeXml(book.author)}</p>` : ""}`
  );
  const nav = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"><head><meta charset="utf-8"/><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${chapters.map((c) => `<li><a href="${c.file}">${escapeXml(c.heading)}</a></li>`).join("")}</ol></nav></body></html>`;

  const uid = `urn:fabulator:${book.id}`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${escapeXml(uid)}</dc:identifier><dc:title>${escapeXml(book.title)}</dc:title><dc:language>${lang}</dc:language>${book.author ? `<dc:creator>${escapeXml(book.author)}</dc:creator>` : ""}<meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/><item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>${chapters.map((c) => `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`).join("")}</manifest><spine toc="ncx"><itemref idref="title"/>${chapters.map((c) => `<itemref idref="${c.id}"/>`).join("")}</spine></package>`;

  const ncx = `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${escapeXml(uid)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>${escapeXml(book.title)}</text></docTitle><navMap>${chapters.map((c, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(c.heading)}</text></navLabel><content src="${c.file}"/></navPoint>`).join("")}</navMap></ncx>`;

  return makeZip(
    [
      { name: "mimetype", data: "application/epub+zip" }, // must be first, stored
      { name: "META-INF/container.xml", data: `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>` },
      { name: "OEBPS/content.opf", data: opf },
      { name: "OEBPS/nav.xhtml", data: nav },
      { name: "OEBPS/toc.ncx", data: ncx },
      { name: "OEBPS/style.css", data: book.layout === "script" ? CSS + "\np{text-indent:0;text-align:left;margin:0 0 .6em}\n" : CSS },
      { name: "OEBPS/title.xhtml", data: titleHtml },
      ...chapters.map((c) => ({ name: `OEBPS/${c.file}`, data: c.html })),
    ],
    now
  );
}
