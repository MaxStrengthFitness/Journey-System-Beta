/**
 * One machine's history for this client, opened from the tracker.
 *
 * Moved out of components/WorkoutTrackerView.tsx, unchanged, in the beta-prep
 * trim (Sep 17 2026). See PerformanceEntryDialog.tsx for why.
 */
import { useState, useEffect } from "react";
import { MessageSquare, ClipboardList, History } from "lucide-react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Machine, ExerciseLog } from "../../types";
import { handleFirestoreError, OperationType } from "../../lib/firestore-errors";
import { safeToDate } from "../../lib/utils";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ExerciseHistoryDialog({
  clientId,
  machine,
  onClose,
  user,
}: {
  clientId: string;
  machine: Machine;
  onClose: () => void;
  user: any;
}) {
  const [history, setHistory] = useState<ExerciseLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !machine.id || !clientId) return;
    /*
     * The last 20 sets on this machine, not every set ever performed on it.
     *
     * This is a LIVE listener opened from the tracker whenever a trainer taps
     * a machine's history -- many times a session, every session. Unbounded it
     * streams the client's entire lifetime on that machine and grows forever:
     * a weekly client is past 150 documents inside three years, and nothing
     * stops it climbing.
     *
     * The dialog shows a short recent list, so the tail was being paid for and
     * thrown away. The orderBy was already here and the composite index
     * (clientId, machineId, createdAt DESC) already exists, so the limit costs
     * nothing and drops no document the list was showing.
     */
    const q = query(
      collection(db, "exerciseLogs"),
      where("clientId", "==", clientId),
      where("machineId", "==", machine.id),
      orderBy("createdAt", "desc"),
      limit(20),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as ExerciseLog,
        );
        setHistory(logs);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "exerciseLogs");
      },
    );

    return () => unsubscribe();
  }, [clientId, machine.id, user]);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-125 h-[80dvh] flex flex-col rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl font-black uppercase italic tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />
            {machine.name} History
          </DialogTitle>
          <DialogDescription className="font-bold text-xs">
            Performance tracking from origin to present.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-20 opacity-50 space-y-2">
              <ClipboardList className="w-12 h-12 mx-auto" />
              <p className="font-bold uppercase text-xs">
                No historical data found
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((log, idx) => {
                const isOrigin = idx === history.length - 1;
                return (
                  <div
                    key={log.id}
                    className={`p-4 rounded-2xl border transition-all ${isOrigin ? "bg-primary/5 border-primary/20 ring-1 ring-primary/10" : "bg-white dark:bg-surface-1"}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-muted-foreground uppercase">
                          {safeToDate(log.createdAt)?.toLocaleDateString() ||
                            "Recent"}
                        </span>
                        {isOrigin && (
                          <Badge className="bg-primary text-foreground text-[11px] font-black rounded px-1.5 h-4 border-none uppercase">
                            Origin
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {log.isStaticHold && (
                          <Badge
                            variant="outline"
                            className="text-[11px] border-primary text-primary h-4"
                          >
                            Static
                          </Badge>
                        )}
                        {log.notes && (
                          <MessageSquare className="w-3 h-3 text-primary/40" />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-muted-foreground uppercase">
                          Weight
                        </p>
                        <p className="text-xl font-black">
                          {log.weight}{" "}
                          <span className="text-[11px] font-normal italic">
                            lbs
                          </span>
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-muted-foreground uppercase">
                          {log.isStaticHold ? "Seconds" : "Reps"}
                        </p>
                        <p
                          className={`text-xl font-black ${
                            log.repQuality === 3
                              ? "text-emerald-500"
                              : log.repQuality === 2
                                ? "text-amber-500"
                                : log.repQuality === 1
                                  ? "text-red-500"
                                  : ""
                          }`}
                        >
                          {log.isStaticHold
                            ? log.seconds || "0"
                            : log.reps || "0"}
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-muted-foreground uppercase">
                          Quality
                        </p>
                        <div
                          className={`w-fit px-2 py-0.5 rounded-full text-[11px] font-black text-slate-900 dark:text-white ${
                            log.repQuality === 3
                              ? "bg-emerald-500"
                              : log.repQuality === 2
                                ? "bg-amber-500"
                                : log.repQuality === 1
                                  ? "bg-red-500"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {log.repQuality === 3
                            ? "MAX STRENGTH"
                            : log.repQuality === 2
                              ? "COMPLETED"
                              : log.repQuality === 1
                                ? "POOR"
                                : "NONE"}
                        </div>
                      </div>
                    </div>

                    {log.notes && (
                      <div className="mt-3 text-[11px] bg-white dark:bg-bg-dark p-2 rounded-lg font-medium text-muted-foreground border-l-2 border-primary/30 italic">
                        "{log.notes}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
