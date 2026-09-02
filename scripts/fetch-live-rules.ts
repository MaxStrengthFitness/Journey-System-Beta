/**
 * READ-ONLY: download the Firestore security rules that are ACTUALLY DEPLOYED.
 *
 * Why this exists: `firestore.rules` in this repo describes what we *intend*
 * to be live. It is not evidence of what IS live — rules only reach Google
 * when someone runs a deploy, and this project has a history of the two
 * drifting apart (ROADMAP, Aug 29). Reading the console is error-prone
 * because gen-lang-client-0731527386 contains seven ai-studio-* databases
 * and the selector remembers whichever you last used.
 *
 * This asks the Rules API directly, so the answer is unambiguous.
 *
 * Writes ONE file: live-rules-<database>.rules in the project root.
 * Changes nothing on Google.
 *
 * AUTH: the Firebase CLI's own token, like the other scripts here.
 * Run `firebase login` (or `firebase login --reauth`) first.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/fetch-live-rules.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
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

const get = async (url: string) => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as any;
};

/**
 * A "release" is the pointer that says which ruleset is live for a target.
 * Default database:  projects/<p>/releases/cloud.firestore
 * Named database:    projects/<p>/releases/cloud.firestore/<databaseId>
 * Storage also lives here as firebase.storage/... — filtered out below.
 */
async function main() {
  console.log(`Project : ${projectId}`);
  console.log(`Database: ${databaseId}\n`);

  const releases: any[] = [];
  let pageToken: string | undefined;
  do {
    const url =
      `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases` +
      `?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const page = await get(url);
    releases.push(...(page.releases ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  const firestoreReleases = releases.filter((r) => r.name.includes("/cloud.firestore"));

  if (firestoreReleases.length === 0) {
    console.error("No Firestore rules releases found on this project at all.");
    process.exit(1);
  }

  console.log("Firestore rule releases on this project:");
  for (const r of firestoreReleases) {
    const target = r.name.split("/releases/")[1];
    console.log(`  ${target}   (updated ${r.updateTime})`);
  }
  console.log();

  const wantedSuffix =
    databaseId === "(default)" ? "cloud.firestore" : `cloud.firestore/${databaseId}`;
  const match = firestoreReleases.find((r) => r.name.endsWith(`/releases/${wantedSuffix}`));

  if (!match) {
    console.error(
      `\nNo rules release exists for database "${databaseId}".\n` +
        `That means NO rules have ever been deployed to it, so every read and\n` +
        `write is denied by default. Deploying firestore.rules will create it.`,
    );
    process.exit(2);
  }

  const ruleset = await get(`https://firebaserules.googleapis.com/v1/${match.rulesetName}`);
  const files = ruleset?.source?.files ?? [];
  if (files.length === 0) throw new Error("Ruleset came back with no source files.");

  const content = files.map((f: any) => f.content).join("\n");
  const outPath = path.resolve(process.cwd(), `live-rules-${databaseId}.rules`);
  fs.writeFileSync(outPath, content, "utf8");

  console.log(`Live ruleset : ${match.rulesetName}`);
  console.log(`Deployed at  : ${ruleset.createTime}`);
  console.log(`Saved to     : ${path.basename(outPath)}  (${content.length} chars)\n`);

  const hasRoster = /match\s+\/roster\//.test(content);
  console.log(`Contains a /roster rule? ${hasRoster ? "YES" : "NO  <-- this is the bug"}`);
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
