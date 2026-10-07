/**
 * AHEAD — every client's dates for the weeks ahead, as events. Pure:
 * events.test.ts.
 *
 * AJ, Oct 7 2026: Operations shows when a week is all clear, but a leader
 * can't see past it. Ahead (beside Month, "1b") puts each client's dates on
 * the week they land: the renewal talk, the charge with sessions banked, the
 * commitment's end, sessions running out early, the next line crossed if
 * nothing is booked ("3a"), the return from away, and the birthdays and
 * anniversaries Month already lists.
 *
 * Nothing here works a date out a second way. Each comes from the rule that
 * already says it:
 *   - the lane (talk now, before the charge): admin/renewals/lanes.ts, home
 *     clients only, an Inactive client out of what there is to do;
 *   - the talk's day and its range: renewals/pipeline.ts
 *     `conversationDueRange`, counted from the day Mindbody counted ("2a");
 *   - the charge, the end, the run-out day and its range: last night's
 *     renewal record (renewals/engine.ts);
 *   - the next line: line-crossing.ts, in journeyOf's order;
 *   - birthdays and anniversaries: Month's own rows (month/month.ts),
 *     "Not confirmed" kept.
 *
 * A client whose dates can't be placed (no nightly record yet, or not
 * enough Mindbody data) is counted with the reason, never dropped.
 */

import { addDays, daysBetween } from "../../client-history/model";
import { lockSaysNothingBills } from "../../renewals/auto-renew";
import { effectiveStage, lastTalkOf } from "../../renewals/conversation";
import { RUN_OUT_MARGIN_DAYS } from "../../renewals/engine";
import { conversationDueRange } from "../../renewals/pipeline";
import { PLAN_LABELS } from "../../renewals/plan";
import { BOOKING_LOOKAHEAD_DAYS } from "../../renewals/projection";
import { dayLabel, paceLabel } from "../../renewals/sentences";
import type { PackageTier, RenewalCycle, RenewalSettings, RenewalSnapshot } from "../../renewals/types";
import { STATE_NAMES, type ClientJourney, type JourneyLines } from "../journey/states";
import { monthAnniversaries, monthBirthdays, monthOf, shiftMonth, type MonthRow } from "../month/month";
import { homeRecord, renewalLane, type RenewalLaneContext } from "../renewals/lanes";
import { inactiveOnRecord } from "../renewals/running-low";
import { nextLineCrossing, type LineState } from "./line-crossing";
import type { Client } from "../../../types";

/* ------------------------------------------------------------------ *
 * The kinds of event
 * ------------------------------------------------------------------ */

export type AheadKind =
  | "talk-now"
  | "talk"
  | "charge-window"
  | "charge"
  | "renews"
  | "billing-ends"
  | "ends"
  | "runs-out"
  | "may-slip"
  | "back"
  | "birthday"
  | "anniversary";

/** The word on the row's badge. */
export const KIND_WORDS: Record<AheadKind, string> = {
  "talk-now": "Talk now",
  talk: "Talk due",
  "charge-window": "Before the charge",
  charge: "Charge",
  renews: "Renews",
  "billing-ends": "Billing ends",
  ends: "Ends",
  "runs-out": "Runs out",
  "may-slip": "May slip",
  back: "Back",
  birthday: "Birthday",
  anniversary: "Anniversary",
};

/**
 * What a week heading counts an event as: a talk, a renewal date, something
 * to watch, or a moment. The strip draws the first three.
 */
export type AheadGroup = "talk" | "date" | "watch" | "moment";

export const KIND_GROUP: Record<AheadKind, AheadGroup> = {
  "talk-now": "talk",
  talk: "talk",
  "charge-window": "date",
  charge: "date",
  renews: "date",
  "billing-ends": "date",
  ends: "date",
  back: "date",
  "runs-out": "watch",
  "may-slip": "watch",
  birthday: "moment",
  anniversary: "moment",
};

/** The order inside one day: what needs doing first. */
export const KIND_ORDER: readonly AheadKind[] = [
  "talk-now",
  "charge-window",
  "may-slip",
  "talk",
  "charge",
  "runs-out",
  "renews",
  "billing-ends",
  "ends",
  "back",
  "anniversary",
  "birthday",
];

/** The colour family each kind is drawn in: blue to act on, plum for caution, ink for a date. */
export const KIND_TONE: Record<AheadKind, "act" | "caution" | "date" | "moment"> = {
  "talk-now": "act",
  talk: "act",
  "charge-window": "caution",
  charge: "caution",
  renews: "date",
  "billing-ends": "date",
  ends: "date",
  back: "date",
  "runs-out": "caution",
  "may-slip": "caution",
  birthday: "moment",
  anniversary: "moment",
};

/** A talk and a moment this close together: the moment is named on the talk's row. */
export const PAIR_DAYS = 14;
/** May slip is said within this many days: the next line a week out is "now". */
export const SLIP_SOON_DAYS = 7;

export interface AheadEvent {
  key: string;
  clientId: string;
  kind: AheadKind;
  /** The studio day it lands on. Talk now and an open charge window land on today. */
  day: string;
  /** Already due (Talk now, inside the charge window). */
  now: boolean;
  /** The earliest and latest day, from the fastest and slowest 4-week pace. Null when the day is Mindbody's own. */
  range: { earliest: string; latest: string } | null;
  /** The row's one sentence. */
  sentence: string;
  /** How it was worked out, for the row's (i). */
  proof: string;
  /** A birthday or anniversary within two weeks of a talk, said on the talk's row: "5 years with the studio on Oct 22". */
  pair: string | null;
  /** May slip: the line. */
  line?: LineState;
  /** An anniversary by Mindbody's date nobody has confirmed (Month's badge). */
  notConfirmed?: boolean;
}

export interface AheadClient {
  id: string;
  name: string;
  client: Client;
  snapshot: RenewalSnapshot | null;
  cycle: RenewalCycle | null;
  /** The Journey's state, when it has been worked out (leaders' screens). */
  journey: ClientJourney | null;
  trainerId: string | null;
  /** On the studio's shortest package (the Trial): its end is the studio's conversion moment. */
  onTrial: boolean;
  events: AheadEvent[];
  /** Why no dates can be placed, in words; null when they can. */
  cantPlace: string | null;
  /** No pace to project from yet (fewer than 21 days of visits): Mindbody's own dates only. */
  noPace: boolean;
  /** The first day there is something to decide (moments left out); null with nothing in the weeks drawn. */
  firstDay: string | null;
  /** Talk now, inside the charge window, a line crossed within a week, or slipping today. */
  needsNow: boolean;
  /** Drifting, At risk or Lapsed today (the Journey's MIA). */
  slipping: boolean;
}

export interface AheadJourney {
  journey: ClientJourney;
  /** What the Journey knows of the bookings: only "none" lets May slip be said. */
  nextState: "booked" | "none" | "unknown";
}

export interface AheadInput {
  clients: readonly Client[];
  studioId: string;
  today: string;
  /** The last day drawn. */
  until: string;
  settings: RenewalSettings;
  /** The lane rule's context: the leaders' inactive marks and the studio's Inactive line. */
  laneCtx: RenewalLaneContext;
  /** The conversations and plans read so far, by cycle key. */
  cycles: Readonly<Record<string, RenewalCycle>>;
  /** The conversations have answered (none failed, none still loading): "nobody has talked" may be said. */
  cyclesKnown: boolean;
  /** The Journey's states by client; null until they are ready (May slip waits for them). */
  journeys: ReadonlyMap<string, AheadJourney> | null;
  breakDays: number;
  lines: JourneyLines;
  /** The studio's Journey cutover, for anniversaries (Month's rule). */
  cutover: string | null;
  tz?: string;
}

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

const nameOf = (c: Client) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Unnamed client";
const weeksWords = (n: number) => `${n} week${n === 1 ? "" : "s"}`;
const weeksBetween = (a: string, b: string) => Math.max(1, Math.round(daysBetween(a, b) / 7));
const trimDot = (s: string) => s.replace(/\.$/, "");

function rangeWords(range: { earliest: string; latest: string } | null, today: string): string {
  if (!range || range.earliest === range.latest) return "";
  return `${dayLabel(range.earliest, today)} – ${dayLabel(range.latest, today)}`;
}

/** The studio's shortest package, by its commitment: the Trial at Max Strength. */
export function shortestTier(packages: readonly PackageTier[]): PackageTier | null {
  return packages.length ? [...packages].sort((a, b) => a.months - b.months)[0] : null;
}

/* ------------------------------------------------------------------ *
 * One client
 * ------------------------------------------------------------------ */

function renewalEvents(
  c: Client,
  s: RenewalSnapshot,
  cycle: RenewalCycle | null,
  i: AheadInput,
): AheadEvent[] {
  const id = c.id as string;
  const out: AheadEvent[] = [];
  const add = (kind: AheadKind, day: string, e: Partial<AheadEvent> & Pick<AheadEvent, "sentence" | "proof">) => {
    if (day < i.today || day > i.until) return;
    out.push({ key: `${id}:${kind}:${day}`, clientId: id, kind, day, now: false, range: null, pair: null, ...e });
  };
  // A renewal already signed, or recorded, is done: nothing ahead to decide.
  const outcome = cycle?.outcome ?? null;
  if (s.renewalOnBooks || outcome === "renewed" || outcome === "upgraded" || outcome === "downgraded") return out;
  if (s.situation === "lapsed" || s.situation === "unknown" || s.situation === "away") return out;
  const inactive = inactiveOnRecord(c, s, i.laneCtx.inactiveMarks.get(id) ?? null, i.today, i.laneCtx.inactiveDays);
  if (inactive) return out;

  const lane = renewalLane(c, cycle, i.laneCtx);
  const talked = lastTalkOf(cycle);
  const talkWords = talked
    ? `talked ${dayLabel(talked.day, i.today)}${talked.byName ? `, ${talked.byName.split(/\s+/)[0]}` : ""}`
    : i.cyclesKnown
      ? "nobody has talked yet"
      : null;
  // The plan's short label (at most 15 characters, the picker's own), never its whole sentence on a row.
  const plan = cycle?.plan && PLAN_LABELS[cycle.plan.choice] ? PLAN_LABELS[cycle.plan.choice] : null;
  const decided = effectiveStage(cycle) === "decided";
  const pace = s.pacePerWeek;
  const left = s.sessionsLeft;
  const asOf = s.ledger?.asOf ?? null;
  const counted = asOf ? ` (Mindbody's count, ${dayLabel(asOf, i.today)})` : "";

  /* ---- The talk ---- */
  if (lane === "talk-now") {
    const sentence =
      s.situation === "ended"
        ? `Package ended ${dayLabel(s.focusDate, i.today)}, no new one in Mindbody yet`
        : `${left ?? "?"} left${talkWords ? ` · ${talkWords}` : ""}`;
    add("talk-now", i.today, {
      now: true,
      sentence,
      proof:
        s.situation === "ended"
          ? "The package has ended and Mindbody shows no new one. Talk now lasts until it does, or the studio's lost rule makes it a win-back."
          : `${left} left${counted}, at or under the studio's number, ${i.settings.conversationAtSessionsLeft}. The Wrap-up asks the trainer when it's time.`,
    });
  } else if (s.situation !== "ended" && !decided) {
    const due = conversationDueRange(s, i.settings, i.today);
    if (due && pace !== null) {
      const r = due.earliest !== due.latest ? { earliest: due.earliest, latest: due.latest } : null;
      add("talk", due.on, {
        range: r,
        sentence: `Reaches ${i.settings.conversationAtSessionsLeft} left · ${left} now, about ${paceLabel(pace)} a week`,
        proof: `${left} left${counted} at about ${paceLabel(pace)} a week reaches ${i.settings.conversationAtSessionsLeft}${
          r ? ` between ${rangeWords(r, i.today)}, at the slowest and fastest 4 weeks` : ` around ${dayLabel(due.on, i.today)}`
        }.`,
      });
    }
  }

  /* ---- The charge, and the commitment's end ---- */
  const end = s.commitmentEnd ?? (s.paymentMode === "monthly" ? s.chargeDate : null);
  const atEnd = s.projection?.leftAtEnd ?? s.bankedAtCharge ?? null;
  const low = s.projection?.leftAtEndLow ?? atEnd;
  const high = s.projection?.leftAtEndHigh ?? atEnd;
  const spread = atEnd !== null && low !== null && high !== null && low !== high ? ` (${low}–${high})` : "";
  const bills = s.paymentMode === "monthly" && s.autoRenews !== false && !lockSaysNothingBills(c.contractTierOverride);
  const banks = s.situation === "will-bank" && bills && s.chargeDate !== null;
  if (banks && s.chargeDate) {
    const opens = addDays(s.chargeDate, -i.settings.chargeWarnDays);
    const planWords = plan ? ` · plan: ${plan}` : "";
    const sentence = `Auto-renews ${dayLabel(s.chargeDate, i.today)} with about ${s.bankedAtCharge} banked${spread}${planWords}`;
    const proof = `${s.sessionsLeft} left${counted}, used at about ${paceLabel(pace)} a week, leaves about ${s.bankedAtCharge}${spread} when the contract auto-renews ${dayLabel(
      s.chargeDate,
      i.today,
    )}. The studio warns ${i.settings.chargeWarnDays} days before a charge with ${i.settings.chargeWarnMinBanked} or more banked.`;
    if (lane === "before-charge") add("charge-window", i.today, { now: true, sentence, proof });
    else add("charge-window", opens, { sentence, proof });
    add("charge", s.chargeDate, {
      // "No plan yet" only off conversations that answered: never over one not yet seen.
      sentence: `Charges with about ${s.bankedAtCharge} banked${plan ? ` · plan: ${plan}` : i.cyclesKnown ? " · no plan yet" : ""}`,
      proof,
    });
  } else if (end) {
    const estimated = s.commitmentEndSource === "estimate" || (s.paymentMode === "monthly" && s.chargeDateSource === "estimate");
    const around = estimated ? "around " : "";
    const leftWords =
      atEnd === null ? null : atEnd === 0 ? "sessions used up about then" : `about ${atEnd} left${spread}`;
    if (s.paymentMode === "prepaid") {
      add("ends", end, {
        sentence: `Paid in full · ends ${around}${dayLabel(end, i.today)}${leftWords ? ` · ${leftWords}` : ""}`,
        proof: "Paid in full, so nothing bills. The end is the package's start plus its length, estimated.",
      });
    } else if (s.paymentMode === "monthly" && s.autoRenews === true && bills) {
      add("renews", end, {
        sentence: atEnd === 0 ? "Sessions used up about when it renews" : leftWords ? `${leftWords[0].toUpperCase()}${leftWords.slice(1)} when it renews` : "Auto-renews",
        proof: `The contract auto-renews ${around}${dayLabel(end, i.today)}${leftWords ? `, with ${leftWords} at the client's pace` : ""}.`,
      });
    } else if (s.paymentMode === "monthly" && lockSaysNothingBills(c.contractTierOverride)) {
      // A coach's mark on the profile says paid in full or banked sessions: nothing bills, whatever the contract says.
      add("ends", end, {
        sentence: `Commitment ends ${around}${dayLabel(end, i.today)} · nothing bills${leftWords ? ` · ${leftWords}` : ""}`,
        proof: "A coach marked this client paid in full or using banked sessions on the profile, so nothing is charged when the commitment ends; the sessions carry on.",
      });
    } else if (s.paymentMode === "monthly") {
      add("billing-ends", end, {
        sentence:
          s.autoRenews === false
            ? `Billing ends${leftWords ? ` · ${leftWords}, which carry over` : ""}`
            : `Payments finish${leftWords ? ` · ${leftWords}` : ""}`,
        proof:
          s.autoRenews === false
            ? "The contract doesn't auto-renew: the sessions still carry over, and nothing is charged on top of them."
            : "Nothing has answered whether the contract renews by itself (Mindbody, a mark on the profile, the package or the studio).",
      });
    }
  }

  /* ---- Running out early ---- */
  const runOut = s.projection?.runOutDate ?? (s.paymentMode === "sessions-only" ? s.runOutDate : null);
  if (runOut && pace !== null) {
    const range = s.runOutRange && s.runOutRange.earliest !== s.runOutRange.latest ? s.runOutRange : null;
    if (end && s.projection?.runOutDate && daysBetween(runOut, end) >= RUN_OUT_MARGIN_DAYS) {
      const verb = s.paymentMode === "monthly" && s.autoRenews === true ? "renews" : "ends";
      add("runs-out", runOut, {
        range,
        sentence: `Out of sessions around ${dayLabel(runOut, i.today)} · ${weeksWords(weeksBetween(runOut, end))} before it ${verb}`,
        proof: `${left} left${counted} at about ${paceLabel(pace)} a week run out${range ? ` between ${rangeWords(range, i.today)}` : ` around ${dayLabel(runOut, i.today)}`}. The commitment ${verb} ${dayLabel(end, i.today)}.`,
      });
    } else if (s.paymentMode === "sessions-only") {
      add("runs-out", runOut, {
        range,
        sentence: `Out of sessions around ${dayLabel(runOut, i.today)} · nothing running after them`,
        proof: `${left} banked sessions${counted}, no contract running, at about ${paceLabel(pace)} a week.`,
      });
    }
  }
  return out;
}

function slipEvent(c: Client, j: AheadJourney | undefined, i: AheadInput): AheadEvent | null {
  if (!j || j.nextState !== "none") return null;
  const state = j.journey.state;
  // Too new to judge still crosses At risk with nothing booked (journeyOf tests the lines before the stage); any other Unknown can't be judged.
  if (state === "away" || state === "inactive" || state === "back") return null;
  if (state === "unknown" && j.journey.unknownWhy !== "too-new") return null;
  const lastVisit = j.journey.lastVisit;
  const horizon = addDays(i.today, BOOKING_LOOKAHEAD_DAYS);
  const next = nextLineCrossing({
    lastVisit,
    today: i.today,
    until: horizon < i.until ? horizon : i.until,
    driftDays: j.journey.driftDays,
    breakDays: i.breakDays,
    lines: i.lines,
  });
  if (!next || !lastVisit) return null;
  const id = c.id as string;
  return {
    key: `${id}:may-slip:${next.day}`,
    clientId: id,
    kind: "may-slip",
    day: next.day,
    now: false,
    range: null,
    pair: null,
    line: next.line,
    sentence: `Turns ${STATE_NAMES[next.line]} if nothing is booked · last came ${dayLabel(lastVisit, i.today)}`,
    proof: `Last visit ${dayLabel(lastVisit, i.today)}, nothing booked as far as Journey can see (to ${dayLabel(horizon, i.today)}). The studio's lines: Drifting at ${
      j.journey.driftDays !== null ? `${j.journey.driftDays} days for this client` : "no usual gap measured yet"
    }, At risk at ${i.breakDays}, Lapsed at ${i.lines.lapsedDays}. A booking takes this away.`,
  };
}

function backEvent(c: Client, s: RenewalSnapshot | null, i: AheadInput): AheadEvent | null {
  if (!s || s.situation !== "away" || !s.awayUntil || s.awayUntil < i.today || s.awayUntil > i.until) return null;
  const id = c.id as string;
  const reason = (s.awayReason ?? "Away").toLowerCase();
  return {
    key: `${id}:back:${s.awayUntil}`,
    clientId: id,
    kind: "back",
    day: s.awayUntil,
    now: false,
    range: null,
    pair: null,
    sentence: `Back from ${reason === "away" ? "time away" : reason} around ${dayLabel(s.awayUntil, i.today)}`,
    proof: `Mindbody's away event: ${s.awayReason ?? "Away"} until ${dayLabel(s.awayUntil, i.today)}. Both clocks are paused while away.`,
  };
}

/** Why a client's dates can't be placed, or null when they can. */
export function cantPlaceWhy(s: RenewalSnapshot | null): string | null {
  if (!s) return "No nightly record for this client yet.";
  if (s.situation === "unknown") return s.dataGaps[0] ?? "Not enough Mindbody data to place the dates.";
  return null;
}

/* ------------------------------------------------------------------ *
 * The studio
 * ------------------------------------------------------------------ */

/** Every month the weeks drawn touch, as `YYYY-MM`. */
export function monthsBetween(from: string, until: string): string[] {
  const out: string[] = [];
  for (let m = monthOf(from); m <= monthOf(until); m = shiftMonth(m, 1)) out.push(m);
  return out;
}

function momentEvents(home: readonly Client[], i: AheadInput): AheadEvent[] {
  const rows: Array<MonthRow & { kind: "birthday" | "anniversary" }> = [];
  for (const month of monthsBetween(i.today, i.until)) {
    rows.push(...monthBirthdays(home, month).rows.map((r) => ({ ...r, kind: "birthday" as const })));
    rows.push(...monthAnniversaries(home, month, i.cutover, i.tz).rows.map((r) => ({ ...r, kind: "anniversary" as const })));
  }
  return rows
    .filter((r) => r.day >= i.today && r.day <= i.until)
    .map((r) => ({
      key: `${r.clientId}:${r.kind}:${r.day}`,
      clientId: r.clientId,
      kind: r.kind,
      day: r.day,
      now: false,
      range: null,
      pair: null,
      sentence: r.kind === "birthday" ? trimDot(r.sentence === "A decade birthday." ? r.badge : r.sentence) : trimDot(r.sentence),
      proof: r.proof || (r.kind === "birthday" ? "From the date of birth on file." : ""),
      notConfirmed: r.kind === "anniversary" && r.badge === "Not confirmed",
    }));
}

function pairWords(m: AheadEvent, today: string): string {
  return m.kind === "anniversary"
    ? `${m.sentence.replace(/ with the studio$/, "")} on ${dayLabel(m.day, today)}${m.notConfirmed ? " (not confirmed)" : ""}`
    : `${m.sentence.toLowerCase()} on ${dayLabel(m.day, today)}`;
}

export const sortEvents = (a: AheadEvent, b: AheadEvent): number =>
  a.day.localeCompare(b.day) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.key.localeCompare(b.key);

/**
 * The studio's own clients, each with their events from today to `until`.
 * Visitors booked here are their own studio's; an inactive client keeps
 * only their moments (Month lists those for everyone).
 */
export function aheadClients(i: AheadInput): AheadClient[] {
  const home = i.clients.filter((c) => c.id && c.homeStudioId === i.studioId && c.isActive !== false);
  const moments = new Map<string, AheadEvent[]>();
  for (const e of momentEvents(home, i)) {
    const list = moments.get(e.clientId) ?? [];
    list.push(e);
    moments.set(e.clientId, list);
  }
  const trial = shortestTier(i.settings.packages);
  const out: AheadClient[] = [];
  for (const c of home) {
    const id = c.id as string;
    const s = homeRecord(c, i.studioId);
    const cycle = s?.cycleKey ? i.cycles[s.cycleKey] ?? null : null;
    const j = i.journeys?.get(id);
    const cantPlace = cantPlaceWhy(s);
    const events: AheadEvent[] = [];
    if (s && !cantPlace) events.push(...renewalEvents(c, s, cycle, i));
    const back = backEvent(c, s, i);
    if (back) events.push(back);
    const slip = slipEvent(c, j, i);
    if (slip) events.push(slip);
    const mine = moments.get(id) ?? [];
    // A talk with a birthday or anniversary close by says it: a way to open the conversation.
    for (const e of events) {
      if (e.kind !== "talk" && e.kind !== "talk-now") continue;
      const m = mine.find((x) => Math.abs(daysBetween(e.day, x.day)) <= PAIR_DAYS);
      if (m) e.pair = pairWords(m, i.today);
    }
    events.push(...mine);
    events.sort(sortEvents);
    const decide = events.filter((e) => KIND_GROUP[e.kind] !== "moment");
    const slipping = Boolean(j && (j.journey.state === "drifting" || j.journey.state === "at-risk" || j.journey.state === "lapsed"));
    out.push({
      id,
      name: nameOf(c),
      client: c,
      snapshot: s,
      cycle,
      journey: j?.journey ?? null,
      trainerId: s?.primaryTrainerId ?? null,
      onTrial: Boolean(trial && s?.packageKey && s.packageKey === trial.key && i.settings.packages.length > 1),
      events,
      cantPlace,
      noPace: Boolean(s && !cantPlace && s.pacePerWeek === null && s.situation !== "away" && s.situation !== "lapsed"),
      firstDay: decide.length ? decide[0].day : null,
      needsNow:
        decide.some((e) => e.now || (e.kind === "may-slip" && daysBetween(i.today, e.day) <= SLIP_SOON_DAYS)) || slipping,
      slipping,
    });
  }
  return out;
}

/** Every event of these clients, in order. */
export function eventsOf(clients: readonly AheadClient[]): AheadEvent[] {
  return clients.flatMap((c) => c.events).sort(sortEvents);
}
