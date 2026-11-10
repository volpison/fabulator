<script lang="ts">
  import { galleryOpen } from "../lib/stores";
  import { settings, updateSettings, customThemes } from "../lib/appearance";
  import { galleryFamilies, type GalleryTheme } from "../lib/gallery";
  import { specToTheme, themeIdFor } from "../lib/theme-file";
  import { installGalleryTheme } from "../lib/userthemes";

  const families = galleryFamilies();
  const themes = new Map(
    families.flatMap((f) => f.themes).map((t) => [t.spec.name, specToTheme(t.spec)] as const)
  );

  let busy: string | null = null;
  let message = "";
  let failed = false;

  $: installed = new Set($customThemes.map((t) => t.id));

  const idOf = (t: GalleryTheme) => themeIdFor(t.spec.name);

  function swatch(t: GalleryTheme): string {
    const p = themes.get(t.spec.name)!.palette;
    return `linear-gradient(135deg, ${p["bg"]} 0 40%, ${p["bg-panel"]} 40% 62%, ${p["accent"]} 62% 82%, ${p["char"]} 82%)`;
  }

  function close() {
    galleryOpen.set(false);
  }

  async function choose(t: GalleryTheme) {
    const id = idOf(t);
    failed = false;
    if (installed.has(id)) {
      updateSettings({ theme: id });
      message = `Using “${t.spec.name}”.`;
      return;
    }
    busy = t.spec.name;
    const problem = await installGalleryTheme(t.spec);
    busy = null;
    failed = !!problem;
    message = problem ?? `Added “${t.spec.name}” to your themes. Remove it any time from View → Theme.`;
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }
</script>

<svelte:window on:keydown={onWindowKey} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click|self={close}>
  <div class="dialog" role="dialog" aria-label="Theme gallery">
    <header>
      <h2>Theme gallery</h2>
      <button class="x" on:click={close} aria-label="Close">✕</button>
    </header>

    <div class="content">
      <p class="intro">
        Popular colour schemes. Adding one saves it to your theme list and switches to it. Text colours are adjusted
        slightly where needed so everything stays readable.
      </p>

      {#each families as f (f.family)}
        <section>
          <h3>{f.family}</h3>
          <div class="grid">
            {#each f.themes as t (t.spec.name)}
              {@const id = idOf(t)}
              {@const isOn = $settings.theme === id}
              <button
                class="card"
                class:selected={isOn}
                disabled={busy !== null}
                on:click={() => choose(t)}
                title={installed.has(id) ? "Use this theme" : "Add and use this theme"}
              >
                <span class="swatch" style="background: {swatch(t)}"></span>
                <span class="name">{t.spec.name}</span>
                <span class="state">
                  {#if busy === t.spec.name}Adding…{:else if isOn}In use{:else if installed.has(id)}Added · Use{:else}Add{/if}
                </span>
              </button>
            {/each}
          </div>
          <p class="credit">
            {f.themes[0].spec.author} · {f.themes[0].license} licence · {f.themes[0].source}
          </p>
        </section>
      {/each}
    </div>

    <footer>
      <span class="msg" class:failed role="status">{message}</span>
      <button class="done" on:click={close}>Done</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 6vh;
    background: var(--backdrop);
  }

  .dialog {
    display: flex;
    flex-direction: column;
    width: min(720px, 94vw);
    max-height: 86vh;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .x {
    color: var(--text-muted);
  }

  .content {
    padding: 0.9rem 1rem 1.1rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .intro {
    font-size: 0.82rem;
    color: var(--text-muted);
  }

  h3 {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.45rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
    gap: 0.5rem;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem;
    text-align: left;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }

  .card:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .card:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .swatch {
    height: 2.6rem;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.25);
  }

  .name {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text);
  }

  .state {
    font-size: 0.72rem;
    color: var(--accent);
  }

  .credit {
    margin-top: 0.4rem;
    font-size: 0.7rem;
    color: var(--text-faint);
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 1rem;
    border-top: 1px solid var(--border);
  }

  .msg {
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .msg.failed {
    color: var(--danger);
  }

  .done {
    padding: 0.3rem 0.9rem;
    border-radius: 6px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
  }
</style>
