/**
 * THE SUNDAY JOB'S OPENINGS STEP — step 8 of server/machine-trends-job.ts
 * (Openings round, Sep 27 2026; docs/rounds/2026-09-27-openings.md, "The
 * data", parts 2 and 4). AJ's OK: "thats fine".
 *
 * Once a week it folds each linked studio's last eight weeks of bookings into
 * one small document, `studios/{s}/watch/openings`, so Openings, the
 * Wrap-up's sheet, Team's line and the Overview's line read ONE document by
 * id instead of two months of bookings ("keep running totals instead of
 * re-reading history").
 *
 * EVERY RULE IS THE CORE'S (src/features/openings/, its README's "For the
 * phases to come" is the recipe followed here, step by step). This file only
 * reads, hands the lot to `foldSummary`, and writes what comes back. It keeps
 * no rule of its own: which days count, who was in, whose booking it is and
 * every word are the pure core's, and the screens read the same document
 * through the same `readSummary`.
 *
 * WHICH STUDIOS. Every studio whose bookings are linked to Journey
 * (`bookingsKnown`, the standing week's own test: a Site ID and not marked
 * "offline"), and the Demo studio (`isDemoStudio`), whose days all count
 * because the seeder wrote every booking (`isDemo` on the fold). A studio
 * that isn't linked gets no document; its Openings says so.
 *
 * WHAT IT READS, per studio (the README's recipe):
 *
 *   1. today on the studio's own clock, and `foldWindow`: the eight
 *      Monday-to-Saturday weeks that have ended. Never "now is Sunday", never
 *      UTC days, never the zone of the computer running the job;
 *   2. the bookings: `schedules` where `studioId ==` and `startTime` between
 *      the window's first midnight and its last (the existing (studioId,
 *      startTime) index in firestore.indexes.json; production is Enterprise
 *      edition, which builds no index by itself). Cancellations included:
 *      the core counts them;
 *   3. the whole-read record: `studios/{s}/scheduleCoverage/{month}` for each
 *      of `coverageMonths` (at most three), by id, through `recordedDays`. A
 *      month whose read fails is `null`: its days don't count;
 *   4. the trainers: read ONCE per run for every studio, then, per studio,
 *      those who work there (`worksHere`, the one answer every list of the
 *      team asks, and the realm rule both ways: a Demo trainer is never
 *      placed at a real studio, nor a real one at the Demo studio), through
 *      `trainerRefs` with `staffIdsAt` the studio's site;
 *   5. the standing weeks: `studios/{s}/standingWeeks`, through `normalizeDoc`;
 *   6. last Sunday's summary: `readSummary`, used only when it reads "ok".
 *
 * A READ THAT FAILS SKIPS THE STUDIO, except a month of the record (3,
 * above). Folding without the bookings would record empty weeks; without the
 * standing weeks it would close every agreed week on last Sunday's date;
 * without last Sunday's summary it would forget the agreed weeks' history,
 * which nothing else holds. So the studio is left as it was, last week's
 * document and all, and the others go ahead. A summary that reads back as
 * unreadable (another version, a broken document) is not a failed read: the
 * fold then uses only the current agreed weeks, and the grid says less,
 * never more.
 *
 * WHAT IT WRITES. One `studios/{s}/watch/openings` per studio, built on its
 * own, passed through `summaryForWrite` and `withoutUndefined` (the Admin SDK
 * refuses `undefined`, as the app does), read back through `readSummary`,
 * and held to `SKIP_ABOVE_BYTES` (`storedBytes`, Firestore's own size
 * arithmetic). A studio whose document fails either check is skipped with a
 * log line and keeps last week's. The documents go out in THEIR OWN batch,
 * AFTER the job's main commit, inside the job's own try/catch around this
 * step: nothing here can take the trends, the Kaizen reports or the
 * performance watch down with it. No client names or ids are written.
 *
 * `firestore.rules` needs no change: `match /watch/{watchId}` already lets
 * everyone who works at the studio read it and nothing in the app write it.
 * The Admin SDK is not bound by the rules.
 *
 * NOTHING HERE ASKS MINDBODY ANYTHING. It reads the bookings Journey already
 * synced; there is no Mindbody call, no timer and no new index
 * (weekly-job.test.ts holds this file to it).
 *
 * THE COST, per Sunday (AJ, Sep 27 2026: "i just dont want a big mindbody
 * bill or firestore bill popping up"). The studios' real sizes are 110, 110,
 * 240 and 250 clients, at about 1.87 sessions a client a week (the
 * proposal's "AJ's answers"). Document reads:
 *
 *   studio          bookings in 8 weeks   record + weeks + last summary   total
 *   110 clients     ~1,650                at most ~19                     ~1,670
 *   110 clients     ~1,650                at most ~19                     ~1,670
 *   240 clients     ~3,590                at most ~19                     ~3,610
 *   250 clients     ~3,740                at most ~19                     ~3,760
 *   Demo studio     at most 88 (11 a week) at most ~19                    ~107
 *   once a run      the studios (~5) and every trainer (~100 today)       ~105
 *                                                          about 10,900 a week
 *
 * (bookings = clients x 1.87 x 8; "record + weeks + last summary" = at most
 * 3 months of the record, one standing week per trainer who proposed one,
 * about 15, and 1.) The bookings read also returns the window's cancelled
 * rows; scripts/openings-report.ts counts them. At a one-in-five allowance
 * that is about 2,100 more: about 13,000 document reads a week in all.
 * Priced as if every document were one read at Standard edition's list price
 * ($0.06 per 100,000, docs/business/running-costs.md), that is under a cent a
 * week, about 3.4 cents a month. Production is Enterprise edition, billed in
 * 4 KiB read units; a booking row is about 0.6 KiB, so it is at most that,
 * and less if the units add up across documents. The writes: 5 documents a
 * week (4 studios and the Demo studio), 60 to 120 KiB each. Mindbody calls:
 * zero. It grows with the studios' bookings, never with history: the window
 * is always eight weeks.
 */

import { Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { ScheduleEntry, Trainer } from "../src/types.ts";
import { DEFAULT_TIME_ZONE, isValidTimeZone, studioTodayKey } from "../src/lib/studio-time.ts";
import { worksHere, type TeamMemberLike } from "../src/lib/who-works-here.ts";
import { isDemoStudio } from "../src/features/demo-mode/is-demo.ts";
import { bookingsKnown } from "../src/features/standing-week/team.ts";
import { staffIdsAt } from "../src/features/standing-week/check.ts";
import { normalizeDoc, type StandingWeekDoc } from "../src/features/standing-week/week.ts";
import { withoutUndefined } from "../src/features/studio-tasks/task-wizard.ts";
import { bookingDay, isStaffBlock } from "../src/lib/booking-state.ts";
import { weekdayOf } from "../src/features/studio-tasks/recurrence.ts";
import { COVERAGE_COLLECTION, addDays, recordedDays, wasReadInFull, type CoverageRecord } from "../src/features/openings/coverage.ts";
import { cancellationOf } from "../src/features/openings/room.ts";
import { OPENINGS_WEEKDAYS } from "../src/features/openings/rows.ts";
import {
  SKIP_ABOVE_BYTES,
  coverageMonths,
  foldSummary,
  foldWindow,
  storedBytes,
  type FoldInput,
  type FoldWindow,
} from "../src/features/openings/fold.ts";
import { OPENINGS_WATCH_ID, readSummary, summaryForWrite, type OpeningsSummary, type SummaryRead } from "../src/features/openings/summary-doc.ts";
import { usualWeek } from "../src/features/openings/usual.ts";
import { trainerRefs } from "../src/features/openings/whose.ts";

/** The studio fields the step reads: its clock, whether its bookings are linked, and whether it is the Demo studio. */
const STUDIO_FIELDS = ["name", "timezone", "mindbodySiteId", "mindbodyMode", "isDemo"] as const;

/** The trainer fields the step reads: the booking rule's (id, name, Mindbody link) and who works where. */
const TRAINER_FIELDS = [
  "fullName",
  "mindbodyStaffId",
  "mindbody",
  "primaryHomeStudioId",
  "accessibleStudioIds",
  "activeGuestStudioIds",
  "isActive",
  "supersededByUid",
  "pendingClaim",
  "isDemo",
] as const;

/** A commit may carry 10 MiB; a document here is at most SKIP_ABOVE_BYTES. Stay well under. */
const BATCH_BYTES = 4 * 1024 * 1024;
const BATCH_LIMIT = 400;

/** A studio the step builds a document for. */
export interface OpeningsStudio {
  id: string;
  name: string;
  /** The studio's clock: its own time zone, or Eastern when it has none that reads. */
  tz: string;
  siteId: string | null;
  isDemo: boolean;
}

/** A trainer document, as the step reads it. */
export type OpeningsTrainer = TeamMemberLike & Pick<Trainer, "id"> & Partial<Pick<Trainer, "fullName" | "mindbodyStaffId" | "mindbody">>;

/** What one studio's reads returned, handed to the fold (and to the report script). */
export interface StudioRead {
  window: FoldWindow;
  input: FoldInput;
  /** The window's rows as read, this studio's only (the fold leaves out what isn't a booking). */
  bookings: ScheduleEntry[];
  /** How last Sunday's summary read: "none" (never built), "unreadable", or "ok". */
  previousState: SummaryRead["state"];
}

/** One studio's document, built and checked. */
export interface BuiltDocument {
  doc: OpeningsSummary;
  /** Firestore's own size arithmetic (`storedBytes`). */
  bytes: number;
  /** Weeks with at least one counted day: the core's own count (`usualWeek`). */
  weeksCounted: number;
  /** Why it must not be written, or null. */
  refused: string | null;
}

export type OpeningsOutcome = "written" | "dry-run" | "skipped" | "write-failed";

export interface OpeningsStudioResult {
  studioId: string;
  name: string;
  outcome: OpeningsOutcome;
  /** Why it was skipped, or why its write failed. */
  reason?: string;
  bookingsRead?: number;
  weeksCounted?: number;
  bytes?: number;
}

export interface OpeningsStepSummary {
  studios: OpeningsStudioResult[];
  written: number;
  skipped: number;
}

export interface OpeningsStepOptions {
  db: Firestore;
  now?: Date;
  /** Build everything, write nothing. */
  dryRun?: boolean;
  log?: (line: string) => void;
  /** Only these studio ids (the scripts' --studio). Every linked studio when absent. */
  only?: readonly string[];
}

const textOf = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** A studio document as the step reads it. */
export function openingsStudio(id: string, data: Record<string, unknown>): OpeningsStudio {
  const tz = textOf(data.timezone);
  const siteId = textOf(data.mindbodySiteId).trim();
  return {
    id,
    name: textOf(data.name).trim() || id,
    tz: isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE,
    siteId: siteId || null,
    isDemo: isDemoStudio({ id, isDemo: data.isDemo === true }),
  };
}

/** Does this studio get a document? Linked bookings (the standing week's own test), or the Demo studio. */
export function hasOpenings(id: string, data: Record<string, unknown>): boolean {
  if (isDemoStudio({ id, isDemo: data.isDemo === true })) return true;
  return bookingsKnown({ id, mindbodySiteId: textOf(data.mindbodySiteId), mindbodyMode: data.mindbodyMode === "offline" ? "offline" : undefined });
}

/** The studios that get a document, in id order. */
export async function readOpeningsStudios(db: Firestore, only?: readonly string[]): Promise<{ linked: OpeningsStudio[]; unlinked: OpeningsStudio[] }> {
  const snap = await db.collection("studios").select(...STUDIO_FIELDS).get();
  const linked: OpeningsStudio[] = [];
  const unlinked: OpeningsStudio[] = [];
  for (const d of snap.docs) {
    if (only && only.length > 0 && !only.includes(d.id)) continue;
    const data = (d.data() ?? {}) as Record<string, unknown>;
    (hasOpenings(d.id, data) ? linked : unlinked).push(openingsStudio(d.id, data));
  }
  const byId = (a: OpeningsStudio, b: OpeningsStudio) => a.id.localeCompare(b.id);
  return { linked: linked.sort(byId), unlinked: unlinked.sort(byId) };
}

/** Every trainer document, once a run: the booking rule's fields and who works where. */
export async function readOpeningsTrainers(db: Firestore): Promise<OpeningsTrainer[]> {
  const snap = await db.collection("trainers").select(...TRAINER_FIELDS).get();
  return snap.docs.map((d) => ({ ...((d.data() ?? {}) as Record<string, unknown>), id: d.id }) as OpeningsTrainer);
}

/** The whole-read record's months, by id. A month whose read fails is null: its days don't count. */
async function readCoverage(studioRef: DocumentReference, months: readonly string[]): Promise<CoverageRecord> {
  const out = new Map<string, ReadonlySet<string> | null>();
  await Promise.all(
    months.map(async (month) => {
      try {
        const snap = await studioRef.collection(COVERAGE_COLLECTION).doc(month).get();
        out.set(month, recordedDays(month, snap.exists ? snap.data() : undefined));
      } catch {
        out.set(month, null);
      }
    }),
  );
  return out;
}

/** One studio's reads (the header's 1 to 6). Throws when a read other than the record's fails. */
export async function readStudio(db: Firestore, studio: OpeningsStudio, trainers: readonly OpeningsTrainer[], now: Date): Promise<StudioRead> {
  const today = studioTodayKey(now, studio.tz);
  const window = foldWindow(today, studio.tz);
  const studioRef = db.collection("studios").doc(studio.id);

  const [bookingsSnap, weeksSnap, previousSnap, coverage] = await Promise.all([
    db
      .collection("schedules")
      .where("studioId", "==", studio.id)
      .where("startTime", ">=", Timestamp.fromDate(window.start))
      .where("startTime", "<=", Timestamp.fromDate(window.end))
      .get(),
    studioRef.collection("standingWeeks").get(),
    studioRef.collection("watch").doc(OPENINGS_WATCH_ID).get(),
    readCoverage(studioRef, coverageMonths(window)),
  ]);

  // The query names the studio; a row of another studio's is never this one's.
  const bookings = bookingsSnap.docs
    .map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }) as ScheduleEntry)
    .filter((b) => b.studioId === studio.id);
  const weeks: StandingWeekDoc[] = weeksSnap.docs.map((d) => normalizeDoc(d.id, d.data()));
  const previousRead = readSummary(previousSnap.exists ? previousSnap.data() : undefined);

  const here = trainers.filter((t) => worksHere(t, studio.id));
  const refs = trainerRefs(
    here.map((t) => ({ id: t.id, name: t.fullName ?? "" })),
    staffIdsAt(here, studio.siteId),
  );

  return {
    window,
    bookings,
    previousState: previousRead.state,
    input: {
      studioId: studio.id,
      tz: studio.tz,
      now,
      isDemo: studio.isDemo,
      bookings,
      coverage,
      trainers: refs,
      weeks,
      previous: previousRead.state === "ok" ? previousRead.summary : null,
    },
  };
}

/** The document the fold makes of one studio's reads, and whether it may be written. Pure. */
export function buildDocument(input: FoldInput): BuiltDocument {
  const doc = withoutUndefined(summaryForWrite(foldSummary(input)));
  const bytes = storedBytes(doc);
  const weeksCounted = usualWeek(doc).weeksCounted;
  let refused: string | null = null;
  if (bytes > SKIP_ABOVE_BYTES) refused = `${kib(bytes)} is over the ${kib(SKIP_ABOVE_BYTES)} ceiling`;
  else if (readSummary(doc).state !== "ok") refused = "it would not read back";
  return { doc, bytes, weeksCounted, refused };
}

export const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

/* ------------------------------------------------------------------ *
 * THE REPORT (scripts/openings-report.ts, always read-only). What AJ checks
 * against Mindbody's own report before trusting a word: per week, the rows
 * on file, the cancellations, the Mindbody "Unavailable" blocks
 * (`isStaffBlock`), the rows the webhook has touched, and each day as the
 * summary has it. Nothing here decides anything: the days' verdicts are the
 * built summary's own, the cancellations `cancellationOf`'s and the record
 * `wasReadInFull`'s.
 * ------------------------------------------------------------------ */

/** A day as the built summary has it. */
export type ReportDayStatus = "judged" | "not-agreed" | "not-placed" | "not-read" | "closed";

export interface ReportDay {
  day: string;
  weekday: number;
  /** Live bookings on file that day (the summary's `n`). */
  booked: number;
  status: ReportDayStatus;
  /** The whole-read record for that day: true, false, or null when its month couldn't be read. */
  recorded: boolean | null;
}

export interface ReportCancellations {
  /** Stamped at least LATE_CANCEL_HOURS before the start. */
  early: number;
  late: number;
  /** Stamped at or after its own start (a back-read found it). */
  afterStart: number;
  /** No stamp (the old sweep, or before stamps began): not counted anywhere. */
  unstamped: number;
}

export interface ReportWeek {
  monday: string;
  /** Rows read for Monday to Saturday of this week, "Unavailable" blocks included. */
  rows: number;
  cancelled: ReportCancellations;
  unavailable: number;
  /** Rows carrying the webhook's event stamp (`mindbodyEventAt`); the rest only a pull has written. */
  webhook: number;
  days: ReportDay[];
}

export interface OpeningsReport {
  first: string;
  last: string;
  weeksCounted: number;
  bytes: number;
  refused: string | null;
  previousState: SummaryRead["state"];
  /** Each month of the record the window touches: the days it holds, or null when it couldn't be read. */
  months: { month: string; days: number | null }[];
  /** Monday-to-Saturday days of the window: recorded as read in full, not, and can't tell. */
  daysInWindow: number;
  daysRecorded: number;
  daysCantTell: number;
  rows: number;
  /** Rows on a Sunday: read, never folded (Openings is Monday to Saturday). */
  sundayRows: number;
  /** Rows with no start time Journey can read. */
  unreadable: number;
  unavailable: number;
  webhook: number;
  cancelled: ReportCancellations;
  weeks: ReportWeek[];
}

const STATUS_OF = (d: OpeningsSummary["weeks"][number]["d"][string] | undefined): ReportDayStatus => {
  if (!d || d.x === "r") return "not-read";
  if (d.x === "c") return "closed";
  if (d.j === 1) return "judged";
  return d.q === "p" ? "not-placed" : "not-agreed";
};

const noCancellations = (): ReportCancellations => ({ early: 0, late: 0, afterStart: 0, unstamped: 0 });

/** The report for one studio, from its reads and the document built from them. Pure. */
export function openingsReport(read: StudioRead, built: BuiltDocument): OpeningsReport {
  const { window, input } = read;
  const tz = input.tz;
  const weeks: ReportWeek[] = window.mondays.map((monday, i) => ({
    monday,
    rows: 0,
    cancelled: noCancellations(),
    unavailable: 0,
    webhook: 0,
    days: OPENINGS_WEEKDAYS.map((weekday) => {
      const day = addDays(monday, weekday - 1);
      const stored = built.doc.weeks[i]?.d[String(weekday)];
      return { day, weekday, booked: stored?.n ?? 0, status: STATUS_OF(stored), recorded: wasReadInFull(day, input.coverage) };
    }),
  }));

  const total = { rows: 0, sundayRows: 0, unreadable: 0, unavailable: 0, webhook: 0, cancelled: noCancellations() };
  const tally = (into: { cancelled: ReportCancellations; unavailable: number; webhook: number }, b: ScheduleEntry) => {
    if ((b as { mindbodyEventAt?: unknown }).mindbodyEventAt) into.webhook += 1;
    if (isStaffBlock(b)) {
      into.unavailable += 1;
      return;
    }
    const c = cancellationOf(b);
    if (c === "early") into.cancelled.early += 1;
    else if (c === "late") into.cancelled.late += 1;
    else if (c === "after-start") into.cancelled.afterStart += 1;
    else if (c === "unstamped") into.cancelled.unstamped += 1;
  };
  for (const b of read.bookings) {
    total.rows += 1;
    tally(total, b);
    const day = bookingDay(b, tz);
    if (!day) {
      total.unreadable += 1;
      continue;
    }
    const weekday = weekdayOf(day);
    if (weekday === 0) {
      total.sundayRows += 1;
      continue;
    }
    const week = weeks[window.mondays.indexOf(addDays(day, 1 - weekday))];
    if (!week) continue;
    week.rows += 1;
    tally(week, b);
  }

  const days = weeks.flatMap((w) => w.days);
  return {
    first: window.first,
    last: window.last,
    weeksCounted: built.weeksCounted,
    bytes: built.bytes,
    refused: built.refused,
    previousState: read.previousState,
    months: [...input.coverage.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, set]) => ({ month, days: set ? set.size : null })),
    daysInWindow: days.length,
    daysRecorded: days.filter((d) => d.recorded === true).length,
    daysCantTell: days.filter((d) => d.recorded === null).length,
    ...total,
    weeks,
  };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * Step 8. Reads, folds and writes each linked studio's document. Throws only
 * when the studios or the trainers can't be read (then nothing is written and
 * every studio keeps last week's); the job catches that.
 */
export async function runOpeningsStep(options: OpeningsStepOptions): Promise<OpeningsStepSummary> {
  const { db } = options;
  const log = options.log ?? ((line: string) => console.log(`[openings] ${line}`));
  const now = options.now ?? new Date();
  const dryRun = Boolean(options.dryRun);

  const { linked, unlinked } = await readOpeningsStudios(db, options.only);
  const trainers = await readOpeningsTrainers(db);
  log(
    `Openings: ${plural(linked.length, "studio", "studios")} with linked bookings` +
      (unlinked.length ? `; no document for ${unlinked.map((s) => s.name).join(", ")} (Mindbody not linked)` : "") +
      `${dryRun ? " — DRY RUN" : ""}.`,
  );

  const results: OpeningsStudioResult[] = [];
  const queued: { studio: OpeningsStudio; result: OpeningsStudioResult; doc: OpeningsSummary; bytes: number }[] = [];

  for (const studio of linked) {
    const result: OpeningsStudioResult = { studioId: studio.id, name: studio.name, outcome: "skipped" };
    results.push(result);
    try {
      const read = await readStudio(db, studio, trainers, now);
      result.bookingsRead = read.bookings.length;
      if (read.previousState === "unreadable") {
        log(`  ${studio.name}: last Sunday's summary couldn't be read, so older weeks use only the agreed weeks as they are now.`);
      }
      const built = buildDocument(read.input);
      result.weeksCounted = built.weeksCounted;
      result.bytes = built.bytes;
      const about =
        `${plural(read.bookings.length, "booking", "bookings")} read, ${built.weeksCounted} of ${read.window.mondays.length} weeks counted ` +
        `(${read.window.first} to ${read.window.last}), ${kib(built.bytes)}`;
      if (built.refused) {
        result.reason = built.refused;
        log(`  ${studio.name}: ${about} — SKIPPED: ${built.refused}; last week's is kept.`);
        continue;
      }
      if (dryRun) {
        result.outcome = "dry-run";
        log(`  ${studio.name}: ${about} — would be written.`);
        continue;
      }
      queued.push({ studio, result, doc: built.doc, bytes: built.bytes });
      log(`  ${studio.name}: ${about}.`);
    } catch (err) {
      result.reason = `a read failed: ${err instanceof Error ? err.message : String(err)}`;
      log(`  ${studio.name}: SKIPPED, ${result.reason}; last week's is kept.`);
    }
  }

  // Their own batches: the job's main commit has already gone out.
  let batch = db.batch();
  let inBatch: typeof queued = [];
  let bytes = 0;
  const commit = async () => {
    if (inBatch.length === 0) return;
    const these = inBatch;
    try {
      await batch.commit();
      for (const q of these) q.result.outcome = "written";
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      for (const q of these) {
        q.result.outcome = "write-failed";
        q.result.reason = `the write failed: ${why}`;
      }
      log(`  The write of ${these.map((q) => q.studio.name).join(", ")} FAILED; last week's is kept. ${why}`);
    }
    batch = db.batch();
    inBatch = [];
    bytes = 0;
  };
  for (const q of queued) {
    if (inBatch.length > 0 && (inBatch.length >= BATCH_LIMIT || bytes + q.bytes > BATCH_BYTES)) await commit();
    try {
      batch.set(db.collection("studios").doc(q.studio.id).collection("watch").doc(OPENINGS_WATCH_ID), withoutUndefined(q.doc));
      inBatch.push(q);
      bytes += q.bytes;
    } catch (err) {
      q.result.outcome = "write-failed";
      q.result.reason = `the write was refused: ${err instanceof Error ? err.message : String(err)}`;
      log(`  ${q.studio.name}: the write was refused; last week's is kept. ${q.result.reason}`);
    }
  }
  await commit();

  const written = results.filter((r) => r.outcome === "written").length;
  const skipped = results.filter((r) => r.outcome === "skipped" || r.outcome === "write-failed").length;
  log(
    dryRun
      ? `Openings (dry run — nothing written): ${plural(results.filter((r) => r.outcome === "dry-run").length, "document", "documents")} would be written, ${skipped} skipped.`
      : `Openings: ${plural(written, "document", "documents")} written, ${skipped} skipped.`,
  );
  return { studios: results, written, skipped };
}
