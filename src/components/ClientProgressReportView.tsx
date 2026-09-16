import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  TrendingUp,
  CheckCircle2,
  ArrowLeft,
  Calendar,
  Zap,
  Target,
  Printer,
  Mail,
  ChevronRight,
  Award,
  ChevronDown,
  LayoutGrid,
  FileText,
  User,
  Quote,
  Flame,
  Binary,
  Map as MapIcon,
  Crosshair,
  Dumbbell,
  Info,
  Search,
  ShieldAlert,
  Activity,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";
import { useToast } from "../contexts/ToastContext";
import {
  Client,
  Trainer,
  Machine,
  ProgressReport,
  ExerciseLog,
} from "../types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  attendanceStatsFrom,
  loadTrainingHistory,
  machineStatsFrom,
  sessionsInWindow,
  AVG_DURATION_MIN_SESSIONS,
  AVG_REST_MIN_GAPS,
  type TrainingHistory,
} from "../lib/progress-utils";
import type { ClientFocus } from "../types/journal";
import { cn, parseSessionDate } from "../lib/utils";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { MaxStrengthLogo } from "./MaxStrengthLogo";
import {
  SubjectiveDashboard,
  SubjectiveClientCopy,
  answeredCount,
  loadPreviousCheckIn,
  type HistoryPoint,
  type PreviousAssessmentRef,
} from "../features/subjective-report";
import { HeartPulse, Flag } from "lucide-react";
import {
  ReportStepper,
  ReportStepNav,
  MachineProgressionStep,
  GoalsBlock,
  MachineProgressionCard,
  GoalsCard,
  FourPsCards,
  FourPsStep,
  FOUR_PS,
  PulseSnapshot,
  UNRATED_SCORE,
  rankFromScore,
  AccoladeCards,
  AccoladeSlotEditor,
  FocusHistoryPanel,
  FocusSnapshotCard,
  REPORT_STEPS,
  STEP_INDEX,
  FOCUS_HISTORY_LIMIT,
  accoladeCandidates,
  accoladeSetsFrom,
  draftInputFrom,
  draftSlots,
  focusSnapshotFrom,
  isOpenSlot,
  newestActiveCategory,
  padSlots,
  refreshSlots,
  reportCards,
  reportJoinedDate,
  slotKey,
  type HighlightSlot,
  type ReportStepId,
  type PulseSnapshotState,
  type SlotContext,
} from "../features/progress-report";
import "../features/progress-report/progress-report.css";
import { studioTodayKey } from "../lib/studio-time";
import { InBodyReportSection } from "../features/inbody/InBodyReportSection";

/** Firestore Timestamp | Date | ISO string → "Jan 15, 2026", or null. */
const shortDate = (v: any): string | null => {
  if (!v) return null;
  try {
    const d = v?.toDate ? v.toDate() : new Date(typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return null;
  }
};

/** ISO date `days` after `iso` (YYYY-MM-DD in, YYYY-MM-DD out). */
const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

/**
 * A stat tile's number, or null when there is nothing honest to print. None
 * of the report's tiles has a true zero: a session is never 0 minutes, a rest
 * never 0 days, and 0 volume / reps / top-quality sets means nothing was
 * rated or recorded — "not enough data yet", not a score of zero.
 * (Named minimums for the two averages: progress-utils.ts.)
 */
const realStat = (v: number | undefined | null): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

function StatValue({
  value,
  unit,
  className,
  why,
}: {
  value: number | null;
  unit?: string;
  className: string;
  /** The named minimum, said out loud under the dash. */
  why?: string;
}) {
  if (value === null) {
    return (
      <>
        <p className={className}>—</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-(--pr-slate)">
          Not enough data yet
        </p>
        {why && <p className="text-[10px] text-(--pr-slate) no-print">{why}</p>}
      </>
    );
  }
  return (
    <p className={className}>
      {value.toLocaleString()}
      {unit && <span className="text-[11px] text-(--pr-slate) ml-1 not-italic">{unit}</span>}
    </p>
  );
}

interface ClientProgressReportViewProps {
  client: Client;
  trainer: Trainer;
  machines: Machine[];
  onBack: () => void;
  existingReportId?: string;
}

export function ClientProgressReportView({
  client,
  trainer,
  machines,
  onBack,
  existingReportId,
}: ClientProgressReportViewProps) {
  const { success: toastSuccess } = useToast();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"selection" | "editing" | "view">(
    "selection",
  );
  const [saving, setSaving] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);

  // Entire Report State
  const [report, setReport] = useState<ProgressReport>({
    clientId: client.id!,
    trainerId: trainer.id!,
    trainerName: trainer.fullName,
    date: studioTodayKey(),
    isManual: false,
    status: "Draft",

    attendance: {
      score: 0,
      totalSessions: 0,
      avgDuration: 0,
      punctuality: "",
      narrative: "",
      firstSessionDate: "",
      totalVolume: 0,
      totalReps: 0,
      totalGoodReps: 0,
      avgRestDays: 0,
      customStartDate: "",
      toggles: {
        totalSessions: true,
        totalVolume: true,
        totalReps: true,
        totalGoodReps: true,
        avgRestDays: true,
        avgDuration: true,
      },
    },

    // Three distinct empty slots; the auto-draft fills them (accolades.ts).
    highlights: padSlots([]),

    performanceMatrix: {
      posture: {
        score: UNRATED_SCORE,
        note: "",
        talkingPoints: [
          { id: "pos-1", text: "Ribcage Stability", status: "black" },
          { id: "pos-2", text: "Setup Integrity", status: "black" },
          { id: "pos-3", text: "Bracing Quality", status: "black" },
        ],
      },
      pace: {
        score: UNRATED_SCORE,
        note: "",
        talkingPoints: [
          { id: "pac-1", text: "Constant Tension", status: "black" },
          { id: "pac-2", text: "Control Velocity", status: "black" },
          { id: "pac-3", text: "Resistance Tolerance", status: "black" },
        ],
      },
      path: {
        score: UNRATED_SCORE,
        note: "",
        talkingPoints: [
          { id: "pat-1", text: "Active ROM", status: "black" },
          { id: "pat-2", text: "Line of Pull", status: "black" },
          { id: "pat-3", text: "Leverage Optimization", status: "black" },
        ],
      },
      purpose: {
        score: UNRATED_SCORE,
        note: "",
        talkingPoints: [
          { id: "pur-1", text: "Motor Unit Recruitment", status: "black" },
          { id: "pur-2", text: "Internal Focus", status: "black" },
          { id: "pur-3", text: "Mechanical Edge", status: "black" },
        ],
      },
    },

    milestones: {
      originalWhy: client.globalNotes || "",
      smartGoal: "",
    },

    strategy: {
      primaryPlan: "Routine Mastery",
      focusAreas:
        "The Next 6 Months: We will transition to Routine B, increasing time-under-tension by 10% to fortify your lumbar spine and ensure your 'Why' becomes a permanent reality.",
    },
    roadmap: {
      trackType: "maintenance",
      selectedHabits: [],
      routineChangeRequested: false,
      routineModifications: "",
      emotionalAnchor: client.globalNotes || "",
      smartGoal: "",
      targetMachineId: machines[0]?.id || "",
      goalActions: [],
      machinePlan: "",
      refinementFocusArea: "",
      routineIntervention: "",
      // Legacy
      anchorCategory: "general_conditioning",
      prescriptionType: "qualitative",
      inStudioPrescription: {
        targetMachine: machines[0]?.id || "m-leg-press",
        targetMetric: "",
        qualitativeFocus: "",
        timeframe: "Next 12 Weeks",
      },
    },
    machineProgression: { includedMachineIds: [], rows: [] },
    // No `subjective` block: the Pulse lives on the client's record now
    // (reporting round). An older report keeps whatever it saved.
    goals: {
      originalWhy: client.globalNotes || "",
      previousGoal: client.smartGoal || "",
      previousGoalOutcome: null,
      previousGoalNote: "",
      nextGoal: "",
      nextGoalTargetDate: addDays(studioTodayKey(), 90),
      followUpDate: addDays(studioTodayKey(), 90),
      checkpoints: [],
    },
    trainerNotes: "",
    createdAt: null,
  });

  /**
   * The most recent FINALIZED report for this client other than this one —
   * the goal carry-over ("how did last time's goal go?") and the header's
   * "Prev report" date come from it. Found with the same clientId +
   * createdAt query the archive uses, filtered in memory, so no new
   * composite index is needed.
   */
  const [previousReport, setPreviousReport] = useState<{
    reportId: string;
    date: string;
    goals?: ProgressReport["goals"];
  } | null>(null);
  /**
   * Every finalized report of this client that carries a Pulse (the old
   * `subjective` block), newest first, from that same read. Feeds the
   * snapshot's "since last time" and trend line, and — for an older report
   * that still carries its own Pulse — the printed copy's deltas.
   */
  const [pulseRefs, setPulseRefs] = useState<PreviousAssessmentRef[]>([]);
  /**
   * The Pulse snapshot: the client's most recent finalized Pulse, read
   * through the Pulse feature's own loader (reporting round). Read-only
   * here; the report never writes a Pulse again.
   */
  const [pulseState, setPulseState] = useState<PulseSnapshotState>({ status: "loading" });
  const [showCoachView, setShowCoachView] = useState(false);
  /** Which of the five steps the editor is showing. */
  const [activeStep, setActiveStep] = useState<ReportStepId>("celebrate");
  /** Set when a check-in-only report is promoted to a full one, so the
   *  auto-populate runs even though the report already has an id. */
  const [promotedFromCheckIn, setPromotedFromCheckIn] = useState(false);
  const goToStep = (id: ReportStepId) => {
    setActiveStep(id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Printing from inside the app shell: flag <body> for the duration so the
  // global print rules in index.css can un-cap the shell (see there).
  useEffect(() => {
    const on = () => document.body.classList.add("printing-report");
    const off = () => document.body.classList.remove("printing-report");
    window.addEventListener("beforeprint", on);
    window.addEventListener("afterprint", off);
    return () => {
      off();
      window.removeEventListener("beforeprint", on);
      window.removeEventListener("afterprint", off);
    };
  }, []);

  /**
   * The client's completed sessions and exercise logs, read ONCE while the
   * editor is open. Every number in the report — tiles, machine progression,
   * accolades — is computed from it in memory, so changing the window costs
   * no read (progress-utils.ts). A failed read is "unknown", never "empty".
   */
  const [history, setHistory] = useState<TrainingHistory | null>(null);
  const [historyStatus, setHistoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const historyLoadedFor = useRef<string | null>(null);
  /** The auto-populate runs once per open report, never over the trainer's edits. */
  const autoPopulated = useRef(false);

  /** The client's coaching focuses, one bounded read (focus-history.ts). */
  const [focuses, setFocuses] = useState<ClientFocus[]>([]);
  const [focusStatus, setFocusStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const focusesLoadedFor = useRef<string | null>(null);

  /** The report date as a moment, for "weeks active up to the report". */
  const reportAsOf = useMemo(() => {
    const d = new Date(`${report.date}T12:00:00`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [report.date]);

  const machineLabels = useMemo(
    () => new Map(machines.filter((m) => m.id).map((m) => [m.id!, m.name] as [string, string])),
    [machines],
  );

  /** Everything the accolade rules need for a given window start. */
  const slotContextFor = (startDate: string | undefined): SlotContext => {
    if (!history) {
      return {
        stats: {},
        labels: machineLabels,
        sets: [],
        sessionsInWindow: 0,
        windowStart: "",
        windowEnd: report.date,
      };
    }
    return {
      stats: machineStatsFrom(history, startDate),
      labels: machineLabels,
      sets: accoladeSetsFrom(history.sessions, history.logs, startDate),
      sessionsInWindow: sessionsInWindow(history.sessions, startDate).length,
      windowStart: startDate || history.sessions[0]?.date || "",
      windowEnd: report.date,
    };
  };

  const slotCtx = useMemo(
    () => slotContextFor(report.attendance.customStartDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, machineLabels, report.attendance.customStartDate, report.date],
  );
  /** machineId → window numbers (the machine picker and step 3). */
  const machineHistory = slotCtx.stats;
  const candidates = useMemo(() => accoladeCandidates(draftInputFrom(slotCtx)), [slotCtx]);

  // Load existing report
  useEffect(() => {
    async function fetchExisting() {
      if (!existingReportId) return;
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "progressReports", existingReportId));
        if (snap.exists()) {
          const data = snap.data() as ProgressReport;
          setReport((prev) => ({
            ...prev,
            ...data,
            id: snap.id,
          }));
          setMode(data.status === "Finalized" ? "view" : "editing");
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, "progressReports");
      } finally {
        setLoading(false);
      }
    }
    fetchExisting();
  }, [existingReportId]);

  // Load the previous finalized report (goal carry-over, "Prev report") and
  // the client's Pulse history from ONE bounded read.
  useEffect(() => {
    let cancelled = false;
    async function fetchPrevious() {
      if (!client.id) return;
      try {
        const snap = await getDocs(
          query(
            collection(db, "progressReports"),
            where("clientId", "==", client.id),
            orderBy("createdAt", "desc"),
            limit(10),
          ),
        );
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ProgressReport) }));
        if (cancelled) return;
        // Every finalized Pulse, newest first — including this report's own
        // if it is a finalized check-in being promoted: that IS the newest.
        setPulseRefs(
          docs
            .filter((r) => r.status === "Finalized" && !!r.subjective)
            .map((r) => ({
              reportId: r.id!,
              date: r.date,
              assessment: r.subjective!,
              trainerName: r.trainerName ?? null,
              enteredBy: r.subjective!.enteredBy ?? null,
            })),
        );
        // The last FULL report: a Pulse-only report has no goal to carry over.
        const prev = docs.find(
          (r) => r.id !== existingReportId && r.status === "Finalized" && !r.isCheckInOnly,
        );
        if (prev) {
          setPreviousReport({ reportId: prev.id!, date: prev.date, goals: prev.goals });
          // A brand-new report inherits the goal set last time as the goal
          // to review now. An existing report keeps whatever it saved.
          if (!existingReportId) {
            setReport((r) => ({
              ...r,
              previousReportId: prev.id ?? null,
              goals: r.goals
                ? {
                    ...r.goals,
                    originalWhy: r.goals.originalWhy || prev.goals?.originalWhy || "",
                    previousGoal:
                      r.goals.previousGoal || prev.goals?.nextGoal || "",
                  }
                : r.goals,
            }));
          }
        } else {
          setPreviousReport(null);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, "progressReports");
      }
    }
    fetchPrevious();
    return () => {
      cancelled = true;
    };
  }, [client.id, existingReportId]);

  // The Pulse snapshot: the client's most recent finalized Pulse, through
  // the Pulse feature's own loader. A failed read is "unknown", never "none".
  useEffect(() => {
    let cancelled = false;
    if (!client.id) {
      setPulseState({ status: "ready", pulse: null, previous: null, history: [] });
      return;
    }
    setPulseState({ status: "loading" });
    loadPreviousCheckIn(client.id)
      .then((pulse) => {
        if (cancelled) return;
        setPulseState({ status: "ready", pulse, previous: null, history: [] });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("Report Pulse snapshot load failed:", err);
        setPulseState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [client.id]);

  /**
   * The snapshot with its "since last time" and trend filled in from the
   * Pulse list already read: the one before the snapshot, and the ones
   * before that, oldest first. Nothing is fetched for this.
   */
  const pulseSnapshot = useMemo<PulseSnapshotState>(() => {
    if (pulseState.status !== "ready" || !pulseState.pulse) return pulseState;
    const i = pulseRefs.findIndex((r) => r.reportId === pulseState.pulse!.reportId);
    const older = i >= 0 ? pulseRefs.slice(i + 1) : pulseRefs.filter((r) => r.date <= pulseState.pulse!.date);
    return {
      status: "ready",
      pulse: pulseState.pulse,
      previous: older[0] ?? null,
      history: older
        .slice(1)
        .reverse()
        .map((r) => ({ date: r.date, assessment: r.assessment })),
    };
  }, [pulseState, pulseRefs]);

  /**
   * For an older report that still carries its own Pulse block: the Pulse
   * before IT, so its printed deltas read as they did when it was written.
   */
  const previousPulseForReport = useMemo<PreviousAssessmentRef | null>(() => {
    if (!report.subjective) return null;
    const i = report.id ? pulseRefs.findIndex((r) => r.reportId === report.id) : -1;
    return (i >= 0 ? pulseRefs[i + 1] : pulseRefs.find((r) => r.reportId !== report.id)) ?? null;
  }, [report.subjective, report.id, pulseRefs]);
  /** Older Pulses still, oldest first, for the coach view's trend line. */
  const historyForReport = useMemo<HistoryPoint[]>(() => {
    if (!previousPulseForReport) return [];
    const i = pulseRefs.findIndex((r) => r.reportId === previousPulseForReport.reportId);
    return pulseRefs
      .slice(i + 1)
      .reverse()
      .map((r) => ({ date: r.date, assessment: r.assessment }));
  }, [previousPulseForReport, pulseRefs]);

  // Read the client's history once while editing (auto or manual — the
  // machine picker and step 3 want it either way).
  useEffect(() => {
    if (mode !== "editing" || !client.id) return;
    if (historyLoadedFor.current === client.id) return;
    let cancelled = false;
    setHistoryStatus("loading");
    loadTrainingHistory(client.id)
      .then((h) => {
        if (cancelled) return;
        historyLoadedFor.current = client.id!;
        setHistory(h);
        setHistoryStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Report history load failed:", err);
        setHistoryStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [client.id, mode]);

  // Read the client's coaching focuses once while editing. Bounded, and
  // ordered by the (clientId, updatedAt) index that firestore.indexes.json
  // already carries; if that index is missing the same bounded read runs
  // unordered and focus-history.ts sorts it in memory.
  useEffect(() => {
    if (mode !== "editing" || !client.id) return;
    if (focusesLoadedFor.current === client.id) return;
    let cancelled = false;
    setFocusStatus("loading");
    const base = collection(db, "clientFocuses");
    (async () => {
      try {
        let snap;
        try {
          snap = await getDocs(
            query(
              base,
              where("clientId", "==", client.id),
              orderBy("updatedAt", "desc"),
              limit(FOCUS_HISTORY_LIMIT),
            ),
          );
        } catch (err: any) {
          if (err?.code !== "failed-precondition") throw err;
          snap = await getDocs(
            query(base, where("clientId", "==", client.id), limit(FOCUS_HISTORY_LIMIT)),
          );
        }
        if (cancelled) return;
        focusesLoadedFor.current = client.id!;
        setFocuses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClientFocus));
        setFocusStatus("ready");
      } catch (err) {
        if (cancelled) return;
        // The panel says it couldn't read them; the report still works, and a
        // save keeps whatever focus snapshot it already had.
        console.warn("Report focus history load failed:", err);
        setFocusStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client.id, mode]);

  // Auto-populate a new report (or a check-in promoted to a full one) once
  // the history has landed: the tiles, and three accolades drafted from the
  // data — never picked by machine name.
  useEffect(() => {
    if (mode !== "editing" || report.isManual || autoPopulated.current) return;
    if (existingReportId && !promotedFromCheckIn) return;
    if (historyStatus !== "ready" || !history) return;
    autoPopulated.current = true;

    const activeStartDate =
      report.attendance.customStartDate || history.sessions[0]?.date || "";
    const stats = attendanceStatsFrom(history, activeStartDate);
    const ctx = slotContextFor(activeStartDate);

    setReport((prev) => ({
      ...prev,
      attendance: {
        ...prev.attendance,
        customStartDate: activeStartDate,
        score: stats.score,
        totalSessions: stats.totalSessions,
        avgDuration: stats.avgDuration,
        punctuality: stats.punctuality,
        firstSessionDate: stats.firstSessionDate,
        totalVolume: stats.totalVolume,
        totalReps: stats.totalReps,
        totalGoodReps: stats.totalGoodReps,
        avgRestDays: stats.avgRestDays,
        narrative:
          prev.attendance.narrative ||
          `Thank you for your consistency, ${client.firstName}. Your commitment to the protocol is driving these results.`,
      },
      // A promoted check-in may already hold trainer-chosen slots: keep
      // them and draft around them.
      highlights: (prev.highlights ?? []).some((h) => !isOpenSlot(h))
        ? refreshSlots(prev.highlights, ctx)
        : draftSlots(ctx),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, report.isManual, existingReportId, promotedFromCheckIn, historyStatus, history]);

  // Pre-fill the refinement track's "4 P's Focus" from the newest ACTIVE
  // focus while it is still empty.
  const refinementFocusArea = report.roadmap?.refinementFocusArea;
  useEffect(() => {
    if (mode !== "editing" || focusStatus !== "ready" || refinementFocusArea) return;
    const category = newestActiveCategory(focuses, reportAsOf);
    if (!category) return;
    setReport((r) =>
      r.roadmap && !r.roadmap.refinementFocusArea
        ? { ...r, roadmap: { ...r.roadmap, refinementFocusArea: category } }
        : r,
    );
  }, [mode, focusStatus, focuses, refinementFocusArea, reportAsOf]);

  /**
   * The window start changed: recount the tiles and rebuild the accolades
   * from the history already in memory. Trainer-chosen slots keep their
   * choice with the new numbers; drafted and empty slots are re-drafted.
   */
  const handleRecalculateAttendance = (customStartDate?: string) => {
    const activeStartDate = customStartDate || "";
    if (!history) {
      setReport((prev) => ({
        ...prev,
        attendance: { ...prev.attendance, customStartDate: activeStartDate },
      }));
      return;
    }
    const stats = attendanceStatsFrom(history, activeStartDate);
    const ctx = slotContextFor(activeStartDate);
    setReport((prev) => ({
      ...prev,
      attendance: {
        ...prev.attendance,
        customStartDate: activeStartDate,
        score: stats.score,
        totalSessions: stats.totalSessions,
        avgDuration: stats.avgDuration,
        punctuality: stats.punctuality,
        firstSessionDate: stats.firstSessionDate,
        totalVolume: stats.totalVolume,
        totalReps: stats.totalReps,
        totalGoodReps: stats.totalGoodReps,
        avgRestDays: stats.avgRestDays,
      },
      highlights: refreshSlots(prev.highlights, ctx),
    }));
  };

  const handleSave = async (status: "Draft" | "Finalized" = "Finalized") => {
    setSaving(true);
    try {
      // Recursively remove undefined values to prevent Firestore crashes
      const removeUndefined = (obj: any): any => {
        if (obj === undefined) return undefined;
        if (obj === null) return null;
        if (typeof obj !== "object") return obj;
        if (obj.serverTime || obj.isEqual) return obj; // Handle FieldValue / Timestamp
        if (Array.isArray(obj))
          return obj.map(removeUndefined).filter((v) => v !== undefined);
        const res: any = {};
        for (const k in obj) {
          const val = removeUndefined(obj[k]);
          if (val !== undefined) res[k] = val;
        }
        return res;
      };

      // The report never writes a Pulse (reporting round). `subjective` is
      // left out of the write: an older report keeps the block it already
      // has in Firestore (updateDoc leaves untouched fields alone), and a
      // new report never gets one.
      const { subjective: _keptOnTheDocument, ...reportWithoutPulse } = report;
      void _keptOnTheDocument;

      // The focus history as it stands today, thin (focus-history.ts). If the
      // focuses couldn't be read, keep whatever the report already had —
      // unknown is not "none".
      const focusSnapshot =
        focusStatus === "ready"
          ? focusSnapshotFrom(focuses, reportAsOf)
          : report.focusSnapshot;

      const sanitizedReport = removeUndefined({
        ...reportWithoutPulse,
        highlights: padSlots(report.highlights),
        focusSnapshot,
        previousReportId: previousReport?.reportId ?? report.previousReportId ?? null,
        sessionNumber: report.sessionNumber || client.sessionCount || 0,
        trainerInitials: trainer.initials,
        trainerName: trainer.fullName,
        status,
        updatedAt: serverTimestamp(),
      });

      // We don't want to overwrite createdAt on updates
      if (sanitizedReport.createdAt === null || report.id) {
        delete sanitizedReport.createdAt;
      }

      let reportId = report.id;
      if (reportId) {
        await updateDoc(doc(db, "progressReports", reportId), sanitizedReport);
      } else {
        sanitizedReport.createdAt = serverTimestamp();
        const docRef = await addDoc(
          collection(db, "progressReports"),
          sanitizedReport,
        );
        reportId = docRef.id;
        setReport((prev) => ({ ...prev, id: docRef.id }));
      }
      setReport((prev) => ({ ...prev, focusSnapshot }));

      if (status === "Finalized") {
        setShowExportOptions(true);
        setMode("view");
      } else {
        toastSuccess("Draft saved.");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "progressReports");
    } finally {
      setSaving(false);
    }
  };

  /** Replace one accolade slot. A new array of new objects — never in place. */
  const setSlot = (slotIdx: number, slot: HighlightSlot) =>
    setReport((prev) => {
      const next = padSlots(prev.highlights);
      next[slotIdx] = { ...slot };
      return { ...prev, highlights: next };
    });

  /** Fill every open slot from the data, around the trainer's own choices. */
  const fillOpenSlots = () =>
    setReport((prev) => ({ ...prev, highlights: refreshSlots(prev.highlights, slotCtx) }));

  if (mode === "selection") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80dvh] p-6 space-y-12 max-w-2xl mx-auto text-center bg-(--pr-navy) rounded-[60px] my-12 border border-white/5 shadow-2xl">
        <div className="space-y-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 rounded-[40px] bg-(--pr-hero)/10 flex items-center justify-center mx-auto mb-8 border border-(--pr-hero)/20 shadow-[0_0_40px_var(--pr-hero-glow)]"
          >
            <Award className="w-12 h-12 text-(--pr-hero)" />
          </motion.div>
          <h2 className="text-4xl font-bold uppercase italic tracking-tighter text-white">
            Initialize Report
          </h2>
          <p className="text-(--pr-slate) font-bold uppercase text-xs tracking-widest leading-relaxed">
            Choose your documentation methodology for <br />{" "}
            <span className="text-white">
              {client.firstName} {client.lastName}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setReport((prev) => ({ ...prev, isManual: false }));
              setMode("editing");
            }}
            className="flex flex-col items-center p-8 bg-white/5 border-2 border-(--pr-hero)/20 rounded-[40px] hover:border-(--pr-hero) transition-all group hover:bg-(--pr-hero)/2 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-(--pr-hero) flex items-center justify-center mb-6 shadow-lg shadow-(color:--pr-hero)/20 group-hover:scale-110 transition-transform">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold uppercase italic mb-2 text-white">
              Auto-Populate
            </h3>
            <p className="text-[11px] text-(--pr-slate) font-bold uppercase tracking-widest leading-relaxed">
              Scan database for sessions, lift deltas, and punctuality patterns.
            </p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setReport((prev) => ({ ...prev, isManual: true }));
              setMode("editing");
              setLoading(false);
            }}
            className="flex flex-col items-center p-8 bg-white/5 border-2 border-dashed border-white/10 rounded-[40px] hover:border-white transition-all group hover:bg-white/5 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <FileText className="w-7 h-7 text-white/40" />
            </div>
            <h3 className="text-xl font-bold uppercase italic mb-2 text-white">
              Manual Entry
            </h3>
            <p className="text-[11px] text-(--pr-slate) font-bold uppercase tracking-widest leading-relaxed">
              Start with a blank canvas. Ideal for clients with external
              history.
            </p>
          </motion.button>
        </div>

        <Button
          variant="ghost"
          onClick={onBack}
          className="text-slate-300 hover:text-white hover:bg-slate-800 font-bold uppercase tracking-[0.3em] text-[11px] h-12 px-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to the record
        </Button>
      </div>
    );
  }

  if (mode === "view") {
    return (
      <div
        data-print-root
        className="min-h-screen bg-(--pr-navy) text-(--pr-paper) selection:bg-(--pr-hero)/30 selection:text-white print:bg-white print:text-(--pr-navy)"
      >
        <style>{`
          @media print {
            @page { size: letter; margin: 0.4in; }
            /* White paper, navy ink. Cards that carry their own dark
               background keep it (translucent white surfaces become solid
               navy so the white text inside them stays readable). */
            body, html {
               background-color: var(--pr-print-paper) !important;
               -webkit-print-color-adjust: exact !important;
               print-color-adjust: exact !important;
            }
            .print-area {
               width: 100% !important;
               max-width: none !important;
               color: var(--pr-navy);
            }
            /* translucent-white surfaces become pale paper cards… */
            .print-area .bg-white\\/5,
            .print-area .bg-white\\/10 {
               background-color: var(--pr-print-card) !important;
               border-color: var(--pr-print-border) !important;
               backdrop-filter: none !important;
            }
            /* …and white ink on them becomes navy… */
            .print-area :is(.text-white, .text-white\\/60, .text-white\\/70, .text-white\\/80,
                            .text-white\\/85, .text-white\\/90, .text-\\(--pr-paper\\)) {
               color: var(--pr-navy) !important;
            }
            /* …except inside cards that keep a solid dark or orange fill. */
            .print-area :is(.bg-\\(--pr-hero\\), .bg-slate-800\\/50, .bg-\\(--pr-navy\\))
              :is(.text-white, .text-white\\/60, .text-white\\/70, .text-white\\/80, .text-white\\/85, .text-white\\/90) {
               color: var(--pr-hero-on) !important;
            }
            .print-area .bg-slate-800\\/50 { background-color: var(--pr-navy) !important; }
            .print-area .border-white\\/10, .print-area .border-white\\/20 { border-color: var(--pr-print-border) !important; }
            .print-area .translate-y-full { display: none !important; } /* hover overlays */
            .print-area .no-print { display: none !important; }
            .no-print { display: none !important; }
            header, section, .break-inside-avoid {
               break-inside: avoid !important;
               page-break-inside: avoid !important;
            }
          }
        `}</style>

        <div className="max-w-4xl mx-auto px-6 py-4 space-y-4 print-area">
          {/* Controls */}
          <div className="flex justify-between items-center no-print">
            <Button
              variant="ghost"
              onClick={onBack}
              className="h-12 text-white hover:bg-white/10 rounded-2xl gap-2 font-bold uppercase italic tracking-widest px-6"
            >
              <ArrowLeft className="w-5 h-5" /> Back
            </Button>
            <div className="flex gap-3">
              {report.isCheckInOnly ? (
                <Button
                  onClick={() => {
                    // A Pulse-only report becomes a full one: clear the flag,
                    // drop into the editor at the start of the conversation,
                    // and let the auto-populate fill the rest. Its Pulse block
                    // stays on the document and is the snapshot the Blueprint
                    // step shows; there is no step to fill for it.
                    setReport((r) => ({ ...r, isCheckInOnly: false, status: "Draft", isManual: false }));
                    setPromotedFromCheckIn(true);
                    setActiveStep("celebrate");
                    setMode("editing");
                  }}
                  className="h-12 bg-white text-(--pr-navy) hover:bg-white/90 rounded-2xl gap-2 font-bold uppercase italic tracking-widest px-6"
                >
                  <Flag className="w-5 h-5" /> Build the full report
                </Button>
              ) : (
                <Button
                  onClick={() => setMode("editing")}
                  variant="outline"
                  className="h-12 text-white bg-transparent border-white/20 hover:bg-white/10 rounded-2xl gap-2 font-bold uppercase italic tracking-widest px-6"
                >
                  Edit Data
                </Button>
              )}
              <Button
                onClick={() => {
                  // Opens the trainer's own mail app with the subject and a
                  // short body filled in; they attach the printed PDF. The
                  // app itself never emails clients (no provider is wired,
                  // and client-contact features are switched off for now).
                  const subject = encodeURIComponent(
                    `${client.firstName}, your progress report from Max Strength`,
                  );
                  const body = encodeURIComponent(
                    `Hi ${client.firstName},\n\nYour progress report from ${shortDate(report.date) || report.date} is attached.` +
                      (report.goals?.nextGoal ? `\n\nYour goal for the next 90 days: ${report.goals.nextGoal}` : "") +
                      (report.goals?.followUpDate ? `\nWe check in again on ${shortDate(report.goals.followUpDate)}.` : "") +
                      `\n\n— ${trainer.fullName}`,
                  );
                  window.location.href = `mailto:${client.email || ""}?subject=${subject}&body=${body}`;
                }}
                variant="outline"
                className="h-12 text-white bg-transparent border-white/20 hover:bg-white/10 rounded-2xl gap-2 font-bold uppercase italic tracking-widest px-6"
                title="Opens your mail app with the subject filled in — print to PDF first and attach it"
              >
                <Mail className="w-5 h-5" /> Email
              </Button>
              <Button
                onClick={() => window.print()}
                className="h-12 bg-(--pr-hero) hover:bg-(--pr-hero-hover) text-white rounded-2xl gap-2 font-bold uppercase italic tracking-widest px-8 shadow-lg shadow-(color:--pr-hero)/20"
              >
                <Printer className="w-5 h-5" /> Print Report
              </Button>
            </div>
          </div>

          {/* Coach-only: an older report's own Pulse. On screen, never on paper. */}
          {report.subjective && (
            <div className="no-print rounded-3xl border border-white/10 bg-white/5 p-4">
              <button
                type="button"
                onClick={() => setShowCoachView((v) => !v)}
                aria-expanded={showCoachView}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-white">
                  <HeartPulse className="h-4 w-4 text-(--pr-hero)" /> Coach view · Pulse (as saved with this report)
                  {(report.subjective.summary?.flags.length ?? 0) > 0 && (
                    <span className="rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px] text-white">
                      {report.subjective.summary!.flags.filter((f) => f.severity === "red").length} red ·{" "}
                      {report.subjective.summary!.flags.filter((f) => f.severity === "watch").length} watch
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                  {showCoachView ? "Hide" : "Show"} — not printed
                </span>
              </button>
              {showCoachView && (
                <div className="mt-4 rounded-2xl bg-white p-4 dark:bg-slate-900">
                  <SubjectiveDashboard
                    assessment={report.subjective}
                    previous={previousPulseForReport}
                    history={historyForReport}
                    machines={machines}
                  />
                </div>
              )}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="report-card space-y-3"
          >
            {/* 1. HERO HEADER: ATTENDANCE & DEDICATION */}
            <header className="space-y-3 break-inside-avoid">
              <div className="flex flex-col md:flex-row md:items-end justify-between border-b-2 border-(--pr-hero) pb-4 gap-4">
                <div>
                  <h1 className="text-4xl font-bold uppercase italic tracking-tighter leading-none mb-3 print:text-(--pr-navy)">
                    {report.isCheckInOnly ? (
                      <>
                        Client <br />
                        <span className="text-(--pr-hero)">Pulse</span>
                      </>
                    ) : (
                      <>
                        Performance <br />
                        <span className="text-(--pr-hero)">Report Card</span>
                      </>
                    )}
                  </h1>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-[11px] font-bold uppercase tracking-[0.25em] text-(--pr-slate)">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-(--pr-hero)" />
                      <span className="text-white print:text-(--pr-navy)">
                        {client.firstName} {client.lastName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-(--pr-hero)" />
                      Report:{" "}
                      <span className="text-white print:text-(--pr-navy)">
                        {new Date(
                          parseSessionDate(report.date),
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-80">
                      <CheckCircle2 className="w-3 h-3 text-(--pr-hero)/60" />
                      Joined:{" "}
                      <span className="text-white/60">
                        {shortDate(
                          reportJoinedDate(client, report.attendance.firstSessionDate),
                        ) || "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-80">
                      <CheckCircle2 className="w-3 h-3 text-(--pr-hero)/60" />
                      Prev Report:{" "}
                      <span className="text-white/60">
                        {shortDate(previousReport?.date) || "First report"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end md:text-right">
                  <div className="mb-2">
                    <MaxStrengthLogo
                      size="sm"
                      showText={false}
                      theme="dark"
                      className="print:hidden"
                    />
                    <MaxStrengthLogo
                      size="sm"
                      showText={false}
                      theme="light"
                      className="hidden print:flex"
                    />
                  </div>
                  <p className="text-[7px] font-bold uppercase tracking-[0.4em] text-(--pr-slate) mb-1">
                    Authenticated By
                  </p>
                  <p className="text-base font-bold uppercase italic tracking-tight print:text-(--pr-navy) leading-none mb-1">
                    {trainer.fullName}
                  </p>
                  <div className="bg-(--pr-hero) px-2 py-0.5 rounded-md">
                    <p className="text-[7px] font-bold text-white uppercase tracking-widest">
                      Life Transformer • MSF Studio
                    </p>
                  </div>
                </div>
              </div>

            {!report.isCheckInOnly && (
              <div className="flex flex-col gap-4 mt-6">
                {/* Highlighted Primary Stats & Narrative */}
                <div className="flex flex-col md:flex-row gap-4">
                  {report.attendance.toggles?.totalSessions !== false && (
                    <div className="bg-(--pr-hero) p-6 rounded-[25px] text-white flex flex-col justify-center items-center text-center shadow-xl shadow-(color:--pr-hero)/30 relative overflow-hidden group min-w-50">
                      <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                      <Award className="w-8 h-8 mb-2 opacity-50 relative z-10" />
                      <p className="text-5xl font-bold italic tracking-tighter leading-none relative z-10">
                        {realStat(report.attendance.totalSessions)?.toLocaleString() ?? "—"}
                      </p>
                      <p className="text-[11px] font-bold uppercase tracking-widest opacity-90 mt-2 relative z-10">
                        Total Sessions
                      </p>
                      <div className="mt-3 pt-3 border-t border-white/20 w-full relative z-10">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">
                          First Session
                        </p>
                        <p className="text-[11px] font-bold uppercase tracking-tighter opacity-100 italic">
                          {report.attendance.firstSessionDate
                            ? new Date(
                                parseSessionDate(
                                  report.attendance.firstSessionDate,
                                ),
                              ).toLocaleDateString()
                            : "--"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 bg-white/5 backdrop-blur-md p-6 rounded-[25px] border border-white/10 flex flex-col justify-center relative">
                    <Quote className="w-12 h-12 text-(--pr-hero) absolute top-4 right-4 opacity-10" />
                    <p className="text-lg md:text-xl font-bold italic uppercase tracking-tight leading-tight text-white print:text-(--pr-navy) max-w-[90%]">
                      "
                      {report.attendance.narrative ||
                        `Incredible work, ${client.firstName}. Your dedication to this clinical protocol is exactly what drives meaningful biological change.`}
                      "
                    </p>
                  </div>
                </div>

                {/* Secondary Toggled Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                  {report.attendance.toggles?.totalVolume !== false && (
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm text-center">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-(--pr-slate) mb-1">
                        Total Volume Lifted
                      </h4>
                      <StatValue
                        value={realStat(report.attendance.totalVolume)}
                        unit="lbs"
                        className="text-2xl font-bold text-(--pr-navy) italic"
                      />
                    </div>
                  )}
                  {report.attendance.toggles?.totalReps !== false && (
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm text-center">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-(--pr-slate) mb-1">
                        Total Reps
                      </h4>
                      <StatValue
                        value={realStat(report.attendance.totalReps)}
                        className="text-2xl font-bold text-(--pr-navy) italic"
                      />
                    </div>
                  )}
                  {report.attendance.toggles?.totalGoodReps !== false && (
                    <div className="dark:bg-slate-900 p-4 rounded-2xl border border-emerald-100 shadow-sm text-center bg-emerald-50/10">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 mb-1">
                        Green Quality Reps
                      </h4>
                      <StatValue
                        value={realStat(report.attendance.totalGoodReps)}
                        className="text-2xl font-bold text-emerald-600 italic"
                        why="No top-quality sets rated in this window."
                      />
                    </div>
                  )}
                  {report.attendance.toggles?.avgRestDays !== false && (
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm text-center">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-(--pr-slate) mb-1">
                        Average Rest
                      </h4>
                      <StatValue
                        value={realStat(report.attendance.avgRestDays)}
                        unit="days"
                        className="text-2xl font-bold text-(--pr-navy) italic"
                        why={`Needs ${AVG_REST_MIN_GAPS + 1} sessions in the window.`}
                      />
                    </div>
                  )}
                  {report.attendance.toggles?.avgDuration !== false && (
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm text-center">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-(--pr-slate) mb-1">
                        Avg Session Length
                      </h4>
                      <StatValue
                        value={realStat(report.attendance.avgDuration)}
                        unit="mins"
                        className="text-2xl font-bold text-(--pr-navy) italic"
                        why={`Needs ${AVG_DURATION_MIN_SESSIONS} sessions with a recorded start and end.`}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            </header>

            {/* 2. ACCOLADES — only slots with real data are drawn (accolades.ts) */}
            {!report.isCheckInOnly && <AccoladeCards slots={report.highlights} />}

            {/* 2b. MACHINE PROGRESSION */}
            {report.machineProgression && (
              <MachineProgressionCard value={report.machineProgression} />
            )}

            {/* 2c. BODY COMPOSITION (Renewals round, Sep 2026) — read live
                from the client's InBody scans up to this report's date, never
                copied into the report: see features/inbody. */}
            <InBodyReportSection clientId={client.id} reportDate={report.date} />

            {/* 3. REINSTATED 4 P'S MATRIX - THE CENTERPIECE */}
            {!report.isCheckInOnly && (
            <section className="space-y-4 break-inside-avoid">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.3em] text-(--pr-hero) shrink-0">
                  Methodology Mastery: The 4 P's
                </h3>
                <div className="h-px bg-(--pr-hero)/20 flex-1"></div>
              </div>

              {/* The mastery word per P, never the number (four-ps.ts). */}
              <FourPsCards value={report.performanceMatrix} />

              {/* The focus history as saved with the report — no live read. */}
              <FocusSnapshotCard entries={report.focusSnapshot} />

              {(report.performanceMatrix.includedNotes || []).length > 0 && (
                <div className="bg-(--pr-paper) p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-inner mt-4">
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-(--pr-slate) mb-3">
                    Clinical Highlights
                  </h4>
                  <ul className="space-y-2">
                    {(report.performanceMatrix.includedNotes || []).map(
                      (note, idx) => (
                        <li
                          key={idx}
                          className="flex gap-2 items-start opacity-90"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-(--pr-hero) shrink-0 mt-0.5" />
                          <span className="text-xs font-bold text-(--pr-navy) leading-relaxed italic">
                            "{note}"
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
            </section>
            )}

            {/* 3b. THE PULSE (client copy). An older report prints the Pulse
                it saved; a report from the reporting round on prints the
                client's most recent finalized Pulse as a dated snapshot.
                Either way only what the Pulse's own client-copy switches
                allow (SubjectiveClientCopy honours them), and nothing at
                all when there is no Pulse or nothing was answered. */}
            {(() => {
              const printed = report.subjective
                ? { assessment: report.subjective, date: report.subjective.completedAt || report.date, previous: previousPulseForReport }
                : pulseSnapshot.status === "ready" && pulseSnapshot.pulse
                  ? { assessment: pulseSnapshot.pulse.assessment, date: pulseSnapshot.pulse.date, previous: pulseSnapshot.previous }
                  : null;
              if (!printed || answeredCount(printed.assessment) === 0) return null;
              return (
                <section className="space-y-3 break-inside-avoid">
                  <div className="flex items-center gap-2">
                    <HeartPulse className="w-4 h-4 text-(--pr-hero)" />
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.3em] text-(--pr-hero) shrink-0">
                      Your Pulse · as of {shortDate(printed.date) || printed.date}
                    </h3>
                    <div className="h-px bg-(--pr-hero)/20 flex-1"></div>
                  </div>
                  <div className="rounded-[24px] bg-(--pr-paper) p-4 text-(--pr-navy) dark:bg-slate-900 dark:text-white">
                    <SubjectiveClientCopy
                      assessment={printed.assessment}
                      previous={printed.previous}
                      clientFirstName={client.firstName}
                      machines={machines}
                    />
                  </div>
                </section>
              );
            })()}

            {/* 4. GOALS */}
            {report.goals && <GoalsCard value={report.goals} clientFirstName={client.firstName} />}

            {/* 4b. TRAINING PLAN (roadmap track) */}
            {!report.isCheckInOnly && (
            <section className="break-inside-avoid space-y-4">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-(--pr-hero)" />
                <h3 className="text-[11px] font-bold uppercase tracking-[0.3em] text-(--pr-hero) shrink-0">
                  Your Training Plan
                </h3>
                <div className="h-px bg-(--pr-hero)/20 flex-1"></div>
              </div>

              {report.roadmap && (
                <>
                  {report.roadmap.trackType === "maintenance" && (
                    <div className="bg-(--pr-paper) dark:bg-slate-900/50 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                        <Activity className="w-16 h-16 text-blue-500" />
                      </div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 mb-4 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Maintenance Track:
                        Lifestyle & Longevity
                      </div>

                      <div className="space-y-6 relative z-10">
                        {report.roadmap.selectedHabits &&
                          report.roadmap.selectedHabits.length > 0 && (
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                                Focus Habits
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {report.roadmap.selectedHabits.map((habit) => (
                                  <span
                                    key={habit}
                                    className="px-3 py-1.5 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 rounded-lg text-xs font-bold shadow-sm"
                                  >
                                    {habit}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                        {report.roadmap.routineChangeRequested && (
                          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border-l-4 border-l-blue-500">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-(--pr-navy) dark:text-slate-300 mb-1">
                              Routine Modification
                            </p>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {report.roadmap.routineModifications ||
                                "Routine updates requested."}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {report.roadmap.trackType === "goals" && (
                    <div className="bg-(--pr-paper) dark:bg-slate-900/50 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                        <Target className="w-16 h-16 text-(--pr-hero)" />
                      </div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-(--pr-hero) mb-4 flex items-center gap-1.5">
                        <Target className="w-4 h-4" /> Goal Setting Track:
                        Performance
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                        {report.roadmap.emotionalAnchor && (
                          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                              The "Why"
                            </p>
                            <p className="text-sm font-medium italic text-slate-700 dark:text-slate-300 border-l-2 border-slate-300 dark:border-slate-600 pl-3">
                              "{report.roadmap.emotionalAnchor}"
                            </p>
                          </div>
                        )}

                        {report.roadmap.smartGoal && (
                          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                              SMART Goal
                            </p>
                            <p className="text-sm font-bold text-(--pr-navy) dark:text-slate-200">
                              {report.roadmap.smartGoal}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                        {report.roadmap.targetMachineId && (
                          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border-l-4 border-(--pr-hero)">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-(--pr-hero) mb-1 flex items-center gap-1">
                              <Dumbbell className="w-3 h-3" /> Target Machine
                            </p>
                            <p className="text-sm font-black uppercase text-(--pr-navy) dark:text-slate-200">
                              {machines.find(
                                (m) => m.id === report.roadmap?.targetMachineId,
                              )?.name || "Specified Machine"}
                            </p>
                          </div>
                        )}
                        {report.roadmap.goalActions &&
                          report.roadmap.goalActions.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                                Action Plan
                              </p>
                              <ul className="space-y-1">
                                {report.roadmap.goalActions.map((action) => (
                                  <li
                                    key={action}
                                    className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2"
                                  >
                                    <div className="w-1.5 h-1.5 rounded-full bg-(--pr-hero)"></div>{" "}
                                    {action}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </div>

                      {report.roadmap.machinePlan && (
                        <div className="mt-4 bg-(--pr-navy) text-white p-4 rounded-xl shadow-sm relative z-10">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-white/70 mb-1">
                            Integration Plan
                          </p>
                          <p className="text-sm">
                            {report.roadmap.machinePlan}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {report.roadmap.trackType === "refinement" && (
                    <div className="bg-(--pr-paper) dark:bg-slate-900/50 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                        <Search className="w-16 h-16 text-emerald-500" />
                      </div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-4 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4" /> Refinement Track:
                        Form & Technique
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10 mb-4">
                        {report.roadmap.refinementFocusArea && (
                          <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl sm:border border-emerald-100 dark:border-emerald-800/50 shadow-sm flex items-center justify-between">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-800 dark:text-emerald-400">
                              4 P's Focus
                            </p>
                            <span className="text-lg font-black uppercase text-emerald-600 dark:text-emerald-300">
                              {report.roadmap.refinementFocusArea}
                            </span>
                          </div>
                        )}
                        {report.roadmap.targetMachineId && (
                          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                              Target Machine
                            </p>
                            <p className="text-sm font-black uppercase text-(--pr-navy) dark:text-slate-200">
                              {machines.find(
                                (m) => m.id === report.roadmap?.targetMachineId,
                              )?.name || "Specified Machine"}
                            </p>
                          </div>
                        )}
                      </div>

                      {report.roadmap.routineIntervention && (
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border-l-4 border-l-emerald-500 relative z-10">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-(--pr-navy) dark:text-slate-300 mb-1">
                            Intervention Strategy
                          </p>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {report.roadmap.routineIntervention}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
            )}

            {/* 5. NOTES & FOOTER */}
            {!report.isCheckInOnly && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch break-inside-avoid">
              <div className="col-span-2 bg-(--pr-paper) p-3 rounded-[20px] border border-slate-100 dark:border-slate-800 relative">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-3 h-3 text-(--pr-hero)" />
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.3em] text-(--pr-navy)">
                    Summative Analysis
                  </h4>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl p-2 shadow-inner min-h-12.5">
                  <p className="text-[11px] font-medium italic text-(--pr-navy) leading-relaxed">
                    {report.trainerNotes ||
                      "Incredible work this quarter. Your neurological adaptations are now clearly visible in the data. Your force output is reaching peak clinical efficiency. Keep showing up."}
                  </p>
                </div>
              </div>
              <div className="col-span-1 flex flex-col justify-end text-right space-y-2 pb-2">
                <div className="space-y-1">
                  <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-(--pr-slate) mb-1">
                    Document Ref: MSF-
                    {report.id?.slice(-8).toUpperCase() || "SYSTEM-NEW"}
                  </div>
                  <div className="h-px bg-(--pr-hero)/20 w-3/4 ml-auto" />
                  <div className="text-[12px] font-bold italic text-(--pr-hero) uppercase tracking-[0.2em] leading-none pt-1">
                    Max Strength <br />
                    Professional
                  </div>
                </div>
              </div>
            </div>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  // Selection view handled at start

  // Editing view (Standard form-based UI but matching themes)
  const editorSlots = padSlots(report.highlights);
  /** Keys of the slots that print — a suggestion already on the report isn't offered again. */
  const filledSlotKeys = editorSlots.map((s) => (reportCards([s]).length > 0 ? slotKey(s) : ""));
  const openSlotCount = editorSlots.filter((s) => isOpenSlot(s) && !s.suggested).length;
  return (
    <div className="min-h-screen bg-(--pr-navy) p-4 sm:p-8 lg:p-12 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-8 pb-32">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10 no-print print:hidden sticky top-4 z-50">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="text-white hover:bg-white/10 rounded-2xl w-11 h-11 print:hidden"
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div>
              <h1 className="text-xl font-bold uppercase italic tracking-tighter text-white">
                Progress Report
              </h1>
              <p className="text-[11px] font-bold text-(--pr-slate) uppercase tracking-widest mt-0.5">
                {client.firstName} {client.lastName} · {report.date}
              </p>
            </div>
          </div>
          <div className="flex gap-3 w-full sm:w-auto print:hidden">
            <button
              type="button"
              onClick={() => handleSave("Draft")}
              disabled={saving}
              className="pr-btn pr-btn--ghost flex-1 sm:flex-none print:hidden"
            >
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => handleSave("Finalized")}
              disabled={saving}
              className="pr-btn pr-btn--hero flex-1 sm:flex-none print:hidden"
            >
              Finalize Report
            </button>
          </div>
        </header>

        <ReportStepper
          active={activeStep}
          onChange={goToStep}
          done={{
            celebrate: report.attendance.totalSessions > 0 || !!report.attendance.narrative,
            highlights: reportCards(report.highlights).length > 0,
            machines: (report.machineProgression?.includedMachineIds.length ?? 0) > 0,
            fourps: (report.performanceMatrix.includedNotes?.length ?? 0) > 0 ||
              FOUR_PS.some(
                (k) =>
                  !!report.performanceMatrix[k]?.note ||
                  rankFromScore(report.performanceMatrix[k]?.score) !== null,
              ),
            goals: !!report.goals?.nextGoal,
          }}
        />

        <div className="space-y-8">
          {/* Section 1: Attendance */}
          {activeStep === "celebrate" && (
          <section className="pr-card" data-accent="hero">
            <h2 className="pr-card__title">
              <Calendar className="w-6 h-6" />
              {REPORT_STEPS[STEP_INDEX.celebrate].title}
            </h2>

            <div className="flex flex-col gap-8">
              {/* Date Filter & Narrative */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-(--pr-slate)">
                        Timeframe Start Date (Blank = All Time)
                      </Label>
                      {report.attendance.firstSessionDate && (
                        <button
                          onClick={() =>
                            handleRecalculateAttendance(
                              report.attendance.firstSessionDate!,
                            )
                          }
                          className="text-[11px] font-bold text-primary uppercase hover:underline"
                        >
                          Use First Session:{" "}
                          {shortDate(report.attendance.firstSessionDate) ||
                            report.attendance.firstSessionDate}
                        </button>
                      )}
                    </div>
                    <Input
                      type="date"
                      value={report.attendance.customStartDate || ""}
                      onChange={(e) =>
                        handleRecalculateAttendance(e.target.value)
                      }
                      className="h-12 rounded-xl font-medium border-2 border-slate-100 dark:border-slate-800 focus:border-(--pr-hero) transition-all"
                    />
                    <p className="text-[11px] text-(--pr-slate) italic mt-1 pb-2">
                      Changing this will auto-recalculate the metrics below
                      based on the selected timeframe.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-(--pr-slate)">
                      Trainer Narrative (The Vibe)
                    </Label>
                    <Textarea
                      value={report.attendance.narrative}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          attendance: {
                            ...report.attendance,
                            narrative: e.target.value,
                          },
                        })
                      }
                      className="min-h-25 rounded-3xl font-medium border-2 border-slate-100 dark:border-slate-800 focus:border-(--pr-hero) transition-all p-4"
                      placeholder="Celebrate their wins and consistency here..."
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-(--pr-slate)">
                    Report Metrics Configuration
                  </Label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      {
                        key: "totalSessions",
                        label: "Total Sessions Attended (Auto-Top)",
                        value: realStat(report.attendance.totalSessions),
                        unit: "",
                        why: "No completed sessions in this window.",
                      },
                      {
                        key: "totalVolume",
                        label: "Total Volume Lifted",
                        value: realStat(report.attendance.totalVolume),
                        unit: "lbs",
                        why: "No performed, weighted sets in this window.",
                      },
                      {
                        key: "totalReps",
                        label: "Total Reps",
                        value: realStat(report.attendance.totalReps),
                        unit: "",
                        why: "No performed, weighted sets in this window.",
                      },
                      {
                        key: "totalGoodReps",
                        label: "Green Quality Reps",
                        value: realStat(report.attendance.totalGoodReps),
                        unit: "reps",
                        why: "No top-quality sets rated in this window.",
                      },
                      {
                        key: "avgRestDays",
                        label: "Average Rest",
                        value: realStat(report.attendance.avgRestDays),
                        unit: "days",
                        why: `Needs ${AVG_REST_MIN_GAPS + 1} sessions in the window.`,
                      },
                      {
                        key: "avgDuration",
                        label: "Average Session Length",
                        value: realStat(report.attendance.avgDuration),
                        unit: "mins",
                        why: `Needs ${AVG_DURATION_MIN_SESSIONS} sessions with a recorded start and end — imported history has none.`,
                      },
                    ].map((metric) => (
                      <div
                        key={metric.key}
                        className={cn(
                          "p-3 rounded-2xl border-2 flex items-center justify-between transition-all",
                          report.attendance.toggles?.[
                            metric.key as keyof typeof report.attendance.toggles
                          ]
                            ? "border-(--pr-hero) bg-(--pr-hero)/5"
                            : "border-slate-100 bg-slate-50 opacity-60",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              const tg = report.attendance.toggles || {
                                totalSessions: true,
                                totalVolume: true,
                                totalReps: true,
                                totalGoodReps: true,
                                avgRestDays: true,
                                avgDuration: true,
                              };
                              setReport({
                                ...report,
                                attendance: {
                                  ...report.attendance,
                                  toggles: {
                                    ...tg,
                                    [metric.key]:
                                      !tg[metric.key as keyof typeof tg],
                                  },
                                },
                              });
                            }}
                            className={cn(
                              "w-10 h-6 rounded-full p-1 transition-all flex",
                              report.attendance.toggles?.[
                                metric.key as keyof typeof report.attendance.toggles
                              ]
                                ? "bg-(--pr-hero) justify-end"
                                : "bg-slate-300 justify-start",
                            )}
                          >
                            <div className="w-4 h-4 rounded-full bg-white dark:bg-slate-900 shadow-sm" />
                          </button>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-(--pr-navy)">
                              {metric.label}
                            </p>
                            {metric.value !== null ? (
                              <p className="text-[12px] font-bold text-(--pr-hero)">
                                {metric.value.toLocaleString()}{" "}
                                <span className="text-[11px] text-(--pr-slate) uppercase">
                                  {metric.unit}
                                </span>
                              </p>
                            ) : (
                              <p className="text-[12px] font-bold text-(--pr-slate)">
                                — not enough data yet
                                <span className="block text-[11px] font-medium normal-case">
                                  {historyStatus === "loading" ? "Reading their sessions…" : metric.why}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
          )}

          {/* Section 2: Accolades — three data-backed wins (accolades.ts) */}
          {activeStep === "highlights" && (
          <section className="pr-card" data-accent="navy">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="pr-card__title pr-card__title--tight">
                <Award className="w-6 h-6" />
                {REPORT_STEPS[STEP_INDEX.highlights].title}
              </h2>
              {historyStatus === "ready" && openSlotCount > 0 && candidates.length > 0 && (
                <button type="button" onClick={fillOpenSlots} className="pr-btn pr-btn--outline pr-btn--sm">
                  Fill empty slots from the data
                </button>
              )}
            </div>
            <p className="pr-lede">
              {historyStatus === "error"
                ? "Couldn't read their sessions just now, so nothing could be suggested. You can still write a custom highlight, or come back to this step."
                : candidates.length === 0 && historyStatus === "ready"
                  ? "The data doesn't back an accolade in this window yet — widen the window in step 1, or write a custom highlight."
                  : `The system suggests the strongest wins it can prove. ${candidates.length > 0 ? `${candidates.length} in this window. ` : ""}Swap any of them; an empty slot is never printed.`}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {editorSlots.map((h, i) => (
                <AccoladeSlotEditor
                  key={i}
                  index={i}
                  slot={h}
                  machines={machines}
                  ctx={slotCtx}
                  candidates={candidates}
                  takenKeys={new Set(filledSlotKeys.filter((k, j) => j !== i && k))}
                  loading={historyStatus === "loading" || historyStatus === "idle"}
                  onChange={(next) => setSlot(i, next)}
                />
              ))}
            </div>
          </section>
          )}

          {/* Section 2b: Machine progression */}
          {activeStep === "machines" && (
          <section className="pr-card" data-accent="blue">
            <h2 className="pr-card__title">
              <Dumbbell className="w-6 h-6" />
              Machine Progression
            </h2>
            <MachineProgressionStep
              machines={machines}
              history={machineHistory}
              value={report.machineProgression ?? { includedMachineIds: [], rows: [] }}
              onChange={(machineProgression) => setReport((r) => ({ ...r, machineProgression }))}
            />
          </section>
          )}

          {/* Section 3: Performance Matrix */}
          {activeStep === "fourps" && (
          <section className="pr-card" data-accent="slate">
            <h2 className="pr-card__title">
              <LayoutGrid className="w-6 h-6" />
              {REPORT_STEPS[STEP_INDEX.fourps].title}
            </h2>

            <FocusHistoryPanel
              focuses={focuses}
              status={focusStatus === "idle" ? "loading" : focusStatus}
              asOf={reportAsOf}
            />

            <FourPsStep
              value={report.performanceMatrix}
              onChange={(performanceMatrix) => setReport((r) => ({ ...r, performanceMatrix }))}
            />
          </section>
          )}

          {/* Section 4: Goals + Roadmap */}
          {activeStep === "goals" && (
          <section className="pr-card" data-accent="hero">
            <h2 className="pr-card__title">
              <Flag className="w-6 h-6" />
              {REPORT_STEPS[STEP_INDEX.goals].title} · The Next 90 Days
            </h2>
            {/* Read-only: the client's most recent finalized Pulse. */}
            <PulseSnapshot state={pulseSnapshot} machines={machines} />
            <div className="mb-10">
              <GoalsBlock
                value={
                  report.goals ?? {
                    originalWhy: client.globalNotes || "",
                    previousGoal: client.smartGoal || "",
                    previousGoalOutcome: null,
                    previousGoalNote: "",
                    nextGoal: "",
                    nextGoalTargetDate: addDays(report.date, 90),
                    followUpDate: addDays(report.date, 90),
                    checkpoints: [],
                  }
                }
                onChange={(goals) => setReport((r) => ({ ...r, goals }))}
                clientFirstName={client.firstName}
                previousReportDate={previousReport?.date ?? null}
              />
            </div>

            <h2 className="pr-card__title">
              <MapIcon className="w-6 h-6" />
              Training Plan
            </h2>

            <div className="space-y-8">
              {/* Track Selection */}
              <div className="space-y-4">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-(--pr-slate) ml-1">
                  Step 1: Select Diagnostic Track
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      id: "maintenance",
                      label: "Maintenance",
                      description: "Focus on Health Longevity & Habits",
                    },
                    {
                      id: "goals",
                      label: "Goal Setting",
                      description: 'Focus on "Go-Getters" & Performance',
                    },
                    {
                      id: "refinement",
                      label: "Refinement",
                      description: 'Focus on the "4 Ps" / Form Matrix',
                    },
                  ].map((track) => (
                    <button
                      key={track.id}
                      onClick={() =>
                        setReport({
                          ...report,
                          roadmap: {
                            ...report.roadmap!,
                            trackType: track.id as any,
                            selectedHabits:
                              report.roadmap?.selectedHabits || [],
                            goalActions: report.roadmap?.goalActions || [],
                          },
                        })
                      }
                      className={cn(
                        "p-4 rounded-2xl border-2 text-left transition-all",
                        report.roadmap?.trackType === track.id
                          ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20"
                          : "bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200",
                      )}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-widest leading-none mb-1">
                        {track.label}
                      </p>
                      <p className="text-[11px] font-bold opacity-60 uppercase">
                        {track.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Track 1: Maintenance */}
              {report.roadmap?.trackType === "maintenance" && (
                <div className="bg-white dark:bg-slate-900 border-2 border-blue-500/20 p-6 rounded-[32px] space-y-6">
                  <h3 className="text-lg font-bold uppercase italic tracking-tighter text-blue-900 dark:text-blue-100 mb-4">
                    Maintenance Track: Longevity
                  </h3>

                  <div className="space-y-4">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                      Lifestyle Habits to Focus On
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "Increase Protein Intake",
                        "Increase Water Intake",
                        "Improve Sleep",
                        "Track Calories",
                        "InBody Scans",
                        "Other",
                      ].map((habit) => {
                        const isSelected =
                          report.roadmap?.selectedHabits?.includes(habit);
                        return (
                          <button
                            key={habit}
                            onClick={() => {
                              const currentHabits =
                                report.roadmap?.selectedHabits || [];
                              const newHabits = isSelected
                                ? currentHabits.filter((h) => h !== habit)
                                : [...currentHabits, habit];
                              setReport({
                                ...report,
                                roadmap: {
                                  ...report.roadmap!,
                                  selectedHabits: newHabits,
                                },
                              });
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-widest border transition-colors cursor-pointer",
                              isSelected
                                ? "bg-blue-500 text-white border-blue-500"
                                : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-blue-400",
                            )}
                          >
                            {habit}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          setReport({
                            ...report,
                            roadmap: {
                              ...report.roadmap!,
                              routineChangeRequested:
                                !report.roadmap?.routineChangeRequested,
                            },
                          })
                        }
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative",
                          report.roadmap?.routineChangeRequested
                            ? "bg-blue-500"
                            : "bg-slate-200 dark:bg-slate-800",
                        )}
                      >
                        <span
                          className={cn(
                            "w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
                            report.roadmap?.routineChangeRequested
                              ? "left-7"
                              : "left-1",
                          )}
                        />
                      </button>
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">
                        Routine Modification Requested?
                      </Label>
                    </div>
                    {report.roadmap?.routineChangeRequested && (
                      <Textarea
                        value={report.roadmap?.routineModifications || ""}
                        onChange={(e) =>
                          setReport({
                            ...report,
                            roadmap: {
                              ...report.roadmap!,
                              routineModifications: e.target.value,
                            },
                          })
                        }
                        className="min-h-25 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-blue-500 p-4"
                        placeholder="Document requested modifications to their current routine..."
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Track 2: Goals */}
              {report.roadmap?.trackType === "goals" && (
                <div className="bg-white dark:bg-slate-900 border-2 border-blue-500/20 p-6 rounded-[32px] space-y-6">
                  <h3 className="text-lg font-bold uppercase italic tracking-tighter text-blue-900 dark:text-blue-100 mb-4">
                    Goal Setting Track: Performance
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
                        The Emotional Anchor ("Why")
                      </Label>
                      <Textarea
                        value={report.roadmap?.emotionalAnchor || ""}
                        onChange={(e) =>
                          setReport({
                            ...report,
                            roadmap: {
                              ...report.roadmap!,
                              emotionalAnchor: e.target.value,
                            },
                          })
                        }
                        className="min-h-25 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-blue-500 p-4"
                        placeholder="e.g., Playing with grandkids without pain..."
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
                        SMART Goal Category / Detail
                      </Label>
                      <Textarea
                        value={report.roadmap?.smartGoal || ""}
                        onChange={(e) =>
                          setReport({
                            ...report,
                            roadmap: {
                              ...report.roadmap!,
                              smartGoal: e.target.value,
                            },
                          })
                        }
                        className="min-h-25 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-blue-500 p-4"
                        placeholder="e.g., Increase leg press by 20% in 3 months..."
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
                      Clinical Prescription
                    </Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                          Target Machine Integration
                        </Label>
                        <Select
                          value={report.roadmap?.targetMachineId || ""}
                          onValueChange={(v) =>
                            setReport({
                              ...report,
                              roadmap: {
                                ...report.roadmap!,
                                targetMachineId: v,
                              },
                            })
                          }
                        >
                          <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-bold rounded-xl">
                            <SelectValue placeholder="Select Machine to Integrate" />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                            {machines.map((m) => (
                              <SelectItem key={m.id} value={m.id!}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                          Recommended Actions
                        </Label>
                        <div className="flex flex-col gap-2">
                          {[
                            "Add Machine to Rotation",
                            "Schedule Recurring InBody Scans",
                            "Add Routine",
                          ].map((action) => {
                            const isSelected =
                              report.roadmap?.goalActions?.includes(action);
                            return (
                              <button
                                key={action}
                                onClick={() => {
                                  const currentActions =
                                    report.roadmap?.goalActions || [];
                                  const newActions = isSelected
                                    ? currentActions.filter((a) => a !== action)
                                    : [...currentActions, action];
                                  setReport({
                                    ...report,
                                    roadmap: {
                                      ...report.roadmap!,
                                      goalActions: newActions,
                                    },
                                  });
                                }}
                                className={cn(
                                  "px-3 py-2 rounded-xl text-left text-[11px] font-bold uppercase tracking-widest border transition-colors cursor-pointer",
                                  isSelected
                                    ? "bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                                    : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-blue-400",
                                )}
                              >
                                {action}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
                      Machine Plan Mapping
                    </Label>
                    <Textarea
                      value={report.roadmap?.machinePlan || ""}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          roadmap: {
                            ...report.roadmap!,
                            machinePlan: e.target.value,
                          },
                        })
                      }
                      className="min-h-25 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-blue-500 p-4"
                      placeholder="Detail the roadmap for adding specific machines to their plan..."
                    />
                  </div>
                </div>
              )}

              {/* Track 3: Refinement */}
              {report.roadmap?.trackType === "refinement" && (
                <div className="bg-white dark:bg-slate-900 border-2 border-blue-500/20 p-6 rounded-[32px] space-y-6">
                  <h3 className="text-lg font-bold uppercase italic tracking-tighter text-blue-900 dark:text-blue-100 mb-4">
                    Refinement Track: Form & Technique
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
                        Performance Matrix Focus (The 4 Ps)
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {["Posture", "Pace", "Path", "Purpose"].map((p) => (
                          <button
                            key={p}
                            onClick={() =>
                              setReport({
                                ...report,
                                roadmap: {
                                  ...report.roadmap!,
                                  refinementFocusArea: p,
                                },
                              })
                            }
                            className={cn(
                              "py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all text-center border-2",
                              report.roadmap?.refinementFocusArea === p
                                ? "bg-blue-600 border-blue-600 text-white"
                                : "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:border-blue-200 dark:hover:border-blue-500/50",
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
                        Target Machine for Refinement
                      </Label>
                      <Select
                        value={report.roadmap?.targetMachineId || ""}
                        onValueChange={(v) =>
                          setReport({
                            ...report,
                            roadmap: { ...report.roadmap!, targetMachineId: v },
                          })
                        }
                      >
                        <SelectTrigger className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 text-xs font-bold rounded-2xl h-12">
                          <SelectValue placeholder="Search Machine..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                          {machines.map((m) => (
                            <SelectItem key={m.id} value={m.id!}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">
                      Routine Intervention
                    </Label>
                    <Textarea
                      value={report.roadmap?.routineIntervention || ""}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          roadmap: {
                            ...report.roadmap!,
                            routineIntervention: e.target.value,
                          },
                        })
                      }
                      className="min-h-25 rounded-2xl border-2 border-slate-100 dark:border-slate-800 focus:border-blue-500 p-4"
                      placeholder="Specifically map out the adjustment to their training routine..."
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
          )}

          {/* Section 5: Trainer Notes */}
          {activeStep === "goals" && (
          <section className="pr-card" data-accent="navy">
            <h2 className="pr-card__title">
              <FileText className="w-6 h-6" />
              Closing Trainer Notes
            </h2>
            <div className="space-y-4">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-(--pr-slate)">
                Lead Practitioner Wrap-Up
              </Label>
              <Textarea
                value={report.trainerNotes}
                onChange={(e) =>
                  setReport({ ...report, trainerNotes: e.target.value })
                }
                className="min-h-30 rounded-3xl font-medium border-2 border-slate-100 dark:border-slate-800 focus:border-(--pr-hero) transition-all p-4 print:border-none print:p-0 print:bg-transparent"
                placeholder="Incredible work this quarter... Keep showing up."
              />
            </div>
          </section>
          )}

          <ReportStepNav
            active={activeStep}
            onChange={goToStep}
            onFinalize={() => handleSave("Finalized")}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );
}
