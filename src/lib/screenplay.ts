/**
 * Screenplay documents: slug lines, elements, cleaning, and the small helpers over acts, scenes
 * and elements. Pure (no Svelte, no Tauri). The views come in later steps; this is the data they
 * stand on.
 *
 * A scene is a slug line plus ordered elements. Dialogue is one element (speaker, optional
 * extension and parenthetical, words), so a character's lines can be found, counted and renamed
 * without parsing text. "(CONT'D)" and the page estimate are *derived*, never stored.
 */
import type { Act, ElementKind, Project, ScriptElement, ScriptScene, SlugPlace } from "./types";
import { cleanColor, cleanStatus } from "./labels";
import { cleanTodos } from "./scenenotes";

export const ELEMENT_KINDS = ["action", "dialogue", "transition", "note"] as const;
export const ELEMENT_LABEL: Record<ElementKind, string> = {
  action: "Action",
  dialogue: "Dialogue",
  transition: "Transition",
  note: "Note (private)",
};

export const SLUG_PLACES = ["INT", "EXT", "INT/EXT"] as const;
export const SLUG_PLACE_LABEL: Record<Exclude<SlugPlace, "">, string> = {
  INT: "INT.",
  EXT: "EXT.",
  "INT/EXT": "INT./EXT.",
};

/** Common ways a voice is heard, offered as suggestions (any text is allowed). */
export const EXTENSIONS = ["V.O.", "O.S.", "O.C.", "FILTERED"] as const;
/** Common times of day, offered as suggestions (any text is allowed). */
export const TIMES_OF_DAY = ["DAY", "NIGHT", "MORNING", "EVENING", "DAWN", "DUSK", "LATER", "CONTINUOUS", "MOMENTS LATER"] as const;
/** Common transitions, offered as suggestions (any text is allowed). */
export const TRANSITIONS = ["CUT TO:", "SMASH CUT TO:", "DISSOLVE TO:", "FADE OUT.", "FADE IN:", "MATCH CUT TO:"] as const;

// ─── Cleaning (used when a file is read; repairs small gaps instead of dropping things) ───

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const isObject = (x: unknown): x is Raw => typeof x === "object" && x !== null && !Array.isArray(x);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, fallback = ""): string => (typeof x === "string" ? x : fallback);
const strings = (x: unknown): string[] => arr(x).filter((v): v is string => typeof v === "string");

export const cleanSlugPlace = (x: unknown): SlugPlace =>
  (SLUG_PLACES as readonly string[]).includes(x as string) ? (x as SlugPlace) : "";

/** Acts with ids and titles, never two with the same id. */
export function cleanActs(list: unknown): Act[] {
  const seen = new Set<string>();
  const out: Act[] = [];
  arr(list).forEach((raw, i) => {
    if (!isObject(raw)) return;
    let id = str(raw.id) || `act-fixed-${i + 1}`;
    if (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    out.push({ ...raw, id, title: str(raw.title, `Act ${out.length + 1}`), summary: str(raw.summary) });
  });
  return out;
}

function cleanElements(list: unknown, ids: Set<string>): ScriptElement[] {
  const out: ScriptElement[] = [];
  arr(list).forEach((raw, i) => {
    if (!isObject(raw)) return;
    let id = str(raw.id) || `el-fixed-${out.length + 1}`;
    if (ids.has(id)) id = `${id}-${i + 1}`;
    ids.add(id);
    const kind = (ELEMENT_KINDS as readonly string[]).includes(raw.kind) ? (raw.kind as ElementKind) : "action";
    out.push({
      ...raw,
      id,
      kind,
      // Only dialogue has a speaker, an extension and a parenthetical.
      speaker_id: kind === "dialogue" ? str(raw.speaker_id) : "",
      extension: kind === "dialogue" ? str(raw.extension).trim() : "",
      parenthetical: kind === "dialogue" ? str(raw.parenthetical).trim().replace(/^\((.*)\)$/s, "$1") : "",
      text: str(raw.text),
    });
  });
  return out;
}

const hasWords = (el: ScriptElement[]) => el.some((e) => e.text.trim() !== "");

/**
 * Scenes that always point at a real act, with dense 0..n-1 orders inside each act, clean
 * elements (ids unique across the whole document) and the same shared fields as a novel's scene.
 * Returns [] when there is no act to live in (the caller creates one first).
 */
export function cleanScriptScenes(list: unknown, acts: Act[]): ScriptScene[] {
  const known = new Set(acts.map((a) => a.id));
  const ids = new Set<string>();
  const seen = new Set<string>();
  const scenes: ScriptScene[] = [];
  arr(list).forEach((raw, i) => {
    if (!isObject(raw) || acts.length === 0) return;
    let id = str(raw.id) || `ss-fixed-${i + 1}`;
    if (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    const elements = cleanElements(raw.elements, ids);
    scenes.push({
      ...raw,
      id,
      act_id: known.has(raw.act_id) ? raw.act_id : acts[0].id,
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : i,
      title: str(raw.title),
      int_ext: cleanSlugPlace(raw.int_ext),
      location: str(raw.location).trim(),
      time: str(raw.time).trim(),
      summary: str(raw.summary),
      elements,
      status: cleanStatus(raw.status, hasWords(elements) ? "draft" : "idea"),
      plotline_id: str(raw.plotline_id),
      character_ids: strings(raw.character_ids),
      place_ids: strings(raw.place_ids),
      tags: strings(raw.tags),
      color: cleanColor(raw.color),
      notes: str(raw.notes),
      todos: cleanTodos(raw.todos),
      when: str(raw.when),
    });
  });
  const byAct = new Map<string, ScriptScene[]>();
  for (const sc of scenes) byAct.set(sc.act_id, [...(byAct.get(sc.act_id) ?? []), sc]);
  for (const group of byAct.values()) [...group].sort((a, b) => a.order - b.order).forEach((sc, n) => (sc.order = n));
  return scenes;
}

// ─── Reading order ───

/** The scenes of one act, in order. */
export const scenesInAct = (scenes: ScriptScene[], actId: string): ScriptScene[] =>
  scenes.filter((s) => s.act_id === actId).sort((a, b) => a.order - b.order);

/** Every scene of the screenplay in reading order: act by act, scene by scene. */
export const screenplayReadingOrder = (p: Pick<Project, "acts" | "script_scenes">): ScriptScene[] =>
  p.acts.flatMap((a) => scenesInAct(p.script_scenes, a.id));

/** The number a scene has in the whole script (1-based; what a shooting script prints). */
export function sceneNumbers(p: Pick<Project, "acts" | "script_scenes">): Map<string, number> {
  return new Map(screenplayReadingOrder(p).map((s, i) => [s.id, i + 1]));
}

// ─── Slug lines ───

/** "INT. KITCHEN - DAY": the parts that are set, in capitals; "" when nothing is set. */
export function slugLine(sc: Pick<ScriptScene, "int_ext" | "location" | "time">): string {
  const where = [sc.int_ext ? SLUG_PLACE_LABEL[sc.int_ext] : "", sc.location.trim().toUpperCase()].filter(Boolean).join(" ");
  const time = sc.time.trim().toUpperCase();
  return [where, time].filter(Boolean).join(" - ");
}

/**
 * Read a typed slug line ("int. maria's car - night", "EXT./INT. HALL", "I/E KITCHEN - DAY") into
 * its parts. Anything that does not start with a recognised INT/EXT marker is taken as a location.
 */
export function parseSlug(text: string): Pick<ScriptScene, "int_ext" | "location" | "time"> {
  let rest = text.trim().replace(/\s+/g, " ");
  let int_ext: SlugPlace = "";
  const m = /^(int\.?\s*\/\s*ext\.?|ext\.?\s*\/\s*int\.?|i\s*\/\s*e\.?|int\.?|ext\.?)(?=\s|$)/i.exec(rest);
  if (m) {
    const tag = m[1].toLowerCase().replace(/[.\s]/g, "");
    int_ext = tag === "int" ? "INT" : tag === "ext" ? "EXT" : "INT/EXT";
    rest = rest.slice(m[0].length).trim();
  }
  // The time of day follows the last " - " (or an en/em dash).
  const cut = rest.search(/\s[-–—]\s(?!.*\s[-–—]\s)/);
  const location = (cut === -1 ? rest : rest.slice(0, cut)).trim();
  const time = cut === -1 ? "" : rest.slice(cut).replace(/^\s[-–—]\s/, "").trim();
  return { int_ext, location: location.toUpperCase(), time: time.toUpperCase() };
}

// ─── CONT'D ───

/**
 * Does this dialogue take "(CONT'D)"? Yes when the same character spoke earlier in the scene and
 * nobody else spoke in between (an action line between the two is the usual reason). A transition
 * ends the run. Derived on the fly; never stored.
 */
export function needsContd(elements: ScriptElement[], index: number): boolean {
  const here = elements[index];
  if (!here || here.kind !== "dialogue" || !here.speaker_id) return false;
  for (let i = index - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.kind === "transition") return false;
    if (e.kind !== "dialogue") continue; // action and private notes do not interrupt
    return e.speaker_id === here.speaker_id;
  }
  return false;
}

// ─── Counting and the page estimate ───

const WORD = /\p{N}+(?:[.,]\p{N}+)+|[\p{L}\p{N}]+(?:['’‐-][\p{L}\p{N}]+)*/gu;
export const wordsIn = (text: string): number => (text.trim() ? (text.match(WORD)?.length ?? 0) : 0);

/** Words a writer has written in a scene: action, dialogue and transitions (notes and the slug are not counted). */
export function sceneWordCount(sc: Pick<ScriptScene, "elements">): number {
  return sc.elements.reduce((n, e) => (e.kind === "note" ? n : n + wordsIn(e.text)), 0);
}

/**
 * Lines of a screenplay page (12 pt Courier, 1 inch margins): about 55 lines a page, an action
 * line holds about 60 characters, a dialogue line about 35. Blank lines between elements count.
 * This is the classic rule of thumb ("one page, about one minute"), good for planning, not for
 * timing a shoot.
 */
export const LINES_PER_PAGE = 55;
const ACTION_WIDTH = 60;
const DIALOGUE_WIDTH = 35;

function wrapLines(text: string, width: number): number {
  let n = 0;
  for (const para of text.split(/\r?\n/)) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) { n += 1; continue; }
    let line = 0;
    let rows = 1;
    for (const w of words) {
      const need = line === 0 ? w.length : w.length + 1;
      if (line + need > width && line > 0) { rows++; line = w.length; } else line += need;
    }
    n += rows;
  }
  return n;
}

/** Lines one scene takes on the page: the slug, then each element with the blank line before it. */
export function sceneLines(sc: Pick<ScriptScene, "int_ext" | "location" | "time" | "elements">): number {
  let lines = slugLine(sc) ? 2 : 0; // slug + a blank line after
  for (const e of sc.elements) {
    if (e.kind === "note" || (e.kind !== "dialogue" && !e.text.trim())) continue;
    if (e.kind === "action") lines += wrapLines(e.text.trim(), ACTION_WIDTH) + 1;
    else if (e.kind === "transition") lines += 2;
    else {
      lines += 1 /* name */ + (e.parenthetical.trim() ? 1 : 0) + (e.text.trim() ? wrapLines(e.text.trim(), DIALOGUE_WIDTH) : 0) + 1;
    }
  }
  return lines;
}

/** Pages for a number of lines, in eighths ("1 3/8 pages" is how scripts are counted). */
export const pagesFromLines = (lines: number): number => Math.ceil((lines / LINES_PER_PAGE) * 8) / 8;

/** "1 3/8", "5/8", "2": a page length the way a script supervisor writes it. */
export function formatPages(pages: number): string {
  const whole = Math.floor(pages);
  const eighths = Math.round((pages - whole) * 8);
  if (eighths === 0) return String(whole);
  const frac = `${eighths}/8`.replace("2/8", "1/4").replace("4/8", "1/2").replace("6/8", "3/4");
  return whole === 0 ? frac : `${whole} ${frac}`;
}

export const scenePages = (sc: Parameters<typeof sceneLines>[0]): number => pagesFromLines(sceneLines(sc));

/** Total pages of the screenplay and the rule-of-thumb running time (one page ≈ one minute). */
export function screenplayLength(p: Pick<Project, "acts" | "script_scenes">): { lines: number; pages: number; minutes: number } {
  const lines = p.script_scenes.reduce((n, sc) => n + sceneLines(sc), 0);
  const pages = pagesFromLines(lines);
  return { lines, pages, minutes: Math.round(pages) };
}

// ─── New things ───

export type NewId = (prefix: string) => string;

export const newElement = (newId: NewId, kind: ElementKind = "action", speakerId = ""): ScriptElement => ({
  id: newId("el"),
  kind,
  speaker_id: kind === "dialogue" ? speakerId : "",
  extension: "",
  parenthetical: "",
  text: "",
});

export function newScriptScene(newId: NewId, actId: string, order: number, plotlineId = ""): ScriptScene {
  return {
    id: newId("ss"),
    act_id: actId,
    order,
    title: "",
    int_ext: "",
    location: "",
    time: "",
    summary: "",
    elements: [],
    status: "idea",
    plotline_id: plotlineId,
    character_ids: [],
    place_ids: [],
    tags: [],
    color: "",
    notes: "",
    todos: [],
    when: "",
  };
}
