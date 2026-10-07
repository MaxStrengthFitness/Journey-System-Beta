/**
 * RENEWALS — every snapshot as words.
 *
 * "Sentences, not scores" (CLAUDE.md): the screens never show a renewal as a
 * number or a color on its own. Each situation has one sentence, built here
 * from the snapshot, so the chip, the card, the pipeline and the Brief all say
 * the same thing the same way.
 */

import { daysBetween } from "../client-history/model";
import { formatDateWords } from "../../lib/studio-time";
import { callChange, type InBodyVariation } from "../inbody/variation";
import { formatMoney } from "./money";
import type { AutoRenewSource, RenewalSituation, RenewalSnapshot } from "./types";

const DAY_LABEL: Intl.DateTimeFormatOptions = { timeZone: "UTC", month: "short", day: "numeric" };
const DAY_LABEL_YEAR: Intl.DateTimeFormatOptions = { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" };

/** "Nov 14", or "Nov 14, 2027" when it isn't this year. One cached formatter per option set. */
export function dayLabel(key: string | null | undefined, today?: string): string {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const sameYear = today ? today.slice(0, 4) === key.slice(0, 4) : true;
  return formatDateWords(date, sameYear ? DAY_LABEL : DAY_LABEL_YEAR, "en-US");
}

function sessions(n: number): string {
  return `${n} session${n === 1 ? "" : "s"}`;
}

/** "1.5×" — the quarter-rounded pace, without a trailing ".0". */
export function paceLabel(perWeek: number | null): string {
  if (perWeek === null) return "";
  return `${Number.isInteger(perWeek) ? perWeek : perWeek.toFixed(2).replace(/0$/, "")}×`;
}

/**
 * What happens when a contract's payments run out, in the words every renewal
 * screen uses. The answer is the DECIDED one (auto-renew.ts: Mindbody's
 * contract, a trainer's mark, the package's answer, the studio's, the
 * standard ON). Null is the fallback — a package not matched in Renewal
 * settings, or a snapshot from before the decision — and then the words say
 * neither: the payments finishing is true either way.
 */
export function billingEndPhrase(autoRenews: boolean | null | undefined): string {
  if (autoRenews === true) return "auto-renews";
  if (autoRenews === false) return "billing ends";
  return "payments finish";
}

/**
 * The same answer after "before": "it renews", "billing ends", "the payments
 * finish" — so "6 weeks before …" never says "billing ends" beside a card
 * that says "Auto-renews".
 */
function billingEndAfterBefore(autoRenews: boolean | null | undefined): string {
  const phrase = billingEndPhrase(autoRenews);
  if (phrase === "auto-renews") return "it renews";
  if (phrase === "payments finish") return "the payments finish";
  return phrase;
}

function billingEnds(s: RenewalSnapshot, today: string): string {
  const when = dayLabel(s.chargeDate, today);
  const est = s.chargeDateSource === "estimate" ? " (estimated)" : "";
  return `${billingEndPhrase(s.autoRenews)} ${when}${est}`;
}

/**
 * What the sessions still banked when billing ends mean for the renewal. Only
 * a contract that auto-renews charges a new package on top of them.
 */
export function bankedAtChargeNote(s: RenewalSnapshot): string {
  const head = `About ${sessions(s.bankedAtCharge ?? 0)}. Sessions never expire, so they carry over`;
  if (s.autoRenews === true) return `${head} — decide in Mindbody whether the renewal should wait.`;
  // The answer may be the studio's or a trainer's mark, not the contract's.
  if (s.autoRenews === false) return `${head}. Not on auto-renewal, so no new package is charged on top of them.`;
  return `${head} — check in Mindbody whether the contract auto-renews and, if it does, whether the renewal should wait.`;
}

/**
 * Where an auto-renew answer came from, in the words the Brief, the Renewal
 * card and the profile use. "The standard answer" is a studio that never
 * answered: never credited as "the studio's answer". Null for no answer.
 */
export function autoRenewSourceWords(from: AutoRenewSource | null | undefined): string | null {
  switch (from) {
    case "mindbody":
      return "Mindbody's contract";
    case "client":
      return "marked on the profile";
    case "package":
      return "the package's answer";
    case "studio":
      return "the studio's answer";
    case "default":
      return "the standard answer (the studio hasn't set one)";
    default:
      return null;
  }
}

/** Where a snapshot's auto-renew answer came from, in words. A version-1 snapshot's flag was Mindbody's own. */
export function autoRenewWordsOf(s: Pick<RenewalSnapshot, "autoRenews" | "autoRenewsFrom">): string | null {
  const from = s.autoRenewsFrom !== undefined ? s.autoRenewsFrom : typeof s.autoRenews === "boolean" ? "mindbody" : null;
  return autoRenewSourceWords(from);
}

/**
 * A charge date with what a leader needs beside it: whether it is estimated,
 * and where the auto-renew answer came from — "Nov 14 (estimated) · the
 * studio's answer". Empty when there is no charge date.
 */
export function chargeDateLine(
  s: Pick<RenewalSnapshot, "chargeDate" | "chargeDateSource" | "autoRenews" | "autoRenewsFrom">,
  today: string,
): string {
  if (!s.chargeDate) return "";
  const when = `${dayLabel(s.chargeDate, today)}${s.chargeDateSource === "estimate" ? " (estimated)" : ""}`;
  return [when, autoRenewWordsOf(s)].filter(Boolean).join(" · ");
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
      if (s.renewalOnBooks) return [left, `renewed · next starts ${dayLabel(s.renewalOnBooks.startsOn, today)}`].filter(Boolean).join(" · ");
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
  const live = s.situation === "on-track" || s.situation === "will-bank" || s.situation === "will-run-out";
  if (live && s.renewalOnBooks) {
    const banked =
      s.situation === "will-bank" && s.bankedAtCharge ? `, with about ${sessions(s.bankedAtCharge)} still banked` : "";
    const left = s.sessionsLeft !== null ? ` · ${sessions(s.sessionsLeft)} left on this one` : "";
    return `Renewed — the next package starts ${dayLabel(s.renewalOnBooks.startsOn, today)}${banked}${left}`;
  }
  switch (s.situation) {
    case "on-track": {
      const parts = [
        s.sessionsLeft !== null ? `${sessions(s.sessionsLeft)} left` : null,
        s.paymentMode === "monthly" && s.chargeDate ? billingEnds(s, today) : null,
        s.paymentMode === "prepaid" ? "paid in full" : null,
        s.paymentMode === "sessions-only" ? "billing finished, using banked sessions" : null,
        s.pacePerWeek === null ? "pace not known yet" : s.pacePerWeek === 0 ? "no visits in 8 weeks" : "on pace",
      ];
      return parts.filter(Boolean).join(" · ");
    }
    case "will-bank":
      return `${capitalize(billingEnds(s, today))} with about ${sessions(s.bankedAtCharge ?? 0)} still banked`;
    case "will-run-out": {
      const gap = s.runOutDate && s.chargeDate ? weeksBetween(s.runOutDate, s.chargeDate) : null;
      return `Out of sessions around ${dayLabel(s.runOutDate, today)}${
        gap ? `, ${gap} week${gap === 1 ? "" : "s"} before ${billingEndAfterBefore(s.autoRenews)}` : ""
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

export function capitalize(t: string): string {
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

/**
 * One line of evidence for a pipeline row: consistency, then strength.
 * InBody muscle joins it only when the gain is beyond the client's HOME
 * studio's variation (features/inbody/variation.ts): the stored change is
 * raw, and a gain the scanner could have made up is not evidence.
 */
export function proofSentence(s: RenewalSnapshot, variation: InBodyVariation): string | null {
  const parts: string[] = [];
  const p = s.proof;
  if (p.weeksAttended !== null && p.weeksObserved !== null) {
    parts.push(`in ${p.weeksAttended} of the last ${p.weeksObserved} weeks`);
  }
  if (p.machinesImproved !== null && p.machinesTracked !== null && p.machinesImproved > 0) {
    parts.push(`stronger on ${p.machinesImproved} of ${p.machinesTracked} machines`);
  }
  if (p.inbody && callChange("skeletalMuscleMassLb", p.inbody.muscleLbChange, variation) === "up") {
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

/* ------------------------------------------------------------------ *
 * Version 3 (the renewals dashboard, Oct 7 2026): the ledger, the
 * projection, the rate and the retention signals, each one sentence.
 * ------------------------------------------------------------------ */

/**
 * Sessions left, part by part: "52 left: 9 rolled over · 11 this contract ·
 * 32 to come · +2 extra". Extra (complimentary or won) sessions stand BESIDE
 * the package's number, as on the profile header ("36 left in contract · +12
 * extra"), never inside it. A single part is just "11 left". Null without a
 * ledger (a version-2 snapshot, or no pricing options on file).
 */
export function ledgerSentence(s: Pick<RenewalSnapshot, "ledger"> | null | undefined): string | null {
  const l = s?.ledger;
  if (!l) return null;
  const pkg = l.total - l.extra;
  const extra = l.extra > 0 ? `+${l.extra} extra` : null;
  const toCome = l.toCome > 0 ? `${l.toCome} to come${l.source === "estimate" ? " (estimated)" : ""}` : null;
  const parts = [
    l.carriedIn > 0 ? `${l.carriedIn} rolled over` : null,
    l.thisContract > 0 ? `${l.thisContract} this contract` : null,
    toCome,
  ].filter((p): p is string => Boolean(p));
  if (pkg <= 0) return extra ? `No package sessions left · ${extra}` : "No sessions left";
  const head = parts.length > 1 ? `${pkg} left: ${parts.join(" · ")}` : `${pkg} left`;
  return [head, extra].filter(Boolean).join(" · ");
}

/** "6 weeks", "1 week". */
function weeksWords(n: number): string {
  return `${n} week${n === 1 ? "" : "s"}`;
}

/**
 * What will be left when the commitment ends: "About 14 left when the
 * commitment ends Mar 3 (11–17)", "Runs out around Jan 20, 6 weeks before
 * it ends", or "Not enough to project yet" below the pace's minimum sample.
 * An estimated end says "around". Null when there is no projection.
 */
export function projectionSentence(s: Pick<RenewalSnapshot, "projection"> | null | undefined, today: string): string | null {
  const p = s?.projection;
  if (!p) return null;
  if (p.leftAtEnd === null) return "Not enough to project yet";
  const end = `${p.endsOnSource === "estimate" ? "around " : ""}${dayLabel(p.endsOn, today)}`;
  if (p.runOutDate) {
    const gap = weeksBetween(p.runOutDate, p.endsOn);
    return `Runs out around ${dayLabel(p.runOutDate, today)}, ${weeksWords(gap)} before it ends`;
  }
  if (p.leftAtEnd === 0) return `Uses them all by the time the commitment ends ${end}`;
  const low = p.leftAtEndLow ?? p.leftAtEnd;
  const high = p.leftAtEndHigh ?? p.leftAtEnd;
  const range = low !== high ? ` (${low}–${high})` : "";
  return `About ${p.leftAtEnd} left when the commitment ends ${end}${range}`;
}

/**
 * How the projection was worked out, for its (i): "52 left, 6 booked, then
 * 1.5× a week for 21 weeks". Null without a projection to explain.
 */
export function projectionWorking(s: Pick<RenewalSnapshot, "projection" | "sessionsLeft"> | null | undefined): string | null {
  const p = s?.projection;
  if (!p || p.leftAtEnd === null || s?.sessionsLeft === null || s?.sessionsLeft === undefined) return null;
  return [
    `${s.sessionsLeft} left`,
    p.booked > 0 ? `${p.booked} booked` : null,
    p.pacePerWeek !== null ? `then ${paceLabel(p.pacePerWeek)} a week for ${Math.round(p.paceWeeks)} week${Math.round(p.paceWeeks) === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * What the client pays: "at $54 a session (special)" when Mindbody's charge
 * differs from the package table, "at $60 a session" otherwise, or "$480
 * every 4 weeks" when the package (and so the split into sessions) isn't
 * known. Null without a rate.
 */
export function rateSentence(s: Pick<RenewalSnapshot, "rate"> | null | undefined): string | null {
  const r = s?.rate;
  if (!r) return null;
  if (r.perSession !== null) return `at ${formatMoney(r.perSession)} a session${r.special ? " (special)" : ""}`;
  if (r.payment !== null) return `${formatMoney(r.payment)} every 4 weeks`;
  return null;
}

/**
 * The pace's trend: "Coming less: 0.75× a week in the last 4 weeks, 1.5× in
 * the 8 before", "Coming more: …", or "Steady at 1.5× a week". Null when
 * either window is too short to say.
 */
export function paceTrendSentence(s: Pick<RenewalSnapshot, "signals"> | null | undefined): string | null {
  const g = s?.signals;
  if (!g || !g.paceTrend || g.paceRecent === null || g.pacePrior === null) return null;
  if (g.paceTrend === "steady") return `Steady at ${paceLabel(g.paceRecent)} a week`;
  return `Coming ${g.paceTrend === "down" ? "less" : "more"}: ${paceLabel(g.paceRecent)} a week in the last 4 weeks, ${paceLabel(g.pacePrior)} in the 8 before`;
}

/**
 * Their sessions so far, before Journey included (lib/session-total.ts):
 * "312 sessions in all", "About 312 sessions in all (from Mindbody, not yet
 * confirmed)", or "12 sessions in Journey" when nothing before Journey is
 * known. Null when the count isn't known.
 */
export function tenureSentence(s: Pick<RenewalSnapshot, "signals"> | null | undefined): string | null {
  const g = s?.signals;
  if (!g || g.totalSessions === null || !g.totalSessionsBasis) return null;
  const n = g.totalSessions;
  const word = `session${n === 1 ? "" : "s"}`;
  switch (g.totalSessionsBasis) {
    case "journey-only":
      return `${n} ${word} in Journey`;
    case "mindbody":
      return `About ${n} ${word} in all (from Mindbody, not yet confirmed)`;
    default:
      return `${n} ${word} in all`;
  }
}
