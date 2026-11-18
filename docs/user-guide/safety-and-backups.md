# Safety, backups and recovery

How Fabulator protects your work, and the Markdown folder format for keeping a story in git.

## Saving and crash recovery

- **Safe saving**: autosave (3 s after you stop typing, at most 15 s apart), atomic writes, rotating backups in `<file>.backups/`, and unsaved-changes guards on Open / Sample / window close
- **Crash recovery for unsaved projects**: a project that has no file yet is copied to the app's data folder while you write (same timing as autosave). If Fabulator closes unexpectedly, it offers to restore it next time. *Start fresh* keeps one "discarded" copy aside instead of deleting it. The copy is removed once you save to a file or close on purpose.

## Open recent (File → *Open recent*)

The File menu lists the last ten project files you opened or saved (newest first; same-named files show their full location). Choosing one opens it with the usual unsaved-changes protection. A file that is gone (moved, deleted, drive unplugged) is reported and removed from the list; **Clear list** empties it. The list is remembered between sessions.

## Project as a folder of Markdown (File → *Export as folder…* / *Open folder…*)

Writes the story as plain files you can version with git, diff, and edit in any editor:

```
my-story/
  project.json                          title, premise, plotlines, characters, places, abilities
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

## On an Android tablet

Stories are kept inside the app and copies are made when you open or export a file: see [Fabulator on an Android tablet](android.md).
