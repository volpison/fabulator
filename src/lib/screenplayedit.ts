/**
 * Editing a screenplay's acts and scenes. Pure functions over a Project (no Svelte, no Tauri):
 * each returns a new project, or the very same object when nothing would change (so callers can
 * tell). The stores wrap these and mark the project as changed.
 */
import type { Act, ElementKind, Project, ScriptElement, ScriptScene, SlugPlace } from "./types";
import {
  ELEMENT_KINDS,
  cleanSlugPlace,
  newElement,
  newScriptScene,
  pagesFromLines,
  sceneLines,
  sceneWordCount,
  scenesInAct,
  type NewId,
} from "./screenplay";
import { SCENE_STATUSES, cleanColor } from "./labels";

// ─── Acts ───

/** Append an act. */
export function addAct(p: Project, newId: NewId, title?: string): { project: Project; id: string } {
  const id = newId("act");
  const act: Act = { id, title: title?.trim() || `Act ${p.acts.length + 1}`, summary: "" };
  return { project: { ...p, acts: [...p.acts, act] }, id };
}

export function updateAct(p: Project, id: string, fields: Partial<Pick<Act, "title" | "summary">>): Project {
  const act = p.acts.find((a) => a.id === id);
  if (!act) return p;
  const next = { ...act, ...fields };
  if (next.title === act.title && next.summary === act.summary) return p;
  return { ...p, acts: p.acts.map((a) => (a.id === id ? next : a)) };
}

/** Delete an act. Only an empty act can go (scenes are never deleted as a side effect). */
export function deleteAct(p: Project, id: string): Project {
  if (p.script_scenes.some((s) => s.act_id === id) || !p.acts.some((a) => a.id === id)) return p;
  return { ...p, acts: p.acts.filter((a) => a.id !== id) };
}

/** Move an act so it ends up at `toIndex` (clamped). */
export function moveAct(p: Project, id: string, toIndex: number): Project {
  const from = p.acts.findIndex((a) => a.id === id);
  if (from === -1) return p;
  const to = Math.max(0, Math.min(p.acts.length - 1, Math.floor(toIndex)));
  if (to === from) return p;
  const acts = [...p.acts];
  const [moved] = acts.splice(from, 1);
  acts.splice(to, 0, moved);
  return { ...p, acts };
}

// ─── Scenes ───

/**
 * Add a scene to an act (the last one by default; an act is created if there is none) at `atIndex`
 * (the end by default). The new scene takes the project's first plotline.
 */
export function addScene(p: Project, newId: NewId, actId?: string, atIndex?: number): { project: Project; id: string } {
  let project = p;
  let target = actId && p.acts.some((a) => a.id === actId) ? actId : p.acts[p.acts.length - 1]?.id;
  if (!target) {
    const made = addAct(p, newId);
    project = made.project;
    target = made.id;
  }
  const scene = newScriptScene(newId, target, 0, project.plotlines[0]?.id ?? "");
  const list = scenesInAct(project.script_scenes, target);
  const at = atIndex === undefined ? list.length : Math.max(0, Math.min(list.length, Math.floor(atIndex)));
  list.splice(at, 0, scene);
  const order = new Map(list.map((s, i) => [s.id, i]));
  const scenes = [
    ...project.script_scenes.map((s) => (order.has(s.id) ? { ...s, order: order.get(s.id)! } : s)),
    { ...scene, order: at },
  ];
  return { project: { ...project, script_scenes: scenes }, id: scene.id };
}

export type SceneFields = Partial<
  Pick<ScriptScene, "title" | "int_ext" | "location" | "time" | "summary" | "status" | "plotline_id" | "color" | "notes">
>;

export function updateScene(p: Project, id: string, fields: SceneFields): Project {
  const scene = p.script_scenes.find((s) => s.id === id);
  if (!scene) return p;
  if (fields.status !== undefined && !(SCENE_STATUSES as readonly string[]).includes(fields.status)) return p;
  const clean: SceneFields = { ...fields };
  if (clean.int_ext !== undefined) clean.int_ext = cleanSlugPlace(clean.int_ext) as SlugPlace;
  if (clean.color !== undefined) clean.color = cleanColor(clean.color);
  if (clean.location !== undefined) clean.location = clean.location.replace(/\s+/g, " ");
  if (clean.time !== undefined) clean.time = clean.time.replace(/\s+/g, " ");
  const next = { ...scene, ...clean };
  const same = (Object.keys(clean) as (keyof SceneFields)[]).every((k) => next[k] === scene[k]);
  if (same) return p;
  // A slug location that names a Place in the Cast puts that place on the scene (continuity).
  if (clean.location !== undefined) {
    const place = placeNamed(p, clean.location);
    if (place && !next.place_ids.includes(place)) next.place_ids = [...next.place_ids, place];
  }
  return { ...p, script_scenes: p.script_scenes.map((s) => (s.id === id ? next : s)) };
}

const fold = (t: string) => t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** The id of the Place whose name or alias is exactly this text (ignoring case and accents), or "". */
export function placeNamed(p: Pick<Project, "places">, text: string): string {
  const want = fold(text);
  if (!want) return "";
  for (const pl of p.places) {
    if (fold(pl.name) === want || (pl.aliases ?? []).some((a) => fold(a) === want)) return pl.id;
  }
  return "";
}

/** The id of the Character whose name or alias is exactly this text (ignoring case and accents), or "". */
export function characterNamed(p: Pick<Project, "characters">, text: string): string {
  const want = fold(text);
  if (!want) return "";
  for (const c of p.characters) {
    if (fold(c.name) === want || (c.aliases ?? []).some((a) => fold(a) === want)) return c.id;
  }
  return "";
}

/**
 * Put a scene into `actId` at position `index` (clamped; counted among that act's other scenes).
 * Orders stay dense in every act touched.
 */
export function moveScene(p: Project, sceneId: string, actId: string, index: number): Project {
  const scene = p.script_scenes.find((s) => s.id === sceneId);
  if (!scene || !p.acts.some((a) => a.id === actId)) return p;
  const rest = p.script_scenes.filter((s) => s.id !== sceneId);
  const dest = scenesInAct(rest, actId);
  const at = Math.max(0, Math.min(dest.length, Math.floor(index)));
  dest.splice(at, 0, { ...scene, act_id: actId });
  const updates = new Map<string, { act_id: string; order: number }>();
  dest.forEach((s, i) => updates.set(s.id, { act_id: actId, order: i }));
  if (scene.act_id !== actId) {
    scenesInAct(rest, scene.act_id).forEach((s, i) => updates.set(s.id, { act_id: scene.act_id, order: i }));
  }
  let changed = false;
  const scenes = p.script_scenes.map((s) => {
    const u = updates.get(s.id);
    if (!u || (u.act_id === s.act_id && u.order === s.order)) return s;
    changed = true;
    return { ...s, ...u };
  });
  return changed ? { ...p, script_scenes: scenes } : p;
}

/** Delete a scene and close the gap in its act. */
export function deleteScene(p: Project, sceneId: string): Project {
  const scene = p.script_scenes.find((s) => s.id === sceneId);
  if (!scene) return p;
  const rest = p.script_scenes.filter((s) => s.id !== sceneId);
  const order = new Map(scenesInAct(rest, scene.act_id).map((s, i) => [s.id, i]));
  return { ...p, script_scenes: rest.map((s) => (order.has(s.id) && order.get(s.id) !== s.order ? { ...s, order: order.get(s.id)! } : s)) };
}

/** A deleted character or place no longer appears on any scene. */
export function removeCastFromScenes(p: Project, kind: "character" | "place", id: string): Project {
  const key = kind === "character" ? "character_ids" : "place_ids";
  if (!p.script_scenes.some((s) => s[key].includes(id))) return p;
  return { ...p, script_scenes: p.script_scenes.map((s) => (s[key].includes(id) ? { ...s, [key]: s[key].filter((x) => x !== id) } : s)) };
}

/** Does the scene hold anything worth asking about before it is deleted? */
export const sceneIsEmpty = (s: ScriptScene): boolean =>
  s.elements.every((e) => !e.text.trim()) && !s.summary.trim() && !s.notes.trim() && !s.title.trim() && !s.location.trim();

// ─── Elements (the writing view) ───

function editScene(p: Project, sceneId: string, fn: (sc: ScriptScene) => ScriptScene): Project {
  const sc = p.script_scenes.find((x) => x.id === sceneId);
  if (!sc) return p;
  const next = fn(sc);
  return next === sc ? p : { ...p, script_scenes: p.script_scenes.map((x) => (x.id === sceneId ? next : x)) };
}

/** Insert an element at `atIndex` (the end by default). A new dialogue may already have its speaker. */
export function addElement(
  p: Project,
  newId: NewId,
  sceneId: string,
  kind: ElementKind = "action",
  atIndex?: number,
  speakerId = ""
): { project: Project; id: string } {
  const sc = p.script_scenes.find((x) => x.id === sceneId);
  if (!sc || !(ELEMENT_KINDS as readonly string[]).includes(kind)) return { project: p, id: "" };
  const el = newElement(newId, kind, speakerId);
  const at = atIndex === undefined ? sc.elements.length : Math.max(0, Math.min(sc.elements.length, Math.floor(atIndex)));
  const elements = [...sc.elements];
  elements.splice(at, 0, el);
  const cast = el.speaker_id && !sc.character_ids.includes(el.speaker_id) ? [...sc.character_ids, el.speaker_id] : sc.character_ids;
  return { project: editScene(p, sceneId, (s) => ({ ...s, elements, character_ids: cast })), id: el.id };
}

export type ElementFields = Partial<Pick<ScriptElement, "kind" | "speaker_id" | "extension" | "parenthetical" | "text">>;

/**
 * Change an element. Only dialogue has a speaker, extension and parenthetical (changing the kind away
 * from dialogue clears them). A speaker joins the scene's cast. The first words written in an "Idea"
 * scene make it a "Draft".
 */
export function updateElement(p: Project, sceneId: string, elementId: string, fields: ElementFields): Project {
  if (fields.kind !== undefined && !(ELEMENT_KINDS as readonly string[]).includes(fields.kind)) return p;
  return editScene(p, sceneId, (sc) => {
    const at = sc.elements.findIndex((e) => e.id === elementId);
    if (at === -1) return sc;
    const el = sc.elements[at];
    const kind = fields.kind ?? el.kind;
    let next: ScriptElement = { ...el, ...fields, kind };
    if (kind !== "dialogue") next = { ...next, speaker_id: "", extension: "", parenthetical: "" };
    else next = { ...next, extension: next.extension.trim(), parenthetical: next.parenthetical.trim().replace(/^\((.*)\)$/s, "$1") };
    const unchanged = (Object.keys(next) as (keyof ScriptElement)[]).every((k) => next[k] === el[k]);
    if (unchanged) return sc;
    const elements = sc.elements.map((e, i) => (i === at ? next : e));
    const cast = next.speaker_id && !sc.character_ids.includes(next.speaker_id) ? [...sc.character_ids, next.speaker_id] : sc.character_ids;
    const status = sc.status === "idea" && next.kind !== "note" && next.text.trim() ? "draft" : sc.status;
    return { ...sc, elements, character_ids: cast, status };
  });
}

/** Put an element at position `toIndex` (clamped) in its scene. */
export function moveElement(p: Project, sceneId: string, elementId: string, toIndex: number): Project {
  return editScene(p, sceneId, (sc) => {
    const from = sc.elements.findIndex((e) => e.id === elementId);
    if (from === -1) return sc;
    const to = Math.max(0, Math.min(sc.elements.length - 1, Math.floor(toIndex)));
    if (to === from) return sc;
    const elements = [...sc.elements];
    const [moved] = elements.splice(from, 1);
    elements.splice(to, 0, moved);
    return { ...sc, elements };
  });
}

export function deleteElement(p: Project, sceneId: string, elementId: string): Project {
  return editScene(p, sceneId, (sc) =>
    sc.elements.some((e) => e.id === elementId) ? { ...sc, elements: sc.elements.filter((e) => e.id !== elementId) } : sc
  );
}

/**
 * Who answers? For the dialogue at `index`: the nearest earlier speaker in the scene who is not the
 * same character ("" when nobody else has spoken yet). Used by "reply" (Ctrl+Enter).
 */
export function replySpeaker(elements: ScriptElement[], index: number): string {
  const current = elements[index]?.kind === "dialogue" ? elements[index].speaker_id : "";
  for (let i = Math.min(index, elements.length) - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.kind === "dialogue" && e.speaker_id && e.speaker_id !== current) return e.speaker_id;
  }
  return "";
}

// ─── Summaries ───

export type ActSummary = { scenes: number; pages: number; words: number; elements: number };

/** What an act's header shows: scene count, page length (eighths), words and elements. */
export function actSummary(p: Pick<Project, "script_scenes">, actId: string): ActSummary {
  let lines = 0;
  let words = 0;
  let elements = 0;
  let scenes = 0;
  for (const s of p.script_scenes) {
    if (s.act_id !== actId) continue;
    scenes++;
    words += sceneWordCount(s);
    elements += s.elements.length;
    lines += sceneLines(s);
  }
  // Measured on the act's own lines, so it can be a little under the sum of its scenes' rounded lengths.
  return { scenes, pages: pagesFromLines(lines), words, elements };
}
