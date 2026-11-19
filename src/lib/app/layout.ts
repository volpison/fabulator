/** Side panel width: limits, clamping and what is read back from storage. */
export const PANEL_MIN = 260;
export const PANEL_MAX = 720;
export const PANEL_DEFAULT = 320;

export function clampPanelWidth(value: unknown, viewport = Infinity): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : PANEL_DEFAULT;
  // Never let the panel take more than 60% of the window.
  const max = Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.floor(viewport * 0.6)));
  return Math.round(Math.min(max, Math.max(PANEL_MIN, n)));
}
