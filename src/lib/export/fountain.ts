/** Fountain (fountain.io): the plain-text screenplay format that Final Draft, Highland, Fade In and others read. */
import type { ScriptDoc } from "./screenplayDoc";

const SPECIAL = /^[.!@~=#>(\[*_]/;
const isLoudLine = (l: string) => l === l.toUpperCase() && /\p{L}/u.test(l);

export function renderFountain(doc: ScriptDoc, opts: { titlePage: boolean; numbers: boolean }): string {
  const out: string[] = [];
  if (opts.titlePage && (doc.title || doc.author)) {
    if (doc.title) out.push(`Title: ${doc.title.replace(/\s+/g, " ")}`);
    if (doc.author) out.push(`Author: ${doc.author.replace(/\s+/g, " ")}`);
    out.push("");
    out.push("===");
    out.push("");
  }
  for (const sc of doc.scenes) {
    if (sc.slug) {
      const real = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i.test(sc.slug);
      out.push("", `${real ? "" : "."}${sc.slug}${opts.numbers ? ` #${sc.number}#` : ""}`, "");
    }
    for (const e of sc.elements) {
      if (e.kind === "action") {
        const lines = e.text.split(/\r?\n/).map((l) => (l.trim() && (SPECIAL.test(l.trim()) || isLoudLine(l.trim())) ? `!${l}` : l));
        out.push(...lines, "");
      } else if (e.kind === "transition") {
        out.push(`> ${e.text}`, "");
      } else {
        out.push(/\p{L}/u.test(e.name) ? e.name : `@${e.name}`);
        if (e.parenthetical) out.push(`(${e.parenthetical})`);
        if (e.text) out.push(...e.text.split(/\r?\n/).map((l) => (l.trim() ? l : "  ")));
        out.push("");
      }
    }
  }
  return out.join("\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
}
