import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  AlertCircle,
  Trash2,
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
  updateDoc,
  doc,
  query,
  serverTimestamp,
  where,
  setDoc,
  getDocs,
  getDocsFromCache,
  getDoc,
  getDocFromServer,
  limit,
  orderBy,
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
import { keepPendingEdits, pendingLogEdits } from "../lib/pending-log-edits";
import { sendsAtOnce } from "../features/journey-grid/send-at-once";
import { stableHistory } from "../features/journey-grid/stable-history";
import { useSendState } from "../features/session-record/useSendState";
import { SendStatusStrip } from "../features/session-record/SendStatusStrip";
import { finishedElsewhereAtTap, settleOrQueue } from "../features/session-record/finish-wait";
import {
  cleanPayload,
  discardLogIds,
  followUpList,
  refusedStartSweep,
  plannedMachinesOf,
  prefillOf,
  resolveStartRoutine,
  seedLogs,
  startClientPatch,
  type StartRoutineType,
} from "../features/session-record/start-plan";
import { SEND_SETS_NOW_EVENT } from "../features/session-record/sign-out-check";
import { NothingOnScreen } from "../features/session-record/NothingOnScreen";
import { nothingKind } from "../features/session-record/nothing-on-screen";
import { nextRoutine } from "../features/routines/next-routine";
import { addPlannedBAtStart, addStartPlanToBatch, saveNextTime, setRoutineBActive } from "../features/routine-plan/store";
import { bFollowOf, plannedBFollowOf, plannedBStart } from "../features/routine-plan/b-routine";
import {
  nextTimeAtFinish,
  nextTimeOffer,
  plannedBFloorOf,
  nextTimeWrite,
  ranAsFree,
  ranWholeFloorUnchosen,
  routineHolds,
  withRoutineNow,
  type NextTimeSnapshot,
} from "../features/routine-plan/next-time";
import { findRoutineByLetter } from "../lib/routine-utils";
import { plannedBAtStart, startChangeOf, type StartPlanAtStart } from "../features/routine-plan/briefing-plan";
import { isStartingColumnChoice, todayFor } from "../features/routine-plan/plan";
import { isProvisionalNewClient } from "../features/routine-plan/client-kind";
import { orderEffects } from "../features/routine-plan/order-effects";
import {
  hasWeightOnFile,
  setLoggedToday,
  startingRangeSlot,
  type StartingRangeSlot,
  type TodayChange,
} from "../features/routine-plan/session-plan";
import { floorCanonical } from "../features/routine-plan/starting-plan";
import type { PlanWrite } from "../features/routine-plan/lineup";
import { floorMachinesOf, machineNamer } from "../features/routine-plan/ui/host";
import { useSessionPlan } from "../features/routine-plan/ui/useSessionPlan";
import { SessionPlanSheet } from "../features/routine-plan/ui/SessionPlanSheet";
import { StartFromRoutineSheet } from "../features/routine-plan/ui/StartFromRoutineSheet";
import { inHandAfterLay, laidToday } from "../features/routine-plan/start-from";
import { SessionOrderLine } from "../features/routine-plan/ui/SessionOrderLine";
import { StartingRangeSheet } from "../features/routine-plan/ui/StartingRangeSheet";
import { knownElsewhere } from "../features/machine-menu/header-words";
import { WatchingSession } from "../features/session-record/WatchingSession";
import {
  firstOpenMachine,
  machinesDone,
  sessionMachineList,
  takeOverWords,
  watchWords,
} from "../features/session-record/watch";

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
  /**
   * The Note for the next trainer Finish wrote, so the Wrap-up can tell its
   * card apart in the To-file tray: the words as the journal holds them, and
   * the entry's id once the journal write answers (null until then, and for
   * good while offline). Null when the End Session box was empty.
   */
  nextTrainerNote: { id: string | null; body: string } | null;
  /**
   * Saved on this iPad, and the database has not answered yet: offline, or a
   * slow connection (session record, Sep 26 2026). The screen says so, and
   * this goes false when the answer comes.
   */
  queued?: boolean;
  /**
   * The Wrap-up's Next time (the first-session design round, Oct 8 2026,
   * §4.7): the session's routine, that routine's machines and its plan, and
   * today's performed machines, frozen here at Finish so a later routines
   * snapshot can't reshuffle the rows while the trainer ticks
   * (routine-plan/next-time.ts). Null for a Free session, whenever the
   * routines weren't known, and when another iPad finished the session
   * (that iPad has its own): no card.
   */
  nextTime: NextTimeSnapshot | null;
}

const LOG_WRITE_DEBOUNCE_MS = 600;
/** ...but a trainer who keeps typing must not outrun the flush indefinitely. */
const LOG_WRITE_MAX_WAIT_MS = 2500;
/** The soft-lock heartbeat is a liveness signal; per-keystroke is pointless. */
const HEARTBEAT_MIN_INTERVAL_MS = 30_000;
import {
  parseSessionDate,
  orderMachineSettings,
  isSessionValid,
} from "../lib/utils";
import { toFloorMachines, isPerSideMachine } from "../lib/floor-machines";
import { completeWorkoutSession } from "../lib/sync-utils";
import { machineTotalsKnown } from "../features/machine-totals/totals";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

import { useActiveStudio } from "../contexts/ActiveStudioContext";
import { useStudioMachines } from "../hooks/useStudioMachines";
import { isBounceAdd, type LastAdd } from "../features/journey-grid/add-bounce";
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
import { outcomeAtFinish, unreachedMachineIds, OUTCOME_LABEL, isBegunLog, takenOutForToday, TAKEN_OUT_OUTCOME } from "../lib/set-outcome";
import { canQuoteSessionNumber, coverageOfClient, homeCutoverOf } from "../lib/client-coverage";
import { noMachineHistoryLine, ownedWindow, sessionNumberTag } from "../lib/history-claims";
import { priorHistoryOf } from "../lib/prior-history";
import { sessionTimingFields, toEpochMs } from "../lib/session-timing";
import {
  forgetLiveSession,
  isAnotherTrainersSession,
  myTrainerIds,
  peekLiveSessionId,
  pickOpenSession,
  rememberLiveSession,
  sessionDayWords,
  splitInProgress,
  takeOverPatch,
} from "../lib/live-session";
import { StaleSessionDialog } from "../features/tracker/StaleSessionDialog";
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
import { SessionCorner } from "../features/journey-grid/SessionCorner";
import { computeRowStats, orderedSets } from "../features/journey-grid/stats";
import {
  strengthJourney,
  todayLines,
  type JourneyRead,
  type PriorSet,
  type TodayLine,
} from "../lib/post-session";
import { NOW_BAR_SIDE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { usePhone } from "../features/phone/device";
import { PhoneSessionStage } from "../features/phone/PhoneSessionStage";
import { traineeLevelOf } from "../lib/progression-cue";
import { createJournalEntry, useClientJournal } from "../hooks/useClientJournal";
import { flagLineOf, machineFlags, sessionFlags } from "../features/journey-grid/session-flags";
import { SessionFlagsSheet } from "../features/journey-grid/SessionFlagsSheet";
import { formatStudioDate } from "../lib/studio-time";
import {
  DEFAULT_IMPORTANCE,
  FILING_CATEGORIES,
  journalBodyOf,
  storedNoteOf,
  type FilingCategory,
} from "../features/client-notes/note-catalog";
import { NoteCategoryChips } from "../features/client-notes/NoteCategoryChips";
import { painSkipNotes } from "../features/client-notes/pain-notes";
import { suggestFiling } from "../features/client-notes/suggest";
import {
  clearSessionDraft,
  hasDraftText,
  readSessionDraft,
  writeSessionDraft,
  type SessionNoteDraft,
} from "../features/client-notes/session-draft";
import { floorCarryOf } from "../features/machine-menu/note-target";
import { hasOlderToRead, logsWindowIds } from "../features/machine-menu/older-read";
import { addFloorNote } from "../features/floor-notes/store";
import { ActiveSessionTimer } from "./ActiveSessionTimer";
import { MachineMenu } from "../features/machine-menu/MachineMenu";
import type { MachineMenuHost } from "../features/machine-menu/useMachineMenuData";
import { isFirstSetup, notSetCount } from "../features/machine-menu/setting-draft";
import { fieldsForMachine } from "../features/equipment/adapters";
import { useMachineCatalog } from "../hooks/useMachineCatalog";
/* Lazy, and the reason is measurable: the assessment panel is a 162 kB
   chunk (50 kB gzipped) that most sessions never open. A static import
   would put it on the critical path of the one screen a trainer opens
   forty times a day, to pay for a panel they open once a quarter. It is
   fetched once in the background after the app opens instead
   (features/new-version/warm-up.ts), off the critical path, so a deploy
   mid-day cannot leave a session without it. */
import { loadClientCheckInPanel } from "./journal/load-check-in-panel";
import { LoadBoundary } from "../features/new-version/LoadBoundary";
const ClientCheckInPanel = React.lazy(loadClientCheckInPanel);
import { SessionJournalSidebar } from "./journal/SessionJournalSidebar";
import { BriefingScreen } from "../features/briefing";
import { WrapUpScreen } from "./WrapUpScreen";
import { studioTodayKey } from "../lib/studio-time";
import { sessionLinkOf } from "../features/client-notes/session-link";

import { clientDisplayName, clientFirstName } from "../lib/client-name";
import { isNextWeightLive, nextWeightMark, nextWeightSourceLine } from "../features/next-weight/next-weight";
import { saveNextWeight } from "../features/next-weight/store";
import { machineNoteCount, machineNoteLoudness } from "../features/equipment/machine-notes";
import { machineJournalOf } from "../features/equipment/useMachineJournal";
import { sessionNoteStudioId } from "../features/client-notes/note-studio";
import { ClientSelectionDialog } from "../features/tracker/ClientSelectionDialog";
import { CreateClientModal } from "./CreateClientModal";
import {
  ASSIGN_SERVER_READ_WAIT_MS,
  assignRefusedWords,
  assignSessionPatch,
  assignSetPatch,
  resendSetFields,
  setsToAssign,
  type HeldSet,
} from "../features/open-session/assign";
import { useLeaveGuard } from "../features/unsaved-changes";
import "../features/journey-grid/journey-grid.css";
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
  setSelectedClientIdNow,
  authTrainer,
  isSyncing,
  setIsSyncing,
  schedules,
  rightControls,
  trainerDropdown,
  onStudioClick,
  clientLookup,
  onRetryClient,
}: {
  clientId: string | null;
  clients: Client[];
  machines: Machine[];
  schedules: any[];
  trainers: Trainer[];
  user: FirebaseUser;
  setView: (v: View) => void;
  setSelectedClientId: (id: string | null) => void;
  /**
   * The client on screen, set without asking again (AppContent's raw
   * setter): for Who's this?, which asked about typing elsewhere at the tap,
   * and for taking back a client the database refused, which leaves nothing
   * behind to ask about (the open session round, Oct 9 2026). Without it,
   * `setSelectedClientId`.
   */
  setSelectedClientIdNow?: (id: string | null) => void;
  authTrainer: Trainer | null;
  isSyncing: boolean;
  setIsSyncing: (v: boolean) => void;
  rightControls?: React.ReactNode;
  trainerDropdown?: React.ReactNode;
  onStudioClick?: () => void;
  /**
   * Where the chosen client's record stands, when it is not on screen yet:
   * still loading, a read that failed, or no record (session record, Sep 26
   * 2026). Decides the sentence the screen says instead of drawing nothing.
   */
  clientLookup?: "ready" | "loading" | "failed" | "missing";
  /** Asks for the client's record again, after a read that failed. */
  onRetryClient?: () => void;
}) {
  const { activeStudioId: contextActiveStudioId, activeStudio, studios } =
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
  const {
    machines: studioFloor,
    byId: studioFloorById,
    loading: studioFloorLoading,
    failed: studioFloorFailed,
  } = useStudioMachines(contextActiveStudioId, { bridgeWhenRosterEmpty: true });

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

  const { error: toastError, info: toastInfo } = useToast();
  /* Who's this? changes the client on screen without leaving it, so it asks
     about typing elsewhere first, the way AppContent's client change does. */
  const guardLeave = useLeaveGuard();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [logs, setLogs] = useState<Record<string, ExerciseLog>>({});
  const [routines, setRoutines] = useState<Routine[]>([]);
  /*
   * Whether this client's routines and machine settings are KNOWN: a snapshot
   * has arrived for this client, from the iPad's cache or the server (speed
   * round, Oct 5 2026). Until then an empty list means "not read yet", never
   * "none", so Start makes no Routine A and seeds no weights off it. Known
   * never holds Start or Finish: the routine and the weights follow the
   * moment they are (features/session-record/start-plan.ts). Keyed by the
   * client, so a listener re-opened for the same client keeps it.
   */
  const [knownFor, setKnownFor] = useState<{
    routines: string | null;
    settings: string | null;
    settingsRead: string | null;
    settingsServer: string | null;
  }>({
    routines: null,
    settings: null,
    settingsRead: null,
    settingsServer: null,
  });
  const routinesKnown = !!clientId && knownFor.routines === clientId;
  const settingsKnown = !!clientId && knownFor.settings === clientId;
  /* The settings ARRIVED (a snapshot answered), as opposed to known: a failed
     read makes them known as "none" for the prefill, which only fills a
     blank, but "no weight on file" may never be said off a failed read (the
     Academy's starting range, the first-session design round, Oct 8 2026). */
  const settingsRead = !!clientId && knownFor.settingsRead === clientId;
  /* The SERVER has answered the settings (the open session round's review,
     Oct 9 2026). Only then does a machine missing from them have nothing on
     file: Finish writes a machine's stored settings and its starting weight
     off that, and an open session given its client a moment before Finish,
     or a read the iPad's cache answered empty, must never write the client's
     saved seat and positions over with nothing (sync-utils,
     `settingsOnFileKnown`). */
  const settingsServerRead = !!clientId && knownFor.settingsServer === clientId;
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  /* The client's machine totals (the last set on each machine: Start's
     prefilled weights) have answered. They live in their own document since
     the iPad round (features/machine-totals), so the prefill waits for them
     as it waits for the settings, rather than prefilling a prescribed weight
     in place of a last weight nobody has read yet. */
  const totalsKnown = !!clientId && selectedClient?.id === clientId && machineTotalsKnown(selectedClient);
  /*
   * How much of this client's story Journey holds - computed ONCE here and
   * handed to the three screens this file draws, rather than each of them
   * working it out. `studios` is absent in the render test's context mock,
   * which resolves to "unknown", which is the cautious wording: the safe
   * direction to fail in. lib/client-coverage.ts.
   *
   * The cutover is the client's HOME studio's (Sep 24 2026), not the iPad's:
   * where her history lives depends on when HER studio moved onto Journey.
   */
  const homeCutover = homeCutoverOf(studios, selectedClient);
  const clientCoverage = useMemo(
    () => coverageOfClient(selectedClient, homeCutover),
    [selectedClient, homeCutover],
  );
  /*
   * Whether "#N" may be printed at all. `sessionCount` is only what Journey
   * has seen for a migration client nobody has recorded a total for, so the
   * session bar and the grid's column heads read "#3" for a woman of twelve
   * years. The Hub card's gate (features/hub-schedule); no number rather than a
   * wrong one. The number is still WRITTEN on the session as before.
   */
  const canQuoteNumber = canQuoteSessionNumber(selectedClient, clientCoverage);

  const [currentSession, setCurrentSession] = useState<WorkoutSession | null>(
    null,
  );

  const [activeMachineIds, setActiveMachineIds] = useState<string[]>([]);
  /* Read by Start's follow-up (R9), which must not redraw on every change. */
  const activeMachineIdsRef = useRef<string[]>([]);
  activeMachineIdsRef.current = activeMachineIds;
  const [clientMachineSettings, setClientMachineSettings] = useState<
    Record<string, ClientMachineSetting>
  >({});
  const [currentSessionNotes, setCurrentSessionNotes] = useState<string>("");
  /* What kind of note the Note for the next trainer is (notes round, Oct 3
     2026): one optional tap under the End Session box, offered once
     something is typed. AJ: capture "can't depend on a Wrap-up pass because
     the time won't reliably be there". Picked, it is filed as it is written
     and never waits in the Wrap-up's tray; it is a Heads up either way. */
  const [nextTrainerCategory, setNextTrainerCategory] = useState<FilingCategory | null>(null);

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
  // Which machine the machine menu is open on. One piece of state, because
  // there is one card: it used to be two (settings, notes) and a trainer had
  // to know which of two targets to hit (features/machine-menu).
  const [menuMachineId, setMenuMachineId] = useState<string | null>(null);
  /* The card was opened by the Now Bar's Set up (the open session round, Oct
     9 2026; AJ's "2a"): on the first empty dial, and Save closes it. Any
     other door opens it as before. */
  const [menuQuickFor, setMenuQuickFor] = useState<string | null>(null);
  const openMachineMenu = React.useCallback((id: string) => {
    setMenuQuickFor(null);
    setMenuMachineId(id);
  }, []);
  /* Stable for the memo'd Now Bar: the setters never change. */
  const onSetUpMachine = React.useCallback((id: string) => {
    setMenuQuickFor(id);
    setMenuMachineId(id);
  }, []);
  // The 90-day assessment, opened mid-session. See the panel at the bottom
  // of this file for why it is a slide-over and not a screen.
  const [isShowingAssessment, setIsShowingAssessment] = useState(false);
  /* The corner's pick of today's list or every machine, for one session (the
     FileMaker floor below decides the default: `showAllMachines`). */
  const [showAllPick, setShowAllPick] = useState<{ sessionId: string | null; all: boolean } | null>(null);
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

  /*
   * STALE SESSIONS ARE ASKED ABOUT, NEVER ADOPTED (Sep 24 2026).
   *
   * `staleSession` is the client's newest In-Progress session that the
   * heartbeat rule calls abandoned (lib/live-session.ts), held here while
   * nothing live is running. The screen is the briefing, with the question
   * over it (features/tracker/StaleSessionDialog.tsx); `declinedStaleId` is
   * the one the trainer chose to leave, so it is asked once per visit.
   *
   * The session on screen (`currentSessionIdRef`, which the note draft
   * also reads) is never taken away because its heartbeat aged: a long
   * pause, or a resumed session whose first new heartbeat is still on its
   * way to the server, stays put.
   */
  const [staleSession, setStaleSession] = useState<WorkoutSession | null>(null);
  const [declinedStaleId, setDeclinedStaleId] = useState<string | null>(null);

  /*
   * WATCHING (session record, Sep 26 2026). A session another trainer is
   * running is never this iPad's to record (lib/live-session.ts,
   * `isAnotherTrainersSession`): a head trainer looking in used to be able
   * to type over the trainer's sets, and a second Finish counted everything
   * twice. It is held here, apart from `currentSession`, so every effect and
   * write keyed on the session being recorded stays inert while watching;
   * the screen is features/session-record/WatchingSession.tsx, and nothing
   * on it writes. `takenFromHere` is set when the session this iPad was
   * recording was taken over on another one, so the screen can say so.
   */
  const [watchedSession, setWatchedSession] = useState<WorkoutSession | null>(null);
  const [takenFromHere, setTakenFromHere] = useState(false);
  const watchedSessionRef = useRef<WorkoutSession | null>(null);
  useEffect(() => {
    watchedSessionRef.current = watchedSession;
  }, [watchedSession]);
  /* Every id this person's sessions may carry; the listeners read the ref. */
  const myIds = useMemo(() => myTrainerIds(authTrainer, user?.uid), [authTrainer, user?.uid]);
  const myIdsRef = useRef(myIds);
  useEffect(() => {
    myIdsRef.current = myIds;
  }, [myIds]);
  /* A take-over made here, until the stream carries it: a snapshot that has
     not caught up with the write must not hand the session straight back. */
  const takingOverRef = useRef<{ id: string; at: number } | null>(null);

  /* Machines worked on in the stale session, for the question. Only ever a
     positive count: before the logs arrive "none" and "not loaded yet" look
     the same, so the question never claims nothing was logged. */
  const staleBegunMachines = useMemo(() => {
    if (!staleSession?.id) return null;
    const worked = new Set<string>();
    for (const log of Object.values(logs)) {
      if (log.sessionId === staleSession.id && isBegunLog(log)) worked.add(log.machineId);
    }
    return worked.size > 0 ? worked.size : null;
  }, [logs, staleSession?.id]);

  /* The trainer chose to carry on with the stale session. It is on screen
     at once (the ref as well, so a snapshot that lands before the next
     render cannot take it away), the device remembers it as the live
     session, and a heartbeat marks it running again so every other screen
     agrees. Nothing else about it changes: its sets stay under its day. */
  const resumeStaleSession = () => {
    const s = staleSession;
    if (!s?.id) return;
    /* Another trainer's abandoned session becomes this trainer's to finish,
       exactly as a take-over does; otherwise this iPad would only watch it. */
    const patch =
      authTrainer?.id && isAnotherTrainersSession(s, myIdsRef.current) ? takeOverPatch(s, authTrainer) : null;
    if (patch) takingOverRef.current = { id: s.id, at: Date.now() };
    currentSessionIdRef.current = s.id;
    setStaleSession(null);
    setCurrentSession(patch ? ({ ...s, ...patch } as WorkoutSession) : s);
    setShowRoutinePicker(false);
    setIsPreSessionMode(false);
    rememberLiveSession(s.id);
    updateDoc(doc(db, "sessions", s.id), {
      ...(patch ?? {}),
      lastHeartbeatAt: serverTimestamp(),
    }).catch((error) => handleFirestoreError(error, OperationType.UPDATE, "sessions"));
  };

  /* Take over the session this iPad is watching, after the question
     (WatchingSession). It is this iPad's at once, as Resume is; the other
     iPad sees the new trainer on the session and turns to watching. Offline
     the write waits on the iPad like any other, and nothing waits on it. */
  const takeOverWatchedSession = () => {
    const s = watchedSession;
    if (!s?.id || !authTrainer?.id) return;
    const patch = takeOverPatch(s, authTrainer);
    takingOverRef.current = { id: s.id, at: Date.now() };
    currentSessionIdRef.current = s.id;
    watchedSessionRef.current = null;
    setWatchedSession(null);
    setTakenFromHere(false);
    setCurrentSession({ ...s, ...patch } as WorkoutSession);
    setShowRoutinePicker(false);
    setIsPreSessionMode(false);
    rememberLiveSession(s.id);
    updateDoc(doc(db, "sessions", s.id), {
      ...patch,
      lastHeartbeatAt: serverTimestamp(),
    }).catch((error) => {
      /* Refused: the session is still the other trainer's, so this iPad
         goes back to watching it, and says why. */
      console.error("[take over] the take-over was not saved", error);
      takingOverRef.current = null;
      if (currentSessionIdRef.current === s.id) currentSessionIdRef.current = null;
      setCurrentSession((cur) => (cur?.id === s.id ? null : cur));
      setWatchedSession(s);
      toastError("The take-over didn't go through. Check the connection, then try again.");
    });
  };

  /* ...or chose to leave it. It is not touched: the briefing's Start makes
     a new session beside it, and the profile keeps showing it with Discard. */
  const leaveStaleSession = () => {
    if (staleSession?.id) setDeclinedStaleId(staleSession.id);
  };

  /*
   * ...or chose "Finish it as it was" (the Atlas answers, Oct 2 2026). The
   * old session is finished under its OWN day, by the trainer who ran it, so
   * its real sets count: Finish's own writes (completeWorkoutSession) with
   * `asOfDay`, which counts it as one more session, never moves her last
   * session day back, and never writes a machine's "last time" or next
   * weight over a newer one. Its sets are taken as they stand, each read the
   * way Finish reads it (a set with a count is performed, an untouched
   * placeholder not reached, a begun set with no count skipped). No Wrap-up:
   * the client in front of the trainer is today's. The briefing stays, and
   * Start makes today's session as usual. Fired, never awaited on the floor.
   */
  const finishStaleSessionAsItWas = () => {
    const s = staleSession;
    // The dialog holds the button until the totals answer; this holds a tap
    // that raced it. completeWorkoutSession keeps an unknown "last time" safe
    // regardless (sync-utils, newerOnFile).
    if (!s?.id || !selectedClient || !user?.uid || !totalsKnown) return;
    const sessionLogs = (Object.values(logs) as ExerciseLog[]).filter((l) => l.sessionId === s.id);
    const stamped = sessionLogs.map((l) => {
      const o = outcomeAtFinish(l, null);
      if (o.outcome === "performed") return l;
      return { ...l, ...o, ...(o.outcome !== "skipped" ? { skipReason: null } : {}) };
    });
    const ranBy = s.trainerId
      ? ({ id: s.trainerId, fullName: (s as { trainerName?: string }).trainerName || "", initials: s.trainerInitials || "" } as Trainer)
      : authTrainer;
    const endedAt = s.lastHeartbeatAt ?? s.startTime ?? null;
    const name = clientFirstName(selectedClient, "The client");
    const day = sessionDayWords(s, studioTodayKey()) ?? "the day it was started";
    setDeclinedStaleId(s.id);
    setStaleSession(null);
    completeWorkoutSession(
      db,
      s,
      selectedClient,
      stamped,
      "",
      ranBy,
      clientMachineSettings,
      user.uid,
      endedAt ? { endTime: endedAt } : undefined,
      { asOfDay: s.date || null, settingsOnFileKnown: settingsServerRead },
    ).then(
      (r) => {
        toastInfo(`${name}'s unfinished session from ${day} is finished as it was.`);
        if (r.totalsSaved === false) toastError(`${name}'s session count didn't update for it.`);
      },
      (error) => {
        console.error("[stale] finishing the old session was refused", error);
        toastError(`${name}'s unfinished session couldn't be finished. It is still on the profile.`);
      },
    );
  };


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
               key stay put as the crash-recovery net (lib/live-session.ts).
               Sep 24 2026: the check read `selectedClient`, which is always
               null on the first render this effect sees, so it passed for
               every client — the `clientId` prop is known from the start.
               And only a LIVE session is adopted here: a stale one is left
               to the client's sessions stream below, which asks. */
            if (
              data.status === "In-Progress" &&
              (!clientId || data.clientId === clientId) &&
              isSessionValid(data) &&
              isAnotherTrainersSession(data, myIdsRef.current)
            ) {
              /* The device remembered a session someone else now runs (it
                 was taken over): it is watched, and no longer this iPad's
                 to come back to (session record, Sep 26 2026). */
              forgetLiveSession(takeoverSessionId);
              setWatchedSession(data);
              setSessions((prev) =>
                prev.some((s) => s.id === data.id) ? prev : [data, ...prev],
              );
              setIsPreSessionMode(false);
              setShowRoutinePicker(false);
            } else if (
              data.status === "In-Progress" &&
              (!clientId || data.clientId === clientId) &&
              isSessionValid(data)
            ) {
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
      /*
       * The one sided machine. This used to test `mId === "torso_rotation"`,
       * the LEGACY MACHINE_DATABASE key - but the app's canonical id is
       * "m-torso-rotation" (data/default-machines.ts), so the branch never
       * fired, the _Left/_Right logs were never closed, and Torso Rotation was
       * the only machine in the app with no timing data at all.
       *
       * isPerSideMachine() is the one answer to "does this machine record two
       * sides" and accepts both ids plus the name - every other per-side
       * decision in this file already goes through it (lines ~1348, ~2084).
       * AJ confirmed Sep 22 that the machine is on a lot of floors, so this is
       * a repair rather than a deletion.
       */
      if (isPerSideMachine({ id: mId })) {
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
  /* The focused machine's seconds, read by the Now Bar, which ticks itself
     once a second (speed round, Oct 5 2026; R10). The tick used to live
     here, as state, and redrew the whole session screen every second. */
  const readFocusedMachineSeconds = React.useCallback(
    () => (gridFocusMachineIdRef.current ? secondsOn(machineClocks.current, gridFocusMachineIdRef.current) : 0),
    [],
  );

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
      floor: floorMachines,
    }),
    [selectedClient?.clinicalFlags, flagJournal.criticalEntries, flagJournal.headsUpEntries, floorMachines],
  );
  const flags = useMemo(() => sessionFlags(flagSources), [flagSources]);
  /* Her journal's notes that name a machine, for the grid's note marks and
     the machine menu (one list since Oct 2 2026). Taken from the journal
     above, never a subscription of their own: the session holds ONE journal
     listener (machine menu design §F 8; it held three). */
  const flagJournalStream = flagJournal.journalStream;
  const machineJournalRead = useMemo(() => machineJournalOf(flagJournalStream), [flagJournalStream]);
  const machineJournal = machineJournalRead.entries;
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
  /*
   * WHO'S THIS? (the open session round, Oct 9 2026). Where the client
   * picker was opened from: the session bar (the session carries on as the
   * client's) or Finish (the End session question comes back, now the
   * client's, and its Finish runs the ordinary Finish). `creatingClient` is
   * New client, drawn over the session so the session is never left behind
   * (it used to replace the whole screen, and the open session was lost).
   * `assigningRef` is the session being given its client, so the open
   * sessions' listener does not take it off the screen as it leaves that
   * list. `assignedHereId` is an open session given its client on this
   * iPad: it keeps the floor open while the client's routines are read (it
   * has no routine, and none comes; it never folds for a moment).
   */
  const [assignFrom, setAssignFrom] = useState<"bar" | "finish">("bar");
  const [assignedHereId, setAssignedHereId] = useState<string | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);
  const assigningRef = useRef<{ sessionId: string; clientId: string } | null>(null);
  /* The assign's batch while its reads are out: a Finish tapped meanwhile
     issues it at once, with what is known, ahead of its own batch. */
  const assignIssueRef = useRef<{ sessionId: string; now: () => void } | null>(null);
  const chooseClientNow = setSelectedClientIdNow ?? setSelectedClientId;
  /* Whether this screen is still up: a refusal that lands after the trainer
     left it is said, and changes nothing on the screen they are on now. */
  const trackerMountedRef = useRef(true);
  useEffect(() => {
    trackerMountedRef.current = true;
    return () => {
      trackerMountedRef.current = false;
    };
  }, []);
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
  /* A phone draws the live session as cards (features/phone). */
  const isPhone = usePhone();

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

  /* Which studio's open sessions have answered, so the screen with no client
     says "Opening the session…" until they have, never "No session is open
     here" in the moment after Open session (the open session round, Oct 9
     2026). Keyed by studio, so a studio switch asks again. */
  const [openSessionsAnsweredFor, setOpenSessionsAnsweredFor] = useState<string | null>(null);

  // Special listener for unassigned sessions when no client is selected
  useEffect(() => {
    if (!clientId && user) {
      /*
       * Scoped to this studio (tenancy pass, Sep 2026). Unscoped, this picked
       * up an in-progress unassigned session at ANY location — so two studios
       * running an open session at once could each adopt the other's. It also
       * cannot be read at all now that `sessions` is rule-scoped.
       */
      /* Several trainers may each run an open session at once (session
         record, Sep 26 2026): this iPad records its own, and watches
         another's only when it has none. It read `limit(1)`, so it adopted
         whichever open session came first, someone else's included. A
         studio has a handful at most; the limit is a guard rail. Newest
         first (the open session round, Oct 9 2026): unordered, the limit
         kept the first twenty by document id, so with abandoned open
         sessions piled up a session just started could fall out of it. */
      const studioKey = contextActiveStudioId ?? "__none__";
      const unassignedQuery = query(
        collection(db, "sessions"),
        where("hostedAtStudioId", "==", studioKey),
        where("isUnassigned", "==", true),
        where("status", "==", "In-Progress"),
        orderBy("createdAt", "desc"),
        limit(20),
      );

      const unsubscribe = onSnapshot(
        unassignedQuery,
        (snapshot) => {
          setOpenSessionsAnsweredFor(studioKey);
          const open = snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as WorkoutSession,
          );
          /* The open session on screen is being given its client (Who's
             this?): the screen carries on with it as the client's, and this
             listener closes. Whatever it says meanwhile (the session still
             open, or gone from the list as it stops being open, never
             because it ended) is not news. A refusal clears the mark. */
          const assigning = assigningRef.current;
          if (assigning && assigning.sessionId === currentSessionIdRef.current) return;
          const takingOver = takingOverRef.current;
          const settlingId =
            takingOver && Date.now() - takingOver.at < JUST_STARTED_GRACE_MS ? takingOver.id : null;
          /* Which one is this iPad's (the open session round, Oct 9 2026):
             the one on screen, else the one the device remembers (Open
             session and the Session tab set it) while it is live, else the
             newest live one of this trainer's; an abandoned one is never
             taken up without asking, nor watched. It took the first of this
             trainer's it came to, so a second open session could bring back
             the old one. */
          const { mine, watch } = pickOpenSession(open, {
            myIds: myIdsRef.current,
            settlingId,
            onScreenId: currentSessionIdRef.current,
            rememberedId: peekLiveSessionId(),
          });
          const onScreen = open.find((s) => s.id === currentSessionIdRef.current);
          if (mine) {
            setWatchedSession(null);
            setTakenFromHere(false);
            setCurrentSession(mine);
            setSessions([mine]);
          } else if (watch) {
            if (finishingRef.current) return;
            /* The open session on screen was taken over on another iPad:
               what was typed here is sent first, as for a client's session. */
            if (onScreen) {
              flushAllLogWrites();
              forgetLiveSession(onScreen.id);
              currentSessionIdRef.current = null;
              setTakenFromHere(true);
            }
            setCurrentSession(null);
            setWatchedSession(watch);
            setSessions([watch]);
          } else {
            setCurrentSession(null);
            setWatchedSession(null);
            setSessions([]);
          }
        },
        (error) => {
          setOpenSessionsAnsweredFor(studioKey);
          handleFirestoreError(error, OperationType.GET, "sessions");
        },
      );

      return () => unsubscribe();
    }
    /* The studio is a dependency (the open session round, Oct 9 2026): with
       only the client and the person, a studio switch kept the old studio's
       query, so this iPad went on recording and watching another studio's
       open sessions. */
  }, [clientId, user?.uid, contextActiveStudioId]);

  useEffect(() => {
    if (clientId && clients) {
      const client = clients.find((c) => c.id === clientId);
      /* A client an open session was just given (Who's this?, the open
         session round, Oct 9 2026) is on screen at once, from what the
         picker or New client knew of them; the studio's list replaces that
         copy the moment it has them. A brand-new client is not in it yet. */
      setSelectedClient((prev) => client || (prev?.id === clientId ? prev : null));
    }
  }, [clientId, clients]);

  /* The client's settings, routines and sessions, listened to once per
     client and person. `clients` is NOT a dependency (the iPad round, Oct 6
     2026): nothing in here reads it, and it changes every time any client
     document at the studio changes (the roster listener, a Mindbody webhook,
     the nightly job) and when the selected client's own read answers, a
     moment after Start. Each change tore all three listeners down and opened
     them again, so the briefing could be drawn from a new listener's partial
     cached answer (40 of a client's 99 sessions, in the perf lab) before the
     server's, and every roster change mid-session asked the server for the
     client's sessions again. */
  useEffect(() => {
    if (clientId && user) {
      // Fetch Client Machine Settings
      const settingsQuery = query(
        collection(db, "clientMachineSettings"),
        where("clientId", "==", clientId),
      );
      /* Whether this client's settings ever arrived. A read that FAILS before
         they do leaves the settings unknown for good, and the seed waits on
         them, so a failure is taken as "no settings": the prefill then comes
         from the last performed weights alone, as it did before the speed
         round. The seed only ever fills a blank, so nothing is overwritten. */
      let settingsArrived = false;
      /* With metadata changes, as the routines below: the server confirming
         what the iPad's cache already said changes no document, and without
         them that answer (`settingsServer`) would never be heard. A
         metadata-only answer changes no setting: no new map, no redraw. */
      const unsubscribeSettings = onSnapshot(
        settingsQuery,
        { includeMetadataChanges: true },
        (snapshot) => {
          const fromServer = !snapshot.metadata?.fromCache;
          if (!settingsArrived || snapshot.docChanges().length > 0) {
            settingsArrived = true;
            const settingsMap: Record<string, ClientMachineSetting> = {};
            snapshot.docs.forEach((doc) => {
              const data = { id: doc.id, ...doc.data() } as ClientMachineSetting;
              settingsMap[data.machineId] = data;
            });
            setClientMachineSettings(settingsMap);
          }
          setKnownFor((k) =>
            k.settings === clientId && k.settingsRead === clientId && (!fromServer || k.settingsServer === clientId)
              ? k
              : { ...k, settings: clientId, settingsRead: clientId, ...(fromServer ? { settingsServer: clientId } : {}) },
          );
        },
        (error) => {
          if (!settingsArrived) {
            setClientMachineSettings({});
            setKnownFor((k) => (k.settings === clientId ? k : { ...k, settings: clientId }));
          }
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
      /* Known only once the answer can be trusted (KNOWN-TRAPS: a snapshot
         the cache answered is not a read). An EMPTY answer from the iPad's
         cache may only mean this iPad never read this client's routines, so
         it does not make them known, and Start does not make a Routine A off
         it; the server's answer does (Start never waits for it: the routine
         follows, startFollowUpRef). Metadata changes are listened to because
         the server confirming an empty cached list changes no document, and
         without them that answer would never be heard. */
      let routinesSeen = false;
      const unsubscribeRoutines = onSnapshot(
        routinesQuery,
        { includeMetadataChanges: true },
        (snapshot) => {
          const trusted = !(snapshot.empty && snapshot.metadata?.fromCache);
          // A metadata-only answer changes no routine: no new list, no redraw.
          if (!routinesSeen || snapshot.docChanges().length > 0) {
            routinesSeen = true;
            const routinesData = snapshot.docs.map(
              (doc) => ({ id: doc.id, ...doc.data() }) as Routine,
            );
            // Sort routines alphabetically so Routine A is default/first
            setRoutines(
              routinesData.sort((a, b) => a.name.localeCompare(b.name)),
            );
            // The list on screen is now this answer's: an untrusted one
            // un-knows the routines, or a client switched away from and back
            // (X, Y, X) would read as known off Y's empty list (the speed
            // round's final review).
            if (!trusted) {
              setKnownFor((k) => (k.routines === null ? k : { ...k, routines: null }));
              return;
            }
          }
          if (!trusted) return;
          setKnownFor((k) => (k.routines === clientId ? k : { ...k, routines: clientId }));
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
          // What the stream says each session is, the moment it says it (Finish reads it at the tap, R9).
          streamStatusRef.current = new Map(sessionsData.map((s) => [s.id ?? "", s.status ?? null]));

          /* Which session to carry on with (lib/live-session.ts). The one
             already on screen stays, whatever its heartbeat says; otherwise
             a LIVE session is adopted without asking, as it always was. A
             stale one is never adopted here — it is held for the trainer to
             resume or leave, and until they choose, the screen is the
             briefing. This used to adopt any In-Progress session at all,
             which is how Start the next morning reopened yesterday's
             abandoned session and put the day's sets under yesterday's date. */
          const onScreen = sessionsData.find(
            (s) => s.status === "In-Progress" && s.id === currentSessionIdRef.current,
          );
          const { live, stale } = splitInProgress(sessionsData);
          const inProgress = onScreen ?? live;
          setStaleSession(inProgress ? null : (stale[0] ?? null));
          /* Whose it is (session record, Sep 26 2026): another trainer's
             session is watched, never recorded into (`watchedSession`). A
             take-over made here a moment ago is not undone by a snapshot that
             has not caught up with it, as a fresh Start is not. */
          const takingOver = takingOverRef.current;
          const takeOverSettling =
            !!inProgress &&
            takingOver?.id === inProgress.id &&
            Date.now() - takingOver.at < JUST_STARTED_GRACE_MS;
          const elsewhere =
            !!inProgress && !takeOverSettling && isAnotherTrainersSession(inProgress, myIdsRef.current);
          if (inProgress && elsewhere) {
            /* A Finish running here goes on: its own check decides whether
               anything is written (features/session-record/finish-wait.ts). */
            if (!finishingRef.current) {
              if (onScreen) {
                /* This iPad was recording it, and it was taken over on
                   another iPad. Sets typed here were entered before that, so
                   they are sent, and the device stops pointing at it. */
                flushAllLogWrites();
                forgetLiveSession(onScreen.id);
                currentSessionIdRef.current = null;
                setTakenFromHere(true);
              }
              setCurrentSession(null);
              setWatchedSession(inProgress);
              setShowRoutinePicker(false);
              setIsPreSessionMode(false);
            }
          } else if (inProgress) {
            setWatchedSession(null);
            setTakenFromHere(false);
            setCurrentSession(inProgress);
            setShowRoutinePicker(false);
            setIsPreSessionMode(false);
          } else {
            /* The session this iPad was watching ended on the trainer's
               iPad: say so, rather than let the briefing appear unexplained. */
            const watched = watchedSessionRef.current;
            if (watched?.id) {
              const after = sessionsData.find((s) => s.id === watched.id);
              watchedSessionRef.current = null;
              setWatchedSession(null);
              setTakenFromHere(false);
              /* Still In-Progress but no longer live: nothing saved for an
                 hour (lib/live-session.ts). The stale question takes over. */
              toastInfo(
                after?.status === "Completed"
                  ? `${(after.trainerInitials || "").trim() || "The trainer"} finished the session.`
                  : after?.status === "In-Progress"
                    ? "Nothing has been saved in this session for over an hour."
                    : "The session was discarded on another iPad.",
              );
            }
            // A session created a moment ago may not be in this snapshot yet, so
            // hold onto it briefly. Bounded on purpose: the previous version kept
            // *any* in-progress session forever, so one that had been completed or
            // deleted elsewhere stayed pinned and blocked starting a new one.
            const pending = justStartedSessionRef.current;
            const stillSettling =
              pending !== null &&
              pending.clientId === clientId &&
              Date.now() - pending.at < JUST_STARTED_GRACE_MS;

            /* A Finish in flight clears the session itself, once the
               post-session screen is ready. Clearing it here, the moment the
               iPad's copy says Completed, put the briefing on screen and took
               the End Session dialog away while Finish was still going. */
            if (!stillSettling && !finishingRef.current) {
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
  }, [clientId, user?.uid]);

  /* Which sessions' sets the logs listener below holds, and whether it
     answered (machine menu, Oct 2026): the menu draws a column only for a
     session whose sets were read, says "loading" until they are, and a
     failed read is unknown, never "nothing on this machine". */
  const [logsWindow, setLogsWindow] = useState<{ key: string; ids: string[]; state: "ready" | "cache-only" | "failed" } | null>(null);
  /* The window itself (machine-menu/older-read.ts): the running session, the
     one recorded here or the one being watched, and the newest past sessions,
     30 ids in all. The past sessions get 30 places, less one only when the
     running session takes one, and the grid draws exactly those (gridHistory
     below), so every past column it draws has its sets. It used to be the
     newest 30 ids with the running session among them, against 30 past
     columns, which left the oldest column drawn without its sets. */
  const logsPlan = useMemo(
    () => logsWindowIds(sessions.map((s) => s.id), currentSession?.id ?? watchedSession?.id ?? null),
    [sessions, currentSession?.id, watchedSession?.id],
  );
  const logsPlanKey = logsPlan.ids.join(",");
  useEffect(() => {
    const sessionIds = logsPlan.ids;
    const windowKey = logsPlanKey;
    /* Once the server has answered for this window, it stays read: losing the
       Wi-Fi later turns the snapshots cache-only, but the cache then holds
       everything the server confirmed for it. */
    const noteWindow = (state: "ready" | "cache-only" | "failed") =>
      setLogsWindow((prev) =>
        prev && prev.key === windowKey && (prev.state === state || (prev.state === "ready" && state === "cache-only"))
          ? prev
          : { key: windowKey, ids: sessionIds, state },
      );
    // A new window is unread until its own snapshot answers.
    setLogsWindow((prev) => (prev && prev.key === windowKey ? prev : null));
    if (sessionIds.length === 0) noteWindow("ready");
    if (sessionIds.length > 0) {
      const logsQuery = query(
        collection(db, "exerciseLogs"),
        where("sessionId", "in", sessionIds),
      );
      /* With metadata changes, so the window hears the server CONFIRM what the
         cache already held (without them a listener is never told, and the
         window stayed "cache-only" while online: KNOWN-TRAPS, "A snapshot the
         cache answered is not a read"). A metadata-only event (that, or a
         set's write being acknowledged) changes no set, so it only notes the
         window, and the tracker doesn't redraw for it. */
      let heard = false;
      const unsubscribeLogs = onSnapshot(
        logsQuery,
        { includeMetadataChanges: true },
        (snapshot) => {
          const first = !heard;
          heard = true;
          if (!first && snapshot.docChanges().length === 0) {
            noteWindow(snapshot.metadata?.fromCache ? "cache-only" : "ready");
            return;
          }
          const logsMap: Record<string, ExerciseLog> = {};
          snapshot.docs.forEach((doc) => {
            const data = { id: doc.id, ...doc.data() } as ExerciseLog;
            const key = `${data.sessionId}_${data.machineId}${data.side ? "_" + data.side : ""}`;
            logsMap[key] = data;
          });
          /* A set whose write is still in the queue keeps what the trainer
             typed: this snapshot may be another machine's save landing, and it
             carries this set's older numbers (lib/pending-log-edits.ts). */
          const pending = pendingLogEdits(pendingLogWritesRef.current.values());
          setLogs((prev) => keepPendingEdits(logsMap, prev, pending));
          noteWindow(snapshot.metadata?.fromCache ? "cache-only" : "ready");
        },
        (error) => {
          noteWindow("failed");
          handleFirestoreError(error, OperationType.GET, "exerciseLogs");
        },
      );
      return () => unsubscribeLogs();
    }
    // The window's ids are the whole of what this listens to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsPlanKey]);

  // Routine Alternation Logic & Historical Lifts Fetching
  useEffect(() => {
    if (clientId && !currentSession && isPreSessionMode) {
      const determineAndFetch = async () => {
        const completed = sessions.filter((s) => s.status === "Completed");
        const lastSess = completed[0];
        const isRoutineBActive = selectedClient?.isRoutineBActive || false;

        /* Strict alternation, in one place since Sep 26 2026 so the profile's
           routine card says the same (features/routines/next-routine.ts). A
           client with no routines yet is pointed at Routine A; the briefing
           says how they start (a starting plan, their routine from before
           Journey, or both doors), and Start makes no routine of today's
           list (routine-plan/briefing-plan.ts). */
        const target: Routine =
          nextRoutine(routines, lastSess?.routineId, isRoutineBActive) ??
          ({ name: "Routine A", machineIds: [], clientId } as Routine);

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
   *
   * An EMPTY recorded list with no routine is a session started with nothing
   * chosen (a walk-in built on the fly, the first-session design round, Oct
   * 8 2026): it runs empty and the trainer adds machines as they go, never
   * the whole floor. Only a session with no list on record at all and no
   * routine (an open session started before Oct 9 2026; an open session
   * started since records its empty list) takes the floor. A routine read
   * here runs what it runs today (`todayFor`: its machines, else its plan's
   * day one while it is empty), never an empty list in place of day one.
   */
  const seededMachinesForSession = useRef<string | null>(null);
  /* The session whose list is on screen: until today's list is seeded, an
     empty list is "not read yet", so the empty Now Bar offers nothing to add
     (an add would be recorded as the session's whole list, and the routine's
     machines, still loading, would be dropped). The first-session design
     round, Oct 8 2026. */
  const [seededSessionId, setSeededSessionId] = useState<string | null>(null);

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
      setSeededSessionId(sessionId);
      setActiveMachineIds(recorded);
      return;
    }

    const routine = routines.find((r) => r.id === currentSession?.routineId);
    if (routine) {
      seededMachinesForSession.current = sessionId;
      setSeededSessionId(sessionId);
      setActiveMachineIds(Array.isArray(recorded) ? [...recorded] : todayFor({ routine: routine.machineIds, plan: routine.plan }));
    } else if (!currentSession?.routineId && Array.isArray(recorded)) {
      // Started with nothing chosen: the session's own empty list.
      seededMachinesForSession.current = sessionId;
      setSeededSessionId(sessionId);
      setActiveMachineIds([]);
    } else if (!currentSession?.routineId && floorMachines.length > 0) {
      // No list on record and no routine to read (an open session from before Oct 9 2026): the floor is the list.
      seededMachinesForSession.current = sessionId;
      setSeededSessionId(sessionId);
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

  /*
   * START NEVER WAITS ON THE NETWORK (speed round, Oct 5 2026; R9).
   * features/session-record/start-plan.ts is the plan and says why. In short:
   * the ids are made here, the session, its new routine (when one has to be
   * made) and the prefilled sets go in ONE batch that is issued and never
   * awaited, and the screen switches to the session in the same tap, online
   * or off. The client's own fields and the arrival note are separate writes,
   * never waited on either. A refusal comes back through the batch's promise
   * and is said; the session then leaves the screen as the iPad's copy drops
   * it.
   *
   * `startFollowUpRef` carries what Start could not decide yet because the
   * client's routines or machine settings had not been read (start-plan's
   * "known"): the effect below finishes it the moment they are.
   */
  const startFollowUpRef = useRef<{
    sessionId: string;
    clientId: string;
    routineType: StartRoutineType;
    customMachines: string[] | null;
    /** The starting plan the briefing handed up, kept once the routines are known to hold no Routine A. */
    startPlan: StartPlanAtStart | null;
    routineDone: boolean;
    seeded: boolean;
    plannedMachineIds: string[];
    clientHomeStudioId: string;
    studioId: string;
  } | null>(null);
  /*
   * THE FILEMAKER FLOOR (the open session round, Oct 9 2026; AJ's "1b": "i
   * think the open session should honestly feel most like a filemaker
   * session ... you have every machine on the screen and you just fill in
   * the ones you did"). A session with no routine that records its own list
   * (an open session, `[]` at Start; a client session with no routine,
   * which has started empty since Oct 8 2026) opens with every machine on
   * the floor showing, in the studio's walking order: the grid's "Not in
   * today's routine" fold is open, so every row has the Today column's +,
   * and + adds the machine and makes it the one in hand. The floor is a
   * VIEW: the session records only what was added (`sessionMachineIds`, in
   * the order done), never the floor, so it is never read as Free
   * (`ranAsFree`): a client session's Wrap-up offers Next time from it, and
   * so does an open session's once Who's this? has given it a client (its
   * Finish is the ordinary one since then, `assignSessionToClient`); an open
   * session given its client here keeps the floor open (`assignedHereId`).
   * For a client, only once the routines are known AND a Start that could
   * not decide its routine has (`startFollowUpRef`, read here because the
   * effect that settles it always sets the session after): until then the
   * session has no routine yet and may take the client's in a moment, and
   * the floor would open for a frame and fold again (the review, Oct 9
   * 2026). The corner's Today's routine still folds it, for this session.
   */
  const startDeciding =
    !!currentSession &&
    startFollowUpRef.current?.sessionId === currentSession.id &&
    !startFollowUpRef.current.routineDone;
  const floorView =
    !!currentSession &&
    !currentSession.routineId &&
    Array.isArray(currentSession.sessionMachineIds) &&
    (!clientId || assignedHereId === currentSession.id || (routinesKnown && !startDeciding));
  const showAllSessionId = currentSession?.id ?? null;
  const showAllMachines = showAllPick && showAllPick.sessionId === showAllSessionId ? showAllPick.all : floorView;
  const setShowAllMachines = (all: boolean) => setShowAllPick({ sessionId: showAllSessionId, all });
  /*
   * How the session on screen was started (A, B or Free), for the Wrap-up's
   * Next time: a Free session has none (the first-session design round,
   * Oct 8 2026, §4.7). A session resumed after a reload has no record of
   * it here, and Finish falls back to reading a session with no routine
   * that runs the whole floor as Free.
   */
  const startedAsRef = useRef<{ sessionId: string; routineType: StartRoutineType } | null>(null);
  /*
   * Every machine the session's routine and Routine A held while the session
   * ran (their machines, their plans' road and day one: `routineHolds`),
   * gathered as the routines change, for the Wrap-up's Next time: a machine
   * held then and held by neither at Finish was let go today (a Swap in the
   * plan, a Re-plan or a Can't do from the session's corner after its set
   * was logged: "Today's set stays. The plan changes from next session.";
   * or an edit on Programming), and is never offered back (the review of
   * the Next time phase, Oct 9 2026). A ref, never a write.
   */
  const heldDuringSessionRef = useRef<{ sessionId: string; ids: string[] } | null>(null);
  /** What the Wrap-up's Next time last wrote, for this session: a later hand-over writes only the difference. */
  const nextTimeHandedRef = useRef<{ sessionId: string; ticked: string[] } | null>(null);
  useEffect(() => {
    const sessionId = currentSession?.id;
    if (!sessionId || !routinesKnown) return;
    const own = currentSession.routineId ? routines.find((r) => r.id === currentSession.routineId) : null;
    const held = heldDuringSessionRef.current?.sessionId === sessionId ? heldDuringSessionRef.current.ids : [];
    const ids = [...held];
    for (const id of [...routineHolds(own), ...routineHolds(findRoutineByLetter(routines, "A"))]) {
      if (!ids.includes(id)) ids.push(id);
    }
    heldDuringSessionRef.current = { sessionId, ids };
  }, [currentSession?.id, currentSession?.routineId, routines, routinesKnown]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The prefilled sets for a session, as batch writes. Never over a set this iPad holds. */
  const seedsFor = (sessionId: string, machineIds: string[], clientHomeStudioId: string, studioId: string) =>
    seedLogs({
      sessionId,
      machineIds,
      prefill: prefillOf(selectedClient, clientMachineSettings),
      settings: clientMachineSettings,
      nameOf: (id) => floorMachines.find((m) => m.id === id)?.name,
      clientId: clientId || "",
      clientHomeStudioId,
      studioId,
      createdAt: serverTimestamp(),
      // A set this iPad already sent counts too: its echo may not be in logsRef yet.
      hasLocal: (key) =>
        !!logsRef.current[key] || pendingLogWritesRef.current.has(key) || writtenLogIdsRef.current.has(key),
    });

  /**
   * A start batch the database refused: said once, and the session leaves
   * this iPad. A refusal can come late (on reconnect, after a whole offline
   * session). The sets typed meanwhile were their own writes and are the only
   * record of what the client lifted, so they are KEPT (the speed round's
   * final review, Oct 6 2026): the ones still waiting are sent, and only the
   * untouched prefills are deleted, in one batch (refusedStartSweep). A kept
   * set is an administrator's to recover, and the toast says so.
   */
  const startRefused = (sessionId: string, error: unknown, plannedMachineIds: string[]) => {
    console.error("[start] the session was refused", error);
    for (const [key, pending] of Array.from(pendingLogWritesRef.current.entries())) {
      if (pending.payload?.sessionId !== sessionId) continue;
      flushLogWrite(key);
    }
    const machineIds = Array.from(
      new Set([
        ...plannedMachineIds,
        ...(currentSessionIdRef.current === sessionId ? activeMachineIdsRef.current : []),
      ]),
    );
    const { remove, kept } = refusedStartSweep(sessionId, logsRef.current, machineIds, (id) =>
      writtenLogIdsRef.current.has(id) || pendingLogWritesRef.current.has(id),
    );
    if (remove.length > 0) {
      const sweep = writeBatch(db);
      for (const id of remove) sweep.delete(doc(db, "exerciseLogs", id));
      sweep.commit().catch((e) => console.error("[start] the refused session's prefills were not cleared", e));
    }
    if (startFollowUpRef.current?.sessionId === sessionId) startFollowUpRef.current = null;
    forgetLiveSession(sessionId);
    if (justStartedSessionRef.current?.id === sessionId) justStartedSessionRef.current = null;
    if (currentSessionIdRef.current === sessionId) {
      currentSessionIdRef.current = null;
      setCurrentSession(null);
      setIsPreSessionMode(true);
    }
    toastError(
      kept.length > 0
        ? "The session didn't start, so it isn't on the record. The sets typed are kept: tell a leader."
        : "The session didn't start. Check the connection, then press Start again.",
    );
  };

  const startNewSession = (
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
    /** The arrival note's category, when one was picked on the briefing (Oct 3 2026). */
    arrivalCategory?: FilingCategory | null,
    /**
     * A client starting out at the studio: the plan the briefing handed up
     * (the first-session design round, Oct 8 2026, §4.5). Written here, in
     * the Start batch, with an EMPTY Routine A; today's machines are the
     * session's.
     */
    startPlan?: StartPlanAtStart | null,
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
      /* Which routine: the client's, Routine A made from a starting plan
         (only once the routines are known to hold none), none (today's list
         as chosen; Start never saves it as a routine), or not decided yet
         (start-plan.ts). */
      const routine = resolveStartRoutine({ routineType, customMachines, routines, routinesKnown, startPlan, todayYmd: date });

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

      // Ids made on this iPad: nothing waits for the database to name them.
      const sessionRef = doc(collection(db, "sessions"));
      const batch = writeBatch(db);
      /* A starting plan kept by Start: Routine A (EMPTY, the plan carrying
         day one) and the plan's first change, in this batch, written by the
         plan's own writer (routine-plan/store.ts). Nothing else on the
         session path makes a routine. */
      const madeRoutineId =
        routine.kind === "plan"
          ? addStartPlanToBatch(db, batch, {
              routineId: routine.routineId,
              clientId,
              studioId: selectedClient?.homeStudioId || "",
              name: "Routine A",
              machineIds: [],
              plan: routine.startPlan.plan,
              change: startChangeOf(routine.startPlan, {
                uid: user.uid,
                ...(authTrainer?.fullName ? { name: authTrainer.fullName } : null),
              }),
            }).routineId
          : null;
      /* B planned beside it, at a studio that starts new clients on A and B
         together (its setting `newClientsStart`; item 8): Routine B with its
         plan and NO machines, in this same batch, B off until the Wrap-up
         that starts Routine A starts it. Never over a Routine B of the
         client's own. Over the client's own EMPTY Routine B, B is switched
         off by its own write after the batch is issued, never inside it: a
         client the rules refuse an update to must never take the session
         down (store.ts's header; the whole-branch review, Oct 9 2026). */
      const plannedB =
        routine.kind === "plan"
          ? addPlannedBAtStart(db, batch, {
              routines,
              clientId,
              studioId: selectedClient?.homeStudioId || "",
              b: plannedBAtStart(routine.startPlan, {
                uid: user.uid,
                ...(authTrainer?.fullName ? { name: authTrainer.fullName } : null),
              }),
            })
          : null;
      const routineId = routine.kind === "existing" ? routine.routine.id : (madeRoutineId ?? undefined);

      /* What this session intends to run. Recorded on the document from the
         first moment so that the session, not the routine, is the thing the
         screen reads back — see WorkoutSession.sessionMachineIds. */
      const plannedMachineIds = plannedMachinesOf(routine, customMachines);
      /* A Free session keeps its own behaviour: no routine, so the floor is
         its list, recorded as such (nothing is prefilled for it); with the
         floor not read yet, no list is recorded, and the session takes the
         floor the moment it is (the seeding below). Every other session
         records exactly what it runs, an empty list included: a session
         started with nothing chosen runs empty, never the floor. */
      const freeFloorIds = floorMachines.map((m) => m.id!).filter(Boolean);
      const sessionListIds: string[] | undefined =
        routine.kind === "free" && plannedMachineIds.length === 0
          ? freeFloorIds.length > 0
            ? freeFloorIds
            : undefined
          : plannedMachineIds;

      const sessionData: any = cleanPayload({
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
        sessionMachineIds: sessionListIds,
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

      /* The prefilled sets go in the same batch when they can be worked out
         now: the routine decided and the settings read. Otherwise they follow
         (the effect after this function). Seeding in the same batch is what
         ended the old offline overwrite: the seed used to wait behind the
         session's own write, and on reconnect it landed over weights typed in
         the meantime. Merged, and never over a set this iPad already holds. */
      const sessionStudioId = currentStudioId || clientHomeStudioId || "";
      const homeId = clientHomeStudioId || "";
      const seedNow = routine.kind !== "unknown" && settingsKnown && totalsKnown;
      const seeds = seedNow ? seedsFor(sessionRef.id, plannedMachineIds, homeId, sessionStudioId) : [];

      batch.set(sessionRef, sessionData);
      for (const seed of seeds) {
        batch.set(doc(db, "exerciseLogs", seed.id), seed.payload, { merge: true });
      }
      // Issued now and never awaited: the iPad's copy holds it this instant.
      const committing = batch.commit();
      committing.catch((error) => startRefused(sessionRef.id, error, plannedMachineIds));
      markSent();
      if (plannedB?.turnsBOff) setRoutineBActive(db, clientId, false).catch(() => {});

      // Protects this session from being cleared by a snapshot that predates it.
      justStartedSessionRef.current = {
        id: sessionRef.id,
        clientId,
        at: Date.now(),
      };
      currentSessionIdRef.current = sessionRef.id;
      startedAsRef.current = { sessionId: sessionRef.id, routineType };
      // The device remembers the live session, so the bottom tab can bring
      // the trainer straight back after a crash (lib/live-session.ts).
      rememberLiveSession(sessionRef.id);

      /* A routine not decided yet: the session holds the list the briefing
         gave (often none) until it is, and the machine list is not taken
         from the floor as if it were a Free session. That list is on screen
         now (`seededSessionId`), so the Now Bar offers Add from the first
         moment, offline and before the routines ever answer (the consult on
         slow Wi-Fi; the whole-branch review, Oct 9 2026): what the trainer
         adds meanwhile is kept beside the routine's machines when they come
         (`followUpList`). */
      if (routine.kind === "unknown") {
        seededMachinesForSession.current = sessionRef.id;
        setSeededSessionId(sessionRef.id);
        activeMachineIdsRef.current = plannedMachineIds;
        setActiveMachineIds(plannedMachineIds);
      }
      startFollowUpRef.current =
        routine.kind === "unknown" || !seedNow
          ? {
              sessionId: sessionRef.id,
              clientId,
              routineType,
              customMachines: customMachines ? [...customMachines] : null,
              startPlan: routine.kind === "unknown" ? (routine.startPlan ?? null) : null,
              routineDone: routine.kind !== "unknown",
              seeded: seedNow,
              plannedMachineIds,
              clientHomeStudioId: homeId,
              studioId: sessionStudioId,
            }
          : null;

      /* The client's own fields, apart from the session: the clients rules
         limit what a visiting or cross-train trainer may change, and one
         refused field must never take the session down with it. */
      const patch = startClientPatch({
        routineType,
        client: selectedClient,
        sessionNumber: nextNum,
        runsSavedRoutine: routine.kind === "existing",
      });
      const clientUpdateData: Record<string, unknown> = {};
      if (patch.isRoutineBActive) clientUpdateData.isRoutineBActive = true;
      if (patch.firstSessionDate) clientUpdateData.firstSessionDate = serverTimestamp();
      if (Object.keys(clientUpdateData).length > 0) {
        updateDoc(doc(db, "clients", clientId), clientUpdateData).catch((error) =>
          console.error("[start] the client's routine or first-session mark was not saved", error),
        );
      }

      if (adjustmentNote && adjustmentNote.trim()) {
        /* The "why the routine changed today" note goes to the client's
           Journal (journalEntries, origin pre_session) — the canonical notes
           collection — not to the legacy sessionNotes. Author is the Auth
           uid, which the rule pins authorId to. Never blocks the start: it
           is issued and never waited on, and a note that fails is reported. */
        const initials = (
          authTrainer?.initials ||
          (authTrainer?.fullName || "").substring(0, 2) ||
          "??"
        ).toUpperCase();
        const arrivalStored = (({ kind, category }) => ({ kind, category }))(
          storedNoteOf(arrivalCategory ?? null, null, null),
        );
        createJournalEntry(
          clientId,
          // Her home studio's note, wherever the session is (Oct 2 2026).
          clientHomeStudioId || currentStudioId || "",
          { id: user.uid, initials, fullName: authTrainer?.fullName || initials },
          {
            /* Filed as it is written when the trainer picked what kind it
               is (notes round, Oct 3 2026), at that kind's starting
               loudness — an ache filed as Health is a Heads up, read out
               at her next four sessions and seen by the studio's leaders.
               Left unpicked it is unfiled, at Note, and waits in the tray. */
            ...arrivalStored,
            /* The briefing's box is the ARRIVAL note now ("how they slept,
               an ache, a trip coming up") — it only reads as a routine
               change when the sequence actually changed. */
            body: (customMachines
              ? `Routine adjusted for today: ${adjustmentNote.trim()}`
              : `On arrival: ${adjustmentNote.trim()}`
            ).slice(0, 5000),
            importance: arrivalCategory ? DEFAULT_IMPORTANCE[arrivalCategory] : "standard",
            machineId: null,
            focusId: null,
            // Linked to the session it opened, with its number and day
            // (client-notes/session-link.ts).
            ...sessionLinkOf({ id: sessionRef.id, sessionNumber: nextNum, date }, date),
            origin: "pre_session",
          },
        ).catch((err) => {
          console.error("[start] adjustment note did not reach the Journal", err);
          toastError("The session started, but the routine note could not be saved. Add it from Notes & Profile → Notes.");
        });
      }

      const newSession = {
        id: sessionRef.id,
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
        sessionMachineIds: sessionListIds,
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
      /* Plain words, not the developer toast: Start is the one button a
         trainer presses with the client standing there (session record). */
      console.error("[start] the session did not start", error);
      toastError("The session didn't start. Check the connection, then press Start again.");
    }
  };

  /*
   * WHAT START COULD NOT DECIDE YET, decided the moment it can (R9). The
   * routine, once the client's routines are known: the client's own, or,
   * when the briefing handed up a starting plan and the client still has no
   * Routine A, Routine A made EMPTY with the plan on it (routine-plan's
   * writer, in the same batch as the session's routine id). With no plan
   * handed up and no routine, nothing is made: the session keeps the list it
   * started with (Start never saves today's list as a routine). The
   * prefilled sets, once the routine is decided and the settings are known:
   * merged, and never over a set this iPad holds, so a weight typed while
   * they waited stays. Nothing here holds Start or Finish.
   */
  useEffect(() => {
    const f = startFollowUpRef.current;
    if (!f || f.clientId !== clientId) return;
    if (currentSession?.id !== f.sessionId) return;

    if (!f.routineDone) {
      if (!routinesKnown) return;
      const routine = resolveStartRoutine({
        routineType: f.routineType,
        customMachines: f.customMachines,
        routines,
        routinesKnown: true,
        startPlan: f.startPlan,
        todayYmd: studioTodayKey(),
      });
      const planned = plannedMachinesOf(routine, f.customMachines);
      /* The routine's machines and whatever the trainer added while it
         loaded, together: neither list drops the other (`followUpList`). */
      const onScreen = [...activeMachineIdsRef.current];
      const machinesToWrite = followUpList({ started: f.plannedMachineIds, current: onScreen, planned });
      const batch = writeBatch(db);
      let routineId: string | null = null;
      if (routine.kind === "existing") {
        routineId = routine.routine.id ?? null;
        /* A B session that turned out to run the client's own Routine B
           switches the alternation on, as Start does when it knows at once
           (startClientPatch): its own write, apart from the session, never
           waited on. */
        if (f.routineType === "B" && !selectedClient?.isRoutineBActive) {
          updateDoc(doc(db, "clients", f.clientId), { isRoutineBActive: true }).catch((error) =>
            console.error("[start] the client's routine mark was not saved", error),
          );
        }
      } else if (routine.kind === "plan") {
        routineId = addStartPlanToBatch(db, batch, {
          routineId: routine.routineId,
          clientId: f.clientId,
          studioId: selectedClient?.homeStudioId || "",
          name: "Routine A",
          machineIds: [],
          plan: routine.startPlan.plan,
          change: startChangeOf(routine.startPlan, {
            uid: user.uid,
            ...(authTrainer?.fullName ? { name: authTrainer.fullName } : null),
          }),
        }).routineId;
        // B planned beside it ("A and B together"), in the same batch, as at
        // Start; B switched off over an empty B of the client's own by its
        // own write, never in this batch (store.ts's header).
        const plannedB = addPlannedBAtStart(db, batch, {
          routines,
          clientId: f.clientId,
          studioId: selectedClient?.homeStudioId || "",
          b: plannedBAtStart(routine.startPlan, {
            uid: user.uid,
            ...(authTrainer?.fullName ? { name: authTrainer.fullName } : null),
          }),
        });
        if (plannedB?.turnsBOff) setRoutineBActive(db, f.clientId, false).catch(() => {});
      }
      // No routine and the same list as recorded: nothing to say to the session.
      const sameIds = (a: readonly string[], b: readonly string[]) => a.join(",") === b.join(",");
      const sameList = sameIds(machinesToWrite, f.plannedMachineIds) && sameIds(machinesToWrite, onScreen);
      if (routineId !== null || !sameList) {
        batch.update(doc(db, "sessions", f.sessionId), {
          routineId,
          sessionMachineIds: machinesToWrite,
          lastHeartbeatAt: serverTimestamp(),
        });
        batch.commit().catch((error) =>
          handleFirestoreError(error, OperationType.UPDATE, "sessions"),
        );
        markSent();
      }
      f.routineDone = true;
      f.plannedMachineIds = machinesToWrite;
      setCurrentSession((cur) =>
        cur && cur.id === f.sessionId
          ? ({ ...cur, routineId, sessionMachineIds: machinesToWrite } as WorkoutSession)
          : cur,
      );
      // Today's list is the session's from here, on screen either way.
      seededMachinesForSession.current = f.sessionId;
      setSeededSessionId(f.sessionId);
      if (!sameIds(machinesToWrite, onScreen)) {
        activeMachineIdsRef.current = machinesToWrite;
        setActiveMachineIds(machinesToWrite);
      }
    }

    if (f.routineDone && !f.seeded && settingsKnown && totalsKnown) {
      f.seeded = true;
      const seeds = seedsFor(f.sessionId, f.plannedMachineIds, f.clientHomeStudioId, f.studioId);
      if (seeds.length > 0) {
        const batch = writeBatch(db);
        for (const seed of seeds) batch.set(doc(db, "exerciseLogs", seed.id), seed.payload, { merge: true });
        batch.commit().catch((error) => handleFirestoreError(error, OperationType.WRITE, "exerciseLogs"));
        markSent();
      }
    }
    if (f.routineDone && f.seeded) startFollowUpRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routinesKnown, settingsKnown, totalsKnown, routines, clientMachineSettings, currentSession?.id, clientId]);

  /*
   * WHO'S THIS? (the open session round, Oct 9 2026; finding 3 of
   * docs/rounds/2026-10-09-open-session.md). An open session is given its
   * client at any time, from the session bar or still at Finish, and carries
   * on as that client's session: the same session, its sets and its list,
   * with the client's settings, history, totals and plan arriving as their
   * listeners answer. Nothing restarts.
   *
   * It used to await every step, write the sets one at a time (refused by the
   * rules, so the session moved and its sets didn't, with only a
   * console.error), mark the session Completed and send the trainer to the
   * profile, so Finish never ran: no session number, counters, totals,
   * Wrap-up or Next time.
   *
   * Now it is ONE batch, issued and never awaited (features/open-session/
   * assign.ts): the session gets the client's fields as a client Start
   * writes them, and every set it holds gets the client. The sets are
   * gathered when the batch is built, never at the tap (the rules never let
   * a set follow on its own once the session has its client, so a set typed
   * in between must be in it): from the screen, from the typing timer (sent
   * first, so they are on record before the batch names their client), from
   * the iPad's own copy of the database (`getDocsFromCache`, at once,
   * offline too) and, when that copy may not hold them all, from the
   * server's (`getDocs`, for a moment at most). Nothing on screen waits for
   * the reads, and a Finish tapped meanwhile issues the batch first
   * (`assignIssueRef`). A refusal is a toast, the sets are sent again
   * without the client, and the session goes back to being open on screen.
   * At Finish, the End session question comes back as the client's, and its
   * Finish is the ordinary one (commitEndSession, the Wrap-up, Next time).
   */
  const assignSessionToClient = (targetClientId: string, known?: Client | null) => {
    setShowAssignDialog(false);
    setCreatingClient(false);
    const session = currentSession;
    const target =
      clients.find((c) => c.id === targetClientId) ?? (known && known.id === targetClientId ? known : null);
    if (!session?.id || !session.isUnassigned || !target?.id) return;
    const fromFinish = assignFrom === "finish";
    /* Whether the iPad's copy holds every set of this session: its sets
       listener has had the server's answer for it. Almost always, on a
       session that has been running; not on one just taken over or resumed. */
    const copyIsWhole = logsWindow?.state === "ready" && logsWindow.ids.includes(session.id);
    const online = sendState.online;
    guardLeave(() => {
      const sessionId = session.id!;
      // Once only: a second tap in the picker as it closes names nobody else.
      if (assigningRef.current?.sessionId === sessionId) return;
      const client = target as Client & { id: string };

      const patch = assignSessionPatch({
        client,
        hostedAtStudioId: session.hostedAtStudioId || contextActiveStudioId,
        stamp: serverTimestamp(),
      });

      /* On screen at once, as the client's session. */
      const assigned = { ...session, ...patch, lastHeartbeatAt: Timestamp.now() } as WorkoutSession;
      assigningRef.current = { sessionId, clientId: client.id };
      // The client's sessions stream may answer before the batch is in the iPad's copy: hold the session meanwhile.
      justStartedSessionRef.current = { id: sessionId, clientId: client.id, at: Date.now() };
      currentSessionIdRef.current = sessionId;
      setAssignedHereId(sessionId);
      setCurrentSession(assigned);
      setSessions((prev) => [assigned, ...prev.filter((s) => s.id !== sessionId)]);
      setLogs((prev) => {
        const next: Record<string, ExerciseLog> = {};
        for (const [key, log] of Object.entries(prev)) {
          next[key] = log?.sessionId === sessionId && !log.clientId ? ({ ...log, clientId: client.id } as ExerciseLog) : log;
        }
        return next;
      });
      setSelectedClient(client);
      if (fromFinish) setShowEndConfirmation(true);

      /* The batch, then the client on screen everywhere (the tracker's
         clientId, and with it the client's listeners and every set written
         from here). In that order: a set written with the client before the
         batch has named the session's would be refused. The sets are
         gathered HERE, when the batch is built, never at the tap: a set
         typed while the reads were out is in it (the rules never let a set
         follow on its own once the session has its client). */
      const issue = (read: HeldSet[]) => {
        /* The sets still on the typing timer, then sent, ahead of the batch. */
        const queued: HeldSet[] = [];
        for (const [id, pending] of Array.from(pendingLogWritesRef.current.entries())) {
          const p = pending.payload ?? {};
          if (p.sessionId === sessionId) queued.push({ id, sessionId, machineId: p.machineId ?? null, clientId: p.clientId ?? null });
        }
        flushAllLogWrites();
        const onScreen: HeldSet[] = (Object.values(logsRef.current) as ExerciseLog[])
          .filter((l) => l?.sessionId === sessionId && !!l.id && !String(l.id).startsWith("temp_"))
          .map((l) => ({ id: String(l.id), sessionId, machineId: l.machineId ?? null, clientId: l.clientId ?? null }));
        try {
          const { sets, withClient } = setsToAssign(sessionId, client.id, [onScreen, queued, read]);
          if (withClient.length > 0) console.warn("[assign] sets that already have another client are left as they are", withClient);
          const batch = writeBatch(db);
          batch.update(doc(db, "sessions", sessionId), patch);
          for (const set of sets) {
            batch.set(doc(db, "exerciseLogs", set.id), assignSetPatch(sessionId, set, client), { merge: true });
          }
          // Never awaited. The mark that it is being assigned stays while it is on screen:
          // the open sessions' listener must not take it off as it leaves their list.
          batch.commit().catch((error) => assignRefused(sessionId, session, client, error));
          markSent();
        } catch (error) {
          assignRefused(sessionId, session, client, error);
          return;
        }
        /* A client's first session marks their first Journey day, as a
           client Start does (startClientPatch), in its own write apart from
           the session's: "Client since", milestones and Month's
           anniversaries read it, and nothing else writes it. */
        const mark = startClientPatch({
          routineType: "Free",
          client,
          sessionNumber: Number(patch.sessionNumber) || 0,
          runsSavedRoutine: false,
        });
        if (mark.firstSessionDate) {
          updateDoc(doc(db, "clients", client.id), { firstSessionDate: serverTimestamp() }).catch((error) =>
            console.error("[assign] the client's first-session mark was not saved", error),
          );
        }
        rememberLiveSession(sessionId);
        // Asked about at the tap (guardLeave); never asked twice.
        chooseClientNow(client.id);
      };

      /* What the database holds of the session's sets: the iPad's copy at
         once, and the server's too when the copy may not hold them all
         (online, for a moment at most). Nothing on screen waits for either,
         and a Finish tapped meanwhile issues the batch with what is known,
         ahead of its own (`assignIssueRef`). */
      const setsQuery = query(collection(db, "exerciseLogs"), where("sessionId", "==", sessionId));
      const read: HeldSet[] = [];
      const take = (snap: { docs: { id: string; data: () => unknown }[] }) => {
        for (const d of snap.docs) {
          const data = (d.data() ?? {}) as Partial<ExerciseLog>;
          read.push({ id: d.id, sessionId: data.sessionId ?? null, machineId: data.machineId ?? null, clientId: data.clientId ?? null });
        }
      };
      let issued = false;
      const issueOnce = () => {
        if (issued) return;
        issued = true;
        if (assignIssueRef.current?.sessionId === sessionId) assignIssueRef.current = null;
        issue(read);
      };
      assignIssueRef.current = { sessionId, now: issueOnce };
      // A copy that can't be read: the sets on screen and on the timer are the ones it knows.
      const reads: Promise<unknown>[] = [getDocsFromCache(setsQuery).then(take, () => undefined)];
      if (!copyIsWhole && online) {
        reads.push(
          Promise.race([
            getDocs(setsQuery).then(take, () => undefined),
            new Promise((done) => setTimeout(done, ASSIGN_SERVER_READ_WAIT_MS)),
          ]),
        );
      }
      Promise.all(reads).then(issueOnce, issueOnce);
    });
  };

  /* The batch was refused. Said, unless a Finish has run for the session
     (its own result speaks: Finish names the client in its own batch). The
     sets typed meanwhile are sent again without the client the rules refused
     them for. And, while this screen is up, the session is open again on it
     (it still is in the database), without asking (nothing is left behind:
     the client on screen goes back to none); once the trainer has left it,
     the screen they are on now is left alone. */
  const assignRefused = (sessionId: string, before: WorkoutSession, client: Client, error: unknown) => {
    console.error("[assign] the session was not given its client", error);
    if (assigningRef.current?.sessionId === sessionId) assigningRef.current = null;
    if (assignIssueRef.current?.sessionId === sessionId) assignIssueRef.current = null;
    if (justStartedSessionRef.current?.id === sessionId) justStartedSessionRef.current = null;
    if (currentSessionIdRef.current !== sessionId || finishingRef.current) return;
    toastError(assignRefusedWords(clientFirstName(client)));
    /* Sets still on the typing timer go without the client; every other set
       on screen is sent again as it is shown, without the client: a set
       edited while the batch was on its way was sent naming the client, and
       refused with it. */
    for (const pending of Array.from(pendingLogWritesRef.current.values())) {
      if (pending.payload?.sessionId === sessionId) delete pending.payload.clientId;
    }
    for (const log of Object.values(logsRef.current) as ExerciseLog[]) {
      if (log?.sessionId !== sessionId || !log.id || String(log.id).startsWith("temp_")) continue;
      if (pendingLogWritesRef.current.has(String(log.id))) continue;
      setDoc(
        doc(db, "exerciseLogs", String(log.id)),
        cleanPayload({ ...resendSetFields(log as unknown as Record<string, unknown>), updatedAt: serverTimestamp() }),
        { merge: true },
      ).catch((e) => console.error("[assign] a set was not sent again", e));
    }
    if (!trackerMountedRef.current) return;
    setAssignedHereId(null);
    setShowEndConfirmation(false);
    setCurrentSession(before);
    setLogs((prev) => {
      const next: Record<string, ExerciseLog> = {};
      for (const [key, log] of Object.entries(prev)) {
        next[key] = log?.sessionId === sessionId && log.clientId === client.id ? ({ ...log, clientId: null } as unknown as ExerciseLog) : log;
      }
      return next;
    });
    setSelectedClient(null);
    chooseClientNow(null);
  };

  /*
   * DISCARD IS ONE BATCH, NEVER WAITED ON (speed round, Oct 5 2026; R9).
   *
   * It read the session's sets from the server, then deleted them one at a
   * time and the session last, each delete awaited: 10-20 round trips, a
   * second or two online, and offline it hung on the first. Now the sets this
   * iPad holds and every id the session's machines write under
   * (start-plan.ts `discardLogIds`) go in ONE batch with the session, issued
   * and never awaited, and the screen goes back to the Hub at once. Sets
   * still waiting to be sent from here are dropped first, so a late send can
   * never write a set back onto a discarded session. A set another iPad
   * wrote that this one never held is swept by a read after the batch.
   *
   * The legacy `sessionNotes` are no longer read or deleted here: nothing
   * writes them any more (journal entries replaced them), and the rules let
   * only an administrator delete one, so a trainer's Discard used to stop
   * at that step with the session still there.
   */
  const deleteSession = (sessionId: string) => {
    try {
      for (const [key, pending] of Array.from(pendingLogWritesRef.current.entries())) {
        if (pending.payload?.sessionId !== sessionId) continue;
        if (pending.timer) clearTimeout(pending.timer);
        pendingLogWritesRef.current.delete(key);
      }
      const machineIds = Array.from(
        new Set([...activeMachineIdsRef.current, ...(currentSession?.sessionMachineIds ?? [])]),
      );
      const logIds = discardLogIds(sessionId, logsRef.current, machineIds);
      const batch = writeBatch(db);
      for (const id of logIds) batch.delete(doc(db, "exerciseLogs", id));
      batch.delete(doc(db, "sessions", sessionId));
      batch.commit().then(
        () => {
          // Sets another iPad wrote that this one never held.
          getDocs(query(collection(db, "exerciseLogs"), where("sessionId", "==", sessionId)))
            .then((snap) => {
              const left = snap.docs.filter((d) => !logIds.includes(d.id));
              if (left.length === 0) return;
              const sweep = writeBatch(db);
              for (const d of left) sweep.delete(d.ref);
              return sweep.commit();
            })
            .catch((error) => console.error("[discard] leftover sets were not swept", error));
        },
        (error) => {
          console.error("[discard] the session was not discarded", error);
          toastError("The session couldn't be discarded. It is still on the client's profile, where it can be discarded again.");
        },
      );
      markSent();
      if (startFollowUpRef.current?.sessionId === sessionId) startFollowUpRef.current = null;
      forgetLiveSession(sessionId);

      if (currentSession?.id === sessionId) {
        currentSessionIdRef.current = null;
        setCurrentSession(null);
        setLogs({});
        setSelectedClientId(null);
        setView("clients");
      }
      setShowEndConfirmation(false);
      setShowCancelConfirmation(false);
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

    /* The "already finished on another iPad?" read starts now, while the
       trainer reads the dialog, so Finish rarely waits for it (R9). The tap
       checks the live sessions stream as well (finishedElsewhereAtTap). */
    if (currentSession?.id && sendState.online) {
      const id = currentSession.id;
      const read = getDocFromServer(doc(db, "sessions", id)).then((snap) =>
        snap.exists() ? ((snap.data() as WorkoutSession).status ?? null) : null,
      );
      read.catch(() => {
        /* No answer is "no": Finish goes ahead (finish-wait.ts). */
      });
      finishCheckRef.current = { sessionId: id, read };
    }
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
     run twice), then the Wrap-up (the post-session screen) reads from a
     snapshot. Its dose Dial writes on its own the moment it is tapped
     (savePostSessionDose); its Profile note is written when the trainer
     leaves the screen (leavePostSession). */
  /* The session a Finish is running for, if one is (session record, Sep 26
     2026). A second tap must not run it twice: its totals are increments. */
  const finishingRef = useRef<string | null>(null);
  /* The client's sessions stream's statuses, as of its last snapshot (never a render behind). */
  const streamStatusRef = useRef<Map<string, string | null>>(new Map());
  /* The "already finished?" read started when the End Session dialog opened (R9). */
  const finishCheckRef = useRef<{ sessionId: string; read: Promise<string | null> } | null>(null);

  const commitEndSession = async () => {
    if (!currentSession?.id || !selectedClient) return;
    if (finishingRef.current) return;
    /* A client chosen a moment ago (Who's this?) whose batch still waits on
       its reads: issued now, with what is known, so it lands before this
       Finish's own batch, which never waits for it. */
    if (assignIssueRef.current?.sessionId === currentSession.id) assignIssueRef.current.now();
    finishingRef.current = currentSession.id;

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
        // Taken out for today on the reorder sheet: the trainer's call, not
        // "not reached" (the Atlas answers, Oct 2 2026; set-outcome.ts).
        if (takenOutForToday(l, activeMachineIds)) return { ...l, ...TAKEN_OUT_OUTCOME };
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
      const sessionId = currentSession.id;

      /* Finish adds to the client's running totals, so a Finish for a session
         another iPad already finished would add them again. Ask the database,
         briefly; offline the answer is no and Finish goes ahead
         (features/session-record/finish-wait.ts). */
      const early = finishCheckRef.current?.sessionId === sessionId ? finishCheckRef.current.read : null;
      finishCheckRef.current = null;
      const alreadyFinished = await finishedElsewhereAtTap({
        streamStatus: streamStatusRef.current.get(sessionId) ?? null,
        early,
        readStatus: () =>
          getDocFromServer(doc(db, "sessions", sessionId)).then((snap) =>
            snap.exists() ? ((snap.data() as WorkoutSession).status ?? null) : null,
          ),
        online: sendState.online,
      });

      /* The session, its sets and the machine weights are saved whatever
         happened to the totals (lib/sync-utils.ts); only the client's running
         totals can be refused. Say so in one line. */
      const reportTotals = (finished: { totalsSaved: boolean | null }) => {
        if (finished.totalsSaved === false) {
          toastError(
            `Session saved. ${clientFirstName(selectedClient, "The client")}'s session count and last-time numbers didn't update.`,
          );
        }
      };
      let queued = false;
      if (alreadyFinished) {
        toastInfo("This session was already finished on another iPad, so nothing was counted twice.");
      } else {
        /* The writes are on this iPad the moment this is called; what can take
           forever is the database's answer. Wait a moment for it, not at all
           while offline, then carry on and say the session is saved on this
           iPad. A refusal inside that moment is reported, as before. */
        const finishing = completeWorkoutSession(
          db,
          currentSession,
          selectedClient,
          finalLogs,
          currentSessionNotes,
          authTrainer,
          clientMachineSettings,
          user.uid,
          sessionExtras,
          // A machine with no settings is "nothing on file" only once the server has said so (Oct 9 2026).
          { settingsOnFileKnown: settingsServerRead },
        );
        const outcome = await settleOrQueue(finishing, sendState.online);
        if (outcome.kind === "failed") throw outcome.error;
        if (outcome.kind === "saved") {
          reportTotals(outcome.value);
        } else {
          queued = true;
          finishing.then(
            (finished) => {
              reportTotals(finished);
              setPostSession((ps) => (ps && ps.session.id === sessionId ? { ...ps, queued: false } : ps));
            },
            (error) => {
              console.error("[finish] the session was refused when it reached the database", error);
              toastError(
                "This session didn't reach the studio's records, but its sets are saved. Open the client, resume the session and press Finish again.",
              );
            },
          );
        }
      }

      /* The note for the next trainer (the End Session box; "the wrap-up
         note" until the voice-review round, Sep 27 2026, when Wrap-up became
         the post-session screen's name). Until the reporting round it reached
         only the session document, which the next trainer's briefing never
         reads. It still goes there (the History list and the export read
         it); it ALSO files to the journal as a Heads up, which is the one
         loudness the briefing reads out (at her next four sessions since Oct 3 2026). Outside the
         batch, like every journal write. A note only for the profile is the
         Wrap-up's Profile note, filed at Note loudness.
         Being unfiled, it comes back in the Wrap-up's To-file tray, where it
         can be filed to the profile (AJ, Sep 27 2026) but not discarded. The
         snapshot carries its words now and its id when the write answers, so
         the Wrap-up can tell its card apart (isNextTrainerNote). */
      const nextTrainerNote = journalBodyOf(currentSessionNotes);
      if (nextTrainerNote) {
        // Filed as it is written when a kind was picked (Oct 3 2026); unfiled otherwise.
        const nextTrainerStored = storedNoteOf(nextTrainerCategory, null, null);
        createJournalEntry(
          selectedClient.id,
          sessionNoteStudioId(selectedClient, contextActiveStudioId || authTrainer?.primaryHomeStudioId),
          { id: user.uid, initials: authTrainer?.initials || "", fullName: authTrainer?.fullName || "" },
          {
            kind: nextTrainerStored.kind,
            category: nextTrainerStored.category,
            body: nextTrainerNote,
            importance: "elevated",
            machineId: null,
            focusId: null,
            ...sessionLinkOf(currentSession, studioTodayKey()),
            origin: "post_session",
          },
        ).then(
          (id) => {
            if (!id) return;
            setPostSession((ps) =>
              ps && ps.session.id === sessionId && ps.nextTrainerNote
                ? { ...ps, nextTrainerNote: { ...ps.nextTrainerNote, id } }
                : ps,
            );
          },
          () => toastError("Session saved. The note for the next trainer could not reach their briefing — add it from Notes & Profile → Notes."),
        );
      }

      /* A set skipped for pain is a note (notes round, Oct 3 2026;
         client-notes/pain-notes.ts): each pain skip still standing in the
         final log is filed as an Incident at Heads up, about that machine —
         read out at her next four sessions and on the studio's leaders'
         list. From the final log only, so a skip undone before Finish
         writes nothing. Outside the batch like every journal write; a
         failure is said, never a reason to hold Finish. */
      // Not when another iPad finished it: that iPad filed its own (the review, Oct 3 2026).
      for (const pain of alreadyFinished ? [] : painSkipNotes(finalLogs, (id) => floorMachines.find((m) => m.id === id)?.name || "")) {
        createJournalEntry(
          selectedClient.id,
          sessionNoteStudioId(selectedClient, contextActiveStudioId || authTrainer?.primaryHomeStudioId),
          { id: user.uid, initials: authTrainer?.initials || "", fullName: authTrainer?.fullName || "" },
          {
            kind: "incident",
            category: null,
            bodyParts: pain.bodyParts,
            body: pain.body,
            importance: DEFAULT_IMPORTANCE.incident,
            machineId: pain.machineId,
            focusId: null,
            ...sessionLinkOf(currentSession, studioTodayKey()),
            origin: "in_session",
          },
        ).catch(() =>
          toastError("Session saved. The pain skip couldn't be added to the client's notes — add it from Notes & Profile → Notes."),
        );
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

      /* The Wrap-up's Next time (the first-session design round, Oct 8
         2026, §4.7), frozen now: the routine the session ran as the live
         listener holds it, and today's performed machines. A Free session
         has none; one resumed after a reload with no record of how it
         started is read as Free when it ran no routine over the whole
         floor with no list of its own (`ranAsFree`): a client session with
         no routine records what was added, so it has Next time (the open
         session round, Oct 9 2026; an open session reaches here once Who's
         this? has given it a client, `assignSessionToClient`).
         Routines not known yet: no card, never a guess. A machine let go
         today (the client can't do it, or the
         routine held it while the session ran and doesn't now) is never
         offered back. Not when another iPad finished the session: that
         iPad has its own Next time, and two would write the routine twice
         (or make two Routine As), as its pain notes are its own.
         Worked out in its own try: the finish batch is already issued, so
         a plan this can't read (any trainer may write one, and the rules
         don't check its shape) costs the card, never the Wrap-up. A
         missing Next time is acceptable; a stuck Finish is not (the
         whole-branch review, Oct 9 2026). */
      let nextTime: NextTimeSnapshot | null = null;
      try {
        const startedAs = startedAsRef.current?.sessionId === sessionId ? startedAsRef.current.routineType : null;
        const ranFree = ranAsFree({
          startedAs,
          routineId: currentSession.routineId,
          // A session with its own list is never Free: on the floor it is what was added (Oct 9 2026).
          recorded: currentSession.sessionMachineIds,
          floor: floorMachines.map((m) => m.id),
          today: activeMachineIds,
        });
        nextTime = alreadyFinished
          ? null
          : nextTimeAtFinish({
              free: ranFree,
              routineId: currentSession.routineId,
              routines: routinesKnown ? routines : null,
              performed: lines.filter((l) => l.outcome === "performed").map((l) => l.machineId),
              floor: floorMachinesOf(floorMachines),
              nameOf: machineNamer(floorMachines, machines),
              todayYmd: studioTodayKey(),
              heldDuringSession:
                heldDuringSessionRef.current?.sessionId === sessionId ? heldDuringSessionRef.current.ids : [],
            });
      } catch (error) {
        console.error("[finish] next time not worked out", error);
        nextTime = null;
      }

      setPostSession({
        session: { ...currentSession, status: "Completed", endTime: new Date() },
        client: selectedClient,
        logs: finalLogs,
        lines,
        journey,
        draft: hasDraftText(noteDraft) ? noteDraft : null,
        nextTrainerNote: nextTrainerNote ? { id: null, body: nextTrainerNote } : null,
        queued,
        nextTime,
      });
      clearSessionDraft(currentSession?.id);
      setNoteDraft(null);
      forgetLiveSession(currentSession?.id);
      setCurrentSession(null);
      setCurrentSessionNotes("");
      setNextTrainerCategory(null);
      setShowEndConfirmation(false);
      setIsPostSessionMode(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "sessions");
    } finally {
      setIsSyncing(false);
      finishingRef.current = null;
    }
  };

  /** The effort Dial writes the moment it is tapped — no save button (Oct 2
      2026; it replaced the dose Dial). The untouched default is 0 with
      `effortDefaulted: true` (AJ's call), so a reader can tell it from a tap;
      a tap drops the marker. The legacy `dose` is no longer written. */
  const savePostSessionEffort = async (effort: DialValue, defaulted: boolean): Promise<boolean> => {
    const id = postSession?.session.id;
    if (!id) return false;
    try {
      await updateDoc(doc(db, "sessions", id), {
        effort,
        effortDefaulted: defaulted ? true : deleteField(),
      });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "sessions");
      // The Dial must not say "Saved" over a write that failed.
      return false;
    }
  };

  /**
   * The next session's weight, set on the Wrap-up (the Atlas answers, Oct 2
   * 2026): written onto her settings document for that machine, which every
   * session start reads, with the mark of who set it. Fired, never awaited
   * on the floor; a refusal is said in a toast and the Wrap-up says it isn't
   * saved.
   */
  const savePostSessionNextWeight = (machineId: string, weight: number, today: number | null): Promise<boolean> => {
    const s = postSession?.session;
    const c = postSession?.client;
    if (!s?.id || !c?.id) return Promise.resolve(false);
    const uid = user?.uid || "";
    const mark = nextWeightMark({
      weight,
      today,
      sessionId: s.id,
      setById: uid,
      setByName: authTrainer?.fullName || "",
      now: new Date(),
    });
    return saveNextWeight({
      clientId: c.id,
      machineId,
      homeStudioId: c.homeStudioId || (c as any).studioId || null,
      weight,
      mark,
      updatedBy: uid,
    }).then(
      () => true,
      (error) => {
        console.error("[wrap-up] next session's weight not saved", error);
        toastError("The next session's weight didn't save. Check the connection, then set it again.");
        return false;
      },
    );
  };

  /**
   * The Wrap-up's Next time (the first-session design round, Oct 8 2026,
   * §4.7): the machines ticked for next time go into the routine the
   * session ran, ONCE, on the way out (the Wrap-up hands them over on Back
   * to Hub, the iPad locked, a sign-out or the screen going; never per
   * tick). The one write a session makes to a routine's machines, through
   * routine-plan/store.ts's `saveNextTime` in one batch: with a plan, the
   * plan and its change beside the routine (`routineAfterWrapUp`,
   * `planAfterWrapUp`); with none, the routine's machines alone; with no
   * routine, Routine A made with them and no plan (or the Routine A made
   * since Finish, never a second). Issued, never awaited; a refusal is said
   * in a toast.
   *
   * The write starts from the routine as the live listener holds it NOW
   * (`withRoutineNow`), never from what Finish froze, so a change made on
   * another iPad or on Programming while the Wrap-up stood open is kept; the
   * rows stay the card's, frozen at Finish. Handed over again (the ticks
   * changed after a way out that left the screen standing, the iPad locked),
   * it writes only the difference from what it wrote last
   * (`nextTimeHandedRef`, this session's).
   *
   * AJ, Oct 7 2026: "in the wrap-up that it just by default adds on, but you
   * can say, like, tick it off". And Oct 8 2026 ("3a"): "this also counts
   * with the consult visit, sometimes the consult machines will not be the
   * same as their a routine".
   */
  const savePostSessionNextTime = (ticked: string[]) => {
    const snap = postSession;
    const frozen = snap?.nextTime;
    if (!snap || !frozen) return;
    const sessionId = snap.session.id ?? "";
    const earlier = nextTimeHandedRef.current?.sessionId === sessionId ? nextTimeHandedRef.current.ticked : null;
    const live =
      routinesKnown && clientId === snap.client.id
        ? frozen.routineId
          ? routines.find((r) => r.id === frozen.routineId)
          : findRoutineByLetter(routines, "A")
        : undefined;
    const now = withRoutineNow(frozen, live);
    const refused = (error: unknown) => {
      console.error("[wrap-up] next time not saved", error);
      toastError(`Next time didn't save. Add the machines to ${now.routineName} on Programming.`);
    };
    // The Routine A an earlier hand-over made isn't in sight (the client's
    // routines not read here now): never a second one.
    if (!now.routineId && earlier && earlier.length > 0) {
      refused(new Error("the Routine A made earlier is not in sight"));
      return;
    }
    const write = nextTimeWrite(
      now,
      ticked,
      user?.uid ? { uid: user.uid, ...(authTrainer?.fullName ? { name: authTrainer.fullName } : null) } : null,
      { rows: nextTimeOffer(frozen), earlier },
    );
    if (!write) return;
    nextTimeHandedRef.current = { sessionId, ticked: [...ticked] };
    const owner = {
      clientId: snap.client.id,
      studioId: snap.client.homeStudioId || contextActiveStudioId || "",
      trainerId: authTrainer?.id || user?.uid || "",
    };
    // From the routines as the live listener holds them now.
    const routinesHere = routinesKnown && clientId === snap.client.id;
    /* Ticks that START Routine A start a Routine B planned with the
       starting lineup too (the studio's "A and B together", item 8): B as
       A with its first swap, the swaps for machines A takes later kept
       waiting, and B turned on, in the same batch. From the routines as
       the live listener holds them now, over the floor frozen at Finish
       (the card's line asks the same). */
    const started =
      write.kind === "plan" && routinesHere
        ? plannedBStart({
            routines,
            aRoutineId: write.routineId,
            aBefore: now.machineIds,
            aAfter: write.machineIds,
            aPlan: write.plan,
            floor: plannedBFloorOf(frozen) ?? floorMachinesOf(floorMachines),
            who: user?.uid ? { uid: user.uid, ...(authTrainer?.fullName ? { name: authTrainer.fullName } : null) } : null,
            todayYmd: studioTodayKey(),
          })
        : null;
    const startB = started ? { ...started, clientId: snap.client.id } : null;
    /* Ticks into Routine A take Routine B with them when B follows A (Round
       2: B's unswapped places follow A, its own swaps stay), in the same
       batch. A B planned and not started this time follows A's road with its plan
       alone (`plannedBFollowOf`: the Wrap-up can put a machine new to the
       plan on it); a started B, never. */
    const follow =
      write.kind !== "create" && routinesHere
        ? (bFollowOf(routines, write.routineId, write.machineIds) ??
          (write.kind === "plan" && !started ? plannedBFollowOf(routines, write.routineId, write.plan) : null))
        : null;
    try {
      saveNextTime(db, write, owner, follow, startB).catch(refused);
    } catch (error) {
      refused(error);
    }
  };

  /**
   * A note written from the post-session screen: the write is on this iPad at
   * once, so the screen waits only a moment for the database's answer and never
   * while offline (features/session-record/finish-wait.ts). A refusal, now or
   * when the answer comes later, is said in `failText`.
   */
  const noteOrSay = async (write: Promise<string | null>, failText: string) => {
    const outcome = await settleOrQueue(write, sendState.online);
    if (outcome.kind === "queued") {
      write.then(
        (id) => {
          if (!id) toastError(failText);
        },
        () => toastError(failText),
      );
    } else if (outcome.kind === "failed" || !outcome.value) {
      toastError(failText);
    }
  };

  /** Files the session's unsaved draft as a note — from the post-session card, or on the way out. */
  const fileSessionDraft = async (text: string, importance: JournalImportance = "standard") => {
    const snap = postSession;
    const body = text.trim();
    if (!snap || !body || !user?.uid) return;
    const d = snap.draft;
    // Words the machine menu was writing for the studio's floor notes on a
    // machine ("The machine itself", Oct 4 2026) go there — the session's
    // studio, where the unit is — and never onto the client's record. A
    // floor draft with no machine falls through and is filed as a note
    // about the client: nothing a trainer wrote is lost.
    const floor = floorCarryOf(d);
    const floorStudioId = snap.session.hostedAtStudioId || contextActiveStudioId || null;
    if (floor && floorStudioId) {
      const machineName = floorMachines.find((m) => m.id === floor.machineId)?.name;
      await noteOrSay(
        addFloorNote({
          studioId: floorStudioId,
          machineId: floor.machineId,
          machineName,
          body,
          writer: { name: authTrainer?.fullName || "" },
        }),
        "That note could not be added to the studio's notes — add it from Learning → Catalog → the machine.",
      );
      setPostSession((s) => (s ? { ...s, draft: null } : s));
      return;
    }
    // The same answer the composer writes (note-catalog's storedNoteOf), so a
    // draft filed on the way out is the note it would have been.
    // Where the box said it would go: the trainer's pick, else what the words
    // suggested ("Save as Health"), never FORD by suggestion (suggest.ts).
    const suggestion = d?.category ? null : suggestFiling(body, { inSession: true });
    const draftCategory = d?.category ?? (suggestion && suggestion.category !== "ford" ? suggestion.category : null);
    const stored = storedNoteOf(draftCategory, d?.flavour ?? null, d?.bodyParts ?? null);
    await noteOrSay(
      createJournalEntry(
        snap.client.id,
        sessionNoteStudioId(snap.client, contextActiveStudioId || authTrainer?.primaryHomeStudioId),
        { id: user.uid, initials: authTrainer?.initials || "", fullName: authTrainer?.fullName || "" },
        {
          kind: stored.kind,
          category: stored.category,
          bodyParts: stored.bodyParts,
          body: body.slice(0, 5000),
          importance: d?.importance ?? importance,
          machineId: d?.aboutMachine ? d?.machineId ?? null : null,
          focusId: null,
          ...sessionLinkOf(snap.session, studioTodayKey()),
          origin: "in_session",
        },
      ),
      "That note could not be saved — add it from Notes & Profile → Notes.",
    );
    setPostSession((s) => (s ? { ...s, draft: null } : s));
  };
  const dropSessionDraft = () => setPostSession((s) => (s ? { ...s, draft: null } : s));

  /**
   * Files what the Wrap-up holds — the Profile note, and a mid-session draft
   * nobody saved or dropped — WITHOUT leaving (the Atlas answers, Oct 2 2026:
   * every way out files a typed Profile note exactly once). The Wrap-up calls
   * it when it goes by any other way than Back to Hub (the bottom bar, the
   * header, a sign-out) and when the iPad is locked or the page hidden; Back
   * to Hub files through `leavePostSession`, which calls this. The Wrap-up
   * hands each typed note over once; the draft is filed once per session.
   */
  const draftFiledForRef = useRef<string | null>(null);
  const filePostSessionNotes = async (profileNote?: { noteContent: string; importance: JournalImportance; effectiveUntil?: Date | null }) => {
    const snap = postSession;
    // A draft the trainer neither saved nor dropped is filed, unfiled, on the
    // way out. The To-file tray exists for exactly this; losing it does not.
    /* Both writes are ISSUED here, side by side, and never one after the
       other (speed round, Oct 5 2026; R9): each says its own refusal. */
    const filing: Promise<void>[] = [];
    const draftKey = snap?.session.id ?? null;
    if (snap?.draft && hasDraftText(snap.draft) && draftFiledForRef.current !== draftKey) {
      draftFiledForRef.current = draftKey;
      filing.push(fileSessionDraft(snap.draft.body));
    }
    const body = profileNote?.noteContent.trim() ?? "";
    if (snap && body && user?.uid) {
      filing.push(noteOrSay(
        createJournalEntry(
          snap.client.id,
          sessionNoteStudioId(snap.client, contextActiveStudioId || authTrainer?.primaryHomeStudioId),
          { id: user.uid, initials: authTrainer?.initials || "", fullName: authTrainer?.fullName || "" },
          {
            kind: "general",
            category: null,
            body: body.slice(0, 5000),
            importance: profileNote?.importance ?? "standard",
            effectiveUntil:
              profileNote?.importance && profileNote.importance !== "standard" ? (profileNote.effectiveUntil ?? null) : null,
            machineId: null,
            focusId: null,
            ...sessionLinkOf(snap.session, studioTodayKey()),
            origin: "post_session",
          },
        ),
        "Session saved. The profile note could not be saved — add it from Notes & Profile → Notes.",
      ));
    }
    await Promise.all(filing);
  };

  /** Leaving the Wrap-up by Back to Hub files its Profile note, if any, and goes home.
      The writes are issued and the Hub comes at once; their toasts follow
      their answers (R9). Nothing typed is lost: the writes are on the iPad. */
  const leavePostSession = (profileNote?: { noteContent: string; importance: JournalImportance; effectiveUntil?: Date | null }) => {
    void filePostSessionNotes(profileNote);
    setPostSession(null);
    setIsPostSessionMode(false);
    setSelectedClientId(null);
    setView("clients");
  };

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
  /* Online or not, and whether sent sets have reached the database yet: the
     line under the session bar (features/session-record). */
  /* No tick here (R10): the strip under the bar keeps its own clock. */
  const sendState = useSendState({ tick: false });
  const markSent = sendState.sent;

  const pendingLogWritesRef = useRef<
    Map<
      string,
      { payload: Record<string, any>; timer: any; firstQueuedAt: number }
    >
  >(new Map());
  const lastHeartbeatWriteRef = useRef(0);
  /**
   * Every set this iPad has sent. The follow-up seed and a late-refused Start
   * read it: between a flush and the listener's echo a typed set is in
   * neither the queue nor logsRef (the speed round's final review).
   */
  const writtenLogIdsRef = useRef<Set<string>>(new Set());

  const flushLogWrite = React.useCallback((docId: string) => {
    const pending = pendingLogWritesRef.current.get(docId);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    pendingLogWritesRef.current.delete(docId);
    writtenLogIdsRef.current.add(docId);

    setDoc(
      doc(db, "exerciseLogs", docId),
      { ...pending.payload, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch((error) =>
      handleFirestoreError(error, OperationType.WRITE, "exerciseLogs"),
    );
    markSent();
  }, [markSent]);

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
    // Sign-out asks first, while this person is still signed in (session record).
    window.addEventListener(SEND_SETS_NOW_EVENT, flushNow);
    return () => {
      window.removeEventListener("beforeunload", flushNow);
      document.removeEventListener("visibilitychange", flushNow);
      window.removeEventListener(SEND_SETS_NOW_EVENT, flushNow);
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

  // Discard is issued, never waited on (deleteSession), so this is one frame.
  const confirmScrapSession = () => {
    setIsDeletingSession(true);
    try {
      if (currentSession?.id) {
        deleteSession(currentSession.id);
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

  /* What the grid draws: the session recorded here, or, while watching, the
     one another trainer is running (session record, Sep 26 2026). For
     display only: every write below still keys on `currentSession`, which is
     null while watching. The watched session's machines follow its own
     list, which the trainer's iPad rewrites on every add or move. */
  const shownSession = currentSession ?? watchedSession;
  const watchedMachineIds = useMemo(
    () =>
      watchedSession && !currentSession
        ? sessionMachineList(
            watchedSession,
            routines,
            floorMachines.map((m) => m.id).filter((id): id is string => !!id),
          )
        : [],
    [watchedSession, currentSession, routines, floorMachines],
  );
  const shownMachineIds = watchedSession && !currentSession ? watchedMachineIds : activeMachineIds;

  /** Past sessions, oldest → newest: exactly the past sessions the logs listener's window reads (logsPlan). */
  const gridHistory = useMemo(() => {
    const past = new Set(logsPlan.past);
    return toJourneySessions(sessions.filter((s) => !!s.id && past.has(s.id)));
  }, [sessions, logsPlan]);

  const [gridVisible, setGridVisible] = useState(6);
  /* Scrolling back to the oldest day loads more by itself (AJ, Oct 3 2026:
     "when a trainer scrolls to the left and attempts to load more it will
     trigger the load, give the MSF buffer and then load more"). The
     sessions are already in hand, so the pause is only long enough to see
     the mark and know more came in. */
  const [gridLoadingOlder, setGridLoadingOlder] = useState(false);
  const loadOlderGrid = React.useCallback(() => {
    if (gridLoadingOlder) return;
    setGridLoadingOlder(true);
    window.setTimeout(() => {
      setGridVisible((v) => v + 5);
      setGridLoadingOlder(false);
    }, 650);
  }, [gridLoadingOlder]);
  const gridVisibleHistory = useMemo(
    () => gridHistory.slice(Math.max(0, gridHistory.length - gridVisible)),
    [gridHistory, gridVisible],
  );

  /* The PAST sets alone, the same array while only today's change (R10;
     features/journey-grid/stable-history.ts): a keystroke in today's column
     no longer rebuilds every row of the grid, nor does the listener's echo
     of a save. Today's values are read apart, in gridLiveValues. */
  const shownSessionId = shownSession?.id ?? null;
  const historyLogsRef = useRef<ExerciseLog[] | null>(null);
  const historyLogs = useMemo(() => {
    const next = (Object.values(logs) as ExerciseLog[]).filter(
      (l) => !shownSessionId || l.sessionId !== shownSessionId,
    );
    const kept = stableHistory(historyLogsRef.current, next);
    historyLogsRef.current = kept;
    return kept;
  }, [logs, shownSessionId]);

  /* THE SETTINGS BUTTON'S COUNT (the open session round, Oct 9 2026; AJ's
     "2a"): how many of each machine's dials the card would open empty on,
     over the card's own dial list (equipment/adapters.ts `fieldsForMachine`,
     the shared catalog read: no new listener), and whether anything is
     saved. "Nothing saved" (Set up) is said only off the SERVER's answer:
     an empty answer from the iPad's cache may be a cold cache, and a first
     set-up saved off it would write the client's other dials over when it
     syncs (the review, Oct 9 2026). Something saved is said off either.
     An open session with no client yet offers no Set up at all: its
     settings would go to the ghost record nobody reads (finding 4) until
     they are held on the session (3a). */
  const { byId: dialCatalogById } = useMachineCatalog();
  const studioDialStandards = activeStudio?.machineSettings;
  const noClientYet = !!currentSession?.isUnassigned && !clientId;
  const setupById = useMemo(() => {
    const out: Record<string, { notSet?: number; firstSetup?: boolean }> = {};
    if (noClientYet) return out;
    for (const m of floorMachines) {
      if (!m.id) continue;
      const saved = clientMachineSettings[m.id]?.settings ?? {};
      const fields = fieldsForMachine(m, dialCatalogById, studioDialStandards);
      const first = isFirstSetup(saved);
      const known = settingsServerRead || (settingsRead && !first);
      out[m.id] = { notSet: notSetCount(fields, saved), ...(known ? { firstSetup: first } : {}) };
    }
    return out;
  }, [floorMachines, dialCatalogById, studioDialStandards, clientMachineSettings, settingsRead, settingsServerRead, noClientYet]);
  /* The card's Set up, from the Now Bar and the phone's card: none while
     an open session has no client (above). Stable either way (the bar is
     memo). */
  const onSetUpDoor = noClientYet ? undefined : onSetUpMachine;

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
    const starred = new Set(
      ordered.filter((m) => isBig5Machine(m.name)).map((m) => m.id!),
    );
    const orderIndex = new Map<string, number>(
      gridHistory.map((s, i) => [s.id, i] as const),
    );
    // Which notes are open is a studio-day question (client-notes/threads.ts).
    const noteDay = studioTodayKey();
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
        // One list (Oct 2 2026): her journal's notes on the machine plus the
        // old list's (features/equipment/machine-notes.ts).
        const noteInput = {
          machineId: machine.id!,
          machineName: machine.name,
          legacy: setting?.machineNotes,
          journal: machineJournal,
        };
        // Where today's weight came from, when a trainer set it at the last
        // Wrap-up and no session has logged the machine since (next-weight).
        const nextMark = setting?.nextWeight;
        const weightSource = isNextWeightLive(
          nextMark,
          selectedClient?.currentMachineMetrics?.[machine.id!]?.lastSessionId,
          setting?.currentWeight,
        )
          ? (nextWeightSourceLine(nextMark) ?? undefined)
          : undefined;
        return {
          ...row,
          weightSource,
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
            // The Now Bar's settings button: "Set up · 2 not set" (Oct 9 2026).
            dialsNotSet: setupById[machine.id!]?.notSet,
            firstSetup: setupById[machine.id!]?.firstSetup,
            // The mark beside the name: the loudest open note, in the one
            // note key (machine menu, Oct 2026).
            alert: machineNoteLoudness({ ...noteInput, today: noteDay }) ?? undefined,
            // Each thread once, as the card counts them (machine-notes.ts).
            noteCount: machineNoteCount(noteInput),
            sides: isSidesMachine(machine),
            // Out of service on the roster: said on the floor, with no + (Oct 9 2026).
            outOfService: studioFloorById[row.machine.id]?.rosterStatus === "maintenance" || undefined,
          },
        };
      },
    );
  }, [
    floorMachines,
    historyLogs,
    clientMachineSettings,
    studioFloorById,
    gridHistory,
    selectedClient?.currentMachineMetrics,
    machineJournal,
    setupById,
  ]);

  const gridSections = useMemo<GridSection[]>(() => {
    const byId = new Map(gridRows.map((r) => [r.machine.id, r] as const));
    const routineRows = shownMachineIds
      .map((id) => byId.get(id))
      .filter(Boolean) as typeof gridRows;
    const inRoutine = new Set(shownMachineIds);
    const others = gridRows.filter((r) => !inRoutine.has(r.machine.id));
    /* The FileMaker floor (Oct 9 2026) has no routine to name: today's
       machines are "Today", numbered in the order they were added, over the
       rest of the floor in its walking order; no label over nothing yet. */
    return [
      // No label row while only the routine is listed: the grid's corner
      // says "Routine" (session top, option 1, Oct 3 2026).
      {
        id: "routine",
        label: floorView ? "Today" : "Today's routine",
        rows: routineRows,
        numbered: true,
        bare: !showAllMachines || (floorView && routineRows.length === 0),
      },
      {
        id: "others",
        label: floorView ? "Rest of the floor" : "Not in today's routine",
        idleNote: floorView ? "not added today" : undefined,
        rows: others,
        collapsed: !showAllMachines,
        onToggle: () => setShowAllMachines(!showAllMachines),
        inactive: true,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setShowAllMachines is keyed on showAllSessionId
  }, [gridRows, shownMachineIds, showAllMachines, floorView, showAllSessionId]);

  const toNum = (v: unknown): number | null => {
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };

  /** Today's values, read straight out of the local `logs` map. */
  const gridLiveValues = useMemo(() => {
    const out: Record<string, LiveSet> = {};
    const sid = shownSession?.id;
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
          bloodFlow: L?.bloodFlow ?? R?.bloodFlow ?? null,
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
          bloodFlow: log.bloodFlow ?? null,
          skipReason: log.skipReason ?? null,
        };
      }
    }
    return out;
  }, [logs, gridRows, shownSession?.id]);

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
    const raw = shownSession?.startTime ?? (shownSession as any)?.clientStartTime;
    if (!raw) return null;
    const d = typeof raw?.toDate === "function" ? raw.toDate() : new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }, [shownSession]);

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
        // Blood flow rides on a practice set; any other outcome clears it.
        bloodFlow: patch.outcome === "practice" && patch.bloodFlow === true ? true : null,
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
    /* A tap that finishes something (a quality, practice or skip, the unit,
       the stopwatch) is sent now, not after the typing wait. */
    if (sendsAtOnce(patch)) flushAllLogWrites();
  };

  const sessionBarNumber = sessionNumberTag(
    currentSession?.sessionNumber || sessions.length,
    canQuoteNumber,
  );

  /* The live column, memoised with steady callbacks (R10): it used to be a
     new object on every render, which redrew every row of the grid. The
     callbacks call the newest handler through a ref, so they never go stale. */
  /** The last + (or the phone floor's Add): a second tap landing on the row that slid under it is let go. */
  const lastAddRef = useRef<LastAdd | null>(null);
  const gridLiveHandlers = useRef<{
    change: (machineId: string, patch: Partial<LiveSet>) => void;
    onAddMachine: (id: string) => void;
  } | null>(null);
  gridLiveHandlers.current = {
    change: handleGridLiveChange,
    /* Into the session's own list, through the reorder sheet's recorder: the session document, never the routine. */
    onAddMachine: (id: string) => {
      const now = Date.now();
      if (isBounceAdd(lastAddRef.current, id, now)) return; // the same tap twice (add-bounce.ts)
      lastAddRef.current = { id, at: now };
      flushAllLogWrites();
      if (!activeMachineIds.includes(id)) applySessionMachineIds([...activeMachineIds, id]);
      /* The machine in hand in the same tap, as the plan's Add makes it,
         at the end of today's numbered group, in the order done
         (FileMaker's circle; the open session round, Oct 9 2026: "you have
         every machine on the screen and you just fill in the ones you
         did"). It used to take a second tap on its Today cell. What was
         waiting on the last machine is sent first, as Next sends it. */
      setFocusMachineOverride(id);
    },
  };
  const onGridLiveChange = React.useCallback(
    (machineId: string, patch: Partial<LiveSet>) => gridLiveHandlers.current?.change(machineId, patch),
    [],
  );
  const onGridAddMachine = React.useCallback((id: string) => gridLiveHandlers.current?.onAddMachine(id), []);
  /* Moving to another machine sends whatever is still waiting on this one. */
  const onGridFocusMachine = React.useCallback(
    (id: string) => {
      flushAllLogWrites();
      setFocusMachineOverride(id);
    },
    [flushAllLogWrites],
  );
  const liveSessionId = currentSession?.id ?? null;
  const liveSessionNumber = currentSession?.sessionNumber || sessions.length;
  const liveDate = currentSession?.date || null;
  const liveInitials = (currentSession?.trainerInitials || authTrainer?.initials || "").toUpperCase();
  const gridLiveSession = useMemo(
    () =>
      liveSessionId
        ? {
            id: liveSessionId,
            sessionNumber: liveSessionNumber,
            date: toIsoDate(liveDate || studioTodayKey()),
            trainerInitials: liveInitials,
          }
        : null,
    [liveSessionId, liveSessionNumber, liveDate, liveInitials],
  );
  const gridLive = useMemo<LiveColumn | undefined>(() => gridLiveSession
    ? {
        session: gridLiveSession,
        routineMachineIds: activeMachineIds,
        values: gridLiveValues,
        onChange: onGridLiveChange,
        /* Straight in. The "+" only appears on a machine that is not in
           today's routine, so the tap is already unambiguous — and a trainer
           who has spare time and wants a bicep curl should not have to
           confirm that they meant it. Removing it is the reverse of a
           decision made when this was built ("prompts before adding it,
           rather than toggling it in silently"); silence is the point. */
        onAddMachine: onGridAddMachine,
        focusMachineId: gridFocusMachineId,
        onFocusMachine: onGridFocusMachine,
        weightStep: 2,
      }
    : undefined,
  [gridLiveSession, activeMachineIds, gridLiveValues, onGridLiveChange, onGridAddMachine, gridFocusMachineId, onGridFocusMachine]);

  /*
   * THE MACHINE MENU'S DOOR IN A SESSION (features/machine-menu). What the
   * card is handed: the client's sessions and the window of sets the logs
   * listener read (`logsWindow` says which), the one journal listener above,
   * the session's one note draft and its link, and the session's studio for
   * a note about the machine itself. Load older reads the next sessions'
   * sets itself, only on a tap. Watching another trainer's session, the
   * card reads only.
   */
  const menuSession = currentSession ?? watchedSession;
  const menuReadIds = useMemo(() => (logsWindow ? new Set(logsWindow.ids) : new Set<string>()), [logsWindow]);
  /* Every one of the client's sessions has had its sets read by the window
     (no older session unread, the read not failed): only then may the Now
     Bar's start fall back to the first counted set, and the phone's strip
     say what nothing on record means (machine-menu/progress-figure.ts). */
  /* Only a window the server answered counts: a cache-only one may be
     partial (offline, or the cache's first answer), so the Now Bar and the
     phone stay cautious with it, as the card does (useMachineMenuData). */
  const sessionsAllRead = logsWindow?.state === "ready" && !hasOlderToRead(sessions, menuReadIds);
  const menuLogs = useMemo(() => Object.values(logs) as ExerciseLog[], [logs]);
  const menuFloorStudioId = currentSession?.hostedAtStudioId || contextActiveStudioId || null;
  const menuWatching =
    watchedSession && !currentSession
      ? (trainers.find((t) => t.id === watchedSession.trainerId)?.fullName || watchedSession.trainerInitials || "").trim() || "another trainer"
      : null;
  const menuLink = useMemo(() => sessionLinkOf(menuSession, studioTodayKey()), [menuSession]);
  const machineMenuHost = useMemo<MachineMenuHost>(
    () => ({
      door: "session",
      clientId: clientId || "",
      client: selectedClient,
      machines: floorMachines,
      clientSettings: clientMachineSettings,
      author: authTrainer
        ? { id: user.uid, fullName: authTrainer.fullName || authTrainer.initials || "Unknown", initials: authTrainer.initials }
        : null,
      activeStudioId: contextActiveStudioId ?? null,
      floorStudio: {
        id: menuFloorStudioId,
        name: studios?.find((st) => st.id === menuFloorStudioId)?.name ?? (menuFloorStudioId === activeStudio?.id ? (activeStudio?.name ?? null) : null),
      },
      roster: clients,
      coverage: clientCoverage,
      window: ownedWindow({ coverage: clientCoverage, prior: priorHistoryOf(selectedClient), cutover: homeCutover }),
      sessions,
      logs: menuLogs,
      readIds: menuReadIds,
      historyState: logsWindow?.state ?? "loading",
      journal: machineJournalRead.entries,
      journalState: machineJournalRead.state,
      session: { id: menuLink.sessionId, number: menuLink.sessionNumber, day: menuLink.sessionDay },
      noteDraft,
      onNoteDraftChange: handleDraftChange,
      watching: menuWatching,
    }),
    [
      clientId,
      selectedClient,
      floorMachines,
      clientMachineSettings,
      authTrainer,
      user?.uid,
      contextActiveStudioId,
      menuFloorStudioId,
      studios,
      activeStudio,
      clients,
      clientCoverage,
      homeCutover,
      sessions,
      menuLogs,
      menuReadIds,
      logsWindow,
      machineJournalRead.entries,
      machineJournalRead.state,
      menuLink,
      noteDraft,
      handleDraftChange,
      menuWatching,
    ],
  );
  const closeMachineMenu = React.useCallback(() => {
    setMenuMachineId(null);
    setMenuQuickFor(null);
  }, []);

  /*
   * ROUTINE A'S PLAN ON THE FLOOR (the first-session design round, Oct 8
   * 2026, §4.6; features/routine-plan/session-plan.ts). The plan's next
   * machine on the last machine and on an empty Now Bar, the Academy's
   * starting range on a first time on a machine, "The plan · 3 of 6" in the
   * grid's corner, and one calm order-effect line under the grid.
   *
   * AJ, Oct 7 2026 (Q6): "Any trainer who trains the client can definitely
   * change the plan ... You should be able to change that and make the call
   * as a trainer because you're training them that day." So the session may
   * change Routine A's PLAN, through routine-plan/store.ts alone
   * (`useSessionPlan`, never awaited); adding a machine is TODAY only
   * (`applySessionMachineIds`), and the Wrap-up decides what the routine
   * keeps.
   */
  const planTodayYmd = studioTodayKey();
  const planWho = useMemo(
    () => (user?.uid ? { uid: user.uid, ...(authTrainer?.fullName ? { name: authTrainer.fullName } : null) } : null),
    [user?.uid, authTrainer?.fullName],
  );
  const planNote = useMemo(
    () =>
      clientId && user?.uid && authTrainer
        ? {
            clientId,
            studioId: sessionNoteStudioId(selectedClient, contextActiveStudioId || authTrainer.primaryHomeStudioId),
            author: { id: user.uid, initials: authTrainer.initials || "", fullName: authTrainer.fullName || "" },
            link: sessionLinkOf(currentSession, planTodayYmd),
          }
        : null,
    [clientId, user?.uid, authTrainer, selectedClient, contextActiveStudioId, currentSession, planTodayYmd],
  );
  const sessionPlan = useSessionPlan({
    routines,
    sessionId: currentSession?.id ?? null,
    sessionRoutineId: currentSession?.routineId ?? null,
    today: activeMachineIds,
    floor: floorMachines,
    todayYmd: planTodayYmd,
    who: planWho,
    onError: toastError,
    note: planNote,
  });
  const planNameOf = useMemo(() => machineNamer(floorMachines, machines), [floorMachines, machines]);
  /* Today's list is on screen: before it is seeded, the plan's "next" would
     be its first machine, and an add would be recorded as the whole list. */
  const todaySeeded = !!currentSession?.id && seededSessionId === currentSession.id;
  const planNextId = currentSession && todaySeeded ? sessionPlan.next : null;
  const planNextName = planNextId
    ? (gridRows.find((r) => r.machine.id === planNextId)?.machine.name ?? planNameOf(planNextId))
    : null;
  /* Stable for the memo'd Now Bar: a new object only when the machine changes. */
  const planNext = useMemo(
    () => (planNextId && planNextName ? { id: planNextId, name: planNextName } : null),
    [planNextId, planNextName],
  );
  /* "Next in the plan · Add": today's order only, through the one recorder,
     and the machine becomes the one in hand. */
  const planAddRef = useRef<(id: string) => void>(() => {});
  planAddRef.current = (id: string) => {
    flushAllLogWrites();
    if (!activeMachineIds.includes(id)) applySessionMachineIds([...activeMachineIds, id]);
    setFocusMachineOverride(id);
  };
  const onAddPlanned = React.useCallback((id: string) => planAddRef.current(id), []);

  /* The Academy's starting range (AJ's "3a"), for the machine in hand: only
     on a first time here (no weight on file, no set on record, no running
     total that knows it, and the totals, the settings and the routines all
     read: a read not answered, or failed, is unknown, never "no weight"),
     only for a client Journey can call new to it (the whole story is
     Journey's, or Routine A's plan started here or has a column picked; a
     column can be picked on the plan's sheet from the corner too), and only
     in the column the trainer picked; never a number in the weight. */
  const [rangeSheet, setRangeSheet] = useState<"pick" | "about" | null>(null);
  const onStartingRange = React.useCallback((mode: "pick" | "about") => setRangeSheet(mode), []);
  const rangePlan = sessionPlan.plan;
  /* Journey holds this client's whole story: coverage "complete", or Add
     Client's walk-in ("New client, not in Mindbody yet": AJ's door two, "a
     client walked in ... run a session right then and there on a consult")
     with no Journey session yet, which has no Mindbody count to make its
     coverage complete (the whole-branch review, Oct 9 2026: such a client
     never saw "First time on this machine" or the Academy's range). */
  const wholeStoryHere =
    clientCoverage === "complete" ||
    (isProvisionalNewClient(selectedClient) && !(selectedClient?.sessionCount ?? 0));
  const rangeFirstTimeKnown =
    wholeStoryHere ||
    !!rangePlan?.dayOne?.length ||
    !!rangePlan?.templateId ||
    // A column a trainer picked for this client (on the plan, or in this
    // session from the plan's sheet before its echo arrives).
    (isStartingColumnChoice(sessionPlan.column) && sessionPlan.column !== "none");
  const focusRange = useMemo<StartingRangeSlot>(() => {
    if (!currentSession || !gridFocusRow || !rangeFirstTimeKnown || !settingsRead || !routinesKnown) return null;
    const id = gridFocusRow.machine.id;
    return startingRangeSlot({
      canonicalMachineId: floorCanonical(sessionPlan.floorList)(id),
      column: sessionPlan.column,
      forToday: sessionPlan.columnForToday,
      hasWeight: hasWeightOnFile({
        prescribedWeight: gridFocusRow.prescribedWeight,
        setsOnRecord: Object.keys(gridFocusRow.sets).length,
        knownElsewhere: knownElsewhere(
          {
            metric: selectedClient?.currentMachineMetrics?.[id] ?? null,
            stat: selectedClient?.machineStats?.[id] ?? null,
          },
          planTodayYmd,
        ),
        totalsKnown,
      }),
    });
  }, [
    currentSession,
    gridFocusRow,
    rangeFirstTimeKnown,
    settingsRead,
    routinesKnown,
    sessionPlan.floorList,
    sessionPlan.column,
    sessionPlan.columnForToday,
    selectedClient?.currentMachineMetrics,
    selectedClient?.machineStats,
    planTodayYmd,
    totalsKnown,
  ]);

  /* "First time on this machine" in the Now Bar's readout (§4.6), the
     history-claims words, on the machine menu's gate: every session's sets
     read, the totals read, nothing on record here and no running total that
     knows the machine. Only the confident sentence, for a client whose whole
     story is Journey's; for anyone else the bar stays quiet (the Oct 3
     round: "the text feels like clutter"), and the machine menu says
     "Nothing recorded on this machine". */
  const focusNoHistory = useMemo(() => {
    if (!currentSession || !gridFocusRow || !totalsKnown || !sessionsAllRead || !wholeStoryHere) return null;
    if (Object.keys(gridFocusRow.sets).length > 0) return null;
    const id = gridFocusRow.machine.id;
    const elsewhere = knownElsewhere(
      { metric: selectedClient?.currentMachineMetrics?.[id] ?? null, stat: selectedClient?.machineStats?.[id] ?? null },
      planTodayYmd,
    );
    // The walk-in is a whole story too: said as one ("complete").
    return elsewhere ? null : noMachineHistoryLine("complete");
  }, [
    currentSession,
    gridFocusRow,
    totalsKnown,
    sessionsAllRead,
    wholeStoryHere,
    selectedClient?.currentMachineMetrics,
    selectedClient?.machineStats,
    planTodayYmd,
  ]);

  /* The plan's sheet, from the grid's corner: a change there is the plan's
     (issued, never awaited), and it reaches TODAY's order only for a
     machine with no set logged today. */
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const onOpenPlan = React.useCallback(() => setPlanSheetOpen(true), []);
  const onPlanWrite = (write: PlanWrite, today: TodayChange | null) => {
    sessionPlan.write(write);
    if (!today) return;
    applySessionMachineIds(today.next);
    const moved = today.moved.find((m) => m.from === gridFocusMachineId);
    if (moved?.to) setFocusMachineOverride(moved.to);
  };
  const planLoggedToday = (id: string) => setLoggedToday(gridLiveValues[id]);

  /* START FROM A ROUTINE… (the open session round, Oct 9 2026; AJ's "1b":
     "i want to be able to take advantage of our routine builder so we can
     use it if we wanted too"). The corner's sheet (the phone's foot too)
     hands up a routine's machines on this floor; they go on today's list
     through the one recorder, what is already done today kept first, in
     the order done (routine-plan/start-from.ts, `laidToday`), and the first
     machine still to do is the one in hand. Today's list only: no routine
     is written, and Routine A still comes only through the Wrap-up's Next
     time. Offered once today's list is on screen (an add before it would be
     recorded as the session's whole list) and a Start that couldn't decide
     its routine has (`startDeciding`): until then the client's routine may
     still come and be laid ahead of it, and fold the floor (the review,
     Oct 9 2026). */
  const startFromOffered = !!currentSession && todaySeeded && !startDeciding;
  const [startFromOpen, setStartFromOpen] = useState(false);
  const onOpenStartFrom = React.useCallback(() => setStartFromOpen(true), []);
  const startFromLayRef = useRef<(ids: string[]) => void>(() => {});
  startFromLayRef.current = (laid: string[]) => {
    flushAllLogWrites();
    const done = (id: string) => setLoggedToday(gridLiveValues[id]);
    const next = laidToday({ today: activeMachineIds, laid, done });
    applySessionMachineIds(next);
    const hand = inHandAfterLay({ next, inHand: gridFocusMachineId, done });
    if (hand) setFocusMachineOverride(hand);
  };
  const onLayRoutine = React.useCallback((ids: string[]) => startFromLayRef.current(ids), []);
  /* Out of service on the roster: left out of a routine laid, and said. */
  const startFromOut = useMemo(() => gridRows.filter((r) => r.machine.outOfService).map((r) => r.machine.id), [gridRows]);
  /* Nothing is offered, or said missing, off a floor not read yet or whose read failed. */
  const startFromFloorState: "known" | "reading" | "failed" = studioFloorLoading ? "reading" : studioFloorFailed ? "failed" : "known";

  /* One calm line when today's order trips one of the Academy's sequencing
     rules: a sentence, never a block (routine-plan/order-effects.ts). */
  const hasLiveSession = !!currentSession;
  /* An old Free session, or an open session from before Oct 9 2026 (no
     routine, no list of its own), runs the whole floor in its walking
     order, which nobody chose: it says nothing about order. A session that
     records its own list chose it, the FileMaker floor's included (what was
     added, in the order done; `ranWholeFloorUnchosen`), even when every
     machine on the floor was added. One machine is never an order: the
     Academy's rules are about two (`findViolations` reads pairs), so the
     first + on the floor says nothing (the open session round, Oct 9 2026). */
  const runsWholeFloor = ranWholeFloorUnchosen({
    routineId: currentSession?.routineId,
    recorded: currentSession?.sessionMachineIds,
    floor: floorMachines.map((m) => m.id),
    today: activeMachineIds,
  });
  const todayEffects = useMemo(
    () => (hasLiveSession && !runsWholeFloor ? orderEffects(activeMachineIds, planNameOf, sessionPlan.floorList) : []),
    [hasLiveSession, runsWholeFloor, activeMachineIds, planNameOf, sessionPlan.floorList],
  );

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
    hasWatchedSession: !!watchedSession,
  });

  /* The machine menu lives only on the tracker and the watching screen. A
     session finished or discarded on another iPad moves the screen without a
     Close; without this the card would open by itself at the next Start. A
     draft on the card goes with the session it was on, as the old sheet's
     did: the change comes from the sessions listener, so there is no moment
     to ask. */
  useEffect(() => {
    if (screen !== "tracker" && screen !== "watch") setMenuMachineId(null);
    // And it opens as an ordinary card next time, never as Set up's.
    if (screen !== "tracker" && screen !== "watch") setMenuQuickFor(null);
  }, [screen]);

  if (screen === "post-session" && postSession) {
    return (
      <WrapUpScreen
        studioName={activeStudio?.name}
        // Times with room (Openings round): the studio the iPad is in, every
        // studio (to name a booking elsewhere), and who works here.
        studio={activeStudio}
        studios={studios}
        trainers={trainers}
        client={postSession.client}
        coverage={clientCoverage}
        session={postSession.session}
        logs={postSession.logs}
        allLogs={Object.values(logs).filter((l: any) => l.clientId === postSession.client.id) as any}
        lines={postSession.lines}
        journey={postSession.journey}
        schedules={schedules}
        authTrainer={authTrainer}
        onEffort={savePostSessionEffort}
        onNextWeight={savePostSessionNextWeight}
        nextTime={postSession.nextTime}
        onNextTime={savePostSessionNextTime}
        onLeave={leavePostSession}
        onFile={filePostSessionNotes}
        unsavedDraft={postSession.draft}
        onSaveDraft={fileSessionDraft}
        onDropDraft={dropSessionDraft}
        nextTrainerNote={postSession.nextTrainerNote}
        /* The tray's notes from the one journal listener (R11), only while
           it is this client's: otherwise the Wrap-up reads them itself. */
        journalStream={selectedClient?.id === postSession.client.id ? flagJournalStream : undefined}
        savedOnThisIpad={!!postSession.queued}
        machines={floorMachines}
        rightControls={rightControls}
        trainerDropdown={trainerDropdown}
        onStudioClick={onStudioClick}
      />
    );
  }

  if (screen === "watch" && watchedSession?.id) {
    /* Another trainer's session, read-only and live (session record, Sep 26
       2026). The same grid as the trainer's own screen, with a Today column
       that only reads: no change handler that writes, no add, no reorder,
       and a cell with nothing to do on a tap is not a button. */
    const runner = (watchedSession.trainerInitials || "").trim();
    const watchLive: LiveColumn = {
      session: {
        id: watchedSession.id,
        sessionNumber: watchedSession.sessionNumber || sessions.length,
        date: toIsoDate(watchedSession.date || studioTodayKey()),
        trainerInitials: runner.toUpperCase(),
      },
      routineMachineIds: watchedMachineIds,
      values: gridLiveValues,
      onChange: () => {},
      focusMachineId: firstOpenMachine(watchedMachineIds, gridLiveValues),
      weightStep: 2,
    };
    return (
      <>
      <WatchingSession
        clientName={
          selectedClient
            ? clientDisplayName(selectedClient)
            : watchedSession.isUnassigned
              ? "Open session"
              : (watchedSession.clientName || "").trim() || "This session"
        }
        sessionTag={sessionNumberTag(watchedSession.sessionNumber || sessions.length, canQuoteNumber)}
        runnerInitials={runner || "—"}
        startedLabel={sessionStartedLabel}
        timer={{
          startTime: watchedSession.startTime,
          fallbackStartTime: (watchedSession as any).clientStartTime,
          pausedAt: (watchedSession as any).pausedAt,
          totalPausedMs: (watchedSession as any).totalPausedMs,
        }}
        done={machinesDone(watchedMachineIds, gridLiveValues)}
        total={watchedMachineIds.length}
        words={watchWords({ runner, takenFromHere, online: sendState.online })}
        takeOver={
          authTrainer?.id
            ? takeOverWords({ runner, clientFirstName: selectedClient ? clientFirstName(selectedClient) : null })
            : null
        }
        onTakeOver={takeOverWatchedSession}
      >
        <JourneyGrid
          sessions={gridVisibleHistory}
          historySessions={gridHistory}
          sections={gridSections}
          live={watchLive}
          sessionNumbers={canQuoteNumber}
          coverage={clientCoverage}
          showStats={false}
          onLoadOlder={() => setGridVisible((v) => v + 5)}
          canLoadOlder={gridVisible < gridHistory.length}
          layout="fill"
          fit="auto"
          targetColumns={10}
          title="Machine"
          /* The machine menu, read only: its settings, notes and chart,
             with no box, no buttons and no saves (machine menu design §F). */
          onOpenMachine={openMachineMenu}
        />
      </WatchingSession>
      <MachineMenu open={!!menuMachineId} machineId={menuMachineId} onClose={closeMachineMenu} host={machineMenuHost} />
      </>
    );
  }

  if (screen === "none") {
    /* Never a blank page (session record, Sep 26 2026). This used to return
       null, trusting the routing never to arrive here; it did arrive, when a
       client's record couldn't be read and when a session left the screen,
       and the trainer saw nothing but the bottom bar. */
    return (
      <NothingOnScreen
        kind={nothingKind(
          clientId,
          clientLookup,
          !user || openSessionsAnsweredFor === (contextActiveStudioId ?? "__none__"),
        )}
        studioName={activeStudio?.name}
        trainerInitials={authTrainer?.initials}
        onRetry={onRetryClient}
        onFindClient={() => setView("client-directory")}
        onHub={() => setView("clients")}
        rightControls={rightControls}
        trainerDropdown={trainerDropdown}
        onStudioClick={onStudioClick}
      />
    );
  }

  if (screen === "briefing" && selectedClient) {
    /* The question about a stale session sits over whichever briefing is
       drawn (features/tracker/StaleSessionDialog.tsx). */
    const staleAsk = staleSession ? (
      <StaleSessionDialog
        open={staleSession.id !== declinedStaleId}
        clientFirstName={clientFirstName(selectedClient)}
        session={staleSession}
        begunMachines={staleBegunMachines}
        todayKey={studioTodayKey()}
        takesOver={isAnotherTrainersSession(staleSession, myIds)}
        onResume={resumeStaleSession}
        onStartNew={leaveStaleSession}
        onFinishAsItWas={finishStaleSessionAsItWas}
        finishAsItWasReady={totalsKnown}
      />
    ) : null;

    /* Every client goes to the briefing, one flagged for a consultation
       included: a client starting out at the studio gets the plan card
       there (routine-plan/client-kind.ts), and Finish marks the
       consultation done. The First-time setup that stood here
       (ConsultationSetupWizard: a fixed trio, a gender asked for, an
       estimated starting weight) is retired (the first-session design
       round, Oct 8 2026, §4.8). */
    return (
      <>
        <BriefingScreen
          studioName={activeStudio?.name}
          studioId={contextActiveStudioId ?? null}
          authTrainer={authTrainer}
          client={selectedClient}
          coverage={clientCoverage}
          studios={studios ?? null}
          targetRoutine={targetRoutine}
          lastSession={
            sessions.filter((s) => s.status === "Completed")[0] || null
          }
          sessions={sessions.filter((s) => s.status === "Completed")}
          /* The client's sessions stream has no limit: every one she has
             in Journey, so the InBody count is exact (features/inbody/due.ts). */
          sessionsAreAll
          /* Whether the routines' answer can be trusted (a failed or empty
             cache answer is not "no routine"): the briefing claims nothing
             about a client starting out until it is. */
          routinesKnown={routinesKnown}
          onStart={(routineType, customMachines, note, checkIn, noteCategory, startPlan) =>
            startNewSession(
              routineType,
              undefined,
              customMachines,
              note,
              checkIn,
              noteCategory,
              startPlan,
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
          rightControls={rightControls}
          trainerDropdown={trainerDropdown}
          onStudioClick={onStudioClick}
        />
        {staleAsk}
      </>
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
                  ? "Open session"
                  : (currentSession?.clientName || "").trim() || "Initializing..."}
            </h3>
            <div className="jg-sbar__meta">
              {/* No number for a client whose total nobody has recorded:
                  Journey's own count would call a twelve-year client "#3". */}
              {/* "Session #61 · started 1:19 AM" (AJ, Oct 3 2026: "i like the
                  started time but we can remove the trainer initials"). */}
              {sessionBarNumber && (
                <span>
                  Session <b>{sessionBarNumber}</b>
                </span>
              )}
              {sessionBarNumber && sessionStartedLabel && <span aria-hidden>·</span>}
              {sessionStartedLabel && <span>started {sessionStartedLabel}</span>}
            </div>
          </div>
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

          {/* The marker: small, red when something is critical, one tap for
              the whole of it, never a dialog that has to be dismissed. */}
          {flags.count > 0 && (
            <button
              type="button"
              className={cn(
                "jg-sbar__flag",
                flags.severe && "jg-sbar__flag--severe",
                flags.caution && "jg-sbar__flag--caution",
              )}
              onClick={() => setIsShowingFlags(true)}
              aria-label={`${flags.count} ${flags.count === 1 ? "thing" : "things"} to know about ${clientFirstName(selectedClient)}. Open.`}
              title="What to know before you touch the machine"
            >
              <ShieldAlert size={14} strokeWidth={2.75} aria-hidden="true" />
              <span>{flags.count}</span>
            </button>
          )}
          <span className="jg-sbar__sp" />

          {/* Who's this? (the open session round, Oct 9 2026): an open
              session is given its client at any time, and carries on as
              theirs. Blue and quiet: a choice, never the loud action. */}
          {currentSession?.isUnassigned && !clientId && (
            <button
              type="button"
              className="jg-sbar__btn jg-sbar__btn--who"
              onClick={() => {
                setAssignFrom("bar");
                setShowAssignDialog(true);
              }}
              aria-label="Who's this? Choose the client for this session"
            >
              <Users size={15} strokeWidth={2.5} aria-hidden />
              <span>Who's this?</span>
            </button>
          )}

          {/* Notes and Pulse are about a client, so an open session, which
              has none yet, does not draw them: they were two buttons that
              opened nothing (the open session round, Oct 9 2026). They come
              with the client. */}
          {clientId && (
            <button
              type="button"
              className="jg-sbar__btn"
              onClick={() => setIsShowingSessionNotes(true)}
              aria-label="Session notes"
            >
              <MessageSquare size={15} strokeWidth={2.5} className="fill-current" />
              <span>Notes</span>
            </button>
          )}
          {/* The assessment (one name for it, everywhere), reachable without
              ending the session. A trainer has about ninety seconds while a
              client works the lumbar machine, and what they want to do with
              it is record the one thing the client just said. */}
          {clientId && (
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
          )}
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
      {/* Zone 1b — where the sets are, only when there is something to say:
          offline, or saves waiting on a poor connection (session record). */}
      {currentSession && (
        <SendStatusStrip online={sendState.online} unsentSince={sendState.unsentSince} />
      )}

      {/* THE MACHINE MENU. One target, one card (features/machine-menu).

          Tapping a machine's name on the grid, its card on a phone, or the
          Now Bar's flag opens the same card the client profile opens:
          safety first, then the settings, the note box right under them
          (the session's one note draft), then how the client has done on
          this machine. Every write goes through
          features/equipment/mutations.ts and never waits on the database.
          It replaces the machine sheet, which replaced two modals that used
          to sit here (settings, and notes behind a separate small icon).
          The Now Bar's Set up (and the phone card's) opens it on the first
          empty dial, and its Save closes it with Undo in the toast (the
          open session round, Oct 9 2026; AJ's "2a"). */}
      <MachineMenu
        open={!!menuMachineId}
        machineId={menuMachineId}
        onClose={closeMachineMenu}
        host={machineMenuHost}
        focusDial={!!menuMachineId && menuQuickFor === menuMachineId}
        closeOnSave={!!menuMachineId && menuQuickFor === menuMachineId}
      />

      {/* Who's this? The client picker for an open session, from the
          session bar or from Finish (the open session round, Oct 9 2026). */}
      <ClientSelectionDialog
        open={showAssignDialog}
        clients={clients}
        onSelect={(id) => assignSessionToClient(id)}
        onCreateNew={() => {
          setShowAssignDialog(false);
          setCreatingClient(true);
        }}
        /* Closing without choosing goes back to the open session, like Keep
           Training. It used to drop the session from the screen, which then
           had nothing to draw (session record, Sep 26 2026). */
        onClose={() => setShowAssignDialog(false)}
        description={
          assignFrom === "finish"
            ? "Choose the client, then finish their session."
            : "Choose the client. The session carries on as theirs."
        }
      />
      {/* New client, over the session: the session stays where it is and is
          given to the new client (it used to replace the whole screen, and
          the open session was lost). Portalled to the page, so no box of the
          session's clips it or sits above it. */}
      {creatingClient &&
        currentSession?.isUnassigned &&
        createPortal(
          <CreateClientModal
            clients={clients}
            studios={studios ?? []}
            activeStudioId={contextActiveStudioId ?? null}
            authorId={authTrainer?.id ?? ""}
            onClose={() => setCreatingClient(false)}
            onClientCreated={(id, made) => assignSessionToClient(id, made ?? null)}
          />,
          document.body,
        )}

      {/* End Session Confirmation Dialog */}
      {/* The session's two closing dialogs speak the app's voice (type and
          depth, phase 13; AJ's 3B): a 22/800 title in its own
          capitalisation, labels at 14/700, the buttons' own 14/700 with
          their 3:1 edge and their lift, and the shared dialog's lift in
          both modes. */}
      <Dialog open={showEndConfirmation} onOpenChange={setShowEndConfirmation}>
        <DialogContent className="sm:max-w-100 rounded-[32px] p-0 overflow-hidden border-none">
          <div className="bg-primary p-8 text-primary-foreground space-y-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-2">
              <AlertCircle className="w-6 h-6 text-primary-foreground" />
            </div>
            <h3 className="text-[22px] font-extrabold tracking-[-0.015em]">
              End session?
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
                {/* Who's this?, at Finish: the client is chosen (or added),
                    and this question comes back as theirs, whose Finish is
                    the ordinary one: the Wrap-up and Next time (the open
                    session round, Oct 9 2026). It used to skip Finish and
                    open the profile. */}
                <p className="text-sm font-bold text-ink-d2 px-1 mb-2">
                  Who is this session for?
                </p>
                <Button
                  className="w-full h-14 rounded-2xl"
                  onClick={() => {
                    setShowEndConfirmation(false);
                    setAssignFrom("finish");
                    setShowAssignDialog(true);
                  }}
                >
                  <Users className="w-4 h-4 mr-3" /> Assign to client
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-14 rounded-2xl"
                  onClick={() => {
                    setShowEndConfirmation(false);
                    setAssignFrom("finish");
                    setCreatingClient(true);
                  }}
                >
                  <PlusCircle className="w-4 h-4 mr-3" /> Create new client
                </Button>
                <div className="py-2 flex items-center gap-4">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-sm font-bold text-ink-d2">
                    Danger zone
                  </span>
                  <div className="h-px bg-border flex-1" />
                </div>
                <Button
                  variant="ghost"
                  className="w-full h-14 rounded-2xl text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => deleteSession(currentSession!.id!)}
                >
                  <Trash2 className="w-4 h-4 mr-3" /> Delete session
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.keys(endChoices).length > 0 && (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-ink-d2">
                      Started, no count — record as
                    </label>
                    <p className="text-xs font-medium text-muted-foreground -mt-1">
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
                            <span className="text-sm font-bold min-w-0 [overflow-wrap:anywhere]">{name}</span>
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
                                    "h-10 px-3 rounded-xl text-xs font-bold border transition-colors active:translate-y-px active:shadow-(--press)",
                                    choice === opt
                                      ? "bg-primary text-primary-foreground border-primary shadow-(--solid-lift)"
                                      : "border-input bg-(--raised) text-foreground shadow-(--raised-lift)",
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
                  {/* The note for the next trainer (voice-review round, Sep 27
                      2026 — "the end session note is for the next trainer").
                      It files as a Heads up, the loudness the briefing shows
                      at four sessions. A note only for the profile is the
                      Wrap-up's Profile note, one screen on. */}
                  <label
                    htmlFor="next-trainer-note"
                    className="text-sm font-bold text-ink-d2"
                  >
                    Note for the next trainer (optional)
                  </label>
                  {/* The shared field: its 3:1 edge, sunk into the well. */}
                  <Textarea
                    id="next-trainer-note"
                    value={currentSessionNotes}
                    onChange={(e) => setCurrentSessionNotes(e.target.value)}
                    placeholder="What should the next trainer know before the next session?"
                    aria-describedby="next-trainer-note-hint"
                    className="min-h-25 resize-none focus-visible:ring-(--eq-hero) focus-visible:border-(--eq-hero)"
                  />
                  <p id="next-trainer-note-hint" className="text-xs text-muted-foreground">
                    Read out on the briefing at the next four sessions. A note just for the profile goes on the Wrap-up, next.
                  </p>
                  {currentSessionNotes.trim() ? (
                    <div className="flex flex-col gap-1.5" data-testid="next-trainer-file-as">
                      <span className="nc-kicker">File it as (optional)</span>
                      <NoteCategoryChips
                        value={nextTrainerCategory}
                        options={FILING_CATEGORIES}
                        label="File the note for the next trainer as"
                        small
                        onChange={(c) =>
                          setNextTrainerCategory((prev) => (prev === c ? null : (c as FilingCategory)))
                        }
                      />
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-14 rounded-2xl"
                    onClick={() => setShowEndConfirmation(false)}
                  >
                    Keep training
                  </Button>
                  {/* Orange takes Go's depth, never Go's slanted capitals. */}
                  <Button
                    className="h-14 rounded-2xl shadow-(--go-lift) bg-cta text-cta-foreground hover:bg-cta"
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
                    className="text-sm font-bold text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors py-3 px-6 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Abort session (no record)
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
        <DialogContent className="sm:max-w-100 rounded-[32px] p-0 overflow-hidden border-none">
          <div className="bg-card p-8 text-foreground space-y-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-colors ${isDeletingSession ? "bg-red-500/20 text-red-500 animate-pulse" : "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]"}`}
            >
              {isDeletingSession ? (
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              ) : (
                <Trash2 className="w-6 h-6" />
              )}
            </div>
            <h3 className="text-[22px] font-extrabold tracking-[-0.015em]">
              {isDeletingSession
                ? "Deleting session..."
                : "Scrap active session?"}
            </h3>
            <p className="text-muted-foreground font-medium text-sm leading-relaxed">
              {isDeletingSession
                ? "Scrapping all logged sets, timers, and notes. Cleaning database records..."
                : "Are you sure you want to cancel this session? All data logged so far will be scrapped and will not be recorded in the database."}
            </p>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-card border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="outline"
              disabled={isDeletingSession}
              className="h-14 rounded-2xl"
              onClick={() => setShowCancelConfirmation(false)}
            >
              Resume session
            </Button>
            <Button
              disabled={isDeletingSession}
              className="h-14 rounded-2xl bg-red-600 text-white shadow-(--elev-1) hover:bg-red-700 disabled:opacity-80 flex items-center justify-center gap-2"
              onClick={confirmScrapSession}
            >
              {isDeletingSession ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                "Scrap session"
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
      {/* ON A PHONE (Journey Lite, Oct 1 2026): the same session, drawn as
          one card per machine with its last five times. Every write is the
          grid's own handleGridLiveChange and the card in hand is the Now
          Bar's machine, so Finish, the clocks and the Wrap-up are unchanged
          (features/phone/README.md). */}
      {isPhone && gridLive ? (
        <PhoneSessionStage
          rows={gridSections[0]?.rows ?? []}
          /* The FileMaker floor on a phone (Oct 9 2026): the rest of the
             floor under today's cards, each name with its own Add, which
             adds and makes it the card in hand, as the grid's + does. */
          floor={showAllMachines ? (gridSections[1]?.rows ?? []) : null}
          onAddMachine={onGridAddMachine}
          history={gridHistory}
          values={gridLiveValues}
          focusId={gridFocusMachineId ?? null}
          onFocus={(id) => setFocusMachineOverride(id)}
          onChange={onGridLiveChange}
          onCommit={flushAllLogWrites}
          onOpenMachine={openMachineMenu}
          /* The card's Set up, as the iPad's Now Bar (AJ's "2a"). */
          onSetUp={onSetUpDoor}
          onReorder={() => setIsOrderSheetOpen(true)}
          planNext={planNext}
          onAddPlanned={onAddPlanned}
          /* The plan's sheet from the phone too (the iPad's corner's door). */
          plan={currentSession && sessionPlan.plan && sessionPlan.progress ? { have: sessionPlan.progress.have, of: sessionPlan.progress.of } : null}
          onOpenPlan={onOpenPlan}
          /* Start from a routine…, the corner's sheet, from the phone's foot. */
          onStartFrom={startFromOffered ? onOpenStartFrom : undefined}
          step={2}
          /* A card with no past times says what that means, the machine
             menu's way: never "first time" for a machine a running total
             knows, or while older sessions are unread, or while the
             client's machine totals haven't answered (features/machine-totals). */
          everythingRead={sessionsAllRead}
          coverage={totalsKnown ? clientCoverage : "unknown"}
          totals={selectedClient}
          historyState={logsWindow?.state ?? "loading"}
        />
      ) : (
      <div className={`jg-stage ${nowBarSide ? "jg-stage--side" : ""}`}>
      {/* jg-look: the Journey chart's look, lanes on a rail (AJ, Oct 3 2026:
          "update an active session to match the new design"). */}
      <div className="jg-stage__main jg-look">
        {/* No toolbar row (session top, option 1, Oct 3 2026): Routine / All,
            Reorder and the Key are the grid's corner (SessionCorner), and
            scrolling back to the oldest day loads older sessions. */}
        {isLegendOpen && (
          <div className="jg-keypop jg-keypop--corner" role="dialog" aria-label="Rep quality key">
            <QualityLegend />
            <button type="button" className="jg-keypop__close" onClick={() => setIsLegendOpen(false)}>
              Close
            </button>
          </div>
        )}
        {gridLive && (
          <JourneyGrid
            sessions={gridVisibleHistory}
            historySessions={gridHistory}
            sections={gridSections}
            live={gridLive}
            sessionNumbers={canQuoteNumber}
            coverage={clientCoverage}
            /* Analytics is a review tool: "highest weight, Sep 2" is what you
               read on the client profile, not what you need while a set is
               running. Off here, it hands its 100px to the timeline. */
            showStats={false}
            onLoadOlder={loadOlderGrid}
            canLoadOlder={gridVisible < gridHistory.length}
            loadingOlder={gridLoadingOlder}
            autoLoadOlder
            corner={
              <SessionCorner
                showAll={showAllMachines}
                routineCount={activeMachineIds.length}
                allCount={gridRows.length}
                onShowAll={setShowAllMachines}
                onReorder={currentSession ? () => setIsOrderSheetOpen(true) : undefined}
                plan={currentSession && sessionPlan.plan && sessionPlan.progress ? { have: sessionPlan.progress.have, of: sessionPlan.progress.of } : null}
                onPlan={onOpenPlan}
                onKey={() => setIsLegendOpen(true)}
                floor={floorView}
                /* Start from a routine… (AJ's "1b"): once today's list is on screen. */
                onStartFrom={startFromOffered ? onOpenStartFrom : undefined}
              />
            }
            /* The machine's NAME is the target -- one big one, the width of
               the rail. The note glyph is a mark, not a second button:
               "hard to tell if I'm tapping the note or the machine" was the
               audit's hesitation, and both did the same thing. It OPENS the
               machine menu on every tap (onOpenMachine): the old row trace
               toggled, so a machine just closed would not reopen. */
            onOpenMachine={openMachineMenu}
            layout="fill"
            /* Rows shrink to fit what is on screen (44 → 26px) instead of a
               fixed 44px that showed ~15 machines and hid the rest below
               the fold. Routine-only stays at 44px. With the Today column's
               + on screen (the FileMaker floor, All machines) a row keeps
               40px, so the + is 40px to tap, and the grid scrolls (the open
               session round, Oct 9 2026). */
            fit="auto"
            targetColumns={nowBarSide ? 8 : 10}
            title="Machine"
            /* The rail's Older button above does this job; no strip. */
            olderRail={false}
          />
        )}
        {gridLive && todayEffects.length > 0 && <SessionOrderLine effects={todayEffects} />}
      </div>

      {/* Zone 4 — "The Now". Everything between walking up to a machine and
          logging the set, in one place that never moves. */}
      {gridLive && (
        <SessionNowBar
          coverage={clientCoverage}
          /* The start falls back to the first counted set only once every
             session's sets are read (machine-menu/progress-figure.ts). */
          everythingRead={sessionsAllRead}
          row={gridFocusRow}
          orderNumber={gridFocusOrder}
          value={gridFocusMachineId ? gridLiveValues[gridFocusMachineId] : undefined}
          history={gridHistory}
          onChange={onGridLiveChange}
          onCommit={flushAllLogWrites}
          step={2}
          nextName={gridNextRow?.machine.name}
          onNext={() => {
            flushAllLogWrites();
            if (gridNextRow) setFocusMachineOverride(gridNextRow.machine.id);
          }}
          /* Until today's list is on screen the empty bar offers nothing:
             an add then would be recorded as the session's whole list. */
          onAddMachine={todaySeeded ? () => setIsOrderSheetOpen(true) : undefined}
          planNext={planNext}
          onAddPlanned={onAddPlanned}
          nothingToday={todaySeeded && activeMachineIds.length === 0}
          /* Every machine's + is on screen: the empty bar says where to tap. */
          floorOpen={showAllMachines}
          startingRange={focusRange}
          onStartingRange={onStartingRange}
          noHistoryLine={focusNoHistory}
          flagLine={
            gridFocusRow
              ? flagLineOf(
                  machineFlags(
                    {
                      ...gridFocusRow.machine,
                      // A studio's own machine is matched on its lineage.
                      comparisonKey: studioFloorById[gridFocusRow.machine.id]?.comparisonKey,
                    },
                    flagSources,
                  ),
                  (e) =>
                    e.occurredAt ? formatStudioDate(e.occurredAt, { month: "short", day: "numeric" }) : "",
                )
              : null
          }
          onOpenFlag={gridFocusMachineId ? () => openMachineMenu(gridFocusMachineId) : undefined}
          /* Set up: the card on the first empty dial, Save closes it (AJ's "2a"). */
          onSetUp={onSetUpDoor}
          level={traineeLevelOf(selectedClient)}
          layout={nowBarSide ? "side" : "bar"}
          readMachineSeconds={readFocusedMachineSeconds}
          machineClockRunning={!!currentSession && !isPaused}
        />
      )}
      </div>
      )}

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

      {/* Routine A's plan, from the grid's corner (§4.6): mounted while open. */}
      {currentSession && planSheetOpen && sessionPlan.routineA && sessionPlan.plan && (
        <SessionPlanSheet
          open
          onClose={() => setPlanSheetOpen(false)}
          firstName={clientFirstName(selectedClient, "")}
          plan={sessionPlan.plan}
          routine={sessionPlan.routineA.machineIds ?? []}
          today={activeMachineIds}
          runsA={sessionPlan.runsA}
          floor={sessionPlan.floorList}
          nameOf={planNameOf}
          todayYmd={planTodayYmd}
          /* Re-plan's starting routines are the studio the session is at,
             as the briefing's plan card and Programming read them. */
          studioId={contextActiveStudioId || selectedClient?.homeStudioId || null}
          who={planWho}
          loggedToday={planLoggedToday}
          onWrite={onPlanWrite}
          onHealthNote={sessionPlan.healthNote}
          startingColumn={sessionPlan.column}
          onStartingColumn={() => {
            setPlanSheetOpen(false);
            setRangeSheet("pick");
          }}
        />
      )}

      {/* Start from a routine… (the open session round, Oct 9 2026): mounted
          while open, so its one read happens only then. Today's list only. */}
      {currentSession && startFromOpen && (
        <StartFromRoutineSheet
          onClose={() => setStartFromOpen(false)}
          studioId={contextActiveStudioId || currentSession.hostedAtStudioId || null}
          studioName={activeStudio?.name ?? null}
          floor={sessionPlan.floorList}
          floorState={startFromFloorState}
          nameOf={planNameOf}
          todayYmd={planTodayYmd}
          /* The client's routines once they are known, "reading" until then (their place held);
             an open session has none until Who's this?. */
          clientRoutines={clientId ? (routinesKnown ? routines : "reading") : null}
          firstName={clientId ? clientFirstName(selectedClient, "") || null : null}
          outOfService={startFromOut}
          onLay={onLayRoutine}
        />
      )}

      {/* The Academy's starting range: the column, picked once per client. */}
      {currentSession && rangeSheet && (
        <StartingRangeSheet
          open
          mode={rangeSheet}
          firstName={clientFirstName(selectedClient, "")}
          column={sessionPlan.column}
          keptOnPlan={!!sessionPlan.plan}
          onPick={(column) => {
            sessionPlan.pickColumn(column);
            setRangeSheet(null);
          }}
          onChangeColumn={() => setRangeSheet("pick")}
          onClose={() => setRangeSheet(null)}
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
              className="absolute inset-0 bg-(--scrim)"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-background pt-safe pb-safe shadow-2xl dark:border-slate-800"
              role="dialog"
              aria-label="Pulse"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
                <div className="flex flex-col">
                  {/* A sheet's head: the panel title, 17/700, and its line
                      in the meta voice (type and depth, phase 13). */}
                  <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.01em] text-foreground">
                    <HeartPulse className="h-5 w-5 text-(--eq-hero)" /> Pulse
                  </h2>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    Saves as you type · session keeps running
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsShowingAssessment(false)}
                  aria-label="Close the Pulse"
                  className="rounded-full hover:bg-card dark:hover:bg-surface-1/10"
                >
                  <X className="h-5 w-5 text-muted-foreground" />
                </Button>
              </div>
              <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
                {/* Pulse's file gone after a deploy says so here, in the
                    panel, and never takes the session's screen with it
                    (features/new-version). */}
                <LoadBoundary kind="panel" panel="Pulse">
                  <React.Suspense
                    fallback={
                      <div className="flex items-center justify-center py-16 text-sm font-medium text-muted-foreground">
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
                </LoadBoundary>
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
            /* A draft the machine menu filed for the floor's notes is finished on its card. */
            floorStudioName={machineMenuHost.floorStudio.name}
            /* This session's notes from the one journal listener (R11). */
            journalStream={flagJournalStream}
            onOpenMachine={(id) => {
              setIsShowingSessionNotes(false);
              openMachineMenu(id);
            }}
            onClose={() => setIsShowingSessionNotes(false)}
          />
        )}
      </AnimatePresence>

    </motion.div>
  );
}
