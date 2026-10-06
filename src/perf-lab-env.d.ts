/*
 * The build-time flags the app reads through import.meta.env (Vite replaces
 * them at build time). Only the performance lab's: see src/perf-lab-hook.ts.
 */
interface ImportMetaEnv {
  readonly VITE_PERF_LAB?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_FIRESTORE_DATABASE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
