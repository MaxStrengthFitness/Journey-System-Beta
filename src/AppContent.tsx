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

import { db, auth, browserPopupRedirectResolver, prepareSignIn, signInNeedsHelperFirst } from "./firebase";
import { useSignInReady } from "./features/front-door/sign-in-ready";
import { markBoot } from "./features/boot-timing/boot-timing";
import { studioTodayKey } from "./lib/studio-time";
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
  isOpenSession,
  myTrainerIds,
  openSessionElsewhereWords,
  ownSessionName,
  peekLiveSessionId,
  resumeSession,
  type RememberedSessionData,
} from "./lib/live-session";
import { afterOverlayClose } from "./lib/scroll-lock";
import { installShakeUndoGuard } from "./lib/shake-undo";
import { useToast } from "./contexts/ToastContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
// Lazy (the speed round, Oct 5 2026, R13): only someone signed in with no
// trainer record ever sees it, so it is not on every iPad's first screen.
// Each place it is drawn is inside its own LoadBoundary.
const AccessRequestView = lazy(() => import("./components/AccessRequestView"));
// Lazy-loaded: downloaded on first visit to this view, not at app start.
const TrainerSettingsView = lazy(() =>
  import("./features/settings").then((m) => ({
    default: m.TrainerSettingsView,
  })),
);
// Lazy-loaded: downloaded on first visit to this view, not at app start, and
// fetched in the background once the Hub is quiet (the warm-up below; the
// speed round, Oct 5 2026, R13), so the first client opened after a cold
// start or a deploy does not wait for it. One loader for both.
const loadClientProfile = () =>
  import("./components/ClientProfileView").then((m) => ({
    default: m.ClientProfileView,
  }));
const ClientProfileView = lazy(loadClientProfile);
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
// Lazy (R13): opened only to add a client by hand; inside its own LoadBoundary.
const CreateClientModal = lazy(() =>
  import("./components/CreateClientModal").then((m) => ({ default: m.CreateClientModal })),
);
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
import { LeaveConfirmDialog, useGuardedSetter, useLeaveGuard } from "./features/unsaved-changes";
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
import { CheckingIn } from "./features/front-door/CheckingIn";
import { CantCheck } from "./features/front-door/CantCheck";
import {
  isCompanyMicrosoftEmail,
  signInErrorSentence,
  wrongMicrosoftAccountSentence,
} from "./features/front-door/sign-in-errors";
import type { LiveMeta, TrainerLookup } from "./hooks/useAuthInitialization";
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
import { rosterNeedNotWait, useRosterHeadStart } from "./hooks/useRosterHeadStart";
import { useMachineTotals } from "./features/machine-totals/useMachineTotals";
import { withMachineTotals } from "./features/machine-totals/totals";
import { useClientMutations } from "./hooks/useClientMutations";
// Pure and tiny, and imported from the module rather than the barrel (the
// Learning tab itself is lazy-loaded): the link format the bell, search and
// notes share.
import { parseLearningRef, type LearningRef } from "./features/learning/ref";
import { rememberMyStudioSection } from "./features/my-studio/section-memory";
import { AppBottomBar } from "./components/AppBottomBar";
import { StatusBarStrip } from "./features/home-screen/StatusBarStrip";
import { EnvironmentMark } from "./features/environment-mark/EnvironmentMark";

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
  studiosKnown = true,
  trainersKnown = true,
  networksKnown = true,
  studiosConfirmed = true,
  handleLogout,
  tokenRole,
  signInRefusal = null,
  trainerLookup = "done",
  lookupStep = 3,
  retryLookup,
}: {
  user: FirebaseUser;
  authTrainer: Trainer;
  setAuthTrainer: (t: Trainer | null) => void;
  studios: Studio[];
  setStudios: (s: Studio[], meta?: LiveMeta) => void;
  trainers: Trainer[];
  setTrainers: (t: Trainer[], meta?: LiveMeta) => void;
  networks: FranchiseNetwork[];
  setNetworks: (n: FranchiseNetwork[], meta?: LiveMeta) => void;
  /**
   * Whether each list has answered yet (the speed round, Oct 5 2026): the
   * app opens on the trainer record and the lists arrive beside it, so a
   * screen that would say something off one asks first.
   * features/front-door/boot-lookup.ts.
   */
  studiosKnown?: boolean;
  trainersKnown?: boolean;
  networksKnown?: boolean;
  /** The server has answered for the studios; dropping a missing one waits for it. */
  studiosConfirmed?: boolean;
  handleLogout: () => Promise<void>;
  tokenRole: string | null;
  /** Why the last sign-in was turned away: a switched-off account (Oct 2 2026). */
  signInRefusal?: string | null;
  /** Where finding the signed-in person has got to (the front door, Oct 3 2026). */
  trainerLookup?: TrainerLookup;
  /** How many of the three check steps are done. */
  lookupStep?: number;
  /** Look the signed-in person up again ("Can't check" → Try again). */
  retryLookup?: () => void;
}) {
  const { success: toastSuccess, info: toastInfo, error: toastError } = useToast();
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

  /*
   * THE iPAD'S STUDIO no longer opens by itself after a sign-in (the front
   * door, Oct 3 2026): it GREETS the person with it instead (StudioSelection
   * View), one tap in, because iPads change hands at the start of the day and
   * the greeting is where whose iPad it is gets seen. A pin to a studio that
   * no longer exists is still dropped here.
   */
  useEffect(() => {
    // Only on the server's word: the iPad's own copy of the list may be
    // missing a studio that exists (the speed round, Oct 5 2026).
    if (activeStudioId || isChangingStudio || studios.length === 0 || !studiosConfirmed) return;
    const pinned = getDefaultStudioId();
    if (pinned && !studios.some((s) => s.id === pinned)) setDefaultStudioId(null);
  }, [activeStudioId, isChangingStudio, studios, studiosConfirmed]);
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
  // The raw setter goes to the Active Session alone, for Who's this? (asked
  // at its own tap) and for taking back a client the database refused (the
  // open session round, Oct 9 2026); every button gets the guarded one.
  const [selectedClientId, setSelectedClientIdNow] = useState<string | null>(null);
  const setSelectedClientId = useGuardedSetter(selectedClientId, setSelectedClientIdNow);
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
  /* The day's bookings first (the iPad round, Oct 6 2026): the roster's
     listener waits until the Hub's day has answered, or a few seconds, so on
     a slow iPad the Hub draws its day before it takes in every client. */
  const rosterMayStart = useRosterHeadStart(
    activeStudioId,
    rosterNeedNotWait({
      onHub: currentView === "clients",
      online: typeof navigator === "undefined" || navigator.onLine !== false,
      dayLoading: scheduleDayState(studioTodayKey()) === "loading",
    }),
  );
  const { clients: rosterClients, status: rosterStatus, cut: rosterCut } = useStudioRoster(
    activeStudioId,
    isDataReady,
    schedules,
    { start: rosterMayStart },
  );
  const { sessions, sessionsKnown } = useSessions(activeStudioId, isDataReady);
  /* The Hub's day first answered: the open's last mark, and on a cold open
     the moment its one small timing report goes (features/boot-timing, R30). */
  useEffect(() => {
    if (activeStudioId && scheduleDayState(studioTodayKey()) === "ready") markBoot("hub-data");
  }, [activeStudioId, scheduleDayState]);

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
  /**
   * The client on screen's machine totals (the last set on each machine and
   * each machine's lifetime rollup), live from their own document since the
   * iPad round (features/machine-totals): the roster no longer carries them.
   * Folded into that one client below, so the profile, the session and the
   * machine menu read them where they always did.
   */
  const selectedTotals = useMachineTotals(selectedClientId);
  const clients = useMemo(
    () =>
      Array.from(
        new Map(
          [
            ...(selectedClientDoc ? [selectedClientDoc] : []),
            ...rosterClients,
          ].map((c) => [c.id, c]),
        ).values(),
      ).map((c) => (selectedClientId && c.id === selectedClientId ? withMachineTotals(c, selectedTotals) : c)),
    [selectedClientDoc, rosterClients, selectedClientId, selectedTotals],
  );
  const [isReorderingTrainers, setIsReorderingTrainers] = useState(false);
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

  /** The header's button: the week ahead. Its click event is not a range. */
  const handleRefreshSchedule = () => {
    void pullScheduleFromMindbody();
  };

  const setView = (view: View) => {
    const go = () => setCurrentView(view);
    // A move to another screen asks the unsaved-changes gate first. (The
    // intro-session flag that rode along here, and that no caller ever set,
    // went with the first-session design round, Oct 8 2026, §4.8.)
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
  /* What sign-out and the new-version line call this trainer's running
     session: "" is an open session, which has no client yet (Oct 9 2026). */
  const mySessionName = ownSessionName(myLiveSession);

  /* Open session goes back to this trainer's own running open session rather
     than starting a second one (the open session round, Oct 9 2026), so the
     stream it is found in is handed to the hook. */
  const {
    startOpenSession,
    startingOpenSession,
    updateClient,
  } = useClientMutations({
    authTrainer,
    uid: user?.uid ?? null,
    activeStudioId,
    sessions,
    setSelectedClientId,
    setCurrentView,
    onRefused: toastError,
  });

  /* The Session tab (lib/live-session.ts `resumeSession`): the stream's live
     session, a client's or this trainer's open session, else the session the
     device remembered, read by its id and followed only while it is live
     (Sep 24 2026). An open session at another studio is said, not followed
     (Oct 9 2026). */
  const resumeLiveSession = useCallback(
    () =>
      resumeSession(
        {
          selectedHasSession: !!currentSession,
          selectedClientId,
          mine: myLiveSession,
          activeStudioId,
          rememberedId: peekLiveSessionId(),
        },
        {
          readSession: async (id) => {
            const snap = await getDoc(doc(db, "sessions", id));
            return snap.exists() ? (snap.data() as RememberedSessionData) : null;
          },
          selectClient: setSelectedClientId,
          show: (view) => setCurrentView(view),
          elsewhere: (studioId) =>
            toastInfo(openSessionElsewhereWords(studios.find((s) => s.id === studioId)?.name)),
        },
      ),
    [currentSession, myLiveSession, selectedClientId, activeStudioId, studios, toastInfo],
  );

  /*
   * A NEW VERSION (new-version round, Sep 26 2026). Every push to master
   * deploys, and a deploy deletes the screen files an open app has not
   * fetched yet. This notices a new version when Journey comes back on
   * screen, loads it by itself only on the Hub, and never over the Active
   * Session, this trainer's own running session (a client's, or an open
   * session with no client yet), saves still sending, typing or a session
   * note draft. Everywhere else the line under the header says so.
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
    ownSessionClientName: mySessionName,
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
      ownSessionClientName: mySessionName,
    }),
    [newVersion.recoverScreen, newVersion.tapScreen, mySessionName],
  );
  // The Active Session and Pulse, fetched once the shell is up and quiet, so
  // a deploy later in the day cannot stop a session from opening
  // (features/new-version/warm-up.ts), then the client profile, so its first
  // open does not wait for its download (R13). Once per page, at idle moments.
  const warmedUp = useRef(false);
  useEffect(() => {
    if (!shellReady || warmedUp.current) return;
    warmedUp.current = true;
    warmUp([loadWorkoutTracker, loadClientCheckInPanel, loadClientProfile]);
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
        ownSessionClientName: mySessionName,
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
   * service account with a dry run. (scripts/purge-database.ts was that
   * place until Oct 10 2026, when it was removed; clearing test data is
   * scripts/reset-test-data.ts.)
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
        // Offline, getDocs answers from the iPad's copy: say so, so it is not
        // taken as the server's answer (the speed round's final review).
        setStudios(
          snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Studio),
          { fromCache: snap.metadata.fromCache },
        );
      } else if (collectionName === "networks") {
        const snap = await getDocs(collection(db, "networks"));
        setNetworks(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as FranchiseNetwork,
          ),
          { fromCache: snap.metadata.fromCache },
        );
      } else if (collectionName === "trainers") {
        const snap = await getDocs(collection(db, "trainers"));
        // Tombstoned placeholders are not people — see trainer-identity/claim.ts.
        setTrainers(
          withoutSuperseded(
            snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Trainer),
          ),
          { fromCache: snap.metadata.fromCache },
        );
      }
    } catch (e) {
      console.error("Manual refresh failed", e);
    }
  };

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  /* The popup helper, loaded as the sign-in screen appears; on Safari the
     buttons wait for it (the speed round, Oct 5 2026, R14). */
  const signInReady = useSignInReady({ active: !user, prepare: prepareSignIn, mustWait: signInNeedsHelperFirst() });

  /* Microsoft sign-in is limited to company staff (MICROSOFT_DOMAIN,
     features/front-door/sign-in-errors.ts). */

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
      // The helper is passed here: Auth starts without one on a device that
      // was signed in (src/firebase.ts, lib/auth-boot.ts).
      const credential = await signInWithPopup(auth, provider, browserPopupRedirectResolver);

      // Microsoft sign-in is for company staff only. The single-tenant Azure app
      // already blocks outsiders, but a guest invited into the tenant would
      // otherwise slip through, so the address is checked here too.
      if (providerName === "microsoft") {
        const signedInEmail = (
          credential.user.email ||
          credential.user.providerData.find((p) => p?.email)?.email ||
          ""
        ).toLowerCase();

        if (!isCompanyMicrosoftEmail(signedInEmail)) {
          await signOut(auth);
          setLoginError(wrongMicrosoftAccountSentence(signedInEmail));
          return;
        }
      }
    } catch (error: any) {
      // Plain words first, the technical detail after for head office
      // (features/front-door/sign-in-errors.ts); a closed window says nothing.
      const sentence = signInErrorSentence(error);
      if (!sentence) return;
      console.error("Login failed:", error);
      setLoginError(sentence);
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!user) {
    return (
      <LoginScreen
        isLoggingIn={isLoggingIn}
        loginError={loginError ?? signInRefusal}
        onLogin={handleLogin}
        signInReady={signInReady}
      />
    );
  }

  /* Signed in, but Journey hasn't found (or couldn't read) the trainer record
     yet. Neither is "not on a team": the request form waits for a finished
     lookup that found nobody (the front door, Oct 3 2026). */
  const signedInEmail = user?.email || user?.providerData?.find((p) => p?.email)?.email || null;
  if (user && trainerLookup === "checking") {
    return <CheckingIn step={lookupStep} email={signedInEmail} onSignOut={() => void handleLogout()} />;
  }
  if (user && !authTrainer && trainerLookup === "failed") {
    return (
      <CantCheck
        email={signedInEmail}
        onRetry={() => retryLookup?.()}
        onSignOut={() => void handleLogout()}
      />
    );
  }

  // Intercept authenticated but unauthorized users
  if (user && !authTrainer) {
    return (
      <ScreenRecoveryProvider value={screenRecovery}>
      <LoadBoundary kind="screen">
      <Suspense fallback={<ViewLoader />}>
      <AccessRequestView
        authenticatedUser={user}
        studios={studios}
        onTrainerCreated={setAuthTrainer}
        onCheckAgain={retryLookup}
        onLogout={handleLogout}
      />
      </Suspense>
      </LoadBoundary>
      </ScreenRecoveryProvider>
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
        studiosKnown={studiosKnown}
        networksKnown={networksKnown}
        trainersKnown={trainersKnown}
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
        onSignOut={() => handleLogout().catch(console.error)}
        greet={!activeStudioId && !isChangingStudio}
        currentStudioId={activeStudioId}
      />
    );
  }

  // Access Request Screen (if authenticated via Google but no matching profile exists)
  if (!authTrainer) {
    return (
      <ScreenRecoveryProvider value={screenRecovery}>
      <LoadBoundary kind="screen">
      <Suspense fallback={<ViewLoader />}>
      <AccessRequestView
        authenticatedUser={user}
        studios={studios}
        onTrainerCreated={(t) => {
          setAuthTrainer(t);
        }}
        onCheckAgain={retryLookup}
        onLogout={handleLogout}
      />
      </Suspense>
      </LoadBoundary>
      </ScreenRecoveryProvider>
    );
  }

  if (newClientOnboardingName !== null) {
    return (
      <ScreenRecoveryProvider value={screenRecovery}>
      <LoadBoundary kind="screen">
      <Suspense fallback={<ViewLoader />}>
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
      </Suspense>
      </LoadBoundary>
      </ScreenRecoveryProvider>
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
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-chrome-ink-2 pointer-events-none" />
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
          // The frame's own well, the same in both themes (the Navy Frame,
          // Oct 4 2026). Every background is restated with its dark: twin
          // because <Input> carried `dark:bg-input/30`, which would come
          // back in the dark theme as a pale wash in the navy (since type
          // and depth, Oct 4, it carries the card's well instead, which this
          // replaces too); the border stays transparent so --input draws no
          // grey box around it.
          className="h-10 pl-8 pr-10 rounded-lg border border-transparent bg-chrome-field dark:bg-chrome-field focus-visible:bg-chrome-field dark:focus-visible:bg-chrome-field text-sm font-medium text-chrome-ink placeholder:text-chrome-ink-2 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-chrome-here"
        />
        {hubSearchTerm && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setHubSearchTerm("");
              hubSearchInputRef.current?.focus();
            }}
            className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-md text-chrome-ink-2 hover:text-chrome-ink outline-none focus-visible:ring-2 focus-visible:ring-chrome-here"
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
   *
   * The icons sit on the frame, the same navy in both themes (the Navy Frame,
   * Oct 4 2026), so they take the frame's inks and never a theme ink: the
   * ghost button's own `hover:text-foreground` and `aria-expanded:` colours
   * would be navy on navy in the light theme, and its `dark:hover:bg-muted/50`
   * a disc in one theme only. `menuIconClass` is the same button for the two
   * that move into the avatar menu on a phone, which is a theme surface.
   */
  const headerIconClass =
    "relative h-10 w-10 rounded-full shrink-0 inline-flex items-center justify-center transition-colors outline-none hover:bg-transparent dark:hover:bg-transparent aria-expanded:bg-transparent text-chrome-ink-2 hover:text-chrome-ink aria-expanded:text-chrome-ink focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-chrome-here disabled:opacity-50";
  const menuIconClass =
    "relative h-10 w-10 rounded-full shrink-0 inline-flex items-center justify-center transition-colors outline-none hover:bg-transparent dark:hover:bg-transparent aria-expanded:bg-transparent text-muted-foreground hover:text-foreground aria-expanded:text-foreground focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

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
        className={`${headerIconClass} ${currentView === "trainer-hub" ? "text-chrome-ink" : ""}`}
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
      {/* Your avatar on the frame: the frame's own blue with navy initials
          (7.5:1), the same in both themes. The logo blue itself would be
          2.0:1 on the navy. The menu below is a theme surface (a popover).
          The initials are the display face UPRIGHT at 800 (AJ's answer 1A,
          Oct 4 2026: the slant is the studio's name and Go's alone), 15px
          on an iPad as the kit draws them. The press is a transform; no
          shadow is animated. */}
      <DropdownMenuTrigger aria-label="Your menu" className="w-10 h-10 sm:w-11 sm:h-11 rounded-full font-display font-extrabold text-xs sm:text-[15px] tracking-[0.02em] flex items-center justify-center cursor-pointer shadow-sm mx-auto active:scale-95 transition-transform hover:opacity-90 bg-chrome-here text-chrome outline-none focus-visible:ring-2 focus-visible:ring-chrome-ink shrink-0">
        {authTrainer.initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-60 rounded-[24px] border border-border bg-popover p-2 shadow-2xl text-foreground"
      >
        <DropdownMenuGroup>
          {canOpenOperations && (
            <div className="px-3 py-2 border-b border-border mb-2">
              <Label className="text-[14px] font-bold text-ink-d2 block mb-2">
                App mode
              </Label>
              {/* A tray below the menu, the picked mode raised in it with its
                  soft ring (the profile's tab tray; type and depth review). */}
              <div className="flex bg-(--tray) p-1 rounded-xl">
                <button
                  onClick={() =>
                    menuNavigate(() => switchAppMode("trainer", "clients"))
                  }
                  className={`flex-1 flex items-center justify-center min-h-10 px-1.5 text-[12px] rounded-lg transition-colors ${appMode === "trainer" ? "bg-(--raised) shadow-(--raised-lift) ring-1 ring-(--edge-control) font-bold text-primary" : "font-semibold text-ink-d2 hover:text-foreground"}`}
                >
                  Trainer
                </button>
                <button
                  onClick={() =>
                    menuNavigate(() => switchAppMode("admin", "admin-dashboard"))
                  }
                  className={`flex-1 flex items-center justify-center min-h-10 px-1.5 text-[12px] rounded-lg transition-colors ${appMode === "admin" && currentView !== "admins-dashboard" ? "bg-(--raised) shadow-(--raised-lift) ring-1 ring-(--edge-control) font-bold text-(--eq-hero-text)" : "font-semibold text-ink-d2 hover:text-foreground"}`}
                >
                  {/* Label only: the mode is still "admin" inside (Renewals round, Sep 2026). */}
                  Operations
                </button>
                {isAdmin && (
                  <button
                    onClick={() =>
                      menuNavigate(() => switchAppMode("admin", "admins-dashboard"))
                    }
                    className={`flex-1 flex items-center justify-center min-h-10 px-1.5 text-[12px] rounded-lg transition-colors ${appMode === "admin" && currentView === "admins-dashboard" ? "bg-(--raised) shadow-(--raised-lift) ring-1 ring-(--edge-control) font-bold text-(--eq-hero-text)" : "font-semibold text-ink-d2 hover:text-foreground"}`}
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
                className="rounded-xl flex items-center gap-3 p-3 min-h-11 text-[14px] font-semibold cursor-pointer"
              >
                <GraduationCap className="w-4 h-4 text-primary" />
                Learning
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => menuNavigate(() => switchAppMode("trainer", "calendar"))}
                className="rounded-xl flex items-center gap-3 p-3 min-h-11 text-[14px] font-semibold cursor-pointer"
              >
                <CalendarIcon className="w-4 h-4 text-primary" />
                Calendar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => menuNavigate(() => setCurrentView("trainer-hub"))}
                className="rounded-xl flex items-center gap-3 p-3 min-h-11 text-[14px] font-semibold cursor-pointer"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isRefreshingSchedule}
                onClick={() => {
                  setTrainerMenuOpen(false);
                  void handleRefreshSchedule();
                }}
                className="rounded-xl flex items-center gap-3 p-3 min-h-11 text-[14px] font-semibold cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 text-muted-foreground ${isRefreshingSchedule ? "animate-spin" : ""}`} />
                {isRefreshingSchedule ? "Syncing schedule…" : "Refresh schedule"}
              </DropdownMenuItem>
              <div className="flex items-center gap-2 px-3 py-1">
                <ThemeToggle className={menuIconClass} />
                <FeedbackButton className={menuIconClass} />
                <span className="text-[12px] font-semibold text-muted-foreground">
                  Theme · Feedback
                </span>
              </div>
              <DropdownMenuSeparator className="my-2 bg-border" />
            </>
          )}
          <DropdownMenuLabel className="text-[14px] font-bold px-3 py-2 text-ink-d2">
            Active profile
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() =>
              menuNavigate(() => {
                setSelectedProfileTrainerId(null);
                setCurrentView("trainer-profile");
              })
            }
            className="rounded-xl flex items-center gap-3 p-3 text-[14px] font-semibold cursor-pointer hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground"
          >
            <UserCircle className="w-4 h-4 text-primary" />
            View profile
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-2 bg-border" />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => menuNavigate(openStudioPicker)}
            className="rounded-xl flex items-center gap-3 p-3 text-[14px] font-semibold cursor-pointer hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground"
          >
            <Building2 className="w-4 h-4 text-primary" />
            Switch studio
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
            variant="destructive"
            onClick={() => menuNavigate(() => void logOut())}
            className="rounded-xl flex items-center gap-3 p-3 text-[14px] font-semibold text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive dark:hover:bg-destructive/20 cursor-pointer"
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
        <div className="app-shell flex flex-col overflow-hidden bg-background text-foreground font-sans overflow-x-hidden w-full max-w-full">
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
          {/* A development build (npm run dev on the PC) talks to live data:
              one plum line says so, on every screen including the Active
              Session. Nothing at all in a production build
              (features/environment-mark). */}
          <EnvironmentMark />
          {/* Above the header, and outside the `workouts` condition below, so
              it is on the Active Session too — see DemoBanner.tsx. */}
          {isDemoStudioId(activeStudioId) && (
            <DemoBanner onLeave={openStudioPicker} />
          )}

          {/* Header */}
          {currentView !== "workouts" && (
            <AppHeader
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
              and the session none (its cards pad themselves). The ground is
              --background in all three branches (the Navy Frame, Oct 4 2026):
              it was slate-50 / slate-950, so a new --background never reached
              the page people see, and the cards sat on a ground one rung
              lighter than the theme's. */}
          <main
            className={`w-full max-w-full mx-auto relative ${currentView === "workouts" ? "flex-1 min-h-0 p-0 sm:p-2 overflow-y-auto overscroll-contain bg-background flex flex-col" : currentView === "clients" || currentView === "client-directory" || currentView === "calendar" || isLearningView || currentView === "studio-tasks" ? "flex-1 min-h-0 overflow-hidden bg-background p-0 flex flex-col" : "flex-1 min-h-0 p-3 sm:p-6 overflow-y-auto overscroll-contain bg-background"}`}
          >
            {/* A screen whose file a deploy removed replaces only itself, and
                recovers when it is safe to; any other error goes on up to the
                ErrorBoundary as before (features/new-version). */}
            <ScreenRecoveryProvider value={screenRecovery}>
            <LoadBoundary kind="screen" resetKey={currentView} sessionScreen={currentView === "workouts"}>
            <Suspense fallback={<ViewLoader />}>
              {/* One screen at a time. This was motion's AnimatePresence in
                  "wait" mode, so a screen opened only after the Hub had
                  faded out; the speed round (Oct 5 2026, R13) dropped it with
                  the motion runtime it put on the first screen. */}
              <>
                {currentView === "client-directory" && (
                  <ClientDirectory
                    clients={clients}
                    onSelectClient={(id) => {
                      setSelectedClientId(id);
                      setCurrentView("profile");
                    }}
                    onStartOpenSession={startOpenSession}
                    openSessionStarting={startingOpenSession}
                    openSessionRunning={isOpenSession(myLiveSession)}
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
                    setSelectedClientIdNow={setSelectedClientIdNow}
                    authTrainer={authTrainer}
                    isSyncing={isSyncing}
                    setIsSyncing={setIsSyncing}
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
                    clientsStatus={rosterStatus}
                    onStartOpenSession={startOpenSession}
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
                      trainers={trainers}
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
                    clientsStatus={rosterStatus}
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
                      /* In the app's tokens (the rooms round, Oct 10 2026):
                         it was raw Tailwind red and slate. Plum is caution;
                         crimson stays for critical. No reload of its own
                         (KNOWN-TRAPS: never window.location.reload() from a
                         screen): back to the Hub, which leaves this boundary,
                         so the Calendar opens fresh next time. */
                      <div className="m-3 sm:m-6 flex flex-col items-center justify-center gap-3 p-8 text-center bg-card text-card-foreground rounded-[14px] border border-(--edge) shadow-(--panel-lift)">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center bg-(--eq-warn-fill)">
                          <AlertTriangle className="w-8 h-8 text-(--eq-warn)" aria-hidden />
                        </div>
                        <h3 className="font-display text-[22px] font-extrabold leading-tight">
                          The Calendar couldn{"’"}t open
                        </h3>
                        <p className="text-muted-foreground max-w-sm">
                          Something went wrong drawing the schedule. The Hub
                          and every client{"’"}s profile still work.
                        </p>
                        <Button variant="outline" onClick={() => setView("clients")}>
                          Back to the Hub
                        </Button>
                      </div>
                    }
                  >
                    {/* Inside the calendar's own boundary, so a missing file
                        is recovered rather than called "The Calendar couldn’t open". */}
                    <LoadBoundary kind="screen">
                    <CalendarView
                      schedules={schedules}
                      // In the studio's order, as the Hub's columns are.
                      trainers={sortedTrainers}
                      mindbodySiteId={studios.find((s) => s.id === activeStudioId)?.mindbodySiteId ?? null}
                      rosterStatus={rosterStatus}
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
                        // What is known about each day: a day whose read
                        // failed is said, never drawn empty (the rooms
                        // round, Oct 10 2026; the Hub's own since Oct 1).
                        dayState: scheduleDayState,
                        retry: retrySchedules,
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
              </>
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
          <DialogContent className="max-w-md sm:max-w-md rounded-[32px] p-0 overflow-hidden border-none shadow-2xl max-h-[85dvh] flex flex-col">
            <DialogHeader className="p-8 bg-card border-b shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-2xl">
                  <GripVertical className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <DialogTitle>
                    Team presence sorting
                  </DialogTitle>
                  <DialogDescription>
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
                    className="flex items-center gap-4 p-4 bg-card rounded-2xl border border-border/50 group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-(--well) shadow-(--elev-0) flex items-center justify-center font-bold text-[12px] text-muted-foreground">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[14px] [overflow-wrap:anywhere]">
                        {trainer.fullName}
                      </p>
                      <p className="text-[12px] font-semibold text-muted-foreground">
                        {trainer.initials}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={idx === 0}
                        className="rounded-lg hover:bg-primary/10 hover:text-primary disabled:opacity-20"
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
                        className="rounded-lg hover:bg-primary/10 hover:text-primary disabled:opacity-20"
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
            <DialogFooter className="p-6 border-t bg-card shrink-0">
              <Button
                onClick={() => setIsReorderingTrainers(false)}
                className="rounded-xl text-[14px] font-bold w-full h-12"
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

