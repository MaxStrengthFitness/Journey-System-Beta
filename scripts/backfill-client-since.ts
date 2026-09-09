/**
 * ONE-OFF BACKFILL — give every client a real "Client since" date.
 *
 * WHY THIS EXISTS
 * ---------------
 * The profile card was reporting the day the JOURNEY document was created.
 * For a studio that has been open since 2014 and adopted this app in 2026,
 * that is wrong by a decade for the entire roster.
 *
 * The display code was already correct: it prefers `firstAppointmentDate`,
 * then `mindbodyCreatedAt`, and only falls back to `createdAt`. The problem is
 * that the two Mindbody fields are empty on almost every document, because the
 * only thing that has ever written them is the client.created / client.updated
 * WEBHOOK — and Mindbody fires that when a record CHANGES, so a client who has
 * not been edited since the integration went live has never produced one.
 * Clients created by the pull-sync from appointment payloads never had them at
 * all.
 *
 * WHAT IT WRITES
 * --------------
 * Only `firstAppointmentDate` (plus a `firstAppointmentDateSource` marker so a
 * later run, and a human, can tell where the value came from). It NEVER writes
 * `mindbodyCreatedAt` — that field means "the day Mindbody's record was
 * created" and only Mindbody can answer it. Inventing a value there would
 * quietly outrank a genuine webhook value later.
 *
 * WHERE THE DATE COMES FROM, best first:
 *   1. `firstSessionDate` already on the client — a workout we recorded.
 *   2. The earliest `sessions` document for that client.
 *   3. The earliest `startDate` / `agreementDate` across `mindbodyContracts`,
 *      or `activeDate` / `assignedAt` across `mindbodyMemberships`. These maps
 *      are already on the document (the commercial sync writes them) and are
 *      real Mindbody dates.
 * Same order as src/lib/client-since.ts, deliberately — the screen and the
 * backfill must not disagree about what "since" means.
 *
 * SAFETY MODEL
 *   - Dry run by default. Nothing is written without --commit.
 *   - A client that ALREADY has firstAppointmentDate or mindbodyCreatedAt is
 *     SKIPPED, always. Webhook data is authoritative and is never overwritten.
 *   - Only the one field is patched, via updateMask, so no other field on the
 *     document can be touched by a bug in here.
 *   - A JSON report of every decision is written to backups/ before any write.
 *   - Re-running is harmless: a client fixed by a previous run is now skipped
 *     by the rule above.
 *
 * AUTH: the Firebase CLI's own token, like the other scripts here. Talks to the
 * Firestore REST API as your Google account and bypasses security rules.
 * Run `npx firebase login` first.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/backfill-client-since.ts                       # dry run
 *   npx tsx scripts/backfill-client-since.ts --limit 25            # dry run, first 25
 *   npx tsx scripts/backfill-client-since.ts --commit              # execute
 *   npx tsx scripts/backfill-client-since.ts --commit --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
 */

import dns from "dns";
import fs from "fs";
import path from "path";
import os from "os";

dns.setDefaultResultOrder("ipv4first");

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

/** Anything older than this is a placeholder, not a membership. */
const MIN_PLAUSIBLE_YEAR = 1990;

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
  : {};

const cliConfigPath = path.join(
  os.homedir(),
  ".config",
  "configstore",
  "firebase-tools.json",
);
if (!fs.existsSync(cliConfigPath)) {
  console.error("Run `npx firebase login` first. Looked in:", cliConfigPath);
  process.exit(1);
}
const accessToken = JSON.parse(fs.readFileSync(cliConfigPath, "utf-8"))?.tokens
  ?.access_token;

const projectId = flag("project") || config.projectId;
const databaseId =
  flag("database") || config.firestoreDatabaseId || "(default)";
if (!projectId || !accessToken) {
  console.error("Missing projectId or access token.");
  process.exit(1);
}
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

type Fields = Record<string, any>;

const get = async (url: string) => {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as any;
};

async function list(
  collectionPath: string,
  mask?: string[],
): Promise<{ id: string; fields: Fields }[]> {
  const out: { id: string; fields: Fields }[] = [];
  let pageToken = "";
  do {
    const m = (mask || [])
      .map((f) => `&mask.fieldPaths=${encodeURIComponent(f)}`)
      .join("");
    const body = await get(
      `${baseUrl}/${collectionPath}?pageSize=300${
        pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
      }${m}`,
    );
    if (!body) return out;
    for (const d of body.documents || []) {
      out.push({ id: String(d.name).split("/").pop()!, fields: d.fields || {} });
    }
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return out;
}

/**
 * Read a Firestore REST value as a Date.
 *
 * Firestore's REST encoding is a tagged union, and these fields have been
 * written by three different code paths over the project's life — a real
 * timestamp from the webhook, an ISO string from an early import, an epoch
 * number from a migration. All three have to be readable or the backfill will
 * quietly decide a client has no date and overwrite a good one.
 */
function asDate(f: any): Date | null {
  if (!f) return null;
  const raw =
    f.timestampValue ??
    f.stringValue ??
    (f.integerValue !== undefined ? Number(f.integerValue) : undefined) ??
    (f.doubleValue !== undefined ? Number(f.doubleValue) : undefined);
  if (raw === undefined || raw === null || raw === "") return null;
  const d = new Date(raw as any);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() < MIN_PLAUSIBLE_YEAR) return null;
  return d;
}

/** Earliest plausible date across a Firestore mapValue of records. */
function earliestInMap(mapField: any, keys: string[]): Date | null {
  const entries = mapField?.mapValue?.fields;
  if (!entries) return null;
  let best: Date | null = null;
  for (const record of Object.values<any>(entries)) {
    const inner = record?.mapValue?.fields;
    if (!inner) continue;
    for (const k of keys) {
      const d = asDate(inner[k]);
      if (d && (!best || d.getTime() < best.getTime())) best = d;
    }
  }
  return best;
}

/** Patch exactly one field. updateMask means nothing else can be touched. */
async function patchFirstAppointment(
  clientId: string,
  when: Date,
  source: string,
): Promise<void> {
  const url =
    `${baseUrl}/clients/${encodeURIComponent(clientId)}` +
    `?updateMask.fieldPaths=firstAppointmentDate` +
    `&updateMask.fieldPaths=firstAppointmentDateSource` +
    `&currentDocument.exists=true`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        firstAppointmentDate: { timestampValue: when.toISOString() },
        firstAppointmentDateSource: { stringValue: source },
      },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
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

  const clients = await list("clients");
  console.log(`Read ${clients.length} clients.`);

  /*
   * Earliest session per client, read ONCE for the whole collection rather
   * than per client. A per-client query would be one round trip each; on a
   * roster of a few thousand that is both slow and a good way to trip the
   * read quota, which this project has done before.
   */
  const sessions = await list("sessions", ["clientId", "date", "startedAt"]);
  const earliestSession = new Map<string, Date>();
  for (const s of sessions) {
    const cid = s.fields.clientId?.stringValue;
    if (!cid) continue;
    const d = asDate(s.fields.date) || asDate(s.fields.startedAt);
    if (!d) continue;
    const seen = earliestSession.get(cid);
    if (!seen || d.getTime() < seen.getTime()) earliestSession.set(cid, d);
  }
  console.log(
    `Read ${sessions.length} sessions — earliest date known for ${earliestSession.size} clients.`,
  );

  const rows: Row[] = [];
  let considered = 0;

  for (const c of clients) {
    if (considered >= LIMIT) break;
    const f = c.fields;
    const homeStudioId = f.homeStudioId?.stringValue ?? null;
    if (ONLY_STUDIO && homeStudioId !== ONLY_STUDIO) continue;
    considered++;

    const name = `${f.firstName?.stringValue ?? ""} ${
      f.lastName?.stringValue ?? ""
    }`.trim();
    const createdAt = asDate(f.createdAt);

    // Webhook data wins, always. Never overwrite it.
    if (asDate(f.firstAppointmentDate) || asDate(f.mindbodyCreatedAt)) {
      rows.push({
        clientId: c.id,
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

    const fromField = asDate(f.firstSessionDate);
    const fromSessions = earliestSession.get(c.id) ?? null;
    const fromCommercial =
      earliestInMap(f.mindbodyContracts, ["startDate", "agreementDate"]) ??
      earliestInMap(f.mindbodyMemberships, ["activeDate", "assignedAt"]);

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
      clientId: c.id,
      name,
      homeStudioId,
      verdict,
      currentCreatedAt: createdAt?.toISOString() ?? null,
      proposed: proposed?.toISOString() ?? null,
      yearsAdrift,
    });

    if (COMMIT && proposed) {
      await patchFirstAppointment(c.id, proposed, source);
    }
  }

  // ---- report -------------------------------------------------------------
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
    console.log("DRY RUN — nothing was written. Re-run with --commit to apply.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
