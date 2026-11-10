/** Menu item model + shortcut display (pure; tested). */

export type MenuItem = {
  label?: string;
  /** Written as "Ctrl+Shift+S"; shown as ⌘⇧S on macOS. */
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  /** Draw a line instead of an item. */
  separator?: boolean;
  /** Makes this item open a submenu (and `action` is ignored). */
  children?: MenuItem[];
};

export const hasChildren = (item: MenuItem): boolean => !!item.children && item.children.length > 0;

export function formatShortcut(shortcut: string, mac: boolean): string {
  if (!mac) return shortcut;
  return shortcut
    .replace(/Ctrl\+/g, "⌘")
    .replace(/Shift\+/g, "⇧")
    .replace(/Alt\+/g, "⌥");
}

/** Indexes of the items that can be focused/activated (no separators, none disabled). */
export function actionableIndexes(items: MenuItem[]): number[] {
  const out: number[] = [];
  items.forEach((it, i) => {
    if (!it.separator && !it.disabled) out.push(i);
  });
  return out;
}

/** Next position in a list of `count` focusable entries; wraps around. `current` -1 = nothing focused yet. */
export function stepIndex(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}
