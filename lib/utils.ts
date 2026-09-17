import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getRoleColor = (role: string | undefined): string => {
  switch (role) {
    case "Founder":
      return "text-amber-500 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10";
    case "Admin":
      return "text-indigo-500 border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10";
    case "Overseer":
      return "text-teal-500 border-teal-200 dark:border-teal-500/30 bg-teal-50 dark:bg-teal-500/10";
    case "Owner":
    case "FranchiseOwner":
    case "StudioOwner":
      return "text-orange-500 border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10";
    case "StudioLeader":
    case "HeadTrainer":
      return "text-sky-500 border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10";
    case "Trainer":
    case "LifeTransformer":
    default:
      return "text-emerald-500 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10";
  }
};

export const getRoleDisplayName = (role: string | undefined): string => {
  switch (role) {
    case "Founder":
      return "Founder";
    case "Admin":
      return "Admin";
    case "Overseer":
      return "Overseer";
    case "Owner":
    case "FranchiseOwner":
    case "StudioOwner":
      return "Owner";
    case "StudioLeader":
    case "HeadTrainer":
      return "Studio Leader";
    case "Trainer":
    case "LifeTransformer":
    default:
      return "Life Transformer";
  }
};

export function generateSearchTokens(fullName: string): string[] {
  const name = fullName.toLowerCase().trim();
  const tokens = new Set<string>();

  const addPrefixes = (word: string) => {
    // Only generate prefixes up to the full word length to avoid overhead,
    // though for typical names it's small enough.
    for (let i = 1; i <= word.length; i++) {
      tokens.add(word.substring(0, i));
    }
  };

  // Add prefixes of the full name (allows matching "robbin m")
  addPrefixes(name);

  // Add prefixes of individual parts
  const parts = name.split(/\s+/);
  if (parts.length > 1) {
    for (const part of parts) {
      addPrefixes(part);
    }
  }

  return Array.from(tokens);
}
