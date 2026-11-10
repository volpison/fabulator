/**
 * Tiptap extension: underline character/place names (and aliases) in the
 * editor. Purely visual (ProseMirror decorations): the document is never
 * modified, so nothing is saved into your text.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { mentionRangesInBlock, type Entity } from "./mentions";

/** Dispatch a transaction with this meta set to force a re-scan (e.g. after aliases change). */
export const mentionKey = new PluginKey<DecorationSet>("fabulatorMentions");

export interface MentionHighlightOptions {
  /** Called on every re-scan, so it can return the latest entities. */
  getEntities: () => Entity[];
}

function buildDecorations(doc: PMNode, entities: Entity[]): DecorationSet {
  if (entities.length === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true; // keep looking inside quotes, lists…
    for (const { from, to, mention } of mentionRangesInBlock(node, pos, entities)) {
      decorations.push(
        Decoration.inline(from, to, {
          class: `mention mention-${mention.type}`,
          "data-mention-type": mention.type,
          "data-mention-id": mention.id,
        })
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export const MentionHighlight = Extension.create<MentionHighlightOptions>({
  name: "mentionHighlight",

  addOptions() {
    return { getEntities: () => [] };
  },

  addProseMirrorPlugins() {
    const getEntities = this.options.getEntities;
    return [
      new Plugin<DecorationSet>({
        key: mentionKey,
        state: {
          init: (_config, state) => buildDecorations(state.doc, getEntities()),
          apply: (tr, old, _oldState, newState) =>
            tr.docChanged || tr.getMeta(mentionKey)
              ? buildDecorations(newState.doc, getEntities())
              : old.map(tr.mapping, tr.doc),
        },
        props: {
          decorations(state) {
            return mentionKey.getState(state);
          },
        },
      }),
    ];
  },
});
