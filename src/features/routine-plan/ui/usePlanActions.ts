/**
 * The plan's writes from the client profile (the design round, §4.3): the
 * profile owns the routines' one read and every write to them, so it holds
 * this hook and hands its actions to Programming.
 *
 * A tap never waits on the network (CLAUDE.md): each action issues its batch
 * through `store.ts` and moves on. Because the profile's read of the
 * routines is one `getDocs`, not a listener, the action patches the
 * profile's routines at once, so Programming draws the change before the
 * batch is even sent. A refusal comes back as a toast, and the profile reads
 * its routines again (`onRefused`) so the screen shows what was saved.
 *
 * The Health note a surgery or an injury offers is written through the
 * notes' one writer (`createJournalEntry`, with `storedNoteOf`'s Health
 * filing and the composer's default loudness), signed with the Auth uid the
 * journal rules pin, never awaited either.
 */
import { useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { Timestamp } from "firebase/firestore";
import { db } from "../../../firebase";
import { createJournalEntry } from "../../../hooks/useClientJournal";
import type { Routine } from "../../../types";
import { DEFAULT_IMPORTANCE, storedNoteOf } from "../../client-notes/note-catalog";
import { readPlanChanges, savePlanChange, startPlan } from "../store";
import type { HealthNoteCall, PlanActions, StartPlanCall } from "./host";
import type { PlanWrite } from "../lineup";

export interface PlanActionsInput {
  clientId: string | null;
  /** The client's home studio, as every routine carries it. */
  studioId: string;
  setRoutines: Dispatch<SetStateAction<Routine[]>>;
  /** A refusal, said. */
  onError: (message: string) => void;
  /** Read the routines again after a refusal, so the screen shows what was saved. */
  onRefused?: () => void;
  /** Who signs a Health note: the Auth uid, and how the journal shows them. */
  author: { id: string; initials: string; fullName: string } | null;
}

const REFUSED = "Couldn't save that change to the plan. Check the connection and try again.";

export function usePlanActions(input: PlanActionsInput): PlanActions {
  // The latest input, so the actions stay the same functions across renders.
  const ref = useRef(input);
  ref.current = input;

  const refused = useCallback((err?: unknown) => {
    if (err) console.error("Routine plan write refused:", err);
    ref.current.onError(REFUSED);
    ref.current.onRefused?.();
  }, []);

  const start = useCallback(
    (call: StartPlanCall) => {
      const { clientId, studioId, setRoutines } = ref.current;
      if (!clientId) return;
      let started: ReturnType<typeof startPlan>;
      try {
        started = startPlan(db, {
          routineId: call.routineId,
          clientId,
          studioId,
          name: "Routine A",
          machineIds: call.machineIds,
          plan: call.plan,
          change: call.change,
        });
      } catch (err) {
        refused(err);
        return;
      }
      const id = started.routineId;
      setRoutines((prev) => {
        if (prev.some((r) => r.id === id)) {
          return prev.map((r) => (r.id === id ? { ...r, machineIds: [...call.machineIds], plan: call.plan } : r));
        }
        // Made here: stamped now, as the server's time will, so Routine A's
        // head never says "not created yet" over a routine just kept.
        return [
          ...prev.filter((r) => !(r.name === "Routine A" && (!r.id || r.id.startsWith("temp-")))),
          { id, clientId, name: "Routine A", machineIds: [...call.machineIds], plan: call.plan, studioId, createdAt: Timestamp.now() },
        ];
      });
      started.commit.catch(refused);
    },
    [refused],
  );

  const save = useCallback(
    (routineId: string, write: PlanWrite) => {
      let commit: Promise<void>;
      try {
        commit = savePlanChange(db, routineId, write);
      } catch (err) {
        refused(err);
        return;
      }
      ref.current.setRoutines((prev) =>
        prev.map((r) => (r.id === routineId ? { ...r, plan: write.plan, ...(write.machineIds ? { machineIds: [...write.machineIds] } : null) } : r)),
      );
      commit.catch(refused);
    },
    [refused],
  );

  const healthNote = useCallback((call: HealthNoteCall) => {
    const { clientId, studioId, author, onError } = ref.current;
    if (!clientId || !author) return;
    const stored = storedNoteOf("health", call.flavour, null);
    createJournalEntry(clientId, studioId, author, {
      kind: stored.kind,
      category: stored.category,
      body: call.body,
      importance: DEFAULT_IMPORTANCE.health,
      machineId: call.machineId,
      focusId: null,
      origin: "profile",
    }).catch(() => onError("Couldn't save the Health note. Add it from Notes, and check the connection."));
  }, []);

  const readChanges = useCallback((routineId: string) => readPlanChanges(db, routineId), []);

  return useMemo(() => ({ start, save, healthNote, readChanges }), [start, save, healthNote, readChanges]);
}
