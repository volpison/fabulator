import type { Book } from "./book";
import { ORNAMENT } from "./book";
import { runsToText } from "./html";

export function renderText(book: Book): string {
  const o = book.options;
  const out: string[] = [book.title.toUpperCase()];
  if (book.author) out.push(`by ${book.author}`);
  book.chapters.forEach((ch) => {
    if (o.chapterHeadings) out.push(ch.title || `Chapter ${ch.number}`);
    ch.scenes.forEach((sc, i) => {
      if (o.sceneTitles && sc.title) out.push(sc.title);
      else if (i > 0 && o.sceneBreak === "ornament") out.push(ORNAMENT);
      for (const b of sc.blocks) {
        if (b.type === "hr") out.push(ORNAMENT);
        else if (b.type === "li") out.push(`${b.ordered ? `${b.index}.` : "-"} ${runsToText(b.runs)}`);
        else out.push(runsToText(b.runs));
      }
    });
  });
  return out.join("\n\n") + "\n";
}
