/**
 * THE MACHINE MENU — where everything on the Staircase sits. No DOM.
 *
 * Plain numbers for a plain SVG (no chart library, no d3: d3 would drag the
 * charts chunk into the session through vite's `d3-` rule, and recharts can't
 * be tested in jsdom). The component reads its width and asks here.
 *
 *   - Columns are a fixed 52px, evenly spaced: x is the session's ORDER,
 *     never calendar time (that is the overview strip's job). A folded gap
 *     takes a 36px slot; the start wall 52px.
 *   - Capacity = floor((plot − 36 × folds in view) / 52): 12 at a 760px dialog
 *     (712 of content, a 48px gutter), 13 at 820, 11 on an iPad mini, 10 in
 *     the landscape column and 5 on a phone.
 *   - Fewer sessions than capacity sit right-aligned, so the newest session is
 *     always in the same place.
 *   - The weight frame is the lightest to heaviest PERFORMED load in view,
 *     centred, never spanning less than max(8 lb, 15% of the heaviest): a
 *     2 lb step never looks like a cliff. The reps frame is the client's own
 *     fewest to most reps in view, never spanning less than 4 reps: 8s and
 *     9s never fill the track, and nothing reads as a fixed 6–10 band.
 *   - The weight line steps after each set, carries on dashed across a column
 *     that counted nothing, and breaks at a fold — never at a set-up change
 *     (the snapshot can lag a save by a set).
 *   - Markers closer than 44px merge into one with a count.
 *
 * PURE.
 */
import { dayNumber, type TimelineColumn, type TimelineModel } from "./timeline-model";

export const COL_W = 52;
export const FOLD_W = 36;
export const WALL_W = 52;
export const GUTTER_W = 48;
/** The dialog's inner inset on each side (the phone sheet's is 16). */
export const DIALOG_INSET = 24;
export const PHONE_INSET = 16;
/** Markers closer than this merge into one with a count. */
export const MERGE_PX = 44;

/** The plot's rows, top to bottom, in px (portrait; landscape takes the second set). */
export const ROWS = {
  portrait: { weight: 112, reps: 104, hold: 36, setup: 28, notes: 40, dates: 28 },
  landscape: { weight: 104, reps: 96, hold: 36, setup: 28, notes: 40, dates: 28 },
} as const;

/** Room kept above the top dot for its 20px label, and below the bottom dot. */
const WEIGHT_PAD_TOP = 30;
const WEIGHT_PAD_BOTTOM = 10;
/** Half a 30px rep chip, so a chip at either end stays inside its track. */
const REPS_PAD = 18;

/* ------------------------------------------------------------------ *
 * Width and capacity
 * ------------------------------------------------------------------ */

/** The dialog's content width (`min(820px, 100vw − 60px)` less its insets). */
export function contentWidthOf(dialogWidth: number, inset: number = DIALOG_INSET): number {
  return Math.max(0, dialogWidth - 2 * inset);
}

/** The plot's width: the content less the row-label gutter. */
export function plotWidthOf(contentWidth: number): number {
  return Math.max(0, contentWidth - GUTTER_W);
}

/** How many 52px columns fit, after the folds in view. */
export function capacityOf(plotWidth: number, foldsInView = 0): number {
  return Math.max(0, Math.floor((plotWidth - FOLD_W * Math.max(0, foldsInView)) / COL_W));
}

/* ------------------------------------------------------------------ *
 * The window: which columns are in view
 * ------------------------------------------------------------------ */

export interface ViewWindow {
  /** First and last column in view (inclusive); -1 for none. */
  start: number;
  end: number;
  /** The start wall is in view, to the left of column 0. */
  wall: boolean;
}

/** Per column: is there a folded gap before it? */
export function foldFlags(model: Pick<TimelineModel, "foldAt">): boolean[] {
  return model.foldAt.map((f) => f !== null);
}

/**
 * The window that ENDS at column `end`: as many older columns as fit, each
 * fold in it taking its slot. With `wall` allowed (everything read) and the
 * window reaching column 0, the wall takes its room too, giving up the oldest
 * column if it must; paging back to it then shows the wall.
 */
export function fitWindow(n: number, foldBefore: readonly boolean[], end: number, plotWidth: number, wall: boolean): ViewWindow {
  if (n <= 0) return { start: -1, end: -1, wall: false };
  const last = Math.max(0, Math.min(n - 1, end));
  if (plotWidth < COL_W) return { start: last, end: last, wall: false };
  let used = COL_W;
  let start = last;
  for (let i = last - 1; i >= 0; i--) {
    const add = COL_W + (foldBefore[i + 1] ? FOLD_W : 0);
    if (used + add > plotWidth) break;
    used += add;
    start = i;
  }
  if (wall && start === 0) {
    if (used + WALL_W <= plotWidth) return { start, end: last, wall: true };
    if (last > 0) return { start: 1, end: last, wall: false };
  }
  return { start, end: last, wall: false };
}

/** The newest page: what opens. */
export function newestWindow(n: number, foldBefore: readonly boolean[], plotWidth: number, wall: boolean): ViewWindow {
  return fitWindow(n, foldBefore, n - 1, plotWidth, wall);
}

/** ‹ Older: back a page, keeping one column (the old window's first) for context. */
export function olderWindow(view: ViewWindow, n: number, foldBefore: readonly boolean[], plotWidth: number, wall: boolean): ViewWindow {
  if (view.start <= 0) return fitWindow(n, foldBefore, view.end, plotWidth, wall);
  return fitWindow(n, foldBefore, view.start, plotWidth, wall);
}

/** Newer ›: forward a page, keeping the old window's last column for context. */
export function newerWindow(view: ViewWindow, n: number, foldBefore: readonly boolean[], plotWidth: number, wall: boolean): ViewWindow {
  if (n <= 0) return fitWindow(n, foldBefore, 0, plotWidth, wall);
  let used = COL_W;
  let end = Math.max(0, view.end);
  for (let i = end + 1; i < n; i++) {
    const add = COL_W + (foldBefore[i] ? FOLD_W : 0);
    if (used + add > plotWidth) break;
    used += add;
    end = i;
  }
  return fitWindow(n, foldBefore, end, plotWidth, wall);
}

/** A window holding column `index`: the current one if it does, else paging by itself (‹ › and arrow keys). */
export function windowShowing(index: number, view: ViewWindow, n: number, foldBefore: readonly boolean[], plotWidth: number, wall: boolean): ViewWindow {
  if (n <= 0 || index < 0 || index >= n) return view;
  let w = view;
  for (let guard = 0; guard <= n; guard++) {
    if (index >= w.start && index <= w.end) return w;
    const next = index < w.start ? olderWindow(w, n, foldBefore, plotWidth, wall) : newerWindow(w, n, foldBefore, plotWidth, wall);
    if (next.start === w.start && next.end === w.end) break;
    w = next;
  }
  return fitWindow(n, foldBefore, index, plotWidth, wall);
}

/** A window with column `index` near its middle (a tap on the overview strip). */
export function windowAround(index: number, n: number, foldBefore: readonly boolean[], plotWidth: number, wall: boolean): ViewWindow {
  const half = Math.floor(capacityOf(plotWidth) / 2);
  const w = fitWindow(n, foldBefore, Math.min(n - 1, index + half), plotWidth, wall);
  return index >= w.start ? w : fitWindow(n, foldBefore, index, plotWidth, wall);
}

/* ------------------------------------------------------------------ *
 * Slots: x positions, right-aligned
 * ------------------------------------------------------------------ */

export type Slot =
  | { kind: "wall"; x: number; w: number }
  | { kind: "fold"; index: number; x: number; w: number }
  | { kind: "col"; index: number; x: number; w: number };

export interface SlotLayout {
  slots: Slot[];
  /** Column index → its centre x. */
  colX: Map<number, number>;
  /** Left edge of the first slot. */
  left: number;
  /** The empty room between the gutter and the first slot (for the wall's words, or "Older sessions aren't loaded yet"). */
  leftRoom: number;
}

type SlotDraft = { kind: "wall"; w: number } | { kind: "fold"; index: number; w: number } | { kind: "col"; index: number; w: number };

export function layoutSlots(view: ViewWindow, foldBefore: readonly boolean[], plotWidth: number, gutter: number = GUTTER_W): SlotLayout {
  const items: SlotDraft[] = [];
  let width = 0;
  if (view.start >= 0) {
    if (view.wall) {
      items.push({ kind: "wall", w: WALL_W });
      width += WALL_W;
    }
    for (let i = view.start; i <= view.end; i++) {
      if (i > view.start && foldBefore[i]) {
        items.push({ kind: "fold", index: i, w: FOLD_W });
        width += FOLD_W;
      }
      items.push({ kind: "col", index: i, w: COL_W });
      width += COL_W;
    }
  }
  let x = gutter + Math.max(0, plotWidth - width);
  const left = x;
  const colX = new Map<number, number>();
  const slots = items.map((it) => {
    const slot: Slot = { ...it, x };
    if (slot.kind === "col") colX.set(slot.index, x + COL_W / 2);
    x += it.w;
    return slot;
  });
  return { slots, colX, left, leftRoom: left - gutter };
}

/** The folds in view (not counting one before the window's first column). */
export function foldsInView(view: ViewWindow, foldBefore: readonly boolean[]): number {
  let n = 0;
  for (let i = view.start + 1; i <= view.end; i++) if (foldBefore[i]) n++;
  return n;
}

/* ------------------------------------------------------------------ *
 * Frames and scales
 * ------------------------------------------------------------------ */

export interface Frame {
  min: number;
  max: number;
}

/** Lightest to heaviest, centred, never spanning less than max(8 lb, 15% of the heaviest). */
export function weightFrame(loads: readonly number[]): Frame | null {
  const v = loads.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = Math.max(hi - lo, Math.max(8, 0.15 * hi));
  const mid = (lo + hi) / 2;
  return { min: mid - span / 2, max: mid + span / 2 };
}

/** Fewest to most, centred, never spanning less than 4. */
export function repsFrame(counts: readonly number[], minSpan = 4): Frame | null {
  const v = counts.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = Math.max(hi - lo, minSpan);
  const mid = (lo + hi) / 2;
  return { min: mid - span / 2, max: mid + span / 2 };
}

/** A value's y inside [top, bottom] on a frame (higher value, higher up). */
export function scaleY(frame: Frame, top: number, bottom: number): (v: number) => number {
  const span = frame.max - frame.min || 1;
  return (v: number) => top + ((frame.max - v) / span) * (bottom - top);
}

/** The weight panel's scale, keeping room for the labels above the dots. */
export function weightScale(frame: Frame, panelTop: number, panelHeight: number): (v: number) => number {
  return scaleY(frame, panelTop + WEIGHT_PAD_TOP, panelTop + panelHeight - WEIGHT_PAD_BOTTOM);
}

/** The reps (or hold) track's scale, keeping a chip inside it. */
export function repsScale(frame: Frame, trackTop: number, trackHeight: number): (v: number) => number {
  return scaleY(frame, trackTop + REPS_PAD, trackTop + trackHeight - REPS_PAD);
}

/**
 * A practice set's load against the frame: placed when it fits, else pinned
 * to the edge ("70↓" at the bottom). It never stretches the frame — only a
 * performed set moves the picture.
 */
export function pinnedY(value: number, frame: Frame, y: (v: number) => number): { y: number; pinned: "below" | "above" | null } {
  if (value < frame.min) return { y: y(frame.min), pinned: "below" };
  if (value > frame.max) return { y: y(frame.max), pinned: "above" };
  return { y: y(value), pinned: null };
}

/** The performed loads in view (both sides of a two-sided set). */
export function loadsInView(columns: readonly TimelineColumn[], view: ViewWindow): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, view.start); i <= view.end && i < columns.length; i++) {
    const c = columns[i];
    if (c.outcome !== "performed") continue;
    if (c.sides) {
      for (const s of [c.sides.L, c.sides.R]) if (s && s.outcome === "performed" && s.weight !== null) out.push(s.weight);
    } else if (c.weight !== null) out.push(c.weight);
  }
  return out;
}

/** The performed rep counts in view (both sides counted as their own); holds are never reps. */
export function repsInView(columns: readonly TimelineColumn[], view: ViewWindow): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, view.start); i <= view.end && i < columns.length; i++) {
    const c = columns[i];
    if (c.outcome !== "performed" || c.isHold) continue;
    if (c.sides) {
      for (const s of [c.sides.L, c.sides.R]) if (s && s.outcome === "performed" && s.reps !== null) out.push(s.reps);
    } else if (c.reps !== null) out.push(c.reps);
  }
  return out;
}

/** Hold seconds in view. */
export function secondsInView(columns: readonly TimelineColumn[], view: ViewWindow): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, view.start); i <= view.end && i < columns.length; i++) {
    const c = columns[i];
    if (c.outcome === "performed" && c.isHold && c.seconds !== null) out.push(c.seconds);
  }
  return out;
}

/**
 * Which rows the plot draws. The hold row appears whenever the LOADED history
 * mixes holds with rep sets, so paging never shifts the layout; when every
 * column in view is a hold, the reps track itself carries the seconds.
 */
export function plotRows(
  model: Pick<TimelineModel, "hasHolds" | "hasRepSets" | "setupLane">,
  opts: { landscape?: boolean } = {},
): { key: "weight" | "reps" | "hold" | "setup" | "notes" | "dates"; top: number; height: number }[] {
  const h = opts.landscape ? ROWS.landscape : ROWS.portrait;
  const keys: ("weight" | "reps" | "hold" | "setup" | "notes" | "dates")[] = ["weight", "reps"];
  if (model.hasHolds && model.hasRepSets) keys.push("hold");
  if (model.setupLane) keys.push("setup");
  keys.push("notes", "dates");
  let top = 0;
  return keys.map((key) => {
    const row = { key, top, height: h[key] };
    top += h[key];
    return row;
  });
}

/** Every column in view is a timed hold: the reps track is titled "hold" and framed by seconds. */
export function allHoldsInView(columns: readonly TimelineColumn[], view: ViewWindow): boolean {
  let any = false;
  for (let i = Math.max(0, view.start); i <= view.end && i < columns.length; i++) {
    const c = columns[i];
    if (c.outcome !== "performed") continue;
    if (!c.isHold) return false;
    any = true;
  }
  return any;
}

/* ------------------------------------------------------------------ *
 * The weight line
 * ------------------------------------------------------------------ */

export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** A carry across a column that counted nothing: dashed. */
  dashed: boolean;
}

/**
 * The step-after line over the window. From each performed set the load runs
 * flat to the next performed column, then steps; across a practice, skipped
 * or not-reached column the flat part is dashed (the load carried, nothing
 * counted), and after the last performed column it carries dashed to a
 * newer uncounted one. A fold breaks it. A set-up change does not.
 */
export function stepSegments(
  columns: readonly TimelineColumn[],
  view: ViewWindow,
  foldBefore: readonly boolean[],
  colX: ReadonlyMap<number, number>,
  y: (v: number) => number,
): LineSegment[] {
  const out: LineSegment[] = [];
  let prev: { x: number; y: number } | null = null;
  let carriedTo: number | null = null;
  const flushCarry = () => {
    if (prev && carriedTo !== null) out.push({ x1: prev.x, y1: prev.y, x2: carriedTo, y2: prev.y, dashed: true });
  };
  for (let i = Math.max(0, view.start); i <= view.end && i < columns.length; i++) {
    if (i > view.start && foldBefore[i]) {
      flushCarry();
      prev = null;
      carriedTo = null;
    }
    const c = columns[i];
    const x = colX.get(i);
    if (x === undefined) continue;
    if (c.outcome === "performed" && c.weight !== null) {
      const yi = y(c.weight);
      if (prev) {
        out.push({ x1: prev.x, y1: prev.y, x2: x, y2: prev.y, dashed: carriedTo !== null });
        if (yi !== prev.y) out.push({ x1: x, y1: prev.y, x2: x, y2: yi, dashed: false });
      }
      prev = { x, y: yi };
      carriedTo = null;
    } else if (prev) {
      carriedTo = x;
    }
  }
  flushCarry();
  return out;
}

/**
 * Where the load is printed: the first performed column in view, every one
 * whose load differs from the performed column before it, and the first
 * after a fold (the line starts again there).
 */
export function weightLabelIndexes(columns: readonly TimelineColumn[], view: ViewWindow, foldBefore: readonly boolean[]): number[] {
  const out: number[] = [];
  let prevWeight: number | null = null;
  let broken = false;
  let first = true;
  for (let i = 0; i <= view.end && i < columns.length; i++) {
    if (i > 0 && foldBefore[i]) broken = true;
    const c = columns[i];
    if (c.outcome !== "performed" || c.weight === null) continue;
    if (i >= view.start && (first || broken || c.weight !== prevWeight)) out.push(i);
    if (i >= view.start) first = false;
    prevWeight = c.weight;
    broken = false;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Rep chips and the climb-and-reset hairline
 * ------------------------------------------------------------------ */

export interface ChipSpot {
  index: number;
  kind: "reps" | "hold" | "side" | "practice";
  /** What the chip says: "9", "1:30" is left to words; here the number. */
  value: number;
  side: "L" | "R" | null;
  x: number;
  y: number;
  pinned: "below" | "above" | null;
}

/**
 * The chips in view on the reps track (and the hold row, `holdY`). A plain
 * set is one chip at its count; a one-side-at-a-time set two half-chips at
 * their own heights; a practice chip at its count, pinned at an edge when it
 * falls outside the frame (it never stretches it).
 */
export function chipSpots(
  columns: readonly TimelineColumn[],
  view: ViewWindow,
  colX: ReadonlyMap<number, number>,
  repsY: ((v: number) => number) | null,
  repsFrameUsed: Frame | null,
  holdY: ((v: number) => number) | null,
): ChipSpot[] {
  const out: ChipSpot[] = [];
  for (let i = Math.max(0, view.start); i <= view.end && i < columns.length; i++) {
    const c = columns[i];
    const x = colX.get(i);
    if (x === undefined) continue;
    if (c.outcome === "performed") {
      if (c.isHold) {
        if (holdY && c.seconds !== null) out.push({ index: i, kind: "hold", value: c.seconds, side: null, x, y: holdY(c.seconds), pinned: null });
        continue;
      }
      if (!repsY) continue;
      if (c.sides) {
        for (const s of [c.sides.L, c.sides.R]) {
          if (s && s.outcome === "performed" && s.reps !== null) out.push({ index: i, kind: "side", value: s.reps, side: s.side, x, y: repsY(s.reps), pinned: null });
        }
        continue;
      }
      if (c.reps !== null) out.push({ index: i, kind: "reps", value: c.reps, side: null, x, y: repsY(c.reps), pinned: null });
      continue;
    }
    if (c.outcome === "practice" && repsY && repsFrameUsed) {
      const reps = c.reps ?? c.sides?.L?.reps ?? null;
      if (reps !== null) {
        const p = pinnedY(reps, repsFrameUsed, repsY);
        out.push({ index: i, kind: "practice", value: reps, side: null, x, y: p.y, pinned: p.pinned });
      }
    }
  }
  return out;
}

/**
 * The 1.5px line joining consecutive performed chips within one load and one
 * set-up stretch — the climb, then the reset after a step. Never across a
 * load change, a set-up boundary, a fold or a column that counted nothing,
 * and never for holds or one-side-at-a-time sets.
 */
export function hairlinePairs(
  model: Pick<TimelineModel, "columns" | "foldAt" | "boundaryAt">,
  view: ViewWindow,
): [number, number][] {
  const out: [number, number][] = [];
  const plain = (c: TimelineColumn) => c.outcome === "performed" && !c.isHold && !c.sides && c.reps !== null && c.weight !== null;
  for (let i = Math.max(0, view.start) + 1; i <= view.end && i < model.columns.length; i++) {
    const a = model.columns[i - 1];
    const b = model.columns[i];
    if (!plain(a) || !plain(b)) continue;
    if (a.weight !== b.weight || model.foldAt[i] || model.boundaryAt[i]) continue;
    out.push([i - 1, i]);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Lanes and hits
 * ------------------------------------------------------------------ */

export interface Marker<T> {
  x: number;
  /** Higher is louder; the loudest item's glyph is drawn. */
  rank: number;
  item: T;
}

export interface MergedMarker<T> {
  x: number;
  count: number;
  /** The loudest first. */
  items: T[];
}

/**
 * Merge markers closer than `minGap` into one, drawn at the loudest one's x
 * with a count. Two items in one column always merge.
 */
export function mergeMarkers<T>(markers: readonly Marker<T>[], minGap: number = MERGE_PX): MergedMarker<T>[] {
  const sorted = [...markers].sort((a, b) => a.x - b.x);
  const groups: Marker<T>[][] = [];
  for (const m of sorted) {
    const g = groups[groups.length - 1];
    if (g && m.x - g[0].x < minGap) g.push(m);
    else groups.push([m]);
  }
  return groups.map((g) => {
    const loud = [...g].sort((a, b) => b.rank - a.rank);
    return { x: loud[0].x, count: g.length, items: loud.map((m) => m.item) };
  });
}

/** Where a lane note sits on the x axis, or null when it isn't in view. */
export function noteX(
  place: TimelineModel["notes"][number]["place"],
  view: ViewWindow,
  colX: ReadonlyMap<number, number>,
  lastIndex: number,
): number | null {
  if (place.kind === "column") return colX.get(place.index) ?? null;
  if (place.kind === "between") {
    const a = colX.get(place.after);
    const b = colX.get(place.after + 1);
    if (a !== undefined && b !== undefined) return (a + b) / 2;
    return a !== undefined ? a + COL_W / 2 : b !== undefined ? b - COL_W / 2 : null;
  }
  if (place.kind === "edge") {
    const a = colX.get(lastIndex);
    return a !== undefined && view.end === lastIndex ? a + COL_W / 2 - 8 : null;
  }
  return null;
}

/** A whole-column tap target: the full height, 52px wide. */
export interface HitBand {
  index: number;
  x: number;
  width: number;
}

export function hitBands(view: ViewWindow, colX: ReadonlyMap<number, number>): HitBand[] {
  const out: HitBand[] = [];
  for (let i = Math.max(0, view.start); i <= view.end; i++) {
    const x = colX.get(i);
    if (x !== undefined) out.push({ index: i, x: x - COL_W / 2, width: COL_W });
  }
  return out;
}

/** The column under an x (a scrub), or null over a fold, the wall or the gutter. */
export function columnAt(x: number, bands: readonly HitBand[]): number | null {
  for (const b of bands) if (x >= b.x && x < b.x + b.width) return b.index;
  return null;
}

/* ------------------------------------------------------------------ *
 * The overview strip (only when the loaded columns exceed capacity)
 * ------------------------------------------------------------------ */

export interface Overview {
  /** One tick per column: full height when counted, half when not. */
  ticks: { index: number; x: number; counted: boolean }[];
  /** The performed loads as a step line, broken where a fold would be. */
  lines: { x: number; y: number }[][];
  /** The window's box. */
  box: { x: number; width: number };
}

/** Is the strip drawn (and ‹ Older / Newer › with it)? Only when the loaded columns don't all fit in one window. */
export function needsOverview(n: number, foldBefore: readonly boolean[], plotWidth: number, wall: boolean): boolean {
  if (n <= 0) return false;
  return newestWindow(n, foldBefore, plotWidth, wall).start > 0;
}

/**
 * Calendar time from the oldest loaded column to today across `width`; the
 * line lives in the strip's top 28px, the ticks below. The box is at least
 * 44px, so it can be dragged.
 */
export function overviewLayout(
  model: Pick<TimelineModel, "columns" | "foldAt">,
  view: ViewWindow,
  today: string,
  width: number,
  lineHeight = 28,
): Overview | null {
  const cols = model.columns;
  if (cols.length === 0 || width <= 0) return null;
  const d0 = dayNumber(cols[0].day);
  const d1 = Math.max(dayNumber(today), dayNumber(cols[cols.length - 1].day));
  const span = Math.max(1, d1 - d0);
  const xOf = (day: string) => ((dayNumber(day) - d0) / span) * width;
  const ticks = cols.map((c) => ({ index: c.index, x: xOf(c.day), counted: c.counted }));
  const frame = weightFrame(cols.filter((c) => c.outcome === "performed" && c.weight !== null).map((c) => c.weight as number));
  const lines: { x: number; y: number }[][] = [];
  if (frame) {
    const y = scaleY(frame, 2, lineHeight - 2);
    let cur: { x: number; y: number }[] = [];
    cols.forEach((c, i) => {
      if (i > 0 && model.foldAt[i] && cur.length) {
        lines.push(cur);
        cur = [];
      }
      if (c.outcome === "performed" && c.weight !== null) cur.push({ x: xOf(c.day), y: y(c.weight) });
    });
    if (cur.length) lines.push(cur);
  }
  const a = view.start >= 0 ? xOf(cols[view.start].day) : 0;
  const b = view.end >= 0 ? xOf(cols[view.end].day) : 0;
  let x = Math.min(a, b);
  let w = Math.abs(b - a);
  if (w < MERGE_PX) {
    x = Math.max(0, Math.min(width - MERGE_PX, (a + b) / 2 - MERGE_PX / 2));
    w = Math.min(MERGE_PX, width);
  }
  return { ticks, lines, box: { x, width: w } };
}

/** The column nearest a tap on the strip. */
export function nearestColumnAt(x: number, overview: Overview): number | null {
  let best: { index: number; d: number } | null = null;
  for (const t of overview.ticks) {
    const d = Math.abs(t.x - x);
    if (!best || d < best.d) best = { index: t.index, d };
  }
  return best ? best.index : null;
}
