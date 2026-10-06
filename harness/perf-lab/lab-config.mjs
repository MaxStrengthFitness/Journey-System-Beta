/**
 * The lab's fixed values: where the emulators listen, the demo project, the
 * named database, the studio, and where a run writes. One place, read by
 * seed.ts, run.mjs and lab.mjs.
 *
 * The sign-in for the lab's user lives in lab.config.example.json beside this
 * file (generated for the lab; it opens nothing but the local Auth emulator).
 * A lab.config.json beside it, if present, wins (git-ignored).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

export const LAB_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(LAB_DIR, "..", "..");

export const PROJECT_ID = "demo-perf-lab";
export const DATABASE_ID = "perf-lab";
export const HOST = "127.0.0.1";
export const FIRESTORE_PORT = 8085;
export const AUTH_PORT = 9099;
export const STUDIO_ID = "lab-studio-lakeside";
export const LAB_UID = "lab-leader-uid";

/** Where builds, Chrome profiles and runs go: PERF_LAB_OUT, else a folder under the system temp. */
export const OUT_DIR = process.env.PERF_LAB_OUT
  ? resolve(process.env.PERF_LAB_OUT)
  : join(tmpdir(), "journey-perf-lab");

export function labCredentials() {
  const own = join(LAB_DIR, "lab.config.json");
  const example = join(LAB_DIR, "lab.config.example.json");
  const file = existsSync(own) ? own : example;
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (!parsed.email || !parsed.password) throw new Error(`${file} needs email and password.`);
  return { email: String(parsed.email), password: String(parsed.password) };
}

/** Refuses anything but the local emulators under a demo-* project. */
export function assertEmulatorsOnly() {
  const fs = process.env.FIRESTORE_EMULATOR_HOST || "";
  const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST || "";
  const project = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "";
  const local = (h) => /^(127\.0\.0\.1|localhost):\d+$/.test(h);
  if (!local(fs) || !local(auth)) {
    throw new Error("Refusing to run: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must point at 127.0.0.1.");
  }
  if (!project.startsWith("demo-")) {
    throw new Error("Refusing to run: the project (GCLOUD_PROJECT) must be a demo-* project.");
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("Refusing to run: GOOGLE_APPLICATION_CREDENTIALS is set; the lab never uses a real credential.");
  }
}

/** The environment the seeder and the emulators run with. */
export function emulatorEnv() {
  return {
    FIRESTORE_EMULATOR_HOST: `${HOST}:${FIRESTORE_PORT}`,
    FIREBASE_AUTH_EMULATOR_HOST: `${HOST}:${AUTH_PORT}`,
    GCLOUD_PROJECT: PROJECT_ID,
  };
}
