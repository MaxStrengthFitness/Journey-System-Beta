/**
 * THE HUB GRID'S GEOMETRY (calm Hub round, Sep 28 2026). Pure: grid-model.test.ts.
 *
 * Mindbody's staff schedule is the foundation (AJ's screenshots, Sep 28: "I
 * don't want it to look like this but the layout is the foundation"): time
 * down the left, trainers across the top, blocks at their REAL length. The
 * studio books 30-minute sessions on the hour and half hour and 45-minute
 * new client consults, so a block is drawn from its own start to its own end
 * at 2.2px a minute — a session card is 64px with its gap, a consult 97px —
 * rather than rounded to 30-minute rows (the old grid drew a consult as an
 * hour).
 *
 * Folding (research-hub §6.0): a stretch of an hour or more with nothing
 * booked in ANY column becomes one band ("No sessions 1:00 – 3:00 PM", a tap
 * opens it), so a quiet middle of the day doesn't push the afternoon off the
 * screen. The day runs from the first booking's hour to the last booking's
 * end; nothing is folded where anyone is booked, so no booking is ever hidden.
 *
 * Overlaps in one column (a consult beside a session) share it side by side
 * in lanes, never on top of each other.
 */

/** Pixels per minute: a 30-minute session is 66px, 64px with its gap. */
export const PX_PER_MIN = 2.2;
/** A stretch this long with nothing booked anywhere folds into a band. */
export const FOLD_MIN = 60;
/** A folded band's height: a tap target, never under 40px. */
export const BAND_PX = 40;
/** The grid's rhythm: bookings sit on the hour and half hour. */
export const SLOT_MIN = 30;
/** The day drawn when nothing is booked: the studio's usual hours. */
export const EMPTY_DAY = { from: 6 * 60, to: 19 * 60 } as const;

/** One block on the day, in minutes since the studio's midnight. */
export interface Span {
  from: number;
  to: number;
}

export interface Segment extends Span {
  /** Top of the segment, px from the top of the grid body. */
  y: number;
  /** Its height in px. */
  h: number;
  /** Folded into a band (nothing booked anywhere, an hour or more). */
  folded: boolean;
}

export interface Tick {
  min: number;
  y: number;
  hour: boolean;
  /** On a folded band's edge: the line is drawn, the band's own words say the time. */
  edge: boolean;
}

export interface DayLayout extends Span {
  segments: Segment[];
  /** Total height of the grid body in px. */
  height: number;
  /** The half-hour lines of the open segments. */
  ticks: Tick[];
  /** True when nothing is booked: the grid shows the studio's usual hours, empty. */
  empty: boolean;
}

const floorTo = (m: number, step: number) => Math.floor(m / step) * step;
const ceilTo = (m: number, step: number) => Math.ceil(m / step) * step;

/** Merged busy stretches: every block, any column, overlapping or touching ones joined. */
export function busyStretches(blocks: ReadonlyArray<Span>): Span[] {
  const sorted = blocks
    .filter((b) => Number.isFinite(b.from) && Number.isFinite(b.to) && b.to > b.from)
    .map((b) => ({ from: b.from, to: b.to }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const out: Span[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.from <= last.to) last.to = Math.max(last.to, b.to);
    else out.push({ ...b });
  }
  return out;
}

/**
 * The stretches the grid folds: gaps between busy stretches, trimmed to the
 * half-hour grid, of FOLD_MIN or more. Each is keyed by its start minute, so
 * a band the trainer opened stays open while the day is on screen.
 */
export function foldableGaps(blocks: ReadonlyArray<Span>, minGap: number = FOLD_MIN): Span[] {
  const busy = busyStretches(blocks);
  const gaps: Span[] = [];
  for (let i = 1; i < busy.length; i++) {
    const from = ceilTo(busy[i - 1].to, SLOT_MIN);
    const to = floorTo(busy[i].from, SLOT_MIN);
    if (to - from >= minGap) gaps.push({ from, to });
  }
  return gaps;
}

/** The day's extent: the first booking's hour to the last booking's end, on the half hour. */
export function dayExtent(blocks: ReadonlyArray<Span>): Span & { empty: boolean } {
  const busy = busyStretches(blocks);
  if (busy.length === 0) return { ...EMPTY_DAY, empty: true };
  return { from: floorTo(busy[0].from, 60), to: ceilTo(busy[busy.length - 1].to, SLOT_MIN), empty: false };
}

/**
 * Lay the day out: open segments at PX_PER_MIN, folded gaps as BAND_PX bands
 * (unless the trainer opened them: `opened` holds their start minutes).
 */
export function layoutDay(blocks: ReadonlyArray<Span>, opened: ReadonlySet<number> = new Set()): DayLayout {
  const extent = dayExtent(blocks);
  const gaps = extent.empty ? [] : foldableGaps(blocks).filter((g) => !opened.has(g.from));
  const segments: Segment[] = [];
  let cursor = extent.from;
  let y = 0;
  const push = (from: number, to: number, folded: boolean) => {
    if (to <= from) return;
    const h = folded ? BAND_PX : (to - from) * PX_PER_MIN;
    segments.push({ from, to, y, h, folded });
    y += h;
  };
  for (const g of gaps) {
    push(cursor, g.from, false);
    push(g.from, g.to, true);
    cursor = g.to;
  }
  push(cursor, extent.to, false);

  const ticks: Tick[] = [];
  const bandEdges = new Set(segments.filter((s) => s.folded).flatMap((s) => [s.from, s.to]));
  for (const s of segments) {
    if (s.folded) continue;
    for (let m = ceilTo(s.from, SLOT_MIN); m <= s.to; m += SLOT_MIN) {
      if (ticks.length && ticks[ticks.length - 1].min === m) continue;
      ticks.push({ min: m, y: s.y + (m - s.from) * PX_PER_MIN, hour: m % 60 === 0, edge: bandEdges.has(m) });
    }
  }
  return { from: extent.from, to: extent.to, segments, height: y, ticks, empty: extent.empty };
}

/**
 * Where a minute sits, in px from the top of the grid body. Inside a folded
 * band it is the band's middle (the Now line crosses the band); outside the
 * day, null.
 */
export function yOf(layout: DayLayout, minute: number): number | null {
  if (!Number.isFinite(minute) || minute < layout.from || minute > layout.to) return null;
  // An open segment owns its edges: a booking starting where a band ends
  // starts BELOW the band, never inside it.
  for (const s of layout.segments) {
    if (!s.folded && minute >= s.from && minute <= s.to) return s.y + (minute - s.from) * PX_PER_MIN;
  }
  for (const s of layout.segments) {
    if (s.folded && minute > s.from && minute < s.to) return s.y + s.h / 2;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* One column: blocks side by side where they overlap                  */
/* ------------------------------------------------------------------ */

export interface Placed<T> {
  item: T;
  /** px from the top of the grid body. */
  top: number;
  height: number;
  /** Which of `lanes` it takes, left to right. */
  lane: number;
  lanes: number;
}

/** A gap between stacked blocks, so each reads as its own card. */
export const CARD_GAP_PX = 2;

/**
 * Place a column's blocks: top and height from their own times, and lanes
 * where they overlap (the classic calendar rule: a cluster of overlapping
 * blocks shares the column, each in the first lane free at its start).
 */
export function placeColumn<T>(items: ReadonlyArray<{ item: T; span: Span }>, layout: DayLayout): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.span.from - b.span.from || b.span.to - a.span.to);
  const out: Placed<T>[] = [];
  let cluster: Array<{ placed: Placed<T>; to: number }> = [];
  let clusterEnd = -Infinity;
  let laneEnds: number[] = [];
  const close = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const c of cluster) c.placed.lanes = lanes;
    cluster = [];
    laneEnds = [];
  };
  for (const { item, span } of sorted) {
    if (span.from >= clusterEnd) {
      close();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= span.from);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(span.to);
    } else laneEnds[lane] = span.to;
    clusterEnd = Math.max(clusterEnd, span.to);
    const top = yOf(layout, span.from) ?? 0;
    const bottom = yOf(layout, span.to) ?? top + (span.to - span.from) * PX_PER_MIN;
    const placed: Placed<T> = { item, top: top + CARD_GAP_PX / 2, height: Math.max(0, bottom - top - CARD_GAP_PX), lane, lanes: 1 };
    cluster.push({ placed, to: span.to });
    out.push(placed);
  }
  close();
  return out;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** "9 AM", "12 PM", "1:30 PM" for the time axis and the bands. */
export function clockWords(minute: number, { short = false }: { short?: boolean } = {}): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 >= 12 ? "PM" : "AM";
  if (short) return mm ? `${h12}:${String(mm).padStart(2, "0")}` : `${h12}`;
  return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${suffix}`;
}

/**
 * A stretch of the day in words: "1:00 – 3:00 PM", "11:30 AM – 12:00 PM".
 * The start keeps its AM/PM only when the stretch crosses noon.
 */
export function rangeWords(span: Span): string {
  const from = clockWords(span.from);
  const to = clockWords(span.to);
  const sameHalf = from.slice(-2) === to.slice(-2);
  const fromClock = sameHalf ? from.replace(/ [AP]M$/, "") : from;
  const pad = (s: string) => (/:/.test(s.replace(/ [AP]M$/, "")) ? s : s.replace(/^(\d+)/, "$1:00"));
  return `${pad(fromClock)} – ${pad(to)}`;
}

/** "No sessions 1:00 – 3:00 PM" (the band's words). */
export function bandWords(gap: Span): string {
  return `No sessions ${rangeWords(gap)}`;
}
