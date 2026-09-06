/**
 * TRAINER IDENTITY — REPORT ONLY. This script never writes anything.
 *
 * WHY IT EXISTS
 * -------------
 * Every Firestore rule answers "is this your document?" by comparing
 * request.auth.uid to the trainer document id, so `trainers/{uid}` is the only
 * trainer document a person can write. Two admin creation paths used addDoc,
 * which assigns a random id, and sign-in matched people by email — so an
 * unknown number of trainers are holding a profile they cannot write.
 *
 * The September round fixed that going forward (rules now also accept an email
 * match; new admin-created profiles are placeholders that claim their uid at
 * first sign-in). What it deliberately did NOT do is move the profiles that
 * already exist, because they are referenced by sessions, schedules, reports
 * and rosters, and repointing those is a migration.
 *
 * This report is the input to that decision. It answers three questions:
 *
 *   1. How many trainer profiles are not keyed on an auth uid?
 *   2. For each, does a correct `trainers/{uid}` already exist? (A collision
 *      needs a person, not a script.)
 *   3. How many documents point at each stranded id? That number IS the cost
 *      of the migration.
 *
 * IF THE ANSWER IS ZERO, THERE IS NO MIGRATION TO RUN and the round is done.
 * Run this before writing the write half — the shape of the fix depends on
 * what comes back.
 *
 * THE WRITE HALF IS NOT IMPLEMENTED, ON PURPOSE. A migration written before
 * anyone has seen the data is a guess with a backup attached. Follow
 * scripts/migrate-canonical-client-ids.ts when the time comes: it already has
 * the dry-run/commit split, the pre-write JSON backup, tombstones instead of
 * deletes, and a resume log.
 *
 * AUTH: uses the Firebase CLI's own OAuth token (run `npx firebase login`
 * first), like the other scripts here. Reads Firestore and, if permitted, the
 * Identity Toolkit; it degrades to a heuristic if the latter is refused.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/report-trainer-identity.ts
 *   npx tsx scripts/report-trainer-identity.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
 *   npx tsx scripts/report-trainer-identity.ts --json report.json
 */

import dns from "dns";
import fs from "fs";
import path from "path";
import os from "os";

dns.setDefaultResultOrder("ipv4first");

const argv = process.argv.slice(2);
const flagValue = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

// --- connection, same shape as the other scripts in this folder -------------
const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
let config: any = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

const cliConfigPath = path.join(
  os.homedir(),
  ".config",
  "configstore",
  "firebase-tools.json",
);
if (!fs.existsSync(cliConfigPath)) {
  console.error(
    "Firebase CLI config not found. Run `npx firebase login` first.\nLooked in:",
    cliConfigPath,
  );
  process.exit(1);
}
const accessToken = JSON.parse(fs.readFileSync(cliConfigPath, "utf-8"))?.tokens
  ?.access_token;
if (!accessToken) {
  console.error("No access token. Run `npx firebase login` again.");
  process.exit(1);
}

const projectId = flagValue("project") || config.projectId;
const databaseId =
  flagValue("database") || config.firestoreDatabaseId || "(default)";
if (!projectId) {
  console.error("No projectId. Pass --project <id>.");
  process.exit(1);
}

const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

async function api(url: string, options: any = {}, retries = 6): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      return res;
    } catch (err: any) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw new Error(`Failed after ${retries} attempts: ${url}`);
}

function decodeValue(v: any): any {
  if (v == null) return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  return null;
}
function decodeFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

type DocRecord = { id: string; data: Record<string, any> };

/** `mask` is what makes counting references over big collections affordable. */
async function listCollection(name: string, mask?: string[]): Promise<DocRecord[]> {
  const docs: DocRecord[] = [];
  let pageToken = "";
  do {
    const maskParam = (mask || [])
      .map((f) => `&mask.fieldPaths=${encodeURIComponent(f)}`)
      .join("");
    const url =
      `${baseUrl}/${name}?pageSize=300` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "") +
      maskParam;
    const res = await api(url);
    if (!res.ok) {
      if (res.status === 404) return docs; // collection does not exist here
      throw new Error(`List ${name} failed: ${res.status} ${await res.text()}`);
    }
    const body: any = await res.json();
    for (const d of body.documents || []) {
      docs.push({
        id: String(d.name).split("/").pop()!,
        data: decodeFields(d.fields || {}),
      });
    }
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return docs;
}

/**
 * The real uid for each email, straight from Firebase Auth.
 *
 * Without this the report can only guess from id length (auth uids are 28
 * characters, Firestore auto-ids are 20), which is good enough to COUNT the
 * problem and not good enough to FIX it — a migration that moved a document to
 * a guessed uid would be worse than the bug. If the lookup is refused, the
 * report says so and downgrades every verdict to "unverified".
 */
async function uidsByEmail(emails: string[]): Promise<Map<string, string> | null> {
  const out = new Map<string, string>();
  const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`;
  for (let i = 0; i < emails.length; i += 50) {
    const batch = emails.slice(i, i + 50);
    const res = await api(url, {
      method: "POST",
      body: JSON.stringify({ email: batch }),
    });
    if (!res.ok) {
      console.warn(
        `\n  ! Could not read Firebase Auth (${res.status}). Falling back to the id-length heuristic;\n` +
          `    verdicts below are unverified. Grant your account the Firebase Authentication Viewer role\n` +
          `    to get exact answers.\n`,
      );
      return null;
    }
    const body: any = await res.json();
    for (const u of body.users || []) {
      if (u.email && u.localId) out.set(String(u.email).toLowerCase(), u.localId);
    }
  }
  return out;
}

/** Where a trainer id can be referenced. Field list taken from src/types.ts. */
const REFERENCES: { collection: string; fields: string[] }[] = [
  { collection: "sessions", fields: ["trainerId", "startedByTrainerId", "rollupTrainerId"] },
  { collection: "schedules", fields: ["trainerId"] },
  { collection: "progressReports", fields: ["trainerId"] },
  { collection: "journalEntries", fields: ["trainerId", "authorId"] },
  { collection: "clientFocuses", fields: ["trainerId"] },
  { collection: "trainerFocuses", fields: ["trainerId"] },
  { collection: "clinicalIncidents", fields: ["reportedByTrainerId"] },
  { collection: "routineAdjustments", fields: ["trainerId"] },
  { collection: "clientMachineSettings", fields: ["trainerId"] },
  { collection: "studios", fields: ["ownerId", "headTrainerId"] },
  { collection: "networks", fields: ["ownerId"] },
  { collection: "access_requests", fields: ["trainerId"] },
];

const AUTH_UID_LENGTH = 28;

async function main() {
  console.log(`\nTrainer identity report — ${projectId} / ${databaseId}`);
  console.log("READ ONLY. This script writes nothing.\n");

  const trainers = await listCollection("trainers");
  console.log(`  ${trainers.length} trainer documents\n`);

  const live = trainers.filter((t) => !t.data.supersededByUid);
  const emails = live
    .map((t) => String(t.data.email || "").trim().toLowerCase())
    .filter(Boolean);

  const authMap = await uidsByEmail([...new Set(emails)]);
  const verified = authMap !== null;
  const knownUids = new Set(authMap ? [...authMap.values()] : []);

  type Row = {
    id: string;
    name: string;
    email: string;
    verdict: "ok" | "placeholder" | "stranded" | "collision" | "no-account";
    realUid?: string;
    references: number;
  };

  const rows: Row[] = [];
  const idSet = new Set(trainers.map((t) => t.id));

  for (const t of live) {
    const email = String(t.data.email || "").trim().toLowerCase();
    const realUid = authMap?.get(email);
    const name = String(t.data.fullName || "(no name)");

    let verdict: Row["verdict"];
    if (verified) {
      if (knownUids.has(t.id)) verdict = "ok";
      else if (!realUid) verdict = "no-account";
      else if (idSet.has(realUid)) verdict = "collision";
      else if (t.data.pendingClaim === true) verdict = "placeholder";
      else verdict = "stranded";
    } else {
      // Heuristic only.
      if (t.id.length === AUTH_UID_LENGTH) verdict = "ok";
      else if (t.data.pendingClaim === true) verdict = "placeholder";
      else verdict = "stranded";
    }

    rows.push({ id: t.id, name, email, verdict, realUid, references: 0 });
  }

  const needsWork = rows.filter(
    (r) => r.verdict === "stranded" || r.verdict === "collision",
  );

  // Only count references for ids that actually need moving — that is what
  // keeps this cheap on sessions and schedules.
  if (needsWork.length > 0) {
    const watch = new Map(needsWork.map((r) => [r.id, r]));
    console.log("  Counting references...");
    for (const ref of REFERENCES) {
      const docs = await listCollection(ref.collection, ref.fields);
      for (const d of docs) {
        for (const f of ref.fields) {
          const v = d.data[f];
          if (typeof v === "string" && watch.has(v)) watch.get(v)!.references += 1;
        }
      }
      console.log(`    ${ref.collection}: ${docs.length} scanned`);
    }
  }

  const count = (v: Row["verdict"]) => rows.filter((r) => r.verdict === v).length;

  console.log("\n─────────────────────────────────────────────");
  console.log(`  ok           ${count("ok")}   keyed on their auth uid, nothing to do`);
  console.log(`  placeholder  ${count("placeholder")}   admin-created, claims itself at first sign-in`);
  console.log(`  no-account   ${count("no-account")}   profile exists, nobody has ever signed in`);
  console.log(`  stranded     ${count("stranded")}   NEEDS THE MIGRATION`);
  console.log(`  collision    ${count("collision")}   two documents for one person — needs a human`);
  console.log("─────────────────────────────────────────────");
  if (!verified) {
    console.log("  (unverified — Firebase Auth could not be read)");
  }

  if (needsWork.length === 0) {
    console.log(
      "\n  Nothing needs the migration. The rules fix and the claim cover everything.\n",
    );
  } else {
    console.log("\n  Who, and what it would cost to move them:\n");
    for (const r of needsWork.sort((a, b) => b.references - a.references)) {
      console.log(
        `    ${r.verdict.toUpperCase().padEnd(10)} ${r.name.padEnd(24)} ${r.email.padEnd(30)}` +
          ` ${String(r.references).padStart(5)} refs   ${r.id}` +
          (r.realUid ? ` -> ${r.realUid}` : ""),
      );
    }
    console.log(
      `\n  Total references to repoint: ${needsWork.reduce((s, r) => s + r.references, 0)}\n`,
    );
  }

  const jsonPath = flagValue("json");
  if (jsonPath) {
    fs.writeFileSync(
      path.resolve(process.cwd(), jsonPath),
      JSON.stringify({ projectId, databaseId, verified, rows }, null, 2),
    );
    console.log(`  Written to ${jsonPath}\n`);
  }
}

main().catch((err) => {
  console.error("\nReport failed:", err);
  process.exit(1);
});
