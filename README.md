# Fabulator v0.1

Story planning + manuscript writing tool.

## Features in this skeleton

- **Dual view**: Timeline (Plottr-style) ↔ Manuscript
- **Timeline**: rename chapters (double-click), reorder chapters (drag header or ◀ ▶), several scenes per cell, drag scenes to reorder or move between chapters/plotlines, `+` on any cell to add a scene there
- **Data model** (Rust): Project, Scene, Character, Place, Note, Plotline
- **Side panels**: Characters, Places, Notes
- A new session starts with an empty story (one chapter, one plotline, one empty scene); **File → New story** (Ctrl+N)
  does the same. The sample "The Boy Who Cried Wolf" is under **File → Load sample story**.
- **Safe saving**: autosave (3 s after you stop typing, at most 15 s apart), atomic writes, rotating backups in `<file>.backups/`, and unsaved-changes guards on Open / Sample / window close
- **Crash recovery for unsaved projects**: a project that has no file yet is copied to the app's data folder while you write (same timing as autosave). If Fabulator closes unexpectedly, it offers to restore it next time. *Start fresh* keeps one "discarded" copy aside instead of deleting it. The copy is removed once you save to a file or close on purpose.

## Run

```bash
npm install
npm run tauri dev
```

## Stack

- Tauri 2 (Rust backend)
- Svelte 5 + TypeScript (frontend)
- Vite

## Project layout

```
src/                  # Svelte frontend
  App.svelte
  components/
  lib/types.ts        # mirrors Rust model
  lib/stores.ts
src-tauri/
  src/
    lib.rs            # commands + app state
    models/mod.rs     # Project, Scene, Character, Place…
```

All planned features are in; see below for each.

## Continuity: aliases and name highlighting

- Characters and places have **aliases** (nicknames, titles, other spellings).
- Names and aliases are matched as whole words, ignoring case and accents
  ("Jose" ≙ "José"), with Unicode-aware word boundaries.
- In the manuscript editor, mentions are underlined (blue = character, green =
  place); hover for their sheet. Toggle with **Names** in the toolbar. The
  underline is visual only and never changes your text.
- Unlinked mentions still show up as "link to this scene?" suggestions.

## Snapshots (top bar → *Snapshots*, or the button next to the word count)

Saved versions of a scene's title, synopsis and text, stored inside the project
file (so they are autosaved and backed up with it).

- **Yours**: *Take snapshot*, optionally named ("Before the rewrite"). Never removed automatically.
- **Auto**: while you write, the pre-edit text is saved at most every 30 minutes per
  scene. The oldest are pruned (10 per scene, 200 overall).
- **Safety**: saved before every *Restore* and every scene *Delete*. Never pruned.
- **Compare** shows what you added/removed since a snapshot, word by word.
- **Restore** puts a snapshot back (your current text is saved as a safety snapshot
  first, so a restore can be undone).
- **Deleted scenes** tab: recover a deleted scene (text, synopsis, chapter,
  plotline, cast/places that still exist).

Snapshots make the file bigger (each one holds a copy of the scene text); delete
old ones you no longer need.

## Search (Ctrl/Cmd+F, or the Search button)

- Searches scene titles, synopses, text and tags, plus characters (names,
  aliases, notes…), places, notes and chapters. Case and accents are ignored and
  partial words match (`pastur` finds *pasture*).
- Several words must all appear in the same item; use `"quotes"` for an exact
  phrase.
- Results are grouped, with snippets. Enter / click opens the result: scenes open
  in the manuscript with the matches highlighted and scrolled into view (clear
  with the chip next to the word count); characters, places and notes expand in
  the side panel.

## Interface, themes and shortcuts

- **Top bar**: *File* and *Tools* menus (with shortcuts shown, arrow-key navigation, Esc to close),
  the three views centred, the Characters / Places / Notes panels and the **View** menu on the right.
  The project name, file and save state moved to a status bar at the bottom.
- **View menu**: theme (System, Light, Dark, Sepia, Midnight, High contrast), interface size
  (90–150%), and for the manuscript: font (serif / sans / mono), text size, line width and
  line spacing. Everything is remembered. All themes are contrast-tested (`npm test`).
- **Focus mode**: only the manuscript is shown. Esc leaves it.
- Shortcuts: Ctrl+O open · Ctrl+S save · Ctrl+Shift+S save as · Ctrl+E export · Ctrl+F search ·
  Ctrl+H replace · Ctrl+Shift+H snapshots · Ctrl+1/2/3 Timeline/Manuscript/Cast ·
  Ctrl+\ toggle side panel · Ctrl+Shift+F focus mode. (Cmd instead of Ctrl on macOS.)
- The right-hand panel (Characters / Places / Notes) scrolls, and its width is adjustable: drag its left edge,
  or focus the edge and use ←/→ (Shift for bigger steps, Home to reset); double-click resets. The width is remembered.
- Fabulator behaves like a desktop app, not a web page: the browser's right-click menu (Back / Refresh / Save as…) is
  hidden except over editable text or a selection (cut/copy/paste, spelling), and reload, print and history shortcuts
  (F5, Ctrl+R, Ctrl+P, Alt+←/→) are disabled. If something still tries to reload while there are unsaved changes,
  you are asked first.
- Colours in components are theme tokens (`var(--text)`, `var(--danger)`…), defined in
  `src/lib/themes.ts`; to add a theme, add a palette there.

## Colour themes: import, export, file format

**View → Theme** has *Import…*, *Export…* and *Remove*. Imported themes are small JSON files in the
app's data folder (`themes/`), so they survive updates.

Importable: a **Fabulator theme** (`.json`, below), a **VS Code theme** (`.json`) or a **Base16**
scheme (`.yaml`/`.yml`, both the classic flat layout and the newer `palette:` layout).
Examples: `themes/examples/`.

**Themes browser and folder import** (*View → Theme → Browse…*): search every theme, filter **Dark / Light** and by
**collection** (Built-in, Gallery, the name of an imported folder, Imported), and click one to use it. *Import folder…*
reads every `.yaml`, `.yml` and `.json` file in a folder (up to four levels deep, so a whole clone of a scheme
collection such as `base16/` and `base24/` works) and adds them as one collection named after the folder.
Base16 and **Base24** schemes are both understood (Base24's `base10` becomes the sidebar of dark schemes); VS Code
and Fabulator theme files in the folder are imported too. Dark or light comes from the scheme's `variant`, or from the
background colour. Nothing you already have is replaced: identical themes are skipped, a theme that only shares a name
is added as "Name (2)" or "Name (Base24)", and files that are not themes are listed under *Show skipped files*.
*Remove “collection”* deletes a whole imported folder's themes at once. An example folder to try:
`themes/examples/folder-sample/`. Fabulator theme files can carry an optional `"collection": "Name"`.

**Theme gallery** (*View → Theme → Gallery…*): 22 popular schemes ready to add with one click: Dracula, Nord,
Catppuccin (Latte, Frappé, Macchiato, Mocha), Rosé Pine (Rosé Pine, Moon, Dawn), Tokyo Night (and Storm), Solarized
(Dark, Light), Gruvbox (Dark, Light), One (Dark, Light), GitHub (Light, Dark), Everforest (Dark, Light), Kanagawa Wave.
Adding saves it like an imported theme (editable, removable) and switches to it; a name you already have is never
overwritten. The data is in `src/lib/gallery.ts`, with author, licence and home page for each family (all MIT as far
as we know; only colour values are used, no code or assets, but check each project page before redistributing).
Text colours are nudged where needed so every theme passes the contrast rules. To add a scheme, append an `entry(...)`
there; `npm test` checks names, colours and contrast.

**VS Code themes**: import one of the theme `.json` files from an extension's `themes/` folder (usually
found in the theme's GitHub repo). Comments and trailing commas are fine. Only about ten colours are
used: editor background/foreground, sidebar and widget backgrounds, border, description text, the
button/link colour as accent, error/warning/green for danger/warning/success, and the colours of
functions/types and strings for character and place underlines. Semi-transparent colours are blended
over the background, anything missing is derived, and text contrast is guaranteed as for every theme.
Not supported (you get a clear message): themes that only `include` another file, `.vsix` packages,
`package.json` manifests, `.tmTheme` files. Check a theme's licence before sharing your imported copy.

A Fabulator theme only has to give three colours; everything else is derived and automatically
adjusted until text is readable (the same contrast rules the built-in themes pass):

```json
{
  "format": "fabulator-theme",
  "version": 1,
  "name": "Dracula",
  "author": "Zeno Rocha",
  "dark": true,
  "colors": {
    "background": "#282a36", "foreground": "#f8f8f2", "accent": "#bd93f9",
    "panel": "#343746", "sidebar": "#21222c", "border": "#44475a", "muted": "#6272a4",
    "danger": "#ff5555", "success": "#50fa7b", "warning": "#f1fa8c",
    "character": "#8be9fd", "place": "#50fa7b", "highlight": "#f1fa8c"
  },
  "tokens": { "text-faint": "#7a88b8" }
}
```

- Required: `colors.background`, `colors.foreground`, `colors.accent` (`#rgb` or `#rrggbb`). All other
  `colors` are optional. `dark` is guessed from the background if left out.
- `tokens` (optional) pins individual interface colours exactly (names in `src/lib/themes.ts`);
  *Export…* writes every token, so an exported theme reproduces perfectly.
- `version` is the format version (currently 1); files from a newer format are refused with a message.
- Base16 mapping: base00/01 backgrounds, base02 borders, base04 dim text, base05 text, base08 danger,
  base0A warning/highlight, base0B success/places, base0D accent/characters.

## Find & replace (top bar → *Replace*, or Ctrl/Cmd+H)

- Literal text (no regular expressions), with *Match case* and *Whole word*. Accents
  always count here ("José" ≠ "Jose") so nothing is replaced by accident.
- Choose where: scene text, titles and/or synopses; everything or only the selected scene.
- You see every affected scene first, with the first match shown as ~~old~~ → new.
  Untick scenes to leave them out, click a title to open the scene, then *Replace all*.
- Only visible text changes, never tags or formatting. A match that spans formatting
  ("Shep**herd**") is still found; the replacement takes the formatting of where it starts.
  Matches never cross paragraphs.
- Every changed scene is saved as a **safety snapshot** first (never pruned), so any scene can
  be undone from *Snapshots*. That grows the file; delete old ones you don't need.

## Export (top bar → *Export*, or Ctrl/Cmd+E)

Gets your story out of the app as **Word (.docx)**, **EPUB**, **Markdown** or **plain text**.

- Scope: the whole story, the chapter of the selected scene, or just the selected scene.
- Options: author, chapter headings, scene titles (or a scene break: `* * *`, blank line, none),
  page size (A4 / US Letter) and language code for Word and EPUB. Your choices are remembered.
- Order is the book order (chapters, then scenes). Scenes and chapters with no text are skipped.
- Bold, italic, strikethrough, headings, quotes, lists and hard line breaks are kept.
- Word output uses real styles (Title, Heading 1, Quote…), manuscript-style spacing and a
  title page. EPUB has a contents page, one file per chapter.
- Nothing is changed in your project; the export is written atomically to the file you pick.

## Word count and writing goals (status bar, bottom right)

- The status bar shows the manuscript total and today's progress. Click it for details.
- Per-scene counts appear in the Manuscript scene list and under each Timeline card; chapter totals appear in Timeline headers and in the panel's *By chapter* list.
- A word is a run of letters/digits, optionally joined by an apostrophe or hyphen. "1,000" and "3.14" count once; an em dash separates words.
- **Daily goal** (0 = off): "written today" is the total minus the total at the start of the day. If you delete text, today's count never goes below zero. A new day starts automatically at local midnight. *Restart today's count* re-baselines it.
- **Manuscript target**: progress, percent and words remaining.
- Goals are stored per project in the app's local storage (not in the `.fabulator.json` file), so they are not shared when you copy the project to another computer.

## Scene status, colours and the Timeline filter

- Every scene has a **status** (Idea, Draft, Revised, Final) and an optional **colour label** (red, orange, yellow, green, blue, purple). Set them in the Manuscript editor header, or in a Timeline card's *Edit* mode. Cards show a status badge and a coloured edge strip.
- The **filter bar** under the Timeline toolbar narrows by text (title, synopsis, tags), status, colour (or "No colour"), character and plotline. Several values of one kind mean "any of these"; different kinds must all match. The status chips also show how many scenes are in each state.
- Scenes that do not match are **dimmed, not hidden**, so the layout and drag-and-drop keep working. The bar shows "N of M scenes" and a *Clear* button. The filter is not saved.
- Older projects are upgraded automatically (now schema v6): scenes with text become *Draft*, empty ones *Idea*; every scene gets empty notes and to-dos.

## Plotlines (Timeline lanes)

Click **+ Plotline** under the lanes to add one (it gets the next free colour). On a lane's label: click the coloured dot to pick a colour (palette or any custom colour), double-click the name to rename it, and use the ▲ ▼ ✕ buttons (shown on hover) to reorder or delete it. Deleting a plotline moves its scenes to another one; the last plotline can't be deleted.

## `@` mentions in the editor

While writing, type `@` at the start of a word (not inside an e-mail address) and a small list of your characters and places appears. Keep typing to narrow it (accents and capitals don't matter; aliases count). **↑ ↓** choose, **Enter** or **Tab** inserts the name and links it to the scene, **Esc** closes the list. If nothing has exactly that name, the list also offers **＋ New character "…"** or **＋ New place "…"**, which creates it (fill in the details later in the side panel) and links it at once.

## Cast check above the editor

A slim bar above the text compares a scene's cast with its text. If everything lines up it lists the cast with mention counts ("Cast matches the text"). If someone is on the cast but never named in the text it turns amber and offers **Unlink** (take them off the scene) or **×** (keep them, e.g. they appear only as "she", and hide the notice for this session). Names that appear in the text but are not on the cast are still offered by the **Link** banner. The bar is hidden in focus mode.

## Scene notes and to-dos

Under the editor, a collapsed bar **Notes & to-dos** opens a private area for the scene: a notes box (reminders, research, "check the timeline") and a to-do list (type and press Enter; tick to complete; double-click to edit; **Clear done** removes finished ones). The bar summarises what is pending, and Timeline cards show **☐ n** for open to-dos and **✎** when a scene has notes. Notes and to-dos are saved in the project file (format upgraded to v5; older files upgrade automatically) and in the Markdown folder export, but are **never part of the exported story** (DOCX, EPUB, text…).

## Story time (Timeline → *Story time*)

Every scene has a **When** field (under the scene title in the Manuscript, or inline in the Story time list) for *when it happens inside the story*, as opposed to where it sits in the book. Write it as you like; these styles are understood and sorted:

- **Dates:** `2026-11-10`, `2026-11-10 14:30`, `10/11/2026` (day first), `1342-05-02 evening`
- **Days:** `Day 3`, `Day 3 evening`, `Day 3, 14:30`, `D3`, `Dia 3 manhã` (dawn, morning, noon, afternoon, evening, night, midnight, and a few Portuguese words)

The Timeline toolbar switches between **Book order** (the chapters × plotlines grid) and **Story time**: scenes listed in story order with the gap to the previous one ("+3 days"), their place in the book (#n), and **↩ out of book order** where the story jumps back (flashbacks). Scenes with no usable time, or written in the other style, are listed separately under *Not placed*. Other text is kept as a label (the field turns amber to say it can't be sorted). Story time is saved in the project (format v6; older files upgrade automatically) and in the Markdown folder export, and is not part of exported stories.

## Architecture: the Platform layer

The app never calls Tauri or the operating system directly. Everything that needs the machine (file dialogs, reading and writing project files, recovery copies, the live mirror, imported themes, message boxes, the window's close button) goes through one interface, `Platform` (`src/lib/platform/types.ts`). The desktop implementation (`src/lib/platform/tauri.ts`) is the **only** file with Tauri `invoke`/dialog calls; `main.ts` installs it at start-up. Files and folders are identified by an opaque **`Location`** (a path on desktop; it could be a content URI on Android). App code never parses one: it asks the platform for a `displayName` (status bar, lists) or `describe` (tooltips), and the compiler enforces this with a branded type.

Why: a different backend (Android with content URIs, or Rust owning the whole project model) means writing another implementation of the same interface, not changing the editor, Timeline or save logic. It also makes the save/open/recovery logic testable: `tests/fakePlatform.ts` is an in-memory pretend disk with scripted dialog answers, and `tests/persistence.test.ts` checks flows such as start-up, Start fresh, reload recovery, Save, New story and opening old files against it.

## Open recent (File → *Open recent*)

The File menu lists the last ten project files you opened or saved (newest first; same-named files show their full location). Choosing one opens it with the usual unsaved-changes protection. A file that is gone (moved, deleted, drive unplugged) is reported and removed from the list; **Clear list** empties it. The list is remembered between sessions.

## Reordering scenes from the Manuscript list

Drag a scene in the left-hand list and drop it on the top or bottom half of another scene; a line shows where it will land. Dropping onto a scene in another chapter moves it to that chapter (it keeps its plotline). Keyboard: focus a scene and press **Alt+↑ / Alt+↓** to move it one step in reading order (past a chapter boundary it moves into the neighbouring chapter). The Timeline reflects the change immediately.

## Project as a folder of Markdown (File → *Export as folder…* / *Open folder…*)

Writes the story as plain files you can version with git, diff, and edit in any editor:

```
my-story/
  project.json                          title, premise, plotlines, characters, places
  manuscript/01-the-start/_chapter.md   chapter header (id, title) + synopsis
  manuscript/01-the-start/01-opening.md one scene
  notes/01-core-theme.md                one note
```

A scene file is a small header followed by the text as Markdown:

```
---
id: sc-1
title: Opening
summary: "One line about the scene"
plotline: pl-main
status: revised
color: blue
characters: ["char-boy"]
places: ["place-pasture"]
tags: ["Act I", "Setup"]
---

The sun hung heavy over the **north pasture**.
```

- **Order is the file names.** Rename `02-…` to `01-…` (or move a scene file into another chapter folder) and
  *Open folder…* reads the new order. New scenes can be plain `.md` files with no header at all: the title comes
  from the file name, the status from whether it has text.
- Characters and places in a scene header can be written by id **or by name/alias**; unknown names are skipped
  with a notice. Unknown plotlines fall back to the first one.
- Text supports paragraphs, `##`/`###` headings, bullet and numbered lists, `>` quotes, `---` rules, line breaks
  (two spaces at the end of a line), `**bold**`, `*italic*`, `~~strike~~`. Use asterisks for emphasis.
  Opening a folder rewrites the scene text from this Markdown, so formatting the editor can't make is dropped.
- *Export as folder…* only rewrites files whose content changed, so `git status` shows real edits only. It removes
  `.md` files under `manuscript/` and `notes/` that no longer belong to the project (a renamed or deleted scene);
  it never touches anything else, and it refuses a folder that already has unrelated files (an empty folder or a
  fresh `git init` is fine, so is an earlier export). Hidden files such as `.git` are ignored.
- **Not included:** saved versions (snapshots), goals and settings. The opened project has no `.fabulator.json`
  yet; use *Save as…* to keep it as one.
- Tip: keep the folder in a git repo, export after a writing session, and commit.

## Live mirror: a reload or crash cannot lose your work

The web view still owns the project, but while there are unsaved changes it sends the Rust side **only what changed** (plus the file path, if any) about half a second after each edit (and when the window is hidden or unloading). Rust keeps that copy in memory and also writes it to `live.fabulator.json` in the app's `recovery` data folder.

- **Web view reloaded** (the Rust process is still running): the app silently picks the work back up, with the same file path, still marked unsaved.
- **App restarted or crashed**: you are asked whether to restore the unsaved changes (works for projects with and without a file).
- The copy is dropped when the web view reports nothing is unsaved (after a save that covered everything), or when you close the window, start a new story or open another project on purpose. Text typed *during* a save is never lost: the copy survives until the next mirror update says it is clean.

### Rules that now live in Rust

These are commands any front end can reuse (`src-tauri/src/storage.rs` holds the logic, `lib.rs` the commands):

- `open_project(path)`: reads and parses the file, and makes a one-off `.bak` of it first if it is older than the current schema (or has no version), so an upgrade can never destroy the original. If that backup fails, the open fails.
- `save_project(path, project, force_backup)`: atomic write with rotating backups (also drops any legacy recovery copy).
- `keep_unsaved(project, path)` / `unsaved_work()` / `discard_unsaved(keep_copy)`: one store for unsaved work. Reading prefers the in-memory copy, then `live.fabulator.json`, then the legacy `recovery.fabulator.json` from older versions (still read, never written). *Start fresh* uses `keep_copy` to move the newest copy to `discarded.fabulator.json` (one slot, replaced each time).

The web view no longer writes separate recovery files; autosave only saves projects that already have a file.

### Small changes instead of the whole project

The first send after a (re)start is the whole project; later sends are *patches* (`src/lib/patch.ts`): changed plain fields, plus per list (scenes, chapters, notes…) the items added or changed, the ids removed, and the full id order only when it changed. Typing in one scene sends that scene, not the book. Rust applies the patch to the copy it keeps (`src-tauri/src/patch.rs`, same rules, tested on both sides) via `keep_unsaved_changes`.

Safety net: every copy has a revision number. If Rust is not at the revision a patch was made for (restart, discard, a patch that doesn't fit), it drops the copy and answers "send everything"; the web view then sends the whole project. It also re-sends the whole project every 100 patches. Rust still rewrites `live.fabulator.json` on every update (disk cost only; nothing crosses the web view boundary).

Not done yet: Rust does not own the *whole* model (saving still sends the project from the web view). This patch format is the first piece of that.

## Appearances

- **Per character / place** (side panel, expand a card → *Appearances*): every
  scene they are linked to and/or named in, in reading order, with the first
  appearance, the longest absence, and how long since they were last seen.
  Mismatches are flagged: *not named* (linked, but the text never mentions
  them) and *not linked* (named in the text but missing from the scene's cast).
  One click links all the "named but not linked" scenes.
- **Cast view** (top bar → *Cast*): a grid of every character and place against
  every scene in reading order. Click any cell to open that scene.
  Three grid sizes (Compact / Comfortable / Spacious, remembered), scene titles above the columns,
  chapter headers, hover highlights the row and column and describes the cell, the open scene is
  marked, and clicking a name shows that character or place in the side panel.

## Data model (schema v6)

`Project` → `chapters[]` (ordered) and `scenes[]`. A scene has `chapter_id` and
`order` (position inside its chapter); plotlines are a planning lens only.
Book order = chapters in order, then scenes by `order`.
Files carry `schema_version`; older files are upgraded on open by
`src/lib/migrate.ts` (an untouched copy goes to `<file>.backups/` first), and
files from a *newer* Fabulator are refused rather than damaged.

## Tests

```bash
npm test      # migration, model, mentions, appearances, search, snapshots, export, replace, theme (contrast, generator, import, folder import and filters), VS Code theme, gallery, label/filter, goals, Markdown body and project-folder tests (Node's built-in runner, no extra deps)
```
