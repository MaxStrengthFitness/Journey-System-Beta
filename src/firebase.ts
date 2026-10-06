import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  inMemoryPersistence,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
} from 'firebase/auth';
// The SDK's own instance cache, so the sign-in screen can warm the SAME popup
// helper signInWithPopup will use. Exported by the installed SDK for its
// compat layer; src/lib/auth-boot.test.ts fails loudly if an upgrade drops it.
import { _getInstance } from '@firebase/auth/internal';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { setIdTokenSource } from './lib/authed-fetch';
import { deviceStorage, rememberSignedInHere, wasSignedInHere } from './lib/auth-boot';

import { labFirebaseConfig, startPerfLab } from './perf-lab-hook';

// Silence Firestore internal warnings and idle stream disconnections
setLogLevel('silent');

/*
 * THE PERFORMANCE LAB (harness/perf-lab, Oct 6 2026). A build made with
 * VITE_PERF_LAB=1 talks to the local Firebase emulators under a demo-*
 * project and nothing else; every other build is unchanged, and the lab's
 * code is dropped from it at build time (the condition is the literal flag,
 * which Vite replaces, so the minifier removes the branch and the import).
 * src/perf-lab-hook.test.ts holds this.
 */
const app = initializeApp(import.meta.env.VITE_PERF_LAB === "1" ? labFirebaseConfig() : firebaseConfig);

// Offline persistence, single-tab.
//
// This was persistentMultipleTabManager(). When the primary lease moved between
// tabs, the SDK's own synchronizeViewAndComputeSnapshot threw
// "Cannot read properties of undefined (reading 'query')", which permanently
// corrupts Firestore's internal state: every call afterwards throws
// "INTERNAL ASSERTION FAILED (ID: b815)" and the app locks up. client-errors.log
// recorded 3,664 of those from a single session.
//
// The single-tab manager performs no cross-tab synchronization, so that lease
// machinery never runs. Offline caching still works in the active tab; a second
// tab simply falls back to an in-memory cache. Do not switch this back to
// multi-tab without confirming the upstream SDK bug is fixed.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager(undefined),
  }),
}, import.meta.env.VITE_PERF_LAB === "1" ? labFirebaseConfig().firestoreDatabaseId : firebaseConfig.firestoreDatabaseId);

import { getFunctions } from 'firebase/functions';
export const functions = getFunctions(app, 'us-central1');

/*
 * AUTH WITHOUT THE POPUP HELPER ON A SIGNED-IN OPEN (the speed round, Oct 5
 * 2026, R14). This was getAuth(app), which is initializeAuth with the same
 * three persistences plus browserPopupRedirectResolver; on Safari, iOS and
 * mobile browsers the SDK then loads the helper's hidden iframe and waits for
 * it BEFORE it reports who is signed in, on every cold open. Now the helper
 * is installed at start only where the sign-in screen is likely next (nobody
 * was signed in here last time), so that screen appears with the popup ready
 * as before; a device that was signed in starts without it and never loads
 * the iframe. Sign-in passes the helper itself (AppContent's handleLogin),
 * and a signed-in device that reaches the sign-in screen warms it there
 * (prepareSignIn, features/front-door/sign-in-ready.ts). lib/auth-boot.ts.
 */
const signedInHereLastTime = wasSignedInHere(deviceStorage());
// The browser build has all three persistences and the helper (a class). The
// Node build the test runner loads has a placeholder object for the helper
// (getAuth there never installed one), and handing initializeAuth anything
// but a class fails an assertion, so it is left out rather than passed.
const helperAvailable = typeof browserPopupRedirectResolver === "function";
const browserPersistence = [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence].filter(Boolean);
export const auth = initializeAuth(app, {
  persistence: browserPersistence.length > 0 ? browserPersistence : inMemoryPersistence,
  ...(signedInHereLastTime || !helperAvailable ? {} : { popupRedirectResolver: browserPopupRedirectResolver }),
});
// The lab only (see above): the emulators, before anything reads or signs in.
if (import.meta.env.VITE_PERF_LAB === "1") startPerfLab(db, auth);
onAuthStateChanged(auth, (user) => rememberSignedInHere(deviceStorage(), Boolean(user)));

/** The popup helper signInWithPopup must be handed (Auth starts without one on a signed-in open). */
export { browserPopupRedirectResolver };

/**
 * Get the popup sign-in ready before anyone taps (Safari only opens a popup
 * straight from the tap). Loads the helper's iframe once; a second call is
 * the same promise. Resolves when it is ready, rejects if it can't load (the
 * popup then tries again itself).
 */
export function prepareSignIn(): Promise<void> {
  if (!helperAvailable) return Promise.resolve();
  const resolver = _getInstance<{ _initialize(a: typeof auth): Promise<unknown> }>(browserPopupRedirectResolver);
  return resolver._initialize(auth).then(() => undefined);
}

export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup };

// The server's Mindbody routes check who is calling (server/auth.ts, Sep 2026).
// authedFetch() asks here for the signed-in user's token.
setIdTokenSource(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null));

/**
 * Whether this browser opens a popup only straight from a tap (Safari, iOS,
 * mobile): the SDK's own test for loading the helper early. There the
 * sign-in buttons wait for prepareSignIn; elsewhere the popup may wait for
 * the helper after the tap, as it always has.
 */
export function signInNeedsHelperFirst(): boolean {
  if (!helperAvailable) return false;
  try {
    return Boolean(_getInstance<{ _shouldInitProactively?: boolean }>(browserPopupRedirectResolver)._shouldInitProactively);
  } catch {
    return true;
  }
}
