/**
 * Screenplay reports: the lists a production asks for, worked out from the script. Pure and tested.
 * - Scenes: number, slug, length, words, who speaks.
 * - Characters: scenes they are in, lines and words of dialogue.
 * - Locations: where the script goes and how much of it happens there.
 */
import type { Project } from "./types";
import { formatPages, scenePages, sceneNumbers, screenplayReadingOrder, slugLine, wordsIn } from "./screenplay";

export type SceneRow = { id: string; number: number; act: string; slug: string; pages: number; words: number; speakers: string[]; status: string };
export type CharacterRow = {
  id: string;
  name: string;
  /** Scene numbers where the character speaks or is listed on the scene. */
  scenes: number[];
  /** Scenes where they actually speak. */
  speaking: number;
  lines: number;
  words: number;
};
export type LocationRow = { location: string; int_ext: string[]; times: string[]; scenes: number[]; pages: number };

const actName = (p: Pick<Project, "acts">, id: string) => {
  const i = p.acts.findIndex((a) => a.id === id);
  return i === -1 ? "" : p.acts[i].title || `Act ${i + 1}`;
};

export function sceneReport(p: Project): SceneRow[] {
  const nums = sceneNumbers(p);
  const names = new Map(p.characters.map((c) => [c.id, c.name]));
  return screenplayReadingOrder(p).map((sc) => {
    const speakers = [...new Set(sc.elements.filter((e) => e.kind === "dialogue" && e.speaker_id).map((e) => names.get(e.speaker_id) ?? ""))].filter(Boolean);
    return {
      id: sc.id,
      number: nums.get(sc.id) ?? 0,
      act: actName(p, sc.act_id),
      slug: slugLine(sc) || sc.title || "(no slug line)",
      pages: scenePages(sc),
      words: sc.elements.reduce((n, e) => (e.kind === "note" ? n : n + wordsIn(e.text)), 0),
      speakers,
      status: sc.status,
    };
  });
}

/** Most dialogue first; characters who only appear on a scene's cast list come after. */
export function characterReport(p: Project): CharacterRow[] {
  const nums = sceneNumbers(p);
  const rows = new Map<string, CharacterRow>();
  const row = (id: string): CharacterRow | null => {
    const c = p.characters.find((x) => x.id === id);
    if (!c) return null;
    let r = rows.get(id);
    if (!r) rows.set(id, (r = { id, name: c.name, scenes: [], speaking: 0, lines: 0, words: 0 }));
    return r;
  };
  for (const sc of screenplayReadingOrder(p)) {
    const n = nums.get(sc.id) ?? 0;
    const spoke = new Set<string>();
    for (const id of sc.character_ids) row(id)?.scenes.push(n);
    for (const e of sc.elements) {
      if (e.kind !== "dialogue" || !e.speaker_id) continue;
      const r = row(e.speaker_id);
      if (!r) continue;
      if (!r.scenes.includes(n)) r.scenes.push(n);
      r.lines++;
      r.words += wordsIn(e.text);
      spoke.add(e.speaker_id);
    }
    for (const id of spoke) rows.get(id)!.speaking++;
  }
  return [...rows.values()]
    .map((r) => ({ ...r, scenes: [...new Set(r.scenes)].sort((a, b) => a - b) }))
    .sort((a, b) => b.words - a.words || b.scenes.length - a.scenes.length || a.name.localeCompare(b.name));
}

/** Locations are grouped by name (capitals, spaces ignored); scenes without a location are left out. */
export function locationReport(p: Project): LocationRow[] {
  const nums = sceneNumbers(p);
  const rows = new Map<string, LocationRow>();
  for (const sc of screenplayReadingOrder(p)) {
    const name = sc.location.trim().replace(/\s+/g, " ").toUpperCase();
    if (!name) continue;
    const r = rows.get(name) ?? { location: name, int_ext: [], times: [], scenes: [], pages: 0 };
    rows.set(name, r);
    if (sc.int_ext && !r.int_ext.includes(sc.int_ext)) r.int_ext.push(sc.int_ext);
    const t = sc.time.trim().toUpperCase();
    if (t && !r.times.includes(t)) r.times.push(t);
    r.scenes.push(nums.get(sc.id) ?? 0);
    r.pages += scenePages(sc);
  }
  return [...rows.values()].sort((a, b) => b.pages - a.pages || a.location.localeCompare(b.location));
}

// ─── CSV (opens in Excel, Numbers, Sheets) ───

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export type ReportKind = "scenes" | "characters" | "locations";

export function reportCsv(p: Project, kind: ReportKind): string {
  if (kind === "scenes")
    return csv([["Scene", "Act", "Slug line", "Pages", "Words", "Speaking characters", "Status"], ...sceneReport(p).map((r) => [r.number, r.act, r.slug, formatPages(r.pages), r.words, r.speakers.join("; "), r.status])]);
  if (kind === "characters")
    return csv([["Character", "Scenes", "Scenes speaking", "Lines", "Words", "Scene numbers"], ...characterReport(p).map((r) => [r.name, r.scenes.length, r.speaking, r.lines, r.words, r.scenes.join(" ")])]);
  return csv([["Location", "INT/EXT", "Times of day", "Scenes", "Pages", "Scene numbers"], ...locationReport(p).map((r) => [r.location, r.int_ext.join("/"), r.times.join("; "), r.scenes.length, formatPages(r.pages), r.scenes.join(" ")])]);
}
