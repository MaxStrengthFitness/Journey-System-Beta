/**
 * The Hub's day as a list, on a phone: the pure half (Journey Lite, Oct 1
 * 2026).
 *
 * The Hub's grid is a column per trainer at 2.2px a minute; a phone has room
 * for one column, so the day is drawn as one list of bookings in time order.
 * It is the SAME day the grid draws: the blocks are the Hub's own (one per
 * booking, already in its trainer's column by `planColumns`), and each row
 * draws the Hub's own card. This file only decides which blocks a list
 * shows, in what order, and where "now" falls.
 *
 *   - Me shows your own column's bookings; Everyone shows every column's.
 *     With no column of your own on the day, Me has nothing to narrow to and
 *     the list is everyone's (focus.ts: Focus is offered only with a column).
 *   - A Mindbody "Unavailable" block is never a booking (`isStaffBlock`), so
 *     it is never a row.
 *   - Earliest first; at the same minute, in the grid's column order, so two
 *     8:00s read in the order the iPad shows them left to right.
 */
import type { Span } from "../hub-schedule/grid-model";

export interface DayBlock {
  key: string;
  columnId: string;
  span: Span;
  /** A staff block ("Unavailable"), never a row. */
  staff: boolean;
}

export interface DayListPlan<B extends DayBlock> {
  rows: B[];
  /**
   * The index the Now line goes BEFORE (rows.length when every row has
   * started), or null on a day that is not today.
   */
  nowBefore: number | null;
}

export function planDayList<B extends DayBlock>({
  blocks,
  columnOrder,
  mineOnly,
  nowMin,
}: {
  blocks: B[];
  /** Column ids in the grid's left-to-right order. */
  columnOrder: string[];
  /** Your column's id when the list is narrowed to you, else null. */
  mineOnly: string | null;
  /** Minutes into the studio day when the day on screen is today, else null. */
  nowMin: number | null;
}): DayListPlan<B> {
  const order = new Map(columnOrder.map((id, i) => [id, i] as const));
  const rank = (id: string) => order.get(id) ?? columnOrder.length;
  const rows = blocks
    .filter((b) => !b.staff && (mineOnly === null || b.columnId === mineOnly))
    .slice()
    .sort((a, b) => a.span.from - b.span.from || rank(a.columnId) - rank(b.columnId) || a.key.localeCompare(b.key));
  let nowBefore: number | null = null;
  if (nowMin !== null) {
    const i = rows.findIndex((b) => b.span.from > nowMin);
    nowBefore = i === -1 ? rows.length : i;
  }
  return { rows, nowBefore };
}
