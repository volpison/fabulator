# Export

Every way to get your work out of Fabulator: the Export dialog for Novel, Comic and Screenplay, and the Markdown folder.

## Export (top bar → *Export*, or Ctrl/Cmd+E)

Gets your story out of the app as **Word (.docx)**, **EPUB**, **Markdown** or **plain text**.

- Scope: the whole story, the chapter of the selected scene, or just the selected scene.
- Options: author, chapter headings, scene titles (or a scene break: `* * *`, blank line, none),
  page size (A4 / US Letter) and language code for Word and EPUB. Your choices are remembered.
- Order is the book order (chapters, then scenes). Scenes and chapters with no text are skipped.
- Bold, italic, strikethrough, headings, quotes, lists and hard line breaks are kept.
- Word output uses real styles (Title, Heading 1, Quote…), manuscript-style spacing and a
  title page. EPUB has a contents page, one file per chapter.
- Nothing is changed in your project; the export is written atomically to the file you pick.

## Comic exports

**File → Export…** on a comic offers four kinds, for the whole story, the issue of the selected page, or just that page (the first three in Word, EPUB, Markdown or plain text):

- **Full script**: for each page, its heading (number, title, panel count, a note when it is a page-turn reveal), optionally the page plot, then each panel with its description and its lettering in order: `NAME: text`, `NAME (thought): text`, `CAPTION: text`, `SFX: text`, with lettering notes in parentheses. A balloon with no speaker shows as `UNKNOWN`.
- **Plot for the artist** (Marvel-style): each page's plot, who is on it and where, and no dialogue. A page without a plot uses its panel descriptions instead.

- **Lettering script**: for the letterer, only the balloons, captions and SFX. Each panel lists its lines numbered in reading order (`1. MARA (whisper): text`); panels and pages with no lettering are left out.
- **Thumbnail sheet**: a printable HTML page for the artist (open it in a browser, print or save as PDF). Every page is a blank 2:3 frame laid out as a reader sees it (page 1 alone on the right, then spreads 2–3, 4–5, …, page-turn pages marked), with the title, layout note, plot (or the panel descriptions when there is no plot), characters and places. No dialogue. Empty pages get a frame too, so the whole issue can be sketched. It is always HTML, so the format choice is hidden.

In the other kinds, empty pages are left out (the numbers keep their place). Private notes and to-dos are never exported.

## Screenplay exports

*File → Export…* offers three formats for a screenplay. **PDF** is written by Fabulator itself (no extra software): standard script pages in 12 pt Courier, 55 lines a page, 1.5 in left margin, page numbers from page 2, the slug line at the margin, dialogue and parentheticals indented, transitions at the right, a slug line never alone at the bottom of a page, and long dialogue split with **(MORE)** and **NAME (CONT'D)**. **Word** uses the same layout through real paragraph styles (Scene Heading, Action, Character, Parenthetical, Dialogue, Transition), so it can be edited. **Fountain** is plain text for Final Draft, Highland, Fade In and others (a forced slug `.` when INT/EXT is not set, `>` transitions, `!` for all-capital action lines). Options: **title page**, **scene numbers** (shooting script) and the scope: whole script, the act of the selected scene, or just that scene (numbers stay those of the whole script). Private notes and scenes with nothing in them are left out; "(CONT'D)" is worked out from the dialogue, never stored. The layout is `src/lib/export/screenplayLayout.ts`, the PDF writer `pdf.ts`. PDF text uses the standard Courier font, so characters outside Western European alphabets show as "?" (use Word or Fountain for those).
