/** A tiny PDF writer for monospace pages (standard Courier, no fonts embedded). */
import type { Item, Page } from "./screenplayLayout";

const CP1252: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/** One PDF string literal in WinAnsi; characters it cannot show become "?". */
export function pdfString(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const b = CP1252[ch] ?? (cp >= 0x20 && cp <= 0xff && !(cp >= 0x7f && cp <= 0x9f) ? cp : 0x3f);
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += "\\" + String.fromCharCode(b);
    else if (b < 0x20 || b > 0x7e) out += "\\" + b.toString(8).padStart(3, "0");
    else out += String.fromCharCode(b);
  }
  return `(${out})`;
}

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const CHAR = 7.2; // 12 pt Courier
const ROW = 12;
const LEFT = 108; // 1.5 in
const TOP = 72;

export function renderPdf(pages: (Page | { items: Item[] })[], size: "a4" | "letter", title = ""): Uint8Array {
  const [w, h] = SIZES[size] ?? SIZES.a4;
  const objs: string[] = [];
  const add = (s: string) => objs.push(s) && objs.length;
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // pages, filled below
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const p of pages.length ? pages : [{ items: [] }]) {
    const ops = p.items
      .map((it) => `BT /F1 12 Tf ${(LEFT + it.col * CHAR).toFixed(2)} ${(h - TOP - 9 - it.row * ROW).toFixed(2)} Td ${pdfString(it.text)} Tj ET`)
      .join("\n");
    const content = add(`<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfString(title)} /Producer (Fabulator) >>`);

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every character is ASCII (strings are octal-escaped), so string index = byte offset.
  return new TextEncoder().encode(body);
}
