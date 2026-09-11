/**
 * Shared connection for the Renewals-round scripts (Sep 2026).
 *
 * Same auth model as scripts/backfill-client-since.ts — read its header for
 * why: the Firestore data API rejects Firebase CLI user tokens, so data
 * scripts use a service-account key (`service-account.json` in the project
 * root, gitignored) through the Admin SDK. Mindbody credentials come from the
 * same `.env` the local server uses.
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

export const argv = process.argv.slice(2);
export const hasFlag = (name: string) => argv.includes(`--${name}`);
export const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

function buildCredential() {
  const candidates = [
    flag("key"),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), "service-account.json"),
    path.resolve(process.cwd(), "serviceAccountKey.json"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const key = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (!key.private_key || !key.client_email) {
      console.error(
        `${p} is JSON but not a service-account key (no private_key / client_email). ` +
          "That is probably the WEB config — you need the one from Project settings -> Service accounts.",
      );
      process.exit(1);
    }
    console.log(`Auth: service account ${key.client_email}`);
    return cert(key);
  }

  if (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT) {
    console.log("Auth: application default credentials");
    return applicationDefault();
  }

  console.error(
    "No service-account key found. Looked for --key <path>, GOOGLE_APPLICATION_CREDENTIALS,\n" +
      "./service-account.json and ./serviceAccountKey.json. See the header of\n" +
      "scripts/backfill-client-since.ts for the two-minute setup.",
  );
  process.exit(1);
}

export function connectFirestore() {
  const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  const config = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : {};
  const projectId =
    flag("project") || process.env.VITE_FIREBASE_PROJECT_ID || config.projectId;
  const databaseId =
    flag("database") ||
    process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
    config.firestoreDatabaseId ||
    "(default)";
  if (!projectId) {
    console.error("No project id. Pass --project gen-lang-client-0731527386");
    process.exit(1);
  }
  console.log(`Firestore: project ${projectId}, database ${databaseId}`);
  const app = initializeApp({ credential: buildCredential(), projectId });
  return databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId);
}

/** Writes a JSON report into backups/ (gitignored: reports carry client names). */
export function writeReport(name: string, data: unknown): string {
  const dir = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${name}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
