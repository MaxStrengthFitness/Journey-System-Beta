/**
 * OPERATIONS → RENEWALS — who is running low on sessions. Pure:
 * running-low.test.ts.
 *
 * AJ, Oct 6 2026: "We already have a way to see how many clients are coming
 * up to their renewal date. But we need a way for operations to show how
 * many clients are running out of their sessions. Like anyone that has ten
 * sessions remaining. In total." His three answers the same day, each the
 * recommended one: a count at the top of Clients → Renewals with the list
 * behind it; the studio's own number (the renewal conversation's,
 * `conversationAtSessionsLeft`: 10 unless the studio changed it on My Studio
 * → Studio → Renewals); and a client whose next package is already signed is
 * left out.
 *
 * A package runs on two clocks (renewals/README.md). The pipeline's lanes and
 * Month read the DATE clock (when the package effectively ends); this reads
 * the SESSION clock, whether or not anyone has talked to the client yet.
 * "Talk now" is still the to-do list; this is the fact beside it.
 *
 * IN TOTAL is the nightly record's `sessionsLeft`: the sessions on hand (given
 * sessions included) plus those still to come from payments not yet made. So
 * a client paying monthly with 4 on hand and 6 payments to go is not running
 * low; one on the last payment with 8 on hand is. It is Mindbody's number as
 * of its last pull, never the job's count-down (renewals/README.md).
 *
 * WHO IS LEFT OUT: a visitor from another studio (the pipeline is the home
 * studio's); an inactive client (Mindbody's flag, a leader's mark that still
 * holds, or past the studio's Inactive line with nothing booked: the Client
 * Directory's rule, read off the nightly record); a client whose next package
 * is already signed in Mindbody, or whose renewal a leader recorded; and a
 * package that has ended or lapsed (the pipeline's Talk now and Lapsed say
 * those). Away clients stay in, marked Away.
 *
 * NOT KNOWN: no nightly record, or one without a total (not enough Mindbody
 * data). Counted, never dropped and never called fine.
 */

import { daysBetween } from "../../client-history/model";
import { clientDisplayName } from "../../../lib/client-name";
import { markHolds, pastInactiveLine, type InactiveMark } from "../journey/inactive";
import { dayLabel } from "../../renewals/sentences";
import type { RenewalCycle, RenewalSettings, RenewalSnapshot } from "../../renewals/types";
import type { Client } from "../../../types";

export interface RunningLowRow {
  clientId: string;
  name: string;
  snapshot: RenewalSnapshot;
  cycle: RenewalCycle | null;
  /** Sessions left in total: the snapshot's `sessionsLeft`. */
  left: number;
}

export interface RunningLow {
  /** Fewest left first, then the soonest to run out, then by name. */
  rows: RunningLowRow[];
  /** Home-studio clients, active, whose total isn't known: no record, or one without a total. */
  notKnown: number;
}

export interface RunningLowInput {
  clients: readonly Client[];
  studioId: string;
  cycles: Readonly<Record<string, RenewalCycle>>;
  settings: Pick<RenewalSettings, "conversationAtSessionsLeft">;
  today: string;
  inactiveMarks: ReadonlyMap<string, Pick<InactiveMark, "day">>;
  inactiveDays: number;
}

/** The number a client is running low at: the studio's renewal conversation number. */
export function runningLowAt(settings: Pick<RenewalSettings, "conversationAtSessionsLeft">): number {
  return settings.conversationAtSessionsLeft;
}

/**
 * Inactive, judged off the nightly record (the Client Directory judges the
 * same rule off its live rows, `client-directory/views.ts` inactiveHow).
 * Booked ahead is never inactive.
 */
export function inactiveOnRecord(
  client: Pick<Client, "isActive">,
  s: Pick<RenewalSnapshot, "situation" | "lastVisitDate" | "nextBookingDate"> | null | undefined,
  mark: Pick<InactiveMark, "day"> | null | undefined,
  today: string,
  inactiveDays: number,
): boolean {
  if (client.isActive === false) return true;
  const booked = Boolean(s?.nextBookingDate && s.nextBookingDate >= today);
  if (booked) return false;
  const lastVisit = s?.lastVisitDate ?? null;
  if (mark && markHolds(mark, lastVisit)) return true;
  if (!s || s.situation === "away" || !lastVisit) return false;
  return pastInactiveLine(daysBetween(lastVisit, today), true, inactiveDays);
}

const RENEWED = new Set(["renewed", "upgraded", "downgraded"]);

export function runningLow(input: RunningLowInput): RunningLow {
  const { clients, studioId, cycles, settings, today, inactiveMarks, inactiveDays } = input;
  const at = runningLowAt(settings);
  const rows: RunningLowRow[] = [];
  let notKnown = 0;
  for (const c of clients) {
    if (!c.id || c.homeStudioId !== studioId) continue;
    const s = (c.renewal as RenewalSnapshot | undefined) ?? null;
    if (inactiveOnRecord(c, s, inactiveMarks.get(c.id) ?? null, today, inactiveDays)) continue;
    if (s && (s.situation === "ended" || s.situation === "lapsed")) continue;
    if (!s || s.sessionsLeft == null) {
      notKnown += 1;
      continue;
    }
    if (s.sessionsLeft > at) continue;
    if (s.renewalOnBooks) continue;
    const cycle = s.cycleKey ? (cycles[s.cycleKey] ?? null) : null;
    if (cycle?.outcome && RENEWED.has(cycle.outcome)) continue;
    rows.push({ clientId: c.id, name: clientDisplayName(c, "A client"), snapshot: s, cycle, left: Math.max(0, s.sessionsLeft) });
  }
  rows.sort(
    (a, b) =>
      a.left - b.left ||
      (a.snapshot.runOutDate ?? "9999-99-99").localeCompare(b.snapshot.runOutDate ?? "9999-99-99") ||
      a.name.localeCompare(b.name),
  );
  return { rows, notKnown };
}

/**
 * The row's line: "6 left · runs out around Oct 14". With a payment still to
 * come it says what the total is made of, so it never seems to disagree with
 * the "on hand" the profile and the Directory show: "11 left in total: 3 on
 * hand, 8 still to come".
 */
export function leftLine(
  s: Pick<RenewalSnapshot, "sessionsLeft" | "sessionsLeftSource" | "sessionsOnHand" | "paymentsLeft" | "runOutDate">,
  today: string,
): string {
  const left = Math.max(0, s.sessionsLeft ?? 0);
  const est = s.sessionsLeftSource === "estimate" ? " (estimated)" : "";
  let count: string;
  if (left === 0) count = `None left${est}`;
  else if ((s.paymentsLeft ?? 0) > 0 && s.sessionsOnHand !== null && s.sessionsOnHand < left) {
    count = `${left} left in total${est}: ${s.sessionsOnHand} on hand, ${left - s.sessionsOnHand} still to come`;
  } else count = `${left} left${est}`;
  const when = left > 0 && s.runOutDate ? `runs out around ${dayLabel(s.runOutDate, today)}` : null;
  return [count, when].filter(Boolean).join(" · ");
}

/** The tile's foot: "10 or fewer left, in total". */
export function runningLowFoot(settings: Pick<RenewalSettings, "conversationAtSessionsLeft">): string {
  return `${runningLowAt(settings)} or fewer left, in total`;
}

/** The one line under the list when some totals aren't known. Null when every total is. */
export function notKnownLine(notKnown: number): string | null {
  if (notKnown <= 0) return null;
  return `Not counted: ${notKnown} ${notKnown === 1 ? "client whose" : "clients whose"} sessions left aren't known yet.`;
}
