/**
 * ONE-OFF MIGRATION — canonical Mindbody client IDs.
 *
 * Moves every Mindbody-known client to `clients/{mindbodyClientId}` and
 * repoints all historical references at the new id, so the webhook and the
 * pull-sync stop disagreeing about where a client lives.
 *
 * Clients with NO Mindbody id (legacy FileMaker imports, manually created
 * profiles) are deliberately LEFT ALONE — they keep their existing doc ids.
 * The invariant this establishes is "every Mindbody-known client lives at the
 * canonical path", not "every client does".
 *
 * SAFETY MODEL
 *   - Dry run by default. Nothing is written without --commit.
 *   - A full JSON backup of every document it may touch is written BEFORE the
 *     first write, to backups/migration-<timestamp>.json.
 *   - Old client docs are TOMBSTONED, never deleted: their data is replaced by
 *     a { migratedTo, migratedAt } pointer so anything still holding the old id
 *     is traceable. Sweep them later with --sweep-tombstones once you are happy.
 *   - Every completed client is appended to a resume log, so a crashed run can
 *     be re-run and will skip what it already did.
 *
 * AUTH: uses the Firebase CLI's own OAuth token (run `npx firebase login`
 * first), exactly like scripts/purge-database.ts. This talks to the Firestore
 * REST API as your Google account and therefore bypasses security rules.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/migrate-canonical-client-ids.ts                  # dry run, staging
 *   npx tsx scripts/migrate-canonical-client-ids.ts --commit         # execute
 *   npx tsx scripts/migrate-canonical-client-ids.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
 *   npx tsx scripts/migrate-canonical-client-ids.ts --commit --dedupe-schedules
 *   npx tsx scripts/migrate-canonical-client-ids.ts --commit --sweep-tombstones
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
const hasFlag = (name: string) => argv.includes(`--${name}`);
const flagValue = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const COMMIT = hasFlag("commit");
const DEDUPE_SCHEDULES = hasFlag("dedupe-schedules");
const SWEEP_TOMBSTONES = hasFlag("sweep-tombstones");

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

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
  console.error("No access token in firebase-tools.json. Run `npx firebase login` again.");
  process.exit(1);
}

const projectId = flagValue("project") || config.projectId;
const databaseId =
  flagValue("database") || config.firestoreDatabaseId || "(default)";

if (!projectId) {
  console.error(
    "No projectId. Pass --project <id> or put one in firebase-applet-config.json.",
  );
  process.exit(1);
}

const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

// ---------------------------------------------------------------------------
// Firestore REST helpers
// ---------------------------------------------------------------------------

type FsValue = Record<string, any>;

async function fetchWithRetry(
  url: string,
  options: any = {},
  retries = 8,
  delayMs = 800,
): Promise<Response> {
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
      if (res.status === 429 || res.status >= 500) {
        if (attempt === retries) return res;
        await new Promise((r) => setTimeout(r, delayMs * attempt));
        continue;
      }
      return res;
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`  [network] ${err.code || err.message}. Retry ${attempt}/${retries}...`);
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error(`Failed after ${retries} attempts: ${url}`);
}

/** Firestore REST typed value -> plain JS. */
function decodeValue(v: FsValue): any {
  if (v === null || v === undefined) return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return { __timestamp: v.timestampValue };
  if ("bytesValue" in v) return { __bytes: v.bytesValue };
  if ("referenceValue" in v) return { __reference: v.referenceValue };
  if ("geoPointValue" in v) return { __geoPoint: v.geoPointValue };
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  return null;
}

function decodeFields(fields: Record<string, FsValue>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

/** Plain JS -> Firestore REST typed value. Round-trips our own decode(). */
function encodeValue(v: any): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === "object") {
    if ("__timestamp" in v) return { timestampValue: v.__timestamp };
    if ("__bytes" in v) return { bytesValue: v.__bytes };
    if ("__reference" in v) return { referenceValue: v.__reference };
    if ("__geoPoint" in v) return { geoPointValue: v.__geoPoint };
    return { mapValue: { fields: encodeFields(v) } };
  }
  return { nullValue: null };
}

function encodeFields(obj: Record<string, any>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = encodeValue(v);
  return out;
}

type DocRecord = { id: string; data: Record<string, any> };

/**
 * Lists a collection. `mask` restricts the fields returned, which is the whole
 * reason this is affordable on exerciseLogs — we only ever need `clientId`.
 */
async function listCollection(
  name: string,
  mask?: string[],
): Promise<DocRecord[]> {
  const docs: DocRecord[] = [];
  let pageToken = "";
  do {
    const maskParam = (mask || [])
      .map((f) => `&mask.fieldPaths=${encodeURIComponent(f)}`)
      .join("");
    const url = `${baseUrl}/${name}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}${maskParam}`;
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      if (res.status === 404) return docs;
      throw new Error(`list ${name} failed: ${res.status} ${await res.text()}`);
    }
    const body: any = await res.json();
    for (const d of body.documents || []) {
      docs.push({
        id: String(d.name).split("/").pop() as string,
        data: decodeFields(d.fields || {}),
      });
    }
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return docs;
}

async function getDoc(collectionName: string, id: string): Promise<DocRecord | null> {
  const res = await fetchWithRetry(`${baseUrl}/${collectionName}/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get ${collectionName}/${id}: ${res.status} ${await res.text()}`);
  const body: any = await res.json();
  return { id, data: decodeFields(body.fields || {}) };
}

/** PATCH with an updateMask = update only these fields, leave the rest alone. */
async function patchFields(
  collectionName: string,
  id: string,
  fields: Record<string, any>,
): Promise<void> {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const mask = keys
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const url = `${baseUrl}/${collectionName}/${encodeURIComponent(id)}?${mask}`;
  const res = await fetchWithRetry(url, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFields(fields) }),
  });
  if (!res.ok) {
    throw new Error(`patch ${collectionName}/${id}: ${res.status} ${await res.text()}`);
  }
}

/** PATCH with no updateMask = replace the whole document (also creates it). */
async function putDoc(
  collectionName: string,
  id: string,
  fields: Record<string, any>,
): Promise<void> {
  const url = `${baseUrl}/${collectionName}/${encodeURIComponent(id)}`;
  const res = await fetchWithRetry(url, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFields(fields) }),
  });
  if (!res.ok) {
    throw new Error(`put ${collectionName}/${id}: ${res.status} ${await res.text()}`);
  }
}

async function deleteDoc(collectionName: string, id: string): Promise<void> {
  const res = await fetchWithRetry(
    `${baseUrl}/${collectionName}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`delete ${collectionName}/${id}: ${res.status} ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// What references a client
// ---------------------------------------------------------------------------

/** Collections carrying a `clientId` FIELD that must be repointed. */
const CLIENT_ID_FIELD_COLLECTIONS = [
  "sessions",
  "sessionNotes",
  "exerciseLogs",
  "schedules",
  "routines",
  "routineAdjustments",
  "progressReports",
  "focusRecords",
  "trainerFocuses",
  "clinicalIncidents",
  "machineSettingChanges",
  "routinePresets",
];

/**
 * `clientMachineSettings` is the dangerous one: its doc IDs are deterministic
 * `{clientId}_{machineId}`, so a doc-id change means recreating the document,
 * not patching a field. Missing this would silently orphan every client's saved
 * seat and pin settings.
 */
const COMPOSITE_ID_COLLECTION = "clientMachineSettings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlanItem = {
  fromId: string;
  toId: string;
  name: string;
  /** Canonical doc already exists (a sparse webhook-created record) -> merge. */
  mergeInto: boolean;
};

type Report = {
  projectId: string;
  databaseId: string;
  startedAt: string;
  committed: boolean;
  alreadyCanonical: number;
  noMindbodyId: { id: string; name: string }[];
  planned: PlanItem[];
  conflicts: string[];
  unmappedStudios: string[];
  migrated: string[];
  errors: string[];
};

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const RESUME_LOG = path.resolve(process.cwd(), "backups", "migration-resume.log");

function readResumeLog(): Set<string> {
  if (!fs.existsSync(RESUME_LOG)) return new Set();
  return new Set(
    fs
      .readFileSync(RESUME_LOG, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

function appendResumeLog(fromId: string) {
  fs.appendFileSync(RESUME_LOG, `${fromId}\n`, "utf-8");
}

const nameOf = (d: Record<string, any>) =>
  `${d.firstName || ""} ${d.lastName || ""}`.trim() ||
  d.mindbody_name ||
  "(unnamed)";

const mbIdOf = (d: Record<string, any>): string | null => {
  const raw = d.mindbodyClientId ?? d.mindbodyId;
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s ? s : null;
};

async function main() {
  console.log("=".repeat(72));
  console.log("Canonical Mindbody client-ID migration");
  console.log(`  project : ${projectId}`);
  console.log(`  database: ${databaseId}`);
  console.log(`  mode    : ${COMMIT ? "COMMIT (writes will happen)" : "DRY RUN (no writes)"}`);
  console.log("=".repeat(72));

  const report: Report = {
    projectId,
    databaseId,
    startedAt: nowIso(),
    committed: COMMIT,
    alreadyCanonical: 0,
    noMindbodyId: [],
    planned: [],
    conflicts: [],
    unmappedStudios: [],
    migrated: [],
    errors: [],
  };

  // --- Pass 0: studio site mapping preflight -------------------------------
  console.log("\n[0/5] Studio site mapping...");
  const studios = await listCollection("studios");
  const bySite = new Map<string, string[]>();
  for (const s of studios) {
    const site = s.data.mindbodySiteId
      ? String(s.data.mindbodySiteId).trim()
      : "";
    if (!site) {
      report.unmappedStudios.push(
        `${s.id} (${s.data.name || "unnamed"}) has NO mindbodySiteId — set it in Admin -> Studios`,
      );
      continue;
    }
    bySite.set(site, [...(bySite.get(site) || []), s.id]);
  }
  for (const [site, ids] of bySite) {
    if (ids.length > 1) {
      const missingLocation = ids.filter((id) => {
        const s = studios.find((x) => x.id === id);
        const loc = s?.data.mindbodyLocationId;
        return loc === undefined || loc === null || String(loc).trim() === "";
      });
      if (missingLocation.length > 0) {
        report.unmappedStudios.push(
          `site ${site} is shared by ${ids.join(", ")} but ${missingLocation.join(", ")} has no mindbodyLocationId — events for that site cannot be resolved`,
        );
      }
    }
  }
  console.log(`  ${studios.length} studios, ${bySite.size} distinct Mindbody sites`);
  report.unmappedStudios.forEach((w) => console.log(`  ! ${w}`));

  // --- Pass 1: load clients and build the plan -----------------------------
  console.log("\n[1/5] Reading clients...");
  const clients = await listCollection("clients");
  console.log(`  ${clients.length} client documents`);

  const claims = new Map<string, DocRecord[]>();
  for (const c of clients) {
    if (c.data.migratedTo) continue; // already a tombstone
    const mb = mbIdOf(c.data);
    if (!mb) {
      report.noMindbodyId.push({ id: c.id, name: nameOf(c.data) });
      continue;
    }
    if (c.id === mb) {
      report.alreadyCanonical++;
      continue;
    }
    claims.set(mb, [...(claims.get(mb) || []), c]);
  }

  const existingIds = new Set(clients.map((c) => c.id));

  for (const [mb, claimants] of claims) {
    if (claimants.length > 1) {
      report.conflicts.push(
        `Mindbody id ${mb} is claimed by ${claimants.length} client docs (${claimants
          .map((c) => `${c.id}:${nameOf(c.data)}`)
          .join(" | ")}) — SKIPPED, resolve by hand`,
      );
      continue;
    }
    const src = claimants[0];
    report.planned.push({
      fromId: src.id,
      toId: mb,
      name: nameOf(src.data),
      mergeInto: existingIds.has(mb),
    });
  }

  console.log(`  already canonical : ${report.alreadyCanonical}`);
  console.log(`  to migrate        : ${report.planned.length}`);
  console.log(`  merges into sparse: ${report.planned.filter((p) => p.mergeInto).length}`);
  console.log(`  no Mindbody id    : ${report.noMindbodyId.length} (left untouched by design)`);
  console.log(`  conflicts         : ${report.conflicts.length}`);
  report.conflicts.forEach((c) => console.log(`  ! ${c}`));

  // --- Pass 2: index every reference --------------------------------------
  console.log("\n[2/5] Indexing references...");
  const idsToMove = new Set(report.planned.map((p) => p.fromId));
  const refIndex: Record<string, DocRecord[]> = {};
  for (const coll of CLIENT_ID_FIELD_COLLECTIONS) {
    const docs = await listCollection(coll, ["clientId"]);
    const affected = docs.filter(
      (d) => d.data.clientId && idsToMove.has(String(d.data.clientId)),
    );
    refIndex[coll] = affected;
    console.log(`  ${coll.padEnd(22)} ${String(affected.length).padStart(6)} of ${docs.length} affected`);
  }

  const settingsDocs = await listCollection(COMPOSITE_ID_COLLECTION, ["clientId"]);
  const affectedSettings = settingsDocs.filter((d) => {
    const owner = d.data.clientId ? String(d.data.clientId) : d.id.split("_")[0];
    return idsToMove.has(owner);
  });
  console.log(
    `  ${COMPOSITE_ID_COLLECTION.padEnd(22)} ${String(affectedSettings.length).padStart(6)} of ${settingsDocs.length} affected (doc IDs must be rewritten)`,
  );

  // --- Pass 3: backup ------------------------------------------------------
  const backupDir = path.resolve(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const stamp = nowIso().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `migration-${stamp}.json`);

  console.log("\n[3/5] Writing backup...");
  const backup: Record<string, any> = {
    meta: { projectId, databaseId, createdAt: nowIso() },
    clients: clients.filter(
      (c) => idsToMove.has(c.id) || report.planned.some((p) => p.toId === c.id),
    ),
    references: refIndex,
    clientMachineSettings: [] as DocRecord[],
  };
  for (const s of affectedSettings) {
    const full = await getDoc(COMPOSITE_ID_COLLECTION, s.id);
    if (full) backup.clientMachineSettings.push(full);
  }
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf-8");
  console.log(`  wrote ${backupPath}`);

  if (!COMMIT) {
    console.log("\n[4/5] DRY RUN — no writes. Re-run with --commit to execute.");
    finish(report, stamp);
    return;
  }

  // --- Pass 4: execute -----------------------------------------------------
  console.log("\n[4/5] Migrating...");
  const done = readResumeLog();
  let n = 0;

  for (const item of report.planned) {
    n++;
    const tag = `[${n}/${report.planned.length}] ${item.name} ${item.fromId} -> ${item.toId}`;
    if (done.has(item.fromId)) {
      console.log(`${tag} — already done (resume log), skipping`);
      continue;
    }

    try {
      const source = clients.find((c) => c.id === item.fromId);
      if (!source) throw new Error("source client vanished mid-run");

      // (a) Build the canonical document.
      //     The legacy doc owns the session history, so IT wins; the sparse
      //     webhook doc only fills fields the legacy doc never had.
      let merged: Record<string, any> = { ...source.data };
      if (item.mergeInto) {
        const sparse = await getDoc("clients", item.toId);
        if (sparse) {
          for (const [k, v] of Object.entries(sparse.data)) {
            const existing = merged[k];
            const isEmpty =
              existing === undefined ||
              existing === null ||
              existing === "" ||
              (Array.isArray(existing) && existing.length === 0);
            if (isEmpty && v !== null && v !== undefined) merged[k] = v;
          }
        }
      }
      merged.mindbodyClientId = item.toId;
      merged.canonicalIdMigratedFrom = item.fromId;
      merged.canonicalIdMigratedAt = { __timestamp: nowIso() };

      await putDoc("clients", item.toId, merged);

      // (b) Repoint every reference field.
      for (const coll of CLIENT_ID_FIELD_COLLECTIONS) {
        const rows = (refIndex[coll] || []).filter(
          (d) => String(d.data.clientId) === item.fromId,
        );
        for (const row of rows) {
          await patchFields(coll, row.id, { clientId: item.toId });
        }
        if (rows.length) console.log(`      ${coll}: ${rows.length} repointed`);
      }

      // (c) Rewrite composite-id docs (clientMachineSettings).
      const mine = affectedSettings.filter((d) => {
        const owner = d.data.clientId ? String(d.data.clientId) : d.id.split("_")[0];
        return owner === item.fromId;
      });
      for (const s of mine) {
        const full = await getDoc(COMPOSITE_ID_COLLECTION, s.id);
        if (!full) continue;
        const machineId = s.id.startsWith(`${item.fromId}_`)
          ? s.id.slice(item.fromId.length + 1)
          : full.data.machineId
            ? String(full.data.machineId)
            : null;
        if (!machineId) {
          report.errors.push(
            `${COMPOSITE_ID_COLLECTION}/${s.id}: could not derive machineId; left in place`,
          );
          continue;
        }
        const newId = `${item.toId}_${machineId}`;
        await putDoc(COMPOSITE_ID_COLLECTION, newId, {
          ...full.data,
          clientId: item.toId,
        });
        await deleteDoc(COMPOSITE_ID_COLLECTION, s.id);
      }
      if (mine.length) console.log(`      ${COMPOSITE_ID_COLLECTION}: ${mine.length} re-keyed`);

      // (d) Tombstone the old doc. Keeps a readable name so anything that
      //     still resolves it renders sanely instead of crashing on undefined.
      await putDoc("clients", item.fromId, {
        firstName: "[Migrated]",
        lastName: nameOf(source.data),
        isActive: false,
        homeStudioId: source.data.homeStudioId || null,
        remainingSessions: 0,
        migratedTo: item.toId,
        migratedAt: { __timestamp: nowIso() },
      });

      appendResumeLog(item.fromId);
      report.migrated.push(`${item.fromId} -> ${item.toId} (${item.name})`);
      console.log(`${tag} — done`);
    } catch (err: any) {
      const msg = `${item.fromId} -> ${item.toId}: ${err?.message || err}`;
      report.errors.push(msg);
      console.error(`${tag} — FAILED: ${msg}`);
    }
  }

  // --- Pass 5: optional extras --------------------------------------------
  if (DEDUPE_SCHEDULES) {
    console.log("\n[5/5] De-duplicating schedules onto booking-id doc keys...");
    const schedules = await listCollection("schedules", ["mindbodyAppointmentId"]);
    const byBooking = new Map<string, DocRecord[]>();
    for (const s of schedules) {
      const mb = s.data.mindbodyAppointmentId
        ? String(s.data.mindbodyAppointmentId)
        : null;
      if (!mb) continue;
      byBooking.set(mb, [...(byBooking.get(mb) || []), s]);
    }
    let removed = 0;
    for (const [mb, docs] of byBooking) {
      const strays = docs.filter((d) => d.id !== mb);
      if (strays.length === 0) continue;
      const canonicalExists = docs.some((d) => d.id === mb);
      for (const stray of strays) {
        const full = await getDoc("schedules", stray.id);
        if (!full) continue;
        if (!canonicalExists) await putDoc("schedules", mb, full.data);
        await deleteDoc("schedules", stray.id);
        removed++;
      }
    }
    console.log(`  ${removed} duplicate schedule docs folded onto booking ids`);
  }

  if (SWEEP_TOMBSTONES) {
    console.log("\n[5/5] Sweeping tombstones...");
    const all = await listCollection("clients", ["migratedTo"]);
    const tombs = all.filter((c) => c.data.migratedTo);
    for (const t of tombs) await deleteDoc("clients", t.id);
    console.log(`  ${tombs.length} tombstones removed`);
  }

  finish(report, stamp);
}

function finish(report: Report, stamp: string) {
  const reportPath = path.resolve(
    process.cwd(),
    "backups",
    `migration-report-${stamp}.json`,
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log("\n" + "=".repeat(72));
  console.log("SUMMARY");
  console.log(`  already canonical : ${report.alreadyCanonical}`);
  console.log(`  planned           : ${report.planned.length}`);
  console.log(`  migrated          : ${report.migrated.length}`);
  console.log(`  conflicts (manual): ${report.conflicts.length}`);
  console.log(`  errors            : ${report.errors.length}`);
  console.log(`  no Mindbody id    : ${report.noMindbodyId.length} (untouched by design)`);
  console.log(`  studio warnings   : ${report.unmappedStudios.length}`);
  console.log(`\n  report: ${reportPath}`);
  if (report.conflicts.length || report.errors.length) {
    console.log(
      "\n  NOT CLEAN. Resolve conflicts/errors before deploying the strict pull-sync,",
    );
    console.log("  or those clients will stop linking to their appointments.");
  } else if (report.committed) {
    console.log("\n  Clean run. Safe to deploy the strict webhook + pull-sync.");
  }
  console.log("=".repeat(72));
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
