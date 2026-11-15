# The project file format

What a Fabulator project file contains, how old files are upgraded, and the rules that keep it safe. A project is one JSON file, normally named `<name>.fabulator.json`, UTF-8, pretty-printed.

## Versioning rules

- Every file carries `schema_version` (currently **12**). `CURRENT_SCHEMA_VERSION` in `src/lib/migrate.ts` and `SCHEMA_VERSION` in `src-tauri/src/models/mod.rs` must always be equal.
- **Older file:** it is upgraded when opened, step by step (`migrations[n]` turns version n into n+1). Before an upgraded file is written back, an untouched copy is made first (`.bak`, see [Safety, backups and recovery](../user-guide/safety-and-backups.md)). If that backup fails, the open fails.
- **Newer file:** it is refused with a clear message ("saved by a newer version of Fabulator"), never opened and damaged. The exception is a file whose `min_reader_version` is not higher than this version: it says an older reader can open it safely, so it is opened, keeps its own `schema_version`, and the fields this version does not know are written back unchanged.
- **Another kind of file:** `file_type` is always `"fabulator-project"`. A JSON file with a different `file_type` is refused as "not a Fabulator project". Files from before v12 have no marker and are accepted.
- **Never edit an old migration step.** To change the format: bump the version, add a step, add the same fields in Rust (`#[serde(default)]`), and add a test.
- `normalize()` repairs small gaps (a missing field, a wrong type, an unknown colour or status) instead of rejecting the file.
- Fields that a format does not use are empty and **left out of the file** (a novel has no `issues`, `pages`, `acts` or `script_scenes`).

### Version history

| Version | What changed |
|---|---|
| 0 → 1 | Chapters become real entities (scenes had a plain chapter number) |
| 1 → 2 | Characters and places gain `aliases` |
| 2 → 3 | The project gains `snapshots` |
| 3 → 4 | Scenes gain `status` and `color` |
| 4 → 5 | Scenes gain `notes` and `todos` |
| 5 → 6 | Scenes gain `when` (story time) |
| 6 → 7 | The project gains `story_format` (every older project is a novel) |
| 7 → 8 | Comic documents: `issues`, `pages`, `script_style` |
| 8 → 9 | A snapshot may hold a whole comic page (`page`) |
| 9 → 10 | Screenplay documents: `acts`, `script_scenes` |
| 10 → 11 | A snapshot may hold a whole screenplay scene (`script_scene`) |
| 11 → 12 | The file says what it is (`file_type`) and which reader it needs (`min_reader_version`) |

## Top-level fields

| Field | Used by | Notes |
|---|---|---|
| `schema_version`, `file_type`, `min_reader_version`, `story_format`, `id`, `title`, `premise`, `genre`, `theme` | all | `story_format` is `novel`, `comic` or `screenplay` |
| `chapters[]`, `scenes[]` | novel | A scene has `chapter_id` and `order`; book order is chapters in order, then scenes by `order` |
| `issues[]`, `pages[]`, `script_style` | comic | See "Comic data" below |
| `acts[]`, `script_scenes[]` | screenplay | See "Screenplay data" below |
| `characters[]`, `places[]`, `notes[]`, `plotlines[]` | all | The shared world |
| `snapshots[]` | all | Saved versions of a scene, page or screenplay scene (manual, auto, safety) |

## Known limits (planned for schema v12)

These are the gaps between today's format and a long-lived standard; see the [roadmap](../../ROADMAP.md) and the [v12 proposal](format-v12.md):

- ~~Unknown fields are dropped on save.~~ **Fixed:** every Rust model struct keeps the fields it does not list (`extra`, a flattened map) and writes them back, so a field added by a newer Fabulator survives a save here. The version check still decides whether a file may be opened at all.
- **One flat list of fields per format.** Each new mode adds more top-level lists. Grouping the shared "world" (characters, places, notes, plotlines, snapshots) apart from each format's document would keep the file tidy as modes are added.
- ~~No format marker.~~ **Fixed in v12:** `file_type` and `min_reader_version`.
- **No abilities** yet in the shared world.

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
