/**
 * FOCUS HISTORY in the report — phase 3 (the 4 P's) gets its context.
 *
 * A trainer writing the 4 P's used to dig through the journal to remember
 * what they had been working on. The report now reads the client's focuses
 * once (bounded, see FOCUS_HISTORY_LIMIT) and shows them above the matrix:
 * "Pace — achieved after 3 weeks · set by AJ", active ones first.
 *
 * At save a THIN snapshot goes onto the report (category, status, weeks,
 * initials) so the printed copy needs no live read. progressReports are
 * readable by any signed-in user, so the snapshot never carries the focus's
 * intent text or anybody's name.
 *
 * Pure: no Firestore, no React.
 */
import type { ClientFocus, FocusCategory, FocusStatus } from "../../types/journal";
import type { ProgressReport } from "../../types";
import { toDate } from "../../lib/studio-time";

/** One bounded read: the client's most recently touched focuses. */
export const FOCUS_HISTORY_LIMIT = 20;
/** How many lines the printed report carries. */
export const FOCUS_SNAPSHOT_MAX = 6;

export type FocusSnapshotEntry = NonNullable<ProgressReport["focusSnapshot"]>[number];

const CATEGORIES: readonly FocusCategory[] = ["Posture", "Pace", "Path", "Purpose"];
const STATUSES: readonly FocusStatus[] = ["active", "passed", "retired"];

const DAY_MS = 24 * 60 * 60 * 1000;

type FocusLike = Pick<
  ClientFocus,
  "category" | "status" | "startedAt" | "passedAt" | "updatedAt" | "trainerInitials"
> &
  Partial<Pick<ClientFocus, "id" | "intent">>;

const ms = (v: unknown): number | null => {
  const d = toDate(v as any);
  return d ? d.getTime() : null;
};

/** When the focus stopped running: today for an active one. */
function endMs(f: FocusLike, asOf: Date): number | null {
  if (f.status === "active") return asOf.getTime();
  if (f.status === "passed") return ms(f.passedAt) ?? ms(f.updatedAt);
  return ms(f.updatedAt);
}

/** Whole weeks the focus ran, or null when its dates are missing. */
export function focusWeeks(f: FocusLike, asOf: Date): number | null {
  const start = ms(f.startedAt);
  const end = endMs(f, asOf);
  if (start === null || end === null || end < start) return null;
  return Math.floor((end - start) / DAY_MS / 7);
}

/** Active focuses first (newest start first), then the rest, most recently ended first. */
export function sortFocuses<T extends FocusLike>(focuses: readonly T[], asOf: Date): T[] {
  return [...focuses].sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    if (aActive === 0) return (ms(b.startedAt) ?? 0) - (ms(a.startedAt) ?? 0);
    return (endMs(b, asOf) ?? 0) - (endMs(a, asOf) ?? 0);
  });
}

const weeksText = (w: number) => (w < 1 ? "less than a week" : w === 1 ? "1 week" : `${w} weeks`);

function line(
  category: string,
  status: FocusStatus,
  weeks: number | null,
  initials: string | undefined,
): string {
  let what: string;
  if (status === "active") what = weeks === null ? "in progress" : `in progress for ${weeksText(weeks)}`;
  else if (status === "passed") what = weeks === null ? "achieved" : `achieved after ${weeksText(weeks)}`;
  else what = weeks === null ? "retired" : `retired after ${weeksText(weeks)}`;
  const by = (initials || "").trim();
  return `${category} — ${what}${by ? ` · set by ${by}` : ""}`;
}

/** "Pace — achieved after 3 weeks · set by AJ" */
export function focusLine(f: FocusLike, asOf: Date): string {
  return line(f.category, f.status, focusWeeks(f, asOf), f.trainerInitials);
}

/** The same sentence from a saved snapshot entry. */
export function snapshotLine(e: FocusSnapshotEntry): string {
  return line(e.category, e.status, e.weeks, e.trainerInitials);
}

const valid = (f: FocusLike) =>
  CATEGORIES.includes(f.category) && STATUSES.includes(f.status);

/** The thin copy a report keeps. Nothing personal: no intent, no names. */
export function focusSnapshotFrom(
  focuses: readonly FocusLike[],
  asOf: Date,
): FocusSnapshotEntry[] {
  return sortFocuses(focuses.filter(valid), asOf)
    .slice(0, FOCUS_SNAPSHOT_MAX)
    .map((f) => ({
      category: f.category,
      status: f.status,
      weeks: focusWeeks(f, asOf),
      trainerInitials: (f.trainerInitials || "").trim(),
    }));
}

/** The newest active focus's P — what "4 P's Focus" starts as. */
export function newestActiveCategory(
  focuses: readonly FocusLike[],
  asOf: Date,
): FocusCategory | null {
  const active = sortFocuses(focuses.filter(valid), asOf).find((f) => f.status === "active");
  return active ? active.category : null;
}
