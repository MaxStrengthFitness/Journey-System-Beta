/**
 * READ-ONLY: compare the composite indexes that are LIVE against
 * firestore.indexes.json, before running an index deploy.
 *
 * Why: `firebase deploy --only firestore:indexes` will offer to DELETE any
 * live index missing from the file. Dropping one does not raise an error --
 * the queries that needed it simply start failing. This repo has already
 * drifted from production once (the roster rule, Sep 1), so check first.
 *
 * AUTH: the Firebase CLI's own token, like the other scripts here.
 * Run `firebase login` first. Writes nothing, changes nothing.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/fetch-live-indexes.ts --project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
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

/**
 * Canonical string for one index, so live and repo entries can be compared.
 * The API always reports a trailing __name__ field that the JSON file omits,
 * so it is stripped from both sides.
 */
function key(collectionGroup: string, queryScope: string, fields: any[]) {
  const parts = (fields || [])
    .filter((f) => f.fieldPath !== "__name__")
    .map((f) => `${f.fieldPath}:${f.order || f.arrayConfig || "?"}`);
  return `${collectionGroup} [${queryScope || "COLLECTION"}] ${parts.join(", ")}`;
}

async function main() {
  console.log(`Project : ${projectId}`);
  console.log(`Database: ${databaseId}\n`);

  const live = new Map<string, string>();
  let pageToken: string | undefined;
  do {
    // NOTE: this API rejects an explicit pageSize on Enterprise-edition
    // databases ("Invalid page size. Only 0 is supported."), so let the
    // server pick the page size and just follow nextPageToken.
    const url =
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}` +
      `/collectionGroups/-/indexes${pageToken ? `?pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const page: any = await res.json();
    for (const idx of page.indexes ?? []) {
      const cg = idx.name.split("/collectionGroups/")[1]?.split("/indexes/")[0] ?? "?";
      live.set(key(cg, idx.queryScope, idx.fields), idx.state ?? "READY");
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  const repoFile = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "firestore.indexes.json"), "utf-8"));
  const repo = new Set<string>(
    (repoFile.indexes ?? []).map((i: any) => key(i.collectionGroup, i.queryScope, i.fields)),
  );

  const onlyRepo = [...repo].filter((k) => !live.has(k)).sort();
  const onlyLive = [...live.keys()].filter((k) => !repo.has(k)).sort();
  const both = [...repo].filter((k) => live.has(k));

  console.log(`Live composite indexes : ${live.size}`);
  console.log(`In firestore.indexes.json: ${repo.size}`);
  console.log(`Already matching        : ${both.length}\n`);

  console.log(`WOULD BE CREATED by a deploy (${onlyRepo.length}):`);
  onlyRepo.forEach((k) => console.log(`   + ${k}`));
  if (!onlyRepo.length) console.log("   (none)");

  console.log(`\nAT RISK OF DELETION -- live but not in the file (${onlyLive.length}):`);
  onlyLive.forEach((k) => console.log(`   ! ${k}   [${live.get(k)}]`));
  if (!onlyLive.length) console.log("   (none -- an index deploy is purely additive)");

  const building = [...live.entries()].filter(([, s]) => s !== "READY");
  if (building.length) {
    console.log(`\nStill building (${building.length}):`);
    building.forEach(([k, s]) => console.log(`   ~ ${k}   [${s}]`));
  }

  console.log(
    onlyLive.length
      ? "\nDo NOT answer yes to any deletion prompt until each ! line above is accounted for."
      : "\nSafe to deploy: nothing live would be removed.",
  );
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
