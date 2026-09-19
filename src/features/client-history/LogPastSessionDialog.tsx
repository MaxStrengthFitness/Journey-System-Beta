import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { ArrowLeft, ArrowRight, CalendarPlus, Check, ListPlus, PlusCircle } from "lucide-react";
import { db } from "../../firebase";
import type { Client, Machine, RepQuality, Routine, Trainer, WorkoutSession } from "../../types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import { completedSessionRollup } from "../../lib/client-rollups";
import { cn } from "../../lib/utils";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { CoverageStrip, MachinePicker, SequenceMachineRow, analyzeRoutine } from "../routine-builder";
import "../routine-builder/routine-builder.css";
import { EARLIEST_PLACEABLE_DAY, todayKey } from "./model";
import { newSetDoc } from "./session-edits";
import { BACKFILL_NOTE } from "./HistoryList";

/**
 * LOG A PAST SESSION — the manual entry form.
 *
 * Round: history editing + past-session entry, Sep 17 2026. Replaces the
 * two-field version of this dialog (a date and a trainer, then a session
 * "backbone" seeded with empty sets for the client's five most recent
 * machines, to be filled in afterwards from the session pop-up).
 *
 * ── Why it was rebuilt ────────────────────────────────────────────────────
 * That flow asked the trainer to do the work twice: create a stub here, find
 * it on the calendar, open it, discover it had guessed the wrong five
 * machines, fix them one at a time. It was tolerable as a rare correction. It
 * is not tolerable as the tool that repairs whatever the FileMaker migration
 * gets wrong, which is what AJ now needs it to be.
 *
 * ── The shape, and why it is the Routine Builder's ────────────────────────
 * Three panes: WHEN (date and trainer) · MACHINES (inject a routine whole, or
 * pick machines one at a time) · NUMBERS (weight, reps and — if it is
 * remembered — quality).
 *
 * The middle pane IS the Routine Builder's furniture: its machine picker
 * grouped by Academy category, its coverage strip, its sortable row. Not for
 * consistency's sake alone — a trainer reconstructing a session from memory is
 * doing the same thing they do when they build a routine (remembering a
 * sequence of machines), so the screen that helps them do it well already
 * exists. Category coverage is genuinely useful here too: "no upper-body
 * push" is a good prompt that a machine has been forgotten.
 *
 * ── Three decisions worth knowing ─────────────────────────────────────────
 *  1. QUALITY IS OPTIONAL AND STAYS EMPTY. A rep quality invented three weeks
 *     later is a wrong number in the one place this app is strictest about
 *     them — the kaizen mark drives the clinical review. Unset is the default
 *     and tapping the selected button clears it again.
 *  2. A MACHINE WITH NO REPS IS NOT A PERFORMED SET. It is written as a
 *     skipped machine (`newSetDoc` decides this in one place). The footer
 *     says how many, before Save, so nothing is a surprise.
 *  3. THIS SESSION COUNTS. AJ's call, Sep 17 2026: a manually entered session
 *     increments sessionCount, completedSessions, the trainer tally and the
 *     machine stats exactly like a live one, and says so on the document
 *     (`countsTowardTotals`) so deleting it can take the counters back. Every
 *     backfill written BEFORE this round counted for nothing and carries no
 *     flag — `ownsClientCounters` is the one place that tells them apart.
 */

type Pane = "when" | "machines" | "numbers";

const PANES: { key: Pane; label: string }[] = [
  { key: "when", label: "When" },
  { key: "machines", label: "Machines" },
  { key: "numbers", label: "Numbers" },
];

interface Entry {
  machineId: string;
  weight: string;
  reps: string;
  seconds: string;
  isHold: boolean;
  quality: RepQuality | null;
}

const blankEntry = (machineId: string): Entry => ({
  machineId,
  weight: "",
  reps: "",
  seconds: "",
  isHold: false,
  quality: null,
});

/** A set counts when something was lifted or held — the same test set-outcome.ts applies. */
const hasNumbers = (e: Entry): boolean => Number(e.isHold ? e.seconds : e.reps) > 0;

export interface LogPastSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** For the rollup's projection of the trainer tally and machine stats. */
  client?: Client | null;
  clientHomeStudioId?: string;
  machines: Machine[];
  trainers: Trainer[];
  /** The client's routines — a whole one can be injected in a tap. */
  routines?: Routine[];
  timeZone?: string;
}

export function LogPastSessionDialog({
  open,
  onOpenChange,
  clientId,
  client,
  clientHomeStudioId,
  machines,
  trainers,
  routines = [],
  timeZone,
}: LogPastSessionDialogProps) {
  const { activeStudioId } = useActiveStudio();
  const [pane, setPane] = useState<Pane>("when");
  const [date, setDate] = useState(() => todayKey(new Date(), timeZone));
  const [trainerId, setTrainerId] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /* A fresh form every time it opens. Reusing the last one silently is how a
     session gets logged onto the wrong day. */
  useEffect(() => {
    if (!open) return;
    setPane("when");
    setDate(todayKey(new Date(), timeZone));
    setTrainerId("");
    setEntries([]);
    setRoutineId(null);
  }, [open, timeZone]);

  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const machineName = (id: string) => machineById.get(id)?.name || machineById.get(id)?.fullName || id;

  const ids = useMemo(() => entries.map((e) => e.machineId), [entries]);
  const coverage = useMemo(() => analyzeRoutine(ids).byCategory, [ids]);
  const pickerMachines = useMemo(
    () => machines.map((m) => ({ id: m.id, name: m.name || m.fullName || m.id })),
    [machines],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const addMachine = (machineId: string) =>
    setEntries((prev) => (prev.some((e) => e.machineId === machineId) ? prev : [...prev, blankEntry(machineId)]));

  const removeMachine = (machineId: string) =>
    setEntries((prev) => prev.filter((e) => e.machineId !== machineId));

  const patchEntry = (machineId: string, patch: Partial<Entry>) =>
    setEntries((prev) => prev.map((e) => (e.machineId === machineId ? { ...e, ...patch } : e)));

  /**
   * Inject a routine whole. Machines already on the list are left where they
   * are rather than moved to the routine's order — a trainer who has already
   * put three machines in the order they remember should not have that order
   * rearranged by adding the rest.
   */
  const injectRoutine = (routine: Routine) => {
    setRoutineId(routine.id ?? null);
    setEntries((prev) => {
      const have = new Set(prev.map((e) => e.machineId));
      const additions = (routine.machineIds || [])
        .filter((id) => id && !have.has(id))
        .map(blankEntry);
      return [...prev, ...additions];
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setEntries((prev) => {
      const from = prev.findIndex((e) => e.machineId === active.id);
      const to = prev.findIndex((e) => e.machineId === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  };

  const performed = entries.filter(hasNumbers);
  const datePlaceable = isPlaceable(date, timeZone);
  const canLeaveWhen = Boolean(trainerId) && datePlaceable;
  const canSave = canLeaveWhen && entries.length > 0 && !isSaving;

  /* ── Save ──────────────────────────────────────────────────────────────── */

  const save = async () => {
    setIsSaving(true);
    try {
      const latest = await getDocs(
        query(collection(db, "sessions"), where("clientId", "==", clientId), orderBy("date", "desc"), limit(1)),
      );
      const sessionNumber = latest.empty ? 1 : (latest.docs[0].data().sessionNumber || 0) + 1;
      const trainer = trainers.find((t) => t.id === trainerId);
      const routine = routines.find((r) => r.id === routineId) ?? null;

      const session: WorkoutSession = {
        clientId,
        date,
        hostedAtStudioId: activeStudioId || "unknown",
        clientHomeStudioId: clientHomeStudioId || activeStudioId || "unknown",
        isCrossTrain: Boolean(clientHomeStudioId && activeStudioId && clientHomeStudioId !== activeStudioId),
        sessionType: "Standard",
        // 12:00 UTC is the mark History reads as "logged later" — a placeholder,
        // never shown as a time anyone trained (isBackfilledSession).
        startTime: `${date}T12:00:00.000Z`,
        endTime: `${date}T12:30:00.000Z`,
        trainerId: trainer?.id,
        trainerInitials: trainer?.initials || "TR",
        status: "Completed",
        sessionNumber,
        notes: BACKFILL_NOTE,
        sessionMachineIds: entries.map((e) => e.machineId),
        // The flag that lets a later delete take the counters back. Without it
        // this session would look like every backfill written before Sep 17
        // 2026 — which counted for nothing.
        countsTowardTotals: true,
        // A Timestamp like every other writer of sessions (fix pile, Sep
        // 2026): as an ISO string this session fell outside every createdAt
        // range query — Insights, Hours, the Monday page — for good.
        createdAt: serverTimestamp(),
      };
      if (routine) {
        session.routineId = routine.id;
        session.routineName = routine.name;
      }
      const ref = await addDoc(collection(db, "sessions"), session);

      const batch = writeBatch(db);
      const written = entries.map((e) =>
        newSetDoc({
          clientId,
          sessionId: ref.id,
          machineId: e.machineId,
          weight: e.weight,
          reps: e.reps,
          seconds: e.seconds,
          isHold: e.isHold,
          repQuality: e.quality,
          studioId: activeStudioId || clientHomeStudioId || "",
          homeStudioId: clientHomeStudioId || activeStudioId || "",
          clientHomeStudioId: clientHomeStudioId || activeStudioId || "",
        }),
      );
      written.forEach((set) => {
        batch.set(doc(collection(db, "exerciseLogs")), {
          ...set,
          // A Timestamp like every other writer of exerciseLogs — a string here
          // fell outside every createdAt range query (cost round, Sep 2026).
          createdAt: serverTimestamp(),
        });
      });

      // The counters, exactly as finishing a live session keeps them. Only
      // performed sets vote, and only one vote per machine — that arithmetic
      // lives in client-rollups.ts and is not repeated here.
      batch.update(doc(db, "clients", clientId), {
        completedSessions: increment(1),
        sessionCount: increment(1),
        ...completedSessionRollup(client, session, written, trainers, { increment, serverTimestamp }),
      });

      await batch.commit();
      onOpenChange(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "sessions");
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Panes ─────────────────────────────────────────────────────────────── */

  const paneIndex = PANES.findIndex((p) => p.key === pane);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hsd lps max-w-[calc(100%-2rem)] sm:max-w-[min(52rem,calc(100%-2rem))] max-h-[94dvh] w-full p-0 gap-0 overflow-hidden flex flex-col rounded-2xl">
        <DialogHeader className="lps-head">
          <DialogTitle className="hsd-head__day flex items-center gap-2">
            <CalendarPlus className="w-5 h-5" style={{ color: "var(--cal-live-text)" }} aria-hidden />
            Log past session
          </DialogTitle>
          <DialogDescription className="hsd-head__sub">
            Records a session that already happened. It counts toward this client's totals.
          </DialogDescription>
          <nav className="lps-steps" aria-label="Steps">
            {PANES.map((p, i) => (
              <button
                key={p.key}
                type="button"
                className={cn("lps-step", i === paneIndex && "lps-step--on", i < paneIndex && "lps-step--done")}
                aria-current={i === paneIndex ? "step" : undefined}
                // Forward only once the step before it is answered: a date and
                // a trainer are what everything after them is filed under.
                disabled={i > 0 && !canLeaveWhen}
                onClick={() => setPane(p.key)}
              >
                <span className="lps-step__n">{i < paneIndex ? <Check size={12} aria-hidden /> : i + 1}</span>
                {p.label}
              </button>
            ))}
          </nav>
        </DialogHeader>

        <div className="lps-body">
          {pane === "when" && (
            <div className="lps-when">
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
                {!datePlaceable && (
                  <span className="lps-warn">Pick a real day, today or earlier.</span>
                )}
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
          )}

          {pane === "machines" && (
            <div className="lps-machines">
              <div className="lps-inject">
                <span className="hsd-panel__title">Start from</span>
                <div className="lps-inject__row">
                  {routines.length === 0 && (
                    <span className="hsd-set__muted">No routines saved for this client — pick machines below.</span>
                  )}
                  {routines.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="lps-chip"
                      onClick={() => injectRoutine(r)}
                      title={`Add all ${(r.machineIds || []).length} machines from ${r.name}`}
                    >
                      <ListPlus size={14} aria-hidden />
                      {r.name}
                      <b>{(r.machineIds || []).length}</b>
                    </button>
                  ))}
                </div>
              </div>

              <div className="lps-cov">
                <CoverageStrip coverage={coverage} />
              </div>

              <div className="lps-split">
                <div className="lps-seq">
                  {entries.length === 0 ? (
                    <p className="hsd-empty">
                      Nothing yet. Add a routine above, or tap machines on the right.
                    </p>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                        <div className="rb-seq">
                          {entries.map((e, i) => (
                            <SequenceMachineRow
                              key={e.machineId}
                              id={e.machineId}
                              position={i + 1}
                              name={machineName(e.machineId)}
                              dense
                              onRemove={() => removeMachine(e.machineId)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
                <div className="lps-pick">
                  <MachinePicker
                    machines={pickerMachines}
                    selectedIds={ids}
                    coverage={coverage}
                    onAdd={addMachine}
                    onRemove={removeMachine}
                  />
                </div>
              </div>
            </div>
          )}

          {pane === "numbers" && (
            <div className="lps-numbers">
              {entries.length === 0 ? (
                <p className="hsd-empty">Go back a step and add the machines that were done.</p>
              ) : (
                entries.map((e, i) => {
                  const timed = e.isHold;
                  return (
                    <div key={e.machineId} className={cn("lps-card", !hasNumbers(e) && "lps-card--blank")}>
                      <div className="lps-card__head">
                        <span className="rb-row__pos" aria-hidden>
                          {i + 1}
                        </span>
                        <span className="hsd-set__name">{machineName(e.machineId)}</span>
                        <button
                          type="button"
                          className="hsd-toggle"
                          aria-pressed={e.isHold}
                          onClick={() => patchEntry(e.machineId, { isHold: !e.isHold })}
                          title="Timed static contraction"
                        >
                          TSC
                        </button>
                      </div>
                      <div className="lps-card__row">
                        <NumberField
                          label="lb"
                          value={e.weight}
                          step={2}
                          onChange={(v) => patchEntry(e.machineId, { weight: v })}
                        />
                        <NumberField
                          label={timed ? "sec" : "reps"}
                          value={timed ? e.seconds : e.reps}
                          step={1}
                          onChange={(v) => patchEntry(e.machineId, timed ? { seconds: v } : { reps: v })}
                        />
                        <div className="hsd-qbtns" role="group" aria-label={`Rep quality for ${machineName(e.machineId)}`}>
                          {([1, 2, 3] as RepQuality[]).map((val) => (
                            <button
                              key={val}
                              type="button"
                              aria-pressed={e.quality === val}
                              className={`hsd-qbtn hist-q-btn hist-q-btn--${val === 3 ? "max" : val === 2 ? "done" : "poor"}`}
                              // Tapping the one that is on clears it. "I don't
                              // remember" is a real answer three weeks later,
                              // and the kaizen mark is not a thing to guess at.
                              onClick={() =>
                                patchEntry(e.machineId, { quality: e.quality === val ? null : val })
                              }
                            >
                              {val === 3 ? "Max" : val === 2 ? "Done" : "Needs work"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {!hasNumbers(e) && (
                        <span className="lps-warn">
                          No {timed ? "seconds" : "reps"} — saved as a machine that was not done.
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <footer className="hsd-foot">
          <span className="hsd-foot__note">
            {pane === "numbers" && entries.length > 0
              ? `${performed.length} of ${entries.length} machine${entries.length === 1 ? "" : "s"} with numbers`
              : pane === "machines" && entries.length > 0
                ? `${entries.length} machine${entries.length === 1 ? "" : "s"}`
                : ""}
          </span>
          {paneIndex > 0 && (
            <Button variant="ghost" onClick={() => setPane(PANES[paneIndex - 1].key)} className="hsd-cancel">
              <ArrowLeft className="w-4 h-4 mr-1" aria-hidden /> Back
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="hsd-cancel">
            Cancel
          </Button>
          {pane === "numbers" ? (
            <Button onClick={save} disabled={!canSave} className="hsd-save">
              {isSaving ? "Saving…" : <><PlusCircle className="w-4 h-4 mr-2" aria-hidden /> Save session</>}
            </Button>
          ) : (
            <Button
              onClick={() => setPane(PANES[paneIndex + 1].key)}
              disabled={pane === "when" ? !canLeaveWhen : entries.length === 0}
              className="hsd-save"
            >
              Next <ArrowRight className="w-4 h-4 ml-2" aria-hidden />
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A number the trainer types or steps. The same control as the session
 * dialog's, kept as a string so an empty field stays empty — a stepper that
 * shows "0" invites a zero being saved as a real set.
 */
function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: string;
  step: number;
  onChange: (value: string) => void;
}) {
  const n = parseFloat(value) || 0;
  return (
    <div className="hsd-stepper">
      <button
        type="button"
        onClick={() => onChange(String(Math.max(0, n - step)))}
        aria-label={`Minus ${step} ${label}`}
      >
        −{step}
      </button>
      <label>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
        />
        <span>{label}</span>
      </label>
      <button type="button" onClick={() => onChange(String(n + step))} aria-label={`Plus ${step} ${label}`}>
        +{step}
      </button>
    </div>
  );
}

/** A real past day: a desktop date input will happily accept "0026-02-03". */
function isPlaceable(date: string, timeZone?: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= EARLIEST_PLACEABLE_DAY && date <= todayKey(new Date(), timeZone);
}
