/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import {
  AlertTriangle,
  LogOut,
  UserCircle,
  Settings,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Building2,
  Search,
  RefreshCw,
  X,
  Calendar as CalendarIcon,
  GraduationCap,
} from "lucide-react";
import { usePhone } from "./features/phone/device";
import { AnimatePresence } from "motion/react";
import {
  collection,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  waitForPendingWrites,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  OAuthProvider,
  User as FirebaseUser,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { db, auth } from "./firebase";
import {
  Trainer,
  Client,
  View,
  Studio,
  FranchiseNetwork,
} from "./types";
import { isSessionValid } from "./lib/utils";
import { coverageOfClient, homeCutoverOf } from "./lib/client-coverage";
import { LoadingArea } from "./components/LoadingMark";
import {
  findMyLiveSession,
  forgetLiveSession,
  myTrainerIds,
  peekLiveSessionId,
} from "./lib/live-session";
import { afterOverlayClose } from "./lib/scroll-lock";
import { installShakeUndoGuard } from "./lib/shake-undo";
import { useToast } from "./contexts/ToastContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import AccessRequestView from "./components/AccessRequestView";
// Lazy-loaded: downloaded on first visit to this view, not at app start.
const TrainerSettingsView = lazy(() =>
  import("./features/settings").then((m) => ({
    default: m.TrainerSettingsView,
  })),
);
// Lazy-loaded: downloaded on first visit to this view, not at app start.
const ClientProfileView = lazy(() =>
  import("./components/ClientProfileView").then((m) => ({
    default: m.ClientProfileView,
  })),
);
// Lazy-loaded: downloaded on first visit to this view, not at app start.
const CalendarView = lazy(() =>
  import("./components/CalendarView").then((m) => ({
    default: m.CalendarView,
  })),
);
// Lazy-loaded: downloaded on first visit to this view, not at app start.
const LegacyChartImporter = lazy(() =>
  import("./features/admin/import/LegacyChartImporter").then((m) => ({
    default: m.LegacyChartImporter,
  })),
);
// Lazy-loaded: downloaded on first visit to this view, not at app start.
// The directory round (Sep 27 2026): one smart table, features/client-directory.
const ClientDirectory = lazy(() =>
  import("./features/client-directory/ClientDirectory").then((m) => ({
    default: m.ClientDirectory,
  })),
);
// Lazy-loaded: downloaded on first visit to this view, not at app start.
const TrainerProfileView = lazy(() =>
  import("./features/trainer-profile").then((m) => ({
    default: m.TrainerProfileView,
  })),
);
import { StudioSelectionView } from "./components/StudioSelectionView";
import {
  getDefaultStudioId,
  setDefaultStudioId,
} from "./lib/default-studio";
import { withoutSuperseded } from "./features/trainer-identity/claim";
// Lazy-loaded: downloaded on first visit to this view, not at app start.

import { AppHeader } from "./components/AppHeader";
import { useTheme } from "./components/ThemeProvider";
import { ClientsView } from "./components/ClientsView";
// Lazy-loaded: downloaded on first visit to this view, not at app start.
// And fetched once in the background after the app opens (new-version round,
// Sep 26 2026: features/new-version/warm-up.ts), with Pulse, so a deploy
// mid-day cannot stop a session from opening. One loader for both.
const loadWorkoutTracker = () =>
  import("./components/WorkoutTrackerView").then((m) => ({
    default: m.WorkoutTrackerView,
  }));
const WorkoutTrackerView = lazy(loadWorkoutTracker);
// Lazy-loaded: downloaded on first visit to this view, not at app start.
const AdminDashboardView = lazy(() =>
  import("./features/admin/AdminDashboardView").then((m) => ({
    default: m.AdminDashboardView,
  })),
);
// The Admins dashboard (Operations overhaul, Sep 2026): where the app is
// managed — administrators and the founder only.
const AdminsDashboardView = lazy(() =>
  import("./features/admins/AdminsDashboardView").then((m) => ({
    default: m.AdminsDashboardView,
  })),
);
import { CreateClientModal } from "./components/CreateClientModal";
// Lazy-loaded: downloaded on first visit to this view, not at app start.
const ClientProgressReportView = lazy(() =>
  import("./components/ClientProgressReportView").then((m) => ({
    default: m.ClientProgressReportView,
  })),
);
// From the modules, not the folder's index, which would pull the editor in.
import {
  reportEditorKey,
  useReportSelection,
} from "./features/progress-report/report-selection";
import { ReportNotOpened } from "./features/progress-report/ReportNotOpened";
import { FeedbackProvider, FeedbackButton } from "./features/feedback";
import { NotificationBell } from "./features/notifications";
import { plannerIntentFromLink, requestPlanner } from "./features/relay/intent";
import { PlannerReminders } from "./features/relay/reminders/PlannerReminders";
import { LeaveConfirmDialog, useGuardedSetter, useGuardedState, useLeaveGuard } from "./features/unsaved-changes";
import { sendSetsNow, signOutQuestion, unsentWritesWaiting } from "./features/session-record/sign-out-check";
// Type-only, and from the module rather than the barrel, so nothing about the
// studio-tasks chunk is pulled into the initial bundle.
import type { ClientTaskAction } from "./features/studio-tasks/types";
// The module, not the barrel: a pure function, for the Pulse task's deep link.
import { openProfileAt, recordLocation } from "./features/client-profile/profile-nav";
import { NAME_SEARCH_PROPS } from "./lib/name-search-input";
/**
 * My Studio (My Studio round, Sep 2026; Relay before that, the Planner and
 * the To-Do screen before those) — the studio's home: Relay (the board),
 * Machines, Team and Studio. The view id is still "studio-tasks", because
 * notifications already stored in trainers' bells link to it.
 */
const MyStudioView = lazy(() =>
  import("./features/my-studio").then((m) => ({
    default: m.MyStudioView,
  })),
);

/*
 * LEARNING — the Catalog, the MSF Academy and (since the Learning + Planner
 * round, Sep 2026) a front page and one search, as one lazy chunk. The
 * Academy's megabyte of generated corpus still loads in its own chunks, on
 * demand. See features/learning/LearningView.
 */
const LearningView = lazy(() =>
  import("./features/learning").then((m) => ({ default: m.LearningView })),
);
import { LoginScreen } from "./components/LoginScreen";
import { ThemeToggle } from "./components/ThemeToggle";
import { isOwner } from "./lib/permissions";
import { HUB_PLACE, mayOpenOperations } from "./features/admin/operations-access";
import { useGuardedPlace } from "./features/admin/useGuardedPlace";
import { isDemoStudioId } from "./features/demo-mode/is-demo";
import { DemoBanner } from "./features/demo-mode/DemoBanner";
import { useNewVersion } from "./features/new-version/useNewVersion";
import { NewVersionLine } from "./features/new-version/NewVersionLine";
import { LoadBoundary, ScreenRecoveryProvider } from "./features/new-version/LoadBoundary";
import { warmUp } from "./features/new-version/warm-up";
import { loadClientCheckInPanel } from "./components/journal/load-check-in-panel";

/*
 * Screens a reload for a new version may put a trainer back on (new-version
 * round, Sep 26 2026: features/new-version, "where you were"). Only screens
 * that stand on their own: the progress report, another trainer's profile, the
 * chart importer and Mindbody each need a choice made on the way in, so a
 * reload from one of them lands on the Hub, as a reload always did.
 */
const RETURNABLE_VIEWS: ReadonlySet<string> = new Set<View>([
  "clients",
  "workouts",
  "calendar",
  "trainer-hub",
  "profile",
  "client-directory",
  "studio-tasks",
  "learning",
  "machine-anatomy",
  "academy",
  "admin-dashboard",
  "admins-dashboard",
]);
const isReturnableView = (view: string) => RETURNABLE_VIEWS.has(view);

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_MACHINES } from "./data/default-machines";

// Shown in the content area while a lazy view downloads on first visit.
const ViewLoader = () => <LoadingArea label="" />;

import { useActiveStudio } from "./contexts/ActiveStudioContext";

import { useAutoSync } from "./features/admin/useAutoSync";
import { useScheduleRefresh } from "./features/admin/useScheduleRefresh";
import { useTrainers } from "./hooks/useTrainers";
import { useStudios } from "./hooks/useStudios";
import { useNetworks } from "./hooks/useNetworks";
import { useMachines } from "./hooks/useMachines";
import { useSessions } from "./hooks/useSessions";
import { useLiveSchedule } from "./hooks/useLiveSchedule";
import { useStudioRoster } from "./hooks/useStudioRoster";
import { useClientMutations } from "./hooks/useClientMutations";
// Pure and tiny, and imported from the module rather than the barrel (the
// Learning tab itself is lazy-loaded): the link format the bell, search and
// notes share.
import { parseLearningRef, type LearningRef } from "./features/learning/ref";
import { rememberMyStudioSection } from "./features/my-studio/section-memory";
import { AppBottomBar } from "./components/AppBottomBar";
import { StatusBarStrip } from "./features/home-screen/StatusBarStrip";

export default function AppContent({
  user,
  authTrainer,
  setAuthTrainer,
  studios,
  setStudios,
  trainers,
  setTrainers,
  networks,
  setNetworks,
  handleLogout,
  tokenRole,
}: {
  user: FirebaseUser;
  authTrainer: Trainer;
  setAuthTrainer: (t: Trainer | null) => void;
  studios: Studio[];
  setStudios: (s: Studio[]) => void;
  trainers: Trainer[];
  setTrainers: (t: Trainer[]) => void;
  networks: FranchiseNetwork[];
  setNetworks: (n: FranchiseNetwork[]) => void;
  handleLogout: () => Promise<void>;
  tokenRole: string | null;
}) {
  const { success: toastSuccess, info: toastInfo } = useToast();
  const { theme } = useTheme();
  const {
    activeStudioId,
    setActiveStudioId,
    isChangingStudio,
    setIsChangingStudio,
    isAdmin,
    setIsAuthenticated,
    availableStudios,
  } = useActiveStudio();

  /**
   * The trainer menu is CONTROLLED so that a menu item which swaps the whole
   * screen can close it first.
   *
   * Every item in this menu changes `currentView` or `isChangingStudio`, and
   * several of those are answered by an early return further down — which
   * would tear the open menu out of the tree mid-close and leave Radix's
   * `pointer-events: none` on <body>. On a PC that is invisible (the wheel
   * still scrolls); on an iPad it freezes the next screen solid, because a
   * touch can no longer hit-test its way to a scroll container. See
   * lib/scroll-lock.ts.
   */
  const [trainerMenuOpen, setTrainerMenuOpen] = useState(false);

  /**
   * Enter the studio pinned on this device, without stopping at the picker.
   *
   * A trainer who works the same floor every day should not have to answer the
   * same question every morning, and a tablet bolted to one studio's wall
   * should just open that studio. Pinning is per-device (see lib/default-studio)
   * and set from the picker itself.
   *
   * Three things keep it from becoming a trap:
   *  - `isChangingStudio` suppresses it, so "switch studio" in the header always
   *    reaches the picker instead of bouncing straight back.
   *  - The pin is re-checked against `availableStudios` every time, so revoked
   *    access, a deleted studio, or a different trainer signing in on this
   *    device falls through to the picker rather than entering somewhere they
   *    are no longer allowed.
   *  - It sets the authentication flags exactly as the picker's own
   *    onSelectTrainer does, so it grants nothing the manual path would not.
   */
  /**
   * SHAKE TO UNDO, off (Sep 17 2026).
   *
   * An iPad carried across the floor gets read as a shake, and iOS puts up
   * "Undo Typing" over whatever the trainer was doing — one tap from rolling
   * back the weight, the note or the name they last typed. The alert belongs
   * to iOS and a web page cannot suppress it, but it can refuse the undo when
   * it is tapped, which is what this does. Installs on iPads only, so Cmd+Z
   * still works on a studio PC. See src/lib/shake-undo.ts; the complete fix is
   * Settings -> Accessibility -> Touch -> Shake to Undo, off, on each iPad.
   */
  useEffect(() => installShakeUndoGuard(), []);

  useEffect(() => {
    if (activeStudioId || isChangingStudio) return;
    if (!authTrainer || studios.length === 0) return;

    const pinned = getDefaultStudioId();
    if (!pinned) return;

    if (!studios.some((s) => s.id === pinned)) {
      // Studio no longer exists — drop the stale pin rather than retrying.
      setDefaultStudioId(null);
      return;
    }
    if (!availableStudios.some((s) => s.id === pinned)) return;

    setActiveStudioId(pinned);
    localStorage.setItem("max_strength_trainer_id", authTrainer.id!);
    // Trainer PINs are gone (Sep 2026): the iPad's own device lock is the
    // gate, so choosing a studio completes the sign-in.
    localStorage.setItem("max_strength_authenticated", "true");
    setIsAuthenticated(true);
  }, [
    activeStudioId,
    isChangingStudio,
    authTrainer,
    studios,
    availableStudios,
  ]);
  const [isSyncing, setIsSyncing] = useState(false);
  /*
   * Who may open Operations: studio leaders and above, and — inside Demo Mode
   * — everyone. "Full access" is the whole point of the demo studio (AJ, Sep
   * 20 2026), and the Firestore rules agree, so a trainer practising there can
   * open the half of the app their own role keeps shut without the database
   * refusing a single thing they try. Operations scopes itself to the one
   * realm the app is standing in, so this can never show a real studio's
   * numbers — see features/admin/scope.ts.
   *
   * The menu offers Operations on this, AND the screen itself is held to it
   * (sign-out round, Sep 24 2026): the view and the app mode below can never
   * be Operations, or the Admins dashboard, for someone who may not open it —
   * whether they arrived by the menu, a sign-out that left the last person's
   * screen, or a studio switch out of Demo Mode. They are sent to the Hub.
   * See features/admin/operations-access.ts.
   */
  const canOpenOperations = mayOpenOperations(authTrainer, activeStudioId);
  /* Journey on a phone (Journey Lite, Oct 1 2026): the same app, laid out
     for a phone. The shell's part is the bottom bar and a header with room
     for the studio's name (features/phone/README.md). */
  const isPhone = usePhone();
  const place = useGuardedPlace({
    operations: canOpenOperations,
    admins: isAdmin,
  });
  const { currentView, appMode, setAppMode } = place;
  /*
   * UNSAVED CHANGES (Sep 24 2026). There is no router, so a screen leaves
   * the tree when `currentView` (or the client, or the studio) changes — and
   * everything typed into it goes with it. The screen and the client are
   * therefore GUARDED state: every change asks the unsaved-changes gate
   * first, and a screen holding typing gets "You have unsaved changes to …
   * Leave without saving?" before it is torn down. Guarding the setters
   * themselves reaches every button that sets them, however many props down.
   * `guardLeave` covers the navigations that are not these two pieces of
   * state: a studio switch, sign-out, new-client onboarding.
   * See features/unsaved-changes/README.md.
   *
   * The screen is ALSO held to who may open it (useGuardedPlace, above), and
   * the two compose: the guarded setter below is the one every button uses,
   * while useGuardedPlace's own refusal (sending someone who may not open
   * Operations to the Hub) writes the raw setter and never asks — it is not
   * a navigation anyone chose, and the screen it tears down is one this
   * person was never allowed to be on.
   */
  const guardLeave = useLeaveGuard();
  const setCurrentView = useGuardedSetter<View>(currentView, place.setCurrentView);
  /*
   * LEARNING LINKS (features/learning/ref.ts). Any page in Learning — a
   * machine, an Academy page, a studio's own page — can be opened from
   * anywhere: the bell, a note, an announcement. `openLearning` is the one
   * door. It switches to the section the page lives in; LearningView opens
   * the page and clears the jump, so a later re-render cannot pull a trainer
   * back to where they arrived twenty taps ago.
   */
  const [learningJump, setLearningJump] = useState<LearningRef | null>(null);
  const openLearning = useCallback(
    (ref: LearningRef) =>
      // The jump is set only once leaving is agreed: set first and then
      // refused, it would sit there and fire the next time Learning opened.
      guardLeave(() => {
        setLearningJump(ref);
        setCurrentView(ref.kind === "machine" ? "machine-anatomy" : "academy");
      }),
    [guardLeave, setCurrentView],
  );
  const clearLearningJump = useCallback(() => setLearningJump(null), []);
  /*
   * The bottom bar's Learning button reopens whichever section was open last:
   * the front page ("learning") the first time, the Catalog or the Academy
   * after that. The sections keep the view names they always had, so every
   * existing link still lands in the right one.
   */
  const [lastLearningView, setLastLearningView] = useState<
    "learning" | "machine-anatomy" | "academy"
  >("learning");
  useEffect(() => {
    if (
      currentView === "learning" ||
      currentView === "machine-anatomy" ||
      currentView === "academy"
    ) {
      setLastLearningView(currentView);
    }
  }, [currentView]);
  const isLearningView =
    currentView === "learning" ||
    currentView === "machine-anatomy" ||
    currentView === "academy";
  const [newClientOnboardingName, setNewClientOnboardingName] = useState<
    string | null
  >(null);
  // Guarded like `currentView`: a different client is a different screen,
  // and the client record stays MOUNTED across the change (see its discard).
  const [selectedClientId, setSelectedClientId] = useGuardedState<
    string | null
  >(null);
  const [selectedClientDoc, setSelectedClientDoc] = useState<Client | null>(
    null,
  );
  /** Id of the last client whose fetch finished, successfully or not. */
  const [resolvedClientId, setResolvedClientId] = useState<string | null>(null);
  /* Whether the selected client's own read FAILED, as opposed to finding no
     record, and a way to ask again: the Active Session says which and offers
     Try again rather than drawing nothing (session record, Sep 26 2026). */
  const [selectedClientReadFailed, setSelectedClientReadFailed] = useState(false);
  const [clientReadAttempt, setClientReadAttempt] = useState(0);

  // Derived rather than a flag set inside the effect: effects run *after* render,
  // so a boolean would still read false on the first paint and flash the
  // "not found" state before loading even began.
  const isLoadingClient =
    !!selectedClientId && resolvedClientId !== selectedClientId;
  const [hasQuotaError, setHasQuotaError] = useState(false);

  const triggerQuotaError = (msg: string) => {
    // The message itself was stored in state nothing read. Keeping the log
    // means a quota storm is still diagnosable from the console, which is
    // where the Aug 30 one was actually found.
    console.warn("Firestore quota error:", msg);
    setHasQuotaError(true);
  };

  useEffect(() => {
    const handleGlobalQuotaError = (e: any) => {
      if (e.message?.toLowerCase().includes("quota")) {
        triggerQuotaError(e.message);
      }
    };
    window.addEventListener("error", handleGlobalQuotaError);
    return () => window.removeEventListener("error", handleGlobalQuotaError);
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setSelectedClientDoc(null);
      setResolvedClientId(null);
      setSelectedClientReadFailed(false);
      return;
    }

    let cancelled = false;
    setSelectedClientDoc(null);
    setSelectedClientReadFailed(false);
    // A retry of the same client is loading again, not "no record".
    setResolvedClientId(null);

    const fetchClient = async () => {
      try {
        const clientRef = doc(db, "clients", selectedClientId);
        const snap = await getDoc(clientRef);
        if (cancelled) return;
        if (snap.exists()) {
          setSelectedClientDoc({ id: snap.id, ...snap.data() } as Client);
        } else {
          setSelectedClientDoc(null);
        }
      } catch (e) {
        console.error("Error fetching client", e);
        if (!cancelled) setSelectedClientReadFailed(true);
      } finally {
        // Marks the fetch as settled so the profile stops showing the spinner,
        // whether the client was found, missing, or the read failed.
        if (!cancelled) setResolvedClientId(selectedClientId);
      }
    };
    fetchClient().catch((err) =>
      console.error("Unhandled rejection in fetchClient:", err),
    );

    // Switching clients mid-flight must not let a stale response win.
    return () => {
      cancelled = true;
    };
  }, [selectedClientId, clientReadAttempt]);

  const [selectedProfileTrainerId, setSelectedProfileTrainerId] = useState<
    string | null
  >(null);

  const isDataReady = !!authTrainer && !hasQuotaError;

  useTrainers(isDataReady, setTrainers);
  useStudios(isDataReady, setStudios);
  useNetworks(isDataReady, setNetworks);

  const { machines } = useMachines(isDataReady, DEFAULT_MACHINES);
  const {
    schedules,
    ensureRange,
    refresh: refreshSchedules,
    lastFetchedAt: schedulesFetchedAt,
    isFetching: isFetchingSchedules,
    dayState: scheduleDayState,
    retry: retrySchedules,
  } = useLiveSchedule(activeStudioId, isDataReady);
  /**
   * Every client of the studio the iPad is in (a live listener), plus any
   * booked visitor from elsewhere. Replaced the booking-window roster on
   * Sep 16 2026 — see src/lib/studio-roster.ts for what that got wrong.
   */
  const { clients: rosterClients, status: rosterStatus, cut: rosterCut } = useStudioRoster(
    activeStudioId,
    isDataReady,
    schedules,
  );
  const { sessions, sessionsKnown } = useSessions(activeStudioId, isDataReady);

  /**
   * Background Mindbody pulls. autoSyncEnabled and syncIntervalMinutes have
   * been settable from Integrations since the round that added them and
   * nothing has ever read them; this is what reads them. The lease is shared
   * across every device at the studio, so a floor with six iPads still does
   * one sync per interval rather than six. See features/admin/syncPolicy.ts.
   */
  useAutoSync({
    studios,
    activeStudioId,
    trainers,
    clients: rosterClients,
    enabled: isDataReady,
  });

  /**
   * The signed-in trainer's Kaizen Roster, as a set of client ids.
   *
   * Derived from the streamed `trainers` documents rather than from
   * `authTrainer`, which is captured at sign-in and never re-read. Costs
   * nothing extra: the roster rides on a document the app already subscribes
   * to, which is exactly why it is stored there.
   */
  /**
   * The signed-in trainer's LIVE document.
   *
   * Anything that WRITES the Kaizen Roster must use this and not `authTrainer`.
   * useKaizenRoster rewrites the whole array (see its own note on why), so
   * adding from a sign-in-time snapshot would silently drop every entry added
   * since sign-in. Reading is merely stale; writing is destructive.
   */
  const liveAuthTrainer = useMemo(
    () => trainers.find((t) => t.id === authTrainer?.id) ?? authTrainer ?? null,
    [trainers, authTrainer],
  );

  const kaizenClientIds = useMemo(
    () => new Set((liveAuthTrainer?.kaizenRoster ?? []).map((e) => e.clientId)),
    [liveAuthTrainer],
  );
  /*
   * There is no announcements stream here on purpose. A second copy of
   * `useHubAnnouncements` used to run at this line and open a live listener
   * on the whole `hub_announcements` collection for every signed-in
   * trainer - and nothing read its result. It survived the Sep 6 pass that
   * moved announcements into the notification sheet because deleting a bell
   * does not delete the hook that fed it. The bell reads them now; see
   * features/notifications/useHubAnnouncements.ts.
   */

  // Memoised: this array is a dependency of effects in several screens, and a
  // new array on every AppContent render re-ran them all for nothing.
  const clients = useMemo(
    () =>
      Array.from(
        new Map(
          [
            ...(selectedClientDoc ? [selectedClientDoc] : []),
            ...rosterClients,
          ].map((c) => [c.id, c]),
        ).values(),
      ),
    [selectedClientDoc, rosterClients],
  );
  const [isReorderingTrainers, setIsReorderingTrainers] = useState(false);
  const [isIntroSession, setIsIntroSession] = useState(false);
  /**
   * The header's Refresh and the calendar's: asks Mindbody for part of the
   * schedule, re-reads it here, and writes down the days it read in full
   * (features/admin/useScheduleRefresh.ts).
   */
  const { isRefreshing: isRefreshingSchedule, pull: pullScheduleFromMindbody } = useScheduleRefresh({
    studios,
    activeStudioId,
    trainers,
    clients,
    refreshSchedules,
  });
  /**
   * Global client search. The input lives in the app header, but the results
   * render inside the Hub (ClientsView), so the term is owned here and handed
   * down. Leaving the Hub clears it, which keeps the daily grid as the default
   * view whenever a trainer comes back.
   */
  const [hubSearchTerm, setHubSearchTerm] = useState("");
  const hubSearchInputRef = useRef<HTMLInputElement | null>(null);

  const {
    startUnassignedSession,
    updateClient,
  } = useClientMutations(
    authTrainer,
    activeStudioId,
    machines,
    setSelectedClientId,
    setCurrentView,
  );

  /** The header's button: the week ahead. Its click event is not a range. */
  const handleRefreshSchedule = () => {
    void pullScheduleFromMindbody();
  };

  const setView = (view: View, data?: { isIntroSession?: boolean }) => {
    const go = () => {
      if (data?.isIntroSession) {
        setIsIntroSession(true);
      } else {
        setIsIntroSession(false);
      }
      setCurrentView(view);
    };
    // The intro flag moves WITH the screen: set, and then the move refused
    // at "unsaved changes", it would start the next session as an intro.
    if (view === currentView) go();
    else guardLeave(go);
  };

  /**
   * The progress report to open, pinned to the client it was chosen for and
   * forgotten whenever the report screen is left, however it was left. Every
   * way in says whether it wants a filed report or a new one. See
   * features/progress-report/report-selection.ts for the bug this closed.
   */
  const reportSelection = useReportSelection({
    view: currentView,
    clientId: selectedClientId,
    showReport: () => setView("progress-report"),
  });

  useEffect(() => {
    if (currentView !== "clients") setHubSearchTerm("");
  }, [currentView]);

  const sortedTrainers = useMemo(() => {
    return [...trainers].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [trainers]);

  const currentSession = useMemo(() => {
    return sessions.find(
      (s) =>
        s.status === "In-Progress" &&
        s.clientId === selectedClientId &&
        isSessionValid(s),
    );
  }, [sessions, selectedClientId]);

  /* THE RESUME FAILSAFE (tracker round, Sep 2026). `currentSession` above
     only exists once a client is selected, and after a crash or a reload no
     client is selected — so the tab read "Start Session" and sent the
     trainer to the directory while their session was still running. This
     is the trainer's OWN live session, found without a client, so the tab
     can take them straight back. See lib/live-session.ts. */
  /* Under any id this trainer's sessions may carry (older accounts differ),
     the same answer the Active Session gives (session record, Sep 26 2026). */
  const myLiveSession = useMemo(
    () => findMyLiveSession(sessions, myTrainerIds(authTrainer, user?.uid)),
    [sessions, authTrainer, user?.uid],
  );
  const liveSession = currentSession ?? myLiveSession;

  const resumeLiveSession = useCallback(async () => {
    if (currentSession || (selectedClientId && !myLiveSession)) {
      setCurrentView("workouts");
      return;
    }
    if (myLiveSession?.clientId) {
      setSelectedClientId(myLiveSession.clientId);
      setCurrentView("workouts");
      return;
    }
    // Second net: the id the device remembered, read directly — this works
    // before the studio's sessions stream has arrived after a reload, and for
    // a session that stream does not hold.
    // Sep 24 2026: it is followed only while its session is LIVE. It used to
    // be followed however old the heartbeat was, so the tab — which reads
    // "Start Session" once nothing is live — took the trainer back into
    // yesterday's abandoned session. An abandoned one is still reached from
    // its client, where the Active Session asks before carrying on with it;
    // the device just stops pointing at it (the session is not touched).
    const rememberedId = peekLiveSessionId();
    if (rememberedId) {
      try {
        const snap = await getDoc(doc(db, "sessions", rememberedId));
        const data = snap.exists()
          ? (snap.data() as { status?: string; clientId?: string; lastHeartbeatAt?: unknown; createdAt?: unknown })
          : null;
        if (data?.status === "In-Progress" && data.clientId && isSessionValid(data)) {
          setSelectedClientId(data.clientId);
          setCurrentView("workouts");
          return;
        }
        forgetLiveSession(rememberedId);
      } catch (error) {
        console.error("Could not read the remembered session:", error);
      }
    }
    if (selectedClientId) setCurrentView("workouts");
    else setCurrentView("client-directory");
  }, [currentSession, myLiveSession, selectedClientId]);

  /*
   * A NEW VERSION (new-version round, Sep 26 2026). Every push to master
   * deploys, and a deploy deletes the screen files an open app has not
   * fetched yet. This notices a new version when Journey comes back on
   * screen, loads it by itself only on the Hub, and never over the Active
   * Session, this trainer's open session, saves still sending, typing or a
   * session note draft. Everywhere else the line under the header says so.
   * See features/new-version/README.md.
   */
  const shellReady =
    !!user && !!authTrainer && !!activeStudioId && !isChangingStudio && newClientOnboardingName === null;
  const newVersion = useNewVersion({
    view: currentView,
    hubView: HUB_PLACE.view,
    sessionView: "workouts",
    shellReady,
    uid: user?.uid ?? null,
    clientId: selectedClientId,
    ownSessionClientName: myLiveSession ? (myLiveSession.clientName ?? "") : null,
    waitForPendingWrites: () => waitForPendingWrites(db),
    isKnownView: isReturnableView,
    restorePlace: (place) => {
      if (place.clientId) setSelectedClientId(place.clientId);
      setCurrentView(place.view as View);
    },
  });
  const screenRecovery = useMemo(
    () => ({
      recover: newVersion.recoverScreen,
      tap: newVersion.tapScreen,
      ownSessionClientName: myLiveSession ? (myLiveSession.clientName ?? "") : null,
    }),
    [newVersion.recoverScreen, newVersion.tapScreen, myLiveSession],
  );
  // The Active Session and Pulse, fetched once the shell is up and quiet, so
  // a deploy later in the day cannot stop a session from opening
  // (features/new-version/warm-up.ts). Once per page.
  const warmedUp = useRef(false);
  useEffect(() => {
    if (!shellReady || warmedUp.current) return;
    warmedUp.current = true;
    warmUp([loadWorkoutTracker, loadClientCheckInPanel]);
  }, [shellReady]);
  // Derived state for the active studio name
  const activeStudioName = useMemo(() => {
    if (!activeStudioId) return null;
    return studios.find((s) => s.id === activeStudioId)?.name || null;
  }, [activeStudioId, studios]);

  // Trainer Session Persistence
  useEffect(() => {
    // Check for view override in URL (for emergency admin access)
    const urlParams = new URLSearchParams(window.location.search);
    const viewOverride = urlParams.get("view");

    const viewBypassAdmin =
      tokenRole === "Admin" ||
      authTrainer?.role === "Admin" ||
      tokenRole === "Founder" ||
      authTrainer?.role === "Founder" ||
      tokenRole === "Overseer";
    if (viewOverride === "trainer-hub" && viewBypassAdmin) {
      if (trainers.length > 0) {
        const ownerTrainer = trainers.find((t) => isOwner(t)) || trainers[0];
        if (authTrainer?.id !== ownerTrainer.id) {
          setAuthTrainer(ownerTrainer);
          setCurrentView("trainer-hub");
        }
      } else if (!authTrainer) {
        // Mock a trainer if none exist for bypass
        setAuthTrainer({
          id: "owner-temp",
          fullName: "Owner Tim",
          initials: "TD",
          role: "Owner",
        } as any);
        setCurrentView("trainer-hub");
      }
      return;
    }

    if (trainers.length > 0) {
      if (!authTrainer) {
        const savedId = localStorage.getItem("max_strength_trainer_id");
        if (savedId) {
          const matching = trainers.find((t) => t.id === savedId);
          if (matching) setAuthTrainer(matching);
        }
      } else {
        // Check if the current trainer was deleted
        // SAFETY: Only lock if we have a significant number of trainers loaded
        // and we still can't find the current one. This avoids flicker-lockouts.
        const stillExists = trainers.find((t) => t.id === authTrainer.id);
        if (
          !stillExists &&
          authTrainer.id !== "owner-temp" &&
          trainers.length >= 1
        ) {
          // If we have trainers but not ours, it might be a deletion.
          // BUT let's wait a bit longer or check if trainers list changed significantly.
          // For now, let's just make it more resilient by not locking if the list is likely incomplete.
          if (trainers.length >= 1) {
            console.log(
              "Current trainer not found in active list, verifying existence...",
            );
            // We'll keep them logged in for this frame to avoid a flash.
          }
        }
      }
    }
  }, [trainers.length, authTrainer?.id, user?.email, tokenRole]);

  /*
   * The navigations that are not `currentView` or the client, each asking
   * the unsaved-changes gate first. Every one of them is answered by an
   * early return below, which unmounts the whole screen.
   */
  const openStudioPicker = () => guardLeave(() => setIsChangingStudio(true));
  const signOutNow = () => guardLeave(() => void handleLogout().catch(console.error));
  /* Sign-out asks first when this trainer's own session is still open, or
     this iPad has saves the database hasn't confirmed: those wait on the
     iPad for the same person to sign in here again (session record, Sep 26
     2026). The Active Session sends its waiting sets first, while this
     person is still signed in. A question, never a block. */
  const [signOutAsk, setSignOutAsk] = useState<string | null>(null);
  const logOut = () => {
    sendSetsNow();
    void (async () => {
      const unsent = await unsentWritesWaiting(() => waitForPendingWrites(db));
      const question = signOutQuestion({
        openSessionClientName: myLiveSession ? (myLiveSession.clientName ?? "") : null,
        unsent,
      });
      if (question) setSignOutAsk(question);
      else signOutNow();
    })();
    return Promise.resolve();
  };
  const startNewClientOnboarding = (name: string) =>
    guardLeave(() => setNewClientOnboardingName(name));
  /** Trainer · Operations · Admin. Asks only when the screen would change. */
  const switchAppMode = (mode: "trainer" | "admin", view: View) => {
    if (view === currentView) {
      setAppMode(mode);
      return;
    }
    guardLeave(() => {
      setAppMode(mode);
      setCurrentView(view);
    });
  };

  /*
   * The "Wipe Entire Database" button lived here until Sep 20 2026 (Claude
   * Experiment, phase A). It ran getDocs + deleteDoc over eleven top-level
   * collections FROM THE BROWSER, against production (the local .env points
   * at production), behind one typed phrase.
   *
   * Three things were wrong with it beyond the obvious:
   *   - it deleted `trainers` and `studios` - every account, including the
   *     admin's own - but not `journalEntries`, `progressReports`, `ford` or
   *     any studio subcollection, so a "wipe" stranded clinical text in
   *     collections any signed-in user can read;
   *   - Promise.all(deleteDoc x N) over `exerciseLogs` hits write limits
   *     part-way and leaves a torn database with no resume;
   *   - the dialog promised it would "completely re-initialize the 20
   *     standard machines" and the code preserved them and re-initialised
   *     nothing.
   *
   * A destructive operation of this size belongs in scripts/ behind the
   * service account with a dry run - scripts/purge-database.ts is the place.
   */

  /*
   * "Restore standard machines" (handleRestoreMachines) stood here until
   * Sep 28 2026, wave 2 of the Machine Catalog room. AJ: "we dont need to
   * restore standard machine button, a machine just needs to be able to be
   * marked as a standard machine, a task only by admins". It wrote the
   * generated data/machine-definitions.ts over every catalog document,
   * merging, which also undid any correction an administrator had made in
   * the catalog editor since. The catalog is changed in the catalog editor
   * now; "Standard machine" is on the machine's own page there.
   */

  const handleManualRefresh = async (
    collectionName: "studios" | "networks" | "trainers",
  ) => {
    try {
      if (collectionName === "studios") {
        const snap = await getDocs(collection(db, "studios"));
        setStudios(
          snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Studio),
        );
      } else if (collectionName === "networks") {
        const snap = await getDocs(collection(db, "networks"));
        setNetworks(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as FranchiseNetwork,
          ),
        );
      } else if (collectionName === "trainers") {
        const snap = await getDocs(collection(db, "trainers"));
        // Tombstoned placeholders are not people — see trainer-identity/claim.ts.
        setTrainers(
          withoutSuperseded(
            snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Trainer),
          ),
        );
      }
    } catch (e) {
      console.error("Manual refresh failed", e);
    }
  };

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  /** Microsoft sign-in is limited to company staff. */
  const MICROSOFT_ALLOWED_DOMAIN = "maxstrengthfitness.com";

  const handleLogin = async (providerName: "google" | "microsoft") => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      let provider;
      if (providerName === "google") {
        provider = new GoogleAuthProvider();
        // Always ask which account. On a shared iPad the browser can still
        // hold the last trainer's Google session, and without this Google may
        // sign the next person straight back in as them — Sign out
        // would hand the iPad to nobody. Microsoft already asks (below).
        provider.setCustomParameters({ prompt: "select_account" });
      } else {
        provider = new OAuthProvider("microsoft.com");

        const rawTenant = (
          (import.meta as any).env.VITE_MICROSOFT_TENANT_ID || ""
        ).trim();
        const isValidTenant =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            rawTenant,
          ) || ["common", "organizations", "consumers"].includes(rawTenant);

        if (rawTenant && !isValidTenant) {
          console.warn(
            `Ignoring VITE_MICROSOFT_TENANT_ID="${rawTenant}" — not a tenant GUID or known alias. Falling back to /common.`,
          );
        }

        provider.setCustomParameters({
          prompt: "select_account",
          ...(isValidTenant ? { tenant: rawTenant } : {}),
        });
        // Ask for the profile fields Firebase needs to populate user.email.
        provider.addScope("openid");
        provider.addScope("email");
        provider.addScope("profile");
        provider.addScope("User.Read");
      }
      const credential = await signInWithPopup(auth, provider);

      // Microsoft sign-in is for company staff only. The single-tenant Azure app
      // already blocks outsiders, but a guest invited into the tenant would
      // otherwise slip through, so the address is checked here too.
      if (providerName === "microsoft") {
        const signedInEmail = (
          credential.user.email ||
          credential.user.providerData.find((p) => p?.email)?.email ||
          ""
        ).toLowerCase();

        if (!signedInEmail.endsWith(`@${MICROSOFT_ALLOWED_DOMAIN}`)) {
          await signOut(auth);
          setLoginError(
            `Microsoft sign-in is restricted to @${MICROSOFT_ALLOWED_DOMAIN} accounts. ${
              signedInEmail
                ? `"${signedInEmail}" is not permitted.`
                : "That account has no usable email address."
            }`,
          );
          return;
        }
      }
    } catch (error: any) {
      if (
        error.code === "auth/popup-closed-by-user" ||
        error.code === "auth/cancelled-popup-request"
      ) {
        return;
      }
      console.error("Login failed:", error);

      const errMsg = error.message || "";
      if (
        errMsg.includes("unauthorized_client") ||
        errMsg.includes("not enabled for consumers")
      ) {
        setLoginError(
          "Login failed: this Microsoft app does not accept personal Microsoft accounts. Set VITE_MICROSOFT_TENANT_ID=organizations in .env (or your tenant GUID if the app is single-tenant) and restart the dev server.",
        );
      } else if (errMsg.includes("AADSTS50011")) {
        setLoginError(
          "Login failed: redirect URI mismatch. In Azure App Registrations, add the callback URL shown on Firebase's Microsoft provider page to your app's Web redirect URIs.",
        );
      } else if (errMsg.includes("AADSTS50194")) {
        setLoginError(
          "Login failed: Your Microsoft App Registration is configured as single-tenant. Please go to Azure Portal and configure application 'dd2ae28c-1a71-4de3-bc12-5b0683032526' to be multi-tenant ('Accounts in any organizational directory and personal Microsoft accounts'), or set VITE_MICROSOFT_TENANT_ID in your environment variables to your tenant ID.",
        );
      } else {
        setLoginError(`Login failed: ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!user) {
    return (
      <LoginScreen
        isLoggingIn={isLoggingIn}
        loginError={loginError}
        onLogin={handleLogin}
      />
    );
  }

  // Intercept authenticated but unauthorized users
  if (user && !authTrainer) {
    return (
      <AccessRequestView
        authenticatedUser={user}
        studios={studios}
        onTrainerCreated={setAuthTrainer}
        onLogout={handleLogout}
      />
    );
  }

  // Derived state for the active studio name
  // Moved up to avoid hook order violation

  // Studio Selection Screen (if no active studio or changing studio)
  if (
    (!activeStudioId || isChangingStudio) &&
    currentView !== "admin-dashboard" &&
    currentView !== "admins-dashboard"
  ) {
    return (
      <StudioSelectionView
        studios={studios}
        networks={networks}
        trainers={trainers}
        authTrainer={authTrainer}
        onSelectTrainer={(selectedTrainer, studioId) => {
          setActiveStudioId(studioId);
          setAuthTrainer(selectedTrainer);
          localStorage.setItem("max_strength_trainer_id", selectedTrainer.id!);
          localStorage.setItem("max_strength_authenticated", "true");
          setIsAuthenticated(true);
          setIsChangingStudio(false);
        }}
        onGoToAdmin={() => {
          setAppMode("admin");
          setCurrentView("admin-dashboard");
          setIsChangingStudio(false);
        }}
        onBack={() => {
          if (!activeStudioId) {
            handleLogout().catch(console.error);
          } else {
            setIsChangingStudio(false);
          }
        }}
      />
    );
  }

  // Access Request Screen (if authenticated via Google but no matching profile exists)
  if (!authTrainer) {
    return (
      <AccessRequestView
        authenticatedUser={user}
        studios={studios}
        onTrainerCreated={(t) => {
          setAuthTrainer(t);
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (newClientOnboardingName !== null) {
    return (
      <CreateClientModal
        clients={clients}
        studios={studios}
        activeStudioId={activeStudioId}
        initialName={newClientOnboardingName}
        authorId={authTrainer.id}
        onClientCreated={async (clientId) => {
          setSelectedClientId(clientId);
          setNewClientOnboardingName(null);
          setCurrentView("profile");
        }}
        onClose={() => {
          setNewClientOnboardingName(null);
        }}
      />
    );
  }

  /**
   * Header search + inline schedule refresh. Typing from any screen jumps to
   * the Hub, where the results list renders. Hidden on phone widths; the app
   * is tablet-first and the Client Directory keeps its own search there.
   */
  const headerSearchSlot = (
    <div className="hidden sm:flex items-center w-full justify-end">
      <div className="relative w-full max-w-[14rem] md:max-w-[18rem] lg:max-w-[22rem] focus-within:max-w-[26rem] lg:focus-within:max-w-[30rem] transition-[max-width] duration-200">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
        <Input
          ref={hubSearchInputRef}
          value={hubSearchTerm}
          onChange={(e) => {
            const term = e.target.value;
            if (currentView === "clients") {
              setHubSearchTerm(term);
              return;
            }
            // Typing here leaves the screen for the Hub, so it asks first
            // like any other way out; refused, the letter is not kept.
            guardLeave(() => {
              setHubSearchTerm(term);
              setCurrentView("clients");
            });
          }}
          // "Search", not "Search clients": upright the box is narrow and the
          // placeholder read "Search clie" (AJ's iPad, Oct 1 2026). The label
          // says the whole thing; the magnifier says the rest.
          placeholder="Search"
          aria-label="Search clients"
          {...NAME_SEARCH_PROPS}
          className="h-10 pl-8 pr-8 rounded-lg bg-slate-100/80 dark:bg-slate-800/60 border border-transparent text-sm font-medium text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-cyan/60 focus-visible:border-cyan/40 focus-visible:bg-white dark:focus-visible:bg-slate-900"
        />
        {hubSearchTerm && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setHubSearchTerm("");
              hubSearchInputRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  /**
   * The header's icon cluster. ONE row, ONE gap, ONE button size.
   *
   * It used to be none of those things. The refresh lived inside the search
   * slot and was separated from its neighbours by that slot's own horizontal
   * padding; the theme toggle rendered as a bordered 32px square from shadcn
   * among round 40px ghost buttons; and the bug, bell and gear each carried a
   * slightly different icon ramp (`sm:w-6 md:w-7` against `sm:w-5`). So the
   * space between adjacent glyphs changed four times across six of them.
   * Nothing about that was designed - it is where each control happened to be
   * added. Every one of them now takes the same class from `headerIconClass`
   * and sits in the same flex row, so the gap is stated once.
   *
   * The second bell is gone with this round. `HubAnnouncementsWidget` streamed
   * `hub_announcements` behind an identical glyph, which asked a trainer to
   * guess which of two bells held the thing they wanted. Announcements now
   * render as a pinned section inside the notification sheet - see
   * features/notifications/useHubAnnouncements.ts.
   */
  const headerIconClass =
    "relative h-9 w-9 sm:h-10 sm:w-10 rounded-full shrink-0 inline-flex items-center justify-center transition-colors outline-none hover:bg-transparent text-muted-foreground hover:text-slate-900 dark:hover:text-slate-50 focus-visible:ring-2 focus-visible:ring-cyan disabled:opacity-50";

  const headerRightControls = (
    <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
      {/* On a phone the header keeps the bell (and the reminders that ring
          it); Refresh, the theme, feedback and Settings are in the avatar
          menu, so the studio's name keeps its room. */}
      {!isPhone && (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleRefreshSchedule}
        disabled={isRefreshingSchedule}
        title={isRefreshingSchedule ? "Syncing schedule…" : "Refresh schedule"}
        aria-label="Refresh schedule"
        className={headerIconClass}
      >
        <RefreshCw
          className={`w-5 h-5 sm:w-6 sm:h-6 ${isRefreshingSchedule ? "animate-spin" : ""}`}
        />
      </Button>
      )}
      {!isPhone && <ThemeToggle className={headerIconClass} />}
      {!isPhone && <FeedbackButton className={headerIconClass} />}
      {/* Rings the bell when one of your own Planner reminders comes due. */}
      <PlannerReminders authTrainer={authTrainer ?? null} />
      <NotificationBell
        trainerId={authTrainer?.id}
        authTrainer={authTrainer}
        trainers={trainers}
        activeStudioId={activeStudioId}
        className={headerIconClass}
        onNavigate={(view, id, learning, atStudioId) => {
          // A Learning page wins: it names the exact page. The machine-flagged
          // link predates Learning refs and stores { view, id }; before this
          // the id was dropped and it opened the Catalog's front page.
          const ref =
            parseLearningRef(learning) ??
            (view === "machine-anatomy" && id
              ? ({ kind: "machine", id } as LearningRef)
              : null);
          if (ref) {
            // A comment thread, a flag or a studio's own page belongs to the
            // studio it happened at. Opened here it would show this studio's
            // instead, so say where it was rather than show the wrong one.
            if (atStudioId && activeStudioId && atStudioId !== activeStudioId) {
              const where =
                studios.find((s) => s.id === atStudioId)?.name ?? "another studio";
              toastInfo(
                `That was at ${where}. Switch to ${where} to see it there.`,
                6000,
              );
              return;
            }
            openLearning(ref);
            return;
          }
          // One question for the whole link, asked before any of it happens:
          // a Relay intent requested and then refused would open the next
          // time My Studio did.
          guardLeave(() => {
            if (view === "profile" && id) setSelectedClientId(id);
            if (view === "studio-tasks") {
              const intent = plannerIntentFromLink(id);
              if (intent) requestPlanner(intent);
            }
            setCurrentView(view as any);
          });
        }}
      />
      {!isPhone && (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCurrentView("trainer-hub")}
        className={`${headerIconClass} ${currentView === "trainer-hub" ? "text-foreground" : ""}`}
        title="Trainer Settings"
        aria-label="Trainer Settings"
      >
        <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
      </Button>
      )}
    </div>
  );

  /**
   * Close the menu, let Radix finish releasing the document, THEN navigate.
   * Every item below goes through this — not just Switch Studio — because they
   * all land on a screen reached by an early return.
   */
  const menuNavigate = (go: () => void) => {
    setTrainerMenuOpen(false);
    afterOverlayClose(go);
  };

  // Who is offered Operations from this menu: `canOpenOperations`, the same
  // test the screen itself is held to (see useGuardedPlace, near the top).
  const headerTrainerDropdown = authTrainer ? (
    <DropdownMenu open={trainerMenuOpen} onOpenChange={setTrainerMenuOpen}>
      <DropdownMenuTrigger aria-label="Your menu" className="w-10 h-10 sm:w-11 sm:h-11 rounded-full font-display italic text-xs sm:text-sm flex items-center justify-center cursor-pointer shadow-sm mx-auto active:scale-95 transition-transform hover:opacity-90 bg-primary text-primary-foreground shrink-0">
        {authTrainer.initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-[24px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-bg-dark p-2 shadow-2xl dark:shadow-none text-slate-700 dark:text-slate-300"
      >
        <DropdownMenuGroup>
          {canOpenOperations && (
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-2">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 block mb-3">
                App Mode
              </Label>
              <div className="flex bg-slate-100 dark:bg-bg-dark-3 p-1 rounded-xl">
                <button
                  onClick={() =>
                    menuNavigate(() => switchAppMode("trainer", "clients"))
                  }
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-colors ${appMode === "trainer" ? "bg-white dark:bg-bg-dark shadow-sm text-sky-600 dark:text-sky-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                >
                  Trainer
                </button>
                <button
                  onClick={() =>
                    menuNavigate(() => switchAppMode("admin", "admin-dashboard"))
                  }
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-colors ${appMode === "admin" && currentView !== "admins-dashboard" ? "bg-white dark:bg-bg-dark shadow-sm text-orange-600 dark:text-orange-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                >
                  {/* Label only: the mode is still "admin" inside (Renewals round, Sep 2026). */}
                  Operations
                </button>
                {isAdmin && (
                  <button
                    onClick={() =>
                      menuNavigate(() => switchAppMode("admin", "admins-dashboard"))
                    }
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-colors ${appMode === "admin" && currentView === "admins-dashboard" ? "bg-white dark:bg-bg-dark shadow-sm text-orange-600 dark:text-orange-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                  >
                    {/* The Admins dashboard (Operations overhaul, Sep 2026): administrators and the founder. */}
                    Admin
                  </button>
                )}
              </div>
            </div>
          )}
          {isPhone && (
            <>
              {/* On a phone the bottom bar is Schedule · Operations · Clients
                  · My Studio (Journey Lite, Oct 1 2026); the rest of the app
                  is here, with the header buttons the phone has no room for. */}
              <DropdownMenuItem
                onClick={() => menuNavigate(() => switchAppMode("trainer", lastLearningView))}
                className="rounded-xl flex items-center gap-3 p-3 min-h-11 font-bold uppercase text-[11px] tracking-widest cursor-pointer"
              >
                <GraduationCap className="w-4 h-4 text-sky-500" />
                Learning
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => menuNavigate(() => switchAppMode("trainer", "calendar"))}
                className="rounded-xl flex items-center gap-3 p-3 min-h-11 font-bold uppercase text-[11px] tracking-widest cursor-pointer"
              >
                <CalendarIcon className="w-4 h-4 text-sky-500" />
                Calendar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => menuNavigate(() => setCurrentView("trainer-hub"))}
                className="rounded-xl flex items-center gap-3 p-3 min-h-11 font-bold uppercase text-[11px] tracking-widest cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-500" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isRefreshingSchedule}
                onClick={() => {
                  setTrainerMenuOpen(false);
                  void handleRefreshSchedule();
                }}
                className="rounded-xl flex items-center gap-3 p-3 min-h-11 font-bold uppercase text-[11px] tracking-widest cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 text-slate-500 ${isRefreshingSchedule ? "animate-spin" : ""}`} />
                {isRefreshingSchedule ? "Syncing schedule…" : "Refresh schedule"}
              </DropdownMenuItem>
              <div className="flex items-center gap-2 px-3 py-1">
                <ThemeToggle className={headerIconClass} />
                <FeedbackButton className={headerIconClass} />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Theme · Feedback
                </span>
              </div>
              <DropdownMenuSeparator className="my-2 bg-slate-700" />
            </>
          )}
          <DropdownMenuLabel className="font-black uppercase text-[11px] tracking-widest px-3 py-2 text-muted-foreground">
            Active Profile
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() =>
              menuNavigate(() => {
                setSelectedProfileTrainerId(null);
                setCurrentView("trainer-profile");
              })
            }
            className="rounded-xl flex items-center gap-3 p-3 font-bold uppercase text-[11px] tracking-widest cursor-pointer hover:bg-slate-700 hover:text-slate-900 dark:text-white dark:hover:text-slate-50 focus:bg-slate-700 focus:text-slate-900"
          >
            <UserCircle className="w-4 h-4 text-sky-500" />
            View Profile
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-2 bg-slate-700" />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => menuNavigate(openStudioPicker)}
            className="rounded-xl flex items-center gap-3 p-3 font-bold uppercase text-[11px] tracking-widest cursor-pointer hover:bg-slate-700 hover:text-slate-900 dark:text-white dark:hover:text-slate-50 focus:bg-slate-700 focus:text-slate-900"
          >
            <Building2 className="w-4 h-4 text-amber-500" />
            Switch Studio
          </DropdownMenuItem>

          {/*
            SIGN OUT (Oct 2 2026, AJ: Switch Trainer and Log Out Facility
            become one "Sign out"). Both already did the same thing since the
            sign-out round (Sep 24 2026): everyone signs in as themselves, so
            handing the iPad to the next person IS signing out. The next
            person gets the sign-in screen with an account chooser, this iPad
            stays pinned to its studio, and nothing of the last person is
            left on screen (features/sign-out). Unsaved typing, an open
            session or sets still sending are asked about first (logOut).
          */}
          <DropdownMenuItem
            onClick={() => menuNavigate(() => void logOut())}
            className="rounded-xl flex items-center gap-3 p-3 font-bold uppercase text-[11px] tracking-widest text-rose-500 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-500 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : undefined;

  return (
    <ErrorBoundary>
      {/* Mounted once, near the root, so the feedback drawer is reachable from
          every screen and there is only ever one of it. It reads the live
          "where am I" values below and snapshots them when it opens. */}
      <FeedbackProvider
        author={{
          id: authTrainer?.id,
          email: authTrainer?.email,
          name: authTrainer?.fullName,
          studioId: activeStudioId,
        }}
        view={currentView}
        studioId={activeStudioId}
        studioName={activeStudioName}
        clientId={selectedClientId}
        clientName={
          selectedClientDoc
            ? `${selectedClientDoc.firstName} ${selectedClientDoc.lastName}`.trim()
            : null
        }
        sessionId={currentSession?.id ?? null}
        theme={theme}
      >
        <div className="flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground font-sans overflow-x-hidden w-full max-w-full">
          {/* The iPad status bar's inset, paid once for every screen in the
              shell (features/home-screen). 0px outside the Home Screen app;
              the bottom inset is AppBottomBar's. */}
          <StatusBarStrip
            tone={
              isDemoStudioId(activeStudioId)
                ? "demo"
                : currentView === "workouts"
                  ? "session"
                  : "header"
            }
          />
          {/* Above the header, and outside the `workouts` condition below, so
              it is on the Active Session too — see DemoBanner.tsx. */}
          {isDemoStudioId(activeStudioId) && (
            <DemoBanner onLeave={openStudioPicker} />
          )}

          {/* Header */}
          {currentView !== "workouts" && (
            <AppHeader
              variant={theme === "light" ? "light" : "dark"}
              studioName={activeStudioName || undefined}
              // Inside Operations and the Admins dashboard the top left goes
              // back to the Hub; 'Looking at' is the studio switch there
              // (the Atlas answers, Oct 2 2026).
              onStudioClick={appMode === "admin" ? () => switchAppMode("trainer", "clients") : openStudioPicker}
              studioClickGoesHome={appMode === "admin"}
              rightControls={headerRightControls}
              trainerDropdown={headerTrainerDropdown}
              searchSlot={headerSearchSlot}
            />
          )}

          {/* A new version is waiting: one quiet line, never on the Active
              Session (features/new-version). */}
          <NewVersionLine line={newVersion.line} busy={newVersion.busy} onLoad={newVersion.loadNow} />

          {/* Main Content */}
          {/* Under 640px (a phone: Journey Lite) the shell pads 12px, not 24px,
              and the session none (its cards pad themselves). */}
          <main
            className={`w-full max-w-full mx-auto relative ${currentView === "workouts" ? "flex-1 min-h-0 p-0 sm:p-2 overflow-y-auto overscroll-contain bg-slate-50 dark:bg-slate-950 flex flex-col" : currentView === "clients" || currentView === "client-directory" || isLearningView || currentView === "studio-tasks" ? "flex-1 min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950 p-0 flex flex-col" : "flex-1 min-h-0 p-3 sm:p-6 overflow-y-auto overscroll-contain bg-slate-50 dark:bg-slate-950"}`}
          >
            {/* A screen whose file a deploy removed replaces only itself, and
                recovers when it is safe to; any other error goes on up to the
                ErrorBoundary as before (features/new-version). */}
            <ScreenRecoveryProvider value={screenRecovery}>
            <LoadBoundary kind="screen" resetKey={currentView} sessionScreen={currentView === "workouts"}>
            <Suspense fallback={<ViewLoader />}>
              <AnimatePresence mode="wait">
                {currentView === "client-directory" && (
                  <ClientDirectory
                    clients={clients}
                    onSelectClient={(id) => {
                      setSelectedClientId(id);
                      setCurrentView("profile");
                    }}
                    onStartOpenSession={startUnassignedSession}
                    // In today's Start: the Hub search card's own path.
                    onStartSession={(id) => {
                      setSelectedClientId(id);
                      setView("workouts");
                    }}
                    onStartNewClientOnboarding={startNewClientOnboarding}
                    authTrainer={authTrainer}
                    kaizenClientIds={kaizenClientIds}
                    liveAuthTrainer={liveAuthTrainer}
                    uid={user?.uid ?? null}
                    rosterStatus={rosterStatus}
                    rosterCut={rosterCut}
                    schedules={schedules}
                    schedulesFetchedAt={schedulesFetchedAt}
                    sessions={sessions}
                    sessionsKnown={sessionsKnown}
                    trainers={trainers}
                    studios={studios}
                  />
                )}
                {currentView === "clients" && (
                  <ClientsView
                    clients={clients}
                    trainers={trainers}
                    sortedTrainers={sortedTrainers}
                    isAdmin={
                      tokenRole === "Admin" ||
                      authTrainer?.role === "Admin" ||
                      tokenRole === "Founder" ||
                      authTrainer?.role === "Founder"
                    }
                    activeStudioId={activeStudioId}
                    cutoverStudios={studios}
                    machines={machines}
                    schedulesFetchedAt={schedulesFetchedAt}
                    authTrainer={authTrainer}
                    onSelectClient={(id) => {
                      setSelectedClientId(id);
                      setView("profile");
                    }}
                    setView={setView}
                    schedules={schedules}
                    sessions={sessions}
                    sessionsKnown={sessionsKnown}
                    onSelectTrainer={(id) => {
                      setSelectedProfileTrainerId(id);
                      setView("trainer-profile");
                    }}
                    searchTerm={hubSearchTerm}
                    onSearchTermChange={setHubSearchTerm}
                    rosterLoading={rosterStatus === "loading"}
                    rosterFailed={rosterStatus === "error"}
                    scheduleDayState={scheduleDayState}
                    onRetrySchedule={retrySchedules}
                  />
                )}
                {isLearningView && (
                  <LearningView
                    key="learning"
                    view={currentView as "learning" | "machine-anatomy" | "academy"}
                    onViewChange={setCurrentView}
                    machines={machines}
                    authTrainer={authTrainer}
                    trainers={trainers}
                    jump={learningJump}
                    onJumpHandled={clearLearningJump}
                    // The Catalog's "Edit our floor": the ONE floor editor is
                    // My Studio → Machines, so the door remembers the section
                    // and opens My Studio (Catalog R5's door, Sep 29 2026).
                    onOpenFloorEditor={() => {
                      rememberMyStudioSection("machines");
                      setCurrentView("studio-tasks");
                    }}
                  />
                )}
                {currentView === "studio-tasks" &&
                  (() => {
                    // A client task points at the screen where the work is
                    // actually done, rather than being a tick that claims it
                    // happened. 'inbody' opens Notes & Profile → Body & Pulse
                    // at the InBody card, where a scan is added (it landed on
                    // Journey until the voice review follow-up, Sep 27 2026).
                    // 'assessment' is the Pulse task (the key predates the
                    // name): the same page, at the Pulse card. It used to
                    // open the Initial Consultation wizard (Sep 24 2026).
                    const openClientTask = (
                      clientId: string,
                      action?: ClientTaskAction,
                    ) => {
                      setSelectedClientId(clientId);
                      // A "Progress report" task always starts a NEW report:
                      // a report left open earlier, for this client or any
                      // other, is never what the task is asking for.
                      if (action === "progress-report") {
                        reportSelection.newReport();
                        return;
                      }
                      // Handed off only if the move goes ahead: asked about
                      // unsaved typing and told to stay, a handoff written
                      // anyway would send the next visit to this client
                      // somewhere nobody asked for.
                      const at =
                        action === "assessment"
                          ? recordLocation("body", "body-pulse")
                          : action === "inbody"
                            ? recordLocation("body", "body-inbody")
                            : null;
                      if (at) guardLeave(() => openProfileAt(clientId, at));
                      setCurrentView("profile");
                    };
                    return (
                      <MyStudioView
                        authTrainer={authTrainer}
                        clients={clients}
                        rosterStatus={rosterStatus}
                        trainers={trainers}
                        schedules={schedules}
                        sessions={sessions}
                        machines={machines}
                        onOpenClientTask={openClientTask}
                        onOpenTrainer={(id) => {
                          setSelectedProfileTrainerId(id);
                          setView("trainer-profile");
                        }}
                      />
                    );
                  })()}
                {currentView === "workouts" && (
                  <WorkoutTrackerView
                    clientId={selectedClientId}
                    clients={clients}
                    machines={machines}
                    schedules={schedules}
                    trainers={trainers}
                    user={user}
                    setView={setView}
                    setSelectedClientId={setSelectedClientId}
                    onStartNewClientOnboarding={startNewClientOnboarding}
                    authTrainer={authTrainer}
                    isSyncing={isSyncing}
                    setIsSyncing={setIsSyncing}
                    isIntroSession={isIntroSession}
                    rightControls={headerRightControls}
                    trainerDropdown={headerTrainerDropdown}
                    onStudioClick={openStudioPicker}
                    clientLookup={
                      !selectedClientId || clients.some((c) => c.id === selectedClientId)
                        ? "ready"
                        : isLoadingClient
                          ? "loading"
                          : selectedClientReadFailed
                            ? "failed"
                            : "missing"
                    }
                    onRetryClient={() => setClientReadAttempt((n) => n + 1)}
                  />
                )}
                {currentView === "profile" && (
                  <ClientProfileView
                    clientId={selectedClientId}
                    isLoadingClient={isLoadingClient}
                    clients={clients}
                    machines={machines}
                    authTrainer={authTrainer}
                    trainers={trainers}
                    // Asked before the report is chosen, not only before the
                    // screen changes: chosen and then refused, the filed
                    // report would stay selected for the next visit.
                    onSelectReport={(reportId) =>
                      guardLeave(() => reportSelection.openReport(reportId))
                    }
                    onNewReport={reportSelection.newReport}
                    setView={setView}
                    setSelectedClientId={setSelectedClientId}
                    hasQuotaError={hasQuotaError}
                    user={user}
                    studios={studios}
                    activeStudioId={activeStudioId}
                  />
                )}
                {currentView === "progress-report" &&
                  selectedClientId &&
                  authTrainer &&
                  (() => {
                    // The editor builds its report from the client it MOUNTS
                    // with and never re-reads it, so it waits for the real
                    // client. It used to mount on an empty stand-in while the
                    // client was still loading, and a report saved from that
                    // had no client on it at all.
                    const reportClient = clients.find(
                      (c) => c.id === selectedClientId,
                    );
                    // Back to the Activity Archive's Reports, where reports
                    // are kept and most are started, and where the one just
                    // filed now sits. A one-time handoff (openProfileAt), and
                    // written only if the move goes ahead (the report's own
                    // typing is asked about first): the next visit to this
                    // client opens on Journey as usual.
                    const backToRecord = () =>
                      guardLeave(() => {
                        openProfileAt(selectedClientId, { tab: "clinical", view: "reports" });
                        setCurrentView("profile");
                      });
                    if (!reportClient) {
                      return (
                        <ReportNotOpened
                          message={
                            isLoadingClient
                              ? "Opening the client's record…"
                              : "This client's record could not be read, so no report was opened."
                          }
                          onBack={backToRecord}
                        />
                      );
                    }
                    const reportId = reportSelection.existingReportId;
                    return (
                      <ClientProgressReportView
                        key={reportEditorKey(selectedClientId, reportId)}
                        client={reportClient}
                        coverage={coverageOfClient(reportClient, homeCutoverOf(studios, reportClient))}
                        trainer={authTrainer}
                        machines={machines}
                        existingReportId={reportId}
                        onBack={backToRecord}
                      />
                    );
                  })()}
                {currentView === "trainer-profile" &&
                  (selectedProfileTrainerId
                    ? trainers.find((t) => t.id === selectedProfileTrainerId)
                    : authTrainer) && (
                    <TrainerProfileView
                      trainer={
                        // Always the LIVE document: `authTrainer` is captured at
                        // sign-in and never re-read, so viewing your own profile
                        // through it would never see your own Kaizen Roster edits
                        // or the session counters the Cloud Function maintains.
                        (trainers.find(
                          (t) =>
                            t.id ===
                            (selectedProfileTrainerId || authTrainer?.id),
                        ) || authTrainer)!
                      }
                      schedules={schedules}
                      sessions={sessions}
                      clients={clients}
                      // My clients says "can't read" while the roster loads or
                      // after its read fails, never "No clients" (Openings round).
                      rosterStatus={rosterStatus}
                      studios={studios}
                      onSelectClient={setSelectedClientId}
                      setView={setCurrentView}
                      authTrainer={authTrainer}
                    />
                  )}
                {currentView === "admin-dashboard" && authTrainer && (
                  <AdminDashboardView
                    authTrainer={authTrainer}
                    studios={studios}
                    networks={networks}
                    trainers={trainers}
                    isAdmin={isAdmin}
                    onRefresh={handleManualRefresh}
                    clients={clients}
                    sessions={sessions}
                    machines={machines}
                    schedules={schedules}
                    onUpdateClient={updateClient}
                    activeStudioId={activeStudioId}
                    onReorderTrainers={() => setIsReorderingTrainers(true)}
                    onNavigateProfile={(clientId) => {
                      setSelectedClientId(clientId);
                      setCurrentView("profile");
                    }}
                    // A session left open (Oct 2 2026): its client's session on
                    // the floor, where the Active Session finishes it.
                    onOpenSession={(clientId) => {
                      setSelectedClientId(clientId);
                      switchAppMode("trainer", "workouts");
                    }}
                    // Operations' doors into My Studio (Staff & Roles, Renewals) switch back
                    // to trainer mode, or My Studio opens with Operations' bottom bar.
                    onOpenStudioTasks={() => switchAppMode("trainer", "studio-tasks")}
                  />
                )}
                {currentView === "admins-dashboard" && authTrainer && (
                  <AdminsDashboardView
                    authTrainer={authTrainer}
                    studios={studios}
                    networks={networks}
                    trainers={trainers}
                    clients={clients}
                    machines={machines}
                    isAdmin={isAdmin}
                    activeStudioId={activeStudioId}
                    onRefresh={handleManualRefresh}
                    onReorderTrainers={() => setIsReorderingTrainers(true)}
                  />
                )}
                {currentView === "trainer-hub" && (
                  <TrainerSettingsView
                    authTrainer={authTrainer}
                    studios={studios}
                    trainers={trainers}
                    activeStudioId={activeStudioId}
                    onLogout={logOut}
                    setView={(view) => setCurrentView(view as any)}
                    onOpenOperations={() => switchAppMode("admin", "admin-dashboard")}
                  />
                )}

                {currentView === "calendar" && (
                  <ErrorBoundary
                    fallback={
                      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                          <AlertTriangle className="w-8 h-8 text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold mb-2">
                          Schedule Unavailable
                        </h3>
                        <p className="text-muted-foreground max-w-sm mb-6">
                          The schedule grid encountered an error. You can still
                          access client metrics and profiles.
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => window.location.reload()}
                        >
                          Reload Dashboard
                        </Button>
                      </div>
                    }
                  >
                    {/* Inside the calendar's own boundary, so a missing file
                        is recovered rather than called "Schedule Unavailable". */}
                    <LoadBoundary kind="screen">
                    <CalendarView
                      schedules={schedules}
                      trainers={trainers}
                      authTrainer={authTrainer}
                      isAdmin={
                        tokenRole === "Admin" ||
                        authTrainer?.role === "Admin" ||
                        tokenRole === "Founder" ||
                        authTrainer?.role === "Founder"
                      }
                      activeStudioId={activeStudioId}
                      onSelectClient={setSelectedClientId}
                      onStartNewClientOnboarding={startNewClientOnboarding}
                      setView={setView}
                      clients={clients}
                      scheduleWindow={{
                        ensureRange,
                        refresh: refreshSchedules,
                        pullFromMindbody: (from, to) => pullScheduleFromMindbody({ from, to }),
                        lastFetchedAt: schedulesFetchedAt,
                        // A pull from either button is the schedule updating.
                        isFetching: isFetchingSchedules || isRefreshingSchedule,
                      }}
                    />
                    </LoadBoundary>
                  </ErrorBoundary>
                )}
                {currentView === "chart-importer" && (
                  <LegacyChartImporter
                    clients={clients}
                    machines={machines}
                    trainers={trainers}
                    initialClientId={selectedClientId || undefined}
                    onComplete={() => {
                      if (selectedClientId) setCurrentView("profile");
                      else setCurrentView("clients");
                    }}
                  />
                )}
              </AnimatePresence>
            </Suspense>
            </LoadBoundary>
            </ScreenRecoveryProvider>
          </main>

          {/* Navigation Bar — every screen change it makes goes through the
              guarded setCurrentView (unsaved changes, Sep 24 2026). */}
          <AppBottomBar
            appMode={appMode}
            currentView={currentView}
            isAdmin={isAdmin}
            hasClient={!!selectedClientId}
            liveSession={liveSession}
            lastLearningView={lastLearningView}
            onNavigate={setCurrentView}
            onResumeSession={() => void resumeLiveSession()}
            phone={isPhone}
            canOpenOperations={canOpenOperations}
            onSwitchMode={switchAppMode}
          />
        </div>

        {/* Trainer Reordering Dialog */}
        <Dialog
          open={isReorderingTrainers}
          onOpenChange={setIsReorderingTrainers}
        >
          <DialogContent className="max-w-md sm:max-w-md rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none max-h-[85dvh] flex flex-col">
            <DialogHeader className="p-8 bg-white dark:bg-bg-dark border-b shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-2xl">
                  <GripVertical className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">
                    Team Presence Sorting
                  </DialogTitle>
                  <DialogDescription className="text-[11px] font-bold text-muted-foreground uppercase">
                    Organize how trainers appear in the hub grid.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="p-6 space-y-3 flex-1 overflow-y-auto custom-scrollbar">
              {sortedTrainers
                .filter(
                  (t) =>
                    !activeStudioId ||
                    t.primaryHomeStudioId === activeStudioId ||
                    t.accessibleStudioIds?.includes(activeStudioId) ||
                    t.activeGuestStudioIds?.includes(activeStudioId),
                )
                .map((trainer, idx, studioTrainers) => (
                  <div
                    key={trainer.id}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-bg-dark rounded-2xl border border-border/50 group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-background border flex items-center justify-center font-black text-xs text-muted-foreground">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-black uppercase tracking-tighter text-sm">
                        {trainer.fullName}
                      </p>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase italic">
                        {trainer.initials}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={idx === 0}
                        className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary disabled:opacity-20"
                        onClick={async () => {
                          const newSorted = [...studioTrainers];
                          [newSorted[idx], newSorted[idx - 1]] = [
                            newSorted[idx - 1],
                            newSorted[idx],
                          ];
                          for (let i = 0; i < newSorted.length; i++) {
                            if (newSorted[i].id) {
                              await updateDoc(
                                doc(db, "trainers", newSorted[i].id!),
                                { order: i },
                              );
                            }
                          }
                        }}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={idx === studioTrainers.length - 1}
                        className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary disabled:opacity-20"
                        onClick={async () => {
                          const newSorted = [...studioTrainers];
                          [newSorted[idx], newSorted[idx + 1]] = [
                            newSorted[idx + 1],
                            newSorted[idx],
                          ];
                          for (let i = 0; i < newSorted.length; i++) {
                            if (newSorted[i].id) {
                              await updateDoc(
                                doc(db, "trainers", newSorted[i].id!),
                                { order: i },
                              );
                            }
                          }
                        }}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
            <DialogFooter className="p-6 border-t bg-white dark:bg-bg-dark shrink-0">
              <Button
                onClick={() => setIsReorderingTrainers(false)}
                className="rounded-xl font-bold uppercase tracking-widest w-full h-12"
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {signOutAsk && (
          <LeaveConfirmDialog
            title="Before you sign out"
            question={signOutAsk}
            leaveLabel="Sign out anyway"
            stayLabel="Stay signed in"
            onStay={() => setSignOutAsk(null)}
            onLeave={() => {
              setSignOutAsk(null);
              signOutNow();
            }}
          />
        )}

      </FeedbackProvider>
    </ErrorBoundary>
  );
}

