import { useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { PlusCircle } from "lucide-react";
import { db } from "../../firebase";
import type { ExerciseLog, Machine, Trainer, WorkoutSession } from "../../types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import { useActiveStudio } from "../../ActiveStudioContext";
import { EARLIEST_PLACEABLE_DAY, todayKey } from "./model";
import { BACKFILL_NOTE } from "./HistoryList";

/**
 * "Log past session" — moved out of the old ClientHistoryCalendar unchanged
 * in what it writes: a completed session "backbone" on the chosen date, plus
 * empty sets for the client's five most recent machines so the trainer can
 * fill them in from the session pop-up.
 *
 * Two fixes. The default date was `new Date().toISOString()` — the UTC date,
 * which after 8 PM Eastern is already tomorrow; it is the studio's today now.
 * And the date must be a real past day: a desktop date input accepts a year
 * typed as "26", which stored "0026-02-03" and put the session nowhere.
 */
export interface LogPastSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientHomeStudioId?: string;
  machines: Machine[];
  trainers: Trainer[];
  timeZone?: string;
}

export function LogPastSessionDialog({
  open,
  onOpenChange,
  clientId,
  clientHomeStudioId,
  machines,
  trainers,
  timeZone,
}: LogPastSessionDialogProps) {
  const { activeStudioId } = useActiveStudio();
  const [date, setDate] = useState(() => todayKey(new Date(), timeZone));
  const [trainerId, setTrainerId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const create = async () => {
    setIsSaving(true);
    try {
      const latest = await getDocs(
        query(collection(db, "sessions"), where("clientId", "==", clientId), orderBy("date", "desc"), limit(1)),
      );
      const sessionNumber = latest.empty ? 1 : (latest.docs[0].data().sessionNumber || 0) + 1;
      const trainer = trainers.find((t) => t.id === trainerId);

      const session: WorkoutSession = {
        clientId,
        date,
        hostedAtStudioId: activeStudioId || "unknown",
        clientHomeStudioId: clientHomeStudioId || activeStudioId || "unknown",
        isCrossTrain: Boolean(clientHomeStudioId && activeStudioId && clientHomeStudioId !== activeStudioId),
        sessionType: "Standard",
        startTime: `${date}T12:00:00.000Z`,
        endTime: `${date}T12:30:00.000Z`,
        trainerInitials: trainer?.initials || "TR",
        status: "Completed",
        sessionNumber,
        notes: BACKFILL_NOTE,
        createdAt: new Date().toISOString(),
      };
      const ref = await addDoc(collection(db, "sessions"), session);

      // Empty sets for the machines they usually do, to fill in afterwards.
      const recent = await getDocs(
        query(collection(db, "exerciseLogs"), where("clientId", "==", clientId), orderBy("date", "desc"), limit(15)),
      );
      const machineIds = Array.from(new Set(recent.docs.map((d) => d.data().machineId as string))).slice(0, 5);
      const batch = writeBatch(db);
      machineIds.forEach((machineId) => {
        if (!machines.some((m) => m.id === machineId)) return;
        const placeholder: ExerciseLog = {
          clientId,
          sessionId: ref.id,
          machineId,
          weight: "0",
          reps: "0",
          seconds: "0",
          machineSettings: {},
          createdAt: new Date().toISOString(),
          studioId: activeStudioId || clientHomeStudioId || "",
          homeStudioId: clientHomeStudioId || activeStudioId || "",
          clientHomeStudioId: clientHomeStudioId || activeStudioId || "",
        };
        batch.set(doc(collection(db, "exerciseLogs")), placeholder);
      });
      await batch.commit();

      onOpenChange(false);
      setTrainerId("");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "sessions");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hsd max-w-md sm:max-w-md rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <PlusCircle className="w-6 h-6" style={{ color: "var(--cal-live-text)" }} />
            Log past session
          </DialogTitle>
          <DialogDescription className="font-medium" style={{ color: "var(--cal-ink-muted)" }}>
            Creates an empty session on that date. Open it from the calendar afterwards to fill in the sets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <label className="block space-y-2">
            <span className="hsd-panel__title block">Session date</span>
            <Input
              type="date"
              value={date}
              min={EARLIEST_PLACEABLE_DAY}
              max={todayKey(new Date(), timeZone)}
              onChange={(e) => setDate(e.target.value)}
              className="h-12 rounded-xl font-medium px-4"
            />
          </label>
          <label className="block space-y-2">
            <span className="hsd-panel__title block">Trainer</span>
            <select
              value={trainerId}
              onChange={(e) => setTrainerId(e.target.value)}
              className="w-full h-12 rounded-xl font-medium px-4 border outline-none"
              style={{ background: "var(--cal-surface)", color: "var(--cal-ink)", borderColor: "var(--cal-border)" }}
            >
              <option value="" disabled>
                Select trainer…
              </option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4" style={{ borderTop: "1px solid var(--cal-border)" }}>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="hsd-cancel">
            Cancel
          </Button>
          <Button onClick={create} disabled={isSaving || !trainerId || !isPlaceable(date, timeZone)} className="hsd-save">
            {isSaving ? "Creating…" : "Create session"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A real past day: a desktop date input will happily accept "0026-02-03". */
function isPlaceable(date: string, timeZone?: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= EARLIEST_PLACEABLE_DAY && date <= todayKey(new Date(), timeZone);
}
