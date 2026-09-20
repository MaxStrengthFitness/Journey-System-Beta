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
  Users,
  Plus,
  AlertCircle,
  AlertTriangle,
  LogOut,
  UserCircle,
  ClipboardList,
  ChevronRight,
  MessageSquare,
  StickyNote,
  Settings,
  GripVertical,
  LayoutDashboard,
  ShieldCheck,
  Play,
  Calendar,
  Lock,
  Edit3,
  TrendingUp,
  PlayCircle,
  ChevronDown,
  ChevronUp,
  Building2,
  Search,
  RefreshCw,
  X,
  GraduationCap,
  NotebookPen,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  collection,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  getDocs,
  getDoc,
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
  Machine,
  Studio,
  FranchiseNetwork,
} from "./types";
import { OperationType, handleFirestoreError } from "./lib/firestore-errors";
import { isSessionValid } from "./lib/utils";
import { LoadingArea } from "./components/LoadingMark";
import {
  findMyLiveSession,
  forgetLiveSession,
  liveSessionTabLabel,
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
const ClientDirectoryView = lazy(() =>
  import("./components/ClientDirectoryView").then((m) => ({
    default: m.ClientDirectoryView,
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
// Lazy-loaded: downloaded on first visit to this view, not at app start.
const WorkoutTrackerView = lazy(() =>
  import("./components/WorkoutTrackerView").then((m) => ({
    default: m.WorkoutTrackerView,
  })),
);
// Lazy-loaded: downloaded on first visit to this view, not at app start.
const ConsultationWizard = lazy(() =>
  import("./components/ConsultationWizard").then((m) => ({
    default: m.ConsultationWizard,
  })),
);
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
import { FeedbackProvider, FeedbackButton } from "./features/feedback";
import { NotificationBell } from "./features/notifications";
import { plannerIntentFromLink, requestPlanner } from "./features/relay/intent";
import { PlannerReminders } from "./features/relay/reminders/PlannerReminders";
// Type-only, and from the module rather than the barrel, so nothing about the
// studio-tasks chunk is pulled into the initial bundle.
import type { ClientTaskAction } from "./features/studio-tasks/types";
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
import {
  isOwner,
  isStudioLeader,
} from "./lib/permissions";
import { hasRunOfDemo } from "./features/demo-mode/access";
import { isDemoStudioId } from "./features/demo-mode/is-demo";
import { DemoBanner } from "./features/demo-mode/DemoBanner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { DEFAULT_MACHINES, getMachineImageUrl } from "./data/default-machines";
import { MACHINE_DEFINITION_LIST } from "./data/machine-definitions";

// Shown in the content area while a lazy view downloads on first visit.
const ViewLoader = () => <LoadingArea label="" />;

import { useActiveStudio } from "./contexts/ActiveStudioContext";

import { useAutoSync } from "./features/admin/useAutoSync";
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
import { NavButton } from "./components/NavButton";

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
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
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
  const [appMode, setAppMode] = useState<"trainer" | "admin">("trainer");
  const [currentView, setCurrentView] = useState<View>("clients");
  /*
   * LEARNING LINKS (features/learning/ref.ts). Any page in Learning — a
   * machine, an Academy page, a studio's own page — can be opened from
   * anywhere: the bell, a note, an announcement. `openLearning` is the one
   * door. It switches to the section the page lives in; LearningView opens
   * the page and clears the jump, so a later re-render cannot pull a trainer
   * back to where they arrived twenty taps ago.
   */
  const [learningJump, setLearningJump] = useState<LearningRef | null>(null);
  const openLearning = useCallback((ref: LearningRef) => {
    setLearningJump(ref);
    setCurrentView(ref.kind === "machine" ? "machine-anatomy" : "academy");
  }, []);
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
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientDoc, setSelectedClientDoc] = useState<Client | null>(
    null,
  );
  /** Id of the last client whose fetch finished, successfully or not. */
  const [resolvedClientId, setResolvedClientId] = useState<string | null>(null);

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
      return;
    }

    let cancelled = false;
    setSelectedClientDoc(null);

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
  }, [selectedClientId]);

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
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
  } = useLiveSchedule(activeStudioId, isDataReady);
  /**
   * Every client of the studio the iPad is in (a live listener), plus any
   * booked visitor from elsewhere. Replaced the booking-window roster on
   * Sep 16 2026 — see src/lib/studio-roster.ts for what that got wrong.
   */
  const { clients: rosterClients, status: rosterStatus } = useStudioRoster(
    activeStudioId,
    isDataReady,
    schedules,
  );
  const { sessions } = useSessions(activeStudioId, isDataReady);

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
  const [showNewClientsDialog, setShowNewClientsDialog] = useState(false);
  const [isReorderingTrainers, setIsReorderingTrainers] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isIntroSession, setIsIntroSession] = useState(false);
  const [isRefreshingSchedule, setIsRefreshingSchedule] = useState(false);
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
    submitClientFormData,
    updateClientSessions,
    handleDeleteClient,
  } = useClientMutations(
    authTrainer,
    activeStudioId,
    machines,
    setSelectedClientId,
    setCurrentView,
  );

  const handleRefreshSchedule = async () => {
    const activeStudio = studios.find((s) => s.id === activeStudioId);

    if (!activeStudio?.mindbodySiteId) {
      toastError(
        `${activeStudio?.name || "This studio"} has no MindBody Site ID. Set it in Admin → Studios before syncing.`,
      );
      return;
    }

    const sharesSite = studios.some(
      (s) =>
        s.id !== activeStudio.id &&
        s.mindbodySiteId &&
        String(s.mindbodySiteId).trim() ===
          String(activeStudio.mindbodySiteId).trim(),
    );
    if (sharesSite && !activeStudio.mindbodyLocationId) {
      toastError(
        `${activeStudio.name} shares MindBody Site ${activeStudio.mindbodySiteId} with another studio but has no Location ID. Set it in Admin → Studios to keep schedules separate.`,
      );
      return;
    }

    setIsRefreshingSchedule(true);
    try {
      const siteId = String(activeStudio.mindbodySiteId);

      const { syncMindbodySchedules } = await import("./lib/mindbody-api-sync");
      const res = await syncMindbodySchedules(
        siteId,
        trainers,
        clients,
        studios,
        null,
        undefined,
        undefined,
        activeStudioId,
        activeStudio?.mindbodyLocationId,
      );

      if (res.errors && res.errors.length > 0) {
        toastError(`Sync completed with issues: ${res.errors[0]}`);
      } else {
        toastSuccess(
          `Schedule refreshed: ${res.added} added, ${res.updated} updated.`,
        );
      }
      console.log("Schedule refresh result:", res);
    } catch (error: any) {
      console.error("Failed to refresh schedule:", error);
      toastError("Failed to refresh schedule: " + error.message);
    } finally {
      setIsRefreshingSchedule(false);
    }
  };

  const setView = (view: View, data?: { isIntroSession?: boolean }) => {
    if (data?.isIntroSession) {
      setIsIntroSession(true);
    } else {
      setIsIntroSession(false);
    }
    setCurrentView(view);
  };

  useEffect(() => {
    if (currentView !== "clients") setHubSearchTerm("");
  }, [currentView]);

  const newClientsThisMonth = useMemo(() => {
    return clients.filter((c) => {
      if (!c.createdAt) return false;
      const createdAt = c.createdAt?.toDate?.() || new Date(c.createdAt);
      const now = new Date();
      return (
        createdAt.getMonth() === now.getMonth() &&
        createdAt.getFullYear() === now.getFullYear()
      );
    });
  }, [clients]);

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
  const myLiveSession = useMemo(
    () => findMyLiveSession(sessions, authTrainer?.id),
    [sessions, authTrainer?.id],
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
    // Second net: the id the device remembered, read directly — this
    // survives a heartbeat older than the stream's 60-minute cutoff.
    const rememberedId = peekLiveSessionId();
    if (rememberedId) {
      try {
        const snap = await getDoc(doc(db, "sessions", rememberedId));
        const data = snap.exists() ? (snap.data() as { status?: string; clientId?: string }) : null;
        if (data?.status === "In-Progress" && data.clientId) {
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
  // Derived state for the active studio name
  const activeStudioName = useMemo(() => {
    if (!activeStudioId) return null;
    return studios.find((s) => s.id === activeStudioId)?.name || null;
  }, [activeStudioId, studios]);

  const [clientFormData, setClientFormData] = useState({
    firstName: "",
    lastName: "",
    gender: "Male" as "Male" | "Female" | "Other",
    heightFeet: "",
    heightInches: "",
    weight: "",
    age: "",
    occupation: "",
    phone: "",
    email: "",
    address: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    isActive: true,
    isRoutineBActive: false,
    medicalHistory: "",
    globalNotes: "",
    remainingSessions: 10,
    mindbody_name: "",
  });

  const startEditClient = (client: Client) => {
    setEditingClient(client);

    // Parse height string (e.g., "5' 10\"")
    let ft = "";
    let inc = "";
    if (client.height) {
      if (client.height.includes("'")) {
        const parts = client.height.split("'");
        ft = parts[0].trim();
        if (parts[1]) {
          inc = parts[1].replace('"', "").trim();
        }
      } else {
        // Fallback for old numeric data (assuming inches if > 15)
        const totalInches = parseInt(client.height);
        if (!isNaN(totalInches) && totalInches > 15) {
          ft = Math.floor(totalInches / 12).toString();
          inc = (totalInches % 12).toString();
        } else {
          ft = client.height;
        }
      }
    }

    setClientFormData({
      firstName: client.firstName,
      lastName: client.lastName,
      gender: client.gender,
      heightFeet: ft,
      heightInches: inc,
      height: client.height, // Keep for legacy if needed momentarily
      weight: client.weight || "",
      age: client.age?.toString() || "",
      occupation: client.occupation || "",
      phone: client.phone || "",
      email: client.email || "",
      address: client.address || "",
      emergencyContactName: client.emergencyContactName || "",
      emergencyContactPhone: client.emergencyContactPhone || "",
      isActive: client.isActive,
      isRoutineBActive: client.isRoutineBActive || false,
      remainingSessions: client.remainingSessions,
      medicalHistory: client.medicalHistory || "",
      globalNotes: client.globalNotes || "",
    });
    // setIsAddingClient removed as we use editingClient state or the new modal for creation
  };

  const updateStudio = async (studioId: string, updates: Partial<Studio>) => {
    try {
      await updateDoc(doc(db, "studios", studioId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitClientFormData(clientFormData as any, editingClient);

      if (editingClient) {
        setEditingClient(null);
      }

      setClientFormData({
        firstName: "",
        lastName: "",
        gender: "Male",
        heightFeet: "",
        heightInches: "",
        height: "",
        weight: "",
        age: "",
        occupation: "",
        phone: "",
        email: "",
        address: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
        isActive: true,
        isRoutineBActive: false,
        medicalHistory: "",
        globalNotes: "",
        remainingSessions: 10,
        mindbody_name: "",
      });
    } catch (error) {
      // Error handled by hook
    }
  };

  const [showClientPicker, setShowClientPicker] = useState(false);
  const [infoMachineId, setInfoMachineId] = useState<string | null>(null);
  const [isEditingMachineInfo, setIsEditingMachineInfo] = useState(false);
  const [machineInfoDraft, setMachineInfoDraft] = useState<Partial<Machine>>(
    {},
  );

  const infoMachine = machines.find((m) => m.id === infoMachineId);

  useEffect(() => {
    if (infoMachine) {
      setMachineInfoDraft(infoMachine);
    }
  }, [infoMachine]);

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

  const handleTrainerLock = () => {
    setAuthTrainer(null);
    localStorage.removeItem("max_strength_trainer_id");
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

  /**
   * Write the standard twenty back into the catalog.
   *
   * Seeds from data/machine-definitions.ts, NOT data/default-machines.ts.
   * That was the bug behind "we edit a machine and nothing is filled out":
   * DEFAULT_MACHINES is the legacy `Machine` shape — `targetMuscles` as one
   * comma string, `settingOptions` as bare labels, and nothing at all for the
   * biomechanics template — while the editor reads `MachineDefinition`. Every
   * catalog document in production was written by this handler, so every one
   * of them opened blank.
   *
   * `merge: true` on purpose: the legacy keys stay on the document rather
   * than being stripped. They have readers elsewhere (adapters.ts still falls
   * back to `trainerTips`), and the house rule is that a write with no reader
   * is a bug to fix, not a field to delete.
   */
  const handleRestoreMachines = async () => {
    try {
      const promises = MACHINE_DEFINITION_LIST.map((machine) =>
        setDoc(
          doc(db, "machines", machine.id),
          {
            ...machine,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      );

      await Promise.all(promises);
      toastSuccess(
        `${MACHINE_DEFINITION_LIST.length} standard machines written, with their Academy setup guides.`,
      );
    } catch (error: any) {
      console.error("Restore failed:", error);
      toastError(`Restore failed: ${error.message || "Unknown error"}`);
    }
  };

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
        initialName={newClientOnboardingName}
        onClientCreated={async (clientId, routeToImporter) => {
          setSelectedClientId(clientId);
          setNewClientOnboardingName(null);

          if (routeToImporter) {
            setCurrentView("chart-importer");
          } else {
            setCurrentView("profile");
          }
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
            setHubSearchTerm(e.target.value);
            if (currentView !== "clients") setCurrentView("clients");
          }}
          placeholder="Search clients"
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
      <ThemeToggle className={headerIconClass} />
      <FeedbackButton className={headerIconClass} />
      {/* Rings the bell when one of your own Planner reminders comes due. */}
      <PlannerReminders authTrainer={authTrainer ?? null} />
      <NotificationBell
        trainerId={authTrainer?.id}
        authTrainer={authTrainer}
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
          if (view === "profile" && id) setSelectedClientId(id);
          if (view === "studio-tasks") {
            const intent = plannerIntentFromLink(id);
            if (intent) requestPlanner(intent);
          }
          setCurrentView(view as any);
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCurrentView("trainer-hub")}
        className={`${headerIconClass} ${currentView === "trainer-hub" ? "text-foreground" : "active:text-orange-500"}`}
        title="Trainer Control Hub"
        aria-label="Trainer Control Hub"
      >
        <Settings className="w-5 h-5 sm:w-6 sm:h-6 transition-colors hover:stroke-orange-500" />
      </Button>
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

  /*
   * Who is offered Operations from the trainer menu: studio leaders and above,
   * and — inside Demo Mode — everyone. "Full access" is the whole point of the
   * demo studio (AJ, Sep 20 2026), and the Firestore rules agree, so a trainer
   * practising there can open the half of the app their own role keeps shut
   * without the database refusing a single thing they try.
   *
   * Operations scopes itself to the one realm the app is standing in, so this
   * can never show a real studio's numbers — see features/admin/scope.ts.
   */
  const canOpenOperations =
    isStudioLeader(authTrainer) || hasRunOfDemo(authTrainer, activeStudioId);

  const headerTrainerDropdown = authTrainer ? (
    <DropdownMenu open={trainerMenuOpen} onOpenChange={setTrainerMenuOpen}>
      <DropdownMenuTrigger className="w-8 h-8 sm:w-11 sm:h-11 rounded-full font-display italic text-xs sm:text-sm flex items-center justify-center cursor-pointer shadow-sm mx-auto active:scale-95 transition-transform hover:opacity-90 bg-primary text-primary-foreground shrink-0">
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
                    menuNavigate(() => {
                      setAppMode("trainer");
                      setCurrentView("clients");
                    })
                  }
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-colors ${appMode === "trainer" ? "bg-white dark:bg-bg-dark shadow-sm text-sky-600 dark:text-sky-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                >
                  Trainer
                </button>
                <button
                  onClick={() =>
                    menuNavigate(() => {
                      setAppMode("admin");
                      setCurrentView("admin-dashboard" as any);
                    })
                  }
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-colors ${appMode === "admin" && currentView !== "admins-dashboard" ? "bg-white dark:bg-bg-dark shadow-sm text-orange-600 dark:text-orange-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                >
                  {/* Label only: the mode is still "admin" inside (Renewals round, Sep 2026). */}
                  Operations
                </button>
                {isAdmin && (
                  <button
                    onClick={() =>
                      menuNavigate(() => {
                        setAppMode("admin");
                        setCurrentView("admins-dashboard" as any);
                      })
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
            onClick={() => menuNavigate(handleTrainerLock)}
            className="rounded-xl flex items-center gap-3 p-3 font-bold uppercase text-[11px] tracking-widest text-orange-500 hover:bg-orange-500/10 dark:bg-orange-600/10 focus:bg-orange-500/10 focus:text-orange-500 cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            Switch Trainer
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => menuNavigate(() => setIsChangingStudio(true))}
            className="rounded-xl flex items-center gap-3 p-3 font-bold uppercase text-[11px] tracking-widest cursor-pointer hover:bg-slate-700 hover:text-slate-900 dark:text-white dark:hover:text-slate-50 focus:bg-slate-700 focus:text-slate-900"
          >
            <Building2 className="w-4 h-4 text-amber-500" />
            Switch Studio
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => menuNavigate(() => void handleLogout())}
            className="rounded-xl flex items-center gap-3 p-3 font-bold uppercase text-[11px] tracking-widest text-rose-500 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-500 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Log Out Facility
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
          {/* Above the header, and outside the `workouts` condition below, so
              it is on the Active Session too — see DemoBanner.tsx. */}
          {isDemoStudioId(activeStudioId) && (
            <DemoBanner onLeave={() => setIsChangingStudio(true)} />
          )}

          {/* Header */}
          {currentView !== "workouts" && (
            <AppHeader
              variant={theme === "light" ? "light" : "dark"}
              studioName={activeStudioName || undefined}
              onStudioClick={() => setIsChangingStudio(true)}
              rightControls={headerRightControls}
              trainerDropdown={headerTrainerDropdown}
              searchSlot={headerSearchSlot}
            />
          )}

          {/* Main Content */}
          <main
            className={`w-full max-w-full mx-auto relative ${currentView === "workouts" ? "flex-1 min-h-0 p-2 overflow-y-auto overscroll-contain bg-slate-50 dark:bg-slate-950 flex flex-col" : currentView === "clients" || currentView === "client-directory" || isLearningView || currentView === "studio-tasks" ? "flex-1 min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950 p-0 flex flex-col" : "flex-1 min-h-0 p-6 overflow-y-auto overscroll-contain bg-slate-50 dark:bg-slate-950"}`}
          >
            <Suspense fallback={<ViewLoader />}>
              <AnimatePresence mode="wait">
                {currentView === "consultation-wizard" && selectedClientId && (
                  <ConsultationWizard
                    client={
                      clients.find((c) => c.id === selectedClientId) ||
                      ({} as Client)
                    }
                    machines={machines}
                    authTrainer={authTrainer}
                    trainers={trainers}
                    onComplete={(id) => {
                      setSelectedClientId(id);
                      setCurrentView("profile");
                    }}
                    onCancel={() => setCurrentView("profile")}
                  />
                )}
                {currentView === "client-directory" && (
                  <ClientDirectoryView
                    clients={clients}
                    onSelectClient={(id) => {
                      setSelectedClientId(id);
                      setCurrentView("profile");
                    }}
                    onStartOpenSession={startUnassignedSession}
                    authTrainer={authTrainer}
                    kaizenClientIds={kaizenClientIds}
                    liveAuthTrainer={liveAuthTrainer}
                    onUpdateSessions={updateClientSessions}
                    onStartNewClientOnboarding={setNewClientOnboardingName}
                    studioRosterReady={rosterStatus === "ready"}
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
                    authTrainer={authTrainer}
                    onSelectClient={(id) => {
                      setSelectedClientId(id);
                      setView("profile");
                    }}
                    setView={setView}
                    schedules={schedules}
                    sessions={sessions}
                    editingClient={editingClient}
                    setEditingClient={setEditingClient}
                    formData={clientFormData}
                    setFormData={setClientFormData}
                    onSubmit={handleClientSubmit}
                    startEdit={startEditClient}
                    updateSessions={updateClientSessions}
                    onSelectTrainer={(id) => {
                      setSelectedProfileTrainerId(id);
                      setView("trainer-profile");
                    }}
                    searchTerm={hubSearchTerm}
                    onSearchTermChange={setHubSearchTerm}
                    rosterLoading={rosterStatus === "loading"}
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
                  />
                )}
                {currentView === "studio-tasks" &&
                  (() => {
                    // A client task points at the screen where the work is
                    // actually done, rather than being a tick that claims it
                    // happened. 'inbody' has no screen of its own yet, so it
                    // lands on the profile — the closest honest destination.
                    const openClientTask = (
                      clientId: string,
                      action?: ClientTaskAction,
                    ) => {
                      setSelectedClientId(clientId);
                      setCurrentView(
                        action === "progress-report"
                          ? "progress-report"
                          : action === "assessment"
                            ? "consultation-wizard"
                            : "profile",
                      );
                    };
                    return (
                      <MyStudioView
                        authTrainer={authTrainer}
                        clients={clients}
                        trainers={trainers}
                        schedules={schedules}
                        sessions={sessions}
                        machines={machines}
                        onOpenClientTask={openClientTask}
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
                    showClientPicker={showClientPicker}
                    setShowClientPicker={setShowClientPicker}
                    onStartNewClientOnboarding={setNewClientOnboardingName}
                    setClientFormData={setClientFormData}
                    onOpenInfo={(m) => {
                      setInfoMachineId(m.id!);
                      setIsEditingMachineInfo(false);
                    }}
                    authTrainer={authTrainer}
                    isSyncing={isSyncing}
                    setIsSyncing={setIsSyncing}
                    isIntroSession={isIntroSession}
                    rightControls={headerRightControls}
                    trainerDropdown={headerTrainerDropdown}
                    onStudioClick={() => setIsChangingStudio(true)}
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
                    onDelete={handleDeleteClient}
                    onSelectReport={(reportId) => {
                      setSelectedReportId(reportId);
                      setView("progress-report");
                    }}
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
                  authTrainer && (
                    <ClientProgressReportView
                      client={
                        clients.find((c) => c.id === selectedClientId) ||
                        ({} as Client)
                      }
                      trainer={authTrainer}
                      machines={machines}
                      existingReportId={selectedReportId || undefined}
                      onBack={() => {
                        setSelectedReportId(null);
                        setCurrentView("profile");
                      }}
                    />
                  )}
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
                    newClientsCount={newClientsThisMonth.length}
                    onShowNewClients={() => setShowNewClientsDialog(true)}
                    onUpdateStudio={updateStudio}
                    onUpdateClient={updateClient}
                    activeStudioId={activeStudioId}
                    onRestoreMachines={handleRestoreMachines}
                    onReorderTrainers={() => setIsReorderingTrainers(true)}
                    onNavigateProfile={(clientId) => {
                      setSelectedClientId(clientId);
                      setCurrentView("profile");
                    }}
                    onOpenStudioTasks={() => setCurrentView("studio-tasks")}
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
                    onRestoreMachines={handleRestoreMachines}
                    onReorderTrainers={() => setIsReorderingTrainers(true)}
                  />
                )}
                {currentView === "trainer-hub" && (
                  <TrainerSettingsView
                    authTrainer={authTrainer}
                    studios={studios}
                    trainers={trainers}
                    machines={machines}
                    activeStudioId={activeStudioId}
                    onLogout={handleLogout}
                    setView={(view) => setCurrentView(view as any)}
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
                      onStartNewClientOnboarding={setNewClientOnboardingName}
                      setView={setView}
                      clients={clients}
                      scheduleWindow={{
                        ensureRange,
                        refresh: refreshSchedules,
                        lastFetchedAt: schedulesFetchedAt,
                        isFetching: isFetchingSchedules,
                      }}
                    />
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
          </main>

          {/* Navigation Bar */}
          {appMode === "trainer" ? (
            <nav className="flex-none bg-white dark:bg-bg-dark border-t border-[#68717A]/20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] px-2 sm:px-6 min-h-14 sm:min-h-20 pb-[env(safe-area-inset-bottom,0px)] flex items-center justify-around z-30">
              <NavButton
                active={currentView === "clients"}
                onClick={() => setCurrentView("clients")}
                icon={<Users className="w-5 h-5 sm:w-6 sm:h-6" />}
                label="Hub"
              />
              <NavButton
                active={[
                  "profile",
                  "progress-report",
                  "client-directory",
                ].includes(currentView)}
                onClick={() => {
                  if (selectedClientId) {
                    setCurrentView("profile");
                  } else {
                    setCurrentView("client-directory");
                  }
                }}
                icon={<ClipboardList className="w-5 h-5 sm:w-6 sm:h-6" />}
                label="Client"
              />
              <NavButton
                active={currentView === "workouts"}
                onClick={() => {
                  void resumeLiveSession();
                }}
                icon={<PlayCircle className="w-5 h-5 sm:w-6 sm:h-6" />}
                label={liveSessionTabLabel(liveSession)}
                activeColor={liveSession ? "text-orange-500" : undefined}
                activeBg={
                  liveSession
                    ? "bg-orange-500/10 dark:bg-orange-600/10"
                    : undefined
                }
                activeIndicator={
                  liveSession
                    ? "bg-orange-500 dark:bg-orange-600"
                    : undefined
                }
                attention={!!liveSession && currentView !== "workouts"}
              />
              {/*
                LEARNING — the Catalog and the Academy in one slot (Sep 10
                2026). Six buttons again. NavButton takes `flex-1 min-w-0` so
                they divide the bar evenly and the labels truncate rather than
                overflowing on a narrow phone; do not shorten the labels, they
                are how people find the tab. Which of the two it opens is
                whichever was open last — see lastLearningView.
              */}
              <NavButton
                active={isLearningView}
                onClick={() => setCurrentView(lastLearningView)}
                icon={<GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />}
                label="Learning"
              />
              <NavButton
                active={currentView === "studio-tasks"}
                onClick={() => setCurrentView("studio-tasks")}
                icon={<NotebookPen className="w-5 h-5 sm:w-6 sm:h-6" />}
                label="My Studio"
              />
              <NavButton
                active={currentView === "calendar"}
                onClick={() => setCurrentView("calendar")}
                icon={<Calendar className="w-5 h-5 sm:w-6 sm:h-6" />}
                label="Calendar"
              />
            </nav>
          ) : (
            <nav className="flex-none bg-white dark:bg-bg-dark border-t border-orange-500/20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] px-2 sm:px-6 min-h-14 sm:min-h-20 pb-[env(safe-area-inset-bottom,0px)] flex items-center justify-around z-30">
              <NavButton
                active={currentView === "admin-dashboard"}
                onClick={() => setCurrentView("admin-dashboard" as any)}
                icon={<LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6" />}
                label="Operations"
                activeColor="text-orange-500"
                activeBg="bg-orange-500/10 dark:bg-orange-600/10"
                activeIndicator="bg-orange-500 dark:bg-orange-600"
              />
              {/*
                The Admins dashboard (Operations overhaul, Sep 2026): where the
                app is managed — the standard template, the master catalog,
                every location, the machinery. Administrators and the founder.
              */}
              {isAdmin && (
                <NavButton
                  active={currentView === "admins-dashboard"}
                  onClick={() => setCurrentView("admins-dashboard" as any)}
                  icon={<ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />}
                  label="Admin"
                  activeColor="text-orange-500"
                  activeBg="bg-orange-500/10 dark:bg-orange-600/10"
                  activeIndicator="bg-orange-500 dark:bg-orange-600"
                />
              )}
              {/*
                The Franchise screen that sat here (owners and admins) folded
                into Operations on Sep 19 2026: its tiles and locations are the
                Overview under "All my studios", its team editor was a second
                Staff & Roles, its composer a second Announcements. One
                dashboard, one scope.
              */}
              {/*
                "Customize Studio" used to be a third NavButton here. It went to
                `trainer-hub` - the same place the gear in the header goes, from
                every screen in the app - under a different name and a different
                icon. Two routes to one screen is a wrong guess waiting to
                happen; two routes with different NAMES teaches people the app
                has two settings screens and they picked the wrong one. The gear
                stays, because it is reachable from everywhere. Section 16.
              */}
            </nav>
          )}
        </div>

        {/* Machine Information Deep Dive Dialog */}
        <Dialog
          open={!!infoMachineId}
          onOpenChange={(open) => !open && setInfoMachineId(null)}
        >
          <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[90dvh] overflow-y-auto rounded-[32px] p-0 border-none shadow-2xl dark:shadow-none">
            {infoMachine && (
              <>
                <DialogHeader className="p-8 bg-white dark:bg-bg-dark border-b relative">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center font-black text-xl text-primary shadow-sm dark:shadow-none">
                      {infoMachine.order}
                    </div>
                    <div>
                      <DialogTitle className="text-3xl font-black uppercase italic tracking-tighter">
                        {infoMachine.fullName || infoMachine.name}
                      </DialogTitle>
                      <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        Deep Dive & Operational Guidelines
                      </DialogDescription>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-6 right-6 h-10 w-10 rounded-xl"
                    onClick={() =>
                      setIsEditingMachineInfo(!isEditingMachineInfo)
                    }
                  >
                    <Edit3 className="w-5 h-5" />
                  </Button>
                </DialogHeader>

                <div className="p-8 space-y-8">
                  {isEditingMachineInfo ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                            Target Muscles
                          </Label>
                          <Input
                            value={machineInfoDraft.targetMuscles || ""}
                            onChange={(e) =>
                              setMachineInfoDraft({
                                ...machineInfoDraft,
                                targetMuscles: e.target.value,
                              })
                            }
                            placeholder="e.g. Chest, Triceps"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                            Form Video URL
                          </Label>
                          <Input
                            value={machineInfoDraft.formVideoUrl || ""}
                            onChange={(e) =>
                              setMachineInfoDraft({
                                ...machineInfoDraft,
                                formVideoUrl: e.target.value,
                              })
                            }
                            placeholder="Youtube/Vimeo Link"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                          Standard Machine Settings (Tips)
                        </Label>
                        <Textarea
                          value={machineInfoDraft.settings || ""}
                          onChange={(e) =>
                            setMachineInfoDraft({
                              ...machineInfoDraft,
                              settings: e.target.value,
                            })
                          }
                          placeholder="Recommended starting points for different heights/sizes..."
                          className="min-h-20"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                          Cueing Tips (Trainer to Trainer)
                        </Label>
                        <Textarea
                          value={machineInfoDraft.cueingTips || ""}
                          onChange={(e) =>
                            setMachineInfoDraft({
                              ...machineInfoDraft,
                              cueingTips: e.target.value,
                            })
                          }
                          placeholder="Pointers for better client form..."
                          className="min-h-25"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                          Deep Dive Notes
                        </Label>
                        <Textarea
                          value={machineInfoDraft.deepDiveNotes || ""}
                          onChange={(e) =>
                            setMachineInfoDraft({
                              ...machineInfoDraft,
                              deepDiveNotes: e.target.value,
                            })
                          }
                          placeholder="History, benefits, or complex cues..."
                          className="min-h-37.5"
                        />
                      </div>

                      <div className="flex gap-3">
                        <Button
                          className="flex-1 h-12 rounded-xl font-black uppercase italic tracking-widest"
                          onClick={async () => {
                            try {
                              await updateDoc(
                                doc(db, "machines", infoMachine.id!),
                                {
                                  ...machineInfoDraft,
                                  updatedAt: serverTimestamp(),
                                },
                              );
                              setIsEditingMachineInfo(false);
                            } catch (err) {
                              handleFirestoreError(
                                err,
                                OperationType.UPDATE,
                                "machines",
                              );
                            }
                          }}
                        >
                          Save Information
                        </Button>
                        <Button
                          variant="outline"
                          className="h-12 px-6 rounded-xl"
                          onClick={() => setIsEditingMachineInfo(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-8">
                      {/* Visual & Core Info Header */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="aspect-video bg-muted rounded-2xl overflow-hidden relative flex items-center justify-center border border-border group">
                          {infoMachine.imageUrl ? (
                            <img
                              src={infoMachine.imageUrl}
                              className="w-full h-full object-cover brightness-100 transition-all duration-500"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=800&q=80";
                              }}
                            />
                          ) : (
                            // Unsplash default photo mechanism for robust mockups
                            <img
                              src={getMachineImageUrl(infoMachine.id)}
                              className="w-full h-full object-cover brightness-100 transition-all duration-500"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=800&q=80";
                              }}
                            />
                          )}
                          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end z-10">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500 mb-1">
                                Targeted Muscles
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {/*
                                  `targetMuscles` is a string on some machine
                                  records and an array on others, and calling
                                  .split on the array shape threw a TypeError
                                  that took the whole dialog down. Normalised
                                  here rather than at the source because both
                                  shapes are already in Firestore.
                                */}
                                {(Array.isArray(infoMachine.targetMuscles)
                                  ? infoMachine.targetMuscles
                                  : (infoMachine.targetMuscles ?? "").split(","))
                                  .filter((m) => m.trim())
                                  .map((m) => (
                                    <Badge
                                      key={m}
                                      className="bg-primary/90 text-primary-foreground border-none font-medium uppercase text-[11px] px-2 py-0.5"
                                    >
                                      {m.trim()}
                                    </Badge>
                                  )) || (
                                  <Badge className="bg-primary/90 text-primary-foreground border-none font-medium uppercase text-[11px] px-2 py-0.5">
                                    Primary Target Area
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4 flex flex-col justify-center">
                          <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10">
                            <h3 className="text-sm font-bold uppercase tracking-tight text-primary mb-2">
                              Resource Actions
                            </h3>
                            <div className="space-y-3">
                              <Button className="w-full justify-start h-12 rounded-xl bg-background border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all">
                                <Play className="w-4 h-4 mr-3" />
                                <span className="font-bold text-[11px] uppercase tracking-widest">
                                  View Form Guide Video
                                </span>
                              </Button>
                              <Button
                                variant="outline"
                                className="w-full justify-start h-12 rounded-xl font-bold text-[11px] uppercase tracking-widest text-secondary hover:bg-secondary hover:text-secondary-foreground transition-all"
                              >
                                <MessageSquare className="w-4 h-4 mr-3" />
                                Send Resource to Client
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Machine Insights Section (Orange Application) */}
                      <div className="bg-action/5 border border-action/20 rounded-2xl p-6 md:p-8">
                        <h3 className="text-xl font-bold uppercase tracking-tight text-action mb-6 flex items-center gap-2">
                          <TrendingUp className="w-6 h-6" />
                          Machine Insights & Demographics
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Demographic 1 */}
                          <div className="space-y-4">
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="text-[12px] font-bold text-secondary">
                                  Age 20-30
                                </p>
                                <p className="text-[11px] font-medium text-secondary/60 uppercase tracking-widest">
                                  Female | Beginner
                                </p>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div>
                                <div className="flex justify-between text-[11px] font-bold text-secondary mb-1">
                                  <span>Average Weight (45 lbs)</span>
                                  <span className="text-action">SD ±5</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-action w-[45%]" />
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between text-[11px] font-bold text-secondary mb-1">
                                  <span>Average Reps (12)</span>
                                  <span className="text-action">SD ±2</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-action/60 w-[60%]" />
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* Demographic 2 */}
                          <div className="space-y-4">
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="text-[12px] font-bold text-secondary">
                                  Age 30-40
                                </p>
                                <p className="text-[11px] font-medium text-secondary/60 uppercase tracking-widest">
                                  Male | Advanced
                                </p>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div>
                                <div className="flex justify-between text-[11px] font-bold text-secondary mb-1">
                                  <span>Average Weight (120 lbs)</span>
                                  <span className="text-primary">SD ±15</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary w-[85%]" />
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between text-[11px] font-bold text-secondary mb-1">
                                  <span>Average Reps (8)</span>
                                  <span className="text-primary">SD ±1.5</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary/60 w-[40%]" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Trainer Cues and Tips */}
                        <div className="space-y-4">
                          <h4 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-widest text-primary mb-4">
                            <Users className="w-4 h-4" />
                            Trainer Cues & Tips
                          </h4>

                          <div className="space-y-3">
                            {/* Simulated Collapsible Cards */}
                            <div className="border border-border rounded-xl p-4 hover:bg-white dark:bg-bg-dark transition-colors cursor-pointer group">
                              <div className="flex justify-between items-center">
                                <p className="text-[12px] font-bold text-secondary">
                                  Marina's Cue
                                </p>
                                <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                                "Keep your chest proud and drive through the
                                mid-foot rather than the toes."
                              </p>
                            </div>
                            <div className="border border-border rounded-xl p-4 hover:bg-white dark:bg-bg-dark transition-colors cursor-pointer group">
                              <div className="flex justify-between items-center">
                                <p className="text-[12px] font-bold text-secondary">
                                  Christian's Cue
                                </p>
                                <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                                "Imagine retracting your shoulder blades
                                completely before pulling the weight down."
                              </p>
                            </div>
                            <div className="border border-border rounded-xl p-4 hover:bg-white dark:bg-bg-dark transition-colors cursor-pointer group">
                              <div className="flex justify-between items-center">
                                <p className="text-[12px] font-bold text-secondary">
                                  Austin's Cue
                                </p>
                                <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                                "Focus on the eccentric phase; count to three as
                                you release the tension."
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Common Mistakes & Setup */}
                        <div className="space-y-4">
                          <h4 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-widest text-secondary mb-4">
                            <AlertCircle className="w-4 h-4" />
                            Critical Setup Deviations
                          </h4>
                          <div className="bg-white dark:bg-bg-dark rounded-2xl p-6 border border-border">
                            <ul className="space-y-4">
                              <li className="space-y-2">
                                <div className="flex justify-between">
                                  <p className="text-[11px] font-bold text-secondary">
                                    Seat Too High
                                  </p>
                                  <span className="text-[11px] font-bold text-action">
                                    High Risk
                                  </span>
                                </div>
                                <div className="h-1.5 bg-background rounded-full overflow-hidden">
                                  <div className="h-full bg-action w-[75%]" />
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  Places extreme stress on the lower back during
                                  extension.
                                </p>
                              </li>
                              <li className="space-y-2">
                                <div className="flex justify-between">
                                  <p className="text-[11px] font-bold text-secondary">
                                    Incomplete Range of Motion
                                  </p>
                                  <span className="text-[11px] font-bold text-amber-500">
                                    Medium Risk
                                  </span>
                                </div>
                                <div className="h-1.5 bg-background rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-500 w-[45%]" />
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  Failing to fully lock out or fully stretch at
                                  the bottom.
                                </p>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Deep Dive Notes */}
                      <div className="space-y-4">
                        <h4 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-widest text-secondary mb-2">
                          <StickyNote className="w-4 h-4" />
                          Deep Dive Notes
                        </h4>
                        <div className="p-4 bg-background border border-border rounded-xl min-h-25">
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            {infoMachine.deepDiveNotes ||
                              "Enter detailed clinical observations and biomechanical notes here..."}
                          </p>
                        </div>
                      </div>

                      {/* Log Session Action */}
                      <div className="pt-4 border-t border-border flex justify-end">
                        <Button className="bg-action hover:bg-action/90 text-action-foreground font-bold uppercase tracking-widest text-[11px] h-12 px-8 rounded-xl shadow-lg shadow-action/20">
                          <Plus className="w-4 h-4 mr-2" />
                          Log Session / Add Data Points
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* New Clients Dialog */}
        <Dialog
          open={showNewClientsDialog}
          onOpenChange={setShowNewClientsDialog}
        >
          <DialogContent className="max-w-2xl sm:max-w-2xl rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none">
            <DialogHeader className="p-8 bg-primary/5 border-b border-primary/10">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-2xl">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">
                    New Clients Dashboard
                  </DialogTitle>
                  <DialogDescription className="text-[11px] font-black uppercase tracking-widest text-primary/60">
                    Registered in{" "}
                    {new Date().toLocaleDateString([], {
                      month: "long",
                      year: "numeric",
                    })}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="p-6 max-h-[60dvh] overflow-y-auto">
              {newClientsThisMonth.length > 0 ? (
                <div className="grid gap-3">
                  {newClientsThisMonth.map((client) => (
                    <div
                      key={client.id}
                      onClick={() => {
                        setSelectedClientId(client.id!);
                        setCurrentView("profile");
                        setShowNewClientsDialog(false);
                      }}
                      className="flex items-center justify-between p-4 bg-white dark:bg-bg-dark rounded-2xl border border-transparent hover:border-primary/20 hover:bg-white transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-background flex items-center justify-center font-black text-primary border shadow-sm dark:shadow-none group-hover:scale-110 transition-transform">
                          {(client.firstName || "?")[0] || "?"}
                          {(client.lastName || "")[0] || ""}
                        </div>
                        <div>
                          <p className="font-black uppercase tracking-tight text-sm">
                            {client.firstName} {client.lastName}
                          </p>
                          <p className="text-[11px] font-bold text-muted-foreground uppercase">
                            {client.occupation || "No occupation listed"}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-xs font-black uppercase text-muted-foreground">
                    No new clients registered this month.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="p-6 bg-white dark:bg-bg-dark border-t">
              <Button
                onClick={() => setShowNewClientsDialog(false)}
                className="rounded-xl font-bold uppercase tracking-widest w-full h-12"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

      </FeedbackProvider>
    </ErrorBoundary>
  );
}

