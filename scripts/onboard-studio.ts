/**
 * THE PRE-LAUNCH SYNC — every client who matters, a few days before a launch.
 *
 * The cost plan (docs/rounds/2026-09-26-cost-plan.md, Part B). Brings
 * everyone booked at a studio in the next 30 days, and everyone who trained
 * there in the last 6 months (AJ, Sep 26 2026), up to date with Mindbody, so
 * launch day's Hub has real names, visit counts and packages - and nobody
 * reads "New" who has been coming for twelve years. Everyone else is synced
 * the first time they are booked, by the nightly job.
 *
 * WHAT IT COSTS: about 5 Mindbody calls a client (Master Sync, exactly what
 * the profile's Sync button does) plus a page of appointments per 500
 * bookings to find who counts - about $2 for a 210-client studio at $0.002 a
 * call. Money is not the constraint; correctness, pace and proof are.
 *
 * SAFETY MODEL (the house pattern, scripts/backfill-client-since.ts):
 *   - DRY RUN BY DEFAULT. Without --commit it asks Mindbody only for the
 *     appointments (to find who counts), reads Journey, and prints what it
 *     would do and what it would cost. Nothing is written.
 *   - A client already Master-Synced is SKIPPED, always (--resync to redo
 *     one on purpose), so re-running costs nothing.
 *   - Each client is ONE batch: made (when new), the contract and membership
 *     maps merged, the rest updated - all or nothing. The fields are Master
 *     Sync's own (lib/mindbody-master-patch.ts, the same code the button
 *     runs): Mindbody's fields only, never a coach's; a blank never blanks.
 *   - A RESUME LOG in backups/, appended only after a client fully succeeds,
 *     so a run that stops restarts where it stopped.
 *   - A JSON REPORT of every decision in backups/ (gitignored: it carries
 *     names), dry run or not.
 *   - THE TWO-SITE RULE (lib/mindbody-site.ts): a number the other site's
 *     client already holds becomes clients/{site}-{id}, as the pull and the
 *     webhook do. The collision check found 43 such numbers.
 *   - A GENTLE PACE: 2 calls a second by default (--rate), through the same
 *     token bucket, retry and breaker the server uses. That limiter is per
 *     process, so this one does not share Render's: run it in the evening,
 *     after the studios' pull hours.
 *   - ONE EVENING'S SHARE AT A TIME (AJ, Sep 26 2026: "we have time to get
 *     the 3 corporate studios ready before getting them on the app - that
 *     would be smarter than a 100 dollar bill"). A run stops at --max-calls,
 *     500 by default (about 100 clients), and the next evening's run carries
 *     on from the resume log. The dry run says how many evenings a studio
 *     takes. If the account has the daily free allowance the Sep 2026 invoice
 *     suggests, a share this size may cost nothing at all.
 *   - A failed appointments page stops the run before anything is written:
 *     a short list would leave people out and look whole.
 *   - WHO COUNTS IS READ ONCE A WEEK, not every evening: the appointments
 *     that decide it (20-120 calls) are kept in backups/ - four fields each,
 *     no names - and reused for 7 days. --verify always reads them fresh, as
 *     the proof must; --refresh-scope forces it.
 *
 * USAGE (PowerShell, from the project folder - it needs .env's Mindbody keys
 * and service-account.json, like the other data scripts)
 *   npx tsx scripts/onboard-studio.ts --studio solon                 # dry run
 *   npx tsx scripts/onboard-studio.ts --studio solon --commit --limit 25
 *   npx tsx scripts/onboard-studio.ts --studio solon --commit        # the next evening's share
 *   npx tsx scripts/onboard-studio.ts --studio solon --verify        # the proof
 *   npx tsx scripts/onboard-studio.ts --studio westlake,strongsville,willoughby
 *       (the shared site: one appointments pull for all three)
 *
 * Flags: --commit, --verify, --limit N, --resync, --rate N (calls a second),
 * --max-calls N (500), --months N (6), --ahead N (30), --refresh-scope,
 * --key <service account>.
 */

import fs from "fs";
import path from "path";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { connectFirestore, flag, hasFlag, writeReport } from "./lib/admin.ts";
import {
  newClientRecord,
  onboardWindow,
  planClient,
  scopeFromAppointments,
  windowChunks,
  type ScopeAppointment,
  type ScopeEntry,
} from "../src/lib/onboarding.ts";
import { chooseClientDoc, siteQualifiedClientId } from "../src/lib/mindbody-site.ts";
import { mindbodyIdConflict } from "../src/lib/mindbody-id.ts";
import { buildMasterSyncPatchWith, type MasterSyncFound } from "../src/lib/mindbody-master-patch.ts";
import { DEFAULT_TIME_ZONE, studioTodayKey } from "../src/lib/studio-time.ts";

/** Master Sync, counted from server/mindbody-client.ts pullClientMaster. */
const CALLS_PER_CLIENT = 5;
/** The pricing page AJ sent (Sep 26 2026). Check it against the invoice. */
const DOLLARS_PER_CALL = 0.002;
const PAGE = 500;
/** How long the appointments that decide who counts are reused. */
const SCOPE_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

const commit = hasFlag("commit");
const verify = hasFlag("verify");
const resync = hasFlag("resync");
const limit = Number(flag("limit") ?? Infinity);
const rate = Number(flag("rate") ?? 2);
/** One evening's share (AJ, Sep 26): about 100 clients at 5 calls each. */
const maxCalls = Number(flag("max-calls") ?? 500);
const monthsBack = Number(flag("months") ?? 6);
const daysAhead = Number(flag("ahead") ?? 30);

/* The server's floor reads its pace from the environment when it loads, so it
   is set before the Mindbody client is imported (below, dynamically). */
process.env.MINDBODY_RATE_PER_SEC = String(rate > 0 ? rate : 2);
process.env.MINDBODY_RATE_BURST = String(rate > 0 ? Math.max(1, Math.ceil(rate)) : 2);

type Decision = {
  studio: string;
  mindbodyClientId: string;
  docId: string | null;
  name: string | null;
  reasons: string[];
  lastSeen: string | null;
  nextBooking: string | null;
  outcome:
    | "would-sync"
    | "would-create"
    | "synced"
    | "created"
    | "already-synced"
    | "done-this-run"
    | "conflict"
    | "not-found"
    | "failed"
    | "partial"
    | "over-limit"
    | "unsynced";
  changedFields?: string[];
  error?: string;
};

function die(message: string): never {
  console.error(`\nSTOPPED: ${message}`);
  process.exit(1);
}

async function main() {
  const studioArg = flag("studio");
  if (!studioArg) die("say which studio: --studio <id> (or several on one site, comma-separated).");
  if (commit && verify) die("--commit and --verify are separate runs.");
  const wanted = studioArg.split(",").map((s) => s.trim()).filter(Boolean);

  const mb = await import("../server/mindbody-client.ts");
  if (!mb.mindbodyConfigured()) die("the Mindbody keys are not in .env (MINDBODY_API_KEY, MINDBODY_SOURCE_NAME, MINDBODY_SOURCE_PASSWORD).");

  const db = connectFirestore();
  console.log("=".repeat(76));
  console.log(
    `Pre-launch sync - ${commit ? "COMMIT (writes)" : verify ? "VERIFY (reads only)" : "DRY RUN (writes nothing)"}`,
  );
  console.log(`Studios: ${wanted.join(", ")} · ${monthsBack} months back, ${daysAhead} days ahead`);
  console.log("=".repeat(76));

  /* ---- the studios, and the site they share ---- */
  const studiosSnap = await db.collection("studios").get();
  const studios: Array<Record<string, any> & { id: string }> = studiosSnap.docs.map((d) => ({
    ...(d.data() as Record<string, any>),
    id: d.id,
  }));
  const chosen = wanted.map((id) => studios.find((s) => s.id === id) ?? die(`no studio with id "${id}".`));
  const sites = new Set(chosen.map((s) => String(s.mindbodySiteId ?? "").trim()));
  if (sites.has("")) die("a chosen studio has no Mindbody Site ID.");
  if (sites.size !== 1) die("give studios on ONE Mindbody site per run (they share one appointments pull).");
  const site = [...sites][0];
  const siblings = studios.filter((s) => String(s.mindbodySiteId ?? "").trim() === site);
  const shared = siblings.length > 1;
  for (const s of chosen) {
    if (shared && !String(s.mindbodyLocationId ?? "").trim()) {
      die(`${s.name ?? s.id} shares site ${site} but has no Mindbody Location ID, so its bookings cannot be told apart.`);
    }
  }
  const timeZone = String(chosen[0].timezone || DEFAULT_TIME_ZONE);
  const today = studioTodayKey(new Date(), timeZone);
  const { from, to } = onboardWindow(today, monthsBack, daysAhead);
  console.log(`Site ${site}${shared ? ` (shared by ${siblings.length} studios)` : ""} · window ${from} to ${to}`);

  /* ---- who counts: one appointments pull, a month at a time ---- */
  let calls = 0;
  const scopeFile = path.resolve(process.cwd(), "backups", `onboard-${wanted.join("+")}.scope.json`);
  let appointments: ScopeAppointment[] | null = null;
  if (!verify && !hasFlag("refresh-scope") && fs.existsSync(scopeFile)) {
    try {
      const kept = JSON.parse(fs.readFileSync(scopeFile, "utf-8"));
      const fresh = Date.now() - Date.parse(kept.pulledAt) < SCOPE_KEEP_MS;
      // A day or two later the window has moved on a little; the kept read
      // still says who counted, and once the studio is live the nightly job
      // syncs anyone new the night before their first session.
      if (fresh && kept.site === site && Array.isArray(kept.appointments)) {
        appointments = kept.appointments;
        console.log(
          `Appointments: reusing ${kept.appointments.length} read ${String(kept.pulledAt).slice(0, 10)} ` +
            `for ${kept.from} to ${kept.to} (--refresh-scope to read again)`,
        );
      }
    } catch {
      appointments = null;
    }
  }
  if (!appointments) {
    const read: ScopeAppointment[] = [];
    for (const chunk of windowChunks(from, to, 31)) {
      let offset = 0;
      for (;;) {
        const r = await mb.mindbodyGet(site, "appointment/staffappointments", {
          StartDate: `${chunk.start}T00:00:00`,
          EndDate: `${chunk.end}T23:59:59`,
          Limit: PAGE,
          Offset: offset,
        });
        calls++;
        if (!r.ok) {
          die(
            `Mindbody refused the appointments for ${chunk.start}-${chunk.end} (${r.status}: ${String(r.error).slice(0, 200)}). ` +
              "Nothing was written: a short list would leave people out and look whole.",
          );
        }
        const page: ScopeAppointment[] = r.data?.Appointments || r.data?.appointments || [];
        read.push(...page);
        const total = Number(r.data?.PaginationResponse?.TotalResults ?? 0);
        offset += PAGE;
        if (page.length < PAGE || offset >= total) break;
      }
    }
    // Four fields each and no names: enough to decide who counts again.
    appointments = read.map((a) => ({
      ClientId: (a.Client?.Id ?? a.ClientId) as string | number | undefined,
      LocationId: (a.Location?.Id ?? a.LocationId) as string | number | undefined,
      StartDateTime: a.StartDateTime,
      Status: a.Status,
    }));
    fs.mkdirSync(path.dirname(scopeFile), { recursive: true });
    fs.writeFileSync(
      scopeFile,
      JSON.stringify({ site, from, to, pulledAt: new Date().toISOString(), appointments }),
    );
    console.log(`Appointments read: ${appointments.length} (${calls} call${calls === 1 ? "" : "s"})`);
  }

  /* ---- per studio: the scope, the records, the plan ---- */
  const resumeFile = path.resolve(process.cwd(), "backups", `onboard-${wanted.join("+")}.resume.txt`);
  const resumed = new Set(
    fs.existsSync(resumeFile) ? fs.readFileSync(resumeFile, "utf-8").split(/\r?\n/).filter(Boolean) : [],
  );
  if (resumed.size && commit) console.log(`Resume log: ${resumed.size} client(s) already done by an earlier run.`);

  const decisions: Decision[] = [];
  const work: Array<{ studio: any; entry: ScopeEntry; docId: string; create: boolean; existing: any }> = [];

  for (const studio of chosen) {
    const locationId = shared ? String(studio.mindbodyLocationId).trim() : null;
    const scope = scopeFromAppointments(appointments, { today, locationId });
    const trained = scope.filter((s) => s.reasons.includes("trained")).length;
    const booked = scope.filter((s) => s.reasons.includes("booked")).length;
    console.log(`\n${studio.name ?? studio.id}: ${scope.length} clients count (${trained} trained recently, ${booked} booked soon)`);

    /* Two reads a client, in batches - the plain number and the site-qualified
       one - never a query in a loop. */
    const plainRefs = scope.map((s) => db.collection("clients").doc(s.mindbodyClientId));
    const qualRefs = scope.map((s) => db.collection("clients").doc(siteQualifiedClientId(site, s.mindbodyClientId)));
    const plainSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
    const qualSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
    for (let i = 0; i < scope.length; i += 200) {
      plainSnaps.push(...(await db.getAll(...plainRefs.slice(i, i + 200))));
      qualSnaps.push(...(await db.getAll(...qualRefs.slice(i, i + 200))));
    }

    scope.forEach((entry, i) => {
      const plain = plainSnaps[i]?.exists ? (plainSnaps[i].data() as Record<string, any>) : null;
      const qual = qualSnaps[i]?.exists ? (qualSnaps[i].data() as Record<string, any>) : null;
      const choice = chooseClientDoc({
        mindbodyClientId: entry.mindbodyClientId,
        site,
        qualifiedExists: !!qual,
        plain,
        studios,
      });
      const record = choice.create ? null : choice.docId === entry.mindbodyClientId ? plain : qual;
      const name = record ? `${record.firstName ?? ""} ${record.lastName ?? ""}`.trim() || null : null;
      const base: Decision = {
        studio: studio.id,
        mindbodyClientId: entry.mindbodyClientId,
        docId: choice.docId,
        name,
        reasons: entry.reasons,
        lastSeen: entry.lastSeen,
        nextBooking: entry.nextBooking,
        outcome: "would-sync",
      };

      if (verify) {
        const synced = typeof record?.mindbodyMasterSyncedAt === "string" && record.mindbodyMasterSyncedAt !== "";
        decisions.push({ ...base, outcome: synced ? "already-synced" : "unsynced" });
        return;
      }

      const plan = planClient({
        record,
        resumed: resumed.has(choice.docId),
        conflict: !!(record && mindbodyIdConflict({ id: choice.docId, ...record } as any)),
        resync,
      });
      if (plan.action === "skip") {
        decisions.push({ ...base, outcome: plan.reason });
        return;
      }
      decisions.push({ ...base, outcome: plan.create ? "would-create" : "would-sync" });
      work.push({ studio, entry, docId: choice.docId, create: plan.create, existing: record });
    });
  }

  const count = (o: Decision["outcome"]) => decisions.filter((d) => d.outcome === o).length;

  /* ---- the proof: everyone in scope who has not been synced ---- */
  if (verify) {
    const unsynced = decisions.filter((d) => d.outcome === "unsynced");
    const file = writeReport(`onboard-verify-${wanted.join("+")}`, {
      generatedAt: new Date().toISOString(),
      window: { from, to },
      inScope: decisions.length,
      synced: count("already-synced"),
      unsynced,
    });
    console.log(`\nIn scope ${decisions.length} · synced ${count("already-synced")} · NOT synced ${unsynced.length}`);
    console.log(`Report: ${file}`);
    console.log(
      unsynced.length === 0
        ? "Nobody in scope is unsynced. That is the result the launch needs."
        : "Those are listed in the report. Run the sync again (it skips everyone done), then --verify again.",
    );
    return;
  }

  const todo = work.slice(0, Number.isFinite(limit) ? limit : work.length);
  const estimate = calls + todo.length * CALLS_PER_CLIENT;
  console.log("\n" + "-".repeat(76));
  console.log(
    `To sync: ${work.length} (${work.filter((w) => w.create).length} new to Journey)` +
      ` · already synced ${count("already-synced")} · done earlier ${count("done-this-run")} · two-id records ${count("conflict")}`,
  );
  const perEvening = Math.max(1, Math.floor(Math.max(0, maxCalls - calls) / CALLS_PER_CLIENT));
  const evenings = Math.max(1, Math.ceil(todo.length / perEvening));
  console.log(
    `All of them: about ${estimate.toLocaleString()} Mindbody calls, about $${(estimate * DOLLARS_PER_CALL).toFixed(2)}`,
  );
  console.log(
    `At ${maxCalls} calls a run (--max-calls), about ${perEvening} clients an evening: ${evenings} evening${evenings === 1 ? "" : "s"}.`,
  );

  if (!commit) {
    const file = writeReport(`onboard-dryrun-${wanted.join("+")}`, {
      generatedAt: new Date().toISOString(),
      window: { from, to },
      estimateCalls: estimate,
      decisions,
    });
    console.log(`\nDRY RUN - nothing written. Report: ${file}`);
    console.log("Read the list. Anyone missing? Anyone who should not be there? Then --commit --limit 25.");
    return;
  }

  /* ---- the run ---- */
  fs.mkdirSync(path.dirname(resumeFile), { recursive: true });
  const toTs = (d: Date) => Timestamp.fromDate(d);
  let done = 0;
  for (const item of work) {
    const decision = decisions.find((d) => d.docId === item.docId && d.studio === item.studio.id)!;
    if (done >= todo.length) {
      decision.outcome = "over-limit";
      continue;
    }
    if (calls >= maxCalls) {
      decision.outcome = "over-limit";
      continue;
    }
    done++;
    const pull = await mb.pullClientMaster(site, item.entry.mindbodyClientId);
    calls += pull.calls;
    if (!pull.response) {
      decision.outcome = "failed";
      decision.error = `${pull.status}: ${String(pull.error).slice(0, 200)}`;
      continue;
    }
    if (pull.response.found !== true) {
      decision.outcome = "not-found";
      continue;
    }
    const res = pull.response as MasterSyncFound;
    const ref = db.collection("clients").doc(item.docId);
    const now = new Date();
    const fresh = item.create
      ? newClientRecord({
          mindbodyClientId: item.entry.mindbodyClientId,
          siteId: site,
          studioId: item.studio.id,
          firstName: res.demographics?.firstName ?? null,
          lastName: res.demographics?.lastName ?? null,
          now: FieldValue.serverTimestamp(),
        })
      : null;
    const existing = (item.existing ?? fresh ?? {}) as any;
    const built = buildMasterSyncPatchWith(existing, res, now, FieldValue.serverTimestamp(), toTs);
    try {
      const batch = db.batch();
      if (fresh) {
        /* One create: nothing to merge into on a record that did not exist,
           and a create fails rather than overwrite if the webhook or the pull
           made the record a moment ago - the next run then syncs it. */
        batch.create(ref, { ...fresh, ...(built.mergeMaps ?? {}), ...built.patch });
      } else {
        /* The runMasterSync order: the maps merge, then the flat update that
           carries mindbodyMasterSyncedAt - in one batch, so all or nothing. */
        if (built.mergeMaps) batch.set(ref, built.mergeMaps, { merge: true });
        batch.update(ref, built.patch);
      }
      await batch.commit();
    } catch (err: any) {
      decision.outcome = "failed";
      decision.error = `saving: ${String(err?.message || err).slice(0, 200)}`;
      continue;
    }
    fs.appendFileSync(resumeFile, `${item.docId}\n`);
    decision.outcome = res.partial ? "partial" : fresh ? "created" : "synced";
    decision.changedFields = built.changedFields;
    decision.name = decision.name ?? `${res.demographics?.firstName ?? ""} ${res.demographics?.lastName ?? ""}`.trim();
    if (done % 25 === 0) console.log(`  ${done} of ${todo.length} · ${calls} calls so far`);
  }

  const file = writeReport(`onboard-${wanted.join("+")}`, {
    generatedAt: new Date().toISOString(),
    window: { from, to },
    calls,
    decisions,
  });
  console.log("\n" + "=".repeat(76));
  console.log(
    `Synced ${count("synced")} · made ${count("created")} · partial ${count("partial")} · not in Mindbody ${count("not-found")}` +
      ` · failed ${count("failed")} · left for next run ${count("over-limit")}`,
  );
  console.log(`Mindbody calls: ${calls} (about $${(calls * DOLLARS_PER_CALL).toFixed(2)})`);
  console.log(`Report: ${file}`);
  if (count("partial")) console.log("Partial: Mindbody could not give every part; the rest landed. Run again with --resync --limit on those later.");
  if (count("failed")) console.log("Failed ones are in the report with Mindbody's words. A second run tries them again.");
  if (count("over-limit")) console.log("Stopped at the limit: run the same command again to carry on.");
  console.log("Then: --verify, and the list it prints must be empty.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

