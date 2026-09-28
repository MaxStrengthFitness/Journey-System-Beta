/**
 * MY PROFILE → MY CLIENTS — the pure half (Openings round, phase 12, Sep 27
 * 2026).
 *
 * AJ: "it almost should show you like your top trained clients but then also
 * you should be able to have like your Kaizen list ... in my off time ... I
 * can go see my most trained clients or people that I've tracked on my
 * Kaizen list." The Kaizen Roster keeps its job (the clients you chose to
 * track, shared with the team); this is the other half — the clients you
 * have actually trained, for you alone.
 *
 * NO NEW READ
 * -----------
 * Everything comes off the studio's client list the app already streams
 * (`useStudioRoster`):
 *
 *   - `trainerTally` — sessions per trainer, kept as each session completes
 *     (lib/client-rollups.ts). "Sessions with you" is the tally under your
 *     ids (`myTrainerIds`: the trainer document's id, the sign-in uid, and a
 *     claimed placeholder's, because older accounts' sessions carry another).
 *     Imported sessions tallied only under initials are not yours to claim.
 *   - `renewal.coachIds` — the nightly renewal snapshot's "coached in the
 *     last 60 days", the list Relay → Mine already reads.
 *
 * Only clients whose HOME is this studio: the list also carries booked
 * visitors from elsewhere, and their tally is their home studio's story.
 * Clients marked inactive are left out, as Relay → Mine leaves them out.
 *
 * ORDER
 * -----
 * Coached lately first (most sessions with you, then by name), then everyone
 * else you have trained (the same order). MY_CLIENTS_SHOWN before "Show all".
 *
 * THE PAST, IN JOURNEY'S WORDS
 * ----------------------------
 * Every count here is Journey's: "42 sessions with you in Journey", never
 * "all time", and there is no "since" date. The last session is worded
 * through lib/history-claims.ts: "Last session: Sep 25" is a claim that no
 * session came after it, so it is made only where Journey owns the days
 * after it (`canClaimGap` over `ownedWindow`, judged by the client's HOME
 * studio's cutover). Anywhere else it reads "Last in Journey: Sep 25".
 * Either way it is HER last session, with any trainer (`lastSessionDate`
 * is the client's, not yours), so it says so: "Last in Journey, with any
 * trainer: Sep 25". Beside "42 sessions with you" a bare date read as your
 * last session with her (the final review; on AJ's screen-audit list).
 *
 * PURE MODULE — no React, no Firestore, no clock.
 */
import type { Client } from "../../types";
import { clientDisplayName } from "../../lib/client-name";
import { coverageOfClient } from "../../lib/client-coverage";
import { canClaimGap, dayAfter, ownedWindow } from "../../lib/history-claims";
import { priorHistoryOf } from "../../lib/prior-history";
import { tallyFieldKey } from "../../lib/client-rollups";
import { SHORT_MONTHS } from "../admin/hours/hours";

/** How many rows show before "Show all". AJ's to change. */
export const MY_CLIENTS_SHOWN = 12;

export interface MyClientRow {
  clientId: string;
  name: string;
  /** Sessions with you on record in Journey. */
  sessions: number;
  /** In the nightly snapshot's coached-in-the-last-60-days list. */
  coachedLately: boolean;
  /** On your Kaizen Roster. */
  onRoster: boolean;
  /** "Last in Journey, with any trainer: Sep 25" / "Last session, with any trainer: Sep 25", or null with no date. */
  last: string | null;
}

/** The client's home, read the way the rules read it: `homeStudioId`, else the older `studioId`. */
function homeOf(c: Client): string | null {
  return c.homeStudioId || (c as { studioId?: string | null }).studioId || null;
}

/** Sessions with you in the client's tally, under any of your ids. */
export function sessionsWithYou(c: Pick<Client, "trainerTally">, ids: readonly string[]): number {
  const tally = c.trainerTally;
  if (!tally) return 0;
  const keys = new Set(ids.filter(Boolean).map(tallyFieldKey));
  let n = 0;
  for (const key of keys) {
    const v = Number(tally[key]);
    if (Number.isFinite(v) && v > 0) n += v;
  }
  return n;
}

/** In the nightly renewal snapshot's coached-in-the-last-60-days list, under any of your ids. */
export function coachedLately(c: Client, ids: readonly string[]): boolean {
  const coachIds = (c as { renewal?: { coachIds?: unknown } }).renewal?.coachIds;
  if (!Array.isArray(coachIds)) return false;
  return ids.some((id) => id && coachIds.includes(id));
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** "Sep 25", or "Sep 25, 2025" in another year than today's. */
export function shortDate(day: string, today: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const label = `${SHORT_MONTHS[m - 1] ?? ""} ${d}`;
  return day.slice(0, 4) === today.slice(0, 4) ? label : `${label}, ${y}`;
}

/**
 * The client's last session, with any trainer, as a sentence, or null when
 * no usable date is on file. `lastSessionDate` is the day stamped as a
 * session completes; a date after today is a typo, not a visit, and is not
 * quoted.
 */
export function lastSessionSentence(
  c: Pick<Client, "lastSessionDate" | "priorHistory" | "historyIsComplete" | "firstSessionDate" | "clientsNumberOfVisitsAtSite">,
  cutover: string | null,
  today: string,
): string | null {
  const raw = typeof c.lastSessionDate === "string" ? DAY.exec(c.lastSessionDate.trim()) : null;
  if (!raw) return null;
  const day = `${raw[1]}-${raw[2]}-${raw[3]}`;
  if (day > today) return null;
  const window = ownedWindow({ coverage: coverageOfClient(c, cutover), prior: priorHistoryOf(c), cutover });
  const after = dayAfter(day);
  const claimable = after !== null && canClaimGap(after, window);
  return `${claimable ? "Last session" : "Last in Journey"}, with any trainer: ${shortDate(day, today)}`;
}

/** "42 sessions with you in Journey". */
export function sessionsWithYouSentence(n: number): string {
  if (!(n > 0)) return "No sessions with you on record in Journey";
  return `${n} session${n === 1 ? "" : "s"} with you in Journey`;
}

export function myClientRows(
  clients: readonly Client[],
  opts: {
    studioId: string;
    /** `myTrainerIds(trainer, uid)`. */
    ids: readonly string[];
    /** Client ids on your Kaizen Roster. */
    rosterIds: ReadonlySet<string>;
    /** This studio's `journeyCutoverDate`: every client listed is at home here. */
    cutover: string | null;
    today: string;
  },
): MyClientRow[] {
  const rows: MyClientRow[] = [];
  const seen = new Set<string>();
  for (const c of clients) {
    if (!c.id || seen.has(c.id)) continue;
    if (c.isActive === false) continue;
    if (homeOf(c) !== opts.studioId) continue;
    const sessions = sessionsWithYou(c, opts.ids);
    const lately = coachedLately(c, opts.ids);
    if (sessions <= 0 && !lately) continue;
    seen.add(c.id);
    rows.push({
      clientId: c.id,
      name: clientDisplayName(c),
      sessions,
      coachedLately: lately,
      onRoster: opts.rosterIds.has(c.id),
      last: lastSessionSentence(c, opts.cutover, opts.today),
    });
  }
  return rows.sort(
    (a, b) =>
      Number(b.coachedLately) - Number(a.coachedLately) ||
      b.sessions - a.sessions ||
      a.name.localeCompare(b.name),
  );
}

/** What the card counts, always on it. */
export const WHAT_MY_CLIENTS_COUNTS =
  "Sessions with you on record in Journey. Past sessions logged by hand count; imported sessions count only where the import linked them to you. Clients whose home is another studio aren't listed, nor are clients marked inactive.";

/**
 * While the studio has no cutover date, or it has not come yet: a cutover set
 * ahead of time is a studio still on FileMaker, as the renewals job reads it.
 * Null from the cutover day on.
 */
export function myClientsCutoverLine(studioName: string, cutover: string | null | undefined, today: string): string | null {
  const day = typeof cutover === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cutover) ? cutover : null;
  if (day && day <= today) return null;
  return `${studioName} is still moving off FileMaker, so older sessions may be missing.`;
}

/** While the client list is loading, has failed, or isn't known to be read — never an empty list. */
export const CANT_READ_CLIENTS = "Can't read the client list just now.";

/** The server answered and nobody at the studio has sessions with you. */
export function noClientsSentence(studioName: string): string {
  return `No clients at ${studioName} have sessions with you on record in Journey yet.`;
}
