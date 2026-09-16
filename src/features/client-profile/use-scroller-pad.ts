import { useLayoutEffect, type RefObject } from "react";

/**
 * THE STICKY-PADDING TRAP, as a hook (review round, Sep 2026).
 *
 * The app shell never scrolls the document; an inner padded container does,
 * and every engine pins a sticky box INSIDE that padding. So `top: 0` sticks
 * 24px down (rows slide past above it) and `bottom: 0` sticks 24px up (rows
 * show below it). ProfileSubnav and the History month headers already measure
 * this; the record's jump rail and Save bar did not.
 *
 * This measures the nearest scrolling ancestor's padding and publishes it,
 * negated, on the element as --scroll-pad-top / --scroll-pad-bottom, so CSS
 * can say `top: var(--scroll-pad-top, 0px)`.
 */
export function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return p;
  }
  return null;
}

export function useScrollerPad(ref: RefObject<HTMLElement | null>, enabled = true) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const apply = () => {
      const scroller = scrollParentOf(el);
      const cs = scroller ? getComputedStyle(scroller) : null;
      el.style.setProperty("--scroll-pad-top", `${-(parseFloat(cs?.paddingTop || "0") || 0)}px`);
      el.style.setProperty("--scroll-pad-bottom", `${-(parseFloat(cs?.paddingBottom || "0") || 0)}px`);
    };
    apply();
    // Feature-detected: a throw in a layout effect takes the screen down.
    let ro: ResizeObserver | null = null;
    const scroller = scrollParentOf(el);
    if (typeof ResizeObserver === "function" && scroller) {
      ro = new ResizeObserver(apply);
      ro.observe(scroller);
    }
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [ref, enabled]);
}
