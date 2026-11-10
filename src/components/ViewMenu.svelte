<script lang="ts">
  import { settings, updateSettings, resetSettings, customThemes } from "../lib/appearance";
  import { THEMES, type ThemeInfo } from "../lib/themes";
  import { importThemeFromFile, exportCurrentTheme, removeUserTheme } from "../lib/userthemes";
  import {
    UI_SCALES,
    EDITOR_FONTS,
    EDITOR_WIDTHS,
    LINE_SPACINGS,
    EDITOR_SIZE_MIN,
    EDITOR_SIZE_MAX,
    type EditorFont,
    type EditorWidth,
    type LineSpacing,
    type ThemeChoice,
  } from "../lib/settings";
  import { focusMode, mainView, galleryOpen, themesOpen } from "../lib/stores";

  let open = false;
  let root: HTMLElement | undefined;
  let button: HTMLButtonElement | undefined;

  const fonts = Object.entries(EDITOR_FONTS) as [EditorFont, { label: string }][];
  const widths = Object.entries(EDITOR_WIDTHS) as [EditorWidth, { label: string }][];
  const spacings = Object.entries(LINE_SPACINGS) as [LineSpacing, { label: string }][];

  const swatchOf = (t: ThemeInfo) =>
    `linear-gradient(135deg, ${t.palette["bg"]} 0 45%, ${t.palette["bg-panel"]} 45% 70%, ${t.palette["accent"]} 70%)`;

  $: choices = [
    { id: "system" as ThemeChoice, label: "System", swatch: "linear-gradient(90deg, #f8fafc 50%, #0b1220 50%)" },
    // Built-in themes, plus the imported one in use. Everything else is in the Themes browser.
    ...[...THEMES, ...$customThemes.filter((t) => t.id === $settings.theme)].map((t) => ({
      id: t.id as ThemeChoice,
      label: t.label,
      swatch: swatchOf(t),
    })),
  ];

  $: usingImported = $settings.theme.startsWith("user:") && $customThemes.some((t) => t.id === $settings.theme);

  let themeMessage = "";
  let themeFailed = false;

  async function onImport() {
    const r = await importThemeFromFile();
    if (r.status === "cancelled") return;
    themeFailed = r.status === "error";
    themeMessage =
      r.status === "imported"
        ? `Imported “${r.name}”.${r.warnings.length ? " " + r.warnings.join(" ") : ""}`
        : r.status === "error"
          ? r.message
          : "";
  }

  async function onExport() {
    const r = await exportCurrentTheme();
    if (r.status === "cancelled") return;
    themeFailed = r.status === "error";
    themeMessage = r.status === "exported" ? `Saved to ${r.path}` : r.status === "error" ? r.message : "";
  }

  async function onRemove() {
    const id = $settings.theme;
    const name = $customThemes.find((t) => t.id === id)?.label ?? "theme";
    const problem = await removeUserTheme(id);
    themeFailed = !!problem;
    themeMessage = problem ?? `Removed “${name}”.`;
  }

  function onKey(e: KeyboardEvent) {
    if (open && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      open = false;
      button?.focus();
    }
  }

  function onWindowPointer(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }

  function startFocus() {
    open = false;
    mainView.set("manuscript");
    focusMode.set(true);
  }
</script>

<svelte:window on:pointerdown={onWindowPointer} on:blur={() => (open = false)} />

<div class="view-menu" bind:this={root} on:keydown={onKey}>
  <button
    class="trigger"
    class:open
    bind:this={button}
    on:click={() => (open = !open)}
    aria-haspopup="dialog"
    aria-expanded={open}
    title="Theme, text size and reading layout"
  >
    View
  </button>

  {#if open}
    <div class="panel" role="dialog" aria-label="View settings">
      <section>
        <h3>Theme</h3>
        <div class="themes">
          {#each choices as c}
            <button
              class="theme"
              class:selected={$settings.theme === c.id}
              on:click={() => updateSettings({ theme: c.id })}
              aria-pressed={$settings.theme === c.id}
            >
              <span class="swatch" style="background: {c.swatch}"></span>
              <span class="tname">{c.label}</span>
            </button>
          {/each}
        </div>
        <div class="theme-actions">
          <button on:click={() => { open = false; themesOpen.set(true); }} title="Browse, search and filter all themes (dark / light / collections), or import a whole folder">Browse{$customThemes.length ? ` (${$customThemes.length + THEMES.length})` : ""}…</button>
          <button on:click={() => { open = false; galleryOpen.set(true); }} title="Browse popular colour schemes (Dracula, Nord, Catppuccin, …)">Gallery…</button>
          <button on:click={onImport} title="Import a Fabulator or VS Code theme (.json) or a Base16 scheme (.yaml)">Import…</button>
          <button on:click={onExport} title="Save the current theme as a file you can share">Export…</button>
          {#if usingImported}
            <button class="danger" on:click={onRemove}>Remove</button>
          {/if}
        </div>
        {#if themeMessage}
          <p class="msg" class:failed={themeFailed} role="status">{themeMessage}</p>
        {/if}
      </section>

      <section>
        <h3>Interface size</h3>
        <div class="seg">
          {#each UI_SCALES as s}
            <button class:on={$settings.uiScale === s} on:click={() => updateSettings({ uiScale: s })}>{s}%</button>
          {/each}
        </div>
      </section>

      <section>
        <h3>Writing</h3>
        <div class="row">
          <span class="lbl">Font</span>
          <div class="seg">
            {#each fonts as [id, f]}
              <button class:on={$settings.editorFont === id} on:click={() => updateSettings({ editorFont: id })}>{f.label}</button>
            {/each}
          </div>
        </div>
        <div class="row">
          <span class="lbl">Size</span>
          <div class="seg">
            <button
              on:click={() => updateSettings({ editorSize: $settings.editorSize - 1 })}
              disabled={$settings.editorSize <= EDITOR_SIZE_MIN}
              aria-label="Smaller text">−</button>
            <span class="val">{$settings.editorSize} px</span>
            <button
              on:click={() => updateSettings({ editorSize: $settings.editorSize + 1 })}
              disabled={$settings.editorSize >= EDITOR_SIZE_MAX}
              aria-label="Larger text">+</button>
          </div>
        </div>
        <div class="row">
          <span class="lbl">Width</span>
          <div class="seg">
            {#each widths as [id, w]}
              <button class:on={$settings.editorWidth === id} on:click={() => updateSettings({ editorWidth: id })}>{w.label}</button>
            {/each}
          </div>
        </div>
        <div class="row">
          <span class="lbl">Spacing</span>
          <div class="seg">
            {#each spacings as [id, s]}
              <button class:on={$settings.lineSpacing === id} on:click={() => updateSettings({ lineSpacing: id })}>{s.label}</button>
            {/each}
          </div>
        </div>
      </section>

      <footer>
        <button class="action" on:click={startFocus} title="Hide everything except the manuscript (Esc to leave)">
          Focus mode <span class="keys">Ctrl+Shift+F</span>
        </button>
        <button class="reset" on:click={resetSettings}>Reset</button>
      </footer>
    </div>
  {/if}
</div>

<style>
  .view-menu {
    position: relative;
  }

  .trigger {
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    font-size: 0.85rem;
    color: var(--text);
  }

  .trigger:hover,
  .trigger.open {
    background: var(--bg-sidebar);
  }

  .panel {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 90;
    width: 21rem;
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
    padding: 0.5rem 0.75rem 0.75rem;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  h3 {
    margin: 0.2rem 0 0.4rem;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .themes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
  }

  .theme {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.3rem;
    border: 1.5px solid var(--border);
    border-radius: 8px;
    text-align: center;
  }

  .theme.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .swatch {
    display: block;
    height: 1.6rem;
    border-radius: 5px;
    border: 1px solid var(--border);
  }

  .tname {
    font-size: 0.72rem;
    color: var(--text);
  }

  .theme-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }

  .theme-actions button {
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    font-size: 0.75rem;
    color: var(--text);
    background: var(--bg-sidebar);
  }

  .theme-actions button:hover {
    color: var(--accent);
  }

  .theme-actions .danger {
    margin-left: auto;
    color: var(--danger);
  }

  .msg {
    margin: 0.45rem 0 0;
    font-size: 0.72rem;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }

  .msg.failed {
    color: var(--danger);
  }

  .row {
    display: grid;
    grid-template-columns: 4.2rem 1fr;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }

  .lbl {
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .seg {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: var(--bg-sidebar);
    border-radius: 7px;
  }

  .seg button,
  .seg .val {
    flex: 1;
    padding: 0.28rem 0.3rem;
    border-radius: 5px;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
  }

  .seg button:hover:not(:disabled) {
    color: var(--text);
  }

  .seg button.on {
    background: var(--bg-panel);
    color: var(--text);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    font-weight: 600;
  }

  .seg button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .seg .val {
    color: var(--text);
    flex: 2;
    font-variant-numeric: tabular-nums;
  }

  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--border);
  }

  .action {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.6rem;
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--accent);
    background: var(--accent-soft);
    font-weight: 600;
  }

  .keys {
    font-size: 0.68rem;
    font-weight: 400;
    opacity: 0.85;
  }

  .reset {
    font-size: 0.75rem;
    color: var(--text-muted);
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
  }

  .reset:hover {
    background: var(--bg-sidebar);
    color: var(--text);
  }
</style>
