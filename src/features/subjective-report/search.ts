/**
 * FIND THE RIGHT AREA (tracker round, Sep 2026).
 *
 * "There are so many categories it's hard to find where to input. If a
 * client makes a statement about their sleep as they're leaving, I should
 * be able to search 'sleep' and see every area related to it." One pure
 * function over the words a trainer would actually use, so the panel and
 * the dialog can filter the same way.
 */

import { SUBJECTIVE_CATEGORIES } from "./questions";

/** Words that point at each non-category section (the category ones read their own statements). */
const SECTION_WORDS: Record<string, string[]> = {
  protein: ["protein", "food", "meal", "meals", "eat", "eating", "diet", "nutrition", "intake", "shake", "snack", "breakfast", "lunch", "dinner"],
  hydration: ["water", "hydration", "hydrated", "drink", "drinking", "fluids", "thirst", "coffee", "caffeine"],
  pain: ["pain", "hurt", "hurts", "sore", "ache", "aching", "injury", "knee", "back", "shoulder", "hip", "neck", "elbow", "wrist", "ankle", "mobility", "stiff", "tight"],
  stress: ["stress", "stressed", "work", "job", "family", "kids", "life", "busy", "anxious", "anxiety", "pressure", "travel", "surgery"],
};

const CATEGORY_EXTRA: Record<string, string[]> = {
  sleepRecovery: ["sleep", "sleeping", "tired", "rest", "recovery", "insomnia", "nap", "bed"],
  energyDailyFunction: ["energy", "fatigue", "stairs", "daily", "chores", "function", "tired"],
  strengthConfidence: ["strength", "strong", "weak", "confidence", "confident", "lift", "carry"],
  painMobility: ["pain", "hurt", "mobility", "stiff", "range", "joint", "sore"],
  consistencyHabits: ["consistency", "habit", "habits", "schedule", "routine", "missed", "attendance", "showing up"],
  mentalEmotional: ["mood", "mental", "emotional", "happy", "down", "depressed", "motivation", "motivated", "focus"],
  nutritionProtein: ["protein", "food", "meal", "meals", "eat", "eating", "diet", "nutrition", "snack"],
  lifestyleAlignment: ["lifestyle", "alcohol", "drinking", "smoking", "walk", "walking", "steps", "activity", "weekend", "vacation"],
};

function wordsFor(sectionId: string): string[] {
  const cat = SUBJECTIVE_CATEGORIES.find((c) => c.key === sectionId);
  if (cat) {
    return [
      cat.title,
      cat.coachPrompt,
      ...cat.statements.map((s) => s.text),
      ...(CATEGORY_EXTRA[sectionId] ?? []),
    ];
  }
  return [sectionId, ...(SECTION_WORDS[sectionId] ?? [])];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ");

/** True when every word of `query` appears somewhere in the section's vocabulary. */
export function sectionMatches(sectionId: string, query: string): boolean {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = norm(wordsFor(sectionId).join(" "));
  return terms.every((t) => hay.includes(t));
}

/** Section ids that match, in the order given. */
export function matchingSections(ids: readonly string[], query: string): string[] {
  return ids.filter((id) => sectionMatches(id, query));
}
