/**
 * "Project as a folder": every scene is a Markdown file with a small header,
 * so the story diffs and merges well in git and opens in any editor.
 *
 *   project.json                          title, premise, plotlines, characters, places
 *   manuscript/01-the-start/_chapter.md   chapter id + title (header), synopsis (body)
 *   manuscript/01-the-start/01-opening.md scene header + text as Markdown
 *   notes/01-core-theme.md                note header + text
 *
 * The order of chapters and scenes is the order of the file names, so
 * renaming "02-…" to "01-…" in a file manager reorders the story. Snapshots
 * (saved versions) are not included; git is the history here.
 * Pure: the app reads/writes the files, this module only converts.
 */
import { migrateProject, CURRENT_SCHEMA_VERSION } from "./migrate";
import { cleanColor, cleanStatus, defaultStatusFor } from "./labels";
import { htmlToMd, mdToHtml } from "./mdbody";
import { linesToTodos, todosToLines } from "./scenenotes";
import type { Project, Scene } from "./types";

export const FOLDER_FORMAT = "fabulator-folder";
export const FOLDER_VERSION = 1;
export const PROJECT_FILE = "project.json";
export const CHAPTER_FILE = "_chapter.md";

export type FolderFile = { path: string; text: string };

// ─── Names ─────────────────────────────────────────────────

export function slug(text: string): string {
  const s = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || "untitled";
}

const pad = (n: number, width: number) => String(n + 1).padStart(width, "0");
const widthFor = (count: number) => Math.max(2, String(count).length);

// ─── Headers (a small YAML subset) ─────────────────────────

const SIMPLE = /^[\p{L}\p{N}_][\p{L}\p{N}_ .,'’()\/-]*$/u;
const RESERVED = /^(?:true|false|null|yes|no|on|off|~)$/i;

function scalar(v: string): string {
  if (SIMPLE.test(v) && !/\s$/.test(v) && !RESERVED.test(v) && !/^[-+]?[\d.]+$/.test(v)) return v;
  return JSON.stringify(v);
}

const list = (items: string[]) => `[${items.map((i) => JSON.stringify(i)).join(", ")}]`;

function header(fields: [string, string | string[] | undefined][]): string {
  const lines = fields
    .filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? list(v) : scalar(v as string)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

type Header = Record<string, string | string[]>;

function unquote(v: string): string {
  const t = v.trim();
  if (t.startsWith('"')) {
    try {
      const x = JSON.parse(t);
      if (typeof x === "string") return x;
    } catch {
      /* fall through */
    }
  }
  const m = /^'(.*)'$/.exec(t);
  return m ? m[1].replace(/''/g, "'") : t.replace(/\s+#.*$/, "");
}

function parseList(v: string): string[] {
  const t = v.trim();
  try {
    const x = JSON.parse(t);
    if (Array.isArray(x)) return x.filter((i): i is string => typeof i === "string");
  } catch {
    /* hand-written [a, b] */
  }
  const inner = t.replace(/^\[/, "").replace(/\]$/, "");
  return inner.split(",").map(unquote).filter(Boolean);
}

export function splitHeader(text: string): { header: Header; body: string } {
  const t = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!t.startsWith("---\n")) return { header: {}, body: t };
  const end = t.indexOf("\n---", 3);
  if (end === -1 || !/^\n---[ \t]*(\n|$)/.test(t.slice(end, end + 8))) return { header: {}, body: t };

  const header: Header = {};
  const lines = t.slice(4, end).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key, value] = m;
    if (value.trim().startsWith("[")) header[key] = parseList(value);
    else if (value.trim() === "") {
      // YAML block list: following "- item" lines
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) items.push(unquote(lines[++i].replace(/^\s+-\s+/, "")));
      header[key] = items.length ? items : "";
    } else header[key] = unquote(value);
  }
  const afterClose = t.indexOf("\n", end + 1);
  return { header, body: afterClose === -1 ? "" : t.slice(afterClose + 1) };
}

const asString = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const asList = (v: string | string[] | undefined) => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []);

// ─── Project -> files ──────────────────────────────────────

const withNewline = (s: string) => (s.endsWith("\n") ? s : s + "\n");

export function toFolder(p: Project): FolderFile[] {
  const files: FolderFile[] = [];

  files.push({
    path: PROJECT_FILE,
    text:
      JSON.stringify(
        {
          format: FOLDER_FORMAT,
          version: FOLDER_VERSION,
          schema_version: p.schema_version,
          story_format: p.story_format,
          id: p.id,
          title: p.title,
          premise: p.premise,
          genre: p.genre,
          theme: p.theme,
          plotlines: p.plotlines,
          characters: p.characters,
          places: p.places,
        },
        null,
        2
      ) + "\n",
  });

  const cw = widthFor(p.chapters.length);
  p.chapters.forEach((ch, ci) => {
    const dir = `manuscript/${pad(ci, cw)}-${slug(ch.title)}`;
    files.push({
      path: `${dir}/${CHAPTER_FILE}`,
      text: header([["id", ch.id], ["title", ch.title]]) + (ch.summary ? `\n${withNewline(ch.summary)}` : ""),
    });

    const scenes = p.scenes.filter((s) => s.chapter_id === ch.id).sort((a, b) => a.order - b.order);
    const sw = widthFor(scenes.length);
    scenes.forEach((s, si) => {
      const body = htmlToMd(s.content);
      files.push({
        path: `${dir}/${pad(si, sw)}-${slug(s.title)}.md`,
        text:
          header([
            ["id", s.id],
            ["title", s.title],
            ["summary", s.summary],
            ["plotline", s.plotline_id],
            ["status", s.status],
            ["color", s.color],
            ["characters", s.character_ids],
            ["places", s.place_ids],
            ["tags", s.tags],
            ["when", s.when],
            ["notes", s.notes],
            ["todos", todosToLines(s.todos)],
          ]) + (body ? `\n${body}\n` : ""),
      });
    });
  });

  const nw = widthFor(p.notes.length);
  p.notes.forEach((n, i) => {
    files.push({
      path: `notes/${pad(i, nw)}-${slug(n.title)}.md`,
      text: header([["id", n.id], ["title", n.title], ["tags", n.tags]]) + (n.content ? `\n${withNewline(n.content)}` : ""),
    });
  });

  return files;
}

// ─── Files -> project ──────────────────────────────────────

export type FolderImport =
  | { ok: true; project: Project; warnings: string[] }
  | { ok: false; error: string };

const collator = new Intl.Collator("en", { numeric: true });
const byPath = (a: FolderFile, b: FolderFile) => collator.compare(a.path, b.path);

/** "03-the-long-night.md" -> "The long night" */
function titleFromName(name: string): string {
  const base = name.replace(/\.md$/i, "").replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Untitled";
}

type Named = { id: string; name: string; aliases?: string[] };

export function fromFolder(files: FolderFile[], newId: (prefix: string) => string): FolderImport {
  const warnings: string[] = [];
  const meta = files.find((f) => f.path === PROJECT_FILE);
  if (!meta) return { ok: false, error: `This folder has no ${PROJECT_FILE}, so it is not a Fabulator project folder.` };

  let m: Record<string, unknown>;
  try {
    const parsed = JSON.parse(meta.text.replace(/^﻿/, ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    m = parsed as Record<string, unknown>;
  } catch (e) {
    return { ok: false, error: `${PROJECT_FILE} is not valid JSON (${(e as Error).message}).` };
  }
  if (m.format !== FOLDER_FORMAT) return { ok: false, error: `${PROJECT_FILE} is not a Fabulator folder (format “${String(m.format)}”).` };
  if (typeof m.version === "number" && m.version > FOLDER_VERSION) {
    return { ok: false, error: "This folder was written by a newer version of Fabulator. Update Fabulator to open it." };
  }

  const arr = (x: unknown): Record<string, unknown>[] =>
    Array.isArray(x) ? x.filter((i): i is Record<string, unknown> => !!i && typeof i === "object") : [];
  const plotlines = arr(m.plotlines);
  if (plotlines.length === 0) plotlines.push({ id: "pl-main", name: "Main", color: "#4a8fd9" });
  const characters = arr(m.characters);
  const places = arr(m.places);

  const usedIds = new Set<string>();
  const claim = (wanted: string, prefix: string, what: string): string => {
    let id = wanted;
    if (id && usedIds.has(id)) {
      warnings.push(`Two ${what} share the id “${id}”; the second got a new one.`);
      id = "";
    }
    if (!id) id = newId(prefix);
    usedIds.add(id);
    return id;
  };

  const resolve = (wanted: string[], pool: Record<string, unknown>[], where: string, what: string): string[] => {
    const out: string[] = [];
    for (const w of wanted) {
      const key = w.trim().toLowerCase();
      const hit = (pool as unknown as Named[]).find(
        (e) => e.id === w || String(e.name ?? "").toLowerCase() === key || (e.aliases ?? []).some((a) => String(a).toLowerCase() === key)
      );
      if (!hit) warnings.push(`${where}: unknown ${what} “${w}” was ignored.`);
      else if (!out.includes(hit.id)) out.push(hit.id);
    }
    return out;
  };

  // Chapters = folders under manuscript/, scenes = .md files inside them.
  const manuscript = files.filter((f) => f.path.startsWith("manuscript/")).sort(byPath);
  const dirs = new Map<string, FolderFile[]>();
  for (const f of manuscript) {
    const parts = f.path.split("/");
    if (parts.length !== 3) {
      if (parts.length === 2 && f.path.endsWith(".md")) warnings.push(`${f.path} is not inside a chapter folder and was skipped.`);
      continue;
    }
    if (!f.path.toLowerCase().endsWith(".md")) continue;
    const list = dirs.get(parts[1]) ?? [];
    list.push(f);
    dirs.set(parts[1], list);
  }

  const chapters: Record<string, unknown>[] = [];
  const scenes: Scene[] = [];

  for (const [dir, group] of dirs) {
    const chapterFile = group.find((f) => f.path.endsWith(`/${CHAPTER_FILE}`));
    const ch = chapterFile ? splitHeader(chapterFile.text) : { header: {} as Header, body: "" };
    const chapterId = claim(asString(ch.header.id), "ch", "chapters");
    chapters.push({
      id: chapterId,
      title: asString(ch.header.title) || titleFromName(dir),
      summary: ch.body.trim(),
    });

    let order = 0;
    for (const f of group) {
      if (f === chapterFile) continue;
      const { header: h, body } = splitHeader(f.text);
      const name = f.path.split("/").pop()!;
      const content = mdToHtml(body);

      let plotlineId = String(plotlines[0].id);
      const wantedPlot = asString(h.plotline);
      if (wantedPlot) {
        const hit = plotlines.find((p) => p.id === wantedPlot || String(p.name ?? "").toLowerCase() === wantedPlot.toLowerCase());
        if (hit) plotlineId = String(hit.id);
        else warnings.push(`${f.path}: unknown plotline “${wantedPlot}”; used “${plotlines[0].name}”.`);
      }

      scenes.push({
        id: claim(asString(h.id), "sc", "scenes"),
        title: asString(h.title) || titleFromName(name),
        summary: asString(h.summary),
        content,
        chapter_id: chapterId,
        order: order++,
        plotline_id: plotlineId,
        character_ids: resolve(asList(h.characters), characters, f.path, "character"),
        place_ids: resolve(asList(h.places), places, f.path, "place"),
        tags: asList(h.tags),
        status: cleanStatus(h.status, defaultStatusFor(content)),
        color: cleanColor(h.color),
        when: asString(h.when),
        notes: asString(h.notes),
        todos: linesToTodos(asList(h.todos)),
      });
    }
  }

  const notes = files
    .filter((f) => f.path.startsWith("notes/") && f.path.split("/").length === 2 && f.path.toLowerCase().endsWith(".md"))
    .sort(byPath)
    .map((f) => {
      const { header: h, body } = splitHeader(f.text);
      return {
        id: claim(asString(h.id), "note", "notes"),
        title: asString(h.title) || titleFromName(f.path.split("/")[1]),
        content: body.replace(/^\n+/, "").replace(/\n+$/, ""),
        tags: asList(h.tags),
      };
    });

  try {
    const { project } = migrateProject({
      schema_version: CURRENT_SCHEMA_VERSION,
      story_format: m.story_format,
      id: typeof m.id === "string" && m.id ? m.id : newId("proj"),
      title: typeof m.title === "string" ? m.title : "Untitled",
      premise: m.premise,
      genre: m.genre,
      theme: m.theme,
      chapters,
      scenes,
      snapshots: [],
      characters,
      places,
      notes,
      plotlines,
    });
    return { ok: true, project, warnings };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
