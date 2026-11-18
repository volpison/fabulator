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
    // A rotation or a window change makes the page taller: remember the new tallest height.
    if (win.innerHeight > tallest) tallest = win.innerHeight;
    win.document.documentElement.classList.toggle("keyboard", keyboardOpen(win.innerHeight, tallest));
  };
  win.addEventListener("resize", update);
  return () => win.removeEventListener("resize", update);
}
