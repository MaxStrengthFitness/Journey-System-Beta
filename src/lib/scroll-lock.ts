/**
 * RELEASING A LEAKED MODAL SCROLL LOCK.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * "Switch Studio" lives inside a Radix DropdownMenu. Choosing it sets
 * `isChangingStudio`, and AppContent answers that with an EARLY RETURN — so in
 * the same React commit the whole menu, still open, is torn out of the tree.
 *
 * A modal Radix layer does two things to the document while it is open:
 *   1. `DismissableLayer` sets `document.body.style.pointerEvents = "none"` so
 *      nothing behind the menu can be clicked;
 *   2. `react-remove-scroll` locks body scrolling and marks the document with
 *      `data-scroll-locked`.
 * Both are undone by cleanup on the normal close path. Unmounting the layer
 * while it is open can skip that cleanup, and then `pointer-events: none`
 * stays on <body> for the life of the page.
 *
 * WHY THAT LOOKED LIKE AN iPAD-ONLY BUG
 * -------------------------------------
 * With pointer-events disabled on <body>, a touch cannot hit-test its way to
 * the scroll container, so iPadOS has nothing to pan and the screen is frozen.
 * A mouse wheel does not hit-test the same way — the desktop keeps scrolling
 * and the bug is invisible on a PC. Same broken state, one input device that
 * happens to survive it.
 *
 * THE REAL FIX is not to unmount an open menu (AppContent now closes it first
 * and defers the view change by a tick). This function is the SAFETY NET for
 * every other path that might do the same thing — and it is idempotent, so
 * calling it when nothing is stuck costs one style read.
 */

/** Attributes/styles a modal layer can leave behind on the document. */
export function releaseUiScrollLock(): void {
  if (typeof document === "undefined") return;

  const body = document.body;
  if (!body) return;

  // 1. The one that actually freezes touch input.
  if (body.style.pointerEvents === "none") {
    body.style.removeProperty("pointer-events");
  }

  // 2. react-remove-scroll's body lock. Only clear what it sets, and only if
  //    no modal layer is currently open — otherwise we would unlock a dialog
  //    that legitimately wants the page still.
  const layerOpen = document.querySelector(
    "[data-radix-popper-content-wrapper], [role='dialog'][data-state='open'], [role='menu'][data-state='open']",
  );
  if (layerOpen) return;

  if (body.hasAttribute("data-scroll-locked")) {
    body.removeAttribute("data-scroll-locked");
  }
  if (body.style.overflow === "hidden") {
    body.style.removeProperty("overflow");
  }
  // The lock adds compensating padding for the scrollbar it removed. Left
  // behind, it shows up as an unexplained gutter down the right-hand side.
  if (body.style.paddingRight) {
    body.style.removeProperty("padding-right");
  }
  if (body.style.marginRight) {
    body.style.removeProperty("margin-right");
  }
}

/**
 * Run `navigate` only after any open menu/dialog has finished closing.
 *
 * Two frames, not one: the first lets React commit the `open=false` state, the
 * second lets Radix's own cleanup effects run against it. Anything that swaps
 * a whole screen out from under an open Radix layer should go through here.
 */
export function afterOverlayClose(navigate: () => void): void {
  if (typeof window === "undefined") {
    navigate();
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      releaseUiScrollLock();
      navigate();
    });
  });
}
