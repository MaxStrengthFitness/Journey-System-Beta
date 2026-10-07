/**
 * RENEWALS — the Operations pipeline, the pure half.
 *
 * Lanes by how soon something is lost (the Hub's lifespan rule, proposal
 * §4.2):
 *
 *   before-charge  will bank sessions and the charge is inside the studio's
 *                  warning window — there's a hard date. Never a contract
 *                  the decided answer says won't renew (auto-renew.ts;
 *                  engine.ts, chargeWarning)
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
import { planNextStep } from "./plan";
import { planUndecided, saidNotRenewing } from "./row-facts";
import type { InBodyVariation } from "../inbody/variation";
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
  "before-charge":
    "Sessions still banked when the payments finish, and the package renews automatically. Talk first, then decide in Mindbody whether to move the renewal.",
  "talk-now": "Few sessions left, or the package has ended, and nothing decided yet.",
  "coming-up": "Packages ending in the months ahead.",
  lapsed: "No new package since the studio's lost rule, or recorded as lost or pay-as-you-go. A win-back list.",
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
  // The next package is already signed: the renewal is done.
  if (s.renewalOnBooks) return null;
  const outcome = cycle?.outcome ?? null;
  // Renewed, upgraded or downgraded: done — the next package shows up on its own.
  if (outcome === "renewed" || outcome === "upgraded" || outcome === "downgraded") return null;
  const recent = Boolean(s.focusDate && daysBetween(s.focusDate, today) <= LAPSED_LOOKBACK_DAYS);
  if (s.situation === "lapsed") return recent ? "lapsed" : null;
  // Recorded as lost or pay-as-you-go before the lost rule fired: win-back.
  if ((outcome === "lost" || outcome === "pay-as-you-go") && s.situation === "ended") return recent ? "lapsed" : null;
  if (s.situation === "unknown") return null;
  const decided = effectiveStage(cycle) === "decided";
  if (s.chargeWarning && !decided) return "before-charge";
  if ((s.situation === "ended" || s.conversationDue) && !decided) return "talk-now";
  // Ahead only: a decided package that has already ended isn't "coming up".
  if (s.focusDate && s.focusDate >= today && s.focusDate <= horizonEnd(settings, today)) return "coming-up";
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
  if (cycle?.outcome === "pay-as-you-go") return "On single sessions — offer a package";
  if (cycle?.outcome === "lost") return "Recorded as lost — win-back: reach out in person";
  if (cycle?.outcome) return "Renewal recorded";
  // A leader's "Decided" asks for the outcome, whatever the plan says.
  if (effectiveStage(cycle) === "decided") return "Decided — record the outcome";
  // The studio's plan (plan.ts) says what comes next more exactly than the
  // stage does; away still waits for them to be back.
  const planned = s.situation === "away" ? null : planNextStep(cycle?.plan, s, today);
  if (planned) return planned;
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
  /**
   * The client's HOME studio's InBody variation (features/inbody/variation.ts),
   * for the row's proof line and the upgrade filter. Carried on the row so a
   * client is judged by one studio's numbers however the list is filtered.
   */
  inbodyVariation: InBodyVariation;
}

export type PipelineFilter =
  | "all"
  | "needs-leader"
  | "price"
  | "upgrade"
  | "not-talked"
  | "plan-undecided"
  | "not-renewing";

export const FILTER_LABELS: Record<PipelineFilter, string> = {
  all: "Everyone",
  "needs-leader": "Needs a leader",
  price: "On the fence about price",
  upgrade: "Upgrade candidates",
  "not-talked": "Nobody has talked to them",
  // The renewals dashboard (Oct 7 2026): the studio's plan (plan.ts).
  "plan-undecided": "Plan: not decided",
  "not-renewing": "Not renewing",
};

/**
 * What a filter takes in, said once under the filters while it is on; only
 * where the label alone could mislead. Not renewing includes a client whose
 * latest conversation leaned not renewing, unless a plan says renewing
 * (row-facts.ts saidNotRenewing; AJ, Oct 7 2026: "I want to know the people
 * that had the conversation that month so it's not bad to just keep them in
 * the same spot").
 */
export const FILTER_HINTS: Partial<Record<PipelineFilter, string>> = {
  "not-renewing": "Includes a plan of Not renewing, and anyone whose latest conversation leaned not renewing unless a plan says they're renewing.",
};

/**
 * `cyclesKnown` is false while the conversations are loading or after a read
 * of them failed: the plan filters then match nobody, never everybody (a
 * failed read is unknown, not "no plan").
 */
export function matchesFilter(
  row: PipelineRow,
  filter: PipelineFilter,
  settings: RenewalSettings,
  cyclesKnown = true,
): boolean {
  switch (filter) {
    case "needs-leader":
      return Boolean(row.cycle?.needsLeader);
    case "price":
      return (row.cycle?.latestConcerns ?? []).includes("price");
    case "upgrade":
      return upgradeVerdict(row.snapshot, settings, row.inbodyVariation).candidate;
    case "not-talked":
      return !row.cycle?.lastTouchAt;
    case "plan-undecided":
      return (cyclesKnown || Boolean(row.cycle)) && planUndecided(row.cycle);
    case "not-renewing":
      return (cyclesKnown || Boolean(row.cycle)) && saidNotRenewing(row.cycle);
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
