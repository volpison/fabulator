# Fabulator roadmap

This file records where Fabulator is going and, just as important, where it is **not** going. It is a direction, not a promise or a schedule.

## What Fabulator is

A **pre-production writing suite**. Two ideas, both on purpose:

- **Pre-production**, not mid- or post-production. Fabulator is where a project is planned and written down *before* it is made. It does not draw, film, record, edit or build the final thing.
- **Writing suite**, not just a story editor. It holds the whole world of a project (characters, places, their abilities, notes, continuity) together with the story itself on a timeline, and it offers several formats for writing that story: Novel, Comic, Screenplay and, later, Game Prototyping.

## Scope rule

> Fabulator handles **text, structure and planning**. Images appear only as **references and thumbnails** (a layout sketch, an imported storyboard frame). Fabulator never edits or produces images, video or audio.

A feature belongs if it **helps plan the work**. It does not belong if it **does the work** of another production stage (drawing, filming, editing, composing). No "all-in-one studio" that merges pre-, during- and post-production tools.

## One core, several formats

```
        Characters · Places · Abilities · Notes · Continuity
              Timeline · Snapshots · Export · Reports
                              │
     ┌───────────┬────────────┴───────────┬──────────────┐
     ▼           ▼                        ▼              ▼
   Novel     Screenplay                Comic       Game Prototyping
 chapter →   act → scene           issue → page →   quests, side-quests,
  scene      slug / action /          panel         conditions and rules
 long prose  dialogue             action / dialogue  (planned; a graph,
                                  caption / SFX      not a straight line)
```

The shared parts (cast, places, notes, plotlines, story time, snapshots, themes, backups, export) are the same in every format. Only the document shape, the editor, and the Timeline/Manuscript views change. **Abilities** (what a character can do) are planned as a shared part too, so every format and the game mode can use them.

## Order of work

1. **Formats refactor** ✅ (its own small step). Give the project model a clear "format" with its own document shape on top of the shared parts, with schema migration. Novel mode keeps working exactly as today.
2. **Comic mode** (in steps: data ✅ → Timeline of pages ✅ → writing view ✅ → script exports ✅: full script, plot for the artist, lettering script, thumbnail sheet; shared tools (search, replace, snapshots, goals) ✅). Issue → page → panel. A panel is a general *frame* with structured fields (description, caption, dialogue lines with speaker, SFX), built so it can be reused later. The Timeline shows pages grouped in spreads (page-turn reveals matter); a page can carry a layout note (tiers, e.g. "3 tiers: 2/1/3", or "splash"). Gutters are not modelled. Manuscript becomes a script view (dialogue first, action as small notes). Checks: dialogue length per panel, panels per page, balloon order. Export: standard comic-script layout, and a per-page thumbnail sheet for artists.
3. **Screenplay mode** (in steps: data ✅ → Timeline of scenes ✅ → writing view ✅ → exports ✅ → shared tools ✅ → reports ✅; screenplay is ready). Act → scene, slug line / action / dialogue / parenthetical / transition, industry-standard formatting (including CONT'D), page-count and running-time estimate, scene/character/location reports, export to PDF and Fountain (and possibly `.fdx`). Places and time of day come from the slug line.
4. **Foundations** (before the fourth mode, so it is built on a clean base): ✅ release 0.2.0 as a checkpoint → this roadmap and the README's positioning → ✅ documentation split into a `docs/` folder with a short README → ✅ the Rust sources split into more files (a pure move, no behaviour change) → ✅ a written file-format standard (schema v12: unknown fields kept, a format marker with a minimum reader version, abilities; new formats get their own key) → the Game Prototyping design doc. The file keeps its `.fabulator.json` name.
5. **Game Prototyping mode**: the same shared core with different priorities. Side-quests next to the main quest, and *conditional rules* (what must be true for a quest, line or branch to be available: flags, items, abilities, earlier choices). Unlike the other three it is not a straight sequence but a **graph with state**, so it gets a design document first (units, how conditions are written and checked, how the Timeline shows it), then steps like Comic and Screenplay had. It prototypes and plans a game's writing and structure; it does not build the game.
6. **Storyboard** as an extension of Screenplay: a shot is the same *frame* as a comic panel, plus camera data (shot type, movement).

Questions to settle when Comic starts: full-script versus plot-first (Marvel-method) scripts, whether one project may mix formats (for example a prose scene with its comic adaptation), and whether panels need their own story-time.

## Other ideas (not scheduled)

- Typewriter mode, and font and column-width options for focus mode.
- A detachable side-panel window.
- Android port (Tauri 2 mobile, same repository; content-URI file access is the main change; the Platform layer is already in place).
- Release builds from a tag (CI workflow exists; 0.2.0 is tagged).

## Already done

The groundwork for formats and for other front ends: a Platform layer (all machine access behind one interface), open/backup/recovery rules in Rust, and Rust holding the current project with small patches and saves from its own copy. See [Architecture](docs/technical/architecture.md).
