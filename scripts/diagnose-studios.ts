/**
 * READ-ONLY diagnostic: which studios can the sync actually resolve?
 *
 * Writes nothing. `resolveStudioId()` in src/lib/mindbody-api-sync.ts maps a
 * Mindbody appointment to a studio by matching BOTH
 * `mindbodyLocationId` AND `mindbodySiteId` on the studio document. Its only
 * fallback is "if exactly one studio is on this site, use that one" — so as
 * soon as TWO studios share a site, any studio missing a location id becomes
 * unresolvable and every one of its appointments is silently dropped.
 *
 * That failure is invisible in the UI: the studio simply shows no sessions.
 *
 * AUTH: the Firebase CLI's own token, like the other scripts here.
 * Run `firebase login` (or `firebase login --reauth`) first.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/diagnose-studios.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
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

const get = async (url: string) => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as any;
};

async function list(name: string, mask?: string[]) {
  const out: { id: string; fields: any }[] = [];
  let pageToken = "";
  do {
    const m = (mask || []).map((f) => `&mask.fieldPaths=${encodeURIComponent(f)}`).join("");
    const body = await get(
      `${baseUrl}/${name}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}${m}`,
    );
    if (!body) return out;
    for (const d of body.documents || []) {
      out.push({ id: String(d.name).split("/").pop()!, fields: d.fields || {} });
    }
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return out;
}

const str = (f: any) =>
  f?.stringValue ?? (f?.integerValue !== undefined ? String(f.integerValue) : null);

async function main() {
  console.log("=".repeat(70));
  console.log(`Studio resolution diagnostic - ${projectId}`);
  console.log("=".repeat(70));

  const studios = await list("studios", ["name", "mindbodySiteId", "mindbodyLocationId"]);
  const schedules = await list("schedules", ["studioId", "startTime", "status"]);
  const clients = await list("clients", ["homeStudioId"]);

  const bySite = new Map<string, string[]>();
  console.log(`\nstudios: ${studios.length}`);
  for (const s of studios) {
    const name = str(s.fields.name) ?? "(unnamed)";
    const site = str(s.fields.mindbodySiteId);
    const loc = str(s.fields.mindbodyLocationId);
    const ok = site && loc;
    console.log(
      `  ${ok ? "OK  " : "MISS"}  ${name.padEnd(24)} id=${s.id}  siteId=${site ?? "(none)"}  locationId=${loc ?? "(NONE)"}`,
    );
    if (site) bySite.set(site, [...(bySite.get(site) || []), name]);
  }

  console.log("\nresolvability (how resolveStudioId will behave):");
  for (const s of studios) {
    const name = str(s.fields.name) ?? "(unnamed)";
    const site = str(s.fields.mindbodySiteId);
    const loc = str(s.fields.mindbodyLocationId);
    if (loc && site) {
      console.log(`  ${name}: resolvable by locationId`);
    } else if (site && (bySite.get(site)?.length ?? 0) === 1) {
      console.log(`  ${name}: resolvable ONLY by the single-studio-on-site fallback`);
    } else if (site) {
      console.log(
        `  ${name}: *** UNRESOLVABLE *** no locationId, and ${bySite.get(site)!.length} studios share site ${site} -> every appointment is dropped`,
      );
    } else {
      console.log(`  ${name}: *** UNRESOLVABLE *** no mindbodySiteId at all`);
    }
  }

  const schedByStudio = new Map<string, number>();
  for (const s of schedules) {
    if (str(s.fields.status) === "Cancelled") continue;
    const sid = str(s.fields.studioId) ?? "(no studioId)";
    schedByStudio.set(sid, (schedByStudio.get(sid) || 0) + 1);
  }
  console.log("\nschedule rows per studioId (excluding cancelled):");
  const nameById = new Map(studios.map((s) => [s.id, str(s.fields.name) ?? s.id]));
  for (const [sid, n] of [...schedByStudio.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(nameById.get(sid) ?? sid).padEnd(28)} ${n}`);
  }
  for (const s of studios) {
    if (!schedByStudio.has(s.id)) {
      console.log(`  ${(str(s.fields.name) ?? s.id).padEnd(28)} 0   <-- no rows at all`);
    }
  }

  const cliByStudio = new Map<string, number>();
  for (const c of clients) {
    const sid = str(c.fields.homeStudioId) ?? "(no homeStudioId)";
    cliByStudio.set(sid, (cliByStudio.get(sid) || 0) + 1);
  }
  console.log("\nclients per homeStudioId:");
  for (const [sid, n] of [...cliByStudio.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(nameById.get(sid) ?? sid).padEnd(28)} ${n}`);
  }

  console.log("\n" + "=".repeat(70));
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e);
  process.exit(1);
});
