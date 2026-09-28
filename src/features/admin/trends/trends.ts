/**
 * TRENDS — the quarter's lines, each with the least it needs before it says
 * anything. Pure: trends.test.ts (TZ=America/New_York).
 *
 * The redesign's Operations room, phase 5 (Sep 28 2026; research-operations
 * §5.1 "This month and quarter" and §5.3 "Why these minimums"). "Sentences,
 * not scores": every line is a sentence, and below its named minimum it says
 * so instead of a number that would swing.
 *
 *   renewal outcomes    counts always; a rate from RATE_MIN renewal points
 *   a longer package    compared with last quarter only when both have
 *                       RATE_MIN renewals
 *   start groups        clients who started in each of the last three full
 *                       months (a date Mindbody proves, never the day Journey
 *                       met her), and how many are still training; a share
 *                       from RATE_MIN
 *   studio rhythm       the average pace of clients with a measured rhythm,
 *                       from STUDIO_AVERAGE_MIN of them
 *   lost reasons        what the lost said they were on the fence about, from
 *                       LOST_REASONS_MIN lost
 *   win-back results    NOT YET: needs the case outcomes Journey doesn't store
 *   the signal check    NOT YET: needs states stored for 90 days (the nightly
 *                       job writing them waits for AJ's OK)
 */
import { resolveClientSince } from "../../../lib/client-since";
import { studioDateKey } from "../../../lib/studio-time";
import { addDays } from "../../client-history/model";
import { concernLabel } from "../../renewals/conversation";
import type { OutcomeRow, OutcomeTally } from "../../renewals/rates";
import type { RenewalConcern } from "../../renewals/types";
import type { JourneyEntry } from "../journey/journey-list";
import { LAPSED_DAYS } from "../journey/states";

/** A rate (or a share) appears from this many. */
export const RATE_MIN = 10;
/** A studio average needs this many clients behind it. */
export const STUDIO_AVERAGE_MIN = 30;
/** A breakdown of lost reasons needs this many lost. */
export const LOST_REASONS_MIN = 5;
/** The signal check needs this many clients flagged 90+ days ago. */
export const SIGNAL_CHECK_MIN = 20;

export interface TrendLine {
  id: string;
  title: string;
  /** The sentence. */
  say: string;
  /** The least it needs, and how far there is to go. */
  min: string;
  /** The minimum is met: the line says a rate or an average, not only counts. */
  ready: boolean;
}

const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function renewalOutcomesLine(t: OutcomeTally | null, quarter: string): TrendLine {
  const base = { id: "renewals", title: "Renewal outcomes" };
  if (!t) return { ...base, say: `This quarter's renewal outcomes (${quarter}) couldn't be read just now.`, min: `A rate appears from ${RATE_MIN} renewal points.`, ready: false };
  if (t.total === 0) return { ...base, say: `No renewal points have closed this quarter (${quarter}) yet.`, min: `A rate appears from ${RATE_MIN} renewal points. There are none.`, ready: false };
  const parts = [`${t.renewed} renewed`, `${t.upgraded} on a longer package`, `${t.downgraded} on a shorter one`, `${t.payAsYouGo} pay-as-you-go`, `${t.lost} lost`].join(", ");
  if (t.total < RATE_MIN) {
    return { ...base, say: `${plural(t.total, "renewal point", "renewal points")} closed this quarter: ${parts}.`, min: `A rate appears from ${RATE_MIN} renewal points. There ${t.total === 1 ? "is" : "are"} ${t.total}.`, ready: false };
  }
  return { ...base, say: `Of ${t.total} renewal points this quarter, ${t.kept} were kept (${pct(t.kept, t.total)}): ${parts}.`, min: `A rate appears from ${RATE_MIN} renewal points. There are ${t.total}.`, ready: true };
}

export function longerPackageLine(thisQ: OutcomeTally | null, lastQ: OutcomeTally | null): TrendLine {
  const base = { id: "longer", title: "A longer package" };
  if (!thisQ || !lastQ) return { ...base, say: "The quarters' renewals couldn't be read just now.", min: `Compared only when both quarters have ${RATE_MIN} renewals.`, ready: false };
  const renewals = (t: OutcomeTally) => t.renewed + t.upgraded + t.downgraded;
  const a = thisQ.upgraded;
  const b = renewals(thisQ);
  const c = lastQ.upgraded;
  const d = renewals(lastQ);
  if (b < RATE_MIN || d < RATE_MIN) {
    return { ...base, say: `${a} of ${plural(b, "renewal", "renewals")} this quarter moved to a longer package.`, min: `Compared with last quarter only when both have ${RATE_MIN} or more renewals: this quarter ${b}, last quarter ${d}.`, ready: false };
  }
  return { ...base, say: `${a} of ${b} renewals this quarter moved to a longer package (${pct(a, b)}); last quarter ${c} of ${d} (${pct(c, d)}).`, min: `Both quarters have ${RATE_MIN} or more renewals.`, ready: true };
}

export interface StartGroup {
  /** yyyy-mm. */
  month: string;
  label: string;
  members: number;
  stillTraining: number;
  /** Members whose last visit isn't known: neither training nor stopped. */
  unknown: number;
}

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The clients who started in each of the last three full months, by a date
 * Mindbody proves (lib/client-since, given her coverage: Journey's first
 * session counts only when Journey holds her whole story). Still training:
 * a visit inside the lapse line. A client whose last visit isn't known is
 * counted apart, never as stopped.
 */
export function startGroups(entries: readonly JourneyEntry[], today: string, tz?: string): StartGroup[] {
  const firstOfThisMonth = `${today.slice(0, 7)}-01`;
  const months: string[] = [];
  let cursor = firstOfThisMonth;
  for (let i = 0; i < 3; i += 1) {
    cursor = `${addDays(cursor, -1).slice(0, 7)}-01`;
    months.unshift(cursor.slice(0, 7));
  }
  const groups = new Map<string, StartGroup>(months.map((m) => [m, { month: m, label: MONTH[Number(m.slice(5, 7)) - 1], members: 0, stillTraining: 0, unknown: 0 }]));
  for (const e of entries) {
    const since = resolveClientSince(e.client, { coverage: e.row.coverage });
    if (!since || !since.fromMindbody) continue;
    const month = studioDateKey(since.date, tz)?.slice(0, 7);
    const g = month ? groups.get(month) : undefined;
    if (!g) continue;
    g.members += 1;
    const days = e.journey.daysSince;
    if (days === null) g.unknown += 1;
    else if (days < LAPSED_DAYS) g.stillTraining += 1;
  }
  return months.map((m) => groups.get(m) as StartGroup);
}

export function startGroupsLine(groups: readonly StartGroup[]): TrendLine {
  const said = groups
    .filter((g) => g.members > 0)
    .map((g) => {
      const known = g.members - g.unknown;
      const tail = g.unknown ? `, ${g.unknown} not known` : "";
      return g.members >= RATE_MIN && known > 0
        ? `Of the ${g.members} who started in ${g.label}, ${g.stillTraining} are still training (${pct(g.stillTraining, g.members)})${tail}.`
        : `${g.members} started in ${g.label}; ${g.stillTraining} still training${tail}.`;
    });
  return {
    id: "starts",
    title: "Start groups",
    say: said.length ? said.join(" ") : "Nobody started in the last three months by a date Mindbody can prove.",
    min: `A share appears from ${RATE_MIN} in a group; smaller groups show counts. Still training means a visit in the last ${LAPSED_DAYS} days.`,
    ready: groups.some((g) => g.members >= RATE_MIN),
  };
}

export function studioRhythmLine(entries: readonly JourneyEntry[]): TrendLine {
  const measured = entries.filter((e) => e.journey.rhythm);
  const base = { id: "rhythm", title: "Studio rhythm" };
  if (measured.length < STUDIO_AVERAGE_MIN) {
    return { ...base, say: `${plural(measured.length, "client has", "clients have")} a measured rhythm so far.`, min: `An average needs ${STUDIO_AVERAGE_MIN} clients with a measured rhythm. There ${measured.length === 1 ? "is" : "are"} ${measured.length}.`, ready: false };
  }
  const perWeek = measured.reduce((n, e) => n + 7 / (e.journey.rhythm as { gapDays: number }).gapDays, 0) / measured.length;
  return { ...base, say: `Clients with a measured rhythm average ${Math.round(perWeek * 10) / 10} sessions a week (${measured.length} clients).`, min: `An average needs ${STUDIO_AVERAGE_MIN} clients with a measured rhythm. There are ${measured.length}.`, ready: true };
}

export function lostReasonsLine(rows: readonly OutcomeRow[] | null): TrendLine {
  const base = { id: "lost", title: "Lost reasons" };
  if (!rows) return { ...base, say: "This quarter's outcomes couldn't be read just now.", min: `A breakdown needs ${LOST_REASONS_MIN} lost.`, ready: false };
  const lost = rows.filter((r) => r.outcome === "lost");
  if (lost.length < LOST_REASONS_MIN) {
    return { ...base, say: `${plural(lost.length, "client was", "clients were")} lost this quarter. That's fewer than ${LOST_REASONS_MIN}, so no breakdown by reason yet.`, min: "Reasons people give aren't always the whole story.", ready: false };
  }
  const counts = new Map<string, number>();
  for (const r of lost) {
    const concerns = (r.latestConcerns ?? []) as RenewalConcern[];
    if (concerns.length === 0) counts.set("no reason noted", (counts.get("no reason noted") ?? 0) + 1);
    for (const c of concerns) counts.set(concernLabel(c).toLowerCase(), (counts.get(concernLabel(c).toLowerCase()) ?? 0) + 1);
  }
  const said = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `${k} ${n}`).join(", ");
  return { ...base, say: `${lost.length} clients were lost this quarter. What they were on the fence about at their last conversation: ${said}.`, min: "Reasons people give aren't always the whole story.", ready: true };
}

export const WIN_BACK_LINE: TrendLine = {
  id: "winback",
  title: "Win-back results",
  say: "Not enough history yet. How many drifting clients booked again within three weeks needs each case's outcome, and Journey doesn't store case outcomes yet.",
  min: `A rate appears from ${RATE_MIN} cases, once the case fields are approved.`,
  ready: false,
};

export const SIGNAL_CHECK_LINE: TrendLine = {
  id: "signal",
  title: "The signal check",
  say: "Not enough history yet. This checks how often Drifting came before a lapse, so the rules earn trust; it needs each client's state stored day by day for 90 days, which waits on the nightly job.",
  min: `Needs ${SIGNAL_CHECK_MIN} clients flagged 90 or more days ago.`,
  ready: false,
};
