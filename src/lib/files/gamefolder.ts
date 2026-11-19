/**
 * A game as a folder of Markdown files (an export for reading, diffing and git; not opened again):
 *
 *   project.json                          title, premise, cast, places, abilities, plotlines, the game's variables and items
 *   state.md                              every flag, number and item, and where each is set and read
 *   quests/01-the-fall/_quest.md          quest id, kind, "offered when" (header), summary (body)
 *   quests/01-the-fall/01-the-well.md     node header (status, cast, rules in words) and its text, choices and ways out
 *
 * The order is the order of the file names, like the novel folder. Conditions and effects are written
 * as sentences (they are for people to read). Pure: the app writes the files.
 */
import { FOLDER_FORMAT, FOLDER_VERSION, PROJECT_FILE, header, pad, slug, widthFor, withNewline, type FolderFile } from "./folder";
import { nodesInQuest } from "../game/game";
import { nodeLabels } from "../game/gameedit";
import { contextOf, describeCondition, describeEffect } from "../game/gamerules";
import { nodeBlocks, stateUsage } from "../export/game";
import { renderBlocks } from "../export/markdown";
import type { Project } from "../model/types";

export const QUEST_FILE = "_quest.md";

export function gameToFolder(p: Project): FolderFile[] {
  const g = p.game;
  const files: FolderFile[] = [];
  const ctx = contextOf(p);
  const labels = nodeLabels(p);
  const chars = new Map(p.characters.map((c) => [c.id, c.name]));
  const places = new Map(p.places.map((x) => [x.id, x.name]));
  const plots = new Map(p.plotlines.map((x) => [x.id, x.name]));

  files.push({
    path: PROJECT_FILE,
    text:
      JSON.stringify(
        {
          format: FOLDER_FORMAT,
          version: FOLDER_VERSION,
          schema_version: p.schema_version,
          story_format: p.story_format,
          id: p.id,
          title: p.title,
          premise: p.premise,
          genre: p.genre,
          theme: p.theme,
          plotlines: p.plotlines,
          characters: p.characters,
          places: p.places,
          abilities: p.abilities,
          game: { variables: g?.variables ?? [], items: g?.items ?? [] },
        },
        null,
        2
      ) + "\n",
  });
  if (!g) return files;

  // State
  const { variables, items } = stateUsage(p);
  const stateLines: string[] = ["# State", ""];
  const entry = (name: string, kind: string, use: { read: string[]; written: string[] } | undefined, notes: string) => {
    stateLines.push(`## ${name} (${kind})`, "");
    if (notes.trim()) stateLines.push(notes.trim(), "");
    stateLines.push(`- Read in: ${use?.read.length ? use.read.join(", ") : "nowhere"}`, `- Set in: ${use?.written.length ? use.written.join(", ") : "nowhere"}`, "");
  };
  for (const v of g.variables) entry(v.label.trim() || v.id, v.kind, variables.get(v.id), v.notes);
  for (const i of g.items) entry(i.name.trim() || i.id, "item", items.get(i.id), i.description);
  if (g.variables.length + g.items.length > 0) files.push({ path: "state.md", text: stateLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n" });

  // Quests and nodes
  const qw = widthFor(g.quests.length);
  g.quests.forEach((q, qi) => {
    const dir = `quests/${pad(qi, qw)}-${slug(q.title)}`;
    files.push({
      path: `${dir}/${QUEST_FILE}`,
      text:
        header([
          ["id", q.id],
          ["title", q.title],
          ["kind", q.kind],
          ["plotline", plots.get(q.plotline_id) ?? ""],
          ["offered_when", q.requires.map((k) => describeCondition(ctx, k))],
        ]) + (q.summary.trim() ? `\n${withNewline(q.summary.trim())}` : ""),
    });
    const nodes = nodesInQuest(g.nodes, q.id);
    const nw = widthFor(nodes.length);
    nodes.forEach((n, ni) => {
      const blocks = nodeBlocks(p, n, ctx, labels.get(n.id) ?? "", true).slice(1); // the file's own title replaces the heading
      const body = renderBlocks(blocks);
      files.push({
        path: `${dir}/${pad(ni, nw)}-${slug(n.title)}.md`,
        text:
          header([
            ["id", n.id],
            ["number", labels.get(n.id) ?? ""],
            ["title", n.title],
            ["status", n.status],
            ["ending", n.ending ? "true" : ""],
            ["plotline", plots.get(n.plotline_id) ?? ""],
            ["characters", n.character_ids.map((id) => chars.get(id) ?? "").filter(Boolean)],
            ["places", n.place_ids.map((id) => places.get(id) ?? "").filter(Boolean)],
            ["tags", n.tags],
            ["available_when", n.requires.map((k) => describeCondition(ctx, k))],
            ["effects", n.effects.map((e) => describeEffect(ctx, e))],
          ]) + (body ? `\n${body}\n` : ""),
      });
    });
  });
  return files;
}
