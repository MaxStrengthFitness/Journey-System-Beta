import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { LoadingMark } from "./LoadingMark";
import { createPortal } from "react-dom";
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
import { db } from "../firebase";
import { studioHour, formatStudioTime, studioTodayKey } from "../lib/studio-time";
import {
  PRIOR_SOURCES,
  PRIOR_SOURCE_LABEL,
  priorHistoryLabel,
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
import { ClientMachineWindow } from "../features/equipment";
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
import {
  ClinicalHistoryTab,
  PROFILE_TABS,
  ProgrammingTab,
  defaultProgrammingView,
  useProfileNav,
} from "../features/client-profile";
import { answerFor, type ClientAnswer } from "../features/client-profile/client-answer";
import { useProgressReports } from "../features/client-profile/useProgressReports";
import {
  ClientCodex,
  recordStudioIdOf,
  sessionTotalsOf,
  type CodexHosts,
  type CodexProgramming,
} from "../features/client-codex";
import { coverageOfClient, cutoverOf } from "../lib/client-coverage";
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
import { WorkoutChartGrid } from "./WorkoutChartGrid";
import { useToast } from "../contexts/ToastContext";
import { runMasterSync } from "../lib/mindbody-master-sync";
import { mindbodyIdOf } from "../lib/mindbody-id";
import { masterSyncLabel } from "../features/client-profile/sync-label";
import { StaleSessionNotice } from "../features/client-profile/StaleSessionNotice";
import { forgetLiveSession, staleSessionStartedLine } from "../lib/live-session";
import { StrongConfirmationModal } from "./StrongConfirmationModal";

import {
  cn,
  parseSessionDate,
  orderMachineSettings,
} from "../lib/utils";
import { useActiveSessionCheck } from "../hooks/useActiveSessionCheck";
import { useStudioMachines } from "../hooks/useStudioMachines";
import { resolveMachineOrder } from "../data/machine-display-order";
import {
  RecentJourneyView,
  toJourneyRows,
  toJourneySessions,
} from "../features/journey-grid";
import { EditRoutineDrawer } from "./EditRoutineDrawer";
import {
  ProfileHeader,
  canEditPriorHistory,
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
  renewalPromptDue,
} from "../features/renewals";

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
  onDelete,
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
  onDelete: (id: string) => void;
  onSelectReport: (id: string) => void;
  /** Start a NEW progress report for this client — never reopen the last one. */
  onNewReport: () => void;
  setView: (v: View, data?: { isIntroSession?: boolean }) => void;
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
  const [selectedRoutineTodayId, setSelectedRoutineTodayId] = useState<
    string | null
  >(null);

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
  const [showFullChart, setShowFullChart] = useState(false);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [lastVisibleSession, setLastVisibleSession] = useState<any>(null);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  /* True from the first sessions query until its set logs are merged in,
     so the Journey grid can show the loading mark instead of empty cells
     (the sessions arrive a moment before their sets do). */
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [calculatedSessionCount, setCalculatedSessionCount] =
    useState<number>(0);
  /*
   * What Journey itself holds — completed sessions in Journey, before any
   * prior history — stamped with the client it was counted for (client
   * codex). `calculatedSessionCount` above starts at 0 and keeps the last
   * client's total until the next count lands, so it cannot say "not known
   * yet"; this can. Null until the count query answers for THIS client.
   */
  const [journeyCountRead, setJourneyCountRead] =
    useState<ClientAnswer<number> | null>(null);
  const journeyCompletedCount = answerFor(journeyCountRead, clientId);

  // Use the new soft lock handoff hook
  const { activeInProgressSession, staleInProgressSession, isCheckingActiveSession } =
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
  const { byId: studioFloorById } = useStudioMachines(activeStudioId);

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
  const priorLabel = priorHistoryLabel(priorHistory);
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
   * and to every page of Notes & Profile. The home is read as the rules read
   * it (`recordStudioIdOf`: `homeStudioId`, else the older `studioId`).
   *
   * The floor screens (the Active Session, the Clients list) still pass the
   * cutover of the studio the iPad is at, so for a cross-train client the
   * two can word coverage differently until they move to the home too.
   */
  const journeyCutover = cutoverOf(studios, recordStudioIdOf(client));
  const clientCoverage = useMemo(
    () => coverageOfClient(client, journeyCutover),
    [client, journeyCutover],
  );

  const clientSessionCountRef = useRef<number | undefined>(client?.sessionCount);
  useEffect(() => {
    clientSessionCountRef.current = client?.sessionCount;
  }, [client?.sessionCount]);

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

      setCalculatedSessionCount(total);

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
   * lives in one reducer: see features/client-profile/profile-nav.ts. It also
   * resumes per client, which is why walking to the Journey grid and back
   * lands on the routine you were reading rather than resetting to A.
   */
  const nav = useProfileNav(clientId, {
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
   * 2026) — the All Machines and Trends precedent. Returning to the tab
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

  const [isDeleting, setIsDeleting] = useState(false);
  /** The machine open in the one machine window (Journey grid, Routine A / B rows). */
  const [machineWindowId, setMachineWindowId] = useState<string | null>(null);

  /*
   * SESSIONS BEFORE JOURNEY (Sep 24 2026). The header's Completed sessions
   * tile is the door; anyone the clients/{id} update rule lets write this
   * client edits, anyone else reads. features/client-profile/prior-history-door.ts.
   */
  const canEditPrior = canEditPriorHistory(liveAuthTrainer, client);
  const priorDoorText = priorHistoryDoorText(priorHistory, canEditPrior);
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
      const draft = draftFromPrior(priorHistory, studioTodayKey());
      setSessionCountInput(draft.sessions);
      setPriorSource(draft.source);
      setPriorThrough(draft.through);
      setPriorNote(draft.note);
    }
    setIsEditingSessionCount(open);
  };

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

  useEffect(() => {
    if (activeInProgressSession?.routineId) {
      setSelectedRoutineTodayId(activeInProgressSession.routineId);
    } else if (client?.preferredTodayRoutineId) {
      setSelectedRoutineTodayId(client.preferredTodayRoutineId);
    } else {
      setSelectedRoutineTodayId(null);
    }
  }, [activeInProgressSession?.routineId, client?.preferredTodayRoutineId]);

  const handlePromptToggleB = (checked: boolean) => {
    setPendingToggleBValue(checked);
    setToggleBReason("");
    setIsToggleReasonDialogOpen(true);
  };

  const handleConfirmToggleB = async () => {
    if (pendingToggleBValue === null || !clientId) return;
    if (toggleBReason.trim().length < 3) return;

    setIsSavingToggle(true);
    try {
      await updateDoc(doc(db, "clients", clientId), {
        isRoutineBActive: pendingToggleBValue,
      });

      const routineName = "Routine B";
      let routine = routines.find((r) => r.name === routineName);
      let routineId = routine?.id || "temp-b";

      if (routineId === "temp-b") {
        const docRef = await addDoc(collection(db, "routines"), {
          clientId,
          name: routineName,
          machineIds: [],
          createdAt: serverTimestamp(),
          studioId: client?.homeStudioId || activeStudioId || "",
        });
        routineId = docRef.id;
      }

      await addDoc(collection(db, "routineAdjustments"), {
        clientId,
        routineId,
        previousMachineIds: routine?.machineIds || [],
        newMachineIds: routine?.machineIds || [],
        trainerId: authTrainer?.id || "unknown",
        notes: toggleBReason,
        studioId: client?.homeStudioId || activeStudioId || "",
        changeType: pendingToggleBValue ? "enabled" : "disabled",
        createdAt: serverTimestamp(),
      });

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

  const handleUseToday = async (routine: Routine) => {
    if (!clientId) return;

    let rotId = routine.id;
    if (rotId.startsWith("temp-")) {
      const rotName = rotId === "temp-a" ? "Routine A" : "Routine B";
      const docRef = await addDoc(collection(db, "routines"), {
        clientId,
        name: rotName,
        machineIds: [],
        createdAt: serverTimestamp(),
        studioId: client?.homeStudioId || activeStudioId || "",
      });
      rotId = docRef.id;

      const qRoutines = query(
        collection(db, "routines"),
        where("clientId", "==", clientId),
      );
      const snap = await getDocs(qRoutines);
      setRoutines(
        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Routine),
      );
    }

    try {
      await updateDoc(doc(db, "clients", clientId), {
        preferredTodayRoutineId: rotId,
      });

      if (activeInProgressSession?.id) {
        await updateDoc(doc(db, "sessions", activeInProgressSession.id), {
          routineId: rotId,
        });
      }

      setSelectedRoutineTodayId(rotId || null);
    } catch (err) {
      console.error("Error setting routine today:", err);
    }
  };

  const fetchLogsForSessions = async (sessionIds: string[]) => {
    if (sessionIds.length === 0) return [];
    const chunks = [];
    for (let i = 0; i < sessionIds.length; i += 10) {
      chunks.push(sessionIds.slice(i, i + 10));
    }
    let fetchedLogs: ExerciseLog[] = [];
    for (const chunk of chunks) {
      const qs = query(
        collection(db, "exerciseLogs"),
        where("sessionId", "in", chunk),
      );
      const snap = await getDocs(qs);
      fetchedLogs = [
        ...fetchedLogs,
        ...snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as ExerciseLog,
        ),
      ];
    }
    return fetchedLogs;
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

  useEffect(() => {
    if (!clientId || hasQuotaError) return;

    // The Journey grid and the Activity Archive's calendar both read this page of
    // sessions. Programming and the record do not, so they still cost nothing.
    if (activeTab !== "journey" && activeTab !== "clinical") {
      return;
    }

    const fetchInitialSessions = async () => {
      setIsLoadingSessions(true);
      try {
        // 2. Firebase Query Limits & Pagination
        // The first page is 15 sessions: the Journey grid shows fourteen
        // columns at once (Sep 2026 density round) and the fifteenth keeps
        // the trend glyph on the oldest visible column honest.
        const sessionsQuery = query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          orderBy("date", "desc"),
          limit(SESSION_PAGE),
        );

        const sessionSnap = await getDocs(sessionsQuery);
        const docs = sessionSnap.docs;

        if (!docs.length) {
          setSessions([]);
          setAllLogs([]);
          setHasMoreSessions(false);
          return;
        }

        setLastVisibleSession(docs[docs.length - 1]);
        setHasMoreSessions(docs.length === SESSION_PAGE);

        const liveSessionsData = docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
        );

        // Merge gracefully to not erase older paginated history if coach loaded more
        setSessions((prev: WorkoutSession[]) => {
          const merged = new Map(prev.map((s) => [s.id, s]));
          liveSessionsData.forEach((s) => merged.set(s.id, s));
          const finalArr = Array.from(merged.values());
          finalArr.sort(
            (a, b) => parseSessionDate(b.date) - parseSessionDate(a.date),
          );
          return finalArr;
        });

        const sessionIds = liveSessionsData.map((s) => s.id!).filter(Boolean);
        const newLogs = await fetchLogsForSessions(sessionIds);

        setAllLogs((prev) => {
          const merged = new Map(prev.map((l) => [l.id, l]));
          newLogs.forEach((l) => merged.set(l.id, l));
          return Array.from(merged.values());
        });
      } catch (error: any) {
        handleFirestoreError(error, OperationType.GET, "sessions");
      } finally {
        setIsLoadingSessions(false);
      }
    };

    fetchInitialSessions();
  }, [clientId, activeTab, hasQuotaError]);

  const handleLoadMoreHistory = async () => {
    if (!lastVisibleSession || !hasMoreSessions || isLoadingMore || !clientId)
      return;
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
      if (snap.empty) {
        setHasMoreSessions(false);
        return;
      }

      setLastVisibleSession(snap.docs[snap.docs.length - 1]);
      setHasMoreSessions(snap.docs.length === SESSION_PAGE);

      const moreSessionsData = snap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
      );

      const sessionIds = moreSessionsData.map((s) => s.id!).filter(Boolean);
      const moreLogs = await fetchLogsForSessions(sessionIds);

      setSessions((prev) => {
        const out = [...prev, ...moreSessionsData].sort(
          (a, b) => parseSessionDate(b.date) - parseSessionDate(a.date),
        );
        return Array.from(new Map(out.map((s) => [s.id, s])).values());
      });
      setAllLogs((prev) => [...prev, ...moreLogs]);
    } catch (err) {
      console.error("Error loading older history", err);
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
    const totalRecords = Math.max(calculatedSessionCount, sessions.length);
    return toJourneySessions(
      sessions.map((s, idx) => ({ ...s, sessionNumber: totalRecords - idx })),
    );
  }, [sessions, calculatedSessionCount]);

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

  const journeyGridRows = useMemo(() => {
    const ordered = [...machines].sort(
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
    const currentStudio = studios?.find((st) => st.id === activeStudioId);
    // Marker 7: the Big Five star is gone from the grid. Every machine in
    // this method is a core lift; a star on five of them said the other
    // sixteen were optional, which is not what the prescription means.
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
          alert: !!clientSettings[machine.id!]?.machineNotes?.some(
            (n) => n.isImportant,
          ),
        },
      };
    });
  }, [
    machines,
    allLogs,
    clientSettings,
    studioFloorById,
    studios,
    activeStudioId,
  ]);

  /**
   * Tapping a machine — its name on the Journey grid, or its row in Routine
   * A / B — opens the one machine window: the same detail Programming → All
   * Machines shows, writing through features/equipment/mutations.ts.
   */
  const openMachineWindow = useCallback((machineId: string) => {
    setMachineWindowId(machineId);
  }, []);
  const closeMachineWindow = useCallback(() => setMachineWindowId(null), []);

  /*
   * NOTES & PROFILE (the client codex) — what it is handed from here.
   *
   * The doors that leave the tab belong to this view, which owns the other
   * tabs and the app's view: the Planner, the archive's reports, a machine,
   * the Set-up, and the Migration Hub. The Hub switches to Journey first, as
   * the old record's did, because imported sessions land there. (The filed
   * reports are the Activity Archive's shelf, below; the codex opens none.)
   *
   * The session numbers are the header's own ("461 · 49 in Journey · 412
   * before"), so no page can disagree with it; Journey's count is null until
   * it answers for this client.
   */
  const codexHosts = useMemo<CodexHosts>(
    () => ({
      onOpenPlanner: () => setView("studio-tasks"),
      onOpenReports: () => nav.go({ tab: "clinical", view: "reports" }),
      onOpenMigrationHub: () => {
        nav.setTab("journey");
        window.dispatchEvent(new CustomEvent("open-bulk-import"));
      },
      onOpenMachine: openMachineWindow,
      onOpenSetup: () => nav.go({ tab: "programming", view: "setup" }),
    }),
    // nav's callbacks are stable (useCallback with no deps in useProfileNav).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setView, openMachineWindow, nav.go, nav.setTab],
  );
  // What Programming already holds, for Body & Pulse's floor (her notes per
  // machine, and machine fit's "clients built like her") — no read of its own.
  const codexProgramming = useMemo<CodexProgramming>(
    () => ({
      clientSettings,
      routines,
      studioClients: clients,
      activeStudioId: activeStudioId ?? null,
      status:
        routinesStatus === "failed" || settingsStatus === "failed"
          ? "failed"
          : routinesStatus === "loading" || settingsStatus === "loading"
            ? "loading"
            : "ready",
    }),
    [clientSettings, routines, clients, activeStudioId, routinesStatus, settingsStatus],
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
  // it lands (or if it fails) the banner says nothing.
  const [reportProbe, setReportProbe] = useState<{ clientId: string; latest: ProgressReport | null } | null>(null);
  useEffect(() => {
    if (!clientId || hasQuotaError || !user) return;
    let live = true;
    getDocs(
      query(
        collection(db, "progressReports"),
        where("clientId", "==", clientId),
        orderBy("createdAt", "desc"),
        limit(1),
      ),
    )
      .then((snap) => {
        if (!live) return;
        const d = snap.docs[0];
        setReportProbe({ clientId, latest: d ? ({ id: d.id, ...d.data() } as ProgressReport) : null });
      })
      .catch((err) => console.warn("[report banner] latest report read failed", err));
    return () => {
      live = false;
    };
  }, [clientId, hasQuotaError, user?.uid]);

  useEffect(() => {
    if (!clientId || !user) return;
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
        setScheduledSessions(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as ScheduleEntry,
          ),
        );
      } catch (error: any) {
        handleFirestoreError(error, OperationType.GET, "schedules");
      }
    };
    fetchSchedules();
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-350 mx-auto space-y-2 pb-8 px-2 sm:px-4 bg-slate-50 dark:bg-slate-950 min-h-screen pt-4"
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
              <div className="bg-[#5BC0BE]/10 border-2 border-[#5BC0BE]/20 rounded-3xl p-4 flex items-center gap-4 text-[#5BC0BE]">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-bold uppercase tracking-tight">
                    Profile Setup Needed
                  </p>
                  <p className="text-[11px] font-bold opacity-80 uppercase tracking-widest mt-0.5">
                    Set up their routine in the 'Equipment' tab or head to
                    profile details to build their profile.
                  </p>
                </div>
              </div>
            </motion.div>
          );
        }

        // The live shelf when it is loaded for this client, else the probe;
        // neither yet means unknown, and unknown shows nothing.
        const latestReport =
          progressReports.find((r) => r.clientId === clientId) ??
          (reportProbe?.clientId === clientId ? reportProbe.latest : undefined);
        if (latestReport === undefined) return null;

        if (latestReport === null) {
          // Only show "Report Required" if client is older than 3 months
          const clientCreatedAt =
            client.createdAt?.toDate?.() ||
            (client.createdAt ? new Date(client.createdAt) : new Date());
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

          if (clientCreatedAt > threeMonthsAgo) {
            return null;
          }

          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
            >
              <div className="bg-red-500/10 border-2 border-red-500/20 rounded-3xl p-4 flex items-center gap-4 text-red-600">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-tight">
                    Report Required
                  </p>
                  <p className="text-[11px] font-bold opacity-80">
                    This client has no progress report on file. Please perform
                    an evaluation.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="ml-auto text-[11px] font-medium uppercase hover:bg-red-500/10"
                  onClick={onNewReport}
                >
                  Start Now
                </Button>
              </div>
            </motion.div>
          );
        }

        const lastDate = new Date(parseSessionDate(latestReport.date));
        const nextDueDate = new Date(lastDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + 3);

        const today = new Date();
        const diffTime = nextDueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 21) {
          const isOverdue = diffDays < 0;
          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
            >
              <div
                className={`${isOverdue ? "bg-red-500/10 border-red-200 text-red-600" : "bg-amber-500/10 border-amber-200 text-amber-600"} border-2 rounded-3xl p-4 flex items-center gap-4`}
              >
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-tight">
                    {isOverdue ? "Progress report overdue" : "Progress report due soon"}
                  </p>
                  <p className="text-[11px] font-bold opacity-80">
                    {isOverdue
                      ? `The 3-month progress report was due ${nextDueDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} (${-diffDays} day${diffDays === -1 ? "" : "s"} ago).`
                      : `The next progress report is due ${nextDueDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} (in ${diffDays} day${diffDays === 1 ? "" : "s"}).`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className={`ml-auto text-[11px] font-medium uppercase ${isOverdue ? "hover:bg-red-500/10" : "hover:bg-amber-500/10"}`}
                  onClick={onNewReport}
                >
                  Schedule Report
                </Button>
              </div>
            </motion.div>
          );
        }
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
        completedCount={calculatedSessionCount}
        priorLabel={priorLabel}
        priorHistoryDoor={
          priorDoorText
            ? {
                text: priorDoorText,
                canEdit: canEditPrior,
                onOpen: () => openSessionCountEditor(true),
              }
            : undefined
        }
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
        onTakeOverSession={() => {
          if (activeInProgressSession?.id) {
            localStorage.setItem(
              "max_strength_active_session_id",
              activeInProgressSession.id,
            );
          }
          setView("workouts");
        }}
        onViewCurrentSession={() => setView("workouts")}
        onDiscardSession={() => setDiscardTarget(activeInProgressSession)}
        renewal={
          client.renewal
            ? {
                text: chipText(client.renewal, studioTodayKey()),
                tone: SITUATION_TONE[client.renewal.situation],
                attention: renewalPromptDue(client.renewal),
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
            was: ~208px each at 834pt portrait, where "NOTES & PROFILE" fits
            at 13px with space to spare. `truncate` is the belt to that
            suspender. The sub-toggle inside Programming and the Activity Archive
            is the level below this one; see features/client-profile. */}
        <div className="mb-2 w-full">
          <div className="w-full pb-0.5">
            <TabsList className="bg-slate-100 dark:bg-slate-800/60 p-1 grid grid-cols-4 w-full h-12! rounded-xl gap-1">
              {PROFILE_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  title={tab.blurb}
                  className="relative w-full h-10! px-1 sm:px-2 font-display italic text-[11px] sm:text-[13px] font-bold uppercase tracking-wide sm:tracking-widest text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-[#F06C22] dark:data-[state=active]:text-[#F06C22] data-[state=active]:shadow-sm transition-all text-center cursor-pointer select-none rounded-lg truncate flex items-center justify-center"
                >
                  {tab.label}
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
            onLoadMore={handleLoadMoreHistory}
            loading={isLoadingSessions}
            loadingMore={isLoadingMore}
            resetKey={clientId ?? null}
            layout="page"
            routineAMachineIds={routineAMachineIds}
            routineBMachineIds={routineBMachineIds}
            onOpenMachine={openMachineWindow}
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
            onUseToday={handleUseToday}
            onToggleB={handlePromptToggleB}
            onSelectMachine={openMachineWindow}
            disabled={!!hasQuotaError}
          />

          {/* Dialog/Modal for Routine B Toggle Reason */}
          <Dialog
            open={isToggleReasonDialogOpen}
            onOpenChange={setIsToggleReasonDialogOpen}
          >
            <DialogContent
              showCloseButton={false}
              className="rounded-2xl max-w-md p-6 bg-card border-slate-200 dark:border-slate-800"
            >
              <DialogHeader>
                <DialogTitle className="text-lg font-bold uppercase tracking-tight text-slate-950 dark:text-white font-display italic">
                  Reason Required for Protocol B Change
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  Please provide a brief justification to explain why you are{" "}
                  {pendingToggleBValue ? "enabling" : "disabling"} the optional
                  Routine B protocol for {client?.firstName}.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <Textarea
                  value={toggleBReason}
                  onChange={(e) => setToggleBReason(e.target.value)}
                  placeholder="e.g., Sandra is experiencing shoulder tightness; setting up B as a low-impact chest day."
                  rows={3}
                  className="rounded-xl border-div-l bg-slate-50/50 dark:bg-slate-950/20 text-xs text-slate-800 dark:text-neutral-200 resize-none"
                />
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-muted-foreground font-medium">
                    Be brief and clinical for Sandra's logs.
                  </span>
                  <span
                    className={cn(
                      "font-semibold tracking-wide",
                      toggleBReason.trim().length >= 3
                        ? "text-emerald-500"
                        : "text-amber-500",
                    )}
                  >
                    {toggleBReason.trim().length >= 3 ? "✓ Reason captured" : "Reason required"}
                  </span>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-div-l/40 pt-4">
                <Button
                  variant="ghost"
                  onClick={() => setIsToggleReasonDialogOpen(false)}
                  className="rounded-xl uppercase font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmToggleB}
                  disabled={toggleBReason.trim().length < 3 || isSavingToggle}
                  className="bg-cta text-white hover:bg-cta-strong rounded-xl uppercase font-bold text-xs shadow-md shadow-cta/15"
                >
                  {isSavingToggle ? "Saving..." : "Confirm Switch"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Discard Session confirmation (round: Discard Session option) —
              same delete sequence, same "are you sure" pattern as
              WorkoutTrackerView's own Scrap Session dialog, just reachable
              from the profile's In-Progress dropdown so a trainer can clear
              a stuck/abandoned session without opening it first. */}
          <Dialog
            open={!!discardTarget}
            onOpenChange={(v) => !isDiscardingActiveSession && !v && setDiscardTarget(null)}
          >
            <DialogContent className="sm:max-w-100 rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none">
              <div className="bg-white dark:bg-bg-dark p-8 text-foreground space-y-3">
                <div
                  className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-all",
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
                <h3 className="text-2xl font-black italic uppercase tracking-tight">
                  {isDiscardingActiveSession
                    ? "Discarding Session..."
                    : discardTarget && discardTarget.id !== activeInProgressSession?.id
                      ? "Discard Unfinished Session?"
                      : "Discard Active Session?"}
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
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white dark:bg-bg-dark border-t border-slate-100 dark:border-slate-800">
                <Button
                  variant="outline"
                  disabled={isDiscardingActiveSession}
                  className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-2 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-surface-2 disabled:opacity-50"
                  onClick={() => setDiscardTarget(null)}
                >
                  Keep Session
                </Button>
                <Button
                  disabled={isDiscardingActiveSession}
                  className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs bg-red-600 text-white shadow-lg shadow-red-200 dark:shadow-none hover:bg-red-700 disabled:opacity-80 flex items-center justify-center gap-2"
                  onClick={handleDiscardActiveSession}
                >
                  {isDiscardingActiveSession ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Discarding...</span>
                    </>
                  ) : (
                    "Discard Session"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

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
          )}
        </TabsContent>

        {/* ---------------- 4 · CLINICAL HISTORY ---------------- */}
        {/* Clinical and History, which were two tabs over the same past.
            Calendar and Sessions are promoted out of History's own switch
            into this tab's sub-toggle, so there is one switch on the screen
            rather than one inside another. Nothing in Trends loads until the
            trainer presses Generate, exactly as before. No `overflow-y-auto`
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
              onEditMedical={() => nav.openRecord("body", "body-watchouts")}
              view={nav.clinicalView}
              onViewChange={nav.setClinicalView}
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

      {showFullChart &&
        clientId &&
        createPortal(
          <WorkoutChartGrid
            clientId={clientId}
            clients={clients}
            machines={machines}
            routines={routines}
            onBack={() => setShowFullChart(false)}
            user={user}
            preloadedSessions={sessions}
            preloadedLogs={allLogs}
            onLoadMoreHistory={handleLoadMoreHistory}
            studios={studios}
            activeStudioId={activeStudioId}
          />,
          document.body,
        )}

      <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
        <DialogContent
          showCloseButton={false}
          className="rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-2xl p-0 overflow-hidden max-w-sm bg-card text-foreground"
        >
          <div className="bg-red-600 p-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold uppercase italic tracking-tighter leading-none">
                Confirm Deletion
              </h2>
              <p className="text-[11px] font-medium uppercase tracking-wide opacity-70 mt-2">
                This action is permanent
              </p>
            </div>
          </div>
          <div className="p-8 space-y-6 text-center bg-card">
            <p className="text-sm font-medium text-muted-foreground leading-relaxed">
              Are you absolutely sure you want to delete{" "}
              <span className="font-bold text-foreground">
                {" "}
                {client.firstName} {client.lastName}'s
              </span>{" "}
              profile? All historical session data and machine settings will be
              lost.
            </p>
            <div className="flex flex-col gap-3">
              <Button
                variant="destructive"
                className="h-14 rounded-full font-bold uppercase italic tracking-widest text-xs shadow-xl shadow-red-200"
                onClick={() => {
                  if (client.id) onDelete(client.id);
                  setIsDeleting(false);
                }}
              >
                Delete Everything
              </Button>
              <Button
                variant="ghost"
                className="h-12 rounded-full font-bold text-muted-foreground"
                onClick={() => setIsDeleting(false)}
              >
                Go Back
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ClientMachineWindow
        open={!!machineWindowId}
        onClose={closeMachineWindow}
        clientId={clientId || ""}
        client={client}
        machineId={machineWindowId}
        machines={machines}
        clientSettings={clientSettings}
        allLogs={allLogs}
        sessions={sessions}
        authTrainer={authTrainer}
        activeStudioId={activeStudioId}
      />

      <Dialog
        open={isEditingSessionCount}
        onOpenChange={openSessionCountEditor}
      >
        <DialogContent
          showCloseButton={false}
          className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-card shadow-2xl p-6 sm:max-w-xs text-foreground"
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold uppercase italic tracking-tighter">
              Sessions before Journey
            </DialogTitle>
            <DialogDescription className="text-xs uppercase tracking-widest text-[#38BDF8] font-bold">
              What {client.firstName} did before this studio moved onto Journey.
            </DialogDescription>
          </DialogHeader>
          {/* Who said so — and, for anyone the rules will not let write this
              client, whose number it is to change. */}
          {recordedByLine(priorHistory) && (
            <p className="text-[11px] text-muted-foreground">
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
              <Label className="font-bold text-xs uppercase tracking-widest">
                Sessions completed before Journey
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                value={sessionCountInput}
                onChange={(e) => setSessionCountInput(e.target.value)}
                disabled={!canEditPrior}
                className="bg-slate-50 dark:bg-slate-800 border-border font-bold text-lg h-12 focus-visible:ring-[#38BDF8] disabled:opacity-100"
                placeholder="0"
              />
              {priorReading.ok === false && priorReading.problem && (
                <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400">
                  {priorReading.problem}
                </p>
              )}
              {/* The app adds its own count on top, so the trainer is never
                  asked for a total they would have to work out — and the
                  reconciler can no longer overwrite what they typed. */}
              <p className="text-[11px] text-muted-foreground">
                Journey adds the sessions it has recorded itself. Leave this at 0
                for a client who started here.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-xs uppercase tracking-widest">
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
                      "min-h-10 rounded-xl px-3 text-[11px] font-bold uppercase tracking-widest border transition-colors disabled:cursor-default",
                      priorSource === s
                        ? "border-[#38BDF8] bg-[#38BDF8]/15 text-[#0284c7] dark:text-[#8cc4f2]"
                        : "border-border bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
                    )}
                  >
                    {PRIOR_SOURCE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-xs uppercase tracking-widest">
                Counted up to
              </Label>
              <Input
                type="date"
                value={priorThrough}
                onChange={(e) => setPriorThrough(e.target.value)}
                disabled={!canEditPrior}
                className="bg-slate-50 dark:bg-slate-800 border-border font-bold h-12 focus-visible:ring-[#38BDF8] disabled:opacity-100"
              />
              <p className="text-[11px] text-muted-foreground">
                Journey owns everything after this day.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-xs uppercase tracking-widest">
                Note <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                value={priorNote}
                onChange={(e) => setPriorNote(e.target.value)}
                disabled={!canEditPrior}
                className="bg-slate-50 dark:bg-slate-800 border-border h-12 focus-visible:ring-[#38BDF8] disabled:opacity-100"
                // Read-only, a placeholder would pass for the note itself.
                placeholder={canEditPrior ? "Counted from the FileMaker export" : undefined}
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setIsEditingSessionCount(false)}
                className="flex-1 h-11 border-border bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-bold uppercase tracking-widest text-[11px]"
              >
                {canEditPrior ? "Cancel" : "Close"}
              </Button>
              {canEditPrior && (
                <Button
                  onClick={handleSaveSessionCount}
                  disabled={!priorCanSave}
                  className="flex-2 h-11 bg-[#38BDF8] hover:bg-[#0284c7] rounded-full font-bold uppercase tracking-widest text-[11px]"
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
