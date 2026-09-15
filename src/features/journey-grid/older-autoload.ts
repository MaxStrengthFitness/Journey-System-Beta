/**
 * OLDER SESSIONS, WITHOUT A BUTTON — the profile grid's continuous history.
 *
 * The Journey tab used to page backwards through an "Older +7" pill in the
 * toolbar: reach the left edge, lift a hand, find the pill, tap, find your
 * place again. Now the grid reveals the next page on its own when the trainer
 * scrolls to within about one column of the oldest session drawn. The sticky
 * rail beside the Analytics column stays, as a quiet status ("Older",
 * "Loading…", "Start of history") and as a tap target for the one case a
 * scroll cannot reach — a timeline short enough that there is nothing to
 * scroll yet.
 *
 * The decision is pure so it can be tested without a browser. Four rules, all
 * load-bearing:
 *
 *   1. Only after the trainer has touched the grid. The grid opens scrolled
 *      to the far right, but for one frame scrollLeft is 0 — without this
 *      rule every profile would fetch a second page on open.
 *   2. Never while a page is already on its way.
 *   3. Never when there is nothing left.
 *   4. Once per arrival at the edge. A request that changes nothing (an
 *      empty page, a failed read) must not turn into a loop; the trainer
 *      scrolling away and back is what asks again.
 *
 * The Active Session does not use any of this — its grid keeps its own
 * "Older" rail exactly as it was.
 */

export interface AutoLoadInput {
  /** The scroller's scrollLeft, px. 0 = the oldest drawn column is in view. */
  scrollLeft: number;
  /** Width of one session column, px — the "about one column" of the threshold. */
  columnWidth: number;
  /** The trainer has scrolled, tapped or wheeled inside the grid. */
  userTouched: boolean;
  /** A page of older sessions is on its way. */
  loading: boolean;
  /** More columns can be revealed or fetched. */
  canLoadOlder: boolean;
  /** Already asked at this edge, and the timeline has not changed since. */
  pending: boolean;
}

/** The fallback when a column cannot be measured (jsdom, the first frame). */
export const DEFAULT_COLUMN_WIDTH = 84;

/** True when the grid should reveal or fetch the next page now. */
export function shouldAutoLoadOlder(input: AutoLoadInput): boolean {
  if (!input.userTouched || input.loading || !input.canLoadOlder || input.pending) return false;
  return isAtOlderEdge(input.scrollLeft, input.columnWidth);
}

/** Within one column of the left edge. A non-finite or silly width falls back. */
export function isAtOlderEdge(scrollLeft: number, columnWidth: number): boolean {
  const width = Number.isFinite(columnWidth) && columnWidth > 0 ? columnWidth : DEFAULT_COLUMN_WIDTH;
  return Math.max(0, scrollLeft) <= width;
}

/**
 * A horizontal drag that is asking for older sessions: the content pulled to
 * the RIGHT (older is on the left), further than a tap wobbles, and more
 * sideways than up-and-down so a vertical page scroll never triggers it.
 * Only consulted when the timeline does not overflow — then there is no
 * scroll event to listen to, and this is the only signal there is.
 */
export function isOlderGesture(dx: number, dy: number, minTravel = 12): boolean {
  return dx > minTravel && Math.abs(dx) > Math.abs(dy);
}

/** A wheel or trackpad movement toward the older end. */
export function isOlderWheel(deltaX: number, deltaY: number): boolean {
  return deltaX < 0 && Math.abs(deltaX) > Math.abs(deltaY);
}

export type OlderRailState = "more" | "loading" | "start";

export function olderRailState(loading: boolean, canLoadOlder: boolean): OlderRailState {
  if (loading) return "loading";
  return canLoadOlder ? "more" : "start";
}

/** What the rail says. Words, not a spinner: the grid stays usable while it loads. */
export const OLDER_RAIL_LABEL: Record<OlderRailState, string> = {
  more: "Older",
  loading: "Loading…",
  start: "Start of history",
};

/** What a screen reader hears on the rail's button. */
export const OLDER_RAIL_SPOKEN: Record<OlderRailState, string> = {
  more: "Show older sessions",
  loading: "Loading older sessions",
  start: "Start of history. There are no older sessions.",
};
