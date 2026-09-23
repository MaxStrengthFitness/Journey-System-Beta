/**
 * READ-ONLY — which unbounded reads are actually big, and which are theory?
 *
 * Round: efficiency (Sep 23 2026), after a full audit of every Firestore read.
 *
 * WHY THIS EXISTS
 * The audit found ~28 reads that are not bounded by a studio and a window.
 * Four were safe to fix outright. Most of the rest could NOT be safely
 * bounded, for a reason that is easy to miss:
 *
 *   **Any server-side bound excludes documents that lack the field.**
 *   `orderBy("date")` silently drops every session with no `date`.
 *   A bare `limit()` with no `orderBy` returns an ARBITRARY subset.
 *
 * So "add a limit" is not a fix, it is a silent truncation, unless you first
 * know the data supports it. This script answers that with counts rather than
 * estimates, so the remaining work can be decided rather than guessed.
 *
 * WHAT IT COSTS
 * Almost nothing. Every number here is a COUNT aggregation, not a read of the
 * documents -- Firestore bills roughly one read per 1,000 index entries
 * scanned, so counting a 300,000-document collection costs about 300 reads,
 * not 300,000. It never reads a document body and never writes one.
 *
 * READING THE RESULT
 * "Sessions with no date" is the headline: while that is above zero, the
 * Active Session's history listener cannot be bounded without hiding
 * somebody's sessions.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/read-cost-report.ts
 */

import { connectFirestore, writeReport } from "./lib/admin.ts";

type Row = { label: string; count: number | null; note: string };

const rows: Row[] = [];
const say = (label: string, count: number | null, note: string) => {
  rows.push({ label, count, note });
  const n = count === null ? "  (failed)" : String(count).padStart(9);
  console.log(`${n}  ${label}`);
  if (note) console.log(`             ${note}`);
};

async function countOf(q: any): Promise<number | null> {
  try {
    const snap = await q.count().get();
    return snap.data().count as number;
  } catch (e: any) {
    console.error(`   (count failed: ${e?.message ?? e})`);
    return null;
  }
}

async function main() {
  const db = connectFirestore();
  console.log("Read-only. Counts only - no document bodies are read.\n");

  console.log("-- The Active Session's history listener ------------------");
  console.log("WorkoutTrackerView opens a live listener on every session a");
  console.log("client has ever had, with no limit. It is the most-opened");
  console.log("screen in the app. The obvious fix -- orderBy date, limit 30 --");
  console.log("would DROP any session with no `date` field, and the sort in");
  console.log("that file already falls back to startTime, which says some");
  console.log("exist. This is how many.\n");

  const sessions = db.collection("sessions");
  const totalSessions = await countOf(sessions);
  say("sessions, total", totalSessions, "");
  const withDate = await countOf(sessions.orderBy("date"));
  say("sessions carrying a `date`", withDate, "");
  say("sessions carrying a `createdAt`", await countOf(sessions.orderBy("createdAt")), "");

  if (totalSessions !== null && withDate !== null) {
    const missing = totalSessions - withDate;
    console.log("");
    if (missing === 0) {
      console.log("  OK - every session has a date. The listener CAN be bounded:");
      console.log("  orderBy('date','desc') + limit(30). No new index needed;");
      console.log("  sessions clientId+date DESC already exists.");
    } else {
      const pct = totalSessions > 0 ? ((missing / totalSessions) * 100).toFixed(2) : "0";
      console.log(`  STOP - ${missing} session(s) (${pct}%) have no \`date\`.`);
      console.log("  Bounding the listener would hide them. Backfill `date`");
      console.log("  from startTime/createdAt first, then bound it.");
    }
  }

  console.log("\n-- One client profile, on mount --------------------------");
  console.log("useMachineStats and useTopTrainer EACH read the client's whole");
  console.log("session history, and useMachineStats then reads every exercise");
  console.log("log too. Same screen, same client, read twice.\n");

  const clients = db.collection("clients");
  say("clients, total", await countOf(clients), "");

  let worst = { id: "", sessions: 0 };
  try {
    const sample = await clients.select().limit(400).get();
    for (const d of sample.docs) {
      const n = await countOf(sessions.where("clientId", "==", d.id));
      if (n !== null && n > worst.sessions) worst = { id: d.id, sessions: n };
    }
    say(
      "most sessions on one client (sampled 400)",
      worst.sessions,
      `client ${worst.id} - the profile reads this TWICE on open`,
    );
    if (worst.id) {
      say(
        "...and their exercise logs",
        await countOf(db.collection("exerciseLogs").where("clientId", "==", worst.id)),
        "read in full when they pass 60 sessions",
      );
    }
  } catch (e: any) {
    console.error(`   (client sampling failed: ${e?.message ?? e})`);
  }

  console.log("\n-- Read whole, by everyone, with no studio filter ---------");
  say("hub_announcements", await countOf(db.collection("hub_announcements")),
    "LIVE listener in the notification bell, on every signed-in device");
  say("trainers", await countOf(db.collection("trainers")),
    "LIVE listener on every device; also read whole per Mindbody webhook");
  say("machines (the catalog)", await countOf(db.collection("machines")),
    "LIVE listener, no ceiling; grows as studios author their own");
  say("clientMachineSettings", await countOf(db.collection("clientMachineSettings")),
    "read WHOLE by the machine-fit rebuild; grows as clients x machines");
  const totalLogs = await countOf(db.collection("exerciseLogs"));
  say("exerciseLogs, total", totalLogs,
    "the nightly 2am analytics function reads all of these, unfiltered");

  console.log("\n-- Backlogs nobody clears --------------------------------");
  say("limbo queue, unresolved",
    await countOf(db.collection("mindbodyLimbo").where("resolvedAt", "==", null)),
    "read whole, no studio filter, grows with every unmapped booking");
  say("access_requests, pending",
    await countOf(db.collection("access_requests").where("status", "==", "Pending")),
    "LIVE listener, company-wide, no limit");
  say("catalogSubmissions, pending",
    await countOf(db.collection("catalogSubmissions").where("status", "==", "pending")),
    "LIVE listener, company-wide, no limit");
  say("taskInstances, kind=machine",
    await countOf(db.collection("taskInstances").where("kind", "==", "machine")),
    "studio-scoped but NOT date-bounded; ~20/day/studio, forever");

  console.log("\n-- What the nightly jobs read ----------------------------");
  const ninetyDays = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  say("sessions in the last 90 days (all studios)",
    await countOf(sessions.where("createdAt", ">=", ninetyDays)),
    "trainerRollups reads this nightly, across every studio at once");
  say("exerciseLogs in the last 90 days (all studios)",
    await countOf(db.collection("exerciseLogs").where("createdAt", ">=", ninetyDays)),
    "the weekly machine-trends job reads this, across every studio");

  console.log("\n-- The 2am function --------------------------------------");
  const c = rows.find((r) => r.label === "clients, total")?.count ?? 0;
  const nightly = (totalSessions ?? 0) + (totalLogs ?? 0) + c;
  console.log("calculateFacilityAnalyticsV2 reads clients + sessions +");
  console.log("exerciseLogs with NO filter, every night at 2am.");
  console.log(`Tonight that is ${nightly.toLocaleString()} document reads, and it grows`);
  console.log("every day because it reads all of history.");
  console.log("Nothing in the codebase reads what it writes.");

  const file = writeReport("read-cost-report", {
    ranAt: new Date().toISOString(),
    rows,
    heaviestClient: worst,
    nightlyAnalyticsReads: nightly,
  });
  console.log(`\nFull detail: ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
