# Shared tools

Tools that work in every mode: continuity, snapshots, search, find & replace and writing goals.

## Continuity: aliases and name highlighting

- **Abilities** (a power, a skill, a spell, a trade) are part of the shared world, like characters and places: add them in the Abilities panel, then tick them on a character's card. An ability's card shows who has it. They are found by Search.
- Characters, places and abilities have **aliases** (nicknames, titles, other spellings).
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

## Word count and writing goals (status bar, bottom right)

- The status bar shows the manuscript total and today's progress. Click it for details.
- Per-scene counts appear in the Manuscript scene list and under each Timeline card; chapter totals appear in Timeline headers and in the panel's *By chapter* list.
- A word is a run of letters/digits, optionally joined by an apostrophe or hyphen. "1,000" and "3.14" count once; an em dash separates words.
- **Daily goal** (0 = off): "written today" is the total minus the total at the start of the day. If you delete text, today's count never goes below zero. A new day starts automatically at local midnight. *Restart today's count* re-baselines it.
- **Manuscript target**: progress, percent and words remaining.
- Goals are stored per project in the app's local storage (not in the `.fabulator.json` file), so they are not shared when you copy the project to another computer.
