import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  setDoc,
  doc,
  serverTimestamp,
  Timestamp,
  getCountFromServer,
  deleteDoc,
  startAfter
} from "firebase/firestore";
import { db, auth } from "../firebase";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  Trash2,
  Save,
  Clock,
  Dumbbell,
  TrendingUp,
  AlertCircle,
  Play,
  History,
  Maximize,
  Maximize2,
  Battery,
  CalendarDays,
  Star
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, ReferenceLine, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { MachineSettingsDashboardModal } from "./MachineSettingsDashboardModal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ClientEquipmentPrescriptions } from "./ClientEquipmentPrescriptions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROUTINE_TEMPLATES, RoutineTemplateType } from "../constants";
import { ClientFocusDashboard } from "./ClientFocusDashboard";
import {
  Client,
  Machine,
  WorkoutSession,
  ExerciseLog,
  Routine,
  View,
  ClientMachineSetting,
  TrainerFocus,
  Trainer,
  ScheduleEntry,
  ProgressReport,
  FocusRecord,
  ClinicalSafetyFlag,
} from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { WorkoutChartGrid } from "./WorkoutChartGrid";
import { ClientHistoryCalendar } from "./ClientHistoryCalendar";
import { OccupationSelect } from "./OccupationSelect";
import { getErgonomicRisk } from "../data/occupational-matrix";
import { cn, parseSessionDate, getMillis, calculateExerciseVolume, getMuscleGroupColor, isBig5Machine } from "../lib/utils";
import { RoutineBuilderView } from "./RoutineBuilderView";
import { CLINICAL_FLAGS_MATRIX } from "../data/clinical-matrix";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export function ClientProfileView({
  clientId,
  clients,
  machines,
  authTrainer,
  trainers,
  onDelete,
  onSelectReport,
  setView,
  hasQuotaError,
  user,
}: {
  clientId: string | null;
  clients: Client[];
  machines: Machine[];
  authTrainer?: Trainer | null;
  trainers: Trainer[];
  onDelete: (id: string) => void;
  onSelectReport: (id: string) => void;
  setView: (v: View, data?: { isIntroSession?: boolean }) => void;
  hasQuotaError?: boolean;
  user?: any;
}) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [allLogs, setAllLogs] = useState<ExerciseLog[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [clientSettings, setClientSettings] = useState<
    Record<string, ClientMachineSetting>
  >({});
  const [trainerFocuses, setTrainerFocuses] = useState<TrainerFocus[]>([]);
  const [progressReports, setProgressReports] = useState<ProgressReport[]>([]);
  const [scheduledSessions, setScheduledSessions] = useState<ScheduleEntry[]>(
    [],
  );
  const [isEditingFocus, setIsEditingFocus] = useState(false);
  const [isEditingSessionCount, setIsEditingSessionCount] = useState(false);
  const [sessionCountInput, setSessionCountInput] = useState("");
  const [focusForm, setFocusForm] = useState<Partial<TrainerFocus>>({
    category: "Path",
    notes: "",
  });
  const [selectedTimingSessionId, setSelectedTimingSessionId] = useState<
    string | null
  >(null);
  const [isSavingFocus, setIsSavingFocus] = useState(false);
  const [isEditingRoutine, setIsEditingRoutine] = useState<string | null>(null);
  const [routineEditData, setRoutineEditData] = useState<{
    name: string;
    machineIds: string[];
  }>({ name: "", machineIds: [] });
  const [highlightRoutine, setHighlightRoutine] = useState<"A" | "B" | null>(
    null,
  );
  const [historyPage, setHistoryPage] = useState(0);
  const [showFullChart, setShowFullChart] = useState(false);
  const [sessionLimit, setSessionLimit] = useState(10);
  const [lastVisibleSession, setLastVisibleSession] = useState<any>(null);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [calculatedSessionCount, setCalculatedSessionCount] = useState<number>(0);

  const client = clients.find((c) => c.id === clientId);

  useEffect(() => {
    if (!clientId) return;
    const fetchSessionCount = async () => {
      try {
        const snapshot = await getCountFromServer(query(collection(db, "sessions"), where("clientId", "==", clientId), where("status", "==", "Completed")));
        const actualCount = snapshot.data().count;
        setCalculatedSessionCount(actualCount);
        
        // Ensure client document stays perfectly in sync with actual history length
        if (client && (client.sessionCount !== actualCount)) {
          // Fire and forget update
          updateDoc(doc(db, "clients", clientId), { sessionCount: actualCount }).catch(console.error);
        }
      } catch (err) {
        console.error("Error fetching session count", err);
      }
    };
    fetchSessionCount();
  }, [clientId, sessions, client?.sessionCount]); // re-fetch when sessions state changes

  useEffect(() => {
    const handleOpenImport = () => setView("chart-importer" as any);
    window.addEventListener('open-bulk-import', handleOpenImport);
    return () => window.removeEventListener('open-bulk-import', handleOpenImport);
  }, []);

  const [activeTab, setActiveTab] = useState("overview");
  const [activeMachine, setActiveMachine] = useState<string | null>(null);
  const [infoForm, setInfoForm] = useState<Partial<Client>>({});
  const [newEventForm, setNewEventForm] = useState<{
    date: string;
    title: string;
    type: any;
    notes: string;
  }>({
    date: new Date().toISOString().split("T")[0],
    title: "",
    type: "Other",
    notes: "",
  });
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [stagedMachineIds, setStagedMachineIds] = useState<
    Record<string, string[]>
  >({});
  const [isSavingRoutine, setIsSavingRoutine] = useState<
    Record<string, boolean>
  >({});
  const [routineBuilderTarget, setRoutineBuilderTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingSettings, setEditingSettings] = useState<{machineId: string, settings: Record<string, string>} | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [matrixRoutineFilter, setMatrixRoutineFilter] = useState<string>("all");
  const SESSIONS_PER_PAGE = 3;

  const handleUpdateMachineSettings = async () => {
    if (!editingSettings || !clientId) return;
    setIsSavingSettings(true);
    try {
      const settingId = `${clientId}_${editingSettings.machineId}`;
      await setDoc(doc(db, 'clientMachineSettings', settingId), {
        clientId,
        machineId: editingSettings.machineId,
        settings: editingSettings.settings,
        updatedBy: auth.currentUser?.email || 'Unknown',
        updatedAt: serverTimestamp()
      }, { merge: true });
      setEditingSettings(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clientMachineSettings/${editingSettings.machineId}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  useEffect(() => {
    if (client) {
      setInfoForm({
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email || "",
        phone: client.phone || "",
        gender: client.gender || "Male",
        height: client.height || "",
        weight: client.weight || "",
        age: client.age ?? null,
        occupation: client.occupation || "",
        isRetired: client.isRetired ?? false,
        clinicalProfile: client.clinicalProfile || [],
        clinicalFlags: client.clinicalFlags || [],
        clinicalNotes: client.clinicalNotes || "",
        activityLevel: client.activityLevel || "Moderate",
        trainingPedigree: client.trainingPedigree || "Novice",
        recoveryMetric: client.recoveryMetric || "Average",
        emergencyContactName: client.emergencyContactName || "",
        emergencyContactPhone: client.emergencyContactPhone || "",
        globalNotes: client.globalNotes || "",
        isActive: client.isActive ?? true,
        isRoutineBActive: client.isRoutineBActive ?? false,
        consultationCompleted: client.consultationCompleted ?? false,
        discoveryNotes: client.discoveryNotes || "",
        packageTier: client.packageTier || "None",
        remainingSessions: client.remainingSessions ?? 0,
      });
    }
  }, [client]);

  const handleSaveInfo = async () => {
    if (!clientId) return;
    setIsSavingInfo(true);
    try {
      const sanitizedData = { ...infoForm };

      // Ensure age is a number or null, not an empty string
      if (sanitizedData.age === "" || sanitizedData.age === undefined) {
        delete sanitizedData.age;
      } else {
        const parsed = parseInt(sanitizedData.age as any, 10);
        sanitizedData.age = isNaN(parsed) ? null : parsed;
      }

      // Ensure remainingSessions is a number
      if (sanitizedData.remainingSessions !== undefined) {
        const parsed = parseInt(sanitizedData.remainingSessions as any, 10);
        sanitizedData.remainingSessions = isNaN(parsed) ? 0 : parsed;
      }

      // Cleanup other potentially empty strings to null or delete them if rules prefer
      Object.keys(sanitizedData).forEach((key) => {
        if ((sanitizedData as any)[key] === undefined) {
          delete (sanitizedData as any)[key];
        }
      });

      await updateDoc(doc(db, "clients", clientId), {
        ...sanitizedData,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleAddEvent = async () => {
    if (!clientId || !client || !newEventForm.title || !newEventForm.date)
      return;
    setIsSavingEvent(true);
    try {
      let priority: "High" | "Medium" | "Low" = "Low";
      if (
        newEventForm.type === "Progress Report" ||
        newEventForm.type === "InBody Scan"
      )
        priority = "High";
      else if (newEventForm.type === "Routine Change") priority = "Medium";

      const newEvent = {
        id: Math.random().toString(36).substring(2, 9),
        ...newEventForm,
        priority,
        createdAt: new Date().toISOString(),
      };

      const updatedEvents = [...(client.events || []), newEvent];
      await updateDoc(doc(db, "clients", clientId), {
        events: updatedEvents,
        updatedAt: serverTimestamp(),
      });
      setNewEventForm({
        date: new Date().toISOString().split("T")[0],
        title: "",
        type: "Other",
        notes: "",
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!clientId || !client?.events) return;
    try {
      const updatedEvents = client.events.filter((e) => e.id !== eventId);
      await updateDoc(doc(db, "clients", clientId), {
        events: updatedEvents,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    }
  };

  const handleSaveSessionCount = async () => {
    if (!clientId) return;
    const num = parseInt(sessionCountInput, 10);
    if (isNaN(num)) return;

    try {
      await updateDoc(doc(db, "clients", clientId), {
        sessionCount: num,
        updatedAt: serverTimestamp(),
      });
      setIsEditingSessionCount(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    }
  };

  const handleToggleRoutineB = async (checked: boolean) => {
    if (!clientId) return;
    try {
      await updateDoc(doc(db, "clients", clientId), {
        isRoutineBActive: checked,
        updatedAt: serverTimestamp(),
      });
      setInfoForm((prev) => ({ ...prev, isRoutineBActive: checked }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    }
  };

  const toggleMachineInRoutine = (routineName: string, machineId: string) => {
    const current = stagedMachineIds[routineName] || [];
    const next = current.includes(machineId)
      ? current.filter((id) => id !== machineId)
      : [...current, machineId];

    setStagedMachineIds((prev) => ({ ...prev, [routineName]: next }));
  };

  const handleSaveRoutineConfig = async (routineName: string) => {
    if (!clientId) return;
    const machineIds = stagedMachineIds[routineName] || [];

    setIsSavingRoutine((prev) => ({ ...prev, [routineName]: true }));
    try {
      const existing = routines.find((r) => r.name === routineName);
      if (existing) {
        await updateDoc(doc(db, "routines", existing.id!), {
          machineIds,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "routines"), {
          clientId,
          name: routineName,
          machineIds,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "routines");
    } finally {
      setIsSavingRoutine((prev) => ({ ...prev, [routineName]: false }));
    }
  };

  const handleApplyTemplate = (
    templateType: RoutineTemplateType,
    routineName: string,
  ) => {
    if (!clientId) return;

    const templateNames = ROUTINE_TEMPLATES[templateType];
    const machineIds = templateNames
      .map(
        (name) =>
          machines.find((m) => m.name === name || m.fullName === name)?.id,
      )
      .filter((id): id is string => !!id);

    setStagedMachineIds((prev) => ({ ...prev, [routineName]: machineIds }));

    if (routineName?.includes("Routine B")) {
      handleToggleRoutineB(true);
    }
  };

  useEffect(() => {
    if (!clientId || hasQuotaError) return;

    // Routines fetch (can stay as getDocs or become onSnapshot, let's keep getDocs for now or make it onSnapshot too)
    const routinesQuery = query(
      collection(db, "routines"),
      where("clientId", "==", clientId),
    );
    const unsubRoutines = onSnapshot(routinesQuery, (snap) => {
      const routinesData = snap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as Routine,
      );
      setRoutines(routinesData);
      
      setStagedMachineIds((prev) => {
        const newStaged: Record<string, string[]> = { ...prev };
        routinesData.forEach((r) => {
          if (!prev[r.name]) {
            newStaged[r.name] = r.machineIds;
          }
        });
        return newStaged;
      });
    }, (error) => handleFirestoreError(error, OperationType.GET, "routines"));

    return () => unsubRoutines();
  }, [clientId, hasQuotaError]);

  const fetchLogsForSessions = async (sessionIds: string[]) => {
    if (sessionIds.length === 0) return [];
    const chunks = [];
    for (let i = 0; i < sessionIds.length; i += 30) {
      chunks.push(sessionIds.slice(i, i + 30));
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
        ...snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ExerciseLog),
      ];
    }
    return fetchedLogs;
  };

  useEffect(() => {
    if (!clientId || hasQuotaError) return;

    if (
      activeTab !== "overview" &&
      activeTab !== "history" &&
      activeTab !== "statistics"
    ) {
      return;
    }

    // 2. Firebase Query Limits & Pagination
    // Always restrict the initial query to 10 to save massive memory/bandwidth.
    const sessionsQuery = query(
      collection(db, "sessions"),
      where("clientId", "==", clientId),
      orderBy("date", "desc"),
      limit(10) // STRICT LIMIT 10
    );

    const unsubSessions = onSnapshot(sessionsQuery, async (sessionSnap) => {
      const docs = sessionSnap.docs;
      
      if (!docs.length) {
        setSessions([]);
        setAllLogs([]);
        setHasMoreSessions(false);
        return;
      }

      setLastVisibleSession(docs[docs.length - 1]);
      setHasMoreSessions(docs.length === 10);

      const liveSessionsData = docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
      );

      // Merge gracefully to not erase older paginated history if coach loaded more
      setSessions((prev: WorkoutSession[]) => {
        const merged = new Map(prev.map(s => [s.id, s]));
        liveSessionsData.forEach(s => merged.set(s.id, s));
        const finalArr = Array.from(merged.values());
        finalArr.sort((a, b) => parseSessionDate(b.date) - parseSessionDate(a.date));
        return finalArr;
      });

      const sessionIds = liveSessionsData.map(s => s.id!).filter(Boolean);
      const newLogs = await fetchLogsForSessions(sessionIds);
      
      setAllLogs((prev) => {
        const merged = new Map(prev.map(l => [l.id, l]));
        newLogs.forEach(l => merged.set(l.id, l));
        return Array.from(merged.values());
      });

    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "sessions");
    });

    return () => unsubSessions();
  }, [clientId, activeTab, hasQuotaError]);

  const handleLoadMoreHistory = async () => {
    if (!lastVisibleSession || !hasMoreSessions || isLoadingMore || !clientId) return;
    setIsLoadingMore(true);
    try {
      const moreQuery = query(
        collection(db, "sessions"),
        where("clientId", "==", clientId),
        orderBy("date", "desc"),
        startAfter(lastVisibleSession),
        limit(10)
      );
      const snap = await getDocs(moreQuery);
      if (snap.empty) {
        setHasMoreSessions(false);
        return;
      }
      
      setLastVisibleSession(snap.docs[snap.docs.length - 1]);
      setHasMoreSessions(snap.docs.length === 10);

      const moreSessionsData = snap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
      );

      const sessionIds = moreSessionsData.map(s => s.id!).filter(Boolean);
      const moreLogs = await fetchLogsForSessions(sessionIds);

      setSessions(prev => {
        const out = [...prev, ...moreSessionsData].sort((a, b) => parseSessionDate(b.date) - parseSessionDate(a.date));
        return Array.from(new Map(out.map(s => [s.id, s])).values()); 
      });
      setAllLogs(prev => [...prev, ...moreLogs]);
      
    } catch (err) {
      console.error("Error loading older history", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
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
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "clientMachineSettings");
      },
    );

    return () => unsubscribe();
  }, [clientId]);

  useEffect(() => {
    if (!clientId || hasQuotaError) return;
    if (activeTab !== "overview" && activeTab !== "focus") return;

    const fetchFocuses = async () => {
      try {
        const focusQ = query(
          collection(db, "trainerFocuses"),
          where("clientId", "==", clientId),
          orderBy("updatedAt", "desc"),
        );
        const snap = await getDocs(focusQ);
        setTrainerFocuses(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as TrainerFocus,
          ),
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "trainerFocuses");
      }
    };

    fetchFocuses();
  }, [clientId]);

  useEffect(() => {
    if (!clientId || hasQuotaError || !user) return;
    if (activeTab !== "statistics") return;

    const q = query(
      collection(db, "progressReports"),
      where("clientId", "==", clientId),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      setProgressReports(
        snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as ProgressReport,
        ),
      );
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "progressReports");
    });

    return () => unsubscribe();
  }, [clientId, activeTab, user?.uid]);

  useEffect(() => {
    if (!clientId || !user) return;
    const q = query(
      collection(db, "schedules"),
      where("clientId", "==", clientId),
      where("startTime", ">=", Timestamp.now()),
      orderBy("startTime", "asc"),
      limit(2),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setScheduledSessions(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as ScheduleEntry,
          ),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "schedules");
      },
    );
    return () => unsubscribe();
  }, [clientId, user?.uid]);

  useEffect(() => {
    const myFocus = trainerFocuses.find((f) => f.trainerId === authTrainer?.id);
    if (myFocus) {
      setFocusForm({
        category: myFocus.category,
        notes: myFocus.notes,
      });
    }
  }, [trainerFocuses, authTrainer]);

  const handleSaveFocus = async () => {
    if (!clientId || !authTrainer) return;
    setIsSavingFocus(true);
    try {
      const myFocus = trainerFocuses.find(
        (f) => f.trainerId === authTrainer.id,
      );
      const focusData = {
        clientId,
        trainerId: authTrainer.id,
        trainerName: authTrainer.fullName,
        category: focusForm.category,
        notes: focusForm.notes,
        updatedAt: serverTimestamp(),
      };

      if (myFocus) {
        await updateDoc(doc(db, "trainerFocuses", myFocus.id!), focusData);
      } else {
        await addDoc(collection(db, "trainerFocuses"), focusData);
      }
      setIsEditingFocus(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "trainerFocuses");
    } finally {
      setIsSavingFocus(false);
    }
  };

  const handleSaveRoutine = async () => {
    if (!clientId || !isEditingRoutine) return;

    const original = routines.find((r) => r.id === isEditingRoutine);
    if (!original) return;

    try {
      // 1. Update existing routine
      await updateDoc(doc(db, "routines", isEditingRoutine), {
        name: routineEditData.name,
        machineIds: routineEditData.machineIds,
        updatedAt: serverTimestamp(),
      });

      // 2. Log adjustment in backend for history
      await addDoc(collection(db, "routineAdjustments"), {
        routineId: isEditingRoutine,
        clientId,
        previousMachineIds: original.machineIds,
        newMachineIds: routineEditData.machineIds,
        trainerId: authTrainer?.id || "unknown",
        createdAt: serverTimestamp(),
      });

      setIsEditingRoutine(null);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `routines/${isEditingRoutine}`,
      );
    }
  };

  const startEditRoutine = (routine: Routine) => {
    setIsEditingRoutine(routine.id!);
    setRoutineEditData({
      name: routine.name,
      machineIds: [...routine.machineIds],
    });
  };

  // Task 3: Aggressive Memoization
  const memoizedCompletedSessionsAsc = useMemo(() => {
    return [...sessions]
      .filter((s) => s.status === "Completed")
      .sort((a, b) => parseSessionDate(a.date) - parseSessionDate(b.date));
  }, [sessions]);

  const memoizedCompletedSessionsDesc = useMemo(() => {
    return [...memoizedCompletedSessionsAsc].reverse();
  }, [memoizedCompletedSessionsAsc]);

  const memoizedEfficiencySessions = useMemo(() => {
    return memoizedCompletedSessionsAsc.filter((s) => s.startTime && s.endTime);
  }, [memoizedCompletedSessionsAsc]);

  const memoizedMachineStatsByDate = useMemo(() => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const machineStatsByDate: Record<string, Record<string, number>> = {};
    const machineWeightsByDate: Record<string, Record<string, number>> = {};
    const machineBaselines: Record<string, number> = {};

    [...allLogs]
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))
      .forEach((l) => {
        if (!l.weight) return;
        const w = parseInt(l.weight.toString() || "0");
        if (w > 0) {
          if (!machineBaselines[l.machineId]) {
            machineBaselines[l.machineId] = w;
          }
          const session = sessions.find((s) => s.id === l.sessionId);
          const time = l.createdAt?.toMillis?.() || 0;
          if (session && session.date && time >= sixtyDaysAgo.getTime()) {
            const dateStr = new Date(parseSessionDate(session.date)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            if (!machineStatsByDate[dateStr]) {
              machineStatsByDate[dateStr] = {};
            }
            if (!machineWeightsByDate[dateStr]) {
              machineWeightsByDate[dateStr] = {};
            }
            const base = machineBaselines[l.machineId];
            machineStatsByDate[dateStr][l.machineId] = ((w - base) / base) * 100;
            machineWeightsByDate[dateStr][l.machineId] = w;
          }
        }
      });
    return { machineStatsByDate, machineWeightsByDate, machineBaselines };
  }, [allLogs, sessions]);

  const memoizedVolumeByDate = useMemo(() => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const volumeByDate: Record<string, number> = {};

    memoizedCompletedSessionsAsc.forEach((session) => {
      const time = session.createdAt?.toMillis?.() || parseSessionDate(session.date);
      if (time >= sixtyDaysAgo.getTime()) {
        const sLogs = allLogs.filter((l) => l.sessionId === session.id);
        const totalVol = sLogs.reduce((acc, log) => {
          const w = parseInt(log.weight?.toString() || "0");
          const r = parseInt(log.reps?.toString() || "0");
          return acc + (w * r);
        }, 0);
        const dateStr = session.date ? new Date(parseSessionDate(session.date)).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
        if (dateStr) {
          volumeByDate[dateStr] = (volumeByDate[dateStr] || 0) + totalVol;
        }
      }
    });
    return volumeByDate;
  }, [memoizedCompletedSessionsAsc, allLogs]);

  if (!client)
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground opacity-20" />
        <p className="text-muted-foreground font-medium">
          Select a client to view their profile.
        </p>
        <Button onClick={() => setView("clients")}>Back to Clients</Button>
      </div>
    );

  if (routineBuilderTarget) {
    return (
      <RoutineBuilderView
        client={client}
        onBack={() => setRoutineBuilderTarget(null)}
        onSaveRoutine={(machineIds) => {
          setStagedMachineIds(prev => ({ ...prev, [routineBuilderTarget]: machineIds }));
          setRoutineBuilderTarget(null);
        }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1400px] mx-auto space-y-2 pb-8 px-2 sm:px-4"
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
              <div className="bg-[#F06C22]/10 border-2 border-[#F06C22]/20 rounded-3xl p-4 flex items-center gap-4 text-[#F06C22]">
                <AlertCircle className="w-6 h-6 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-black uppercase tracking-tight">
                    Discovery Consultation Pending (Stage 2)
                  </p>
                  <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">
                    Complete clinical baseline and occupational matrix in the 'Details' tab.
                  </p>
                </div>
                <Button
                  className="bg-[#F06C22] hover:bg-[#F06C22]/90 text-white text-[10px] font-black uppercase rounded-xl h-9 px-4 shadow-lg shadow-[#F06C22]/20"
                  onClick={() => setActiveTab("details")}
                >
                  Start Stage 2
                </Button>
              </div>
            </motion.div>
          );
        }

        if (progressReports.length === 0) {
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
                <AlertCircle className="w-6 h-6 flex-shrink-0" />
                <div>
                  <p className="text-xs font-black uppercase tracking-tight">
                    Report Required
                  </p>
                  <p className="text-[10px] font-bold opacity-80">
                    This client has no progress report on file. Please perform
                    an evaluation.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="ml-auto text-[10px] font-black uppercase hover:bg-red-500/10"
                  onClick={() => setView("progress-report")}
                >
                  Start Now
                </Button>
              </div>
            </motion.div>
          );
        }

        const lastDate = new Date(progressReports[0].date + "T12:00:00");
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
                <AlertCircle className="w-6 h-6 flex-shrink-0" />
                <div>
                  <p className="text-xs font-black uppercase tracking-tight">
                    Report Due {isOverdue ? "Yesterday" : `Soon`}
                  </p>
                  <p className="text-[10px] font-bold opacity-80">
                    {isOverdue
                      ? `The 3-month progress report was due on ${nextDueDate.toLocaleDateString()}.`
                      : `The next progress report is due on ${nextDueDate.toLocaleDateString()} (in ${diffDays} days).`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className={`ml-auto text-[10px] font-black uppercase ${isOverdue ? "hover:bg-red-500/10" : "hover:bg-amber-500/10"}`}
                  onClick={() => setView("progress-report")}
                >
                  Schedule Report
                </Button>
              </div>
            </motion.div>
          );
        }
        return null;
      })()}

      {/* Compact Header */}
      <div className="bg-gradient-to-br from-[#115E8D] to-slate-900 rounded-[16px] px-3 sm:px-4 py-3 mb-2 shadow-md relative overflow-hidden text-white flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 sm:gap-4 z-10 shrink-[2] min-w-0">
          <Button
            onClick={() => setView("clients")}
            variant="ghost"
            size="icon"
            className="shrink-0 text-white/70 hover:text-white hover:bg-white/10 -ml-1 sm:-ml-2 h-8 w-8 sm:h-10 sm:w-10 rounded-full"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/20 hidden sm:flex">
            <User className="w-5 h-5 text-white/50" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tighter leading-none m-0 truncate">
                {client.firstName} {client.lastName}
              </h2>
              <div className="flex items-center gap-1 group">
                <Badge
                  variant="outline"
                  className="bg-[#38BDF8]/10 text-[#38BDF8] border-[#38BDF8]/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(56,189,248,0.2)]"
                >
                  Session #{calculatedSessionCount + 1}
                </Badge>
                <button
                  onClick={() => {
                    setSessionCountInput(String(calculatedSessionCount));
                    setIsEditingSessionCount(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded-full"
                >
                  <Edit3 className="w-3 h-3 text-[#38BDF8]" />
                </button>
              </div>

              {/* Balance Badge */}
              <div className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(52,211,153,0.2)]"
                >
                  {client.remainingSessions ?? 0} Left
                </Badge>
              </div>
            </div>

            {/* Flair Row */}
            <div className="flex flex-wrap gap-2 mt-2 mb-2 items-center group/flair">
              {true && (
                <div
                  className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded border ${
                    client.packageTier === "6-Month"
                      ? "bg-[#38BDF8]/10 text-[#38BDF8] border-[#38BDF8]/50 shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                      : client.packageTier === "12-Month"
                        ? "bg-[#F06C22]/20 text-[#F06C22] border-[#F06C22]/50 shadow-[0_0_10px_rgba(240,108,34,0.3)]"
                        : client.packageTier === "18-Month"
                          ? "bg-gray-400/20 text-gray-200 border-gray-400/60 shadow-[0_0_15px_rgba(156,163,175,0.4)]"
                          : "bg-slate-700/20 text-slate-400 border-slate-700/50" +
                            ""
                  }`}
                >
                  {client.packageTier === "18-Month"
                    ? "18-Month VIP"
                    : client.packageTier === "12-Month"
                      ? "12-Month Tier"
                      : client.packageTier === "6-Month"
                        ? "6-Month Tier"
                        : "Prospect"}
                </div>
              )}
              {client.occupation && (
                <div className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded border bg-amber-500/10 text-amber-500 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                  {client.occupation}
                </div>
              )}
              {client.isRetired && (
                <div className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded border bg-purple-500/10 text-purple-400 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                  RETIRED
                </div>
              )}
              {false ? (
                <button
                  onClick={() => setActiveTab("details")}
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-white transition-colors flex items-center gap-1"
                >
                  + Add Tier
                </button>
              ) : (
                <button
                  onClick={() => setActiveTab("details")}
                  className="opacity-0 group-hover/flair:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded-full"
                >
                  <Edit3 className="w-3 h-3 text-slate-400" />
                </button>
              )}
            </div>
            
            {client.occupation && getErgonomicRisk(client.occupation) && (
              <div className="mt-1 mb-3 flex items-start gap-1.5 text-slate-400 bg-slate-800/50 p-2 rounded-lg border border-slate-700/50 w-fit max-w-full">
                <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span className="text-[10px] font-bold tracking-wide italic leading-snug">
                  <span className="text-slate-300 font-black uppercase not-italic mr-1 tracking-wider">Ergonomic Risk:</span> 
                  {getErgonomicRisk(client.occupation)}
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-white/80">
              <div className="flex items-center gap-1 bg-white/10 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-white/5 whitespace-nowrap">
                <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span>
                  LAST:{" "}
                  <span className="text-white">
                    {sessions[0]?.date
                      ? new Date(
                          sessions[0].date + "T12:00:00",
                        ).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "NONE"}
                  </span>
                </span>
              </div>
              {(() => {
                if (!scheduledSessions[0]) {
                  return (
                    <div className="flex items-center gap-1 bg-white/5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-white/40 border border-white/10 whitespace-nowrap">
                      <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      <span>NEXT: UNSCHEDULED</span>
                    </div>
                  );
                }

                const firstSessionDate =
                  scheduledSessions[0].startTime.toDate();
                const today = new Date();
                const isFirstSessionToday =
                  firstSessionDate.getDate() === today.getDate() &&
                  firstSessionDate.getMonth() === today.getMonth() &&
                  firstSessionDate.getFullYear() === today.getFullYear();

                if (isFirstSessionToday) {
                  const timeStr = firstSessionDate.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  let nextStr = "";
                  if (scheduledSessions[1]) {
                    const nextDate = scheduledSessions[1].startTime.toDate();
                    nextStr = ` | Next: ${nextDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
                  }
                  return (
                    <div className="flex items-center gap-1 bg-[#F06C22]/20 text-[#F06C22] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-[#F06C22]/30 shadow-[0_0_10px_rgba(240,108,34,0.3)] whitespace-nowrap">
                      <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      <span>
                        Today @ {timeStr}{" "}
                        <span className="font-black text-white">{nextStr}</span>
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="flex items-center gap-1 bg-[#F06C22]/20 text-[#F06C22] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-[#F06C22]/30 shadow-[0_0_10px_rgba(240,108,34,0.3)] whitespace-nowrap">
                    <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    <span>
                      NEXT:{" "}
                      <span className="font-black text-white">
                        {firstSessionDate.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 z-10 shrink-0 ml-auto">
          <Button
            onClick={() => setView("workouts")}
            className="bg-[#F06C22] hover:bg-[#F06C22]/90 text-white rounded-lg font-black uppercase text-xs sm:text-sm tracking-widest h-9 sm:h-10 px-4 sm:px-6 shadow-[0_0_15px_rgba(240,108,34,0.5)] border-none shrink-0"
          >
            START SESSION
          </Button>
        </div>

        <div className="absolute -right-20 -top-20 opacity-[0.03] pointer-events-none">
          <Dumbbell className="w-[300px] h-[300px]" />
        </div>
      </div>

      <Tabs
        value={activeTab}
        className="w-full flex-1 flex flex-col min-h-0"
        onValueChange={setActiveTab}
      >
        <div className="mb-3 w-full">
          <div className="overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar">
            <TabsList className="bg-transparent p-0 flex flex-nowrap w-max gap-1.5 h-auto">
              {[
                { val: "overview", label: "Journey" },
                { val: "equipment", label: "Equipment" },
                { val: "routines", label: "Routines" },
                { val: "focus", label: "Focus" },
                { val: "details", label: "Details" },
                { val: "history", label: "History" },
                { val: "statistics", label: "Statistics" },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.val}
                  value={tab.val}
                  className="flex-none min-w-[80px] rounded-full border border-slate-200 h-[40px] px-4 font-black uppercase text-[10px] tracking-widest text-[#68717A] bg-transparent data-[state=active]:border-transparent data-[state=active]:bg-[#115E8D] data-[state=active]:text-white transition-all data-[state=active]:shadow-sm snap-center"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <TabsContent value="equipment">
           <ClientEquipmentPrescriptions client={client} clientId={clientId} machines={machines} clientSettings={clientSettings} clientBodyWeight={parseInt(client?.weight || '150', 10)} allLogs={allLogs} />
        </TabsContent>

        <TabsContent
          value="overview"
          className="mt-0 flex-1 overflow-hidden min-h-0 flex flex-col rounded-xl relative"
        >
          <div className="flex items-center justify-between mb-3 px-2 flex-none">
             <h3 className="text-[13px] font-black uppercase text-slate-800 tracking-widest pl-1 border-l-4 border-[#F06C22]">Recent Journey</h3>
             <Button
               onClick={() => setShowFullChart(true)}
               size="sm"
               variant="outline"
               className="h-10 px-5 text-[10px] uppercase font-black tracking-widest text-slate-700 hover:text-[#115E8D] border-slate-300 shadow-sm transition-all hover:bg-slate-50 rounded-full"
             >
               <Maximize2 className="w-3.5 h-3.5 mr-1.5" /> Expanded Journey
             </Button>
          </div>
          <div className="w-full flex-1 overflow-hidden bg-white shadow-sm border border-slate-200 rounded-xl relative">
            <table className="w-full text-left border-collapse table-fixed select-none min-w-full">
              <thead>
                <tr className="bg-[#115E8D] text-white uppercase text-[9px] font-black tracking-widest leading-none h-[32px]">
                  <th className="p-1.5 pl-4 w-[28%] border-r border-[#115E8D]/20 truncate">
                    Equipment & Settings
                  </th>
                  {sessions
                    .slice(0, 6)
                    .reverse()
                    .map((s, sIdx) => {
                      const displaySessions = sessions.slice(0, 6).reverse();
                      const globalIndexIdx = sessions.findIndex(sess => sess.id === s.id);
                      // Calculate purely based on history length to fix inconsistencies from deleted/imported logs
                      const totalRecords = Math.max(calculatedSessionCount, sessions.length);
                      const sNum = totalRecords - globalIndexIdx;
                      
                      return (
                        <th
                          key={s.id}
                          className="p-1.5 text-center border-r border-[#115E8D]/20 truncate w-[10%] opacity-90"
                        >
                          <div className="flex flex-col items-center space-y-0.5">
                            <div className="bg-white/10 border border-white/20 rounded px-1 py-0 shadow-sm">
                              <span className="text-white font-black tabular-nums text-[9px] leading-none">
                                {sNum.toString().padStart(2, '0')}
                              </span>
                            </div>
                            <span className="text-[7px] text-white/70 font-bold uppercase tracking-tighter">
                              {s.date ? new Date(parseSessionDate(s.date)).toLocaleDateString("en-US", {
                                month: "2-digit",
                                day: "2-digit",
                              }) : "--"}
                            </span>
                            <span className="text-[6px] text-[#38BDF8] font-bold uppercase tracking-tighter">
                              {(s.legacy_filemaker_id || s.trainerId === 'legacy-trainer' || s.trainerInitials === 'Legacy' || s.trainerInitials === 'Chart') ? 'Imported' : s.startTime ? new Date(s.startTime?.toMillis?.() || s.startTime).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  <th className="p-1.5 text-center bg-[#F06C22] text-white truncate w-[12%] border-l shadow-inner border-[#F06C22]/80">
                    TARGET
                  </th>
                </tr>
              </thead>
              <tbody className="text-[#115E8D] border-t border-slate-200">
                {machines
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((machine, idx) => {
                    const machineLogs = allLogs.filter(
                      (l) => l.machineId === machine.id,
                    );
                    const displaySessions = sessions.slice(0, 6).reverse();
                    const targetLog =
                      displaySessions.length > 0
                        ? machineLogs.find(
                            (l) =>
                              l.sessionId ===
                              displaySessions[displaySessions.length - 1].id,
                          )
                        : null;

                    return (
                      <tr
                        key={machine.id}
                        onClick={() => {
                          const currentSettings = clientSettings[machine.id!]?.settings || {};
                          setEditingSettings({ machineId: machine.id!, settings: { ...currentSettings } });
                        }}
                        className="even:bg-[#F9FAFB] odd:bg-white hover:bg-slate-100 hover:brightness-95 cursor-pointer transition-all h-[32px] group border-b border-slate-100 last:border-b-0"
                      >
                        <td className="p-1 pl-4 border-r border-slate-200/60 truncate align-middle relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#115E8D]/0 group-hover:bg-[#115E8D] transition-colors" />
                          <div className="flex flex-col justify-center translate-y-[1px]">
                            <div className="flex items-center gap-1.5 mb-0.5 max-w-full">
                              <span className={cn(
                                "font-black uppercase tracking-tighter text-[9px] px-1.5 py-0.5 rounded-[4px] border leading-none truncate shrink-0 max-w-full inline-flex items-center justify-between",
                                getMuscleGroupColor(machine.name)
                              )}>
                                <span>{machine.name}</span>
                                {isBig5Machine(machine.name) && (
                                  <Star className="w-2.5 h-2.5 ml-1 fill-amber-400 text-amber-500 inline shrink-0" />
                                )}
                              </span>
                              {clientSettings[machine.id!]?.machineNotes?.some(
                                (n) => n.isImportant,
                              ) && (
                                <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                              )}
                            </div>
                            <span className="text-[7.5px] font-bold text-[#68717A] opacity-70 tracking-widest truncate leading-none uppercase">
                              {clientSettings[machine.id!]?.settings
                                ? Object.entries(
                                    clientSettings[machine.id!].settings,
                                  )
                                    .map(([k, v]) => `${k}:${v}`)
                                    .join(" ")
                                : "---"}
                            </span>
                          </div>
                        </td>
                        {displaySessions.map((s, sIdx) => {
                          const log = machineLogs.find(
                            (l) => l.sessionId === s.id,
                          );
                          const isLast = sIdx === displaySessions.length - 1;
                          const promptIncrease =
                            isLast && log?.repQuality === 3;

                          return (
                            <td
                              key={s.id}
                              className="p-0 border-r border-slate-200/60 align-middle px-1"
                            >
                              {log ? (
                                <div className="flex flex-col items-center justify-center leading-none tracking-tighter">
                                  <div className="flex items-center gap-0.5 mb-[2px]">
                                    <span
                                      className={`font-black text-[11px] sm:text-[12px] ${isLast ? "text-black" : "text-slate-700"}`}
                                    >
                                      {log.weight}
                                    </span>
                                    {promptIncrease && (
                                      <span className="text-[8px] text-[#F06C22] shrink-0 font-black ml-0.5 mt-[1px]">
                                        ▲
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span
                                      className={`font-extrabold text-[9px] ${
                                        isLast
                                          ? log.repQuality === 3
                                            ? "text-emerald-700"
                                            : log.repQuality === 2
                                              ? "text-amber-700"
                                              : log.repQuality === 1
                                                ? "text-rose-700"
                                                : "text-[#115E8D]"
                                          : log.repQuality === 3
                                            ? "text-emerald-700/80"
                                            : log.repQuality === 2
                                              ? "text-amber-700/80"
                                              : log.repQuality === 1
                                                ? "text-rose-700/80"
                                                : "text-slate-500"
                                      }`}
                                    >
                                      {log.repsLeft !== undefined &&
                                      log.repsRight !== undefined
                                        ? `${log.repsLeft}L|${log.repsRight}R`
                                        : log.isStaticHold
                                          ? `${log.seconds}s`
                                          : log.reps}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center w-full">
                                  <span className="text-[9px] text-slate-300 font-medium">
                                    --
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-0 text-center bg-[#F06C22]/[0.03] align-middle px-1 group-hover:bg-[#F06C22]/10 transition-colors">
                          {targetLog ? (
                            <div className="flex flex-col items-center opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                              <div className="flex items-center gap-0.5 mb-[2px]">
                                <span className="font-black text-[11px] sm:text-[12px] text-[#F06C22]">
                                  {targetLog.repQuality === 3
                                    ? Number(targetLog.weight) + 5
                                    : targetLog.weight}
                                </span>
                              </div>
                              <span className="font-extrabold text-[9px] text-[#F06C22]/70">
                                {targetLog.repsLeft !== undefined &&
                                targetLog.repsRight !== undefined
                                  ? `${targetLog.repsLeft}L|${targetLog.repsRight}R`
                                  : targetLog.isStaticHold
                                    ? `${targetLog.seconds}s`
                                    : targetLog.reps}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[9px] text-[#F06C22]/40 font-bold uppercase">
                              ---
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="routines">
          <div className="grid gap-6 lg:grid-cols-2">
            {["Routine A", "Routine B"].map((routineName) => {
              const routine = routines.find((r) => r.name === routineName);
              const isActiveB =
                routineName === "Routine B" && client?.isRoutineBActive;
              const isDisabled =
                routineName === "Routine B" && !client?.isRoutineBActive;

              if (isDisabled) {
                return (
                  <Card
                    key={routineName}
                    className="rounded-[40px] border-2 border-dashed border-muted flex items-center justify-center p-12 opacity-50"
                  >
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                        <Settings className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                      <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                        Routine B Inactive
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl font-bold text-xs"
                        onClick={() => handleToggleRoutineB(true)}
                      >
                        Enable Optional Protocol
                      </Button>
                    </div>
                  </Card>
                );
              }

              return (
                <Card
                  key={routineName}
                  className={`rounded-[40px] border-2 shadow-xl overflow-hidden ${routineName === "Routine B" ? "border-amber-500/20 bg-amber-500/[0.02]" : ""}`}
                >
                  <CardHeader className="p-8 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black italic shadow-lg ${routineName === "Routine B" ? "bg-amber-500 text-white shadow-amber-500/20" : "bg-primary text-white shadow-primary/20"}`}
                        >
                          {routineName.split(" ")[1]}
                        </div>
                        <div>
                          <CardTitle className="text-xl font-black uppercase italic tracking-tighter">
                            {routineName}
                          </CardTitle>
                          <CardDescription className="text-[10px] font-bold uppercase tracking-widest">
                            Protocol Definition
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-xl font-black uppercase text-[9px] border-sky-500/50 text-sky-600 hover:bg-sky-50"
                          onClick={() => setRoutineBuilderTarget(routineName)}
                        >
                          <Settings className="w-3 h-3 mr-1" />
                          Launch AI Builder
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-xl font-black uppercase text-[9px] border-dashed"
                          onClick={() =>
                            handleApplyTemplate("STANDARD_MALE", routineName)
                          }
                        >
                          Apply Template
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 pt-4">
                    <div className="max-h-[500px] sm:max-h-[600px] overflow-y-auto pr-2 custom-scrollbar py-2 space-y-6">
                      {Object.entries(
                        machines
                          .sort((a, b) => (a.order || 0) - (b.order || 0))
                          .reduce((acc, machine) => {
                            const region = machine.anatomicalRegion || 'Other';
                            if (!acc[region]) acc[region] = [];
                            acc[region].push(machine);
                            return acc;
                          }, {} as Record<string, Machine[]>)
                      ).map(([region, regionMachines]) => (
                        <div key={region} className="space-y-3">
                          <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-200 pb-1 sticky top-0 bg-white z-20">
                            {region}
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                            {regionMachines.map((machine) => {
                              const routineMachineIds =
                                stagedMachineIds[routineName] || [];
                              const isIn = routineMachineIds.includes(machine.id!);
                              const seqPosition = isIn
                                ? routineMachineIds.indexOf(machine.id!) + 1
                                : null;

                              return (
                                <button
                                  key={machine.id}
                                  onClick={() =>
                                    toggleMachineInRoutine(routineName, machine.id!)
                                  }
                                  className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all text-left relative group
                                  ${
                                    isIn
                                      ? "bg-primary/5 border-primary shadow-md z-10"
                                      : "bg-muted/10 border-transparent opacity-40 hover:opacity-100 hover:border-muted"
                                  }`}
                                >
                                  <div
                                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 transition-all
                                  ${
                                    isIn
                                      ? "bg-primary text-white shadow-lg"
                                      : "bg-muted text-muted-foreground border-2 border-dashed border-muted-foreground/10"
                                  }`}
                                  >
                                    {isIn ? (
                                      <span className="font-black text-[10px] sm:text-xs">
                                        {seqPosition}
                                      </span>
                                    ) : (
                                      <Plus className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <span
                                      className={`text-[10px] sm:text-[11px] font-black uppercase tracking-tight truncate block ${isIn ? "text-primary" : "text-muted-foreground"}`}
                                    >
                                      {machine.name}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter className="p-8 pt-0 border-t border-border/10 mt-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">
                        {stagedMachineIds[routineName]?.length || 0} Units
                        Assigned
                      </p>
                      {JSON.stringify(stagedMachineIds[routineName]) !==
                        JSON.stringify(
                          routines.find((r) => r.name === routineName)
                            ?.machineIds || [],
                        ) && (
                        <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest animate-pulse">
                          Pending Changes
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {routineName === "Routine B" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 font-bold text-[10px] uppercase"
                          onClick={() => handleToggleRoutineB(false)}
                        >
                          Disable
                        </Button>
                      )}
                      <Button
                        onClick={() => handleSaveRoutineConfig(routineName)}
                        disabled={isSavingRoutine[routineName]}
                        className="h-10 rounded-xl font-black uppercase italic text-[10px] tracking-widest px-6 bg-primary shadow-lg shadow-primary/20"
                      >
                        {isSavingRoutine[routineName]
                          ? "Saving..."
                          : "Apply Routine"}
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="focus" className="mt-0 flex-1 overflow-hidden min-h-0 bg-[#0A2E46] rounded-xl shadow-sm border border-slate-700">
          {client && authTrainer && (
            <ClientFocusDashboard 
              client={client} 
              trainer={authTrainer} 
              machines={machines} 
            />
          )}
        </TabsContent>

        <TabsContent value="history" className="h-[750px] relative pb-20 overflow-y-auto custom-scrollbar">
          <div className="space-y-6">
            {clientId && (
              <div className="flex flex-col gap-4">
                <ClientHistoryCalendar
                  clientId={clientId}
                  machines={machines}
                  trainers={trainers}
                  user={user}
                  allLogs={allLogs}
                />
                
                <div className="flex justify-center pb-8">
                  <Button 
                    variant="outline" 
                    onClick={() => setSessionLimit(prev => prev + 30)}
                    className="border-[#38BDF8]/50 text-[#38BDF8] hover:bg-[#38BDF8]/10 font-black tracking-widest uppercase text-[10px] h-12 rounded-2xl px-6"
                  >
                    Load More Sessions
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>



        <TabsContent value="statistics" className="space-y-6">
          <Card className="rounded-[40px] border-2 shadow-xl overflow-hidden min-h-[300px]">
            <CardHeader className="p-8 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-xl font-black uppercase italic tracking-tighter">
                    Progress Report Archive
                  </CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">
                    Evaluations, Goals & Outcomes
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setView("progress-report")}
                  variant="default"
                  size="sm"
                  className="rounded-xl font-black uppercase text-[10px] tracking-widest h-11 bg-primary"
                >
                  <Plus className="w-4 h-4 mr-2" /> New Evaluation
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y relative max-h-[400px] overflow-y-auto custom-scrollbar">
                {progressReports.length > 0 ? (
                  progressReports
                    .sort(
                      (a, b) =>
                        parseSessionDate(b.date) - parseSessionDate(a.date),
                    )
                    .map((report) => (
                      <div
                        key={report.id}
                        className="p-6 hover:bg-muted/30 transition-colors group flex items-center justify-between"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-muted/50 flex flex-col items-center justify-center border group-hover:bg-primary/5 group-hover:border-primary/20 transition-all font-black uppercase italic text-primary">
                            <span className="text-[10px] leading-none">
                              {report.date.split("-")[1]}/
                              {report.date.split("-")[2]}
                            </span>
                            <span className="text-[8px] opacity-30 mt-1">
                              {report.date.split("-")[0]}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-black italic uppercase tracking-tight text-foreground">
                                Client Progress Evaluation
                              </p>
                              <Badge
                                variant={
                                  report.status === "Finalized"
                                    ? "default"
                                    : "secondary"
                                }
                                className={`px-1.5 py-0 h-4 text-[8px] font-black uppercase border-none ${report.status === "Finalized" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}
                              >
                                {report.status || "Finalized"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-1">
                              <span className="text-[9px] text-muted-foreground font-black uppercase tracking-widest bg-muted px-2 py-0.5 rounded">
                                Session #{report.sessionNumber || Math.round(report.attendance?.totalSessions) || "---"}
                              </span>
                              <span className="text-[9px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                                <User className="w-2.5 h-2.5" />
                                {report.trainerName || report.trainerInitials || "Team"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (confirm('Are you sure you want to delete this progress report?')) {
                                try {
                                  await deleteDoc(doc(db, 'progressReports', report.id!));
                                } catch (err) {
                                  handleFirestoreError(err, OperationType.DELETE, 'progressReports');
                                }
                              }
                            }}
                            className="rounded-xl font-black uppercase italic text-[10px] tracking-widest text-red-500 hover:text-red-600 hover:bg-red-500/10 mr-2"
                          >
                            <Trash2 className="w-3 h-3 md:mr-2" />
                            <span className="hidden md:inline">Delete</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSelectReport(report.id!)}
                            className="rounded-xl font-black uppercase italic text-[10px] tracking-widest text-primary"
                          >
                            {report.status === "Draft"
                              ? "Resume Draft"
                              : "View / Present"}
                          </Button>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="p-12 text-center space-y-4">
                    <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto opacity-20" />
                    <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">
                      No progress reports registered in archive
                    </p>
                    <Button
                      variant="outline"
                      className="rounded-xl font-black uppercase text-[10px] tracking-widest border-2 mt-4"
                      onClick={() => setView("progress-report")}
                    >
                      Perform First Evaluation
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Consistency & Training Frequency Insights */}
          {(() => {
            const completedSessions = sessions.filter(s => s.status === 'Completed').sort((a,b) => parseSessionDate(a.date) - parseSessionDate(b.date));
            if (completedSessions.length === 0) return null;

            const firstDate = client.firstSessionDate 
              ? new Date(client.firstSessionDate?.toDate?.() || client.firstSessionDate)
              : new Date(parseSessionDate(completedSessions[0].date));
            
            let totalRestDays = 0;
            let restIntervals = 0;
            for (let i = 1; i < completedSessions.length; i++) {
              const prev = parseSessionDate(completedSessions[i - 1].date);
              const curr = parseSessionDate(completedSessions[i].date);
              const diffDays = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));
              if (diffDays > 0) {
                totalRestDays += diffDays;
                restIntervals++;
              }
            }
            const avgRestDays = restIntervals > 0 ? (totalRestDays / restIntervals).toFixed(1) : 'N/A';

            const timeRanges = { Morning: 0, Afternoon: 0, Evening: 0 };
            completedSessions.forEach(s => {
              let hour = 12;
              if (s.startTime?.toDate) {
                hour = s.startTime.toDate().getHours();
              } else if (s.createdAt?.toDate) {
                hour = s.createdAt.toDate().getHours();
              }
              if (hour < 12) timeRanges.Morning++;
              else if (hour < 17) timeRanges.Afternoon++;
              else timeRanges.Evening++;
            });
            const favoriteTime = Object.keys(timeRanges).reduce((a, b) => timeRanges[a as keyof typeof timeRanges] > timeRanges[b as keyof typeof timeRanges] ? a : b);

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const sessionsPast30 = completedSessions.filter(s => parseSessionDate(s.date) >= thirtyDaysAgo.getTime()).length;
            const past30Weeks = 30 / 7;
            const avgPerWeek30 = (sessionsPast30 / past30Weeks).toFixed(1);

            const lifetimeDays = Math.max(1, Math.floor((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
            const lifetimeWeeks = lifetimeDays / 7;
            const avgPerWeekLife = (completedSessions.length / Math.max(1, lifetimeWeeks)).toFixed(1);

            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="rounded-[32px] overflow-hidden border-2 shadow-sm bg-gradient-to-br from-card to-card hover:border-primary/30 transition-all group">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <CalendarDays className="w-4 h-4 text-primary" />
                      </div>
                      <p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Origin</p>
                    </div>
                    <div className="text-2xl font-black italic tracking-tighter text-foreground">{firstDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                    <p className="text-[10px] font-bold text-muted-foreground mt-1 opacity-60">First Recorded App Session</p>
                  </CardContent>
                </Card>
                
                <Card className="rounded-[32px] overflow-hidden border-2 shadow-sm bg-gradient-to-br from-card to-card hover:border-emerald-500/30 transition-all group">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                      </div>
                      <p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Frequency</p>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="text-3xl font-black italic tracking-tighter text-foreground">{avgPerWeek30}</div>
                      <span className="text-xs font-bold uppercase mb-1.5 opacity-60">per week (30 Days)</span>
                    </div>
                    <p className="text-[10px] font-bold text-emerald-600 mt-1 uppercase tracking-widest leading-none bg-emerald-500/10 w-fit px-2 py-1 rounded">Lifetime: {avgPerWeekLife} / wk</p>
                  </CardContent>
                </Card>

                <Card className="rounded-[32px] overflow-hidden border-2 shadow-sm bg-gradient-to-br from-card to-card hover:border-amber-500/30 transition-all group">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Battery className="w-4 h-4 text-amber-500" />
                      </div>
                      <p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Recovery Avg</p>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="text-3xl font-black italic tracking-tighter text-foreground">{avgRestDays}</div>
                      <span className="text-xs font-bold uppercase mb-1.5 opacity-60">days</span>
                    </div>
                    <p className="text-[10px] font-bold text-amber-600 mt-1 uppercase tracking-widest leading-none bg-amber-500/10 w-fit px-2 py-1 rounded">Between sessions</p>
                  </CardContent>
                </Card>

                <Card className="rounded-[32px] overflow-hidden border-2 shadow-sm bg-gradient-to-br from-card to-card hover:border-indigo-500/30 transition-all group">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Clock className="w-4 h-4 text-indigo-500" />
                      </div>
                      <p className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Preferred Time</p>
                    </div>
                    <div className="text-2xl font-black italic tracking-tighter text-foreground">{favoriteTime}</div>
                    <p className="text-[10px] font-bold text-indigo-600 mt-1 uppercase tracking-widest leading-none bg-indigo-500/10 w-fit px-2 py-1 rounded">Routine Dominance</p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* 60-Day Overall Growth Chart */}
          {(() => {
            const machineStatsByDate = memoizedMachineStatsByDate.machineStatsByDate;
            const machineWeightsByDate = memoizedMachineStatsByDate.machineWeightsByDate;
            const allDatesSet = new Set<string>();
            Object.keys(machineStatsByDate).forEach(d => allDatesSet.add(d));

            const sortedDates = Array.from(allDatesSet).sort((a, b) => new Date(a + " " + new Date().getFullYear()).getTime() - new Date(b + " " + new Date().getFullYear()).getTime());
            
            let lastKnownStats: Record<string, number> = {};
            let lastKnownWeights: Record<string, number> = {};
            const seenMachines = new Set<string>();

            const growthChartData = sortedDates.map(dateStr => {
              const currentStats = machineStatsByDate[dateStr];
              const currentWeights = machineWeightsByDate[dateStr];
              const row: any = { date: dateStr };
              machines.forEach(m => {
                // If there's new data for this machine on this date
                if (currentStats && currentStats[m.id] !== undefined) {
                  row[m.id] = Math.round(currentStats[m.id] * 10) / 10;
                  row[m.id + '_weight'] = currentWeights[m.id];
                  lastKnownStats[m.id] = row[m.id];
                  lastKnownWeights[m.id] = row[m.id + '_weight'];

                  if (!seenMachines.has(m.id)) {
                    row[m.id + '_isFirst'] = true;
                    seenMachines.add(m.id);
                  }
                } 
                // Carry forward the previous known value for plateaus
                else if (lastKnownStats[m.id] !== undefined) {
                  row[m.id] = lastKnownStats[m.id];
                  row[m.id + '_weight'] = lastKnownWeights[m.id];
                }
              });
              return row;
            });

            const CustomGrowthTooltip = ({ active, payload }: any) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-[#0A2E46] border border-slate-700 p-3 rounded-lg shadow-xl min-w-[150px]">
                    <p className="text-[10px] uppercase tracking-widest text-[#68717A] mb-2">{data.date}</p>
                    <div className="space-y-1">
                      {payload.map((entry: any, index: number) => {
                        const machine = machines.find(m => m.id === entry.dataKey);
                        if (!machine) return null;
                        const weight = data[entry.dataKey + '_weight'];
                        return (
                          <div key={index} className="flex justify-between items-center text-xs">
                            <span style={{ color: entry.color }} className="font-bold truncate max-w-[80px]">{machine.name}</span>
                            <div className="flex items-center gap-2">
                              {weight !== undefined && (
                                <span className="text-slate-400 font-medium">{weight} lbs</span>
                              )}
                              <span className="font-black text-white">+{entry.value}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return null;
            };

            const OriginDot = (props: any) => {
              const { cx, cy, payload, dataKey } = props;
              if (payload[dataKey + "_isFirst"] && cx && cy) {
                return (
                  <circle cx={cx} cy={cy} r={5} fill={props.stroke} stroke="#0A2E46" strokeWidth={2} />
                );
              }
              return null;
            };

            // Colors for up to 20 machines (repeats if more)
            const strokeColors = [
              "#F06C22", "#38BDF8", "#34D399", "#FBBF24", "#F472B6", 
              "#A78BFA", "#4ADE80", "#F87171", "#60A5FA", "#3B82F6",
              "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899",
              "#14B8A6", "#84CC16", "#EAB308", "#6366F1", "#D946EF"
            ];

            return (
              <Card className="rounded-[40px] border-2 shadow-xl overflow-hidden bg-[#0A2E46] border-[#0A2E46]">
                <CardHeader className="p-8 border-b border-[#0A2E46]/80 bg-slate-900/40">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-xl font-black uppercase tracking-widest text-slate-300">
                        Individual Strength Progression
                      </CardTitle>
                      <CardDescription className="text-xs font-bold uppercase tracking-widest mt-2 text-[#F06C22]">
                        60-Day Machine Specifics (% Increase)
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8 h-[450px]"> {/* slightly taller space for legend to fit */}
                  {growthChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={growthChartData} margin={{ top: 20, right: 20, left: -20, bottom: 20 }} onMouseLeave={() => setActiveMachine(null)}>
                        <XAxis 
                          dataKey="date" 
                          stroke="#68717A" 
                          tick={{ fill: "#68717A", fontSize: 10, fontWeight: 700 }} 
                          tickMargin={10} 
                          axisLine={false} 
                          tickLine={false} 
                        />
                        <YAxis 
                          stroke="#68717A" 
                          tick={{ fill: "#68717A", fontSize: 10 }} 
                          axisLine={false} 
                          tickLine={false}
                          tickFormatter={(val) => `+${val}%`}
                        />
                        <RechartsTooltip content={<CustomGrowthTooltip />} />
                        <Legend 
                           wrapperStyle={{ paddingTop: "20px" }}
                           onMouseEnter={(e) => setActiveMachine(e.dataKey as string)}
                           onMouseLeave={() => setActiveMachine(null)}
                           onClick={(e) => setActiveMachine(activeMachine === e.dataKey ? null : e.dataKey as string)}
                           iconType="circle"
                        />
                        {machines.map((m, idx) => {
                          // Only render line if at least one data point exists for this machine
                          const hasData = growthChartData.some(d => d[m.id] !== undefined);
                          if (!hasData) return null;
                          
                          const isActive = activeMachine === m.id;
                          const isFaded = activeMachine !== null && !isActive;
                          
                          return (
                            <Line 
                              key={m.id}
                              name={m.name} // Legend uses name
                              type="stepAfter" // Make it a step chart to show plateaus clearly
                              dataKey={m.id} 
                              stroke={strokeColors[idx % strokeColors.length]} 
                              strokeWidth={3}
                              strokeOpacity={isFaded ? 0.15 : 1}
                              dot={<OriginDot />} // Only render the origin marker
                              activeDot={{ r: 6, fill: "#fff", strokeWidth: 2 }}
                              connectNulls
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30">
                      <TrendingUp className="w-12 h-12 text-[#68717A] mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest text-[#68717A]">Not enough data in the last 60 days</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* 60-Day Global Volume Chart */}
          {(() => {
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

            const volumeByDate: Record<string, number> = {};
            const completedSessions = sessions.filter(s => s.status === 'Completed').reverse(); // reverse chronological already reversed for rendering?
            const chronologicalSessions = [...completedSessions].sort((a,b) => parseSessionDate(a.date) - parseSessionDate(b.date));

            chronologicalSessions.forEach(session => {
               const time = getMillis(session.createdAt) || parseSessionDate(session.date);
               if (time >= sixtyDaysAgo.getTime()) {
                  const sLogs = allLogs.filter(l => l.sessionId === session.id);
                  const totalVol = sLogs.reduce((acc, log) => acc + calculateExerciseVolume(log), 0);
                  const dateStr = session.date ? new Date(parseSessionDate(session.date)).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                  if (dateStr) {
                    // Accumulate in case of multiple sessions a day
                    volumeByDate[dateStr] = (volumeByDate[dateStr] || 0) + totalVol;
                  }
               }
            });

            const volumeChartData = Object.keys(volumeByDate).map(dateStr => ({
               date: dateStr,
               volume: volumeByDate[dateStr]
            }));

            const CustomVolumeTooltip = ({ active, payload, label }: any) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-[#0A2E46] border border-slate-700 p-3 rounded-lg shadow-xl min-w-[120px]">
                    <p className="text-[10px] uppercase tracking-widest text-[#68717A] mb-1">{label}</p>
                    <p className="text-[#38BDF8] font-black text-xl leading-none">{payload[0].value.toLocaleString()} <span className="text-xs text-white">LBS</span></p>
                  </div>
                );
              }
              return null;
            };

            return (
              <Card className="rounded-[40px] border-2 shadow-xl overflow-hidden min-h-[400px]">
                <CardHeader className="p-8 border-b bg-muted/20">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-xl font-black uppercase italic tracking-tighter">
                        Total Volume Progression
                      </CardTitle>
                      <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">
                        60-Day Work Capacity Trend
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-black bg-[#38BDF8]/10 text-[#38BDF8] border-[#38BDF8]/20">
                      Workload
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-8 h-[350px]">
                  {volumeChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={volumeChartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#0A2E46" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="date" 
                          stroke="#68717A" 
                          tick={{ fill: "#68717A", fontSize: 10, fontWeight: 700 }} 
                          tickMargin={10} 
                          axisLine={false} 
                          tickLine={false} 
                        />
                        <YAxis 
                          stroke="#68717A" 
                          tick={{ fill: "#68717A", fontSize: 10 }} 
                          axisLine={false} 
                          tickLine={false}
                          tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}
                        />
                        <RechartsTooltip content={<CustomVolumeTooltip />} />
                        <Area 
                          type="monotone" 
                          dataKey="volume" 
                          stroke="#38BDF8" 
                          strokeWidth={4}
                          fillOpacity={1} 
                          fill="url(#colorVolume)" 
                          activeDot={{ r: 6, fill: "#fff", stroke: "#38BDF8", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30">
                      <TrendingUp className="w-12 h-12 text-[#68717A] mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest text-[#68717A]">Not enough data in the last 60 days</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <Card className="rounded-[40px] border-2 shadow-xl overflow-hidden min-h-[400px]">
            <CardHeader className="p-8 border-b bg-muted/20">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-xl font-black uppercase italic tracking-tighter">
                    Time Spent on Machines
                  </CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">
                    Efficiency & Pace Analytics
                  </CardDescription>
                </div>
                <div className="flex gap-4">
                  {(() => {
                    const completedSessions = sessions.filter(
                      (s) =>
                        s.status === "Completed" && s.startTime && s.endTime,
                    );
                    if (completedSessions.length === 0) return null;

                    const totalMins = completedSessions.reduce((acc, s) => {
                      return (
                        acc + (getMillis(s.endTime) - getMillis(s.startTime))
                      );
                    }, 0);
                    const avgMins = Math.round(
                      totalMins / completedSessions.length / 60000,
                    );

                    return (
                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase text-muted-foreground opacity-60">
                          Avg Session
                        </p>
                        <p className="text-sm font-black italic text-primary">
                          {avgMins}m
                        </p>
                      </div>
                    );
                  })()}
                  <Badge
                    variant="outline"
                    className="text-[9px] font-black bg-primary/10 text-primary border-primary/20"
                  >
                    Efficiency
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex flex-col md:flex-row h-[600px]">
              {/* Sidebar: Session List */}
              <div className="w-full md:w-64 border-r overflow-y-auto bg-muted/5 divide-y">
                {sessions
                  .filter((s) => s.status === "Completed")
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedTimingSessionId(s.id!)}
                      className={`w-full p-4 text-left hover:bg-white transition-all group ${selectedTimingSessionId === s.id ? "bg-white shadow-sm ring-1 ring-primary/5" : ""}`}
                    >
                      <p
                        className={`text-[10px] flex justify-between items-center font-black uppercase tracking-tighter ${selectedTimingSessionId === s.id ? "text-primary" : "text-muted-foreground"}`}
                      >
                        <span>{s.date}</span>
                        <span className="text-[8px] opacity-70 font-bold">{(s.legacy_filemaker_id || s.trainerId === 'legacy-trainer' || s.trainerInitials === 'Legacy' || s.trainerInitials === 'Chart') ? 'Imported' : s.startTime ? new Date(s.startTime?.toMillis?.() || s.startTime).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </p>
                      <p className="text-xs font-bold truncate mt-1">
                        {s.routineName || "Session"}
                      </p>
                      {s.startTime && s.endTime && (
                        <p className="text-[9px] font-bold text-muted-foreground/60 uppercase mt-1">
                          {Math.round(
                            (getMillis(s.endTime) - getMillis(s.startTime)) /
                              60000,
                          )}{" "}
                          mins
                        </p>
                      )}
                    </button>
                  ))}
                {sessions.filter((s) => s.status === "Completed").length ===
                  0 && (
                  <div className="p-8 text-center opacity-20">
                    <Clock className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest leading-tight">
                      No data
                    </p>
                  </div>
                )}
              </div>

              {/* Main Content: Detailed Analysis */}
              <div className="flex-1 overflow-y-auto p-8">
                {(() => {
                  const focusSession =
                    sessions.find((s) => s.id === selectedTimingSessionId) ||
                    sessions[0];

                  if (!focusSession) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4">
                        <Activity className="w-16 h-16" />
                        <p className="text-xs font-black uppercase tracking-widest">
                          Select a session for analysis
                        </p>
                      </div>
                    );
                  }

                  const sessionLogs = allLogs
                    .filter((l) => l.sessionId === focusSession.id)
                    .sort((a, b) => {
                      const timeA =
                        a.updatedAt?.toMillis?.() ||
                        a.createdAt?.toMillis?.() ||
                        0;
                      const timeB =
                        b.updatedAt?.toMillis?.() ||
                        b.createdAt?.toMillis?.() ||
                        0;
                      return timeA - timeB;
                    });

                  const startTime =
                    focusSession.startTime?.toMillis?.() ||
                    focusSession.createdAt?.toMillis?.();

                  const SETUP_BUFFER_SECONDS = 45;
                  
                  const sStartTime = focusSession.startTime?.toMillis?.() || focusSession.createdAt?.toMillis?.() || 0;

                  const tutData: any[] = [];
                  sessionLogs.forEach((log, idx) => {
                    const lTimeMs = log.updatedAt?.toMillis?.() || log.createdAt?.toMillis?.() || 0;
                    const pTimeMs = idx === 0 ? sStartTime : (sessionLogs[idx - 1].updatedAt?.toMillis?.() || sessionLogs[idx - 1].createdAt?.toMillis?.() || 0);

                    let grossTimeSeconds = 0;
                    if (lTimeMs > 0 && pTimeMs > 0 && lTimeMs > pTimeMs) {
                      grossTimeSeconds = Math.round((lTimeMs - pTimeMs) / 1000);
                    }
                    
                    if (grossTimeSeconds === 0 && log.timeSpent) {
                       const parsed = parseInt(log.timeSpent, 10);
                       if (!isNaN(parsed)) grossTimeSeconds = parsed;
                    }

                    const netActiveTime = Math.max(0, grossTimeSeconds - SETUP_BUFFER_SECONDS);
                    const reps = log.reps ? parseInt(log.reps.toString(), 10) : 0;
                    let estimatedTutPerRep = 0;
                    
                    const isStatic = log.isStaticHold || log.isTSC || (log.seconds && (!log.reps || parseInt(log.reps.toString()) === 0));
                    
                    if (isStatic) {
                       estimatedTutPerRep = reps > 0 ? netActiveTime / reps : netActiveTime;
                    } else {
                       if (reps > 0) {
                         estimatedTutPerRep = netActiveTime / reps;
                       }
                    }
                    
                    const machine = machines.find((m) => m.id === log.machineId);
                    
                    tutData.push({
                      id: log.id,
                      machineId: log.machineId,
                      machineName: machine?.name || "Unknown",
                      grossTimeSeconds,
                      netActiveTime,
                      reps,
                      isStatic,
                      estimatedTutPerRep: Math.round(estimatedTutPerRep * 10) / 10,
                    });
                  });

                  // Format as MM:SS helper for tooltip
                  const formatMMSS = (totalSeconds: number) => {
                    if (isNaN(totalSeconds) || totalSeconds < 0) return "0:00";
                    const mins = Math.floor(totalSeconds / 60);
                    const secs = Math.floor(totalSeconds % 60);
                    return `${mins}:${secs.toString().padStart(2, "0")}`;
                  };

                  const CustomTutTooltip = ({ active, payload }: any) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#0A2E46] border border-slate-700 p-4 rounded-xl shadow-xl">
                          <p className="text-white font-black uppercase text-sm mb-2">{data.machineName}</p>
                          <div className="space-y-1">
                            <div className="flex justify-between gap-6">
                              <span className="text-slate-400 text-[10px] font-bold uppercase">Estimated TUT/Rep:</span>
                              <span className="text-[#38BDF8] text-sm font-black">{data.estimatedTutPerRep}s</span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span className="text-slate-400 text-[10px] font-bold uppercase">Reps:</span>
                              <span className="text-white text-xs font-black">{data.isStatic ? 'Static Hold' : data.reps}</span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span className="text-slate-400 text-[10px] font-bold uppercase">Gross Time:</span>
                              <span className="text-white text-xs font-black">{formatMMSS(data.grossTimeSeconds)}</span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span className="text-slate-400 text-[10px] font-bold uppercase">Net Active:</span>
                              <span className="text-white text-xs font-black">{formatMMSS(data.netActiveTime)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  };

                  return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 h-full flex flex-col">
                      <div className="flex items-center justify-between border-b pb-4 shrink-0">
                        <div>
                          <h4 className="text-lg font-black uppercase italic text-primary">
                            {focusSession.date}
                          </h4>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">
                            {focusSession.routineName || "Free Protocol"}
                          </p>
                        </div>
                        {focusSession.startTime && focusSession.endTime && (
                          <div className="text-right">
                            <p className="text-xl font-black italic text-foreground leading-none">
                              {Math.round(
                                (getMillis(focusSession.endTime) -
                                  getMillis(focusSession.startTime)) /
                                  60000,
                              )}
                              m
                            </p>
                            <p className="text-[9px] font-black text-muted-foreground uppercase opacity-60">
                              Total Duration
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-h-[400px]">
                        {tutData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tutData} margin={{ top: 20, right: 30, left: -20, bottom: 40 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                              <XAxis 
                                dataKey="machineName" 
                                stroke="#64748b" 
                                tick={{ fill: "#64748b", fontSize: 9, fontWeight: 'bold' }} 
                                interval={0}
                                angle={-45}
                                textAnchor="end"
                              />
                              <YAxis 
                                stroke="#64748b" 
                                tick={{ fill: "#64748b", fontSize: 10, fontWeight: 'bold' }}
                                tickFormatter={(val) => `${val}s`}
                              />
                              <RechartsTooltip content={<CustomTutTooltip />} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                              <ReferenceLine 
                                y={12} 
                                stroke="#f43f5e" 
                                strokeDasharray="3 3"
                                strokeWidth={2}
                                label={{ position: 'top', value: '12s (IDEAL TUT)', fill: '#f43f5e', fontSize: 10, fontWeight: 'bold' }} 
                              />
                              <Bar 
                                dataKey="estimatedTutPerRep" 
                                fill="#38BDF8" 
                                radius={[4, 4, 0, 0]} 
                                maxBarSize={40}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center opacity-30">
                            <Activity className="w-10 h-10 mx-auto mb-3" />
                            <p className="text-xs font-black uppercase tracking-widest">
                               No timing logs for this session
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>        <TabsContent value="details">
          <div className="grid gap-6 lg:grid-cols-2 mb-6">
            {/* 1. The "Why" (Goals & Motivation) */}
            <Card className="rounded-[40px] shadow-xl bg-slate-800 border-slate-700 text-white">
              <CardHeader className="p-8 border-b border-slate-700">
                <CardTitle className="text-xl font-black uppercase italic tracking-tighter">
                  The 'Why' (Goals & Motivation)
                </CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-[#38BDF8]">
                  Discovery & Intent Path
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Discovery Notes (Stage 1)
                  </Label>
                  <Textarea
                    value={infoForm.discoveryNotes || ""}
                    onChange={(e) =>
                      setInfoForm((f) => ({ ...f, discoveryNotes: e.target.value }))
                    }
                    className="min-h-[100px] rounded-2xl font-bold p-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8] resize-none"
                    placeholder="Context from initial contact..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Primary Training Goals & Deep Intent
                  </Label>
                  <Textarea
                    value={infoForm.globalNotes || ""}
                    onChange={(e) =>
                      setInfoForm((f) => ({ ...f, globalNotes: e.target.value }))
                    }
                    className="min-h-[140px] rounded-2xl font-bold p-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8]"
                    placeholder="What are we really solving for? (e.g. 'I want to be able to pick up my grandkids without back pain')..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* 2. Lifestyle & Environment */}
            <Card className="rounded-[40px] shadow-xl bg-slate-800 border-slate-700 text-white">
              <CardHeader className="p-8 border-b border-slate-700">
                <CardTitle className="text-xl font-black uppercase italic tracking-tighter">
                  Lifestyle & Environment
                </CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-[#38BDF8]">
                  External Stressors & Physical Context
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      Occupation
                    </Label>
                    <OccupationSelect
                      value={infoForm.occupation || ""}
                      onChange={(v) =>
                        setInfoForm((f) => ({ ...f, occupation: v }))
                      }
                      disabled={infoForm.isRetired}
                    />
                  </div>
                  <div className="space-y-2 flex flex-col justify-center">
                    <div className="flex items-center gap-4 mt-2">
                      <Switch
                        checked={infoForm.isRetired}
                        onCheckedChange={(v) =>
                          setInfoForm((f) => ({ ...f, isRetired: v }))
                        }
                        className="data-[state=checked]:bg-[#38BDF8]"
                      />
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                        Retired
                      </Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Daily Activity Level
                  </Label>
                  <Select
                    value={infoForm.activityLevel || "Moderate"}
                    onValueChange={(v) =>
                      setInfoForm((f) => ({ ...f, activityLevel: v as any }))
                    }
                  >
                    <SelectTrigger className="w-full h-12 bg-slate-900 border-slate-700 text-white font-bold rounded-2xl focus-visible:ring-[#38BDF8]">
                      <SelectValue placeholder="Select Activity" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white rounded-xl">
                      <SelectItem value="Sedentary">Sedentary</SelectItem>
                      <SelectItem value="Light">Light</SelectItem>
                      <SelectItem value="Moderate">Moderate</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Manual Labor">Manual Labor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Systemic Recovery (Sleep/Stress)
                  </Label>
                  <Select
                    value={infoForm.recoveryMetric || "Average"}
                    onValueChange={(v) =>
                      setInfoForm((f) => ({ ...f, recoveryMetric: v as any }))
                    }
                  >
                    <SelectTrigger className="w-full h-12 bg-slate-900 border-slate-700 text-white font-bold rounded-2xl focus-visible:ring-[#38BDF8]">
                      <SelectValue placeholder="Select Recovery" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white rounded-xl">
                      <SelectItem value="Poor">Poor</SelectItem>
                      <SelectItem value="Average">Average</SelectItem>
                      <SelectItem value="Optimal">Optimal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Experience Level
                  </Label>
                  <Select
                    value={infoForm.trainingPedigree || "Novice"}
                    onValueChange={(v) =>
                      setInfoForm((f) => ({ ...f, trainingPedigree: v as any }))
                    }
                  >
                    <SelectTrigger className="w-full h-12 bg-slate-900 border-slate-700 text-white font-bold rounded-2xl focus-visible:ring-[#38BDF8]">
                      <SelectValue placeholder="Select Experience" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white rounded-xl">
                      <SelectItem value="Novice">Novice (No lifting experience)</SelectItem>
                      <SelectItem value="Intermediate">Intermediate (Standard gym experience)</SelectItem>
                      <SelectItem value="Advanced">Advanced (Extensive free weights/machines)</SelectItem>
                      <SelectItem value="Protocol Veteran">Protocol Veteran (Prior high-intensity experience)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* 3. The Clinical Baseline (Medical) */}
            <Card className="rounded-[40px] shadow-xl bg-slate-800 border-slate-700 text-white lg:col-span-2">
              <CardHeader className="p-8 border-b border-slate-700">
                <CardTitle className="text-xl font-black uppercase italic tracking-tighter">
                  The Clinical Baseline (Medical)
                </CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-[#38BDF8]">
                  Orthopedic & Safety Flags
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                {(() => {
                  // Group clinical flags by category
                  const groupedFlags = CLINICAL_FLAGS_MATRIX.reduce((acc, flag) => {
                    if (!acc[flag.category]) acc[flag.category] = [];
                    acc[flag.category].push(flag);
                    return acc;
                  }, {} as Record<string, typeof CLINICAL_FLAGS_MATRIX>);
                
                  return (
                    <div className="space-y-6">
                      {infoForm.clinicalFlags && infoForm.clinicalFlags.length > 0 && (
                        <div className="w-full flex flex-col gap-2 mb-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Active Health Flags
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {infoForm.clinicalFlags.map(flagId => {
                               const flag = CLINICAL_FLAGS_MATRIX.find(f => f.id === flagId);
                               if (!flag) return null;
                               
                               const bgColors = {
                                 "Absolute Contraindication": "bg-rose-950/50 border-rose-600/50 text-rose-200",
                                 "High Risk": "bg-amber-950/50 border-amber-500/50 text-amber-200",
                                 "Moderate / Needs Modification": "bg-blue-950/50 border-blue-500/50 text-blue-200"
                               };
                               
                               return (
                                 <div key={flagId} className={`px-3 py-1.5 rounded-lg border flex items-center text-xs font-bold leading-none ${bgColors[flag.category as keyof typeof bgColors] || 'bg-slate-800 border-slate-600 text-slate-200'}`}>
                                   <AlertCircle className="w-3 h-3 mr-1.5 opacity-70" />
                                   {flag.conditionName}
                                 </div>
                               );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="grid lg:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                            Select Pertinent Health Flags
                          </Label>
                        <div className="w-full space-y-2">
                          {Object.entries(groupedFlags).map(([category, flags]) => (
                            <div key={category}>
                              <h4 className="text-sm font-bold text-slate-300 mb-3 mt-6 first:mt-0">
                                {category}
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {(flags as ClinicalSafetyFlag[]).map((flag) => {
                                  const isChecked = infoForm.clinicalFlags?.includes(flag.id) || false;
                                  
                                  const unselectedStyles = "bg-slate-900 border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors px-3 py-1.5 rounded-full text-xs font-medium";
                                  
                                  let selectedStyles = "";
                                  if (flag.severity === "Absolute Contraindication") {
                                    selectedStyles = "bg-rose-950/50 border border-rose-500 text-rose-400 px-3 py-1.5 rounded-full text-xs font-medium shadow-[0_0_10px_rgba(244,63,94,0.1)]";
                                  } else if (flag.severity === "High Risk") {
                                    selectedStyles = "bg-amber-950/50 border border-amber-500 text-amber-400 px-3 py-1.5 rounded-full text-xs font-medium shadow-[0_0_10px_rgba(245,158,11,0.1)]";
                                  } else {
                                    selectedStyles = "bg-blue-950/50 border border-blue-500 text-blue-400 px-3 py-1.5 rounded-full text-xs font-medium shadow-[0_0_10px_rgba(59,130,246,0.1)]";
                                  }

                                  return (
                                    <button
                                      key={flag.id}
                                      onClick={() => {
                                        const current = infoForm.clinicalFlags || [];
                                        if (!isChecked) {
                                          setInfoForm((f) => ({ ...f, clinicalFlags: [...current, flag.id] }));
                                        } else {
                                          setInfoForm((f) => ({ ...f, clinicalFlags: current.filter((a) => a !== flag.id) }));
                                        }
                                      }}
                                      className={isChecked ? selectedStyles : unselectedStyles}
                                    >
                                      {flag.conditionName}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                            Ailments, Injuries & Limitations
                          </Label>
                          <Textarea
                            value={infoForm.clinicalNotes || ""}
                            onChange={(e) =>
                              setInfoForm((f) => ({
                                ...f,
                                clinicalNotes: e.target.value,
                              }))
                            }
                            className="min-h-[200px] rounded-2xl font-bold p-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8] transition-all"
                            placeholder="Detail any orthopedic history or clinical considerations..."
                          />
                        </div>
                      </div>
                    </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* 4. Biometrics & Contact (The Formalities) */}
            <Card className="rounded-[40px] shadow-xl bg-slate-800 border-slate-700 text-white">
              <CardHeader className="p-8 border-b border-slate-700">
                <CardTitle className="text-xl font-black uppercase italic tracking-tighter">
                  Biometrics & Formalities
                </CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-[#38BDF8]">
                  Identity, Vital Statistics & Contact
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      First Name
                    </Label>
                    <Input
                      value={infoForm.firstName || ""}
                      onChange={(e) =>
                        setInfoForm((f) => ({ ...f, firstName: e.target.value }))
                      }
                      className="h-12 rounded-2xl font-black px-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      Last Name
                    </Label>
                    <Input
                      value={infoForm.lastName || ""}
                      onChange={(e) =>
                        setInfoForm((f) => ({ ...f, lastName: e.target.value }))
                      }
                      className="h-12 rounded-2xl font-black px-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      Email
                    </Label>
                    <Input
                      value={infoForm.email || ""}
                      onChange={(e) =>
                        setInfoForm((f) => ({ ...f, email: e.target.value }))
                      }
                      className="h-12 rounded-2xl font-black px-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      Phone
                    </Label>
                    <Input
                      value={infoForm.phone || ""}
                      onChange={(e) =>
                        setInfoForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      className="h-12 rounded-2xl font-black px-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      Age
                    </Label>
                    <Input
                      type="number"
                      value={infoForm.age ?? ""}
                      onChange={(e) =>
                        setInfoForm((f) => ({
                          ...f,
                          age: e.target.value ? parseInt(e.target.value) : null,
                        }))
                      }
                      className="h-12 rounded-2xl font-black px-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      Gender
                    </Label>
                    <Select
                      value={infoForm.gender || "Male"}
                      onValueChange={(v) =>
                        setInfoForm((f) => ({ ...f, gender: v as any }))
                      }
                    >
                      <SelectTrigger className="h-12 rounded-2xl font-black px-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8]">
                        <SelectValue placeholder="Select Gender" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 text-white rounded-xl">
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      Height
                    </Label>
                    <Input
                      value={infoForm.height || ""}
                      onChange={(e) =>
                        setInfoForm((f) => ({ ...f, height: e.target.value }))
                      }
                      className="h-12 rounded-2xl font-black px-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                      Weight (lbs)
                    </Label>
                    <Input
                      value={infoForm.weight || ""}
                      onChange={(e) =>
                        setInfoForm((f) => ({ ...f, weight: e.target.value }))
                      }
                      className="h-12 rounded-2xl font-black px-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8]"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-700/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Package Tier</Label>
                      <Select
                        value={infoForm.packageTier || "None"}
                        onValueChange={(v: any) => setInfoForm(f => ({ ...f, packageTier: v }))}
                      >
                        <SelectTrigger className="h-12 bg-slate-900 border-slate-700 rounded-2xl font-bold text-white focus-visible:ring-[#38BDF8]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 text-white">
                          <SelectItem value="None">None / Trial</SelectItem>
                          <SelectItem value="6-Month">6-Month</SelectItem>
                          <SelectItem value="12-Month">12-Month</SelectItem>
                          <SelectItem value="18-Month">18-Month VIP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Sessions Remaining</Label>
                      <Input
                        type="number"
                        min="0"
                        value={infoForm.remainingSessions ?? ""}
                        onChange={(e) =>
                          setInfoForm((f) => ({ ...f, remainingSessions: parseInt(e.target.value) || 0 }))
                        }
                        className="h-12 rounded-2xl font-black px-4 bg-slate-900 border-slate-700 text-white focus-visible:ring-[#38BDF8]"
                        placeholder="e.g. 12"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 space-y-6">
               <Card className="rounded-[40px] shadow-xl bg-slate-800 border-slate-700 text-white overflow-hidden">
                <CardHeader className="p-8 border-b border-slate-700 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-black uppercase italic tracking-tighter">
                      Reminders
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-[#38BDF8]">
                      Alerts & Follow-ups
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6">
                    <div className="grid grid-cols-1 gap-4 mb-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                          Event Type
                        </Label>
                        <Select
                          value={newEventForm.type}
                          onValueChange={(v: any) =>
                            setNewEventForm({ ...newEventForm, type: v })
                          }
                        >
                          <SelectTrigger className="w-full h-12 bg-slate-800 border-slate-700 text-white font-bold rounded-2xl focus-visible:ring-[#38BDF8]">
                            <SelectValue placeholder="Select Type..." />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700 text-white rounded-xl">
                            <SelectItem value="Progress Report">Progress Report</SelectItem>
                            <SelectItem value="InBody Scan">InBody Scan</SelectItem>
                            <SelectItem value="Routine Change">Routine Change</SelectItem>
                            <SelectItem value="Vacation">Vacation</SelectItem>
                            <SelectItem value="Birthday/Anniversary">Birthday/Anniversary</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                          Date
                        </Label>
                        <Input
                          type="date"
                          value={newEventForm.date}
                          onChange={(e) =>
                            setNewEventForm((f) => ({
                              ...f,
                              date: e.target.value,
                            }))
                          }
                          className="h-12 rounded-2xl font-black px-4 bg-slate-800 border-slate-700 text-white focus-visible:ring-[#38BDF8]"
                        />
                      </div>
                    </div>
                    <div className="space-y-2 mb-4">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                        Event Title
                      </Label>
                      <Input
                        value={newEventForm.title}
                        onChange={(e) =>
                          setNewEventForm((f) => ({
                            ...f,
                            title: e.target.value,
                          }))
                        }
                        placeholder="Brief description..."
                        className="h-12 rounded-2xl font-bold px-4 bg-slate-800 border-slate-700 text-white focus-visible:ring-[#38BDF8]"
                      />
                    </div>
                    <div className="space-y-2 mb-6">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                        Notes
                      </Label>
                      <Textarea
                        value={newEventForm.notes}
                        onChange={(e) =>
                          setNewEventForm((f) => ({
                            ...f,
                            notes: e.target.value,
                          }))
                        }
                        className="min-h-[80px] rounded-3xl font-medium p-4 bg-slate-800 border-slate-700 text-white focus-visible:ring-[#38BDF8] resize-none"
                        placeholder="Optional details..."
                      />
                    </div>
                    <Button
                      onClick={handleAddEvent}
                      disabled={
                        !newEventForm.title ||
                        !newEventForm.date ||
                        isSavingEvent
                      }
                      className="w-full bg-[#38BDF8] hover:bg-[#0ea5e9] text-white font-black uppercase tracking-widest text-xs h-12 rounded-2xl transition-all"
                    >
                      {isSavingEvent ? "Adding..." : "Add Event"}
                    </Button>
                  </div>

                  {client?.events && client.events.length > 0 ? (
                    <div className="space-y-3 mt-8">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-4">
                        Scheduled Events
                      </h4>
                      {client.events
                        .sort(
                          (a, b) =>
                            new Date(b.date).getTime() -
                            new Date(a.date).getTime(),
                        )
                        .map((event) => (
                          <div
                            key={event.id}
                            className="flex flex-col gap-2 p-4 bg-slate-900 border border-slate-800 rounded-3xl group transition-all hover:bg-slate-800"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <span
                                  className={cn(
                                    "text-[9px] font-black uppercase tracking-widest mb-1",
                                    event.priority === "High"
                                      ? "text-red-400"
                                      : event.priority === "Medium"
                                        ? "text-amber-400"
                                        : "text-slate-400",
                                  )}
                                >
                                  {event.type} • {event.priority} Priority
                                </span>
                                <span className="text-white font-bold">
                                  {event.title}
                                </span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-1">
                                  {new Date(
                                    event.date + "T12:00:00",
                                  ).toLocaleDateString()}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteEvent(event.id)}
                                  className="h-8 w-8 p-0 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            {event.notes && (
                              <p className="text-xs text-slate-500 mt-1 font-medium bg-slate-900/50 p-3 flex rounded-xl">
                                {event.notes}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="rounded-[40px] shadow-sm bg-slate-900 border-slate-800 text-white">
                <CardHeader className="p-8 border-b border-slate-800">
                  <CardTitle className="text-xl font-black uppercase italic tracking-tighter">
                    Account Actions
                  </CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-[#38BDF8]">
                    Protocol & Membership Management
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-2xl border border-slate-800">
                    <div>
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Active Account
                      </Label>
                      <p className="text-[8px] font-bold opacity-40 uppercase tracking-tighter mt-0.5 text-slate-300">
                        Toggle client visibility in lists
                      </p>
                    </div>
                    <Switch
                      checked={infoForm.isActive}
                      onCheckedChange={(v) =>
                        setInfoForm((f) => ({ ...f, isActive: v }))
                      }
                      className="data-[state=checked]:bg-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <Button
                      onClick={() => setView("chart-importer" as any)}
                      className="w-full bg-[#0ea5e9]/10 hover:bg-[#0ea5e9]/20 text-[#38BDF8] border border-[#38BDF8]/30 rounded-2xl font-black uppercase italic tracking-widest h-12 shadow-sm transition-all"
                    >
                      <Maximize className="w-4 h-4 mr-2" />
                      Open Migration Hub
                    </Button>
                    
                    <Button
                      onClick={() => setView("workouts", { isIntroSession: true })}
                      className="w-full bg-[#115E8D] hover:bg-[#115E8D]/90 text-white rounded-2xl font-black uppercase italic tracking-widest h-12 shadow-md shadow-[#115E8D]/20"
                    >
                      Start Introductory Session
                    </Button>
                    
                    <Button
                      disabled={isSavingInfo}
                      onClick={handleSaveInfo}
                      className="w-full h-12 rounded-2xl bg-[#F06C22] hover:bg-[#ea580c] text-white font-black uppercase italic text-xs tracking-widest shadow-[0_0_20px_rgba(240,108,34,0.3)] transition-all"
                    >
                      {isSavingInfo ? "Processing..." : "Save All Changes"}
                    </Button>

                    <div className="pt-4 mt-2 border-t border-slate-800">
                      <Button
                        variant="outline"
                        className="w-full h-10 rounded-xl border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-400 font-black uppercase tracking-widest text-[9px] transition-all bg-transparent shadow-none"
                        onClick={() => setIsDeleting(true)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Delete Member Profile
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AnimatePresence>
        {showFullChart && clientId && (
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
          />
        )}
      </AnimatePresence>

      <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
        <DialogContent className="rounded-[40px] border-none shadow-2xl p-0 overflow-hidden max-w-sm">
          <div className="bg-red-600 p-8 flex flex-col items-center gap-4 text-white">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                Confirm Deletion
              </h2>
              <p className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-80">
                This action is permanent
              </p>
            </div>
          </div>
          <div className="p-8 space-y-6 text-center bg-white">
            <p className="text-sm font-medium text-muted-foreground leading-relaxed">
              Are you absolutely sure you want to delete{" "}
              <span className="font-black text-foreground">
                {" "}
                {client.firstName} {client.lastName}'s
              </span>{" "}
              profile? All historical session data and machine settings will be
              lost.
            </p>
            <div className="flex flex-col gap-3">
              <Button
                variant="destructive"
                className="h-14 rounded-2xl font-black uppercase italic tracking-widest text-xs shadow-xl shadow-red-200"
                onClick={() => {
                  if (client.id) onDelete(client.id);
                  setIsDeleting(false);
                }}
              >
                Delete Everything
              </Button>
              <Button
                variant="ghost"
                className="h-12 rounded-2xl font-bold text-muted-foreground"
                onClick={() => setIsDeleting(false)}
              >
                Go Back
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MachineSettingsDashboardModal
        editingSettings={editingSettings}
        setEditingSettings={setEditingSettings}
        machines={machines}
        exerciseLogs={allLogs}
        sessions={sessions}
        isSaving={isSavingSettings}
        onSave={handleUpdateMachineSettings}
      />

      <Dialog
        open={isEditingSessionCount}
        onOpenChange={setIsEditingSessionCount}
      >
        <DialogContent className="rounded-3xl border-slate-700 bg-slate-900 shadow-2xl p-6 sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-white italic tracking-tighter">
              Edit Session Count
            </DialogTitle>
            <DialogDescription className="text-xs uppercase tracking-widest text-[#38BDF8] font-bold">
              Adjust {client.firstName}'s total sessions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white font-bold text-xs uppercase tracking-widest">
                Total Sessions completed
              </Label>
              <Input
                type="number"
                value={sessionCountInput}
                onChange={(e) => setSessionCountInput(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white font-black text-lg h-12 focus-visible:ring-[#38BDF8]"
                placeholder="0"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setIsEditingSessionCount(false)}
                className="flex-1 border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 rounded-xl font-black uppercase tracking-widest text-[10px]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveSessionCount}
                className="flex-[2] bg-[#38BDF8] hover:bg-[#0284c7] text-white rounded-xl font-black uppercase tracking-widest text-[10px]"
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


    </motion.div>
  );
}
