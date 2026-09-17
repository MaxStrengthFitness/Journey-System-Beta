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
import { AlertCircle, History, Network, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { auth, db } from "../../firebase";
import type { ExerciseLog, Machine, RepQuality, Trainer } from "../../types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import { deletedSessionRollup } from "../../lib/client-rollups";
import { formatStudioTime } from "../../lib/studio-time";
import { cn } from "../../lib/utils";
import { TrainerAvatar, type TrainerRef } from "../calendar";
import { QualityMark } from "../journey-grid";
import { MachinePicker, analyzeRoutine } from "../routine-builder";
import "../routine-builder/routine-builder.css";
import { DOSE_SCALE, READINESS_KEYS, READINESS_SCALES, REGION_SCALE, dialWord, doseOf, readinessDial, regionDial } from "../rating";
import { OUTCOME_LABEL, SKIP_REASON_LABEL, outcomeOf, skipReasonOf } from "../../lib/set-outcome";
import {
  editStampOf,
  editStampUpdate,
  formatEditStamp,
  machineStatsUpdate,
  machineVoteDelta,
  newSetDoc,
  ownsClientCounters,
  type EditActor,
} from "./session-edits";
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
 *
 * ── HISTORY EDITING (Sep 17 2026) ─────────────────────────────────────────
 * Edit mode could change the numbers on a set that was already there and
 * nothing else. A session that was recorded a machine short stayed a machine
 * short, and a machine logged that the client never touched could not be
 * taken off. Both matter more than they sound: the migration off FileMaker
 * will land sessions that are wrong in exactly those two ways, and a trainer
 * who notices a mistake on Tuesday has nowhere to fix it.
 *
 * So edit mode now also ADDS machines (the Routine Builder's own picker, so
 * "add a machine" looks the same wherever a trainer does it) and REMOVES
 * them, and every save stamps the session with who changed it and when.
 *
 * Three rules hold this together:
 *
 *  1. NOTHING IS WRITTEN UNTIL SAVE. Added and removed machines are drafts on
 *     screen — one batch at the end, so a half-finished edit interrupted by a
 *     client walking in leaves the record exactly as it was.
 *  2. THE CLIENT'S MACHINE COUNTS MOVE WITH THE SETS. `machineStats` is a
 *     running total kept at write time; adding a performed machine to a past
 *     session casts its vote and removing one takes it back
 *     (`machineVoteDelta`). Without that the profile's "performed 14 times"
 *     drifts away from the history behind it, one edit at a time.
 *  3. AN EDITED SESSION SAYS SO. `editedAt` / `editedByName` / `editCount` on
 *     the session document, an "Edited" badge in the header, and the editor's
 *     name under the date. A record nobody can tell has been changed is worse
 *     than one that cannot be changed at all.
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

/**
 * A machine added in edit mode, before Save. It carries the same fields the
 * row editor writes so the draft renders through exactly the same markup as a
 * set that is already in Firestore — one row component, not two.
 */
interface DraftSet {
  key: string;
  machineId: string;
  weight: string;
  reps: string;
  seconds: string;
  isHold: boolean;
  repQuality: RepQuality | null;
}

/** The draft as the row renderer and the vote maths want to see it. */
function draftAsLog(d: DraftSet): ExerciseLog {
  return {
    id: d.key,
    sessionId: "",
    machineId: d.machineId,
    weight: d.weight,
    reps: d.isHold ? "0" : d.reps,
    seconds: d.isHold ? d.seconds : "0",
    isStaticHold: d.isHold,
    isTSC: d.isHold,
    repQuality: d.repQuality ?? undefined,
    outcome: Number(d.isHold ? d.seconds : d.reps) > 0 ? "performed" : "skipped",
  };
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
  /** Named so an edit can be stamped with the editor's own name, not their uid. */
  trainers?: Trainer[];
  /** Stamped onto sets added here, the same way the live flow stamps its own. */
  activeStudioId?: string | null;
  clientHomeStudioId?: string;
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
  trainers = [],
  activeStudioId,
  clientHomeStudioId,
}: SessionDetailDialogProps) {
  const [daySessions, setDaySessions] = useState<HistorySession[]>(initialSessions);
  const [active, setActive] = useState(0);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  /** The sets came from the server, not just the offline cache — required to delete. */
  const [logsConfirmed, setLogsConfirmed] = useState(false);
  const [edited, setEdited] = useState<Record<string, Partial<ExerciseLog>>>({});
  /** Log ids marked for removal on Save. Nothing is deleted before then. */
  const [removed, setRemoved] = useState<string[]>([]);
  /** Machines added in this edit, still unsaved. */
  const [drafts, setDrafts] = useState<DraftSet[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selected = daySessions[active] ?? null;
  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const reportLogs = useRef(onLogsChanged);
  reportLogs.current = onLogsChanged;

  /**
   * Who is making the change. The uid is the Auth uid, never `trainer.id` —
   * the two differ on older accounts, and the uid is what the rules pin to.
   * The name is looked up off it purely so the badge can say "AJ" instead of
   * a 28-character id.
   */
  const actor = useMemo<EditActor>(() => {
    const uid = auth.currentUser?.uid ?? null;
    const me = trainers.find((t) => t.id === uid || t.authUid === uid) ?? null;
    return {
      uid,
      name: me?.fullName || auth.currentUser?.displayName || null,
      initials: me?.initials || null,
    };
  }, [trainers]);

  const resetEdits = () => {
    setEdited({});
    setRemoved([]);
    setDrafts([]);
    setPickerOpen(false);
  };

  useEffect(() => {
    setEdited({});
    setRemoved([]);
    setDrafts([]);
    setPickerOpen(false);
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

  /**
   * ONE list for the body: saved sets with their pending edits, then the
   * machines added in this edit. `gone` is drawn struck through rather than
   * hidden, so a mis-tap is visible and undoable instead of silent.
   */
  interface Row {
    key: string;
    log: ExerciseLog;
    isDraft: boolean;
    gone: boolean;
  }

  const rows = useMemo<Row[]>(() => {
    const saved: Row[] = logs.map((log) => ({
      key: log.id!,
      log: { ...log, ...edited[log.id!] },
      isDraft: false,
      gone: removed.includes(log.id!),
    }));
    const added: Row[] = drafts.map((d) => ({ key: d.key, log: draftAsLog(d), isDraft: true, gone: false }));
    return [...saved, ...added];
  }, [logs, edited, removed, drafts]);

  /** What the session will look like once saved — the strip counts this, not what is on disk. */
  const keptLogs = useMemo(() => rows.filter((r) => !r.gone).map((r) => r.log), [rows]);
  const summary = useMemo(() => summarizeSession(keptLogs), [keptLogs]);

  const dirty = Object.keys(edited).length > 0 || removed.length > 0 || drafts.length > 0;

  /* ── Editing ─────────────────────────────────────────────────────────── */

  const editLog = (logId: string, field: keyof ExerciseLog, value: unknown) =>
    setEdited((prev) => ({ ...prev, [logId]: { ...prev[logId], [field]: value } }));

  const editDraft = (key: string, patch: Partial<DraftSet>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  /** One handler for both kinds of row, so the markup below never branches. */
  const editRow = (row: Row, field: keyof ExerciseLog, value: unknown) => {
    if (!row.isDraft) {
      editLog(row.key, field, value);
      return;
    }
    const map: Partial<Record<keyof ExerciseLog, keyof DraftSet>> = {
      weight: "weight",
      reps: "reps",
      seconds: "seconds",
      repQuality: "repQuality",
      isStaticHold: "isHold",
    };
    // isTSC is written alongside isStaticHold by the toggle; the draft keeps
    // one flag and writes both at save time.
    if (field === "isTSC") return;
    const target = map[field];
    if (target) editDraft(row.key, { [target]: value } as Partial<DraftSet>);
  };

  const toggleRemoved = (logId: string) =>
    setRemoved((prev) => (prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]));

  const dropDraft = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const addMachine = (machineId: string) => {
    setDrafts((prev) => [
      ...prev,
      {
        key: `draft-${machineId}-${Date.now()}`,
        machineId,
        weight: "",
        reps: "",
        seconds: "",
        isHold: false,
        repQuality: null,
      },
    ]);
  };

  /** The picker's coverage strip reads the session as it will stand once saved. */
  const pickerIds = useMemo(() => keptLogs.map((l) => l.machineId).filter(Boolean), [keptLogs]);
  const coverage = useMemo(() => analyzeRoutine(pickerIds).byCategory, [pickerIds]);
  const pickerMachines = useMemo(
    () => machines.map((m) => ({ id: m.id, name: m.name || m.fullName || m.id })),
    [machines],
  );

  /* ── Save ────────────────────────────────────────────────────────────── */

  const handleSave = async () => {
    if (!selected) return;
    const notesChanged = notes !== (selected.notes || "");
    if (!dirty && !notesChanged) {
      setIsEditMode(false);
      return;
    }
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const sessionId = selected.id!;

      // 1. Numbers changed on sets that stay. A set marked for removal is
      //    deleted below, so writing its edit first would be a wasted write
      //    against a document that is about to be gone.
      Object.entries(edited).forEach(([logId, data]) => {
        if (removed.includes(logId)) return;
        batch.update(doc(db, "exerciseLogs", logId), { ...(data as object), updatedAt: Timestamp.now() });
      });

      // 2. Machines taken off the session.
      removed.forEach((logId) => batch.delete(doc(db, "exerciseLogs", logId)));

      // 3. Machines added to it.
      drafts.forEach((d) => {
        const ref = doc(collection(db, "exerciseLogs"));
        batch.set(ref, {
          ...newSetDoc({
            clientId,
            sessionId,
            machineId: d.machineId,
            weight: d.weight,
            reps: d.reps,
            seconds: d.seconds,
            isHold: d.isHold,
            repQuality: d.repQuality,
            studioId: activeStudioId || clientHomeStudioId || "",
            homeStudioId: clientHomeStudioId || activeStudioId || "",
            clientHomeStudioId: clientHomeStudioId || activeStudioId || "",
          }),
          // A Timestamp like every other writer of exerciseLogs — a string
          // here falls outside every createdAt range query.
          createdAt: serverTimestamp(),
        });
      });

      // 4. The session says it was edited, and by whom.
      const sessionUpdate: Record<string, unknown> = {
        ...(notesChanged ? { notes } : {}),
        ...editStampUpdate(actor, { increment, serverTimestamp }),
        updatedAt: Timestamp.now(),
      };
      // The recorded sequence is what HAPPENED, so it follows the sets. Only
      // rewritten on a session that already keeps one — never invented for an
      // imported session that never had the field.
      if (Array.isArray(selected.sessionMachineIds) && (removed.length > 0 || drafts.length > 0)) {
        sessionUpdate.sessionMachineIds = Array.from(
          new Set(keptLogs.map((l) => l.machineId).filter(Boolean)),
        );
      }
      batch.update(doc(db, "sessions", sessionId), sessionUpdate);

      // 5. The client's machine counts move with the sets — but only for a
      //    session that ever cast those votes. An old backfill never did.
      if (clientId && ownsClientCounters(selected)) {
        const stats = machineStatsUpdate(machineVoteDelta(logs, keptLogs), { increment, serverTimestamp });
        if (Object.keys(stats).length > 0) batch.update(doc(db, "clients", clientId), stats);
      }

      await batch.commit();
      resetEdits();
      setIsEditMode(false);
      if (notesChanged) {
        setDaySessions((prev) => prev.map((s, i) => (i === active ? { ...s, notes } : s)));
      }
      // Keep the header honest without waiting for the listener: the badge is
      // the whole point of the stamp.
      setDaySessions((prev) =>
        prev.map((s, i) =>
          i === active
            ? {
                ...s,
                editedAt: new Date().toISOString(),
                editedByName: actor.name,
                editedByInitials: actor.initials,
                editCount: (Number(s.editCount) || 0) + 1,
              }
            : s,
        ),
      );
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
      // A backfill written before Sep 17 2026 took NONE of those, so deleting
      // one must not give anything back — the old code did, and every deleted
      // backfill pulled the client's counters one lower than the truth. A
      // backfill written since then did count, and says so on itself.
      if (clientId && ownsClientCounters(selected)) {
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
  const stamp = editStampOf(selected);
  const stampLine = formatEditStamp(stamp, timeZone);
  // Reporting round (Sep 2026): the Dial's words, with the legacy words behind them.
  const dose = doseOf(selected);
  const readinessRows = checkIn
    ? READINESS_KEYS.map((k) => ({ key: k, value: readinessDial(checkIn, k) })).filter((r) => r.value !== null)
    : [];
  const feel = dose !== null || readinessRows.length > 0 || checkIn?.mood || checkIn?.hydration || checkIn?.note || (checkIn?.bodyStates?.length ?? 0) > 0;

  return (
    <>
      <Dialog open={daySessions.length > 0} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="hsd max-w-[calc(100%-2rem)] sm:max-w-[min(56rem,calc(100%-2rem))] max-h-[94dvh] w-full p-0 gap-0 overflow-hidden flex flex-col rounded-2xl">
          {selected && (
            <>
              <header className="hsd-head">
                <div className="hsd-head__title">
                  <DialogTitle className="hsd-head__day">
                    {title.day}
                    {stamp && (
                      <span className="hsd-edited" title={stampLine}>
                        <History size={11} aria-hidden /> Edited
                      </span>
                    )}
                  </DialogTitle>
                  <DialogDescription className="hsd-head__sub">
                    {title.time ?? (isLegacySession(selected) ? "Imported" : isBackfilledSession(selected) ? "Logged later" : "No start time")}
                    {selected.isCrossTrain ? " · Cross-train" : ""}
                    {selected.status !== "Completed" ? " · Not closed out" : ""}
                    {stampLine ? ` · ${stampLine}` : ""}
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
                {isEditMode && (
                  <div className="hsd-add">
                    <button
                      type="button"
                      className="hsd-add__btn"
                      aria-expanded={pickerOpen}
                      onClick={() => setPickerOpen((o) => !o)}
                    >
                      <Plus size={15} strokeWidth={2.8} aria-hidden />
                      {pickerOpen ? "Done adding" : "Add a machine to this session"}
                    </button>
                    {(removed.length > 0 || drafts.length > 0) && (
                      <span className="hsd-add__count">
                        {drafts.length > 0 && `+${drafts.length} added`}
                        {drafts.length > 0 && removed.length > 0 && " · "}
                        {removed.length > 0 && `${removed.length} to remove`}
                        {" · unsaved"}
                      </span>
                    )}
                    {pickerOpen && (
                      <div className="hsd-add__picker">
                        <MachinePicker
                          machines={pickerMachines}
                          selectedIds={pickerIds}
                          coverage={coverage}
                          onAdd={addMachine}
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )}

                {!logsLoaded ? (
                  <p className="hsd-empty">Loading sets…</p>
                ) : rows.length === 0 ? (
                  <p className="hsd-empty">
                    No sets were recorded for this session.
                    {isEditMode ? "" : " Tap Edit to add the machines that were done."}
                  </p>
                ) : (
                  <div className="hsd-sets">
                    {rows.map((row) => {
                      const log = row.log;
                      const machine = machineById.get(log.machineId);
                      const isCardio = Boolean(machine?.name?.toLowerCase().includes("cardio"));
                      const isHold = Boolean(log.isStaticHold || log.isTSC);
                      const timed = isCardio || isHold;
                      const performed = isPerformed(log);
                      const outcome = outcomeOf(log);
                      const skipReason = skipReasonOf(log);
                      const q = performed ? qualityOf(log) : null;
                      const ui = q ? QUALITY_UI[q] : null;
                      const w = toNum(log.weight);
                      const r = toNum(timed ? log.seconds : log.reps);
                      return (
                        <div
                          key={row.key}
                          className={cn(
                            "hsd-set hist-set",
                            ui ? `hist-set--${ui.key}` : "hist-set--none",
                            !row.isDraft && edited[row.key] && !row.gone && "hsd-set--edited",
                            row.isDraft && "hsd-set--new",
                            row.gone && "hsd-set--gone",
                          )}
                        >
                          <div className="hsd-set__head">
                            <span className="hsd-set__name">{machine?.name || "Unknown machine"}</span>
                            {row.isDraft && <span className="hsd-set__tag hsd-set__tag--new">New</span>}
                            {log.side && <span className="hsd-set__tag">{log.side[0]}</span>}
                            {isHold && <span className="hsd-set__tag">TSC</span>}
                            {outcome === "practice" && <span className="hsd-set__tag">{OUTCOME_LABEL.practice}</span>}
                            {q === 3 && <QualityMark quality={3} size={14} className="hist-q-star" />}
                            {q === 1 && <QualityMark quality={1} size={14} className="hist-q-kaizen" />}
                            {isEditMode && (
                              <button
                                type="button"
                                className="hsd-set__drop"
                                onClick={() => (row.isDraft ? dropDraft(row.key) : toggleRemoved(row.key))}
                                aria-label={
                                  row.gone
                                    ? `Keep ${machine?.name || "this machine"} on the session`
                                    : `Remove ${machine?.name || "this machine"} from the session`
                                }
                                title={row.gone ? "Keep this machine" : "Remove this machine"}
                              >
                                {row.gone ? <Undo2 size={14} aria-hidden /> : <Trash2 size={14} aria-hidden />}
                              </button>
                            )}
                          </div>

                          {row.gone ? (
                            <p className="hsd-set__value">
                              <span className="hsd-set__muted">Removed when you save.</span>
                            </p>
                          ) : !isEditMode ? (
                            <>
                              <p className="hsd-set__value">
                                {performed || outcome === "practice" ? (
                                  <>
                                    <b>{log.weight || "—"}</b> lb · <b>{timed ? log.seconds || "—" : log.reps || "—"}</b> {timed ? "sec" : "reps"}
                                  </>
                                ) : outcome === "not_reached" ? (
                                  <span className="hsd-set__muted">{OUTCOME_LABEL.not_reached}</span>
                                ) : skipReason && skipReason !== "unknown" ? (
                                  <span className="hsd-set__muted">
                                    {OUTCOME_LABEL.skipped} — {SKIP_REASON_LABEL[skipReason]}
                                    {log.skipNote ? `: ${log.skipNote}` : ""}
                                  </span>
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
                                    editRow(row, "isStaticHold", nextHold);
                                    editRow(row, "isTSC", nextHold);
                                    if (nextHold) {
                                      editRow(row, "seconds", log.reps || "0");
                                      editRow(row, "reps", "0");
                                    } else {
                                      editRow(row, "reps", log.seconds || "0");
                                      editRow(row, "seconds", "0");
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
                                onChange={(v) => editRow(row, "weight", String(v))}
                              />
                              <Stepper
                                value={r}
                                unit={timed ? "sec" : "reps"}
                                step={1}
                                onChange={(v) => editRow(row, timed ? "seconds" : "reps", String(v))}
                              />
                              <div className="hsd-qbtns" role="group" aria-label="Rep quality">
                                {([1, 2, 3] as RepQuality[]).map((val) => (
                                  <button
                                    key={val}
                                    type="button"
                                    aria-pressed={q === val}
                                    className={`hsd-qbtn hist-q-btn hist-q-btn--${QUALITY_UI[val].key}`}
                                    // Tapping the quality already set clears it: on a
                                    // session being reconstructed weeks later, "I do
                                    // not remember" is a real answer and an invented
                                    // rep quality is a wrong one.
                                    onClick={() => editRow(row, "repQuality", q === val ? null : val)}
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
                    <h4 className="hsd-panel__title">On the way in &amp; how it landed</h4>
                    {feel ? (
                      <dl className="hsd-facts">
                        {readinessRows.map((r) => (
                          <Fact
                            key={r.key}
                            label={READINESS_SCALES[r.key].ask.replace(/\?$/, "")}
                            value={dialWord(READINESS_SCALES[r.key], r.value)}
                          />
                        ))}
                        {checkIn?.mood && <Fact label="Mood" value={checkIn.mood} />}
                        {checkIn?.hydration && <Fact label="Hydration" value={checkIn.hydration} />}
                        {checkIn?.bodyStates && checkIn.bodyStates.length > 0 && (
                          <Fact
                            label="Body"
                            value={checkIn.bodyStates
                              .map((b) => `${b.region} · ${dialWord(REGION_SCALE, regionDial(b))}${b.until ? ` (until ${b.until})` : ""}`)
                              .join(", ")}
                          />
                        )}
                        {dose !== null && <Fact label="How it landed" value={dialWord(DOSE_SCALE, dose)} />}
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
                  <span className="hsd-foot__note">
                    {dirty ? "Saving stamps this session as edited." : ""}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      resetEdits();
                      setNotes(selected.notes || "");
                      setIsEditMode(false);
                    }}
                    className="hsd-cancel"
                  >
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
              {ownsClientCounters(selected) ? ", and takes it off the client's session count" : ""}
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
