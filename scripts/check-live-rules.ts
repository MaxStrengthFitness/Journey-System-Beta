/**
 * READ-ONLY: is the Firestore ruleset LIVE on the named database the one in
 * firestore.rules? And, when asked, are the indexes a round needs built?
 *
 * Why this exists (the open session round, Oct 9 2026). A ship script's
 * golive checks the rules after `firebase deploy --only firestore:rules`,
 * because a deploy's own success line is not evidence of what is live
 * (CHANGELOG, Sep 5 2026). The ship scripts read the live ruleset with
 * gcloud's sign-in, and gcloud is not installed on AJ's PC, so on Oct 9 2026
 * Claude checked ship-first-session's rules by hand with the project's
 * service-account key through google-auth-library. This is that check, kept.
 * scripts/fetch-live-rules.ts does a similar read with the Firebase CLI's
 * token and saves the ruleset to a file; this one needs no CLI login,
 * compares the whole text with the repo's file, and writes nothing.
 *
 * WHAT IT DOES. Lists the project's Firestore rules releases (the pointer
 * that says which ruleset is live for a database), finds the named
 * database's, reads that ruleset and compares its text with firestore.rules
 * (line ends and the outer whitespace aside). With --expect it also says
 * whether each piece of text is in the live ruleset. With --index it reads
 * that collection group's composite indexes from the Firestore Admin API and
 * says each one's state (READY is built; CREATING is still building).
 *
 * IT CHANGES NOTHING. Every request is a GET, on Google or anywhere else; it
 * writes no file. It prints the service account's e-mail (not a secret) and
 * never the key.
 *
 * AUTH: a service-account key, the one the data scripts use
 * (scripts/lib/admin.ts): --key <path>, else GOOGLE_APPLICATION_CREDENTIALS,
 * else ./service-account.json. In a worktree the key is in the project
 * folder, three levels up: --key ..\..\..\service-account.json.
 * google-auth-library comes with firebase-admin.
 *
 * USAGE (PowerShell, from the project folder or a worktree's)
 *
 *   npx tsx scripts/check-live-rules.ts --key ..\..\..\service-account.json `
 *     --project gen-lang-client-0731527386 `
 *     --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa
 *
 *   --rules <path>     the file to compare with (default: firestore.rules)
 *   --expect <text>    text the live ruleset must hold; give it more than once
 *   --index "<group>(<field>, <field> desc, ...)"
 *                      an index to look for, e.g.
 *                      --index "sessions(hostedAtStudioId, isUnassigned, status, createdAt desc)"
 *
 * EXIT CODE: 0 the live ruleset is the file's, every --expect is in it and
 * every --index is READY; 3 the live ruleset differs from the file or lacks
 * an --expect; 4 the rules are right but an --index is missing or not built
 * yet; 2 the database has no rules release at all; 1 the check could not run.
 */

import dns from "dns";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { GoogleAuth } from "google-auth-library";

dns.setDefaultResultOrder("ipv4first");

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flags = (name: string): string[] =>
  argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] !== undefined ? [argv[i + 1]] : []));

const RULES_API = "https://firebaserules.googleapis.com/v1";
const FIRESTORE_API = "https://firestore.googleapis.com/v1";

interface Release {
  name: string;
  rulesetName: string;
  updateTime?: string;
}
interface Ruleset {
  createTime?: string;
  source?: { files?: Array<{ name?: string; content?: string }> };
}
interface IndexField {
  fieldPath: string;
  order?: "ASCENDING" | "DESCENDING";
  arrayConfig?: string;
}
interface Index {
  name: string;
  queryScope?: string;
  state?: string;
  fields?: IndexField[];
}
interface WantedIndex {
  spec: string;
  group: string;
  fields: Array<{ fieldPath: string; order: "ASCENDING" | "DESCENDING" }>;
}

function fail(message: string): never {
  console.error(`\nThe check could not run: ${message}`);
  process.exit(1);
}

function keyFile(): string {
  const candidates = [
    flag("key"),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), "service-account.json"),
  ].filter((p): p is string => !!p);
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    let key: { client_email?: string; private_key?: string };
    try {
      key = JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
      fail(`${p} is not JSON.`);
    }
    if (!key.private_key || !key.client_email) {
      fail(
        `${p} is JSON but not a service-account key (no private_key / client_email). ` +
          "That is probably the web config; the key is the one from Project settings -> Service accounts.",
      );
    }
    console.log(`Auth    : service account ${key.client_email}`);
    return p;
  }
  fail(
    "no service-account key. Looked for --key <path>, GOOGLE_APPLICATION_CREDENTIALS and ./service-account.json " +
      "(in a worktree, pass --key ..\\..\\..\\service-account.json).",
  );
}

/** "sessions(hostedAtStudioId, status, createdAt desc)" -> the group and its fields, in order. */
function parseIndex(spec: string): WantedIndex {
  const m = /^\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*$/.exec(spec);
  if (!m) fail(`--index "${spec}" is not "<collection group>(<field>, <field> desc, ...)".`);
  const fields = m[2]
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => {
      const [fieldPath, dir] = f.split(/\s+/);
      const d = (dir ?? "asc").toLowerCase();
      if (d !== "asc" && d !== "desc") fail(`--index "${spec}": "${f}" ends in neither asc nor desc.`);
      return { fieldPath, order: d === "desc" ? ("DESCENDING" as const) : ("ASCENDING" as const) };
    });
  if (fields.length < 2) fail(`--index "${spec}" names fewer than two fields (a composite has at least two).`);
  return { spec, group: m[1], fields };
}

/** The live index matches when its fields are the wanted ones in order (the API may add __name__ at the end). */
function sameFields(live: IndexField[] | undefined, wanted: WantedIndex["fields"]): boolean {
  const own = (live ?? []).filter((f) => f.fieldPath !== "__name__");
  return (
    own.length === wanted.length &&
    own.every((f, i) => f.fieldPath === wanted[i].fieldPath && (f.order ?? "") === wanted[i].order)
  );
}

const normalise = (s: string) => s.replace(/\r\n/g, "\n").trim();
const shortHash = (s: string) => createHash("sha256").update(normalise(s)).digest("hex").slice(0, 16);

/** The first line where the two texts part, 1-based, or null when they don't. */
function firstDifference(a: string, b: string): { line: number; live: string; file: string } | null {
  const la = normalise(a).split("\n");
  const lb = normalise(b).split("\n");
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) return { line: i + 1, live: la[i] ?? "(the live ruleset ends here)", file: lb[i] ?? "(the file ends here)" };
  }
  return null;
}

const clip = (s: string) => (s.length > 160 ? `${s.slice(0, 157)}...` : s);

async function main(): Promise<number> {
  const projectId = flag("project");
  const databaseId = flag("database") ?? "(default)";
  const rulesPath = path.resolve(process.cwd(), flag("rules") ?? "firestore.rules");
  const expects = flags("expect");
  const wantedIndexes = flags("index").map(parseIndex);
  if (!projectId) fail("no --project (gen-lang-client-0731527386 is production).");
  if (!fs.existsSync(rulesPath)) fail(`${rulesPath} does not exist (--rules).`);
  const fileRules = fs.readFileSync(rulesPath, "utf-8");

  console.log(`Project : ${projectId}`);
  console.log(`Database: ${databaseId}`);
  const auth = new GoogleAuth({ keyFile: keyFile(), scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  // GET only: this script never changes anything.
  const get = async <T>(url: string): Promise<T> => (await client.request<T>({ url, method: "GET" })).data;

  // 1. Which ruleset is live for this database.
  const releases: Release[] = [];
  let pageToken: string | undefined;
  do {
    const page = await get<{ releases?: Release[]; nextPageToken?: string }>(
      `${RULES_API}/projects/${projectId}/releases?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
    );
    releases.push(...(page.releases ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  const firestoreReleases = releases.filter((r) => r.name.includes("/releases/cloud.firestore"));
  console.log("\nFirestore rules releases on the project:");
  for (const r of firestoreReleases) {
    console.log(`  ${r.name.split("/releases/")[1]}   updated ${r.updateTime ?? "?"}`);
  }
  const wanted = databaseId === "(default)" ? "cloud.firestore" : `cloud.firestore/${databaseId}`;
  const release = firestoreReleases.find((r) => r.name.endsWith(`/releases/${wanted}`));
  if (!release) {
    console.log(`\nNo rules release for ${wanted}: no rules were ever deployed to it, so every read and write is refused.`);
    return 2;
  }

  // 2. Its text, against the file.
  const ruleset = await get<Ruleset>(`${RULES_API}/${release.rulesetName}`);
  const liveRules = (ruleset.source?.files ?? []).map((f) => f.content ?? "").join("\n");
  if (!liveRules.trim()) fail("the live ruleset came back with no text.");
  const same = normalise(liveRules) === normalise(fileRules);
  console.log(`\nThe live rules for ${wanted}`);
  console.log(`  released     : ${release.updateTime ?? "?"}`);
  console.log(`  ruleset made : ${ruleset.createTime ?? "?"}  (${release.rulesetName.split("/").pop()})`);
  console.log(`  the same as ${path.basename(rulesPath)}: ${same ? "YES" : "NO"}  (live ${shortHash(liveRules)}, file ${shortHash(fileRules)})`);
  if (!same) {
    const d = firstDifference(liveRules, fileRules);
    if (d) {
      console.log(`  they part at line ${d.line}:`);
      console.log(`    live: ${clip(d.live)}`);
      console.log(`    file: ${clip(d.file)}`);
    }
  }
  let rulesOk = same;
  for (const text of expects) {
    const found = liveRules.includes(text);
    console.log(`  live holds "${text}": ${found ? "YES" : "NO"}`);
    if (!found) rulesOk = false;
  }

  // 3. The indexes asked about, read from the Firestore Admin API.
  let indexesOk = true;
  if (wantedIndexes.length > 0) console.log("\nIndexes:");
  for (const w of wantedIndexes) {
    const all: Index[] = [];
    let token: string | undefined;
    do {
      const page = await get<{ indexes?: Index[]; nextPageToken?: string }>(
        `${FIRESTORE_API}/projects/${projectId}/databases/${encodeURIComponent(databaseId)}/collectionGroups/${w.group}/indexes${token ? `?pageToken=${encodeURIComponent(token)}` : ""}`,
      );
      all.push(...(page.indexes ?? []));
      token = page.nextPageToken;
    } while (token);
    const match = all.find((i) => i.name.includes(`/collectionGroups/${w.group}/`) && sameFields(i.fields, w.fields));
    if (!match) {
      console.log(`  ${w.spec}: NOT THERE (not deployed yet)`);
      indexesOk = false;
    } else {
      console.log(`  ${w.spec}: ${match.state ?? "?"}${match.state === "READY" ? " (built)" : match.state === "CREATING" ? " (still building)" : ""}`);
      if (match.state !== "READY") indexesOk = false;
    }
  }

  console.log("");
  if (!rulesOk) {
    console.log(`RESULT: the live rules are NOT ${path.basename(rulesPath)}${expects.length ? " or lack an --expect" : ""}.`);
    return 3;
  }
  if (!indexesOk) {
    console.log("RESULT: the live rules are the file's; an index is missing or still building.");
    return 4;
  }
  console.log(`RESULT: the live rules are ${path.basename(rulesPath)}${wantedIndexes.length ? ", and every index asked about is built" : ""}.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    const e = err as { response?: { status?: number; data?: unknown }; message?: string };
    const detail = e.response ? `${e.response.status ?? "?"} ${JSON.stringify(e.response.data ?? "").slice(0, 300)}` : e.message ?? String(err);
    fail(detail);
  },
);
