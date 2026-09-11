/**
 * RENEWALS — the Operations pipeline, the pure half.
 *
 * Lanes by how soon something is lost (the Hub's lifespan rule, proposal
 * §4.2):
 *
 *   before-charge  will bank sessions and the charge is inside the studio's
 *                  warning window — there's a hard date
 *   talk-now       the conversation is due (few sessions left, or the
 *                  package has ended) and nothing has been decided
 *   coming-up      ends inside the planning horizon, by month
 *   lapsed         past the studio's lost rule — a win-back list
 *   away           paused; nothing to do until they're back
 *
 * Clients with no Mindbody data are counted separately ("missing Mindbody
 * data") — they can't be placed, and pretending otherwise would put them in
 * the wrong lane.
 */

import { addDays, daysBetween } from "../client-history/model";
import { effectiveStage } from "./conversation";
import { dayLabel } from "./sentences";
import { upgradeVerdict } from "./options";
import type { RenewalCycle, RenewalSettings, RenewalSnapshot } from "./types";

export type PipelineLane = "before-charge" | "talk-now" | "coming-up" | "lapsed" | "away";

export const LANE_TITLES: Record<PipelineLane, string> = {
  "before-charge": "Before the charge",
  "talk-now": "Talk now",
  "coming-up": "Coming up",
  lapsed: "Lapsed",
  away: "Away",
};

export const LANE_HINTS: Record<PipelineLane, string> = {
  "before-charge": "Will auto-renew with sessions still banked. Talk first, then decide in Mindbody whether to move the renewal.",
  "talk-now": "Few sessions left, or the package has ended, and nothing decided yet.",
  "coming-up": "Packages ending in the months ahead.",
  lapsed: "No new package since the studio's lost rule. A win-back list.",
  away: "Vacation, snowbird, medical or paused. Nothing to do until they're back.",
};

/** How far back the lapsed list reaches. Older than this is history, not a win-back. */
export const LAPSED_LOOKBACK_DAYS = 180;

export function horizonEnd(settings: RenewalSettings, today: string): string {
  return addDays(today, Math.round(settings.horizonMonths * 30.44));
}

export function laneOf(
  s: RenewalSnapshot,
  cycle: RenewalCycle | null | undefined,
  settings: RenewalSettings,
  today: string,
): PipelineLane | null {
  if (s.situation === "away") return "away";
  if (s.situation === "lapsed") {
    return s.focusDate && daysBetween(s.focusDate, today) <= LAPSED_LOOKBACK_DAYS ? "lapsed" : null;
  }
  if (s.situation === "unknown") return null;
  const decided = effectiveStage(cycle) === "decided";
  if (s.chargeWarning && !decided) return "before-charge";
  if ((s.situation === "ended" || s.conversationDue) && !decided) return "talk-now";
  if (s.focusDate && s.focusDate <= horizonEnd(settings, today)) return "coming-up";
  return null;
}

/**
 * When the "10 sessions left" conversation will come due, at the client's
 * pace. Null when it already has, or when there's no pace to project from.
 */
export function conversationDueDate(s: RenewalSnapshot, settings: RenewalSettings, today: string): string | null {
  if (s.sessionsLeft === null || s.pacePerWeek === null || s.pacePerWeek <= 0) return null;
  const extra = s.sessionsLeft - settings.conversationAtSessionsLeft;
  if (extra <= 0) return null;
  return addDays(today, Math.ceil((extra / s.pacePerWeek) * 7));
}

/** The next step, in words, for a pipeline row. */
export function nextStep(
  s: RenewalSnapshot,
  cycle: RenewalCycle | null | undefined,
  settings: RenewalSettings,
  today: string,
): string {
  const talked = Boolean(cycle?.lastTouchAt);
  if (cycle?.needsLeader) return "A leader was asked to follow up";
  if (effectiveStage(cycle) === "decided") return "Decided — record the outcome";
  if (s.situation === "away") {
    return s.awayUntil ? `Back around ${dayLabel(s.awayUntil, today)}` : "Paused";
  }
  if (s.situation === "lapsed") return "Win-back: reach out in person";
  if (s.situation === "ended") return talked ? "Keep talking — no new package yet" : "Talk about renewing";
  if (s.chargeWarning && s.chargeDate) {
    return `Talk before ${dayLabel(s.chargeDate, today)}, then decide in Mindbody about the renewal`;
  }
  if (s.conversationDue) return talked ? "Keep the conversation going" : "Start the conversation";
  const due = conversationDueDate(s, settings, today);
  if (due) return `Conversation due around ${dayLabel(due, today)}`;
  return "Plan the conversation";
}

export interface PipelineRow {
  clientId: string;
  name: string;
  snapshot: RenewalSnapshot;
  cycle: RenewalCycle | null;
  lane: PipelineLane;
}

export type PipelineFilter = "all" | "needs-leader" | "price" | "upgrade" | "not-talked";

export const FILTER_LABELS: Record<PipelineFilter, string> = {
  all: "Everyone",
  "needs-leader": "Needs a leader",
  price: "On the fence about price",
  upgrade: "Upgrade candidates",
  "not-talked": "Nobody has talked to them",
};

export function matchesFilter(row: PipelineRow, filter: PipelineFilter, settings: RenewalSettings): boolean {
  switch (filter) {
    case "needs-leader":
      return Boolean(row.cycle?.needsLeader);
    case "price":
      return (row.cycle?.latestConcerns ?? []).includes("price");
    case "upgrade":
      return upgradeVerdict(row.snapshot, settings).candidate;
    case "not-talked":
      return !row.cycle?.lastTouchAt;
    default:
      return true;
  }
}

/** Soonest first inside a lane; the undated last. */
export function sortRows(rows: PipelineRow[]): PipelineRow[] {
  return [...rows].sort(
    (a, b) =>
      (a.snapshot.focusDate ?? "9999-99-99").localeCompare(b.snapshot.focusDate ?? "9999-99-99") ||
      a.name.localeCompare(b.name),
  );
}

/** "Coming up", grouped by the month the package ends. */
export function byMonth(rows: PipelineRow[]): Array<{ month: string; label: string; rows: PipelineRow[] }> {
  const groups = new Map<string, PipelineRow[]>();
  for (const r of sortRows(rows)) {
    const month = (r.snapshot.focusDate ?? "").slice(0, 7) || "undated";
    const list = groups.get(month) ?? [];
    list.push(r);
    groups.set(month, list);
  }
  return Array.from(groups.entries()).map(([month, list]) => ({
    month,
    label:
      month === "undated"
        ? "No date yet"
        : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).toLocaleDateString(
            "en-US",
            { timeZone: "UTC", month: "long", year: "numeric" },
          ),
    rows: list,
  }));
}
