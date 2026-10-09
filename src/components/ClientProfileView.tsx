import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { LoadingMark } from "./LoadingMark";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  deleteDoc,
  startAfter,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { studioHour, formatStudioTime, studioTodayKey, studioDayKeyOf } from "../lib/studio-time";
import { beforeJourneyGuess, sessionTotalOf } from "../lib/session-total";
import { useClientLateCancels } from "../features/admin/attention/booking-marks";
import { sessionDayKey } from "../features/client-history/model";
import {
  PRIOR_SOURCES,
  PRIOR_SOURCE_LABEL,
  priorHistoryOf,
  priorUncounted,
  statePriorHistory,
  totalSessions,
  type PriorHistorySource,
} from "../lib/prior-history";
import {
  Trash2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { motion } from "motion/react";
import { MachineMenu } from "../features/machine-menu/MachineMenu";
import type { MachineMenuHost } from "../features/machine-menu/useMachineMenuData";
import { authorFromTrainer } from "../features/equipment/author";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuickNoteDialog } from "../features/client-notes/QuickNoteDialog";
import { Textarea } from "@/components/ui/textarea";
import { getCompletedSessionCount } from "../lib/session-count-cache";
import { isEstablishedClient, ownedWindow } from "../lib/history-claims";
import { progressReportDue } from "../features/client-profile/cpr-timing";
import { earliestKnownDate } from "../lib/client-since";
import {
  ClinicalHistoryTab,
  PROFILE_TABS,
  ProgrammingTab,
  defaultProgrammingView,
  useProfileNav,
} from "../features/client-profile";
import { answerFor, type ClientAnswer } from "../features/client-profile/client-answer";
import {
  inProgressLeft,
  mergeHistoryLogs,
  mergeHistoryPage,
  shouldReadHistory,
  HISTORY_STALE_MS,
} from "../features/client-profile/history-freshness";
import { completedNewestFirst, nextRoutine } from "../features/routines/next-routine";
import { useProgressReports } from "../features/client-profile/useProgressReports";
import {
  ClientCodex,
  sessionTotalsOf,
  type CodexHosts,
  type CodexProgramming,
} from "../features/client-codex";
import { canQuoteSessionNumber, coverageOfClient, homeCutoverOf } from "../lib/client-coverage";
import { ExemptFromLeaveScope, UnsavedChangesScope, useLeaveScope } from "../features/unsaved-changes";
import {
  Client,
  Machine,
  WorkoutSession,
  ExerciseLog,
  Routine,
  RoutineAdjustment,
  View,
  ClientMachineSetting,
  Trainer,
  ScheduleEntry,
  ProgressReport,
  Studio,
} from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { useToast } from "../contexts/ToastContext";
import { runMasterSync } from "../lib/mindbody-master-sync";
import { mindbodyIdOf } from "../lib/mindbody-id";
import { masterSyncLabel } from "../features/client-profile/sync-label";
import { stillBooked } from "../features/client-profile/next-session-tile";
import { StaleSessionNotice } from "../features/client-profile/StaleSessionNotice";
import {
  forgetLiveSession,
  isAnotherTrainersSession,
  myTrainerIds,
  rememberLiveSession,
  staleSessionStartedLine,
} from "../lib/live-session";
import { StrongConfirmationModal } from "./StrongConfirmationModal";

import {
  cn,
  parseSessionDate,
  orderMachineSettings,
} from "../lib/utils";
import { useActiveSessionCheck } from "../hooks/useActiveSessionCheck";
import { useStudioMachines } from "../hooks/useStudioMachines";
import { floorWithHistoryMachines, studioFloorOf } from "../lib/floor-machines";
import { resolveMachineOrder } from "../data/machine-display-order";
import {
  RecentJourneyView,
  toJourneyRows,
  toJourneySessions,
} from "../features/journey-grid";
import { EditRoutineDrawer } from "./EditRoutineDrawer";
import { isProvisionalNewClient, startingKindOf } from "../features/routine-plan/client-kind";
import { openHealthWords, planIntakeText } from "../features/routine-plan/intake";
import { savedRoutineB, type PlanHost } from "../features/routine-plan/ui/host";
import { usePlanActions } from "../features/routine-plan/ui/usePlanActions";
import { ProfilePlanB } from "../features/routine-plan/ui/ProfilePlanB";
import { useBSwitch } from "../features/routine-plan/ui/useBSwitch";
import { useUnsavedChanges } from "../features/unsaved-changes";
import {
  ProfileHeader,
  canEditPriorHistory,
  confirmGuessStatement,
  draftFromPrior,
  priorHistoryDoorText,
  readPriorHistoryDraft,
  recordedByLine,
  resolvePackage,
  statementChangesRecord,
  useTopTrainer,
} from "../features/client-profile";
import { isOnRoster, useKaizenRoster } from "../features/trainer-profile";
import {
  RenewalCardDialog,
  SITUATION_TONE,
  chipText,
  renewalOf,
  renewalPromptDue,
} from "../features/renewals";
import { useRenewalSettings } from "../features/renewals/useRenewalSettings";
import { buildPackageNameIndex } from "../features/renewals/settings";
import { sessionsSplit } from "../features/client-admin/account";
import { recordStudioIdOf } from "../features/client-codex/access";
import { machineNoteLoudness } from "../features/equipment/machine-notes";
import { useMachineJournalRead } from "../features/equipment/useMachineJournal";
import { isSuperAdminRole } from "../features/admin/franchise/scope";

/** Sessions per Firestore page for the profile's history (see the Journey tab). */
/* Fifty at a time (audit, Sep 13): "Older really needs to show us their
   full history, but loading everything for a 100-session client is a lot —
   load fifty at a time." */
const SESSION_PAGE = 50;

export function ClientProfileView({
  clientId,
  isLoadingClient = false,
  clients,
  machines,
  authTrainer,
  trainers,
  onSelectReport,
  onNewReport,
  setView,
  setSelectedClientId,
  hasQuotaError,
  user,
  studios,
  activeStudioId,
}: {
  clientId: string | null;
  /** True while the selected client document is still being fetched. */
  isLoadingClient?: boolean;
  clients: Client[];
  machines: Machine[];
  authTrainer?: Trainer | null;
  trainers: Trainer[];
  onSelectReport: (id: string) => void;
  /** Start a NEW progress report for this client — never reopen the last one. */
  onNewReport: () => void;
  setView: (v: View) => void;
  setSelectedClientId: (id: string | null) => void;
  hasQuotaError?: boolean;
  user?: any;
  studios?: Studio[];
  activeStudioId: string | null;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [reportToDelete, setReportToDelete] = useState<ProgressReport | null>(
    null,
  );
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [allLogs, setAllLogs] = useState<ExerciseLog[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  // The newest sessions array, for a read that must know what it is replacing.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const [clientSettings, setClientSettings] = useState<
    Record<string, ClientMachineSetting>
  >({});
  // Whether the two reads above answered for THIS client. Body & Pulse's
  // floor says "no machines in her routines" only once both did; a failed
  // read is unknown, never empty.
  const [routinesStatus, setRoutinesStatus] = useState<
    "loading" | "ready" | "failed"
  >("loading");
  const [settingsStatus, setSettingsStatus] = useState<
    "loading" | "ready" | "failed"
  >("loading");
  // Moves when a plan write was refused, so the routines are read again and
  // Programming shows what was saved (routine-plan/ui/usePlanActions).
  const [routinesReadNonce, setRoutinesReadNonce] = useState(0);
  /*
   * KAIZEN ROSTER.
   *
   * `authTrainer` is captured at sign-in and never re-read, so it does not
   * see our own write. The roster lives on the trainer document that
   * `useTrainers` streams, so resolving against `trainers` is what makes the
   * toggle flip the moment Firestore acknowledges the change.
   */
  const liveAuthTrainer = useMemo(
    () => trainers.find((t) => t.id === authTrainer?.id) ?? authTrainer ?? null,
    [trainers, authTrainer],
  );
  const {
    add: addToKaizen,
    remove: removeFromKaizen,
    saving: kaizenSaving,
  } = useKaizenRoster(liveAuthTrainer);

  const performReportDelete = async () => {
    if (!reportToDelete?.id) return;
    try {
      await deleteDoc(doc(db, "progressReports", reportToDelete.id));
      toastSuccess("Progress report deleted successfully.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "progressReports");
    } finally {
      setReportToDelete(null);
    }
  };

  const [scheduledSessions, setScheduledSessions] = useState<ScheduleEntry[]>(
    [],
  );
  const [isEditingSessionCount, setIsEditingSessionCount] = useState(false);
  const [sessionCountInput, setSessionCountInput] = useState("");
  const [priorSource, setPriorSource] = useState<PriorHistorySource>("filemaker");
  const [priorThrough, setPriorThrough] = useState("");
  const [priorNote, setPriorNote] = useState("");

  // Routines Redesign additions
  const [routineAdjustments, setRoutineAdjustments] = useState<
    RoutineAdjustment[]
  >([]);

  // Which routine the Edit Routine drawer is open against ("Routine A" /
  // "Routine B"), or null when closed. All the drawer's own state (machine
  // list, filters, reason, presets) now lives in EditRoutineDrawer.tsx.
  const [editRoutineTarget, setEditRoutineTarget] = useState<
    "Routine A" | "Routine B" | null
  >(null);

  // States for toggle B reason dialog
  const [isToggleReasonDialogOpen, setIsToggleReasonDialogOpen] =
    useState(false);
  const [pendingToggleBValue, setPendingToggleBValue] = useState<
    boolean | null
  >(null);
  const [toggleBReason, setToggleBReason] = useState<string>("");
  const [isSavingToggle, setIsSavingToggle] = useState(false);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [lastVisibleSession, setLastVisibleSession] = useState<any>(null);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  /* True from the first sessions query until its set logs are merged in,
     so the Journey grid can show the loading mark instead of empty cells
     (the sessions arrive a moment before their sets do). */
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  /* Whether the first page of sessions and their sets has been read for
     THIS client, or failed (machine menu, Oct 2026): before it, an empty
     history is "not read", never "nothing on this machine". "cache-only"
     when only this iPad's cache answered (getDocs offline answers from the
     cache instead of failing): drawn, but never taken for the whole record.
     And a request for that page from outside the two tabs that read it: the
     machine menu opened from Programming or Notes & Profile asks for it
     (`ensureHistory`). */
  const [historyRead, setHistoryRead] = useState<ClientAnswer<"ready" | "cache-only" | "failed"> | null>(null);
  const [historyWanted, setHistoryWanted] = useState<string | null>(null);
  // The last ask the fetch effect saw: the read's own clearing of it is not a new ask.
  const lastHistoryWanted = useRef<string | null>(null);
  /*
   * What Journey itself holds — completed sessions in Journey, before any
   * prior history — stamped with the client it was counted for (client
   * codex). Null until the count query answers for THIS client, so it can
   * say "not known yet". The header's total and the codex's numbers are
   * both worked out from this one read (`completedTotal` below,
   * `sessionTotalsOf` for the codex).
   */
  const [journeyCountRead, setJourneyCountRead] =
    useState<ClientAnswer<number> | null>(null);
  const journeyCompletedCount = answerFor(journeyCountRead, clientId);

  // Use the new soft lock handoff hook
  const { activeInProgressSession, staleInProgressSession, isCheckingActiveSession, inProgressFor } =
    useActiveSessionCheck(clientId);

  // Per-studio machine display order (Aug 2026): resolves a studio's own
  // custom Journey-grid ordering when it has one, falling back to the new
  // shared default sequence (data/machine-display-order.ts), and then to
  // any legacy machine.order value. This is a flat display-order concern
  // only — separate from the kinematic MOVEMENT_PATTERN_ORDER grouping
  // used by the Edit Routine drawer and Catalog, which is untouched here.
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
  const { machines: studioFloor, byId: studioFloorById } = useStudioMachines(activeStudioId);
  // The studio's floor for the codex's Watch-outs: its own machines and their
  // lineage, which the app-wide `machines` list has neither of.
  const codexFloor = useMemo(() => studioFloorOf(studioFloor, machines ?? []), [studioFloor, machines]);
  // The machine window opens any machine the grid lists: the floor's own
  // version first (its name and dials), then every other machine by id.
  const machineWindowMachines = useMemo(
    () => floorWithHistoryMachines(codexFloor, machines ?? [], (machines ?? []).map((m) => m.id ?? "")),
    [codexFloor, machines],
  );

  // Discard Session (round: In-Progress dropdown) — lets a trainer scrap
  // someone else's abandoned/stuck in-progress session right from the
  // profile, without having to take it over first. Mirrors the exact
  // deletion sequence WorkoutTrackerView's own "Scrap Session" flow uses
  // (logs, then notes, then the session doc itself) so a discarded session
  // leaves nothing orphaned behind.
  //
  // Sep 24 2026: Discard takes the session it was opened for — the live one
  // from the "In progress" menu, or an abandoned one from the unfinished-
  // session notice under the header. Before, it could only reach a live
  // session, and an abandoned one could not be reached from anywhere.
  const [discardTarget, setDiscardTarget] = useState<WorkoutSession | null>(null);
  const [isDiscardingActiveSession, setIsDiscardingActiveSession] =
    useState(false);

  const handleDiscardActiveSession = async () => {
    if (!discardTarget?.id) return;
    setIsDiscardingActiveSession(true);
    try {
      const sessionId = discardTarget.id;
      const logsQ = query(
        collection(db, "exerciseLogs"),
        where("sessionId", "==", sessionId),
      );
      const logsSnap = await getDocs(logsQ);
      for (const logDoc of logsSnap.docs) {
        await deleteDoc(logDoc.ref);
      }
      const notesQ = query(
        collection(db, "sessionNotes"),
        where("sessionId", "==", sessionId),
      );
      const notesSnap = await getDocs(notesQ);
      for (const noteDoc of notesSnap.docs) {
        await deleteDoc(noteDoc.ref);
      }
      await deleteDoc(doc(db, "sessions", sessionId));

      forgetLiveSession(sessionId);

      toastSuccess("Session discarded.");
      setDiscardTarget(null);
    } catch (err) {
      console.error("Error discarding active session:", err);
      toastError("Couldn't discard that session. Try again.");
    } finally {
      setIsDiscardingActiveSession(false);
    }
  };

  const client = clients.find((c) => c.id === clientId);

  /* Which routine the next session runs: the running session's own, else the
     Active Session's alternation (features/routines/next-routine.ts). "Use
     today" set a choice the session never read, so the card could say A while
     the session ran B; it went (AJ, Sep 26 2026: "Used last on" instead). */
  const selectedRoutineTodayId = useMemo(() => {
    if (activeInProgressSession?.routineId) return activeInProgressSession.routineId;
    const last = completedNewestFirst(sessions)[0];
    return nextRoutine(routines, last?.routineId, !!client?.isRoutineBActive)?.id ?? null;
  }, [activeInProgressSession?.routineId, sessions, routines, client?.isRoutineBActive]);

  // Master Sync (client-profile audit, Sep 2026): the ONE place a trainer
  // refreshes a client from Mindbody. The write lands on the client document,
  // and the profile's client stream brings it back to every card.
  const [masterSyncing, setMasterSyncing] = useState(false);
  const handleMasterSync = async () => {
    if (!client || masterSyncing) return;
    setMasterSyncing(true);
    try {
      const res = await runMasterSync({ client, studios: studios || [] });
      if (res.status === "ok") toastSuccess(res.message);
      else toastError(res.message);
    } catch (err) {
      console.error("[master sync]", err);
      toastError("Couldn't reach Mindbody just now — nothing was changed. Try again in a minute.");
    } finally {
      setMasterSyncing(false);
    }
  };

  // Renewals round (Sep 2026): the package tile opens the Renewal card.
  const [renewalOpen, setRenewalOpen] = useState(false);
  // Her renewal with her auto-renewal mark applied (auto-renew.ts): an
  // untick on the package card drops the chip's prompt and dot at once.
  const renewalNow = useMemo(() => renewalOf(client), [client]);
  const machineNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of machines ?? []) if (m.id && m.name) map[m.id] = m.name;
    return map;
  }, [machines]);

  /**
   * A PRIMITIVE summary of the loaded sessions, not the array itself.
   *
   * The count effect below used to depend on `sessions`, and the profile's
   * snapshot listener rebuilds that array on every Firestore write (it maps
   * into a fresh array each time). During a bulk schedule sync that meant one
   * aggregation query per snapshot — the 429 storm. Depending on a number
   * instead means re-renders that did not actually change the session history
   * cost nothing.
   */
  const loadedCompletedCount = useMemo(
    () => sessions.filter((s) => s.status === "Completed").length,
    [sessions],
  );

  /**
   * Read through a ref so the reconciliation write does not feed itself.
   * `client.sessionCount` was previously a dependency, so the write below
   * changed the client document, which changed the prop, which re-ran the
   * effect, which queried again.
   */
  /*
   * What this client did before Journey — FileMaker, paper, another studio's
   * records. The studios are mid-migration and most long-standing clients have
   * one; see docs/business/migration-and-prior-history.md.
   */
  const priorHistory = useMemo(() => priorHistoryOf(client), [client]);
  /* A primitive, so the reconciler's deps are stable across snapshot churn. */
  const priorOffset = priorUncounted(priorHistory);

  /*
   * How much of this client's story Journey actually holds.
   *
   * The studio's `journeyCutoverDate` is the day IT moved onto Journey — the
   * rollout is staggered, so it is per studio. A client whose first session
   * here predates it was training before Journey existed, and machine-level
   * history is not coming across from FileMaker: the app therefore says
   * "nothing recorded" about a machine rather than "never attempted", and
   * quotes no lifetime figure. Unset cutover means unknown, which reads the
   * same cautious way. docs/business/migration-and-prior-history.md.
   *
   * Client codex (Sep 2026): through `coverageOfClient`, the one answer every
   * floor screen already uses, and with the CLIENT'S HOME studio's cutover —
   * not the studio this iPad is at. It also counts Mindbody's own visit
   * number, so a long-standing client nobody has written a prior record for
   * reads "partial" rather than "unknown". One value, handed to Programming
   * and to every page of Notes & Profile. The home is `homeCutoverOf`'s:
   * `homeStudioId`, else the older `studioId` (leniently, also when the home
   * is null - right for a cutover; who may EDIT the record reads the home as
   * the update rule does, `ruleStudioIdOf`, in `codexAccess`).
   *
   * The floor screens use the same home cutover since the prior-history
   * sweep (the Active Session, the Clients list and the progress report go
   * through `homeCutoverOf`, which is this reading), so for a cross-train
   * client every screen words coverage the same way.
   */
  const journeyCutover = homeCutoverOf(studios, client);
  const clientCoverage = useMemo(
    () => coverageOfClient(client, journeyCutover),
    [client, journeyCutover],
  );
  /* "#N" only through the Hub card's gate (lib/client-coverage.ts). */
  const canQuoteNumber = canQuoteSessionNumber(client, clientCoverage);

  const clientSessionCountRef = useRef<number | undefined>(client?.sessionCount);
  useEffect(() => {
    clientSessionCountRef.current = client?.sessionCount;
  }, [client?.sessionCount]);

  /*
   * THE TOTAL THE HEADER AND THE GRID NUMBER FROM (Sep 24 2026).
   * A count that started at 0 and kept the last client's total, and never
   * landed at all when the count query failed, had a client of four hundred
   * sessions read "Completed sessions 0" and the grid number her loaded page
   * #7 down to #1. So: from the ONE stamped read the codex uses too
   * (`journeyCompletedCount`, plus the prior record's uncounted part - the
   * one arithmetic rule); until THIS client has been counted, the stored
   * total stands in, and with neither the header says it does not know.
   * Unknown is never zero. (The landing, Sep 24: this was a second stamped
   * copy of the same count, which could disagree with the codex while it
   * loaded.)
   */
  const completedTotal: number | null =
    totalSessions(journeyCompletedCount, priorHistory) ?? client?.sessionCount ?? null;

  /*
   * HER TOTAL, AND HOW SURE IT IS (Atlas answers, Oct 2 2026). Sessions
   * before Journey + Journey's: confirmed (a prior record), whole (Journey
   * holds her story), or — until a trainer confirms it on Account —
   * Mindbody's guess, which the header shows as her total with the words
   * "from Mindbody, not yet confirmed" under it (lib/session-total.ts).
   * `completedTotal` is what the reconciler counts, so the guess is added on
   * top of it here and is never written into `sessionCount`.
   */
  const sessionTotals = useMemo(
    () => (client ? sessionTotalOf({ ...client, sessionCount: completedTotal }, clientCoverage) : null),
    [client, completedTotal, clientCoverage],
  );
  const mindbodyGuess = sessionTotals ? beforeJourneyGuess(sessionTotals) : null;

  /*
   * LATE CANCELS, BESIDE THE VISITS (Atlas answers, Oct 2 2026): "40
   * sessions · 2 late cancels". Her marks at her home studio, one listener;
   * a mark on a day Journey holds a completed session for is not counted (a
   * logged session beats a mark, lib/booking-state). Unknown (loading, or a
   * read the rules refuse) says nothing, never "none".
   */
  const lateCancelRead = useClientLateCancels(recordStudioIdOf(client), clientId);
  const lateCancels = useMemo(() => {
    if (!lateCancelRead.rows) return null;
    const logged = new Set(sessions.filter((s) => s.status === "Completed").map((s) => sessionDayKey(s as never)).filter(Boolean));
    return lateCancelRead.rows.filter((r) => !r.day || !logged.has(r.day)).length;
  }, [lateCancelRead.rows, sessions]);
  const headerTotal = sessionTotals?.basis === "mindbody" ? sessionTotals.total : completedTotal;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    (async () => {
      // Cached + de-duplicated + quota-aware; see lib/session-count-cache.ts.
      const journeyCount = await getCompletedSessionCount(clientId);
      // null means "could not determine right now" — never treat that as zero.
      if (cancelled || journeyCount === null) return;
      setJourneyCountRead({ clientId, value: journeyCount });

      /*
       * THE ONE ARITHMETIC RULE: what Journey can see, plus the part of the
       * prior history that exists only as a number. The reconciler owns the
       * first half and the prior record owns the second, so the trainer's
       * edit and this query can no longer overwrite each other — which they
       * did, silently, every time the profile opened.
       */
      const total = totalSessions(journeyCount, priorHistory);
      if (total === null) return;

      if (clientSessionCountRef.current !== total) {
        clientSessionCountRef.current = total;
        updateDoc(doc(db, "clients", clientId), {
          sessionCount: total,
        }).catch(console.error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // priorOffset, not priorHistory: a stable primitive across snapshot churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, loadedCompletedCount, priorOffset]);

  useEffect(() => {
    const handleOpenImport = () => setView("chart-importer" as any);
    window.addEventListener("open-bulk-import", handleOpenImport);
    return () =>
      window.removeEventListener("open-bulk-import", handleOpenImport);
  }, []);

  /*
   * FOUR TABS (Sep 2026). Seven became six in the FORD merge and six become
   * four here — Journey, Programming, Notes & Profile, Activity Archive. The
   * old single `activeTab` string cannot express the new shape, because two
   * of the four carry segments of their own, so where the trainer is now
   * lives in one reducer: see features/client-profile/profile-nav.ts. A client
   * always opens on Journey, unless another screen hands off a location once
   * (openProfileAt / takeStoredLocation: the Hub's Past sessions, Relay's
   * Pulse and InBody tasks, Back to Reports, Operations -> Machine fit).
   * Inside the profile the reducer remembers Programming's segment
   * (lastProgramming), which is why walking to the Journey grid and back
   * lands on the routine you were reading rather than resetting to A.
   *
   * UNSAVED CHANGES (Sep 24 2026): the tabs unmount when hidden, so a tab
   * change asks first about the typing inside them — the record's Save bar,
   * Setup's drafts, an open Edit Routine drawer. `tabsScope` wraps the tabs
   * below; nothing outside it (the header, the machine window) is asked
   * about, because a tab change does not touch it.
   */
  const tabsScope = useLeaveScope();
  const nav = useProfileNav(clientId, {
    guard: tabsScope.guard,
    programmingDefault: defaultProgrammingView({
      todayRoutine:
        selectedRoutineTodayId && routines.find((r) => r.id === selectedRoutineTodayId)?.name?.includes("B")
          ? "Routine B"
          : selectedRoutineTodayId
            ? "Routine A"
            : null,
      countA: routines.find((r) => r.name === "Routine A")?.machineIds?.length ?? 0,
      countB: routines.find((r) => r.name === "Routine B")?.machineIds?.length ?? 0,
      isBActive: !!client?.isRoutineBActive,
    }),
  });
  const activeTab = nav.tab;

  /*
   * NOTES & PROFILE STAYS MOUNTED after its first visit (client codex, Sep
   * 2026) — the All Machines, Setup and Deep Dive precedent. Returning to the tab
   * re-reads nothing, and an unsaved edit survives a trip to Journey (the
   * codex's Save bar says where it is). Stamped with the client, so another
   * client's profile starts unmounted again. Worked out during render, so the
   * panel never paints one frame empty on the first visit.
   */
  const [recordMountedFor, setRecordMountedFor] = useState<string | null>(null);
  if (activeTab === "record" && clientId && recordMountedFor !== clientId) {
    setRecordMountedFor(clientId);
  }
  const recordMounted = !!clientId && recordMountedFor === clientId;

  /*
   * The progress reports: the banner's newest one, the Activity Archive's
   * shelf and the codex's Pulse history all read this ONE listener. It runs
   * while a tab that shows them is open — and, since the record panel stays
   * mounted, for as long as the record has been opened on this client. See
   * features/client-profile/useProgressReports.ts.
   */
  const { reports: progressReports, status: progressReportsStatus } = useProgressReports({
    clientId,
    enabled: activeTab === "clinical" || activeTab === "record" || recordMounted,
    quotaBlocked: hasQuotaError,
    uid: user?.uid ?? null,
  });

  /* ------------------------------------------------------------------ *
   * HEADER FACTS (Sep 2026 redesign)
   *
   * Top Trainer reads the persisted tally on the client document instead of
   * counting whoever coached the ten sessions this view happens to have
   * loaded — which was wrong for every client with more than ten sessions.
   * The package/remaining figure trusts Mindbody first (membership pull vs
   * booking pass snapshot, whichever is fresher) and falls back to the
   * app's own `remainingSessions`. Both are pure functions with tests in
   * src/features/client-profile/.
   * ------------------------------------------------------------------ */
  const topTrainer = useTopTrainer(client, trainers, sessions, {
    enabled: !hasQuotaError,
  });
  const clientPackage = useMemo(
    () => resolvePackage(client, scheduledSessions),
    [client, scheduledSessions],
  );

  /*
   * LEFT IN THE CONTRACT, AND EXTRA (AJ, Sep 26 2026: "a left in contract and
   * then extra sessions works"). Worked out ONCE, from her Mindbody pricing
   * options and her home studio's package table (My Studio → Studio →
   * Renewals), and handed to the header and to Account — which used to say
   * "36 LEFT · PIF" and "48 on hand" about the same client. Null until the
   * table has answered, and after a read that failed: the header keeps its
   * Mindbody pill and Account its on-hand total rather than guess.
   */
  const renewalSettings = useRenewalSettings(recordStudioIdOf(client));
  const splitOfSessions = useMemo(() => {
    if (!client || renewalSettings.loading || renewalSettings.error) return null;
    if (renewalSettings.forStudioId !== recordStudioIdOf(client)) return null;
    return sessionsSplit(client, buildPackageNameIndex(renewalSettings.settings));
  }, [client, renewalSettings.loading, renewalSettings.error, renewalSettings.forStudioId, renewalSettings.settings]);

  /** The machine open in the one machine window (Journey grid, Routine A / B rows). */
  const [machineWindowId, setMachineWindowId] = useState<string | null>(null);

  /*
   * SESSIONS BEFORE JOURNEY (Sep 24 2026). The door is on Notes & Profile →
   * Account, and only there since Sep 26 (AJ: "take this off the header of
   * the profile, leave it in the profile section"); the header keeps the
   * count as plain words. Anyone the clients/{id} update rule lets write
   * this client edits, anyone else reads.
   * features/client-profile/prior-history-door.ts.
   */
  const canEditPrior = canEditPriorHistory(liveAuthTrainer, client);
  const priorDoorText = priorHistoryDoorText(priorHistory, canEditPrior, mindbodyGuess);
  const priorReading = readPriorHistoryDraft(
    { sessions: sessionCountInput, source: priorSource, through: priorThrough, note: priorNote },
    studioTodayKey(),
  );
  const priorCanSave =
    canEditPrior && priorReading.ok && statementChangesRecord(priorReading.statement, priorHistory);

  /**
   * Opening the dialog seeds it from whatever is on the client, so an edit is
   * a correction rather than a re-entry.
   */
  const openSessionCountEditor = (open: boolean) => {
    if (open) {
      const draft = draftFromPrior(priorHistory, studioTodayKey(), mindbodyGuess);
      setSessionCountInput(draft.sessions);
      setPriorSource(draft.source);
      setPriorThrough(draft.through);
      setPriorNote(draft.note);
    }
    setIsEditingSessionCount(open);
  };

  /*
   * The door, worked out once and handed to the one place that draws it: the
   * client codex's Account page (landing, Sep 24 2026; off the header's
   * Completed sessions tile since Sep 26). Opening reads the record at the moment of the
   * tap (through the ref), so a door handed down in a memo never seeds the
   * editor from an older snapshot.
   */
  const openPriorEditor = useRef(openSessionCountEditor);
  openPriorEditor.current = openSessionCountEditor;
  /*
   * CONFIRM (Atlas answers, Oct 2 2026): one tap writes Mindbody's guess as
   * the record — who and when, as every prior record is stamped — and the
   * total stops being a guess everywhere. Read through a ref at the tap, like
   * the editor, so a door handed down in a memo never writes an older guess.
   */
  const [confirmingGuess, setConfirmingGuess] = useState(false);
  const confirmGuess = async () => {
    if (!clientId || !canEditPrior || priorHistory || mindbodyGuess === null) return;
    setConfirmingGuess(true);
    try {
      const firstDay = client?.firstSessionDate ? studioDayKeyOf(client.firstSessionDate as never) : null;
      await updateDoc(doc(db, "clients", clientId), {
        priorHistory: {
          ...statePriorHistory(null, confirmGuessStatement(mindbodyGuess, firstDay, studioTodayKey()), {
            id: authTrainer?.id,
            name: authTrainer?.fullName,
          }),
          recordedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    } finally {
      setConfirmingGuess(false);
    }
  };
  const confirmGuessRef = useRef(confirmGuess);
  confirmGuessRef.current = confirmGuess;
  const canConfirmGuess = canEditPrior && !priorHistory && mindbodyGuess !== null;
  const priorHistoryDoor = useMemo(
    () =>
      priorDoorText
        ? {
            text: priorDoorText,
            canEdit: canEditPrior,
            onOpen: () => openPriorEditor.current(true),
            ...(canConfirmGuess ? { onConfirm: () => void confirmGuessRef.current(), confirming: confirmingGuess } : {}),
          }
        : null,
    [priorDoorText, canEditPrior, canConfirmGuess, confirmingGuess],
  );

  /**
   * Writes the OFFSET, never the total.
   *
   * `sessionCount` belongs to the reconciler above; a number typed into it was
   * reverted the next time anyone opened this profile. What a trainer actually
   * knows is how many sessions happened before Journey — so that is what they
   * are asked for, and the app adds the two.
   *
   * `importedCount` is deliberately preserved: a historical import may already
   * have turned some of those sessions into real rows, and re-stating the
   * total must not un-count them. `statePriorHistory` (lib/prior-history.ts)
   * is that rule, with no `undefined` left in it.
   */
  const handleSaveSessionCount = async () => {
    if (!clientId || !priorCanSave || !priorReading.ok) return;

    try {
      await updateDoc(doc(db, "clients", clientId), {
        priorHistory: {
          ...statePriorHistory(priorHistory, priorReading.statement, {
            id: authTrainer?.id,
            name: authTrainer?.fullName,
          }),
          recordedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
      setIsEditingSessionCount(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    }
  };

  useEffect(() => {
    // Clear first. This view is not remounted between clients, and the fetch
    // below only ever WRITES on resolve — so between switching client and the
    // round-trip landing, the previous client's routines were still in state
    // and the Journey tab's A/B filters resolved against them.
    setRoutines([]);
    // Nothing read under a quota error: unknown, not "no routines".
    setRoutinesStatus(hasQuotaError ? "failed" : "loading");
    if (!clientId || hasQuotaError) return;
    // A slower read for the previous client must not land on this one.
    let cancelled = false;

    const fetchRoutines = async () => {
      try {
        const routinesQuery = query(
          collection(db, "routines"),
          where("clientId", "==", clientId),
        );
        const snap = await getDocs(routinesQuery);
        if (cancelled) return;
        const routinesData = snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Routine,
        );
        setRoutines(routinesData);
        setRoutinesStatus("ready");
      } catch (error: any) {
        if (!cancelled) setRoutinesStatus("failed");
        handleFirestoreError(error, OperationType.GET, "routines");
      }
    };

    fetchRoutines();
    return () => {
      cancelled = true;
    };
  }, [clientId, hasQuotaError]);

  /*
   * Read the routines AGAIN after a plan write was refused
   * (routine-plan/ui/usePlanActions), so Programming shows what was saved.
   * Unlike a client switch it clears nothing: what is drawn stays drawn, and
   * "ready", until the fresh answer replaces it, so a refusal never blanks
   * the Lineup or leaves the Edit routine drawer without the real Routine A
   * (it would make a second one). A read that fails says "can't tell" and
   * keeps the list.
   */
  const routinesClientRef = useRef(clientId);
  routinesClientRef.current = clientId;
  useEffect(() => {
    const forClient = routinesClientRef.current;
    if (routinesReadNonce === 0 || !forClient || hasQuotaError) return;
    let cancelled = false;
    const landed = () => !cancelled && routinesClientRef.current === forClient;
    getDocs(query(collection(db, "routines"), where("clientId", "==", forClient)))
      .then((snap) => {
        if (!landed()) return;
        setRoutines(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Routine));
        setRoutinesStatus("ready");
      })
      .catch((error) => {
        if (!landed()) return;
        console.error("Error reading the routines again:", error);
        setRoutinesStatus("failed");
      });
    return () => {
      cancelled = true;
    };
    // Only a refusal reads again; a client switch is the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routinesReadNonce]);

  useEffect(() => {
    if (!clientId || hasQuotaError) return;

    const q = query(
      collection(db, "routineAdjustments"),
      where("clientId", "==", clientId),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const adjustments = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as RoutineAdjustment[];
        // Sort desc by createdAt, handling firestore Timestamp properly
        adjustments.sort((a, b) => {
          const timeA =
            a.createdAt?.toMillis?.() ||
            (typeof a.createdAt === "number" ? a.createdAt : 0);
          const timeB =
            b.createdAt?.toMillis?.() ||
            (typeof b.createdAt === "number" ? b.createdAt : 0);
          return timeB - timeA;
        });
        setRoutineAdjustments(adjustments);
      },
      (error) => {
        console.error("Error fetching routine adjustments:", error);
      },
    );

    return () => unsubscribe();
  }, [clientId, hasQuotaError]);


  /* The B switch and Plan B (Round 2, B molded in; routine-plan/ui/useBSwitch).
     Turning B on while Routine B has no machines opens Plan B: B starts as a
     copy of A with one machine different, never as an EMPTY Routine B (the
     critic's #22: an empty B with B on alternated the client into a session
     of nothing). Before the routines have answered it says it can't tell.
     The drawer asked about its own typing before it handed this over, so it
     closes for Plan B. Plan B is the one sheet the A | B lineup, Routine B's
     segment, the switch and the drawer open. */
  const bSwitch = useBSwitch({
    routines,
    routinesKnown: routinesStatus === "ready",
    onSwitch: (checked) => {
      setPendingToggleBValue(checked);
      setToggleBReason("");
      setIsToggleReasonDialogOpen(true);
    },
    onCantTell: toastError,
    beforePlanB: () => setEditRoutineTarget(null),
  });
  const handlePromptToggleB = bSwitch.request;
  // The reason typed in the B dialog and not yet saved (a screen holding typing registers).
  const toggleBUnsaved = useUnsavedChanges(
    isToggleReasonDialogOpen && toggleBReason.trim() !== "",
    "the reason for turning Routine B on or off",
    { onDiscard: () => setToggleBReason("") },
  );

  /*
   * The reason for turning B on or off is ASKED, NEVER REQUIRED (the
   * first-session design round, Oct 8 2026). AJ, Oct 7 2026: "Any trainer
   * who trains the client can definitely change the plan ... You should be
   * able to change that and make the call as a trainer because you're
   * training them that day", and "it's nice to be able to communicate like,
   * hey, I'm changing this plan because of this reason". It required three
   * characters until then.
   *
   * Round 2 (B molded in): turning B on never makes an EMPTY Routine B any
   * more. With no machines in B the switch opens Plan B instead
   * (`handlePromptToggleB`), which writes Routine B, its plan and this flag
   * in one batch; here B already has machines, so only the flag and the
   * "turned on/off" record are written. Turning B off keeps its reason
   * optional, as above.
   */
  const handleConfirmToggleB = async () => {
    if (pendingToggleBValue === null || !clientId) return;
    const toggleReason = toggleBReason.trim();

    setIsSavingToggle(true);
    try {
      await updateDoc(doc(db, "clients", clientId), {
        isRoutineBActive: pendingToggleBValue,
      });

      const routine = savedRoutineB(routines);
      // The record names the routine it is about: with no Routine B saved
      // (B switched off before one was ever made) there is none to name.
      if (routine?.id) {
        await addDoc(collection(db, "routineAdjustments"), {
          clientId,
          routineId: routine.id,
          previousMachineIds: routine.machineIds || [],
          newMachineIds: routine.machineIds || [],
          trainerId: authTrainer?.id || "unknown",
          ...(toggleReason ? { notes: toggleReason } : {}),
          studioId: client?.homeStudioId || activeStudioId || "",
          changeType: pendingToggleBValue ? "enabled" : "disabled",
          createdAt: serverTimestamp(),
        });
      }

      if (client) {
        client.isRoutineBActive = pendingToggleBValue;
      }

      // Re-trigger routines fetch
      const qRoutines = query(
        collection(db, "routines"),
        where("clientId", "==", clientId),
      );
      const snap = await getDocs(qRoutines);
      setRoutines(
        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Routine),
      );

      setIsToggleReasonDialogOpen(false);
      setToggleBReason("");
    } catch (err) {
      console.error("Error toggling Routine B:", err);
    } finally {
      setIsSavingToggle(false);
    }
  };

  /**
   * The sets of these sessions, and whether any chunk was answered by this
   * iPad's cache only. Ten ids to an `in` query, and every chunk at once
   * (speed round, Oct 5 2026: they were read one after another, five round
   * trips in a row for a page of fifty, while the grid's cells waited).
   */
  const fetchLogsForSessions = async (sessionIds: string[]): Promise<{ logs: ExerciseLog[]; fromCache: boolean }> => {
    if (sessionIds.length === 0) return { logs: [], fromCache: false };
    const chunks: string[][] = [];
    for (let i = 0; i < sessionIds.length; i += 10) {
      chunks.push(sessionIds.slice(i, i + 10));
    }
    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(query(collection(db, "exerciseLogs"), where("sessionId", "in", chunk))),
      ),
    );
    const fetchedLogs: ExerciseLog[] = [];
    let fromCache = false;
    for (const snap of snaps) {
      if (snap.metadata?.fromCache) fromCache = true;
      for (const d of snap.docs) fetchedLogs.push({ id: d.id, ...d.data() } as ExerciseLog);
    }
    return { logs: fetchedLogs, fromCache };
  };

  /*
   * A different client is a different history.
   *
   * The initial fetch MERGES into what is already loaded, so that re-entering
   * the Journey tab does not throw away the pages a trainer scrolled back
   * through. But this view is not remounted per client, so without this the
   * merge would hand the next client the previous one's sessions and logs —
   * and the grid, seeing its old first session still in the array, would
   * treat the change as "older columns were prepended" and stay parked on
   * them. Clear first, in an effect declared ABOVE the fetch so it is queued
   * first. Fluidity round, Sep 2026.
   */
  const historyLoadedFor = useRef(clientId);
  useEffect(() => {
    if (historyLoadedFor.current === clientId) return;
    historyLoadedFor.current = clientId;
    setSessions([]);
    setAllLogs([]);
    setLastVisibleSession(null);
    setHasMoreSessions(false);
  }, [clientId]);

  /*
   * WHEN THE PAGE IS READ AGAIN (speed round, Oct 5 2026;
   * features/client-profile/history-freshness.ts). It used to be read again
   * on every return to Journey, fifty sessions and their sets each time. Now
   * once per client, and again only when her record changed: a session of
   * hers that was In-Progress is no longer (finished or discarded, on this
   * iPad or a second one), or the Activity Archive's live list changed (an
   * edit, a past session logged, one removed). `historyChanges` counts those
   * changes; a read remembers the count it started at.
   */
  const [historyChanges, setHistoryChanges] = useState(0);
  const readAtChange = useRef<{ clientId: string | null; at: number; time: number }>({ clientId: null, at: -1, time: 0 });
  const historyReadRef = useRef(historyRead);
  historyReadRef.current = historyRead;
  const readSeq = useRef(0);
  const currentClientRef = useRef(clientId);
  currentClientRef.current = clientId;
  const inProgressSeen = useRef<{ clientId: string; ids: string[]; failed?: boolean } | null>(null);
  useEffect(() => {
    if (!inProgressFor || inProgressFor.failed) return;
    const before = inProgressSeen.current;
    inProgressSeen.current = inProgressFor;
    if (before && before.clientId === inProgressFor.clientId && inProgressLeft(before.ids, inProgressFor.ids)) {
      setHistoryChanges((n) => n + 1);
    }
  }, [inProgressFor]);
  const archiveSeen = useRef<{ clientId: string; signature: string } | null>(null);
  const onArchiveHistory = useCallback(
    (signature: string) => {
      if (!clientId) return;
      const before = archiveSeen.current;
      archiveSeen.current = { clientId, signature };
      if (before && before.clientId === clientId && before.signature !== signature) {
        setHistoryChanges((n) => n + 1);
      }
    },
    [clientId],
  );
  const tabDrawsHistory = activeTab === "journey" || activeTab === "clinical";
  // A failed In-Progress listener can't say a session finished: unknown, so every return reads again.
  const inProgressWatchFailed = inProgressFor?.failed === true && inProgressFor.clientId === clientId;

  useEffect(() => {
    // historyWanted going back to null is the read's own `finally`, not a new
    // ask: on the Journey tab it would otherwise read the whole page again.
    const justCleared = lastHistoryWanted.current !== null && historyWanted === null;
    lastHistoryWanted.current = historyWanted;
    if (justCleared || !clientId || hasQuotaError) return;

    // The Journey grid and the Activity Archive's calendar both read this page of
    // sessions. Programming and the record do not, so they still cost nothing
    // until the machine menu asks for it there. Coming back to either costs
    // nothing either, unless her record changed meanwhile.
    const readFor = readAtChange.current.clientId === clientId ? readAtChange.current.at : -1;
    if (
      !shouldReadHistory({
        tabDrawsIt: tabDrawsHistory,
        asked: historyWanted === clientId,
        read: answerFor(historyReadRef.current, clientId),
        changedSinceRead: readFor !== historyChanges,
        watchFailed: inProgressWatchFailed,
        // A past session logged on another iPad changes neither signal above.
        stale: readFor !== -1 && Date.now() - readAtChange.current.time > HISTORY_STALE_MS,
      })
    ) {
      return;
    }
    readAtChange.current = { clientId, at: historyChanges, time: Date.now() };
    const seq = ++readSeq.current;
    // A newer read, or another client, has the floor: this one's answer is dropped.
    const current = () => seq === readSeq.current && currentClientRef.current === clientId;

    const fetchInitialSessions = async () => {
      setIsLoadingSessions(true);
      try {
        // 2. Firebase Query Limits & Pagination
        // The first page is SESSION_PAGE (50) sessions, and every older page
        // the same: the Journey grid, the Activity Archive's calendar and the
        // machine menu all read these pages.
        const sessionsQuery = query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          orderBy("date", "desc"),
          limit(SESSION_PAGE),
        );

        const sessionSnap = await getDocs(sessionsQuery);
        if (!current()) return;
        const docs = sessionSnap.docs;
        // Offline, getDocs answers from this iPad's cache rather than failing:
        // possibly nothing, possibly part. Such an answer is never "ready".
        const sessionsCached = sessionSnap.metadata?.fromCache === true;

        if (!docs.length) {
          // Only the server's empty answer empties what is drawn.
          if (!sessionsCached) {
            setSessions([]);
            setAllLogs([]);
            setHasMoreSessions(false);
          }
          setHistoryRead({ clientId, value: sessionsCached ? "cache-only" : "ready" });
          return;
        }

        setLastVisibleSession(docs[docs.length - 1]);
        setHasMoreSessions(docs.length === SESSION_PAGE);

        const liveSessionsData = docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
        );

        // The server's page is the truth for the span it covers (a session
        // removed in the Archive leaves); older pages the trainer scrolled
        // back through are kept. A cache answer only adds.
        const pageOpts = { whole: !sessionsCached, pageSize: SESSION_PAGE };
        const { removed } = mergeHistoryPage(sessionsRef.current, liveSessionsData, pageOpts);
        setSessions((prev: WorkoutSession[]) => mergeHistoryPage(prev, liveSessionsData, pageOpts).sessions);

        const sessionIds = liveSessionsData.map((s) => s.id!).filter(Boolean);
        const { logs: newLogs, fromCache: logsCached } = await fetchLogsForSessions(sessionIds);
        if (!current()) return;

        setAllLogs((prev) =>
          mergeHistoryLogs(prev, sessionIds, newLogs, { whole: !sessionsCached && !logsCached, removed }),
        );
        setHistoryRead({ clientId, value: sessionsCached || logsCached ? "cache-only" : "ready" });
      } catch (error: any) {
        if (!current()) return;
        setHistoryRead({ clientId, value: "failed" });
        handleFirestoreError(error, OperationType.GET, "sessions");
      } finally {
        if (seq === readSeq.current) {
          setIsLoadingSessions(false);
          setHistoryWanted(null);
        }
      }
    };

    fetchInitialSessions();
    // historyRead is read through its ref: an answer arriving is not a reason to read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tabDrawsHistory, hasQuotaError, historyWanted, historyChanges, inProgressWatchFailed]);

  /** The next page of sessions and their sets. Resolves false when it failed (the machine menu says so). */
  const handleLoadMoreHistory = async (): Promise<boolean> => {
    if (!lastVisibleSession || !hasMoreSessions || isLoadingMore || !clientId)
      return true;
    setIsLoadingMore(true);
    try {
      const moreQuery = query(
        collection(db, "sessions"),
        where("clientId", "==", clientId),
        orderBy("date", "desc"),
        startAfter(lastVisibleSession),
        limit(SESSION_PAGE),
      );
      const snap = await getDocs(moreQuery);
      const pageCached = snap.metadata?.fromCache === true;
      if (snap.empty) {
        // An empty page only the cache gave is not the end of the record:
        // offline it says it couldn't load older sessions.
        if (pageCached) return false;
        setHasMoreSessions(false);
        return true;
      }

      setLastVisibleSession(snap.docs[snap.docs.length - 1]);
      setHasMoreSessions(snap.docs.length === SESSION_PAGE);

      const moreSessionsData = snap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
      );

      const sessionIds = moreSessionsData.map((s) => s.id!).filter(Boolean);
      const { logs: moreLogs, fromCache: moreLogsCached } = await fetchLogsForSessions(sessionIds);
      // A page the cache answered may be partial: the record is no longer known whole.
      if (pageCached || moreLogsCached) setHistoryRead({ clientId, value: "cache-only" });

      setSessions((prev) => {
        const out = [...prev, ...moreSessionsData].sort(
          (a, b) => parseSessionDate(b.date) - parseSessionDate(a.date),
        );
        return Array.from(new Map(out.map((s) => [s.id, s])).values());
      });
      // By id: a page read twice (after the first page was read again) never doubles a set.
      setAllLogs((prev) => mergeHistoryLogs(prev, sessionIds, moreLogs, { whole: false }));
      return true;
    } catch (err) {
      console.error("Error loading older history", err);
      return false;
    } finally {
      setIsLoadingMore(false);
    }
  };

  /* ------------------------------------------------------------------ *
   * JOURNEY GRID (client profile -> Journey tab)
   *
   * The grid itself lives in src/features/journey-grid. This block only
   * adapts the profile's Firestore state into the grid's view models:
   *   - sessions are numbered from the history length (not the stored
   *     sessionNumber), exactly as the old header did, so deleted or
   *     imported logs never leave gaps in the numbering;
   *   - rows follow the studio's display order and carry the ordered
   *     settings chips, the ★ core-lift flag and an alert flag when the
   *     client has an important machine note.
   * Start / Low / Next are gone as columns: Start and Low live in the
   * grid's Analytics column, and the prescribed weight now only ever shows
   * as the pre-filled value in the Active Session's Today column.
   * ------------------------------------------------------------------ */
  const journeyGridSessions = useMemo(() => {
    const totalRecords = Math.max(completedTotal ?? 0, sessions.length);
    return toJourneySessions(
      sessions.map((s, idx) => ({ ...s, sessionNumber: totalRecords - idx })),
    );
  }, [sessions, completedTotal]);

  /**
   * Routine A / B machine ids, for the Journey tab's filters. Matched on the
   * routine NAME containing its letter, which is how the rest of this view
   * already tells the two apart.
   */
  const routineAMachineIds = useMemo(
    () =>
      routines.find((r) => (r.name || "").toUpperCase().includes("A"))?.machineIds ?? [],
    [routines],
  );
  const routineBMachineIds = useMemo(
    () =>
      routines.find((r) => (r.name || "").toUpperCase().includes("B"))?.machineIds ?? [],
    [routines],
  );

  /* Her journal's notes that name a machine: the grid's note mark reads the
     one list (Oct 2 2026, features/equipment/machine-notes.ts). The same
     query as the record's journal, so one listener. */
  const machineJournalRead = useMachineJournalRead(client.id ?? null);
  const machineJournal = machineJournalRead.entries;
  const journeyGridRows = useMemo(() => {
    // THIS studio's floor, its own machines included, the same list the
    // Active Session draws (Oct 2 2026) - not the company catalog - then any
    // machine she has history on that the floor no longer has.
    const floor = [...codexFloor].sort(
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
    const ordered = floorWithHistoryMachines(
      floor,
      machines,
      allLogs.map((l) => l.machineId),
    );
    const currentStudio = studios?.find((st) => st.id === activeStudioId);
    // Marker 7: the Big Five star is gone from the grid. Every machine in
    // this method is a core lift; a star on five of them said the other
    // sixteen were optional, which is not what the prescription means.
    // Which notes are open is a studio-day question (client-notes/threads.ts).
    const noteDay = studioTodayKey();
    return toJourneyRows(ordered, allLogs, clientSettings).map((row) => {
      const machine = ordered.find((m) => m.id === row.machine.id);
      if (!machine) return row;
      const settings = clientSettings[machine.id!]?.settings || {};
      const stdSettings =
        currentStudio?.machineSettings?.[machine.id!] ||
        machine.standardSettings ||
        {};
      const entries = orderMachineSettings(
        settings,
        stdSettings,
        machine.settingOptions || [],
      );
      return {
        ...row,
        machine: {
          ...row.machine,
          settings: entries.length
            ? Object.fromEntries(entries.map(([k, v]) => [k, v]))
            : undefined,
          settingLabels: entries.length
            ? Object.fromEntries(entries.map(([k, , full]) => [k, full]))
            : undefined,
          // The mark beside the name: the loudest open note, in the one
          // note key (machine menu, Oct 2026).
          alert:
            machineNoteLoudness({
              machineId: machine.id!,
              machineName: machine.name,
              legacy: clientSettings[machine.id!]?.machineNotes,
              journal: machineJournal,
              today: noteDay,
            }) ?? undefined,
        },
      };
    });
  }, [
    machines,
    codexFloor,
    allLogs,
    clientSettings,
    studioFloorById,
    studios,
    activeStudioId,
    machineJournal,
  ]);

  /**
   * Tapping a machine — its name on the Journey grid, its row in Routine
   * A / B, or a machine link in Notes & Profile — opens the machine menu
   * (features/machine-menu): the same card the Active Session opens, with
   * the notes after the chart. Programming → All Machines draws the same
   * body inline.
   */
  const openMachineWindow = useCallback((machineId: string) => {
    setMachineWindowId(machineId);
  }, []);
  const closeMachineWindow = useCallback(() => setMachineWindowId(null), []);

  /*
   * THE MACHINE MENU'S DOOR ON THE PROFILE. What the card is handed: the
   * pages of sessions this view has read and their sets, the one journal
   * listener, and the profile's own Load older (the grid's next page). Opened
   * before Journey has been visited, it asks for the first page and says
   * it is loading — never the first-time words.
   */
  const profileHistoryState: MachineMenuHost["historyState"] = (() => {
    const read = answerFor(historyRead, clientId);
    // A page already read stays drawn while the tab reads it again; one only
    // the cache answered is drawn with its line, never as the whole record.
    if (read === "ready" || read === "cache-only") return read;
    if (read === "failed" || hasQuotaError) return "failed";
    return "loading";
  })();
  const ensureHistory = useCallback(() => {
    if (!clientId || isLoadingSessions) return;
    if (answerFor(historyRead, clientId)) return;
    setHistoryWanted(clientId);
  }, [clientId, isLoadingSessions, historyRead]);
  const retryHistory = useCallback(() => {
    if (clientId && !isLoadingSessions) setHistoryWanted(clientId);
  }, [clientId, isLoadingSessions]);
  const profileStudioName = studios?.find((st) => st.id === activeStudioId)?.name ?? null;
  const machineMenuHost = useMemo<MachineMenuHost>(
    () => ({
      door: "profile",
      clientId: clientId || "",
      client,
      machines: machineWindowMachines,
      clientSettings,
      author: authorFromTrainer(authTrainer),
      activeStudioId: activeStudioId ?? null,
      floorStudio: { id: activeStudioId ?? null, name: profileStudioName },
      roster: clients,
      coverage: clientCoverage,
      window: ownedWindow({ coverage: clientCoverage, prior: priorHistory, cutover: journeyCutover }),
      sessions,
      logs: allLogs,
      historyState: profileHistoryState,
      moreOnServer: hasMoreSessions,
      onRetryHistory: retryHistory,
      loadOlder: handleLoadMoreHistory,
      loadingOlder: isLoadingMore,
      ensureHistory,
      journal: machineJournalRead.entries,
      journalState: machineJournalRead.state,
    }),
    // handleLoadMoreHistory is redefined every render; the menu reads the newest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      clientId,
      client,
      machineWindowMachines,
      clientSettings,
      authTrainer,
      activeStudioId,
      profileStudioName,
      clients,
      clientCoverage,
      priorHistory,
      journeyCutover,
      sessions,
      allLogs,
      profileHistoryState,
      hasMoreSessions,
      retryHistory,
      isLoadingMore,
      lastVisibleSession,
      ensureHistory,
      machineJournalRead.entries,
      machineJournalRead.state,
    ],
  );

  /*
   * ROUTINE A'S PLAN (the first-session design round, Oct 8 2026, §4.3).
   * This view owns the routines' one read and every write to them, so it
   * holds the plan's actions (`usePlanActions`: issued through
   * routine-plan/store.ts, never awaited, this view's routines patched at
   * once because the read is not live, a refusal toasted and read again)
   * and works out which kind of "no routine" the client is. The kind claims
   * nothing until both the routines and the session count have answered
   * (`known`); a failed read is "can't tell", never "no routine".
   */
  const planAuthUid = auth.currentUser?.uid || user?.uid || null;
  const planActions = usePlanActions({
    clientId,
    studioId: client?.homeStudioId || activeStudioId || "",
    routines,
    setRoutines,
    onError: toastError,
    onRefused: () => setRoutinesReadNonce((n) => n + 1),
    author: planAuthUid
      ? {
          id: planAuthUid,
          initials: (authTrainer?.initials || "TR").toUpperCase(),
          fullName: authTrainer?.fullName || "Coach",
        }
      : null,
  });
  const routineAForPlan = routines.find((r) => r.name === "Routine A");
  // What the routines' own read says, whatever the session count says: a
  // count that never answers must not offer Start a plan to a client who
  // has a routine or a plan.
  const hasRoutineRead = routines.some(
    (r) => (r.name === "Routine A" || r.name === "Routine B") && (r.machineIds?.length ?? 0) > 0,
  );
  const hasPlanRead = !!routineAForPlan?.plan;
  const startingKind = useMemo(
    () =>
      startingKindOf({
        known: routinesStatus === "ready" && journeyCompletedCount !== null,
        hasRoutine: hasRoutineRead,
        hasPlan: hasPlanRead,
        journeySessions: journeyCompletedCount,
        coverage: clientCoverage,
        provisionalNewClient: isProvisionalNewClient(client),
      }),
    [routinesStatus, journeyCompletedCount, hasRoutineRead, hasPlanRead, clientCoverage, client],
  );
  // The studio's day, worked out every render (a string, so the host stays
  // the same object until it moves): a profile left open past midnight
  // dates a can't-do mark and its "Back on" from today, never yesterday.
  const planToday = studioTodayKey();
  // The intake a starting routine is matched on, its open Health notes
  // included (the design round, §4.2), from the journal this view already
  // streams for the machine notes: one listener, no new read.
  const planHealthWords = useMemo(
    () => openHealthWords(machineJournalRead.all ?? null).join(" · "),
    [machineJournalRead.all],
  );
  const planIntake = useMemo(
    () =>
      planIntakeText({
        medicalHistory: client?.medicalHistory,
        goals: client?.goals,
        clinicalProfile: client?.clinicalProfile,
        healthNotes: planHealthWords ? [planHealthWords] : [],
      }),
    [client?.medicalHistory, client?.goals, client?.clinicalProfile, planHealthWords],
  );
  const planHost = useMemo<PlanHost>(
    () => ({
      status: routinesStatus,
      kind: startingKind,
      floor: codexFloor,
      studioId: activeStudioId ?? null,
      studioName: profileStudioName,
      who: planAuthUid
        ? { uid: planAuthUid, ...(authTrainer?.fullName ? { name: authTrainer.fullName } : null) }
        : null,
      todayYmd: planToday,
      intakeText: planIntake,
      actions: planActions,
      openPlanB: bSwitch.openPlanB,
      // Every session read: no page left on the server. Until the first
      // page answers this is false, and the count says nothing.
      sessionsComplete: !hasMoreSessions,
      coverage: clientCoverage,
    }),
    [
      bSwitch.openPlanB,
      clientCoverage,
      hasMoreSessions,
      routinesStatus,
      startingKind,
      codexFloor,
      activeStudioId,
      profileStudioName,
      planAuthUid,
      authTrainer?.fullName,
      planToday,
      planIntake,
      planActions,
    ],
  );
  /**
   * What the setup banner says (the design round, §4.8: it "now points at
   * Start a plan"), from the routines' own read: no routine and no plan,
   * the door Programming offers (Start a plan, or Enter their routine for a
   * client who trained here before Journey); a plan kept with Routine A
   * still empty, day one is planned; otherwise as it always said. A read
   * that hasn't answered or failed claims nothing.
   */
  const setupBanner: "start" | "enter" | "planned" | null =
    routinesStatus !== "ready"
      ? null
      : hasPlanRead && (routineAForPlan?.machineIds?.length ?? 0) === 0
        ? "planned"
        : !hasPlanRead && !hasRoutineRead
          ? startingKind.kind === "new-to-journey"
            ? "enter"
            : "start"
          : null;

  /*
   * NOTES & PROFILE (the client codex) — what it is handed from here.
   *
   * The doors that leave the tab belong to this view, which owns the other
   * tabs and the app's view: Relay (the old Planner door, `onOpenPlanner`),
   * the archive's reports, a machine,
   * the Set-up, and the Migration Hub. The Hub switches to Journey first, as
   * the old record's did, because imported sessions land there. (The filed
   * reports are the Activity Archive's shelf, below; the codex opens none.)
   *
   * The session numbers come from the header's own read ("461 · 49 in
   * Journey · 412 before": `journeyCompletedCount` and the prior record), so
   * once it answers no page can disagree with the header. Until it answers
   * for this client the header shows the stored total and the codex says it
   * does not know yet - never a second count. The door to Sessions before
   * Journey is handed over too, and Account is the one place that draws it
   * (its words, its rule, this view's editor; off the header since Sep 26).
   */
  const codexHosts = useMemo<CodexHosts>(
    () => ({
      onOpenPlanner: () => setView("studio-tasks"),
      onOpenReports: () => nav.go({ tab: "clinical", view: "reports" }),
      // The chart importer (OCR) is administrators' only since Oct 2 2026:
      // Journey no longer waits on FileMaker, so a trainer is not offered it.
      onOpenMigrationHub: isSuperAdminRole(authTrainer?.role)
        ? () => {
            nav.setTab("journey");
            window.dispatchEvent(new CustomEvent("open-bulk-import"));
          }
        : undefined,
      onOpenMachine: openMachineWindow,
      onOpenSetup: () => nav.go({ tab: "programming", view: "setup" }),
      priorHistoryDoor,
      sessionsSplit: splitOfSessions,
    }),
    // nav's callbacks are stable (useCallback with no deps in useProfileNav).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setView, openMachineWindow, nav.go, nav.setTab, priorHistoryDoor, splitOfSessions, authTrainer?.role],
  );
  // What Programming already holds, for Body & Pulse's floor (her notes per
  // machine, and machine fit's "clients built like her") — no read of its own.
  const codexProgramming = useMemo<CodexProgramming>(
    () => ({
      clientSettings,
      routines,
      studioClients: clients,
      activeStudioId: activeStudioId ?? null,
      floorMachines: codexFloor,
      status:
        routinesStatus === "failed" || settingsStatus === "failed"
          ? "failed"
          : routinesStatus === "loading" || settingsStatus === "loading"
            ? "loading"
            : "ready",
    }),
    [clientSettings, routines, clients, activeStudioId, codexFloor, routinesStatus, settingsStatus],
  );
  const codexSessionTotals = useMemo(
    () => sessionTotalsOf(journeyCompletedCount, client),
    // The totals read nothing of the client but its uncounted prior sessions
    // (priorOffset), so the deps are two primitives: a snapshot that changed
    // neither keeps the same object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [journeyCompletedCount, priorOffset],
  );

  // A different client is a different prescription: never carry a window over.
  useEffect(() => {
    setMachineWindowId(null);
  }, [clientId]);

  useEffect(() => {
    // Clear first, as the routines do: this view is not remounted between
    // clients, so until the listener answers the previous client's settings
    // (and her important machine notes) would still be in state.
    setClientSettings({});
    setSettingsStatus("loading");
    if (!clientId) return;

    const settingsQ = query(
      collection(db, "clientMachineSettings"),
      where("clientId", "==", clientId),
    );

    const unsubscribe = onSnapshot(
      settingsQ,
      (snap) => {
        const settingsMap: Record<string, ClientMachineSetting> = {};
        snap.docs.forEach((doc) => {
          const data = { id: doc.id, ...doc.data() } as ClientMachineSetting;
          settingsMap[data.machineId] = data;
        });
        setClientSettings(settingsMap);
        setSettingsStatus("ready");
      },
      (error) => {
        setSettingsStatus("failed");
        handleFirestoreError(error, OperationType.GET, "clientMachineSettings");
      },
    );

    return () => unsubscribe();
  }, [clientId]);

  // The report banner above the header shows on EVERY tab, but the shelf
  // below only loads on two — so on the Journey (where the profile opens) the
  // banner used to read an empty list and say "no progress report on file"
  // for clients with several. One read per client answers the banner; until
  // it lands (or if it fails) the banner says nothing. Since Oct 2 2026 it
  // reads the newest 20, because the line counts from the last FULL report
  // and a Pulse round or a draft may be newer (features/client-profile
  // cpr-timing.ts, progressReportDue).
  const [reportProbe, setReportProbe] = useState<{ clientId: string; reports: ProgressReport[] } | null>(null);
  useEffect(() => {
    if (!clientId || hasQuotaError || !user) return;
    let live = true;
    getDocs(
      query(
        collection(db, "progressReports"),
        where("clientId", "==", clientId),
        orderBy("createdAt", "desc"),
        limit(20),
      ),
    )
      .then((snap) => {
        if (!live) return;
        setReportProbe({ clientId, reports: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProgressReport) });
      })
      .catch((err) => console.warn("[report banner] latest report read failed", err));
    return () => {
      live = false;
    };
  }, [clientId, hasQuotaError, user?.uid]);

  useEffect(() => {
    if (!clientId || !user) return;
    // This view is not remounted between clients: without the reset, the last
    // client's next session showed under the new name until the read landed.
    setScheduledSessions([]);
    let live = true;
    const fetchSchedules = async () => {
      try {
        const q = query(
          collection(db, "schedules"),
          where("clientId", "==", clientId),
          where("startTime", ">=", Timestamp.now()),
          orderBy("startTime", "asc"),
          limit(50),
        );
        const snap = await getDocs(q);
        if (!live) return;
        // Still booked only: a cancelled booking keeps its row, and it was
        // read as the NEXT SESSION and counted in "N booked" (Sep 26 2026).
        setScheduledSessions(
          stillBooked(
            snap.docs.map(
              (doc) => ({ id: doc.id, ...doc.data() }) as ScheduleEntry,
            ),
          ),
        );
      } catch (error: any) {
        handleFirestoreError(error, OperationType.GET, "schedules");
      }
    };
    fetchSchedules();
    return () => {
      live = false;
    };
  }, [clientId, user?.uid]);

  if (!client) {
    // Three different situations used to collapse into one "select a client"
    // message, so opening a profile flashed an empty state while the document
    // was still being fetched.
    if (isLoadingClient)
      return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
          <LoadingMark label="Opening the chart…" size="lg" />
        </div>
      );

    if (clientId)
      return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
          <AlertCircle className="w-12 h-12 text-rose-500 opacity-40" />
          <p className="text-muted-foreground font-medium">
            This client could not be found. They may have been deleted.
          </p>
          <Button onClick={() => setView("clients")}>Back to Clients</Button>
        </div>
      );

    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground opacity-20" />
        <p className="text-muted-foreground font-medium">
          Select a client to view their profile.
        </p>
        <Button onClick={() => setView("clients")}>Back to Clients</Button>
      </div>
    );
  }

  /*
   * The progress report's reminder. It was ONE QUIET LINE at the top
   * (Atlas answers, Oct 2 2026) in place of the red
   * strip: due three months after the last FULL report, off for a
   * client with "No progress reports", and said more strongly when her
   * renewal conversation is close — the Activity Archive's Reports cue
   * asks the same function (`progressReportDue`). The live shelf when
   * it is loaded for this client, else the probe; neither yet means
   * unknown, and unknown shows nothing. Since AJ's walk the same day
   * ("it should just put a highlight over the activity archive") it is a
   * dot on that tab, and the Archive's Reports cue says the words.
   */
  const liveReports =
    progressReportsStatus === "ready" && !progressReports.some((r) => r.clientId !== clientId)
      ? progressReports
      : null;
  const reportList = liveReports ?? (reportProbe?.clientId === clientId ? reportProbe.reports : null);
  const reportDue = progressReportDue({
    reports: reportList,
    optedOut: client.noProgressReports === true,
    renewal: renewalOf(client),
    // A first report is expected once she has been here three months -
    // judged from the oldest date on the record, or a prior record,
    // never from the day Journey met her (lib/history-claims.ts).
    established: isEstablishedClient({ earliest: earliestKnownDate(client), prior: priorHistory }, new Date()),
    today: studioTodayKey(),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-350 mx-auto space-y-2 pb-8 px-2 sm:px-4 bg-background min-h-screen pt-4"
    >
      {/* Alerts / Notifications */}
      {(() => {
        if (client.requiresConsultation && !client.consultationCompleted) {
          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-2"
            >
              <div className="bg-(--eq-live-fill) border-2 border-(--eq-live)/30 rounded-3xl p-4 flex items-center gap-4 text-(--eq-live-text)">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold">
                    Profile setup needed
                  </p>
                  {/* A client with no routine is pointed at the door
                      Programming offers (the first-session design round,
                      §4.8): the consult wizard it used to open is retired. */}
                  {setupBanner === "start" ? (
                    <p className="text-[14px] font-medium mt-0.5">
                      Start a plan on Programming → Routine A, and add their details in Notes &amp; Profile.
                    </p>
                  ) : setupBanner === "enter" ? (
                    <p className="text-[14px] font-medium mt-0.5">
                      Enter their routine on Programming → Routine A, and add their details in Notes &amp; Profile.
                    </p>
                  ) : setupBanner === "planned" ? (
                    <p className="text-[14px] font-medium mt-0.5">
                      Day one is planned on Programming → Routine A. Add their details in Notes &amp; Profile.
                    </p>
                  ) : (
                    <p className="text-[14px] font-medium mt-0.5">
                      Set up their routine in Programming, and their details
                      in Notes &amp; Profile.
                    </p>
                  )}
                </div>
                {(setupBanner === "start" || setupBanner === "enter") && (
                  <Button className="hover:bg-primary" onClick={() => nav.setProgrammingView("routine-a")}>
                    {setupBanner === "enter" ? "Enter their routine" : "Start a plan"}
                  </Button>
                )}
              </div>
            </motion.div>
          );
        }

        // The progress report's reminder is a dot on the Activity Archive
        // tab now, not a line at the top (AJ, Oct 2 2026).
        return null;
      })()}

      {/* Header (Sep 2026 redesign) — identity, four facts, one action.
          Lives in src/features/client-profile/ProfileHeader.tsx; this view
          only hands it data and the session-start wiring. */}
      {/* Quick note (Operations overhaul, Sep 2026): the note box, one tap
          from the header, over whatever tab is open. */}
      <QuickNoteDialog
        open={quickNoteOpen}
        onOpenChange={setQuickNoteOpen}
        client={client}
        machines={machines}
        authTrainer={authTrainer ?? null}
        onOpenFord={() => {
          setQuickNoteOpen(false);
          nav.openRecord("ford");
        }}
      />
      <ProfileHeader
        client={client}
        studioName={studios?.find((s) => s.id === client.homeStudioId)?.name}
        sessions={sessions}
        scheduledSessions={scheduledSessions}
        completedCount={headerTotal}
        lateCancels={lateCancels}
        sessionsQuotable={canQuoteNumber || sessionTotals?.basis === "mindbody"}
        coverage={clientCoverage}
        sessionsSplit={splitOfSessions}
        topTrainer={topTrainer}
        trainers={trainers}
        pkg={clientPackage}
        activeInProgressSession={activeInProgressSession}
        isCheckingActiveSession={isCheckingActiveSession}
        sync={{
          busy: masterSyncing,
          onSync: () => void handleMasterSync(),
          label: masterSyncLabel(client.mindbodyMasterSyncedAt),
          available: !!mindbodyIdOf(client) && !client.provisional,
        }}
        kaizen={
          liveAuthTrainer && client.id
            ? {
                isOn: isOnRoster(liveAuthTrainer, client.id),
                busy: kaizenSaving,
                onToggle: () => {
                  if (!client.id) return;
                  if (isOnRoster(liveAuthTrainer, client.id)) {
                    void removeFromKaizen(client.id);
                  } else {
                    // Straight onto the roster with the default reason. A
                    // trainer mid-conversation with a client should not have
                    // to answer a form; the reason is editable on the profile.
                    void addToKaizen(client, "Progression");
                  }
                },
              }
            : undefined
        }
        onBack={() => {
          setSelectedClientId(null);
          setView("client-directory");
        }}
        onStartSession={() => {
          localStorage.removeItem("max_strength_active_session_id");
          setView("workouts");
        }}
        onQuickNote={() => setQuickNoteOpen(true)}
        /* Continue is this trainer's own session; anyone else's opens
           read-only, with Take over there (session record, Sep 26 2026). */
        sessionIsMine={
          !isAnotherTrainersSession(activeInProgressSession, myTrainerIds(liveAuthTrainer, user?.uid))
        }
        onContinueSession={() => {
          if (activeInProgressSession?.id) rememberLiveSession(activeInProgressSession.id);
          setView("workouts");
        }}
        onWatchSession={() => setView("workouts")}
        onDiscardSession={() => setDiscardTarget(activeInProgressSession)}
        renewal={
          renewalNow
            ? {
                text: chipText(renewalNow, studioTodayKey()),
                tone: SITUATION_TONE[renewalNow.situation],
                attention: renewalPromptDue(renewalNow),
                onOpen: () => setRenewalOpen(true),
              }
            : undefined
        }
      />
      {/* An abandoned session: Start is still offered above, and this is
          where it can be discarded (features/client-profile/StaleSessionNotice). */}
      {!activeInProgressSession && staleInProgressSession && (
        <StaleSessionNotice
          session={staleInProgressSession}
          todayKey={studioTodayKey()}
          onDiscard={() => setDiscardTarget(staleInProgressSession)}
        />
      )}
      <RenewalCardDialog
        open={renewalOpen}
        onClose={() => setRenewalOpen(false)}
        client={client}
        trainer={liveAuthTrainer}
        machineNames={machineNames}
      />

      <UnsavedChangesScope scope={tabsScope}>
      <Tabs
        value={activeTab}
        className="w-full flex-1 flex flex-col min-h-0"
        onValueChange={(v) => nav.setTab(v as typeof activeTab)}
      >
        {/* FOUR equal columns (Sep 2026). Seven of these became six in the
            FORD merge and six become four here, and the labels stopped being
            the names of the screens that produced them and became the
            questions a coach actually asks:

              Journey           what has she done, in order
              Programming       what is she supposed to do
              Notes & Profile   what do we know, and what did we say
              Activity Archive  what has already happened

            Equal tracks, not content-sized, is still what keeps the row from
            ever scrolling sideways — and four tracks is roomier than seven
            was: ~160px each at the iPad mini's 744pt portrait, where
            "Activity Archive" is 110px at 14px. Nothing truncates: under
            600px wide (a phone) the words are 12px and a label takes a second
            line inside the 40px tab, hyphenated where one word is wider than
            the tab ("Program-ming" on a 375px phone).

            How they look (type and depth, phase 7, Oct 4 2026; AJ's answer
            1A): Geist 14/600 in the words' own capitalisation, ink-2 (5.9:1
            on the tray), the open one 700 in ink, RAISED out of the sunk
            tray (--raised, the lift, a soft ring; the shared TabsTrigger's
            own look, which this class list no longer overrides). They were
            the display face's slanted capitals. Only colours transition. The
            level below this one is the one sub-toggle
            (ProfileSubnav) three of the tabs carry: Programming's four
            segments, Notes & Profile's seven pages and the Activity Archive's
            four segments; see features/client-profile.

            The row is PROFILE_TABS and nothing else, in AJ's order (by
            depth; don't reorder, merge or add a tab without asking).
            `grid-cols-4` is a literal because Tailwind cannot build a class
            name at runtime; ClientProfileView.tabs.test.ts holds it equal to
            PROFILE_TABS.length, and holds one trigger per entry and the four
            panels below in the same order. The chosen tab's look comes from
            the TabsTrigger wrapper's `data-active` styling (Base UI marks the
            chosen tab with data-active, never data-state). */}
        <div className="mb-2 w-full">
          <div className="w-full pb-0.5">
            <TabsList className="cp-tabs bg-(--tray) shadow-(--elev-0) p-1 grid grid-cols-4 w-full h-12! rounded-xl gap-1">
              {PROFILE_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  title={tab.blurb}
                  className="cp-tab relative w-full h-10! px-1 sm:px-2 font-sans not-italic normal-case tracking-normal text-[14px] max-[600px]:text-[12px] font-semibold leading-tight text-ink-d2 hover:text-foreground whitespace-normal [overflow-wrap:anywhere] hyphens-auto transition-[color,background-color,border-color] text-center cursor-pointer select-none rounded-lg flex items-center justify-center"
                >
                  {tab.label}
                  {tab.id === "clinical" && reportDue && (
                    <span
                      data-testid="archive-report-dot"
                      data-level={reportDue.level}
                      role="img"
                      aria-label={reportDue.text}
                      title={reportDue.text}
                      className="absolute top-1.5 right-2 flex h-2.5 w-2.5"
                    >
                      <span
                        className={cn(
                          "absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-attention-ring",
                          reportDue.level === "renewal" ? "bg-amber-400" : "bg-primary",
                        )}
                      />
                      <span
                        className={cn(
                          "relative inline-flex h-2.5 w-2.5 rounded-full",
                          reportDue.level === "renewal" ? "bg-amber-500" : "bg-primary",
                        )}
                      />
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        {/* ---------------- 1 · JOURNEY ---------------- */}
        {/* Marker 3: no `overflow-hidden`, no bounded height. The machine
            list is as long as it is and the PAGE scrolls to meet it. */}
        <TabsContent
          value="journey"
          className="mt-0 rounded-xl relative focus-visible:outline-none"
        >
          <RecentJourneyView
            sessions={journeyGridSessions}
            rows={journeyGridRows}
            hasMoreOnServer={hasMoreSessions}
            onLoadMore={async () => {
              await handleLoadMoreHistory();
            }}
            loading={isLoadingSessions}
            loadingMore={isLoadingMore}
            resetKey={clientId ?? null}
            layout="page"
            routineAMachineIds={routineAMachineIds}
            routineBMachineIds={routineBMachineIds}
            onOpenMachine={openMachineWindow}
            sessionNumbers={canQuoteNumber}
            coverage={clientCoverage}
          />
        </TabsContent>

        {/* ---------------- 2 · PROGRAMMING ---------------- */}
        {/* Routines and Equipment, which were two tabs answering one
            question. The shell owns the sub-toggle and the routine view
            model; every Firestore write still belongs to this file, which is
            why the drawer and the two dialogs below sit beside it rather
            than inside it. See features/client-profile/ProgrammingTab.tsx. */}
        <TabsContent
          value="programming"
          className="mt-0 flex-1 min-h-0 focus-visible:outline-none"
        >
          <ProgrammingTab
            client={client}
            coverage={clientCoverage}
            clientId={clientId || ""}
            routines={routines}
            machines={machines}
            floorMachines={codexFloor}
            clientSettings={clientSettings}
            clientBodyWeight={parseInt(client?.weight || "150", 10)}
            allLogs={allLogs}
            sessions={sessions}
            adjustments={routineAdjustments}
            trainers={trainers}
            studioClients={clients}
            authTrainer={authTrainer}
            activeStudioId={activeStudioId}
            selectedRoutineTodayId={selectedRoutineTodayId}
            isBActive={!!client?.isRoutineBActive}
            view={nav.programmingView}
            onViewChange={nav.setProgrammingView}
            onEdit={(name) => setEditRoutineTarget(name)}
            onToggleB={handlePromptToggleB}
            onSelectMachine={openMachineWindow}
            machineMenuHost={machineMenuHost}
            disabled={!!hasQuotaError}
            plan={planHost}
          />

          {/* Dialog for turning Routine B on or off: the reason is asked,
              never required (the first-session design round, Oct 8 2026). */}
          <Dialog
            open={isToggleReasonDialogOpen}
            onOpenChange={(open) => {
              if (open) setIsToggleReasonDialogOpen(true);
              else toggleBUnsaved.guard(() => setIsToggleReasonDialogOpen(false));
            }}
          >
            <DialogContent
              showCloseButton={false}
              className="rounded-2xl max-w-md p-6 bg-card border-slate-200 dark:border-slate-800"
            >
              <DialogHeader>
                <DialogTitle className="text-foreground">
                  {pendingToggleBValue ? "Turn Routine B on" : "Turn Routine B off"}
                </DialogTitle>
                <DialogDescription className="text-[14px] text-muted-foreground mt-1">
                  Why? It helps the next trainer. Optional.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <Textarea
                  value={toggleBReason}
                  onChange={(e) => setToggleBReason(e.target.value)}
                  placeholder="Optional"
                  aria-label="Why"
                  rows={3}
                  className="rounded-xl border-input bg-slate-50/50 dark:bg-slate-950/20 text-[14px] text-slate-800 dark:text-neutral-200 resize-none"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-div-l/40 pt-4">
                <Button
                  variant="ghost"
                  onClick={() => toggleBUnsaved.guard(() => setIsToggleReasonDialogOpen(false))}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    toggleBUnsaved.release();
                    void handleConfirmToggleB();
                  }}
                  disabled={isSavingToggle}
                  className="bg-primary text-primary-foreground hover:bg-primary rounded-xl"
                >
                  {isSavingToggle ? "Saving..." : "Confirm switch"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Plan B (Round 2, B molded in): Routine B starts as A with one
              machine different. Mounted only while open, so a draft lives
              as long as the sheet does. Start B is ONE batch, never awaited
              (routine-plan/store.ts startRoutineB, through usePlanActions). */}
          <ProfilePlanB
            bSwitch={bSwitch}
            routines={routines}
            floor={codexFloor}
            machines={machines}
            sessions={sessions}
            sessionsComplete={!hasMoreSessions}
            coverage={clientCoverage}
            who={planHost.who}
            todayYmd={planToday}
            actions={planActions}
            onError={toastError}
          />

          {/* Edit Routine drawer — widened, with in-drawer A/B switching,
              a horizontal filter row, and two-tier Preset Routines. Lives in
              its own file now; this just mounts it and hands back the fresh
              routines list on save so the cards above stay in sync. */}
          <EditRoutineDrawer
            client={client || null}
            clientId={clientId}
            routines={routines}
            machines={machines}
            activeStudioId={activeStudioId}
            studioName={studios?.find((s) => s.id === activeStudioId)?.name}
            authTrainer={authTrainer}
            allLogs={allLogs}
            sessions={sessions}
            coverage={clientCoverage}
            target={editRoutineTarget}
            onClose={() => setEditRoutineTarget(null)}
            onSaved={(updated) => setRoutines(updated)}
            onRequestActivateRoutineB={() => handlePromptToggleB(true)}
          />
        </TabsContent>

        {/* ---------------- 3 · NOTES & PROFILE ---------------- */}
        {/* The client codex (Sep 2026): an Overview and six pages instead of
            the long scroll — features/client-codex. Keyed on the client, so
            another client starts fresh; kept mounted after its first visit,
            so coming back re-reads nothing and an unsaved edit survives a
            trip to Journey. Natural height; the page scrolls. */}
        <TabsContent
          value="record"
          keepMounted={recordMounted}
          className="mt-0 focus-visible:outline-none"
        >
          {client && client.id && (recordMounted || activeTab === "record") && (
            // Kept mounted across a tab change, so the tab bar never asks about
            // the record's Save bar; leaving the profile still does.
            <ExemptFromLeaveScope scope={tabsScope}>
              <ClientCodex
                key={client.id}
                client={client}
                authTrainer={authTrainer ?? null}
                liveTrainer={liveAuthTrainer}
                machines={machines}
                trainers={trainers}
                page={nav.recordPage}
                anchor={nav.recordAnchor}
                navStamp={nav.location}
                active={activeTab === "record"}
                onNavigate={nav.openRecord}
                progressReports={progressReports}
                progressReportsStatus={progressReportsStatus}
                sessionTotals={codexSessionTotals}
                coverage={clientCoverage}
                hosts={codexHosts}
                programming={codexProgramming}
              />
            </ExemptFromLeaveScope>
          )}
        </TabsContent>

        {/* ---------------- 4 · ACTIVITY ARCHIVE ---------------- */}
        {/* Clinical and History, which were two tabs over the same past
            (the tab was Clinical History until Sep 16; its id is still
            `clinical`). Calendar and Sessions are promoted out of History's
            own switch into this tab's sub-toggle, so there is one switch on
            the screen rather than one inside another. Nothing in the Deep
            Dive (view id `trends`) loads until the trainer asks for it. No `overflow-y-auto`
            and no bounded height here — the PAGE scrolls, which is what lets
            the year and month headers stay pinned while you read. */}
        <TabsContent
          value="clinical"
          className="mt-0 pb-8 min-h-125 focus-visible:outline-none"
        >
          {clientId && (
            <ClinicalHistoryTab
              clientId={clientId}
              client={client}
              machines={machines}
              trainers={trainers}
              routines={routines}
              seedLogs={allLogs}
              timeZone={
                studios?.find((s) => s.id === client?.homeStudioId)?.timezone ||
                undefined
              }
              progressReports={progressReports}
              onSelectReport={onSelectReport}
              onDeleteReport={setReportToDelete}
              onNewReport={onNewReport}
              reportsReady={progressReportsStatus === "ready"}
              onSetNoProgressReports={
                canEditPrior && clientId
                  ? async (off: boolean) => {
                      try {
                        await updateDoc(doc(db, "clients", clientId), { noProgressReports: off, updatedAt: serverTimestamp() });
                      } catch (error) {
                        handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
                      }
                    }
                  : undefined
              }
              onEditMedical={() => nav.openRecord("body", "body-watchouts")}
              view={nav.clinicalView}
              onViewChange={nav.setClinicalView}
              onHistoryChanged={onArchiveHistory}
              disabled={!!hasQuotaError}
            />
          )}
        </TabsContent>
        {/* Two dead panes stood here until the profile merge: `statistics_disabled`
            (~1,100 lines) and `details_disabled` (~880) — the pre-dossier
            settings form. Neither had a trigger with its value, so neither had
            been reachable for months, and together they were roughly half this
            file. Deleted; git has them if anything is ever wanted back. */}
      </Tabs>
      </UnsavedChangesScope>

      {/* In the profile's frame, not inside the Programming panel (session
          record, Sep 26 2026): the tabs mount only the panel on screen, so
          from Journey, Notes & Profile or the Activity Archive the header's
          Discard and the notice's "Discard it" did nothing, and the question
          appeared later, on Programming. */}
      {/* Discard Session confirmation (round: Discard Session option) —
          same delete sequence, same "are you sure" pattern as
          WorkoutTrackerView's own Scrap Session dialog, just reachable
          from the profile's In-Progress dropdown so a trainer can clear
          a stuck/abandoned session without opening it first. */}
      <Dialog
        open={!!discardTarget}
        onOpenChange={(v) => !isDiscardingActiveSession && !v && setDiscardTarget(null)}
      >
        <DialogContent className="sm:max-w-100 rounded-[32px] p-0 overflow-hidden border-none">
          <div className="bg-card p-8 text-foreground space-y-3">
            <div
              className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-colors",
                isDiscardingActiveSession
                  ? "bg-red-500/20 text-red-500 animate-pulse"
                  : "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]",
              )}
            >
              {isDiscardingActiveSession ? (
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              ) : (
                <Trash2 className="w-6 h-6" />
              )}
            </div>
            <h3 className="text-[22px] font-extrabold tracking-[-0.015em]">
              {isDiscardingActiveSession
                ? "Discarding session..."
                : discardTarget && discardTarget.id !== activeInProgressSession?.id
                  ? "Discard unfinished session?"
                  : "Discard active session?"}
            </h3>
            <p className="text-muted-foreground font-medium text-sm leading-relaxed">
              {isDiscardingActiveSession
                ? "Scrapping all logged sets, timers, and notes. Cleaning database records..."
                : [
                    "This will end and permanently clear this session.",
                    discardTarget ? staleSessionStartedLine(discardTarget, studioTodayKey()) : "",
                    "All data logged in it will be scrapped and will not be recorded in the database.",
                  ]
                    .filter(Boolean)
                    .join(" ")}
            </p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-card border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="outline"
              disabled={isDiscardingActiveSession}
              className="h-14 rounded-2xl"
              onClick={() => setDiscardTarget(null)}
            >
              Keep session
            </Button>
            <Button
              disabled={isDiscardingActiveSession}
              className="h-14 rounded-2xl bg-red-600 text-white shadow-(--elev-1) hover:bg-red-700 disabled:opacity-80 flex items-center justify-center gap-2"
              onClick={handleDiscardActiveSession}
            >
              {isDiscardingActiveSession ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Discarding...</span>
                </>
              ) : (
                "Discard session"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MachineMenu open={!!machineWindowId} machineId={machineWindowId} onClose={closeMachineWindow} host={machineMenuHost} />

      <Dialog
        open={isEditingSessionCount}
        onOpenChange={openSessionCountEditor}
      >
        <DialogContent
          showCloseButton={false}
          className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-card shadow-2xl p-6 sm:max-w-xs text-foreground"
        >
          <DialogHeader>
            <DialogTitle>
              Sessions before Journey
            </DialogTitle>
            <DialogDescription className="text-[14px] text-muted-foreground">
              What {client.firstName} did before this studio moved onto Journey.
            </DialogDescription>
          </DialogHeader>
          {/* Who said so — and, for anyone the rules will not let write this
              client, whose number it is to change. */}
          {recordedByLine(priorHistory) && (
            <p className="text-[12px] text-muted-foreground">
              {recordedByLine(priorHistory)}
            </p>
          )}
          {!canEditPrior && (
            <p className="rounded-xl border border-border bg-slate-50 dark:bg-slate-800 px-3 py-2 text-[12px] text-slate-600 dark:text-slate-300">
              Read only. Trainers and leaders at{" "}
              {studios?.find((s) => s.id === client.homeStudioId)?.name ?? "their home studio"}{" "}
              can change this.
            </p>
          )}
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[14px] font-bold text-ink-d2">
                Sessions completed before Journey
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                value={sessionCountInput}
                onChange={(e) => setSessionCountInput(e.target.value)}
                disabled={!canEditPrior}
                className="font-bold text-lg h-12 focus-visible:ring-ring disabled:opacity-100"
                placeholder="0"
              />
              {priorReading.ok === false && priorReading.problem && (
                <p className="text-[12px] font-bold text-rose-700 dark:text-rose-400">
                  {priorReading.problem}
                </p>
              )}
              {/* The app adds its own count on top, so the trainer is never
                  asked for a total they would have to work out — and the
                  reconciler can no longer overwrite what they typed. */}
              <p className="text-[12px] text-muted-foreground">
                Journey adds the sessions it has recorded itself. Leave this at 0
                for a client who started here.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-[14px] font-bold text-ink-d2">
                Where that number comes from
              </Label>
              <div className="flex flex-wrap gap-2">
                {PRIOR_SOURCES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPriorSource(s)}
                    disabled={!canEditPrior}
                    aria-pressed={priorSource === s}
                    className={cn(
                      "min-h-10 rounded-xl px-3 text-[12px] font-bold border transition-colors disabled:cursor-default",
                      priorSource === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-(--raised) text-ink-d2",
                    )}
                  >
                    {PRIOR_SOURCE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[14px] font-bold text-ink-d2">
                Counted up to
              </Label>
              <Input
                type="date"
                value={priorThrough}
                onChange={(e) => setPriorThrough(e.target.value)}
                disabled={!canEditPrior}
                className="font-bold h-12 focus-visible:ring-ring disabled:opacity-100"
              />
              <p className="text-[12px] text-muted-foreground">
                Journey owns everything after this day.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-[14px] font-bold text-ink-d2">
                Note <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                value={priorNote}
                onChange={(e) => setPriorNote(e.target.value)}
                disabled={!canEditPrior}
                className="h-12 focus-visible:ring-ring disabled:opacity-100"
                // Read-only, a placeholder would pass for the note itself.
                placeholder={canEditPrior ? "Counted from the FileMaker export" : undefined}
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setIsEditingSessionCount(false)}
                className="flex-1 h-11 rounded-xl"
              >
                {canEditPrior ? "Cancel" : "Close"}
              </Button>
              {canEditPrior && (
                <Button
                  onClick={handleSaveSessionCount}
                  disabled={!priorCanSave}
                  className="flex-2 h-11 bg-primary text-primary-foreground hover:bg-primary rounded-xl"
                >
                  Save
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <StrongConfirmationModal
        isOpen={!!reportToDelete}
        title="Delete Progress Report"
        description="Are you sure you want to delete this progress report? This action is permanent and cannot be undone."
        confirmationPhrase="DELETE REPORT"
        onConfirm={performReportDelete}
        onCancel={() => setReportToDelete(null)}
      />
    </motion.div>
  );
}
