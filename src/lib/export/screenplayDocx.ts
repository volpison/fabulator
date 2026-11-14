/** Word (.docx) in standard screenplay format: Courier 12, 1.5" left margin, page numbers from page 2. */
import { escapeXml } from "./book";
import type { ScriptDoc } from "./screenplayDoc";
import { makeZip } from "./zip";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const COL = 144; // twips in one character of 12 pt Courier
const t = (s: string) => `<w:r><w:t xml:space="preserve">${escapeXml(s)}</w:t></w:r>`;
const p = (style: string, inner: string, extra = "") => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${inner}</w:p>`;
/** Text with line breaks kept (a Word line break, not a new paragraph). */
const lines = (s: string) => s.split(/\r?\n/).map(t).join("<w:r><w:br/></w:r>");

export function renderScreenplayDocx(
  doc: ScriptDoc,
  opts: { titlePage: boolean; numbers: boolean; pageSize: "a4" | "letter" },
  now: Date = new Date()
): Uint8Array {
  const [pw, ph] = opts.pageSize === "letter" ? [12240, 15840] : [11906, 16838];
  const mar = (left: number) => `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="${left}" w:header="720" w:footer="720" w:gutter="0"/>`;
  const body: string[] = [];

  if (opts.titlePage) {
    body.push(p("TitleName", t((doc.title || "Untitled").toUpperCase())));
    if (doc.author) {
      body.push(p("TitleBy", t("written by")));
      body.push(p("TitleAuthor", t(doc.author)));
    }
    // End of the title-page section: no header, so no page number.
    body.push(`<w:p><w:pPr><w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}"/>${mar(2160)}</w:sectPr></w:pPr></w:p>`);
  }
  for (const sc of doc.scenes) {
    if (sc.slug) body.push(p("SceneHeading", t(opts.numbers ? `${sc.number}.  ${sc.slug}` : sc.slug)));
    for (const e of sc.elements) {
      if (e.kind === "action") body.push(p("Action", lines(e.text)));
      else if (e.kind === "transition") body.push(p("Transition", t(e.text)));
      else {
        body.push(p("Character", t(`${e.name}${e.contd ? " (CONT'D)" : ""}`)));
        if (e.parenthetical) body.push(p("Parenthetical", t(`(${e.parenthetical})`)));
        if (e.text) body.push(p("Dialogue", lines(e.text)));
      }
    }
  }
  // Page 1 of the script has no number; the following pages carry "2." and so on.
  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:headerReference w:type="first" r:id="rId3"/><w:pgSz w:w="${pw}" w:h="${ph}"/>${mar(2160)}<w:pgNumType w:start="1"/><w:titlePg/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W} ${R}><w:body>${body.join("")}${sect}</w:body></w:document>`;

  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr ${W}><w:p><w:pPr><w:pStyle w:val="Header"/><w:jc w:val="right"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t>.</w:t></w:r></w:p></w:hdr>`;
  const headerFirst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr ${W}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr></w:p></w:hdr>`;

  const lang = escapeXml(doc.language);
  const style = (id: string, name: string, ppr: string, rpr = "") =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr>${ppr}</w:pPr>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}</w:style>`;
  const before = '<w:spacing w:before="240" w:after="0" w:line="240" w:lineRule="exact"/>';
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:eastAsia="Courier New" w:cs="Courier New"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="${lang}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="exact"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:widowControl/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/></w:style>
${style("SceneHeading", "Scene Heading", `<w:keepNext/>${before}`)}
${style("Action", "Action", before)}
${style("Character", "Character", `<w:keepNext/>${before}<w:ind w:left="${22 * COL}"/>`)}
${style("Parenthetical", "Parenthetical", `<w:keepNext/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/><w:ind w:left="${16 * COL}" w:right="${19 * COL}"/>`)}
${style("Dialogue", "Dialogue", `<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/><w:ind w:left="${10 * COL}" w:right="${15 * COL}"/>`)}
${style("Transition", "Transition", `${before}<w:jc w:val="right"/>`)}
${style("TitleName", "Title Name", '<w:spacing w:before="4800" w:after="240" w:line="240" w:lineRule="exact"/><w:jc w:val="center"/>')}
${style("TitleBy", "Title By", '<w:spacing w:before="480" w:after="240" w:line="240" w:lineRule="exact"/><w:jc w:val="center"/>')}
${style("TitleAuthor", "Title Author", '<w:jc w:val="center"/>')}
</w:styles>`;

  const stamp = now.toISOString().replace(/\.\d+Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(doc.title)}</dc:title><dc:creator>${escapeXml(doc.author || "Fabulator")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created></cp:coreProperties>`;

  const H = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return makeZip(
    [
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="${H}"/><Override PartName="/word/header2.xml" ContentType="${H}"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/header" Target="header1.xml"/><Relationship Id="rId3" Type="${REL}/header" Target="header2.xml"/></Relationships>` },
      { name: "word/document.xml", data: document },
      { name: "word/styles.xml", data: styles },
      { name: "word/header1.xml", data: header },
      { name: "word/header2.xml", data: headerFirst },
      { name: "docProps/core.xml", data: core },
    ],
    now
  );
}
