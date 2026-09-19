/**
 * The 20 standard MSF machines, as the app knows them before Firestore answers.
 *
 * useMachines merges this list with the `machines` collection BY ID, and
 * Operations -> System Tools -> "Restore standard machines" writes it back to
 * Firestore. It lived inside AppContent.tsx (264 lines of data in the middle
 * of the app shell) until the beta-prep trim, Sep 17 2026.
 *
 * A TRAP WORTH KNOWING: every `name` here is UPPERCASE ("LEG PRESS"), while
 * the starting-weight table in lib/consultation-utils.ts is keyed in Title
 * Case ("Leg Press") and looked up exactly. So the tracker's first-time
 * starting-weight seed, which passes `machine.name`, has never matched a
 * default machine and has never suggested a weight. Left as found - turning
 * it on is a product decision (see docs/rounds/2026-09-17-beta-prep-trim.md).
 */
import type { Machine } from "../types";

export const DEFAULT_MACHINES: Machine[] = [
  {
    id: "m-neck",
    anatomicalRegion: "Neck",
    name: "CX (4 WAY NECK)",
    targetMuscles: "Cervical Paraspinals, Suboccipitals",
    kinematicClassification: "Simple / Rotary",
    order: 1,
    settingOptions: ["Gap", "Back Pad", "Seat"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: true,
  },
  {
    id: "m-overhead-press",
    anatomicalRegion: "Shoulder",
    name: "OVERHEAD PRESS",
    targetMuscles: "Anterior/Medial Deltoids, Triceps",
    kinematicClassification: "Compound Push",
    order: 2,
    settingOptions: ["Gap", "Seat"],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
  },
  {
    id: "m-lateral-raise",
    anatomicalRegion: "Shoulder",
    name: "LATERAL RAISE",
    targetMuscles: "Medial Deltoids",
    kinematicClassification: "Simple Push",
    order: 3,
    settingOptions: ["Gap", "Seat", "Handles"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
  },
  {
    id: "m-pulldown",
    anatomicalRegion: "Back",
    name: "PULLDOWN",
    targetMuscles: "Latissimus Dorsi, Trapezius, Biceps",
    kinematicClassification: "Compound Pull",
    order: 4,
    settingOptions: ["Gap", "Back Pad", "Seat", "Handles"],
    setupGap: "Gap 2",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: true,
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-pullover",
    anatomicalRegion: "Back",
    name: "SEATED PULLOVER",
    targetMuscles: "Latissimus Dorsi",
    kinematicClassification: "Simple Pull",
    order: 5,
    settingOptions: ["Gap", "Seat", "Handles"],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
    requiresHandoff: true,
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-compound-row",
    anatomicalRegion: "Back",
    name: "COMPOUND ROW",
    targetMuscles: "Latissimus Dorsi, Rhomboids, Trapezius",
    kinematicClassification: "Compound Pull",
    order: 6,
    settingOptions: ["Gap", "Chest Pad", "Handles"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: true,
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-simple-row",
    anatomicalRegion: "Back",
    name: "SIMPLE ROW",
    targetMuscles: "Posterior Deltoids, Rhomboids",
    kinematicClassification: "Simple Pull",
    order: 7,
    settingOptions: ["Gap", "Chest Pad", "Seat Pad"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-chest-press",
    anatomicalRegion: "Chest",
    name: "CHEST PRESS",
    targetMuscles: "Pectoralis Major, Anterior Deltoids",
    kinematicClassification: "Compound Push",
    order: 8,
    settingOptions: ["Gap", "Back Pad", "Seat"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
  },
  {
    id: "m-chest-fly",
    anatomicalRegion: "Chest",
    name: "CHEST/PEC FLY",
    targetMuscles: "Pectoralis Major",
    kinematicClassification: "Simple Push",
    order: 9,
    settingOptions: ["Gap", "Back Pad", "Seat"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
  },
  {
    id: "m-bicep",
    anatomicalRegion: "Arm / Upper Extremity",
    name: "BICEP",
    targetMuscles: "Biceps Brachii, Brachioradialis",
    kinematicClassification: "Simple Pull",
    order: 10,
    settingOptions: ["Gap", "Seat"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-tricep-ext",
    anatomicalRegion: "Arm / Upper Extremity",
    name: "TRICEP EXTENSION",
    targetMuscles: "Triceps Brachii",
    kinematicClassification: "Simple Push",
    order: 11,
    settingOptions: ["Gap", "Seat"],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
  },
  {
    id: "m-dip",
    anatomicalRegion: "Arm / Upper Extremity",
    name: "SEATED DIP",
    targetMuscles: "Triceps Brachii, Lower Pectoralis",
    kinematicClassification: "Compound Push",
    order: 12,
    settingOptions: [
      "Gap",
      "Back Pad Height",
      "Back Pad Angle",
      "Seat",
      "Handles",
    ],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
  },
  {
    id: "m-abs",
    anatomicalRegion: "Core",
    name: "SEATED ABDOMINALS",
    targetMuscles: "Rectus Abdominis",
    kinematicClassification: "Simple Push",
    order: 13,
    settingOptions: ["Gap", "Seat"],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
    requiresHandoff: true,
  },
  {
    id: "m-lumbar",
    anatomicalRegion: "Core",
    name: "LUMBAR",
    targetMuscles: "Lumbar Paraspinals",
    kinematicClassification: "Simple Pull",
    order: 14,
    settingOptions: ["Gap", "Seat"],
    setupGap: "Gap 4-6",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    sequencingContraindications: [
      "Do not pair immediately before Leg Press or Leg Curl (lumbar pump exacerbation).",
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
    primaryMuscles: ["Erector Spinae"],
    biomechanicalNotes:
      "Ensure rotation point aligns perfectly with the iliac crest. Focuses intensely on spinal extension.",
    contraindicatedFor: [
      "Spinal Stenosis",
      "Herniated Disc (Acute)",
      "Spondylolisthesis",
    ],
    modifications:
      "Limit strictly to pain-free ROM. Decrease weight if form breaks or anterior pelvic tilt is lost.",
  },
  {
    id: "m-torso-rotation",
    anatomicalRegion: "Core",
    name: "TORSO ROTATION",
    targetMuscles: "Internal and External Obliques",
    kinematicClassification: "Simple Rotary",
    order: 15,
    settingOptions: ["Gap", "Arms", "Seat"],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
  },
  {
    id: "m-hip-abd",
    anatomicalRegion: "Hip",
    name: "HIP ABDUCTION",
    targetMuscles: "Gluteus Medius, Gluteus Minimus",
    kinematicClassification: "Simple Push",
    order: 16,
    settingOptions: ["Gap", "Back Pad", "Thigh Pads"],
    setupGap: "Custom Gap",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
  },
  {
    id: "m-hip-add",
    anatomicalRegion: "Hip",
    name: "HIP ADDUCTION",
    targetMuscles: "Adductor Longus, Brevis, Magnus",
    kinematicClassification: "Simple Pull",
    order: 17,
    settingOptions: ["Gap", "Back Pad"],
    setupGap: "Custom Gap",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-leg-press",
    anatomicalRegion: "Thigh / Quad",
    name: "LEG PRESS",
    targetMuscles: "Quadriceps, Gluteus Maximus, Hamstrings",
    kinematicClassification: "Compound Push",
    order: 18,
    settingOptions: ["Gap", "Seat Angle", "Shoulder Pads", "Seat Distance"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    primaryMuscles: ["Quadriceps", "Gluteus Maximus"],
    biomechanicalNotes:
      "Knee angle should not exceed 90 degrees at bottom turnaround to protect patellar tendon. High shear force potential on L4/L5 if posterior pelvic tilt occurs.",
    contraindicatedFor: [
      "Lumbar Issues",
      "Knee Replacement",
      "Severe Patellar Tendonitis",
    ],
    modifications:
      "For Lumbar issues: Lock seat angle to P2 or P1, limit ROM to prevent pelvic tuck. For Knee issues: Reduce gap, set end-stop earlier to prevent deep flexion.",
  },
  {
    id: "m-ext",
    anatomicalRegion: "Thigh / Quad",
    name: "LEG EXTENSION",
    targetMuscles: "Quadriceps Femoris",
    kinematicClassification: "Simple Push",
    order: 19,
    settingOptions: ["Gap", "Back Pad"],
    setupGap: "Gap 2",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
  },
  {
    id: "m-leg-curl",
    anatomicalRegion: "Hamstring / Glute",
    name: "LEG CURL",
    targetMuscles: "Hamstrings, Gastrocnemius",
    kinematicClassification: "Simple Pull",
    order: 20,
    settingOptions: ["Gap", "Back Pad", "Ankle Pad"],
    setupGap: "Gap 2",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
];

/**
 * A stock photo per standard machine, for the machine info dialog. Moved here
 * from AppContent.tsx with the list above (beta-prep trim, Sep 17 2026).
 */
export const getMachineImageUrl = (machineId?: string): string => {
  const map: Record<string, string> = {
    "m-neck": "1534438327276-14e5300c3a48", // Using back/shoulder for neck
    "m-overhead-press": "1581009146145-b5ef050c2e1e", // pressing
    "m-lateral-raise": "1581009146145-b5ef050c2e1e", // shoulders
    "m-pulldown": "1526506114805-4f329971bc30", // back/pull-up
    "m-pullover": "1526506114805-4f329971bc30", // back
    "m-compound-row": "1534438327276-14e5300c3a48", // rowing
    "m-simple-row": "1534438327276-14e5300c3a48", // rowing
    "m-chest-press": "1574680096145-d05b474e2155", // chest press
    "m-chest-fly": "1574680096145-d05b474e2155", // chest
    "m-bicep": "1581009137042-c56a8411b229", // biceps
    "m-tricep-ext": "1581009137042-c56a8411b229", // arms
    "m-dip": "1574680096145-d05b474e2155", // chest/arms
    "m-abs": "1517836357463-d25dfeac3438", // abs
    "m-lumbar": "1584466977773-e35492d52dc7", // core/stretch
    "m-torso-rotation": "1517836357463-d25dfeac3438", // abs
    "m-hip-abd": "1599058917212-d750089bc07e", // lower body
    "m-hip-add": "1599058917212-d750089bc07e", // lower body
    "m-leg-press": "1540497077202-7c8a3999166f", // leg press
    "m-ext": "1540497077202-7c8a3999166f", // legs
    "m-leg-curl": "1599058917212-d750089bc07e", // hamstrings
  };
  const unsplashId =
    machineId && map[machineId] ? map[machineId] : "1518611012118-696072aa579a";
  return `https://images.unsplash.com/photo-${unsplashId}?auto=format&fit=crop&w=800&h=450&q=80`;
};
