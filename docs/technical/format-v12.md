# Proposal: the project file format, schema v12

> **Status: proposal.** Nothing here is implemented yet. It is written first so the decisions can be agreed before code changes. When it is built, the facts move into [The project file format](file-format.md) and this page is deleted.

## Why

The file is the user's work, and it has to outlive the app version that wrote it. Today's format works, but four gaps (listed in [Known limits](file-format.md#known-limits-planned-for-schema-v12)) get worse with every new mode:

1. **Unknown fields are dropped on save.** Rust saves through its own `Project` structure.
2. **Nothing says "this is a Fabulator file"**, or which reader version it needs.
3. **Every format adds more top-level lists**, mixed in with the shared world.
4. **There is no place for abilities** (a character's powers, skills, spells), which the [roadmap](../../ROADMAP.md) names as part of the shared world and which Game Prototyping needs.

## Principles

- **Additive first.** Old files must keep opening; the upgrade step is small and the backup rule stays as it is.
- **Never lose what we don't understand.** A reader keeps fields it does not know and writes them back.
- **Refuse, don't guess.** A file that needs a newer reader is refused with a clear message.
- **One shared world, many documents.** The world is the same in every format; each format owns only its document.
- **Keep the name** `.fabulator.json` (decided earlier).

## The changes

### 1. Keep unknown fields (Rust)

`Project` (and the shared entities) gain a catch-all that holds every field the structure does not list, and writes them back on save:

```rust
#[serde(flatten)]
pub extra: serde_json::Map<String, serde_json::Value>,
```

The web side already keeps unknown fields (`normalize()` spreads the project). Patches already work on raw JSON, so they need no change. A test saves a file with an invented field and checks it is still there.

### 2. A format marker and a minimum reader version

Two small top-level fields:

```json
{
  "file_type": "fabulator-project",
  "min_reader_version": 12,
  "schema_version": 12
}
```

- `file_type` lets Fabulator say "this is not a Fabulator project" for any other JSON file, instead of a confusing error.
- `min_reader_version` is the lowest schema version that can open the file *safely*. It is normally equal to `schema_version`, but a later, purely additive change may leave it lower, so a v12 app can still open a v13 file (keeping the fields it does not know, per change 1) instead of refusing it. The refusal rule becomes: refuse when `min_reader_version` is higher than this app's version. Apps older than v12 do not know the field and keep refusing any newer `schema_version`, as today.

### 3. Abilities in the shared world

A new shared list, `abilities[]`, next to characters and places:

```json
{ "id": "ab-1", "name": "Shape-shifting", "description": "", "tags": [], "notes": "" }
```

A character gains `ability_ids: string[]` (empty by default, left out when empty). Abilities appear in the side panels and in Search like places do. Game Prototyping will attach rules and conditions to them later; v12 only adds the entity and the link.

### 4. Where documents live: decided, option A

**Decision (by the project owner): option A.** Option B is kept below for the record.

Option **A** (chosen): **namespace new formats, leave the existing ones flat.**
Novel, Comic and Screenplay keep their current top-level fields, so no existing file or code path changes. From now on a new format stores everything under one key named after it (`"game": { ... }`), and unknown fields are preserved (change 1), so a newer file does not lose its document in an older reader. The cost is a small inconsistency: three formats are flat, the next ones are namespaced.

Option **B**: **move everything into `world` and `document` objects now**:

```json
{ "world": { "characters": [], "places": [], "abilities": [], "notes": [], "plotlines": [], "snapshots": [] },
  "document": { "chapters": [], "scenes": [] } }
```

This is the tidiest file, but it touches the whole app: the Rust model, the patch lists, every one of the ~70 places the web side reads `characters`, `scenes`, and so on, the Markdown export, and every test. It is a large change that would not add a feature for users, and it is the riskiest way to spend a schema bump.

Option B can still happen later, as its own step, because change 2 (`min_reader_version`) makes a restructuring safe to introduce.

## The migration (v11 → v12)

`v11ToV12` adds `file_type`, `min_reader_version: 12`, and an empty `abilities` list; `normalize()` cleans `abilities` and each character's `ability_ids`. The same fields are added to the Rust models with `#[serde(default)]`, `CURRENT_SCHEMA_VERSION` and `SCHEMA_VERSION` become 12, `abilities` joins the patch list in both `patch.ts` and `patch.rs`, and `Project::sample()` lists the new fields. The usual untouched backup is made before an older file is written back.

## Build order

1. Keep unknown fields (Rust), with its test. No version change.
2. The marker, `min_reader_version` and the clearer refusal messages; schema v12.
3. Abilities: data, side panel, Search, Markdown export, docs.
4. Move the facts into [The project file format](file-format.md), delete this page.

## What this does not change

Folders of Markdown, exports, recovery copies and backups behave as before. The extension stays `.fabulator.json`.
