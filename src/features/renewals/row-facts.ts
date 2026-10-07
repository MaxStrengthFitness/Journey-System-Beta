/**
 * RENEWALS — one client's row on the renewals dashboard, as words (the
 * renewals dashboard, Oct 7 2026). Pure: row-facts.test.ts.
 *
 * AJ asked to see at a glance, per client: has anyone talked to them about
 * the renewal, the package (6, 12 or 18 months), the exact day the
 * commitment ends, the sessions left in total, the sessions projected left
 * when it ends, the primary trainer, and the other signals that matter.
 * Operations → Clients → Renewals and My renewals draw the same row
 * (RenewalRow.tsx) from this one answer, so the two never disagree.
 *
 * Every cell is a sentence from sentences.ts, plan.ts or conversation.ts
 * (sentences, not scores); this file only picks which and puts them in
 * order. A failed read of the conversations is "Couldn't check", never
 * "Nobody has talked to them yet".
 */

import { concernLabel, lastTalkSentence, leaningLabel } from "./conversation";
import { formatMoney } from "./money";
import { PLAN_LABELS, planExpectation, planSentence } from "./plan";
import {
  dayLabel,
  ledgerSentence,
  paceTrendSentence,
  projectionSentence,
  projectionWorking,
  rateSentence,
  tenureSentence,
} from "./sentences";
import type { RenewalCycle, RenewalSettings, RenewalSnapshot, RenewalTouch } from "./types";

export interface RenewalRowFacts {
  /** The primary trainer's name, or null when nobody has coached them lately. */
  trainer: string | null;
  /** "Committed · 12 months · at $54 a session (special)". */
  packageLine: string;
  /** "Auto-renews Jan 29, 2027", "Ends around Mar 3", or null with no commitment running. */
  endLine: string | null;
  /** The ledger: "52 left: 9 rolled over · 11 this contract · 32 to come · +2 extra". */
  leftNow: string;
  /** "About 14 left when the commitment ends Mar 3 (11–17)", or null without a projection. */
  atEnd: string | null;
  /** "Talked Oct 3 · Jen · Unsure — price", "Nobody has talked to them yet", "Couldn't check". */
  talked: string;
  /** The one or two signals that matter most, as sentences. */
  signals: string[];
  /** "Upgrading to Life Transformed · Jen, Oct 6", or null with no plan. */
  plan: string | null;
  /** The working behind the cells, for the row's (i). */
  why: string[];
}

export interface RenewalRowInput {
  snapshot: RenewalSnapshot;
  cycle: RenewalCycle | null | undefined;
  /** Some read of the conversations failed: a missing one is unknown. */
  cyclesFailed?: boolean;
  /** The conversations are still being read. */
  cyclesLoading?: boolean;
  settings: Pick<RenewalSettings, "packages">;
  today: string;
  /** The primary trainer's name, looked up from the studio's staff. */
  trainerName?: string | null;
  /** The row's proof line (proofSentence), for the (i). */
  proof?: string | null;
}

/** The situation as a badge's word (the pipeline's, since the Renewals round). */
export function situationWord(situation: RenewalSnapshot["situation"]): string {
  switch (situation) {
    case "will-bank":
      return "Will bank";
    case "will-run-out":
      return "Runs out early";
    case "ended":
      return "Ended";
    case "lapsed":
      return "Lapsed";
    case "away":
      return "Away";
    case "unknown":
      return "No data";
    default:
      return "On track";
  }
}

/** How many signals a row says. More is a paragraph, not a glance. */
export const MAX_ROW_SIGNALS = 2;

/** The package and what it costs: "Committed · 12 months · paid in full · at $57 a session". */
export function packageLine(s: RenewalSnapshot): string {
  const label = s.packageLabel?.trim() || (s.situation === "unknown" ? "No Mindbody data yet" : "Package not recognized");
  return [label, s.paymentMode === "prepaid" ? "paid in full" : null, rateSentence(s)].filter(Boolean).join(" · ");
}

/**
 * When the commitment ends, with the decided auto-renew answer: "Auto-renews
 * Jan 29, 2027" (auto-renew.ts), "Ends Jan 29, 2027" when it won't, "Ends
 * around Mar 3" for a paid-in-full package (it never renews), "Commitment
 * ends …" when nobody knows. "Payments finished" once billing is over.
 */
export function endLine(s: RenewalSnapshot, today: string): string | null {
  const end = s.commitmentEnd ?? (s.paymentMode === "monthly" ? s.chargeDate : null);
  const source = s.commitmentEnd ? s.commitmentEndSource : s.chargeDateSource;
  if (!end) return s.paymentMode === "sessions-only" ? "Payments finished" : null;
  const when = `${source === "estimate" ? "around " : ""}${dayLabel(end, today)}`;
  if (s.paymentMode === "prepaid") return `Ends ${when}`;
  if (s.autoRenews === true) return `Auto-renews ${when}`;
  if (s.autoRenews === false) return `Ends ${when}`;
  return `Commitment ends ${when}`;
}

/** Sessions left now: the ledger, else the plain count, else that it isn't known. */
export function leftNowLine(s: RenewalSnapshot): string {
  const ledger = ledgerSentence(s);
  if (ledger) return ledger;
  if (s.sessionsLeft === null || s.sessionsLeft === undefined) return "Sessions left not known";
  const est = s.sessionsLeftSource === "estimate" ? " (estimated)" : "";
  return `${s.sessionsLeft} left${est}`;
}

/** Who last talked to them, when, and what they heard. */
export function talkedLine(cycle: RenewalCycle | null | undefined, today: string, readFailed = false): string {
  const head = lastTalkSentence(cycle, today, { readFailed: readFailed && !cycle });
  if (!cycle?.lastTouchAt || !cycle.latestLeaning) return head;
  const concerns = (cycle.latestConcerns ?? []).map(concernLabel).join(", ").toLowerCase();
  return `${head} · ${leaningLabel(cycle.latestLeaning)}${concerns ? ` — ${concerns}` : ""}`;
}

/**
 * The signals worth a glance, most telling first: coming less, nothing
 * booked, a package that fits their pace better, coming more, how long
 * they've been coming, the next visit booked. The first two are said.
 */
export function rowSignals(s: RenewalSnapshot, settings: Pick<RenewalSettings, "packages">, today: string): string[] {
  const out: string[] = [];
  const g = s.signals ?? null;
  if (g?.paceTrend === "down") out.push(paceTrendSentence(s) as string);
  const active = s.situation !== "lapsed" && s.situation !== "away" && s.situation !== "unknown";
  if (active && !s.nextBookingDate) {
    out.push(s.lastVisitDate ? `Nothing booked · last came ${dayLabel(s.lastVisitDate, today)}` : "Nothing booked");
  }
  const fits = g?.suggestedPackageKey ? settings.packages.find((p) => p.key === g.suggestedPackageKey) ?? null : null;
  if (fits && fits.key !== s.packageKey) out.push(`At their pace, ${fits.label} fits best`);
  if (g?.paceTrend === "up") out.push(paceTrendSentence(s) as string);
  const tenure = tenureSentence(s);
  if (tenure) out.push(tenure);
  if (s.nextBookingDate && s.nextBookingDate >= today) out.push(`Next booked ${dayLabel(s.nextBookingDate, today)}`);
  return out.filter(Boolean).slice(0, MAX_ROW_SIGNALS);
}

export function renewalRowFacts(input: RenewalRowInput): RenewalRowFacts {
  const { snapshot: s, cycle, settings, today } = input;
  const why = [
    projectionWorking(s) ? `At the end: ${projectionWorking(s)}.` : null,
    s.ledger?.asOf ? `Sessions left from Mindbody, ${dayLabel(s.ledger.asOf, today)}.` : null,
    s.rate?.special && s.rate.packageRate !== null
      ? `The package table says ${formatMoney(s.rate.packageRate)} a session; Mindbody charges this client differently.`
      : null,
    input.proof ?? null,
  ].filter((w): w is string => Boolean(w));
  return {
    trainer: input.trainerName?.trim() || null,
    packageLine: packageLine(s),
    endLine: endLine(s, today),
    leftNow: leftNowLine(s),
    atEnd: projectionSentence(s, today),
    talked: talkedLine(cycle, today, input.cyclesFailed),
    signals: rowSignals(s, settings, today),
    plan: cycle
      ? planSentence(cycle.plan, settings, today)
      : input.cyclesFailed
        ? "Couldn't check"
        : input.cyclesLoading
          ? "Checking…"
          : null,
    why,
  };
}

/**
 * Is this row's plan known: its conversation document was read, or every
 * read answered and it simply has none. False while the read is loading or
 * after it failed, so nothing offers a plan over one nobody has seen.
 */
export function planKnown(cycle: unknown, loading?: boolean, failed?: boolean): boolean {
  return Boolean(cycle) || (!loading && !failed);
}

/** No plan yet, or the plan says it isn't decided: the "Plan: not decided" filter. */
export function planUndecided(cycle: Pick<RenewalCycle, "plan"> | null | undefined): boolean {
  const e = planExpectation(cycle?.plan);
  return e === null || e === "undecided";
}

/**
 * Not renewing: the plan says so, or, with no plan that says otherwise, the
 * latest conversation heard it. The "Not renewing" filter.
 */
export function saidNotRenewing(cycle: Pick<RenewalCycle, "plan" | "latestLeaning"> | null | undefined): boolean {
  if (cycle?.plan?.choice === "not-renewing") return true;
  const e = planExpectation(cycle?.plan);
  if (e === "renewing") return false;
  return cycle?.latestLeaning === "not-renewing";
}

/**
 * A logged touch's headline in the history: "Plan: Upgrading" for a change
 * to the plan, else the leaning and its concerns, "Unsure — price".
 */
export function touchHeadline(t: Pick<RenewalTouch, "leaning" | "concerns" | "kind" | "plan">): string {
  if (t.kind === "plan" && t.plan && PLAN_LABELS[t.plan.choice]) return `Plan: ${PLAN_LABELS[t.plan.choice]}`;
  const concerns = (t.concerns ?? []).map(concernLabel).join(", ").toLowerCase();
  return `${leaningLabel(t.leaning)}${concerns ? ` — ${concerns}` : ""}`;
}
