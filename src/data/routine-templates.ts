import { Machine } from '../types';
import { MACHINE_LIST } from './machine-database';

export interface RoutineTemplate {
  id: string;
  name: string;
  targetDemographic: string;
  objective: string;
  sequence: {
    machineId: string;
    setupOverrides: string;
    executionOverrides: string;
  }[];
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: "routine-1-big-5-executive",
    name: "Routine 1: The Foundational \"Big 5\" + Executive Core",
    targetDemographic: "New clients, busy executives, general fitness.",
    objective: "Target maximum muscle mass using foundational compounds, supplemented by core/cervical work for desk-bound posture.",
    sequence: [
      { machineId: "leg_press", setupOverrides: "Pad position 2 for most. Feet hip-width apart near the bottom of the plate.", executionOverrides: "Continuous movement; seamless turnaround at the upper and lower limits." },
      { machineId: "compound_row", setupOverrides: "Gap 2. Chest pad height adjusted to client comfort.", executionOverrides: "Intrapersonal load transfer (handoff). Pause in the fully contracted position." },
      { machineId: "chest_press", setupOverrides: "Custom gap (starts at lower turn). Semi-pronated grip.", executionOverrides: "Continuous movement with no pause or squeeze at full extension." },
      { machineId: "pulldown", setupOverrides: "Gap 2. Avoid seats 1-4 for average users. Use a neutral grip (Torso Arm variation).", executionOverrides: "Handoff at eye level. Pull terminates just below the chin." },
      { machineId: "overhead_press", setupOverrides: "Gap 2. Requires a strict posterior pelvic tilt (contracted abdomen).", executionOverrides: "Continuous movement." },
      { machineId: "abdominals", setupOverrides: "Gap 5 to 7. Client uses a \"prayer\" hand position.", executionOverrides: "Handoff into the fully \"crunched\" position. Focus on spinal flexion, not leaning from the hips." },
      { machineId: "cervical_extension", setupOverrides: "No gap. Elbows tucked in tightly.", executionOverrides: "Handoff in the neutral position. Top of the head traces a \"rainbow\" arch." } // Note: original says Cervical Extension, mapping to 4way neck
    ]
  },
  {
    id: "routine-2-postural-a",
    name: "Routine 2: Postural Correction & Spinal Health (A-Rotation)",
    targetDemographic: "Lower back issues, poor posture, older adults needing core stability.",
    objective: "Safely isolate paraspinals using non-competing upper body isolation movements.",
    sequence: [
      { machineId: "abdominals", setupOverrides: "Gap 5 to 7. Placed first to pre-exhaust the anterior core without compromising the posterior chain later.", executionOverrides: "Handoff" },
      { machineId: "leg_extension", setupOverrides: "Gap 2 or 3. Client must actively pull *upward* on the handles to lock the pelvis down.", executionOverrides: "Slight speed increase during the concentric phase; continuous movement at the bottom." },
      { machineId: "lumbar_extension", setupOverrides: "Gap 4 to 6. Femurs slope slightly downward to the hip. This is safely paired near the Leg Extension, completely avoiding the Leg Press.", executionOverrides: "2 to 3-second countdown hold at the contracted position rather than absolute failure." },
      { machineId: "simple_row", setupOverrides: "No gap (starts at lower turn). Elbows inside the pads, palms facing backward.", executionOverrides: "\"Chest up\" posture. Brutally isolates the upper back and rear delts to pull shoulders backward." },
      { machineId: "chest_flye", setupOverrides: "Gap 1 or 2. Arms around roller pads.", executionOverrides: "\"No effort from the hands\"—drive entirely with the elbows." },
      { machineId: "pullover", setupOverrides: "Gap 6 or 7. Requires a posterior pelvic tilt.", executionOverrides: "Handoff occurs in the fully contracted position." },
      { machineId: "triceps_extension", setupOverrides: "Gap 0 to 3. Drive the ulnar edge of the hands into the pads.", executionOverrides: "" }
    ]
  },
  {
    id: "routine-3-peripheral-b",
    name: "Routine 3: Peripheral Joint & Balance Focus (B-Rotation)",
    targetDemographic: "Aging populations (fall prevention), golfers, aesthetic-focused advanced trainees.",
    objective: "Prioritize hip stabilization, rotational core power, and arm isolation.",
    sequence: [
      { machineId: "abduction", setupOverrides: "No gap setup. Thighs snug against the pads.", executionOverrides: "\"Touch and go\" turnaround at the bottom." },
      { machineId: "adduction", setupOverrides: "Custom gap. Instructor manually secures arms open before client entry.", executionOverrides: "Slight speed increase after initial load-up." },
      { machineId: "leg_curl", setupOverrides: "Gap 3. Ankles must remain totally relaxed to isolate hamstrings.", executionOverrides: "Dent the roller pad; seamless turnaround." },
      { machineId: "seated_dip", setupOverrides: "No gap. Requires a posterior pelvic tilt and tight abdomen.", executionOverrides: "Continuous movement; neutral or pronated grip." },
      { machineId: "biceps_curl", setupOverrides: "Gap 1 or 2. Supinated grip (palms up).", executionOverrides: "Wrists must remain perfectly flat." },
      { machineId: "torso_rotation", setupOverrides: "No gap. Client physically wedges upper and lower body into the pads to lock the pelvis.", executionOverrides: "Posterior pelvic tilt required to protect the spine during rotation." },
      { machineId: "lateral_raise", setupOverrides: "No gap. Open hand grip.", executionOverrides: "Posterior pelvic tilt required." },
    ]
  }
];

export interface ValidationRuleViolation {
  ruleName: string;
  message: string;
  severity: "error" | "warning";
  indices?: number[];
}

export function validateRoutineSequence(machineIds: string[]): ValidationRuleViolation[] {
  const violations: ValidationRuleViolation[] = [];
  const machines = machineIds.map(id => MACHINE_LIST.find(m => m.id === id)).filter(Boolean) as Machine[];

  if (machines.length > 8) {
    violations.push({
      ruleName: "Pace & Time",
      message: "Routine exceeds 8 exercises. The routine must be restricted to exactly 6 to 8 exercises to fit the 30-minute high-intensity metabolic window.",
      severity: "error"
    });
  } else if (machines.length > 0 && machines.length < 6) {
    violations.push({
      ruleName: "Pace & Time",
      message: "Routine has fewer than 6 exercises. Recommend 6 to 8 exercises.",
      severity: "warning"
    });
  }

  const hasLegExt = machines.some(m => m.id === "leg_extension");
  const hasLegPress = machines.some(m => m.id === "leg_press");
  if (hasLegExt && hasLegPress) {
    violations.push({
      ruleName: "Lower Body Separation",
      message: "Leg Extension and Leg Press should not be pushed to failure in the same session.",
      severity: "error"
    });
  }

  const lumbarIdx = machines.findIndex(m => m.id === "lumbar_extension");
  const absIdx = machines.findIndex(m => m.id === "abdominals");

  if (lumbarIdx !== -1) {
    if (lumbarIdx < machines.length - 1) {
      const nextM = machines[lumbarIdx + 1];
      if (nextM && (nextM.id === "leg_press" || nextM.id === "leg_curl")) {
        violations.push({
          ruleName: "Spinal Sequencing",
          message: "Contraindication: Lumbar Extension cannot immediately precede Leg Press or Leg Curl to avoid discomfort and structural vulnerability.",
          severity: "error",
          indices: [lumbarIdx, lumbarIdx + 1]
        });
      }
    }
  }

  if (absIdx !== -1 && lumbarIdx !== -1) {
    if (lumbarIdx < absIdx) {
      violations.push({
        ruleName: "Spinal Sequencing",
        message: "If both Seated Abdominals and Lumbar are present, Abdominals MUST be sequenced first.",
        severity: "error",
        indices: [lumbarIdx, absIdx]
      });
    } else if (lumbarIdx === absIdx + 1) {
        violations.push({
            ruleName: "Spinal Sequencing",
            message: "Lumbar Extension should be placed several exercises after Seated Abdominals, not immediately after.",
            severity: "warning",
            indices: [absIdx, lumbarIdx]
        });
    }
  }

  for (let i = 0; i < machines.length - 1; i++) {
    const current = machines[i];
    const next = machines[i + 1];

    if (current.kinematicClassification && next.kinematicClassification) {
      const isCurrentPush = current.kinematicClassification.toLowerCase().includes("push");
      const isNextPush = next.kinematicClassification.toLowerCase().includes("push");
      const isCurrentPull = current.kinematicClassification.toLowerCase().includes("pull");
      const isNextPull = next.kinematicClassification.toLowerCase().includes("pull");

      if (isCurrentPush && isNextPush) {
        violations.push({
          ruleName: "No Overlapping (Push)",
          message: `Back-to-back Push movements detected (${current.name} -> ${next.name}). Alternate push/pull to prevent localized fatigue.`,
          severity: "error",
          indices: [i, i + 1]
        });
      } else if (isCurrentPull && isNextPull) {
        violations.push({
            ruleName: "No Overlapping (Pull)",
            message: `Back-to-back Pull movements detected (${current.name} -> ${next.name}). Alternate push/pull to prevent localized fatigue.`,
            severity: "error",
            indices: [i, i + 1]
        });
      }
    }
  }

  return violations;
}
