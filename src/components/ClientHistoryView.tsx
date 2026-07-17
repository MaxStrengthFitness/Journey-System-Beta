import React, { useState, useEffect } from "react";
import { ChevronLeft, MessageSquare, History } from "lucide-react";
import { motion } from "motion/react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { handleFirestoreError, OperationType } from "../lib/firestore-errors";
import { parseSessionDate } from "../lib/utils";
import { useToast } from "../contexts/ToastContext";
import {
  Client,
  Machine,
  Trainer,
  View,
  WorkoutSession,
  ExerciseLog,
  SessionNote,
  Routine,
} from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SessionNotesSidebar } from "./SessionNotesSidebar";

export function ClientHistoryView({
  clientId,
  clients,
  machines,
  trainers,
  setView,
  selectedSessionId,
  user,
}: {
  clientId: string | null;
  clients: Client[];
  machines: Machine[];
  trainers: Trainer[];
  setView: (v: View) => void;
  selectedSessionId?: string | null;
  user: any;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [logs, setLogs] = useState<Record<string, ExerciseLog>>({});
  const [sessionNotes, setSessionNotes] = useState<
    Record<string, SessionNote[]>
  >({});
  const [currentNotesSession, setCurrentNotesSession] =
    useState<WorkoutSession | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(
    null,
  );
  const client = clients.find((c) => c.id === clientId);
  const [trainerStats, setTrainerStats] = useState<Record<string, number>>({});
  const [trainerFilter, setTrainerFilter] = useState<string | null>(null);

  const [historyLimit, setHistoryLimit] = useState(12);
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    if (!clientId || !user) return;

    const fetchData = async () => {
      try {
        // Fetch Routines for filtering
        const routinesQuery = query(
          collection(db, "routines"),
          where("clientId", "==", clientId),
        );
        const routineSnap = await getDocs(routinesQuery);
        setRoutines(
          routineSnap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Routine,
          ),
        );

        const sessionsQuery = query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          orderBy("createdAt", "desc"),
          limit(historyLimit),
        );
        const sessionSnap = await getDocs(sessionsQuery);
        const sessionsData = sessionSnap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
        );
        setAllSessions(sessionsData);

        // Fetch Session Notes for client
        const notesQuery = query(
          collection(db, "sessionNotes"),
          where("clientId", "==", clientId),
          orderBy("createdAt", "desc"),
        );
        const notesSnap = await getDocs(notesQuery);
        const notesMap: Record<string, SessionNote[]> = {};
        notesSnap.docs.forEach((doc) => {
          const note = { id: doc.id, ...doc.data() } as SessionNote;
          if (!notesMap[note.sessionId]) notesMap[note.sessionId] = [];
          notesMap[note.sessionId].push(note);
        });
        setSessionNotes(notesMap);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "multiple");
      }
    };

    fetchData().catch((err) =>
      console.error("Unhandled rejection in fetchData:", err),
    );
  }, [clientId, historyLimit, user]);

  useEffect(() => {
    // Calculate trainer stats
    const stats: Record<string, number> = {};
    allSessions.forEach((s) => {
      stats[s.trainerInitials] = (stats[s.trainerInitials] || 0) + 1;
    });
    setTrainerStats(stats);

    // Show more sessions for the grid view (12 by default if possible)
    let displayData = allSessions;
    if (selectedSessionId) {
      const targetIndex = allSessions.findIndex(
        (s) => s.id === selectedSessionId,
      );
      if (targetIndex !== -1) {
        let start = Math.max(0, targetIndex - 5);
        let end = Math.min(allSessions.length, start + 12);
        if (end - start < 12) start = Math.max(0, end - 12);
        displayData = allSessions.slice(start, end);
      } else {
        displayData = allSessions.slice(0, 12);
      }
    } else {
      displayData = allSessions.slice(0, 12);
    }

    setSessions(displayData.reverse());
  }, [allSessions, selectedSessionId]);

  const sessionIdsStr = sessions
    .map((s) => s.id)
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    if (!sessionIdsStr) return;

    const fetchLogs = async () => {
      try {
        const sessionIds = sessionIdsStr.split(",").filter(Boolean);
        if (sessionIds.length === 0) return;
        const logsQuery = query(
          collection(db, "exerciseLogs"),
          where("sessionId", "in", sessionIds),
        );

        const snapshot = await getDocs(logsQuery);
        const logsData: Record<string, ExerciseLog> = {};
        snapshot.docs.forEach((doc) => {
          const log = { id: doc.id, ...doc.data() } as ExerciseLog;
          logsData[`${log.sessionId}_${log.machineId}`] = log;
        });
        setLogs((prev) => ({ ...prev, ...logsData }));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "exerciseLogs");
      }
    };

    fetchLogs().catch((err) =>
      console.error("Unhandled rejection in fetchLogs:", err),
    );
  }, [sessionIdsStr]);

  const filteredSessions = trainerFilter
    ? sessions.filter((s) => s.trainerInitials === trainerFilter)
    : sessions;

  const displaySessions = filteredSessions.slice(-12); // Show up to 12 sessions in the grid

  const visibleMachines = selectedRoutineId
    ? machines.filter((m) =>
        routines
          .find((r) => r.id === selectedRoutineId)
          ?.machineIds.includes(m.id!),
      )
    : machines.sort((a, b) => a.order - b.order);

  const [isGeneratingMock, setIsGeneratingMock] = useState(false);

  const generateMockHistory = async () => {
    if (!clientId || isGeneratingMock) return;
    setIsGeneratingMock(true);
    try {
      const routineAIds = [
        "m-hip-add",
        "m-hip-abd",
        "m-leg-press",
        "m-compound-row",
        "m-dip",
        "m-lumbar",
        "m-torso-rotation",
      ];
      const trainerInitials = "MD";

      for (let i = 1; i <= 8; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (8 - i) * 3); // Every 3 days backwards
        const dateStr = date.toISOString().split("T")[0];

        const sessionRef = await addDoc(collection(db, "sessions"), {
          clientId,
          sessionNumber: i,
          date: dateStr,
          trainerInitials,
          status: "Completed",
          sessionType: "Standard",
          createdAt: Timestamp.fromDate(date),
          endTime: Timestamp.fromDate(
            new Date(date.getTime() + 20 * 60 * 1000),
          ),
        });

        for (const mId of routineAIds) {
          const baseWeight = 80 + Math.floor(Math.random() * 40);
          const weight = baseWeight + i * 2; // Linear progression
          await addDoc(collection(db, "exerciseLogs"), {
            sessionId: sessionRef.id,
            clientId,
            machineId: mId,
            weight: weight.toString(),
            reps: (8 + Math.floor(Math.random() * 4)).toString(),
            repQuality: 2,
            createdAt: Timestamp.fromDate(date),
            studioId:
              clients.find((c) => c.id === clientId)?.homeStudioId || "",
          });
        }
      }
      toastSuccess("Mock history generated successfully. Reloading...");
      window.location.reload();
    } catch (err) {
      console.error(err);
      toastError("Failed to generate mock history.");
    } finally {
      setIsGeneratingMock(false);
    }
  };

  if (!client) return <div className="p-20 text-center">Client not found.</div>;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-4 h-[calc(100vh-160px)] overflow-hidden"
    >
      <div className="flex items-center justify-between bg-white dark:bg-surface-1 p-4 border rounded-2xl shadow-sm dark:shadow-none shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView("clients")}
            className="rounded-xl"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-black">
              {client.firstName} {client.lastName}
            </h2>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Session History & Trends
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-[11px] font-black uppercase text-amber-500 border-amber-500/20 hover:bg-amber-500/10"
            onClick={generateMockHistory}
            disabled={isGeneratingMock}
          >
            {isGeneratingMock ? "Generating..." : "Generate Mock Data"}
          </Button>
          <Badge className="bg-primary/10 text-primary border-none px-4 py-1 rounded-full font-black">
            {sessions.length} Sessions Tracked
          </Badge>
        </div>
      </div>

      {/* Trainer Stats & Client Info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
        <Card className="md:col-span-2 rounded-2xl border-2 border-primary/5">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              Client Vitals
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase">
                Height/Weight
              </p>
              <p className="text-xs font-black">
                {client.height} / {client.weight || "--"} lbs
              </p>
              {client.occupation && (
                <p className="text-[11px] font-bold text-primary/70 uppercase">
                  Job: {client.occupation}
                </p>
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase">
                Phone
              </p>
              <p className="text-xs font-black">{client.phone || "--"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase">
                Emergency
              </p>
              <p className="text-xs font-black truncate">
                {client.emergencyContactName || "--"}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase">
                Injuries/History
              </p>
              <p className="text-xs font-black truncate">
                {client.medicalHistory || "None"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-2 border-primary/5">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              Routine Filter
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={selectedRoutineId === null ? "default" : "outline"}
                size="sm"
                className="h-6 px-2 text-[11px] font-black uppercase rounded-md"
                onClick={() => setSelectedRoutineId(null)}
              >
                View All
              </Button>
              {routines.map((r) => (
                <Button
                  key={r.id}
                  variant={selectedRoutineId === r.id ? "default" : "outline"}
                  size="sm"
                  className="h-6 px-2 text-[11px] font-black uppercase rounded-md"
                  onClick={() =>
                    setSelectedRoutineId(
                      selectedRoutineId === r.id ? null : r.id!,
                    )
                  }
                >
                  {r.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-2 border-primary/5">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              Top Trainers
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-1">
              <Button
                variant={trainerFilter === null ? "default" : "outline"}
                size="sm"
                className="h-6 px-2 text-[11px] font-black uppercase rounded-md"
                onClick={() => setTrainerFilter(null)}
              >
                All
              </Button>
              {Object.entries(trainerStats)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([initials, count]) => (
                  <Button
                    key={initials}
                    variant={trainerFilter === initials ? "default" : "outline"}
                    size="sm"
                    className="h-6 px-1.5 text-[11px] font-black uppercase rounded-md flex gap-1"
                    onClick={() =>
                      setTrainerFilter(
                        trainerFilter === initials ? null : initials,
                      )
                    }
                  >
                    <span>{initials}</span>
                    <Badge
                      variant="secondary"
                      className={`text-[7px] h-3 px-1 font-black border-none ${trainerFilter === initials ? "bg-white/20 text-slate-900 dark:text-white" : "bg-primary/10 text-primary"}`}
                    >
                      {count}
                    </Badge>
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 overflow-hidden border rounded-xl bg-white dark:bg-surface-1 shadow-lg flex flex-col">
        <div className="overflow-auto flex-1 h-full scrollbar-thin scrollbar-thumb-muted-foreground/20">
          <table className="w-full border-collapse border-spacing-0 table-fixed">
            <thead className="sticky top-0 z-30">
              <tr>
                <th className="p-1 px-3 text-left font-black uppercase tracking-tighter border-b border-r min-w-30 w-30 bg-muted/90 backdrop-blur-md sticky left-0 z-40 text-[11px] shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                  Exercise
                </th>
                {displaySessions.map((s) => {
                  const absoluteIdx = filteredSessions.findIndex(
                    (fs) => fs.id === s.id,
                  );
                  const sNum = s.sessionNumber || absoluteIdx + 1;
                  return (
                    <th
                      key={s.id}
                      className={`p-1.5 text-center border-b border-r min-w-17.5 w-17.5 transition-all bg-white dark:bg-bg-dark backdrop-blur-sm ${s.id === selectedSessionId ? "bg-primary/10 ring-1 ring-inset ring-primary" : ""}`}
                    >
                      <div className="flex flex-col items-center space-y-1">
                        <div className="bg-primary/10 border border-primary/20 rounded-md px-1.5 py-0.5 shadow-sm dark:shadow-none">
                          <span className="text-primary font-black tabular-nums text-[11px] leading-none">
                            {sNum.toString().padStart(2, "0")}
                          </span>
                        </div>
                        <span className="text-[7px] text-muted-foreground font-black uppercase tracking-widest">
                          {new Date(
                            parseSessionDate(s.date),
                          ).toLocaleDateString("en-US", {
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="p-1 text-center font-black uppercase text-[11px] border-b bg-white dark:bg-bg-dark sticky right-0 z-20 min-w-12.5 w-12.5">
                  +/-
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleMachines.map((machine, mIdx) => {
                const machineLogs = displaySessions.map(
                  (s) => logs[`${s.id}_${machine.id}`],
                );
                const rowColor =
                  mIdx % 2 === 0 ? "bg-white dark:bg-surface-1" : "bg-muted/5";

                return (
                  <tr
                    key={machine.id}
                    className={`${rowColor} group hover:bg-primary/5 transition-colors h-14`}
                  >
                    <td
                      className={`p-1.5 px-3 border-r font-bold sticky left-0 z-20 ${rowColor} group-hover:bg-primary/5 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[11px] uppercase font-black tracking-tight leading-none truncate">
                          {machine.name}
                        </span>
                        <div className="flex flex-wrap gap-0.5 mt-1 opacity-60">
                          {machine.settingOptions?.map((opt) => (
                            <span
                              key={opt}
                              className="text-[7px] font-bold bg-muted px-1 rounded uppercase"
                            >
                              {opt.slice(0, 4)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                    {displaySessions.map((s, idx) => {
                      const log = logs[`${s.id}_${machine.id}`];
                      const prevLog =
                        idx > 0
                          ? logs[`${displaySessions[idx - 1].id}_${machine.id}`]
                          : null;

                      const isUnusual =
                        prevLog &&
                        log &&
                        parseFloat(log.weight || "0") <
                          parseFloat(prevLog.weight || "0") * 0.85;
                      const isImprovement =
                        prevLog &&
                        log &&
                        parseFloat(log.weight || "0") >
                          parseFloat(prevLog.weight || "0");

                      return (
                        <td
                          key={s.id}
                          className={`p-1 border-r text-center align-middle relative ${isUnusual ? "bg-red-50/30" : ""}`}
                        >
                          {log ? (
                            <div className="flex flex-col gap-0.5">
                              <div
                                className={`text-[12px] font-black leading-none tracking-tighter ${isImprovement ? "text-emerald-600" : isUnusual ? "text-red-500" : "text-foreground"}`}
                              >
                                {log.weight}
                              </div>
                              <div className="text-[11px] font-bold text-muted-foreground leading-none">
                                {log.repsLeft !== undefined &&
                                log.repsRight !== undefined ? (
                                  <span className="text-[7px] font-black">
                                    {log.repsLeft}L|{log.repsRight}R
                                  </span>
                                ) : (
                                  <>
                                    {log.isStaticHold
                                      ? log.seconds || "--"
                                      : log.reps || "--"}
                                    <span className="text-[7px] ml-0.5 uppercase">
                                      {log.isStaticHold ? "s" : "r"}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="flex flex-wrap justify-center gap-0.5 mt-0.5 overflow-hidden max-h-4">
                                {Object.entries(log.machineSettings || {}).map(
                                  ([key, val]) => (
                                    <span
                                      key={key}
                                      className="text-[6px] font-black px-0.5 h-2.5 flex items-center bg-primary/10 text-primary rounded-xs border border-primary/20"
                                    >
                                      {val}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center opacity-5">
                              <div className="w-4 h-px bg-foreground rotate-45" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-1 text-center bg-muted/5 sticky right-0 z-10 border-l shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                      {(() => {
                        const validLogs = machineLogs.filter(Boolean);
                        if (validLogs.length < 2) return null;
                        const latest = validLogs[validLogs.length - 1];
                        const prev = validLogs[validLogs.length - 2];
                        const diff =
                          parseFloat(latest.weight || "0") -
                          parseFloat(prev.weight || "0");

                        if (diff > 0)
                          return (
                            <span className="text-emerald-500 text-[11px] font-black tracking-tighter leading-none">
                              +{diff}
                            </span>
                          );
                        if (diff < 0)
                          return (
                            <span className="text-red-500 text-[11px] font-black tracking-tighter leading-none">
                              {diff}
                            </span>
                          );
                        return (
                          <span className="text-muted-foreground/30 text-[7px] font-black">
                            --
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
              {/* Session Notes History Row */}
              <tr className="bg-primary/5 hover:bg-primary/10 transition-colors h-12">
                <td className="p-2 px-3 border-r font-black uppercase text-[11px] text-primary sticky left-0 z-20 bg-primary/5 group-hover:bg-primary/10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  Session Notes
                </td>
                {displaySessions.map((s) => {
                  const sessionNotesList = sessionNotes[s.id!] || [];
                  const latestNote = sessionNotesList[0];

                  return (
                    <td
                      key={s.id}
                      className="p-1 border-r text-center group/note relative cursor-pointer"
                      onClick={() => setCurrentNotesSession(s)}
                    >
                      <div className="flex flex-col items-center justify-center h-full">
                        <MessageSquare
                          className={`w-3.5 h-3.5 transition-transform group-hover/note:scale-110 ${latestNote ? "text-primary" : "text-muted-foreground/10"}`}
                        />
                        {latestNote && (
                          <div className="flex flex-col items-center mt-0.5 leading-none">
                            <span className="text-[7px] font-black text-primary uppercase">
                              {latestNote.trainerInitials}
                            </span>
                            <span className="text-[6px] text-muted-foreground line-clamp-1 max-w-12.5 font-bold italic">
                              {latestNote.content}
                            </span>
                          </div>
                        )}
                        {sessionNotesList.length > 1 && (
                          <Badge
                            variant="secondary"
                            className="absolute top-1 right-1 h-3 px-1 text-[6px] font-black bg-primary text-slate-900 dark:text-white border-white border shrink-0"
                          >
                            {sessionNotesList.length}
                          </Badge>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="bg-primary/5 sticky right-0 z-10 border-l shadow-[-2px_0_5px_rgba(0,0,0,0.02)]"></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex justify-center p-4">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-8 font-black uppercase text-[11px] tracking-widest border-2 hover:bg-primary/5 hover:text-primary transition-all"
            onClick={() => setHistoryLimit((prev) => prev + 12)}
          >
            Load Older Sessions
          </Button>
        </div>
      </div>

      {currentNotesSession && (
        <SessionNotesSidebar
          session={currentNotesSession}
          userTrainers={trainers}
          onClose={() => setCurrentNotesSession(null)}
          user={user}
        />
      )}

      {/* Summary Legend */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-bg-dark rounded-2xl shrink-0">
        <div className="flex gap-6 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Improvement</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>Unusual Drop</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3 h-3" />
            <span>Trainer Discussion</span>
          </div>
        </div>
        <div className="text-[11px] font-black text-primary animate-pulse">
          TAP NOTES TO DISCUSS PERFORMANCE
        </div>
      </div>
    </motion.div>
  );
}
