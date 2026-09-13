import { useEffect, useState } from "react";

/** True while `query` matches; re-renders on change. SSR/test-safe. */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [matches, setMatches] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * When the Active Session's Now bar moves from under the grid to beside it.
 * Landscape on an iPad (≥1000px wide): the grid keeps its full height and
 * the bar becomes a right-hand column. Portrait, and any narrower screen,
 * keeps the bar at the bottom.
 */
export const NOW_BAR_SIDE_QUERY = "(min-width: 1000px) and (orientation: landscape)";
