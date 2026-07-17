import { ClinicalTagDefinition } from "../types";

export const CLINICAL_TAGS: ClinicalTagDefinition[] = [
  // Chest Press
  {
    id: "tag_cp_shrug",
    kind: "Form",
    machineId: "chest-press", // Note: you might use specific machine UUIDs or generic slugs
    region: "Upper",
    label: "Shoulder Shrugging",
    cue: "Depress scapula, drive shoulders down",
    fourPCategory: "Posture"
  },
  {
    id: "tag_cp_elbow_flare",
    kind: "Form",
    machineId: "chest-press",
    region: "Upper",
    label: "Elbows Flaring",
    cue: "Tuck elbows slightly, 45 degree angle",
    fourPCategory: "Path"
  },
  {
    id: "tag_cp_bounce",
    kind: "Form",
    machineId: "chest-press",
    region: "Systemic",
    label: "Bouncing out of turnaround",
    cue: "Pause, ease out smoothly",
    fourPCategory: "Pace"
  },
  {
    id: "tag_cp_shoulder_pain",
    kind: "Symptom",
    machineId: "chest-press",
    region: "Upper",
    label: "Anterior Shoulder Pinch",
  },
  
  // Lat Pull
  {
    id: "tag_lp_momentum",
    kind: "Form",
    machineId: "lat-pulldown",
    region: "Core",
    label: "Trunk momentum / Swinging",
    cue: "Lock core, upright posture",
    fourPCategory: "Posture"
  },
  {
    id: "tag_lp_incomplete_rom",
    kind: "Form",
    machineId: "lat-pulldown",
    region: "Upper",
    label: "Short stroke (Not touching chest)",
    fourPCategory: "Path"
  },
  {
    id: "tag_lp_grip_loss",
    kind: "Behavior",
    machineId: "lat-pulldown",
    region: "Upper",
    label: "Grip failure before lat failure",
    cue: "Use straps or hook grip",
  },
  
  // Leg Press
  {
    id: "tag_leg_valgus",
    kind: "Form",
    machineId: "leg-press",
    region: "Lower",
    label: "Knee Valgus (Caving in)",
    cue: "Drive knees outward, align with toes",
    fourPCategory: "Path"
  },
  {
    id: "tag_leg_heel_lift",
    kind: "Form",
    machineId: "leg-press",
    region: "Lower",
    label: "Heels lifting off footplate",
    cue: "Drive through heels",
    fourPCategory: "Posture"
  },
  {
    id: "tag_leg_knee_pain",
    kind: "Symptom",
    machineId: "leg-press",
    region: "Lower",
    label: "Patellar discomfort",
  },
  
  // Leg Curl
  {
    id: "tag_lc_hip_lift",
    kind: "Form",
    machineId: "leg-curl",
    region: "Core",
    label: "Hips lifting off pad",
    cue: "Drive hips down into the pad",
    fourPCategory: "Posture"
  },
  {
    id: "tag_lc_incomplete_extension",
    kind: "Form",
    machineId: "leg-curl",
    region: "Lower",
    label: "Not reaching full extension",
    cue: "Control the eccentric all the way back",
    fourPCategory: "Path"
  },
  {
    id: "tag_lc_cramp",
    kind: "Symptom",
    machineId: "leg-curl",
    region: "Lower",
    label: "Hamstring Cramp",
  },
  {
    id: "tag_lc_fast_turnaround",
    kind: "Form",
    machineId: "leg-curl",
    region: "Systemic",
    label: "Fast turnaround at bottom",
    cue: "Deliberate squeeze before returning",
    fourPCategory: "Pace"
  },
  
  // Lumbar Extension
  {
    id: "tag_lx_hyper",
    kind: "Form",
    machineId: "lumbar-extension",
    region: "Spine",
    label: "Hypertension / Excessive Arch",
    cue: "Neutral spine, don't force end range",
    fourPCategory: "Path"
  },
  {
    id: "tag_lx_fast_eccentric",
    kind: "Form",
    machineId: "lumbar-extension",
    region: "Systemic",
    label: "Dropping the weight (Fast eccentric)",
    cue: "Resist the return, 4-10 second negative",
    fourPCategory: "Pace"
  },
  {
    id: "tag_lx_head_throw",
    kind: "Form",
    machineId: "lumbar-extension",
    region: "Spine",
    label: "Throwing head back",
    cue: "Keep cervical spine neutral",
    fourPCategory: "Posture"
  },
  {
    id: "tag_lx_pain",
    kind: "Symptom",
    machineId: "lumbar-extension",
    region: "Spine",
    label: "Sharp lower back pain",
  }
];
