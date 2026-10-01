/**
 * The nightly renewals job. Render runs it through server/cron-renewals.ts;
 * scripts/run-renewals.ts runs the same code from the PC (dry run by default).
 *
 * Round: Renewals, Phase 4 (Sep 2026). See OPERATIONS-RENEWALS-PROPOSAL.md
 * §5.5. In three passes:
 *
 *   1. For every studio: read its renewal settings and its clients, and build
 *      each client's snapshot from what is already stored.
 *   1b. Master-Sync anyone booked today or tomorrow who has never been synced
 *      (the cost plan, Sep 26 2026, B5: "everyone else syncs the day they
 *      book"), inside its own nightly budget - lib/first-booking-sync.ts.
 *   2. Pull Mindbody (contracts + pricing options) for the clients who most
 *      need it, across all studios — a sale Mindbody told us about, near the
 *      end of a package on a day they train, never pulled, or a month stale
 *      (features/renewals/job-plan.ts) — inside a nightly budget, and rebuild
 *      those snapshots. Only at studios that have gone live (studioIsLive).
 *      A client the Journey calls Inactive (last night's state, or a leader's
 *      mark that still holds) is left out of the never-pulled and monthly
 *      reasons (the inactive round, Oct 1 2026: `sweepsPast`), read in the
 *      first look from two small collections a live studio.
 *   3. Record how packages ended (renewed, upgraded, downgraded, lost) on
 *      their renewal cycles — features/renewals/outcomes.ts decides; a
 *      leader's outcome is never overwritten.
 *   4. Write clients/{id}.renewal only where it changed, and the names each
 *      studio's Mindbody uses (config/renewalsSeen) for the settings screen.
 *   5. Client states (wave 2, Sep 28 2026): for each studio whose cutover
 *      date has come, each active client's state, the studio's Journey
 *      summary and the Hub's All stars (server/journey-step.ts), in its own
 *      batches and its own catch: a failure there never touches 1 to 4.
 *
 * ONE STUDIO AT A TIME (job memory, Oct 1 2026). The job runs on a 512 MB
 * instance and used to read the whole company first: every booking of four
 * months, every workout of three, and every client, all held until the end.
 * Now it goes round the studios twice, holding one studio at a time:
 *
 *   FIRST LOOK, per studio: its clients, their bookings and workouts, their
 *   snapshots as stored data has them; from those, who is due a sync on
 *   first booking and who could use a Mindbody pull, kept as a few small
 *   facts each. Then the studio is let go.
 *   Across the company: tonight's first syncs and the pull list, chosen
 *   exactly as before (the same budgets, the same order); the first syncs
 *   are done then (the clients they need were kept from the first look).
 *   SECOND LOOK, per studio: its clients and their history read again (a
 *   first-synced client is tonight's record of her, as before), tonight's
 *   pulls for its clients, every snapshot, the outcomes (3), the writes (4)
 *   and its client states (5), then the studio is let go.
 *
 * A client's bookings and workouts are read by client, thirty clients a
 * query, on the existing (clientId, startTime) and (clientId, date) indexes,
 * and put in the order the old whole-company queries returned them in (by
 * start time or day, then id). Since a cross-training client's visits are
 * hers wherever they were booked, this is the same history the old reads
 * gave her. What the job writes is unchanged; a studio's steps 3 to 5 now run
 * before the next studio's, rather than every studio's step 3 before any
 * step 4. A client who moves studio in the minutes between the two looks is
 * counted where she is at the second. The log says the heap's peak after each
 * look at each studio, so Render's log shows the headroom.
 *
 * FIXED WINDOWS. Bookings from 90 days back to 30 ahead and workouts from the
 * last 90 days: the cost stays flat as history grows. (The leaderboard job
 * reads every exercise log ever written, every night; this one must not.)
 *
 * A LEADER'S "DIDN'T COME" (wave 2, Sep 28 2026): every studio's booking
 * marks from the same 90 days (`studios/{s}/bookingMarks`, by `day`, a few a
 * week), so a booking a leader marked is a no-show in tonight's attendance,
 * never a visit (lib/booking-state.ts, renewals/attendance.ts). A studio
 * whose marks can't be read is read without them, and the log says so.
 *
 * NOTHING HERE CONTACTS ANYONE, and nothing writes to Mindbody: every
 * Mindbody call is a GET (server/mindbody-client.ts).
 */

import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type WriteBatch,
} from "firebase-admin/firestore";
import { mindbodyConfigured, pullClientCommercial, pullClientMaster } from "./mindbody-client.ts";
import { buildMasterSyncPatchWith, type MasterSyncFound } from "../src/lib/mindbody-master-patch.ts";
import { DEFAULT_FIRST_SYNC_MAX, firstSyncOrder, needsFirstSync } from "../src/lib/first-booking-sync.ts";
import { mapContractRecords, mapServiceRecords } from "../src/lib/mindbody-commercial-map.ts";
import { DEFAULT_TIME_ZONE, isValidTimeZone, studioDateKey, studioTodayKey } from "../src/lib/studio-time.ts";
import { bookingMarks, loggedSessions, type BookingMarks } from "../src/lib/booking-state.ts";
import { cutoverOf } from "../src/lib/client-coverage.ts";
import { buildRenewalSnapshot, sameSnapshot, stableStringify } from "../src/features/renewals/engine.ts";
import {
  CYCLE_KEY_PATTERN,
  outcomeCandidate,
  outcomePatch,
  type OutcomeCandidate,
} from "../src/features/renewals/outcomes.ts";
import {
  attendanceFromSchedules,
  attendanceFromSessions,
  attendanceSinceOf,
  feelFromSessions,
} from "../src/features/renewals/attendance.ts";
import {
  buildPackageNameIndex,
  normalizeRenewalSettings,
  type PackageNameIndex,
} from "../src/features/renewals/settings.ts";
import {
  mindbodyIdOf,
  namesSeenFrom,
  pullOrder,
  pullRank,
  sessionsLoggedSince,
  studioIsLive,
  sweepsPast,
} from "../src/features/renewals/job-plan.ts";
import type { Client, ScheduleEntry, WorkoutSession } from "../src/types.ts";
import type { RenewalCycle, RenewalSettings, RenewalSnapshot } from "../src/features/renewals/types.ts";
import {
  NONE_LIVE_LINE,
  emptyJourneySummary,
  readCompanyDefaults,
  readSweepFacts,
  runJourneyStudio,
  type JourneyStepSummary,
} from "./journey-step.ts";
import { INSTANCE_MB, memoryWatch } from "./job-memory.ts";
import type { SettingValues } from "../src/features/studio-settings/resolve.ts";

const DAY_MS = 86_400_000;
const BATCH_LIMIT = 400;
/** Default nightly Mindbody budget, in clients (2 calls each: ~600 calls). */
export const DEFAULT_MAX_PULLS = 300;
const PULL_CONCURRENCY = 4;
/** Firestore's most values in one `in` filter. */
const IN_LIMIT = 30;

/** The studio fields the job reads. */
const STUDIO_FIELDS = ["name", "timezone", "mindbodySiteId", "journeyCutoverDate"] as const;

export interface RenewalsRunOptions {
  db: Firestore;
  /** Compute everything, write nothing. */
  dryRun?: boolean;
  /** Skip Mindbody entirely and use what is already stored. */
  noPulls?: boolean;
  /** Clients to pull from Mindbody tonight, across all studios. */
  maxPulls?: number;
  /** Never-synced clients booked today or tomorrow to Master-Sync tonight (5 calls each). */
  maxFirstSyncs?: number;
  onlyStudio?: string;
  now?: Date;
  log?: (line: string) => void;
}

export interface RenewalsRunSummary {
  studios: number;
  clients: number;
  snapshotsWritten: number;
  /** Renewal cycles whose outcome was recorded (or taken back) tonight. */
  outcomesWritten: number;
  pulls: number;
  pullFailures: number;
  /** Never-synced clients booked today or tomorrow, Master-Synced tonight. */
  firstSyncs: number;
  firstSyncFailures: number;
  mindbodyCalls: number;
  bySituation: Record<string, number>;
  /** Step 5: the client states, the Journey summaries and All stars; null when the step failed as a whole. */
  journey?: JourneyStepSummary | null;
}

/** A studio as the job holds it all night: its settings and its day, never its clients. */
interface StudioRun {
  id: string;
  name: string;
  tz: string;
  today: string;
  tomorrow: string;
  site: string;
  /**
   * The studio has gone live (its Journey cutover date is set and has come):
   * only then does tonight's job ask Mindbody about its clients. Before it,
   * scripts/onboard-studio.ts brings them in at a pace AJ chooses (Sep 26).
   */
  live: boolean;
  settings: RenewalSettings;
  nameIndex: PackageNameIndex;
  attendanceSince: string | null;
  /** The names list as stored, to skip rewriting it when nothing changed. */
  namesStored: string;
}

/** One studio's clients' bookings and workouts in the window, by client, in the old reads' order. */
interface ClientHistory {
  bookings: Map<string, ScheduleEntry[]>;
  sessions: Map<string, WorkoutSession[]>;
  bookingCount: number;
  sessionCount: number;
}

async function commitInBatches(db: Firestore, writes: Array<(batch: WriteBatch) => void>) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    writes.slice(i, i + BATCH_LIMIT).forEach((w) => w(batch));
    await batch.commit();
  }
}

/** Runs `work` over `items` with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await work(item);
    }
  });
  await Promise.all(lanes);
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A stored time as [seconds, nanoseconds], the order Firestore keeps Timestamps in. */
function timeKey(v: unknown): [number, number] {
  const t = v as { seconds?: unknown; nanoseconds?: unknown; toMillis?: () => number } | null | undefined;
  if (t && typeof t.seconds === "number" && typeof t.nanoseconds === "number") return [t.seconds, t.nanoseconds];
  const ms = v instanceof Date ? v.getTime() : t && typeof t.toMillis === "function" ? t.toMillis() : typeof v === "string" ? Date.parse(v) : NaN;
  if (!Number.isFinite(ms)) return [Number.MAX_SAFE_INTEGER, 0];
  const seconds = Math.floor(ms / 1000);
  return [seconds, Math.round((ms - seconds * 1000) * 1e6)];
}

const byStart = (a: { row: ScheduleEntry; id: string }, b: { row: ScheduleEntry; id: string }): number => {
  const [as, an] = timeKey(a.row.startTime);
  const [bs, bn] = timeKey(b.row.startTime);
  return as - bs || an - bn || byText(a.id, b.id);
};

const byDay = (a: { s: WorkoutSession; id: string }, b: { s: WorkoutSession; id: string }): number =>
  byText(String(a.s.date ?? ""), String(b.s.date ?? "")) || byText(a.id, b.id);

/**
 * These clients' bookings (90 days back to 30 ahead) and workouts (the last 90
 * days, by `date`), thirty clients a query on the existing (clientId,
 * startTime) and (clientId, date) indexes. Each client's list is put in the
 * order the old whole-company reads returned it in: bookings by start time,
 * workouts by day, each then by id. A read that fails fails the job, as the
 * old reads did.
 */
async function readClientHistory(db: Firestore, clientIds: readonly string[], now: Date): Promise<ClientHistory> {
  const from = Timestamp.fromMillis(now.getTime() - 91 * DAY_MS);
  const to = Timestamp.fromMillis(now.getTime() + 31 * DAY_MS);
  const sessionsSince = new Date(now.getTime() - 91 * DAY_MS).toISOString().slice(0, 10);
  const bookingRows = new Map<string, Array<{ row: ScheduleEntry; id: string }>>();
  const sessionRows = new Map<string, Array<{ s: WorkoutSession; id: string }>>();
  let bookingCount = 0;
  let sessionCount = 0;

  for (let at = 0; at < clientIds.length; at += IN_LIMIT) {
    const batch = clientIds.slice(at, at + IN_LIMIT);
    const these = new Set(batch);
    const [bookingsSnap, sessionsSnap] = await Promise.all([
      db
        .collection("schedules")
        .where("clientId", "in", batch)
        .where("startTime", ">=", from)
        .where("startTime", "<=", to)
        .orderBy("startTime", "asc")
        .get(),
      db.collection("sessions").where("clientId", "in", batch).where("date", ">=", sessionsSince).orderBy("date", "desc").get(),
    ]);
    bookingsSnap.docs.forEach((d) => {
      // The id travels with the row: a leader's mark is keyed by it.
      const row = { ...(d.data() as ScheduleEntry), id: d.id };
      if (!row.clientId || !these.has(row.clientId)) return;
      bookingCount += 1;
      const list = bookingRows.get(row.clientId) ?? [];
      list.push({ row, id: d.id });
      bookingRows.set(row.clientId, list);
    });
    sessionsSnap.docs.forEach((d) => {
      const s = d.data() as WorkoutSession;
      if (!s.clientId || !these.has(s.clientId)) return;
      sessionCount += 1;
      const list = sessionRows.get(s.clientId) ?? [];
      list.push({ s, id: d.id });
      sessionRows.set(s.clientId, list);
    });
  }

  const bookings = new Map<string, ScheduleEntry[]>();
  for (const [id, list] of bookingRows) bookings.set(id, list.sort(byStart).map((x) => x.row));
  const sessions = new Map<string, WorkoutSession[]>();
  for (const [id, list] of sessionRows) sessions.set(id, list.sort(byDay).map((x) => x.s));
  return { bookings, sessions, bookingCount, sessionCount };
}

/** A studio's own clients (its home clients), whole: the snapshot reads most of a client. */
async function readHomeClients(db: Firestore, studioId: string): Promise<Client[]> {
  const snap = await db.collection("clients").where("homeStudioId", "==", studioId).get();
  return snap.docs.map((d) => ({ ...(d.data() as Client), id: d.id }));
}

export async function runRenewals(options: RenewalsRunOptions): Promise<RenewalsRunSummary> {
  const { db } = options;
  const log = options.log ?? ((line: string) => console.log(`[renewals] ${line}`));
  const now = options.now ?? new Date();
  const dryRun = Boolean(options.dryRun);
  const canPull = !options.noPulls && mindbodyConfigured();
  if (!options.noPulls && !mindbodyConfigured()) {
    log("Mindbody credentials are not set: using stored data only.");
  }
  const memory = memoryWatch();

  const summary: RenewalsRunSummary = {
    studios: 0,
    clients: 0,
    snapshotsWritten: 0,
    outcomesWritten: 0,
    pulls: 0,
    pullFailures: 0,
    firstSyncs: 0,
    firstSyncFailures: 0,
    mindbodyCalls: 0,
    bySituation: {},
  };

  /* ================= What every studio shares ================= */
  const allStudioDocs = (await db.collection("studios").select(...STUDIO_FIELDS).get()).docs.map(
    (d): { id: string; name?: string; timezone?: string; mindbodySiteId?: string | number; journeyCutoverDate?: string | null } => ({
      id: d.id,
      ...(d.data() as Record<string, any>),
    }),
  );
  const studioDocs = allStudioDocs.filter((s) => !options.onlyStudio || s.id === options.onlyStudio);
  // Every studio's cutover, even under --only-studio: a client's booking at
  // another location is read against THAT studio's day on Journey.
  const cutovers = allStudioDocs.map((s) => ({
    id: s.id,
    journeyCutoverDate: typeof s.journeyCutoverDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.journeyCutoverDate) ? s.journeyCutoverDate : null,
  }));

  const machineNames: Record<string, string> = {};
  (await db.collection("machines").select("name").get()).docs.forEach((d) => {
    const name = d.get("name");
    if (typeof name === "string" && name.trim()) machineNames[d.id] = name.trim();
  });

  // Every studio's "didn't come" marks in the window, even under --only-studio:
  // a client's booking at another location is marked there.
  const marksSince = new Date(now.getTime() - 92 * DAY_MS).toISOString().slice(0, 10);
  const markRows: Array<{ id: string; noShow?: unknown }> = [];
  for (const studio of allStudioDocs) {
    try {
      const snap = await db.collection(`studios/${studio.id}/bookingMarks`).where("day", ">=", marksSince).get();
      snap.docs.forEach((d) => markRows.push({ id: d.id, noShow: d.get("noShow") }));
    } catch (err: any) {
      log(`The "didn't come" marks at ${typeof studio.name === "string" ? studio.name : studio.id} couldn't be read, so tonight reads its bookings without them: ${err?.message || err}`);
    }
  }
  const marks: BookingMarks | null = bookingMarks(markRows);
  if (markRows.length > 0) log(`${markRows.length} booking${markRows.length === 1 ? "" : "s"} marked "didn't come" in the window.`);

  // One client's attendance tonight: what her snapshot is built from, and
  // (step 5) the visit days her rhythm is measured from.
  const attendanceOf = (run: { tz: string; today: string }, client: Client, history: ClientHistory) => {
    const schedules = history.bookings.get(client.id!) ?? [];
    const sessions = history.sessions.get(client.id!) ?? [];
    return [
      // A booking is a visit when Journey logged a session that day (AJ,
      // Sep 24 2026); attendance.ts says what an unlogged one is.
      ...attendanceFromSchedules(schedules, now, run.tz, {
        logged: loggedSessions(sessions, run.tz),
        cutoverOf: (studioId) => cutoverOf(cutovers, studioId),
        marks,
      }),
      ...attendanceFromSessions(sessions, run.tz, run.today),
    ];
  };

  const build = (run: StudioRun, client: Client, history: ClientHistory): RenewalSnapshot => {
    const sessions = history.sessions.get(client.id!) ?? [];
    return buildRenewalSnapshot({
      client,
      settings: run.settings,
      today: run.today,
      attendance: attendanceOf(run, client, history),
      sessionFeel: feelFromSessions(sessions, run.tz),
      machineNames,
      attendanceSince: run.attendanceSince,
      nameIndex: run.nameIndex,
      lastVisitHint: client.renewal?.lastVisitDate ?? null,
    });
  };

  /* ================= 1. First look: snapshots from stored data ================= */
  // Per studio, held only while it is looked at. What is kept for later:
  // the studio's settings, who is due a first sync (with her record, since
  // that sync builds on it: today's and tomorrow's bookings only, so few), and
  // who could use a pull, as a rank and a date.
  const runs: StudioRun[] = [];
  const due: Array<{ run: StudioRun; c: Client; id: string; firstDay: string }> = [];
  const candidates: Array<{ run: StudioRun; id: string; rank: number; focusDate: string | null }> = [];
  for (const studio of studioDocs) {
    const tz = isValidTimeZone(studio.timezone) ? studio.timezone : DEFAULT_TIME_ZONE;
    const configSnap = await db.doc(`studios/${studio.id}/config/renewals`).get();
    const settings = normalizeRenewalSettings(configSnap.exists ? configSnap.data() : undefined);
    const earliest = await db
      .collection("schedules")
      .where("studioId", "==", studio.id)
      .orderBy("startTime", "asc")
      .limit(1)
      .get();
    const seenSnap = await db.doc(`studios/${studio.id}/config/renewalsSeen`).get();
    const tomorrow = studioTodayKey(new Date(now.getTime() + DAY_MS), tz);
    const run: StudioRun = {
      id: studio.id,
      name: typeof studio.name === "string" ? studio.name : studio.id,
      tz,
      today: studioTodayKey(now, tz),
      tomorrow,
      site: studio.mindbodySiteId ? String(studio.mindbodySiteId).trim() : "",
      live: studioIsLive(studio.journeyCutoverDate, tomorrow),
      settings,
      nameIndex: buildPackageNameIndex(settings),
      attendanceSince: earliest.empty ? null : attendanceSinceOf(earliest.docs[0].get("startTime"), tz),
      namesStored: stableStringify(seenSnap.exists ? seenSnap.get("names") ?? null : null),
    };
    runs.push(run);

    // Only a studio tonight may ask Mindbody about has anything to choose
    // (1b and 2 are for live, linked studios): the others wait for the second look.
    if (canPull && run.site && run.live) {
      const clients = await readHomeClients(db, studio.id);
      const history = await readClientHistory(db, clients.map((c) => c.id!), now);
      memory.sample();
      const snapshots = new Map<string, RenewalSnapshot>();
      for (const c of clients) snapshots.set(c.id!, build(run, c, history));

      // 1b's candidates: never synced, booked today or tomorrow.
      for (const c of clients) {
        const days = (history.bookings.get(c.id!) ?? [])
          .filter((row) => row.status !== "Cancelled")
          .map((row) => studioDateKey(row.startTime, run.tz))
          .filter((d): d is string => typeof d === "string");
        if (!needsFirstSync(c, days, run.today, run.tomorrow)) continue;
        const firstDay = days.filter((d) => d === run.today || d === run.tomorrow).sort()[0];
        due.push({ run, c, id: c.id!, firstDay });
      }

      // Who the Journey calls Inactive (the inactive round, Oct 1 2026): last
      // night's states and the leaders' marks. They drop out of the monthly
      // sweep (job-plan.ts sweepsPast); a failed read leaves everyone in it.
      const sweep = await readSweepFacts(db, studio.id, run.name, log);
      let passedBy = 0;

      // 2's candidates, ranked on the snapshot stored data gives (job-plan.ts).
      for (const c of clients) {
        const current = snapshots.get(c.id!)!;
        const inactive = sweep ? sweepsPast({ stored: sweep.stored.get(c.id!) ?? null, mark: sweep.marks.get(c.id!) ?? null, current }) : false;
        if (inactive) passedBy++;
        const rank = pullRank({
          client: c,
          current,
          today: run.today,
          // The count-down that decides "near the end" (job-plan.ts, rank 1).
          bookedToday: (history.bookings.get(c.id!) ?? []).some(
            (row) => row.status !== "Cancelled" && studioDateKey(row.startTime, run.tz) === run.today,
          ),
          // Both days are the studio's: a Sync pressed at 9 pm is still today.
          loggedSincePull: sessionsLoggedSince(
            history.sessions.get(c.id!) ?? [],
            c.mindbodyServicesSyncedAt ? studioDateKey(c.mindbodyServicesSyncedAt, run.tz) : null,
            run.tz,
          ),
          conversationAt: run.settings.conversationAtSessionsLeft,
          inactive,
        });
        if (rank !== null) candidates.push({ run, id: c.id!, rank, focusDate: current.focusDate });
      }
      log(
        `${run.name}, first look: ${clients.length} clients, ${history.bookingCount} bookings and ${history.sessionCount} workouts in the window` +
          `${sweep ? `; ${passedBy} inactive, left out of the monthly sweep` : ""}.`,
      );
      log(memory.line(`${run.name}, first look`));
    }
  }

  /* ================= 1b. Sync on first booking ================= */
  // Anyone booked today or tomorrow whom Journey has never Master-Synced:
  // the pre-launch sync covered the studio's clients, and this is how
  // everyone after it arrives (lib/first-booking-sync.ts). Master Sync's own
  // patch (lib/mindbody-master-patch.ts), so the fields are the button's.
  // Their commercial data comes with it, so they skip tonight's pulls below.
  // A synced client's record, as tonight left it, replaces the one the
  // second look reads, as the first look's record of her did before.
  const firstSynced = new Map<string, { studioId: string; client: Client }>();
  if (canPull) {
    const waiting = runs.filter((run) => run.site && !run.live);
    if (waiting.length > 0) {
      log(
        `Not live yet, so no Mindbody pulls for their clients tonight: ${waiting.map((r) => r.name).join(", ")} ` +
          `(set the Journey cutover date on My Studio -> Studio; until then, scripts/onboard-studio.ts).`,
      );
    }
    due.sort(firstSyncOrder);
    const budget = Math.max(0, options.maxFirstSyncs ?? DEFAULT_FIRST_SYNC_MAX);
    const chosen = due.slice(0, budget);
    if (due.length > 0) {
      log(
        `${due.length} never-synced client${due.length === 1 ? "" : "s"} booked today or tomorrow; ` +
          `${dryRun ? "would sync" : "syncing"} ${chosen.length}${due.length > chosen.length ? ` (budget ${budget}; the rest tomorrow night or on the profile's Sync)` : ""}.`,
      );
    }
    if (!dryRun) {
      const toTs = (d: Date) => Timestamp.fromDate(d);
      await pool(chosen, PULL_CONCURRENCY, async ({ run, c }) => {
        try {
          const pull = await pullClientMaster(run.site, mindbodyIdOf(c)!);
          summary.mindbodyCalls += pull.calls;
          if (!pull.response || pull.response.found !== true) {
            summary.firstSyncFailures++;
            return;
          }
          const res = pull.response as MasterSyncFound;
          const built = buildMasterSyncPatchWith(c, res, now, FieldValue.serverTimestamp(), toTs);
          const ref = db.doc(`clients/${c.id}`);
          const batch = db.batch();
          if (built.mergeMaps) batch.set(ref, built.mergeMaps, { merge: true });
          batch.update(ref, built.patch);
          await batch.commit();
          summary.firstSyncs++;
          firstSynced.set(c.id!, { studioId: run.id, client: c });

          // Rebuild in memory exactly as the write lands, stamps as tonight:
          // the flat fields replace, the contract and membership maps merge
          // record by record, as the batch above does.
          const mem = buildMasterSyncPatchWith(c, res, now, Timestamp.fromDate(now), toTs);
          Object.assign(c, mem.patch);
          const maps = (mem.mergeMaps ?? {}) as Record<string, any>;
          if (maps.mindbodyCommercialSyncedAt) c.mindbodyCommercialSyncedAt = maps.mindbodyCommercialSyncedAt;
          for (const key of ["mindbodyContracts", "mindbodyMemberships"] as const) {
            const incoming = maps[key] as Record<string, Record<string, unknown>> | undefined;
            if (!incoming) continue;
            const merged: Record<string, any> = { ...((c as any)[key] ?? {}) };
            for (const [k, v] of Object.entries(incoming)) merged[k] = { ...(merged[k] ?? {}), ...v };
            (c as any)[key] = merged;
          }
        } catch (err: any) {
          summary.firstSyncFailures++;
          log(`Master Sync on first booking failed for a client at ${run.name}: ${err?.message || err}`);
        }
      });
    }
  }
  due.length = 0;

  /* ================= 2. Mindbody pulls, most urgent first: who ================= */
  // Chosen across the company, as before; pulled in each studio's second look.
  const pullsByStudio = new Map<string, string[]>();
  if (canPull) {
    const pullable = candidates
      .filter((x) => !firstSynced.has(x.id))
      .sort((a, b) => pullOrder({ rank: a.rank, focusDate: a.focusDate }, { rank: b.rank, focusDate: b.focusDate }, a.run.today));
    const chosen = pullable.slice(0, Math.max(0, options.maxPulls ?? DEFAULT_MAX_PULLS));
    log(`${pullable.length} clients could use a Mindbody pull; pulling ${chosen.length} tonight.`);
    for (const x of chosen) {
      const list = pullsByStudio.get(x.run.id) ?? [];
      list.push(x.id);
      pullsByStudio.set(x.run.id, list);
    }
  }
  candidates.length = 0;

  /* ================= 5's once-a-run read ================= */
  // Client states are written per studio in its second look (after its
  // snapshots, from tonight's). Its own catch: nothing there can take the
  // snapshots or the outcomes down.
  let journeyReady = false;
  let company: SettingValues | null = null;
  try {
    summary.journey = emptyJourneySummary();
    if (!runs.some((run) => run.live)) {
      log(NONE_LIVE_LINE);
    } else {
      company = await readCompanyDefaults(db, log);
      journeyReady = true;
    }
  } catch (err: any) {
    summary.journey = null;
    log(`Client states: the step failed, and tonight's snapshots stand: ${err?.message || err}`);
  }
  const allStudios = allStudioDocs.map((s) => ({
    id: s.id,
    name: typeof s.name === "string" ? s.name : s.id,
    journeyCutoverDate: cutoverOf(cutovers, s.id),
  }));
  const tzById = new Map(runs.map((run) => [run.id, run.tz]));
  const tzOf = (id: string) => tzById.get(id) ?? "America/New_York";

  /* ================= Second look, a studio at a time ================= */
  for (const run of runs) {
    // Its clients again, a first-synced client as tonight left her.
    let clients = (await readHomeClients(db, run.id))
      .filter((c) => {
        const synced = firstSynced.get(c.id!);
        return !synced || synced.studioId === run.id;
      })
      .map((c) => firstSynced.get(c.id!)?.client ?? c);
    const present = new Set(clients.map((c) => c.id!));
    const missing = [...firstSynced.values()].filter((f) => f.studioId === run.id && !present.has(f.client.id!)).map((f) => f.client);
    // In id order, as the query returns them, if a synced client had to be put back.
    if (missing.length > 0) clients = [...clients, ...missing].sort((a, b) => byText(a.id!, b.id!));
    const history = await readClientHistory(db, clients.map((c) => c.id!), now);
    memory.sample();
    summary.studios++;
    summary.clients += clients.length;
    log(`${run.name}: read ${clients.length} clients, ${history.bookingCount} bookings and ${history.sessionCount} workouts in the window.`);

    /* ---------- 2. Mindbody pulls: this studio's, in tonight's order ---------- */
    const byId = new Map(clients.map((c) => [c.id!, c] as const));
    const pulling = (pullsByStudio.get(run.id) ?? []).map((id) => byId.get(id)).filter((c): c is Client => Boolean(c));
    pullsByStudio.delete(run.id);
    await pool(pulling, PULL_CONCURRENCY, async (c) => {
      try {
        const pull = await pullClientCommercial(run.site, mindbodyIdOf(c)!, { memberships: false });
        summary.mindbodyCalls += pull.calls;
        if (!pull.contracts && !pull.services) {
          summary.pullFailures++;
          return;
        }
        summary.pulls++;
        const toTs = (d: Date) => Timestamp.fromDate(d);
        const serverNow = FieldValue.serverTimestamp();
        const contracts = pull.contracts ? mapContractRecords(pull.contracts, serverNow, toTs) : null;
        const services = pull.services ? mapServiceRecords(pull.services, serverNow, toTs) : null;

        if (!dryRun) {
          const ref = db.doc(`clients/${c.id}`);
          // Same semantics as the Sync button (lib/mindbody-commercial-sync.ts):
          // contracts merge into what the webhook wrote; pricing options are
          // replaced whole, and only when that call worked.
          const merged: Record<string, unknown> = { mindbodyCommercialSyncedAt: serverNow };
          if (contracts && Object.keys(contracts).length > 0) merged.mindbodyContracts = contracts;
          await ref.set(merged, { merge: true });
          if (services) await ref.update({ mindbodyServices: services, mindbodyServicesSyncedAt: serverNow });
        }

        // Rebuild in memory exactly as the write lands.
        const stamp = Timestamp.fromDate(now);
        c.mindbodyCommercialSyncedAt = stamp;
        if (contracts) {
          const next: Record<string, any> = { ...(c.mindbodyContracts ?? {}) };
          for (const [k, v] of Object.entries(contracts)) {
            next[k] = { ...(next[k] ?? {}), ...v, lastPullSyncAt: stamp };
          }
          c.mindbodyContracts = next;
        }
        if (services) {
          c.mindbodyServices = Object.fromEntries(
            Object.entries(services).map(([k, v]) => [k, { ...v, lastPullSyncAt: stamp }]),
          ) as Client["mindbodyServices"];
          c.mindbodyServicesSyncedAt = stamp;
        }
      } catch (err: any) {
        summary.pullFailures++;
        log(`Mindbody pull failed for a client at ${run.name}: ${err?.message || err}`);
      }
    });

    // Every snapshot, from what is stored and what tonight brought.
    const snapshots = new Map<string, RenewalSnapshot>();
    for (const c of clients) snapshots.set(c.id!, build(run, c, history));

    /* ---------- 3. Outcomes: how packages ended ---------- */
    // Before the snapshots on purpose: if this fails, tonight's snapshots
    // aren't written either, so tomorrow sees the same change and records it.
    const found: Array<{ c: Client; cand: OutcomeCandidate; ref: DocumentReference }> = [];
    for (const c of clients) {
      const cand = outcomeCandidate({
        stored: c.renewal ?? null,
        next: snapshots.get(c.id!)!,
        settings: run.settings,
        today: run.today,
      });
      if (!cand || !CYCLE_KEY_PATTERN.test(cand.cycleKey)) continue;
      found.push({ c, cand, ref: db.doc(`studios/${run.id}/renewals/${cand.cycleKey}`) });
    }
    if (found.length > 0) {
      // Only the cycles a decision touches are read, in groups.
      const existing: Array<Partial<RenewalCycle> | null> = [];
      for (let i = 0; i < found.length; i += 100) {
        const docs = await db.getAll(...found.slice(i, i + 100).map((f) => f.ref));
        docs.forEach((d) => existing.push(d.exists ? (d.data() as Partial<RenewalCycle>) : null));
      }

      const writes: Array<(batch: WriteBatch) => void> = [];
      found.forEach(({ c, cand, ref }, i) => {
        const had = existing[i];
        const patch = outcomePatch(cand, had as RenewalCycle | null);
        if (!patch) return;
        let fields: Record<string, unknown>;
        if (patch.outcome) {
          // Attributed to whoever coached the closing package most: last
          // night's snapshot saw its final weeks.
          const primary = c.renewal?.primaryTrainerId ?? snapshots.get(c.id!)!.primaryTrainerId ?? null;
          fields = {
            clientId: c.id,
            clientName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
            cycleKey: cand.cycleKey,
            ...(had?.packageKey ? {} : { packageKey: cand.packageKey }),
            ...patch,
            outcomeAt: FieldValue.serverTimestamp(),
            ...(had?.primaryTrainerId ? {} : { primaryTrainerId: primary }),
          };
        } else {
          fields = { ...patch, outcomeAt: null };
        }
        writes.push((batch) => batch.set(ref, fields, { merge: true }));
      });
      summary.outcomesWritten += writes.length;
      if (!dryRun) await commitInBatches(db, writes);
      if (writes.length > 0) {
        log(`${run.name}: ${writes.length} renewal outcome${writes.length === 1 ? "" : "s"} ${dryRun ? "would be recorded" : "recorded"}.`);
      }
    }

    /* ---------- 4. Write what changed ---------- */
    {
      const writes: Array<(batch: WriteBatch) => void> = [];
      for (const c of clients) {
        const snap = snapshots.get(c.id!)!;
        summary.bySituation[snap.situation] = (summary.bySituation[snap.situation] ?? 0) + 1;
        const stored = c.renewal;
        if (sameSnapshot(stored, snap)) continue;
        writes.push((batch) =>
          batch.update(db.doc(`clients/${c.id}`), {
            renewal: { ...snap, computedAt: FieldValue.serverTimestamp() },
          }),
        );
      }
      summary.snapshotsWritten += writes.length;
      const names = namesSeenFrom(clients);
      if (!dryRun) {
        await commitInBatches(db, writes);
        if (stableStringify(names) !== run.namesStored) {
          await db.doc(`studios/${run.id}/config/renewalsSeen`).set({
            names,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
      log(
        `${run.name}: ${clients.length} clients, ${writes.length} snapshots ${dryRun ? "would change" : "written"}, ` +
          `${Object.keys(names).length} Mindbody names seen${run.attendanceSince ? "" : ", no bookings synced yet"}.`,
      );
    }

    /* ---------- 5. Client states, the Journey summary and All stars ---------- */
    // After the snapshots on purpose: the states are worked out from tonight's.
    if (journeyReady && run.live && summary.journey) {
      await runJourneyStudio(
        {
          db,
          studio: {
            id: run.id,
            name: run.name,
            tz: run.tz,
            today: run.today,
            live: run.live,
            breakDays: run.settings.breakDays,
            nameIndex: run.nameIndex,
            clients,
            snapshots,
          },
          allStudios,
          company,
          bookingsByClient: history.bookings,
          visitDaysOf: (studio, client) => attendanceOf(studio, client, history).filter((r) => r.kind === "visit").map((r) => r.day),
          tzOf,
          now,
          dryRun,
          log,
        },
        summary.journey,
      );
    }
    log(memory.line(run.name));
  }

  log(
    `Done${dryRun ? " (dry run — nothing written)" : ""}. ${summary.clients} clients, ` +
      `${summary.snapshotsWritten} snapshots ${dryRun ? "would change" : "written"}, ` +
      `${summary.outcomesWritten} outcomes ${dryRun ? "would be recorded" : "recorded"}, ` +
      `${summary.firstSyncs} first-booking syncs (${summary.firstSyncFailures} failed), ` +
      `${summary.pulls} Mindbody pulls (${summary.mindbodyCalls} calls, ${summary.pullFailures} failed), ` +
      `${summary.journey ? `${summary.journey.statesWritten} client states ${dryRun ? "would change" : "written"} at ${summary.journey.studios} studio${summary.journey.studios === 1 ? "" : "s"}` : "no client states"}. ` +
      `Situations: ${Object.entries(summary.bySituation)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")}.`,
  );
  log(`Memory: the run's peak was ${memory.runPeakMb()} MB of heap; the instance has ${INSTANCE_MB} MB.`);
  return summary;
}
