/**
 * Generates firebase-applet-config.json, which src/firebase.ts imports.
 *
 * Runs as `prebuild`. The file is gitignored, so on Render (and any fresh
 * checkout) it does not exist and gets built from environment variables.
 *
 * It used to bail out the moment the file existed:
 *
 *     if (fs.existsSync(configPath)) { ...skip...; process.exit(0); }
 *
 * which meant a local copy generated once was never refreshed again. Rotating
 * a Firebase value in .env changed nothing, and the app silently kept talking
 * to whichever project the stale file named — including a different Firestore
 * database. It now regenerates whenever the resolved config actually differs,
 * and says which keys moved.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const configPath = path.join(ROOT, 'firebase-applet-config.json');
const firebaseJsonPath = path.join(ROOT, 'firebase.json');

// Load .env when it's there. dotenv does NOT override variables already set,
// so a real environment (Render, CI) always wins over a local file.
// Optional on purpose: `npm ci --omit=dev` may prune it, and a missing dev
// dependency must never fail the build.
try {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
} catch {
  /* .env support unavailable — environment variables only. */
}

const SECRET_KEYS = new Set(['apiKey', 'appId', 'messagingSenderId']);

/** Resolve the config from the environment. Returns null when none is set. */
function configFromEnv() {
  if (process.env.VITE_FIREBASE_CONFIG) {
    try {
      const parsed = JSON.parse(process.env.VITE_FIREBASE_CONFIG);
      console.log('Firebase config: parsed from VITE_FIREBASE_CONFIG.');
      return parsed;
    } catch (err) {
      console.error('Failed to parse VITE_FIREBASE_CONFIG JSON:', err.message);
      return null;
    }
  }

  if (process.env.VITE_FIREBASE_API_KEY) {
    console.log('Firebase config: built from individual VITE_FIREBASE_* variables.');
    return {
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      appId: process.env.VITE_FIREBASE_APP_ID,
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
      firestoreDatabaseId: process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
    };
  }

  return null;
}

const DUMMY = {
  projectId: 'dummy-project',
  appId: '1:1234:web:1234',
  apiKey: 'dummy-api-key',
  authDomain: 'dummy.firebaseapp.com',
  firestoreDatabaseId: 'dummy-db',
  storageBucket: 'dummy.appspot.com',
  messagingSenderId: '1234',
  measurementId: 'G-DUMMY',
};

function readExisting() {
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.warn('Existing firebase-applet-config.json is unreadable, regenerating:', err.message);
    return null;
  }
}

/** Key names whose values differ. Never returns the values — apiKey is secret. */
function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((k) => (before || {})[k] !== (after || {})[k]);
}

function write(config, reason) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`Wrote firebase-applet-config.json (${reason}).`);
  } catch (err) {
    console.error('Error writing firebase-applet-config.json:', err.message);
    process.exit(1);
  }
}

/**
 * The trap this exists to catch: firebase.json says which database `firebase
 * deploy` targets, and the client config says which one the app connects to.
 * When they disagree, rules and indexes land on a database nothing reads, and
 * nothing anywhere reports an error.
 */
function checkDatabaseTarget(config) {
  if (!fs.existsSync(firebaseJsonPath)) return;
  let declared;
  try {
    const fb = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
    const entry = Array.isArray(fb.firestore) ? fb.firestore[0] : fb.firestore;
    declared = entry && entry.database;
  } catch {
    return;
  }
  if (!declared) return;

  const clientDb = config.firestoreDatabaseId || '(default)';
  if (declared !== clientDb) {
    console.warn(
      '\nWARNING: Firestore database mismatch.\n' +
        `  firebase.json deploys rules/indexes to : ${declared}\n` +
        `  the app connects to                    : ${clientDb}\n` +
        '  Rules deployed now would land on a database the app never reads.\n',
    );
  }
}

const existing = readExisting();
const fromEnv = configFromEnv();

if (!fromEnv) {
  if (existing) {
    // No environment to work from — keep what's there rather than clobbering a
    // working config with placeholders.
    console.log('No Firebase environment variables found; keeping the existing config.');
    checkDatabaseTarget(existing);
    process.exit(0);
  }
  console.warn('WARNING: No Firebase configuration found. Writing a dummy config so the build can proceed.');
  write(DUMMY, 'no environment, no existing file');
  process.exit(0);
}

if (!fromEnv.projectId) {
  console.warn('WARNING: VITE_FIREBASE_PROJECT_ID is not set; the generated config has no projectId.');
}
if (!fromEnv.firestoreDatabaseId) {
  console.warn(
    'WARNING: VITE_FIREBASE_FIRESTORE_DATABASE_ID is not set. The app will fall back to the "(default)" database.',
  );
}

if (!existing) {
  write(fromEnv, 'no existing file');
  checkDatabaseTarget(fromEnv);
  process.exit(0);
}

const changed = changedKeys(existing, fromEnv);

if (changed.length === 0) {
  console.log('firebase-applet-config.json already matches the environment. Nothing to do.');
  checkDatabaseTarget(existing);
  process.exit(0);
}

const shown = changed.map((k) =>
  SECRET_KEYS.has(k) ? `${k} (changed)` : `${k}: ${existing[k]} -> ${fromEnv[k]}`,
);
console.log('Environment differs from firebase-applet-config.json:');
for (const line of shown) console.log(`  ${line}`);

write(fromEnv, 'environment changed');
checkDatabaseTarget(fromEnv);
