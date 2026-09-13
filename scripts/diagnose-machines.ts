/**
 * READ-ONLY diagnostic: why is a machine wrong, and why can't you fix it?
 *
 * WRITES NOTHING. Every call below is a GET.
 *
 * Round: machine catalog + ordering, Sep 12 2026. Written to answer three
 * questions with data rather than inference, before any code changes:
 *
 *  1. IS THERE A DUPLICATE? The app carries three id conventions for the same
 *     twenty machines (features/catalog/machine-identity.ts):
 *         m-ext          DEFAULT_MACHINES, MACHINE_ANATOMY, Firestore
 *         leg_extension  MACHINE_DATABASE, routine templates
 *         sm-{studio}-*  a studio's own equipment
 *     useMachines() merges DEFAULT_MACHINES with the machines/ collection BY
 *     ID, so a document filed under the OTHER convention misses its match,
 *     falls through to `customMachines`, and renders as a SECOND machine.
 *     dedupeMachines() hides it in the Catalog; the stray document is still
 *     there, and edits to it never reach the machine on screen.
 *
 *  2. WHICH ORDER APPLIES WHERE? There are three ordering mechanisms and the
 *     screens disagree about which one wins:
 *         studios/{s}/roster/{id}.order          -> Catalog / Learning
 *         studioMachineSettings/{s}_{id}.order   -> Journey grid, Active Session
 *         machines/{id}.order + the code default -> fallbacks
 *     The second is READ by two screens and, as far as the source shows,
 *     WRITTEN BY NOTHING since TrainerControlHubView was deleted on Sep 5.
 *     This script counts how many of those documents actually carry an order,
 *     which settles whether the field is truly orphaned in your data.
 *
 *  3. WHAT DOES THE STUDIO'S FLOOR ACTUALLY SAY? Roster entries carry source,
 *     basedOn, status and order. A machine can be present twice, or present
 *     but inactive, and the Catalog will say "not on this floor" either way.
 *
 * AUTH: the Firebase CLI's own token, like the other scripts here.
 * Run `firebase login` (or `firebase login --reauth`) first.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/diagnose-machines.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
 *
 * Optional: --machine "leg ext"   narrow the deep-dive to one machine (default: leg ext)
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
const needle = (flag("machine") || "leg ext").toLowerCase();

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

const str = (f: any): string | null =>
  f?.stringValue ?? (f?.integerValue !== undefined ? String(f.integerValue) : null);
const num = (f: any): number | null =>
  f?.integerValue !== undefined
    ? Number(f.integerValue)
    : f?.doubleValue !== undefined
      ? Number(f.doubleValue)
      : null;
const bool = (f: any): boolean | null => (f?.booleanValue === undefined ? null : f.booleanValue);

/**
 * The db-key -> canonical map, copied from features/catalog/machine-identity.ts
 * rather than imported, so this script stays runnable if that module moves.
 * If it drifts, the "unknown id" bucket below gets bigger, which is visible
 * rather than silent.
 */
const DB_KEY_TO_CANONICAL: Record<string, string> = {
  "4_way_neck": "m-neck",
  cervical_extension: "m-neck",
  leg_press: "m-leg-press",
  leg_curl: "m-leg-curl",
  leg_extension: "m-ext",
  abduction: "m-hip-abd",
  adduction: "m-hip-add",
  chest_press: "m-chest-press",
  chest_flye: "m-chest-fly",
  overhead_press: "m-overhead-press",
  seated_dip: "m-dip",
  triceps_extension: "m-tricep-ext",
  biceps_curl: "m-bicep",
  lateral_raise: "m-lateral-raise",
  compound_row: "m-compound-row",
  simple_row: "m-simple-row",
  pulldown: "m-pulldown",
  pullover: "m-pullover",
  lumbar_extension: "m-lumbar",
  abdominals: "m-abs",
  torso_rotation: "m-torso-rotation",
};

/** The canonical set, from data/machine-display-order.ts. */
const CANONICAL_IDS = new Set([
  "m-neck", "m-hip-add", "m-hip-abd", "m-leg-curl", "m-ext", "m-leg-press",
  "m-pulldown", "m-chest-press", "m-compound-row", "m-overhead-press",
  "m-pullover", "m-dip", "m-tricep-ext", "m-bicep", "m-chest-fly",
  "m-simple-row", "m-lateral-raise", "m-lumbar", "m-torso-rotation", "m-abs",
]);

const rule = (c = "=") => console.log(c.repeat(78));
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\bseated\b|\bmedx\b|\bnautilus\b/g, "").trim();

async function main() {
  rule();
  console.log(`Machine catalog diagnostic  -  ${projectId}`);
  console.log(`database: ${databaseId}`);
  rule();

  /* ---------------------------------------------------------------- 1 ----- */
  console.log("\n1. THE GLOBAL machines/ COLLECTION\n");
  const machines = await list("machines", ["name", "order", "muscleGroup", "isActive"]);
  console.log(`   ${machines.length} documents\n`);

  const strays: typeof machines = [];
  const canonical: typeof machines = [];
  const unknown: typeof machines = [];
  for (const m of machines) {
    if (CANONICAL_IDS.has(m.id)) canonical.push(m);
    else if (DB_KEY_TO_CANONICAL[m.id]) strays.push(m);
    else unknown.push(m);
  }

  console.log(`   canonical ids (m-*)            : ${canonical.length}  <- merge correctly`);
  console.log(`   db-key ids (leg_extension etc) : ${strays.length}  <- render as DUPLICATES`);
  console.log(`   ids in neither convention      : ${unknown.length}`);

  if (strays.length) {
    console.log("\n   *** STRAY DOCUMENTS - these are the duplicates ***");
    console.log("   Each one misses its match in useMachines() and renders as a second");
    console.log("   machine. Editing one of these never changes the machine on screen.\n");
    for (const m of strays) {
      const c = DB_KEY_TO_CANONICAL[m.id];
      const twin = canonical.find((x) => x.id === c);
      console.log(
        `     ${m.id.padEnd(22)} "${str(m.fields.name) ?? "(unnamed)"}"  order=${num(m.fields.order) ?? "-"}`,
      );
      console.log(
        `       should be: ${c}${twin ? `   (which ALSO exists as "${str(twin.fields.name)}")` : "   (no canonical doc - safe to rename)"}`,
      );
    }
  } else {
    console.log("\n   No stray db-key documents. The duplicate theory is wrong for this data.");
  }

  if (unknown.length) {
    console.log("\n   ids in neither convention (studio machines are sm-*, which is fine):");
    for (const m of unknown) {
      console.log(`     ${m.id.padEnd(22)} "${str(m.fields.name) ?? "(unnamed)"}"`);
    }
  }

  // Name collisions, independent of id convention.
  const byName = new Map<string, string[]>();
  for (const m of machines) {
    const n = norm(str(m.fields.name) ?? m.id);
    if (!n) continue;
    byName.set(n, [...(byName.get(n) || []), m.id]);
  }
  const dupeNames = [...byName.entries()].filter(([, ids]) => ids.length > 1);
  console.log(`\n   name collisions (ignoring "Seated"/brand words): ${dupeNames.length}`);
  for (const [n, ids] of dupeNames) console.log(`     "${n}" -> ${ids.join(", ")}`);

  /* ---------------------------------------------------------------- 2 ----- */
  console.log("\n");
  rule("-");
  console.log("2. IS studioMachineSettings.order ORPHANED?\n");
  const sms = await list("studioMachineSettings", ["order", "isActive", "machineId", "studioId"]);
  const withOrder = sms.filter((d) => num(d.fields.order) !== null);
  const withActive = sms.filter((d) => bool(d.fields.isActive) !== null);
  console.log(`   ${sms.length} documents`);
  console.log(`   carrying an \`order\`    : ${withOrder.length}`);
  console.log(`   carrying an \`isActive\` : ${withActive.length}`);
  console.log("\n   The Journey grid and the Active Session sort by this field.");
  if (withOrder.length === 0) {
    console.log("   ZERO carry it -> both screens are falling back to the code default,");
    console.log("   and no per-studio ordering can ever show up on the floor. Confirmed orphan.");
  } else {
    console.log("   Some DO carry it, so something wrote them once. Listing them:");
    for (const d of withOrder.slice(0, 25)) {
      console.log(`     ${d.id.padEnd(40)} order=${num(d.fields.order)}`);
    }
  }

  /* ---------------------------------------------------------------- 3 ----- */
  console.log("\n");
  rule("-");
  console.log("3. EACH STUDIO'S FLOOR (studios/{id}/roster)\n");
  const studios = await list("studios", ["name"]);
  for (const s of studios) {
    const roster = await list(`studios/${s.id}/roster`, [
      "machineId", "source", "basedOn", "status", "order", "shared", "adoptedFrom",
    ]);
    console.log(`   ${str(s.fields.name) ?? s.id}  (${s.id})  -  ${roster.length} entries`);
    if (roster.length === 0) {
      console.log("     EMPTY -> the Catalog falls back to the global list and shows every");
      console.log("     MSF machine as this studio's own. Ordering cannot be set at all.");
      continue;
    }
    const ordered = roster.filter((r) => num(r.fields.order) !== null);
    const inactive = roster.filter((r) => str(r.fields.status) === "inactive");
    console.log(`     with an explicit order: ${ordered.length}/${roster.length}   inactive: ${inactive.length}`);
    const hits = roster.filter((r) => norm(r.id).includes(norm(needle)) || norm(str(r.fields.machineId) ?? "").includes(norm(needle)));
    for (const r of hits) {
      console.log(
        `     [${needle}] ${r.id.padEnd(26)} source=${str(r.fields.source) ?? "-"} basedOn=${str(r.fields.basedOn) ?? "-"} status=${str(r.fields.status) ?? "-"} order=${num(r.fields.order) ?? "-"}`,
      );
    }
    if (hits.length === 0) console.log(`     [${needle}] NOT on this floor`);
    if (hits.length > 1) console.log(`     *** ${hits.length} entries match "${needle}" on one floor - duplicate on the roster ***`);
  }

  /* ---------------------------------------------------------------- 4 ----- */
  console.log("\n");
  rule("-");
  console.log(`4. DEEP DIVE: "${needle}"\n`);
  const hits = machines.filter(
    (m) => norm(m.id).includes(norm(needle)) || norm(str(m.fields.name) ?? "").includes(norm(needle)),
  );
  if (hits.length === 0) {
    console.log(`   Nothing in machines/ matches "${needle}".`);
    console.log("   So the machine you see comes from the CODE defaults (data/machine-database.ts)");
    console.log("   and there is no Firestore document to edit. That is why editing does nothing:");
    console.log("   Admin -> Machine catalog has to CREATE the document before it can change it.");
  } else {
    for (const m of hits) {
      console.log(`   machines/${m.id}`);
      console.log(`     name        : ${str(m.fields.name) ?? "(unnamed)"}`);
      console.log(`     order       : ${num(m.fields.order) ?? "(none)"}`);
      console.log(`     muscleGroup : ${str(m.fields.muscleGroup) ?? "(none)"}`);
      console.log(`     isActive    : ${bool(m.fields.isActive) ?? "(none)"}`);
      console.log(
        `     id verdict  : ${CANONICAL_IDS.has(m.id) ? "canonical - merges correctly" : DB_KEY_TO_CANONICAL[m.id] ? `STRAY (should be ${DB_KEY_TO_CANONICAL[m.id]})` : "unrecognised"}`,
      );
      console.log("");
    }
  }

  rule();
  console.log("Read-only. Nothing was written. Send this whole output to Claude.");
  rule();
}

main().catch((e) => {
  console.error("\nFAILED:", e?.message ?? e);
  console.error("If this is a 401/403, run `firebase login --reauth` and try again.");
  process.exit(1);
});
