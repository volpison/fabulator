import type { Book } from "./book";
import { ORNAMENT, escapeXml } from "./book";
import type { Block, Run } from "./html";
import { makeZip } from "./zip";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function runsXml(runs: Run[]): string {
  return runs
    .map((r) => {
      if ("br" in r) return "<w:r><w:br/></w:r>";
      const rpr = (r.bold ? "<w:b/>" : "") + (r.italic ? "<w:i/>" : "") + (r.strike ? "<w:strike/>" : "");
      return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(r.text)}</w:t></w:r>`;
    })
    .join("");
}

const para = (style: string | null, inner: string, extra = "") =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr>${inner}</w:p>`;
const plain = (t: string) => `<w:r><w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r>`;

export function renderDocx(book: Book, now: Date = new Date()): Uint8Array {
  const o = book.options;
  const body: string[] = [];

  // Title page
  body.push(para("Title", plain(book.title)));
  if (book.author) body.push(para("Subtitle", plain(`by ${book.author}`)));

  let first = true; // first chapter starts after the title page
  let afterBreak = true; // next body paragraph is a "first paragraph" (no indent)

  book.chapters.forEach((ch) => {
    if (o.chapterHeadings) {
      body.push(para("Heading1", plain(ch.title || `Chapter ${ch.number}`), "<w:pageBreakBefore/>"));
    } else if (first) {
      body.push(para(null, "", "<w:pageBreakBefore/>"));
    }
    first = false;
    afterBreak = true;

    ch.scenes.forEach((sc, i) => {
      if (o.sceneTitles && sc.title) {
        body.push(para("Heading2", plain(sc.title)));
        afterBreak = true;
      } else if (i > 0 && o.sceneBreak === "ornament") {
        body.push(para("SceneBreak", plain(ORNAMENT)));
        afterBreak = true;
      } else if (i > 0 && o.sceneBreak === "blank") {
        body.push(para("SceneBreak", ""));
        afterBreak = true;
      }
      for (const b of sc.blocks) {
        body.push(blockXml(b, afterBreak));
        afterBreak = b.type !== "p";
      }
    });
  });

  const [pw, ph] = o.pageSize === "letter" ? [12240, 15840] : [11906, 16838];
  const sect = `<w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W}><w:body>${body.join("")}${sect}</w:body></w:document>`;

  const lang = escapeXml(book.language);
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="${lang}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLine="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="FirstParagraph"><w:name w:val="First Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLine="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="4000" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="FirstParagraph"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="2400" w:after="480"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="FirstParagraph"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="240"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="FirstParagraph"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="SceneBreak"><w:name w:val="Scene Break"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:right="720" w:firstLine="0"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:hanging="360" w:firstLine="0"/></w:pPr></w:style>
</w:styles>`;

  const stamp = now.toISOString().replace(/\.\d+Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(book.title)}</dc:title><dc:creator>${escapeXml(book.author || "Fabulator")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified></cp:coreProperties>`;

  return makeZip(
    [
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "word/document.xml", data: document },
      { name: "word/styles.xml", data: styles },
      { name: "docProps/core.xml", data: core },
    ],
    now
  );
}

function blockXml(b: Block, afterBreak: boolean): string {
  switch (b.type) {
    case "hr": return para("SceneBreak", plain(ORNAMENT));
    case "h": return para(b.level === 2 ? "Heading2" : "Heading3", runsXml(b.runs));
    case "quote": return para("Quote", runsXml(b.runs));
    case "li":
      return para("ListParagraph", plain(b.ordered ? `${b.index}.\t` : "•\t") + runsXml(b.runs));
    default: return para(afterBreak ? "FirstParagraph" : null, runsXml(b.runs));
  }
}
