# Architecture

How the app is built: who does what, where the files are, and how a feature is put together.

## The big picture

Fabulator is a desktop app made of two halves that talk through a small set of commands:

- **The web view** (Svelte 5 + TypeScript, inside a Tauri window) shows the screens and owns the *editing rules*: how a scene is added, moved, searched, replaced, exported.
- **Rust** (Tauri 2 backend) owns the *files*: opening, atomic saving, rotating backups, crash recovery, the Markdown folder format, user themes, and a copy of the current project that it keeps up to date from small patches.

The two halves share one data model: `src/lib/types.ts` (TypeScript) mirrors `src-tauri/src/models/mod.rs` (Rust), and both carry the same schema version (see [The project file format](file-format.md)).

## Stack

- Tauri 2 (Rust backend: `serde`, `serde_json`)
- Svelte 5 + TypeScript (frontend), Vite, Tiptap (the text editor)
- Tests: Node's built-in test runner for the TypeScript, `cargo test` for Rust (see [Tests](testing.md))

## Folder layout

```
src/                       the web view
  App.svelte, main.ts      start-up, keyboard shortcuts, which dialogs are open
  components/              Svelte screens and dialogs (TopBar, TimelineView, ManuscriptView,
                           ComicTimeline, ScreenplayManuscript, ExportDialog, SnapshotsDialog, ...)
  lib/                     everything that is not a screen
    types.ts               the data model (mirrors the Rust models)
    stores.ts              the project and UI state; thin wrappers that apply the pure rules below
    migrate.ts             upgrades older project files; CURRENT_SCHEMA_VERSION
    formats.ts             the story formats (novel, comic, screenplay) and their words
    model.ts, comic.ts, screenplay.ts       pure rules per format (ordering, counting, slug lines, ...)
    comicedit.ts, screenplayedit.ts         pure edit operations per format
    search.ts, replace.ts, snapshots.ts,    shared tools; each handles all formats
    wordcount.ts, goals.ts
    export/                writers: Word, EPUB, Markdown, text, PDF, Fountain, comic script, thumbnails
    platform/              the Platform layer (see below)
    patch.ts, mirror.ts    sending small changes to Rust
    persistence.ts         open, save, recover, folder: the flows that use the Platform
src-tauri/src/
  main.rs, lib.rs          the Tauri commands and the app's unsaved-work state
  models/mod.rs            Project, Scene, Character, Place, Issue, ComicPage, Act, ScriptScene, ...
  storage.rs               atomic writes, backups, recovery, themes, the Markdown folder format
  patch.rs                 applies small patches to Rust's copy of the project
tests/                     one test file per area; fakePlatform.ts is an in-memory pretend disk
themes/                    example colour themes
scripts/version.mjs        keeps the version equal in five files; checks a release tag
.github/workflows/         ci.yml (every push and PR) and release.yml (a version tag)
docs/                      these pages
```

The Rust side is small (about 2,000 lines in five files) and is planned to be split into one module per concern; see the [roadmap](../../ROADMAP.md).

## How a feature is put together

Features follow one pattern, which is what keeps them testable and easy to find:

1. **Pure rules** in a `src/lib/*.ts` module: functions that take a project and return a new one (or a result). No Svelte, no Tauri, no disk. Example: `screenplayedit.ts` (`addScene`, `moveElement`, `deleteScene`).
2. **A thin store wrapper** in `stores.ts` that runs the rule on the open project and marks it changed.
3. **A component** that shows the result and calls the wrapper.
4. **Tests** for the pure rules in `tests/`.

Anything that touches the machine goes through the Platform layer instead of calling Tauri directly.

## Adding a new story format

What the Screenplay mode needed, as a checklist (a Game Prototyping mode would follow the same path):

1. `types.ts` and `models/mod.rs`: the document's fields (empty and left out of the file for other formats), plus `Project::sample()`, which lists every field.
2. `migrate.ts`: a `vNToV(N+1)` step, the cleaning of the new fields in `normalize()`, and `CURRENT_SCHEMA_VERSION`; the same version in `SCHEMA_VERSION` in `models/mod.rs`.
3. `patch.ts` and `patch.rs`: add the new lists to the list of fields that patches handle.
4. `formats.ts`: the format, its words for its units, and `ready: false` until it is finished.
5. The pure rules, edit operations, Timeline and writing views.
6. The shared tools: search, replace, snapshots (whole-unit snapshots, auto snapshots, deleted units), word counts and goals.
7. Exports, then `ready: true`.
8. A test for each step, and an update of the user guide and these pages.

## The Platform layer

The app never calls Tauri or the operating system directly. Everything that needs the machine (file dialogs, reading and writing project files, recovery copies, the live mirror, imported themes, message boxes, the window's close button) goes through one interface, `Platform` (`src/lib/platform/types.ts`). The desktop implementation (`src/lib/platform/tauri.ts`) is the **only** file with Tauri `invoke`/dialog calls; `main.ts` installs it at start-up. Files and folders are identified by an opaque **`Location`** (a path on desktop; it could be a content URI on Android). App code never parses one: it asks the platform for a `displayName` (status bar, lists) or `describe` (tooltips), and the compiler enforces this with a branded type.

Why: a different backend (Android with content URIs, or Rust owning the whole project model) means writing another implementation of the same interface, not changing the editor, Timeline or save logic. It also makes the save/open/recovery logic testable: `tests/fakePlatform.ts` is an in-memory pretend disk with scripted dialog answers, and `tests/persistence.test.ts` checks flows such as start-up, Start fresh, reload recovery, Save, New story and opening old files against it.

## Rules that live in Rust

These are commands any front end can reuse (`src-tauri/src/storage.rs` holds the logic, `lib.rs` the commands):

- `open_project(path)`: reads and parses the file, and makes a one-off `.bak` of it first if it is older than the current schema (or has no version), so an upgrade can never destroy the original. If that backup fails, the open fails.
- `save_project(path, project, force_backup)`: atomic write with rotating backups (also drops any legacy recovery copy).
- `keep_unsaved(project, path)` / `unsaved_work()` / `discard_unsaved(keep_copy)`: one store for unsaved work. Reading prefers the in-memory copy, then `live.fabulator.json`, then the legacy `recovery.fabulator.json` from older versions (still read, never written). *Start fresh* uses `keep_copy` to move the newest copy to `discarded.fabulator.json` (one slot, replaced each time).

The web view no longer writes separate recovery files; autosave only saves projects that already have a file.
## Small changes instead of the whole project

The first send after a (re)start is the whole project; later sends are *patches* (`src/lib/patch.ts`): changed plain fields, plus per list (scenes, chapters, notes…) the items added or changed, the ids removed, and the full id order only when it changed. Typing in one scene sends that scene, not the book. Rust applies the patch to the copy it keeps (`src-tauri/src/patch.rs`, same rules, tested on both sides) via `keep_unsaved_changes`.

Safety net: every copy has a revision number. If Rust is not at the revision a patch was made for (restart, discard, a patch that doesn't fit), it drops the copy and answers "send everything"; the web view then sends the whole project. It also re-sends the whole project every 100 patches. Rust still rewrites `live.fabulator.json` on every update (disk cost only; nothing crosses the web view boundary).
## Saving from the copy Rust already holds

When you save, the web view first brings Rust's copy up to date (a small patch, or nothing if the mirror already did) and then says "save revision N to this file" (`save_unsaved`). Rust writes its own copy with the same rules as `save_project` (serialize first, rotating backup, atomic replace). The project is not sent a second time. If Rust has no copy, or it is at another revision, nothing is written and the web view saves the ordinary way (`save_project`). A failed write is reported as it is, never silently retried.
## Rust holds the project from the moment it is shown

When a project is opened, created or restored, the web view hands it to Rust (`keep_unsaved` with `dirty: false`). From then on Rust always has the current project: edits arrive as small patches (which mark the copy *unsaved* and write the recovery file), saves write Rust's copy, and after a save Rust is told to `settle_unsaved` (the copy stays in memory, the recovery files are removed, and the next edit is again a small patch). Only a copy with unsaved changes is ever offered for recovery; a clean held copy is never restored by mistake. Opening a different project replaces the held one with a whole-project send.

Still on the web view's side: opening a file (it needs the web view's upgrade step) and all editing logic. Moving the editing rules themselves into Rust is a larger step that can come when the app is more mature.
