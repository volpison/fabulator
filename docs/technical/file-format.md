# The project file format

What a `.fabulator.json` file contains and how old files are upgraded. A fuller written standard is planned (see the [roadmap](../../ROADMAP.md)).

## Data model (schema v11)

In a novel, `Project` → `chapters[]` (ordered) and `scenes[]`. (Comics and screenplays use `issues[]` / `pages[]` and `acts[]` / `script_scenes[]`; see the sections below.) A scene has `chapter_id` and
`order` (position inside its chapter); plotlines are a planning lens only.
Book order = chapters in order, then scenes by `order`.
Files carry `schema_version`; older files are upgraded on open by
`src/lib/migrate.ts` (an untouched copy goes to `<file>.backups/` first), and
files from a *newer* Fabulator are refused rather than damaged.

## Story formats

Every project has a `story_format` (`novel`, `comic` or `screenplay`; a Game Prototyping format is planned, see the [roadmap](../../ROADMAP.md)). The shared parts (characters, places, notes, plotlines, story time, snapshots, themes, backups, recovery) are the same in every format; the format decides the document itself: its units, editor and Timeline/Manuscript views. `src/lib/formats.ts` is the registry (ids, labels, and each format's words for its units: chapter/scene, issue/page/panel, act/scene).

- Older files open as novels; the upgrade makes the usual untouched backup first.
- A file whose format this version doesn't know (for example a comic opened in an older Fabulator) is **refused with a clear message**, never opened as a novel, so it can't be damaged.
- Rust stores the format as written and never interprets it; adding a format means new document fields (with a migration and the same fields in `models/mod.rs`) plus its views, not changes to saving, backups or recovery.
- Nothing looks different for novels: Novel mode works exactly as before.

## Comic data (schema v8; snapshots of pages are schema v9)

A comic is `issues[]` (ordered) and `pages[]`; a page has a `plot`, an optional `layout` note, a pipeline `stage` (Plot → Art received → Dialogue → Lettered), the same shared fields as a scene (plotline, cast, places, tags, colour, notes, to-dos, story time), and optional `panels[]`, each with a `description` and `lines[]` (dialogue, caption, thought or SFX, with a speaker, text and lettering note). `script_style` is `plot-first` (Marvel method) or `full`; both are the same data at different depths (a plot-first page has only its plot until the art comes back), so changing the style loses nothing. Helpers in `src/lib/comic.ts`: page numbers, left/right pages, spreads, page-turn pages, panel and word counts. Novels carry none of these fields in their files.

Comic is **ready** in `formats.ts`: *File → New comic* starts one. Exporting a comic as a Markdown folder is refused for now rather than writing a copy without its pages.

## Screenplay data (schema v10, snapshots of whole scenes since v11)

A screenplay is `acts[]` (ordered) and `script_scenes[]`. A scene has a **slug line** kept as parts (`int_ext` INT / EXT / INT/EXT, `location`, `time`; "INT. KITCHEN - DAY" is built from them, and `parseSlug` reads typed text back into them), an optional working `title`, a `summary`, the same shared fields as a novel's scene (status, plotline, cast, places, tags, colour, notes, to-dos, story time), and ordered `elements[]`: **action**, **dialogue** (a speaker, an optional extension such as V.O./O.S., an optional parenthetical, the words), **transition** (CUT TO:) and private **note** (never exported). Dialogue is structured, so a character's lines can be found, counted and renamed without parsing text; "(CONT'D)" is derived (`needsContd`: the same character speaks again with only action between), never stored. `src/lib/screenplay.ts` also has the **page estimate** (about 55 lines of 12 pt Courier per page, action about 60 characters wide, dialogue about 35, counted in eighths of a page; one page ≈ one minute as a rule of thumb) and word counts that leave out notes and the slug. Other formats carry none of these fields in their files.

Screenplay is **ready**: *File → New screenplay* starts one. A screenplay file is kept safe on open and save; exporting one as a Markdown folder is refused for now.
