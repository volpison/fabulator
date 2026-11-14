/** Turns a screenplay project into the plain script every screenplay writer (PDF, Word, Fountain) consumes. */
import type { Project, ScriptScene } from "../types";
import { needsContd, screenplayReadingOrder, sceneNumbers, slugLine } from "../screenplay";
import type { ExportOptions } from "./book";

export type DocElement = {
  kind: "action" | "dialogue" | "transition";
  /** Action text, spoken words or the transition. */
  text: string;
  /** Dialogue: "MARIA (V.O.)" in capitals, without CONT'D. */
  name: string;
  /** Dialogue: derived "(CONT'D)" (same speaker again after an action line). */
  contd: boolean;
  /** Dialogue: direction between name and words, without brackets. */
  parenthetical: string;
};
export type DocScene = { number: number; slug: string; elements: DocElement[] };
export type ScriptDoc = { title: string; author: string; language: string; acts: number; scenes: DocScene[] };

/** The scenes the options ask for: everything, the act of the selected scene, or just that scene. */
export function scriptScenesFor(project: Project, options: ExportOptions): ScriptScene[] {
  const all = screenplayReadingOrder(project);
  const one = all.find((s) => s.id === options.sceneId);
  if (!one || options.scope === "all") return all;
  return options.scope === "scene" ? [one] : all.filter((s) => s.act_id === one.act_id);
}

const hasContent = (sc: ScriptScene) =>
  !!slugLine(sc) || sc.elements.some((e) => e.kind !== "note" && (e.text.trim() || e.kind === "dialogue"));

export function buildScript(project: Project, options: ExportOptions): ScriptDoc {
  const numbers = sceneNumbers(project);
  const chars = new Map(project.characters.map((c) => [c.id, c.name.trim()]));
  const scenes: DocScene[] = [];
  for (const sc of scriptScenesFor(project, options)) {
    if (!hasContent(sc)) continue;
    const elements: DocElement[] = [];
    sc.elements.forEach((e, i) => {
      if (e.kind === "note") return;
      const text = e.text.trim();
      if (e.kind === "dialogue") {
        if (!text && !e.parenthetical.trim()) return;
        const who = (chars.get(e.speaker_id) || "UNKNOWN").toUpperCase();
        const ext = e.extension.trim().toUpperCase();
        elements.push({ kind: "dialogue", text, name: ext ? `${who} (${ext})` : who, contd: needsContd(sc.elements, i), parenthetical: e.parenthetical.trim().replace(/^\(|\)$/g, "") });
      } else if (text) {
        elements.push({ kind: e.kind, text: e.kind === "transition" ? text.toUpperCase() : text, name: "", contd: false, parenthetical: "" });
      }
    });
    scenes.push({ number: numbers.get(sc.id) ?? scenes.length + 1, slug: slugLine(sc), elements });
  }
  return {
    title: project.title.trim(),
    author: options.author.trim(),
    language: options.language || "en",
    acts: new Set(scriptScenesFor(project, options).filter(hasContent).map((s) => s.act_id)).size,
    scenes,
  };
}
