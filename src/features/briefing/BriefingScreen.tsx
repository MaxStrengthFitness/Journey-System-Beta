/**
 * THE PRE-SESSION BRIEFING.
 *
 * Round: Sep 6 2026 UI pass. Originally built Aug 2026.
 *
 * The last screen before a trainer puts hands on a client, and the only one
 * that answers "is there anything here that could hurt them". Everything on it
 * is ordered by that: who they are, what must not happen, what the plan is,
 * how they turned up today, and then one loud way to start.
 *
 * WHAT THIS ROUND CHANGED, AND WHY
 * --------------------------------
 * Style: it now uses the feature-token pattern the rest of the app moved to -
 * briefing.tokens.css for colour, briefing.css for layout, and class names in
 * the markup. It used to be raw utilities, and that had cost real things:
 * #38BDF8 and #0A548B were typed in by hand rather than named, dark-mode pairs
 * existed on some elements and not others, five different corner radii were in
 * play, and the four check-in pill groups were 120 lines of copy-pasted class
 * strings that had already drifted apart from one another.
 *
 * Order: the critical strip moved ABOVE the goal. A goal is a direction; a
 * contraindication is a thing that must not happen in the next ninety minutes,
 * and it was reading second.
 *
 * Scrolling: the screen no longer declares `min-h-screen` and its own
 * `overflow-y-auto` inside AppContent's <main>, which already scrolls for this
 * view. See the header of briefing.css - that pair is why START SESSION sat
 * under the bottom nav.
 *
 * Restored: the BodyStateTracker. It was imported, never rendered, and the
 * `bodyStates` state plus the branch in handleStart that saves it into
 * PreSessionCheckIn were therefore dead. The element was the only missing
 * piece; everything downstream of it already worked.
 *
 * REPORTING ROUND, SEP 2026
 * -------------------------
 * AJ's audit: "cluttered … the trainer has most likely trained that person a
 * dozen times over but they need to know if anything is new and what's going
 * on for today." So the page got denser and every part of it started saying
 * something new:
 *   • "Before you start" now also reads out Heads ups (elevated journal notes
 *     still inside their "until" day or three weeks — `headsUpEntries`,
 *     quieter than the Critical ones) and the body regions carried over from
 *     the last session with a "matters until" day (`carriedRegions`).
 *   • The FORD cue is the capture itself: tap it, note what they said, filed
 *     under the pillar it asked about (audit action item C).
 *   • Each routine button says when THAT routine last ran (action item D),
 *     not just when the last session was.
 *   • "On the way in" is four Dials — Sleep · Energy · Recovery · Stress —
 *     written as `checkIn.readiness`; sleepQuality / stressLevel / energyLevel
 *     / mood are no longer written and Mood has no dial. Body regions open the
 *     same Dial with an optional "matters until" day.
 *   • "Assessment" became "Update Pulse" (PulseQuickLogDialog).
 * The pure parts live in briefing-facts.ts; BriefingScreen.render.test.tsx
 * mounts the screen.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  ChevronDown,
  Crosshair,
  HeartPulse,
  History,
  Lightbulb,
  PenLine,
  Play,
  Scale,
  ShieldAlert,
  SlidersHorizontal,
  Tablet,
  Target,
  X,
} from "lucide-react";
import { BodyModel, figureGenderOf } from "../../components/anatomy";
import { ClientCheckInPanel } from "../../components/journal/ClientCheckInPanel";
import {
  RoutineBuilder,
  type MachineHistoryEntry,
} from "../routine-builder";
import { cn } from "@/lib/utils";
import {
  findRoutineByLetter,
  matchesRoutineLetter,
} from "../../lib/routine-utils";
import { hubMarkers } from "../../lib/hub-markers";
import { briefingMoments } from "../hub-opportunities/briefing-moments";
import { sessionNumberWords, sessionTotalOf } from "../../lib/session-total";
import { BriefingRenewalLine } from "../renewals/BriefingRenewalLine";
import { AppHeader } from "../../components/AppHeader";
import {
  Machine,
  Routine,
  Trainer,
  Client,
  WorkoutSession,
  ExerciseLog,
  PreSessionCheckIn,
  BodyStateTag,
} from "../../types";
import { BodyStateTracker } from "../../components/BodyStateTracker";
import { PulseQuickLogDialog } from "../subjective-report";
import { FordBriefingCue } from "../ford/FordBriefingCue";
import { useClientJournal } from "../../hooks/useClientJournal";
import type { HistoryCoverage } from "../../lib/prior-history";
import { JournalEntryCard } from "../../components/journal/JournalEntryCard";
import { CriticalStrip } from "../../components/journal/CriticalStrip";
import { BriefingNoteFooter } from "./BriefingNoteFooter";
import { briefingNotes, latestUpdateLine, standingHealth } from "./briefing-notes";
import { useNoteDismissals, dismissThread } from "../client-notes/dismissal-store";
import type { NoteThread } from "../client-notes/threads";
import { FOCUS_VISUALS, relativeDay, toDate } from "../../types/journal";
import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";
import { namedMachines, shortCondition } from "../../lib/clinical-watchouts";
import { safeToDate } from "../../lib/utils";
import { isPerformedLog } from "../../lib/set-outcome";
import { studioTodayKey } from "../../lib/studio-time";
import { auth } from "../../firebase";
import { Dial, READINESS_KEYS, READINESS_SCALES, compactReadiness, type Readiness } from "../rating";
import { carriedRegions, lastRunLabel, lastRunOfRoutine } from "./briefing-facts";
import {
  figureRegionOfTag,
  lastTimeLines,
  machinesTouchingLimits,
  regionWords,
  routineCodes,
  safetyRegions,
  tagOfSlug,
  viewsToDraw,
} from "./stack";
import { completedSessionDays, inbodyDue, inbodyDueLine } from "../inbody/due";
import { variationStudioIdOf } from "../inbody/variation";
import { useStudioSettings } from "../studio-settings";
import "./briefing.css";
import { NoteCategoryChips } from "../client-notes/NoteCategoryChips";
import { FILING_CATEGORIES, type FilingCategory } from "../client-notes/note-catalog";
import { usePhone } from "../phone/device";

import { clientDisplayName, clientFirstName } from "../../lib/client-name";
import { useLeaveGuard, useUnsavedChanges } from "../unsaved-changes";
import { openProfileAt } from "../client-profile/profile-nav";
import { isProvisionalNewClient, pastLearningCurve, startingKindOf } from "../routine-plan/client-kind";
import { openHealthWords, planIntakeText } from "../routine-plan/intake";
import { planProgress, progressLine, todayFor } from "../routine-plan/plan";
import { roadGroups } from "../routine-plan/lineup";
import {
  briefingPlanView,
  type BriefingDoor,
  type StartPlanAtStart,
} from "../routine-plan/briefing-plan";
import { useBriefingPlan } from "../routine-plan/ui/useBriefingPlan";
import { BriefingDoors, BriefingJourneyLine, BriefingPlanCard } from "../routine-plan/ui/BriefingPlanCard";
import { RoadStrip } from "../routine-plan/ui/RoadStrip";
import { machineNamer } from "../routine-plan/ui/host";

/** Her limits on the figure: the briefing's caution tone, never the kaizen red. */
const SAFETY_LIT: [string, string] = ["var(--br-warn)", "var(--br-warn)"];
/** A sore spot she tells you about on the way in: the live blue. */
const SORE_LIT: [string, string] = ["var(--br-live)", "var(--br-live)"];

export interface BriefingScreenProps {
  /** The studio the session is at, for the header (the active studio's name). */
  studioName?: string;
  /**
   * How much of this client's story Journey holds (lib/client-coverage.ts).
   * The briefing is where a trainer meets a client they may not know - AJ's
   * cold start - so it is the worst place in the app to claim she is new.
   * Defaults to the cautious answer.
   */
  coverage?: HistoryCoverage;
  /**
   * Every studio the app streams: her home studio's cutover, which the Hub's
   * engine needs before it may call a gap "a break" (briefing-moments.ts).
   */
  studios?: ReadonlyArray<{ id?: string; name?: string; journeyCutoverDate?: string | null }> | null;
  /** The studio the session is at, for its starting routines (the briefing's plan card). */
  studioId?: string | null;
  authTrainer: Trainer | null;
  client: Client;
  targetRoutine: Routine | null;
  lastSession: WorkoutSession | null;
  /**
   * The client's routines have answered, and the answer can be trusted (the
   * tracker's `routinesKnown`: an empty answer from the iPad's cache is not
   * "no routine"). Until then the briefing claims nothing about how the
   * client starts: Journey can't tell, both doors (the first-session design
   * round, Oct 8 2026, §4.1). Defaults to the cautious answer.
   */
  routinesKnown?: boolean;
  onStart: (
    routineType: "A" | "B" | "Free",
    customMachines?: string[],
    note?: string,
    checkIn?: PreSessionCheckIn,
    /** The arrival note's category, when the trainer picked one (notes round, Oct 3 2026). */
    noteCategory?: FilingCategory | null,
    /**
     * A client starting out at the studio: the plan Start keeps (§4.5). The
     * briefing never writes it; the tracker does, in the Start batch, with
     * an EMPTY Routine A.
     */
    startPlan?: StartPlanAtStart | null,
  ) => void;
  onClose: () => void;
  machines: Machine[];
  routines: Routine[];
  /** Used to resolve initials on legacy journal rows. */
  trainers?: Trainer[];
  /**
   * The client's completed sessions (any order), so each routine button can
   * say when THAT routine last ran. Reporting round, Sep 2026.
   */
  sessions?: WorkoutSession[];
  /**
   * `sessions` is every Completed session Journey has for her, not a page of
   * them (the Active Session streams them all). Without it the InBody count
   * is read as a floor ("at least").
   */
  sessionsAreAll?: boolean;
  logs?: ExerciseLog[];
  rightControls?: React.ReactNode;
  trainerDropdown?: React.ReactNode;
  onStudioClick?: () => void;
}

export function BriefingScreen({
  studioName,
  studioId = null,
  authTrainer,
  client,
  targetRoutine,
  lastSession,
  routinesKnown = false,
  onStart,
  onClose,
  machines,
  routines,
  trainers = [],
  sessions = [],
  sessionsAreAll = false,
  logs = [],
  rightControls,
  trainerDropdown,
  onStudioClick,
  coverage = "unknown",
  studios = null,
}: BriefingScreenProps) {
  const [selectedRoutineType, setSelectedRoutineType] = useState<
    "A" | "B" | "Free" | "Create_A" | "Create_B"
  >("A");
  const [adjustedMachineIds, setAdjustedMachineIds] = useState<string[]>([]);
  const [adjustmentNote, setAdjustmentNote] = useState("");
  // What kind of note the arrival note is (notes round, Oct 3 2026): one
  // optional tap, offered only once something is typed, so the start is
  // never slower. Picked, it is filed as it is written and reaches whoever
  // acts on it (Health, Incident and Retention reach the studio's leaders);
  // left alone, it waits in the To-file tray as before.
  const [arrivalCategory, setArrivalCategory] = useState<FilingCategory | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  /** Update Pulse — the living assessment, one area at a time, from here. */
  const [showPulse, setShowPulse] = useState(false);
  const [bodyStates, setBodyStates] = useState<BodyStateTag[]>([]);
  /**
   * "On the way in" (reporting round, Sep 2026): four Dials against this
   * client's usual. Untouched = not asked = left out of the write. Mood has
   * no dial — the trainer can see it.
   */
  const [readiness, setReadiness] = useState<Readiness>({});

  const routineA = findRoutineByLetter(routines, "A");
  const routineB = findRoutineByLetter(routines, "B");
  /* What Routine A runs today (the first-session design round, §4.5):
     its machines, else its plan's day one while it is still empty (the
     consult is not Routine A), else none. Never the whole floor. */
  const routineAToday = useMemo(
    () => todayFor({ routine: routineA?.machineIds, plan: routineA?.plan }),
    [routineA],
  );

  /** Set once the trainer picks a routine by hand, so a background refetch of
   *  `routines` cannot silently reset their choice back to the suggestion. */
  const [routinePickedByTrainer, setRoutinePickedByTrainer] = useState(false);

  /** Which routine the alternation logic proposed, shown as a hint on the toggle. */
  const suggestedType: "A" | "B" = matchesRoutineLetter(targetRoutine, "B")
    ? "B"
    : "A";

  const handlePickRoutine = (type: "A" | "B") => {
    setRoutinePickedByTrainer(true);
    setIsAdjusting(false);
    if (type === "A") {
      setSelectedRoutineType(routineA ? "A" : "Create_A");
      setAdjustedMachineIds(routineAToday);
    } else {
      setSelectedRoutineType(routineB ? "B" : "Create_B");
      setAdjustedMachineIds(routineB?.machineIds || []);
    }
  };

  useEffect(() => {
    let type: "A" | "B" | "Free" | "Create_A" | "Create_B" = routineA ? "A" : "Create_A";
    if (targetRoutine) {
      if (matchesRoutineLetter(targetRoutine, "A")) type = routineA ? "A" : "Create_A";
      else if (matchesRoutineLetter(targetRoutine, "B")) type = routineB ? "B" : "Create_B";
    }

    if (type === "B" && !routineB) {
      type = "Create_B";
    }

    // A hand-picked routine wins over the suggestion.
    if (routinePickedByTrainer) return;

    setSelectedRoutineType(type);
    if (type === "B") {
      setAdjustedMachineIds(routineB?.machineIds || []);
    } else if (type === "A") {
      setAdjustedMachineIds(routineAToday);
    } else {
      setAdjustedMachineIds([]);
    }
  }, [targetRoutine, routineA, routineAToday, routineB, routinePickedByTrainer]);

  /**
   * Any change to the sequence — reorder, add, remove, a one-tap rule fix —
   * lands here and marks the briefing as adjusted.
   *
   * `isAdjusting` is what decides whether onStart passes customMachines at
   * all, and therefore whether today's session runs the saved routine or an
   * override of it. Routing every edit through one setter is why that flag
   * can no longer disagree with what is on screen.
   */
  const handleSequenceChange = (next: string[]) => {
    setAdjustedMachineIds(next);
    setIsAdjusting(true);
  };

  const isPhone = usePhone();

  /**
   * Last weight and reps per machine.
   *
   * The fallback chain is unchanged from the version that lived inline in the
   * sequence list: the newest log wins, then the client's stored metric, and
   * a TSC machine reads seconds rather than reps — checking outcomeTut and
   * timeSpent as well, because three rounds of the tracker wrote it under
   * three names. It moved out here so the shared row can render it.
   *
   * "Newest log" means the newest PERFORMED set (set-outcome.ts). A practice
   * set at 60 lb last week is not what the client last lifted, and a skip
   * has no numbers at all; the briefing shows the last real effort.
   */
  const machineHistory = useMemo<Record<string, MachineHistoryEntry>>(() => {
    const millis = (ts: any) => {
      if (!ts) return 0;
      if (typeof ts.toMillis === "function") return ts.toMillis();
      if (typeof ts.toDate === "function") return ts.toDate().getTime();
      if (ts.seconds !== undefined) return ts.seconds * 1000;
      const d = new Date(ts);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };
    const filled = (v: any) => v !== undefined && v !== null && v !== "";
    const out: Record<string, MachineHistoryEntry> = {};

    for (const machine of machines) {
      const machineId = machine.id;
      if (!machineId) continue;
      const mLogs = (logs ?? [])
        .filter((l) => l.machineId === machineId && isPerformedLog(l))
        .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
      const lastLog = mLogs[0];
      const metric = client?.currentMachineMetrics?.[machineId];
      if (!lastLog && !metric) continue;

      const isTSC =
        machine.targetRepRange?.toLowerCase().includes("tsc") ||
        machine.targetRepRange?.toLowerCase().includes("static") ||
        machine.targetRepRange?.toLowerCase().includes("time") ||
        Boolean(lastLog?.isTSC) ||
        Boolean(metric?.isTSC);

      const first = (...vals: any[]) => vals.find(filled) ?? null;

      const lastWeight = first(lastLog?.weight, lastLog?.loadLb, metric?.weight);
      const lastReps = isTSC
        ? first(
            lastLog?.seconds,
            lastLog?.outcomeTut,
            lastLog?.timeSpent,
            metric?.seconds,
            lastLog?.reps,
            metric?.reps,
          )
        : first(lastLog?.reps, lastLog?.outcomeReps, metric?.reps);
      out[machineId] = {
        lastWeight,
        lastReps,
        lastUnit: isTSC ? "sec" : "reps",
        lastDate: null,
      };
    }
    return out;
  }, [machines, logs, client]);

  /** The other half of the rotation, for the twice-weekly analysis. */
  const counterpartIds = useMemo(() => {
    if (selectedRoutineType === "A" || selectedRoutineType === "Create_A")
      return routineB?.machineIds ?? null;
    if (selectedRoutineType === "B" || selectedRoutineType === "Create_B")
      return routineA ? routineAToday : null;
    return null;
  }, [selectedRoutineType, routineA, routineAToday, routineB]);

  /** What this client reported, for goal- and condition-aware suggestions. */
  const purposeText = useMemo(
    () =>
      [client?.medicalHistory, client?.goals, (client?.clinicalProfile ?? []).join(" ")]
        .filter(Boolean)
        .join(" · ") || null,
    [client?.medicalHistory, client?.goals, client?.clinicalProfile],
  );

  const clientFlags = (client.clinicalFlags || [])
    .map((flagId) => CLINICAL_FLAGS_MATRIX.find((f) => f.id === flagId))
    .filter(Boolean) as typeof CLINICAL_FLAGS_MATRIX;
  // Which condition chip is open, showing the matrix's instruction beneath.
  const [openFlagId, setOpenFlagId] = useState<string | null>(null);
  const openFlag = openFlagId ? clientFlags.find((f) => f.id === openFlagId) ?? null : null;
  const [showAllHeadsUp, setShowAllHeadsUp] = useState(false);
  // Her standing health context, folded under the news (notes round, Oct 3 2026).
  const [showStanding, setShowStanding] = useState(false);

  const severityOrder = {
    "Absolute Contraindication": 0,
    "High Risk": 1,
    "Moderate / Needs Modification": 2,
  };
  clientFlags.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );

  /**
   * The briefing and the Journal read the SAME selection, from the same hook,
   * so the two can never disagree about what a coach needs to know. Anything a
   * coach marks critical in the Journal shows up here automatically — including
   * unresolved incidents, post-op restrictions still inside their window, and
   * Mindbody-imported consultation notes flagged critical.
   *
   * The old code filtered sessionNotes for priority === "High"; those rows are
   * still covered, because the adapter maps High -> critical.
   */
  const journal = useClientJournal({
    clientId: client.id || null,
    client,
    trainers,
  });
  const { criticalEntries, focuses } = journal;
  /* "Nothing flagged" is a safety claim, so it may only be made once the
     notes are actually known. A failed read means UNKNOWN, never EMPTY
     (CLAUDE.md, Data) — and this is the one screen whose job is to answer
     "is there anything here that could hurt them". It never blocks START. */
  const notesKnown = !journal.isLoading && !journal.needsIndex;
  /* Heads ups (reporting round): quieter than Critical, and only while they
     still matter — their "until" day, or three weeks. */
  const headsUpEntries = journal.headsUpEntries ?? [];

  /* WHO IS READING THIS. The Auth uid, not authTrainer.id — the rules pin
     both the FORD capture and a dismissal to it, and the two differ on older
     accounts. */
  const uid = auth.currentUser?.uid ?? authTrainer?.id ?? null;

  /* The same selection as before, read out as THREADS and with this
     trainer's dismissals applied (features/briefing/briefing-notes.ts).
     `hidden` is what they chose not to see, counted so the screen can offer
     it back: a briefing that withholds something with no way to find it is
     the quiet failure this round is most afraid of. */
  const dismissals = useNoteDismissals(uid);
  const [showHushed, setShowHushed] = useState(false);
  const notes = useMemo(
    () => briefingNotes(journal.threads, criticalEntries, headsUpEntries, dismissals, showHushed),
    [journal.threads, criticalEntries, headsUpEntries, dismissals, showHushed],
  );
  const hush = uid
    ? (thread: NoteThread) => {
        void dismissThread(uid, thread.id);
      }
    : undefined;

  const activeJournalFocuses = focuses.filter((f) => f.status === "active");

  /* Body regions the last session said still matter today ("keep the leg
     press out until Thursday"). Studio day, string compare. */
  const todayKey = studioTodayKey();
  const carried = useMemo(() => carriedRegions(lastSession, todayKey), [lastSession, todayKey]);
  /* Known, not news (notes round, Oct 3 2026; briefing-notes.ts): her Health
     and Incident notes that are simply true — an old knee, osteoporosis —
     folded under the news, never counted in "Before you start". */
  const liveIds = useMemo(
    () => new Set([...criticalEntries, ...headsUpEntries].map((e) => e.id)),
    [criticalEntries, headsUpEntries],
  );
  const standing = useMemo(
    () => standingHealth(journal.threads, todayKey, undefined, liveIds),
    [journal.threads, todayKey, liveIds],
  );

  /* Everything that belongs under "Before you start", counted once so the
     heading can say how many things there are. */
  // The milestone and the break come from the Hub's one engine (the Atlas
  // answers, Oct 2 2026), so the briefing and the Hub card never disagree.
  const markers = useMemo(() => {
    const own = hubMarkers({ client, sessionNumber: (client.sessionCount || 0) + 1, coverage });
    const engine = briefingMoments({ client, today: todayKey, now: new Date(), studios }).map((m) => ({
      kind: m.kind as "milestone" | "back",
      label: m.chip,
    }));
    return [...own, ...engine];
  }, [client, coverage, todayKey, studios]);
  /* Her total while it is Mindbody's guess (Atlas answers, Oct 2 2026): the
     briefing says the number this session will be, and that it is a guess
     until a trainer confirms it on Account. No milestone is claimed off it
     (hubMarkers gates those on a confirmed or whole total). */
  const totals = useMemo(() => sessionTotalOf(client, coverage), [client, coverage]);
  const guessLine =
    totals.basis === "mindbody" && totals.total !== null
      ? `This is session ${sessionNumberWords(totals.total + 1, "mindbody", { explain: true })}.`
      : null;
  /* Due an InBody (FileMaker parity, Oct 1 2026): one quiet line, only when
     she is due, and never in the way of Start. Her HOME studio's number,
     else her own (features/inbody/due.ts). */
  const studioSettings = useStudioSettings(variationStudioIdOf(client));
  const studioEvery = Number(studioSettings.value("inbodyEverySessions"));
  const inbodyLine = useMemo(
    () =>
      inbodyDueLine(
        inbodyDue({
          latestScanDay: client.inbodySummary?.latestTestedAt ?? null,
          sessionDays: completedSessionDays(sessions),
          listComplete: sessionsAreAll,
          coverage,
          studioEvery,
          clientEvery: client.inbodyEvery,
        }),
      ),
    [client, sessions, sessionsAreAll, coverage, studioEvery],
  );


  /* When each routine last ran — a different date from the last session's. */
  const lastRunA = useMemo(() => lastRunOfRoutine(sessions, routines, "A"), [sessions, routines]);
  const lastRunB = useMemo(() => lastRunOfRoutine(sessions, routines, "B"), [sessions, routines]);

  /* The FORD capture writes as the signed-in person. So does a dismissal. */
  const fordAuthor = uid
    ? { id: uid, initials: (authTrainer?.initials || "TR").toUpperCase(), fullName: authTrainer?.fullName || "Coach" }
    : null;

  const lastRoutineName = lastSession
    ? routines.find((r) => r.id === lastSession.routineId)?.name ||
      ((lastSession.sessionType as string) === "Free"
        ? "Open Session"
        : lastSession.sessionType)
    : "None";

  const lastSessionDate = safeToDate(lastSession?.endTime)
    ? safeToDate(lastSession.endTime)!.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    /*
     * NOT "Never". Journey having no completed session for her is a fact
     * about our records, not about her: during the migration most of the
     * roster arrives that way. lib/prior-history.ts owns the two wordings
     * and the difference between them.
     */
    : coverage === "complete"
      ? "Never"
      : "Nothing recorded";

  // Follows the trainer's selection, not the original suggestion — otherwise the
  // card keeps naming the auto-picked routine after they switch.

  const selectedRoutineIds =
    isAdjusting ||
    ["Free", "Create_A", "Create_B"].includes(selectedRoutineType)
      ? adjustedMachineIds
      : selectedRoutineType === "A"
        ? routineAToday
        : routineB?.machineIds || [];

  /* ---------------------------------------------------------------- *
   * THE STACK (AJ's walk, Oct 3 2026; stack.ts is the pure half).
   * ---------------------------------------------------------------- */
  const flagIds = useMemo(() => clientFlags.map((f) => f.id), [clientFlags]);
  const litRegions = useMemo(
    () => safetyRegions(flagIds, carried.map((c) => c.region)),
    [flagIds, carried],
  );
  const figureViews = useMemo(() => viewsToDraw(litRegions), [litRegions]);
  const figureGender = figureGenderOf(client.gender);
  const lastTime = useMemo(
    () => lastTimeLines({ lastSession, logs, machines }),
    [lastSession, logs, machines],
  );
  const safetyCount = clientFlags.length + notes.critical.length + carried.length;
  const sinceCount =
    lastTime.length + notes.headsUp.length + markers.length + activeJournalFocuses.length;

  /* On the way in: Dials open by default (one tap is the usual capture);
     Sore spot and Note a tap away; Hand over the iPad opens Pulse's client
     mode. Untouched = not asked, exactly as before. */
  const [drawer, setDrawer] = useState<{ dials: boolean; sore: boolean; note: boolean }>({
    dials: true,
    sore: false,
    note: false,
  });
  const toggleDrawer = (key: "dials" | "sore" | "note") =>
    setDrawer((d) => ({ ...d, [key]: !d[key] }));
  const [handing, setHanding] = useState(false);
  const [soreView, setSoreView] = useState<"front" | "back">("front");
  const tappedDials = Object.keys(compactReadiness(readiness) ?? {}).length;
  /* A tap on the Sore spot figure opens the tracker's rating step for that
     region: nothing is written until it is rated on the Dial. */
  const [soreRequest, setSoreRequest] = useState<{ region: string; nonce: number } | null>(null);
  const tapSore = (slug: string) => {
    const region = tagOfSlug(slug);
    if (region) setSoreRequest((prev) => ({ region, nonce: (prev?.nonce ?? 0) + 1 }));
  };
  const soreRegions = useMemo(
    () =>
      bodyStates
        .map((b) => figureRegionOfTag(b.region))
        .filter((r): r is NonNullable<typeof r> => r !== null),
    [bodyStates],
  );

  /* The routine, as one line until it is opened. */
  const [routineOpen, setRoutineOpen] = useState(false);
  const routineLetter =
    selectedRoutineType === "B" || selectedRoutineType === "Create_B" ? "B" : "A";
  const codes = routineCodes(selectedRoutineIds, machines);
  const touching = machinesTouchingLimits(selectedRoutineIds, machines, flagIds);

  /* ---------------------------------------------------------------- *
   * HOW THE CLIENT STARTS (the first-session design round, Oct 8 2026,
   * §4.1 and §4.5; routine-plan/briefing-plan.ts is the pure half).
   * A client starting out at the studio gets the plan card (the Road with
   * today under its bracket, Change today, the Source tag, Another start),
   * and Start hands the plan up for the tracker to keep in the Start batch;
   * a client who trained here before Journey gets one line and a door to
   * Programming; when Journey can't tell, both doors. Nothing here writes,
   * and nothing here holds Start: "new" is never decided off a read that
   * hasn't answered (`routinesKnown`, and the session count on the client).
   * ---------------------------------------------------------------- */
  const sessionCount = typeof client.sessionCount === "number" ? client.sessionCount : null;
  const startingKind = useMemo(() => {
    // Add Client's walk-in is starting out whatever its count says (it may carry none).
    const walkIn = isProvisionalNewClient(client);
    return startingKindOf({
      known: routinesKnown && (sessionCount !== null || walkIn),
      // Either spelling, as `findRoutineByLetter` finds the routine drawn.
      hasRoutine: routines.some(
        (r) => (matchesRoutineLetter(r, "A") || matchesRoutineLetter(r, "B")) && (r.machineIds?.length ?? 0) > 0,
      ),
      hasPlan: !!routineA?.plan,
      journeySessions: sessionCount,
      coverage,
      provisionalNewClient: walkIn,
    });
  }, [routinesKnown, sessionCount, routines, routineA, coverage, client]);
  /** A door picked when Journey couldn't tell stays picked, even once it can. */
  const [door, setDoor] = useState<BriefingDoor | null>(null);
  const planView = briefingPlanView({ routines, kind: startingKind.kind, door });
  const firstName = clientFirstName(client, "the client");
  const sentenceName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const planNameOf = useMemo(() => machineNamer(machines, machines), [machines]);
  /* The intake a starting routine is matched on, as Programming reads it:
     medical history, goals, the clinical profile and the open Health notes
     (from the journal this screen already streams). */
  const planIntake = useMemo(
    () =>
      planIntakeText({
        medicalHistory: client.medicalHistory,
        goals: client.goals,
        clinicalProfile: client.clinicalProfile,
        healthNotes: openHealthWords(journal.entries ?? null),
      }),
    [client.medicalHistory, client.goals, client.clinicalProfile, journal.entries],
  );
  // The Auth uid, which the rules pin a plan's change to; no uid, no plan handed up.
  const planWhoUid = auth.currentUser?.uid ?? null;
  const planWhoName = authTrainer?.fullName?.trim() || null;
  const planWho = useMemo(
    () => (planWhoUid ? { uid: planWhoUid, ...(planWhoName ? { name: planWhoName } : null) } : null),
    [planWhoUid, planWhoName],
  );
  const briefingPlan = useBriefingPlan({
    view: planView,
    studioId: studioId ?? client.homeStudioId ?? null,
    studioName: studioName ?? null,
    floor: machines,
    intakeText: planIntake,
    who: planWho,
    todayYmd: todayKey,
    kept: planView === "kept" ? (routineA?.plan ?? null) : null,
  });
  /* A plan in progress: the routine line, and the Road under it as the
     glance ("3 of 6 · next: …"). */
  const inProgress =
    planView === "in-progress" && routineLetter === "A" && routineA?.plan
      ? {
          groups: roadGroups({ plan: routineA.plan, today: selectedRoutineIds, todayYmd: todayKey, firstName }),
          progress: planProgress(routineA.plan, routineA.machineIds ?? []),
        }
      : null;
  /* The plan card's safety line: today's machines against the client's
     limits, as the routine line says it for a routine (the routine line is
     not drawn for a plan card). */
  const planTouching =
    planView === "starting" || planView === "kept" ? machinesTouchingLimits(briefingPlan.today, machines, flagIds) : [];

  /* What the briefing holds that a navigation would lose: the arrival note,
     the Dials and body states tapped, and today changed on the plan card.
     Registered with the leave gate (the always-on rule), so the app's own
     navigation asks first; "Leave" puts it all back. Start is not a
     navigation and never asks. */
  const briefingDirty =
    adjustmentNote.trim() !== "" || tappedDials > 0 || bodyStates.length > 0 || briefingPlan.changed;
  const { reset: resetPlanCard } = briefingPlan;
  useUnsavedChanges(briefingDirty, "the briefing", {
    onDiscard: () => {
      setAdjustmentNote("");
      setArrivalCategory(null);
      setReadiness({});
      setBodyStates([]);
      resetPlanCard();
    },
  });
  /* The briefing's own ways out ask the gate BEFORE anything moves: the
     tracker's close drops the briefing first and moves the screen second, so
     asked any later, "Keep editing" would keep nothing. Programming →
     Routine A, for a client who trained here before Journey, stores its
     handoff only once the gate says go (nothing set before the answer). */
  const leave = useLeaveGuard();
  const closeBriefing = () => leave(onClose);
  const enterRoutine = () =>
    leave(() => {
      openProfileAt(client.id, { tab: "programming", view: "routine-a" });
      onClose();
    });

  const handleStart = () => {
    const checkIn: PreSessionCheckIn = {};
    // Only the dials that were tapped; nothing when none were.
    const tapped = compactReadiness(readiness);
    if (tapped) checkIn.readiness = tapped;
    if (bodyStates.length > 0) checkIn.bodyStates = bodyStates;
    const category = adjustmentNote.trim() ? arrivalCategory : null;

    if (planView === "starting" || planView === "kept") {
      /* Today as the card has it. A starting plan goes up with today's
         machines on it; without one (still reading the starting routines,
         a start to pick, nobody signed in) today's list goes up alone,
         and Start makes no routine of it. */
      const { plan, today, changed, startPlan } = briefingPlan;
      const sendStartPlan = planView === "starting" ? startPlan : null;
      const custom = sendStartPlan || planView === "kept" ? (changed ? today : undefined) : plan ? today : undefined;
      onStart("A", custom, adjustmentNote, checkIn, category, sendStartPlan);
      return;
    }
    if (planView === "journey" || planView === "doors") {
      // Start and add machines as you go: an empty session, never the floor.
      onStart("A", undefined, adjustmentNote, checkIn, category, null);
      return;
    }
    onStart(
      selectedRoutineType === "Create_B"
        ? "B"
        : selectedRoutineType === "Create_A"
          ? "A"
          : (selectedRoutineType as any),
      isAdjusting ||
        ["Free", "Create_A", "Create_B"].includes(selectedRoutineType)
        ? adjustedMachineIds
        : undefined,
      adjustmentNote,
      checkIn,
      category,
    );
  };

  return (
    <div className="br">
        <AppHeader
          studioName={studioName}
          trainerInitials={authTrainer?.initials}
          rightControls={rightControls}
          trainerDropdown={trainerDropdown}
          onStudioClick={onStudioClick}
        />

        <div className="br__page">
            {/* 1. Who is in front of you. */}
            <section className="br-card br__hero">
              <div className="br__hero-top">
                <div className="min-w-0">
                  <h1 className="br__name">
                    {clientDisplayName(client)}
                  </h1>
                  <p className="br__meta">
                    Last session · {lastSessionDate} · {lastRoutineName}
                  </p>
                  {guessLine && (
                    <p className="br__meta br__meta--quiet" data-testid="briefing-session-guess">
                      {guessLine}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeBriefing}
                  className="br__close"
                  aria-label="Close briefing"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {client.globalNotes && (
                <p className="br__goalline">
                  <Lightbulb className="w-3.5 h-3.5" aria-hidden />
                  <span>{client.globalNotes}</span>
                </p>
              )}
            </section>

            {/* 2. BEFORE YOU START — what could hurt her, readable in two
                seconds (AJ, Oct 3 2026: "Safety: what could hurt her" first).
                The Catalog's muscle figure with her limits lit, and each
                limit with the line that says what to DO. Only safety is
                counted here; news, admin and the routine live below. */}
            <section
              className={cn("br-card br-safe", safetyCount === 0 && "br-safe--clear")}
              aria-label="Before you start"
            >
              <span className="br__label br__before-head">
                <ShieldAlert className="w-3.5 h-3.5" aria-hidden />
                Before you start{safetyCount > 0 ? ` · ${safetyCount}` : ""}
              </span>

              {safetyCount === 0 ? (
                notesKnown ? (
                  <p className="br-safe__clear">Nothing flagged — clear to go.</p>
                ) : (
                  <p className="br-safe__clear br-safe__clear--unknown">
                    Notes not loaded yet — nothing is being claimed either way.
                  </p>
                )
              ) : (
                <div className="br-safe__body">
                  {litRegions.length > 0 && (
                    <div
                      className="br-safe__figs"
                      role="img"
                      aria-label={`The client's limits: ${litRegions.map(regionWords).join(", ")}`}
                      data-testid="briefing-figure"
                    >
                      {figureViews.map((view) => (
                        <figure key={view} className="br-safe__fig">
                          <div className="br-safe__fig-body" aria-hidden="true">
                            <BodyModel
                              gender={figureGender}
                              view={view}
                              areas={litRegions}
                              colors={SAFETY_LIT}
                              baseFill="var(--br-surface-3)"
                            />
                          </div>
                          <figcaption>{view === "front" ? "Front" : "Back"}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}

                  <div className="br-safe__list">
                    {/* Each clinical flag with what to do, said, not behind a
                        tap: the instruction was the part nobody opened. */}
                    {clientFlags.map((flag) => {
                      const rules = flag.protocolHandling || [];
                      const open = openFlagId === flag.id;
                      const shown = open ? rules : rules.slice(0, 2);
                      return (
                        <article
                          key={flag.id}
                          className="br-safe__limit"
                          data-severity={
                            flag.severity === "High Risk" || flag.severity === "Absolute Contraindication"
                              ? "high"
                              : "modify"
                          }
                        >
                          <h3 className="br-safe__title">{shortCondition(flag.conditionName)}</h3>
                          {shown.map((rule, i) => (
                            <p key={i} className="br-safe__do">
                              {(rule.affectedMachineIds || []).length > 0 ? (
                                <b>{namedMachines(rule.affectedMachineIds, machines).join(", ")}: </b>
                              ) : null}
                              {rule.instruction}
                              {rule.setupModification?.trim() ? ` — set-up: ${rule.setupModification.trim()}` : ""}
                            </p>
                          ))}
                          {rules.length > 2 && (
                            <button
                              type="button"
                              className="br__more"
                              aria-expanded={open}
                              onClick={() => setOpenFlagId(open ? null : flag.id)}
                            >
                              {open ? "Show fewer" : `${rules.length - 2} more`}
                            </button>
                          )}
                          <span className="br-safe__src">On the record · {flag.severity}</span>
                        </article>
                      );
                    })}

                    {/* Body regions carried over from the last session, while
                        their "matters until" day has not passed. */}
                    {carried.length > 0 && (
                      <div className="br__carried" data-testid="briefing-carried">
                        {carried.map((r) => (
                          <span key={r.region} className="br__carried-row" data-tone={r.tone}>
                            <strong>{r.region}</strong> · {r.word} · {r.untilLabel}
                            <span className="br__carried-from">last session</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Critical notes, as their threads. */}
                    {notes.critical.length > 0 && (
                      <div className="br__critical">
                        <CriticalStrip
                          entries={notes.critical.map((t) => t.root)}
                          machines={machines}
                          title="Critical"
                          footer={(e) => {
                            const thread = notes.critical.find((t) => t.id === e.id);
                            return thread ? <BriefingNoteFooter thread={thread} onDismiss={hush} /> : null;
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Nothing is hidden without a way back to it. */}
              {(notes.hidden > 0 || showHushed) && (
                <div className="br__hidden-line" data-testid="briefing-hushed">
                  <span>
                    {showHushed
                      ? "Showing what you said you already know."
                      : `${notes.hidden} ${notes.hidden === 1 ? "note" : "notes"} you said you already know.`}
                  </span>
                  <button type="button" onClick={() => setShowHushed((v) => !v)}>
                    {showHushed ? "Hide them again" : "Show them"}
                  </button>
                </div>
              )}

              {/* Her standing health context: what is simply true, one tap
                  away. AJ: "known, not news — openable when something looks
                  concerning". */}
              {standing.length > 0 && (
                <div className="br__standing" data-testid="briefing-standing">
                  <button
                    type="button"
                    className="br__more"
                    aria-expanded={showStanding}
                    onClick={() => setShowStanding((v) => !v)}
                  >
                    {showStanding ? "Hide" : "Show"} standing health context · {standing.length}
                  </button>
                  {!showStanding && <span className="br__standing-note">Known, not news.</span>}
                  {showStanding &&
                    standing.map((thread) => {
                      const latest = latestUpdateLine(thread);
                      return (
                        <div key={thread.id}>
                          <JournalEntryCard entry={thread.root} machines={machines} dense />
                          {latest ? <p className="br__standing-latest">Latest: {latest}</p> : null}
                        </div>
                      );
                    })}
                </div>
              )}
            </section>

            {/* 3. SINCE LAST TIME — what is different, in a few lines: how the
                last session went, notes since, time away and milestones, and
                what the team is working on with her. */}
            {sinceCount > 0 && (
              <section className="br-card br-since" aria-label="Since last time">
                <span className="br__label">
                  <History className="w-3.5 h-3.5" aria-hidden />
                  Since last time · {sinceCount}
                </span>

                {markers.length > 0 && (
                  <div className="br__markers">
                    {markers.map((m) => (
                      <span key={m.kind} className={cn("br__marker", `br__marker--${m.kind}`)}>
                        {m.label}
                      </span>
                    ))}
                  </div>
                )}

                {lastTime.length > 0 && (
                  <ul className="br-since__lines" data-testid="briefing-last-time">
                    {lastTime.map((line) => (
                      <li key={line.key} className="br-since__line" data-kind={line.kind}>
                        {line.text}
                      </li>
                    ))}
                  </ul>
                )}

                {notes.headsUp.length > 0 && (
                  <div className="br__headsup" data-testid="briefing-headsup">
                    <span className="br__label">Heads up</span>
                    {(showAllHeadsUp ? notes.headsUp : notes.headsUp.slice(0, 3)).map((thread) => (
                      <div key={thread.id}>
                        <JournalEntryCard entry={thread.root} machines={machines} dense />
                        <BriefingNoteFooter thread={thread} onDismiss={hush} />
                      </div>
                    ))}
                    {notes.headsUp.length > 3 && (
                      <button
                        type="button"
                        className="br__more"
                        onClick={() => setShowAllHeadsUp((v) => !v)}
                      >
                        {showAllHeadsUp ? "Show fewer" : `${notes.headsUp.length - 3} more`}
                      </button>
                    )}
                  </div>
                )}

                {activeJournalFocuses.map((f) => {
                  const visual = FOCUS_VISUALS[f.category] || FOCUS_VISUALS.Posture;
                  return (
                    <article key={f.id} className="br__focus br__focus--line">
                      <span aria-hidden className={cn("br__focus-edge", visual.edge)} />
                      <span className="br__label">
                        <Target className="w-3.5 h-3.5" />
                        {f.category} · {f.trainerInitials}
                        <span className="br__focus-when">{relativeDay(toDate(f.startedAt))}</span>
                      </span>
                      <p className="br__quote">
                        {f.intent}
                        {f.targetMachineId && (
                          <span className="br__focus-target">
                            {" "}· {machines.find((m) => m.id === f.targetMachineId)?.name || "Unknown machine"}
                          </span>
                        )}
                      </p>
                    </article>
                  );
                })}
              </section>
            )}

            {/* 4. Something to ask about. One quiet row; gone when there is
                nothing worth saying. FORD round, Sep 2026. */}
            <FordBriefingCue
              client={client ?? null}
              author={fordAuthor}
              studioId={client.homeStudioId || ""}
            />

            {/* 5. ON THE WAY IN — filled in walking to the first machine.
                AJ: "sometimes is everything, sometimes its one thing,
                sometimes its nothing maybe they came in extra early and you
                have time to hand them the pulse client view". */}
            <section className="br-card br__checkin" aria-label="On the way in">
              <div className="br__checkin-head">
                <h2 className="br-section__title">
                  <Activity className="w-4 h-4" />
                  On the way in
                  <span className="br__optional">Optional</span>
                </h2>
              </div>
              <div className="br-cap__chips" role="group" aria-label="What to fill in">
                <button
                  type="button"
                  className="br-cap__chip"
                  aria-pressed={drawer.dials}
                  onClick={() => toggleDrawer("dials")}
                >
                  <SlidersHorizontal className="w-4 h-4" aria-hidden />
                  Dials{tappedDials > 0 ? ` · ${tappedDials}` : ""}
                </button>
                <button
                  type="button"
                  className="br-cap__chip"
                  aria-pressed={drawer.sore}
                  onClick={() => toggleDrawer("sore")}
                >
                  <Crosshair className="w-4 h-4" aria-hidden />
                  Sore spot{bodyStates.length > 0 ? ` · ${bodyStates.length}` : ""}
                </button>
                <button
                  type="button"
                  className="br-cap__chip"
                  aria-pressed={drawer.note}
                  onClick={() => toggleDrawer("note")}
                >
                  <PenLine className="w-4 h-4" aria-hidden />
                  Note{adjustmentNote.trim() ? " · 1" : ""}
                </button>
                <button type="button" className="br-cap__chip" onClick={() => setShowPulse(true)}>
                  <HeartPulse className="w-4 h-4" aria-hidden />
                  Update Pulse
                </button>
                <button type="button" className="br-cap__chip" onClick={() => setHanding(true)}>
                  <Tablet className="w-4 h-4" aria-hidden />
                  Hand over the iPad
                </button>
              </div>

              {/* Sleep · Energy · Recovery · Stress. Untouched = not asked. */}
              {drawer.dials && (
                <div className="br__dials" data-testid="briefing-dials">
                  {READINESS_KEYS.map((key) => (
                    <div key={key} className="br__dial">
                      <Dial
                        scale={READINESS_SCALES[key]}
                        value={readiness[key] ?? null}
                        onChange={(v) =>
                          setReadiness((prev) => {
                            const next = { ...prev };
                            if (v === null) delete next[key];
                            else next[key] = v;
                            return next;
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Where it hurts: tap the figure, or pick a region; each is
                  then rated on the Dial with an optional "matters until". */}
              {drawer.sore && (
                <fieldset className="br__field br-cap__sore" data-testid="briefing-sore">
                  <legend className="br__label">Sore spot · tap where</legend>
                  <div className="br-cap__sore-fig">
                    <div className="br-cap__sides" role="group" aria-label="Side of the figure">
                      {(["front", "back"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={soreView === v}
                          onClick={() => setSoreView(v)}
                        >
                          {v === "front" ? "Front" : "Back"}
                        </button>
                      ))}
                    </div>
                    <div className="br-safe__fig-body br-cap__tap">
                      <BodyModel
                        gender={figureGender}
                        view={soreView}
                        areas={soreRegions}
                        colors={SORE_LIT}
                        baseFill="var(--br-surface-3)"
                        onRegionClick={tapSore}
                      />
                    </div>
                  </div>
                  <BodyStateTracker value={bodyStates} onChange={setBodyStates} request={soreRequest} />
                </fieldset>
              )}

              {drawer.note && (
                <fieldset className="br__field">
                  <legend className="br__label">Arrival note</legend>
                  <textarea
                    value={adjustmentNote}
                    onChange={(e) => setAdjustmentNote(e.target.value)}
                    placeholder="Anything they mentioned — how they slept, an ache, a trip coming up, a new diet, the grandkids are in town…"
                    className="br__textarea"
                  />
                  {adjustmentNote.trim() ? (
                    <div className="br__file-as" data-testid="arrival-file-as">
                      <span className="nc-kicker">File it as (optional)</span>
                      <NoteCategoryChips
                        value={arrivalCategory}
                        options={FILING_CATEGORIES}
                        label="File the arrival note as"
                        small
                        onChange={(c) => setArrivalCategory((prev) => (prev === c ? null : (c as FilingCategory)))}
                      />
                    </div>
                  ) : null}
                </fieldset>
              )}
            </section>

            {/* 6. TODAY'S ROUTINE — one line until it is opened (AJ: "One
                line, tap to edit"). A or B stays a tap, each saying when THAT
                routine last ran. A client with no routine gets how they
                start instead (the first-session design round, Oct 8 2026):
                the plan card, the line and door for a routine from before
                Journey, or both doors. */}
            <section className="br-card br-routine" aria-label="Today's routine">
              {planView === "starting" || planView === "kept" ? (
                <BriefingPlanCard
                  state={briefingPlan}
                  view={planView}
                  firstName={firstName}
                  nameOf={planNameOf}
                  floor={machines}
                  todayYmd={todayKey}
                  onBack={door ? () => setDoor(null) : undefined}
                  limits={
                    planTouching.length > 0 ? (
                      <p className="br-routine__touch" data-testid="briefing-plan-limits">
                        <ShieldAlert className="w-3.5 h-3.5" aria-hidden />
                        Mind the limits on {planTouching.join(", ")}
                      </p>
                    ) : null
                  }
                />
              ) : planView === "journey" ? (
                <BriefingJourneyLine
                  line={
                    // Before Journey when Journey says so, or the trainer picked "Trained here before".
                    coverage === "partial" || door === "journey"
                      ? `${sentenceName} has a routine from before Journey.`
                      : `${sentenceName} has no routine in Journey yet.`
                  }
                  onEnter={enterRoutine}
                  onBack={door ? () => setDoor(null) : undefined}
                />
              ) : planView === "doors" ? (
                <BriefingDoors firstName={firstName} says={startingKind.says} onPick={setDoor} />
              ) : (
              <>
              <div role="group" aria-label="Select today&rsquo;s routine" className="br__routines">
                {(["A", "B"] as const).map((type) => {
                  const routine = type === "A" ? routineA : routineB;
                  const lastRun = type === "A" ? lastRunA : lastRunB;
                  const active =
                    type === "A"
                      ? ["A", "Create_A"].includes(selectedRoutineType)
                      : ["B", "Create_B"].includes(selectedRoutineType);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handlePickRoutine(type)}
                      aria-pressed={active}
                      className="br__routine"
                    >
                      <span className="br__routine-name">Routine {type}</span>
                      <span className="br__routine-sub">
                        {routine
                          ? `${lastRunLabel(lastRun)} · ${routine.machineIds?.length || 0} machines`
                          : "Not set up yet · today only"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="br-routine__line"
                aria-expanded={routineOpen}
                onClick={() => setRoutineOpen((v) => !v)}
                data-testid="briefing-routine-line"
              >
                <span className="br-routine__what">
                  <b>Routine {routineLetter}</b>
                  {" · "}
                  {selectedRoutineIds.length} {selectedRoutineIds.length === 1 ? "machine" : "machines"}
                  {routinePickedByTrainer ? "" : " · suggested"}
                  {isAdjusting ? " · changed for today" : ""}
                </span>
                {codes.length > 0 && <span className="br-routine__codes">{codes.join(" · ")}</span>}
                {touching.length > 0 && (
                  <span className="br-routine__touch">
                    <ShieldAlert className="w-3.5 h-3.5" aria-hidden />
                    Mind the limits on {touching.join(", ")}
                  </span>
                )}
                <span className="br-routine__edit">
                  {routineOpen ? "Done" : "Edit"}
                  <ChevronDown className={cn("w-4 h-4", routineOpen && "rotate-180")} aria-hidden />
                </span>
              </button>
              {/* A plan in progress: the Road as the glance, today under
                  its bracket, the next stop, and how far along. */}
              {inProgress && routineA?.plan && (
                <div data-testid="briefing-plan-road">
                  <RoadStrip
                    groups={inProgress.groups}
                    nameOf={planNameOf}
                    label="Routine A's plan"
                    progressLine={progressLine(inProgress.progress, planNameOf, routineA.plan.dayOne)}
                    progress={inProgress.progress}
                  />
                </div>
              )}
              {routineOpen && (
                <div className="br__builder">
                  <RoutineBuilder
                    mode="briefing"
                    slot={
                      selectedRoutineType === "B" || selectedRoutineType === "Create_B"
                        ? "B"
                        : selectedRoutineType === "A" || selectedRoutineType === "Create_A"
                          ? "A"
                          : null
                    }
                    machineIds={selectedRoutineIds}
                    onChange={handleSequenceChange}
                    machines={machines}
                    client={client}
                    history={machineHistory}
                    counterpartMachineIds={counterpartIds}
                    counterpartLabel={
                      selectedRoutineType === "B" || selectedRoutineType === "Create_B"
                        ? "Routine A"
                        : "Routine B"
                    }
                    purposeText={purposeText}
                    /* Past the learning curve: six sessions, or trained
                       here before Journey; never while Routine A is being
                       built, nor when Journey can't tell. The routine
                       drawer asks the same rule (it was the intro-session
                       flag, which nothing set; §4.8). */
                    established={pastLearningCurve({
                      known: routinesKnown,
                      coverage,
                      journeySessions: sessionCount,
                      routineABeingBuilt: routineA?.plan?.building === true,
                    })}
                  />
                </div>
              )}
              </>
              )}
            </section>

            {/* 7. Also today — the admin lines, quiet, never in the safety
                band and never a gate on Start. */}
            {/* Always mounted: the renewal line decides for itself whether it
                has anything to say, and the footer hides when it is empty. */}
              <section className="br-also" aria-label="Also today">
                {inbodyLine && (
                  <p className="br__inbody" data-testid="briefing-inbody">
                    <Scale className="w-3.5 h-3.5" aria-hidden />
                    <span>{inbodyLine}</span>
                  </p>
                )}
                <BriefingRenewalLine client={client} />
              </section>

            {/* 8. One loud action, a solid bar pinned to the bottom of the
                page: nothing scrolls under it any more. */}
            <div className="br__cta-bar">
              {/* Journey Lite (Oct 1 2026): a phone may run a session, and
                  is told once, here, that it isn't the way. Never a gate. */}
              {isPhone && (
                <p className="br__phone-note" role="note">
                  Sessions are meant to be run on the iPad. On a phone you get the short version: the routine, the weights and the reps.
                </p>
              )}
              <button type="button" onClick={handleStart} className="br__cta">
                <Play className="w-5 h-5" fill="currentColor" aria-hidden />
                Start session
              </button>
            </div>
        </div>

      <PulseQuickLogDialog
        open={showPulse}
        onClose={() => setShowPulse(false)}
        client={client}
        trainer={authTrainer}
        machines={machines}
      />

      {/* Hand her the iPad: Pulse's own client mode, the same panel the
          codex hands over (PulseCard), mounted only while it is handed. */}
      {handing && (
        <div hidden>
          <ClientCheckInPanel
            client={client}
            trainer={authTrainer}
            machines={machines}
            startInClientMode
            onClientModeClose={() => setHanding(false)}
          />
        </div>
      )}
    </div>
  );
}
