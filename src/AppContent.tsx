/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { migrateClientMachineMetrics } from "./lib/migration-utils";
import {
  Users,
  Plus,
  AlertCircle,
  AlertTriangle,
  LogOut,
  UserCircle,
  ShieldCheck,
  Dumbbell,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  StickyNote,
  Save,
  Settings,
  Trash2,
  GripVertical,
  Timer,
  History,
  Layout,
  Search,
  LayoutDashboard,
  Trophy,
  Activity,
  Play,
  Star,
  Clock,
  Calendar,
  Lock,
  Edit3,
  TrendingUp,
  PlusCircle,
  PlayCircle,
  Pause,
  LayoutList,
  ChevronDown,
  ChevronUp,
  Zap,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  RefreshCcw,
  RotateCcw,
  Mic,
  Check,
  Loader2,
  X,
  Settings2,
  Database,
  Network,
  Building2,
  Gift,
  ShieldAlert,
  CreditCard,
} from "lucide-react";
import axios from "axios";
import { motion, AnimatePresence } from "motion/react";
import { Stopwatch } from "./components/Stopwatch";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  getDocFromServer,
  where,
  setDoc,
  getDocs,
  getDoc,
  limit,
  Timestamp,
  writeBatch,
  increment,
  QueryConstraint,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signOut,
  User as FirebaseUser,
  signInWithPopup,
} from "firebase/auth";

import { db, auth } from "./firebase";
import firebaseConfig from "../firebase-applet-config.json";
import {
  Trainer,
  TrainerAvailability,
  Client,
  View,
  Machine,
  WorkoutSession,
  ExerciseLog,
  Routine,
  ClientMachineSetting,
  SessionType,
  SessionNote,
  TrainerFocus,
  FocusRecord,
  Studio,
  HubAnnouncement,
  FranchiseNetwork,
  PreSessionCheckIn,
} from "./types";
import { OperationType, handleFirestoreError } from "./lib/firestore-errors";
// Removing duplicate cn import
import { hashPin } from "./lib/auth-utils";
import {
  parseSessionDate,
  calculateExerciseVolume,
  safeToDate,
  getMillis,
  isSessionValid,
  orderMachineSettings,
} from "./lib/utils";
import {
  normalizeName,
  cleanAlphanumeric,
  isFuzzyNameMatch,
  completeWorkoutSession,
} from "./lib/sync-utils";
import { getLatestTargetWeight } from "./lib/historical-utils";
import { ErrorBoundary } from "./components/ErrorBoundary";
import AccessRequestView from "./components/AccessRequestView";
import { generateMockClientWithHistory } from "./lib/mockDataGenerator";
import { TrainerControlHubView } from "./components/TrainerControlHubView";
import { InsightsDashboardView } from "./components/InsightsDashboardView";
import { ClientProfileView } from "./components/ClientProfileView";
import { CalendarView } from "./components/CalendarView";
import { LegacyChartImporter } from "./components/LegacyChartImporter";
import { RetentionDashboardView } from "./components/RetentionDashboardView";
import { MachineLeaderboardDashboard } from "./components/MachineLeaderboardDashboard";
import { ProfilesView } from "./components/ProfilesView";
import { ClientDirectoryView } from "./components/ClientDirectoryView";
import { TrainerProfileView } from "./components/TrainerProfileView";
import { StudioSelectionView } from "./components/StudioSelectionView";
import { PostSessionBriefingView } from "./components/PostSessionBriefingView";
import { BriefingScreen } from "./components/BriefingScreen";
import { VictoryHUDScreen } from "./components/VictoryHUDScreen";
import { IntegrationsHubView } from "./components/IntegrationsHubView";
import { AppHeader } from "./components/AppHeader";
import { useTheme } from "./components/ThemeProvider";
import { ConsultationSetupWizard } from "./components/ConsultationSetupWizard";
import { ConsultationWizard } from "./components/ConsultationWizard";
import { AdminDashboardView } from "./components/AdminDashboardView";
import { FranchiseDashboardView } from "./components/FranchiseDashboardView";
import { CreateClientModal } from "./components/CreateClientModal";
import { ClientProgressReportView } from "./components/ClientProgressReportView";
import { ClientClinicalReviewPreloader } from "./components/ClientClinicalReviewPreloader";
import { SessionRoutineManagerModal } from "./components/SessionRoutineManagerModal";
import { MachineAnatomyCatalogView } from "./components/MachineAnatomyCatalogView";
import { MaxStrengthLogo } from "./components/MaxStrengthLogo";
import { ActiveSessionTimer } from "./components/ActiveSessionTimer";
import { ThemeToggle } from "./components/ThemeToggle";
import { HubAnnouncementsWidget } from "./components/HubAnnouncementsWidget";
import {
  hasPermission,
  isAdmin as checkIsAdmin,
  isFounder,
  isOwner,
  isStudioLeader,
  isLifeTransformer,
} from "./lib/permissions";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

const DEFAULT_MACHINES: Machine[] = [
  {
    id: "m-neck",
    anatomicalRegion: "Neck",
    name: "CX (4 WAY NECK)",
    targetMuscles: "Cervical Paraspinals, Suboccipitals",
    kinematicClassification: "Simple / Rotary",
    order: 1,
    settingOptions: ["Gap", "Back Pad", "Seat"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: true,
  },
  {
    id: "m-overhead-press",
    anatomicalRegion: "Shoulder",
    name: "OVERHEAD PRESS",
    targetMuscles: "Anterior/Medial Deltoids, Triceps",
    kinematicClassification: "Compound Push",
    order: 2,
    settingOptions: ["Gap", "Seat"],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
  },
  {
    id: "m-lateral-raise",
    anatomicalRegion: "Shoulder",
    name: "LATERAL RAISE",
    targetMuscles: "Medial Deltoids",
    kinematicClassification: "Simple Push",
    order: 3,
    settingOptions: ["Gap", "Seat", "Handles"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
  },
  {
    id: "m-pulldown",
    anatomicalRegion: "Back",
    name: "PULLDOWN",
    targetMuscles: "Latissimus Dorsi, Trapezius, Biceps",
    kinematicClassification: "Compound Pull",
    order: 4,
    settingOptions: ["Gap", "Back Pad", "Seat", "Handles"],
    setupGap: "Gap 2",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: true,
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-pullover",
    anatomicalRegion: "Back",
    name: "SEATED PULLOVER",
    targetMuscles: "Latissimus Dorsi",
    kinematicClassification: "Simple Pull",
    order: 5,
    settingOptions: ["Gap", "Seat", "Handles"],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
    requiresHandoff: true,
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-compound-row",
    anatomicalRegion: "Back",
    name: "COMPOUND ROW",
    targetMuscles: "Latissimus Dorsi, Rhomboids, Trapezius",
    kinematicClassification: "Compound Pull",
    order: 6,
    settingOptions: ["Gap", "Chest Pad", "Handles"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: true,
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-simple-row",
    anatomicalRegion: "Back",
    name: "SIMPLE ROW",
    targetMuscles: "Posterior Deltoids, Rhomboids",
    kinematicClassification: "Simple Pull",
    order: 7,
    settingOptions: ["Gap", "Chest Pad", "Seat Pad"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-chest-press",
    anatomicalRegion: "Chest",
    name: "CHEST PRESS",
    targetMuscles: "Pectoralis Major, Anterior Deltoids",
    kinematicClassification: "Compound Push",
    order: 8,
    settingOptions: ["Gap", "Back Pad", "Seat"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
  },
  {
    id: "m-chest-fly",
    anatomicalRegion: "Chest",
    name: "CHEST/PEC FLY",
    targetMuscles: "Pectoralis Major",
    kinematicClassification: "Simple Push",
    order: 9,
    settingOptions: ["Gap", "Back Pad", "Seat"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
  },
  {
    id: "m-bicep",
    anatomicalRegion: "Arm / Upper Extremity",
    name: "BICEP",
    targetMuscles: "Biceps Brachii, Brachioradialis",
    kinematicClassification: "Simple Pull",
    order: 10,
    settingOptions: ["Gap", "Seat"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-tricep-ext",
    anatomicalRegion: "Arm / Upper Extremity",
    name: "TRICEP EXTENSION",
    targetMuscles: "Triceps Brachii",
    kinematicClassification: "Simple Push",
    order: 11,
    settingOptions: ["Gap", "Seat"],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
  },
  {
    id: "m-dip",
    anatomicalRegion: "Arm / Upper Extremity",
    name: "SEATED DIP",
    targetMuscles: "Triceps Brachii, Lower Pectoralis",
    kinematicClassification: "Compound Push",
    order: 12,
    settingOptions: [
      "Gap",
      "Back Pad Height",
      "Back Pad Angle",
      "Seat",
      "Handles",
    ],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
  },
  {
    id: "m-abs",
    anatomicalRegion: "Core",
    name: "SEATED ABDOMINALS",
    targetMuscles: "Rectus Abdominis",
    kinematicClassification: "Simple Push",
    order: 13,
    settingOptions: ["Gap", "Seat"],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
    requiresHandoff: true,
  },
  {
    id: "m-lumbar",
    anatomicalRegion: "Core",
    name: "LUMBAR",
    targetMuscles: "Lumbar Paraspinals",
    kinematicClassification: "Simple Pull",
    order: 14,
    settingOptions: ["Gap", "Seat"],
    setupGap: "Gap 4-6",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    sequencingContraindications: [
      "Do not pair immediately before Leg Press or Leg Curl (lumbar pump exacerbation).",
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
    primaryMuscles: ["Erector Spinae"],
    biomechanicalNotes:
      "Ensure rotation point aligns perfectly with the iliac crest. Focuses intensely on spinal extension.",
    contraindicatedFor: [
      "Spinal Stenosis",
      "Herniated Disc (Acute)",
      "Spondylolisthesis",
    ],
    modifications:
      "Limit strictly to pain-free ROM. Decrease weight if form breaks or anterior pelvic tilt is lost.",
  },
  {
    id: "m-torso-rotation",
    anatomicalRegion: "Core",
    name: "TORSO ROTATION",
    targetMuscles: "Internal and External Obliques",
    kinematicClassification: "Simple Rotary",
    order: 15,
    settingOptions: ["Gap", "Arms", "Seat"],
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
  },
  {
    id: "m-hip-abd",
    anatomicalRegion: "Hip",
    name: "HIP ABDUCTION",
    targetMuscles: "Gluteus Medius, Gluteus Minimus",
    kinematicClassification: "Simple Push",
    order: 16,
    settingOptions: ["Gap", "Back Pad", "Thigh Pads"],
    setupGap: "Custom Gap",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
  },
  {
    id: "m-hip-add",
    anatomicalRegion: "Hip",
    name: "HIP ADDUCTION",
    targetMuscles: "Adductor Longus, Brevis, Magnus",
    kinematicClassification: "Simple Pull",
    order: 17,
    settingOptions: ["Gap", "Back Pad"],
    setupGap: "Custom Gap",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
  {
    id: "m-leg-press",
    anatomicalRegion: "Thigh / Quad",
    name: "LEG PRESS",
    targetMuscles: "Quadriceps, Gluteus Maximus, Hamstrings",
    kinematicClassification: "Compound Push",
    order: 18,
    settingOptions: ["Gap", "Seat Angle", "Shoulder Pads", "Seat Distance"],
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    primaryMuscles: ["Quadriceps", "Gluteus Maximus"],
    biomechanicalNotes:
      "Knee angle should not exceed 90 degrees at bottom turnaround to protect patellar tendon. High shear force potential on L4/L5 if posterior pelvic tilt occurs.",
    contraindicatedFor: [
      "Lumbar Issues",
      "Knee Replacement",
      "Severe Patellar Tendonitis",
    ],
    modifications:
      "For Lumbar issues: Lock seat angle to P2 or P1, limit ROM to prevent pelvic tuck. For Knee issues: Reduce gap, set end-stop earlier to prevent deep flexion.",
  },
  {
    id: "m-ext",
    anatomicalRegion: "Thigh / Quad",
    name: "LEG EXTENSION",
    targetMuscles: "Quadriceps Femoris",
    kinematicClassification: "Simple Push",
    order: 19,
    settingOptions: ["Gap", "Back Pad"],
    setupGap: "Gap 2",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
  },
  {
    id: "m-leg-curl",
    anatomicalRegion: "Hamstring / Glute",
    name: "LEG CURL",
    targetMuscles: "Hamstrings, Gastrocnemius",
    kinematicClassification: "Simple Pull",
    order: 20,
    settingOptions: ["Gap", "Back Pad", "Ankle Pad"],
    setupGap: "Gap 2",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    sequencingContraindications: [
      "Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation.",
    ],
  },
];

const getMachineImageUrl = (machineId?: string): string => {
  const map: Record<string, string> = {
    "m-neck": "1534438327276-14e5300c3a48", // Using back/shoulder for neck
    "m-overhead-press": "1581009146145-b5ef050c2e1e", // pressing
    "m-lateral-raise": "1581009146145-b5ef050c2e1e", // shoulders
    "m-pulldown": "1526506114805-4f329971bc30", // back/pull-up
    "m-pullover": "1526506114805-4f329971bc30", // back
    "m-compound-row": "1534438327276-14e5300c3a48", // rowing
    "m-simple-row": "1534438327276-14e5300c3a48", // rowing
    "m-chest-press": "1574680096145-d05b474e2155", // chest press
    "m-chest-fly": "1574680096145-d05b474e2155", // chest
    "m-bicep": "1581009137042-c56a8411b229", // biceps
    "m-tricep-ext": "1581009137042-c56a8411b229", // arms
    "m-dip": "1574680096145-d05b474e2155", // chest/arms
    "m-abs": "1517836357463-d25dfeac3438", // abs
    "m-lumbar": "1584466977773-e35492d52dc7", // core/stretch
    "m-torso-rotation": "1517836357463-d25dfeac3438", // abs
    "m-hip-abd": "1599058917212-d750089bc07e", // lower body
    "m-hip-add": "1599058917212-d750089bc07e", // lower body
    "m-leg-press": "1540497077202-7c8a3999166f", // leg press
    "m-ext": "1540497077202-7c8a3999166f", // legs
    "m-leg-curl": "1599058917212-d750089bc07e", // hamstrings
  };
  const unsplashId =
    machineId && map[machineId] ? map[machineId] : "1518611012118-696072aa579a";
  return `https://images.unsplash.com/photo-${unsplashId}?auto=format&fit=crop&w=800&h=450&q=80`;
};

type RoutineType = "A" | "B" | "Free";

import { ActiveStudioProvider, useActiveStudio } from "./ActiveStudioContext";
import { MindbodyHealthProvider } from "./contexts/MindbodyHealthContext";

import { PurchaseView } from "./components/mindbody/PurchaseView";

import { useTrainers } from "./hooks/useTrainers";
import { useStudios } from "./hooks/useStudios";
import { useNetworks } from "./hooks/useNetworks";
import { useMachines } from "./hooks/useMachines";
import { useSessions } from "./hooks/useSessions";
import { useLiveSchedule } from "./hooks/useLiveSchedule";
import { useHubAnnouncements } from "./hooks/useHubAnnouncements";
import { useClientMutations } from "./hooks/useClientMutations";
import { StrongConfirmationModal } from "./components/StrongConfirmationModal";

// ... skipping to AppContent

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
  const { theme } = useTheme();
  const {
    activeStudioId,
    activeStudio,
    setActiveStudioId,
    availableStudios,
    isChangingStudio,
    setIsChangingStudio,
    isAdmin,
    isAuthenticated,
    setIsAuthenticated,
  } = useActiveStudio();
  const searchedScheduleNamesRef = useRef<Map<string, string | null>>(
    new Map(),
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [appMode, setAppMode] = useState<"trainer" | "admin">("trainer");
  const [currentView, setCurrentView] = useState<View>("clients");
  const [newClientOnboardingName, setNewClientOnboardingName] = useState<
    string | null
  >(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientDoc, setSelectedClientDoc] = useState<Client | null>(
    null,
  );
  const [hasQuotaError, setHasQuotaError] = useState(false);
  const [lastQuotaErrorMessage, setLastQuotaErrorMessage] = useState("");

  const triggerQuotaError = (msg: string) => {
    setHasQuotaError(true);
    setLastQuotaErrorMessage(msg);
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

  // Fetch the selected client document whenever selectedClientId changes
  useEffect(() => {
    if (!selectedClientId) {
      setSelectedClientDoc(null);
      return;
    }
    const fetchClient = async () => {
      try {
        const clientRef = doc(db, "clients", selectedClientId);
        const snap = await getDoc(clientRef);
        if (snap.exists()) {
          setSelectedClientDoc({ id: snap.id, ...snap.data() } as Client);
        } else {
          setSelectedClientDoc(null);
        }
      } catch (e) {
        console.error("Error fetching client", e);
      }
    };
    fetchClient().catch((err) =>
      console.error("Unhandled rejection in fetchClient:", err),
    );
  }, [selectedClientId]);

  const [dashboardInitialTab, setDashboardInitialTab] = useState<
    "analytics" | "importer"
  >("analytics");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedProfileTrainerId, setSelectedProfileTrainerId] = useState<
    string | null
  >(null);
  const [leaderboardReturnView, setLeaderboardReturnView] =
    useState<View>("trainer-hub");
  
  const isDataReady = !!authTrainer && !hasQuotaError;

  useTrainers(isDataReady, setTrainers);
  useStudios(isDataReady, setStudios);
  useNetworks(isDataReady, setNetworks);
  
  const { machines } = useMachines(isDataReady, DEFAULT_MACHINES);
  const { schedules, liveRosterClients } = useLiveSchedule(activeStudioId, isDataReady);
  const { sessions } = useSessions(activeStudioId, isDataReady);
  const { announcements } = useHubAnnouncements(authTrainer, activeStudioId);
  const [trainerFocuses, setTrainerFocuses] = useState<TrainerFocus[]>([]);

  const clients = Array.from(
    new Map(
      [
        ...(selectedClientDoc ? [selectedClientDoc] : []),
        ...liveRosterClients,
      ].map((c) => [c.id, c]),
    ).values(),
  );
  const [isAddingTrainer, setIsAddingTrainer] = useState(false);
  const [showNewClientsDialog, setShowNewClientsDialog] = useState(false);
  const [isReorderingTrainers, setIsReorderingTrainers] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isIntroSession, setIsIntroSession] = useState(false);
  const [isRefreshingSchedule, setIsRefreshingSchedule] = useState(false);

  const {
    startUnassignedSession,
    updateClient,
    submitClientFormData,
    updateClientSessions,
    handleDeleteClient,
    isMutating,
  } = useClientMutations(
    authTrainer,
    activeStudioId,
    machines,
    setSelectedClientId,
    setCurrentView
  );

  const handleRefreshSchedule = async () => {
    setIsRefreshingSchedule(true);
    try {
      const { executeFrontendMasterSync } = await import("./lib/frontend-sync");
      await executeFrontendMasterSync(
        null,
        false,
        trainers,
        liveRosterClients,
        studios,
      );
      console.log("Schedule refresh result: completed on frontend.");
    } catch (error: any) {
      console.error("Failed to refresh schedule:", error);
      alert("Failed to refresh schedule: " + error.message);
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
      await updateDoc(doc(db, "studios", studioId), { ...updates, updatedAt: serverTimestamp() });
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

    const viewBypassAdmin = tokenRole === "Admin" || authTrainer?.role === "Admin" || tokenRole === "Founder" || authTrainer?.role === "Founder" || tokenRole === "Overseer";
    if (
      viewOverride === "trainer-hub" &&
      viewBypassAdmin
    ) {
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
          pin: "0000",
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

  const handleTrainerLogin = (trainer: Trainer) => {
    // Admin Override: If logged in as claims admin, elevate profile role
    const isClaimsAdmin = tokenRole === "Admin" || tokenRole === "Founder" || tokenRole === "Overseer";
    if (
      isClaimsAdmin &&
      (trainer.role === "Trainer" || trainer.role === "LifeTransformer")
    ) {
      trainer.role = "Admin";
    }
    setAuthTrainer(trainer);
    localStorage.setItem("max_strength_trainer_id", trainer.id!);
  };

  const handleTrainerLock = () => {
    setAuthTrainer(null);
    localStorage.removeItem("max_strength_trainer_id");
  };

  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);

  const handleAppCleanse = () => {
    setIsWipeModalOpen(true);
  };

  const executeAppCleanse = async () => {
    setIsWipeModalOpen(false);

    try {
      const collectionsToWipe = [
        "studios",
        "clients",
        "trainers",
        "sessions",
        "exerciseLogs",
        "clientMachineSettings",
        "routines",
        "routineAdjustments",
        "schedules",
        "notes",
        "sessionNotes",
        "machineSettingChanges",
      ];

      console.log("Starting cleanse...");
      for (const colName of collectionsToWipe) {
        const snap = await getDocs(collection(db, colName));
        console.log(`Clearing ${colName} (${snap.size} docs)...`);
        const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(deletePromises);
      }

      console.log("Wipe complete. Machines were preserved.");

      // Clear local state
      setAuthTrainer(null);
      localStorage.removeItem("max_strength_trainer_id");
      setSelectedClientId(null);
      setCurrentView("clients");

      alert(
        "Application cleansed (studios, clients, users removed). Machines preserved. The app will now reload.",
      );
      window.location.href = window.location.origin + window.location.pathname;
    } catch (error: any) {
      console.error("Cleanse failed:", error);
      alert(
        `Cleanse failed: ${error.message || "Unknown error"}. Please check your connection or permissions.`,
      );
    }
  };

  const handleSeedDemoClient = async () => {
    try {
      const trainerId =
        authTrainer?.id || auth.currentUser?.uid || "demo-trainer";
      const trainerInitials = authTrainer?.initials || "JD";

      // 1. Create the Client with a unique-ish ID to avoid collisions
      const demoClientRef = doc(collection(db, "clients"));
      await setDoc(demoClientRef, {
        firstName: "John",
        lastName: "Demo",
        gender: "Male",
        height: "5' 10\"",
        weight: "185",
        age: 35,
        isActive: true,
        isRoutineBActive: true,
        remainingSessions: 12,
        consultationCompleted: true,
        email: `john.demo.${Date.now()}@example.com`,
        createdAt: serverTimestamp(),
      });

      const demoClientId = demoClientRef.id;

      // 2. Define and Create Routines
      const routineAIds = [
        "m-hip-add",
        "m-hip-abd",
        "m-leg-press",
        "m-compound-row",
        "m-dip",
        "m-lumbar",
        "m-torso-rotation",
      ];
      const routineBIds = [
        "m-leg-curl",
        "m-leg-ext",
        "m-pulldown",
        "m-overhead-press",
        "m-abs",
        "m-torso-rotation",
      ];

      await addDoc(collection(db, "routines"), {
        clientId: demoClientId,
        name: "A",
        machineIds: routineAIds,
        createdAt: serverTimestamp(),
          studioId: activeStudioId
    });

      await addDoc(collection(db, "routines"), {
        clientId: demoClientId,
        name: "B",
        machineIds: routineBIds,
        createdAt: serverTimestamp(),
          studioId: activeStudioId
    });

      // 3. Generate 2 months of history (16 sessions)
      const now = new Date();

      for (let i = 0; i < 16; i++) {
        const sessionDate = new Date(now);
        sessionDate.setDate(now.getDate() - (15 - i) * 3.5);
        const dateStr = sessionDate.toISOString().split("T")[0];
        const isRoutineA = i % 2 === 0;
        const routineName = isRoutineA ? "A" : "B";
        const machineIds = isRoutineA ? routineAIds : routineBIds;

        const ts = Timestamp.fromDate(sessionDate);
        const sessionRef = await addDoc(collection(db, "sessions"), {
          clientId: demoClientId,
          trainerId: trainerId,
          trainerInitials: trainerInitials,
          date: dateStr,
          hostedAtStudioId: activeStudioId || "solon",
          clientHomeStudioId: activeStudioId || "solon",
          isCrossTrain: false,
          routineName: routineName,
          sessionType: "Standard",
          sessionNumber: i + 1,
          status: "Completed",
          createdAt: ts,
          startTime: ts,
          endTime: ts,
        });

        // Add logs with progressive weights
        const logPromises = machineIds.map((mId, mIdx) => {
          const baseWeight = 50 + mIdx * 20;
          const weightValue = baseWeight + i * 5;

          const logData: any = {
            sessionId: sessionRef.id,
            clientId: demoClientId,
            machineId: mId,
            weight: weightValue.toString(),
            createdAt: ts,
          };

          // Special logic for new data properties
          if (mId === "m-torso-rotation") {
            // Bilateral reps
            logData.repsLeft = 10 + (i % 3);
            logData.repsRight = 10 + (i % 2);
          } else if (mId === "m-lumbar" && i % 4 === 0) {
            // TSC protocol test
            logData.isTSC = true;
            logData.reps = "90";
            logData.seconds = "90"; // 90 seconds for display
            logData.isStaticHold = true;
          } else {
            logData.reps = (8 + (i % 4)).toString();
          }

          return addDoc(collection(db, "exerciseLogs"), logData);
        });
        await Promise.all(logPromises);
      }

      alert("Demo Client 'John Demo' generated with 2 months of history!");
    } catch (err: any) {
      console.error("Demo seeding failed:", err);
      alert(`Demo seeding failed: ${err.message || "Unknown error"}`);
    }
  };

  const handleRestoreMachines = async () => {
    try {
      const promises = DEFAULT_MACHINES.map((machine) =>
        setDoc(
          doc(db, "machines", machine.id!),
          {
            ...machine,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      );

      await Promise.all(promises);
      alert(`Standard units enforced successfully.`);
    } catch (error: any) {
      console.error("Restore failed:", error);
      alert(`Restore failed: ${error.message || "Unknown error"}`);
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
        setTrainers(
          snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Trainer),
        );
      }
    } catch (e) {
      console.error("Manual refresh failed", e);
    }
  };

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async (providerName: 'google' | 'microsoft') => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      let provider;
      if (providerName === 'google') {
        provider = new GoogleAuthProvider();
      } else {
        provider = new OAuthProvider('microsoft.com');
        const tenantId = (import.meta as any).env.VITE_MICROSOFT_TENANT_ID || "bbd57ae5-2a1c-4a5c-88df-faef01b58d91";
        if (tenantId) {
          provider.setCustomParameters({
            prompt: 'select_account',
            tenant: tenantId
          });
        } else {
          provider.setCustomParameters({
            prompt: 'select_account'
          });
        }
      }
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (
        error.code === "auth/popup-closed-by-user" ||
        error.code === "auth/cancelled-popup-request"
      ) {
        return;
      }
      console.error("Login failed:", error);
      
      const errMsg = error.message || "";
      if (errMsg.includes("AADSTS50194")) {
        setLoginError("Login failed: Your Microsoft App Registration is configured as single-tenant. Please go to Azure Portal and configure application 'dd2ae28c-1a71-4de3-bc12-5b0683032526' to be multi-tenant ('Accounts in any organizational directory and personal Microsoft accounts'), or set VITE_MICROSOFT_TENANT_ID in your environment variables to your tenant ID.");
      } else {
        setLoginError(`Login failed: ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#1c1d1f] flex flex-col items-center justify-center p-6 focus:outline-none relative overflow-hidden">
        {/* Background Radial Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#005187]/20 via-[#1c1d1f] to-[#121212] opacity-80"></div>
        {/* Pattern Overlay */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/hexellence.png')] opacity-10 mix-blend-overlay"></div>
        {/* Edge Shadow */}
        <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.8)] pointer-events-none"></div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-lg z-10 flex flex-col items-center justify-center min-h-[60vh] mt-[-5vh]"
        >
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <MaxStrengthLogo
                size="2xl"
                theme="dark"
                showSlogan={true}
                className="drop-shadow-[0_15px_35px_rgba(0,0,0,0.6)] mb-8"
              />
            </motion.div>

            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-transparent bg-clip-text bg-gradient-to-r from-slate-200 via-white to-slate-400 font-extrabold tracking-[0.3em] text-2xl md:text-3xl uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            >
              Journey System
            </motion.h1>
          </div>

          {loginError && (
            <div className="mt-8 bg-red-500/10 border border-red-500/50 p-4 rounded-xl text-red-100 text-sm max-w-sm text-center font-medium shadow-[0_0_15px_rgba(220,38,38,0.3)] w-full">
              {loginError}
            </div>
          )}

          <div className="mt-8 w-full flex flex-col items-center justify-center gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleLogin('google')}
              disabled={isLoggingIn}
              className={cn(
                "relative overflow-hidden group w-full max-w-[320px] rounded-[40px] p-[2px] shadow-[0_15px_30px_rgba(0,0,0,0.5)] transition-opacity",
                isLoggingIn ? "opacity-50 cursor-not-allowed" : "opacity-100",
              )}
            >
              {/* Outer Metallic Ring */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#8b9bb4] via-[#33465e] to-[#1a2b41] rounded-[40px]"></div>
              {/* Inner highlight */}
              <div className="absolute inset-[1px] bg-gradient-to-b from-white/30 to-transparent rounded-[39px]"></div>

              <div className="relative bg-[#1d2736]/90 px-8 py-4 rounded-[38px] flex flex-row items-center justify-center gap-4 w-full h-full shadow-[inset_0_2px_15px_rgba(0,0,0,0.8)] backdrop-blur-md">
                <svg
                  className="w-6 h-6 text-slate-900 dark:text-white/90"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="font-bold text-slate-900 dark:text-white/90 text-sm tracking-wide">
                  Continue with Google
                </span>
              </div>
            </motion.button>
            
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "relative overflow-hidden group w-full max-w-[320px] rounded-[40px] p-[2px] shadow-[0_15px_30px_rgba(0,0,0,0.5)] transition-opacity opacity-50 cursor-not-allowed",
              )}
            >
              {/* Outer Metallic Ring */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#8b9bb4] via-[#33465e] to-[#1a2b41] rounded-[40px]"></div>
              {/* Inner highlight */}
              <div className="absolute inset-[1px] bg-gradient-to-b from-white/30 to-transparent rounded-[39px]"></div>

              <div className="relative bg-[#1d2736]/90 px-8 py-4 rounded-[38px] flex flex-row items-center justify-center gap-4 w-full h-full shadow-[inset_0_2px_15px_rgba(0,0,0,0.8)] backdrop-blur-md">
                <div className="absolute inset-0 bg-black/60 rounded-[38px] flex items-center justify-center z-10">
                  <span className="text-white font-bold text-sm tracking-wider uppercase drop-shadow-md">Coming Soon</span>
                </div>
                <svg
                  className="w-6 h-6 text-slate-900 dark:text-white/40"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
                </svg>
                <span className="font-bold text-slate-900 dark:text-white/90 text-sm tracking-wide">
                  Continue with Microsoft
                </span>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <div className="absolute bottom-6 w-full text-center z-10 px-6 flex flex-col items-center gap-3">
          <p className="text-slate-900 dark:text-white/30 text-[10px] sm:text-xs tracking-wider uppercase font-medium">
            Master/Admin Credentials Required for Administrative Portal Access
          </p>
          <div className="text-[#ff9800] font-black text-xs uppercase tracking-widest transition-colors mb-4 md:mb-0">
            No Account? Sign in to Request Access.
          </div>
        </div>
      </div>
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
  if (!activeStudioId || isChangingStudio) {
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
          const hasPin = selectedTrainer.pin || selectedTrainer.pinHash;
          if (!hasPin) {
            localStorage.setItem("max_strength_authenticated", "true");
            setIsAuthenticated(true);
          } else {
            localStorage.setItem("max_strength_authenticated", "false");
            setIsAuthenticated(false);
          }
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
        onClientCreated={(clientId, routeToImporter) => {
          setSelectedClientId(clientId);
          setNewClientOnboardingName(null);
          if (routeToImporter) {
            setCurrentView("chart-importer");
          } else {
            setCurrentView("profile");
          }
        }}
        onClose={() => setNewClientOnboardingName(null)}
      />
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col min-h-screen bg-background text-foreground font-sans overflow-x-hidden w-full max-w-full">
        {/* Header */}
        {currentView !== "workouts" && (
          <AppHeader 
            variant={theme === "light" ? "light" : "dark"}
            studioName={activeStudioName || undefined}
            onStudioClick={() => setIsChangingStudio(true)}
            rightControls={
              <>
                <ThemeToggle />
                <HubAnnouncementsWidget authTrainer={authTrainer} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentView("trainer-hub")}
                  className={`rounded-full transition-all hover:bg-transparent ${currentView === "trainer-hub" ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white dark:hover:text-slate-50 active:text-orange-500"}`}
                  title="Trainer Control Hub"
                >
                  <Settings className="w-6 h-6 md:w-7 md:h-7 transition-colors hover:stroke-orange-500" />
                </Button>
              </>
            }
            trainerDropdown={
              <DropdownMenu>
                <DropdownMenuTrigger className="w-11 h-11 rounded-full font-display italic text-sm flex items-center justify-center cursor-pointer shadow-sm mx-auto active:scale-95 transition-transform hover:opacity-90 bg-bg-dark text-white dark:border dark:border-div-d dark:bg-bg-dark-3">
                  {authTrainer.initials}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 rounded-[24px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-bg-dark p-2 shadow-2xl dark:shadow-none text-slate-700 dark:text-slate-300"
                >
                  <DropdownMenuGroup>
                    {isStudioLeader(authTrainer) && (
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 block mb-3">App Mode</Label>
                        <div className="flex bg-slate-100 dark:bg-bg-dark-3 p-1 rounded-xl">
                          <button
                            onClick={() => { setAppMode("trainer"); setCurrentView("clients"); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-colors ${appMode === "trainer" ? "bg-white dark:bg-bg-dark shadow-sm text-sky-600 dark:text-sky-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                          >
                            Trainer
                          </button>
                          <button
                            onClick={() => { setAppMode("admin"); setCurrentView("admin-dashboard" as any); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-colors ${appMode === "admin" ? "bg-white dark:bg-bg-dark shadow-sm text-orange-600 dark:text-orange-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                          >
                            Admin
                          </button>
                        </div>
                      </div>
                    )}
                    <DropdownMenuLabel className="font-black uppercase text-[11px] tracking-widest px-3 py-2 text-slate-500 dark:text-slate-400">
                      Active Profile
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedProfileTrainerId(null);
                        setCurrentView("trainer-profile");
                      }}
                      className="rounded-xl flex items-center gap-3 p-3 font-bold uppercase text-[11px] tracking-widest cursor-pointer hover:bg-slate-700 hover:text-slate-900 dark:text-white dark:hover:text-slate-50 focus:bg-slate-700 focus:text-slate-900 dark:text-white"
                    >
                      <UserCircle className="w-4 h-4 text-sky-500" />
                      View Profile
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator className="my-2 bg-slate-700" />

                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={handleTrainerLock}
                      className="rounded-xl flex items-center gap-3 p-3 font-bold uppercase text-[11px] tracking-widest text-orange-500 hover:bg-orange-500/10 dark:bg-orange-600/10 focus:bg-orange-500/10 dark:bg-orange-600/10 focus:text-orange-500 cursor-pointer"
                    >
                      <Lock className="w-4 h-4" />
                      Switch Trainer
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => setIsChangingStudio(true)}
                      className="rounded-xl flex items-center gap-3 p-3 font-bold uppercase text-[11px] tracking-widest cursor-pointer hover:bg-slate-700 hover:text-slate-900 dark:text-white dark:hover:text-slate-50 focus:bg-slate-700 focus:text-slate-900 dark:text-white"
                    >
                      <Building2 className="w-4 h-4 text-amber-500" />
                      Switch Studio
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="rounded-xl flex items-center gap-3 p-3 font-bold uppercase text-[11px] tracking-widest text-rose-500 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-500 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      Log Out Facility
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        )}

        {/* Main Content */}
        <main
          className={`flex-1 w-full max-w-full mx-auto relative ${currentView === "workouts" ? "p-2 pb-24 overflow-y-auto bg-slate-50 dark:bg-slate-950" : currentView === "clients" || currentView === "client-directory" || currentView === "dashboard" || currentView === "machine-anatomy" ? "h-[calc(100vh-5rem)] overflow-hidden bg-slate-50 dark:bg-slate-950 p-0 flex flex-col" : "p-6 pb-24 overflow-y-auto bg-slate-50 dark:bg-slate-950"}`}
        >
          <AnimatePresence mode="wait">
            {currentView === "consultation-wizard" && selectedClientId && (
              <ConsultationWizard
                client={
                  clients.find((c) => c.id === selectedClientId) as Client
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
            {currentView === "trainers" && (
              <ProfilesView
                trainers={trainers}
                clients={clients}
                sessions={sessions}
                schedules={schedules}
                onSelectClient={(id) => {
                  setSelectedClientId(id);
                }}
                setSelectedClientId={setSelectedClientId}
                setView={setCurrentView}
                authTrainer={authTrainer}
                onTrainerLogin={handleTrainerLogin}
                isAdmin={tokenRole === "Admin" || authTrainer?.role === "Admin" || tokenRole === "Founder" || authTrainer?.role === "Founder"}
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
                onUpdateSessions={updateClientSessions}
              />
            )}
            {currentView === "clients" && (
              <ClientsView
                clients={clients}
                trainers={trainers}
                sortedTrainers={sortedTrainers}
                isAdmin={tokenRole === "Admin" || authTrainer?.role === "Admin" || tokenRole === "Founder" || authTrainer?.role === "Founder"}
                activeStudioId={activeStudioId}
                authTrainer={authTrainer}
                onSelectClient={(id) => {
                  setSelectedClientId(id);
                  setView("profile");
                }}
                onStartNewClientOnboarding={setNewClientOnboardingName}
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
                setSelectedSessionId={setSelectedSessionId}
                onSelectTrainer={(id) => {
                  setSelectedProfileTrainerId(id);
                  setView("trainer-profile");
                }}
                handleRefreshSchedule={handleRefreshSchedule}
                isRefreshingSchedule={isRefreshingSchedule}
              />
            )}
            {currentView === "machine-anatomy" && (
              <MachineAnatomyCatalogView
                machines={machines}
              />
            )}
            {currentView === "leaderboard" && (
              <MachineLeaderboardDashboard
                clients={clients}
                activeStudioId={activeStudioId}
                onBack={() => setCurrentView(leaderboardReturnView)}
              />
            )}
            {currentView === "machines" && (
              <MachinesView
                machines={machines}
                clients={clients}
                onOpenInfo={(m) => {
                  setInfoMachineId(m.id!);
                  setIsEditingMachineInfo(false);
                }}
              />
            )}
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
                trainerFocuses={trainerFocuses}
                isSyncing={isSyncing}
                setIsSyncing={setIsSyncing}
                isIntroSession={isIntroSession}
              />
            )}
            {currentView === "history" && (
              <ClientHistoryView
                clientId={selectedClientId}
                clients={clients}
                machines={machines}
                trainers={trainers}
                setView={setCurrentView}
                selectedSessionId={selectedSessionId}
                user={user}
              />
            )}
            {currentView === "profile" && (
              <ClientProfileView
                clientId={selectedClientId}
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
            {currentView === "clinical-review" &&
              selectedClientId &&
              authTrainer && (
                <ClientClinicalReviewPreloader
                  client={clients.find((c) => c.id === selectedClientId)!}
                  machines={machines}
                  onOpenBriefing={() => {
                    setCurrentView("workouts");
                  }}
                  onClose={() => {
                    setCurrentView("profile");
                  }}
                />
              )}
            {currentView === "progress-report" &&
              selectedClientId &&
              authTrainer && (
                <ClientProgressReportView
                  client={clients.find((c) => c.id === selectedClientId)!}
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
                    (selectedProfileTrainerId
                      ? trainers.find((t) => t.id === selectedProfileTrainerId)
                      : authTrainer)!
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
            {currentView === "franchise-dashboard" && authTrainer && (
              <FranchiseDashboardView
                authTrainer={authTrainer}
                allStudios={studios}
                allTrainers={trainers}
                networks={networks}
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
                newClientsCount={newClientsThisMonth.length}
                onShowNewClients={() => setShowNewClientsDialog(true)}
                onUpdateStudio={updateStudio}
                onUpdateClient={updateClient}
                onNavigateProfile={(clientId) => {
                  setSelectedClientId(clientId);
                  setCurrentView("profile");
                }}
              />
            )}
            {currentView === "trainer-hub" && (
              <TrainerControlHubView
                activeStudioId={activeStudioId}
                trainers={trainers}
                machines={machines}
                clients={clients}
                sessions={sessions}
                authTrainer={authTrainer}
                isAdmin={
                  checkIsAdmin(authTrainer, user?.email || undefined) ||
                  isOwner(authTrainer)
                }
                onAppCleanse={handleAppCleanse}
                onSeedDemoClient={handleSeedDemoClient}
                onRestoreMachines={handleRestoreMachines}
                onLogout={handleLogout}
                onReorderTrainers={() => setIsReorderingTrainers(true)}
                setView={(view) => {
                  if (view === "leaderboard")
                    setLeaderboardReturnView("trainer-hub");
                  setCurrentView(view as any);
                }}
                studios={studios}
              />
            )}
            
            {currentView === "integrations" && (
              <IntegrationsHubView
                authTrainer={authTrainer}
                activeStudioId={activeStudioId}
                onBack={() => setCurrentView("trainer-hub")}
                studios={studios}
              />
            )}

            {currentView === "calendar" && (
              <ErrorBoundary fallback={
                <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Schedule Unavailable</h3>
                  <p className="text-muted-foreground max-w-sm mb-6">The schedule grid encountered an error. You can still access client metrics and profiles.</p>
                  <Button variant="outline" onClick={() => window.location.reload()}>Reload Dashboard</Button>
                </div>
              }>
                <CalendarView
                  schedules={schedules}
                  trainers={trainers}
                  authTrainer={authTrainer}
                  isAdmin={tokenRole === "Admin" || authTrainer?.role === "Admin" || tokenRole === "Founder" || authTrainer?.role === "Founder"}
                  activeStudioId={activeStudioId}
                  onSelectClient={setSelectedClientId}
                  onStartNewClientOnboarding={setNewClientOnboardingName}
                  setView={setView}
                  clients={clients}
                />
              </ErrorBoundary>
            )}
            {currentView === "purchases" && (
              <PurchaseView />
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
        </main>

        {/* Navigation Bar */}
        {appMode === "trainer" ? (
          <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-bg-dark border-t border-[#68717A]/20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] px-6 h-20 flex items-center justify-around z-[100]">
            <NavButton
              active={currentView === "clients"}
              onClick={() => setCurrentView("clients")}
              icon={<Users className="w-6 h-6" />}
              label="Hub"
            />
            <NavButton
              active={[
                "profile",
                "history",
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
              icon={<ClipboardList className="w-6 h-6" />}
              label="Client"
            />
            <NavButton
              active={currentView === "workouts"}
              onClick={() => {
                if (currentSession || selectedClientId) {
                  setCurrentView("workouts");
                } else {
                  setCurrentView("client-directory");
                }
              }}
              icon={<PlayCircle className="w-6 h-6" />}
              label={currentSession ? "Active Session" : "Start Session"}
              activeColor={currentSession ? "text-orange-500" : undefined}
              activeBg={
                currentSession
                  ? "bg-orange-500/10 dark:bg-orange-600/10"
                  : undefined
              }
              activeIndicator={
                currentSession ? "bg-orange-500 dark:bg-orange-600" : undefined
              }
            />
            <NavButton
              active={currentView === "machine-anatomy"}
              onClick={() => setCurrentView("machine-anatomy")}
              icon={<Dumbbell className="w-6 h-6" />}
              label="Catalog"
            />
            <NavButton
              active={currentView === "calendar"}
              onClick={() => setCurrentView("calendar")}
              icon={<Calendar className="w-6 h-6" />}
              label="Calendar"
            />
            <NavButton
              active={currentView === "purchases"}
              onClick={() => setCurrentView("purchases")}
              icon={<CreditCard className="w-6 h-6" />}
              label="Purchases"
            />
          </nav>
        ) : (
          <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-bg-dark border-t border-orange-500/20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] px-6 h-20 flex items-center justify-around z-[100]">
            <NavButton
              active={currentView === "admin-dashboard"}
              onClick={() => setCurrentView("admin-dashboard" as any)}
              icon={<LayoutDashboard className="w-6 h-6" />}
              label="Admin"
              activeColor="text-orange-500"
              activeBg="bg-orange-500/10 dark:bg-orange-600/10"
              activeIndicator="bg-orange-500 dark:bg-orange-600"
            />
            {(isOwner(authTrainer) || checkIsAdmin(authTrainer, user.email || undefined)) && (
              <NavButton
                active={currentView === "franchise-dashboard"}
                onClick={() => setCurrentView("franchise-dashboard" as any)}
                icon={<Network className="w-6 h-6" />}
                label="Franchise"
                activeColor="text-indigo-500"
                activeBg="bg-indigo-500/10 dark:bg-indigo-600/10"
                activeIndicator="bg-indigo-500 dark:bg-indigo-600"
              />
            )}
            <NavButton
              active={currentView === "trainer-hub"}
              onClick={() => setCurrentView("trainer-hub")}
              icon={<Settings className="w-6 h-6" />}
              label="Customize Studio"
              activeColor="text-emerald-500"
              activeBg="bg-emerald-500/10 dark:bg-emerald-600/10"
              activeIndicator="bg-emerald-500 dark:bg-emerald-600"
            />
          </nav>
        )}
      </div>

      {/* Machine Information Deep Dive Dialog */}
      <Dialog
        open={!!infoMachineId}
        onOpenChange={(open) => !open && setInfoMachineId(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-[32px] p-0 border-none shadow-2xl dark:shadow-none">
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
                  onClick={() => setIsEditingMachineInfo(!isEditingMachineInfo)}
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
                        className="min-h-[80px]"
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
                        className="min-h-[100px]"
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
                        className="min-h-[150px]"
                      />
                    </div>

                    <div className="flex gap-3">
                      <Button
                        className="flex-1 h-12 rounded-xl font-black uppercase italic italic tracking-widest"
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
                              {infoMachine.targetMuscles
                                ?.split(",")
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
                      <div className="p-4 bg-background border border-border rounded-xl min-h-[100px]">
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
        <DialogContent className="max-w-2xl rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none">
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
          <div className="p-6 max-h-[60vh] overflow-y-auto">
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
                    className="flex items-center justify-between p-4 bg-white dark:bg-bg-dark rounded-2xl border border-transparent hover:border-primary/20 hover:bg-white dark:bg-bg-dark transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-background flex items-center justify-center font-black text-primary border shadow-sm dark:shadow-none group-hover:scale-110 transition-transform">
                        {client.firstName[0]}
                        {client.lastName[0]}
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
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none min-h-[400px]">
          <DialogHeader className="p-8 bg-white dark:bg-bg-dark border-b">
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
          <div className="p-6 space-y-3 flex-1 overflow-y-auto">
            {sortedTrainers.map((trainer, idx) => (
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
                      const newSorted = [...sortedTrainers];
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
                    disabled={idx === sortedTrainers.length - 1}
                    className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary disabled:opacity-20"
                    onClick={async () => {
                      const newSorted = [...sortedTrainers];
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
          <DialogFooter className="p-6 border-t bg-white dark:bg-bg-dark">
            <Button
              onClick={() => setIsReorderingTrainers(false)}
              className="rounded-xl font-bold uppercase tracking-widest w-full h-12"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StrongConfirmationModal
        isOpen={isWipeModalOpen}
        title="Wipe Entire Database"
        description="This critical action will permanently delete all Clients, Trainers, Sessions, Schedules, Notes, and Logs. It will then completely re-initialize the 20 standard machines to factory defaults. This cannot be undone."
        confirmationPhrase="confirm wipe system"
        onConfirm={executeAppCleanse}
        onCancel={() => setIsWipeModalOpen(false)}
        isDestructive={true}
      />
    </ErrorBoundary>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label,
  activeColor = "text-[#115E8D]",
  activeBg = "bg-sky-500 dark:bg-sky-600/10",
  activeIndicator = "bg-sky-500 dark:bg-sky-600",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor?: string;
  activeBg?: string;
  activeIndicator?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 transition-all duration-300 relative ${active ? `${activeColor} scale-105` : "text-[#68717A] hover:text-[#115E8D]"}`}
    >
      <div
        className={`p-1.5 rounded-lg transition-colors ${active ? activeBg : "bg-transparent"}`}
      >
        {icon}
      </div>
      <span className="text-[11px] font-black uppercase tracking-tighter">
        {label}
      </span>
      {active && (
        <motion.div
          layoutId="nav-indicator"
          className={`absolute -bottom-1 left-0 right-0 h-0.5 rounded-full ${activeIndicator}`}
        />
      )}
    </button>
  );
}

const DEFAULT_AVAILABILITY: TrainerAvailability = {
  standard: {
    Monday: {
      isOpen: true,
      slots: [
        { start: "07:00", end: "12:30" },
        { start: "15:00", end: "18:30" },
      ],
    },
    Tuesday: {
      isOpen: true,
      slots: [
        { start: "07:00", end: "12:30" },
        { start: "15:00", end: "18:30" },
      ],
    },
    Wednesday: { isOpen: true, slots: [{ start: "07:00", end: "12:30" }] },
    Thursday: {
      isOpen: true,
      slots: [
        { start: "07:00", end: "12:30" },
        { start: "15:00", end: "18:30" },
      ],
    },
    Friday: { isOpen: true, slots: [{ start: "07:00", end: "12:30" }] },
    Saturday: { isOpen: true, slots: [{ start: "07:00", end: "12:30" }] },
    Sunday: { isOpen: false, slots: [] },
  },
};

function TrainersView({
  trainers,
  isAdding,
  setIsAdding,
  schedules,
  sessions,
  clients,
  onSelectClient,
  setSelectedSessionId,
  setView,
}: {
  trainers: Trainer[];
  isAdding: boolean;
  setIsAdding: (v: boolean) => void;
  schedules: any[];
  sessions: WorkoutSession[];
  clients: Client[];
  onSelectClient: (id: string) => void;
  setSelectedSessionId: (id: string | null) => void;
  setView: (v: View) => void;
}) {
  const [formData, setFormData] = useState({
    fullName: "",
    initials: "",
    pin: "",
    mindbody_ical_url: "",
    legacy_filemaker_id: "",
  });
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(
    null,
  );
  const selectedTrainer = trainers.find((t) => t.id === selectedTrainerId);

  const [isEditingAvailability, setIsEditingAvailability] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { pin, ...dataWithoutPin } = formData;
      const ref = await addDoc(collection(db, "trainers"), {
        ...dataWithoutPin,
        requiresPinReset: true,
        availability: DEFAULT_AVAILABILITY,
        createdAt: serverTimestamp(),
      });
      setFormData({
        fullName: "",
        initials: "",
        pin: "",
        mindbody_ical_url: "",
        legacy_filemaker_id: "",
      });
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "trainers");
    }
  };

  const handlePickUpSession = async (session: any, trainer: Trainer) => {
    // Conflict check
    const sessionTime = safeToDate(session.startTime);
    if (!sessionTime) return;
    const hasConflict = schedules.some(
      (s) =>
        s.trainerName === trainer.fullName &&
        getMillis(s.startTime) === sessionTime.getTime() &&
        s.id !== session.id,
    );

    if (hasConflict) {
      alert(
        `Conflict detected! You already have a session at ${sessionTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} on ${sessionTime.toLocaleDateString()}.`,
      );
      return;
    }

    try {
      await updateDoc(doc(db, "schedules", session.id), {
        trainerId: trainer.id,
        trainerName: trainer.fullName,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `schedules/${session.id}`,
      );
    }
  };

  const unassignedSessions = schedules
    .filter((s) => {
      if (
        s.trainerName &&
        !s.trainerName.toLowerCase().includes("select") &&
        s.trainerName !== ""
      )
        return false;
      const date = safeToDate(s.startTime);
      return date && date > new Date();
    })
    .sort((a, b) => getMillis(a.startTime) - getMillis(b.startTime));

  return (
    <motion.div
      key="trainers"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Trainers</h2>
          <p className="text-muted-foreground">
            Manage your team of professionals.
          </p>
        </div>
        <Button
          onClick={() => setIsAdding(!isAdding)}
          size="lg"
          className="rounded-full h-14 px-6 shadow-lg"
        >
          {isAdding ? (
            <Plus className="w-6 h-6 rotate-45" />
          ) : (
            <Plus className="w-6 h-6" />
          )}
          <span className="ml-2 font-bold uppercase tracking-wider">
            Add Trainer
          </span>
        </Button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <Card className="border-2 border-primary/20 shadow-xl">
              <CardHeader>
                <CardTitle>New Trainer Profile</CardTitle>
                <CardDescription>
                  Create a profile for quick session sign-offs.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label htmlFor="fullName" className="text-base font-bold">
                        Full Name
                      </Label>
                      <Input
                        id="fullName"
                        placeholder="e.g. John Smith"
                        value={formData.fullName}
                        onChange={(e) =>
                          setFormData({ ...formData, fullName: e.target.value })
                        }
                        required
                        className="h-14 text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="initials" className="text-base font-bold">
                        Initials
                      </Label>
                      <Input
                        id="initials"
                        placeholder="JS"
                        maxLength={4}
                        value={formData.initials}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            initials: e.target.value.toUpperCase(),
                          })
                        }
                        required
                        className="h-14 text-lg uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label
                        htmlFor="mindbody_url"
                        className="text-base font-bold"
                      >
                        MindBody iCal URL
                      </Label>
                      <Input
                        id="mindbody_url"
                        placeholder="https://mindbody.com/feed/..."
                        value={formData.mindbody_ical_url}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            mindbody_ical_url: e.target.value,
                          })
                        }
                        className="h-14 text-sm"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label
                        htmlFor="legacy_id_t"
                        className="text-base font-bold"
                      >
                        Legacy FileMaker ID
                      </Label>
                      <Input
                        id="legacy_id_t"
                        placeholder="Fm-XXXXX"
                        value={formData.legacy_filemaker_id}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            legacy_filemaker_id: e.target.value,
                          })
                        }
                        className="h-14 text-sm uppercase"
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex gap-4">
                  <Button
                    type="submit"
                    className="flex-1 h-14 text-lg font-bold uppercase tracking-widest bg-action text-action-foreground hover:bg-action/90 shadow-action/20 shadow-lg"
                  >
                    Save Trainer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAdding(false)}
                    className="h-14 px-8"
                  >
                    Cancel
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-8">
        {/* Unassigned Sessions Banner */}
        {unassignedSessions.length > 0 && (
          <section className="bg-red-50 border-2 border-red-500/20 rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500 rounded-xl">
                <AlertCircle className="w-6 h-6 text-slate-900 dark:text-white animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase italic tracking-tight text-red-600">
                  Action Required: Unassigned Sessions
                </h3>
                <p className="text-xs font-bold text-red-500/70 uppercase">
                  Clients are scheduled but no trainer is assigned.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {unassignedSessions.slice(0, 6).map((sc) => (
                <Card
                  key={sc.id}
                  className="border-red-200 shadow-sm dark:shadow-none overflow-hidden"
                >
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="text-sm font-black uppercase">
                          {sc.clientName}
                        </p>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                          {safeToDate(sc.startTime)?.toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          @{" "}
                          {safeToDate(sc.startTime)?.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    {trainers.length > 0 && (
                      <div className="flex gap-2">
                        <select
                          className="flex-1 bg-muted px-3 py-2 rounded-xl text-[11px] font-black uppercase"
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              const trainer = trainers.find(
                                (t) => t.id === val,
                              );
                              if (trainer) handlePickUpSession(sc, trainer);
                            }
                          }}
                        >
                          <option value="">Assign Trainer...</option>
                          {trainers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.fullName}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trainers.map((trainer) => {
            // Calculate stats for this trainer
            const trainerSessions = sessions.filter(
              (s) => s.trainerInitials === trainer.initials,
            );
            const uniqueClients = new Set(
              trainerSessions.map((s) => s.clientId),
            ).size;

            // Find most trained client
            const clientCounts: Record<string, number> = {};
            trainerSessions.forEach((s) => {
              clientCounts[s.clientId] = (clientCounts[s.clientId] || 0) + 1;
            });
            const mostTrainedClientId = Object.entries(clientCounts).sort(
              ([, a], [, b]) => b - a,
            )[0]?.[0];
            const mostTrainedClient = clients.find(
              (c) => c.id === mostTrainedClientId,
            );

            // Get sessions relative to now
            const now = new Date();
            const upcomingSchedule = schedules
              .filter((s) => {
                const sDate = safeToDate(s.startTime);
                if (!sDate) return false;
                return (
                  (s.trainerId === trainer.id ||
                    s.trainerName
                      .toLowerCase()
                      .includes(trainer.fullName.toLowerCase())) &&
                  sDate >= now &&
                  s.status !== "Cancelled"
                );
              })
              .sort((a, b) => getMillis(a.startTime) - getMillis(b.startTime));

            const isSelected = selectedTrainerId === trainer.id;

            return (
              <motion.div key={trainer.id} layout>
                <Card
                  className={`group hover:border-primary/50 transition-all cursor-pointer overflow-hidden ${isSelected ? "border-primary ring-2 ring-primary/10" : ""}`}
                  onClick={() =>
                    setSelectedTrainerId(isSelected ? null : trainer.id!)
                  }
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center font-bold text-primary text-xl">
                      {trainer.initials}
                    </div>
                    <Badge
                      variant="secondary"
                      className="font-mono text-[11px]"
                    >
                      {upcomingSchedule.length} UPCOMING SESSIONS
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h3 className="text-xl font-bold truncate uppercase italic tracking-tighter">
                        {trainer.fullName}
                      </h3>
                      <div className="flex gap-4 mt-2">
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-black text-muted-foreground uppercase">
                            Total Sessions
                          </p>
                          <p className="text-sm font-black">
                            {trainerSessions.length}
                          </p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-black text-muted-foreground uppercase">
                            Unique Clients
                          </p>
                          <p className="text-sm font-black">{uniqueClients}</p>
                        </div>
                        {mostTrainedClient && (
                          <div className="space-y-0.5">
                            <p className="text-[11px] font-black text-muted-foreground uppercase tracking-tighter">
                              Top Client
                            </p>
                            <p className="text-sm font-black truncate max-w-[80px]">
                              {mostTrainedClient.firstName}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="pt-4 border-t space-y-4"
                        >
                          <div className="space-y-3">
                            <p className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                              <Calendar className="w-3 h-3" /> Upcoming Schedule
                            </p>
                            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                              {upcomingSchedule.length > 0 ? (
                                upcomingSchedule.slice(0, 10).map((s, i) => (
                                  <div
                                    key={i}
                                    className="bg-primary/5 p-2.5 rounded-xl border border-primary/20 flex items-center justify-between group/session"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-xs font-black uppercase truncate">
                                        {s.clientName}
                                      </p>
                                      <p className="text-[11px] text-muted-foreground font-bold">
                                        {safeToDate(
                                          s.startTime,
                                        )?.toLocaleDateString([], {
                                          weekday: "short",
                                          month: "short",
                                          day: "numeric",
                                        })}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[11px] font-black">
                                        {safeToDate(
                                          s.startTime,
                                        )?.toLocaleTimeString([], {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </p>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="text-[11px] text-muted-foreground italic font-medium">
                                  No upcoming sessions scheduled
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                              <History className="w-3 h-3" /> Recent Activity
                            </p>
                            <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                              {trainerSessions.length > 0 ? (
                                trainerSessions
                                  .sort(
                                    (a, b) =>
                                      parseSessionDate(b.date) -
                                      parseSessionDate(a.date),
                                  )
                                  .slice(0, 5)
                                  .map((s, i) => {
                                    const client = clients.find(
                                      (c) => c.id === s.clientId,
                                    );
                                    return (
                                      <div
                                        key={i}
                                        className="bg-emerald-500/5 p-2.5 rounded-xl border border-emerald-500/10 flex items-center justify-between cursor-pointer hover:bg-emerald-500/10 transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (s.clientId) {
                                            onSelectClient(s.clientId);
                                            setSelectedSessionId(s.id || null);
                                            setView("history");
                                          }
                                        }}
                                      >
                                        <div className="min-w-0">
                                          <p className="text-xs font-black uppercase truncate">
                                            {client
                                              ? `${client.firstName} ${client.lastName}`
                                              : "Unknown Client"}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground font-bold">
                                            {(() => {
                                              const ts = parseSessionDate(
                                                s.date,
                                              );
                                              return ts > 0
                                                ? new Date(
                                                    ts,
                                                  ).toLocaleDateString([], {
                                                    month: "short",
                                                    day: "numeric",
                                                    year: "numeric",
                                                  })
                                                : s.date;
                                            })()}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <Badge className="bg-emerald-500/10 text-emerald-600 border-none text-[11px] h-4 py-0 uppercase">
                                            DONE
                                          </Badge>
                                        </div>
                                      </div>
                                    );
                                  })
                              ) : (
                                <p className="text-[11px] text-muted-foreground italic font-medium">
                                  No recent sessions recorded
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="pt-4 border-t">
                            <Button
                              variant="outline"
                              className="w-full h-11 rounded-xl text-[11px] font-black uppercase italic tracking-widest border-2 hover:bg-primary/5 hover:text-primary transition-all"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsEditingAvailability(true);
                              }}
                            >
                              Manage Availability
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                  <div
                    className={`h-1 w-full transition-colors ${isSelected ? "bg-primary" : "bg-primary/5 group-hover:bg-primary"}`}
                  />
                </Card>
              </motion.div>
            );
          })}
          {trainers.length === 0 && !isAdding && (
            <div className="col-span-full py-20 text-center border-2 border-dashed rounded-3xl bg-white dark:bg-bg-dark opacity-40">
              <UserCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-xs font-black uppercase tracking-widest">
                No trainers registered
              </p>
            </div>
          )}
        </div>
      </div>
      {isEditingAvailability && selectedTrainer && (
        <AvailabilityEditor
          trainer={selectedTrainer}
          onClose={() => setIsEditingAvailability(false)}
        />
      )}
    </motion.div>
  );
}

function AvailabilityEditor({
  trainer,
  onClose,
}: {
  trainer: Trainer;
  onClose: () => void;
}) {
  const [availability, setAvailability] = useState<TrainerAvailability>(
    trainer.availability || DEFAULT_AVAILABILITY,
  );
  const [activeTab, setActiveTab] = useState<"standard" | "overrides">(
    "standard",
  );
  const [newOverrideDate, setNewOverrideDate] = useState("");

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const handleSave = async () => {
    try {
      await updateDoc(doc(db, "trainers", trainer.id!), {
        availability,
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `trainers/${trainer.id}`,
      );
    }
  };

  const updateStandardDay = (day: string, updates: any) => {
    setAvailability({
      ...availability,
      standard: {
        ...availability.standard,
        [day]: { ...availability.standard[day], ...updates },
      },
    });
  };

  const addOverride = () => {
    if (!newOverrideDate) return;
    setAvailability({
      ...availability,
      overrides: {
        ...(availability.overrides || {}),
        [newOverrideDate]: {
          isOpen: true,
          slots: [{ start: "07:00", end: "12:30" }],
        },
      },
    });
    setNewOverrideDate("");
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl font-black uppercase italic">
            Availability: {trainer.fullName}
          </DialogTitle>
          <DialogDescription className="text-xs font-bold uppercase text-muted-foreground">
            Configure working hours and specific date overrides.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 flex gap-2 border-b">
          <button
            onClick={() => setActiveTab("standard")}
            className={`pb-2 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === "standard" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            Weekly Standard
          </button>
          <button
            onClick={() => setActiveTab("overrides")}
            className={`pb-2 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === "overrides" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            Date Overrides
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "standard" ? (
            <div className="space-y-4">
              {days.map((day) => {
                const config = (availability.standard[day] || {
                  isOpen: false,
                  slots: [],
                }) as {
                  isOpen: boolean;
                  slots: { start: string; end: string }[];
                };
                return (
                  <div
                    key={day}
                    className="p-4 rounded-2xl bg-white dark:bg-bg-dark border space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black uppercase italic tracking-tight">
                        {day}
                      </span>
                      <Switch
                        checked={config.isOpen}
                        onCheckedChange={(val) =>
                          updateStandardDay(day, { isOpen: val })
                        }
                      />
                    </div>
                    {config.isOpen && (
                      <div className="space-y-2">
                        {config.slots.map((slot, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={slot.start}
                              className="h-9 text-xs font-bold"
                              onChange={(e) => {
                                const newSlots = [...config.slots];
                                newSlots[idx].start = e.target.value;
                                updateStandardDay(day, { slots: newSlots });
                              }}
                            />
                            <span className="text-xs font-bold">to</span>
                            <Input
                              type="time"
                              value={slot.end}
                              className="h-9 text-xs font-bold"
                              onChange={(e) => {
                                const newSlots = [...config.slots];
                                newSlots[idx].end = e.target.value;
                                updateStandardDay(day, { slots: newSlots });
                              }}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const newSlots = config.slots.filter(
                                  (_, i) => i !== idx,
                                );
                                updateStandardDay(day, { slots: newSlots });
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-[11px] font-black uppercase"
                          onClick={() => {
                            updateStandardDay(day, {
                              slots: [
                                ...config.slots,
                                { start: "07:00", end: "12:30" },
                              ],
                            });
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Add Slot
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={newOverrideDate}
                  onChange={(e) => setNewOverrideDate(e.target.value)}
                  className="rounded-xl font-bold"
                />
                <Button
                  variant="outline"
                  className="rounded-xl uppercase font-black text-xs"
                  onClick={addOverride}
                >
                  Add
                </Button>
              </div>

              <div className="space-y-3">
                {Object.entries(availability.overrides || {})
                  .sort()
                  .map(([date, rawConfig]) => {
                    const config = rawConfig as {
                      isOpen: boolean;
                      slots: { start: string; end: string }[];
                    };
                    return (
                      <div
                        key={date}
                        className="p-4 bg-primary/5 border border-primary/10 rounded-2xl space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black uppercase italic">
                            {new Date(
                              parseSessionDate(date),
                            ).toLocaleDateString([], {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const newOverrides = {
                                ...availability.overrides,
                              };
                              delete newOverrides[date];
                              setAvailability({
                                ...availability,
                                overrides: newOverrides,
                              });
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase opacity-60">
                            Status
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-black uppercase">
                              {config.isOpen ? "Open" : "Closed"}
                            </span>
                            <Switch
                              checked={config.isOpen}
                              onCheckedChange={(val) => {
                                const newOverrides = {
                                  ...availability.overrides,
                                };
                                newOverrides[date] = { ...config, isOpen: val };
                                setAvailability({
                                  ...availability,
                                  overrides: newOverrides,
                                });
                              }}
                            />
                          </div>
                        </div>
                        {config.isOpen && (
                          <div className="space-y-2">
                            {config.slots.map((slot, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2"
                              >
                                <Input
                                  type="time"
                                  value={slot.start}
                                  className="h-8 text-[11px] font-bold"
                                  onChange={(e) => {
                                    const newOverrides = {
                                      ...availability.overrides,
                                    };
                                    newOverrides[date].slots[idx].start =
                                      e.target.value;
                                    setAvailability({
                                      ...availability,
                                      overrides: newOverrides,
                                    });
                                  }}
                                />
                                <Input
                                  type="time"
                                  value={slot.end}
                                  className="h-8 text-[11px] font-bold"
                                  onChange={(e) => {
                                    const newOverrides = {
                                      ...availability.overrides,
                                    };
                                    newOverrides[date].slots[idx].end =
                                      e.target.value;
                                    setAvailability({
                                      ...availability,
                                      overrides: newOverrides,
                                    });
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 border-t bg-white dark:bg-bg-dark">
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-xl uppercase font-black text-xs"
          >
            Discard
          </Button>
          <Button
            onClick={handleSave}
            className="rounded-xl uppercase font-black text-xs bg-action text-action-foreground hover:bg-action/90 shadow-action/20 shadow-lg"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientsView({
  clients,
  trainers,
  sortedTrainers,
  isAdmin,
  activeStudioId,
  authTrainer,
  onSelectClient,
  onStartNewClientOnboarding,
  setView,
  schedules,
  sessions,
  editingClient,
  setEditingClient,
  formData,
  setFormData,
  onSubmit,
  startEdit,
  updateSessions,
  setSelectedSessionId,
  onSelectTrainer,
  handleRefreshSchedule,
  isRefreshingSchedule,
}: {
  clients: Client[];
  trainers: Trainer[];
  sortedTrainers: Trainer[];
  isAdmin: boolean;
  activeStudioId: string;
  authTrainer: Trainer | null;
  onSelectClient: (id: string) => void;
  onStartNewClientOnboarding?: (name: string) => void;
  setView: (v: View) => void;
  schedules: any[];
  sessions: WorkoutSession[];
  editingClient: Client | null;
  setEditingClient: (c: Client | null) => void;
  formData: any;
  setFormData: (f: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  startEdit: (c: Client) => void;
  updateSessions: (id: string, current: number, delta: number) => void;
  setSelectedSessionId: (id: string | null) => void;
  onSelectTrainer?: (id: string) => void;
  handleRefreshSchedule: () => Promise<void>;
  isRefreshingSchedule: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dbSearchResults, setDbSearchResults] = useState<Client[]>([]);
  const [isSearchingDb, setIsSearchingDb] = useState(false);

  const [trainerFilter, setTrainerFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"morning" | "afternoon">(() => {
    return new Date().getHours() >= 12 ? "afternoon" : "morning";
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [linkingSession, setLinkingSession] = useState<any | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [searchTermLink, setSearchTermLink] = useState("");
  const [dbSearchResultsLink, setDbSearchResultsLink] = useState<Client[]>([]);
  const [isSearchingDbLink, setIsSearchingDbLink] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Sync / search database in real-time when trainer searches on main screen
  useEffect(() => {
    if (!searchTerm.trim()) {
      setDbSearchResults([]);
      return;
    }
    const fetchClients = async () => {
      setIsSearchingDb(true);
      try {
        const term = searchTerm.trim().toLowerCase();
        const alphaOnly = term.replace(/[^a-z]/g, "");
        const prefixLen = alphaOnly.length > 3 ? 3 : alphaOnly.length;
        const prefix = alphaOnly.slice(0, prefixLen);
        const prefixCapitalized =
          prefix.charAt(0).toUpperCase() + prefix.slice(1);

        if (!prefixCapitalized) {
          setDbSearchResults([]);
          return;
        }

        const clientsRef = collection(db, "clients");
        const q1 = query(
          clientsRef,
          where("firstName", ">=", prefixCapitalized),
          where("firstName", "<=", prefixCapitalized + "\uf8ff"),
          limit(30),
        );
        const q2 = query(
          clientsRef,
          where("lastName", ">=", prefixCapitalized),
          where("lastName", "<=", prefixCapitalized + "\uf8ff"),
          limit(30),
        );

        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const uniqueDocs = new Map<string, any>();
        [...snap1.docs, ...snap2.docs].forEach((d) => {
          uniqueDocs.set(d.id, { id: d.id, ...d.data() });
        });

        const candidates = Array.from(uniqueDocs.values());
        const fetched = candidates.filter((c) => {
          const first = (c.firstName || "").toLowerCase();
          const last = (c.lastName || "").toLowerCase();
          const full = `${first} ${last}`;
          const mb = (c.mindbody_name || "").toLowerCase();

          return (
            first.includes(term) ||
            last.includes(term) ||
            full.includes(term) ||
            mb.includes(term) ||
            term.includes(first) ||
            term.includes(last) ||
            isFuzzyNameMatch(
              term,
              c.firstName || "",
              c.lastName || "",
              c.mindbody_name,
            )
          );
        });

        setDbSearchResults(fetched);
      } catch (err) {
        console.error("Error searching matching clients in main search:", err);
      } finally {
        setIsSearchingDb(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchClients();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  // Sync / search database in real-time when trainer searches on Link Client Dialog
  useEffect(() => {
    if (!searchTermLink.trim()) {
      setDbSearchResultsLink([]);
      return;
    }
    const fetchClientsLink = async () => {
      setIsSearchingDbLink(true);
      try {
        const term = searchTermLink.trim().toLowerCase();
        const alphaOnly = term.replace(/[^a-z]/g, "");
        const prefixLen = alphaOnly.length > 3 ? 3 : alphaOnly.length;
        const prefix = alphaOnly.slice(0, prefixLen);
        const prefixCapitalized =
          prefix.charAt(0).toUpperCase() + prefix.slice(1);

        if (!prefixCapitalized) {
          setDbSearchResultsLink([]);
          return;
        }

        const clientsRef = collection(db, "clients");
        const q1 = query(
          clientsRef,
          where("firstName", ">=", prefixCapitalized),
          where("firstName", "<=", prefixCapitalized + "\uf8ff"),
          limit(30),
        );
        const q2 = query(
          clientsRef,
          where("lastName", ">=", prefixCapitalized),
          where("lastName", "<=", prefixCapitalized + "\uf8ff"),
          limit(30),
        );

        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const uniqueDocs = new Map<string, any>();
        [...snap1.docs, ...snap2.docs].forEach((d) => {
          uniqueDocs.set(d.id, { id: d.id, ...d.data() });
        });

        const candidates = Array.from(uniqueDocs.values());
        const fetched = candidates.filter((c) => {
          const first = (c.firstName || "").toLowerCase();
          const last = (c.lastName || "").toLowerCase();
          const full = `${first} ${last}`;
          const mb = (c.mindbody_name || "").toLowerCase();

          return (
            first.includes(term) ||
            last.includes(term) ||
            full.includes(term) ||
            mb.includes(term) ||
            term.includes(first) ||
            term.includes(last) ||
            isFuzzyNameMatch(
              term,
              c.firstName || "",
              c.lastName || "",
              c.mindbody_name,
            )
          );
        });

        setDbSearchResultsLink(fetched);
      } catch (err) {
        console.error("Error searching clients in link dialog:", err);
      } finally {
        setIsSearchingDbLink(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchClientsLink();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTermLink]);

  const filteredClients = clients.filter((c) =>
    `${c.firstName} ${c.lastName}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase()),
  );

  // Merge local filtered clients of today and dynamic DB search results uniquely by client ID
  const mergedSearchClients = Array.from(
    new Map(
      [...filteredClients, ...dbSearchResults].map((c) => [c.id, c]),
    ).values(),
  );

  const now = new Date();

  // Get sessions for selected day
  const dateStart = new Date(selectedDate);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(selectedDate);
  dateEnd.setHours(23, 59, 59, 999);

  const todaysSchedules = schedules
    .filter((s) => {
      const date = safeToDate(s.startTime);
      if (!date) return false;
      return date >= dateStart && date <= dateEnd && s.status !== "Cancelled";
    })
    .sort((a, b) => getMillis(a.startTime) - getMillis(b.startTime));

  const AM_SLOTS = [
    "7:00 AM",
    "7:30 AM",
    "8:00 AM",
    "8:30 AM",
    "9:00 AM",
    "9:30 AM",
    "10:00 AM",
    "10:30 AM",
    "11:00 AM",
    "11:30 AM",
    "12:00 PM",
    "12:30 PM",
    "1:00 PM",
  ];
  const PM_SLOTS = [
    "2:00 PM",
    "2:30 PM",
    "3:00 PM",
    "3:30 PM",
    "4:00 PM",
    "4:30 PM",
    "5:00 PM",
    "5:30 PM",
    "6:00 PM",
    "6:30 PM",
    "7:00 PM",
  ];

  function get12HourStr(d: Date) {
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${m} ${ampm}`;
  }

  const amSessionsCount = todaysSchedules.filter((s) => {
    if (s.clientName?.toLowerCase().includes("unavailab")) return false;
    const sDate = safeToDate(s.startTime);
    if (!sDate) return false;
    const tStr = get12HourStr(sDate);
    return AM_SLOTS.includes(tStr);
  }).length;

  const pmSessionsCount = todaysSchedules.filter((s) => {
    if (s.clientName?.toLowerCase().includes("unavailab")) return false;
    const sDate = safeToDate(s.startTime);
    if (!sDate) return false;
    const tStr = get12HourStr(sDate);
    return PM_SLOTS.includes(tStr);
  }).length;

  // Generate 6 days starting from today or Monday (skipping Sundays)
  const getUpcomingDays = () => {
    const days = [];
    let temp = new Date();
    // Start from today, but if today is Sunday, start tomorrow
    if (temp.getDay() === 0) temp.setDate(temp.getDate() + 1);

    let count = 0;
    let curr = new Date(temp);
    while (count < 6) {
      if (curr.getDay() !== 0) {
        days.push(new Date(curr));
        count++;
      }
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  };
  const weekDays = getUpcomingDays();

  // Helper for time slots
  const generateSlots = (
    startHour: number,
    endHour: number,
    ampmStr: string,
  ) => {
    const slots = [];
    for (let h = startHour; h <= endHour; h++) {
      const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const suffix =
        h >= 12 && ampmStr === "AUTO"
          ? "PM"
          : h < 12 && ampmStr === "AUTO"
            ? "AM"
            : ampmStr;
      slots.push(`${displayHour}:00 ${suffix}`);
      if (h !== endHour) {
        slots.push(`${displayHour}:30 ${suffix}`);
      }
    }
    return slots;
  };

  const currentSlots = activeTab === "morning" ? AM_SLOTS : PM_SLOTS;

  // Active trainers for column display
  const TRAINER_COLORS = [
    { border: "border-sky-500", bg: "bg-sky-500/10" },
    { border: "border-[#10B981]", bg: "bg-[#10B981]/10" },
    {
      border: "border-orange-500",
      bg: "bg-orange-500/10 dark:bg-orange-600/10",
    },
    { border: "border-purple-400", bg: "bg-purple-400/10" },
    { border: "border-pink-400", bg: "bg-pink-400/10" },
  ];

  const timeToPosition = (date: Date) => {
    if (selectedDate.toDateString() !== new Date().toDateString()) return null;
    const h = date.getHours();
    const m = date.getMinutes();
    const totalMins = h * 60 + m;
    const shiftStartMins = activeTab === "morning" ? 7 * 60 : 14 * 60;
    const shiftEndMins = activeTab === "morning" ? 13 * 60 : 19 * 60;
    if (totalMins < shiftStartMins || totalMins > shiftEndMins) return null;
    const minsFromStart = totalMins - shiftStartMins;
    const totalShiftMins = shiftEndMins - shiftStartMins;
    return (minsFromStart / totalShiftMins) * 100;
  };
  const currentTimePos = timeToPosition(now);

  // Find if a slot has any sessions for any trainer
  const getSlotSessions = (slot: string) => {
    return todaysSchedules.filter((s) => {
      const date = safeToDate(s.startTime);
      if (!date) return false;
      const h = date.getHours().toString().padStart(2, "0");
      const m = date.getMinutes().toString().padStart(2, "0");
      return `${h}:${m}` === slot;
    });
  };

  const findClientForSession = (session: any) => {
    if (!session) return null;
    const sName = (session.clientName || "").trim();

    const scheduleTrainer = trainers.find(
      (t) =>
        t.id === session.trainerId ||
        (t.fullName &&
          session.trainerName &&
          t.fullName.toLowerCase() === session.trainerName.toLowerCase()),
    );
    const targetStudioId = scheduleTrainer?.primaryHomeStudioId;

    let matched: Client | undefined = undefined;

    // 1. First, search under the trainer's home studio
    if (targetStudioId) {
      matched = clients.find(
        (c) =>
          c.homeStudioId === targetStudioId &&
          (c.id === session.clientId ||
            isFuzzyNameMatch(
              sName,
              c.firstName || "",
              c.lastName || "",
              c.mindbody_name,
            )),
      );
    }

    // 2. Global fallback
    if (!matched) {
      matched = clients.find(
        (c) =>
          c.id === session.clientId ||
          isFuzzyNameMatch(
            sName,
            c.firstName || "",
            c.lastName || "",
            c.mindbody_name,
          ),
      );
    }

    // 3. Quick check: Has this exact name been linked in any previous schedule entry?
    if (!matched && schedules) {
      const pastLink = schedules.find(
        (s) => s.clientName === sName && !!s.clientId,
      );
      if (pastLink) {
        matched = clients.find((c) => c.id === pastLink.clientId);
      }
    }

    return matched || null;
  };

  const hasUnassignedAnywhereInGrid =
    todaysSchedules.some(
      (s) =>
        !s.trainerName ||
        s.trainerName.toLowerCase().includes("select") ||
        s.trainerName === "",
    ) ||
    sessions.some(
      (s) =>
        s.status === "In-Progress" &&
        (s as any).isUnassigned &&
        isSessionValid(s),
    ); // check for active unassigned sessions

  const getClientSessions = (client: Client) => {
    const clientName = `${client.firstName} ${client.lastName}`;
    const next = schedules
      .filter((s) => {
        const d = safeToDate(s.startTime);
        return (
          (s.clientId === client.id ||
            s.clientName.toLowerCase() === clientName.toLowerCase()) &&
          d &&
          d > now &&
          s.status !== "Cancelled"
        );
      })
      .sort((a, b) => getMillis(a.startTime) - getMillis(b.startTime))[0];
    const last = sessions
      .filter((s) => s.clientId === client.id)
      .sort((a, b) => parseSessionDate(b.date) - parseSessionDate(a.date))[0];
    return { next, last };
  };

  const visibleTrainersList = sortedTrainers
    .filter((t) => {
      if (t.isVisibleOnCalendar === false) return false;
      return (
        t.primaryHomeStudioId === activeStudioId ||
        t.accessibleStudioIds?.includes(activeStudioId) ||
        t.activeGuestStudioIds?.includes(activeStudioId)
      );
    })
    .slice(0, 5);

  return (
    <motion.div
      key="clients"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white w-full overflow-hidden"
    >
      <div className="flex flex-col gap-3 shrink-0 p-4 pb-0 bg-slate-50 dark:bg-slate-950 z-30">
        <div className="flex items-center gap-3 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 dark:text-slate-400" />
            <Input
              placeholder="Search clients..."
              className="pl-12 h-12 rounded-2xl bg-white dark:bg-bg-dark border-none font-bold text-base text-slate-900 dark:text-white focus-visible:ring-sky-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            onClick={() => {
              if (onStartNewClientOnboarding) {
                onStartNewClientOnboarding("");
              }
            }}
            size="lg"
            className="rounded-xl h-12 px-8 shadow-[0_0_20px_rgba(56,189,248,0.2)] bg-sky-500 hover:bg-[#0284C7] text-slate-900 font-black uppercase tracking-widest text-sm hidden sm:flex items-center shrink-0"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add New Client
          </Button>
        </div>
        <div className="sm:hidden w-full">
          <Button
            onClick={() => {
              if (onStartNewClientOnboarding) {
                onStartNewClientOnboarding("");
              }
            }}
            size="lg"
            className="rounded-xl h-12 px-8 shadow-[0_0_20px_rgba(56,189,248,0.2)] bg-sky-500 hover:bg-[#0284C7] text-slate-900 font-black w-full uppercase tracking-widest text-sm flex items-center justify-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add New Client
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {/* Registration form removed for unified modal; only editing is kept here for now or until unified */}
        {editingClient && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-8"
          >
            <Card className="border-2 border-primary/20 shadow-2xl dark:shadow-none rounded-3xl overflow-hidden">
              <CardHeader>
                <CardTitle>Edit Client Profile</CardTitle>
                <CardDescription>
                  Updating information for {editingClient.firstName}
                </CardDescription>
              </CardHeader>
              <form onSubmit={onSubmit}>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label
                        htmlFor="firstName"
                        className="text-base font-bold"
                      >
                        First Name
                      </Label>
                      <Input
                        id="firstName"
                        placeholder="First Name"
                        value={formData.firstName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            firstName: e.target.value,
                          })
                        }
                        required
                        className="h-14 text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="lastName" className="text-base font-bold">
                        Last Name
                      </Label>
                      <Input
                        id="lastName"
                        placeholder="Last Name"
                        value={formData.lastName}
                        onChange={(e) =>
                          setFormData({ ...formData, lastName: e.target.value })
                        }
                        required
                        className="h-14 text-lg"
                      />
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label htmlFor="gender" className="text-base font-bold">
                        Gender
                      </Label>
                      <div className="flex gap-2">
                        {["Male", "Female", "Other"].map((g) => (
                          <Button
                            key={g}
                            type="button"
                            variant={
                              formData.gender === g ? "default" : "outline"
                            }
                            className="flex-1 h-12 font-bold"
                            onClick={() =>
                              setFormData({ ...formData, gender: g as any })
                            }
                          >
                            {g}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label className="text-base font-bold">Height</Label>
                      <div className="flex gap-3">
                        <div className="relative flex-1">
                          <Input
                            id="heightFeet"
                            type="number"
                            placeholder="Ft"
                            value={formData.heightFeet}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                heightFeet: e.target.value,
                              })
                            }
                            required
                            className="h-14 text-lg pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                            ft
                          </span>
                        </div>
                        <div className="relative flex-1">
                          <Input
                            id="heightInches"
                            type="number"
                            placeholder="In"
                            value={formData.heightInches}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                heightInches: e.target.value,
                              })
                            }
                            required
                            className="h-14 text-lg pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                            in
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="weight" className="text-base font-bold">
                        Weight (lbs)
                      </Label>
                      <Input
                        id="weight"
                        type="number"
                        placeholder="e.g. 185"
                        value={formData.weight}
                        onChange={(e) =>
                          setFormData({ ...formData, weight: e.target.value })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="age" className="text-base font-bold">
                        Age
                      </Label>
                      <Input
                        id="age"
                        type="number"
                        placeholder="Years"
                        value={formData.age}
                        onChange={(e) =>
                          setFormData({ ...formData, age: e.target.value })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label
                        htmlFor="occupation"
                        className="text-base font-bold"
                      >
                        Occupation
                      </Label>
                      <Input
                        id="occupation"
                        placeholder="e.g. Software Engineer"
                        value={formData.occupation}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            occupation: e.target.value,
                          })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label htmlFor="phone" className="text-base font-bold">
                        Phone Number
                      </Label>
                      <Input
                        id="phone"
                        placeholder="(555) 000-0000"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="email" className="text-base font-bold">
                        Email Address
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="client@example.com"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="address" className="text-base font-bold">
                      Address
                    </Label>
                    <Input
                      id="address"
                      placeholder="123 Main St, City, State, Zip"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                      className="h-14 text-lg"
                    />
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label
                        htmlFor="emergencyName"
                        className="text-base font-bold"
                      >
                        Emergency Contact Name
                      </Label>
                      <Input
                        id="emergencyName"
                        placeholder="Full Name"
                        value={formData.emergencyContactName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            emergencyContactName: e.target.value,
                          })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label
                        htmlFor="emergencyPhone"
                        className="text-base font-bold"
                      >
                        Emergency Contact Phone
                      </Label>
                      <Input
                        id="emergencyPhone"
                        placeholder="(555) 000-0000"
                        value={formData.emergencyContactPhone}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            emergencyContactPhone: e.target.value,
                          })
                        }
                        className="h-14 text-lg"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label
                      htmlFor="legacy_id_c"
                      className="text-base font-bold text-amber-600"
                    >
                      Legacy FileMaker ID
                    </Label>
                    <Input
                      id="legacy_id_c"
                      placeholder="Fm-XXXXX"
                      value={formData.legacy_filemaker_id}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          legacy_filemaker_id: e.target.value,
                        })
                      }
                      className="h-14 text-lg border-amber-500/30 bg-amber-500/5 focus:ring-amber-500"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-2xl">
                    <div className="space-y-0.5">
                      <Label className="text-base font-bold">
                        Active Status
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Is this client currently training?
                      </p>
                    </div>
                    <Switch
                      checked={formData.isActive}
                      onCheckedChange={(v) =>
                        setFormData({ ...formData, isActive: v })
                      }
                    />
                  </div>

                  <div className="space-y-3">
                    <Label
                      htmlFor="medicalHistory"
                      className="text-base font-bold"
                    >
                      Medical History / Injuries
                    </Label>
                    <Textarea
                      id="medicalHistory"
                      placeholder="List any medical history, injuries, or contraindications..."
                      value={formData.medicalHistory}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          medicalHistory: e.target.value,
                        })
                      }
                      className="min-h-[100px] text-lg p-4"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="notes" className="text-base font-bold">
                      Session Preferences / Notes
                    </Label>
                    <Textarea
                      id="notes"
                      placeholder="Trainer notes about preferences, motivations, etc."
                      value={formData.globalNotes}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          globalNotes: e.target.value,
                        })
                      }
                      className="min-h-[100px] text-lg p-4"
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex gap-4">
                  <Button
                    type="submit"
                    className="flex-1 h-14 text-lg font-bold uppercase tracking-widest"
                  >
                    Update Profile
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingClient(null);
                    }}
                    className="h-14 px-8"
                  >
                    Cancel
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        {!searchTerm ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950 p-6 space-y-10">
            {/* Header / Week Selector / Shift Toggle */}
            <section className="bg-bg-dark rounded-[24px] md:rounded-[32px] p-4 md:p-6 shadow-[0_4px_30px_rgba(0,0,0,0.1)] border border-slate-700/50 space-y-6 shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 opacity-80 pointer-events-none"></div>
              <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-6 z-10">
                {/* Week Selector */}
                <div className="flex flex-wrap gap-2">
                  {weekDays.map((date) => {
                    const isSelected =
                      date.toDateString() === selectedDate.toDateString();
                    const isToday =
                      date.toDateString() === new Date().toDateString();
                    return (
                      <button
                        key={date.toISOString()}
                        onClick={() => setSelectedDate(date)}
                        className={`min-w-[85px] px-4 py-3 xl:py-4 rounded-xl flex flex-col items-center gap-1.5 transition-all border ${
                          isSelected
                            ? "bg-cyan border-cyan text-slate-900 shadow-[0_0_20px_rgba(56,189,248,0.3)] scale-105 z-10"
                            : "bg-surface-2 border-slate-700 text-slate-400 hover:border-cyan/50 hover:bg-surface-1 hover:text-white"
                        }`}
                      >
                        <span className="text-[11px] font-black uppercase tracking-widest leading-none opacity-80">
                          {date.toLocaleDateString([], { weekday: "short" })}
                        </span>
                        <span
                          className={`text-[17px] font-black leading-none ${isSelected ? "text-slate-900" : "text-slate-100"}`}
                        >
                          {isToday
                            ? "Today"
                            : date.toLocaleDateString([], { day: "numeric" })}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Right Actions: Shift Selector & Refresh Button */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 self-start xl:self-center w-full sm:w-auto">
                  {/* Shift Selector */}
                  <div className="relative flex p-1.5 bg-surface-2 rounded-2xl border border-slate-700 shadow-inner w-[320px] h-16 xl:h-20 shrink-0">
                    <div
                      className={cn(
                        "absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-white rounded-[14px] shadow-sm transition-transform duration-300 ease-out z-0",
                        activeTab === "morning"
                          ? "translate-x-0"
                          : "translate-x-[100%]",
                      )}
                    />
                    <button
                      onClick={() => setActiveTab("morning")}
                      className={cn(
                        "relative flex-1 rounded-[14px] transition-colors z-10 flex flex-col items-center justify-center gap-1",
                        activeTab === "morning"
                          ? "text-slate-900"
                          : "text-slate-400 hover:text-slate-300",
                      )}
                    >
                      <span className="text-[13px] xl:text-[14px] font-black uppercase tracking-widest leading-none mt-0.5 xl:mt-1">
                        AM Shift
                      </span>
                      <span
                        className={cn(
                          "text-[11px] xl:text-[11px] font-bold uppercase tracking-widest leading-none",
                          activeTab === "morning"
                            ? "text-[#0A2E46]"
                            : "opacity-60",
                        )}
                      >
                        {amSessionsCount} Sessions
                      </span>
                    </button>
                    <button
                      onClick={() => setActiveTab("afternoon")}
                      className={cn(
                        "relative flex-1 rounded-[14px] transition-colors z-10 flex flex-col items-center justify-center gap-1",
                        activeTab === "afternoon"
                          ? "text-slate-900"
                          : "text-slate-400 hover:text-slate-300",
                      )}
                    >
                      <span className="text-[13px] xl:text-[14px] font-black uppercase tracking-widest leading-none mt-0.5 xl:mt-1">
                        PM Shift
                      </span>
                      <span
                        className={cn(
                          "text-[11px] xl:text-[11px] font-bold uppercase tracking-widest leading-none",
                          activeTab === "afternoon"
                            ? "text-orange-600"
                            : "opacity-60",
                        )}
                      >
                        {pmSessionsCount} Sessions
                      </span>
                    </button>
                  </div>

                  {/* Refresh Schedule Button */}
                  <button
                    onClick={handleRefreshSchedule}
                    disabled={isRefreshingSchedule}
                    className="relative px-6 rounded-2xl bg-[#F06C22] border-2 border-[#F06C22] hover:bg-[#F06C22]/90 hover:border-[#F06C22] text-white disabled:opacity-55 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(240,108,34,0.35)] font-black uppercase tracking-widest text-[11px] sm:text-[12px] h-16 xl:h-20 w-fit cursor-pointer select-none"
                  >
                    <RefreshCw
                      className={cn(
                        "w-4 h-4",
                        isRefreshingSchedule && "animate-spin",
                      )}
                    />
                    {isRefreshingSchedule ? "Syncing..." : "Refresh Schedule"}
                  </button>
                </div>
              </div>
            </section>

            {/* Main Training Grid */}
            <section className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-[32px] overflow-hidden shadow-none relative">
              <div className="overflow-x-auto flex-grow relative">
                <div className="min-w-full relative">
                  {currentTimePos !== null && (
                    <div
                      className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-cyan-500 via-orange-500 to-transparent z-20 pointer-events-none"
                      style={{
                        top: `calc(64px + (100% - 64px) * ${currentTimePos} / 100)`,
                      }}
                    >
                      <div className="absolute left-0 -top-2.5 bg-orange-500 text-white text-[11px] font-black uppercase px-2 py-0.5 rounded-r-full shadow-sm flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                        NOW
                      </div>
                    </div>
                  )}
                  <table className="w-full border-collapse table-fixed h-full bg-white dark:bg-slate-950">
                    <thead className="relative z-30">
                      <tr className="bg-slate-50 dark:bg-bg-dark border-b-2 border-slate-300 dark:border-slate-700 h-[84px] sm:h-[100px]">
                        <th className="p-1 sm:p-2 border-r-2 border-slate-300 dark:border-slate-700 w-16 min-w-[4rem] max-w-[4rem] sticky left-0 bg-slate-50 dark:bg-bg-dark z-40"></th>
                        {visibleTrainersList.length === 0 && (
                          <th className="w-full bg-slate-50 dark:bg-bg-dark"></th>
                        )}
                        {visibleTrainersList.map((trainer) => {
                          const sessionCount = todaysSchedules.filter(
                            (s) =>
                              s.trainerName === trainer.fullName &&
                              !s.clientName
                                ?.toLowerCase()
                                .includes("unavailab"),
                          ).length;
                          return (
                            <th
                              key={trainer.id}
                              className="p-2 sm:p-3 border-r-2 border-slate-300 dark:border-slate-700 last:border-r-0 text-center sticky top-0 bg-slate-50 dark:bg-bg-dark shadow-sm w-1/5 min-w-[70px]"
                            >
                              <div className="flex flex-col items-center justify-center gap-1 sm:gap-2 pt-1">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-bg-dark dark:bg-cyan border-2 border-white dark:border-slate-800 shadow-lg flex items-center justify-center">
                                  <span className="text-[12px] sm:text-[14px] font-black text-white dark:text-slate-900 uppercase tracking-widest">
                                    {trainer.fullName.substring(0, 2)}
                                  </span>
                                </div>
                                <span className="text-[11px] sm:text-[13px] font-black uppercase tracking-widest text-slate-900 dark:text-white leading-none whitespace-nowrap overflow-hidden text-ellipsis w-11/12">
                                  {trainer.fullName.split(" ")[0]}
                                </span>
                                <div className="bg-slate-200/50 dark:bg-surface-1 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded flex items-center gap-1 leading-none mt-0.5">
                                  <span className="text-[11px] sm:text-[11px] font-bold tracking-widest whitespace-nowrap uppercase">
                                    {sessionCount} Sess.
                                  </span>
                                </div>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="relative">
                      {(() => {
                        const skippedGridCells = new Set<string>();
                        return currentSlots.map((slot, sIdx) => {
                          return (
                            <tr
                              key={slot}
                              className="border-b-2 border-slate-300 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-surface-1/[0.05] transition-colors group relative h-[72px]"
                            >
                              <td className="p-1 sm:p-2 w-16 min-w-[4rem] max-w-[4rem] text-center border-r-2 border-slate-300 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-surface-1 z-10 relative box-border shadow-[2px_0_10px_rgba(0,0,0,0.05)]">
                                <div className="flex flex-col items-center justify-center">
                                  <span className="text-[12px] sm:text-[14px] font-black tracking-widest text-[#0A2E46] dark:text-white uppercase leading-none">
                                    {slot
                                      .replace(" AM", "")
                                      .replace(" PM", "")
                                      .replace(":00", "")
                                      .replace(":30", ":30")}
                                  </span>
                                  <span className="text-[11px] font-bold text-[#F06C22] uppercase tracking-widest">
                                    {slot.includes("AM") ? "AM" : "PM"}
                                  </span>
                                </div>
                              </td>
                              {visibleTrainersList.length === 0 && (
                                <td className="w-full bg-slate-50 dark:bg-bg-dark border-r-2 border-slate-300 dark:border-slate-700 p-2 text-center text-slate-400 font-bold tracking-widest uppercase text-xs">
                                  No Trainers Displayed
                                </td>
                              )}
                              {visibleTrainersList.map((trainer, tIdx) => {
                                const cellId = `${trainer.id}-${slot}`;
                                if (skippedGridCells.has(cellId)) return null;

                                const session = todaysSchedules.find((s) => {
                                  const sDate = safeToDate(s.startTime);
                                  if (!sDate) return false;
                                  const tStr = get12HourStr(sDate);
                                  return (
                                    tStr === slot &&
                                    s.trainerName === trainer.fullName &&
                                    s.status !== "Cancelled"
                                  );
                                });

                                let rowSpan = 1;
                                if (session) {
                                  const start = safeToDate(session.startTime);
                                  const end = safeToDate(session.endTime);
                                  if (start && end) {
                                    const duration =
                                      (end.getTime() - start.getTime()) /
                                      (1000 * 60);
                                    rowSpan = Math.max(
                                      1,
                                      Math.round(duration / 30),
                                    );
                                    if (rowSpan > 1) {
                                      for (let i = 1; i < rowSpan; i++) {
                                        if (currentSlots[sIdx + i]) {
                                          skippedGridCells.add(
                                            `${trainer.id}-${currentSlots[sIdx + i]}`,
                                          );
                                        }
                                      }
                                    }
                                  }
                                }

                                const color =
                                  TRAINER_COLORS[tIdx % TRAINER_COLORS.length];
                                const clientObj = session
                                  ? findClientForSession(session)
                                  : null;
                                const workoutSession = clientObj
                                  ? sessions.find(
                                      (s) =>
                                        s.clientId === clientObj.id &&
                                        new Date(
                                          s.createdAt?.toDate?.() || s.date,
                                        ).toDateString() ===
                                          new Date().toDateString(),
                                    )
                                  : null;
                                const isInSession =
                                  workoutSession?.status === "In-Progress";
                                const isCompleted =
                                  session &&
                                  !isInSession &&
                                  (session.status === "Completed" ||
                                    getMillis(session.startTime) <
                                      now.getTime());
                                const isUnavailable = session?.clientName
                                  ?.toLowerCase()
                                  .includes("unavailab");
                                const isAlreadyCompleted =
                                  workoutSession?.status === "Completed";
                                const sessionNumber = clientObj
                                  ? (clientObj.sessionCount || 0) +
                                    (isAlreadyCompleted ? 0 : 1)
                                  : 1;
                                const isMilestone =
                                  sessionNumber === 1 ||
                                  sessionNumber % 25 === 0;
                                const hasAlert =
                                  clientObj &&
                                  ((clientObj.clinicalProfile &&
                                    clientObj.clinicalProfile.length > 0) ||
                                    !!clientObj.clinicalNotes ||
                                    !!clientObj.medicalHistory);

                                const formatClientName = (name: string) => {
                                  if (!name) return "";
                                  const parts = name.trim().split(" ");
                                  if (parts.length > 1) {
                                    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
                                  }
                                  return parts[0];
                                };
                                const formattedClientName = formatClientName(
                                  session?.clientName || "",
                                );

                                return (
                                  <td
                                    key={cellId}
                                    rowSpan={rowSpan}
                                    className={cn(
                                      "p-1 sm:p-1.5 border-r border-slate-300 dark:border-slate-700 last:border-r-0 align-top",
                                      rowSpan > 1 ? "" : "h-[72px]",
                                    )}
                                  >
                                    {session ? (
                                      <div
                                        onClick={() => {
                                          if (isUnavailable) return;
                                          if (clientObj) {
                                            onSelectClient(clientObj.id!);
                                            setView("profile");
                                          } else {
                                            setLinkingSession(session);
                                            setIsLinking(true);
                                          }
                                        }}
                                        className={cn(
                                          "flex flex-col p-2 sm:p-2.5 rounded-xl shadow-sm transition-all h-full box-border relative overflow-hidden",
                                          isUnavailable
                                            ? "bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_10px,#f1f5f9_10px,#f1f5f9_20px)] dark:bg-[repeating-linear-gradient(45deg,#0f172a,#0f172a_10px,#1e293b_10px,#1e293b_20px)] border-2 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-90"
                                            : isCompleted
                                              ? "opacity-60 grayscale bg-slate-50 dark:bg-surface-2 border-2 border-slate-200 dark:border-slate-700/80 cursor-pointer"
                                              : isInSession
                                                ? isMilestone
                                                  ? "bg-[#F06C22] border-2 border-[#F06C22] shadow-[0_0_15px_rgba(240,108,34,0.65)] cursor-pointer hover:shadow-[0_0_20px_rgba(240,108,34,0.8)] text-white"
                                                  : "bg-cyan border-2 border-cyan shadow-[0_0_12px_rgba(56,189,248,0.5)] cursor-pointer hover:shadow-[0_0_16px_rgba(56,189,248,0.7)] text-slate-950"
                                                : isMilestone
                                                  ? "bg-white dark:bg-surface-1 border-2 border-[#F06C22]/85 shadow-[0_0_10px_rgba(240,108,34,0.4)] dark:shadow-[0_0_12px_rgba(240,108,34,0.55)] cursor-pointer hover:border-[#F06C22] hover:shadow-[0_0_16px_rgba(240,108,34,0.7)]"
                                                  : "bg-white dark:bg-surface-1 border-2 border-cyan/85 shadow-[0_0_8px_rgba(56,189,248,0.3)] dark:shadow-[0_0_10px_rgba(56,189,248,0.45)] cursor-pointer hover:border-cyan hover:shadow-[0_0_14px_rgba(56,189,248,0.6)]",
                                          hasAlert &&
                                            !isCompleted &&
                                            !isUnavailable
                                            ? "border-l-4 border-l-red-500"
                                            : "",
                                        )}
                                      >
                                        <div className="flex flex-col w-full h-full justify-between items-start gap-1 relative z-10">
                                          <div className="w-full">
                                            <div className="flex items-start justify-between gap-1 mb-0.5 relative z-20">
                                              <span
                                                className={cn(
                                                  "leading-tight truncate",
                                                  "text-sm font-bold",
                                                  isUnavailable
                                                    ? "text-slate-500 italic uppercase tracking-widest text-[11px]"
                                                    : isInSession
                                                      ? isMilestone
                                                        ? "text-white font-black"
                                                        : "text-slate-950 font-black"
                                                      : "text-slate-900 dark:text-slate-50",
                                                )}
                                              >
                                                {isUnavailable
                                                  ? "Unavailable"
                                                  : formattedClientName}
                                              </span>
                                              {hasAlert &&
                                                !isCompleted &&
                                                !isUnavailable && (
                                                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-[pulse_2s_ease-in-out_infinite] shrink-0 mt-1.5" />
                                                )}
                                            </div>
                                          </div>

                                          {!isUnavailable && (
                                            <div className="w-full flex items-end justify-end mt-auto pt-1 relative z-20">
                                              <span
                                                className={cn(
                                                  "inline-flex items-center text-[11px] sm:text-[12px] font-black leading-none px-1.5 py-0.5 rounded-md border",
                                                  isCompleted
                                                    ? "text-slate-500/50 border-slate-200/50 bg-slate-100/50 dark:bg-surface-2"
                                                    : isInSession
                                                      ? isMilestone
                                                        ? "text-white bg-white/20 border-white/30 font-mono shadow-[0_0_5px_rgba(255,255,255,0.25)]"
                                                        : "text-slate-950 bg-black/10 border-black/20 font-mono"
                                                      : isMilestone
                                                        ? "text-[#F06C22] bg-[#F06C22]/10 border-[#F06C22]/30 shadow-[0_0_5px_rgba(240,108,34,0.15)] font-mono"
                                                        : "text-cyan bg-cyan/10 border-cyan/20",
                                                )}
                                              >
                                                {sessionNumber}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="h-full w-full opacity-0 hover:opacity-[0.03] transition-opacity flex items-center justify-center p-2 bg-bg-dark rounded-lg pointer-events-none">
                                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-900 dark:text-white">
                                          Open
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Quick Stats Trackers */}
            <section className="space-y-6 pt-10 border-t border-slate-200 dark:border-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                    <Activity className="w-5 h-5 text-orange-500" />
                  </div>
                  <h3 className="text-[17px] font-black uppercase tracking-[0.1em] text-slate-900 dark:text-white">
                    Studio Overview
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-950 rounded-[2rem] border border-slate-200 dark:border-slate-800/80 p-6 flex flex-col justify-between shadow-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20 text-sky-500">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <span className="text-[13px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 leading-tight">Pre-Booked<br/>Sessions</span>
                  </div>
                  <div className="text-4xl font-black text-slate-900 dark:text-white tracking-widest">
                    --
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-950 rounded-[2rem] border border-slate-200 dark:border-slate-800/80 p-6 flex flex-col justify-between shadow-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-500">
                      <Users className="w-5 h-5" />
                    </div>
                    <span className="text-[13px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 leading-tight">Active<br/>Clients</span>
                  </div>
                  <div className="text-4xl font-black text-slate-900 dark:text-white tracking-widest">
                    --
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-950 rounded-[2rem] border border-slate-200 dark:border-slate-800/80 p-6 flex flex-col justify-between shadow-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-500">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <span className="text-[13px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 leading-tight">Sessions Completed<br/>This Week</span>
                  </div>
                  <div className="text-4xl font-black text-slate-900 dark:text-white tracking-widest">
                    --
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950 p-6">
            <div className="flex items-center gap-3 mb-8">
              {isSearchingDb ? (
                <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
              ) : (
                <Search className="w-6 h-6 text-sky-500" />
              )}
              <h3 className="text-xl font-black uppercase tracking-widest text-slate-900 dark:text-white">
                Client Directory{" "}
                <span className="text-slate-500 dark:text-slate-400 ml-2">
                  ({mergedSearchClients.length})
                </span>
              </h3>
            </div>
            <div className="space-y-4 max-w-5xl">
              {mergedSearchClients.map((client) => {
                const { next, last } = getClientSessions(client);
                const clientName = `${client.firstName} ${client.lastName}`;

                return (
                  <motion.div
                    key={client.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <Card className="group hover:border-primary/50 transition-all cursor-pointer overflow-hidden rounded-3xl">
                      <CardContent className="p-0">
                        <div className="flex flex-col lg:flex-row p-6 gap-6">
                          <div
                            className="flex flex-col gap-2 cursor-pointer grow min-w-[200px]"
                            onClick={() => {
                              onSelectClient(client.id!);
                              setView("profile");
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <h3 className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                                {clientName}
                              </h3>
                              {client.isActive ? (
                                <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-none font-black text-[11px] uppercase">
                                  Active
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="font-black text-[11px] uppercase"
                                >
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-4 text-[11px] font-bold text-muted-foreground uppercase">
                              <span>{client.height}</span>
                              <span>•</span>
                              <span>{client.weight || "--"} LBS</span>
                              <span>•</span>
                              <span className="text-primary">
                                {client.remainingSessions} SESSIONS
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 grow-[2]">
                            {/* Last Session Info */}
                            <div className="bg-white dark:bg-bg-dark p-4 rounded-2xl border border-border/50 flex flex-col justify-between">
                              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                                Previous Session
                              </p>
                              {last ? (
                                <div className="space-y-1">
                                  <p className="text-sm font-black">
                                    {new Date(last.date).toLocaleDateString(
                                      [],
                                      {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      },
                                    )}
                                  </p>
                                  <p className="text-[11px] font-bold text-muted-foreground uppercase italic">
                                    TR: {last.trainerInitials}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs font-bold text-muted-foreground/30 uppercase italic">
                                  No history
                                </p>
                              )}
                            </div>

                            {/* Next Session Info */}
                            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex flex-col justify-between">
                              <p className="text-[11px] font-black uppercase tracking-widest text-primary mb-1">
                                Next Scheduled
                              </p>
                              {next ? (
                                <div className="space-y-1">
                                  <p className="text-sm font-black text-primary">
                                    {safeToDate(
                                      next.startTime,
                                    )?.toLocaleDateString([], {
                                      month: "short",
                                      day: "numeric",
                                    })}{" "}
                                    @{" "}
                                    {safeToDate(
                                      next.startTime,
                                    )?.toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                  <p className="text-[11px] font-black text-primary/70 uppercase italic">
                                    TR: {next.trainerName}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs font-bold text-muted-foreground/30 uppercase italic">
                                  Not scheduled
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              className="h-20 w-20 rounded-2xl font-black flex flex-col gap-1 border-2 shadow-sm dark:shadow-none uppercase group-hover:border-primary/20"
                              onClick={() => {
                                setSelectedSessionId(null);
                                onSelectClient(client.id!);
                                setView("history");
                              }}
                            >
                              <History className="w-6 h-6" />
                              <span className="text-[11px]">History</span>
                            </Button>
                            <Button
                              className="h-20 w-20 rounded-2xl font-black flex flex-col gap-1 shadow-lg shadow-primary/20 uppercase"
                              onClick={() => {
                                onSelectClient(client.id!);
                                setView("workouts");
                              }}
                            >
                              <Play className="w-6 h-6 fill-current" />
                              <span className="text-[11px]">Start</span>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
              {mergedSearchClients.length === 0 && !isSearchingDb && (
                <div className="py-20 text-center border-2 border-dashed rounded-3xl bg-muted/10 opacity-50">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-xs font-black uppercase">
                    No client matches "{searchTerm}"
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Link Client Dialog */}
      <Dialog open={isLinking} onOpenChange={setIsLinking}>
        <DialogContent className="rounded-[32px] border-2 max-w-md bg-background shadow-2xl dark:shadow-none">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-amber-500" />
            </div>
            <DialogTitle className="text-xl font-black">
              Link Schedule Profile
            </DialogTitle>
            <DialogDescription className="font-medium">
              The external schedule found "{linkingSession?.clientName}", but no
              matching profile exists in the app.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Recommended
              </Label>
              <Button
                className="w-full h-14 rounded-2xl font-black justify-between px-6 bg-primary/10 text-primary hover:bg-primary/20 border-none"
                onClick={() => {
                  const names = (linkingSession?.clientName || "").split(" ");
                  setFormData({
                    ...formData,
                    firstName: names[0] || "",
                    lastName: names.slice(1).join(" ") || "",
                    mindbody_name: linkingSession?.clientName || "",
                  });
                  if (onStartNewClientOnboarding) {
                    onStartNewClientOnboarding(
                      linkingSession?.clientName || "",
                    );
                  }
                  setIsLinking(false);
                }}
              >
                Create Hub Profile for "{linkingSession?.clientName}"
                <Plus className="w-5 h-5" />
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground font-bold">
                  Or Link to Existing
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="relative">
                {isSearchingDbLink ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-500 animate-spin" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                )}
                <Input
                  placeholder="Search existing clients..."
                  className="pl-10 h-12 rounded-xl border-2"
                  value={searchTermLink}
                  onChange={(e) => setSearchTermLink(e.target.value)}
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                {(() => {
                  const filteredLocal = clients.filter((c) =>
                    `${c.firstName} ${c.lastName}`
                      .toLowerCase()
                      .includes(searchTermLink.toLowerCase()),
                  );
                  const mergedLink = Array.from(
                    new Map(
                      [...filteredLocal, ...dbSearchResultsLink].map((c) => [
                        c.id,
                        c,
                      ]),
                    ).values(),
                  );

                  return mergedLink.map((client) => (
                    <Button
                      key={client.id}
                      variant="ghost"
                      className="w-full h-10 rounded-lg justify-start font-bold text-xs hover:bg-primary/5 hover:text-primary transition-all border border-transparent hover:border-primary/10"
                      onClick={async () => {
                        try {
                          await updateDoc(doc(db, "clients", client.id!), {
                            mindbody_name: linkingSession.clientName,
                          });
                          // Also immediately link the current schedule in Firestore
                          await updateDoc(
                            doc(db, "schedules", linkingSession.id),
                            {
                              clientId: client.id!,
                            },
                          );
                          setIsLinking(false);
                          setSearchTermLink("");
                        } catch (err) {
                          console.error("Link failed:", err);
                        }
                      }}
                    >
                      {client.firstName} {client.lastName}
                    </Button>
                  ));
                })()}
                {clients.length > 0 &&
                  clients.filter((c) =>
                    `${c.firstName} ${c.lastName}`
                      .toLowerCase()
                      .includes(searchTermLink.toLowerCase()),
                  ).length === 0 &&
                  dbSearchResultsLink.length === 0 &&
                  !isSearchingDbLink && (
                    <p className="text-[11px] text-center py-4 text-muted-foreground italic font-medium">
                      No clients match your search
                    </p>
                  )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function ClientHistoryView({
  clientId,
  clients,
  machines,
  trainers,
  setView,
  selectedSessionId,
  user,
}: {
  clientId: string | null;
  clients: Client[];
  machines: Machine[];
  trainers: Trainer[];
  setView: (v: View) => void;
  selectedSessionId?: string | null;
  user: any;
}) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [logs, setLogs] = useState<Record<string, ExerciseLog>>({});
  const [sessionNotes, setSessionNotes] = useState<
    Record<string, SessionNote[]>
  >({});
  const [currentNotesSession, setCurrentNotesSession] =
    useState<WorkoutSession | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(
    null,
  );
  const client = clients.find((c) => c.id === clientId);
  const [trainerStats, setTrainerStats] = useState<Record<string, number>>({});
  const [trainerFilter, setTrainerFilter] = useState<string | null>(null);

  const [historyLimit, setHistoryLimit] = useState(12);
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    if (!clientId || !user) return;

    const fetchData = async () => {
      try {
        // Fetch Routines for filtering
        const routinesQuery = query(
          collection(db, "routines"),
          where("clientId", "==", clientId),
        );
        const routineSnap = await getDocs(routinesQuery);
        setRoutines(
          routineSnap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Routine,
          ),
        );

        const sessionsQuery = query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          orderBy("createdAt", "desc"),
          limit(historyLimit),
        );
        const sessionSnap = await getDocs(sessionsQuery);
        const sessionsData = sessionSnap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
        );
        setAllSessions(sessionsData);

        // Fetch Session Notes for client
        const notesQuery = query(
          collection(db, "sessionNotes"),
          where("clientId", "==", clientId),
          orderBy("createdAt", "desc"),
        );
        const notesSnap = await getDocs(notesQuery);
        const notesMap: Record<string, SessionNote[]> = {};
        notesSnap.docs.forEach((doc) => {
          const note = { id: doc.id, ...doc.data() } as SessionNote;
          if (!notesMap[note.sessionId]) notesMap[note.sessionId] = [];
          notesMap[note.sessionId].push(note);
        });
        setSessionNotes(notesMap);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "multiple");
      }
    };

    fetchData().catch((err) =>
      console.error("Unhandled rejection in fetchData:", err),
    );
  }, [clientId, historyLimit]);

  useEffect(() => {
    // Calculate trainer stats
    const stats: Record<string, number> = {};
    allSessions.forEach((s) => {
      stats[s.trainerInitials] = (stats[s.trainerInitials] || 0) + 1;
    });
    setTrainerStats(stats);

    // Show more sessions for the grid view (12 by default if possible)
    let displayData = allSessions;
    if (selectedSessionId) {
      const targetIndex = allSessions.findIndex(
        (s) => s.id === selectedSessionId,
      );
      if (targetIndex !== -1) {
        let start = Math.max(0, targetIndex - 5);
        let end = Math.min(allSessions.length, start + 12);
        if (end - start < 12) start = Math.max(0, end - 12);
        displayData = allSessions.slice(start, end);
      } else {
        displayData = allSessions.slice(0, 12);
      }
    } else {
      displayData = allSessions.slice(0, 12);
    }

    setSessions(displayData.reverse());
  }, [allSessions, selectedSessionId]);

  const sessionIdsStr = sessions
    .map((s) => s.id)
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    if (!sessionIdsStr) return;

    const fetchLogs = async () => {
      try {
        const sessionIds = sessionIdsStr.split(",").filter(Boolean);
        if (sessionIds.length === 0) return;
        const logsQuery = query(
          collection(db, "exerciseLogs"),
          where("sessionId", "in", sessionIds),
        );

        const snapshot = await getDocs(logsQuery);
        const logsData: Record<string, ExerciseLog> = {};
        snapshot.docs.forEach((doc) => {
          const log = { id: doc.id, ...doc.data() } as ExerciseLog;
          logsData[`${log.sessionId}_${log.machineId}`] = log;
        });
        setLogs((prev) => ({ ...prev, ...logsData }));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "exerciseLogs");
      }
    };

    fetchLogs().catch((err) =>
      console.error("Unhandled rejection in fetchLogs:", err),
    );
  }, [sessionIdsStr]);

  const updateSessionNote = async (sessionId: string, currentNote: string) => {
    // Deprecated in favor of SessionNotesDetailDialog
  };

  const filteredSessions = trainerFilter
    ? sessions.filter((s) => s.trainerInitials === trainerFilter)
    : sessions;

  const displaySessions = filteredSessions.slice(-12); // Show up to 12 sessions in the grid

  const visibleMachines = selectedRoutineId
    ? machines.filter((m) =>
        routines
          .find((r) => r.id === selectedRoutineId)
          ?.machineIds.includes(m.id!),
      )
    : machines.sort((a, b) => a.order - b.order);

  const [isGeneratingMock, setIsGeneratingMock] = useState(false);

  const generateMockHistory = async () => {
    if (!clientId || isGeneratingMock) return;
    setIsGeneratingMock(true);
    try {
      const routineAIds = [
        "m-hip-add",
        "m-hip-abd",
        "m-leg-press",
        "m-compound-row",
        "m-dip",
        "m-lumbar",
        "m-torso-rotation",
      ];
      const trainerInitials = "MD";

      for (let i = 1; i <= 8; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (8 - i) * 3); // Every 3 days backwards
        const dateStr = date.toISOString().split("T")[0];

        const sessionRef = await addDoc(collection(db, "sessions"), {
          clientId,
          sessionNumber: i,
          date: dateStr,
          trainerInitials,
          status: "Completed",
          sessionType: "Standard",
          createdAt: Timestamp.fromDate(date),
          endTime: Timestamp.fromDate(
            new Date(date.getTime() + 20 * 60 * 1000),
          ),
        });

        for (const mId of routineAIds) {
          const baseWeight = 80 + Math.floor(Math.random() * 40);
          const weight = baseWeight + i * 2; // Linear progression
          await addDoc(collection(db, "exerciseLogs"), {
            sessionId: sessionRef.id,
            clientId,
            machineId: mId,
            weight: weight.toString(),
            reps: (8 + Math.floor(Math.random() * 4)).toString(),
            repQuality: 2,
            createdAt: Timestamp.fromDate(date),
              studioId: (clients.find(c => c.id === clientId)?.homeStudioId) || ''
        });
        }
      }
      alert("Mock history generated successfully. Reloading...");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Failed to generate mock history.");
    } finally {
      setIsGeneratingMock(false);
    }
  };

  if (!client) return <div className="p-20 text-center">Client not found.</div>;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-4 h-[calc(100vh-160px)] overflow-hidden"
    >
      <div className="flex items-center justify-between bg-white dark:bg-surface-1 p-4 border rounded-2xl shadow-sm dark:shadow-none shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView("clients")}
            className="rounded-xl"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-black">
              {client.firstName} {client.lastName}
            </h2>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Session History & Trends
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-[11px] font-black uppercase text-amber-500 border-amber-500/20 hover:bg-amber-500/10"
            onClick={generateMockHistory}
            disabled={isGeneratingMock}
          >
            {isGeneratingMock ? "Generating..." : "Generate Mock Data"}
          </Button>
          <Badge className="bg-primary/10 text-primary border-none px-4 py-1 rounded-full font-black">
            {sessions.length} Sessions Tracked
          </Badge>
        </div>
      </div>

      {/* Trainer Stats & Client Info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
        <Card className="md:col-span-2 rounded-2xl border-2 border-primary/5">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              Client Vitals
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase">
                Height/Weight
              </p>
              <p className="text-xs font-black">
                {client.height} / {client.weight || "--"} lbs
              </p>
              {client.occupation && (
                <p className="text-[11px] font-bold text-primary/70 uppercase">
                  Job: {client.occupation}
                </p>
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase">
                Phone
              </p>
              <p className="text-xs font-black">{client.phone || "--"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase">
                Emergency
              </p>
              <p className="text-xs font-black truncate">
                {client.emergencyContactName || "--"}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase">
                Injuries/History
              </p>
              <p className="text-xs font-black truncate">
                {client.medicalHistory || "None"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-2 border-primary/5">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              Routine Filter
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={selectedRoutineId === null ? "default" : "outline"}
                size="sm"
                className="h-6 px-2 text-[11px] font-black uppercase rounded-md"
                onClick={() => setSelectedRoutineId(null)}
              >
                View All
              </Button>
              {routines.map((r) => (
                <Button
                  key={r.id}
                  variant={selectedRoutineId === r.id ? "default" : "outline"}
                  size="sm"
                  className="h-6 px-2 text-[11px] font-black uppercase rounded-md"
                  onClick={() =>
                    setSelectedRoutineId(
                      selectedRoutineId === r.id ? null : r.id!,
                    )
                  }
                >
                  {r.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-2 border-primary/5">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              Top Trainers
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-1">
              <Button
                variant={trainerFilter === null ? "default" : "outline"}
                size="sm"
                className="h-6 px-2 text-[11px] font-black uppercase rounded-md"
                onClick={() => setTrainerFilter(null)}
              >
                All
              </Button>
              {Object.entries(trainerStats)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([initials, count]) => (
                  <Button
                    key={initials}
                    variant={trainerFilter === initials ? "default" : "outline"}
                    size="sm"
                    className="h-6 px-1.5 text-[11px] font-black uppercase rounded-md flex gap-1"
                    onClick={() =>
                      setTrainerFilter(
                        trainerFilter === initials ? null : initials,
                      )
                    }
                  >
                    <span>{initials}</span>
                    <Badge
                      variant="secondary"
                      className={`text-[7px] h-3 px-1 font-black border-none ${trainerFilter === initials ? "bg-white/20 text-slate-900 dark:text-white" : "bg-primary/10 text-primary"}`}
                    >
                      {count}
                    </Badge>
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 overflow-hidden border rounded-xl bg-white dark:bg-surface-1 shadow-lg flex flex-col">
        <div className="overflow-auto flex-1 h-full scrollbar-thin scrollbar-thumb-muted-foreground/20">
          <table className="w-full border-collapse border-separate border-spacing-0 table-fixed">
            <thead className="sticky top-0 z-30">
              <tr>
                <th className="p-1 px-3 text-left font-black uppercase tracking-tighter border-b border-r min-w-[120px] w-[120px] bg-muted/90 backdrop-blur-md sticky left-0 z-40 text-[11px] shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                  Exercise
                </th>
                {displaySessions.map((s) => {
                  const absoluteIdx = filteredSessions.findIndex(
                    (fs) => fs.id === s.id,
                  );
                  const sNum = s.sessionNumber || absoluteIdx + 1;
                  return (
                    <th
                      key={s.id}
                      className={`p-1.5 text-center border-b border-r min-w-[70px] w-[70px] transition-all bg-white dark:bg-bg-dark backdrop-blur-sm ${s.id === selectedSessionId ? "bg-primary/10 ring-1 ring-inset ring-primary" : ""}`}
                    >
                      <div className="flex flex-col items-center space-y-1">
                        <div className="bg-primary/10 border border-primary/20 rounded-md px-1.5 py-0.5 shadow-sm dark:shadow-none">
                          <span className="text-primary font-black tabular-nums text-[11px] leading-none">
                            {sNum.toString().padStart(2, "0")}
                          </span>
                        </div>
                        <span className="text-[7px] text-muted-foreground font-black uppercase tracking-widest">
                          {new Date(
                            parseSessionDate(s.date),
                          ).toLocaleDateString("en-US", {
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="p-1 text-center font-black uppercase text-[11px] border-b bg-white dark:bg-bg-dark sticky right-0 z-20 min-w-[50px] w-[50px]">
                  +/-
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleMachines.map((machine, mIdx) => {
                const machineLogs = displaySessions.map(
                  (s) => logs[`${s.id}_${machine.id}`],
                );
                const rowColor =
                  mIdx % 2 === 0 ? "bg-white dark:bg-surface-1" : "bg-muted/5";

                return (
                  <tr
                    key={machine.id}
                    className={`${rowColor} group hover:bg-primary/5 transition-colors h-14`}
                  >
                    <td
                      className={`p-1.5 px-3 border-r font-bold sticky left-0 z-20 ${rowColor} group-hover:bg-primary/5 shadow-[2px_0_5px_rgba(0,0,0,0.02)]`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[11px] uppercase font-black tracking-tight leading-none truncate">
                          {machine.name}
                        </span>
                        <div className="flex flex-wrap gap-0.5 mt-1 opacity-60">
                          {machine.settingOptions?.map((opt) => (
                            <span
                              key={opt}
                              className="text-[7px] font-bold bg-muted px-1 rounded uppercase"
                            >
                              {opt.slice(0, 4)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                    {displaySessions.map((s, idx) => {
                      const log = logs[`${s.id}_${machine.id}`];
                      const prevLog =
                        idx > 0
                          ? logs[`${displaySessions[idx - 1].id}_${machine.id}`]
                          : null;

                      const isUnusual =
                        prevLog &&
                        log &&
                        parseFloat(log.weight || "0") <
                          parseFloat(prevLog.weight || "0") * 0.85;
                      const isImprovement =
                        prevLog &&
                        log &&
                        parseFloat(log.weight || "0") >
                          parseFloat(prevLog.weight || "0");

                      return (
                        <td
                          key={s.id}
                          className={`p-1 border-r text-center align-middle relative ${isUnusual ? "bg-red-50/30" : ""}`}
                        >
                          {log ? (
                            <div className="flex flex-col gap-0.5">
                              <div
                                className={`text-[12px] font-black leading-none tracking-tighter ${isImprovement ? "text-emerald-600" : isUnusual ? "text-red-500" : "text-foreground"}`}
                              >
                                {log.weight}
                              </div>
                              <div className="text-[11px] font-bold text-muted-foreground leading-none">
                                {log.repsLeft !== undefined &&
                                log.repsRight !== undefined ? (
                                  <span className="text-[7px] font-black">
                                    {log.repsLeft}L|{log.repsRight}R
                                  </span>
                                ) : (
                                  <>
                                    {log.isStaticHold
                                      ? log.seconds || "--"
                                      : log.reps || "--"}
                                    <span className="text-[7px] ml-0.5 uppercase">
                                      {log.isStaticHold ? "s" : "r"}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="flex flex-wrap justify-center gap-0.5 mt-0.5 overflow-hidden max-h-[16px]">
                                {Object.entries(log.machineSettings || {}).map(
                                  ([key, val]) => (
                                    <span
                                      key={key}
                                      className="text-[6px] font-black px-0.5 h-2.5 flex items-center bg-primary/10 text-primary rounded-[2px] border border-primary/20"
                                    >
                                      {val}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center opacity-5">
                              <div className="w-4 h-[1px] bg-foreground rotate-45" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-1 text-center bg-muted/5 sticky right-0 z-10 border-l shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                      {(() => {
                        const validLogs = machineLogs.filter(Boolean);
                        if (validLogs.length < 2) return null;
                        const latest = validLogs[validLogs.length - 1];
                        const prev = validLogs[validLogs.length - 2];
                        const diff =
                          parseFloat(latest.weight || "0") -
                          parseFloat(prev.weight || "0");

                        if (diff > 0)
                          return (
                            <span className="text-emerald-500 text-[11px] font-black tracking-tighter leading-none">
                              +{diff}
                            </span>
                          );
                        if (diff < 0)
                          return (
                            <span className="text-red-500 text-[11px] font-black tracking-tighter leading-none">
                              {diff}
                            </span>
                          );
                        return (
                          <span className="text-muted-foreground/30 text-[7px] font-black">
                            --
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
              {/* Session Notes History Row */}
              <tr className="bg-primary/5 hover:bg-primary/10 transition-colors h-12">
                <td className="p-2 px-3 border-r font-black uppercase text-[11px] text-primary sticky left-0 z-20 bg-primary/5 group-hover:bg-primary/10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  Session Notes
                </td>
                {displaySessions.map((s) => {
                  const sessionNotesList = sessionNotes[s.id!] || [];
                  const latestNote = sessionNotesList[0];

                  return (
                    <td
                      key={s.id}
                      className="p-1 border-r text-center group/note relative cursor-pointer"
                      onClick={() => setCurrentNotesSession(s)}
                    >
                      <div className="flex flex-col items-center justify-center h-full">
                        <MessageSquare
                          className={`w-3.5 h-3.5 transition-transform group-hover/note:scale-110 ${latestNote ? "text-primary" : "text-muted-foreground/10"}`}
                        />
                        {latestNote && (
                          <div className="flex flex-col items-center mt-0.5 leading-none">
                            <span className="text-[7px] font-black text-primary uppercase">
                              {latestNote.trainerInitials}
                            </span>
                            <span className="text-[6px] text-muted-foreground line-clamp-1 max-w-[50px] font-bold italic">
                              {latestNote.content}
                            </span>
                          </div>
                        )}
                        {sessionNotesList.length > 1 && (
                          <Badge
                            variant="secondary"
                            className="absolute top-1 right-1 h-3 px-1 text-[6px] font-black bg-primary text-slate-900 dark:text-white border-white border shrink-0"
                          >
                            {sessionNotesList.length}
                          </Badge>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="bg-primary/5 sticky right-0 z-10 border-l shadow-[-2px_0_5px_rgba(0,0,0,0.02)]"></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex justify-center p-4">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-8 font-black uppercase text-[11px] tracking-widest border-2 hover:bg-primary/5 hover:text-primary transition-all"
            onClick={() => setHistoryLimit((prev) => prev + 12)}
          >
            Load Older Sessions
          </Button>
        </div>
      </div>

      {currentNotesSession && (
        <SessionNotesSidebar
          session={currentNotesSession}
          userTrainers={trainers}
          onClose={() => setCurrentNotesSession(null)}
          user={user}
        />
      )}

      {/* Summary Legend */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-bg-dark rounded-2xl shrink-0">
        <div className="flex gap-6 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Improvement</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>Unusual Drop</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3 h-3" />
            <span>Trainer Discussion</span>
          </div>
        </div>
        <div className="text-[11px] font-black text-primary animate-pulse">
          TAP NOTES TO DISCUSS PERFORMANCE
        </div>
      </div>
    </motion.div>
  );
}

function ClientSelectionDialog({
  clients,
  onSelect,
  onClose,
  open = true,
  title = "Select Client",
  description = "Choose a client to start their current training session.",
}: {
  clients: Client[];
  onSelect: (id: string) => void;
  onClose: () => void;
  open?: boolean;
  title?: string;
  description?: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = clients.filter((c) =>
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[450px] rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl font-black uppercase italic tracking-tight">
            {title}
          </DialogTitle>
          <DialogDescription className="font-bold text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Find client..."
              className="pl-10 h-11 rounded-xl bg-white dark:bg-bg-dark border-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 pb-6 pt-2 space-y-2">
          {filtered.length > 0 ? (
            filtered.map((client) => (
              <button
                key={client.id}
                onClick={() => onSelect(client.id!)}
                className="w-full text-left p-4 rounded-2xl border-2 border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all flex items-center justify-between group"
              >
                <div>
                  <p className="font-black text-lg leading-tight uppercase">
                    {client.firstName} {client.lastName}
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase opacity-60">
                    {client.height} • {client.weight || "--"} lbs
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))
          ) : (
            <div className="py-12 text-center opacity-40">
              <Users className="w-12 h-12 mx-auto mb-2" />
              <p className="text-xs font-black uppercase">No clients found</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MachineSettingsDialog({
  machine,
  client,
  currentSettings,
  onClose,
  onSave,
}: {
  machine: Machine;
  client: Client;
  currentSettings?: ClientMachineSetting;
  onClose: () => void;
  onSave: (settings: Record<string, string>, reason: string) => void;
}) {
  const [settings, setSettings] = useState<Record<string, string>>(
    currentSettings?.settings || {},
  );
  const [reason, setReason] = useState("");

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">
            Machine Settings
          </DialogTitle>
          <DialogDescription>
            Configure {machine.name} for {client.firstName} ({client.height},{" "}
            {client.gender}).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {machine.settings && (
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-primary mb-2">
                Standard Benchmarks (Reference)
              </p>
              <p className="text-xs font-bold italic leading-relaxed text-primary/80">
                {machine.settings}
              </p>
            </div>
          )}
          <div className="space-y-4">
            {machine.settingOptions?.map((option) => (
              <div key={option} className="space-y-2">
                <div className="flex justify-between items-center pr-1">
                  <Label className="text-sm font-bold">{option}</Label>
                  {machine.standardSettings?.[option] && (
                    <span
                      className="text-xs font-semibold text-slate-500 dark:text-slate-400"
                      title="Standard Setting"
                    >
                      STD: {machine.standardSettings[option]}
                    </span>
                  )}
                </div>
                <Input
                  placeholder={
                    machine.standardSettings?.[option] ||
                    `Enter ${option} setting`
                  }
                  value={settings[option] || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, [option]: e.target.value })
                  }
                  className="h-12 rounded-xl font-bold"
                />
              </div>
            ))}
            {(!machine.settingOptions ||
              machine.settingOptions.length === 0) && (
              <div className="space-y-2">
                <Label className="text-sm font-bold">General Setting</Label>
                <Input
                  placeholder="Enter setting"
                  value={settings["General"] || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, ["General"]: e.target.value })
                  }
                  className="h-12 rounded-xl font-bold"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-bold">
              Reason for Change (Optional)
            </Label>
            <Textarea
              placeholder="e.g. Better alignment, client discomfort..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-xl min-h-[80px]"
            />
          </div>

          <Button
            className="h-14 rounded-2xl font-black text-lg shadow-lg bg-action text-action-foreground hover:bg-action/90 shadow-action/20"
            onClick={() => onSave(settings, reason)}
          >
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PerformanceEntryDialog({
  machine,
  currentWeight,
  currentReps,
  currentQuality,
  pastMachineLogs,
  isStaticHold,
  side,
  isTorsoFull,
  currentRepsRight,
  onSave,
  onClose,
  machineSettings,
}: {
  machine: Machine;
  currentWeight: string;
  currentReps: string;
  currentQuality: number;
  pastMachineLogs: { log: ExerciseLog; session: WorkoutSession }[];
  isStaticHold?: boolean;
  side?: "Left" | "Right";
  isTorsoFull?: boolean;
  currentRepsRight?: string;
  onSave: (
    weight: string,
    repsOrSeconds: string,
    quality: number,
    isHold: boolean,
    side?: "Left" | "Right",
    repsRight?: string,
  ) => void;
  onClose: () => void;
  machineSettings?: ClientMachineSetting;
}) {
  const { activeStudio } = useActiveStudio();
  const prevLog = pastMachineLogs[0]?.log;
  const prevWeight = prevLog?.weight || "0";

  const initialWeight =
    parseFloat(currentWeight) > 0
      ? parseFloat(currentWeight)
      : parseFloat(prevWeight) || 0;

  const initialReps = currentReps !== "" ? parseFloat(currentReps) : "";
  const initialRepsRight =
    currentRepsRight !== undefined && currentRepsRight !== ""
      ? parseFloat(currentRepsRight)
      : "";

  const [current, setCurrent] = useState<number>(initialWeight);
  const [reps, setReps] = useState<number | string>(initialReps);
  const [repsRt, setRepsRt] = useState<number | string>(initialRepsRight);
  const [quality, setQuality] = useState<number>(currentQuality || 0);
  const [isHold, setIsHold] = useState(isStaticHold || false);

  const roundUpTo2 = (val: number) => Math.ceil(val / 2) * 2;

  const adjustCurrent = (amount: number) =>
    setCurrent(Math.max(0, roundUpTo2(current + amount)));

  const getBaseReps = (currentVal: string | number, prevValStr: string) => {
    if (typeof currentVal === "number" && currentVal > 0) return currentVal;
    if (typeof currentVal === "string" && currentVal !== "")
      return parseFloat(currentVal);
    return parseFloat(prevValStr) || 0;
  };

  const prevRepsLeftPlaceholder = isHold
    ? prevLog?.seconds || ""
    : prevLog?.reps || "";
  const prevRepsRightPlaceholder =
    (prevLog as any)?.repsRight || prevRepsLeftPlaceholder;

  const adjustReps = (amount: number) => {
    const base = getBaseReps(reps, prevRepsLeftPlaceholder);
    setReps(Math.max(0, base + amount));
  };

  const adjustRepsRt = (amount: number) => {
    const base = getBaseReps(repsRt, prevRepsRightPlaceholder);
    setRepsRt(Math.max(0, base + amount));
  };

  const prevW = parseFloat(prevWeight) || 0;
  const weightDelta = prevW > 0 ? current - prevW : 0;
  const weightDeltaPct =
    prevW > 0 ? ((weightDelta / prevW) * 100).toFixed(1) : "0.0";

  const settings = machineSettings?.settings || {};
  const hasSettings = Object.keys(settings).length > 0;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] rounded-[32px] p-0 overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-bg-dark shadow-2xl dark:shadow-none flex flex-col h-full max-h-[85vh] sm:max-h-[600px]">
        {/* Header */}
        <div className="bg-white dark:bg-bg-dark p-4 text-slate-900 dark:text-white relative overflow-hidden border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
            <Zap className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-sky-500" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-black italic uppercase tracking-tight leading-none truncate">
                {machine.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {side && (
                  <span className="text-orange-500 text-[11px] font-black uppercase tracking-widest leading-none">
                    Rotation: {side}
                  </span>
                )}
                {side && <span className="w-1 h-1 bg-slate-600 rounded-full" />}
                <p className="text-[11px] uppercase font-bold text-sky-500 tracking-widest leading-none">
                  Entry HUD
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* Settings Shorthand Bar */}
          <div className="bg-slate-50/40 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 flex items-center justify-center gap-x-5 gap-y-1.5 flex-wrap">
            {(() => {
              const stdSettings = activeStudio?.machineSettings?.[machine.id!] || machine.standardSettings || {};
              const options = machine.settingOptions || [];
              const sorted = orderMachineSettings(settings, stdSettings, options);
              return sorted.map(([key, value, originalKey], i) => (
                <div key={originalKey || i} className="flex items-center gap-1.5">
                  <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                    {key}:
                  </span>
                  <span className="text-[12px] font-black text-orange-500 italic">
                    {value}
                  </span>
                </div>
              ));
            })()}
          </div>

          {/* Smart Stepper: Weight */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-col items-center relative">
            <Label className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest text-center block mb-2">
              Weight (lbs)
            </Label>
            <div className="flex items-center justify-between w-full h-14 px-1">
              <button
                className="w-11 h-11 rounded-xl bg-slate-700/50 text-slate-500 dark:text-slate-400 font-black text-lg flex items-center justify-center active:scale-95 transition-transform border border-slate-300/30"
                onClick={() => adjustCurrent(-2)}
              >
                -2
              </button>

              <div className="flex flex-col items-center justify-center flex-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={current || ""}
                  onChange={(e) => setCurrent(parseFloat(e.target.value) || 0)}
                  className="font-black text-5xl text-slate-900 dark:text-white tracking-tighter leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0"
                />
                {prevW > 0 && (
                  <div
                    className={`mt-0.5 text-[11px] font-black uppercase px-1.5 py-0.5 rounded-md ${weightDelta > 0 ? "bg-emerald-500/20 text-emerald-400" : weightDelta < 0 ? "bg-rose-500/20 text-rose-400" : "bg-slate-700 text-slate-500 dark:text-slate-400"}`}
                  >
                    {weightDelta > 0 ? "+" : ""}
                    {weightDelta} lbs ({weightDelta > 0 ? "+" : ""}
                    {weightDeltaPct}%)
                  </div>
                )}
              </div>

              <button
                className="w-11 h-11 rounded-xl bg-orange-500 dark:bg-orange-600 text-white font-black text-lg flex items-center justify-center shadow-[0_4px_12px_rgba(240,108,34,0.3)] active:scale-95 transition-transform"
                onClick={() => adjustCurrent(2)}
              >
                +2
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Smart Stepper: Reps / Seconds */}
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-col items-center relative">
              <div className="flex items-center justify-center gap-1.5 bg-white dark:bg-bg-dark border border-slate-200 dark:border-slate-800 rounded-xl p-1 mb-2.5 w-full max-w-[180px]">
                <button
                  onClick={() => setIsHold(false)}
                  className={`flex-1 h-6 rounded-lg font-black uppercase text-[11px] tracking-widest transition-all ${!isHold ? "bg-sky-500 text-slate-900 dark:text-white" : "text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  REPS
                </button>
                <button
                  onClick={() => setIsHold(true)}
                  className={`flex-1 h-6 rounded-lg font-black uppercase text-[11px] tracking-widest transition-all ${isHold ? "bg-sky-500 text-slate-900 dark:text-white" : "text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  TSC
                </button>
              </div>

              {!isTorsoFull ? (
                <div className="flex items-center justify-between w-full h-12 px-1">
                  <button
                    className="w-10 h-10 rounded-xl bg-slate-700/50 text-slate-500 dark:text-slate-400 font-black text-lg flex items-center justify-center active:scale-95 transition-transform border border-slate-300/30 shrink-0"
                    onClick={() => adjustReps(-1)}
                  >
                    -1
                  </button>

                  <div className="flex flex-col items-center justify-center flex-1 min-w-0">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={reps || ""}
                      onChange={(e) =>
                        setReps(
                          e.target.value === ""
                            ? ""
                            : parseFloat(e.target.value) || 0,
                        )
                      }
                      placeholder={prevRepsLeftPlaceholder}
                      className="font-black text-4xl text-slate-900 dark:text-white tracking-tight leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0 placeholder:text-slate-600/50"
                    />
                  </div>

                  <button
                    className="w-10 h-10 rounded-xl bg-sky-500 text-slate-900 dark:text-white font-black text-lg flex items-center justify-center shadow-[0_4px_12px_rgba(56,189,248,0.3)] active:scale-95 transition-transform shrink-0"
                    onClick={() => adjustReps(1)}
                  >
                    +1
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4 w-full px-1">
                  <div className="flex flex-col items-center flex-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] font-black uppercase tracking-widest text-orange-500 mb-1">
                      Left ({isHold ? "SEC" : "REPS"})
                    </span>
                    <div className="flex items-center justify-between w-full h-10">
                      <button
                        onClick={() => adjustReps(-1)}
                        className="w-8 h-8 rounded-lg bg-slate-700/50 text-slate-500 dark:text-slate-400 font-black text-sm flex items-center justify-center active:scale-95 border border-slate-300/30 shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={reps || ""}
                        onChange={(e) =>
                          setReps(
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value) || 0,
                          )
                        }
                        placeholder={prevRepsLeftPlaceholder}
                        className="font-black text-2xl text-slate-900 dark:text-white tracking-tight leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0 min-w-0 placeholder:text-slate-600/50"
                      />
                      <button
                        onClick={() => adjustReps(1)}
                        className="w-8 h-8 rounded-lg bg-sky-500 text-slate-900 dark:text-white font-black text-sm flex items-center justify-center shadow-lg active:scale-95 shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-center flex-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] font-black uppercase tracking-widest text-orange-500 mb-1">
                      Right ({isHold ? "SEC" : "REPS"})
                    </span>
                    <div className="flex items-center justify-between w-full h-10">
                      <button
                        onClick={() => adjustRepsRt(-1)}
                        className="w-8 h-8 rounded-lg bg-slate-700/50 text-slate-500 dark:text-slate-400 font-black text-sm flex items-center justify-center active:scale-95 border border-slate-300/30 shrink-0"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={repsRt || ""}
                        onChange={(e) =>
                          setRepsRt(
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value) || 0,
                          )
                        }
                        placeholder={prevRepsRightPlaceholder}
                        className="font-black text-2xl text-slate-900 dark:text-white tracking-tight leading-none bg-transparent border-none text-center w-full p-0 m-0 no-arrows focus:ring-0 min-w-0 placeholder:text-slate-600/50"
                      />
                      <button
                        onClick={() => adjustRepsRt(1)}
                        className="w-8 h-8 rounded-lg bg-sky-500 text-slate-900 dark:text-white font-black text-sm flex items-center justify-center shadow-lg active:scale-95 shrink-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quality Rating */}
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-col items-center relative">
              <Label className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest text-center block mb-2.5">
                Set Quality / RPE
              </Label>
              <div className="flex items-center gap-1.5 w-full h-9">
                <button
                  onClick={() => setQuality(1)}
                  className={`flex-1 h-full rounded-xl font-black uppercase text-[11px] tracking-widest transition-all ${quality === 1 ? "bg-rose-500 text-slate-900 dark:text-white shadow-[0_4px_10px_rgba(244,63,94,0.3)]" : "bg-white border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  Poor
                </button>
                <button
                  onClick={() => setQuality(2)}
                  className={`flex-1 h-full rounded-xl font-black uppercase text-[11px] tracking-widest transition-all ${quality === 2 ? "bg-amber-500 text-slate-900 dark:text-white shadow-[0_4px_10px_rgba(245,158,11,0.3)]" : "bg-white border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  Completed
                </button>
                <button
                  onClick={() => setQuality(3)}
                  className={`flex-1 h-full rounded-xl font-black uppercase text-[11px] tracking-widest transition-all ${quality === 3 ? "bg-emerald-500 text-slate-900 dark:text-white shadow-[0_4px_10px_rgba(16,185,129,0.3)]" : "bg-white border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-500 dark:text-slate-400"}`}
                >
                  Max Strength
                </button>
              </div>
            </div>
          </div>

          {/* Trend History */}
          {pastMachineLogs.length > 0 && (
            <div className="bg-slate-50/30 border border-slate-200 dark:border-slate-800/50 dark:border-slate-800/50 rounded-xl p-2.5 flex flex-col gap-1.5">
              <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Trend History
                </span>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                  Last 3 Sets
                </span>
              </div>
              {pastMachineLogs.map((entry, idx) => {
                const isHoldLog = entry.log.isStaticHold;
                let metrics = "";
                if (
                  entry.log.repsLeft !== undefined &&
                  entry.log.repsRight !== undefined
                ) {
                  metrics = `${entry.log.repsLeft}L|${entry.log.repsRight}R`;
                } else {
                  metrics = isHoldLog
                    ? `${entry.log.seconds}s`
                    : `${entry.log.reps}R`;
                }

                const olderEntry = pastMachineLogs[idx + 1];
                let arrow = null;
                if (olderEntry && olderEntry.log.weight) {
                  const currW = parseFloat(entry.log.weight || "0");
                  const oldW = parseFloat(olderEntry.log.weight || "0");
                  if (currW > oldW) {
                    arrow = (
                      <span className="text-emerald-500 font-bold ml-1 text-[11px]">
                        ↑
                      </span>
                    );
                  } else if (currW < oldW) {
                    arrow = (
                      <span className="text-rose-500 font-bold ml-1 text-[11px]">
                        ↓
                      </span>
                    );
                  }
                }

                return (
                  <div
                    key={idx}
                    className="flex justify-between items-center text-[11px] bg-slate-50 dark:bg-slate-950 rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-800/30"
                  >
                    <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[11px]">
                      {new Date(
                        parseSessionDate(entry.session.date),
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="font-black text-slate-700 dark:text-slate-300 flex items-center tabular-nums">
                      {entry.log.weight}
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-0.5">
                        lbs
                      </span>
                      <span className="mx-1.5 text-slate-700 dark:text-slate-300">
                        |
                      </span>
                      {metrics}
                      {arrow}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fixed Footer */}
        <div className="p-4 bg-white dark:bg-bg-dark border-t border-slate-200 dark:border-slate-800 shrink-0 grid grid-cols-2 gap-3 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
          <Button
            variant="outline"
            className="h-12 rounded-xl font-black uppercase text-[11px] tracking-widest border border-slate-300 dark:border-slate-700 bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-700 hover:text-slate-900 dark:text-white dark:hover:text-slate-50 transition-all shadow-md"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="h-12 rounded-xl font-black uppercase text-[11px] tracking-widest bg-orange-500 dark:bg-orange-600 text-white hover:bg-orange-600 dark:hover:bg-orange-700 shadow-[0_4px_15px_rgba(240,108,34,0.4)] border-none active:scale-95 transition-all"
            onClick={() =>
              onSave(
                current.toString(),
                reps.toString(),
                quality,
                isHold,
                side,
                repsRt.toString(),
              )
            }
          >
            Save Set
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MachinesView({
  machines,
  clients,
  onOpenInfo,
}: {
  machines: Machine[];
  clients: Client[];
  onOpenInfo: (machine: Machine) => void;
}) {
  const [allLogs, setAllLogs] = useState<ExerciseLog[]>([]);

  useEffect(() => {
    // OPTIMIZATION: Use getDocs instead of onSnapshot for dashboard stats to save quota.
    // Fetch once on mount. Real-time updates aren't critical for global averages.
    const fetchData = async () => {
      try {
        const qLogs = query(
          collection(db, "exerciseLogs"),
          orderBy("createdAt", "desc"),
          limit(500),
        );
        const logsSnap = await getDocs(qLogs);
        setAllLogs(logsSnap.docs.map((doc) => doc.data() as ExerciseLog));
      } catch (err) {
        console.error("Dashboard data fetch failed:", err);
      }
    };
    fetchData();
  }, []);

  const calculateStats = (machineId: string) => {
    const machineLogs = allLogs.filter((log) => log.machineId === machineId);

    if (machineLogs.length === 0) return null;

    const weights = machineLogs
      .map((log) => parseFloat(log.weight || "0"))
      .filter((w) => !isNaN(w) && w > 0);
    const reps = machineLogs
      .map((log) => parseFloat(log.reps || "0"))
      .filter((r) => !isNaN(r) && r > 0);
    const seconds = machineLogs
      .map((log) => parseFloat(log.seconds || "0"))
      .filter((s) => !isNaN(s) && s > 0);

    const totalVolume = machineLogs.reduce((acc, log) => {
      return acc + calculateExerciseVolume(log);
    }, 0);

    return {
      avgWeight: weights.length
        ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length)
        : 0,
      avgReps: reps.length
        ? (reps.reduce((a, b) => a + b, 0) / reps.length).toFixed(1)
        : 0,
      maxWeight: weights.length ? Math.max(...weights) : 0,
      avgSeconds: seconds.length
        ? (seconds.reduce((a, b) => a + b, 0) / seconds.length).toFixed(1)
        : 0,
      totalVolume: Math.round(totalVolume),
      usageCount: machineLogs.length,
    };
  };

  return (
    <motion.div
      key="machines"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4 w-full max-w-full overflow-x-hidden pb-20"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight uppercase text-secondary">
            Equipment & Analytics Index
          </h2>
          <p className="text-secondary/80 text-[11px] font-medium uppercase tracking-widest">
            Global usage statistics & form guidance.
          </p>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {machines.map((machine, index) => {
          const stats = calculateStats(machine.id!);
          // Using deterministically selected robust Unsplash images for fitness equipment
          // If the machine is the Leg Press, explicitly provide a robust Leg Press URL (or fallback)
          const fallbackImgUrl = getMachineImageUrl(machine.id);

          return (
            <Card
              key={machine.id}
              className="group rounded-2xl overflow-hidden border border-border/80 hover:border-primary/50 transition-all shadow-sm dark:shadow-none bg-white dark:bg-surface-1 flex flex-col"
            >
              {/* Thumbnail Header Area */}
              <div className="relative h-32 bg-white dark:bg-bg-dark overflow-hidden">
                <img
                  src={machine.imageUrl || fallbackImgUrl}
                  alt={machine.name}
                  className="w-full h-full object-cover brightness-100 transition-all duration-700 ease-out scale-100 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    // Fallback on error so it never shows broken image
                    (e.target as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=400&q=80";
                  }}
                />
                <div className="absolute top-2 left-2 w-6 h-6 rounded-md bg-primary/90 backdrop-blur-sm text-primary-foreground flex items-center justify-center font-bold text-xs shadow-md z-10 border border-white/10">
                  {machine.order}
                </div>
              </div>

              <CardContent className="p-3 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black uppercase tracking-tight text-secondary leading-tight line-clamp-1">
                    {machine.name}
                  </h3>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500">
                    {machine.fullName || machine.id?.replace(/_/g, " ")}
                  </p>
                </div>

                {/* Global Benchmark Compact */}
                <div className="bg-white dark:bg-bg-dark rounded-lg p-2 border border-border/40">
                  <p className="text-[7px] font-bold uppercase tracking-widest text-secondary mb-1.5 opacity-60">
                    Global Benchmark
                  </p>
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-left">
                      <p className="text-[12px] font-bold text-secondary leading-none">
                        {stats?.avgWeight || "--"}{" "}
                        <span className="text-[11px] font-medium opacity-60">
                          lbs
                        </span>
                      </p>
                      <p className="text-[11px] font-medium text-secondary/60 uppercase mt-0.5">
                        Avg Wgt
                      </p>
                    </div>
                    <div className="w-[1px] h-6 bg-border" />
                    <div className="text-center">
                      <p className="text-[12px] font-bold text-secondary leading-none">
                        {stats?.avgReps || "--"}
                      </p>
                      <p className="text-[11px] font-medium text-secondary/60 uppercase mt-0.5">
                        Avg Reps
                      </p>
                    </div>
                    <div className="w-[1px] h-6 bg-border" />
                    <div className="text-right">
                      <p className="text-[12px] font-bold text-primary leading-none">
                        {stats?.maxWeight || "--"}{" "}
                        <span className="text-[11px] font-medium text-primary/60">
                          lbs
                        </span>
                      </p>
                      <p className="text-[11px] font-medium text-primary/60 uppercase mt-0.5">
                        Max
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border/40">
                    <div className="text-left">
                      <p className="text-[11px] font-bold text-secondary leading-none">
                        {!isNaN(stats?.totalVolume)
                          ? stats.totalVolume.toLocaleString()
                          : "--"}{" "}
                        <span className="text-[7px] font-medium opacity-60">
                          lbs
                        </span>
                      </p>
                      <p className="text-[7px] font-medium text-secondary/60 uppercase mt-0.5">
                        Vol
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] font-bold text-secondary leading-none">
                        {stats?.avgSeconds ? stats.avgSeconds : "--"}{" "}
                        <span className="text-[7px] font-medium opacity-60">
                          s
                        </span>
                      </p>
                      <p className="text-[7px] font-medium text-secondary/60 uppercase mt-0.5">
                        Avg Time
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-secondary leading-none">
                        {stats?.usageCount || "--"}
                      </p>
                      <p className="text-[7px] font-medium text-secondary/60 uppercase mt-0.5">
                        Uses
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full h-8 rounded-lg font-bold uppercase tracking-widest gap-1.5 bg-background border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors text-[11px] sm:text-[11px]"
                  onClick={() => onOpenInfo(machine)}
                >
                  <AlertCircle className="w-3 h-3" />
                  Info & Guidelines
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}

function ExerciseHistoryDialog({
  clientId,
  machine,
  onClose,
  user,
}: {
  clientId: string;
  machine: Machine;
  onClose: () => void;
  user: any;
}) {
  const [history, setHistory] = useState<ExerciseLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !machine.id || !clientId) return;
    const q = query(
      collection(db, "exerciseLogs"),
      where("clientId", "==", clientId),
      where("machineId", "==", machine.id),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as ExerciseLog,
        );
        setHistory(logs);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "exerciseLogs");
      },
    );

    return () => unsubscribe();
  }, [clientId, machine.id]);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] h-[80vh] flex flex-col rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl font-black uppercase italic tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />
            {machine.name} History
          </DialogTitle>
          <DialogDescription className="font-bold text-xs">
            Performance tracking from origin to present.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-20 opacity-50 space-y-2">
              <ClipboardList className="w-12 h-12 mx-auto" />
              <p className="font-bold uppercase text-xs">
                No historical data found
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((log, idx) => {
                const isOrigin = idx === history.length - 1;
                return (
                  <div
                    key={log.id}
                    className={`p-4 rounded-2xl border transition-all ${isOrigin ? "bg-primary/5 border-primary/20 ring-1 ring-primary/10" : "bg-white dark:bg-surface-1"}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-muted-foreground uppercase">
                          {safeToDate(log.createdAt)?.toLocaleDateString() ||
                            "Recent"}
                        </span>
                        {isOrigin && (
                          <Badge className="bg-primary text-slate-900 dark:text-white text-[11px] font-black rounded px-1.5 h-4 border-none uppercase">
                            Origin
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {log.isStaticHold && (
                          <Badge
                            variant="outline"
                            className="text-[11px] border-primary text-primary h-4"
                          >
                            Static
                          </Badge>
                        )}
                        {log.notes && (
                          <MessageSquare className="w-3 h-3 text-primary/40" />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-muted-foreground uppercase">
                          Weight
                        </p>
                        <p className="text-xl font-black">
                          {log.weight}{" "}
                          <span className="text-[11px] font-normal italic">
                            lbs
                          </span>
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-muted-foreground uppercase">
                          {log.isStaticHold ? "Seconds" : "Reps"}
                        </p>
                        <p
                          className={`text-xl font-black ${
                            log.repQuality === 3
                              ? "text-emerald-500"
                              : log.repQuality === 2
                                ? "text-amber-500"
                                : log.repQuality === 1
                                  ? "text-red-500"
                                  : ""
                          }`}
                        >
                          {log.isStaticHold
                            ? log.seconds || "0"
                            : log.reps || "0"}
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-muted-foreground uppercase">
                          Quality
                        </p>
                        <div
                          className={`w-fit px-2 py-0.5 rounded-full text-[11px] font-black text-slate-900 dark:text-white ${
                            log.repQuality === 3
                              ? "bg-emerald-500"
                              : log.repQuality === 2
                                ? "bg-amber-500"
                                : log.repQuality === 1
                                  ? "bg-red-500"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {log.repQuality === 3
                            ? "MAX STRENGTH"
                            : log.repQuality === 2
                              ? "COMPLETED"
                              : log.repQuality === 1
                                ? "POOR"
                                : "NONE"}
                        </div>
                      </div>
                    </div>

                    {log.notes && (
                      <div className="mt-3 text-[11px] bg-white dark:bg-bg-dark p-2 rounded-lg font-medium text-muted-foreground border-l-2 border-primary/30 italic">
                        "{log.notes}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SessionNotesSidebar({
  session,
  onClose,
  userTrainers,
  user,
}: {
  session: WorkoutSession;
  onClose: () => void;
  userTrainers: Trainer[];
  user: any;
}) {
  const [noteContent, setNoteContent] = useState("");
  const [history, setHistory] = useState<SessionNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentUser = user;
  const currentTrainer = userTrainers.find(
    (t) =>
      t.pin === localStorage.getItem("trainer_pin") ||
      t.fullName === currentUser?.displayName,
  );
  const trainerInitials = currentTrainer?.initials || "??";

  useEffect(() => {
    if (!user || !session.id) return;
    const q = query(
      collection(db, "sessionNotes"),
      where("sessionId", "==", session.id),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notes = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as SessionNote,
        );
        setHistory(notes);
        setIsLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "sessionNotes");
      },
    );

    return () => unsubscribe();
  }, [session.id]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    try {
      await addDoc(collection(db, "sessionNotes"), {
        sessionId: session.id,
        clientId: session.clientId,
        trainerId: currentTrainer?.id || currentUser?.uid,
        trainerInitials: trainerInitials,
        content: noteContent.trim(),
        createdAt: serverTimestamp(),
        studioId: session.hostedAtStudioId || session.clientHomeStudioId || currentTrainer?.primaryHomeStudioId || "",
      });
      setNoteContent("");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "sessionNotes");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-50/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-full max-w-sm bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl dark:shadow-none flex flex-col h-full"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-orange-500" /> Session
              Notes
            </h2>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">
              HUD Communication Panel
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full hover:bg-white dark:hover:bg-surface-1/10"
          >
            <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/20">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <History className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Note History
              </span>
            </div>

            {history.length > 0 ? (
              history.map((note) => (
                <div
                  key={note.id}
                  className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-white dark:bg-bg-dark flex items-center justify-center border border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] font-black text-orange-500">
                          {note.trainerInitials}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight">
                        Active Trainer
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      {safeToDate(note.createdAt)?.toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }) || "Now"}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                    {note.content}
                  </p>
                </div>
              ))
            ) : (
              <div className="py-12 text-center bg-slate-50 dark:bg-slate-950 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                <StickyNote className="w-8 h-8 text-slate-800 dark:text-slate-200 mx-auto mb-3" />
                <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                  No active communications found.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0">
          <form onSubmit={handleAddNote} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Edit3 className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Tactical Update
                </span>
              </div>
              <Textarea
                placeholder="Injury notes, performance tweaks, or mood updates..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="min-h-[120px] rounded-2xl bg-slate-50/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-700 focus:border-orange-500 shadow-inner resize-none"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
                  Authenticated:
                </span>
                <span className="text-[11px] font-bold text-orange-500">
                  {trainerInitials}
                </span>
              </div>
              <Button
                type="submit"
                className="flex-1 h-12 bg-orange-500 dark:bg-orange-600 text-white font-black uppercase tracking-[0.2em] text-[11px] rounded-xl shadow-xl shadow-orange-950/20 transition-all active:scale-95"
              >
                Save Tactical Note
              </Button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function WorkoutTrackerView({
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
  setClientFormData,
  onOpenInfo,
  authTrainer,
  trainerFocuses,
  isSyncing,
  setIsSyncing,
  schedules,
  isIntroSession,
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
  trainerFocuses: TrainerFocus[];
  isSyncing: boolean;
  setIsSyncing: (v: boolean) => void;
  isIntroSession?: boolean;
}) {
  const { activeStudioId: contextActiveStudioId, activeStudio } = useActiveStudio();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [logs, setLogs] = useState<Record<string, ExerciseLog>>({});
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [currentSession, setCurrentSession] = useState<WorkoutSession | null>(
    null,
  );
  const [activeMachineIds, setActiveMachineIds] = useState<string[]>([]);
  const [clientMachineSettings, setClientMachineSettings] = useState<
    Record<string, ClientMachineSetting>
  >({});
  const [focusRecords, setFocusRecords] = useState<FocusRecord[]>([]);
  const [sessionNotes, setSessionNotes] = useState<SessionNote[]>([]);
  const [currentSessionNotes, setCurrentSessionNotes] = useState<string>("");
  const lastMachineLoggedAt = React.useRef<number>(Date.now());
  const pauseStartTime = React.useRef<number | null>(null);
  const currentSegmentPauseDuration = React.useRef<number>(0);
  const [isEditingRoutine, setIsEditingRoutine] = useState(false);
  const [showRoutinePicker, setShowRoutinePicker] = useState(false);
  const [editingSettingsMachineId, setEditingSettingsMachineId] = useState<
    string | null
  >(null);
  const [editingWeightMachineId, setEditingWeightMachineId] = useState<
    string | null
  >(null);
  const [historyMachineId, setHistoryMachineId] = useState<string | null>(null);
  const [isSettingUpRoutine, setIsSettingUpRoutine] = useState(false);
  const [showAllMachines, setShowAllMachines] = useState(true);
  const [routineMachines, setRoutineMachines] = useState<string[]>([]);
  const [lastRoutineLogs, setLastRoutineLogs] = useState<
    Record<string, ExerciseLog>
  >({});
  const [isPreSessionMode, setIsPreSessionMode] = useState(false);
  const [isAdjustingProtocol, setIsAdjustingProtocol] = useState(false);
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [adjustmentScope, setAdjustmentScope] = useState<"once" | "permanent">(
    "once",
  );
  const [adjustedMachineIds, setAdjustedMachineIds] = useState<string[]>([]);
  const [preSessionSelectedRoutine, setPreSessionSelectedRoutine] =
    useState<RoutineType>("A");
  const [targetRoutine, setTargetRoutine] = useState<Routine | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const [machineTimeElapsed, setMachineTimeElapsed] = useState<number>(0);

  useEffect(() => {
    const takeoverSessionId = localStorage.getItem(
      "max_strength_active_session_id",
    );
    if (takeoverSessionId && !currentSession) {
      const fetchTakeoverSession = async () => {
        try {
          const sRef = doc(db, "sessions", takeoverSessionId);
          const sSnap = await getDoc(sRef);
          if (sSnap.exists()) {
            const data = { id: sSnap.id, ...sSnap.data() } as WorkoutSession;
            if (data.status === "In-Progress") {
              setCurrentSession(data);
              setSessions([data]);
              setIsPreSessionMode(false);
              setShowRoutinePicker(false);
              // Clear it so we don't keep doing this if the trainer navigates away and back manually
              localStorage.removeItem("max_strength_active_session_id");
            }
          }
        } catch (error) {
          console.error("Error fetching takeover session:", error);
        }
      };
      fetchTakeoverSession();
    }
  }, []);

  useEffect(() => {
    if (!currentSession) return;
    let didUpdate = false;

    // Check all logs for the current session to see if any are "completed" but lack timeSpent
    activeMachineIds.forEach((mId) => {
      const isTorso = mId === "torso_rotation"; // Using specific id match based on earlier logic
      if (isTorso) {
        const logL = logs[`${currentSession.id}_${mId}_Left`];
        const logR = logs[`${currentSession.id}_${mId}_Right`];

        if (
          logL?.weight &&
          (logL?.reps || logL?.seconds) &&
          logL?.repQuality &&
          !logL?.timeSpent
        ) {
          const rawTimeDiff = Math.floor(
            (Date.now() - lastMachineLoggedAt.current) / 1000,
          );
          const timeDiff = Math.max(
            0,
            Math.floor(
              (Date.now() -
                lastMachineLoggedAt.current -
                currentSegmentPauseDuration.current) /
                1000,
            ),
          );
          const isStatic =
            logL.isStaticHold ||
            logL.isTSC ||
            (logL.seconds && (!logL.reps || parseInt(logL.reps) === 0));
          const reps = parseInt(logL.reps || "0");
          const avgTime =
            !isStatic && reps > 0
              ? parseFloat((timeDiff / reps).toFixed(1))
              : undefined;

          updateLogMultiple(
            currentSession.id,
            mId,
            {
              timeSpent: rawTimeDiff.toString(),
              totalTimeUnderLoad: timeDiff,
              ...(avgTime !== undefined && { averageTimePerRep: avgTime }),
            },
            "Left",
          );
          lastMachineLoggedAt.current = Date.now();
          currentSegmentPauseDuration.current = 0;
          didUpdate = true;
        }
        if (
          logR?.weight &&
          (logR?.reps || logR?.seconds) &&
          logR?.repQuality &&
          !logR?.timeSpent
        ) {
          const rawTimeDiff = Math.floor(
            (Date.now() - lastMachineLoggedAt.current) / 1000,
          );
          const timeDiff = Math.max(
            0,
            Math.floor(
              (Date.now() -
                lastMachineLoggedAt.current -
                currentSegmentPauseDuration.current) /
                1000,
            ),
          );
          const isStatic =
            logR.isStaticHold ||
            logR.isTSC ||
            (logR.seconds && (!logR.reps || parseInt(logR.reps) === 0));
          const reps = parseInt(logR.reps || "0");
          const avgTime =
            !isStatic && reps > 0
              ? parseFloat((timeDiff / reps).toFixed(1))
              : undefined;

          updateLogMultiple(
            currentSession.id,
            mId,
            {
              timeSpent: rawTimeDiff.toString(),
              totalTimeUnderLoad: timeDiff,
              ...(avgTime !== undefined && { averageTimePerRep: avgTime }),
            },
            "Right",
          );
          lastMachineLoggedAt.current = Date.now();
          currentSegmentPauseDuration.current = 0;
          didUpdate = true;
        }
      } else {
        const log = logs[`${currentSession.id}_${mId}`];
        if (
          log?.weight &&
          (log?.reps || log?.seconds) &&
          log?.repQuality &&
          !log?.timeSpent
        ) {
          const rawTimeDiff = Math.floor(
            (Date.now() - lastMachineLoggedAt.current) / 1000,
          );
          const timeDiff = Math.max(
            0,
            Math.floor(
              (Date.now() -
                lastMachineLoggedAt.current -
                currentSegmentPauseDuration.current) /
                1000,
            ),
          );
          const isStatic =
            log.isStaticHold ||
            log.isTSC ||
            (log.seconds && (!log.reps || parseInt(log.reps) === 0));
          const reps = parseInt(log.reps || "0");
          const avgTime =
            !isStatic && reps > 0
              ? parseFloat((timeDiff / reps).toFixed(1))
              : undefined;

          updateLogMultiple(currentSession.id, mId, {
            timeSpent: rawTimeDiff.toString(),
            totalTimeUnderLoad: timeDiff,
            ...(avgTime !== undefined && { averageTimePerRep: avgTime }),
          });
          lastMachineLoggedAt.current = Date.now();
          currentSegmentPauseDuration.current = 0;
          didUpdate = true;
        }
      }
    });

    if (didUpdate) {
      // Optional: Since it auto-advances focus, we could log that time tracked.
    }
  }, [logs, currentSession, activeMachineIds]);

  useEffect(() => {
    if (!currentSession) return;
    if (isPaused) {
      if (!pauseStartTime.current) {
        pauseStartTime.current = Date.now();
      }
    } else {
      if (pauseStartTime.current) {
        currentSegmentPauseDuration.current +=
          Date.now() - pauseStartTime.current;
        pauseStartTime.current = null;
      }
    }
  }, [isPaused, currentSession]);

  useEffect(() => {
    if (!currentSession || isPaused) return;
    const interval = setInterval(() => {
      // Auto-abandon session if left open for > 60 minutes of active time to prevent infinite timers and resource consumption
      const start = currentSession.startTime?.toDate
        ? currentSession.startTime.toDate()
        : new Date(currentSession.startTime);
      const totalSessionMinutes =
        (Date.now() - start.getTime() - currentSegmentPauseDuration.current) /
        60000;
      if (totalSessionMinutes > 60) {
        if (currentSession.id) {
          deleteSession(currentSession.id);
        }
        return;
      }

      let extraPause = 0;
      if (isPaused && pauseStartTime.current) {
        extraPause = Date.now() - pauseStartTime.current;
      }
      setMachineTimeElapsed(
        Math.max(
          0,
          Math.floor(
            (Date.now() -
              lastMachineLoggedAt.current -
              currentSegmentPauseDuration.current -
              extraPause) /
              1000,
          ),
        ),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [currentSession, isPaused]);

  // Fetch all exercise logs for analysis (limited to last 1000 for performance)
  const [isShowingSessionNotes, setIsShowingSessionNotes] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const [isPostSessionMode, setIsPostSessionMode] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [pendingAssignSession, setPendingAssignSession] =
    useState<WorkoutSession | null>(null);
  const [isSessionRoutineManagerOpen, setIsSessionRoutineManagerOpen] =
    useState(false);
  const handleSaveSessionMachineIds = (newIds: string[]) => {
    setActiveMachineIds(newIds);
  };

  const handleLogTSC = async (seconds: number) => {
    if (!currentSession || activeMachineIds.length === 0) return;

    let activeFocusMachineId: string | null = null;
    for (const mId of activeMachineIds) {
      const log = logs[`${currentSession.id}_${mId}`];
      if (
        !log ||
        !log.weight ||
        (!log.reps && !log.seconds) ||
        !log.repQuality
      ) {
        activeFocusMachineId = mId;
        break;
      }
    }

    if (activeFocusMachineId) {
      await updateLog(
        currentSession.id,
        activeFocusMachineId,
        "seconds",
        seconds.toString(),
      );
      await updateLog(currentSession.id, activeFocusMachineId, "reps", "0");
      await updateLog(currentSession.id, activeFocusMachineId, "isTSC", true);
      await updateLog(
        currentSession.id,
        activeFocusMachineId,
        "isStaticHold",
        true,
      );
    }
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
      const unassignedQuery = query(
        collection(db, "sessions"),
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
        orderBy("createdAt", "desc"),
        limit(5),
      );

      const notesQuery = query(
        collection(db, "sessionNotes"),
        where("clientId", "==", clientId),
        orderBy("createdAt", "desc"),
        limit(5),
      );

      const focusQuery = query(
        collection(db, "focusRecords"),
        where("clientId", "==", clientId),
      );

      const unsubscribeSessions = onSnapshot(
        sessionsQuery,
        async (snapshot) => {
          const sessionsData = snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
          );
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
            setCurrentSession(null);
            setIsPreSessionMode(true);
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "sessions");
        },
      );

      const unsubscribeNotes = onSnapshot(
        notesQuery,
        (snapshot) => {
          const notesData = snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as SessionNote,
          );
          setSessionNotes(notesData);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "sessionNotes");
        },
      );

      const unsubscribeFocus = onSnapshot(
        focusQuery,
        (snapshot) => {
          const focusData = snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as FocusRecord,
          );
          setFocusRecords(focusData);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "focusRecords");
        },
      );

      return () => {
        unsubscribeSettings();
        unsubscribeRoutines();
        unsubscribeSessions();
        unsubscribeNotes();
        unsubscribeFocus();
      };
    }
  }, [clientId, user?.uid]);

  useEffect(() => {
    if (sessions.length > 0) {
      const sessionIds = sessions.map((s) => s.id!).filter(Boolean);
      if (sessionIds.length === 0) return;
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
      .join(","),
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

  useEffect(() => {
    if (currentSession) {
      const routine = routines.find((r) => r.id === currentSession.routineId);
      if (routine) {
        setActiveMachineIds(routine.machineIds);
        setRoutineMachines(routine.machineIds);
      } else {
        setActiveMachineIds(machines.map((m) => m.id!));
        setRoutineMachines([]);
      }
    }
  }, [currentSession, routines, machines]);

  const updateRoutineNote = async (machineId: string, note: string) => {
    if (!currentSession?.routineId) return;
    const routine = routines.find((r) => r.id === currentSession.routineId);
    if (!routine) return;

    try {
      const notes = { ...(routine.machineNotes || {}), [machineId]: note };
      await updateDoc(doc(db, "routines", routine.id!), {
        machineNotes: notes,
      });
    } catch (error) {
      console.error("Error updating routine note:", error);
    }
  };

  const moveMachine = async (machineId: string, direction: "up" | "down") => {
    if (!currentSession?.routineId) return;
    const routine = routines.find((r) => r.id === currentSession.routineId);
    if (!routine) return;

    const ids = [...routine.machineIds];
    const idx = ids.indexOf(machineId);
    if (idx === -1) return;

    if (direction === "up" && idx > 0) {
      [ids[idx], ids[idx - 1]] = [ids[idx - 1], ids[idx]];
    } else if (direction === "down" && idx < ids.length - 1) {
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    }

    try {
      await updateDoc(doc(db, "routines", routine.id!), { machineIds: ids });
    } catch (error) {
      console.error("Error moving machine:", error);
    }
  };

  const startNewSession = async (
    routineType: "A" | "B" | "Free",
    sessionType: SessionType = "Standard",
    customMachines?: string[],
    adjustmentNote?: string,
    permanentSave?: boolean,
    preSessionCheckIn?: PreSessionCheckIn
  ) => {
    if (!clientId) return;
    const nextNum = (selectedClient?.sessionCount || 0) + 1;

    // Auto-populate trainer and date
    const trainerInitials =
      authTrainer?.initials || trainers[0]?.initials || "??";
    const trainerName = authTrainer ? authTrainer.fullName : "";
    const trainerId = authTrainer?.id || "";
    const date = new Date().toISOString().split("T")[0];

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
              studioId: selectedClient?.homeStudioId || ''
        });
          routineId = newRoutineRef.id;

          if (routineType === "B") {
            await updateDoc(doc(db, "clients", clientId), {
              isRoutineBActive: true,
            });
          }
        } else {
          routineId = routine.id;
          // If permanent save requested, update existing routine
          if (permanentSave && customMachines) {
            await updateDoc(doc(db, "routines", routine.id), {
              machineIds: customMachines,
            });
          }
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

      const sessionData: any = {
        clientId,
        homeStudioId: clientHomeStudioId, // Explicit homeStudioId security stamp
        routineId: routineId || null,
        hostedAtStudioId: currentStudioId,
        clientHomeStudioId: clientHomeStudioId,
        sessionType,
        sessionNumber: nextNum,
        date,
        isCrossTrain,
        trainerInitials,
        trainerName,
        trainerId,
        startedByTrainerId: trainerId,
        lastHeartbeatAt: serverTimestamp(),
        status: "In-Progress",
        startTime: serverTimestamp(),
        createdAt: serverTimestamp(),
      };
      
      if (preSessionCheckIn) {
        sessionData.preSessionCheckIn = preSessionCheckIn;
      }

      const docRef = await addDoc(collection(db, "sessions"), sessionData);

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

      if (adjustmentNote && authTrainer) {
        await addDoc(collection(db, "sessionNotes"), {
          sessionId: docRef.id,
          clientId,
          trainerId: authTrainer.id || "",
          trainerInitials:
            authTrainer.initials ||
            authTrainer.fullName.substring(0, 2).toUpperCase(),
          date: new Date().toLocaleDateString(),
          content: `[Protocol Adjustment]: ${adjustmentNote}`,
          createdAt: serverTimestamp(),
            studioId: selectedClient?.homeStudioId || ''
        });
      }

      // 2. Fetch last logs to pre-fill weights
      const machineLastLogs: Record<string, Partial<ExerciseLog>> = {};

      if (selectedClient && selectedClient.currentMachineMetrics) {
        Object.entries(selectedClient.currentMachineMetrics).forEach(
          ([mId, metricVal]) => {
            const metric = metricVal as import("./types").CurrentMachineMetric;
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

      // 3. Auto-populate logs for routine machines
      let activeMachineIds = customMachines;
      if (!activeMachineIds) {
        const routine = routineId
          ? routines.find((r) => r.id === routineId)
          : null;
        activeMachineIds = routine ? routine.machineIds : [];
      }

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
            homeStudioId: clientHomeStudioId, // Explicit homeStudioId security stamp
            clientHomeStudioId: clientHomeStudioId,
            studioId: currentStudioId || clientHomeStudioId,
            machineId: mId,
            machineSettings:
              currentSettings[mId]?.settings || prevLog?.machineSettings || {},
            createdAt: serverTimestamp(),
          };
          if (side) payload.side = side;
          if (prevLog) {
            if (prevLog.weight) payload.weight = prevLog.weight;

            // Intentionally not auto-filling reps, seconds, or repQuality per user request

            if (prevLog.isStaticHold !== undefined)
              payload.isStaticHold = prevLog.isStaticHold;
            if (prevLog.isTSC !== undefined) payload.isTSC = prevLog.isTSC;
          } else if (defaultWeight) {
            payload.weight = String(defaultWeight);
          }
          return payload;
        };

        for (const mId of activeMachineIds) {
          const mac = machines.find((m) => m.id === mId);
          const isTorsoMac = mac?.name.toLowerCase().includes("torso rotation");

          let defaultWeight: number | null = null;
          if (!machineLastLogs[mId] && selectedClient && mac && mac.name) {
            const gender =
              selectedClient.gender === "Female" ? "Female" : "Male";
            const { calculateStartingWeight } =
              await import("./lib/consultation-utils");
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

            // Create Left set
            if (prefilledLeft || defaultWeight) {
              await addDoc(
                collection(db, "exerciseLogs"),
                createLogPayload(prefilledLeft, mId, "Left", defaultWeight),
              );
            }
            // Create Right set
            if (prefilledRight || defaultWeight) {
              await addDoc(
                collection(db, "exerciseLogs"),
                createLogPayload(prefilledRight, mId, "Right", defaultWeight),
              );
            }
          } else {
            const prefilledLog = machineLastLogs[mId];
            if (prefilledLog || defaultWeight) {
              await addDoc(
                collection(db, "exerciseLogs"),
                createLogPayload(prefilledLog, mId, undefined, defaultWeight),
              );
            }
          }
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

      lastMachineLoggedAt.current = Date.now();
      setCurrentSession(newSession as WorkoutSession);
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

  const handleEndSessionPress = () => {
    setShowEndConfirmation(true);
  };

  const finalizeEndSession = async (postData?: {
    clientFeel: string;
    noteContent: string;
    notePriority: "High" | "Medium" | "Low";
  }) => {
    if (!currentSession?.id) return;

    setIsSyncing(true);
    try {
      const sessionLogs = Object.values(logs).filter(
        (l: any) => l.sessionId === currentSession.id,
      );

      await completeWorkoutSession(
        db,
        currentSession,
        selectedClient,
        sessionLogs,
        postData,
        currentSessionNotes,
        authTrainer,
        clientMachineSettings,
        user.uid,
      );

      setCurrentSession(null);
      setCurrentSessionNotes("");
      setShowEndConfirmation(false);
      setIsPostSessionMode(false);
      setSelectedClientId(null);
      setView("clients");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "sessions");
    } finally {
      setIsSyncing(false);
    }
  };

  const [selectedSessionType, setSelectedSessionType] =
    useState<SessionType>("Standard");
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

  const updateLogMultiple = (
    sessionId: string,
    machineId: string,
    updates: Partial<ExerciseLog>,
    side?: "Left" | "Right",
  ) => {
    const key = `${sessionId}_${machineId}${side ? "_" + side : ""}`;
    const currentSettings = clientMachineSettings[machineId]?.settings || {};

    // Soft Lock Heartbeat: Update session activity timestamp
    if (currentSession?.id === sessionId) {
      updateDoc(doc(db, "sessions", sessionId), {
        lastHeartbeatAt: serverTimestamp(),
      }).catch(console.error);
    }

    setLogs((prev) => {
      const existing = prev[key];
      const updatedLog: ExerciseLog = existing
        ? { ...existing, ...updates, machineSettings: currentSettings }
        : ({
            id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`, // Temporary ID for local state
            sessionId,
            clientId,
            machineId,
            ...(side ? { side } : {}),
            ...updates,
            machineSettings: currentSettings,
            createdAt: Timestamp.now(),
          } as any);

      return { ...prev, [key]: updatedLog };
    });
  };

  const saveMachineSettings = async (
    machineId: string,
    newSettings: Record<string, string>,
    reason: string,
  ) => {
    if (!clientId || !user) return;
    const current = clientMachineSettings[machineId];
    const trainerId = user.uid;

    try {
      // Use deterministic ID to prevent duplicates (same as importer)
      const deterministicId = `${clientId}_${machineId}`;
      const settingsRef = doc(db, "clientMachineSettings", deterministicId);

      await setDoc(
        settingsRef,
        {
          clientId,
          machineId,
          settings: newSettings,
          updatedBy: trainerId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // Record Change Audit
      await addDoc(collection(db, "machineSettingChanges"), {
        machineId,
        clientId,
        trainerId,
        previousSettings: current?.settings || {},
        newSettings,
        reason,
        createdAt: serverTimestamp(),
          studioId: selectedClient?.homeStudioId || ''
    });

      // Save historic record in sidecar subcollection to keep documents optimized
      await addDoc(collection(db, "machines", machineId, "settingHistory"), {
        clientId,
        timestamp: new Date().toISOString(),
        trainerId,
        trainerName:
          authTrainer?.fullName || authTrainer?.initials || "Trainer",
        changeType: "SETTINGS",
        previousSettings: current?.settings || {},
        newSettings,
        reason: reason || "Settings Update",
      });

      setEditingSettingsMachineId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "clientMachineSettings");
    }
  };

  const toggleMachine = async (machineId: string) => {
    if (currentSession) return; // Disable during active session

    const newActiveIds = activeMachineIds.includes(machineId)
      ? activeMachineIds.filter((id) => id !== machineId)
      : [...activeMachineIds, machineId];

    setActiveMachineIds(newActiveIds);
  };

  const cancelActiveSession = async () => {
    if (!currentSession) {
      setSelectedClientId(null);
      setView("clients");
      return;
    }
    setShowCancelConfirmation(true);
  };

  const confirmScrapSession = async () => {
    if (currentSession?.id) {
      await deleteSession(currentSession.id);
    } else {
      setCurrentSession(null);
      setLogs({});
      setSelectedClientId(null);
      setView("clients");
      setShowCancelConfirmation(false);
    }
  };

  const getSuggestedWeight = (machine: Machine, client: Client) => {
    // Basic safety baseline: 20% of body weight as safe start if no history exists
    if (client.weight) {
      const bw = parseFloat(client.weight);
      if (!isNaN(bw)) {
        return Math.round(bw * 0.2).toString();
      }
    }

    return "0";
  };

  if (!selectedClient && !currentSession) {
    return null; // The app routing will ensure this is never reached by redirecting to ClientDirectoryView instead
  }

  if (clientId && isPreSessionMode && selectedClient && !currentSession) {
    const completedSessionsCount = sessions.filter(
      (s) => s.status === "Completed",
    ).length;
    const totalSessionsCount = sessions.length;
    const hasRoutines = routines.length > 0;

    const shouldShowWizard =
      selectedClient.requiresConsultation === true &&
      selectedClient.consultationCompleted === false;

    if (shouldShowWizard) {
      return (
        <ConsultationSetupWizard
          clientName={selectedClient.firstName}
          onComplete={async (setupData) => {
            // setupData.routine is [{name: 'Leg Press', ...}]
            const machineNames = setupData.routine.map((r: any) => r.name);
            const customMachineIds = machineNames
              .map((name: string) => {
                const m = machines.find(
                  (mac) => mac.name === name || mac.fullName === name,
                );
                return m?.id;
              })
              .filter(Boolean) as string[];

            // Optional: update client with gender/age setup
            await updateDoc(doc(db, "clients", selectedClient.id!), {
              gender: setupData.gender || selectedClient.gender,
              consultationCompleted: true,
              requiresConsultation: false,
              updatedAt: serverTimestamp(),
            }).catch((e) => console.error(e));

            if (setupData.routine && setupData.routine.length > 0) {
              const machineNames = setupData.routine.map((r: any) => r.name);
              const customMachineIds = machines
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
        onStart={(routineType, customMachines, note, checkIn) =>
          startNewSession(routineType, undefined, customMachines, note, false, checkIn)
        }
        onClose={() => {
          setIsPreSessionMode(false);
          setView("profile");
        }}
        machines={machines}
        routines={routines}
        trainerFocuses={trainerFocuses.filter((f) => f.clientId === clientId)}
        focusRecords={focusRecords}
        sessionNotes={sessionNotes}
        logs={
          Object.values(logs).filter((l: any) => l.clientId === clientId) as any
        }
        isIntroSession={isIntroSession}
      />
    );
  }

  if (isPostSessionMode && currentSession && selectedClient) {
    return (
      <VictoryHUDScreen
        client={selectedClient}
        session={currentSession}
        logs={
          Object.values(logs).filter(
            (l: any) => l.sessionId === currentSession.id,
          ) as any
        }
        allLogs={
          Object.values(logs).filter(
            (l: any) => l.clientId === selectedClient.id,
          ) as any
        }
        schedules={schedules}
        authTrainer={authTrainer}
        onFinalize={finalizeEndSession}
        isSyncing={isSyncing}
        machines={machines}
      />
    );
  }

  const clientNameDisplay = selectedClient
    ? `${selectedClient.firstName} ${selectedClient.lastName}`
    : "Open Session";
  const lastSession = sessions.length > 0 ? sessions[0] : null;
  const previousSession = sessions.length > 1 ? sessions[1] : null;

  // Suggested routine from targetRoutine state
  const getSuggestedType = (rt: Routine | null): "A" | "B" | "Free" => {
    if (!rt) return "A";
    if (rt.name.includes("Routine A")) return "A";
    if (rt.name.includes("Routine B")) return "B";
    return "Free";
  };
  const suggestedRoutineType = (() => {
    if (routines.length === 0) return "A";
    if (routines.length === 1)
      return (routines[0].name.includes("B") ? "B" : "A") as RoutineType;

    // If we have both, alternate based on last session
    if (!lastSession || !lastSession.routineId) return "A";

    const lastR = routines.find((r) => r.id === lastSession.routineId);
    if (!lastR) return "A";

    if (lastR.name.includes("Routine A")) return "B";
    return "A";
  })();
  const isRoutineBActive = selectedClient?.isRoutineBActive || false;

  // Check for rest days (3 days recommended)
  const daysSinceLastSession = lastSession?.date
    ? Math.floor(
        (new Date().getTime() - parseSessionDate(lastSession.date)) /
          (1000 * 60 * 60 * 24),
      )
    : null;
  const needsRest = daysSinceLastSession !== null && daysSinceLastSession < 3;

  const hasActiveHeader = !!(selectedClient || currentSession);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "h-[calc(100vh-80px)] flex flex-col gap-1 overflow-hidden relative",
        hasActiveHeader ? "pt-[112px]" : "",
      )}
    >
      {isIntroSession && (
        <div className="bg-orange-500 dark:bg-orange-600 p-3 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-orange-500/20 border border-white/20 animate-pulse mt-2 mx-4 relative z-40">
          <Sparkles className="w-5 h-5 text-slate-900 dark:text-white" />
          <span className="text-slate-900 dark:text-white font-black uppercase italic tracking-[0.15em] text-xs">
            NEW CLIENT INTRODUCTORY SESSION: CONVERSATIONAL BASELINE
          </span>
          <Sparkles className="w-5 h-5 text-slate-900 dark:text-white" />
        </div>
      )}
      {/* Persistent Active Header - Refactored as Sticky Fixed */}
      {(selectedClient || currentSession) && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between h-[100px] shadow-md transition-all">
          {/* Left: Client & Trainer Identity */}
          <div className="flex flex-col min-w-0 max-w-[200px] sm:max-w-xs">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
              {selectedClient
                ? `${selectedClient.firstName} ${selectedClient.lastName}`
                : currentSession?.isUnassigned
                  ? "Unassigned Tracking"
                  : "Initializing..."}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
              <div className="w-5 h-5 rounded-full bg-white dark:bg-bg-dark flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
                <span className="text-[11px] font-bold">
                  {authTrainer?.initials ||
                    currentSession?.trainerInitials ||
                    "??"}
                </span>
              </div>
              Trainer
            </div>
          </div>

          {/* Center: Focal Clock with Play/Pause button inside */}
          <div className="flex flex-col items-center absolute left-1/2 -translate-x-1/2 z-50">
            {currentSession && currentSession.startTime && (
              <ActiveSessionTimer
                startTime={currentSession.startTime}
                paused={isPaused}
                onTogglePause={() => setIsPaused(!isPaused)}
              />
            )}
          </div>

          {/* Right: Tactical Controls & Hard Stop */}
          <div className="flex items-center gap-2 shrink-0 z-50">
            <Button
              variant="outline"
              className={cn(
                "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-surface-1 h-10 px-3 transition-colors",
                !showAllMachines
                  ? "bg-orange-500 text-white hover:bg-orange-600 dark:text-white border-transparent hover:text-white"
                  : "",
              )}
              onClick={() => setShowAllMachines(!showAllMachines)}
            >
              <LayoutList className="w-4 h-4 mr-2" />
              Focus
            </Button>

            <Button
              variant="outline"
              className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-surface-1 h-10 px-3 hidden lg:flex transition-colors"
              onClick={() => setIsSessionRoutineManagerOpen(true)}
            >
              <Settings2 className="w-4 h-4 mr-2" />
              Routine
            </Button>

            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-sm transition-all h-10 px-6 rounded-lg ml-2"
              onClick={handleEndSessionPress}
            >
              Finish Session
            </Button>
          </div>
        </div>
      )}
      {/* Machine Performance Entry Dialog */}
      {editingWeightMachineId &&
        currentSession &&
        (() => {
          const theMachine = machines.find(
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
              isStaticHold={logL?.isStaticHold}
              onClose={() => {
                setEditingWeightMachineId(null);
                setEditingWeightSide(undefined);
              }}
              onSave={async (
                weight,
                repsOrSeconds,
                quality,
                isHold,
                side,
                repsRightStr,
              ) => {
                const timeDiff = Math.floor(
                  (Date.now() - lastMachineLoggedAt.current) / 1000,
                );

                if (isTorso) {
                  // Save Left Side
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "weight",
                    weight,
                    "Left",
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "repQuality",
                    quality,
                    "Left",
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "isStaticHold",
                    isHold,
                    "Left",
                  );
                  if (isHold) {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      repsOrSeconds,
                      "Left",
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      "0",
                      "Left",
                    );
                  } else {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      repsOrSeconds,
                      "Left",
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      "0",
                      "Left",
                    );
                  }

                  // Save Right Side (using the same weight and quality, but its own reps)
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "weight",
                    weight,
                    "Right",
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "repQuality",
                    quality,
                    "Right",
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "isStaticHold",
                    isHold,
                    "Right",
                  );
                  if (isHold) {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      repsRightStr || "0",
                      "Right",
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      "0",
                      "Right",
                    );
                  } else {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      repsRightStr || "0",
                      "Right",
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      "0",
                      "Right",
                    );
                  }
                } else {
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "weight",
                    weight,
                    side,
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "repQuality",
                    quality,
                    side,
                  );
                  await updateLog(
                    currentSession.id!,
                    editingWeightMachineId,
                    "isStaticHold",
                    isHold,
                    side,
                  );
                  if (isHold) {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      repsOrSeconds,
                      side,
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      "0",
                      side,
                    );
                  } else {
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "reps",
                      repsOrSeconds,
                      side,
                    );
                    await updateLog(
                      currentSession.id!,
                      editingWeightMachineId,
                      "seconds",
                      "0",
                      side,
                    );
                  }
                }

                setEditingWeightMachineId(null);
                setEditingWeightSide(undefined);

                // Advance UI to the next machine automatically after a brief delay
                const currentIndex = activeMachineIds.indexOf(
                  editingWeightMachineId,
                );
                if (
                  currentIndex !== -1 &&
                  currentIndex < activeMachineIds.length - 1
                ) {
                  setTimeout(() => {
                    const nextMachineId = activeMachineIds[currentIndex + 1];
                    setEditingWeightMachineId(nextMachineId);
                    setEditingWeightSide(undefined);
                  }, 150);
                }
              }}
            />
          );
        })()}

      {/* Machine Settings Dialog */}
      {editingSettingsMachineId && (
        <MachineSettingsDialog
          machine={machines.find((m) => m.id === editingSettingsMachineId)!}
          client={selectedClient}
          currentSettings={clientMachineSettings[editingSettingsMachineId]}
          onClose={() => setEditingSettingsMachineId(null)}
          onSave={(settings, reason) =>
            saveMachineSettings(editingSettingsMachineId, settings, reason)
          }
        />
      )}

      {/* Exercise History Dialog */}
      {historyMachineId && clientId && (
        <ExerciseHistoryDialog
          clientId={clientId}
          machine={machines.find((m) => m.id === historyMachineId)!}
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
        <DialogContent className="sm:max-w-[400px] rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none">
          <div className="bg-primary p-8 text-slate-900 dark:text-white space-y-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-2">
              <AlertCircle className="w-6 h-6 text-slate-900 dark:text-white" />
            </div>
            <h3 className="text-2xl font-black italic uppercase tracking-tight">
              End Session?
            </h3>
            <p className="text-primary-foreground/90 font-medium text-sm leading-relaxed">
              Are you sure you want to conclude this{" "}
              {currentSession?.sessionType.toLowerCase()} workout session?
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
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Session Notes
                  </label>
                  <Textarea
                    value={currentSessionNotes}
                    onChange={(e) => setCurrentSessionNotes(e.target.value)}
                    placeholder="Log general observations here..."
                    className="min-h-[100px] border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-bg-dark resize-none text-slate-800 dark:text-slate-200 placeholder:text-slate-500 dark:text-slate-400 focus-visible:ring-orange-500 focus-visible:border-orange-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-2 dark:border-slate-800 dark:hover:bg-surface-1"
                    onClick={() => setShowEndConfirmation(false)}
                  >
                    Keep Training
                  </Button>
                  <Button
                    className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 bg-red-600 text-white hover:bg-red-700"
                    onClick={() => {
                      if (currentSession) {
                        setCurrentSession({
                          ...currentSession,
                          endTime: new Date(),
                        });
                      }
                      setShowEndConfirmation(false);
                      setIsPostSessionMode(true);
                    }}
                    disabled={isSyncing}
                  >
                    Confirm End
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
        onOpenChange={setShowCancelConfirmation}
      >
        <DialogContent className="sm:max-w-[400px] rounded-[32px] p-0 overflow-hidden border-none shadow-2xl dark:shadow-none">
          <div className="bg-white dark:bg-bg-dark p-8 text-slate-900 dark:text-white space-y-3">
            <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
              <Trash2 className="w-6 h-6 text-slate-900 dark:text-white" />
            </div>
            <h3 className="text-2xl font-black italic uppercase tracking-tight">
              Scrap Active Session?
            </h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed">
              Are you sure you want to cancel this session? All data logged so
              far will be scrapped and will not be recorded in the database.
            </p>
          </div>

          <div className="p-6 grid grid-cols-2 gap-3 bg-white dark:bg-bg-dark">
            <Button
              variant="outline"
              className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-2 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-surface-2"
              onClick={() => setShowCancelConfirmation(false)}
            >
              Resume Session
            </Button>
            <Button
              className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs bg-red-600 text-white shadow-lg shadow-red-200 dark:shadow-none hover:bg-red-700"
              onClick={confirmScrapSession}
            >
              Scrap Session
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Workout Table Scroll Area */}
      <div className="flex-1 overflow-hidden border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-bg-dark shadow-sm flex flex-col">
        <div className="w-full h-full overflow-x-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
          <table className="w-full text-left border-collapse table-fixed select-none min-w-[600px] h-full flex flex-col bg-white dark:bg-bg-dark border border-slate-200 dark:border-slate-800 shadow-sm">
            <thead className="flex w-full shrink-0">
              <tr className="bg-slate-50 dark:bg-surface-1 border-b border-slate-200 dark:border-slate-700 uppercase text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 leading-none h-[36px] w-full flex items-center">
                <th className="p-0 flex items-center justify-center w-[40px] shrink-0 border-r border-slate-200 dark:border-slate-700 h-full">
                  {currentSession ? (
                    <button
                      onClick={() => setIsSessionRoutineManagerOpen(true)}
                      className="w-full h-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                      title="Edit Routine"
                    >
                      <Settings2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </button>
                  ) : (
                    "#"
                  )}
                </th>
                <th className="p-1.5 pl-3 flex-1 border-r border-slate-200 dark:border-slate-700 h-full flex items-center truncate">
                  Exercise & Settings
                </th>
                <th className="p-1.5 text-center w-[50px] shrink-0 border-r border-slate-200 dark:border-slate-700 h-full flex items-center justify-center">
                  Prev
                </th>
                <th className="p-1.5 text-center w-[60px] shrink-0 border-r border-slate-200 dark:border-slate-700 h-full flex items-center justify-center">
                  Weight
                </th>
                <th className="p-1.5 text-center w-[60px] shrink-0 border-r border-slate-200 dark:border-slate-700 h-full flex items-center justify-center">
                  Reps
                </th>
                <th className="p-1.5 text-center w-[60px] shrink-0 h-full flex items-center justify-center">
                  Quality
                </th>
              </tr>
            </thead>

            <tbody className="flex-1 overflow-y-auto block w-full text-slate-900 dark:text-slate-50">
              {(() => {
                let activeFocusMachineId: string | null = null;
                if (currentSession) {
                  for (const mId of activeMachineIds) {
                    const mac = machines.find((m) => m.id === mId);
                    const isTorsoMac = mac?.name
                      .toLowerCase()
                      .includes("torso rotation");

                    if (isTorsoMac) {
                      const logL = logs[`${currentSession.id}_${mId}_Left`];
                      const logR = logs[`${currentSession.id}_${mId}_Right`];
                      const lComp =
                        logL &&
                        logL.weight &&
                        (logL.reps || logL.seconds) &&
                        logL.repQuality;
                      const rComp =
                        logR &&
                        logR.weight &&
                        (logR.reps || logR.seconds) &&
                        logR.repQuality;

                      if (!lComp || !rComp) {
                        activeFocusMachineId = mId;
                        break;
                      }
                    } else {
                      const log = logs[`${currentSession.id}_${mId}`];
                      if (
                        !log ||
                        !log.weight ||
                        (!log.reps && !log.seconds) ||
                        !log.repQuality
                      ) {
                        activeFocusMachineId = mId;
                        break;
                      }
                    }
                  }
                }

                return (
                  <>
                    {currentSession?.routineId &&
                      activeMachineIds.length === 0 && (
                        <tr className="flex">
                          <td colSpan={5} className="p-4 text-center w-full">
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase">
                              Routine blank. Start selecting machines.
                            </p>
                          </td>
                        </tr>
                      )}
                    {machines
                      .sort((a, b) => {
                        if (!showAllMachines) {
                          const routine = routines.find(
                            (r) => r.id === currentSession?.routineId,
                          );
                          if (routine) {
                            const idxA = activeMachineIds.indexOf(a.id!);
                            const idxB = activeMachineIds.indexOf(b.id!);
                            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                            if (idxA !== -1) return -1;
                            if (idxB !== -1) return 1;
                          }
                        }
                        return a.order - b.order;
                      })
                      .map((machine, index) => {
                        const isTorso = machine.name
                          .toLowerCase()
                          .includes("torso rotation");

                        const logL = currentSession
                          ? logs[`${currentSession.id}_${machine.id}_Left`] ||
                            {}
                          : {};
                        const logR = currentSession
                          ? logs[`${currentSession.id}_${machine.id}_Right`] ||
                            {}
                          : {};
                        const logStd = currentSession
                          ? logs[`${currentSession.id}_${machine.id}`] || {}
                          : {};

                        // Decide which log to show as "primary" or show both
                        const currentLog = isTorso
                          ? logL.weight
                            ? logL
                            : logR
                          : logStd;

                        const isActive = activeMachineIds.includes(machine.id!);
                        const isCompleted = isTorso
                          ? logL.weight &&
                            (logL.reps || logL.seconds) &&
                            logL.repQuality &&
                            logR.weight &&
                            (logR.reps || logR.seconds) &&
                            logR.repQuality
                          : currentLog?.weight &&
                            (currentLog?.reps || currentLog?.seconds) &&
                            currentLog?.repQuality;

                        const seqPosition = isActive
                          ? activeMachineIds.indexOf(machine.id!) + 1
                          : null;
                        const pastMachineLogs = sessions
                          .filter((s) =>
                            currentSession ? s.id !== currentSession.id : true,
                          )
                          .map((s) => {
                            // For historical check, favor specific side if we are in side-mode, else look for any
                            const log = isTorso
                              ? logs[`${s.id}_${machine.id}_Left`] ||
                                logs[`${s.id}_${machine.id}_Right`] ||
                                logs[`${s.id}_${machine.id}`]
                              : logs[`${s.id}_${machine.id}`];
                            return log && log.weight
                              ? { log, session: s }
                              : null;
                          })
                          .filter(
                            (
                              x,
                            ): x is {
                              log: ExerciseLog;
                              session: WorkoutSession;
                            } => Boolean(x),
                          )
                          .slice(0, 3);
                        const prevLog = pastMachineLogs[0]?.log || null;
                        const prevSession = pastMachineLogs[0]?.session || null;
                        const isFocusMachine =
                          activeFocusMachineId === machine.id;

                        // Parse Settings
                        const settingsStr =
                          clientMachineSettings[machine.id!]?.settings || {};
                        const stdSettings =
                          activeStudio?.machineSettings?.[machine.id!] ||
                          machine.standardSettings ||
                          {};
                        const options = machine.settingOptions || [];
                        const sortedEntries = orderMachineSettings(
                          settingsStr,
                          stdSettings,
                          options,
                        );

                        const settingsDisplay = (
                          <div className="flex gap-1.5 items-center flex-wrap">
                            {sortedEntries.map(([k, v, originalKey], i) => (
                              <span
                                key={originalKey || i}
                                className="flex gap-0.5 items-baseline"
                              >
                                <span className="text-slate-500 dark:text-slate-400 text-[11px] uppercase font-medium">
                                  {k}:
                                </span>
                                <span className="font-medium text-slate-700 dark:text-slate-300 text-[11px] uppercase">
                                  {v}
                                </span>
                                {i < sortedEntries.length - 1 && (
                                  <span className="text-slate-300 dark:text-slate-600 ml-0.5 text-[11px]">
                                    •
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        );

                        return (
                          <tr
                            key={machine.id}
                            className={`flex w-full group transition-colors h-[34px] sm:h-[36px] items-center border-b border-slate-100 dark:border-slate-800/50 last:border-b-0 border-l-[4px] bg-white dark:bg-bg-dark hover:bg-slate-50 dark:hover:bg-surface-2
                              ${!isActive && !showAllMachines ? "opacity-30 grayscale hover:grayscale-0" : ""}
                              ${isFocusMachine ? "border-l-blue-500" : isCompleted && isActive ? "border-l-emerald-500" : "border-l-transparent"}`}
                          >
                            <td className="w-[40px] shrink-0 flex items-center justify-center p-0 border-r border-slate-200 dark:border-slate-800/60 h-full">
                              {isActive ? (
                                <div
                                  className={`flex items-center justify-center rounded-md px-1.5 h-5 shadow-sm ${isFocusMachine ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold" : isCompleted ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 dark:bg-surface-1 text-slate-500 font-medium"}`}
                                >
                                  {isCompleted ? (
                                    <Check className="w-3 h-3" />
                                  ) : (
                                    <span className="font-bold text-[11px] leading-none">
                                      {seqPosition}
                                    </span>
                                  )}
                                </div>
                              ) : !currentSession ? (
                                <button
                                  className="flex items-center justify-center transition-all rounded-full w-4 h-4 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-500 hover:border-blue-500"
                                  onClick={() => toggleMachine(machine.id!)}
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              ) : (
                                <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                              )}
                            </td>

                            <td className="flex-1 p-1 pl-3 border-r border-slate-200 dark:border-slate-800/60 h-full flex flex-col justify-center min-w-0 truncate">
                              <div className="flex items-center">
                                <span
                                  className={`font-medium text-xs ${isFocusMachine ? "text-blue-600 dark:text-blue-400 font-bold" : "text-slate-900 dark:text-slate-50"} leading-none truncate`}
                                >
                                  {machine.name}
                                </span>
                              </div>
                              <div
                                onClick={() =>
                                  setEditingSettingsMachineId(machine.id!)
                                }
                                className="leading-none mt-[4px] cursor-pointer hover:opacity-80 pb-1"
                              >
                                {isTorso ? (
                                  settingsDisplay
                                ) : isCompleted ? (
                                  <span className="font-medium text-[11px] text-slate-500 dark:text-slate-400">
                                    {currentLog.weight} lbs |{" "}
                                    {currentLog.repsLeft !== undefined &&
                                    currentLog.repsRight !== undefined ? (
                                      `${currentLog.repsLeft}L | ${currentLog.repsRight}R`
                                    ) : currentLog.isStaticHold ? (
                                      <>{currentLog.seconds}s</>
                                    ) : (
                                      `${currentLog.reps} reps`
                                    )}{" "}
                                    | Q: {currentLog.repQuality}
                                  </span>
                                ) : (
                                  settingsDisplay
                                )}
                              </div>
                            </td>

                            <td className="w-[50px] shrink-0 flex flex-col items-center justify-center p-0 border-r border-slate-200 dark:border-slate-800/60 h-full">
                              {prevLog && prevLog.weight ? (
                                <div className="flex flex-col items-center leading-none">
                                  <span className="font-medium text-xs text-slate-500 dark:text-slate-400">
                                    {prevLog.weight}
                                  </span>
                                  <span className="font-medium text-[11px] text-slate-400 dark:text-slate-500 mt-[1px]">
                                    {prevLog.repsLeft !== undefined &&
                                    prevLog.repsRight !== undefined ? (
                                      `${prevLog.repsLeft}L|${prevLog.repsRight}R`
                                    ) : prevLog.isStaticHold ? (
                                      <>
                                        {prevLog.seconds}
                                        <span className="text-[7px] ml-0.5 lowercase">
                                          s
                                        </span>
                                      </>
                                    ) : (
                                      `${prevLog.reps}R`
                                    )}
                                  </span>
                                  {prevLog.repQuality !== undefined &&
                                    prevLog.repQuality !== null && (
                                      <span
                                        className={
                                          `font-black text-[7px] mt-[2px] px-1 rounded-sm ` +
                                          (prevLog.repQuality === 1
                                            ? "bg-red-500/10 text-red-600"
                                            : prevLog.repQuality === 2
                                              ? "bg-amber-500/10 text-amber-600"
                                              : "bg-emerald-500/10 text-emerald-600")
                                        }
                                      >
                                        Q{prevLog.repQuality}
                                      </span>
                                    )}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                                  --
                                </span>
                              )}
                            </td>

                            <td
                              className={`w-[60px] shrink-0 cursor-pointer group/weight p-0 border-r border-slate-200 dark:border-slate-800/60 h-full flex items-center justify-center transition-colors ${isFocusMachine ? "bg-white dark:bg-surface-1 shadow-[inset_0px_2px_4px_rgba(0,0,0,0.04)] ring-1 ring-inset ring-slate-200/50 dark:ring-slate-700/50" : "bg-slate-50/50 dark:bg-surface-2 hover:bg-slate-100 dark:hover:bg-surface-1"}`}
                            >
                              {isTorso ? (
                                <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full">
                                  <div
                                    className="flex-1 w-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingWeightMachineId(machine.id!);
                                      setEditingWeightSide("Left");
                                    }}
                                  >
                                    <span
                                      className={`font-black text-[11px] ${logL.weight ? "text-slate-900 dark:text-slate-50" : "text-slate-400 dark:text-slate-500"}`}
                                    >
                                      {logL.weight || "--"}
                                    </span>
                                  </div>
                                  <div className="w-4 h-[1px] bg-slate-200 dark:bg-slate-700" />
                                  <div
                                    className="flex-1 w-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingWeightMachineId(machine.id!);
                                      setEditingWeightSide("Right");
                                    }}
                                  >
                                    <span
                                      className={`font-black text-[11px] ${logR.weight ? "text-slate-900 dark:text-slate-50" : "text-slate-400 dark:text-slate-500"}`}
                                    >
                                      {logR.weight || "--"}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center"
                                  onClick={() =>
                                    setEditingWeightMachineId(machine.id!)
                                  }
                                >
                                  {currentLog.weight ? (
                                    <span className="font-bold text-[13px] text-slate-900 dark:text-slate-50">
                                      {currentLog.weight}
                                    </span>
                                  ) : (
                                    <span
                                      className={`font-black text-[11px] ${isFocusMachine ? "text-slate-400 dark:text-slate-500" : "text-slate-300 dark:text-slate-600 group-hover/weight:text-slate-500"}`}
                                    >
                                      --
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td
                              className={`w-[60px] shrink-0 cursor-pointer group/reps p-0 border-r border-slate-200 dark:border-slate-800/60 h-full flex items-center justify-center transition-colors relative ${isFocusMachine ? "bg-white dark:bg-surface-1 shadow-[inset_0px_2px_4px_rgba(0,0,0,0.04)] ring-1 ring-inset ring-slate-200/50 dark:ring-slate-700/50" : "bg-slate-50/50 dark:bg-surface-2 hover:bg-slate-100 dark:hover:bg-surface-1"}`}
                            >
                              {isTorso ? (
                                <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full">
                                  <div
                                    className="flex-1 w-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingWeightMachineId(machine.id!);
                                      setEditingWeightSide("Left");
                                    }}
                                  >
                                    <span
                                      className={`font-black text-[11px] ${logL.reps || logL.seconds ? "text-slate-900 dark:text-slate-50" : "text-slate-400 dark:text-slate-500"}`}
                                    >
                                      {logL.isStaticHold ? (
                                        <>
                                          {logL.seconds}
                                          <span className="text-[7px] ml-0.5 lowercase opacity-70">
                                            s
                                          </span>
                                        </>
                                      ) : (
                                        logL.reps || "--"
                                      )}
                                    </span>
                                  </div>
                                  <div className="w-4 h-[1px] bg-slate-200 dark:bg-slate-700" />
                                  <div
                                    className="flex-1 w-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingWeightMachineId(machine.id!);
                                      setEditingWeightSide("Right");
                                    }}
                                  >
                                    <span
                                      className={`font-black text-[11px] ${logR.reps || logR.seconds ? "text-slate-900 dark:text-slate-50" : "text-slate-400 dark:text-slate-500"}`}
                                    >
                                      {logR.isStaticHold ? (
                                        <>
                                          {logR.seconds}
                                          <span className="text-[7px] ml-0.5 lowercase opacity-70">
                                            s
                                          </span>
                                        </>
                                      ) : (
                                        logR.reps || "--"
                                      )}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center"
                                  onClick={() =>
                                    setEditingWeightMachineId(machine.id!)
                                  }
                                >
                                  {currentLog.isStaticHold ||
                                  currentLog.reps ? (
                                    <span className="font-bold text-[13px] text-slate-900 dark:text-slate-50">
                                      {currentLog.repsLeft !== undefined &&
                                      currentLog.repsRight !== undefined ? (
                                        `${currentLog.repsLeft}L | ${currentLog.repsRight}R`
                                      ) : currentLog.isStaticHold ? (
                                        <>
                                          {currentLog.seconds}
                                          <span className="text-[11px] ml-0.5 lowercase opacity-70">
                                            s
                                          </span>
                                        </>
                                      ) : (
                                        currentLog.reps
                                      )}
                                    </span>
                                  ) : (
                                    <span
                                      className={`font-black text-[11px] ${isFocusMachine ? "text-slate-400 dark:text-slate-500" : "text-slate-300 dark:text-slate-600 group-hover/reps:text-slate-500"}`}
                                    >
                                      --
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td
                              className={`w-[60px] shrink-0 px-1 border-r border-slate-200 dark:border-slate-800/60 flex items-center justify-center h-full transition-colors ${isFocusMachine ? "bg-white dark:bg-surface-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]" : "group-hover:bg-slate-50 dark:group-hover:bg-surface-1"}`}
                            >
                              {isTorso ? (
                                <div className="flex flex-col gap-1 items-center">
                                  <div
                                    className={`flex rounded-full p-[1px] gap-[1px] ${isFocusMachine ? "bg-slate-100/80 border border-slate-200 dark:border-slate-700" : "bg-slate-100 dark:bg-surface-1"}`}
                                  >
                                    {[1, 2, 3].map((v) => {
                                      const isSelected = logL.repQuality === v;
                                      let bgClass = isFocusMachine
                                        ? "bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500"
                                        : "bg-slate-300/50 hover:bg-slate-400";
                                      if (isSelected) {
                                        if (v === 1)
                                          bgClass = "bg-red-500 shadow-sm";
                                        else if (v === 2)
                                          bgClass = "bg-amber-500 shadow-sm";
                                        else if (v === 3)
                                          bgClass = "bg-emerald-500 shadow-sm";
                                      }
                                      return (
                                        <button
                                          key={v}
                                          onClick={() =>
                                            currentSession?.id &&
                                            updateLog(
                                              currentSession.id,
                                              machine.id!,
                                              "repQuality",
                                              v,
                                              "Left",
                                            )
                                          }
                                          className={`w-[10px] h-[10px] rounded-full transition-all ${bgClass}`}
                                        />
                                      );
                                    })}
                                  </div>
                                  <div
                                    className={`flex rounded-full p-[1px] gap-[1px] ${isFocusMachine ? "bg-slate-100/80 border border-slate-200 dark:border-slate-700" : "bg-slate-100 dark:bg-surface-1"}`}
                                  >
                                    {[1, 2, 3].map((v) => {
                                      const isSelected = logR.repQuality === v;
                                      let bgClass = isFocusMachine
                                        ? "bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500"
                                        : "bg-slate-300/50 hover:bg-slate-400";
                                      if (isSelected) {
                                        if (v === 1)
                                          bgClass = "bg-red-500 shadow-sm";
                                        else if (v === 2)
                                          bgClass = "bg-amber-500 shadow-sm";
                                        else if (v === 3)
                                          bgClass = "bg-emerald-500 shadow-sm";
                                      }
                                      return (
                                        <button
                                          key={v}
                                          onClick={() =>
                                            currentSession?.id &&
                                            updateLog(
                                              currentSession.id,
                                              machine.id!,
                                              "repQuality",
                                              v,
                                              "Right",
                                            )
                                          }
                                          className={`w-[10px] h-[10px] rounded-full transition-all ${bgClass}`}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`flex rounded-full p-[2px] gap-[2px] ${isFocusMachine ? "bg-slate-100/80 border border-slate-200 dark:border-slate-700" : "bg-slate-100 dark:bg-surface-1"}`}
                                >
                                  {[1, 2, 3].map((v) => {
                                    const isSelected =
                                      currentLog.repQuality === v;
                                    let bgClass = isFocusMachine
                                      ? "bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500"
                                      : "bg-slate-300/50 hover:bg-slate-400";
                                    if (isSelected) {
                                      if (v === 1)
                                        bgClass = "bg-red-500 shadow-sm";
                                      else if (v === 2)
                                        bgClass = "bg-amber-500 shadow-sm";
                                      else if (v === 3)
                                        bgClass = "bg-emerald-500 shadow-sm";
                                    }
                                    return (
                                      <button
                                        key={v}
                                        onClick={() => {
                                          if (currentSession?.id) {
                                            updateLog(
                                              currentSession.id,
                                              machine.id!,
                                              "repQuality",
                                              v,
                                            );
                                          }
                                        }}
                                        className={`w-[14px] h-[14px] rounded-full transition-all ${bgClass}`}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isShowingSessionNotes && currentSession && (
          <SessionNotesSidebar
            session={currentSession}
            userTrainers={trainers}
            onClose={() => setIsShowingSessionNotes(false)}
            user={user}
          />
        )}
      </AnimatePresence>

      {currentSession && (
        <SessionRoutineManagerModal
          isOpen={isSessionRoutineManagerOpen}
          onOpenChange={setIsSessionRoutineManagerOpen}
          currentMachineIds={activeMachineIds}
          machines={machines}
          onSave={handleSaveSessionMachineIds}
        />
      )}

      {currentSession && (
        <div className="fixed bottom-20 left-0 right-0 z-[110]">
          <Stopwatch onLogTSC={handleLogTSC} />
        </div>
      )}

      {currentSession && activeMachineIds.length > 0 && (
        <div className="fixed bottom-0 left-2 p-1 pointer-events-none opacity-20 z-[110]">
          <span className="text-[11px] text-slate-800 dark:text-slate-200 font-mono tracking-widest">
            {machineTimeElapsed}s
          </span>
        </div>
      )}

      {/* Floating Action Button (FAB) for session notes */}
      {currentSession && (
        <button
          type="button"
          onClick={() => setIsShowingSessionNotes(true)}
          className="fixed bottom-24 right-6 z-[110] w-16 h-16 rounded-full bg-[#F06C22] hover:bg-[#F06C22]/90 flex items-center justify-center text-white shadow-[0_4px_24px_rgba(240,108,34,0.45)] hover:shadow-[0_6px_28px_rgba(240,108,34,0.6)] cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 active:bg-[#d65b1d] select-none"
          title="Session Notes"
        >
          <MessageSquare className="w-7 h-7 fill-current" />
        </button>
      )}
    </motion.div>
  );
}
