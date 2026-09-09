/**
 * ONE-OFF BACKFILL — give every client a real "Client since" date.
 *
 * WHY THIS EXISTS
 * ---------------
 * The profile card was reporting the day the JOURNEY document was created.
 * For a studio open since 2014 that adopted this app in 2026, that is wrong by
 * a decade for the entire roster.
 *
 * The display code was already correct: it prefers `firstAppointmentDate`, then
 * `mindbodyCreatedAt`, and only falls back to `createdAt`. The problem is that
 * the two Mindbody fields are empty on almost every document, because the only
 * thing that has ever written them is the client.created / client.updated
 * WEBHOOK — and Mindbody fires that when a record CHANGES, so a client not
 * edited since the integration went live has never produced one. Clients
 * created by the pull-sync from appointment payloads never had them at all.
 *
 * WHAT IT WRITES
 * --------------
 * Only `firstAppointmentDate`, plus a `firstAppointmentDateSource` marker so a
 * later run — and a human — can tell where the value came from. It NEVER
 * writes `mindbodyCreatedAt`: that field means "the day Mindbody's record was
 * created" and only Mindbody can answer it. Inventing a value there would
 * quietly outrank a genuine webhook value later.
 *
 * WHERE THE DATE COMES FROM, best first:
 *   1. `firstSessionDate` already on the client — a workout we recorded.
 *   2. The earliest `sessions` document for that client.
 *   3. The earliest `startDate` / `agreementDate` across `mindbodyContracts`,
 *      or `activeDate` / `assignedAt` across `mindbodyMemberships`. Those maps
 *      are already on the document (the commercial sync writes them) and carry
 *      real Mindbody dates.
 * Same order as src/lib/client-since.ts, deliberately — the screen and the
 * backfill must not disagree about what "since" means.
 *
 * SAFETY MODEL
 *   - Dry run by default. Nothing is written without --commit.
 *   - A client that ALREADY has firstAppointmentDate or mindbodyCreatedAt is
 *     SKIPPED, always. Webhook data is authoritative and is never overwritten.
 *   - `update()` with two named fields, so nothing else on the document can be
 *     touched by a bug in here.
 *   - A JSON report of every decision goes to backups/ either way.
 *   - Re-running is harmless: a client fixed by a previous run is skipped by
 *     the rule above.
 *
 * ---------------------------------------------------------------------------
 * AUTH — READ THIS, IT IS DIFFERENT FROM THE OTHER SCRIPTS IN THIS FOLDER
 * ---------------------------------------------------------------------------
 * The other scripts here read the Firebase CLI's cached `tokens.access_token`
 * out of configstore and send it as a bearer token. That has stopped working:
 *
 *   - Current firebase-tools no longer persists an access token at all, only
 *     the long-lived refresh token — so the read comes back undefined and the
 *     script exits instantly having explained nothing.
 *   - Minting a fresh access token from that refresh token does not help
 *     either: the Firestore DATA api rejects it with
 *     401 ACCESS_TOKEN_TYPE_UNSUPPORTED. CLI user credentials are fine for the
 *     management APIs those other scripts use (firebaserules, index listing);
 *     they are not accepted for reading and writing documents.
 *
 * So this one uses the Firebase Admin SDK with a SERVICE ACCOUNT, which is the
 * supported way to do admin data work — and which also bypasses security
 * rules, which a backfill needs anyway.
 *
 * ONE-TIME SETUP (about two minutes):
 *   1. Firebase console -> the gear icon -> Project settings
 *   2. "Service accounts" tab -> "Generate new private key" -> Generate key
 *   3. Save the downloaded .json as `service-account.json` in the project root
 *   4. Confirm .gitignore contains `service-account.json` before committing
 *      anything. That file can read and write your whole database; it must
 *      never reach GitHub, and there is no need to ever paste its contents
 *      anywhere.
 *
 * The same key will work for every future data script, and for the other
 * scripts here once they are moved over too.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/backfill-client-since.ts                  # dry run, everything
 *   npx tsx scripts/backfill-client-since.ts --limit 25       # dry run, first 25
 *   npx tsx scripts/backfill-client-since.ts --studio <id>    # one studio
 *   npx tsx scripts/backfill-client-since.ts --commit         # apply
 *   npx tsx scripts/backfill-client-since.ts --key C:\path\to\key.json
 */

import fs from "fs";
import path from "path";
import { cert, applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const hasFlag = (n: string) => argv.includes(`--${n}`);
const flag = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const COMMIT = hasFlag("commit");
const LIMIT = flag("limit") ? Number(flag("limit")) : Infinity;
const ONLY_STUDIO = flag("studio");

/** Anything older than this is a placeholder, not a start date. */
const MIN_PLAUSIBLE_YEAR = 1990;

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
  : {};

const projectId = flag("project") || config.projectId;
const databaseId =
  flag("database") || config.firestoreDatabaseId || "(default)";

if (!projectId) {
  console.error(
    `No projectId.\n` +
      `  Looked for --project, then "projectId" in ${configPath}.\n` +
      `  Fix: pass --project gen-lang-client-0731527386`,
  );
  process.exit(1);
}

/**
 * Service account key, in the order someone would expect it to be found.
 * Falls through to Application Default Credentials so that a machine set up
 * with `gcloud auth application-default login` also works with no key file.
 */
function buildCredential() {
  const candidates = [
    flag("key"),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), "service-account.json"),
    path.resolve(process.cwd(), "serviceAccountKey.json"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const key = JSON.parse(fs.readFileSync(p, "utf-8"));
      if (!key.private_key || !key.client_email) {
        console.error(
          `${p} is JSON but not a service account key ` +
            `(no private_key / client_email). That is probably the WEB config ` +
            `by mistake — you need the one from Project settings -> Service accounts.`,
        );
        process.exit(1);
      }
      console.log(`Auth: service account ${key.client_email}`);
      console.log(`      from ${p}`);
      return cert(key);
    } catch (err) {
      console.error(`Could not read ${p}: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  if (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT) {
    console.log("Auth: application default credentials");
    return applicationDefault();
  }

  console.error(
    `No service account key found.\n` +
      `  Looked for: --key <path>, GOOGLE_APPLICATION_CREDENTIALS,\n` +
      `              ./service-account.json, ./serviceAccountKey.json\n\n` +
      `  The Firebase CLI login is NOT usable here — the Firestore data API\n` +
      `  rejects CLI user tokens (401 ACCESS_TOKEN_TYPE_UNSUPPORTED).\n\n` +
      `  Get a key: Firebase console -> gear -> Project settings ->\n` +
      `  Service accounts -> Generate new private key. Save it as\n` +
      `  service-account.json in the project root, and make sure .gitignore\n` +
      `  lists it before you commit.`,
  );
  process.exit(1);
}

const app = initializeApp({ credential: buildCredential(), projectId });
const db = getFirestore(app, databaseId);

// ---------------------------------------------------------------------------
// Date reading
// ---------------------------------------------------------------------------

/**
 * Read a stored value as a Date.
 *
 * These fields have been written by three code paths over the project's life —
 * a real Timestamp from the webhook, an ISO string from an early import, an
 * epoch number from a migration. All three must be readable, or the backfill
 * decides a client has no date and overwrites a good one.
 */
function asDate(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;

  let d: Date | null = null;
  if (value instanceof Timestamp) d = value.toDate();
  else if (value instanceof Date) d = value;
  else if (typeof value?.toDate === "function") d = value.toDate();
  else if (typeof value?.seconds === "number") d = new Date(value.seconds * 1000);
  else if (typeof value === "string" || typeof value === "number") {
    d = new Date(value);
  }

  if (!d || Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() < MIN_PLAUSIBLE_YEAR) return null;
  return d;
}

/** Earliest plausible date across a map of records keyed by Mindbody id. */
function earliestInMap(
  map: Record<string, any> | undefined,
  keys: string[],
): Date | null {
  if (!map || typeof map !== "object") return null;
  let best: Date | null = null;
  for (const record of Object.values(map)) {
    if (!record || typeof record !== "object") continue;
    for (const k of keys) {
      const d = asDate((record as any)[k]);
      if (d && (!best || d.getTime() < best.getTime())) best = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------

type Verdict =
  | "already-set"
  | "from-first-session-field"
  | "from-sessions"
  | "from-commercial"
  | "no-evidence";

interface Row {
  clientId: string;
  name: string;
  homeStudioId: string | null;
  verdict: Verdict;
  currentCreatedAt: string | null;
  proposed: string | null;
  yearsAdrift: number | null;
}

async function main() {
  console.log("=".repeat(72));
  console.log(`Client-since backfill — ${projectId} / ${databaseId}`);
  console.log(COMMIT ? "MODE: COMMIT (writing)" : "MODE: DRY RUN (no writes)");
  if (ONLY_STUDIO) console.log(`STUDIO FILTER: ${ONLY_STUDIO}`);
  if (LIMIT !== Infinity) console.log(`LIMIT: ${LIMIT}`);
  console.log("=".repeat(72));

  const clientsSnap = await db.collection("clients").get();
  console.log(`Read ${clientsSnap.size} clients.`);

  /*
   * Earliest session per client, read ONCE for the whole collection rather
   * than per client. A per-client query would be one round trip each; on a
   * roster of a few thousand that is slow and a good way to trip the read
   * quota, which this project has done before. `.select()` keeps it to three
   * fields per document instead of the whole session.
   */
  const sessionsSnap = await db
    .collection("sessions")
    .select("clientId", "date", "startedAt")
    .get();

  const earliestSession = new Map<string, Date>();
  for (const s of sessionsSnap.docs) {
    const data = s.data();
    const cid = data.clientId;
    if (!cid || typeof cid !== "string") continue;
    const d = asDate(data.date) || asDate(data.startedAt);
    if (!d) continue;
    const seen = earliestSession.get(cid);
    if (!seen || d.getTime() < seen.getTime()) earliestSession.set(cid, d);
  }
  console.log(
    `Read ${sessionsSnap.size} sessions — earliest date known for ${earliestSession.size} clients.`,
  );

  const rows: Row[] = [];
  const writes: { id: string; when: Date; source: string }[] = [];
  let considered = 0;

  for (const doc of clientsSnap.docs) {
    if (considered >= LIMIT) break;
    const c = doc.data();
    const homeStudioId = typeof c.homeStudioId === "string" ? c.homeStudioId : null;
    if (ONLY_STUDIO && homeStudioId !== ONLY_STUDIO) continue;
    considered++;

    const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
    const createdAt = asDate(c.createdAt);

    // Webhook data wins, always. Never overwrite it.
    if (asDate(c.firstAppointmentDate) || asDate(c.mindbodyCreatedAt)) {
      rows.push({
        clientId: doc.id,
        name,
        homeStudioId,
        verdict: "already-set",
        currentCreatedAt: createdAt?.toISOString() ?? null,
        proposed: null,
        yearsAdrift: null,
      });
      continue;
    }

    let proposed: Date | null = null;
    let verdict: Verdict = "no-evidence";
    let source = "";

    const fromField = asDate(c.firstSessionDate);
    const fromSessions = earliestSession.get(doc.id) ?? null;
    const fromCommercial =
      earliestInMap(c.mindbodyContracts, ["startDate", "agreementDate"]) ??
      earliestInMap(c.mindbodyMemberships, ["activeDate", "assignedAt"]);

    if (fromField) {
      proposed = fromField;
      verdict = "from-first-session-field";
      source = "backfill:firstSessionDate";
    } else if (fromSessions) {
      proposed = fromSessions;
      verdict = "from-sessions";
      source = "backfill:earliest-session";
    } else if (fromCommercial) {
      proposed = fromCommercial;
      verdict = "from-commercial";
      source = "backfill:earliest-contract";
    }

    const yearsAdrift =
      proposed && createdAt
        ? Math.round(
            ((createdAt.getTime() - proposed.getTime()) / 31_557_600_000) * 10,
          ) / 10
        : null;

    rows.push({
      clientId: doc.id,
      name,
      homeStudioId,
      verdict,
      currentCreatedAt: createdAt?.toISOString() ?? null,
      proposed: proposed?.toISOString() ?? null,
      yearsAdrift,
    });

    if (proposed) writes.push({ id: doc.id, when: proposed, source });
  }

  // ---- write ---------------------------------------------------------------
  if (COMMIT && writes.length) {
    let batch = db.batch();
    let pending = 0;
    let done = 0;
    for (const w of writes) {
      batch.update(db.collection("clients").doc(w.id), {
        firstAppointmentDate: Timestamp.fromDate(w.when),
        firstAppointmentDateSource: w.source,
      });
      pending++;
      if (pending >= 400) {
        await batch.commit();
        done += pending;
        console.log(`  committed ${done}/${writes.length}`);
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending > 0) {
      await batch.commit();
      done += pending;
    }
    console.log(`\nWrote ${done} clients.`);
  }

  // ---- report --------------------------------------------------------------
  const tally = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] || 0) + 1;
    return acc;
  }, {});

  console.log("\nVerdicts:");
  for (const [k, v] of Object.entries(tally)) {
    console.log(`  ${k.padEnd(26)} ${v}`);
  }

  const worst = rows
    .filter((r) => r.yearsAdrift !== null)
    .sort((a, b) => (b.yearsAdrift ?? 0) - (a.yearsAdrift ?? 0))
    .slice(0, 15);
  if (worst.length) {
    console.log("\nBiggest corrections (years the card was understating tenure):");
    for (const r of worst) {
      console.log(
        `  ${String(r.yearsAdrift).padStart(5)}y  ${r.name || r.clientId} ` +
          `— ${r.currentCreatedAt?.slice(0, 10)} -> ${r.proposed?.slice(0, 10)}`,
      );
    }
  }

  const noEvidence = rows.filter((r) => r.verdict === "no-evidence").length;
  if (noEvidence) {
    console.log(
      `\n${noEvidence} clients have no date evidence anywhere. Their card will now` +
        ` read "In Journey since" instead of asserting a start date it cannot support.`,
    );
  }

  const dir = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(
    dir,
    `client-since-${COMMIT ? "commit" : "dryrun"}-${Date.now()}.json`,
  );
  fs.writeFileSync(out, JSON.stringify({ tally, rows }, null, 2));
  console.log(`\nFull report: ${out}`);
  if (!COMMIT) {
    console.log(
      `DRY RUN — nothing was written. ${writes.length} clients would be updated.`,
    );
    console.log("Re-run with --commit to apply.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
