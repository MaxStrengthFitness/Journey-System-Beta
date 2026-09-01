import { RoutinePreset } from "../types";

/**
 * Built-in routine templates available at every studio location.
 * These ship with the app (no Firestore doc, no rules to touch) — ask
 * Claude to add another one here whenever a new company-wide standard
 * program is agreed on. Machine IDs must match the anatomy map / seeded
 * `machines` collection doc IDs (see data/machine-anatomy-map.ts).
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
