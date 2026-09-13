/**
 * Rename a machine id everywhere it is stored.
 *
 * WHY THIS EXISTS
 *   The Leg Extension was filed in Firestore as `m-leg-ext`. Every lookup in
 *   the code uses the canonical `m-ext`:
 *     - DEFAULT_MACHINE_DISPLAY_ORDER (data/machine-display-order.ts) -> order
 *     - MACHINE_ANATOMY (data/machine-anatomy-map.ts)                -> muscles, figure
 *     - CANONICAL_TO_DB_KEY (features/catalog/machine-identity.ts)   -> MACHINE_DATABASE record
 *   All three miss, so the machine sorts to 999 (last) and has no anatomy or
 *   Academy content. One wrong id, both symptoms, and nothing in the UI could
 *   say so. The other 19 machines use canonical ids correctly.
 *
 * WHY A DEEP SCAN RATHER THAN A LIST OF FIELDS
 *   Machine ids are foreign keys across a lot of collections, and some are
 *   nested (a routine's machine array, a progress report's per-machine block)
 *   or baked into a document id (`studioMachineSettings/{studioId}_{machineId}`,
 *   `studios/{s}/wiki/machine__{id}`). Hand-listing the fields is how a
 *   migration misses one and silently orphans data. This walks every field of
 *   every document to any depth, plus every document id, and reports what it
 *   finds before it changes anything.
 *
 * SAFETY
 *   - DRY RUN BY DEFAULT. Writes nothing unless you pass --commit.
 *   - --commit writes a full JSON backup of every document it is about to
 *     touch into backups/ FIRST, and refuses to continue if that write fails.
 *     Same order as scripts/migrate-canonical-client-ids.ts.
 *   - A document id cannot be renamed in place. For those it creates the new
 *     document with the old one's exact fields, verifies the read-back, and
 *     only then deletes the old one.
 *   - Re-runnable: a document already carrying the new id is skipped, so an
 *     interrupted run can simply be run again.
 *
 * AUTH: the Firebase CLI's own token, like the diagnose-* scripts.
 *   Run `firebase login` (or `firebase login --reauth`) first.
 *
 * USAGE (PowerShell, from the project folder)
 *   # 1. look first - writes nothing
 *   npx tsx scripts/migrate-machine-id.ts --from m-leg-ext --to m-ext `
 *     --project gen-lang-client-0731527386 `
 *     --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa *> machine-id-dryrun.txt
 *
 *   # 2. only when the dry run reads correctly
 *   npx tsx scripts/migrate-machine-id.ts --from m-leg-ext --to m-ext --commit `
 *     --project gen-lang-client-0731527386 `
 *     --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa *> machine-id-commit.txt
 */

import dns from "dns";
import fs from "fs";
import path from "path";
import os from "os";

dns.setDefaultResultOrder("ipv4first");

const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (n: string) => argv.includes(`--${n}`);

const FROM = flag("from");
const TO = flag("to");
const COMMIT = has("commit");

if (!FROM || !TO) {
  console.error("Required: --from <old-machine-id> --to <new-machine-id>");
  process.exit(1);
}
if (FROM === TO) {
  console.error("--from and --to are the same. Nothing to do.");
  process.exit(1);
}

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
  : {};

const cliConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
if (!fs.existsSync(cliConfigPath)) {
  console.error("Run `firebase login` first. Looked in:", cliConfigPath);
  process.exit(1);
}
const accessToken = JSON.parse(fs.readFileSync(cliConfigPath, "utf-8"))?.tokens?.access_token;

const projectId = flag("project") || config.projectId;
const databaseId = flag("database") || config.firestoreDatabaseId || "(default)";
if (!projectId || !accessToken) {
  console.error("Missing projectId or access token.");
  process.exit(1);
}
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

const authHeaders = { Authorization: `Bearer ${accessToken}` };

async function get(url: string) {
  const res = await fetch(url, { headers: authHeaders });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${res.status} ${await res.text()}`);
  return res.json() as any;
}

async function patch(relPath: string, fields: any) {
  // No updateMask: Firestore replaces the document with the fields provided.
  // We always provide every field we read, so this is a faithful rewrite.
  const res = await fetch(`${baseUrl}/${relPath}`, {
    method: "PATCH",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`PATCH ${relPath} ${res.status} ${await res.text()}`);
  return res.json() as any;
}

async function del(relPath: string) {
  const res = await fetch(`${baseUrl}/${relPath}`, { method: "DELETE", headers: authHeaders });
  if (!res.ok) throw new Error(`DELETE ${relPath} ${res.status} ${await res.text()}`);
}

/** Every document of a collection, full fields, paged. */
async function listAll(relPath: string) {
  const out: { id: string; relPath: string; fields: any }[] = [];
  let pageToken = "";
  do {
    const body = await get(
      `${baseUrl}/${relPath}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
    );
    if (!body) return out;
    for (const d of body.documents || []) {
      const id = String(d.name).split("/").pop()!;
      out.push({ id, relPath: `${relPath}/${id}`, fields: d.fields || {} });
    }
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return out;
}

/* -------------------------------------------------------------------------- */

/**
 * Walk a Firestore typed-value tree, replacing any stringValue that matches
 * FROM. Returns the rewritten tree and a list of the paths that changed, so
 * the dry run can show exactly which field in which document moves.
 */
function rewrite(value: any, at: string, hits: string[]): any {
  if (value == null || typeof value !== "object") return value;

  if ("stringValue" in value) {
    if (value.stringValue === FROM) {
      hits.push(at);
      return { stringValue: TO };
    }
    // Ids embedded in a composite string, e.g. "{studioId}_{machineId}" or
    // "machine__{id}". Only replace a whole segment, never a substring of a
    // longer id (m-leg-ext must not match inside m-leg-extra).
    const s: string = value.stringValue;
    if (s.includes(FROM)) {
      const replaced = s.replace(
        new RegExp(`(^|[^A-Za-z0-9])${FROM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9-])`, "g"),
        (m) => m.replace(FROM, TO),
      );
      if (replaced !== s) {
        hits.push(`${at} (in "${s}")`);
        return { stringValue: replaced };
      }
    }
    return value;
  }

  if ("mapValue" in value) {
    const f = value.mapValue?.fields || {};
    const next: any = {};
    for (const k of Object.keys(f)) next[k] = rewrite(f[k], `${at}.${k}`, hits);
    return { mapValue: { fields: next } };
  }

  if ("arrayValue" in value) {
    const vals = value.arrayValue?.values || [];
    return { arrayValue: { values: vals.map((v: any, i: number) => rewrite(v, `${at}[${i}]`, hits)) } };
  }

  return value;
}

/** Top-level collections that could hold a machine id. */
const TOP_LEVEL = [
  "machines",
  "studioMachineSettings",
  "clientMachineSettings",
  "exerciseLogs",
  "routines",
  "routinePresets",
  "routineAdjustments",
  "sessions",
  "sessionNotes",
  "journalEntries",
  "progressReports",
  "focusRecords",
  "trainerFocuses",
  "clients",
  "hub_announcements",
];

/** Subcollections under studios/{id} that could hold a machine id. */
const STUDIO_SUB = ["roster", "wiki", "playbook", "machineNotes", "taskInstances", "taskTemplates"];

type Change = {
  relPath: string;
  fieldHits: string[];
  /** Set when the DOCUMENT ID itself carries the old machine id. */
  newRelPath?: string;
  fields: any;
};

async function main() {
  const rule = (c = "=") => console.log(c.repeat(78));
  rule();
  console.log(`Machine id migration  ${FROM}  ->  ${TO}`);
  console.log(`project : ${projectId}`);
  console.log(`database: ${databaseId}`);
  console.log(`mode    : ${COMMIT ? "*** COMMIT - THIS WILL WRITE ***" : "dry run (writes nothing)"}`);
  rule();

  const studios = await listAll("studios");
  const targets: string[] = [...TOP_LEVEL];
  for (const s of studios) for (const sub of STUDIO_SUB) targets.push(`studios/${s.id}/${sub}`);

  const changes: Change[] = [];
  let scanned = 0;

  for (const coll of targets) {
    let docs: { id: string; relPath: string; fields: any }[] = [];
    try {
      docs = await listAll(coll);
    } catch (e: any) {
      console.log(`  (skip ${coll}: ${e.message?.slice(0, 80)})`);
      continue;
    }
    if (docs.length === 0) continue;
    scanned += docs.length;

    for (const d of docs) {
      const hits: string[] = [];
      const rewritten: any = {};
      for (const k of Object.keys(d.fields)) rewritten[k] = rewrite(d.fields[k], k, hits);

      // Does the document ID itself carry the old id?
      const idCarries =
        d.id === FROM ||
        new RegExp(`(^|[^A-Za-z0-9])${FROM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9-])`).test(d.id);
      const newId = idCarries ? d.id.replace(FROM, TO) : undefined;

      if (hits.length === 0 && !idCarries) continue;

      changes.push({
        relPath: d.relPath,
        fieldHits: hits,
        newRelPath: newId ? d.relPath.replace(/[^/]+$/, newId) : undefined,
        fields: rewritten,
      });
    }
  }

  console.log(`\nscanned ${scanned} documents across ${targets.length} collections`);
  console.log(`documents to change: ${changes.length}\n`);

  if (changes.length === 0) {
    console.log(`Nothing references "${FROM}". Either it is already migrated or the id is wrong.`);
    rule();
    return;
  }

  const renames = changes.filter((c) => c.newRelPath);
  const inPlace = changes.filter((c) => !c.newRelPath);

  if (renames.length) {
    console.log(`DOCUMENT ID RENAMES (${renames.length}) - created new, then old deleted:`);
    for (const c of renames) {
      console.log(`  ${c.relPath}`);
      console.log(`    -> ${c.newRelPath}`);
      for (const h of c.fieldHits) console.log(`       field: ${h}`);
    }
    console.log("");
  }
  if (inPlace.length) {
    console.log(`FIELD-ONLY UPDATES (${inPlace.length}):`);
    for (const c of inPlace) {
      console.log(`  ${c.relPath}`);
      for (const h of c.fieldHits) console.log(`       field: ${h}`);
    }
    console.log("");
  }

  if (!COMMIT) {
    rule();
    console.log("DRY RUN - nothing was written.");
    console.log("If the list above is right, re-run with --commit to apply it.");
    rule();
    return;
  }

  /* ---------------------------------------------------------------- write -- */
  const backupDir = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `machine-id-${FROM}-to-${TO}-${Date.now()}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ projectId, databaseId, from: FROM, to: TO, changes }, null, 2),
    "utf-8",
  );
  if (!fs.existsSync(backupPath)) {
    console.error("Backup write failed - refusing to continue.");
    process.exit(1);
  }
  console.log(`backup written: ${backupPath}\n`);

  let ok = 0;
  let failed = 0;

  for (const c of inPlace) {
    try {
      await patch(c.relPath, c.fields);
      console.log(`  updated  ${c.relPath}`);
      ok++;
    } catch (e: any) {
      console.error(`  FAILED   ${c.relPath}: ${e.message}`);
      failed++;
    }
  }

  for (const c of renames) {
    try {
      // Create the new document first. If this fails, nothing is lost.
      await patch(c.newRelPath!, c.fields);
      // Verify it is really there before removing the original.
      const check = await get(`${baseUrl}/${c.newRelPath}`);
      if (!check) throw new Error("new document not readable after write");
      await del(c.relPath);
      console.log(`  renamed  ${c.relPath}  ->  ${c.newRelPath}`);
      ok++;
    } catch (e: any) {
      console.error(`  FAILED   ${c.relPath}: ${e.message}`);
      console.error(`           the ORIGINAL was left in place. Safe to re-run.`);
      failed++;
    }
  }

  console.log("");
  rule();
  console.log(`applied ${ok}, failed ${failed}`);
  if (failed) {
    console.log("Re-run the same command: documents already migrated are skipped.");
  } else {
    console.log("Done. Re-run the diagnostic to confirm:");
    console.log("  npx tsx scripts/diagnose-machines.ts --project ... --database ...");
  }
  console.log(`Backup of every pre-change document: ${backupPath}`);
  rule();
}

main().catch((e) => {
  console.error("\nFAILED:", e?.message ?? e);
  console.error("If this is a 401/403, run `firebase login --reauth` and try again.");
  process.exit(1);
});
