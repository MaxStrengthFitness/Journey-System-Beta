/**
 * A CLOCK THAT MOVES ONLY WHEN THE ANSWER WOULD (the iPad round, Oct 2026).
 *
 * The Client Directory and the Operations pages used to hand a minute clock to
 * their models, so every model on screen worked itself out again once a minute
 * whether or not anything it says had changed. The perf lab measured 240 ms
 * (iPad 10) and 434 ms (older iPad) of frozen Directory at each minute.
 *
 * What those models say about the time only changes at a few instants: the
 * studio's day turning over, and the boundaries the screen names (a booking
 * starting or ending, so "Coming up" becomes "Earlier today"; the held
 * bookings turning stale; last night's record turning old). This clock still
 * looks once a minute, but hands out a new time only when one of those has
 * been crossed since the time it last handed out, so a model keyed on it is
 * worked out at those instants and never in between, and the screen does not
 * render at all in between. A boundary is noticed within the minute, as
 * before, and a boundary that new data puts behind the held time (a booking
 * that arrives already over) moves the clock straight away.
 *
 * The rule is the pure `clockMoved`; `useBoundaryClock` is the clock a screen
 * owns, `useSettledNow` the same rule over a time a screen is already given.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getActiveTimeZone, studioTodayKey } from "./studio-time";

/** How often the clock looks: the minute the screens always answered within. */
export const BOUNDARY_CHECK_MS = 60_000;

/** The first boundary strictly after `fromMs` in an ascending list, or null. */
export function nextBoundaryAfter(sorted: readonly number[], fromMs: number): number | null {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= fromMs) lo = mid + 1;
    else hi = mid;
  }
  return lo < sorted.length ? sorted[lo] : null;
}

/** A boundary b with heldMs < b <= nowMs in any of the lists. */
function crossed(heldMs: number, nowMs: number, lists: Iterable<readonly number[]>): boolean {
  for (const sorted of lists) {
    const next = nextBoundaryAfter(sorted, heldMs);
    if (next !== null && next <= nowMs) return true;
  }
  return false;
}

/**
 * Has the time moved from `heldMs` to `nowMs` across anything a model keyed
 * on it would say differently? The studio's day turning, a boundary b with
 * heldMs < b <= nowMs, or the iPad's clock going backwards.
 */
export function clockMoved(
  heldMs: number,
  nowMs: number,
  sorted: readonly number[] | Iterable<readonly number[]>,
  tz: string = getActiveTimeZone(),
): boolean {
  if (nowMs < heldMs) return true;
  if (studioTodayKey(new Date(heldMs), tz) !== studioTodayKey(new Date(nowMs), tz)) return true;
  const lists = isNumberList(sorted) ? [sorted] : sorted;
  return crossed(heldMs, nowMs, lists);
}

function isNumberList(v: readonly number[] | Iterable<readonly number[]>): v is readonly number[] {
  return Array.isArray(v) && (v.length === 0 || typeof v[0] === "number");
}

/** Finite instants, ascending, without repeats. */
export function sortBoundaries(instants: Iterable<number | null | undefined>): number[] {
  const out = new Set<number>();
  for (const ms of instants) if (typeof ms === "number" && Number.isFinite(ms)) out.add(ms);
  return [...out].sort((a, b) => a - b);
}

export interface BoundaryClock {
  /** The time for the screen's models. */
  now: Date;
  /**
   * Adds (or replaces) one named list of boundaries, from wherever the screen
   * reads it (a hook below the clock can watch the bookings it reads). Safe to
   * call on every render: the same array is not sorted again.
   */
  watch: (source: string, instants: readonly number[]) => void;
}

/**
 * A screen's clock: it changes when the studio's day turns or the clock
 * crosses one of the watched boundaries (epoch ms, any order), and not at
 * every minute between. `boundaries` is watched as the source "own".
 * `fixedNow` (tests, a frozen screen) wins and never moves. The check also
 * runs when the iPad wakes the screen.
 */
export function useBoundaryClock(boundaries?: readonly number[] | null, fixedNow?: Date | null): BoundaryClock {
  const sources = useRef(new Map<string, { raw: readonly number[]; sorted: number[] }>());
  const [held, setHeld] = useState(() => Date.now());
  const heldRef = useRef(held);
  heldRef.current = held;
  const pending = useRef(false);

  const check = useCallback(() => {
    const nowMs = Date.now();
    const lists = [...sources.current.values()].map((s) => s.sorted);
    // Returning the same number is React's no-op: no render between boundaries.
    setHeld((h) => (clockMoved(h, nowMs, lists) ? nowMs : h));
  }, []);

  const watch = useCallback((source: string, instants: readonly number[]) => {
    const was = sources.current.get(source);
    if (was && was.raw === instants) return;
    const sorted = sortBoundaries(instants);
    sources.current.set(source, { raw: instants, sorted });
    // New data with a boundary already behind the held time: look now, not in a minute.
    if (crossed(heldRef.current, Date.now(), [sorted])) pending.current = true;
  }, []);

  if (boundaries) watch("own", boundaries);

  useEffect(() => {
    if (fixedNow || !pending.current) return;
    pending.current = false;
    check();
  });

  useEffect(() => {
    if (fixedNow) return;
    const t = setInterval(check, BOUNDARY_CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fixedNow, check]);

  const now = useMemo(() => fixedNow ?? new Date(held), [fixedNow, held]);
  return useMemo(() => ({ now, watch }), [now, watch]);
}

/**
 * The same rule over a time the screen is already given (a page that must
 * keep a minute clock for something else): the time handed out last, until
 * `now` has crossed a boundary or the day has turned. A model keyed on the
 * result is worked out at the boundaries only.
 */
export function useSettledNow(now: Date, boundaries: readonly number[]): Date {
  const sorted = useMemo(() => sortBoundaries(boundaries), [boundaries]);
  const held = useRef(now);
  const heldFor = useRef(sorted);
  if (held.current !== now && (heldFor.current !== sorted || clockMoved(held.current.getTime(), now.getTime(), sorted))) {
    held.current = now;
    heldFor.current = sorted;
  }
  return held.current;
}
