/** Pure helpers for managing plotlines (Timeline lanes). No Svelte, no Tauri. */
import type { Plotline, Scene } from "./types";

export const PLOTLINE_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b",
] as const;

/** A #rrggbb colour (lower-cased), or null. */
export function cleanPlotlineColor(x: unknown): string | null {
  return typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x.trim()) ? x.trim().toLowerCase() : null;
}

/** The first palette colour no plotline uses yet (cycles when all are taken). */
export function nextPlotlineColor(plotlines: Pick<Plotline, "color">[]): string {
  const used = new Set(plotlines.map((p) => p.color.toLowerCase()));
  return PLOTLINE_COLORS.find((c) => !used.has(c)) ?? PLOTLINE_COLORS[plotlines.length % PLOTLINE_COLORS.length];
}

export function addPlotline(plotlines: Plotline[], id: string, name?: string): Plotline[] {
  const clean = name?.trim();
  return [
    ...plotlines,
    { id, name: clean || `Plotline ${plotlines.length + 1}`, color: nextPlotlineColor(plotlines) },
  ];
}

/** Change name and/or colour. Blank names and invalid colours are ignored. */
export function updatePlotlineIn(
  plotlines: Plotline[],
  id: string,
  fields: { name?: string; color?: string }
): Plotline[] {
  let changed = false;
  const out = plotlines.map((p) => {
    if (p.id !== id) return p;
    const name = fields.name === undefined ? p.name : fields.name.trim() || p.name;
    const color = fields.color === undefined ? p.color : (cleanPlotlineColor(fields.color) ?? p.color);
    if (name === p.name && color === p.color) return p;
    changed = true;
    return { ...p, name, color };
  });
  return changed ? out : plotlines;
}

/**
 * Delete a plotline; its scenes move to `moveTo` (default: the first remaining one).
 * The last plotline can never be deleted (null).
 */
export function removePlotline(
  plotlines: Plotline[],
  scenes: Scene[],
  id: string,
  moveTo?: string
): { plotlines: Plotline[]; scenes: Scene[] } | null {
  if (plotlines.length <= 1 || !plotlines.some((p) => p.id === id)) return null;
  const rest = plotlines.filter((p) => p.id !== id);
  const target = rest.find((p) => p.id === moveTo)?.id ?? rest[0].id;
  return {
    plotlines: rest,
    scenes: scenes.map((s) => (s.plotline_id === id ? { ...s, plotline_id: target } : s)),
  };
}

/** Move a plotline up (-1) or down (+1) in the lane order. */
export function movePlotlineBy(plotlines: Plotline[], id: string, delta: number): Plotline[] {
  const i = plotlines.findIndex((p) => p.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= plotlines.length) return plotlines;
  const out = plotlines.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
