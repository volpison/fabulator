# Interface, themes and shortcuts

How the app looks and behaves, and how to change it.

## Interface, themes and shortcuts

- **Top bar**: *File* and *Tools* menus (with shortcuts shown, arrow-key navigation, Esc to close),
  the three views centred, the Characters / Places / Notes panels and the **View** menu on the right.
  The project name, file and save state moved to a status bar at the bottom.
- **View menu**: theme (System, Light, Dark, Sepia, Midnight, High contrast), interface size
  (90–150%), and for the manuscript: font (serif / sans / mono), text size, line width and
  line spacing. Everything is remembered. All themes are contrast-tested (`npm test`).
- **Focus mode**: only the manuscript is shown. Esc leaves it.
- **Typewriter** (View → Writing → *Typewriter*: Off / Centre / Upper third; **Ctrl+Shift+T** toggles Centre): the line you are writing stays at a fixed height and the text moves instead, so your eyes never chase the bottom of the screen. It follows typing and keyboard moves, but not mouse clicks (the page never jumps under the pointer), and it only acts while the editor has the cursor. Extra room is added under the text so the end of a scene can reach that height.
- **Dim others** (View → Writing): fades every paragraph except the one being written. Combine with Typewriter and Focus mode for a quiet page. Both options are remembered like the other View settings (and work in or out of focus mode).
- Shortcuts: Ctrl+O open · Ctrl+S save · Ctrl+Shift+S save as · Ctrl+E export · Ctrl+F search ·
  Ctrl+H replace · Ctrl+Shift+H snapshots · Ctrl+1/2/3 Timeline/Manuscript/Cast ·
  Ctrl+\ toggle side panel · Ctrl+Shift+F focus mode. (Cmd instead of Ctrl on macOS.)
- The right-hand panel (Characters / Places / Notes) scrolls, and its width is adjustable: drag its left edge,
  or focus the edge and use ←/→ (Shift for bigger steps, Home to reset); double-click resets. The width is remembered.
- Fabulator behaves like a desktop app, not a web page: the browser's right-click menu (Back / Refresh / Save as…) is
  hidden except over editable text or a selection (cut/copy/paste, spelling), and reload, print and history shortcuts
  (F5, Ctrl+R, Ctrl+P, Alt+←/→) are disabled. If something still tries to reload while there are unsaved changes,
  you are asked first.
- Colours in components are theme tokens (`var(--text)`, `var(--danger)`…), defined in
  `src/lib/themes.ts`; to add a theme, add a palette there.

## Colour themes: import, export, file format

**View → Theme** has *Import…*, *Export…* and *Remove*. Imported themes are small JSON files in the
app's data folder (`themes/`), so they survive updates.

Importable: a **Fabulator theme** (`.json`, below), a **VS Code theme** (`.json`) or a **Base16**
scheme (`.yaml`/`.yml`, both the classic flat layout and the newer `palette:` layout).
Examples: `themes/examples/`.

**Themes browser and folder import** (*View → Theme → Browse…*): search every theme, filter **Dark / Light** and by
**collection** (Built-in, Gallery, the name of an imported folder, Imported), and click one to use it. *Import folder…*
reads every `.yaml`, `.yml` and `.json` file in a folder (up to four levels deep, so a whole clone of a scheme
collection such as `base16/` and `base24/` works) and adds them as one collection named after the folder.
Base16 and **Base24** schemes are both understood (Base24's `base10` becomes the sidebar of dark schemes); VS Code
and Fabulator theme files in the folder are imported too. Dark or light comes from the scheme's `variant`, or from the
background colour. Nothing you already have is replaced: identical themes are skipped, a theme that only shares a name
is added as "Name (2)" or "Name (Base24)", and files that are not themes are listed under *Show skipped files*.
*Remove “collection”* deletes a whole imported folder's themes at once. An example folder to try:
`themes/examples/folder-sample/`. Fabulator theme files can carry an optional `"collection": "Name"`.

**Theme gallery** (*View → Theme → Gallery…*): 22 popular schemes ready to add with one click: Dracula, Nord,
Catppuccin (Latte, Frappé, Macchiato, Mocha), Rosé Pine (Rosé Pine, Moon, Dawn), Tokyo Night (and Storm), Solarized
(Dark, Light), Gruvbox (Dark, Light), One (Dark, Light), GitHub (Light, Dark), Everforest (Dark, Light), Kanagawa Wave.
Adding saves it like an imported theme (editable, removable) and switches to it; a name you already have is never
overwritten. The data is in `src/lib/gallery.ts`, with author, licence and home page for each family (all MIT as far
as we know; only colour values are used, no code or assets, but check each project page before redistributing).
Text colours are nudged where needed so every theme passes the contrast rules. To add a scheme, append an `entry(...)`
there; `npm test` checks names, colours and contrast.

**VS Code themes**: import one of the theme `.json` files from an extension's `themes/` folder (usually
found in the theme's GitHub repo). Comments and trailing commas are fine. Only about ten colours are
used: editor background/foreground, sidebar and widget backgrounds, border, description text, the
button/link colour as accent, error/warning/green for danger/warning/success, and the colours of
functions/types and strings for character and place underlines. Semi-transparent colours are blended
over the background, anything missing is derived, and text contrast is guaranteed as for every theme.
Not supported (you get a clear message): themes that only `include` another file, `.vsix` packages,
`package.json` manifests, `.tmTheme` files. Check a theme's licence before sharing your imported copy.

A Fabulator theme only has to give three colours; everything else is derived and automatically
adjusted until text is readable (the same contrast rules the built-in themes pass):

```json
{
  "format": "fabulator-theme",
  "version": 1,
  "name": "Dracula",
  "author": "Zeno Rocha",
  "dark": true,
  "colors": {
    "background": "#282a36", "foreground": "#f8f8f2", "accent": "#bd93f9",
    "panel": "#343746", "sidebar": "#21222c", "border": "#44475a", "muted": "#6272a4",
    "danger": "#ff5555", "success": "#50fa7b", "warning": "#f1fa8c",
    "character": "#8be9fd", "place": "#50fa7b", "highlight": "#f1fa8c"
  },
  "tokens": { "text-faint": "#7a88b8" }
}
```

- Required: `colors.background`, `colors.foreground`, `colors.accent` (`#rgb` or `#rrggbb`). All other
  `colors` are optional. `dark` is guessed from the background if left out.
- `tokens` (optional) pins individual interface colours exactly (names in `src/lib/themes.ts`);
  *Export…* writes every token, so an exported theme reproduces perfectly.
- `version` is the format version (currently 1); files from a newer format are refused with a message.
- Base16 mapping: base00/01 backgrounds, base02 borders, base04 dim text, base05 text, base08 danger,
  base0A warning/highlight, base0B success/places, base0D accent/characters.
