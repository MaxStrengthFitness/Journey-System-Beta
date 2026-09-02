import { RoutinePreset } from "../types";

/**
 * FALLBACK ONLY as of Sep 2026 (round: Routine Template Builder).
 *
 * Company-wide templates now live in the `routinePresets` collection at
 * tier "company", authored by admins in the Routine Templates tab of the
 * admin hub. Do NOT add new standards here -- add them in the app, where
 * they take effect without a deploy.
 *
 * This array is what EditRoutineDrawer falls back to when the collection
 * holds no company template, so a fresh or empty database degrades to the
 * old behavior instead of showing an empty menu. scripts/seed-routine-
 * templates.ts migrated these three into Firestore.
 *
 * Machine IDs must match the anatomy map / seeded `machines` collection
 * doc IDs (see data/machine-anatomy-map.ts).
 */
export const GLOBAL_ROUTINE_PRESETS: RoutinePreset[] = [
  {
    id: "global-full-body-foundations",
    name: "Full Body Foundations",
    description:
      "One push, one pull, one leg, one core movement — a balanced starting template.",
    scope: "global",
    machineIds: ["m-chest-press", "m-compound-row", "m-leg-press", "m-abs"],
  },
  {
    id: "global-upper-push-pull",
    name: "Upper Body Push/Pull",
    description:
      "Balanced horizontal + vertical push/pull for the whole upper body.",
    scope: "global",
    machineIds: [
      "m-chest-press",
      "m-compound-row",
      "m-overhead-press",
      "m-pulldown",
      "m-lateral-raise",
      "m-tricep-ext",
      "m-bicep",
    ],
  },
  {
    id: "global-lower-body-strength",
    name: "Lower Body Strength",
    description:
      "Quad-dominant and posterior-chain machines for a complete lower-body day.",
    scope: "global",
    machineIds: ["m-leg-press", "m-hip-abd", "m-hip-add", "m-leg-curl", "m-lumbar"],
  },
];
