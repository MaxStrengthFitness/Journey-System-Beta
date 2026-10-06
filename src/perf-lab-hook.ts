/**
 * THE PERFORMANCE LAB'S HOOK INTO THE APP (harness/perf-lab, Oct 6 2026).
 *
 * Used ONLY by a build made with VITE_PERF_LAB=1 (src/firebase.ts calls it
 * behind that literal flag, so every other build drops this file and its
 * imports at build time; src/perf-lab-hook.test.ts holds that). In a lab
 * build the app talks to the local Firebase emulators under a demo-* project,
 * which Firebase treats as emulator-only, and nothing else.
 *
 * The lab's driver signs in through window.__perfLab.signIn (email and
 * password against the Auth emulator), because the real sign-in is a Google
 * or Microsoft popup a headless browser can't complete. Everything after the
 * sign-in is the app's own path.
 *
 * Nothing here runs at import: the module only declares functions.
 */
import { connectAuthEmulator, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

/** Where the lab's emulators listen (harness/perf-lab/firebase.lab.json). */
export const LAB_HOST = '127.0.0.1';
export const LAB_FIRESTORE_PORT = 8085;
export const LAB_AUTH_PORT = 9099;

/** The lab's Firebase config: a demo-* project and a named database, never a real one. */
export function labFirebaseConfig() {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-perf-lab';
  if (!projectId.startsWith('demo-')) {
    // A lab build pointed at a real project is refused outright.
    throw new Error('The performance lab only runs against a demo-* project.');
  }
  return {
    projectId,
    apiKey: 'demo-perf-lab-key',
    appId: '1:000000000000:web:perflab',
    authDomain: `${projectId}.firebaseapp.com`,
    firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'perf-lab',
    storageBucket: `${projectId}.appspot.com`,
    messagingSenderId: '000000000000',
  };
}

/** Points Firestore and Auth at the emulators and gives the driver its sign-in. */
export function startPerfLab(db: Firestore, auth: Auth): void {
  connectFirestoreEmulator(db, LAB_HOST, LAB_FIRESTORE_PORT);
  connectAuthEmulator(auth, `http://${LAB_HOST}:${LAB_AUTH_PORT}`, { disableWarnings: true });
  (window as unknown as { __perfLab: unknown }).__perfLab = {
    signIn: (email: string, password: string) =>
      signInWithEmailAndPassword(auth, email, password).then((cred) => cred.user.uid),
  };
}
