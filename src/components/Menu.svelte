<script lang="ts">
  import { tick } from "svelte";
  import { formatShortcut, hasChildren, stepIndex, type MenuItem } from "../lib/menu";

  export let label: string;
  export let items: MenuItem[];
  export let title = "";

  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

  let open = false;
  let root: HTMLElement | undefined;
  let button: HTMLButtonElement | undefined;
  let panel: HTMLElement | undefined;

  /** Index of the item whose submenu is open, or null. */
  let subOpen: number | null = null;

  /** Focusable items of one menu level (a submenu's items are not part of its parent's list). */
  function entries(scope: HTMLElement | null | undefined = panel): HTMLButtonElement[] {
    if (!scope) return [];
    return Array.from(scope.querySelectorAll<HTMLButtonElement>("button[role=menuitem]:not(:disabled)")).filter(
      (b) => b.closest("[role=menu]") === scope
    );
  }

  async function openSub(index: number, focusFirst: boolean) {
    subOpen = index;
    if (!focusFirst) return;
    await tick();
    const wrap = panel?.querySelector<HTMLElement>(`[data-sub="${index}"]`);
    entries(wrap)[0]?.focus();
  }

  function closeSub(refocusParent: boolean) {
    const index = subOpen;
    subOpen = null;
    if (refocusParent && index !== null) panel?.querySelector<HTMLButtonElement>(`[data-parent="${index}"]`)?.focus();
  }

  async function openMenu(focus: "none" | "first" | "last") {
    open = true;
    if (focus === "none") return;
    await tick();
    const list = entries();
    list[focus === "first" ? 0 : list.length - 1]?.focus();
  }

  function close(refocus: boolean) {
    open = false;
    subOpen = null;
    if (refocus) button?.focus();
  }

  function onButtonClick() {
    if (open) close(false);
    else void openMenu("none");
  }

  function onButtonKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      void openMenu("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      void openMenu("last");
    }
  }

  function onMenuKey(e: KeyboardEvent) {
    if (!open) return;
    const inSub = (document.activeElement as HTMLElement | null)?.closest("[data-sub]") ?? null;
    if (e.key === "Escape" || (e.key === "ArrowLeft" && inSub)) {
      e.preventDefault();
      e.stopPropagation(); // don't also trigger window-level Escape handlers
      if (inSub) closeSub(true);
      else close(true);
      return;
    }
    if (e.key === "Tab") {
      close(false);
      return;
    }
    const scope = (inSub as HTMLElement | null) ?? panel;
    const list = entries(scope);
    const current = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      list[stepIndex(current, list.length, e.key === "ArrowDown" ? 1 : -1)]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    }
  }

  function run(item: MenuItem, index: number) {
    if (item.disabled) return;
    if (hasChildren(item)) {
      if (subOpen === index) closeSub(false);
      else void openSub(index, false);
      return;
    }
    if (!item.action) return;
    close(false);
    item.action();
  }

  function onParentKey(e: KeyboardEvent, item: MenuItem, index: number) {
    if (!hasChildren(item) || item.disabled) return;
    if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void openSub(index, true);
    }
  }

  function onWindowPointer(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window on:pointerdown={onWindowPointer} on:blur={() => (open = false)} />

<div class="menu" bind:this={root} on:keydown={onMenuKey}>
  <button
    class="trigger"
    class:open
    bind:this={button}
    on:click={onButtonClick}
    on:keydown={onButtonKey}
    aria-haspopup="menu"
    aria-expanded={open}
    {title}
  >
    {label}
  </button>

  {#if open}
    <div class="panel" role="menu" bind:this={panel} aria-label={label}>
      {#each items as item, i}
        {#if item.separator}
          <div class="sep" role="separator"></div>
        {:else}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="row"
            on:pointerenter={(e) => {
              if (e.pointerType === "mouse") {
                if (hasChildren(item) && !item.disabled) void openSub(i, false);
                else if (subOpen !== null) subOpen = null;
              }
            }}
          >
            <button
              class="item"
              class:parent-open={subOpen === i}
              role="menuitem"
              data-parent={i}
              disabled={item.disabled}
              aria-haspopup={hasChildren(item) ? "menu" : undefined}
              aria-expanded={hasChildren(item) ? subOpen === i : undefined}
              on:click={() => run(item, i)}
              on:keydown={(e) => onParentKey(e, item, i)}
            >
              <span class="name">{item.label}</span>
              {#if hasChildren(item)}
                <span class="keys" aria-hidden="true">▸</span>
              {:else if item.shortcut}
                <span class="keys">{formatShortcut(item.shortcut, mac)}</span>
              {/if}
            </button>
            {#if hasChildren(item) && subOpen === i}
              <div class="panel sub" role="menu" data-sub={i} aria-label={item.label}>
                {#each item.children ?? [] as child}
                  {#if child.separator}
                    <div class="sep" role="separator"></div>
                  {:else}
                    <button
                      class="item"
                      role="menuitem"
                      disabled={child.disabled}
                      on:click={() => run(child, -1)}
                    >
                      <span class="name">{child.label}</span>
                      {#if child.shortcut}
                        <span class="keys">{formatShortcut(child.shortcut, mac)}</span>
                      {/if}
                    </button>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu {
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
    left: 0;
    z-index: 90;
    min-width: 15rem;
    padding: 0.3rem;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  }

  .row {
    position: relative;
  }

  .panel.sub {
    top: -0.3rem;
    left: calc(100% + 2px);
    min-width: 13rem;
  }

  .item.parent-open {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .item {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 1.5rem;
    width: 100%;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    font-size: 0.85rem;
    color: var(--text);
    text-align: left;
  }

  .item:hover:not(:disabled),
  .item:focus-visible {
    background: var(--accent-soft);
    color: var(--accent);
    outline: none;
  }

  .item:disabled {
    color: var(--text-faint);
    cursor: default;
  }

  .keys {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .item:hover:not(:disabled) .keys,
  .item:focus-visible .keys {
    color: inherit;
  }

  .sep {
    height: 1px;
    margin: 0.3rem 0.4rem;
    background: var(--border);
  }
</style>
