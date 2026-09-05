import { useEffect, useState } from "react";

/**
 * Which of the catalog's two layouts is live.
 *
 * Round: Catalog Redesign, Sep 2026.
 *
 *   split — three columns; the figure column never scrolls because only the
 *           rail and the detail pane overflow. Landscape iPad and desktop.
 *   stack — one column; the PAGE scrolls and nothing inside it does, with the
 *           figure condensing into a sticky bar rather than disappearing.
 *
 * 1024px, matching features/equipment's SPLIT_AT exactly, so the two screens
 * change shape at the same moment. iPad Pro 11" is 834 portrait / 1194
 * landscape, so the breakpoint reads as an orientation switch on the hardware
 * this is actually used on.
 *
 * matchMedia rather than a resize listener: it fires once on the crossing
 * instead of on every pixel of the rotation animation.
 */
export const SPLIT_AT = 1024;

export type LayoutMode = "stack" | "split";

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() =>
    typeof window === "undefined" || window.innerWidth >= SPLIT_AT
      ? "split"
      : "stack",
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SPLIT_AT}px)`);
    const onChange = (e: MediaQueryListEvent) =>
      setMode(e.matches ? "split" : "stack");
    setMode(mq.matches ? "split" : "stack");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mode;
}
