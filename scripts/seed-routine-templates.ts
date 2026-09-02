/**
 * Seed the hardcoded GLOBAL_ROUTINE_PRESETS into the routinePresets
 * collection as company-tier templates.
 *
 * Round: Routine Template Builder, Sep 2026.
 *
 * Before this round, company-wide routine templates were three entries in
 * data/routine-presets.ts -- changing one meant editing code and shipping a
 * build. They now live in Firestore so admins can author them in the app.
 * This moves the existing three across once.
 *
 * The code file stays as a fallback: the drawer falls back to it when the
 * collection has no company template, so an empty database degrades to the
 * old behavior instead of an empty menu.
 *
 * IDEMPOTENT: skips any template whose name already exists at company tier,
 * so re-running after a partial failure is safe.
 *
 * AUTH: the Firebase CLI's own token, like the other scripts here.
 * Run `firebase login` first.
 *
 * USAGE (PowerShell, from the project folder)
 *   # show what would be written, change nothing:
 *   npx tsx scripts/seed-routine-templates.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
 *   # actually write:
 *   npx tsx scripts/seed-routine-templates.ts --project ... --database ... --apply
 */

import dns from "dns";
import fs from "fs";
import path from "path";
import os from "os";
import { GLOBAL_ROUTINE_PRESETS } from "../src/data/routine-presets";

dns.setDefaultResultOrder("ipv4first");

const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const APPLY = argv.includes("--apply");

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

const baseUrl =
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

/** Firestore REST wants every value tagged with its type. */
const sv = (s: string) => ({ stringValue: s });
const av = (list: string[]) => ({ arrayValue: { values: list.map(sv) } });

async function main() {
  console.log(`Project : ${projectId}`);
  console.log(`Database: ${databaseId}`);
  console.log(`Mode    : ${APPLY ? "APPLY (writes)" : "dry run (writes nothing)"}\n`);

  const res = await fetch(`${baseUrl}/routinePresets`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  const existing: any = res.status === 404 ? {} : await res.json();

  const alreadyCompany = new Set<string>(
    (existing.documents ?? [])
      .filter((d: any) => (d.fields?.tier?.stringValue ?? "trainer") === "company")
      .map((d: any) => (d.fields?.name?.stringValue ?? "").trim()),
  );

  console.log(`Company templates already in Firestore: ${alreadyCompany.size}`);
  for (const n of alreadyCompany) console.log(`   = ${n}`);
  console.log();

  const todo = GLOBAL_ROUTINE_PRESETS.filter(
    (p) => !alreadyCompany.has(p.name.trim()),
  );

  if (todo.length === 0) {
    console.log("Nothing to seed -- every built-in template is already live.");
    return;
  }

  console.log(`To seed (${todo.length}):`);
  for (const p of todo) {
    console.log(`   + ${p.name}  [${p.machineIds.length} machines]`);
  }
  console.log();

  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to write these.");
    return;
  }

  for (const p of todo) {
    const body = {
      fields: {
        name: sv(p.name),
        description: sv(p.description ?? ""),
        machineIds: av(p.machineIds),
        machineNotes: { mapValue: { fields: {} } },
        tier: sv("company"),
        scope: sv("global"),
        createdByName: sv("Seeded from data/routine-presets.ts"),
        createdAt: { timestampValue: new Date().toISOString() },
      },
    };
    const w = await fetch(`${baseUrl}/routinePresets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!w.ok) {
      console.error(`   ! ${p.name}: ${w.status} ${await w.text()}`);
    } else {
      console.log(`   + ${p.name} written`);
    }
  }
  console.log("\nDone. Check the Routine Templates tab in the admin hub.");
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
