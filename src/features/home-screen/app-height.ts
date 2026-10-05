/**
 * THE APP'S HEIGHT IN THE HOME SCREEN APP (Oct 3 2026).
 *
 * AJ's iPad, the Home Screen app, iPadOS 26: a dark strip about 20 points
 * tall along the foot of the screen, and the bottom bar landing on either
 * side of it — above it on Clients (a gap under the bar), under it on
 * Settings (HUB, CLIENT… cut in half). iPadOS was giving the page two
 * heights about a strip apart, and `100dvh` (the shell's height) followed
 * one while the page followed the other. Under the strip iPadOS does not
 * draw the page at all (the Sep 27 note in this folder's README), so no
 * colour can reach it: the only safe place for the bar is above it.
 *
 * So in the Home Screen app the shell takes the SMALLEST height iPadOS
 * reports — the window, the document, and what `100dvh` resolves to — and
 * re-measures whenever the window changes. The bar then always sits above
 * the strip, whole. In a Safari tab nothing changes: the shell keeps
 * `100dvh`, which has always been right there.
 *
 * `--app-h` and `data-app-h` on <html> are the only things written; index.css
 * reads them ("The app's height" in the safe-area section).
 */

/** The smallest usable height (a positive, finite number), or null when none is. */
export function visibleHeight(reported: ReadonlyArray<number | null | undefined>): number | null {
  const usable = reported.filter((h): h is number => typeof h === "number" && Number.isFinite(h) && h > 0);
  return usable.length > 0 ? Math.floor(Math.min(...usable)) : null;
}

/** True in the Home Screen app (standalone), on iPadOS and anywhere else. */
export function isStandalone(win: Window = window): boolean {
  try {
    if (win.matchMedia?.("(display-mode: standalone)").matches) return true;
  } catch {
    /* no matchMedia: not standalone */
  }
  return (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** What `100<unit>` resolves to right now, measured on a probe; null where the unit is unknown. */
function unitNow(doc: Document, unit: "dvh" | "lvh"): number | null {
  const probe = doc.createElement("div");
  probe.style.cssText = `position:fixed;top:0;left:0;width:0;height:100${unit};visibility:hidden;pointer-events:none`;
  doc.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h > 0 ? h : null;
}

/** The heights iPadOS reports right now. Exported for the Settings line. */
export function reportedHeights(win: Window = window): { inner: number; client: number; dvh: number | null } {
  const doc = win.document;
  return { inner: win.innerHeight, client: doc.documentElement.clientHeight, dvh: unitNow(doc, "dvh") };
}

/**
 * Two more numbers for the Settings line only (Oct 5 2026), never for the
 * shell: what `100lvh` resolves to and the screen's own height in the way it
 * is held. Other web apps on iOS 26 found every height above short by the
 * status bar and only `100lvh` whole; a photo of the line says whether that
 * is so on our iPads before the shell trusts it.
 */
export function moreHeights(win: Window = window): { lvh: number | null; screen: number | null } {
  const s = win.screen;
  const held = s ? (win.innerWidth > win.innerHeight ? Math.min(s.width, s.height) : Math.max(s.width, s.height)) : 0;
  return { lvh: unitNow(win.document, "lvh"), screen: held > 0 ? held : null };
}

let watching = false;

/**
 * Start watching, once, in the Home Screen app only. Safe to call more than
 * once; a no-op in a Safari tab and outside a browser.
 */
export function watchAppHeight(win: Window = window): void {
  if (watching || typeof win === "undefined" || !win.document?.body || !isStandalone(win)) return;
  watching = true;
  const root = win.document.documentElement;

  const apply = () => {
    const r = reportedHeights(win);
    const h = visibleHeight([r.inner, r.client, r.dvh]);
    if (h === null) {
      root.removeAttribute("data-app-h");
      root.style.removeProperty("--app-h");
      return;
    }
    root.style.setProperty("--app-h", `${h}px`);
    root.setAttribute("data-app-h", "");
  };

  // iPadOS settles its numbers a frame or two after a rotation or a return
  // to the app, so measure now and again shortly after.
  const soon = () => {
    apply();
    win.requestAnimationFrame?.(apply);
    win.setTimeout(apply, 250);
  };

  soon();
  win.addEventListener("resize", soon);
  win.addEventListener("orientationchange", soon);
  win.addEventListener("pageshow", soon);
  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState === "visible") soon();
  });
}
