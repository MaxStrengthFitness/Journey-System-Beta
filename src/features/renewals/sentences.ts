/**
 * RENEWALS — every snapshot as words.
 *
 * "Sentences, not scores" (CLAUDE.md): the screens never show a renewal as a
 * number or a colour on its own. Each situation has one sentence, built here
 * from the snapshot, so the chip, the card, the pipeline and the Brief all say
 * the same thing the same way.
 */

import { daysBetween } from "../client-history/model";
import type { RenewalSituation, RenewalSnapshot } from "./types";

/** "Nov 14", or "Nov 14, 2027" when it isn't this year. */
export function dayLabel(key: string | null | undefined, today?: string): string {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const sameYear = today ? today.slice(0, 4) === key.slice(0, 4) : true;
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function sessions(n: number): string {
  return `${n} session${n === 1 ? "" : "s"}`;
}

/** "1.5×" — the quarter-rounded pace, without a trailing ".0". */
export function paceLabel(perWeek: number | null): string {
  if (perWeek === null) return "";
  return `${Number.isInteger(perWeek) ? perWeek : perWeek.toFixed(2).replace(/0$/, "")}×`;
}

function billingEnds(s: RenewalSnapshot, today: string): string {
  const when = dayLabel(s.chargeDate, today);
  const est = s.chargeDateSource === "estimate" ? " (estimated)" : "";
  return s.autoRenews === false ? `billing ends ${when}${est}` : `auto-renews ${when}${est}`;
}

function weeksBetween(a: string, b: string): number {
  return Math.max(1, Math.round(daysBetween(a, b) / 7));
}

/** The one-line status: the chip on the profile, the first line of the card. */
export function chipText(s: RenewalSnapshot | null | undefined, today: string): string {
  if (!s) return "Renewal: not worked out yet";
  switch (s.situation) {
    case "away":
      return s.awayUntil
        ? `${s.awayReason ?? "Away"} until ${dayLabel(s.awayUntil, today)}`
        : `${s.awayReason ?? "Away"} · paused`;
    case "ended":
      return `Package ended ${dayLabel(s.focusDate, today)}`;
    case "lapsed":
      return `No package since ${dayLabel(s.focusDate, today)}`;
    case "unknown":
      return "Renewal: Mindbody data missing";
    default: {
      const left = s.sessionsLeft !== null ? `${s.sessionsLeft} left` : null;
      const when =
        s.paymentMode === "monthly" && s.chargeDate
          ? billingEnds(s, today)
          : s.runOutDate
            ? `runs out ~${dayLabel(s.runOutDate, today)}`
            : null;
      return [left, when].filter(Boolean).join(" · ") || "Renewal";
    }
  }
}

/** The fuller sentence for the card, the pipeline row and the Brief. */
export function situationSentence(s: RenewalSnapshot, today: string): string {
  switch (s.situation) {
    case "on-track": {
      const parts = [
        s.sessionsLeft !== null ? `${sessions(s.sessionsLeft)} left` : null,
        s.paymentMode === "monthly" && s.chargeDate ? billingEnds(s, today) : null,
        s.paymentMode === "prepaid" ? "paid in full" : null,
        s.paymentMode === "sessions-only" ? "billing finished, using banked sessions" : null,
        s.pacePerWeek !== null ? "on pace" : "pace not known yet",
      ];
      return parts.filter(Boolean).join(" · ");
    }
    case "will-bank":
      return `${capitalize(billingEnds(s, today))} with about ${sessions(s.bankedAtCharge ?? 0)} still banked`;
    case "will-run-out": {
      const gap = s.runOutDate && s.chargeDate ? weeksBetween(s.runOutDate, s.chargeDate) : null;
      return `Out of sessions around ${dayLabel(s.runOutDate, today)}${
        gap ? `, ${gap} week${gap === 1 ? "" : "s"} before billing ends` : ""
      }`;
    }
    case "away":
      return `${s.awayReason ?? "Away"}${s.awayUntil ? ` until ${dayLabel(s.awayUntil, today)}` : ""} · clocks paused`;
    case "ended":
      return `Package ended ${dayLabel(s.focusDate, today)} — no new one in Mindbody yet`;
    case "lapsed":
      return `No package since ${dayLabel(s.focusDate, today)}`;
    case "unknown":
    default:
      return s.dataGaps[0] ?? "Not enough Mindbody data to say yet";
  }
}

function capitalize(t: string): string {
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** "Comes 1.5× a week" — or says there isn't enough to tell. */
export function paceSentence(s: RenewalSnapshot): string {
  return s.pacePerWeek === null
    ? "Pace: not enough visits on record yet"
    : s.pacePerWeek === 0
      ? "No visits in the last 8 weeks"
      : `Comes ${paceLabel(s.pacePerWeek)} a week`;
}

/** One line of evidence for a pipeline row: consistency, then strength. */
export function proofSentence(s: RenewalSnapshot): string | null {
  const parts: string[] = [];
  const p = s.proof;
  if (p.weeksAttended !== null && p.weeksObserved !== null) {
    parts.push(`in ${p.weeksAttended} of the last ${p.weeksObserved} weeks`);
  }
  if (p.machinesImproved !== null && p.machinesTracked !== null && p.machinesImproved > 0) {
    parts.push(`stronger on ${p.machinesImproved} of ${p.machinesTracked} machines`);
  }
  if (p.inbody && p.inbody.muscleLbChange > 0) {
    parts.push(`+${round1(p.inbody.muscleLbChange)} lb muscle`);
  }
  return parts.length ? capitalize(parts.join(" · ")) : null;
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** Where a situation sits in the Operations pipeline. */
export type RenewalLane = "before-charge" | "talk-now" | "coming-up" | "lapsed" | "away" | "unknown";

export const SITUATION_TONE: Record<RenewalSituation, "ok" | "warn" | "alert" | "neutral"> = {
  "on-track": "ok",
  "will-bank": "warn",
  "will-run-out": "warn",
  away: "neutral",
  ended: "alert",
  lapsed: "alert",
  unknown: "neutral",
};
