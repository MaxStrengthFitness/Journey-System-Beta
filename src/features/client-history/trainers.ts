import type { Trainer } from "../../types";
import { toTrainerRef } from "../calendar/selectors";
import type { TrainerRef } from "../calendar/types";
import type { HistorySession } from "./model";

/**
 * Who coached a session, as the Calendar tab would draw them (same initials,
 * same hashed colour).
 *
 * By trainer id first. By initials only when those initials belong to exactly
 * ONE trainer on the roster — two "AR"s are never merged into one person.
 * Imports with no identifiable coach get null and a neutral chip, not a guess.
 */
export function trainerLookup(trainers: Trainer[]): (s: HistorySession) => TrainerRef | null {
  const byId = new Map<string, TrainerRef>();
  const byInitials = new Map<string, TrainerRef | null>();
  for (const t of trainers) {
    if (!t.id) continue;
    const ref = toTrainerRef(t);
    byId.set(t.id, ref);
    const key = (t.initials || ref.initials).toUpperCase();
    byInitials.set(key, byInitials.has(key) ? null : ref);
  }
  return (s) =>
    (s.trainerId ? byId.get(s.trainerId) : undefined) ??
    (s.trainerInitials ? byInitials.get(s.trainerInitials.toUpperCase()) ?? null : null);
}
