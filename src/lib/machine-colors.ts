import { cn } from "./utils";

type MovementCategory = "Neck" | "Push" | "Pull" | "Core" | "Lower Body";

export const MACHINE_COLORS: Record<string, MovementCategory> = {
  // Neck
  "4-Way Neck": "Neck",
  "Four-Way Neck": "Neck",
  "Neck Flexion": "Neck",
  "Neck Extension": "Neck",

  // Push
  "Overhead Press": "Push",
  "Lateral Raise": "Push",
  "Chest Press": "Push",
  "Pec Fly": "Push",
  "Pectoral Fly": "Push",
  "Tricep Extension": "Push",
  "Seated Dip": "Push",

  // Pull
  "Pulldown": "Pull",
  "Pullover": "Pull",
  "Compound Row": "Pull",
  "Simple Row": "Pull",
  "Bicep": "Pull",
  "Bicep Curl": "Pull",

  // Torso / Core
  "Abdominals": "Core",
  "Abdominal": "Core",
  "Lumbar": "Core",
  "Lumbar Extension": "Core",
  "Torso Rotation": "Core",
  "Rotary Torso": "Core",

  // Lower Body
  "Hip Abduction": "Lower Body",
  "Hip Adduction": "Lower Body",
  "Leg Press": "Lower Body",
  "Leg Extension": "Lower Body",
  "Leg Curl": "Lower Body",
  "Seated Leg Curl": "Lower Body",
};

export interface ColorStyles {
  bg: string;
  border: string;
  text: string;
  ring: string;
  activeText: string;
}

export function getMachineStyle(machineName: string): ColorStyles {
  const normalizedName = machineName.trim() || "";
  
  // Try to find a direct match
  let category = MACHINE_COLORS[normalizedName];

  // Try partial match if no direct match
  if (!category) {
    const lowerName = normalizedName.toLowerCase();
    if (lowerName.includes("neck")) category = "Neck";
    else if (
      lowerName.includes("press") && !lowerName.includes("leg") ||
      lowerName.includes("raise") ||
      lowerName.includes("fly") ||
      lowerName.includes("tricep") ||
      lowerName.includes("dip")
    ) category = "Push";
    else if (
      lowerName.includes("pull") ||
      lowerName.includes("row") ||
      lowerName.includes("bicep")
    ) category = "Pull";
    else if (
      lowerName.includes("ab") ||
      lowerName.includes("lumbar") ||
      lowerName.includes("torso") ||
      lowerName.includes("core")
    ) category = "Core";
    else if (
      lowerName.includes("leg") ||
      lowerName.includes("hip") ||
      lowerName.includes("calf") ||
      lowerName.includes("thigh")
    ) category = "Lower Body";
    else category = "Neck"; // Fallback to slate
  }

  switch (category) {
    case "Push":
      return {
        bg: "bg-blue-100 dark:bg-blue-900/30",
        border: "border-blue-400 dark:border-blue-600",
        text: "text-blue-900 dark:text-blue-200",
        ring: "ring-blue-400 dark:ring-blue-600",
        activeText: "text-blue-600 dark:text-blue-400",
      };
    case "Pull":
      return {
        bg: "bg-amber-100 dark:bg-amber-900/30",
        border: "border-amber-400 dark:border-amber-600",
        text: "text-amber-900 dark:text-amber-200",
        ring: "ring-amber-400 dark:ring-amber-600",
        activeText: "text-amber-600 dark:text-amber-400",
      };
    case "Core":
      return {
        bg: "bg-purple-100 dark:bg-purple-900/30",
        border: "border-purple-400 dark:border-purple-600",
        text: "text-purple-900 dark:text-purple-200",
        ring: "ring-purple-400 dark:ring-purple-600",
        activeText: "text-purple-600 dark:text-purple-400",
      };
    case "Lower Body":
      return {
        bg: "bg-emerald-100 dark:bg-emerald-900/30",
        border: "border-emerald-400 dark:border-emerald-600",
        text: "text-emerald-900 dark:text-emerald-200",
        ring: "ring-emerald-400 dark:ring-emerald-600",
        activeText: "text-emerald-600 dark:text-emerald-400",
      };
    case "Neck":
    default:
      return {
        bg: "bg-slate-200 dark:bg-slate-700",
        border: "border-slate-500 dark:border-slate-400",
        text: "text-slate-900 dark:text-slate-100",
        ring: "ring-slate-500 dark:ring-slate-400",
        activeText: "text-slate-800 dark:text-slate-300",
      };
  }
}
