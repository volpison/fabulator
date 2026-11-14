# Writing a novel

The Novel mode: a Timeline of chapters and scenes, and a Manuscript to write them.

## Scene status, colours and the Timeline filter

- Every scene has a **status** (Idea, Draft, Revised, Final) and an optional **colour label** (red, orange, yellow, green, blue, purple). Set them in the Manuscript editor header, or in a Timeline card's *Edit* mode. Cards show a status badge and a coloured edge strip.
- The **filter bar** under the Timeline toolbar narrows by text (title, synopsis, tags), status, colour (or "No colour"), character and plotline. Several values of one kind mean "any of these"; different kinds must all match. The status chips also show how many scenes are in each state.
- Scenes that do not match are **dimmed, not hidden**, so the layout and drag-and-drop keep working. The bar shows "N of M scenes" and a *Clear* button. The filter is not saved.
- Older projects are upgraded automatically (now schema v11): scenes with text become *Draft*, empty ones *Idea*; every scene gets empty notes and to-dos.

## Plotlines (Timeline lanes)

Click **+ Plotline** under the lanes to add one (it gets the next free colour). On a lane's label: click the coloured dot to pick a colour (palette or any custom colour), double-click the name to rename it, and use the ▲ ▼ ✕ buttons (shown on hover) to reorder or delete it. Deleting a plotline moves its scenes to another one; the last plotline can't be deleted.

## `@` mentions in the editor

While writing, type `@` at the start of a word (not inside an e-mail address) and a small list of your characters and places appears. Keep typing to narrow it (accents and capitals don't matter; aliases count). **↑ ↓** choose, **Enter** or **Tab** inserts the name and links it to the scene, **Esc** closes the list. If nothing has exactly that name, the list also offers **＋ New character "…"** or **＋ New place "…"**, which creates it (fill in the details later in the side panel) and links it at once.

## Cast check above the editor

A slim bar above the text compares a scene's cast with its text. If everything lines up it lists the cast with mention counts ("Cast matches the text"). If someone is on the cast but never named in the text it turns amber and offers **Unlink** (take them off the scene) or **×** (keep them, e.g. they appear only as "she", and hide the notice for this session). Names that appear in the text but are not on the cast are still offered by the **Link** banner. The bar is hidden in focus mode.

## Scene notes and to-dos

Under the editor, a collapsed bar **Notes & to-dos** opens a private area for the scene: a notes box (reminders, research, "check the timeline") and a to-do list (type and press Enter; tick to complete; double-click to edit; **Clear done** removes finished ones). The bar summarises what is pending, and Timeline cards show **☐ n** for open to-dos and **✎** when a scene has notes. Notes and to-dos are saved in the project file (format upgraded to v5; older files upgrade automatically) and in the Markdown folder export, but are **never part of the exported story** (DOCX, EPUB, text…).

## Story time (Timeline → *Story time*)

Every scene has a **When** field (under the scene title in the Manuscript, or inline in the Story time list) for *when it happens inside the story*, as opposed to where it sits in the book. Write it as you like; these styles are understood and sorted:

- **Dates:** `2026-11-10`, `2026-11-10 14:30`, `10/11/2026` (day first), `1342-05-02 evening`
- **Days:** `Day 3`, `Day 3 evening`, `Day 3, 14:30`, `D3`, `Dia 3 manhã` (dawn, morning, noon, afternoon, evening, night, midnight, and a few Portuguese words)

The Timeline toolbar switches between **Book order** (the chapters × plotlines grid) and **Story time**: scenes listed in story order with the gap to the previous one ("+3 days"), their place in the book (#n), and **↩ out of book order** where the story jumps back (flashbacks). Scenes with no usable time, or written in the other style, are listed separately under *Not placed*. Other text is kept as a label (the field turns amber to say it can't be sorted). Story time is saved in the project (schema v6 and later; older files upgrade automatically) and in the Markdown folder export, and is not part of exported stories.

## Reordering scenes from the Manuscript list

Drag a scene in the left-hand list and drop it on the top or bottom half of another scene; a line shows where it will land. Dropping onto a scene in another chapter moves it to that chapter (it keeps its plotline). Keyboard: focus a scene and press **Alt+↑ / Alt+↓** to move it one step in reading order (past a chapter boundary it moves into the neighbouring chapter). The Timeline reflects the change immediately.

## Appearances

- **Per character / place** (side panel, expand a card → *Appearances*): every
  scene they are linked to and/or named in, in reading order, with the first
  appearance, the longest absence, and how long since they were last seen.
  Mismatches are flagged: *not named* (linked, but the text never mentions
  them) and *not linked* (named in the text but missing from the scene's cast).
  One click links all the "named but not linked" scenes.
- **Cast view** (top bar → *Cast*): a grid of every character and place against
  every scene in reading order. Click any cell to open that scene.
  Three grid sizes (Compact / Comfortable / Spacious, remembered), scene titles above the columns,
  chapter headers, hover highlights the row and column and describes the cell, the open scene is
  marked, and clicking a name shows that character or place in the side panel.
