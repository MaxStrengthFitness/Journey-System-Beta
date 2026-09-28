/**
 * What the Openings summary would be built from, per studio. ALWAYS READ-ONLY:
 * there is no --commit, and nothing here writes anything or asks Mindbody
 * anything.
 *
 * Round: Openings (Sep 27 2026; docs/rounds/2026-09-27-openings.md, "A new
 * step in the Sunday job"). Before trusting a word on Openings, AJ can hold
 * one studio's weeks against Mindbody's own report. It makes exactly the
 * reads the Sunday job's step makes (server/openings-step.ts: the studios,
 * the trainers, and per linked studio its eight weeks of bookings, at most
 * three months of the whole-read record, its standing weeks and last
 * Sunday's summary), folds them with the same code, and prints:
 *
 *   - the window, and how many weeks count so far (four are needed before
 *     the usual week says anything);
 *   - the whole-read record: which days of the window Journey read in full
 *     (the Demo studio has none: nothing pulls its bookings, the seeder wrote
 *     them, so the report says the record isn't used there);
 *   - per week: the rows on file, the cancellations (early, late, found after
 *     the start, and the old sweep's unstamped ones), the Mindbody
 *     "Unavailable" blocks (`isStaffBlock`: never bookings), and how many rows
 *     carry the webhook's stamp against rows that don't (a pull wrote them,
 *     or the Demo seeder);
 *   - each day as the summary would have it, with its live bookings;
 *   - the summary's size against its ceiling.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/openings-report.ts                    # every linked studio
 *   npx tsx scripts/openings-report.ts --studio westlake  # one studio
 *
 * Needs service-account.json in the project folder (scripts/lib/admin.ts).
 */

import { connectFirestore, flag } from "./lib/admin.ts";
import {
  buildDocument,
  kib,
  messageOf,
  openingsReport,
  readOpeningsStudios,
  readOpeningsTrainers,
  readStudio,
  type BuiltDocument,
  type OpeningsReport,
  type ReportCancellations,
  type ReportDayStatus,
  type StudioRead,
} from "../server/openings-step.ts";
import { SKIP_ABOVE_BYTES, WINDOW_WEEKS } from "../src/features/openings/fold.ts";
import { MIN_WEEKS } from "../src/features/openings/usual.ts";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon, Sep 14": the day's own name, never the computer's clock. */
function dayName(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MONTH[m - 1]} ${d}`;
}

const n = (value: number) => value.toLocaleString("en-US");

/** The day's mark in the table. */
const MARK: Record<ReportDayStatus, string> = {
  judged: "ok",
  "not-agreed": "a",
  "not-placed": "p",
  "not-read": "r",
  closed: "c",
};

const cancelledText = (c: ReportCancellations) => {
  const stamped = c.early + c.late + c.afterStart;
  return `${n(stamped)} stamped (${n(c.late)} late, ${n(c.afterStart)} found after the start), ${n(c.unstamped)} unstamped`;
};

function print(name: string, id: string, tz: string, r: OpeningsReport) {
  console.log("");
  console.log(`${name} (${id}), on ${tz}`);
  console.log(`  Window: ${dayName(r.first)} to ${dayName(r.last)}, the last ${WINDOW_WEEKS} Monday-to-Saturday weeks.`);
  console.log(
    `  Weeks counted: ${r.weeksCounted} of ${WINDOW_WEEKS}` +
      (r.weeksCounted >= MIN_WEEKS ? "." : ` (the usual week needs ${MIN_WEEKS} before it says anything).`),
  );
  if (r.recordUsed) {
    const months = r.months.map((m) => `${m.month}: ${m.days === null ? "can't read" : `${n(m.days)} days`}`).join(", ");
    console.log(
      `  Whole-read record: ${n(r.daysRecorded)} of the window's ${n(r.daysInWindow)} days read in full` +
        (r.daysCantTell ? `, ${n(r.daysCantTell)} can't tell (a month couldn't be read)` : "") +
        ` (${months}).`,
    );
  } else {
    console.log("  Whole-read record: not used here. Nothing pulls the Demo studio's bookings (the Demo seeder wrote them),");
    console.log("  so which of its days count is Demo's own rule; each day's mark below is the summary's own.");
  }
  console.log(
    `  Last Sunday's summary: ${r.previousState === "ok" ? "read" : r.previousState === "none" ? "none yet" : "couldn't be read (older weeks use only the agreed weeks as they are now)"}.`,
  );
  console.log(
    `  Summary: ${kib(r.bytes)} (the job skips a studio above ${kib(SKIP_ABOVE_BYTES)})` + (r.refused ? ` - WOULD BE SKIPPED: ${r.refused}.` : "."),
  );
  console.log(
    `  Rows read: ${n(r.rows)}. Cancelled: ${cancelledText(r.cancelled)}. "Unavailable" blocks: ${n(r.unavailable)}. ` +
      `Webhook-stamped: ${n(r.webhook)}, not webhook-stamped: ${n(r.rows - r.webhook)}${r.recordUsed ? "" : " (written by the Demo seeder)"}.` +
      (r.sundayRows ? ` On Sundays (never folded): ${n(r.sundayRows)}.` : "") +
      (r.unreadable ? ` With no readable start: ${n(r.unreadable)}.` : ""),
  );
  console.log("");
  console.log("  Week of       Rows  Cancelled  Unavail.  Webhook   Mon      Tue      Wed      Thu      Fri      Sat");
  for (const w of r.weeks) {
    const cancelled = w.cancelled.early + w.cancelled.late + w.cancelled.afterStart + w.cancelled.unstamped;
    const days = w.days.map((d) => `${String(d.booked).padStart(4)} ${MARK[d.status].padEnd(3)}`).join(" ");
    console.log(
      `  ${dayName(w.monday).padEnd(12)}${String(w.rows).padStart(6)}${String(cancelled).padStart(11)}${String(w.unavailable).padStart(10)}${String(w.webhook).padStart(9)}   ${days}`,
    );
  }
  console.log("  Each day: its live bookings, then ok = counted and judged, a = counted, not judged (a trainer booked that day");
  console.log(
    `  had no agreed week), p = counted, not judged (a booking Journey can't place), r = ${r.recordUsed ? "not read in full" : "not counted (Demo's own rule)"},`,
  );
  console.log("  c = closed, or nearly.");
}

async function main() {
  const studio = flag("studio");
  const db = connectFirestore();
  console.log("READ-ONLY: this report writes nothing and asks Mindbody nothing.");
  const now = new Date();
  const { linked, unlinked } = await readOpeningsStudios(db, studio ? [studio] : undefined);
  if (linked.length === 0 && unlinked.length === 0) {
    console.log(studio ? `No studio with the id "${studio}".` : "No studios.");
    process.exit(0);
  }
  const trainers = await readOpeningsTrainers(db);
  // The reads, the fold and this report each fail for their own reasons, and each says which.
  for (const s of linked) {
    let read: StudioRead;
    try {
      read = await readStudio(db, s, trainers, now);
    } catch (err) {
      console.log("");
      console.log(`${s.name} (${s.id}): a read failed, so the job would skip it and keep last week's. ${messageOf(err)}`);
      continue;
    }
    let built: BuiltDocument;
    try {
      built = buildDocument(read.input);
    } catch (err) {
      console.log("");
      console.log(`${s.name} (${s.id}): the summary couldn't be built, so the job would skip it and keep last week's. ${messageOf(err)}`);
      continue;
    }
    let report: OpeningsReport;
    try {
      report = openingsReport(read, built);
    } catch (err) {
      console.log("");
      console.log(
        `${s.name} (${s.id}): this report couldn't be drawn, which is the report's own trouble, not the job's: ` +
          (built.refused ? `the job would skip it (${built.refused}).` : `the job would still write its summary (${kib(built.bytes)}).`) +
          ` ${messageOf(err)}`,
      );
      continue;
    }
    print(s.name, s.id, s.tz, report);
  }
  for (const s of unlinked) {
    console.log("");
    console.log(`${s.name} (${s.id}): its bookings aren't linked to Journey, so it gets no Openings summary.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
