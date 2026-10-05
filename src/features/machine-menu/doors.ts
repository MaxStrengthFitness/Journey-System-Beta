/**
 * THE MACHINE MENU — the two doors, and the one place they differ.
 *
 * The card opens from two doors: a machine's name in an active session, and
 * on the client profile. AJ (Oct 4 2026): the settings are "the primary use
 * for a trainer" in BOTH doors, and the Notes block is the ONLY layout
 * difference — right under the settings in a session, where a trainer
 * writes mid-set, and after the chart on the profile, where notes are "less
 * likely" and the chart is what someone came to read.
 *
 * Safety is first in both doors and never moves. Everything above Notes is
 * the same block at the same height in both, so a trainer's hand learns one
 * card. `doors.test.ts` fails if the doors ever differ in anything but where
 * Notes sits.
 *
 * The rest of what differs between the doors happens behind the scenes and
 * changes nothing on screen (what a note carries, where its draft lives,
 * what Load older reads, where a floor note is filed, the watched session);
 * those live with the code that does each one.
 *
 * Layout (machine menu design §B):
 *   - Portrait (and a phone): one column in one scroller.
 *   - Landscape, from 1000px wide: the safety strip full width on top, then
 *     two columns in one scroller — a 400px leading column (the settings,
 *     the notes, the guide, the setting changes) and the chart in the
 *     trailing column, in both doors.
 *
 * PURE — no React, no DOM.
 */

export type Door = "session" | "profile";

export type MenuLayout = "phone" | "portrait" | "landscape";

export type BlockId =
  /** Critical notes, watch-outs, never-to-failure reasons, the Relay flag, the studio's floor notes. */
  | "safety"
  /** The set-up guide's set-up part, above the tiles: only the first time (`firstTime`). */
  | "setupFirst"
  | "settings"
  | "notes"
  /** How the client has done here: the Staircase. */
  | "chart"
  /** The set-up guide, folded (its execution cues, when the set-up part sits above the tiles). */
  | "guide"
  /** Setting changes, folded. */
  | "changes";

export interface BlockState {
  /** The safety strip has a line to show (a failed read counts: it says so). Absent when empty. */
  safety: boolean;
  /** Nothing recorded in what was read and no settings saved: the guide's set-up part opens above the tiles. */
  firstTime: boolean;
}

export interface BlockOrder {
  layout: MenuLayout;
  /** Full width, above the columns. */
  top: BlockId[];
  /** One column (portrait, phone), or the 400px leading column (landscape). */
  leading: BlockId[];
  /** The chart's column in landscape; empty otherwise. */
  trailing: BlockId[];
}

/** From this width a landscape screen gets two columns (an iPad mini landscape is 1133). */
export const LANDSCAPE_MIN_WIDTH = 1000;

/** The dialog: `min(820px, 100vw − 60px)` in portrait, `min(1080px, 100vw − 64px)` in landscape. */
export const PORTRAIT_MAX_W = 820;
export const PORTRAIT_MARGIN = 60;
export const LANDSCAPE_MAX_W = 1080;
export const LANDSCAPE_MARGIN = 64;

/** Landscape's two columns: a 400px leading column, a 24px gap, the chart in the rest. */
export const LEADING_COL_W = 400;
export const COLUMN_GAP = 24;

/** The card's inner inset: 24px, 16px on a phone. */
export const MENU_INSET = 24;
export const MENU_PHONE_INSET = 16;

/**
 * Which layout the card takes. A phone (`usePhone()`, under 600px wide or a
 * short touch screen) is always one column, turned or not; otherwise a
 * screen wider than it is tall, from 1000px, gets two.
 */
export function menuLayoutFor(width: number, height: number, isPhone: boolean): MenuLayout {
  if (isPhone) return "phone";
  return width > height && width >= LANDSCAPE_MIN_WIDTH ? "landscape" : "portrait";
}

/** The dialog's width for a viewport: 760 on an 820-wide iPad, 1080 in landscape, the full width on a phone. */
export function dialogWidthFor(viewportWidth: number, layout: MenuLayout): number {
  const vw = Math.max(0, viewportWidth);
  if (layout === "phone") return vw;
  if (layout === "landscape") return Math.min(LANDSCAPE_MAX_W, vw - LANDSCAPE_MARGIN);
  return Math.min(PORTRAIT_MAX_W, vw - PORTRAIT_MARGIN);
}

/** The widths the blocks lay out in: one content width, or landscape's two columns. */
export function columnWidthsFor(dialogWidth: number, layout: MenuLayout): { content: number; leading: number; trailing: number } {
  const inset = layout === "phone" ? MENU_PHONE_INSET : MENU_INSET;
  const content = Math.max(0, dialogWidth - 2 * inset);
  if (layout !== "landscape") return { content, leading: content, trailing: 0 };
  return { content, leading: LEADING_COL_W, trailing: Math.max(0, content - LEADING_COL_W - COLUMN_GAP) };
}

/**
 * The blocks, in order, for a door. The ONLY thing `door` changes is where
 * "notes" sits: right after "settings" in a session; after the chart on the
 * profile (in landscape, at the foot of the leading column, after the
 * folded guide and setting changes, since the chart has a column of its own).
 *
 * The settings and the notes are in `leading` in EVERY layout, and outside
 * landscape `trailing` is empty: the body draws the same two columns in
 * every layout (stacked outside landscape), so a turn of the iPad moves only
 * the chart and never remounts a block holding an unsaved draft.
 */
export function blockOrder(door: Door, layout: MenuLayout, state: BlockState): BlockOrder {
  const top: BlockId[] = state.safety ? ["safety"] : [];
  const first: BlockId[] = state.firstTime ? ["setupFirst", "settings"] : ["settings"];
  const folds: BlockId[] = ["guide", "changes"];

  if (layout === "landscape") {
    const leading: BlockId[] = door === "session" ? [...first, "notes", ...folds] : [...first, ...folds, "notes"];
    return { layout, top, leading, trailing: ["chart"] };
  }
  const leading: BlockId[] = door === "session" ? [...first, "notes", "chart", ...folds] : [...first, "chart", "notes", ...folds];
  return { layout, top, leading, trailing: [] };
}

/** The reading order, top to bottom (a screen reader's, and a phone's). */
export function readingOrder(order: BlockOrder): BlockId[] {
  return [...order.top, ...order.leading, ...order.trailing];
}
