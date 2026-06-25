"use client";

/**
 * Clear a leftover Radix `pointer-events: none` lock on <body>.
 *
 * Radix (DropdownMenu / Dialog) sets `body { pointer-events: none }` while open
 * so only the overlay is interactive, and restores it on close. But when a Dialog
 * is opened FROM a DropdownMenu item and then closed while the page re-renders
 * (e.g. deleting a row, which closes the dialog and reloads the list in the same
 * tick), the restore can be skipped — leaving the whole page non-interactive
 * until a manual refresh. AdminShell clears this on route changes, but an
 * in-place action (no navigation) never triggers that, so call this after such a
 * close. Clears immediately, next frame, and after the close animation settles.
 */
export function unlockBody(): void {
  if (typeof document === "undefined") return;
  const clear = () => {
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = "";
    }
  };
  clear();
  requestAnimationFrame(clear);
  setTimeout(clear, 300);
}
