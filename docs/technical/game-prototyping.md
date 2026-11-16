# Design: Game Prototyping mode

> **Status: built.** All seven steps are done and Game Prototyping is ready; this page stays as the design record (the facts also live in the user guide and in the file-format page). It was written first because this mode is not a straight sequence like the other three: it is a **graph with state**, and the choices below shape the file format, the editor and the views. The decisions are at the end. When the mode is built, the facts move into the other technical pages and this page is deleted.

## What it is for

Fabulator is a **pre-production writing suite** (see the [roadmap](../../ROADMAP.md)). For a game, pre-production writing means the *narrative design*: which quests exist, what a player must have done or be able to do before a line, a branch or a quest becomes available, and what each choice changes. The writer needs to see that structure, write the text, and find the mistakes (a quest nobody can reach, a door that needs a key nobody can get) before anyone builds anything.

**Not goals.** It does not run or build the game, balance an economy, store art or audio, or execute scripts. It records conditions and effects as *data you can read and check*, not as code that runs. Images would only be references, as everywhere in Fabulator.

## The idea in one example

> **Side-quest "The Lost Ring"** (offered in the village)
> 1. *Beggar's plea*: the beggar asks for help. Available when `met_beggar` is not set.
> 2. *Search the well*: needs the ability **Climbing**. Effect: `has_ring = true`.
> 3. *Return the ring*: needs `has_ring`. Choices: give it back (effect: `reputation +1`) or keep it (effect: `reputation −1`, sets `ring_kept`).
> 4. *The beggar's secret*: only if the ring was given back and `reputation ≥ 1`.

A node, the things it needs (conditions), the things it does (effects), and where it leads.

## The model

Everything that belongs to the game lives under **one key**, `game`, as decided in the [file format](file-format.md#compatibility-rules-since-v12). Characters, places, abilities, notes, plotlines and snapshots stay in the shared world; the game points at them by id.

```json
{
  "story_format": "game",
  "game": {
    "quests":    [{ "id": "q-ring", "title": "The Lost Ring", "kind": "side", "summary": "", "plotline_id": "pl-village", "requires": [] }],
    "nodes":     [{ "id": "n-well", "quest_id": "q-ring", "order": 1, "title": "Search the well", "summary": "",
                    "elements": [], "ending": false, "requires": [{ "kind": "ability", "character_id": "", "ability_id": "ab-climbing" }],
                    "effects": [{ "kind": "set", "variable_id": "has_ring", "to": true }],
                    "links": [{ "id": "ln-1", "to": "n-return", "label": "", "requires": [{ "kind": "flag", "variable_id": "has_ring", "set": true }] }],
                    "place_ids": [], "character_ids": [], "status": "draft", "notes": "", "todos": [] }],
    "variables": [{ "id": "has_ring", "kind": "flag", "label": "Has the ring", "notes": "" },
                  { "id": "reputation", "kind": "number", "label": "Reputation", "notes": "" }],
    "items":     [{ "id": "it-key", "name": "Cellar key", "description": "" }]
  }
}
```

- **Quest** (the big unit, like a chapter or an act): a main quest or a side-quest, ordered, with an optional condition for being offered at all.
- **Node** (the small unit, like a scene or a page): one story beat, encounter or conversation. It has the usual shared fields (summary, status, cast, places, tags, colour, notes, to-dos) so Search, Replace, Snapshots and goals work like in the other formats.
- **Elements** inside a node reuse the screenplay idea: *narration*, *dialogue* (a speaker, the words), *choice* (the player's options, each with its own condition, effect and target) and a private *note*.
- **Links** connect nodes. A link may carry a condition ("only if…"). A node with several outgoing links is a branch.
- **Conditions** (`requires`) are a list of small structured rows, all of which must hold; a row is one of: a flag is set / not set, a number compares to a value, the player has an item, **a character has an ability** (this is where the shared abilities pay off), another node was completed. Groups of "any of" are allowed one level deep. The app *shows* them as readable text ("Climbing and has the ring") but stores them as data, so they can be checked.
- **Effects** are rows as well: set a flag, add to a number, give or take an item, grant an ability, mark a node done.
- **Variables and items are declared** in a registry, not invented inside conditions. That is what makes checking possible and avoids typos creating new flags by accident.

## What the app can check (the point of the mode)

Because conditions and effects are data, a **Check** report can say, without running anything:

- nodes and quests that **cannot be reached** from the start, and branches that lead nowhere (dead ends that are not marked as an ending);
- a condition that needs a flag or item that **nothing ever sets or gives**;
- a flag that is **set but never used**;
- two links out of one node whose conditions **overlap** or **leave a gap**;
- an ability a quest needs that **no character can have** yet.

A simple **Playtest** sets some starting state by hand (flags, items, abilities) and lists which nodes are available, so a writer can ask "what can a player who skipped the beggar do?". It follows the data; it is a planning aid, not a game engine.

## The views

- **Timeline:** quests as lanes (main quest first, side-quests under it) with their nodes in order, and a small badge on every node that has conditions or effects. Branches show as forks inside the lane. This keeps the familiar "plan on a timeline" feel.
- **Graph:** a node-and-arrow diagram of one quest or of everything, drawn by a small layered layout written for Fabulator (no new library), with conditions on the arrows. Read-only first; editing happens in the node.
- **Writing view (Manuscript):** one node at a time: its text elements, then its conditions, effects and links as simple forms.
- **Cast / Reports:** which quests a character or place appears in, which abilities a quest needs, a table of all variables and where each is set and read.

## File and code impact

- A new format id `game` in `formats.ts` (not ready until its steps are done) and schema **v13**: adding `game` is additive, so `min_reader_version` stays 12; an older app refuses the file only because it does not know the `game` format, with its usual clear message.
- Rust keeps the whole `game` object untouched through `extra` (see the [compatibility rules](file-format.md#compatibility-rules-since-v12)), so saving, backups and recovery need no change. Patches need one extension: list names may be a path (`"game.nodes"`), so editing one node still sends a small patch instead of the whole `game` object.
- A snapshot may hold a whole node (like a page or a screenplay scene), so history works the same way.
- The Markdown folder export writes each quest as a folder and each node as a Markdown file with the conditions in the header, in the same spirit as the novel export.

## Exports

For pre-production the useful outputs are documents: a **quest bible** (Word/PDF: every quest, its nodes, conditions in words, effects), a **state table** (CSV of variables, items and where they are set and read), and a **node list** (CSV). Machine formats for prototyping tools (Ink, Twee/Twine, Yarn) come later and only if wanted: they are one-way exports, since those formats carry code the app would not understand.

## Steps (each its own pull request, like Comic and Screenplay)

1. **Data:** the `game` model, schema v13, the format entry (not ready), Rust sample and tests, docs. ✅ done.
2. **Timeline:** quest lanes and nodes, add / move / delete, status and colour. ✅ done (File → New game (preview)).
3. **Writing view:** the node editor with its text elements, choice options and plain links (no conditions yet). ✅ done.
4. **State and rules:** the registry of variables and items, the conditions and effects editors, readable text for them. ✅ done (State panel; `gamerules.ts`).
5. **Check, Playtest and Graph:** the checks above, the playtest, the graph view. ✅ done (Tools → Check & playtest…; Lanes | Graph toggle on the Timeline; `gamecheck.ts`, `gameplay.ts`, `gamegraph.ts`).
6. **Exports:** quest bible, CSVs, the Markdown folder. ✅ done (`export/game.ts`, `gamefolder.ts`; the bible reuses the Word / EPUB / Markdown / text writers; no PDF yet; the game folder is one-way).
7. **Shared tools:** Search, Replace, Snapshots, goals for nodes; the format becomes ready. ✅ done (a snapshot may hold a whole node; `gamesnapshots.ts`). Game Prototyping is **ready**. Still open for later: Markdown folder that can be opened again, PDF for the quest bible, reports for games (variables per quest, cast per quest), dotted list names in patches.

## Decisions

The six open questions were answered "all recommended" by the project owner:

1. **Hierarchy:** Quest → Node (a level above quests can be added later without breaking files).
2. **Conditions:** structured rows shown as readable text, not an expression language.
3. **Variables:** declared in a registry.
4. **First exports:** quest bible and CSVs; machine formats (Ink / Twee / Yarn) later, if wanted. No prototyping tool needs to come first.
5. **Graph drawing:** our own small layered layout, no library.
6. **Dialogue:** the screenplay element shape (speaker, parenthetical, text).
