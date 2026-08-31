/**
 * READ-ONLY diagnostic: why are schedule blocks showing "Not synced"?
 *
 * Writes nothing. Answers, with counts rather than guesses:
 *   - how many schedule rows exist, and how many carry a clientId at all
 *   - whether the client documents those rows point at actually EXIST
 *   - whether client documents are at the canonical id (`clients/{mindbodyClientId}`)
 *   - which days the rows fall on, since the hub's roster only covers a window
 *
 * That distinguishes the three very different causes of the same symptom:
 *   A. the row has no clientId          -> the sync could not identify the client
 *   B. the row points at a missing doc  -> client creation failed
 *   C. the doc exists and is canonical  -> the UI is not loading it (roster window)
 *
 * AUTH: the Firebase CLI's own token, exactly like the other scripts here.
 * Run `npx firebase login` once first.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/diagnose-schedule-links.ts
 *   npx tsx scripts/diagnose-schedule-links.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
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
const databaseId = flag("database") || config.firestoreDatabaseId || "(default)";
if (!projectId || !accessToken) {
  console.error("Missing projectId or access token.");
  process.exit(1);
}
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

const get = async (url: string) => {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as any;
};

async function list(name: string, mask?: string[]) {
  const out: { id: string; fields: any }[] = [];
  let pageToken = "";
  do {
    const m = (mask || [])
      .map((f) => `&mask.fieldPaths=${encodeURIComponent(f)}`)
      .join("");
    const body = await get(
      `${baseUrl}/${name}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}${m}`,
    );
    if (!body) return out;
    for (const d of body.documents || []) {
      out.push({ id: String(d.name).split("/").pop(), fields: d.fields || {} });
    }
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return out;
}

const str = (f: any) =>
  f?.stringValue ?? (f?.integerValue !== undefined ? String(f.integerValue) : null);

async function main() {
  console.log("=".repeat(70));
  console.log(`Schedule link diagnostic — ${projectId} / ${databaseId}`);
  console.log("=".repeat(70));

  const schedules = await list("schedules", [
    "clientId",
    "clientName",
    "mindbodyClientId",
    "startTime",
    "studioId",
    "status",
  ]);
  const clients = await list("clients", ["mindbodyClientId"]);

  const clientIds = new Set(clients.map((c) => c.id));
  const canonical = clients.filter(
    (c) => str(c.fields.mindbodyClientId) === c.id,
  ).length;

  console.log(`\nclients: ${clients.length} documents`);
  console.log(`  at the canonical id (doc id === mindbodyClientId): ${canonical}`);
  console.log(`  NOT canonical: ${clients.length - canonical}`);

  let noClientId = 0;
  let missingDoc = 0;
  let good = 0;
  const byDay = new Map<string, { total: number; linked: number }>();
  const missingSamples: string[] = [];
  const orphanSamples: string[] = [];

  for (const s of schedules) {
    if (str(s.fields.status) === "Cancelled") continue;
    const cid = str(s.fields.clientId);
    const start = s.fields.startTime?.timestampValue;
    const day = start ? String(start).slice(0, 10) : "no-date";
    const row = byDay.get(day) || { total: 0, linked: 0 };
    row.total++;

    if (!cid) {
      noClientId++;
      if (missingSamples.length < 5) {
        missingSamples.push(
          `${s.id} "${str(s.fields.clientName) ?? "?"}" (mindbodyClientId field: ${str(s.fields.mindbodyClientId) ?? "none"})`,
        );
      }
    } else if (!clientIds.has(cid)) {
      missingDoc++;
      if (orphanSamples.length < 5) {
        orphanSamples.push(
          `${s.id} "${str(s.fields.clientName) ?? "?"}" -> clients/${cid} (does not exist)`,
        );
      }
    } else {
      good++;
      row.linked++;
    }
    byDay.set(day, row);
  }

  console.log(`\nschedules: ${schedules.length} documents (excluding cancelled)`);
  console.log(`  A. no clientId at all      : ${noClientId}`);
  console.log(`  B. points at a MISSING doc : ${missingDoc}`);
  console.log(`  C. resolves correctly      : ${good}`);

  if (missingSamples.length) {
    console.log("\n  A samples (sync could not identify the client):");
    missingSamples.forEach((x) => console.log(`    ${x}`));
  }
  if (orphanSamples.length) {
    console.log("\n  B samples (client creation failed):");
    orphanSamples.forEach((x) => console.log(`    ${x}`));
  }

  console.log("\nper day (UTC date of startTime), linked / total:");
  Array.from(byDay.entries())
    .sort()
    .slice(0, 20)
    .forEach(([day, r]) => console.log(`  ${day}  ${r.linked}/${r.total}`));

  console.log("\nREADING THIS:");
  if (missingDoc > 0) {
    console.log("  B > 0 — client documents are genuinely missing. The pull-sync");
    console.log("  failed to create them (check the write quota). Run Refresh Schedule again.");
  }
  if (noClientId > 0) {
    console.log("  A > 0 — those appointments reached us with no Mindbody ClientId,");
    console.log("  so there is nothing to key on. Check server.ts's normalizer and the");
    console.log("  raw Mindbody response for those bookings.");
  }
  if (good > 0 && missingDoc === 0 && noClientId === 0) {
    console.log("  Everything resolves in the database. If blocks still read");
    console.log("  'Not synced', the UI is not loading those clients — check the day");
    console.log("  you are viewing against useLiveSchedule's roster window.");
  }
  console.log("=".repeat(70));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
