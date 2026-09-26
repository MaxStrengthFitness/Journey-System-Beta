/**
 * One trainer's counters, live: `trainers/{id}/stats/rollups`.
 *
 * The cost plan (Sep 26 2026, D3c) moved them off the trainer document, which
 * every iPad in the company watches, so a completed session is no longer read
 * by all of them (functions/src/trainerRollups.ts has the why). Only a screen
 * showing this trainer's numbers reads this. Null until it exists or when it
 * cannot be read: deriveTrainerStats then reads the old `trainer.rollups`.
 */
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../firebase";
import type { Trainer } from "../../types";

export function useTrainerRollups(trainerId: string | null | undefined): Trainer["rollups"] | null {
  const [counters, setCounters] = useState<Trainer["rollups"] | null>(null);
  useEffect(() => {
    setCounters(null);
    if (!trainerId) return;
    return onSnapshot(
      doc(db, "trainers", trainerId, "stats", "rollups"),
      (snap) => setCounters(snap.exists() ? (snap.data() as Trainer["rollups"]) : null),
      () => setCounters(null),
    );
  }, [trainerId]);
  return counters;
}
