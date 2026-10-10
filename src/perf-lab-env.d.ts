/*
 * The build-time flags the app reads through import.meta.env (Vite replaces
 * them at build time). The performance lab's (see src/perf-lab-hook.ts), and
 * Vite's own DEV: true under `npm run dev` and in vitest, false in every
 * built bundle (features/environment-mark, Oct 10 2026).
 */
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_PERF_LAB?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_FIRESTORE_DATABASE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
