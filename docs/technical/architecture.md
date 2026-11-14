# Architecture

How the app is built: the stack, the folder layout, and where the rules live (web view and Rust).

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

## Architecture: the Platform layer

The app never calls Tauri or the operating system directly. Everything that needs the machine (file dialogs, reading and writing project files, recovery copies, the live mirror, imported themes, message boxes, the window's close button) goes through one interface, `Platform` (`src/lib/platform/types.ts`). The desktop implementation (`src/lib/platform/tauri.ts`) is the **only** file with Tauri `invoke`/dialog calls; `main.ts` installs it at start-up. Files and folders are identified by an opaque **`Location`** (a path on desktop; it could be a content URI on Android). App code never parses one: it asks the platform for a `displayName` (status bar, lists) or `describe` (tooltips), and the compiler enforces this with a branded type.

Why: a different backend (Android with content URIs, or Rust owning the whole project model) means writing another implementation of the same interface, not changing the editor, Timeline or save logic. It also makes the save/open/recovery logic testable: `tests/fakePlatform.ts` is an in-memory pretend disk with scripted dialog answers, and `tests/persistence.test.ts` checks flows such as start-up, Start fresh, reload recovery, Save, New story and opening old files against it.

## Rules that now live in Rust

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
