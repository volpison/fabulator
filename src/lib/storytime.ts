/**
 * Story-time: when a scene happens inside the story (as opposed to where it
 * sits in the book). Pure helpers: no Svelte, no Tauri.
 *
 * A scene's `when` is free text. Two styles are understood and sorted:
 *   - dates:  2026-11-10, 2026-11-10 14:30, 10/11/2026 (day first), "1342-05-02 evening"
 *   - days:   Day 3, Day 3 evening, Day 3 14:30, D3, Dia 3 manhã
 * Anything else is kept as a label but cannot be placed on the chronology.
 * Both styles are turned into minutes so they can be compared and measured.
 */
import type { Project, Scene } from "./types";
import { readingOrder } from "./model";

export type WhenKind = "date" | "day";
export type ParsedWhen = { kind: WhenKind; minutes: number };

const DAY = 1440;

const TIME_WORDS: Record<string, number> = {
  midnight: 0, meianoite: 0, "meia-noite": 0,
  dawn: 5 * 60, madrugada: 5 * 60,
  morning: 9 * 60, manha: 9 * 60,
  noon: 12 * 60, midday: 12 * 60, meiodia: 12 * 60, "meio-dia": 12 * 60,
  afternoon: 15 * 60, tarde: 15 * 60,
  evening: 19 * 60, noite: 21 * 60,
  night: 22 * 60,
};

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The time of day in a trailing part ("evening", "14:30", "2pm"), in minutes, or null. */
function timeOfDay(rest: string): number | null {
  const t = fold(rest).replace(/^[\s,·\-–—@]+|[\s,]+$/g, "");
  if (!t) return 0;
  const hm = /^(\d{1,2})[:h](\d{2})?\s*(am|pm)?$/.exec(t);
  if (hm) {
    let h = Number(hm[1]);
    const m = Number(hm[2] ?? 0);
    if (hm[3] === "pm" && h < 12) h += 12;
    if (hm[3] === "am" && h === 12) h = 0;
    return h <= 23 && m <= 59 ? h * 60 + m : null;
  }
  const ap = /^(\d{1,2})\s*(am|pm)$/.exec(t);
  if (ap) {
    let h = Number(ap[1]);
    if (h < 1 || h > 12) return null;
    if (ap[2] === "pm" && h < 12) h += 12;
    if (ap[2] === "am" && h === 12) h = 0;
    return h * 60;
  }
  return t in TIME_WORDS ? TIME_WORDS[t] : null;
}

function utcMinutes(y: number, mo: number, d: number): number | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d); // setUTCFullYear keeps years 0-99 as they are
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // Feb 31 etc.
  return Math.round(dt.getTime() / 60000);
}

/** Understand a scene's `when` text, or null (empty / free-form label). */
export function parseWhen(text: string): ParsedWhen | null {
  const t = (text ?? "").trim();
  if (!t) return null;

  const iso = /^(-?\d{1,6})-(\d{1,2})-(\d{1,2})(?:[\sT,]+(.*))?$/.exec(t);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{3,6})(?:[\s,]+(.*))?$/.exec(t);
  if (iso || dmy) {
    const [y, mo, d, rest] = iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3]), iso[4]]
      : [Number(dmy![3]), Number(dmy![2]), Number(dmy![1]), dmy![4]];
    const base = utcMinutes(y as number, mo as number, d as number);
    const tod = timeOfDay((rest as string | undefined) ?? "");
    return base === null || tod === null ? null : { kind: "date", minutes: base + tod };
  }

  const day = /^(?:day|dia|d)\s*(\d{1,5})(?:[\s,·\-–—@]+(.*))?$/i.exec(t);
  if (day) {
    const tod = timeOfDay(day[2] ?? "");
    return tod === null ? null : { kind: "day", minutes: Number(day[1]) * DAY + tod };
  }
  return null;
}

/** "+3 days", "+5 h", "same moment"… the distance between two story moments. */
export function formatGap(fromMin: number, toMin: number): string {
  const diff = Math.abs(toMin - fromMin);
  if (diff === 0) return "same moment";
  if (diff < 60) return `+${diff} min`;
  if (diff < DAY) {
    const h = Math.round(diff / 60);
    return `+${h} h`;
  }
  const d = Math.floor(diff / DAY);
  if (d < 60) return `+${d} day${d === 1 ? "" : "s"}`;
  const months = Math.round(d / 30.44);
  if (months < 24) return `+${months} months`;
  return `+${Math.round(d / 365.25)} years`;
}

export type ChronoRow = {
  scene: Scene;
  /** Position in the book (1-based, reading order). */
  position: number;
  minutes: number;
  /** Story time goes backwards compared with the previous placed scene in the book (a flashback or a shuffle). */
  backward: boolean;
  /** Distance from the previous row in story-time order (null for the first). */
  gap: string | null;
};

export type Chronology = {
  /** Which style the rows use: the one most scenes use (ties: "day"). */
  kind: WhenKind | null;
  rows: ChronoRow[];
  /** Scenes with no usable time (empty, free-form, or the other style). */
  unplaced: { scene: Scene; position: number; reason: "empty" | "unreadable" | "other-style" }[];
};

export function chronology(project: Pick<Project, "chapters" | "scenes">): Chronology {
  const ordered = readingOrder(project).map((scene, i) => ({ scene, position: i + 1, parsed: parseWhen(scene.when) }));
  const dates = ordered.filter((x) => x.parsed?.kind === "date").length;
  const days = ordered.filter((x) => x.parsed?.kind === "day").length;
  const kind: WhenKind | null = dates === 0 && days === 0 ? null : dates > days ? "date" : "day";

  const placed = ordered.filter((x) => x.parsed && x.parsed.kind === kind);
  const unplaced: Chronology["unplaced"] = ordered
    .filter((x) => !(x.parsed && x.parsed.kind === kind))
    .map((x) => ({
      scene: x.scene,
      position: x.position,
      reason: !x.scene.when.trim() ? "empty" : x.parsed ? "other-style" : "unreadable",
    }));

  // "backward" is judged in book order…
  const backward = new Set<string>();
  let prev: number | null = null;
  for (const x of placed) {
    if (prev !== null && x.parsed!.minutes < prev) backward.add(x.scene.id);
    prev = x.parsed!.minutes;
  }
  // …rows are listed in story order (ties keep book order).
  const sorted = placed.slice().sort((a, b) => a.parsed!.minutes - b.parsed!.minutes || a.position - b.position);
  const rows: ChronoRow[] = sorted.map((x, i) => ({
    scene: x.scene,
    position: x.position,
    minutes: x.parsed!.minutes,
    backward: backward.has(x.scene.id),
    gap: i === 0 ? null : formatGap(sorted[i - 1].parsed!.minutes, x.parsed!.minutes),
  }));
  return { kind, rows, unplaced };
}
