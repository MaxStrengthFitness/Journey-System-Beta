/**
 * THE PERF LAB, ONE COMMAND.
 *
 *   node harness/perf-lab/lab.mjs all        build -> emulators -> seed -> export -> run -> report
 *   node harness/perf-lab/lab.mjs emulators  start them (from the seeded export if there is one;
 *                                            --empty for none) and wait; Ctrl+C stops them
 *   node harness/perf-lab/lab.mjs seed       seed the running emulators and export the result
 *   node harness/perf-lab/lab.mjs build      the lab build only
 *   node harness/perf-lab/lab.mjs run        the driver only (needs the build and the export)
 *
 * Every rep of the run starts its own emulators from the seeded export (about
 * 13 s), so every rep sees the same studio and nothing one rep wrote (or left
 * locked) reaches the next.
 *
 * Options for all/run: --profiles ipad10-portrait,desktop  --reps 3
 *   --scenarios cold,warm,idle,client,session,ops,scroll  --idleMs 70000
 *   --out <folder> (default PERF_LAB_OUT, else <temp>/journey-perf-lab)
 *   --clients 300 (the seed's size)  --skip-build (reuse <out>/lab-build)
 *
 * Only ever the local emulators under demo-perf-lab: see README.md.
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { AUTH_PORT, DATABASE_ID, FIRESTORE_PORT, HOST, LAB_DIR, LAB_UID, OUT_DIR, PROJECT_ID, REPO_ROOT, STUDIO_ID, emulatorEnv, labCredentials } from "./lab-config.mjs";
import { runLab } from "./run.mjs";

const isWindows = process.platform === "win32";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[a.slice(2)] = next;
        i += 1;
      } else out[a.slice(2)] = "1";
    } else out._.push(a);
  }
  return out;
}

/** The environment for every child: no real credential, ever. */
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
  delete env.FIREBASE_TOKEN;
  return env;
}

function run(command, args, extraEnv = {}) {
  const r = spawnSync(command, args, { cwd: REPO_ROOT, stdio: "inherit", env: cleanEnv(extraEnv), shell: isWindows });
  if (r.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${r.status}).`);
}

async function portAnswers(port) {
  try {
    await fetch(`http://${HOST}:${port}/`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Starts the emulators; returns stop(). With importDir, from a seeded export
 * (a few seconds), so every rep starts from the same data. With reuse, a set
 * already answering on 8085 / 9099 is used and left running.
 */
async function startEmulators({ importDir = null, reuse = false } = {}) {
  if ((await portAnswers(FIRESTORE_PORT)) || (await portAnswers(AUTH_PORT))) {
    if (reuse && (await portAnswers(FIRESTORE_PORT)) && (await portAnswers(AUTH_PORT))) {
      console.log("Emulators already running on 8085 / 9099: using them, and leaving them running.");
      return async () => {};
    }
    throw new Error("Something already answers on 8085 or 9099. Stop it (an earlier lab run?) and try again.");
  }
  // The CLI refuses a rules file outside the config's folder: the repo's own rules, copied in.
  mkdirSync(join(LAB_DIR, ".work"), { recursive: true });
  copyFileSync(join(REPO_ROOT, "firestore.rules"), join(LAB_DIR, ".work", "firestore.rules"));
  const args = ["firebase", "emulators:start", "--only", "firestore,auth", "--project", PROJECT_ID, "--config", "harness/perf-lab/firebase.lab.json"];
  if (importDir) args.push("--import", importDir);
  const child = spawn("npx", args, { cwd: REPO_ROOT, env: cleanEnv(), shell: isWindows, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const t0 = Date.now();
  for (let i = 0; i < 240; i += 1) {
    await sleep(500);
    if (/All emulators ready/.test(log)) break;
    if (child.exitCode !== null) throw new Error(`The emulators stopped:
${log.slice(-2000)}`);
  }
  if (!/All emulators ready/.test(log)) throw new Error(`The emulators did not start:
${log.slice(-2000)}`);
  console.log(`  emulators ready${importDir ? " (from the seeded export)" : ""} in ${Math.round((Date.now() - t0) / 1000)} s`);
  return async () => {
    if (isWindows) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGINT");
    for (let i = 0; i < 40; i += 1) {
      await sleep(500);
      if (!(await portAnswers(FIRESTORE_PORT)) && !(await portAnswers(AUTH_PORT))) break;
    }
  };
}

/**
 * The running emulators' data, written to a folder emulators:start --import
 * reads. The CLI's export writes the Auth accounts but only Firestore's
 * (default) database, and the lab's is the named database perf-lab: so the
 * emulator's own export endpoint is asked for perf-lab, into the same folder
 * the metadata points at (an import restores it into perf-lab).
 */
async function exportSeed(outRoot) {
  const dir = join(outRoot, "seed-export");
  run("npx", ["firebase", "emulators:export", dir, "--force", "--project", PROJECT_ID, "--config", "harness/perf-lab/firebase.lab.json"]);
  const r = await fetch(`http://${HOST}:${FIRESTORE_PORT}/emulator/v1/projects/${PROJECT_ID}:export`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ database: `projects/${PROJECT_ID}/databases/${DATABASE_ID}`, export_directory: dir, export_name: "firestore_export" }),
  });
  if (!r.ok) throw new Error(`Could not export the ${DATABASE_ID} database: ${r.status} ${await r.text()}`);
  console.log(`Seeded data exported to ${dir}`);
  return dir;
}

/**
 * A freshly started emulator answers its first rules-checked reads and
 * writes seconds late (its rules engine and storage warm up), which no real
 * Firestore does: in the first fresh-per-rep run every profile, desktop
 * included, waited about 5 s between "auth ready" and "trainer ready" and
 * the Wrap-up's database answer never came inside 20 s. So before each rep,
 * as the lab user, the same kinds of reads the app opens with and two
 * writes the rules check in full; the writes are then removed with the
 * emulator's owner token (which skips the rules), so the data is unchanged.
 */
async function warmEmulators() {
  const t0 = Date.now();
  const { email, password } = labCredentials();
  const signIn = await fetch(`http://${HOST}:${AUTH_PORT}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const { idToken } = await signIn.json();
  const base = `http://${HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
  const as = (token) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  const day = new Date().toISOString().slice(0, 10);
  const query = (structuredQuery) => fetch(`${base}:runQuery`, { method: "POST", headers: as(idToken), body: JSON.stringify({ structuredQuery }) }).then((r) => r.text());
  const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } });
  for (let round = 0; round < 3; round += 1) {
    await Promise.all([
      fetch(`${base}/trainers/${LAB_UID}`, { headers: as(idToken) }).then((r) => r.text()),
      fetch(`${base}/studios/${STUDIO_ID}`, { headers: as(idToken) }).then((r) => r.text()),
      query({ from: [{ collectionId: "studios" }] }),
      query({ from: [{ collectionId: "trainers" }] }),
      query({ from: [{ collectionId: "clients" }], where: eq("homeStudioId", STUDIO_ID), limit: 50 }),
      query({ from: [{ collectionId: "schedules" }], where: eq("studioId", STUDIO_ID), limit: 50 }),
      query({ from: [{ collectionId: "sessions" }], where: eq("hostedAtStudioId", STUDIO_ID), limit: 50 }),
      query({ from: [{ collectionId: "journalEntries" }], where: eq("studioId", STUDIO_ID), limit: 50 }),
    ]);
  }
  const clientId = "100000001";
  const str = (v) => ({ stringValue: v });
  const writes = [
    {
      path: "journalEntries/lab-warmup",
      fields: { clientId: str(clientId), studioId: str(STUDIO_ID), kind: str("coaching"), body: str("warm-up"), importance: str("standard"), origin: str("manual"), authorId: str(LAB_UID), authorName: str("Lena Labrador"), authorInitials: str("LL"), isArchived: { booleanValue: false } },
    },
    {
      path: "sessions/lab-warmup",
      fields: { clientId: str(clientId), hostedAtStudioId: str(STUDIO_ID), homeStudioId: str(STUDIO_ID), clientHomeStudioId: str(STUDIO_ID), trainerId: str(LAB_UID), startedByTrainerId: str(LAB_UID), status: str("In-Progress"), date: str(day), sessionType: str("Standard") },
    },
  ];
  for (let round = 0; round < 2; round += 1) {
    for (const w of writes) {
      await fetch(`${base}:commit`, {
        method: "POST",
        headers: as(idToken),
        body: JSON.stringify({ writes: [{ update: { name: `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${w.path}`, fields: w.fields } }] }),
      }).then((r) => r.text());
      await fetch(`${base}/${w.path}`, { method: "DELETE", headers: as("owner") }).then((r) => r.text());
    }
  }
  console.log(`  emulators warmed in ${Math.round((Date.now() - t0) / 100) / 10} s`);
}

/** Per-rep restarts from the export: every rep starts from the same studio. */
function freshEachRep(importDir) {
  let stop = null;
  return {
    beforeRep: async () => {
      stop = await startEmulators({ importDir });
      await warmEmulators();
    },
    afterRep: async () => {
      if (stop) await stop();
      stop = null;
    },
  };
}

function seed(outRoot, clients) {
  mkdirSync(outRoot, { recursive: true });
  const summary = join(outRoot, "seed-summary.json");
  run("npx", ["tsx", "harness/perf-lab/seed.ts"], {
    ...emulatorEnv(),
    PERF_LAB_SEED_SUMMARY: summary,
    ...(clients ? { PERF_LAB_CLIENTS: String(clients) } : {}),
  });
  return summary;
}

function build(outRoot) {
  const dir = join(outRoot, "lab-build");
  console.log(`Building the lab app into ${dir} ...`);
  // NODE_ENV=production on purpose: a shell with NODE_ENV=test or development
  // makes vite build React's development runtime (jsxDEV), which is several
  // times slower and nothing like what the iPads run.
  run("npx", ["vite", "build", "--outDir", dir, "--emptyOutDir", "--sourcemap"], {
    NODE_ENV: "production",
    VITE_PERF_LAB: "1",
    VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
    VITE_FIREBASE_FIRESTORE_DATABASE_ID: DATABASE_ID,
  });
  return dir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "all";
  const outRoot = args.out || OUT_DIR;
  const exportDir = join(outRoot, "seed-export");
  const summaryFile = join(outRoot, "seed-summary.json");
  if (command === "emulators") {
    const stop = await startEmulators({ importDir: existsSync(exportDir) && !args.empty ? exportDir : null });
    console.log("Emulators on 127.0.0.1:8085 (Firestore) and :9099 (Auth). Ctrl+C to stop.");
    process.on("SIGINT", async () => {
      await stop();
      process.exit(0);
    });
    await new Promise(() => {});
  }
  if (command === "seed") {
    // Seeds the emulators already running, and exports what it laid down.
    seed(outRoot, args.clients);
    await exportSeed(outRoot);
    return;
  }
  if (command === "build") return void build(outRoot);
  if (command === "run") {
    if (!existsSync(exportDir)) throw new Error(`No seeded export at ${exportDir}: run lab.mjs all, or lab.mjs emulators + lab.mjs seed.`);
    await runLab({ ...args, build: join(outRoot, "lab-build"), out: outRoot, seedSummary: existsSync(summaryFile) ? summaryFile : undefined, ...freshEachRep(exportDir) });
    return;
  }
  if (command !== "all") throw new Error(`Unknown command ${command}.`);
  const started = Date.now();
  const dir = args["skip-build"] && existsSync(join(outRoot, "lab-build", "index.html")) ? join(outRoot, "lab-build") : build(outRoot);
  console.log("Seeding the studio...");
  const stop = await startEmulators();
  try {
    seed(outRoot, args.clients);
    await exportSeed(outRoot);
  } finally {
    await stop();
  }
  await runLab({ ...args, build: dir, out: outRoot, seedSummary: summaryFile, ...freshEachRep(exportDir) });
  console.log(`Done in ${Math.round((Date.now() - started) / 60000)} min.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
