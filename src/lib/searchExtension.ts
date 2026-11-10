/**
 * Tiptap extension: underline the words you searched for inside a scene.
 * Visual only (decorations); the document is never modified.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { termRangesInBlock } from "./search";

/** Dispatch a transaction with this meta set to force a re-scan (terms changed). */
export const searchKey = new PluginKey<DecorationSet>("fabulatorSearch");

export interface SearchHighlightOptions {
  getTerms: () => string[];
}

function build(doc: PMNode, terms: string[]): DecorationSet {
  if (terms.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    for (const { from, to } of termRangesInBlock(node, pos, terms)) {
      decorations.push(Decoration.inline(from, to, { class: "search-hit" }));
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export const SearchHighlight = Extension.create<SearchHighlightOptions>({
  name: "searchHighlight",

  addOptions() {
    return { getTerms: () => [] };
  },

  addProseMirrorPlugins() {
    const getTerms = this.options.getTerms;
    return [
      new Plugin<DecorationSet>({
        key: searchKey,
        state: {
          init: (_config, state) => build(state.doc, getTerms()),
          apply: (tr, old, _oldState, newState) =>
            tr.docChanged || tr.getMeta(searchKey)
              ? build(newState.doc, getTerms())
              : old.map(tr.mapping, tr.doc),
        },
        props: {
          decorations(state) {
            return searchKey.getState(state);
          },
        },
      }),
    ];
  },
});
