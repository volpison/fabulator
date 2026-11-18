/**
 * Is the on-screen keyboard open? On Android the keyboard shrinks the page instead of covering it,
 * so the page is noticeably shorter than the tallest it has been. Pure: the caller passes the heights.
 */
export function keyboardOpen(currentHeight: number, tallestHeight: number): boolean {
  return tallestHeight > 0 && currentHeight < tallestHeight * 0.75;
}

/**
 * Keep `<html class="keyboard">` in step with the keyboard (Android only), so the style sheet can
 * fold away secondary parts of the writing view and leave room to write.
 */
export function watchKeyboard(win: Window = window): () => void {
  let tallest = win.innerHeight;
  const update = () => {
    const height = win.visualViewport?.height ?? win.innerHeight;
    // A rotation or a window change makes the page taller: remember the new tallest height.
    if (height > tallest) tallest = height;
    win.document.documentElement.classList.toggle("keyboard", keyboardOpen(height, tallest));
  };
  // The keyboard's animation and the page's resize do not arrive in a fixed order: look again shortly after.
  const soon = () => {
    update();
    win.setTimeout(update, 250);
    win.setTimeout(update, 700);
  };
  win.addEventListener("resize", soon);
  win.visualViewport?.addEventListener("resize", soon);
  win.addEventListener("focusin", soon);
  win.addEventListener("focusout", soon);
  return () => {
    win.removeEventListener("resize", soon);
    win.visualViewport?.removeEventListener("resize", soon);
    win.removeEventListener("focusin", soon);
    win.removeEventListener("focusout", soon);
  };
}
