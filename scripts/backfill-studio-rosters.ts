/**
 * ONE-OFF BACKFILL — seed studios/{studioId}/roster from the global catalog.
 *
 * WHY THIS EXISTS
 * `studios/{id}/roster` is the answer to "what equipment does this location
 * actually have". Every new machine hook reads it. Nothing has ever written it
 * except the Studio Inventory screen (Admin -> Machines), one machine at a
 * time, by hand — so in production it is empty for every studio, and any screen
 * reading it unbridged renders nothing at all.
 *
 * That is what made a daily "wipe down every machine" task expand to zero rows
 * and report "Nothing scheduled today", and what made the task editor's machine
 * picker render an empty box that looked like a broken button (Sep 5 2026).
 * The app now bridges to the global catalog when a roster is empty; this script
 * removes the need for that bridge.
 *
 * WHAT IT WRITES
 * One doc per machine per studio, in the same shape the Studio Inventory screen
 * writes:
 *   studios/{studioId}/roster/{machineId}
 *   { machineId, studioId, status, source: "catalog", basedOn, updatedAt, updatedBy }
 *
 * Status is "active" unless the DEPRECATED per-studio `studioMachineSettings`
 * doc for that pair says `isActive: false`, in which case the studio has
 * already told us it does not have that machine and we honour it as "inactive".
 * That is the one thing studioMachineSettings is still good for; nothing new
 * should be built on it (see firestore.rules, "SUPERSEDED by roster").
 *
 * SAFETY MODEL
 *   - Dry run by default. Nothing is written without --commit.
 *   - A studio that ALREADY has any roster doc is skipped entirely, because a
 *     populated roster means a human curated it and a machine missing from it
 *     may be missing on purpose. --fill-gaps overrides that and adds only the
 *     machines that are absent.
 *   - Every write uses the precondition `currentDocument.exists=false`, so an
 *     existing doc is never overwritten and a crashed run is safe to re-run.
 *   - A JSON report of everything it did (or would do) is written to backups/.
 *
 * AUTH: the Firebase CLI's own token, like the other scripts here. This talks
 * to the Firestore REST API as your Google account and bypasses security rules.
 * Run `npx firebase login` first.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/backfill-studio-rosters.ts                    # dry run, staging
 *   npx tsx scripts/backfill-studio-rosters.ts --commit           # execute
 *   npx tsx scripts/backfill-studio-rosters.ts --studio solon     # one studio
 *   npx tsx scripts/backfill-studio-rosters.ts --fill-gaps        # top up curated rosters
 *   npx tsx scripts/backfill-studio-rosters.ts --commit --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
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
const FILL_GAPS = hasFlag("fill-gaps");
const ONLY_STUDIO = flag("studio");

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

const str = (f: any): string | null => f?.stringValue ?? null;
const bool = (f: any): boolean | undefined =>
  f?.booleanValue === undefined ? undefined : Boolean(f.booleanValue);

/** Create only. Returns "written" | "exists". Never overwrites. */
async function createRosterDoc(
  studioId: string,
  machineId: string,
  status: "active" | "inactive",
): Promise<"written" | "exists"> {
  const url =
    `${baseUrl}/studios/${encodeURIComponent(studioId)}/roster/` +
    `${encodeURIComponent(machineId)}?currentDocument.exists=false`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        machineId: { stringValue: machineId },
        studioId: { stringValue: studioId },
        status: { stringValue: status },
        source: { stringValue: "catalog" },
        basedOn: { stringValue: machineId },
        updatedAt: { timestampValue: new Date().toISOString() },
        updatedBy: { stringValue: "backfill-studio-rosters" },
      },
    }),
  });
  if (res.status === 409) return "exists";
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return "written";
}

// ---------------------------------------------------------------------------

interface StudioPlan {
  studioId: string;
  studioName: string;
  existingRoster: number;
  skipped: string | null;
  toWrite: { machineId: string; status: "active" | "inactive" }[];
  written: number;
  alreadyExisted: number;
}

async function main() {
  console.log("=".repeat(72));
  console.log(`Studio roster backfill — ${projectId} / ${databaseId}`);
  console.log(COMMIT ? "MODE: COMMIT (writing)" : "MODE: DRY RUN (no writes)");
  if (ONLY_STUDIO) console.log(`STUDIO FILTER: ${ONLY_STUDIO}`);
  if (FILL_GAPS) console.log("FILL-GAPS: topping up rosters that already exist");
  console.log("=".repeat(72));

  const catalog = await list("machines", ["status"]);
  const activeCatalog = catalog.filter(
    (m) => (str(m.fields.status) ?? "active") === "active",
  );
  console.log(
    `\nglobal catalog: ${catalog.length} machines, ${activeCatalog.length} active`,
  );
  if (activeCatalog.length === 0) {
    console.error(
      "\nThe global `machines` collection is empty, so there is nothing to seed\n" +
        "a roster FROM. Seed the catalog first; this script will not invent it.",
    );
    process.exit(1);
  }

  // Deprecated per-studio possession flags, honoured where they exist.
  const settings = await list("studioMachineSettings", ["isActive"]);
  const inactivePairs = new Set<string>();
  for (const s of settings) {
    if (bool(s.fields.isActive) === false) inactivePairs.add(s.id);
  }
  console.log(
    `studioMachineSettings: ${settings.length} docs, ` +
      `${inactivePairs.size} marked "studio does not have this machine"`,
  );

  let studios = await list("studios", ["name"]);
  if (ONLY_STUDIO) studios = studios.filter((s) => s.id === ONLY_STUDIO);
  console.log(`studios: ${studios.length}\n`);

  const plans: StudioPlan[] = [];

  for (const studio of studios) {
    const studioName = str(studio.fields.name) ?? "(unnamed)";
    const roster = await list(`studios/${studio.id}/roster`, ["machineId"]);
    const rostered = new Set(roster.map((r) => r.id));

    const plan: StudioPlan = {
      studioId: studio.id,
      studioName,
      existingRoster: roster.length,
      skipped: null,
      toWrite: [],
      written: 0,
      alreadyExisted: 0,
    };

    if (roster.length > 0 && !FILL_GAPS) {
      // A curated roster is a set of decisions. A machine missing from it may
      // be missing on purpose, and re-adding it would silently undo that.
      plan.skipped = `already has ${roster.length} roster docs (use --fill-gaps to top up)`;
      plans.push(plan);
      console.log(`  SKIP  ${studioName.padEnd(26)} ${plan.skipped}`);
      continue;
    }

    for (const m of activeCatalog) {
      if (rostered.has(m.id)) continue;
      const status = inactivePairs.has(`${studio.id}_${m.id}`)
        ? "inactive"
        : "active";
      plan.toWrite.push({ machineId: m.id, status });
    }

    if (COMMIT) {
      for (const entry of plan.toWrite) {
        const result = await createRosterDoc(
          studio.id,
          entry.machineId,
          entry.status,
        );
        if (result === "written") plan.written += 1;
        else plan.alreadyExisted += 1;
      }
    }

    const inactive = plan.toWrite.filter((e) => e.status === "inactive").length;
    console.log(
      `  ${COMMIT ? "WROTE" : "PLAN "} ${studioName.padEnd(26)} ` +
        `${plan.toWrite.length} machines` +
        (inactive ? ` (${inactive} marked inactive from studioMachineSettings)` : "") +
        (COMMIT ? ` -> ${plan.written} written, ${plan.alreadyExisted} already there` : ""),
    );
    plans.push(plan);
  }

  const totalPlanned = plans.reduce((n, p) => n + p.toWrite.length, 0);
  const totalWritten = plans.reduce((n, p) => n + p.written, 0);

  console.log("\n" + "=".repeat(72));
  console.log(
    COMMIT
      ? `Done. ${totalWritten} roster documents written across ${plans.length} studios.`
      : `Dry run. ${totalPlanned} roster documents would be written across ${plans.length} studios.`,
  );
  if (!COMMIT) console.log("Re-run with --commit to write them.");
  console.log("=".repeat(72));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, `roster-backfill-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      { projectId, databaseId, commit: COMMIT, fillGaps: FILL_GAPS, plans },
      null,
      2,
    ),
  );
  console.log(`\nReport: ${reportPath}`);
}

main().catch((err) => {
  console.error("\nFAILED:", err);
  process.exit(1);
});
