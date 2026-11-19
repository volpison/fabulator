# Design: folders for the front end

Status: **approved**; steps 2 (`src/lib`), 3 (`src/components`) and 4 (`stores.ts`) are done. Nothing here changes behaviour. It does for `src/` what the Rust split did for `src-tauri/`: each file answers "what is this for?" in one sentence, and the folder it sits in says which part of the app it belongs to.

## Why

- `src/lib` holds **60 files side by side** and `src/components` **37**. Only `platform/` and `export/` are in folders.
- Prefixes do the job a folder should: `comic`, `comicedit`; `game`, `gameedit`, `gamerules`, `gamecheck`, `gameplay`, `gamegraph`, `gamefolder`, `gamesnapshots`; `screenplay`, `screenplayedit`, `screenplayreports`; ten files about themes.
- The few files that do too much are hard to see in a flat list: `stores.ts` (1,201 lines, 121 exports, three modes' actions under one heading), `TimelineView.svelte` (1,130), `ManuscriptView.svelte` (797), `SidePanel.svelte` (793).
- Adding a mode today means adding files to two flat folders. The convention is that adding a feature adds files in one place (see [Architecture](architecture.md)).

## Rules

1. **Folders follow responsibility, then mode.** Shared model and rules first; each mode (novel, comic, screenplay, game) has its own folder; tools shared by all modes have theirs.
2. **A folder may import only from folders below it** (the layers below). This is checked by a test, so the structure cannot quietly rot.
3. **No catch-all `index.ts` re-exports.** An import names the file it needs, so where things live stays visible and circular imports stay out.
4. **Names do not change in a move.** `comic.ts` becomes `comic/comic.ts`. Renames are a separate decision.
5. **A pure move and a behaviour change are separate pull requests.**
6. **Tests stay flat for now** (56 files whose names already carry the area). The test script's glob stays `tests/*.test.ts`. Revisit after the moves.
7. `platform/` and `export/` stay as they are. `src/main.ts`, `src/App.svelte`, `src/app.css` stay in `src/`.

## `src/lib` after the move

| Folder | What it is for | Files |
|---|---|---|
| `model/` | The project data and the pure rules over it, for every mode | `types`, `textcount`, `formats`, `model`, `labels`, `plotlines`, `scenenotes`, `storytime`, `appearances`, `mentions`, `patch` |
| `comic/` | Comic: pages, panels, lettering | `comic`, `comicedit` |
| `screenplay/` | Screenplay: acts, scenes, elements, reports | `screenplay`, `screenplayedit`, `screenplayreports` |
| `game/` | Game Prototyping: quests, nodes, rules, check, playtest, graph | `game`, `gameedit`, `gamerules`, `gamecheck`, `gameplay`, `gamegraph`, `gamesnapshots` |
| `tools/` | Tools shared by all modes | `search`, `replace`, `snapshots`, `diff`, `goals`, `wordcount` |
| `export/` | Writing a project out (unchanged) | 16 files |
| `platform/` | Everything that needs the machine (unchanged) | 4 files |
| `files/` | Starting, opening, saving and recovering a project; project-as-a-folder | `blank`, `migrate`, `mirror`, `persistence`, `folder`, `gamefolder`, `mdbody`, `recent`, `recentStore` |
| `appearance/` | Colour themes and appearance settings | `appearance`, `settings`, `themes`, `themegen`, `themelib`, `theme-file`, `base16`, `vscode`, `gallery`, `userthemes` |
| `editor/` | Writing aids for the text editor (Tiptap extensions and their logic) | `atMention`, `atMentionExtension`, `currentBlockExtension`, `mentionExtension`, `searchExtension`, `typewriter` |
| `app/` | The running app's shared state and shell logic (Svelte stores, menus, layout, guards) | `stores/` (13 files, see step 4), `goalsStore`, `menu`, `layout`, `guards`, `webviewGuards`, `keyboard` |

Every one of the 60 files is in exactly one row.

### Layers (what may import what)

Checked against the real imports today; the arrows below are the only ones that exist.

```
files  →  app, comic, export, game, model, platform, screenplay
app    →  comic, game, model, platform, screenplay, tools
editor →  appearance, model, tools
tools  →  comic, export, game, model, screenplay
export →  comic, game, model, screenplay
game   →  model, tools (one import, see below)
comic, screenplay, platform → model
appearance → platform
model → nothing else in the app
```

Read it as layers, top to bottom: `files` and `editor` on top; then `app`; then `tools`; then the modes and `export`; then `model` and `platform`.

**No exceptions.** A first version had one loop between `game` and `tools`, because `game/gameedit.ts` needed the word-counting rule. The rule (what counts as a word) now lives in `model/textcount.ts`, and `tools/wordcount.ts` builds scene, chapter and project totals on it.

Three files were placed to avoid loops that a first sketch had: `mentions` and `patch` in `model/` (used by `model/appearances` and by `platform/types`), and `gamefolder` in `files/` next to `folder` (it uses `export/`).

## `src/components` after the move

Every component is imported by one view of one mode (or by `App.svelte`), so most of them belong to a mode.

| Folder | Files |
|---|---|
| `shell/` (the frame around every mode) | `TopBar`, `Menu`, `ViewMenu`, `StatusBar`, `GoalsPanel`, `SidePanel`, `Appearances`, `CastView`, `FormatNotReady` |
| `novel/` | `TimelineView`, `ManuscriptView`, `ChronologyView`, `FilterBar`, `PlotlineLabel`, `SceneLabels`, `SceneNotes`, `WhenField`, `ContinuityPanel`, `RichTextEditor` |
| `comic/` | `ComicTimeline`, `ComicManuscript` |
| `screenplay/` | `ScreenplayTimeline`, `ScreenplayManuscript`, `ReportsDialog` |
| `game/` | `GameTimeline`, `GameManuscript`, `GameGraph`, `GameCheckDialog`, `RulesEditor`, `EffectFields`, `SimpleConditionFields` |
| `dialogs/` (shared by all modes) | `ExportDialog`, `SearchDialog`, `ReplaceDialog`, `SnapshotsDialog`, `ThemesDialog`, `ThemeGallery` |

9 + 10 + 2 + 3 + 7 + 6 = all 37. `RichTextEditor` is only used by the novel writing view today, so it sits in `novel/`; it can move if another mode starts using it.

## Steps (each its own pull request)

1. **This design** (docs only). Say yes, or change any row.
2. **Move `src/lib`** into the folders above, with a script that rewrites every import (in `src/`, in `tests/`, and the test loader), plus `tests/structure.test.ts`, which fails when a folder imports from a folder above it (no exceptions). Pure move: the 531 tests and CI's front-end build are the check.
3. **Move `src/components`** into its folders, with the same kind of script. Pure move. CI's front-end build is the only check for Svelte imports. `tests/structure.test.ts` also checks that no component imports a component from another folder.
4. **Split `stores.ts`** (done) into `app/stores/`: `core` (the open project, save state), `ui` (views, selection, dialogs, filter), `edit` (apply a pure edit with auto snapshots), `search`, `scenes`, `chapters`, `plotlines`, `comic`, `screenplay`, `game`, `snapshots`, `cast` (characters, places, abilities and their links to scenes) and `notes`. Every function moved as it was (same lines, same names); importers name the new file (no re-export file). `core` imports no sibling and the modules have no loops (a test checks both).
5. **Small follow-up** (done): `countWordsInText` moved to `model/textcount.ts`, which removed the `game` ↔ `tools` exception. The structure test has no exceptions list any more.
6. **Only if worth it:** split `TimelineView` and `ManuscriptView` by pulling out sub-components (a scene card, a chapter header). Done where a file has a clear "and" in its description, not because it is long: much of their length is style rules.

Each step updates [Architecture](architecture.md) and, where a file is named, the other docs, in the same pull request.

## Risks and how they are handled

- **Svelte cannot be built in the authoring environment.** A wrong import in a component would show only in CI. The move script checks that every relative import resolves to an existing file before pushing, and CI's front-end build runs on the pull request.
- **Conflicts with other open work.** A move touches almost every file, so it is done while no other pull request is open.
- **History.** `git mv` keeps file history reachable (`git log --follow`); a reviewer sees renames, not rewrites.
- **Imports get longer** (`../../lib/model/types`). Acceptable; short aliases (`$lib/…`) would be a separate, later decision.

## Not in this proposal

Renaming files, merging files, changing any behaviour, mirroring the folders in `tests/`, and the Rust side (already split).
