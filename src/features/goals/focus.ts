/**
 * FOCUS — the 4 P's, "the how". Pure helpers for the focus board.
 *
 * A focus is a trainer's standing intent for a client ("Pace on the compound
 * row"). Since the Goals & Focus round (Sep 2026) a client can have several
 * active at once, from any trainer, and each one ends one of two ways:
 * ACHIEVED (stored as status "passed", optionally with a reward) or RETIRED.
 *
 * Everything here reads what useClientJournal already loaded. No reads.
 */
import { SUPER_ROLES, FRANCHISE_ROLES } from "../../lib/staff-access";
import { toDate, type ClientFocus, type FocusStatus } from "../../types/journal";

const DAY_MS = 86400000;

export function focusStartDate(focus: ClientFocus): Date | null {
  return toDate(focus.startedAt) ?? toDate(focus.createdAt);
}

/**
 * When the focus stopped being active, or null while it still is.
 * Achieved: `achievedAt`, else the older `passedAt`. Retired: `retiredAt`,
 * else `updatedAt` — retired focuses written before Sep 2026 have nothing
 * better, and nothing touches a retired focus afterwards.
 */
export function focusEndDate(focus: ClientFocus): Date | null {
  if (focus.status === "passed") {
    return toDate(focus.achievedAt) ?? toDate(focus.passedAt) ?? toDate(focus.updatedAt);
  }
  if (focus.status === "retired") {
    return toDate(focus.retiredAt) ?? toDate(focus.updatedAt);
  }
  return null;
}

/** Whole days from start to end (or to `now` while active). Null with no start. */
export function focusDaysActive(focus: ClientFocus, now: Date = new Date()): number | null {
  const start = focusStartDate(focus);
  if (!start) return null;
  const end = focusEndDate(focus) ?? now;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
}

/** "under a day", "5 days", "3 weeks", "4 months", "2 years". */
export function formatSpan(days: number | null): string {
  if (days === null || !Number.isFinite(days) || days < 0) return "—";
  if (days < 1) return "under a day";
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${Math.round(days / 365.25)} years`;
}

export const FOCUS_OUTCOME_LABEL: Record<FocusStatus, string> = {
  active: "Active",
  passed: "Achieved",
  retired: "Retired",
};

/** Focuses that have ended, most recently ended first, optionally one trainer's. */
export function pastFocuses(focuses: ClientFocus[], trainerId?: string | null): ClientFocus[] {
  return focuses
    .filter((f) => f.status !== "active")
    .filter((f) => !trainerId || f.trainerId === trainerId)
    .slice()
    .sort((a, b) => {
      const at = (focusEndDate(a) ?? focusStartDate(a))?.getTime() ?? 0;
      const bt = (focusEndDate(b) ?? focusStartDate(b))?.getTime() ?? 0;
      return bt - at;
    });
}

/** Every trainer who has set one of these focuses, most focuses first. */
export function focusTrainers(
  focuses: ClientFocus[],
): { id: string; name: string; initials: string; count: number }[] {
  const map = new Map<string, { id: string; name: string; initials: string; count: number }>();
  for (const f of focuses) {
    if (!f.trainerId) continue;
    const cur = map.get(f.trainerId);
    if (cur) cur.count += 1;
    else
      map.set(f.trainerId, {
        id: f.trainerId,
        name: f.trainerName || f.trainerInitials || "Unknown coach",
        initials: f.trainerInitials || "—",
        count: 1,
      });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Legacy one-per-trainer focuses have no document this app can write back to. */
export function isWritableFocus(focus: ClientFocus): boolean {
  return !focus.id.startsWith("legacy:trainerFocuses:");
}

/**
 * Mirrors the clientFocuses update rule: the trainer who set it, or an
 * Admin / Founder / Overseer / franchise owner. A studio leader is NOT on that
 * list, so the buttons are not offered to one — a tap the rules refuse is
 * worse than no button.
 */
export function canManageFocus(
  focus: ClientFocus,
  viewerIds: readonly string[],
  role?: string | null,
): boolean {
  if (!isWritableFocus(focus)) return false;
  if (viewerIds.includes(focus.trainerId)) return true;
  return !!role && (SUPER_ROLES.has(role) || FRANCHISE_ROLES.has(role));
}
