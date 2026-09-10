import { useEffect, useMemo, useRef, useState } from "react";
import {
  Timestamp,
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { AlertCircle, Network, Pencil, Trash2, X } from "lucide-react";
import { db } from "../../firebase";
import type { ExerciseLog, Machine, RepQuality } from "../../types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import { deletedSessionRollup } from "../../lib/client-rollups";
import { formatStudioTime } from "../../lib/studio-time";
import { cn } from "../../lib/utils";
import { TrainerAvatar, type TrainerRef } from "../calendar";
import { QualityMark } from "../journey-grid";
import {
  isBackfilledSession,
  isLegacySession,
  isPerformed,
  qualityOf,
  routineLetter,
  sessionDayKey,
  sessionStartInstant,
  summarizeSession,
  parseKey,
  monthName,
  weekdayOf,
  type HistorySession,
} from "./model";

/**
 * ONE SESSION, IN FULL — opened from a calendar day or a list row.
 *
 * Moved here from the old ClientHistoryCalendar with its reads and writes
 * unchanged (live sets for the open session, batch edit, delete with the
 * client's counters and Top Trainer tally taken back). What changed:
 *
 *  - Rep quality now uses the Journey grid's colours and marks — green + gold
 *    star for max strength, grey for completed, crimson + kaizen for room to
 *    improve. It still used the retired amber/orange set, so the same set was
 *    two different colours depending on which tab you read it in.
 *  - The "Client Status / Additional Context" box in edit mode is gone. It was
 *    an uncontrolled text area and a priority picker that were never saved:
 *    anything typed there was silently thrown away. In its place, read-only,
 *    the pre-session check-in and post-session feel the session actually
 *    recorded, when it recorded any.
 *  - Sets are read without `orderBy("createdAt")` and sorted here. An ordered
 *    query silently drops any document missing the field.
 *  - The TSC toggle writes `isStaticHold` AND `isTSC`. The live flow writes
 *    both and reads either as "timed"; flipping one left the other stuck.
 *  - Delete waits until the server has confirmed the session's sets. From the
 *    offline cache alone it could miss sets, orphan them, and skip their
 *    machine-count decrements.
 *  - Deleting a "Log past session" backfill no longer decrements the client's
 *    counters — the backfill never incremented them.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const QUALITY_UI: Record<RepQuality, { key: "max" | "done" | "poor"; label: string }> = {
  3: { key: "max", label: "Max strength" },
  2: { key: "done", label: "Completed" },
  1: { key: "poor", label: "Needs improvement" },
};

const toNum = (v: unknown) => parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")) || 0;

function logOrder(log: ExerciseLog): number {
  if (typeof log.suggestedOrder === "number") return log.suggestedOrder;
  const c: any = log.createdAt;
  if (c?.toMillis) return c.toMillis();
  if (typeof c?.seconds === "number") return c.seconds * 1000;
  const t = c ? new Date(c).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

function titleFor(s: HistorySession, tz?: string): { day: string; time: string | null } {
  const key = sessionDayKey(s, tz);
  const day = key
    ? (() => {
        const { year, month, day: d } = parseKey(key);
        return `${WEEKDAYS[weekdayOf(key)]}, ${monthName(month)} ${d}, ${year}`;
      })()
    : "Undated session";
  const instant = isLegacySession(s) || isBackfilledSession(s) ? null : sessionStartInstant(s);
  return { day, time: instant ? formatStudioTime(instant, tz) : null };
}

export interface SessionDetailDialogProps {
  /** The day's sessions, oldest first. The dialog is open while this is non-empty. */
  initialSessions: HistorySession[];
  onClose: () => void;
  clientId: string;
  machines: Machine[];
  trainerFor: (s: HistorySession) => TrainerRef | null;
  /** The routine's name from the session's routineId (the live flow stores only the id). */
  routineNameFor?: (s: HistorySession) => string | null;
  timeZone?: string;
  /** Hands fresh sets back so the list's copy never goes stale after an edit. */
  onLogsChanged?: (sessionId: string, logs: ExerciseLog[]) => void;
}

export function SessionDetailDialog({
  initialSessions,
  onClose,
  clientId,
  machines,
  trainerFor,
  routineNameFor,
  timeZone,
  onLogsChanged,
}: SessionDetailDialogProps) {
  const [daySessions, setDaySessions] = useState<HistorySession[]>(initialSessions);
  const [active, setActive] = useState(0);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  /** The sets came from the server, not just the offline cache — required to delete. */
  const [logsConfirmed, setLogsConfirmed] = useState(false);
  const [edited, setEdited] = useState<Record<string, Partial<ExerciseLog>>>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selected = daySessions[active] ?? null;
  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const reportLogs = useRef(onLogsChanged);
  reportLogs.current = onLogsChanged;

  useEffect(() => {
    setEdited({});
    setIsEditMode(false);
    setLogs([]);
    setLogsLoaded(false);
    setLogsConfirmed(false);
    if (!selected?.id) return;
    setNotes(selected.notes || "");
    const sessionId = selected.id;
    return onSnapshot(
      query(collection(db, "exerciseLogs"), where("sessionId", "==", sessionId)),
      // Metadata changes too, so the server confirming an unchanged cached
      // answer still arrives — that is the moment delete becomes safe.
      { includeMetadataChanges: true },
      (snap) => {
        const next = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ExerciseLog)
          .sort((a, b) => logOrder(a) - logOrder(b));
        setLogs(next);
        setLogsLoaded(true);
        if (!snap.metadata.fromCache) {
          setLogsConfirmed(true);
          reportLogs.current?.(sessionId, next);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, "exerciseLogs"),
    );
  }, [selected?.id]);

  const shown = useMemo(() => logs.map((log) => ({ ...log, ...edited[log.id!] })), [logs, edited]);
  const summary = useMemo(() => summarizeSession(shown), [shown]);

  const editLog = (logId: string, field: keyof ExerciseLog, value: unknown) =>
    setEdited((prev) => ({ ...prev, [logId]: { ...prev[logId], [field]: value } }));

  const handleSave = async () => {
    if (!selected) return;
    const notesChanged = notes !== (selected.notes || "");
    if (Object.keys(edited).length === 0 && !notesChanged) {
      setIsEditMode(false);
      return;
    }
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      Object.entries(edited).forEach(([logId, data]) => {
        batch.update(doc(db, "exerciseLogs", logId), { ...(data as object), updatedAt: Timestamp.now() });
      });
      if (notesChanged) {
        batch.update(doc(db, "sessions", selected.id!), { notes, updatedAt: Timestamp.now() });
      }
      await batch.commit();
      setEdited({});
      setIsEditMode(false);
      if (notesChanged) {
        setDaySessions((prev) => prev.map((s, i) => (i === active ? { ...s, notes } : s)));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "exerciseLogs");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "sessions", selected.id!));
      logs.forEach((log) => batch.delete(doc(db, "exerciseLogs", log.id!)));
      // A completed session took a count, a Top Trainer vote and machine
      // tallies with it when it was saved; deleting it gives them back.
      // A "Log past session" backfill never took any of those (that dialog
      // writes the session and nothing else), so deleting one must not give
      // anything back — the old code did, and every deleted backfill pulled
      // the client's counters one lower than the truth.
      if (selected.status === "Completed" && clientId && !isBackfilledSession(selected)) {
        batch.update(doc(db, "clients", clientId), {
          completedSessions: increment(-1),
          sessionCount: increment(-1),
          ...deletedSessionRollup(selected, logs, { increment, serverTimestamp }),
        });
      }
      await batch.commit();
      setConfirmDelete(false);
      const remaining = daySessions.filter((_, i) => i !== active);
      if (remaining.length === 0) {
        onClose();
      } else {
        setDaySessions(remaining);
        setActive(Math.max(0, active - 1));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "sessions");
    } finally {
      setIsDeleting(false);
    }
  };

  const trainer = selected ? trainerFor(selected) : null;
  const title = selected ? titleFor(selected, timeZone) : { day: "", time: null };
  const routineName = selected ? (routineNameFor ? routineNameFor(selected) : selected.routineName ?? null) : null;
  const letter = routineLetter(routineName);
  const checkIn = selected?.preSessionCheckIn;
  const feel = typeof selected?.clientFeel === "string" ? selected.clientFeel : null;

  return (
    <>
      <Dialog open={daySessions.length > 0} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="hsd max-w-[calc(100%-2rem)] sm:max-w-[min(56rem,calc(100%-2rem))] max-h-[94dvh] w-full p-0 gap-0 overflow-hidden flex flex-col rounded-2xl">
          {selected && (
            <>
              <header className="hsd-head">
                <div className="hsd-head__title">
                  <DialogTitle className="hsd-head__day">{title.day}</DialogTitle>
                  <DialogDescription className="hsd-head__sub">
                    {title.time ?? (isLegacySession(selected) ? "Imported" : isBackfilledSession(selected) ? "Logged later" : "No start time")}
                    {selected.isCrossTrain ? " · Cross-train" : ""}
                    {selected.status !== "Completed" ? " · Not closed out" : ""}
                  </DialogDescription>
                </div>
                <div className="hsd-head__who">
                  <span className={cn("hist-routine", !letter && "hist-routine--none")} title={routineName || "No routine recorded"}>
                    {letter ?? "•"}
                  </span>
                  {trainer ? (
                    <>
                      <TrainerAvatar trainer={trainer} />
                      <span className="hsd-head__name">{trainer.name}</span>
                    </>
                  ) : (
                    <span className="hsd-head__name">{selected.trainerInitials || "Unknown trainer"}</span>
                  )}
                  {selected.isCrossTrain && <Network size={14} aria-hidden style={{ color: "var(--cal-live-text)" }} />}
                </div>
                <div className="hsd-head__actions">
                  {isEditMode ? (
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmDelete(true)}
                      disabled={!logsConfirmed}
                      className="hsd-icon-btn hsd-icon-btn--danger"
                      title={logsConfirmed ? "Delete session" : "Waiting for this session's sets to load"}
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  ) : (
                    <button type="button" className="hist-btn" onClick={() => setIsEditMode(true)}>
                      <Pencil size={14} strokeWidth={2.6} aria-hidden /> Edit
                    </button>
                  )}
                  <Button variant="ghost" onClick={onClose} className="hsd-icon-btn" title="Close">
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </header>

              <div className="hsd-strip">
                <span className="hsd-chip">
                  <b>{summary.machines}</b> machine{summary.machines === 1 ? "" : "s"}
                </span>
                {summary.max > 0 && (
                  <span className="hsd-chip hist-q-label--max">
                    <QualityMark quality={3} size={13} className="hist-q-star" /> <b>{summary.max}</b> max strength
                  </span>
                )}
                {summary.poor > 0 && (
                  <span className="hsd-chip hist-q-label--poor">
                    <QualityMark quality={1} size={13} className="hist-q-kaizen" /> <b>{summary.poor}</b> to work on
                  </span>
                )}
                <span className="hsd-chip hsd-chip--end">
                  Volume <b>{summary.volume.toLocaleString()}</b> lb
                </span>
              </div>

              {daySessions.length > 1 && (
                <div className="hsd-tabs" role="tablist" aria-label="Sessions this day">
                  {daySessions.map((s, i) => (
                    <button
                      key={s.id ?? i}
                      type="button"
                      role="tab"
                      aria-selected={i === active}
                      className="hsd-tab"
                      onClick={() => setActive(i)}
                    >
                      {titleFor(s, timeZone).time ?? `Session ${i + 1}`}
                    </button>
                  ))}
                </div>
              )}

              <div className="hsd-body">
                {!logsLoaded ? (
                  <p className="hsd-empty">Loading sets…</p>
                ) : shown.length === 0 ? (
                  <p className="hsd-empty">No sets were recorded for this session.</p>
                ) : (
                  <div className="hsd-sets">
                    {shown.map((log) => {
                      const machine = machineById.get(log.machineId);
                      const isCardio = Boolean(machine?.name?.toLowerCase().includes("cardio"));
                      const isHold = Boolean(log.isStaticHold || log.isTSC);
                      const timed = isCardio || isHold;
                      const performed = isPerformed(log);
                      const q = performed ? qualityOf(log) : null;
                      const ui = q ? QUALITY_UI[q] : null;
                      const w = toNum(log.weight);
                      const r = toNum(timed ? log.seconds : log.reps);
                      return (
                        <div
                          key={log.id}
                          className={cn(
                            "hsd-set hist-set",
                            ui ? `hist-set--${ui.key}` : "hist-set--none",
                            edited[log.id!] && "hsd-set--edited",
                          )}
                        >
                          <div className="hsd-set__head">
                            <span className="hsd-set__name">{machine?.name || "Unknown machine"}</span>
                            {log.side && <span className="hsd-set__tag">{log.side[0]}</span>}
                            {isHold && <span className="hsd-set__tag">TSC</span>}
                            {q === 3 && <QualityMark quality={3} size={14} className="hist-q-star" />}
                            {q === 1 && <QualityMark quality={1} size={14} className="hist-q-kaizen" />}
                          </div>

                          {!isEditMode ? (
                            <>
                              <p className="hsd-set__value">
                                {performed ? (
                                  <>
                                    <b>{log.weight || "—"}</b> lb · <b>{timed ? log.seconds || "—" : log.reps || "—"}</b> {timed ? "sec" : "reps"}
                                  </>
                                ) : (
                                  <span className="hsd-set__muted">Not recorded</span>
                                )}
                              </p>
                              {ui && <span className={`hsd-set__quality hist-q-label--${ui.key}`}>{ui.label}</span>}
                            </>
                          ) : (
                            <div className="hsd-edit">
                              {!isCardio && (
                                <button
                                  type="button"
                                  className="hsd-toggle"
                                  aria-pressed={isHold}
                                  onClick={() => {
                                    // Both flags, always: the live flow writes
                                    // isStaticHold and isTSC together and reads
                                    // either as "timed". Flipping one left the
                                    // other stuck, so a hold could not be undone.
                                    const nextHold = !isHold;
                                    editLog(log.id!, "isStaticHold", nextHold);
                                    editLog(log.id!, "isTSC", nextHold);
                                    if (nextHold) {
                                      editLog(log.id!, "seconds", log.reps || "0");
                                      editLog(log.id!, "reps", "0");
                                    } else {
                                      editLog(log.id!, "reps", log.seconds || "0");
                                      editLog(log.id!, "seconds", "0");
                                    }
                                  }}
                                >
                                  TSC
                                </button>
                              )}
                              <Stepper
                                value={w}
                                unit="lb"
                                step={2}
                                onChange={(v) => editLog(log.id!, "weight", String(v))}
                              />
                              <Stepper
                                value={r}
                                unit={timed ? "sec" : "reps"}
                                step={1}
                                onChange={(v) => editLog(log.id!, timed ? "seconds" : "reps", String(v))}
                              />
                              <div className="hsd-qbtns" role="group" aria-label="Rep quality">
                                {([1, 2, 3] as RepQuality[]).map((val) => (
                                  <button
                                    key={val}
                                    type="button"
                                    aria-pressed={q === val}
                                    className={`hsd-qbtn hist-q-btn hist-q-btn--${QUALITY_UI[val].key}`}
                                    onClick={() => editLog(log.id!, "repQuality", val)}
                                  >
                                    {val === 3 ? "Max" : val === 2 ? "Done" : "Needs work"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="hsd-notes">
                  <section className="hsd-panel">
                    <h4 className="hsd-panel__title">Session notes</h4>
                    {isEditMode ? (
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="What happened in this session…"
                        className="hsd-textarea"
                      />
                    ) : (
                      <p className="hsd-panel__text">
                        {selected.notes?.trim() || selected.legacy_notes?.trim() || (
                          <span className="hsd-set__muted">No notes on this session.</span>
                        )}
                      </p>
                    )}
                  </section>

                  <section className="hsd-panel">
                    <h4 className="hsd-panel__title">Check-in &amp; feel</h4>
                    {checkIn || feel ? (
                      <dl className="hsd-facts">
                        {checkIn?.sleepQuality && <Fact label="Sleep" value={checkIn.sleepQuality} />}
                        {checkIn?.energyLevel && <Fact label="Energy" value={checkIn.energyLevel} />}
                        {checkIn?.mood && <Fact label="Mood" value={checkIn.mood} />}
                        {checkIn?.stressLevel && <Fact label="Stress" value={`${checkIn.stressLevel} / 5`} />}
                        {checkIn?.hydration && <Fact label="Hydration" value={checkIn.hydration} />}
                        {checkIn?.bodyStates && checkIn.bodyStates.length > 0 && (
                          <Fact
                            label="Body"
                            value={checkIn.bodyStates.map((b) => `${b.region} ${b.state}`).join(", ")}
                          />
                        )}
                        {feel && <Fact label="Felt after" value={feel} />}
                        {checkIn?.note && <Fact label="Note" value={checkIn.note} />}
                      </dl>
                    ) : (
                      <p className="hsd-panel__text">
                        <span className="hsd-set__muted">Nothing was captured before or after this session.</span>
                      </p>
                    )}
                  </section>
                </div>
              </div>

              {isEditMode && (
                <footer className="hsd-foot">
                  <Button variant="ghost" onClick={() => { setEdited({}); setNotes(selected.notes || ""); setIsEditMode(false); }} className="hsd-cancel">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving} className="hsd-save">
                    {isSaving ? "Saving…" : "Save changes"}
                  </Button>
                </footer>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-500" />
              Delete session?
            </DialogTitle>
            <DialogDescription className="font-medium">
              This permanently deletes the session and its {logs.length} set{logs.length === 1 ? "" : "s"}
              {selected?.status === "Completed" && !isBackfilledSession(selected)
                ? ", and takes it off the client's session count"
                : ""}
              . It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} className="uppercase font-black tracking-widest text-xs h-12 rounded-xl px-6">
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white uppercase font-black tracking-widest text-xs h-12 rounded-xl px-6"
            >
              {isDeleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="hsd-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Stepper({
  value,
  unit,
  step,
  onChange,
}: {
  value: number;
  unit: string;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="hsd-stepper">
      <button type="button" onClick={() => onChange(Math.max(0, value - step))} aria-label={`Minus ${step} ${unit}`}>
        −{step}
      </button>
      <label>
        <input
          type="number"
          inputMode="decimal"
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        <span>{unit}</span>
      </label>
      <button type="button" onClick={() => onChange(value + step)} aria-label={`Plus ${step} ${unit}`}>
        +{step}
      </button>
    </div>
  );
}
