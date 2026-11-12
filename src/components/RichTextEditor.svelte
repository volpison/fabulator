<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Placeholder from "@tiptap/extension-placeholder";
  import { MentionHighlight, mentionKey } from "../lib/mentionExtension";
  import { SearchHighlight, searchKey } from "../lib/searchExtension";
  import { AtMention, type AtState } from "../lib/atMentionExtension";
  import { CurrentBlock } from "../lib/currentBlockExtension";
  import { settings } from "../lib/appearance";
  import { typewriterScrollTop, typewriterBottomPadding } from "../lib/typewriter";
  import { buildOptions, tidyNewName, type PickOption } from "../lib/atMention";
  import type { Entity, EntityType, MentionInfo } from "../lib/mentions";

  interface Props {
    content?: string;
    placeholder?: string;
    onUpdate?: (html: string) => void;
    /** Characters/places (with aliases) to underline in the text. */
    entities?: Entity[];
    /** Content for the hover card shown over an underlined name. */
    describeMention?: (type: EntityType, id: string) => MentionInfo | null;
    /** Words to underline (from a search). The first hit is scrolled into view. */
    highlightTerms?: string[];
    /** A character/place was chosen with "@": link it to the scene. */
    onPickMention?: (type: EntityType, id: string) => void;
    /** "@" + a new name: create the character/place and return its id. */
    onCreateMention?: (type: EntityType, name: string) => string;
  }

  let {
    content = "",
    placeholder = "Start writing…",
    onUpdate,
    entities = [],
    describeMention,
    highlightTerms = [],
    onPickMention,
    onCreateMention,
  }: Props = $props();

  let element: HTMLDivElement;
  let root: HTMLDivElement;
  let editor: Editor | null = null;

  // Name highlighting
  let showNames = $state(true);
  let hover = $state<{
    type: EntityType;
    id: string;
    el: HTMLElement;
    left: number;
    top: number;
  } | null>(null);
  const hoverInfo = $derived(
    hover && describeMention ? describeMention(hover.type, hover.id) : null
  );
  // "@" picker
  let at = $state<AtState | null>(null);
  let atIndex = $state(0);
  let atDismissedFrom = -1;
  let atLastQuery = "";
  const atOptions = $derived<PickOption[]>(at ? buildOptions(at.query, entities) : []);

  function onAtState(state: AtState | null) {
    if (!state) atDismissedFrom = -1; // the cursor left the "@"
    else if (state.from === atDismissedFrom) state = null; // Escape was pressed for this "@"
    if (state && state.query !== atLastQuery) atIndex = 0;
    atLastQuery = state?.query ?? "";
    const base = root?.getBoundingClientRect();
    at =
      state && base
        ? { ...state, left: Math.max(8, Math.min(state.left - base.left, base.width - 268)), bottom: state.bottom - base.top }
        : null;
  }

  function onAtKey(e: KeyboardEvent): boolean {
    if (!at) return false;
    if (e.key === "Escape") {
      atDismissedFrom = at.from;
      at = null;
      return true;
    }
    if (atOptions.length === 0) return false;
    if (e.key === "ArrowDown") {
      atIndex = (atIndex + 1) % atOptions.length;
      return true;
    }
    if (e.key === "ArrowUp") {
      atIndex = (atIndex - 1 + atOptions.length) % atOptions.length;
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      pickAt(atOptions[Math.min(atIndex, atOptions.length - 1)]);
      return true;
    }
    return false;
  }

  function pickAt(option: PickOption | undefined) {
    if (!option || !at || !editor) return;
    const range = { from: at.from, to: at.to };
    let name: string, id: string;
    if (option.kind === "existing") {
      name = option.name;
      id = option.id;
    } else {
      name = tidyNewName(option.name);
      id = onCreateMention?.(option.type, name) ?? "";
      if (!id) return;
    }
    at = null;
    editor.chain().focus().insertContentAt(range, name).run();
    onPickMention?.(option.type, id);
  }

  // ─── Typewriter scrolling ───
  // The line being written stays at a fixed height and the text moves instead.
  let pointerDown = false; // while the mouse is selecting, don't move the text under it
  let followFrame = 0;
  let cleanupWriting: (() => void) | null = null;

  function followCaret() {
    if (!editor || $settings.typewriter === "off" || pointerDown) return;
    cancelAnimationFrame(followFrame);
    followFrame = requestAnimationFrame(() => {
      const mode = $settings.typewriter;
      // Only while writing here: switching scenes or editing elsewhere must not move the page.
      if (!editor || mode === "off" || !editor.isFocused) return;
      let caret: { top: number; bottom: number };
      try {
        caret = editor.view.coordsAtPos(editor.state.selection.head);
      } catch {
        return;
      }
      const target = typewriterScrollTop(
        {
          caretTop: caret.top,
          caretBottom: caret.bottom,
          viewTop: element.getBoundingClientRect().top,
          viewHeight: element.clientHeight,
          scrollTop: element.scrollTop,
        },
        mode
      );
      if (target === null) return;
      element.scrollTop = target;
      // The "@" picker is placed from the cursor's position on screen: place it again.
      if (at) editor.view.dispatch(editor.state.tr);
    });
  }

  /** Room under the text so the last line can reach the typewriter height. */
  function applyTypewriterPadding() {
    if (!element) return;
    const px = typewriterBottomPadding(element.clientHeight, $settings.typewriter);
    if (px) element.style.setProperty("--tw-bottom", `${px}px`);
    else element.style.removeProperty("--tw-bottom");
  }

  // Turning typewriter mode on/off (View menu or shortcut) takes effect right away.
  $effect(() => {
    void $settings.typewriter;
    applyTypewriterPadding();
    followCaret();
  });

  let lastMentionKey = "";
  let lastTermsKey = "";

  function scrollToFirstSearchHit() {
    requestAnimationFrame(() => {
      element
        ?.querySelector(".search-hit")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function mentionKeyOf(): string {
    return (
      (showNames ? "on" : "off") +
      JSON.stringify(entities.map((e) => [e.type, e.id, e.terms]))
    );
  }

  function onEditorMouseOver(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest?.(".mention") as HTMLElement | null;
    if (!el) {
      if (hover) hover = null;
      return;
    }
    if (hover?.el === el) return;
    const r = el.getBoundingClientRect();
    const base = root.getBoundingClientRect();
    hover = {
      type: el.dataset.mentionType as EntityType,
      id: el.dataset.mentionId ?? "",
      el,
      left: Math.max(8, Math.min(r.left - base.left, base.width - 288)),
      top: r.bottom - base.top + 4,
    };
  }
  let lastSceneContent = content;

  // Toolbar active states
  let isBold = $state(false);
  let isItalic = $state(false);
  let isStrike = $state(false);
  let isHeading2 = $state(false);
  let isBulletList = $state(false);
  let isOrderedList = $state(false);
  let isBlockquote = $state(false);

  function syncToolbar() {
    if (!editor) return;
    isBold = editor.isActive("bold");
    isItalic = editor.isActive("italic");
    isStrike = editor.isActive("strike");
    isHeading2 = editor.isActive("heading", { level: 2 });
    isBulletList = editor.isActive("bulletList");
    isOrderedList = editor.isActive("orderedList");
    isBlockquote = editor.isActive("blockquote");
  }

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
        }),
        Placeholder.configure({
          placeholder,
        }),
        MentionHighlight.configure({
          getEntities: () => (showNames ? entities : []),
        }),
        SearchHighlight.configure({
          getTerms: () => highlightTerms,
        }),
        AtMention.configure({ onState: onAtState, onKey: onAtKey }),
        CurrentBlock,
      ],
      content: toEditorContent(content),
      editorProps: {
        attributes: {
          class: "tiptap-prose",
        },
      },
      onUpdate: ({ editor: ed }) => {
        const html = ed.getHTML();
        // Avoid treating empty doc as meaningful content
        const normalized = html === "<p></p>" ? "" : html;
        onUpdate?.(normalized);
        syncToolbar();
        followCaret();
      },
      onSelectionUpdate: () => {
        syncToolbar();
        followCaret();
      },
      onTransaction: () => {
        syncToolbar();
      },
    });

    const onMouseUp = () => (pointerDown = false);
    window.addEventListener("mouseup", onMouseUp);
    const resizeObserver = new ResizeObserver(() => applyTypewriterPadding());
    resizeObserver.observe(element);
    cleanupWriting = () => {
      window.removeEventListener("mouseup", onMouseUp);
      resizeObserver.disconnect();
      cancelAnimationFrame(followFrame);
    };

    lastMentionKey = mentionKeyOf();
    lastTermsKey = JSON.stringify(highlightTerms);
    if (highlightTerms.length) scrollToFirstSearchHit();
    syncToolbar();
  });

  // Re-scan when the search words change (e.g. a new search on the same scene).
  $effect(() => {
    const key = JSON.stringify(highlightTerms);
    if (!editor || key === lastTermsKey) return;
    lastTermsKey = key;
    editor.view.dispatch(editor.state.tr.setMeta(searchKey, true));
    if (highlightTerms.length) scrollToFirstSearchHit();
  });

  // Re-scan when names/aliases change or the toggle flips (not on every keystroke).
  $effect(() => {
    const key = mentionKeyOf();
    if (!editor || key === lastMentionKey) return;
    lastMentionKey = key;
    hover = null;
    editor.view.dispatch(editor.state.tr.setMeta(mentionKey, true));
  });

  onDestroy(() => {
    cleanupWriting?.();
    editor?.destroy();
    editor = null;
  });

  // When parent switches scene, push new content into the editor
  $effect(() => {
    if (!editor) return;
    if (content === lastSceneContent) return;
    lastSceneContent = content;
    const current = editor.getHTML();
    const incoming = toEditorContent(content);
    // Only reset if the editor doesn't already show this content
    if (current !== incoming && current !== content) {
      editor.commands.setContent(incoming, false);
    }
  });

  /** Accept plain text or HTML; wrap plain text in paragraphs. */
  function toEditorContent(raw: string): string {
    if (!raw || raw.trim() === "") return "";
    // Already looks like HTML
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    // Plain text → preserve paragraphs
    return raw
      .split(/\n\n+/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function run(cmd: () => void) {
    cmd();
    editor?.chain().focus().run();
    syncToolbar();
  }
</script>

<div class="rte" bind:this={root}>
  <div class="toolbar" role="toolbar" aria-label="Formatting">
    <button
      type="button"
      class:active={isBold}
      title="Bold (Ctrl+B)"
      on:click={() => run(() => editor?.chain().focus().toggleBold().run())}
    >
      <strong>B</strong>
    </button>
    <button
      type="button"
      class:active={isItalic}
      title="Italic (Ctrl+I)"
      on:click={() => run(() => editor?.chain().focus().toggleItalic().run())}
    >
      <em>I</em>
    </button>
    <button
      type="button"
      class:active={isStrike}
      title="Strikethrough"
      on:click={() => run(() => editor?.chain().focus().toggleStrike().run())}
    >
      <s>S</s>
    </button>

    <span class="sep"></span>

    <button
      type="button"
      class:active={isHeading2}
      title="Heading"
      on:click={() =>
        run(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
    >
      H
    </button>
    <button
      type="button"
      class:active={isBulletList}
      title="Bullet list"
      on:click={() => run(() => editor?.chain().focus().toggleBulletList().run())}
    >
      • List
    </button>
    <button
      type="button"
      class:active={isOrderedList}
      title="Numbered list"
      on:click={() =>
        run(() => editor?.chain().focus().toggleOrderedList().run())}
    >
      1. List
    </button>
    <button
      type="button"
      class:active={isBlockquote}
      title="Quote"
      on:click={() => run(() => editor?.chain().focus().toggleBlockquote().run())}
    >
      “ ”
    </button>

    <span class="sep"></span>

    <button
      type="button"
      title="Undo"
      on:click={() => run(() => editor?.chain().focus().undo().run())}
    >
      ↶
    </button>
    <button
      type="button"
      title="Redo"
      on:click={() => run(() => editor?.chain().focus().redo().run())}
    >
      ↷
    </button>

    <span class="sep"></span>

    <button
      type="button"
      class:active={showNames}
      title="Underline character and place names (hover for their sheet)"
      on:click={() => (showNames = !showNames)}
    >
      Names
    </button>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="editor-wrap"
    class:dim-others={$settings.dimOthers}
    bind:this={element}
    on:mousedown={() => (pointerDown = true)}
    on:mouseover={onEditorMouseOver}
    on:mouseleave={() => (hover = null)}
    on:scroll={() => (hover = null)}
  ></div>

  {#if at && atOptions.length > 0}
    <div class="at-picker" role="listbox" aria-label="Characters and places" style="left: {at.left}px; top: {at.bottom + 4}px">
      {#each atOptions as option, i}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="at-option"
          class:selected={i === atIndex}
          role="option"
          aria-selected={i === atIndex}
          tabindex="-1"
          on:mousedown|preventDefault={() => pickAt(option)}
          on:mousemove={() => (atIndex = i)}
        >
          {#if option.kind === "existing"}
            <span class="at-dot at-{option.type}"></span>
            <span class="at-name">{option.name}</span>
            {#if option.via}<span class="at-via">as “{option.via}”</span>{/if}
            <span class="at-kind">{option.type}</span>
          {:else}
            <span class="at-plus">＋</span>
            <span class="at-name">New {option.type} “{tidyNewName(option.name)}”</span>
          {/if}
        </div>
      {/each}
      <div class="at-hint">↑↓ choose · Enter insert &amp; link to scene · Esc close</div>
    </div>
  {/if}

  {#if hover && hoverInfo}
    <div class="mention-card" style="left: {hover.left}px; top: {hover.top}px">
      <div class="mc-title">{hoverInfo.title}</div>
      {#if hoverInfo.subtitle}<div class="mc-sub">{hoverInfo.subtitle}</div>{/if}
      {#if hoverInfo.body}<div class="mc-body">{hoverInfo.body}</div>{/if}
      {#if hoverInfo.chips?.length}
        <div class="mc-chips">
          {#each hoverInfo.chips as chip}<span>{chip}</span>{/each}
        </div>
      {/if}
      {#if hoverInfo.aka?.length}
        <div class="mc-aka">Also: {hoverInfo.aka.join(", ")}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .rte {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    flex-shrink: 0;
  }

  .toolbar button {
    min-width: 28px;
    height: 28px;
    padding: 0 0.45rem;
    border-radius: 4px;
    font-size: 0.8rem;
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .toolbar button:hover {
    background: var(--bg-sidebar);
    color: var(--text);
  }

  .toolbar button.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .sep {
    width: 1px;
    height: 18px;
    background: var(--border);
    margin: 0 0.35rem;
  }

  .editor-wrap {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  /* Tiptap / ProseMirror surface */
  .editor-wrap :global(.tiptap-prose) {
    outline: none;
    min-height: 100%;
    padding: 1.5rem 1.75rem var(--tw-bottom, 4rem);
    max-width: var(--editor-width);
    margin: 0 auto;
    font-family: var(--editor-font);
    font-size: var(--editor-size);
    line-height: var(--editor-leading);
    color: var(--text);
  }

  /* "Dim others": everything but the paragraph being written fades back. */
  .editor-wrap.dim-others :global(.tiptap-prose > *:not(.is-current-block)) {
    opacity: 0.38;
  }
  .editor-wrap :global(.tiptap-prose > *) {
    transition: opacity 0.15s ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .editor-wrap :global(.tiptap-prose > *) {
      transition: none;
    }
  }

  .editor-wrap :global(.tiptap-prose p) {
    margin: 0 0 0.85em;
  }

  .editor-wrap :global(.tiptap-prose h2) {
    font-size: 1.3em;
    font-weight: 650;
    margin: 1.25em 0 0.5em;
  }

  .editor-wrap :global(.tiptap-prose h3) {
    font-size: 1.12em;
    font-weight: 600;
    margin: 1.1em 0 0.4em;
  }

  .editor-wrap :global(.tiptap-prose ul),
  .editor-wrap :global(.tiptap-prose ol) {
    padding-left: 1.4em;
    margin: 0 0 0.85em;
  }

  .editor-wrap :global(.tiptap-prose blockquote) {
    border-left: 3px solid var(--border);
    margin: 0 0 0.85em;
    padding: 0.15em 0 0.15em 1em;
    color: var(--text-muted);
  }

  .at-picker {
    position: absolute;
    z-index: 30;
    width: 260px;
    padding: 4px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    font-size: 0.85rem;
  }
  .at-option {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 5px 8px;
    border-radius: 5px;
    cursor: pointer;
    color: var(--text);
  }
  .at-option.selected {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .at-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .at-character { background: var(--char); }
  .at-place { background: var(--place, var(--accent)); }
  .at-plus { color: var(--accent); flex-shrink: 0; }
  .at-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .at-via, .at-kind { font-size: 0.7rem; color: var(--text-muted); }
  .at-hint { padding: 4px 8px 2px; font-size: 0.68rem; color: var(--text-muted); border-top: 1px solid var(--border); margin-top: 3px; }

  .editor-wrap :global(.mention) {
    border-bottom: 1.5px solid;
    border-radius: 2px;
    cursor: help;
  }

  .editor-wrap :global(.mention-character) {
    border-color: var(--char);
    background: color-mix(in srgb, var(--char) 12%, transparent);
  }

  .editor-wrap :global(.mention-place) {
    border-color: var(--place);
    background: color-mix(in srgb, var(--place) 12%, transparent);
  }

  .editor-wrap :global(.search-hit) {
    background: var(--mark-bg);
    color: var(--mark-fg);
    border-radius: 2px;
    box-shadow: 0 0 0 1px var(--mark-ring);
  }

  .mention-card {
    position: absolute;
    z-index: 20;
    width: 280px;
    padding: 0.6rem 0.75rem;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
    pointer-events: none;
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .mc-title {
    font-weight: 650;
    font-size: 0.85rem;
  }

  .mc-sub {
    color: var(--text-muted);
    margin-bottom: 0.3rem;
  }

  .mc-body {
    display: -webkit-box;
    -webkit-line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .mc-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.4rem;
  }

  .mc-chips span {
    background: var(--bg-sidebar);
    border-radius: 999px;
    padding: 0 0.45rem;
    font-size: 0.65rem;
  }

  .mc-aka {
    margin-top: 0.4rem;
    color: var(--text-muted);
    font-size: 0.68rem;
  }

  .editor-wrap :global(.tiptap-prose p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    float: left;
    color: var(--text-muted);
    font-style: italic;
    pointer-events: none;
    height: 0;
  }
</style>
