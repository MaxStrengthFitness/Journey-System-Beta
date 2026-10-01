import { useState } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { Client, Trainer, Machine } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { logDocId } from "../lib/exercise-log-id";
import { studioTodayKey } from "../lib/studio-time";

export function useClientMutations(
  authTrainer: Trainer | null,
  activeStudioId: string | null,
  machines: Machine[],
  setSelectedClientId: (id: string | null) => void,
  setCurrentView: (view: any) => void
) {
  const [isMutating, setIsMutating] = useState(false);

  const startUnassignedSession = async () => {
    if (!authTrainer) return;
    setIsMutating(true);

    const defaultMachineNames = [
      "Hip Abduction",
      "Hip Adduction",
      "Leg Press",
      "Compound Row",
      "Chest Press",
      "Lumbar",
    ];
    
    const activeMachines = defaultMachineNames
      .map((name) => machines.find((m) => m.name === name || m.fullName === name)?.id)
      .filter(Boolean) as string[];

    const date = studioTodayKey();
    const activeStudioIdForSession = activeStudioId || authTrainer.primaryHomeStudioId;

    try {
      const docRef = await addDoc(collection(db, "sessions"), {
        isUnassigned: true,
        sessionType: "Standard",
        sessionNumber: 0,
        date,
        hostedAtStudioId: activeStudioIdForSession,
        clientHomeStudioId: null,
        isCrossTrain: false,
        trainerInitials: authTrainer.initials,
        trainerName: authTrainer.fullName,
        trainerId: authTrainer.id,
        status: "In-Progress",
        startTime: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      for (const mid of activeMachines) {
        /* Derived id, matching every other writer of this collection -- a
           random one here would let a trainer who starts entering reps before
           the logs snapshot arrives create a SECOND document for the same set,
           and only one of the two would survive into the finished session. */
        await setDoc(doc(db, "exerciseLogs", logDocId(docRef.id, mid)), {
          sessionId: docRef.id,
          machineId: mid,
          weight: "0",
          reps: "",
          createdAt: serverTimestamp(),
          studioId: activeStudioId,
        });
      }

      setSelectedClientId(null);
      setCurrentView("workouts");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "sessions");
    } finally {
      setIsMutating(false);
    }
  };

  const updateClient = async (clientId: string, updates: Partial<Client>) => {
    setIsMutating(true);
    try {
      await updateDoc(doc(db, "clients", clientId), { ...updates, updatedAt: serverTimestamp() });
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    setIsMutating(true);
    try {
      await deleteDoc(doc(db, "clients", clientId));
      setSelectedClientId(null);
      setCurrentView("clients");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `clients/${clientId}`);
      throw error;
    } finally {
      setIsMutating(false);
    }
  };

  return {
    isMutating,
    startUnassignedSession,
    updateClient,
    handleDeleteClient,
  };
}
