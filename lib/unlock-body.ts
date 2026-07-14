"use client";

/**
 * Clear a leftover Radix `pointer-events: none` lock on <body>.
 *
 * Radix (DropdownMenu / Dialog) sets `body { pointer-events: none }` while open
 * so only the overlay is interactive, and restores it on close. But when a Dialog
 * is opened FROM a DropdownMenu item, the two overlays' scroll locks overlap and
 * the lock gets re-applied when the Dialog UNMOUNTS at the end of its close
 * animation — a couple of hundred ms AFTER the close was requested, with nothing
 * open — and the restore is skipped, freezing the whole page until a refresh.
 * AdminShell clears this on route changes, but an in-place close (no navigation)
 * never triggers that, so call this after such a close.
 *
 * The stray lock lands on a delay that a single fixed timeout can miss (it varies
 * with animation/machine speed), so instead of guessing the moment we watch
 * <body> for a short window and clear the lock whenever it reappears — but never
 * while a Radix overlay is genuinely open, since that lock is intentional.
 */
export function unlockBody(): void {
  if (typeof document === "undefined") return;

  // A menu/dialog that is actually open owns the lock legitimately — don't fight it.
  const anOverlayIsOpen = () =>
    !!document.querySelector(
      '[data-state="open"][role="menu"], [data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-radix-menu-content][data-state="open"]'
    );

  const clear = () => {
    if (document.body.style.pointerEvents === "none" && !anOverlayIsOpen()) {
      document.body.style.pointerEvents = "";
    }
  };

  clear();
  requestAnimationFrame(clear);

  // Watch for the late re-lock (applied on overlay unmount) and clear it whenever
  // it appears, for a bounded window, then stop. Writing the style re-triggers the
  // observer, but clear() is a no-op once it's already "", so there's no loop.
  const obs = new MutationObserver(clear);
  obs.observe(document.body, { attributes: true, attributeFilter: ["style"] });
  window.setTimeout(() => {
    clear();
    obs.disconnect();
  }, 1200);
}
