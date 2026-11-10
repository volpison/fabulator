/**
 * Tiptap extension: reports when the cursor is right after "@query" (and where
 * on screen), and lets the host handle the arrow/Enter/Escape keys while the
 * picker is open. It never changes the document itself.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { findAtQuery } from "./atMention";

export type AtState = {
  query: string;
  /** Document range of "@query". */
  from: number;
  to: number;
  /** Viewport coordinates of the "@". */
  left: number;
  bottom: number;
};

export interface AtMentionOptions {
  /** Called when the picker should open / move / close (null). */
  onState: (state: AtState | null) => void;
  /** Return true if the key was used by the picker. Only called while it is open. */
  onKey: (event: KeyboardEvent) => boolean;
}

const atKey = new PluginKey("fabulatorAtMention");

function read(view: EditorView): AtState | null {
  const { selection } = view.state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  if (!$from.parent.isTextblock) return null;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const found = findAtQuery(textBefore);
  if (!found) return null;
  const from = $from.start() + found.start;
  const coords = view.coordsAtPos(from);
  return { query: found.query, from, to: $from.pos, left: coords.left, bottom: coords.bottom };
}

export const AtMention = Extension.create<AtMentionOptions>({
  name: "atMention",

  addOptions() {
    return { onState: () => {}, onKey: () => false };
  },

  addProseMirrorPlugins() {
    const { onState, onKey } = this.options;
    let open = false;
    return [
      new Plugin({
        key: atKey,
        view: () => ({
          update(view) {
            const state = read(view);
            if (state || open) onState(state);
            open = !!state;
          },
          destroy() {
            if (open) onState(null);
          },
        }),
        props: {
          handleKeyDown(_view, event) {
            return open ? onKey(event) : false;
          },
        },
      }),
    ];
  },
});
