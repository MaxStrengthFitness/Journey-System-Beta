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
  HeartPulse,
  Info,
  Lightbulb,
  Play,
  Target,
  X,
} from "lucide-react";
import { ConditionChip } from "../../components/ConditionChip";
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
import { renewalPromptDue } from "../renewals/conversation";
import { BriefingRenewalLine } from "../renewals/BriefingRenewalLine";
import { AppHeader } from "../../components/AppHeader";
import { useTheme } from "../../components/ThemeProvider";
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
import { JournalEntryCard } from "../../components/journal/JournalEntryCard";
import { FOCUS_VISUALS, relativeDay, toDate } from "../../types/journal";
import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";
import { safeToDate } from "../../lib/utils";
import { isPerformedLog } from "../../lib/set-outcome";
import { studioTodayKey } from "../../lib/studio-time";
import { auth } from "../../firebase";
import { Dial, READINESS_KEYS, READINESS_SCALES, compactReadiness, type Readiness } from "../rating";
import { carriedRegions, lastRunLabel, lastRunOfRoutine } from "./briefing-facts";
import "./briefing.css";

import { clientDisplayName } from "../../lib/client-name";

export interface BriefingScreenProps {
  authTrainer: Trainer | null;
  client: Client;
  targetRoutine: Routine | null;
  lastSession: WorkoutSession | null;
  onStart: (
    routineType: "A" | "B" | "Free",
    customMachines?: string[],
    note?: string,
    checkIn?: PreSessionCheckIn,
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
  logs?: ExerciseLog[];
  isIntroSession?: boolean;
  rightControls?: React.ReactNode;
  trainerDropdown?: React.ReactNode;
  onStudioClick?: () => void;
}

export function BriefingScreen({
  authTrainer,
  client,
  targetRoutine,
  lastSession,
  onStart,
  onClose,
  machines,
  routines,
  trainers = [],
  sessions = [],
  logs = [],
  isIntroSession = false,
  rightControls,
  trainerDropdown,
  onStudioClick,
}: BriefingScreenProps) {
  // The header follows the app theme now that the page below it does.
  // Mirrors AppContent's own call so the two can never disagree.
  const { theme } = useTheme();

  const [selectedRoutineType, setSelectedRoutineType] = useState<
    "A" | "B" | "Free" | "Create_A" | "Create_B"
  >("A");
  const [adjustedMachineIds, setAdjustedMachineIds] = useState<string[]>([]);
  const [adjustmentNote, setAdjustmentNote] = useState("");
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
      setAdjustedMachineIds(routineA?.machineIds || []);
    } else {
      setSelectedRoutineType(routineB ? "B" : "Create_B");
      setAdjustedMachineIds(routineB?.machineIds || []);
    }
  };

  useEffect(() => {
    if (isIntroSession) {
      const demoRoutine = routines.find((r) => r.name === "Demo Routine");
      if (
        demoRoutine &&
        demoRoutine.machineIds &&
        demoRoutine.machineIds.length > 0
      ) {
        setSelectedRoutineType(routineA ? "A" : "Create_A");
        setAdjustedMachineIds(demoRoutine.machineIds);
        setIsAdjusting(true);
        return;
      }
    }

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
      setAdjustedMachineIds(routineA?.machineIds || []);
    } else {
      setAdjustedMachineIds([]);
    }
  }, [targetRoutine, routineA, routineB, routinePickedByTrainer, isIntroSession, routines]);

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

  const handleStart = () => {
    const checkIn: PreSessionCheckIn = {};
    // Only the dials that were tapped; nothing when none were.
    const tapped = compactReadiness(readiness);
    if (tapped) checkIn.readiness = tapped;
    if (bodyStates.length > 0) checkIn.bodyStates = bodyStates;

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
    );
  };

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
      return routineA?.machineIds ?? null;
    return null;
  }, [selectedRoutineType, routineA, routineB]);

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
  /* Heads ups (reporting round): quieter than Critical, and only while they
     still matter — their "until" day, or three weeks. */
  const headsUpEntries = journal.headsUpEntries ?? [];

  const activeJournalFocuses = focuses.filter((f) => f.status === "active");

  /* Body regions the last session said still matter today ("keep the leg
     press out until Thursday"). Studio day, string compare. */
  const todayKey = studioTodayKey();
  const carried = useMemo(() => carriedRegions(lastSession, todayKey), [lastSession, todayKey]);

  /* Everything that belongs under "Before you start", counted once so the
     heading can say how many things there are. */
  const markers = useMemo(
    () => hubMarkers({ client, sessionNumber: (client.sessionCount || 0) + 1 }),
    [client],
  );
  const beforeCount =
    clientFlags.length +
    criticalEntries.length +
    headsUpEntries.length +
    carried.length +
    markers.length +
    activeJournalFocuses.length;
  const hasBefore = beforeCount > 0 || renewalPromptDue(client.renewal);

  /* When each routine last ran — a different date from the last session's. */
  const lastRunA = useMemo(() => lastRunOfRoutine(sessions, routines, "A"), [sessions, routines]);
  const lastRunB = useMemo(() => lastRunOfRoutine(sessions, routines, "B"), [sessions, routines]);

  /* The FORD capture writes as the signed-in person (the Auth uid — the rules
     pin authorId to it, and it differs from authTrainer.id on older accounts). */
  const uid = auth.currentUser?.uid ?? authTrainer?.id ?? null;
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
    : "Never";

  // Follows the trainer's selection, not the original suggestion — otherwise the
  // card keeps naming the auto-picked routine after they switch.

  const selectedRoutineIds =
    isAdjusting ||
    ["Free", "Create_A", "Create_B"].includes(selectedRoutineType)
      ? adjustedMachineIds
      : selectedRoutineType === "A"
        ? routineA?.machineIds || []
        : routineB?.machineIds || [];

  return (
    <div className="br">
        <AppHeader
          variant={theme === "light" ? "light" : "dark"}
          trainerInitials={authTrainer?.initials || "AJ"}
          rightControls={rightControls}
          trainerDropdown={trainerDropdown}
          onStudioClick={onStudioClick}
        />

        <div className="br__page">
            {/* 1. Who is in front of you, and what must not happen. */}
            <section className="br-card br__hero">
              <div className="br__hero-top">
                <div className="min-w-0">
                  <h1 className="br__name">
                    {clientDisplayName(client)}
                  </h1>
                  <p className="br__meta">
                    Last session · {lastSessionDate} · {lastRoutineName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
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

            {/* 1b. BEFORE YOU START (tracker round, Sep 2026). AJ's order:
                "at the very top, everything the trainer needs to know about
                that client is known instantly — critical notes, notes from
                previous sessions marked critical, upcoming events". One
                block, one heading, and when there is nothing it says so in
                one line instead of leaving the trainer to wonder. */}
            <section className={cn("br-card br__before", !hasBefore && "br__before--clear")} aria-label="Before you start">
              <span className="br__label br__before-head">
                <Info className="w-3.5 h-3.5" />
                Before you start{hasBefore ? ` · ${beforeCount}` : ""}
              </span>
              {!hasBefore && <p className="br__before-clear">Nothing flagged — clear to go.</p>}

              {clientFlags.length > 0 && (
                <div className="br__flags">
                  {clientFlags.map((cond, i) => (
                    <ConditionChip
                      key={i}
                      label={cond.conditionName || (cond as any).label}
                      severity={
                        cond.severity === "High Risk" ||
                        cond.severity === "Absolute Contraindication"
                          ? "critical"
                          : "standard"
                      }
                    />
                  ))}
                </div>
              )}

              {criticalEntries.length > 0 && (
                <div className="br__critical">
                  {criticalEntries.map((entry) => (
                    <JournalEntryCard
                      key={entry.id}
                      entry={entry}
                      machines={machines}
                      dense
                    />
                  ))}
                </div>
              )}

              {/* Heads ups: under the critical ones, and quieter. Reporting
                  round, Sep 2026. */}
              {headsUpEntries.length > 0 && (
                <div className="br__headsup" data-testid="briefing-headsup">
                  <span className="br__label">Heads up</span>
                  {headsUpEntries.map((entry) => (
                    <JournalEntryCard
                      key={entry.id}
                      entry={entry}
                      machines={machines}
                      dense
                    />
                  ))}
                </div>
              )}

              {/* Body regions carried over from the last session, while their
                  "matters until" day has not passed. One sentence-shaped row
                  each, coloured by urgency. */}
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

              {/* Upcoming events and milestones, the same markers the Hub card
                  shows (lib/hub-markers.ts): a break starting Saturday, surgery
                  on the 25th, a birthday, session 100. */}
              {markers.length > 0 && (
                <div className="br__markers">
                  {markers.map((m) => (
                    <span key={m.kind} className={cn("br__marker", `br__marker--${m.kind}`)}>
                      {m.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Renewals round (Sep 2026): only when there's something to know. */}
              <BriefingRenewalLine client={client} />

              {/* Active coaching focuses — one line each. */}
              {activeJournalFocuses.map((f) => {
                const visual =
                  FOCUS_VISUALS[f.category] || FOCUS_VISUALS.Posture;
                return (
                  <article key={f.id} className="br__focus br__focus--line">
                    <span
                      aria-hidden
                      className={cn("br__focus-edge", visual.edge)}
                    />
                    <span className="br__label">
                      <Target className="w-3.5 h-3.5" />
                      {f.category} · {f.trainerInitials}
                      <span className="br__focus-when">
                        {relativeDay(toDate(f.startedAt))}
                      </span>
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

            {/* 1b. Something to ask about. One quiet row, below the critical
                strip on purpose — a personal detail must never compete with a
                contraindication for the eye. Renders nothing when there is
                nothing worth saying. FORD round, Sep 2026. */}
            <FordBriefingCue
              client={client ?? null}
              author={fordAuthor}
              studioId={client.homeStudioId || ""}
            />

            {/* 2. Routine. The alternation logic proposes one; the trainer
                can override it before starting. */}
            <section className="br-section">
              <header className="br-section__head">
                <h2 className="br-section__title">Today&rsquo;s routine</h2>
                <span className="br-section__hint">
                  {routinePickedByTrainer
                    ? "Manually selected"
                    : `Suggested: Routine ${suggestedType}`}
                </span>
              </header>
              <div
                role="group"
                aria-label="Select today&rsquo;s routine"
                className="br__routines"
              >
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
                          : "Not set up - tap to build"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* The "scheduled vs last performed" pair is gone (audit, Sep 13):
                the hero says when the last session was and which routine it
                ran, and each sequence row carries its own "last time". */}

            {/* 4. Execution sequence — the shared Routine Builder.

                Previously this section had its own drag implementation, its
                own flat "add machine" list behind an Edit routine / Done
                editing toggle, and no rule checking at all: the pre-session
                briefing was the one place a trainer could commit a routine
                that put two pulling movements back to back without being
                told. It is also the place a B routine is most often created,
                which is exactly where the twice-weekly analysis belongs. */}
            <section className="br-section br__seq">
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
                  established={!isIntroSession}
                />
              </div>
            </section>

            {/* 5. How they turned up today. Optional, and the last stop
                before START. Four Dials against this client's usual, the
                body regions, the arrival note. Reporting round, Sep 2026. */}
            <section className="br-card br__checkin">
              <div className="br__checkin-head">
                <h2 className="br-section__title">
                  <Activity className="w-4 h-4" />
                  On the way in
                  <span className="br__optional">Optional</span>
                </h2>
                {/* The Pulse — the living assessment — one area at a time,
                    saved as you tap, without leaving the briefing. */}
                <button
                  type="button"
                  onClick={() => setShowPulse(true)}
                  className="br__link-btn"
                >
                  <HeartPulse className="w-3.5 h-3.5" aria-hidden /> Update Pulse
                </button>
              </div>

              {/* Sleep · Energy · Recovery · Stress. Untouched = not asked. */}
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

              {/* Where it hurts, and how — the same Dial per region, with an
                  optional "matters until" day the briefing honours next time. */}
              <fieldset className="br__field">
                <legend className="br__label">Body regions</legend>
                <BodyStateTracker
                  value={bodyStates}
                  onChange={setBodyStates}
                />
              </fieldset>

              <fieldset className="br__field">
                <legend className="br__label">Arrival note</legend>
                <textarea
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  placeholder="Anything they mentioned — how they slept, an ache, a trip coming up, a new diet, the grandkids are in town…"
                  className="br__textarea"
                />
              </fieldset>
            </section>
            {/* 6. One loud action, sticky to the bottom of the page rather
                than a fixed footer that has to know the nav bar's height. */}
            <div className="br__cta-bar">
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
    </div>
  );
}
