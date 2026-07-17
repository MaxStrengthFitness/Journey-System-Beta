import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Silence Firestore internal warnings and idle stream disconnections
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

// Enable offline persistence with multi-tab support (modern SDK equivalent of enabling IndexedDB persistence)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
}, firebaseConfig.firestoreDatabaseId);

import { getFunctions } from 'firebase/functions';
export const functions = getFunctions(app, 'us-central1');

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup };
