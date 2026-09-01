import { useState } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { Client, Trainer, Machine } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

type ClientFormData = {
  firstName: string;
  lastName: string;
  gender: "Male" | "Female" | "Other";
  heightFeet: string;
  heightInches: string;
  height?: string;
  weight: string;
  age: string | number | null;
  occupation: string;
  phone: string;
  email: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  isActive: boolean;
  isRoutineBActive: boolean;
  medicalHistory: string;
  globalNotes: string;
  remainingSessions: number;
  mindbody_name?: string;
};

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

    const date = new Date().toISOString().split("T")[0];
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
        await addDoc(collection(db, "exerciseLogs"), {
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

  const submitClientFormData = async (
    clientFormData: ClientFormData,
    editingClient: Client | null
  ) => {
    setIsMutating(true);
    try {
      const formattedHeight = `${clientFormData.heightFeet || "0"}' ${clientFormData.heightInches || "0"}"`;
      const submissionData = {
        ...clientFormData,
        height: formattedHeight,
      };

      const { heightFeet, heightInches, ...restFinalData } = submissionData as any;
      const finalData: any = { ...restFinalData };

      if (finalData.age === "" || finalData.age === undefined) {
        finalData.age = null;
      } else if (typeof finalData.age === "string") {
        const parsed = parseInt(finalData.age, 10);
        finalData.age = isNaN(parsed) ? null : parsed;
      }

      Object.keys(finalData).forEach((key) => {
        if (finalData[key] === undefined) {
          finalData[key] = null;
        }
      });

      if (editingClient) {
        await updateDoc(doc(db, "clients", editingClient.id!), {
          ...finalData,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "clients"), {
          ...finalData,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "clients");
      throw error;
    } finally {
      setIsMutating(false);
    }
  };

  const updateClientSessions = async (clientId: string, current: number, delta: number) => {
    setIsMutating(true);
    try {
      const newVal = Math.max(0, current + delta);
      await updateDoc(doc(db, "clients", clientId), {
        remainingSessions: newVal,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
      throw error;
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
    submitClientFormData,
    updateClientSessions,
    handleDeleteClient,
  };
}
