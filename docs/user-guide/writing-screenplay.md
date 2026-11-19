# Writing a screenplay

The Screenplay mode: acts and scenes with slug lines, action, dialogue and transitions. Exports are in [Export](export.md).

## Screenplay Timeline (scenes)

For a screenplay the Timeline shows each **act** (rename it in place; an empty act can be deleted) with its **scenes** as cards numbered through the whole script. A card shows the **slug line** in script style (`INT. KITCHEN - DAY`), the working title, the start of the summary, the **estimated page length** (in eighths, "1 3/8 pg") and word count, a **status** menu (Idea / Draft / Revised / Final) and an optional colour strip. Use ◀ ▶ to move a scene earlier or later in its act, ✕ to delete it (asks first unless it is empty), **+ Add scene** / **+ Add act** to grow the script. The toolbar shows the whole script's length ("about N min": one page ≈ one minute is a rule of thumb, not a timing). Click a scene to edit its **INT/EXT, location, time** (suggestions from your Places and common times of day), status, working title, plotline, colour, summary and private notes in the panel below. Double-click a scene (or press Enter on it) to write it. The rules (adding, moving, deleting, summaries) are pure functions in `src/lib/screenplay/screenplayedit.ts`. Deleting a scene does not keep a copy yet (screenplay snapshots come with the shared tools).

## Screenplay writing view (Manuscript)

For a screenplay the Manuscript view lists the scenes on the left (number, slug line, estimated pages) and writes one scene on the right, on a monospace "script page". Above it: the **slug line** (INT/EXT, location, time; a location that matches a Place in your Cast puts that place on the scene), the status, the scene's page length and word count, and a collapsible summary.

The scene is a list of **elements**: *action*, *dialogue*, *transition* and private *notes* (a yellow dashed box; never exported). Dialogue shows the character, the extension (V.O., O.S.…), an optional parenthetical and the words; "(CONT'D)" appears by itself when the same character speaks again with only action between. Writing is keyboard-first:

- **Enter** adds the next element (an action); **Shift+Enter** is a new line inside one.
- **Ctrl+Enter** adds a dialogue for the *other* speaker (the nearest earlier one), for quick back-and-forth.
- **Backspace** on an empty element removes it; **↑ / ↓** at the start or end of an element move to the previous or next one.
- Each element has a type menu and ▲ ▼ ✕ (shown when you point at it).
- Typing a **new name** in a dialogue's character box creates that character (and puts them on the scene's cast); an existing name or alias picks them. ALL-CAPS names are stored as "Maria".
- The first words written in an *Idea* scene make it a *Draft*.

## Screenplay: Search, Find & replace, Snapshots, goals

- **Search** (Ctrl+F) finds scenes by slug line, working title, synopsis, action, dialogue (the speaker's name counts as part of the line) and tags, private notes included, plus acts by title and summary. Results say "Act 1 · Scene 3".
- **Find & replace** (Ctrl+H) works on action, dialogue words, parentheticals, transitions and private notes ("Action and dialogue"), working titles and synopses. The slug line and speaker names are structured data and are not touched (rename a character or place in the Cast instead). Each changed scene first gets a safety snapshot, so it can be undone from Snapshots.
- **Snapshots** keep a whole scene (slug, summary, elements): take one by hand, get automatic ones while you write (at most one every 30 minutes per scene), a safety copy before a restore, a replace or a delete. A deleted scene with writing can be brought back from *Deleted scenes*, at the end of its act. Restoring brings back the writing (title, summary, slug, elements); cast, colour and notes stay as they are.
- **Goals and word counts** include screenplays: the status bar counts action, dialogue and transitions (not private notes or slug lines), and the Goals panel lists words by act.

## Screenplay reports

*Tools → Reports…* (screenplays only) has three tabs, all worked out from the script and always current: **Scenes** (number, slug line, act, estimated pages, words, who speaks; click a slug line to go to the scene), **Characters** (scenes, scenes where they speak, lines and words of dialogue, scene numbers; the one with most dialogue first, characters only listed on a scene's cast come last) and **Locations** (grouped by location name regardless of capitals: INT/EXT, times of day, scenes, pages, so you can see what a shoot needs most). *Save as CSV…* writes the tab you are on for Excel, Numbers or Sheets. The rules are in `src/lib/screenplay/screenplayreports.ts`.

Not for screenplays yet: exporting a Markdown folder.
