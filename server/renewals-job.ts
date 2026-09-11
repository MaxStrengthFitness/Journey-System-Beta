/**
 * The nightly renewals job. Render runs it through server/cron-renewals.ts;
 * scripts/run-renewals.ts runs the same code from the PC (dry run by default).
 *
 * Round: Renewals, Phase 4 (Sep 2026). See OPERATIONS-RENEWALS-PROPOSAL.md
 * §5.5. In three passes:
 *
 *   1. For every studio: read its renewal settings and its clients, and build
 *      each client's snapshot from what is already stored.
 *   2. Pull Mindbody (contracts + pricing options) for the clients who most
 *      need it, across all studios — near a renewal, never pulled, or a month
 *      stale — inside a nightly budget, and rebuild those snapshots.
 *   3. Record how packages ended (renewed, upgraded, downgraded, lost) on
 *      their renewal cycles — features/renewals/outcomes.ts decides; a
 *      leader's outcome is never overwritten.
 *   4. Write clients/{id}.renewal only where it changed, and the names each
 *      studio's Mindbody uses (config/renewalsSeen) for the settings screen.
 *
 * FIXED WINDOWS. Bookings from 90 days back to 30 ahead and workouts from the
 * last 90 days: the cost stays flat as history grows. (The leaderboard job
 * reads every exercise log ever written, every night; this one must not.)
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
import { mindbodyConfigured, pullClientCommercial } from "./mindbody-client.ts";
import { mapContractRecords, mapServiceRecords } from "../src/lib/mindbody-commercial-map.ts";
import { DEFAULT_TIME_ZONE, isValidTimeZone, studioTodayKey } from "../src/lib/studio-time.ts";
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
import { mindbodyIdOf, namesSeenFrom, pullRank } from "../src/features/renewals/job-plan.ts";
import type { Client, ScheduleEntry, WorkoutSession } from "../src/types.ts";
import type { RenewalCycle, RenewalSettings, RenewalSnapshot } from "../src/features/renewals/types.ts";

const DAY_MS = 86_400_000;
const BATCH_LIMIT = 400;
/** Default nightly Mindbody budget, in clients (2 calls each: ~600 calls). */
export const DEFAULT_MAX_PULLS = 300;
const PULL_CONCURRENCY = 4;

export interface RenewalsRunOptions {
  db: Firestore;
  /** Compute everything, write nothing. */
  dryRun?: boolean;
  /** Skip Mindbody entirely and use what is already stored. */
  noPulls?: boolean;
  /** Clients to pull from Mindbody tonight, across all studios. */
  maxPulls?: number;
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
  mindbodyCalls: number;
  bySituation: Record<string, number>;
}

interface StudioRun {
  id: string;
  name: string;
  tz: string;
  today: string;
  site: string;
  settings: RenewalSettings;
  nameIndex: PackageNameIndex;
  attendanceSince: string | null;
  clients: Client[];
  snapshots: Map<string, RenewalSnapshot>;
  /** The names list as stored, to skip rewriting it when nothing changed. */
  namesStored: string;
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

export async function runRenewals(options: RenewalsRunOptions): Promise<RenewalsRunSummary> {
  const { db } = options;
  const log = options.log ?? ((line: string) => console.log(`[renewals] ${line}`));
  const now = options.now ?? new Date();
  const dryRun = Boolean(options.dryRun);
  const canPull = !options.noPulls && mindbodyConfigured();
  if (!options.noPulls && !mindbodyConfigured()) {
    log("Mindbody credentials are not set: using stored data only.");
  }

  const summary: RenewalsRunSummary = {
    studios: 0,
    clients: 0,
    snapshotsWritten: 0,
    outcomesWritten: 0,
    pulls: 0,
    pullFailures: 0,
    mindbodyCalls: 0,
    bySituation: {},
  };

  /* ================= Read everything once ================= */
  const studioDocs = (await db.collection("studios").get()).docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }))
    .filter((s) => !options.onlyStudio || s.id === options.onlyStudio);

  const machineNames: Record<string, string> = {};
  (await db.collection("machines").get()).docs.forEach((d) => {
    const name = d.get("name");
    if (typeof name === "string" && name.trim()) machineNames[d.id] = name.trim();
  });

  // One query for every studio's bookings: a cross-training client's visits
  // at another location still count toward their pace.
  const schedulesSnap = await db
    .collection("schedules")
    .where("startTime", ">=", Timestamp.fromMillis(now.getTime() - 91 * DAY_MS))
    .where("startTime", "<=", Timestamp.fromMillis(now.getTime() + 31 * DAY_MS))
    .get();
  const schedulesByClient = new Map<string, ScheduleEntry[]>();
  schedulesSnap.docs.forEach((d) => {
    const row = d.data() as ScheduleEntry;
    if (!row.clientId) return;
    const list = schedulesByClient.get(row.clientId) ?? [];
    list.push(row);
    schedulesByClient.set(row.clientId, list);
  });

  const sessionsSince = new Date(now.getTime() - 91 * DAY_MS).toISOString().slice(0, 10);
  const sessionsSnap = await db.collection("sessions").where("date", ">=", sessionsSince).get();
  const sessionsByClient = new Map<string, WorkoutSession[]>();
  sessionsSnap.docs.forEach((d) => {
    const s = d.data() as WorkoutSession;
    if (!s.clientId) return;
    const list = sessionsByClient.get(s.clientId) ?? [];
    list.push(s);
    sessionsByClient.set(s.clientId, list);
  });
  log(
    `Read ${studioDocs.length} studios, ${schedulesSnap.size} bookings and ${sessionsSnap.size} workouts in the window.`,
  );

  const build = (run: StudioRun, client: Client): RenewalSnapshot => {
    const schedules = schedulesByClient.get(client.id!) ?? [];
    const sessions = sessionsByClient.get(client.id!) ?? [];
    return buildRenewalSnapshot({
      client,
      settings: run.settings,
      today: run.today,
      attendance: [
        ...attendanceFromSchedules(schedules, now, run.tz),
        ...attendanceFromSessions(sessions, run.tz, run.today),
      ],
      sessionFeel: feelFromSessions(sessions, run.tz),
      machineNames,
      attendanceSince: run.attendanceSince,
      nameIndex: run.nameIndex,
    });
  };

  /* ================= 1. Snapshots from stored data ================= */
  const runs: StudioRun[] = [];
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
    const clientsSnap = await db.collection("clients").where("homeStudioId", "==", studio.id).get();
    const seenSnap = await db.doc(`studios/${studio.id}/config/renewalsSeen`).get();
    const run: StudioRun = {
      id: studio.id,
      name: typeof studio.name === "string" ? studio.name : studio.id,
      tz,
      today: studioTodayKey(now, tz),
      site: studio.mindbodySiteId ? String(studio.mindbodySiteId).trim() : "",
      settings,
      nameIndex: buildPackageNameIndex(settings),
      attendanceSince: earliest.empty ? null : attendanceSinceOf(earliest.docs[0].get("startTime"), tz),
      clients: clientsSnap.docs.map((d) => ({ ...(d.data() as Client), id: d.id })),
      snapshots: new Map(),
      namesStored: stableStringify(seenSnap.exists ? seenSnap.get("names") ?? null : null),
    };
    for (const c of run.clients) run.snapshots.set(c.id!, build(run, c));
    runs.push(run);
    summary.studios++;
    summary.clients += run.clients.length;
  }

  /* ================= 2. Mindbody pulls, most urgent first ================= */
  if (canPull) {
    const candidates = runs
      .filter((run) => run.site)
      .flatMap((run) =>
        run.clients.map((c) => ({
          run,
          c,
          rank: pullRank({ client: c, current: run.snapshots.get(c.id!)!, today: run.today }),
        })),
      )
      .filter((x) => x.rank !== null)
      .sort((a, b) => (a.rank as number) - (b.rank as number));
    const chosen = candidates.slice(0, Math.max(0, options.maxPulls ?? DEFAULT_MAX_PULLS));
    log(`${candidates.length} clients could use a Mindbody pull; pulling ${chosen.length} tonight.`);

    await pool(chosen, PULL_CONCURRENCY, async ({ run, c }) => {
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
        run.snapshots.set(c.id!, build(run, c));
      } catch (err: any) {
        summary.pullFailures++;
        log(`Mindbody pull failed for a client at ${run.name}: ${err?.message || err}`);
      }
    });
  }

  /* ================= 3. Outcomes: how packages ended ================= */
  // Before the snapshots on purpose: if this fails, tonight's snapshots
  // aren't written either, so tomorrow sees the same change and records it.
  for (const run of runs) {
    const found: Array<{ c: Client; cand: OutcomeCandidate; ref: DocumentReference }> = [];
    for (const c of run.clients) {
      const cand = outcomeCandidate({
        stored: c.renewal ?? null,
        next: run.snapshots.get(c.id!)!,
        settings: run.settings,
        today: run.today,
      });
      if (!cand || !CYCLE_KEY_PATTERN.test(cand.cycleKey)) continue;
      found.push({ c, cand, ref: db.doc(`studios/${run.id}/renewals/${cand.cycleKey}`) });
    }
    if (found.length === 0) continue;

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
        const primary = c.renewal?.primaryTrainerId ?? run.snapshots.get(c.id!)!.primaryTrainerId ?? null;
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

  /* ================= 4. Write what changed ================= */
  for (const run of runs) {
    const writes: Array<(batch: WriteBatch) => void> = [];
    for (const c of run.clients) {
      const snap = run.snapshots.get(c.id!)!;
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
    const names = namesSeenFrom(run.clients);
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
      `${run.name}: ${run.clients.length} clients, ${writes.length} snapshots ${dryRun ? "would change" : "written"}, ` +
        `${Object.keys(names).length} Mindbody names seen${run.attendanceSince ? "" : ", no bookings synced yet"}.`,
    );
  }

  log(
    `Done${dryRun ? " (dry run — nothing written)" : ""}. ${summary.clients} clients, ` +
      `${summary.snapshotsWritten} snapshots ${dryRun ? "would change" : "written"}, ` +
      `${summary.outcomesWritten} outcomes ${dryRun ? "would be recorded" : "recorded"}, ` +
      `${summary.pulls} Mindbody pulls (${summary.mindbodyCalls} calls, ${summary.pullFailures} failed). ` +
      `Situations: ${Object.entries(summary.bySituation)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")}.`,
  );
  return summary;
}
