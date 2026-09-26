/**
 * PACKAGES — what the trainer has tapped on the packages screen, and nothing
 * else. Held on screen for as long as the sheet is open; nothing here is ever
 * written anywhere (the recommendation waits for the consultation record,
 * which needs AJ's Firestore OK).
 *
 * A reducer so every tap is one pure step: StrictMode runs reducers twice,
 * and a stepper that read its own state back from a ref or a setState
 * updater would move two weeks a tap (docs/KNOWN-TRAPS.md).
 */

import { clampWeeksAway, defaultRecommendationKey, type Lineup, type PayMode, type ShowAs } from "./package-table";

export interface PackagesView {
  /** The length being looked at. */
  selectedKey: string | null;
  /** The trainer's recommendation; starts on 12 months (AJ, Sep 24). */
  recommendedKey: string | null;
  showAs: ShowAs;
  pay: PayMode;
  weeksAway: number;
  /** Days the trainer picked, oldest first, at most two. 0 = Sunday. */
  pickedDays: number[];
  /** Once-a-week rows the trainer chose to put on the client's screen. */
  showOnce: boolean;
  /** Rows at another frequency, likewise. */
  showOther: boolean;
  /** Which view the sheet shows: the client's, or the trainer notes. */
  notes: boolean;
}

export type PackagesAction =
  | { type: "select"; key: string }
  | { type: "recommend"; key: string | null }
  | { type: "showAs"; value: ShowAs }
  | { type: "pay"; value: PayMode }
  | { type: "away"; delta: 1 | -1 }
  | { type: "day"; day: number }
  | { type: "showOnce"; value: boolean }
  | { type: "showOther"; value: boolean }
  | { type: "notes"; value: boolean };

/** Where the sheet opens: on the recommended length, priced a session, every 4 weeks. */
export function initialView(l: Lineup): PackagesView {
  const rec = defaultRecommendationKey(l.headline);
  return {
    selectedKey: rec ?? l.headline[0]?.key ?? null,
    recommendedKey: rec,
    showAs: "session",
    pay: "monthly",
    weeksAway: 0,
    pickedDays: [],
    showOnce: false,
    showOther: false,
    notes: false,
  };
}

export const MAX_PICKED_DAYS = 2;

export function packagesViewReducer(state: PackagesView, action: PackagesAction): PackagesView {
  switch (action.type) {
    case "select":
      return state.selectedKey === action.key ? state : { ...state, selectedKey: action.key };
    case "recommend":
      return { ...state, recommendedKey: action.key };
    case "showAs":
      return { ...state, showAs: action.value };
    case "pay":
      return { ...state, pay: action.value };
    case "away":
      return { ...state, weeksAway: clampWeeksAway(state.weeksAway + action.delta) };
    case "day": {
      if (!Number.isInteger(action.day) || action.day < 0 || action.day > 6) return state;
      if (state.pickedDays.includes(action.day)) {
        return { ...state, pickedDays: state.pickedDays.filter((d) => d !== action.day) };
      }
      const next = [...state.pickedDays, action.day];
      // A third tap replaces the oldest pick.
      return { ...state, pickedDays: next.slice(-MAX_PICKED_DAYS) };
    }
    case "showOnce":
      return { ...state, showOnce: action.value };
    case "showOther":
      return { ...state, showOther: action.value };
    case "notes":
      return { ...state, notes: action.value };
    default:
      return state;
  }
}
