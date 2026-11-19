/**
 * Tiptap extension: marks the top-level block (paragraph, heading, list…) that holds the
 * cursor with the class `is-current-block`, so "Dim others" can fade everything else with
 * CSS. It only adds a decoration; it never changes the document.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const currentKey = new PluginKey("fabulatorCurrentBlock");

export const CurrentBlock = Extension.create({
  name: "currentBlock",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: currentKey,
        props: {
          decorations(state) {
            const { $from } = state.selection;
            if ($from.depth < 1) return null;
            const from = $from.before(1);
            const node = state.doc.nodeAt(from);
            if (!node) return null;
            return DecorationSet.create(state.doc, [
              Decoration.node(from, from + node.nodeSize, { class: "is-current-block" }),
            ]);
          },
        },
      }),
    ];
  },
});
