/**
 * useTopTrainer — the header's Top Trainer, from the persisted tally.
 *
 * Reads `client.trainerTally` and derives the winner on every render (cheap —
 * a handful of keys). For clients created before the tally existed it shows
 * the old estimate (whoever coached most of the sessions the profile has
 * loaded) and, once per client per app load, backfills the real tally from
 * the complete session list so the estimate is replaced by the definitive
 * answer on the next snapshot. No backdating of anything else happens here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { Client, Trainer, WorkoutSession } from "../../types";
import { resolveTopTrainer, tallyFromSessions, type TopTrainer } from "../../lib/client-rollups";

export type TopTrainerSource = "tally" | "estimate" | "none";

export interface TopTrainerState {
  top: TopTrainer | null;
  /** "tally" = persisted field; "estimate" = derived from loaded sessions while the backfill runs. */
  source: TopTrainerSource;
  backfilling: boolean;
}

/** Client ids whose backfill has been started in this app load — never run twice. */
const started = new Set<string>();

export function useTopTrainer(
  client: Client | null | undefined,
  trainers: Trainer[],
  loadedSessions: WorkoutSession[],
  options: { enabled?: boolean } = {},
): TopTrainerState {
  const enabled = options.enabled ?? true;
  const clientId = client?.id ?? null;
  const hasTally = !!client && client.trainerTally !== undefined && client.trainerTally !== null;
  const [backfilling, setBackfilling] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !clientId || hasTally || started.has(clientId)) return;
    started.add(clientId);
    setBackfilling(true);
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "sessions"), where("clientId", "==", clientId)));
        const sessions = snap.docs.map((d) => d.data() as WorkoutSession);
        const trainerTally = tallyFromSessions(sessions);
        const top = resolveTopTrainer(trainerTally, trainers);
        await updateDoc(doc(db, "clients", clientId), {
          trainerTally,
          topTrainerId: top?.key ?? null,
          topTrainerName: top?.name ?? null,
          topTrainerSessions: top?.sessions ?? 0,
          trainerTallyUpdatedAt: serverTimestamp(),
        });
      } catch (err) {
        // Best-effort. The estimate stays on screen and we try again next app load.
        started.delete(clientId);
        console.warn("Top trainer backfill skipped:", err);
      } finally {
        if (mounted.current) setBackfilling(false);
      }
    })();
  }, [enabled, clientId, hasTally, trainers]);

  return useMemo<TopTrainerState>(() => {
    if (!client) return { top: null, source: "none", backfilling };
    if (hasTally) {
      const top = resolveTopTrainer(client.trainerTally, trainers, client.topTrainerId);
      return { top, source: top ? "tally" : "none", backfilling };
    }
    // Estimate from what the profile already holds (the last page of history).
    const estimate = resolveTopTrainer(
      tallyFromSessions(
        loadedSessions.map((s) => ({
          status: s.status,
          trainerId: s.trainerId,
          trainerInitials: s.trainerInitials,
        })),
      ),
      trainers,
    );
    return { top: estimate, source: estimate ? "estimate" : "none", backfilling };
  }, [client, hasTally, trainers, loadedSessions, backfilling]);
}
