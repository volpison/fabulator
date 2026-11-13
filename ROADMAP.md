# Fabulator roadmap

This file records where Fabulator is going and, just as important, where it is **not** going. It is a direction, not a promise or a schedule.

## What Fabulator is

A **pre-production tool for text and scripting**: it helps you plan and write a story, and keep track of everything in it (characters, places, time, continuity). It does not make the final images, video or audio.

## Scope rule

> Fabulator handles **text, structure and planning**. Images appear only as **references and thumbnails** (a layout sketch, an imported storyboard frame). Fabulator never edits or produces images, video or audio.

A feature belongs if it **helps plan the work**. It does not belong if it **does the work** of another production stage (drawing, filming, editing, composing). No "all-in-one studio" that merges pre-, during- and post-production tools.

## One core, several formats

```
                Characters · Places · Notes · Continuity
                Timeline / sequence · Snapshots · Export
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
     Novel                 Screenplay              Comic
  chapter → scene       act → scene            issue → page → panel
  long prose            slug / action /        action / dialogue /
                        dialogue               caption / SFX
```

The shared parts (cast, places, notes, plotlines, story time, snapshots, themes, backups, export) are the same in every format. Only the document shape, the editor, and the Timeline/Manuscript views change.

## Order of work

1. **Formats refactor** ✅ (its own small step). Give the project model a clear "format" with its own document shape on top of the shared parts, with schema migration. Novel mode keeps working exactly as today.
2. **Comic mode** (in steps: data ✅ → Timeline of pages ✅ → writing view ✅ → script exports ✅: full script, plot for the artist, lettering script, thumbnail sheet; shared tools (search, replace, snapshots, goals) ✅). Issue → page → panel. A panel is a general *frame* with structured fields (description, caption, dialogue lines with speaker, SFX), built so it can be reused later. The Timeline shows pages grouped in spreads (page-turn reveals matter); a page can carry a layout note (tiers, e.g. "3 tiers: 2/1/3", or "splash"). Gutters are not modelled. Manuscript becomes a script view (dialogue first, action as small notes). Checks: dialogue length per panel, panels per page, balloon order. Export: standard comic-script layout, and a per-page thumbnail sheet for artists.
3. **Screenplay mode** (in steps: data ✅ → Timeline of scenes → writing view → exports → shared tools and reports, then ready). Act → scene, slug line / action / dialogue / parenthetical / transition, industry-standard formatting (including CONT'D), page-count and running-time estimate, scene/character/location reports, export to PDF and Fountain (and possibly `.fdx`). Places and time of day come from the slug line.
4. **Storyboard** as an extension of Screenplay: a shot is the same *frame* as a comic panel, plus camera data (shot type, movement).

Questions to settle when Comic starts: full-script versus plot-first (Marvel-method) scripts, whether one project may mix formats (for example a prose scene with its comic adaptation), and whether panels need their own story-time.

## Other ideas (not scheduled)

- Typewriter mode, and font and column-width options for focus mode.
- A detachable side-panel window.
- Android port (Tauri 2 mobile, same repository; content-URI file access is the main change; the Platform layer is already in place).
- Release builds from a tag (CI workflow exists).

## Already done

The groundwork for formats and for other front ends: a Platform layer (all machine access behind one interface), open/backup/recovery rules in Rust, and Rust holding the current project with small patches and saves from its own copy. See "Architecture" in the README.
