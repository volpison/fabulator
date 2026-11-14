# Writing a comic

The Comic mode: issues, pages and panels. Plot-first (Marvel-style) or full-script. Exports are in [Export](export.md); Search, Replace, Snapshots and goals are in [Shared tools](shared-tools.md) and work on pages.

## Comic Timeline (pages)

For a comic the Timeline shows each **issue** (rename it in place; an empty issue can be deleted) with its pages grouped **the way a reader sees them**: page 1 alone on the right, then facing pairs (2–3, 4–5…), and a last even page alone on the left. Each page card shows its number and side, **Page turn** on the pages revealed by turning, its title, the start of its plot, the number of panels, the planned layout and a **stage** menu (Plot → Art received → Dialogue → Lettered); the issue header counts pages, panels and pages per stage. Use ◀ ▶ to move a page earlier or later, ✕ to delete it (asks first unless it is empty), **+ Add page** / **+ Add issue** to grow the comic. Click a page to edit its **title, layout, stage, plot and private notes** in the panel below: enough to write a whole plot-first comic. Double-click a page (or press Enter on it) to write its panels. The rules (adding, moving, deleting, spreads, summaries) are pure functions in `src/lib/comicedit.ts`.

## Comic writing view (Manuscript)

For a comic the Manuscript view lists the pages on the left (with stage dots) and edits one page on the right. The page's **plot** comes first; in a *full script* comic it folds into a short "Page summary" once there are panels. Below it, the **panels**: each has a description (what the artist draws) and an ordered list of **lines**: dialogue, caption, thought or SFX, with a speaker (characters already on the page are listed first), the text and a lettering note. The line order is the balloon reading order (numbered). Move panels and lines with ▲ ▼, delete with ✕ (a panel with content asks first). Giving a line to a character also adds them to the page's cast, so the continuity tools stay true. Gentle warnings (never blocks): a balloon over 25 words, a panel with over 45 words of lettering, a page with over 9 panels. Sound effects don't count as words. The rest of the shared tools work on pages too:

- **Search** finds pages (title, plot, every panel's description and lettering, speaker names, tags) and issues. Opening a hit goes to the page in the writing view (search words are not highlighted inside the page yet).
- **Find & replace** changes the plot, panel descriptions, dialogue/caption/SFX text and lettering notes (and, if ticked, page titles). Each changed page is saved as a safety snapshot first.
- **Snapshots** keep a whole page (plot, panels, lines): yours, automatic (when the writing changes, at most every 30 minutes) and safety copies before a restore, a replace or a delete. Compare shows the page as readable text; *Deleted pages* brings a deleted page back at the end of its issue.
- **Goals and word counts** count the plot, panel descriptions and every line (SFX too). "By issue" replaces "By chapter".

Still not for comics: the "Export as folder (Markdown)" command.
