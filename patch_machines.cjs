const fs = require('fs');

let content = fs.readFileSync('src/data/machine-database.ts', 'utf-8');

// Add fields to MachineKnowledge interface
content = content.replace(
  'export interface MachineKnowledge {',
  `export interface MachineKnowledge {
  kinematicClassification?: string;
  setupGap?: string;
  executionPosture?: string;
  requiresHandoff?: boolean;
  sequencingContraindications?: string[];`
);

// Map of kinematic classifications based on name
const getKinematicClassification = (name) => {
  if (name === "Leg Press" || name === "Chest Press" || name === "Overhead Press" || name === "Seated Dip") return "Compound Push";
  if (name === "Compound Row" || name === "Pulldown (Torso Arm)") return "Compound Pull";
  if (name === "Torso Rotation") return "Simple Rotary";
  if (name === "Lumbar Extension" || name === "Cervical Extension" || name === "Leg Curl" || name === "Adduction" || name === "Simple Row" || name === "Biceps Curl" || name === "Pullover") return "Simple Pull";
  return "Simple Push"; // Default
};

// We will use regex to find each machine block and inject the fields
const machines = [
  "Leg Press", "Leg Extension", "Leg Curl", "Abduction", "Adduction", 
  "Chest Press", "Overhead Press", "Seated Dip", "Chest Flye", "Triceps Extension", 
  "Lateral Raise", "Compound Row", "Pulldown (Torso Arm)", "Pullover", "Simple Row", 
  "Biceps Curl", "Lumbar Extension", "Abdominals", "Torso Rotation", "Cervical Extension"
];

const posteriorMachines = ["Overhead Press", "Pullover", "Seated Dip", "Torso Rotation", "Abdominals", "Triceps Extension"];
const handoffMachines = ["Compound Row", "Pulldown (Torso Arm)", "Pullover", "Cervical Extension", "Abdominals"];
const pullingMachines = ["Compound Row", "Pulldown (Torso Arm)", "Pullover", "Simple Row", "Biceps Curl", "Leg Curl", "Adduction", "Lumbar Extension", "Cervical Extension"];

for (const m of machines) {
  const isPosterior = posteriorMachines.includes(m);
  const posture = isPosterior ? "Posterior Pelvic Tilt / Contracted Abdomen" : "Chest Up / Anterior Pelvic Tilt";
  const needsHandoff = handoffMachines.includes(m) ? true : false;
  
  let setupGap = "";
  if (m === "Lumbar Extension") setupGap = "Gap 4-6";
  else if (m === "Pulldown (Torso Arm)" || m === "Leg Curl" || m === "Leg Extension") setupGap = "Gap 2";
  else if (m === "Abduction" || m === "Adduction") setupGap = "Custom Gap";
  
  const contraindications = [];
  if (m === "Lumbar Extension") contraindications.push("Do not pair immediately before Leg Press or Leg Curl (lumbar pump exacerbation).");
  if (pullingMachines.includes(m)) contraindications.push("Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.");
  
  const classification = getKinematicClassification(m);

  const blockStartRegex = new RegExp(`(name:\\s*"${m.replace(/([()])/g, '\\$1')}",)`);
  
  const replacement = `$1\n    kinematicClassification: "${classification}",\n    executionPosture: "${posture}",\n    requiresHandoff: ${needsHandoff},` + 
    (setupGap ? `\n    setupGap: "${setupGap}",` : "") +
    (contraindications.length ? `\n    sequencingContraindications: ${JSON.stringify(contraindications)},` : "");
  
  content = content.replace(blockStartRegex, replacement);
}

fs.writeFileSync('src/data/machine-database.ts', content);
