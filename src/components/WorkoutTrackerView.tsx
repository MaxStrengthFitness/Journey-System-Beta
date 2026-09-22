import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Users,
  AlertCircle,
  Trash2,
  Sparkles,
  MessageSquare,
  ChevronLeft,
  Settings2,
  PlusCircle,
  Loader2,
  HeartPulse,
  X,
  ShieldAlert,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  writeBatch,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  where,
  setDoc,
  getDocs,
  getDoc,
  limit,
  Timestamp,
  deleteField,
} from "firebase/firestore";
import { User as FirebaseUser } from "firebase/auth";

import { db } from "../firebase";
import {
  Client,
  Machine,
  Trainer,
  View,
  WorkoutSession,
  ExerciseLog,
  ClientMachineSetting,
  SessionType,
  Routine,
  PreSessionCheckIn,
} from "../types";
import { handleFirestoreError, OperationType } from "../lib/firestore-errors";
import { logDocId } from "../lib/exercise-log-id";

/**
 * How long a set's Firestore write waits for the trainer to stop typing.
 *
 * The rep and weight fields in the Now bar are controlled inputs that call
 * through on every keystroke, and every set now writes to ONE derived document
 * id -- so an undebounced write-per-change puts "12" into reps as two writes to
 * the same document milliseconds apart, against Firestore's ~1 sustained
 * write/sec/document ceiling. Coalescing per document keeps the guarantee that
 * matters (the set is in the database within a second of being entered) without
 * hammering a single row.
 */
/** What the post-session screen reads, captured once at End Session. */
interface PostSessionSnapshot {
  session: WorkoutSession;
  client: Client;
  logs: ExerciseLog[];
  lines: TodayLine[];
  journey: JourneyRead;
  /** A mid-session note the trainer started and never saved (fluidity round). */
  draft: SessionNoteDraft | null;
}

const LOG_WRITE_DEBOUNCE_MS = 600;
/** ...but a trainer who keeps typing must not outrun the flush indefinitely. */
const LOG_WRITE_MAX_WAIT_MS = 2500;
/** The soft-lock heartbeat is a liveness signal; per-keystroke is pointless. */
const HEARTBEAT_MIN_INTERVAL_MS = 30_000;
import {
  parseSessionDate,
  orderMachineSettings,
} from "../lib/utils";
import { toFloorMachines, isPerSideMachine } from "../lib/floor-machines";
import { completeWorkoutSession } from "../lib/sync-utils";
import { getLatestTargetWeight } from "../lib/historical-utils";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

import { useActiveStudio } from "../contexts/ActiveStudioContext";
import { SetupPromptDialog } from "../features/equipment";
import { useStudioMachines } from "../hooks/useStudioMachines";
import { resolveMachineOrder } from "../data/machine-display-order";
import {
  JourneyGrid,
  QualityLegend,
  SessionNowBar,
  toIsoDate,
  toJourneyRows,
  toJourneySessions,
  type GridSection,
  type LiveColumn,
  type LiveSet,
} from "../features/journey-grid";
import { isBig5Machine } from "../lib/utils";
import type { DialValue, RepQuality } from "../types";
import type { JournalImportance } from "../types/journal";
import { useToast } from "../contexts/ToastContext";
import {
  hasRequiredCount,
  findIncompleteLogs,
} from "../lib/log-validation";
import { outcomeAtFinish, unreachedMachineIds, OUTCOME_LABEL } from "../lib/set-outcome";
import { coverageOfClient } from "../lib/client-coverage";
import { sessionTimingFields, toEpochMs } from "../lib/session-timing";
import { forgetLiveSession, peekLiveSessionId, rememberLiveSession } from "../lib/live-session";
import { trackerScreen } from "../lib/tracker-screen";
import {
  createMachineClocks,
  focusMachine,
  machineTimeFields,
  resetMachine,
  secondsOn,
  setPaused,
  type MachineClocks,
} from "../lib/machine-clock";
import { RoutineOrderSheet } from "../features/journey-grid/RoutineOrderSheet";
import { computeRowStats, orderedSets } from "../features/journey-grid/stats";
import {
  strengthJourney,
  todayLines,
  type JourneyRead,
  type PriorSet,
  type TodayLine,
} from "../lib/post-session";
import { NOW_BAR_SIDE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { traineeLevelOf } from "../lib/progression-cue";
import { createJournalEntry, useClientJournal } from "../hooks/useClientJournal";
import { flagLineOf, machineFlags, sessionFlags } from "../features/journey-grid/session-flags";
import { SessionFlagsSheet } from "../features/journey-grid/SessionFlagsSheet";
import { formatStudioDate } from "../lib/studio-time";
import { NOTE_CATEGORY_META } from "../features/client-notes/note-catalog";
import {
  clearSessionDraft,
  hasDraftText,
  readSessionDraft,
  writeSessionDraft,
  type SessionNoteDraft,
} from "../features/client-notes/session-draft";
import { ActiveSessionTimer } from "./ActiveSessionTimer";
import { MachineSheet } from "../features/equipment/MachineSheet";
/* Lazy, and the reason is measurable: the assessment panel is a 162 kB
   chunk (50 kB gzipped) that most sessions never open. A static import
   would put it on the critical path of the one screen a trainer opens
   forty times a day, to pay for a panel they open once a quarter. */
const ClientCheckInPanel = React.lazy(() =>
  import("./journal/ClientCheckInPanel").then((m) => ({ default: m.ClientCheckInPanel })),
);
import { SessionJournalSidebar } from "./journal/SessionJournalSidebar";
import { BriefingScreen } from "../features/briefing";
import { VictoryHUDScreen } from "./VictoryHUDScreen";
import { ConsultationSetupWizard } from "./ConsultationSetupWizard";
import { studioTodayKey } from "../lib/studio-time";

import { clientDisplayName, clientFirstName } from "../lib/client-name";
import { PerformanceEntryDialog } from "../features/tracker/PerformanceEntryDialog";
import { ExerciseHistoryDialog } from "../features/tracker/ExerciseHistoryDialog";
import { ClientSelectionDialog } from "../features/tracker/ClientSelectionDialog";
type RoutineType = "A" | "B" | "Free";

/** How long a locally-created session is protected from being cleared by a
 *  snapshot that has not caught up with the write yet. */
const JUST_STARTED_GRACE_MS = 15000;

/** Milliseconds from a Firestore Timestamp, Date, or ISO string; null if absent. */
function toMillisOrNull(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const ms = new Date(value).getTime();
  return isNaN(ms) ? null : ms;
}

export function WorkoutTrackerView({
  clientId,
  clients,
  machines,
  trainers,
  user,
  setView,
  setSelectedClientId,
  showClientPicker,
  setShowClientPicker,
  onStartNewClientOnboarding,
  authTrainer,
  isSyncing,
  setIsSyncing,
  schedules,
  isIntroSession,
  rightControls,
  trainerDropdown,
  onStudioClick,
}: {
  clientId: string | null;
  clients: Client[];
  machines: Machine[];
  schedules: any[];
  trainers: Trainer[];
  user: FirebaseUser;
  setView: (v: View, data?: { isIntroSession?: boolean }) => void;
  setSelectedClientId: (id: string | null) => void;
  showClientPicker: boolean;
  setShowClientPicker: (v: boolean) => void;
  onStartNewClientOnboarding: (v: string) => void;
  setClientFormData: (v: any) => void;
  onOpenInfo: (m: Machine) => void;
  authTrainer: Trainer | null;
  isSyncing: boolean;
  setIsSyncing: (v: boolean) => void;
  isIntroSession?: boolean;
  rightControls?: React.ReactNode;
  trainerDropdown?: React.ReactNode;
  onStudioClick?: () => void;
}) {
  const { activeStudioId: contextActiveStudioId, activeStudio } =
    useActiveStudio();
  // Per-studio machine display order (Aug 2026) — same resolution chain
  // as the Client Profile Journey grid: studio override, else the shared
  // default sequence (data/machine-display-order.ts), else legacy
  // machine.order. Kinematic MOVEMENT_PATTERN_ORDER grouping (Edit Routine
  // drawer / Catalog) is a separate, untouched system.
  // ORDERING, unified Sep 12 2026. This used to read
  // studioMachineSettings/{studioId}_{machineId}.order - a collection that
  // turned out to hold ZERO documents in production, because the editor that
  // wrote it (TrainerControlHubView) was deleted in the Sep 5 settings round
  // and never replaced. So this screen and the Active Session were sorting by
  // a field nothing could set, while the Catalog sorted by the roster's own
  // `order`. Two different orders for one studio, and no way to change either.
  // Now both read the roster, which is the single answer to "what equipment
  // does this location have, and in what order does it run".
  // byId is keyed by machineId and its `order` is already resolved through
  // resolveMachineOrder, so passing it as the override is idempotent: an
  // unrostered machine yields undefined and falls back to the code default.
  // bridgeWhenRosterEmpty: westlake and Willoughby have no roster yet, and a
  // tracker with no machines is far worse than a tracker showing the catalog.
  // The bridge makes the resolved list fall back to the catalog, so those two
  // studios degrade to exactly today's behaviour instead of to nothing.
  const { machines: studioFloor, byId: studioFloorById } = useStudioMachines(
    contextActiveStudioId,
    { bridgeWhenRosterEmpty: true },
  );

  /**
   * THE FLOOR — what this studio actually has, in the shape this screen
   * already speaks.
   *
   * Until Sep 20 2026 the tracker read the app-wide `machines` prop and used
   * the roster for `order` alone, so a studio's own dial labels, its renamed
   * units, its custom machines and every catalog correction reached the
   * Learning -> Catalog page and nothing a trainer held during a session.
   * `toFloorMachines` merges the studio's resolved truth over the legacy
   * document, so every consumer below keeps the legacy fields it reads while
   * the things a studio owns finally arrive. See src/lib/floor-machines.ts.
   */
  const legacyMachinesById = useMemo(() => {
    const map: Record<string, Machine> = {};
    for (const m of machines) if (m.id) map[m.id] = m;
    return map;
  }, [machines]);

  const floorMachines = useMemo(
    () => toFloorMachines(studioFloor, legacyMachinesById),
    [studioFloor, legacyMachinesById],
  );

  const { error: toastError } = useToast();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [logs, setLogs] = useState<Record<string, ExerciseLog>>({});
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  /*
   * How much of this client's story Journey holds - computed ONCE here and
   * handed to the three screens this file draws, rather than each of them
   * working it out. `activeStudio` is absent in the render test's context
   * mock, which resolves to "unknown", which is the cautious wording: the
   * safe direction to fail in. lib/client-coverage.ts.
   */
  const clientCoverage = useMemo(
    () => coverageOfClient(selectedClient, activeStudio?.journeyCutoverDate ?? null),
    [selectedClient, activeStudio?.journeyCutoverDate],
  );

  const [currentSession, setCurrentSession] = useState<WorkoutSession | null>(
    null,
  );

  const [activeMachineIds, setActiveMachineIds] = useState<string[]>([]);
  const [clientMachineSettings, setClientMachineSettings] = useState<
    Record<string, ClientMachineSetting>
  >({});
  const [currentSessionNotes, setCurrentSessionNotes] = useState<string>("");

  /**
   * When the trainer arrived at each machine.
   *
   * Time under tension used to come off ONE shared clock: whichever machine
   * was first in `activeMachineIds` with a finished-but-untimed set consumed
   * the whole elapsed window, and the clock reset. Attribution was therefore
   * decided by array position, which is exactly the thing a trainer now
   * changes mid-session — so reordering silently moved a machine's minutes
   * onto its neighbour, and going back to correct an earlier set charged it
   * with all the time spent elsewhere in between.
   *
   * A clock per machine, started when the trainer moves to it, removes the
   * dependency on order entirely. Nothing about the measurement changes; only
   * the question of whose time it is.
   */
  const machineStartedAt = React.useRef<Record<string, number>>({});

  /* The per-machine stopwatches that decide whose time it is: they run only
     while a machine is the current one (src/lib/machine-clock.ts).
     `machineStartedAt` above is kept as the machine's FIRST arrival, which
     is what the log persists and the Not-reached derivation reads. */
  const machineClocks = React.useRef<MachineClocks>(createMachineClocks());
  const gridFocusMachineIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    machineClocks.current = createMachineClocks();
  }, [currentSession?.id]);

  /** Mark a machine as being worked, unless it already is. */
  const markMachineStarted = React.useCallback((machineId: string) => {
    if (!machineId) return;
    if (machineStartedAt.current[machineId] === undefined) {
      machineStartedAt.current[machineId] = Date.now();
    }
  }, []);

  /* Mirror of `logs` for the write path, kept in sync below. */
  const logsRef = React.useRef<Record<string, ExerciseLog>>({});
  const [showRoutinePicker, setShowRoutinePicker] = useState(false);
  // Which machine the unified sheet is open on. One piece of state, because
  // there is now one sheet: it used to be two (settings, notes) and a
  // trainer had to know which of two targets to hit.
  const [sheetMachineId, setSheetMachineId] = useState<string | null>(null);
  // The 90-day assessment, opened mid-session. See the panel at the bottom
  // of this file for why it is a slide-over and not a screen.
  const [isShowingAssessment, setIsShowingAssessment] = useState(false);
  const [editingWeightMachineId, setEditingWeightMachineId] = useState<
    string | null
  >(null);

  // ── In-session setup prompt ──────────────────────────────────────────
  // A machine this client has never performed needs a setup, not an empty
  // weight field. When the trainer opens one, show the guide first.
  //
  // `setupPromptedRef` makes it fire ONCE per machine per mount: dismissing
  // the prompt must not turn into a loop every time the HUD is reopened, and a
  // trainer who chose "Skip for now" has already answered the question.
  const [setupPromptMachineId, setSetupPromptMachineId] = useState<
    string | null
  >(null);
  const setupPromptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const machineId = editingWeightMachineId;
    if (!machineId || setupPromptedRef.current.has(machineId)) return;

    const preset = clientMachineSettings[machineId];
    const hasSettings = Boolean(
      preset?.settings && Object.keys(preset.settings).length > 0,
    );
    const hasWeights =
      preset?.startingWeight != null || preset?.currentWeight != null;
    // Log keys are `${sessionId}_${machineId}` with an optional `_Left`/`_Right`
    // suffix, so match on the machine id as a whole segment rather than a
    // substring — "leg_press" must not match "leg_press_unilateral".
    const hasHistory = Object.keys(logs).some((k) => {
      const rest = k.slice(k.indexOf("_") + 1);
      return rest === machineId || rest.startsWith(`${machineId}_`);
    });

    if (hasSettings || hasWeights || hasHistory) return;

    setupPromptedRef.current.add(machineId);
    setSetupPromptMachineId(machineId);
  }, [editingWeightMachineId, clientMachineSettings, logs]);
  const [isStaticHoldOverride, setIsStaticHoldOverride] = useState(false);
  const [historyMachineId, setHistoryMachineId] = useState<string | null>(null);
  const [showAllMachines, setShowAllMachines] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [isPreSessionMode, setIsPreSessionMode] = useState(false);
  const [targetRoutine, setTargetRoutine] = useState<Routine | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  /**
   * Pause/resume, recorded on the session document.
   *
   * Pausing stores the instant; resuming folds that span into totalPausedMs.
   * Keeping it here rather than in component state means a refresh mid-pause no
   * longer counts the break as training time.
   */
  const toggleSessionPause = async () => {
    const session = currentSession;
    if (!session?.id) {
      setIsPaused((p) => !p);
      return;
    }

    const pausedAtMs = toMillisOrNull(session.pausedAt);
    const alreadyPaused = pausedAtMs !== null;

    // Update locally first so the button responds immediately.
    setIsPaused(!alreadyPaused);

    const updates = alreadyPaused
      ? {
          pausedAt: null,
          totalPausedMs:
            (Number(session.totalPausedMs) || 0) +
            Math.max(0, Date.now() - pausedAtMs),
        }
      : { pausedAt: Timestamp.now() };

    setCurrentSession((prev) =>
      prev && prev.id === session.id
        ? ({ ...prev, ...updates } as WorkoutSession)
        : prev,
    );

    try {
      await updateDoc(doc(db, "sessions", session.id), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "sessions");
    }
  };

  /**
   * Set the instant a session is created locally. Firestore's snapshot can lag a
   * beat behind the write, and without this the very next snapshot would report
   * "no session in progress" and immediately clear the one just started.
   */
  const justStartedSessionRef = useRef<{
    id: string;
    clientId: string;
    at: number;
  } | null>(null);

  const [machineTimeElapsed, setMachineTimeElapsed] = useState<number>(0);

  useEffect(() => {
    const takeoverSessionId = peekLiveSessionId();
    if (takeoverSessionId && !currentSession) {
      const fetchTakeoverSession = async () => {
        try {
          const sRef = doc(db, "sessions", takeoverSessionId);
          const sSnap = await getDoc(sRef);
          if (sSnap.exists()) {
            const data = { id: sSnap.id, ...sSnap.data() } as WorkoutSession;
            /* Adopt only for the client on screen. The remembered id used to
               be cleared on adoption so it could not attach the wrong client's
               session later; the client check does that job, which lets the
               key stay put as the crash-recovery net (lib/live-session.ts). */
            if (data.status === "In-Progress" && (!selectedClient?.id || data.clientId === selectedClient.id)) {
              setCurrentSession(data);
              /* Merge, never replace. `sessions` feeds the history grid AND
                 builds the exerciseLogs query below (its `where sessionId in`
                 list), so replacing it with the single taken-over session blanked
                 the client's whole history and every log with it. It also raced
                 the client-scoped listener, which is what made the screen flicker
                 between full and empty. That listener fills in the real history a
                 beat later; this only needs to make sure the session being taken
                 over is present until it does. */
              setSessions((prev) =>
                prev.some((s) => s.id === data.id) ? prev : [data, ...prev],
              );
              setIsPreSessionMode(false);
              setShowRoutinePicker(false);
            } else if (data.status !== "In-Progress") {
              forgetLiveSession(takeoverSessionId);
            }
          }
        } catch (error) {
          console.error("Error fetching takeover session:", error);
        }
      };
      fetchTakeoverSession();
    }
  }, []);

  /* When a machine's set is complete (weight, a count, a quality) and it
     has no time yet, write its time. The seconds come from the machine's
     own clock — the time it was the current machine, session pauses
     excluded (src/lib/machine-clock.ts) — never from "everything since
     the last machine". The trainer's stopwatch seconds still win for time
     under load. */
  useEffect(() => {
    if (!currentSession) return;
    const sid = currentSession.id;
    const now = Date.now();

    const close = (mId: string, log: ExerciseLog | undefined, side?: "Left" | "Right") => {
      if (!(log?.weight && (log?.reps || log?.seconds) && log?.repQuality && !log?.timeSpent)) return;
      const manualSeconds = log.seconds ? parseFloat(log.seconds) : 0;
      const isStatic = !!(
        log.isStaticHold ||
        log.isTSC ||
        (log.seconds && (!log.reps || parseInt(log.reps) === 0))
      );
      const reps = parseInt(log.reps || "0");
      const fields = machineTimeFields({
        onMachineSeconds: secondsOn(machineClocks.current, mId, now),
        manualSeconds: Number.isFinite(manualSeconds) ? manualSeconds : 0,
        reps: Number.isFinite(reps) ? reps : 0,
        isStatic,
        now,
      });
      updateLogMultiple(sid, mId, fields, side);
      resetMachine(machineClocks.current, mId, now);
      delete machineStartedAt.current[mId];
    };

    activeMachineIds.forEach((mId) => {
      if (mId === "torso_rotation") {
        close(mId, logs[`${sid}_${mId}_Left`], "Left");
        close(mId, logs[`${sid}_${mId}_Right`], "Right");
      } else {
        close(mId, logs[`${sid}_${mId}`]);
      }
    });
  }, [logs, currentSession, activeMachineIds]);

  // Mirror the session's persisted pause state into local state, so per-machine
  // timing and the heartbeat also know the session is paused after a refresh.
  useEffect(() => {
    const paused = toMillisOrNull((currentSession as any)?.pausedAt) !== null;
    setIsPaused((prev) => (prev === paused ? prev : paused));
  }, [(currentSession as any)?.pausedAt, currentSession?.id]);

  // A session pause freezes the current machine's clock; resume continues it.
  useEffect(() => {
    if (!currentSession) return;
    setPaused(machineClocks.current, isPaused);
  }, [isPaused, currentSession]);

  /* Until the tracker round (Sep 2026) this loop also DELETED the session —
     with every set in it — once the clock passed 60 minutes, as "abandoned
     session cleanup". A client who ran long, or a trainer resuming after a
     break (the pause history lives in memory and is gone after a reload),
     lost the whole session with no warning. Abandoned sessions are already
     handled without destroying data: `isSessionValid` hides a session whose
     heartbeat is older than 60 minutes. Nothing on this screen may delete
     a session except the trainer pressing Discard. */
  useEffect(() => {
    if (!currentSession) return;
    const tick = () =>
      setMachineTimeElapsed(gridFocusMachineIdRef.current ? secondsOn(machineClocks.current, gridFocusMachineIdRef.current) : 0);
    tick();
    if (isPaused) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [currentSession, isPaused]);

  // Fetch all exercise logs for analysis (limited to last 1000 for performance)
  const [isShowingSessionNotes, setIsShowingSessionNotes] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const [isPostSessionMode, setIsPostSessionMode] = useState(false);
  const [postSession, setPostSession] = useState<PostSessionSnapshot | null>(null);

  /*
   * THE NOTE DRAFT BELONGS TO THE SESSION (fluidity round, Sep 18 2026).
   *
   * It used to live inside the composer, which was unmounted when the sheet
   * closed — so "close the note to look at the chart, come back" meant an
   * empty box. Now the tracker holds it, mirrors it into sessionStorage under
   * the session id (a crash and a resume keep it), and carries it onto the
   * post-session screen. features/client-notes/session-draft.ts.
   */
  const [noteDraft, setNoteDraft] = useState<SessionNoteDraft | null>(null);

  /*
   * RED FLAGS FOR THE WHOLE TWENTY MINUTES (fluidity round, Sep 18 2026).
   * The briefing read the journal and showed the client's conditions and
   * critical notes; the moment Start was pressed every one of them was gone.
   * The same hook the briefing uses, here for the session's whole life; the
   * Firestore client shares the listener with the briefing's while both are
   * mounted. features/journey-grid/session-flags.ts decides what to show.
   */
  const [isShowingFlags, setIsShowingFlags] = useState(false);
  const flagJournal = useClientJournal({
    clientId: selectedClient?.id || null,
    client: selectedClient ?? null,
    trainers,
  });
  const flagSources = useMemo(
    () => ({
      clinicalFlags: selectedClient?.clinicalFlags ?? null,
      criticalEntries: flagJournal.criticalEntries,
      headsUpEntries: flagJournal.headsUpEntries ?? [],
    }),
    [selectedClient?.clinicalFlags, flagJournal.criticalEntries, flagJournal.headsUpEntries],
  );
  const flags = useMemo(() => sessionFlags(flagSources), [flagSources]);
  const draftSessionRef = React.useRef<string | null>(null);
  useEffect(() => {
    const id = currentSession?.id ?? null;
    if (draftSessionRef.current === id) return;
    draftSessionRef.current = id;
    setNoteDraft(id ? readSessionDraft(id) : null);
  }, [currentSession?.id]);
  const handleDraftChange = React.useCallback((d: SessionNoteDraft) => {
    const next = hasDraftText(d) ? d : null;
    setNoteDraft(next);
    writeSessionDraft(currentSessionIdRef.current, d);
  }, []);
  const currentSessionIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    currentSessionIdRef.current = currentSession?.id ?? null;
  }, [currentSession?.id]);
  useEffect(() => {
    logsRef.current = logs as Record<string, ExerciseLog>;
  }, [logs]);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [pendingAssignSession, setPendingAssignSession] =
    useState<WorkoutSession | null>(null);
  /**
   * Reorder mode.
   *
   * This replaced a 20rem inline panel that rendered the whole shared builder
   * above the grid. It worked, and it was the wrong shape for the moment it
   * is used in: it covered the thing the trainer was reading, to let them do
   * one small thing to it. Adding a machine already happens in place — the
   * "+" on any machine not in today's routine — so what was actually missing
   * was a way to change the order, and that fits in the cell the machine name
   * already occupies.
   *
   * Tracker round (Sep 2026): the in-cell up/down arrows are retired for
   * drag and drop. Reorder opens RoutineOrderSheet — a bottom sheet with a
   * grip per machine, "Do next" for the occupied-machine pivot, and "add
   * from the floor" — which hands the new sequence to applySessionMachineIds.
   */
  const [isOrderSheetOpen, setIsOrderSheetOpen] = useState(false);
  const nowBarSide = useMediaQuery(NOW_BAR_SIDE_QUERY);

  /**
   * Every mid-session change to the machine list lands here, and lands
   * immediately — no staging buffer, no Confirm step.
   *
   * This was a modal with a Cancel/Confirm footer, which meant a trainer with
   * a client waiting had to open a dialog, make the change, and then agree
   * with themselves before the screen caught up. Session state is local and
   * nothing is written to Firestore either way, so there was never anything
   * for the confirm step to protect.
   */
  /**
   * Record the sequence this session is actually running.
   *
   * Writes to the SESSION document, never the routine. The client's
   * prescription is unchanged; what changed is the history of this workout,
   * and that is worth keeping — a trainer looking back at why a session went
   * the way it did should be able to see that the Leg Press came out and the
   * Pulldown moved up.
   *
   * Fire-and-forget: the trainer's screen updates on the state change, and a
   * failed write costs the recorded order, not the workout.
   */
  const applySessionMachineIds = (newIds: string[]) => {
    setActiveMachineIds(newIds);
    const sessionId = currentSession?.id;
    if (!sessionId) return;
    updateDoc(doc(db, "sessions", sessionId), {
      sessionMachineIds: newIds,
      lastHeartbeatAt: serverTimestamp(),
    }).catch((error) =>
      handleFirestoreError(error, OperationType.UPDATE, "sessions"),
    );
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Special listener for unassigned sessions when no client is selected
  useEffect(() => {
    if (!clientId && user) {
      /*
       * Scoped to this studio (tenancy pass, Sep 2026). Unscoped, this picked
       * up an in-progress unassigned session at ANY location — so two studios
       * running an open session at once could each adopt the other's. It also
       * cannot be read at all now that `sessions` is rule-scoped.
       */
      const unassignedQuery = query(
        collection(db, "sessions"),
        where("hostedAtStudioId", "==", contextActiveStudioId ?? "__none__"),
        where("isUnassigned", "==", true),
        where("status", "==", "In-Progress"),
        limit(1),
      );

      const unsubscribe = onSnapshot(
        unassignedQuery,
        (snapshot) => {
          if (!snapshot.empty) {
            const session = {
              id: snapshot.docs[0].id,
              ...snapshot.docs[0].data(),
            } as WorkoutSession;
            setCurrentSession(session);
            setSessions([session]);
          } else {
            setCurrentSession(null);
            setSessions([]);
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "sessions");
        },
      );

      return () => unsubscribe();
    }
  }, [clientId, user?.uid]);

  useEffect(() => {
    if (clientId && clients) {
      const client = clients.find((c) => c.id === clientId);
      setSelectedClient(client || null);
    }
  }, [clientId, clients]);

  useEffect(() => {
    if (clientId && user) {
      // Fetch Client Machine Settings
      const settingsQuery = query(
        collection(db, "clientMachineSettings"),
        where("clientId", "==", clientId),
      );
      const unsubscribeSettings = onSnapshot(
        settingsQuery,
        (snapshot) => {
          const settingsMap: Record<string, ClientMachineSetting> = {};
          snapshot.docs.forEach((doc) => {
            const data = { id: doc.id, ...doc.data() } as ClientMachineSetting;
            settingsMap[data.machineId] = data;
          });
          setClientMachineSettings(settingsMap);
        },
        (error) => {
          handleFirestoreError(
            error,
            OperationType.GET,
            "clientMachineSettings",
          );
        },
      );

      // Fetch Routines
      const routinesQuery = query(
        collection(db, "routines"),
        where("clientId", "==", clientId),
      );
      const unsubscribeRoutines = onSnapshot(
        routinesQuery,
        (snapshot) => {
          const routinesData = snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Routine,
          );
          // Sort routines alphabetically so Routine A is default/first
          setRoutines(
            routinesData.sort((a, b) => a.name.localeCompare(b.name)),
          );
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "routines");
        },
      );

      // Fetch Sessions
      const sessionsQuery = query(
        collection(db, "sessions"),
        where("clientId", "==", clientId),
      );

      const unsubscribeSessions = onSnapshot(
        sessionsQuery,
        async (snapshot) => {
          const sessionsData = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession)
            .sort((a, b) => {
              // Sort by the session's actual workout date (parseSessionDate),
              // the same field the History grid's date headers display —
              // NOT createdAt. createdAt is when the Firestore doc was
              // written, which for legacy-imported sessions (see
              // LegacyChartImporter.tsx) is whenever the import ran, not
              // when the workout happened. Sorting by createdAt first
              // scrambled the 5 most-recent-session columns into import
              // order instead of chronological order (e.g. "Jun 1, Jun 11,
              // Mar 16, Feb 26, Jun 8"). Falls back to startTime only when
              // a session has no date at all.
              const timeA =
                parseSessionDate(a.date) ||
                (a.startTime ? new Date(a.startTime).getTime() : 0);
              const timeB =
                parseSessionDate(b.date) ||
                (b.startTime ? new Date(b.startTime).getTime() : 0);
              return timeB - timeA;
            });
          setSessions(sessionsData);

          // Auto-select In-Progress session if it exists
          const inProgress = sessionsData.find(
            (s) => s.status === "In-Progress",
          );
          if (inProgress) {
            setCurrentSession(inProgress);
            setShowRoutinePicker(false);
            setIsPreSessionMode(false);
          } else {
            // A session created a moment ago may not be in this snapshot yet, so
            // hold onto it briefly. Bounded on purpose: the previous version kept
            // *any* in-progress session forever, so one that had been completed or
            // deleted elsewhere stayed pinned and blocked starting a new one.
            const pending = justStartedSessionRef.current;
            const stillSettling =
              pending !== null &&
              pending.clientId === clientId &&
              Date.now() - pending.at < JUST_STARTED_GRACE_MS;

            if (!stillSettling) {
              justStartedSessionRef.current = null;
              // Set outside a state updater — updaters must stay pure, and React
              // invokes them twice under StrictMode.
              setCurrentSession(null);
              setIsPreSessionMode(true);
            }
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "sessions");
        },
      );

      return () => {
        unsubscribeSettings();
        unsubscribeRoutines();
        unsubscribeSessions();
      };
    }
  }, [clientId, user?.uid, clients]);

  useEffect(() => {
    const allSessionIds = new Set<string>();
    sessions.forEach((s) => {
      if (s.id) allSessionIds.add(s.id);
    });
    if (currentSession?.id) {
      allSessionIds.add(currentSession.id);
    }

    const sessionIds = Array.from(allSessionIds).filter(Boolean).slice(0, 30);
    if (sessionIds.length > 0) {
      const logsQuery = query(
        collection(db, "exerciseLogs"),
        where("sessionId", "in", sessionIds),
      );
      const unsubscribeLogs = onSnapshot(
        logsQuery,
        (snapshot) => {
          const logsMap: Record<string, ExerciseLog> = {};
          snapshot.docs.forEach((doc) => {
            const data = { id: doc.id, ...doc.data() } as ExerciseLog;
            const key = `${data.sessionId}_${data.machineId}${data.side ? "_" + data.side : ""}`;
            logsMap[key] = data;
          });
          setLogs(logsMap);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "exerciseLogs");
        },
      );
      return () => unsubscribeLogs();
    }
  }, [
    sessions
      .map((s) => s.id)
      .sort()
      .join(",") + `_${currentSession?.id || ""}`,
  ]);

  // Routine Alternation Logic & Historical Lifts Fetching
  useEffect(() => {
    if (clientId && !currentSession && isPreSessionMode) {
      const determineAndFetch = async () => {
        const completed = sessions.filter((s) => s.status === "Completed");
        const lastSess = completed[0];

        // Find Routine A and B specifically
        const routineA = routines.find((r) => r.name === "Routine A");
        const routineB = routines.find((r) => r.name === "Routine B");
        const isRoutineBActive = selectedClient?.isRoutineBActive || false;

        let target: Routine | null = null;

        // Sequence Selection Logic
        if (routines.length === 0) {
          // New Client: Default to Routine A Setup
          target = { name: "Routine A", machineIds: [], clientId } as Routine;
        } else if (routineA && routineB && isRoutineBActive) {
          // Strict Alternation Logic
          const lastRoutine = routines.find(
            (r) => r.id === lastSess?.routineId,
          );
          if (lastRoutine?.name === "Routine A") {
            target = routineB;
          } else {
            target = routineA;
          }
        } else {
          // Fallback to Routine A or whatever exists
          target = routineA || routines[0];
        }

        setTargetRoutine(target);
      };
      determineAndFetch();
    }
  }, [
    clientId,
    routines,
    currentSession,
    isPreSessionMode,
    sessions,
    selectedClient?.isRoutineBActive,
  ]);

  /**
   * Load this session's machine list — ONCE.
   *
   * This effect used to depend on [currentSession, routines, machines] and
   * call setActiveMachineIds(routine.machineIds) on every run, which made it
   * the cause of the reported bug: entering a weight writes lastHeartbeatAt to
   * the session document, the snapshot fires, `currentSession` arrives as a
   * new object reference, this effect re-runs, and the machine the trainer
   * added thirty seconds ago disappears. The same fired on any `machines` or
   * `routines` snapshot, so a reorder could evaporate for no visible reason at
   * all. It looked like the routine "reverting"; it was this line.
   *
   * A session's machine list belongs to the session, so it is read from the
   * session document and seeded exactly once per session id. Older sessions
   * have no sessionMachineIds and fall back to the routine, which is also
   * where a session started before this change gets its list from.
   */
  const seededMachinesForSession = useRef<string | null>(null);

  useEffect(() => {
    const sessionId = currentSession?.id ?? null;
    if (!sessionId) {
      seededMachinesForSession.current = null;
      return;
    }
    if (seededMachinesForSession.current === sessionId) return;

    const recorded = currentSession?.sessionMachineIds;
    if (recorded && recorded.length > 0) {
      seededMachinesForSession.current = sessionId;
      setActiveMachineIds(recorded);
      return;
    }

    const routine = routines.find((r) => r.id === currentSession?.routineId);
    if (routine) {
      seededMachinesForSession.current = sessionId;
      setActiveMachineIds(routine.machineIds);
    } else if (!currentSession?.routineId && floorMachines.length > 0) {
      // A Free session: no routine to read, so the floor is the list.
      seededMachinesForSession.current = sessionId;
      setActiveMachineIds(floorMachines.map((m) => m.id!));
    }
    // A routineId we have not loaded yet: leave the latch unset and try again
    // on the next snapshot rather than seeding from an empty list.
  }, [currentSession, routines, floorMachines]);

  /* REMOVED (Sep 2026): updateRoutineNote and moveMachine.

     Both wrote straight to the client's routine document — machineNotes and
     machineIds respectively — from inside the live session screen, and
     neither was called from anywhere. Unreachable, so nothing changes by
     deleting them; but a function named moveMachine that permanently
     reorders a client's prescribed routine, sitting in the session
     component, is the precise mistake the session-scope rule exists to
     prevent, and it was one wiring-up away from happening. Reordering
     mid-session goes through handleSaveSessionMachineIds, which is local
     state; routine notes are edited on the client profile. */

  const startNewSession = async (
    routineType: "A" | "B" | "Free",
    sessionType: SessionType = "Standard",
    customMachines?: string[],
    adjustmentNote?: string,
    /* `permanentSave` used to sit here, and writing it out is the only
       reason it is worth mentioning: it let a caller rewrite the client's
       saved routine as a side effect of starting a session. No caller ever
       passed true — the briefing hardcoded false and the consultation path
       omitted it — so the branch was dead, and dead is exactly how a rule
       stops being enforced by structure and starts being enforced by
       everyone remembering. Permanent routine changes are made on the client
       profile. (Sep 2026) */
    preSessionCheckIn?: PreSessionCheckIn,
  ) => {
    if (!clientId) return;
    const nextNum = (selectedClient?.sessionCount || 0) + 1;

    // Auto-populate trainer and date
    const trainerInitials =
      authTrainer?.initials || trainers[0]?.initials || "??";
    const trainerName = authTrainer ? authTrainer.fullName : "";
    const trainerId = authTrainer?.id || "";
    const date = studioTodayKey();

    try {
      let routineId: string | undefined = undefined;

      if (routineType !== "Free") {
        const routineName = `Routine ${routineType}`;
        let routine = routines.find((r) => r.name === routineName);

        if (!routine) {
          // Create the routine if it doesn't exist
          const newRoutineRef = await addDoc(collection(db, "routines"), {
            clientId,
            name: routineName,
            machineIds: customMachines || [],
            createdAt: serverTimestamp(),
            studioId: selectedClient?.homeStudioId || "",
          });
          routineId = newRoutineRef.id;

          if (routineType === "B") {
            await updateDoc(doc(db, "clients", clientId), {
              isRoutineBActive: true,
            });
          }
        } else {
          routineId = routine.id;
        }
      }

      // 1. Create the session
      // STATISTICAL ROUTING & CROSS-TRAIN DETECTION
      // The session should log where it physically happened (the currently active studio)
      // but if the client belongs elsewhere, mark it as a cross-train event.
      const currentStudioId =
        contextActiveStudioId || authTrainer?.primaryHomeStudioId || null;

      // Explicit fetch/find of client's home studio to verify cross-train status
      const targetClient = clients.find((c) => c.id === clientId);
      const clientHomeStudioId = targetClient?.homeStudioId || null;

      // Cross-Train Logic: If client's home studio != current location, flag it.
      const isCrossTrain =
        clientHomeStudioId !== null &&
        currentStudioId !== null &&
        clientHomeStudioId !== currentStudioId;

      const cleanFirestorePayload = (obj: any): any => {
        if (obj === null || obj === undefined) return null;
        if (Array.isArray(obj)) return obj.map(cleanFirestorePayload);
        if (typeof obj !== "object") return obj;
        if (
          typeof obj.toDate === "function" ||
          obj.constructor?.name === "FieldValue" ||
          obj instanceof Date
        )
          return obj;

        const cleaned: Record<string, any> = {};
        Object.entries(obj).forEach(([k, v]) => {
          if (v !== undefined) {
            cleaned[k] = cleanFirestorePayload(v);
          }
        });
        return cleaned;
      };

      /* What this session intends to run. Recorded on the document from the
         first moment so that the session, not the routine, is the thing the
         screen reads back — see WorkoutSession.sessionMachineIds. */
      const plannedMachineIds: string[] =
        customMachines && customMachines.length > 0
          ? customMachines
          : (routineId ? routines.find((r) => r.id === routineId) : null)?.machineIds ?? [];

      const sessionData: any = cleanFirestorePayload({
        clientId,
        mindbodyClientId:
          selectedClient?.mindbodyClientId ||
          selectedClient?.mindbodyId ||
          null,
        clientName: selectedClient
          ? `${selectedClient.firstName} ${selectedClient.lastName}`.trim()
          : "",
        homeStudioId: clientHomeStudioId || "",
        routineId: routineId || null,
        hostedAtStudioId: currentStudioId || "",
        clientHomeStudioId: clientHomeStudioId || "",
        sessionType: sessionType || "Standard",
        sessionNumber: nextNum,
        date,
        isCrossTrain: Boolean(isCrossTrain),
        trainerInitials: trainerInitials || "??",
        trainerName: trainerName || "",
        trainerId: trainerId || "",
        startedByTrainerId: trainerId || "",
        lastHeartbeatAt: serverTimestamp(),
        status: "In-Progress",
        sessionMachineIds: plannedMachineIds,
        // Timer bookkeeping lives on the document so elapsed time survives a
        // refresh, a navigation, or moving to another device.
        pausedAt: null,
        totalPausedMs: 0,
        // Client clock fallback: serverTimestamp() reads as null in the local
        // snapshot until the server confirms, which left the timer frozen at
        // 00:00 for that round trip.
        clientStartTime: new Date().toISOString(),
        startTime: serverTimestamp(),
        createdAt: serverTimestamp(),
        ...(preSessionCheckIn ? { preSessionCheckIn } : {}),
      });

      const docRef = await addDoc(collection(db, "sessions"), sessionData);

      // Protects this session from being cleared by a snapshot that predates it.
      justStartedSessionRef.current = {
        id: docRef.id,
        clientId,
        at: Date.now(),
      };
      // The device remembers the live session, so the bottom tab can bring
      // the trainer straight back after a crash (lib/live-session.ts).
      rememberLiveSession(docRef.id);

      const clientUpdateData: any = {};
      if (routineType === "B" && !selectedClient?.isRoutineBActive) {
        clientUpdateData.isRoutineBActive = true;
      }
      if (nextNum === 1 && !selectedClient?.firstSessionDate) {
        clientUpdateData.firstSessionDate = serverTimestamp();
      }
      if (Object.keys(clientUpdateData).length > 0) {
        await updateDoc(doc(db, "clients", clientId), clientUpdateData).catch(
          console.error,
        );
      }

      if (adjustmentNote && adjustmentNote.trim()) {
        /* The "why the routine changed today" note goes to the client's
           Journal (journalEntries, origin pre_session) — the canonical notes
           collection — not to the legacy sessionNotes. Author is the Auth
           uid, which the rule pins authorId to. Never blocks the start: a
           note that fails is reported, and the session begins regardless. */
        const initials = (
          authTrainer?.initials ||
          (authTrainer?.fullName || "").substring(0, 2) ||
          "??"
        ).toUpperCase();
        try {
          await createJournalEntry(
            clientId,
            currentStudioId || clientHomeStudioId || "",
            { id: user.uid, initials, fullName: authTrainer?.fullName || initials },
            {
              kind: "general",
              category: null,
              /* The briefing's box is the ARRIVAL note now ("how they slept,
                 an ache, a trip coming up") — it only reads as a routine
                 change when the sequence actually changed. */
              body: (customMachines
                ? `Routine adjusted for today: ${adjustmentNote.trim()}`
                : `On arrival: ${adjustmentNote.trim()}`
              ).slice(0, 5000),
              importance: "standard",
              machineId: null,
              focusId: null,
              sessionId: docRef.id,
              origin: "pre_session",
            },
          );
        } catch (err) {
          console.error("[start] adjustment note did not reach the Journal", err);
          toastError("The session started, but the routine note could not be saved. Add it from the Journal.");
        }
      }

      // 2. Fetch last logs to pre-fill weights
      const machineLastLogs: Record<string, Partial<ExerciseLog>> = {};

      if (selectedClient && selectedClient.currentMachineMetrics) {
        Object.entries(selectedClient.currentMachineMetrics).forEach(
          ([mId, metricVal]) => {
            const metric = metricVal as any;
            // For simplicity, we just seed it directly mapping back to ExerciseLog properties
            machineLastLogs[mId] = {
              weight: metric.weight,
              reps: metric.reps,
              seconds: metric.seconds,
              isStaticHold: metric.isStaticHold,
              isTSC: metric.isTSC,
              machineId: mId,
              repQuality: 2, // default
            };
          },
        );
      }

      // Also fallback to clientMachineSettings if machine is not yet in currentMachineMetrics
      if (clientMachineSettings) {
        Object.entries(clientMachineSettings).forEach(
          ([mId, settingObjVal]) => {
            const settingObj = settingObjVal as any;
            if (!machineLastLogs[mId] && settingObj) {
              const w = settingObj.currentWeight ?? settingObj.startingWeight;
              if (w !== undefined && w !== null && String(w).trim() !== "") {
                machineLastLogs[mId] = {
                  weight: String(w),
                  machineId: mId,
                  repQuality: 2,
                };
              }
            }
          },
        );
      }

      // The trainer's prescribed weight wins over the raw last-performed
      // metric. sync-utils rewrites currentWeight to whatever was actually
      // performed when a session is saved, so this is "same as last session"
      // by default and a manual prescription whenever a trainer set one on the
      // Journey grid or the Equipment tab. Nothing progresses automatically.
      if (clientMachineSettings) {
        Object.entries(clientMachineSettings).forEach(
          ([mId, settingObjVal]) => {
            const prescribed = (settingObjVal as any)?.currentWeight;
            if (
              prescribed === undefined ||
              prescribed === null ||
              String(prescribed).trim() === ""
            ) {
              return;
            }
            if (machineLastLogs[mId]) {
              machineLastLogs[mId] = {
                ...machineLastLogs[mId],
                weight: String(prescribed),
              };
            }
          },
        );
      }

      // 3. Auto-populate logs for the machines this session will run.
      //    (Shadows the component-level state of the same name on purpose —
      //     this is the local list for seeding logs, computed above.)
      const activeMachineIds = plannedMachineIds;

      if (activeMachineIds && activeMachineIds.length > 0) {
        const currentSettings = clientMachineSettings;

        const createLogPayload = (
          prevLog: Partial<ExerciseLog> | undefined,
          mId: string,
          side?: "Left" | "Right",
          defaultWeight?: number | null,
        ) => {
          const payload: any = {
            sessionId: docRef.id,
            clientId,
            homeStudioId: clientHomeStudioId || "",
            clientHomeStudioId: clientHomeStudioId || "",
            studioId: currentStudioId || clientHomeStudioId || "",
            machineId: mId,
            machineSettings:
              currentSettings[mId]?.settings || prevLog?.machineSettings || {},
            createdAt: serverTimestamp(),
          };
          if (side) payload.side = side;
          if (prevLog) {
            if (prevLog.weight) payload.weight = String(prevLog.weight);

            // Intentionally not auto-filling reps, seconds, or repQuality per user request

            if (prevLog.isStaticHold !== undefined)
              payload.isStaticHold = Boolean(prevLog.isStaticHold);
            if (prevLog.isTSC !== undefined)
              payload.isTSC = Boolean(prevLog.isTSC);
          } else if (defaultWeight) {
            payload.weight = String(defaultWeight);
          }
          return cleanFirestorePayload(payload);
        };

        /*
         * ONE BATCH, MERGED, BEFORE THE TRAINER CAN TOUCH ANYTHING.
         *
         * This loop used to `await setDoc(...)` once per machine, with no
         * { merge: true }, AFTER the sessions listener had already seen the
         * local addDoc and switched the screen to the live tracker. Two ways
         * that lost a trainer's work:
         *
         *   - Offline, a setDoc promise never resolves. The loop parked at
         *     machine 1 while the trainer kept working; when the network came
         *     back it resumed and REPLACED (not merged) the placeholder for
         *     machines 2..N — reps, quality and skip reasons gone, and the
         *     snapshot echo cleared the Now Bar in front of them.
         *   - Even online there was a window of N round trips in which the
         *     same thing could happen on a slow studio connection.
         *
         * Every other write to these documents is a merge (updateLogMultiple);
         * the seed was the one replace. Now the payloads are built first, the
         * dynamic import is hoisted out of the loop, and one writeBatch with
         * merge commits them. A session is 5-8 machines, so this is well
         * inside the 500-op limit.
         *
         * "We need the app to be able to act as pen and paper in terms of
         * reliability." — docs/business/the-floor.md
         */
        const { calculateStartingWeight } = await import(
          "../lib/consultation-utils"
        );

        const seeds: { ref: ReturnType<typeof doc>; payload: any }[] = [];

        for (const mId of activeMachineIds) {
          const mac = floorMachines.find((m) => m.id === mId);
          // Canonical id first, so a studio that renamed its torso rotation
          // still gets Left and Right seeded. src/lib/floor-machines.ts.
          const isTorsoMac = isPerSideMachine({ id: mId, name: mac?.name });

          let defaultWeight: number | null = null;
          if (!machineLastLogs[mId] && selectedClient && mac && mac.name) {
            const gender =
              selectedClient.gender === "Female" ? "Female" : "Male";
            const calculatedWeight = calculateStartingWeight(
              mac.name,
              gender,
              selectedClient.age || 45,
              "Novice",
            );
            defaultWeight = calculatedWeight > 0 ? calculatedWeight : null;
          }

          if (isTorsoMac) {
            const prefilledLeft =
              machineLastLogs[`${mId}_Left`] || machineLastLogs[mId];
            const prefilledRight =
              machineLastLogs[`${mId}_Right`] || machineLastLogs[mId];

            if (prefilledLeft || defaultWeight) {
              seeds.push({
                ref: doc(db, "exerciseLogs", logDocId(docRef.id, mId, "Left")),
                payload: createLogPayload(prefilledLeft, mId, "Left", defaultWeight),
              });
            }
            if (prefilledRight || defaultWeight) {
              seeds.push({
                ref: doc(db, "exerciseLogs", logDocId(docRef.id, mId, "Right")),
                payload: createLogPayload(prefilledRight, mId, "Right", defaultWeight),
              });
            }
          } else {
            const prefilledLog = machineLastLogs[mId];
            if (prefilledLog || defaultWeight) {
              seeds.push({
                ref: doc(db, "exerciseLogs", logDocId(docRef.id, mId, undefined)),
                payload: createLogPayload(prefilledLog, mId, undefined, defaultWeight),
              });
            }
          }
        }

        if (seeds.length > 0) {
          const seedBatch = writeBatch(db);
          for (const { ref, payload } of seeds) {
            // merge: a seed must never clobber a set the trainer has already
            // entered on this machine.
            seedBatch.set(ref, payload, { merge: true });
          }
          await seedBatch.commit();
        }
      }

      const newSession = {
        id: docRef.id,
        clientId,
        routineId: routineId || null,
        sessionType,
        sessionNumber: nextNum,
        date,
        clientHomeStudioId: clientHomeStudioId || currentStudioId || "",
        hostedAtStudioId: currentStudioId || "",
        isCrossTrain,
        trainerInitials,
        trainerName,
        trainerId,
        status: "In-Progress",
        startTime: new Date(),
      };

      setCurrentSession(newSession as WorkoutSession);
      setSessions((prev) => [
        newSession as WorkoutSession,
        ...prev.filter((s) => s.id !== newSession.id),
      ]);
      setShowRoutinePicker(false);
      setIsPreSessionMode(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "sessions");
    }
  };

  const assignSessionToClient = async (targetClientId: string) => {
    const sessionToAssign = pendingAssignSession || currentSession;
    if (!sessionToAssign?.id) return;
    try {
      // 1. Update session
      await updateDoc(doc(db, "sessions", sessionToAssign.id), {
        clientId: targetClientId,
        isUnassigned: false,
        status: "Completed",
        endTime: serverTimestamp(),
      });

      // 2. Update all logs
      const logsQ = query(
        collection(db, "exerciseLogs"),
        where("sessionId", "==", sessionToAssign.id),
      );
      const snap = await getDocs(logsQ);
      for (const d of snap.docs) {
        await updateDoc(doc(db, "exerciseLogs", d.id), {
          clientId: targetClientId,
        });
      }

      // Update local state if it was the current session
      if (currentSession?.id === sessionToAssign.id) {
        setCurrentSession(null);
      }

      setSelectedClientId(targetClientId);
      setShowAssignDialog(false);
      setPendingAssignSession(null);
      setView("profile"); // Take them to profile to see the work
    } catch (error) {
      console.error("Error assigning session:", error);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      // Delete associated logs first
      const logsQ = query(
        collection(db, "exerciseLogs"),
        where("sessionId", "==", sessionId),
      );
      const logsSnap = await getDocs(logsQ);
      for (const logDoc of logsSnap.docs) {
        await deleteDoc(logDoc.ref);
      }
      // Delete associated notes
      const notesQ = query(
        collection(db, "sessionNotes"),
        where("sessionId", "==", sessionId),
      );
      const notesSnap = await getDocs(notesQ);
      for (const noteDoc of notesSnap.docs) {
        await deleteDoc(noteDoc.ref);
      }
      // Delete session
      await deleteDoc(doc(db, "sessions", sessionId));
      forgetLiveSession(sessionId);

      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        setLogs({});
        setSelectedClientId(null);
        setView("clients");
      }
      setShowEndConfirmation(false);
      setShowCancelConfirmation(false);
      setPendingAssignSession(null);
    } catch (error) {
      console.error("Error deleting session:", error);
    }
  };

  /**
   * Machines that were begun but never given a count, for the End Session
   * dialog to ask about. Scope matters: `logs` is keyed across every session
   * loaded for this client (up to 30), so only today's sets are looked at —
   * a zero-count set from a past workout cannot be fixed from here.
   */
  const uncountedMachineIds = (): string[] => {
    const currentSessionLogs: Record<string, ExerciseLog> = {};
    Object.entries(logs as Record<string, ExerciseLog>).forEach(
      ([key, log]) => {
        if (log && log.sessionId === currentSession?.id) {
          currentSessionLogs[key] = log;
        }
      },
    );
    const out: string[] = [];
    for (const i of findIncompleteLogs(currentSessionLogs)) {
      if (i.machineId && !out.includes(i.machineId)) out.push(i.machineId);
    }
    // Routine order, so the dialog reads like the floor did.
    return out.sort(
      (a, b) =>
        (activeMachineIds.indexOf(a) + 1 || 999) - (activeMachineIds.indexOf(b) + 1 || 999),
    );
  };

  /**
   * What the trainer says a count-less set was, per machine, answered in the
   * End Session dialog. Skipped is the default: a set with no count never
   * counted toward anything, so the default changes no number, it only
   * names the blank (docs/ARCHITECTURE.md §1.6). "Not reached" is offered
   * for the one case the clock misreads — a load set up in advance on a
   * machine the session then never got to — not asked for on its own.
   */
  type EndChoice = "practice" | "skipped" | "not_reached";
  const [endChoices, setEndChoices] = useState<Record<string, EndChoice>>({});

  const handleEndSessionPress = () => {
    /* The anti-blocker rule (Sep 12 2026): a missing data point never stops
       a session from being saved. This used to refuse to finish while any
       set lacked a count and send the trainer back to the entry dialog. It
       now asks, in the dialog that follows, whether each such set was
       practice or skipped — and defaults to skipped so one tap still ends
       the session. Machines never touched are recorded as not reached by
       commitEndSession, without a question. */
    const asked: Record<string, EndChoice> = {};
    for (const id of uncountedMachineIds()) asked[id] = "skipped";
    setEndChoices(asked);

    if (currentSession?.id && !currentSession.endTime) {
      const now = new Date();
      updateDoc(doc(db, "sessions", currentSession.id), {
        endTime: serverTimestamp(),
      }).catch(console.error);
      setCurrentSession((prev) => (prev ? { ...prev, endTime: now } : prev));
    }
    setIsPaused(true);
    setShowEndConfirmation(true);
  };

  /* THE POST-SESSION FLOW (tracker round, Sep 2026).

     Finish used to be two steps: End Session → the Victory HUD → a second
     "FINALIZE & RETURN TO HUB" button that did the actual save. AJ's
     verdict: the session must be SUBMITTED the moment End Session is
     confirmed — the trainer is walking the client out, offering water,
     talking about next time — and anything added on the post-session
     screen must land without another save button.

     So: commitEndSession() writes the session (the one and only call to
     completeWorkoutSession — its counters are increments, so it must never
     run twice), then the post-session screen reads from a snapshot. The
     Feel toggle writes on its own the moment it is tapped; the closing
     note is written when the trainer leaves the screen. */
  const commitEndSession = async () => {
    if (!currentSession?.id || !selectedClient) return;

    // Land anything still debounced before the finish batch reads local state.
    flushAllLogWrites();

    setIsSyncing(true);
    try {
      const sessionLogs = (Object.values(logs) as ExerciseLog[]).filter(
        (l) => l.sessionId === currentSession.id,
      );

      /* Nothing leaves the session ambiguous (lib/set-outcome.ts). A set
         with a count is performed and is left as it is — inferred, not
         stamped, so a later edit that zeroes it is not frozen as performed.
         The untouched placeholder of a machine the session never got to is
         stamped not reached. A set that was begun without a count takes the
         trainer's End Session answer, skipped (reason unknown) by default. */
      const stamped = sessionLogs.map((l) => {
        const chosen = l.machineId ? endChoices[l.machineId] ?? null : null;
        let o = outcomeAtFinish(l, chosen === "not_reached" ? null : chosen);
        if (o.outcome === "performed") return l;
        if (chosen === "not_reached" && o.outcome === "skipped" && o.skipReason === "unknown") {
          o = { outcome: "not_reached" };
        }
        return { ...l, ...o, ...(o.outcome !== "skipped" ? { skipReason: null } : {}) };
      });

      /* Machines in today's sequence with no log of any kind ran out of
         session. Derived here, never asked of the trainer — the clues a
         leader reads are the per-machine clocks and the lateness below. */
      const notReached: ExerciseLog[] = unreachedMachineIds(activeMachineIds, sessionLogs).map(
        (machineId) => ({
          id: logDocId(currentSession.id!, machineId),
          sessionId: currentSession.id!,
          clientId: selectedClient?.id,
          machineId,
          outcome: "not_reached",
          machineSettings: clientMachineSettings[machineId]?.settings || {},
          studioId:
            contextActiveStudioId ||
            authTrainer?.primaryHomeStudioId ||
            selectedClient?.homeStudioId ||
            "",
          createdAt: Timestamp.now(),
        }),
      );

      /* Late against the Mindbody booking, when one matches. No match, no
         number (a guessed lateness is worse than none). */
      const startMs = toEpochMs(currentSession.startTime ?? currentSession.createdAt);
      const timing = sessionTimingFields(schedules, selectedClient?.id, startMs);
      const sessionExtras = timing
        ? {
            bookingStartTime: Timestamp.fromMillis(timing.bookingStartMs),
            startedLateByMinutes: timing.startedLateByMinutes,
          }
        : undefined;

      const finalLogs = [...stamped, ...notReached];
      await completeWorkoutSession(
        db,
        currentSession,
        selectedClient,
        finalLogs,
        undefined,
        currentSessionNotes,
        authTrainer,
        clientMachineSettings,
        user.uid,
        sessionExtras,
      );

      /* The wrap-up note is labelled "something the next trainer should
         know" — and until now it reached only the session document, which
         the next trainer's briefing never reads. It still goes there (the
         History list and the export read it); it ALSO files to the journal
         as a Heads up, which is the one loudness the briefing shows for the
         next three weeks. Outside the batch, like every journal write. */
      const wrap = (currentSessionNotes || "").trim();
      if (wrap) {
        createJournalEntry(
          selectedClient.id,
          contextActiveStudioId || authTrainer?.primaryHomeStudioId || selectedClient.homeStudioId || "",
          { id: user.uid, initials: authTrainer?.initials || "", fullName: authTrainer?.fullName || "" },
          {
            kind: "general",
            category: null,
            body: wrap.slice(0, 5000),
            importance: "elevated",
            machineId: null,
            focusId: null,
            sessionId: currentSession.id ?? null,
            origin: "post_session",
          },
        ).catch(() => toastError("Session saved. The wrap-up note could not reach the journal — add it from Notes."));
      }

      /* The read the post-session screen shows: today against the last
         performed set per machine, and the journey since the first
         session — computed here, once, from the grid's view of history. */
      const priorOf = (machineId: string): PriorSet | undefined => {
        const row = gridRows.find((r) => r.machine.id === machineId);
        if (!row) return undefined;
        const sets = orderedSets(row, gridHistory);
        const last = sets[sets.length - 1];
        return last
          ? { weight: last.weight, reps: last.reps ?? null, seconds: last.seconds ?? null, isTSC: !!last.isTSC, quality: last.quality }
          : undefined;
      };
      const machineName = (id: string) => floorMachines.find((m) => m.id === id)?.name || id;
      const lines = todayLines({ order: activeMachineIds, logs: finalLogs, nameOf: machineName, priorOf });
      const todayWeight = new Map(lines.filter((l) => l.outcome === "performed").map((l) => [l.machineId, l.weight]));
      const journey = strengthJourney(
        gridRows.map((row) => {
          const sets = orderedSets(row, gridHistory);
          const first = computeRowStats(row, gridHistory).first;
          const performedToday = todayWeight.has(row.machine.id);
          const nowWeight = performedToday ? todayWeight.get(row.machine.id) ?? null : sets[sets.length - 1]?.weight ?? null;
          return {
            machineId: row.machine.id,
            name: row.machine.name,
            group: row.machine.group,
            startWeight: row.startingWeight ?? sets[0]?.weight ?? null,
            nowWeight,
            sessions: sets.length + (performedToday ? 1 : 0),
            startDate: row.startingWeightDate ?? first?.session.date ?? null,
          };
        }),
      );

      setPostSession({
        session: { ...currentSession, status: "Completed", endTime: new Date() },
        client: selectedClient,
        logs: finalLogs,
        lines,
        journey,
        draft: hasDraftText(noteDraft) ? noteDraft : null,
      });
      clearSessionDraft(currentSession?.id);
      setNoteDraft(null);
      forgetLiveSession(currentSession?.id);
      setCurrentSession(null);
      setCurrentSessionNotes("");
      setShowEndConfirmation(false);
      setIsPostSessionMode(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "sessions");
    } finally {
      setIsSyncing(false);
    }
  };

  /** The dose Dial writes the moment it is tapped — no save button. A cleared
      dial stores nothing (`deleteField`): untouched is "not judged", never 0. */
  const savePostSessionDose = async (dose: DialValue | null) => {
    if (!postSession?.session.id) return;
    try {
      await updateDoc(doc(db, "sessions", postSession.session.id), { dose: dose === null ? deleteField() : dose });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "sessions");
    }
  };

  /** Files the session's unsaved draft as a note — from the post-session card, or on the way out. */
  const fileSessionDraft = async (text: string, importance: JournalImportance = "standard") => {
    const snap = postSession;
    const body = text.trim();
    if (!snap || !body || !user?.uid) return;
    const d = snap.draft;
    const kind = d?.category && d.category !== "ford" && d.category !== "admin"
      ? NOTE_CATEGORY_META[d.category].kind
      : "general";
    try {
      const id = await createJournalEntry(
        snap.client.id,
        contextActiveStudioId || authTrainer?.primaryHomeStudioId || snap.client.homeStudioId || "",
        { id: user.uid, initials: authTrainer?.initials || "", fullName: authTrainer?.fullName || "" },
        {
          kind: kind || "general",
          category: d?.category === "coaching" ? d.p : null,
          body: body.slice(0, 5000),
          importance: d?.importance ?? importance,
          machineId: d?.aboutMachine ? d?.machineId ?? null : null,
          focusId: null,
          sessionId: snap.session.id ?? null,
          origin: "in_session",
        },
      );
      if (!id) toastError("That note could not be saved — add it from the Journal.");
    } catch {
      toastError("That note could not be saved — add it from the Journal.");
    }
    setPostSession((s) => (s ? { ...s, draft: null } : s));
  };
  const dropSessionDraft = () => setPostSession((s) => (s ? { ...s, draft: null } : s));

  /** Leaving the post-session screen files the closing note, if any, and goes home. */
  const leavePostSession = async (closing?: { noteContent: string; importance: JournalImportance; effectiveUntil?: Date | null }) => {
    const snap = postSession;
    // A draft the trainer neither saved nor dropped is filed, unfiled, on the
    // way out. The To-file tray exists for exactly this; losing it does not.
    if (snap?.draft && hasDraftText(snap.draft)) await fileSessionDraft(snap.draft.body);
    const body = closing?.noteContent.trim() ?? "";
    if (snap && body && user?.uid) {
      try {
        const id = await createJournalEntry(
          snap.client.id,
          contextActiveStudioId || authTrainer?.primaryHomeStudioId || snap.client.homeStudioId || "",
          { id: user.uid, initials: authTrainer?.initials || "", fullName: authTrainer?.fullName || "" },
          {
            kind: "general",
            category: null,
            body: body.slice(0, 5000),
            importance: closing?.importance ?? "standard",
            effectiveUntil: closing?.importance && closing.importance !== "standard" ? (closing.effectiveUntil ?? null) : null,
            machineId: null,
            focusId: null,
            sessionId: snap.session.id ?? null,
            origin: "post_session",
          },
        );
        if (!id) toastError("Session saved. The closing note could not be saved — add it from the Journal.");
      } catch {
        toastError("Session saved. The closing note could not be saved — add it from the Journal.");
      }
    }
    setPostSession(null);
    setIsPostSessionMode(false);
    setSelectedClientId(null);
    setView("clients");
  };
  const [editingWeightSide, setEditingWeightSide] = useState<
    "Left" | "Right" | undefined
  >(undefined);

  const updateLog = (
    sessionId: string,
    machineId: string,
    field: keyof ExerciseLog,
    value: any,
    side?: "Left" | "Right",
  ) => {
    updateLogMultiple(sessionId, machineId, { [field]: value }, side);
  };

  /**
   * Setting a quality is what marks a set as done, so it must not be possible
   * before a count exists. Tapping a quality dot on an empty row used to create
   * a log with a weight and a quality but no reps or seconds — which reads as
   * complete on screen and scores zero in the session rollup.
   */
  const setQualityWithGuard = (
    sessionId: string,
    machineId: string,
    quality: number,
    side?: "Left" | "Right",
  ) => {
    const key = `${sessionId}_${machineId}${side ? "_" + side : ""}`;
    const log = logs[key];

    if (!hasRequiredCount(log)) {
      const needsSeconds = Boolean(log?.isStaticHold || log?.isTSC);
      toastError(
        needsSeconds
          ? "Enter the hold duration before setting a quality."
          : "Enter reps before setting a quality.",
      );
      // No dialog. This used to open the legacy PerformanceEntryDialog over
      // the tracker — a modal in the middle of a set, whose rep stepper was
      // based on LAST session's reps, so one tap of + logged last time's
      // number plus one as today's. The toast is enough: the count field is
      // right there on the bar. (docs/business/the-floor.md — ghost, never
      // pre-filled.)
      return;
    }

    updateLog(sessionId, machineId, "repQuality", quality, side);
  };

  /**
   * Exercise-log writes waiting to be sent, coalesced per document.
   *
   * A ref rather than state on purpose: this must survive re-renders without
   * causing them, and be readable synchronously from the unmount cleanup.
   */
  const pendingLogWritesRef = useRef<
    Map<
      string,
      { payload: Record<string, any>; timer: any; firstQueuedAt: number }
    >
  >(new Map());
  const lastHeartbeatWriteRef = useRef(0);

  const flushLogWrite = React.useCallback((docId: string) => {
    const pending = pendingLogWritesRef.current.get(docId);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    pendingLogWritesRef.current.delete(docId);

    setDoc(
      doc(db, "exerciseLogs", docId),
      { ...pending.payload, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch((error) =>
      handleFirestoreError(error, OperationType.WRITE, "exerciseLogs"),
    );
  }, []);

  const flushAllLogWrites = React.useCallback(() => {
    Array.from(pendingLogWritesRef.current.keys()).forEach(flushLogWrite);
  }, [flushLogWrite]);

  const queueLogWrite = React.useCallback(
    (docId: string, fields: Record<string, any>) => {
      const now = Date.now();
      const existing = pendingLogWritesRef.current.get(docId);
      const firstQueuedAt = existing?.firstQueuedAt ?? now;
      if (existing?.timer) clearTimeout(existing.timer);

      const payload = { ...(existing?.payload || {}), ...fields };

      if (now - firstQueuedAt >= LOG_WRITE_MAX_WAIT_MS) {
        pendingLogWritesRef.current.set(docId, {
          payload,
          timer: null,
          firstQueuedAt,
        });
        flushLogWrite(docId);
        return;
      }

      pendingLogWritesRef.current.set(docId, {
        payload,
        timer: setTimeout(() => flushLogWrite(docId), LOG_WRITE_DEBOUNCE_MS),
        firstQueuedAt,
      });
    },
    [flushLogWrite],
  );

  /*
   * Nothing may sit in the queue when this screen goes away -- leaving a
   * session is the exact case this whole change exists to fix, so an unflushed
   * buffer at unmount would reintroduce the bug in miniature. Firestore's SDK
   * lives above this component, so a write issued here still completes after
   * the component is gone.
   */
  useEffect(() => {
    const flushNow = () => flushAllLogWrites();
    window.addEventListener("beforeunload", flushNow);
    document.addEventListener("visibilitychange", flushNow);
    return () => {
      window.removeEventListener("beforeunload", flushNow);
      document.removeEventListener("visibilitychange", flushNow);
      flushAllLogWrites();
    };
  }, [flushAllLogWrites]);

  /**
   * Saves a set. The write goes to Firestore immediately — it is not deferred
   * to the end of the session.
   *
   * This used to touch React state only, leaving every rep entered during a
   * session in memory alone until "finish" ran completeWorkoutSession. Three
   * things fell out of that, all reported from the floor:
   *   - This screen is mounted as {currentView === "workouts" && <.../>}, so
   *     navigating away unmounted it and discarded the lot. Coming back showed
   *     only the placeholder logs written at session start.
   *   - A crash or a reload mid-session lost the same way.
   *   - A second trainer taking the session over saw nothing, because the first
   *     trainer's reps had never reached the database.
   * The exerciseLogs snapshot below compounded it: it rebuilds the whole `logs`
   * map from Firestore, so ANY log change quietly erased in-memory-only sets.
   *
   * Local state is still updated first so the HUD stays instant; the write
   * follows and reconciles through the snapshot.
   */
  const updateLogMultiple = (
    sessionId: string,
    machineId: string,
    updates: Partial<ExerciseLog>,
    side?: "Left" | "Right",
  ) => {
    const key = logDocId(sessionId, machineId, side);
    const currentSettings = clientMachineSettings[machineId]?.settings || {};

    /* The per-machine clock goes onto the log the first time anything is
       written for the machine — never earlier, so the weight-only placeholder
       session start seeded for a machine that was only looked at stays
       untouched and reads as "not reached" at Finish (isBegunLog). After a
       refresh startedAtFor reads the clock back from here. */
    const startedAt = machineStartedAt.current[machineId];
    if (
      startedAt !== undefined &&
      updates.machineStartedAt === undefined &&
      logs[key]?.machineStartedAt === undefined
    ) {
      updates = { ...updates, machineStartedAt: startedAt };
    }

    /* Sessions started before this change have logs under random ids; keep
       writing to those rather than stranding them behind a derived id. */
    const existingId = logs[key]?.id;
    const docId =
      existingId && !String(existingId).startsWith("temp_")
        ? String(existingId)
        : key;

    setLogs((prev) => {
      const prevLog = prev[key];
      const updatedLog: ExerciseLog = {
        ...(prevLog || {}),
        sessionId,
        clientId,
        machineId,
        ...(side ? { side } : {}),
        ...updates,
        id: docId,
        machineSettings: currentSettings,
        createdAt: prevLog?.createdAt ?? Timestamp.now(),
      } as any;

      return { ...prev, [key]: updatedLog };
    });

    /* undefined is rejected by Firestore, and callers pass partials — strip
       before writing rather than trusting every call site. */
    const payload: Record<string, any> = {
      sessionId,
      machineId,
      machineSettings: currentSettings,
      updatedAt: serverTimestamp(),
    };
    if (side) payload.side = side;
    if (clientId) payload.clientId = clientId;
    Object.entries(updates).forEach(([k, v]) => {
      // `id` is the document's own name, never a field on it.
      if (k !== "id" && v !== undefined) payload[k] = v;
    });
    if (!logs[key]) {
      payload.createdAt = serverTimestamp();
      /* Same precedence as the session-start placeholder (hosting studio
         first, client's home studio as the fallback). They disagreed, so a
         cross-train session's logs were split between the two studios
         depending on which writer got there first. */
      payload.studioId =
        contextActiveStudioId ||
        authTrainer?.primaryHomeStudioId ||
        selectedClient?.homeStudioId ||
        "";
      payload.homeStudioId = selectedClient?.homeStudioId || "";
      payload.clientHomeStudioId = selectedClient?.homeStudioId || "";
    }

    /* Queued, then merged, so a set built up over several calls (weight now,
       reps a moment later) becomes ONE write rather than one per field. */
    queueLogWrite(docId, payload);

    // Soft Lock Heartbeat: throttled -- it marks the session alive, nothing more.
    if (currentSession?.id === sessionId) {
      const now = Date.now();
      if (now - lastHeartbeatWriteRef.current >= HEARTBEAT_MIN_INTERVAL_MS) {
        lastHeartbeatWriteRef.current = now;
        updateDoc(doc(db, "sessions", sessionId), {
          lastHeartbeatAt: serverTimestamp(),
        }).catch(console.error);
      }
    }
  };

  const [isDeletingSession, setIsDeletingSession] = useState(false);

  const confirmScrapSession = async () => {
    setIsDeletingSession(true);
    try {
      if (currentSession?.id) {
        await deleteSession(currentSession.id);
      } else {
        setCurrentSession(null);
        setLogs({});
        setSelectedClientId(null);
        setView("clients");
        setShowCancelConfirmation(false);
      }
    } finally {
      setIsDeletingSession(false);
    }
  };

  /* ------------------------------------------------------------------ *
   * JOURNEY GRID (Active Session)
   *
   * The session log is the shared Journey Grid with a live Today column.
   * Nothing about persistence changes: every input still goes through
   * updateLogMultiple / setQualityWithGuard into the local `logs` map, and
   * commitEndSession writes that map exactly as before. Torso Rotation
   * keeps its Left/Right logs — the Today cell shows two outcome rows.
   * ------------------------------------------------------------------ */
  // Canonical id first: a studio that renames its torso rotation — which the
  // template boundary explicitly invites — used to lose its Left/Right fields
  // to a name-only check. src/lib/floor-machines.ts.
  const isSidesMachine = (m: Machine) => isPerSideMachine(m);

  /** Past sessions, oldest → newest. Capped at the 30 the logs listener covers. */
  const gridHistory = useMemo(
    () =>
      toJourneySessions(
        sessions
          .filter((s) => (currentSession ? s.id !== currentSession.id : true))
          .slice(0, 30),
      ),
    [sessions, currentSession],
  );

  const [gridVisible, setGridVisible] = useState(6);
  const gridVisibleHistory = useMemo(
    () => gridHistory.slice(Math.max(0, gridHistory.length - gridVisible)),
    [gridHistory, gridVisible],
  );

  const gridRows = useMemo(() => {
    const ordered = [...floorMachines].sort(
      (a, b) =>
        resolveMachineOrder(
          a.id,
          a.order,
          a.id ? studioFloorById[a.id]?.order : undefined,
        ) -
        resolveMachineOrder(
          b.id,
          b.order,
          b.id ? studioFloorById[b.id]?.order : undefined,
        ),
    );
    const historyLogs = (Object.values(logs) as ExerciseLog[]).filter(
      (l) => !currentSession || l.sessionId !== currentSession.id,
    );
    const starred = new Set(
      ordered.filter((m) => isBig5Machine(m.name)).map((m) => m.id!),
    );
    const orderIndex = new Map<string, number>(
      gridHistory.map((s, i) => [s.id, i] as const),
    );
    return toJourneyRows(ordered, historyLogs, clientMachineSettings, starred).map(
      (row) => {
        const machine = ordered.find((m) => m.id === row.machine.id);
        if (!machine) return row;
        const setting = clientMachineSettings[machine.id!];
        const entries = orderMachineSettings(
          setting?.settings || {},
          machine.standardSettings || {},
          machine.settingOptions || [],
        );
        // "Last weight performed" — the newest PERFORMED set on record. A
        // practice set's lighter load must not become tomorrow's prescription.
        let lastWeight: number | undefined;
        let lastIdx = -1;
        for (const set of Object.values(row.sets)) {
          if (set.outcome !== "performed") continue;
          const i = orderIndex.get(set.sessionId) ?? -1;
          if (i > lastIdx) {
            lastIdx = i;
            lastWeight = set.weight;
          }
        }
        const notes = setting?.machineNotes || [];
        return {
          ...row,
          prescribedWeight:
            setting?.currentWeight ?? lastWeight ?? setting?.startingWeight,
          machine: {
            ...row.machine,
            settings: entries.length
              ? Object.fromEntries(entries.map(([k, v]) => [k, v]))
              : undefined,
            // orderMachineSettings returns [shortKey, value, fullName]; the
            // full name used to be dropped here, which left the rail with
            // unexplained letters and nothing for a screen reader to say.
            settingLabels: entries.length
              ? Object.fromEntries(entries.map(([k, , full]) => [k, full]))
              : undefined,
            alert: notes.some((n) => n.isImportant),
            noteCount: notes.length,
            sides: isSidesMachine(machine),
          },
        };
      },
    );
  }, [
    floorMachines,
    logs,
    clientMachineSettings,
    studioFloorById,
    currentSession,
    gridHistory,
  ]);

  const gridSections = useMemo<GridSection[]>(() => {
    const byId = new Map(gridRows.map((r) => [r.machine.id, r] as const));
    const routineRows = activeMachineIds
      .map((id) => byId.get(id))
      .filter(Boolean) as typeof gridRows;
    const inRoutine = new Set(activeMachineIds);
    const others = gridRows.filter((r) => !inRoutine.has(r.machine.id));
    return [
      { id: "routine", label: "Today's routine", rows: routineRows, numbered: true },
      {
        id: "others",
        label: "Not in today's routine",
        rows: others,
        collapsed: !showAllMachines,
        onToggle: () => setShowAllMachines(!showAllMachines),
        inactive: true,
      },
    ];
  }, [gridRows, activeMachineIds, showAllMachines]);

  const toNum = (v: unknown): number | null => {
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };

  /** Today's values, read straight out of the local `logs` map. */
  const gridLiveValues = useMemo(() => {
    const out: Record<string, LiveSet> = {};
    const sid = currentSession?.id;
    if (!sid) return out;
    for (const row of gridRows) {
      const id = row.machine.id;
      if (row.machine.sides) {
        const L = logs[`${sid}_${id}_Left`];
        const R = logs[`${sid}_${id}_Right`];
        if (!L && !R) continue;
        out[id] = {
          weight: toNum(L?.weight ?? R?.weight),
          reps: toNum(L?.reps),
          seconds: toNum(L?.seconds),
          isTSC: !!(L?.isTSC || L?.isStaticHold || R?.isTSC || R?.isStaticHold),
          quality: (L?.repQuality as RepQuality | undefined) ?? null,
          repsR: toNum(R?.reps),
          secondsR: toNum(R?.seconds),
          qualityR: (R?.repQuality as RepQuality | undefined) ?? null,
          // The outcome is per machine, written on both sides alike.
          outcome: L?.outcome ?? R?.outcome ?? null,
          skipReason: L?.skipReason ?? R?.skipReason ?? null,
        };
      } else {
        const log = logs[`${sid}_${id}`];
        if (!log) continue;
        out[id] = {
          weight: toNum(log.weight),
          reps: toNum(log.reps),
          seconds: toNum(log.seconds),
          isTSC: !!(log.isTSC || log.isStaticHold),
          quality: (log.repQuality as RepQuality | undefined) ?? null,
          outcome: log.outcome ?? null,
          skipReason: log.skipReason ?? null,
        };
      }
    }
    return out;
  }, [logs, gridRows, currentSession?.id]);

  /**
   * Where the trainer is working.
   *
   * This is a SEED, not a live driver, and the difference is the whole point.
   *
   * It used to be the fallback whenever no machine had been tapped, which made
   * focus move on its own: entering reps auto-fills the quality mark, that
   * completes the row, this memo recomputes, and the Now bar jumps to the next
   * machine — while the trainer is still deciding whether the set they just
   * watched was a max effort or one that broke down. The screen moved on
   * mid-judgement, and the quality mark it had already filled in for them was
   * the default one.
   *
   * So focus is seeded once when a session opens (from the first incomplete
   * machine, so resuming a part-logged session lands in the right place) and
   * afterwards moves only when the trainer says so — the Next button, a tap on
   * a Today cell, or logging a TSC.
   */
  const firstIncompleteMachineId = useMemo(() => {
    if (!currentSession?.id) return null;
    for (const id of activeMachineIds) {
      const v = gridLiveValues[id];
      const settled = v?.outcome === "practice" || v?.outcome === "skipped";
      const done = settled || (!!v && !!(v.isTSC ? v.seconds : v.reps) && !!v.quality);
      if (!done) return id;
    }
    return activeMachineIds[0] ?? null;
  }, [activeMachineIds, gridLiveValues, currentSession?.id]);
  const [focusMachineOverride, setFocusMachineOverride] = useState<string | null>(null);
  const seededFocusForSession = useRef<string | null>(null);

  useEffect(() => {
    const sessionId = currentSession?.id ?? null;
    if (!sessionId) {
      seededFocusForSession.current = null;
      setFocusMachineOverride(null);
      return;
    }
    // Once per session, and only after the routine has loaded — seeding from
    // an empty list would pin focus to nothing and never correct itself.
    if (seededFocusForSession.current === sessionId) return;
    if (activeMachineIds.length === 0) return;
    seededFocusForSession.current = sessionId;
    setFocusMachineOverride(firstIncompleteMachineId ?? activeMachineIds[0]);
  }, [currentSession?.id, activeMachineIds, firstIncompleteMachineId]);

  /**
   * The fallback survives for exactly one case now: the focused machine being
   * dropped from the session. Anything else and the override holds, which is
   * what keeps the screen still while a set is being judged.
   */
  const gridFocusMachineId =
    focusMachineOverride && activeMachineIds.includes(focusMachineOverride)
      ? focusMachineOverride
      : firstIncompleteMachineId;

  /* Arriving at a machine starts its clock. Focus only moves on a deliberate
     act now — Next, a tap on a Today cell, a logged TSC — so this is a real
     signal about where the trainer is standing, which it was not while focus
     advanced by itself. */
  useEffect(() => {
    gridFocusMachineIdRef.current = gridFocusMachineId ?? null;
    if (gridFocusMachineId) markMachineStarted(gridFocusMachineId);
    // The Now bar moved: the previous machine's clock stops, this one's runs.
    focusMachine(machineClocks.current, gridFocusMachineId ?? null);
  }, [gridFocusMachineId, markMachineStarted]);

  /* --- what the Now bar reads. All derived from state that already
     existed for the grid; the bar adds no source of truth of its own. --- */
  const gridFocusRow = useMemo(
    () => (gridFocusMachineId ? gridRows.find((r) => r.machine.id === gridFocusMachineId) : undefined),
    [gridRows, gridFocusMachineId],
  );
  const gridFocusOrder = useMemo(() => {
    const i = gridFocusMachineId ? activeMachineIds.indexOf(gridFocusMachineId) : -1;
    return i >= 0 ? i + 1 : undefined;
  }, [activeMachineIds, gridFocusMachineId]);
  const gridNextRow = useMemo(() => {
    const i = gridFocusMachineId ? activeMachineIds.indexOf(gridFocusMachineId) : -1;
    const nextId = activeMachineIds[i + 1];
    return nextId ? gridRows.find((r) => r.machine.id === nextId) : undefined;
  }, [activeMachineIds, gridFocusMachineId, gridRows]);
  /* "Started 2:21 PM" on the session bar — the second thing a trainer
     checks when two iPads sit side by side (the first is the name). */
  const sessionStartedLabel = useMemo(() => {
    const raw = currentSession?.startTime ?? (currentSession as any)?.clientStartTime;
    if (!raw) return null;
    const d = typeof raw?.toDate === "function" ? raw.toDate() : new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }, [currentSession]);

  const gridDoneCount = useMemo(
    () =>
      activeMachineIds.filter((id) => {
        const v = gridLiveValues[id];
        if (v?.outcome === "practice" || v?.outcome === "skipped") return true;
        return !!v && (v.isTSC ? v.seconds != null : v.reps != null);
      }).length,
    [activeMachineIds, gridLiveValues],
  );

  /** Grid → logs. Mirrors what the old entry dialog wrote, field by field. */
  const handleGridLiveChange = (machineId: string, patch: Partial<LiveSet>) => {
    /* A trainer can log a machine without ever focusing it — tapping straight
       into its cell in the grid. First touch counts as arrival. */
    markMachineStarted(machineId);
    const sessionId = currentSession?.id;
    if (!sessionId) return;
    const row = gridRows.find((r) => r.machine.id === machineId);
    const sides = !!row?.machine.sides;
    const current = gridLiveValues[machineId];
    const shownWeight = current?.weight ?? row?.prescribedWeight ?? null;
    const str = (v: number | null | undefined) =>
      v === null || v === undefined ? "" : String(v);
    // A set logged without ever touching the weight keeps the weight that
    // was on screen (the prescription) — the old dialog did the same.
    const withWeight = (
      u: Partial<ExerciseLog>,
      side?: "Left" | "Right",
    ): Partial<ExerciseLog> => {
      const existing = logs[`${sessionId}_${machineId}${side ? "_" + side : ""}`];
      if ((!existing || !existing.weight) && shownWeight !== null && u.weight === undefined) {
        return { ...u, weight: String(shownWeight) };
      }
      return u;
    };
    const sideL = sides ? "Left" : undefined;

    if (patch.weight !== undefined) {
      updateLogMultiple(sessionId, machineId, { weight: str(patch.weight) }, sideL);
      if (sides) updateLogMultiple(sessionId, machineId, { weight: str(patch.weight) }, "Right");
    }
    /* The outcome — practice or skipped, or null to clear it — is written to
       every side of the machine at once, with the reason and its note. A
       practice set keeps the load on screen (the trainer used it); a skip
       carries no load at all. Either closes the machine's clock. */
    if (patch.outcome !== undefined) {
      const o: Partial<ExerciseLog> = {
        outcome: patch.outcome,
        skipReason: patch.outcome === "skipped" ? patch.skipReason ?? "other" : null,
        skipNote: patch.outcome === "skipped" ? patch.skipNote ?? null : null,
        machineEndedAt: patch.outcome ? Date.now() : null,
      } as Partial<ExerciseLog>;
      const u = patch.outcome === "practice" ? withWeight(o, sideL) : o;
      updateLogMultiple(sessionId, machineId, u, sideL);
      if (sides) updateLogMultiple(sessionId, machineId, patch.outcome === "practice" ? withWeight(o, "Right") : o, "Right");
    }
    if (patch.isTSC !== undefined) {
      const u = { isTSC: patch.isTSC, isStaticHold: patch.isTSC };
      updateLogMultiple(sessionId, machineId, withWeight(u, sideL), sideL);
      if (sides) updateLogMultiple(sessionId, machineId, withWeight(u, "Right"), "Right");
    }
    if (patch.reps !== undefined)
      updateLogMultiple(sessionId, machineId, withWeight({ reps: str(patch.reps) }, sideL), sideL);
    if (patch.seconds !== undefined)
      updateLogMultiple(sessionId, machineId, withWeight({ seconds: str(patch.seconds) }, sideL), sideL);
    if (patch.repsR !== undefined)
      updateLogMultiple(sessionId, machineId, withWeight({ reps: str(patch.repsR) }, "Right"), "Right");
    if (patch.secondsR !== undefined)
      updateLogMultiple(sessionId, machineId, withWeight({ seconds: str(patch.secondsR) }, "Right"), "Right");
    // "Done" stopped being a button: recording an effort completes the set,
    // and the two remaining buttons flag the sets that were not ordinary.
    // updateLog directly rather than setQualityWithGuard — that guard reads
    // `logs` from state, which has not yet seen the reps being written in
    // this same handler, so it would fire its "enter reps first" toast.
    const recorded = (v: number | null | undefined) =>
      v !== undefined && v !== null && Number(v) > 0;
    if (
      patch.quality === undefined &&
      (recorded(patch.reps) || recorded(patch.seconds)) &&
      !current?.quality
    ) {
      updateLog(sessionId, machineId, "repQuality", 2, sideL);
    }
    if (
      patch.qualityR === undefined &&
      (recorded(patch.repsR) || recorded(patch.secondsR)) &&
      !current?.qualityR
    ) {
      updateLog(sessionId, machineId, "repQuality", 2, "Right");
    }
    if (patch.quality !== undefined && patch.quality !== null)
      setQualityWithGuard(sessionId, machineId, patch.quality, sideL);
    if (patch.qualityR !== undefined && patch.qualityR !== null)
      setQualityWithGuard(sessionId, machineId, patch.qualityR, "Right");
  };

  const gridLive: LiveColumn | undefined = currentSession?.id
    ? {
        session: {
          id: currentSession.id,
          sessionNumber: currentSession.sessionNumber || sessions.length,
          date: toIsoDate(currentSession.date || studioTodayKey()),
          trainerInitials: (
            currentSession.trainerInitials ||
            authTrainer?.initials ||
            ""
          ).toUpperCase(),
        },
        routineMachineIds: activeMachineIds,
        values: gridLiveValues,
        onChange: handleGridLiveChange,
        /* Straight in. The "+" only appears on a machine that is not in
           today's routine, so the tap is already unambiguous — and a trainer
           who has spare time and wants a bicep curl should not have to
           confirm that they meant it. Removing it is the reverse of a
           decision made when this was built ("prompts before adding it,
           rather than toggling it in silently"); silence is the point. */
        onAddMachine: (id: string) => {
          if (activeMachineIds.includes(id)) return;
          applySessionMachineIds([...activeMachineIds, id]);
        },
        focusMachineId: gridFocusMachineId,
        onFocusMachine: setFocusMachineOverride,
        weightStep: 2,
      }
    : undefined;

  /* Which of the three screens to draw - the order matters and is a tested
     rule (lib/tracker-screen.ts). After Finish the sessions stream reports
     "nothing running" and turns pre-session mode on; checking the briefing
     first, as this used to, sent the trainer back to the briefing instead
     of the post-session screen they had just been shown. */
  const screen = trackerScreen({
    isPostSessionMode,
    hasPostSessionSnapshot: !!postSession,
    isPreSessionMode,
    hasClient: !!(clientId && selectedClient),
    hasCurrentSession: !!currentSession,
  });

  if (screen === "post-session" && postSession) {
    return (
      <VictoryHUDScreen
        client={postSession.client}
        session={postSession.session}
        logs={postSession.logs}
        allLogs={Object.values(logs).filter((l: any) => l.clientId === postSession.client.id) as any}
        lines={postSession.lines}
        journey={postSession.journey}
        schedules={schedules}
        authTrainer={authTrainer}
        onDose={savePostSessionDose}
        onLeave={leavePostSession}
        unsavedDraft={postSession.draft}
        onSaveDraft={fileSessionDraft}
        onDropDraft={dropSessionDraft}
        machines={floorMachines}
        rightControls={rightControls}
        trainerDropdown={trainerDropdown}
        onStudioClick={onStudioClick}
      />
    );
  }

  if (screen === "none") {
    return null; // The app routing will ensure this is never reached by redirecting to ClientDirectoryView instead
  }

  if (screen === "briefing" && selectedClient) {

    const shouldShowWizard =
      selectedClient.requiresConsultation === true &&
      selectedClient.consultationCompleted === false;

    if (shouldShowWizard) {
      return (
        <ConsultationSetupWizard
          clientName={clientFirstName(selectedClient)}
          onComplete={async (setupData) => {
            // Optional: update client with gender/age setup
            await updateDoc(doc(db, "clients", selectedClient.id!), {
              gender: setupData.gender || selectedClient.gender,
              consultationCompleted: true,
              requiresConsultation: false,
              updatedAt: serverTimestamp(),
            }).catch((e) => console.error(e));

            if (setupData.routine && setupData.routine.length > 0) {
              const machineNames = setupData.routine.map((r: any) => r.name);
              const customMachineIds = floorMachines
                .filter((m) => machineNames.includes(m.name))
                .map((m) => m.id as string);
              startNewSession(
                "A",
                undefined,
                customMachineIds,
                "Consultation Baseline Protocol Generated",
              );
            } else {
              // If skipped, we don't start a session, just let the state refresh
              // which will cause the wizard to disappear because consultationCompleted is now true
              setIsPreSessionMode(true); // Land them on the BriefingScreen instead of hiding it
            }
          }}
          onCancel={() => {
            setIsPreSessionMode(false);
            setView("profile");
          }}
        />
      );
    }

    return (
      <BriefingScreen
        authTrainer={authTrainer}
        client={selectedClient}
        targetRoutine={targetRoutine}
        lastSession={
          sessions.filter((s) => s.status === "Completed")[0] || null
        }
        sessions={sessions.filter((s) => s.status === "Completed")}
        onStart={(routineType, customMachines, note, checkIn) =>
          startNewSession(
            routineType,
            undefined,
            customMachines,
            note,
            checkIn,
          )
        }
        onClose={() => {
          setIsPreSessionMode(false);
          setView("profile");
        }}
        machines={floorMachines}
        routines={routines}
        trainers={trainers}
        logs={
          Object.values(logs).filter(
            (l: any) => !l.clientId || l.clientId === clientId,
          ) as any
        }
        isIntroSession={isIntroSession}
        rightControls={rightControls}
        trainerDropdown={trainerDropdown}
        onStudioClick={onStudioClick}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "h-full min-h-0 flex flex-col overflow-hidden relative",
      )}
    >
      {isIntroSession && (
        <div className="bg-orange-500 dark:bg-orange-600 p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-orange-500/20 border border-white/20 animate-pulse mt-2 mx-4 relative z-40">
          <Sparkles className="w-5 h-5 text-foreground" />
          <span className="text-foreground font-black uppercase italic tracking-[0.15em] text-xs">
            NEW CLIENT INTRODUCTORY SESSION: CONVERSATIONAL BASELINE
          </span>
          <Sparkles className="w-5 h-5 text-foreground" />
        </div>
      )}
      {/* Zone 1 — session bar. In flow, one row, 48px. It used to be a
          position:fixed two-row overlay (min-h-25) that the grid had to pad
          around; the shell is a real flex column now, so it just sits here.
          Focus moved out of here entirely — it filters the routine list, so
          it belongs on the grid rail beside the list it filters. */}
      {(selectedClient || currentSession) && (
        <div className="jg-sbar">
          <div className="jg-sbar__client">
            <h3 className="jg-sbar__name">
              {selectedClient
                ? clientDisplayName(selectedClient)
                : currentSession?.isUnassigned
                  ? "Unassigned Tracking"
                  : "Initializing..."}
            </h3>
            <div className="jg-sbar__meta">
              <span>
                <b>#{currentSession?.sessionNumber || sessions.length}</b>
              </span>
              <span aria-hidden>·</span>
              <span>{authTrainer?.initials || currentSession?.trainerInitials || "??"}</span>
              {sessionStartedLabel && (
                <>
                  <span aria-hidden>·</span>
                  <span>Started {sessionStartedLabel}</span>
                </>
              )}
            </div>
          </div>
          {/* The marker: small, red when something is critical, one tap for
              the whole of it, never a dialog that has to be dismissed. */}
          {flags.count > 0 && (
            <button
              type="button"
              className={cn("jg-sbar__flag", flags.severe && "jg-sbar__flag--severe")}
              onClick={() => setIsShowingFlags(true)}
              aria-label={`${flags.count} ${flags.count === 1 ? "thing" : "things"} to know about ${clientFirstName(selectedClient)}. Open.`}
              title="What to know before you touch the machine"
            >
              <ShieldAlert size={14} strokeWidth={2.75} aria-hidden="true" />
              <span>{flags.count}</span>
            </button>
          )}
          {currentSession && (
            <ActiveSessionTimer
              variant="bar"
              startTime={currentSession.startTime}
              fallbackStartTime={(currentSession as any).clientStartTime}
              pausedAt={(currentSession as any).pausedAt}
              totalPausedMs={(currentSession as any).totalPausedMs}
              onTogglePause={toggleSessionPause}
            />
          )}
          {currentSession && activeMachineIds.length > 0 && (
            <div
              className="jg-sbar__progress"
              aria-label={`${gridDoneCount} of ${activeMachineIds.length} machines logged`}
            >
              <span className="jg-sbar__progress-text">
                {gridDoneCount} <small>of {activeMachineIds.length}</small>
              </span>
              <span className="jg-sbar__meter" aria-hidden>
                <i style={{ width: `${Math.round((100 * gridDoneCount) / activeMachineIds.length)}%` }} />
              </span>
            </div>
          )}

          <span className="jg-sbar__sp" />

          <button
            type="button"
            className="jg-sbar__btn"
            onClick={() => setIsShowingSessionNotes(true)}
            aria-label="Session notes"
          >
            <MessageSquare size={15} strokeWidth={2.5} className="fill-current" />
            <span>Notes</span>
          </button>
          {/* The assessment (one name for it, everywhere), reachable without
              ending the session. A trainer has about ninety seconds while a
              client works the lumbar machine, and what they want to do with
              it is record the one thing the client just said. */}
          <button
            type="button"
            className="jg-sbar__btn"
            onClick={() => setIsShowingAssessment(true)}
            aria-label="Open the Pulse"
            title="Update the Pulse without leaving the session"
          >
            <HeartPulse size={15} strokeWidth={2.5} />
            <span>Pulse</span>
          </button>
          {/* Past the divider: the two buttons that END the session. Discard
              is a trash icon because it is pressed once a month; Finish is
              the one loud button because it is pressed every session. */}
          <div className="jg-sbar__end">
            <button
              type="button"
              className="jg-sbar__trash"
              onClick={() => setShowCancelConfirmation(true)}
              aria-label="Discard this session"
              title="Discard this session without saving"
            >
              <Trash2 size={17} strokeWidth={2.4} />
            </button>
            <button type="button" className="jg-sbar__finish" onClick={handleEndSessionPress}>
              Finish
            </button>
          </div>
        </div>
      )}
      {/* Machine Performance Entry Dialog */}
      {editingWeightMachineId &&
        currentSession &&
        (() => {
          const theMachine = floorMachines.find(
            (m) => m.id === editingWeightMachineId,
          )!;
          const isTorso = theMachine.name
            .toLowerCase()
            .includes("torso rotation");

          let sideToUse = editingWeightSide;
          if (isTorso) sideToUse = undefined; // We handle both sides in the dialog

          const keyL = `${currentSession.id}_${editingWeightMachineId}_Left`;
          const keyR = `${currentSession.id}_${editingWeightMachineId}_Right`;
          const keyDef = `${currentSession.id}_${editingWeightMachineId}${sideToUse ? "_" + sideToUse : ""}`;

          const logL = isTorso ? logs[keyL] : logs[keyDef];
          const logR = isTorso ? logs[keyR] : undefined;

          let currentWeight =
            (isTorso ? logL?.weight || logR?.weight : logL?.weight) || "0";
          const clientId = currentSession.clientId || selectedClient?.id;
          if (currentWeight === "0" && clientId) {
            currentWeight = getLatestTargetWeight(
              clientId,
              editingWeightMachineId,
              sessions,
              Object.values(logs),
              sideToUse,
            );
          }

          const currentRepsLeft = logL
            ? logL?.isStaticHold
              ? logL.seconds || ""
              : logL?.reps || ""
            : "";
          const currentRepsRightStr = logR
            ? logR?.isStaticHold
              ? logR.seconds || ""
              : logR?.reps || ""
            : "";

          return (
            <PerformanceEntryDialog
              machine={theMachine}
              side={sideToUse}
              isTorsoFull={isTorso}
              machineSettings={clientMachineSettings[editingWeightMachineId]}
              currentWeight={currentWeight}
              currentReps={currentRepsLeft}
              currentRepsRight={isTorso ? currentRepsRightStr : undefined}
              currentQuality={logL?.repQuality || 0}
              pastMachineLogs={sessions
                .filter((s) =>
                  currentSession ? s.id !== currentSession.id : true,
                )
                .map((s) => {
                  const log =
                    logs[
                      `${s.id}_${editingWeightMachineId}${isTorso ? "_Left" : sideToUse ? "_" + sideToUse : ""}`
                    ] || logs[`${s.id}_${editingWeightMachineId}`];
                  return log && log.weight ? { log, session: s } : null;
                })
                .filter(
                  (x): x is { log: ExerciseLog; session: WorkoutSession } =>
                    Boolean(x),
                )
                .slice(0, 3)}
              isStaticHold={isStaticHoldOverride || logL?.isStaticHold}
              onClose={() => {
                setEditingWeightMachineId(null);
                setEditingWeightSide(undefined);
                setIsStaticHoldOverride(false);
              }}
              onSave={async (
                weight,
                repsOrSeconds,
                quality,
                isHold,
                side,
                repsRightStr,
              ) => {
                /**
                 * `isStaticHold` and `isTSC` both mean "this set is timed", and
                 * hasRequiredCount treats them as an OR. Writing only one of
                 * them leaves the other stuck true, so a set switched back to
                 * reps is still judged as a hold — with `seconds` just zeroed —
                 * and can never satisfy the finish guard. They move together.
                 *
                 * One combined write per side rather than five sequential ones:
                 * updateLogMultiple also stamps a session heartbeat, so the old
                 * version fired five Firestore writes per set saved (ten for a
                 * torso rotation).
                 */
                const performanceFields = (
                  hold: boolean,
                  count: string,
                ): Partial<ExerciseLog> => ({
                  weight,
                  // The dialog's `quality` is a plain number (0 = none yet);
                  // the stored field is 1 | 2 | 3. canSave already refuses 0,
                  // so anything reaching here is a real rating.
                  repQuality: quality as ExerciseLog["repQuality"],
                  isStaticHold: hold,
                  isTSC: hold,
                  seconds: hold ? count : "0",
                  reps: hold ? "0" : count,
                });

                if (isTorso) {
                  // Both sides share the weight and quality, each keeps its own count.
                  updateLogMultiple(
                    currentSession.id!,
                    editingWeightMachineId,
                    performanceFields(isHold, repsOrSeconds),
                    "Left",
                  );
                  updateLogMultiple(
                    currentSession.id!,
                    editingWeightMachineId,
                    performanceFields(isHold, repsRightStr || "0"),
                    "Right",
                  );
                } else {
                  updateLogMultiple(
                    currentSession.id!,
                    editingWeightMachineId,
                    performanceFields(isHold, repsOrSeconds),
                    side,
                  );
                }

                setEditingWeightMachineId(null);
                setEditingWeightSide(undefined);
                // Must be cleared here too, not only in onClose: a stale `true`
                // opens the next machine's dialog in hold mode, storing its rep
                // count as `seconds` with reps "0".
                setIsStaticHoldOverride(false);
              }}
            />
          );
        })()}

      {/* First-time setup prompt — opens over the Entry HUD when the trainer
          reaches a machine this client has never performed. Same SettingsCard
          and SetupGuide the Equipment tab uses, so the ghosting rules and the
          journal sync behave identically; only `origin` differs. */}
      {setupPromptMachineId && (
        <SetupPromptDialog
          open
          machine={floorMachines.find((m) => m.id === setupPromptMachineId) || null}
          clientId={clientId || ""}
          clientSettings={clientMachineSettings}
          author={
            authTrainer
              ? {
                  // The Auth uid: the journalEntries rule pins authorId to it,
                  // and it differs from authTrainer.id on older accounts.
                  id: user.uid,
                  fullName:
                    authTrainer.fullName || authTrainer.initials || "Unknown",
                  initials: authTrainer.initials,
                }
              : null
          }
          sessionId={currentSession?.id || null}
          onClose={() => setSetupPromptMachineId(null)}
          onError={toastError}
          clientHomeStudioId={selectedClient?.homeStudioId ?? null}
        />
      )}

      {/* THE MACHINE SHEET. One target, one sheet.

          It replaces two modals that used to sit here: a "Machine Settings"
          dialog opened by tapping a machine, and a "Machine Notes" dialog
          opened by a small separate icon on the same row. Two near-identical
          targets, and a trainer standing at a machine with a client waiting
          had to know which one held the thing they wanted. A wrong guess
          cost two taps, so the honest outcome was that notes did not get
          written.

          Both entry points now land in the same place -- note the two
          handlers below the grid both call setSheetMachineId -- and the
          sheet stacks what it holds in the order the floor needs it:
          high-importance notes first, then the dials, then the note
          composer, then reference.

          It also fixes where the writes go. The old dialog wrote a third
          copy of every settings change into a `machineSettingChanges`
          collection that nothing in this app has ever read back, and its
          "reason for change" therefore went nowhere a trainer could find
          it. The sheet calls features/equipment/mutations.ts -- the same
          functions the Equipment tab calls -- so a change made mid-session
          is in clientMachineSettings, in the machine's settingHistory WITH
          its reason, and in the client's Journal, and is already showing on
          their Equipment tab before the trainer walks back to the desk. */}
      <MachineSheet
        open={!!sheetMachineId}
        firstTime={
          !!sheetMachineId &&
          (() => {
            const row = gridRows.find((r) => r.machine.id === sheetMachineId);
            return !row || orderedSets(row, gridHistory).length === 0;
          })()
        }
        machine={floorMachines.find((m) => m.id === sheetMachineId) || null}
        client={selectedClient}
        clientId={clientId || ""}
        clientSettings={clientMachineSettings}
        author={
          authTrainer
            ? {
                id: user.uid,
                fullName: authTrainer.fullName || authTrainer.initials || "Unknown",
                initials: authTrainer.initials,
              }
            : null
        }
        sessionId={currentSession?.id || null}
        onClose={() => setSheetMachineId(null)}
        onError={toastError}
      />

      {/* Exercise History Dialog */}
      {historyMachineId && clientId && (
        <ExerciseHistoryDialog
          clientId={clientId}
          machine={floorMachines.find((m) => m.id === historyMachineId)!}
          onClose={() => setHistoryMachineId(null)}
          user={user}
        />
      )}

      {/* Machine Details Modal */}
      {showClientPicker && (
        <ClientSelectionDialog
          clients={clients}
          onSelect={(id) => {
            setSelectedClientId(id);
            setShowClientPicker(false);
            setView("workouts");
          }}
          onClose={() => setShowClientPicker(false)}
        />
      )}

      {/* Client Selection Dialog (for assigning) */}
      <ClientSelectionDialog
        open={showAssignDialog}
        clients={clients}
        onSelect={assignSessionToClient}
        onClose={() => {
          setShowAssignDialog(false);
          setCurrentSession(null);
        }}
        title="Assign Completed Session"
        description="Choose which client's profile should receive this session's data."
      />

      {/* End Session Confirmation Dialog */}
      <Dialog open={showEndConfirmation} onOpenChange={setShowEndConfirmation}>
        <DialogContent className="sm:max-w-100 rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none">
          <div className="bg-primary p-8 text-foreground space-y-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-2">
              <AlertCircle className="w-6 h-6 text-foreground" />
            </div>
            <h3 className="text-2xl font-black italic uppercase tracking-tight">
              End Session?
            </h3>
            <p className="text-primary-foreground/90 font-medium text-sm leading-relaxed">
              Are you sure you want to conclude this{" "}
              {/*
                The optional chain guarded `currentSession` and NOT
                `sessionType`, so a session document without the field threw
                here and took the whole screen down with it — the End Session
                dialog is in the tree whether or not it is open, so the crash
                is at render, not at the tap.

                Every writer in the app sets it today, so this is a latent
                landmine rather than a live bug: any session written before
                the field existed, or by anything outside this codebase, ends
                a trainer's session with a white screen. HistoryList.tsx
                already guards the same field.

                Found by the render test in this round — it failed on its
                first run, before asserting anything.
              */}
              {currentSession?.sessionType?.toLowerCase() ?? "standard"} workout
              session?
            </p>
          </div>

          <div className="p-6 space-y-4">
            {currentSession?.isUnassigned ? (
              <div className="space-y-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground px-1 mb-2">
                  Unassigned Session Actions
                </p>
                <Button
                  className="w-full h-14 rounded-2xl font-black italic uppercase tracking-widest text-sm shadow-lg shadow-primary/20"
                  onClick={() => {
                    setShowEndConfirmation(false);
                    setShowAssignDialog(true);
                  }}
                >
                  <Users className="w-4 h-4 mr-3" /> Assign to Client
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-14 rounded-2xl font-black italic uppercase tracking-widest text-sm border-2"
                  onClick={() => {
                    setShowEndConfirmation(false);
                    setPendingAssignSession(currentSession);
                    onStartNewClientOnboarding("");
                    // We don't necessarily need to setView('clients') if the modal is global,
                    // but it helps if user cancels modal to be in a logical place.
                    setView("clients");
                  }}
                >
                  <PlusCircle className="w-4 h-4 mr-3" /> Create New Client
                </Button>
                <div className="py-2 flex items-center gap-4">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">
                    Danger Zone
                  </span>
                  <div className="h-px bg-border flex-1" />
                </div>
                <Button
                  variant="ghost"
                  className="w-full h-14 rounded-2xl font-black italic uppercase tracking-widest text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => deleteSession(currentSession!.id!)}
                >
                  <Trash2 className="w-4 h-4 mr-3" /> Delete Session
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.keys(endChoices).length > 0 && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                      Started, no count — record as
                    </label>
                    <p className="text-[11px] font-medium text-muted-foreground -mt-1">
                      Practice keeps the numbers for history without counting them. Skipped is the default. Not reached: the load was set up but the session ended first.
                    </p>
                    <div className="flex flex-col gap-2">
                      {Object.keys(endChoices).map((machineId) => {
                        const name =
                          floorMachines.find((m) => m.id === machineId)?.name || machineId;
                        const choice = endChoices[machineId];
                        return (
                          <div
                            key={machineId}
                            className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 dark:border-slate-800 px-3 py-2"
                          >
                            <span className="text-sm font-bold truncate">{name}</span>
                            <div
                              className="flex gap-1 shrink-0"
                              role="group"
                              aria-label={`Record ${name} as`}
                            >
                              {(["practice", "skipped", "not_reached"] as const).map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  aria-pressed={choice === opt}
                                  onClick={() =>
                                    setEndChoices((prev) => ({ ...prev, [machineId]: opt }))
                                  }
                                  className={cn(
                                    "h-10 px-3 rounded-xl text-[11px] font-black uppercase tracking-widest border-2 transition-colors",
                                    choice === opt
                                      ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
                                      : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300",
                                  )}
                                >
                                  {OUTCOME_LABEL[opt]}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    Wrap-up note (optional)
                  </label>
                  <Textarea
                    value={currentSessionNotes}
                    onChange={(e) => setCurrentSessionNotes(e.target.value)}
                    placeholder="A reminder for later, or something the next trainer should know…"
                    className="min-h-25 border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-bg-dark resize-none text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus-visible:ring-orange-500 focus-visible:border-orange-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-2 dark:border-slate-800 dark:hover:bg-surface-1"
                    onClick={() => setShowEndConfirmation(false)}
                  >
                    Keep Training
                  </Button>
                  <Button
                    className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 bg-cta text-white hover:opacity-90"
                    onClick={() => void commitEndSession()}
                    disabled={isSyncing}
                  >
                    {isSyncing ? "Saving…" : "Finish session"}
                  </Button>
                </div>
                <div className="pt-4 flex justify-center border-t border-slate-100 dark:border-slate-800 mt-2">
                  <button
                    onClick={() => {
                      setShowEndConfirmation(false);
                      setShowCancelConfirmation(true);
                    }}
                    className="text-xs font-bold uppercase tracking-widest text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors py-3 px-6 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Abort Session (No Record)
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Scrap Session Confirmation Dialog */}
      <Dialog
        open={showCancelConfirmation}
        onOpenChange={(v) => !isDeletingSession && setShowCancelConfirmation(v)}
      >
        <DialogContent className="sm:max-w-100 rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none">
          <div className="bg-white dark:bg-bg-dark p-8 text-foreground space-y-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-all ${isDeletingSession ? "bg-red-500/20 text-red-500 animate-pulse" : "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]"}`}
            >
              {isDeletingSession ? (
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              ) : (
                <Trash2 className="w-6 h-6" />
              )}
            </div>
            <h3 className="text-2xl font-black italic uppercase tracking-tight">
              {isDeletingSession
                ? "Deleting Session..."
                : "Scrap Active Session?"}
            </h3>
            <p className="text-muted-foreground font-medium text-sm leading-relaxed">
              {isDeletingSession
                ? "Scrapping all logged sets, timers, and notes. Cleaning database records..."
                : "Are you sure you want to cancel this session? All data logged so far will be scrapped and will not be recorded in the database."}
            </p>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white dark:bg-bg-dark border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="outline"
              disabled={isDeletingSession}
              className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-2 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-surface-2 disabled:opacity-50"
              onClick={() => setShowCancelConfirmation(false)}
            >
              Resume Session
            </Button>
            <Button
              disabled={isDeletingSession}
              className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs bg-red-600 text-white shadow-lg shadow-red-200 dark:shadow-none hover:bg-red-700 disabled:opacity-80 flex items-center justify-center gap-2"
              onClick={confirmScrapSession}
            >
              {isDeletingSession ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                "Scrap Session"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Zones 2 + 3 — the grid rail, then the grid. The rail carries the
          controls that act on the list directly below it: Focus (Routine /
          All), Older, and the legend. The legend lays out inline when there
          is width for it and collapses to a Key popover when there is not,
          so it costs no permanent vertical space either way. */}
      {/* THE STAGE (tracker round, Sep 2026). Portrait: rail, grid, Now bar
          stacked. Landscape on an iPad-width screen: the Now bar becomes a
          column on the RIGHT, under the right thumb, and the grid takes the
          full height — the old bar stretched across 1180px of width and
          left the grid eight rows tall ("a foot-long hotdog"). */}
      <div className={`jg-stage ${nowBarSide ? "jg-stage--side" : ""}`}>
      <div className="jg-stage__main">
        {/* The rail used to open with the word ROUTINE, then a bare
            "6 of 21", then a segmented control whose left half also said
            Routine -- three pieces of chrome for one idea. It is one
            sentence now: Show [All | Routine], and a chip saying how many of
            how many. Then the control that edits that list. */}
        <div className="jg-rail">
          <span className="jg-rail__label">Show:</span>
          <div className="jg-seg2" role="radiogroup" aria-label="Which machines to list">
            <button
              type="button"
              role="radio"
              aria-checked={showAllMachines}
              className={`jg-seg2__btn ${showAllMachines ? "is-on" : ""}`}
              onClick={() => setShowAllMachines(true)}
            >
              All
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!showAllMachines}
              className={`jg-seg2__btn ${!showAllMachines ? "is-on" : ""}`}
              onClick={() => setShowAllMachines(false)}
            >
              Routine
            </button>
          </div>
          <span
            className="jg-rail__count"
            aria-label={`${activeMachineIds.length} machines in today's routine, of ${gridRows.length} on file`}
          >
            <b>{activeMachineIds.length}</b> <i>of</i> {gridRows.length}
          </span>
          <button
            type="button"
            className="jg-rail__edit"
            onClick={() => setIsOrderSheetOpen(true)}
            disabled={!currentSession}
          >
            <Settings2 className="w-3 h-3 shrink-0" strokeWidth={2.5} />
            Reorder
          </button>
          <button
            type="button"
            className="jg-rail__older"
            onClick={() => setGridVisible((v) => v + 5)}
            disabled={gridVisible >= gridHistory.length}
          >
            <ChevronLeft className="w-3 h-3" strokeWidth={2.5} />
            Older
          </button>
          <span className="jg-rail__sp" />
          <div className="jg-rail__legend">
            <QualityLegend />
          </div>
          <div className="jg-keywrap">
            <button
              type="button"
              className={`jg-key ${isLegendOpen ? "is-on" : ""}`}
              aria-expanded={isLegendOpen}
              onClick={() => setIsLegendOpen((o) => !o)}
            >
              Key
            </button>
            {isLegendOpen && (
              <div className="jg-keypop" role="dialog" aria-label="Rep quality key">
                <QualityLegend />
              </div>
            )}
          </div>
        </div>

        {gridLive && (
          <JourneyGrid
            sessions={gridVisibleHistory}
            historySessions={gridHistory}
            sections={gridSections}
            live={gridLive}
            /* Analytics is a review tool: "highest weight, Sep 2" is what you
               read on the client profile, not what you need while a set is
               running. Off here, it hands its 100px to the timeline. */
            showStats={false}
            onLoadOlder={() => setGridVisible((v) => v + 5)}
            canLoadOlder={gridVisible < gridHistory.length}
            /* The machine's NAME is the target -- one big one, the width of
               the rail. The note glyph is a mark, not a second button:
               "hard to tell if I'm tapping the note or the machine" was the
               audit's hesitation, and both did the same thing. */
            onSelectMachine={(id) => setSheetMachineId(id)}
            layout="fill"
            /* Rows shrink to fit what is on screen (44 → 26px) instead of a
               fixed 44px that showed ~15 machines and hid the rest below
               the fold. Routine-only stays at 44px; Show: All fits twenty. */
            fit="auto"
            targetColumns={nowBarSide ? 8 : 10}
            title="Machine"
          />
        )}
      </div>

      {/* Zone 4 — "The Now". Everything between walking up to a machine and
          logging the set, in one place that never moves. */}
      {gridLive && (
        <SessionNowBar
          coverage={clientCoverage}
          row={gridFocusRow}
          orderNumber={gridFocusOrder}
          value={gridFocusMachineId ? gridLiveValues[gridFocusMachineId] : undefined}
          history={gridHistory}
          onChange={handleGridLiveChange}
          step={2}
          nextName={gridNextRow?.machine.name}
          onNext={() => gridNextRow && setFocusMachineOverride(gridNextRow.machine.id)}
          onAddMachine={() => setIsOrderSheetOpen(true)}
          flagLine={
            gridFocusRow
              ? flagLineOf(machineFlags(gridFocusRow.machine, flagSources), (e) =>
                  e.occurredAt ? formatStudioDate(e.occurredAt, { month: "short", day: "numeric" }) : "",
                )
              : null
          }
          onOpenFlag={gridFocusMachineId ? () => setSheetMachineId(gridFocusMachineId) : undefined}
          level={traineeLevelOf(selectedClient)}
          layout={nowBarSide ? "side" : "bar"}
          onMachineSeconds={machineTimeElapsed}
        />
      )}
      </div>

      {currentSession && (
        <RoutineOrderSheet
          open={isOrderSheetOpen}
          onClose={() => setIsOrderSheetOpen(false)}
          ids={activeMachineIds}
          rows={gridRows}
          values={gridLiveValues}
          focusId={gridFocusMachineId}
          onChange={applySessionMachineIds}
          onFocus={setFocusMachineOverride}
        />
      )}

      {/* THE ASSESSMENT SLIDE-OVER.

          Same component the Journal tab uses -- ClientCheckInPanel over a
          Draft check-in that persists between sessions -- so a trainer can
          answer one topic here, another next week, and finalise it when the
          90 days are up. It autosaves per edit, so there is nothing to
          submit and nothing to lose by closing it.

          Deliberately NOT a full-screen form that saves as Finalized (the
          old QuickCheckInDialog did, and was retired in the reporting round):
          a session is a stream of small observations, not a sitting. The
          note sheet's Pulse tab is the even shorter path — one area, one Dial.

          A slide-over rather than a modal because the session has to stay
          visible behind it: the timer is running, the client is on a
          machine, and covering that up is what makes a trainer close the
          thing without writing anything. */}
      <AnimatePresence>
        {isShowingAssessment && selectedClient && (
          <div className="fixed inset-0 z-[100] flex justify-end overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsShowingAssessment(false)}
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
              role="dialog"
              aria-label="Pulse"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
                <div className="flex flex-col">
                  <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-foreground">
                    <HeartPulse className="h-5 w-5 text-orange-500" /> Pulse
                  </h2>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Saves as you type · session keeps running
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsShowingAssessment(false)}
                  aria-label="Close the Pulse"
                  className="rounded-full hover:bg-white dark:hover:bg-surface-1/10"
                >
                  <X className="h-5 w-5 text-muted-foreground" />
                </Button>
              </div>
              <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
                <React.Suspense
                  fallback={
                    <div className="flex items-center justify-center py-16 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading the Pulse…
                    </div>
                  }
                >
                  <ClientCheckInPanel
                    client={selectedClient}
                    trainer={authTrainer || null}
                    machines={floorMachines}
                  />
                </React.Suspense>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isShowingFlags && selectedClient && (
          <SessionFlagsSheet
            clientFirstName={clientFirstName(selectedClient)}
            flags={flags}
            machines={floorMachines}
            onClose={() => setIsShowingFlags(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isShowingSessionNotes && currentSession && clientId && (
          <SessionJournalSidebar
            session={currentSession}
            clientId={clientId}
            clientFirstName={clientFirstName(selectedClient)}
            studioId={selectedClient?.homeStudioId || contextActiveStudioId || ""}
            author={{
              id: user.uid,
              initials: (authTrainer?.initials || "TR").toUpperCase(),
              fullName: authTrainer?.fullName || "Coach",
            }}
            machines={floorMachines}
            defaultMachineId={gridFocusMachineId}
            client={selectedClient}
            trainer={authTrainer}
            draft={noteDraft}
            onDraftChange={handleDraftChange}
            onClose={() => setIsShowingSessionNotes(false)}
          />
        )}
      </AnimatePresence>

    </motion.div>
  );
}
