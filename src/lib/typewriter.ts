/**
 * Typewriter scrolling: while you write, the line with the cursor stays at a fixed
 * height in the editor and the text moves instead. Pure (no DOM, no Svelte) so the
 * arithmetic is tested; RichTextEditor.svelte does the measuring and scrolling.
 */
import type { TypewriterMode } from "./settings";

/** Where the cursor line sits, as a fraction of the editor's height from its top. */
export const TYPEWRITER_POSITION: Record<Exclude<TypewriterMode, "off">, number> = {
  center: 0.5,
  upper: 0.33,
};

export type CaretMeasure = {
  /** The cursor line, in viewport coordinates (what `coordsAtPos` gives). */
  caretTop: number;
  caretBottom: number;
  /** The editor's visible area, in viewport coordinates. */
  viewTop: number;
  viewHeight: number;
  /** The editor's current scroll offset. */
  scrollTop: number;
};

/**
 * The scroll offset that puts the cursor line at the wanted height, or null when it is
 * already there (within a pixel) or the measurements are unusable. Never negative.
 */
export function typewriterScrollTop(m: CaretMeasure, mode: Exclude<TypewriterMode, "off">): number | null {
  const nums = [m.caretTop, m.caretBottom, m.viewTop, m.viewHeight, m.scrollTop];
  if (!nums.every(Number.isFinite) || m.viewHeight <= 0) return null;
  const lineMiddle = (m.caretTop + m.caretBottom) / 2 - m.viewTop;
  const delta = lineMiddle - m.viewHeight * TYPEWRITER_POSITION[mode];
  if (Math.abs(delta) < 1) return null;
  return Math.max(0, Math.round(m.scrollTop + delta));
}

/**
 * Space needed under the text so the last line can reach the wanted height
 * (otherwise the end of the scene could never scroll up to it).
 */
export function typewriterBottomPadding(viewHeight: number, mode: TypewriterMode): number {
  if (mode === "off" || !Number.isFinite(viewHeight) || viewHeight <= 0) return 0;
  return Math.round(viewHeight * (1 - TYPEWRITER_POSITION[mode]));
}
