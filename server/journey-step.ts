/**
 * THE NIGHTLY JOB'S JOURNEY STEP — step 5 of server/renewals-job.ts (wave 2
 * of the Operations room, Sep 28 2026; AJ: "all yes" to client states written
 * nightly, a nightly summary per studio, and the Hub's All stars stored with
 * the 26-week read they need).
 *
 * After tonight's renewal snapshots are written, for each studio with a
 * cutover date that has come (`live`, the job's own gate for asking Mindbody
 * about a studio's clients), it writes:
 *
 *   studios/{s}/clientStates/{clientId}   each active home client's state,
 *                                         since when, what it was, why, her
 *                                         usual gap, last visit and next
 *                                         booking (leaders only). Only a
 *                                         document that changed is written;
 *                                         one for someone no longer an active
 *                                         client here is removed.
 *   studios/{s}/watch/journey             the counts by state, and the day,
 *                                         lines and break days they were
 *                                         worked out with (leaders only).
 *                                         Written LAST, in the last batch, so
 *                                         a screen only trusts states that
 *                                         all landed.
 *   studios/{s}/watch/hubMarks            the Hub's All stars, { allStars:
 *                                         [{ clientId, weeksWithVisit,
 *                                         perWeek }], computedAt } (everyone
 *                                         who works there). Not written on a
 *                                         night the sessions couldn't be read:
 *                                         the Hub keeps last night's.
 *
 * EVERY RULE IS THE PURE CORE'S (src/features/admin/journey/nightly.ts over
 * states.ts, the row model and all-stars.ts). This file reads, hands the lot
 * over, and writes what comes back.
 *
 * WHAT IT READS, beyond what the job already holds (the studios, every
 * booking in the window, tonight's snapshots and the attendance behind them):
 *
 *   1. Max Strength's defaults, `system/studioDefaults`, once a run;
 *   2. per live studio: its own settings (`studios/{s}/config/settings`) and
 *      last night's states (`studios/{s}/clientStates`, one small
 *      collection — `since` and `was` carry from them);
 *   3. per live studio, its clients' sessions of the last 26 weeks and two
 *      days at every studio Journey knows (a client may train at another
 *      location), thirty clients a query on the existing (clientId,
 *      createdAt) index, with `select` so only the fields a studio day needs
 *      travel. A read that fails leaves that studio's All stars unwritten
 *      tonight, never written from part of the record.
 *
 * ONE STUDIO AT A TIME (job memory, Oct 1 2026). Until Oct 1 the step read
 * every studio's 26 weeks of sessions up front and held every client's days
 * for the whole run; the renewals job now hands it one studio when that
 * studio's snapshots are written (`runJourneyStudio`), and the sessions
 * read are that studio's clients' only. The same sessions count: those
 * hosted at a studio Journey knows, on the hosting studio's clock.
 *
 * A STUDIO THAT FAILS IS SKIPPED, and the others go on: its states and
 * summary stay as last night left them (a screen then sees yesterday's
 * summary and works states out itself). The job's snapshots are never
 * touched by this step, and a failure here never fails the job.
 *
 * DRY RUN (`RENEWALS_DRY_RUN=true`, or `npx tsx scripts/run-renewals.ts`
 * without --commit): everything is worked out and logged, nothing written.
 *
 * NOTHING HERE ASKS MINDBODY ANYTHING, and nothing contacts anyone.
 */

import { FieldValue, Timestamp, type DocumentReference, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import type { Client, ScheduleEntry, WorkoutSession } from "../src/types.ts";
import type { PackageNameIndex } from "../src/features/renewals/settings.ts";
import type { RenewalSnapshot } from "../src/features/renewals/types.ts";
import { resolveAll, type SettingValues } from "../src/features/studio-settings/resolve.ts";
import { addDays, sessionDayKey } from "../src/features/client-history/model.ts";
import { linesOf } from "../src/features/admin/journey/states.ts";
import {
  ALL_STARS_READ_DAYS,
  CLIENT_STATES,
  HUB_MARKS_ID,
  JOURNEY_WATCH_ID,
  nightStudio,
  parseStateDoc,
  sameStateDoc,
  type ClientStateDoc,
} from "../src/features/admin/journey/nightly.ts";

const DAY_MS = 86_400_000;
const BATCH_LIMIT = 400;

/** The fields a logged session's studio day and status need (sessionDayKey, isLegacySession), and where it was hosted. */
const SESSION_FIELDS = ["clientId", "status", "date", "startTime", "clientStartTime", "legacy_filemaker_id", "trainerId", "trainerInitials", "hostedAtStudioId"] as const;

/** Firestore's most values in one `in` filter. */
const IN_LIMIT = 30;

/** A studio as the renewals job holds it tonight. */
export interface JourneyStepStudio {
  id: string;
  name: string;
  tz: string;
  today: string;
  /** Its cutover date has come: the job's gate. */
  live: boolean;
  breakDays: number;
  nameIndex: PackageNameIndex | null;
  clients: Client[];
  snapshots: ReadonlyMap<string, RenewalSnapshot>;
}

export interface JourneyStepOptions {
  db: Firestore;
  studios: JourneyStepStudio[];
  /** Every studio in the company: its cutover (whose history Journey holds) and the sessions it hosts. */
  allStudios: ReadonlyArray<{ id: string; name?: string; journeyCutoverDate: string | null }>;
  bookingsByClient: ReadonlyMap<string, readonly ScheduleEntry[]>;
  /** Her visit days tonight: the attendance the renewal engine read, kind "visit". */
  visitDaysOf: (studio: JourneyStepStudio, client: Client) => string[];
  now: Date;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface JourneyStepSummary {
  studios: number;
  skipped: number;
  statesWritten: number;
  statesRemoved: number;
  allStars: number;
}

const valuesOf = (data: Record<string, unknown> | undefined): SettingValues | null =>
  data && data.values && typeof data.values === "object" ? (data.values as SettingValues) : null;

async function commitInBatches(db: Firestore, writes: Array<(batch: WriteBatch) => void>): Promise<void> {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    writes.slice(i, i + BATCH_LIMIT).forEach((w) => w(batch));
    await batch.commit();
  }
}

/**
 * One studio's clients' logged sessions over the All-stars read, as studio
 * days by client: every session hosted at a studio Journey knows, on that
 * studio's clock, read thirty clients at a time on the (clientId, createdAt)
 * index. Null when any read fails: All stars are never worked out from part
 * of the record.
 */
export async function readLoggedDays(
  db: Firestore,
  clientIds: readonly string[],
  studios: JourneyStepOptions["allStudios"],
  tzOf: (studioId: string) => string,
  now: Date,
  log: (line: string) => void,
  studioName: string,
): Promise<Map<string, string[]> | null> {
  const since = Timestamp.fromMillis(now.getTime() - (ALL_STARS_READ_DAYS + 1) * DAY_MS);
  const hosts = new Set(studios.map((s) => s.id));
  const byClient = new Map<string, Set<string>>();
  try {
    for (let at = 0; at < clientIds.length; at += IN_LIMIT) {
      const batch = clientIds.slice(at, at + IN_LIMIT);
      const these = new Set(batch);
      const snap = await db
        .collection("sessions")
        .where("clientId", "in", batch)
        .where("createdAt", ">=", since)
        .orderBy("createdAt", "desc")
        .select(...SESSION_FIELDS)
        .get();
      for (const d of snap.docs) {
        const s = d.data() as WorkoutSession & { hostedAtStudioId?: unknown };
        if (s.status !== "Completed" || !s.clientId || !these.has(s.clientId)) continue;
        const host = s.hostedAtStudioId;
        if (typeof host !== "string" || !hosts.has(host)) continue;
        const day = sessionDayKey(s as never, tzOf(host));
        if (!day) continue;
        const set = byClient.get(s.clientId) ?? new Set<string>();
        set.add(day);
        byClient.set(s.clientId, set);
      }
    }
  } catch (err: any) {
    log(`All stars: the sessions of ${studioName}'s clients couldn't be read, so its All stars aren't written tonight (the Hub keeps last night's): ${err?.message || err}`);
    return null;
  }
  return new Map([...byClient].map(([id, days]) => [id, [...days].sort()]));
}

/** Max Strength's defaults, once a run. A failed read falls through to the app's defaults (logged). */
export async function readCompanyDefaults(db: Firestore, log: (line: string) => void): Promise<SettingValues | null> {
  try {
    const snap = await db.doc("system/studioDefaults").get();
    return snap.exists ? valuesOf(snap.data() as Record<string, unknown>) : null;
  } catch (err: any) {
    log(`Client states: Max Strength's defaults couldn't be read, so a line a studio hasn't set is the app's tonight: ${err?.message || err}`);
    return null;
  }
}

/** The line for a run in which no studio has gone live. */
export const NONE_LIVE_LINE = "Client states: no studio has gone live yet (set the Journey cutover date on My Studio -> Studio), so none are written.";

export const emptyJourneySummary = (): JourneyStepSummary => ({ studios: 0, skipped: 0, statesWritten: 0, statesRemoved: 0, allStars: 0 });

/** What one studio's turn needs, beside the studio itself. */
export interface JourneyStudioOptions {
  db: Firestore;
  studio: JourneyStepStudio;
  allStudios: JourneyStepOptions["allStudios"];
  /** Max Strength's defaults (readCompanyDefaults), read once a run. */
  company: SettingValues | null;
  /** The studio's clients' bookings in the window. */
  bookingsByClient: ReadonlyMap<string, readonly ScheduleEntry[]>;
  visitDaysOf: (studio: JourneyStepStudio, client: Client) => string[];
  /** A studio's clock, for the sessions it hosted. */
  tzOf: (studioId: string) => string;
  now: Date;
  dryRun?: boolean;
  log: (line: string) => void;
}

/**
 * One live studio's turn: its states, All stars and summary, written (or, on
 * a dry run, worked out). Never throws: a studio that fails is counted in
 * `skipped` and left as last night left it.
 */
export async function runJourneyStudio(options: JourneyStudioOptions, summary: JourneyStepSummary): Promise<void> {
  const { db, studio, now, log } = options;
  const dryRun = Boolean(options.dryRun);
  try {
    // 3. Its clients' 26 weeks of logged sessions, at every studio.
    const clientIds = studio.clients.map((c) => c.id).filter((id): id is string => typeof id === "string" && id !== "");
    const logged = await readLoggedDays(db, clientIds, options.allStudios, options.tzOf, now, log, studio.name);

    // 2. The studio's own settings and last night's states.
    const [settingsSnap, statesSnap] = await Promise.all([
      db.doc(`studios/${studio.id}/config/settings`).get(),
      db.collection(`studios/${studio.id}/${CLIENT_STATES}`).get(),
    ]);
    const lines = linesOf(resolveAll({ studio: settingsSnap.exists ? valuesOf(settingsSnap.data() as Record<string, unknown>) : null, company: options.company, studioDoc: null }));
    const previous = new Map<string, ClientStateDoc>();
    const stored: Array<{ id: string; ref: DocumentReference }> = [];
    for (const d of statesSnap.docs) {
      stored.push({ id: d.id, ref: d.ref });
      const parsed = parseStateDoc(d.data() as Record<string, unknown>);
      if (parsed) previous.set(d.id, parsed);
    }

    const visitDaysByClient = new Map<string, string[]>();
    for (const c of studio.clients) if (c.id) visitDaysByClient.set(c.id, options.visitDaysOf(studio, c));

    const night = nightStudio({
      studioId: studio.id,
      today: studio.today,
      now,
      tz: studio.tz,
      studios: options.allStudios,
      clients: studio.clients,
      snapshots: studio.snapshots,
      bookingsByClient: options.bookingsByClient,
      visitDaysByClient,
      loggedDaysByClient: logged,
      loggedFrom: logged ? addDays(studio.today, -ALL_STARS_READ_DAYS) : null,
      packageIndex: studio.nameIndex,
      breakDays: studio.breakDays,
      lines,
      previous,
    });

    const stamp = FieldValue.serverTimestamp();
    const writes: Array<(batch: WriteBatch) => void> = [];
    let changed = 0;
    for (const [clientId, doc] of night.states) {
      if (sameStateDoc(previous.get(clientId), doc)) continue;
      changed += 1;
      const ref = db.doc(`studios/${studio.id}/${CLIENT_STATES}/${clientId}`);
      writes.push((batch) => batch.set(ref, { ...doc, computedAt: stamp }));
    }
    let removed = 0;
    for (const s of stored) {
      if (night.states.has(s.id)) continue;
      removed += 1;
      writes.push((batch) => batch.delete(s.ref));
    }
    if (night.allStars) {
      const marks = night.allStars;
      writes.push((batch) => batch.set(db.doc(`studios/${studio.id}/watch/${HUB_MARKS_ID}`), { allStars: marks, computedAt: stamp }));
    }
    // Last, so a screen trusts only states that all landed.
    writes.push((batch) => batch.set(db.doc(`studios/${studio.id}/watch/${JOURNEY_WATCH_ID}`), { ...night.summary, computedAt: stamp }));
    if (!dryRun) await commitInBatches(db, writes);

    summary.studios += 1;
    summary.statesWritten += changed;
    summary.statesRemoved += removed;
    summary.allStars += night.allStars?.length ?? 0;
    const c = night.summary.counts;
    log(
      `${studio.name}: ${night.summary.clients} client states (${changed} ${dryRun ? "would change" : "changed"}, ${removed} ${dryRun ? "would be removed" : "removed"}): ` +
        `${c.drifting} drifting, ${c["at-risk"]} at risk, ${c.lapsed} lapsed, ${c.unknown} unknown; ` +
        `${night.allStars === null ? "All stars not worked out tonight" : `${night.allStars.length} all star${night.allStars.length === 1 ? "" : "s"}`}.`,
    );
  } catch (err: any) {
    summary.skipped += 1;
    log(`${studio.name}: client states skipped tonight, last night's stand: ${err?.message || err}`);
  }
}

/**
 * Every live studio in `options.studios`, one at a time (the renewals job
 * calls `runJourneyStudio` itself, as each studio's snapshots are written).
 */
export async function runJourneyStep(options: JourneyStepOptions): Promise<JourneyStepSummary> {
  const { db, now } = options;
  const log = options.log ?? ((line: string) => console.log(`[journey] ${line}`));
  const summary = emptyJourneySummary();

  const live = options.studios.filter((s) => s.live);
  if (live.length === 0) {
    log(NONE_LIVE_LINE);
    return summary;
  }

  // 1. Max Strength's defaults, once. A failed read falls through to the app's
  // defaults; the summary records the lines used, so a screen whose lines
  // differ never trusts tonight's states.
  const company = await readCompanyDefaults(db, log);

  const tzById = new Map(options.studios.map((s) => [s.id, s.tz]));
  const tzOf = (id: string) => tzById.get(id) ?? "America/New_York";
  for (const studio of live) {
    await runJourneyStudio(
      {
        db,
        studio,
        allStudios: options.allStudios,
        company,
        bookingsByClient: options.bookingsByClient,
        visitDaysOf: options.visitDaysOf,
        tzOf,
        now,
        dryRun: options.dryRun,
        log,
      },
      summary,
    );
  }
  return summary;
}
