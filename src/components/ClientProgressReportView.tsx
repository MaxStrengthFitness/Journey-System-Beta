import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
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
  calculateHighlightedMovements,
  calculateComprehensiveAttendanceStats,
  calculateDynamicHighlightMetrics,
} from "../lib/progress-utils";
import { cn } from "../lib/utils";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

interface ClientProgressReportViewProps {
  client: Client;
  trainer: Trainer;
  machines: Machine[];
  onBack: () => void;
  existingReportId?: string;
}

const FOUR_PILLARS_DATA = {
  posture: {
    title: "POSTURE",
    definition:
      "Maintaining a perfectly rigid midsection and stable setup from head to toe to prevent energy leaks and ensure precise loading of the target muscle.",
    rank5:
      "Maintained a completely locked torso, neutral head, and relaxed face through the hardest reps. Zero shifting or wiggling.",
    rank3:
      "Great initial setup, but experienced structural breakdown (e.g., chest collapsing, chin tucking, or wiggling) as discomfort increased.",
    rank1:
      "Required constant cueing to maintain basic joint stacking, keep hips anchored, or keep feet planted.",
  },
  pace: {
    title: "PACE",
    definition:
      "Moving at a smooth, continuous 6-to-10-second speed to eliminate momentum, forcing the muscles to manage the load at all times.",
    rank5:
      "Masterful, unvarying speed. Turnarounds were perfectly seamless ('touch and go') with absolutely no pausing or resting at the bottom.",
    rank3:
      "Mostly controlled, but instinctively sped up during the pushing phase or paused slightly at the turnarounds to catch a break.",
    rank1:
      "Movements were fast, segmented, or jerky. Struggled to control the weight on the descent (dropping the weight).",
  },
  path: {
    title: "PATH",
    definition:
      "Keeping the limbs in the exact prescribed plane of motion to force the intended muscle to do the work, fighting the instinct to shift to fresh muscles.",
    rank5:
      "Limbs tracked flawlessly. Completely overcame the survival instinct to shift the load, keeping tension exactly where it belonged.",
    rank3:
      "Path altered slightly under heavy load (e.g., elbows flaring, shoulders shrugging) in an attempt to find the path of least resistance.",
    rank1:
      "Major deviations from the prescribed movement path, which unloads the target muscle and requires physical correction.",
  },
  purpose: {
    title: "PURPOSE",
    definition:
      "The mental intent to maximize Motor Unit Recruitment (MUR) by actively pushing harder as fatigue sets in, rather than just trying to survive the set.",
    rank5:
      "Actively embraced the discomfort. Voluntarily increased effort (pushed/pulled harder) as the weight bogged down to reach the Stimulating Reps.",
    rank3:
      "Tolerated the high effort but mentally 'hung on' to survive rather than actively attacking the final reps. Needed heavy vocal prompting.",
    rank1:
      "Aborted the set at the first sensation of muscle burning. Unwilling to exert the meaningful effort required to trigger an adaptation.",
  },
};

export function ClientProgressReportView({
  client,
  trainer,
  machines,
  onBack,
  existingReportId,
}: ClientProgressReportViewProps) {
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
    date: new Date().toISOString().split("T")[0],
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

    highlights: [
      { label: "", startValue: "", currentValue: "", featuredMetric: "weight" },
      { label: "", startValue: "", currentValue: "", featuredMetric: "weight" },
      { label: "", startValue: "", currentValue: "", featuredMetric: "weight" },
    ],

    performanceMatrix: {
      posture: {
        score: 80,
        note: "",
        talkingPoints: [
          { id: "pos-1", text: "Ribcage Stability", status: "black" },
          { id: "pos-2", text: "Setup Integrity", status: "black" },
          { id: "pos-3", text: "Bracing Quality", status: "black" },
        ],
      },
      pace: {
        score: 80,
        note: "",
        talkingPoints: [
          { id: "pac-1", text: "Constant Tension", status: "black" },
          { id: "pac-2", text: "Control Velocity", status: "black" },
          { id: "pac-3", text: "Resistance Tolerance", status: "black" },
        ],
      },
      path: {
        score: 80,
        note: "",
        talkingPoints: [
          { id: "pat-1", text: "Active ROM", status: "black" },
          { id: "pat-2", text: "Line of Pull", status: "black" },
          { id: "pat-3", text: "Leverage Optimization", status: "black" },
        ],
      },
      purpose: {
        score: 80,
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
      anchorCategory: "general_conditioning",
      emotionalAnchor: client.globalNotes || "",
      smartGoal: "",
      prescriptionType: "qualitative",
      inStudioPrescription: {
        targetMachine: machines[0]?.id || "m-leg-press",
        targetMetric: "",
        qualitativeFocus: "",
        timeframe: "Next 12 Weeks",
      },
    },
    trainerNotes: "",
    createdAt: null,
  });

  const [selectingHighlightIdx, setSelectingHighlightIdx] = useState<
    number | null
  >(null);
  const [machineHistory, setMachineHistory] = useState<Record<string, any>>({});

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

  // Load auto data
  useEffect(() => {
    async function loadData() {
      if (mode !== "editing" || report.isManual || existingReportId) return;
      setLoading(true);
      try {
        const initialStats = await calculateComprehensiveAttendanceStats(
          client.id!,
          report.attendance.customStartDate,
        );
        const activeStartDate =
          report.attendance.customStartDate || initialStats.firstSessionDate;

        // Use activeStartDate to actually get the scoped stats!
        const stats = report.attendance.customStartDate
          ? initialStats
          : await calculateComprehensiveAttendanceStats(
              client.id!,
              activeStartDate,
            );

        const defaultHighlights = machines
          .filter(
            (m) =>
              m.name.toLowerCase().includes("leg press") ||
              m.name.toLowerCase().includes("row") ||
              m.name.toLowerCase().includes("chest"),
          )
          .slice(0, 3);

        const initialHighlights = [];
        for (const m of defaultHighlights) {
          const d = await calculateDynamicHighlightMetrics(
            client.id!,
            m.id!,
            activeStartDate,
          );
          if (d) {
            initialHighlights.push({
              machineId: m.id!,
              label: m.name,
              metricType: "strength_gain" as const,
              startValue: `${d.startWeight} lbs`,
              currentValue: `${d.currentWeight} lbs`,
              percentageIncrease: d.percentageIncrease,
              totalVolume: d.totalVolume,
              perfectSets: d.perfectSets,
              timeUnderTension: d.timeUnderTension,
            });
          }
        }

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
            narrative: `Thank you for your consistency, ${client.firstName}. Your commitment to the protocol is driving these results.`,
          },
          highlights: initialHighlights
            .concat(
              Array(3 - initialHighlights.length).fill({
                label: "",
                metricType: "strength_gain",
              }),
            )
            .slice(0, 3),
        }));
      } catch (err) {
        console.error("Auto data failed:", err);
      } finally {
        setLoading(false);
      }
    }
    if (mode === "editing" && !report.isManual) {
      loadData();
    }
  }, [client, machines, mode, report.isManual, existingReportId]);

  const handleRecalculateAttendance = async (customStartDate?: string) => {
    try {
      const activeStartDate = customStartDate; // if blank, use blank.
      const stats = await calculateComprehensiveAttendanceStats(
        client.id!,
        activeStartDate,
      );

      const newHighlights = [...report.highlights];
      for (let i = 0; i < newHighlights.length; i++) {
        const h = newHighlights[i];
        if (h.machineId && h.machineId !== "none") {
          const d = await calculateDynamicHighlightMetrics(
            client.id!,
            h.machineId,
            activeStartDate,
          );
          if (d) {
            h.startValue = `${d.startWeight} lbs`;
            h.currentValue = `${d.currentWeight} lbs`;
            h.percentageIncrease = d.percentageIncrease;
            h.totalVolume = d.totalVolume;
            h.perfectSets = d.perfectSets;
            h.timeUnderTension = d.timeUnderTension;
          }
        }
      }

      setReport((prev) => ({
        ...prev,
        attendance: {
          ...prev.attendance,
          customStartDate: activeStartDate || "",
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
        highlights: newHighlights,
      }));
    } catch (e) {
      console.error(e);
    }
  };

  // Load history for selector
  useEffect(() => {
    async function loadAllHistory() {
      if (!client.id || mode !== "editing") return;
      try {
        const historyMap: Record<string, any> = {};
        const activeStartDate = report.attendance.customStartDate;

        await Promise.all(
          machines.map(async (m) => {
            if (!m.id) return;
            const stats = await calculateDynamicHighlightMetrics(
              client.id!,
              m.id,
              activeStartDate,
            );
            if (stats) {
              historyMap[m.id] = stats;
            }
          }),
        );

        setMachineHistory(historyMap);
      } catch (err) {
        console.error("History selector load failed:", err);
      }
    }
    loadAllHistory();
  }, [client.id, machines, mode, report.attendance.customStartDate]);

  const handleSave = async (status: "Draft" | "Finalized" = "Finalized") => {
    setSaving(true);
    try {
      // Recursively remove undefined values to prevent Firestore crashes
      const removeUndefined = (obj: any): any => {
        if (obj === undefined) return undefined;
        if (obj === null) return null;
        if (typeof obj !== 'object') return obj;
        if (obj.serverTime || obj.isEqual) return obj; // Handle FieldValue / Timestamp
        if (Array.isArray(obj)) return obj.map(removeUndefined).filter(v => v !== undefined);
        const res: any = {};
        for (const k in obj) {
          const val = removeUndefined(obj[k]);
          if (val !== undefined) res[k] = val;
        }
        return res;
      };

      const sanitizedReport = removeUndefined({
        ...report,
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
        const docRef = await addDoc(collection(db, "progressReports"), sanitizedReport);
        reportId = docRef.id;
        setReport((prev) => ({ ...prev, id: docRef.id }));
      }

      if (status === "Finalized") {
        setShowExportOptions(true);
        setMode("view");
      } else {
        alert("Draft saved.");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "progressReports");
    } finally {
      setSaving(false);
    }
  };

  const handleHighlightConfigChange = async (
    slotIdx: number,
    field: "machineId" | "metricType" | "customText",
    value: string,
  ) => {
    const newHighlights = [...report.highlights];
    const h = { ...newHighlights[slotIdx], [field]: value };

    if (field === "machineId") {
      const machine = machines.find((m) => m.id === value);
      h.label = machine?.name || "";
      if (!h.metricType) h.metricType = "strength_gain";
    }

    if (h.machineId && h.machineId !== "none" && h.metricType) {
      const stats = await calculateDynamicHighlightMetrics(
        client.id!,
        h.machineId,
        report.attendance.customStartDate,
      );
      if (stats) {
        h.startValue = `${stats.startWeight} lbs`;
        h.currentValue = `${stats.currentWeight} lbs`;
        h.percentageIncrease = stats.percentageIncrease;
        h.totalVolume = stats.totalVolume;
        h.perfectSets = stats.perfectSets;
        h.timeUnderTension = stats.timeUnderTension;
      }
    }

    newHighlights[slotIdx] = h;
    setReport({ ...report, highlights: newHighlights });
  };

  if (mode === "selection") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 space-y-12 max-w-2xl mx-auto text-center bg-[#0A2E46] rounded-[60px] my-12 border border-white/5 shadow-2xl">
        <div className="space-y-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 rounded-[40px] bg-[#F06C22]/10 flex items-center justify-center mx-auto mb-8 border border-[#F06C22]/20 shadow-[0_0_40px_rgba(240,108,34,0.1)]"
          >
            <Award className="w-12 h-12 text-[#F06C22]" />
          </motion.div>
          <h2 className="text-4xl font-black uppercase italic tracking-tighter text-white">
            Initialize Report
          </h2>
          <p className="text-[#68717A] font-bold uppercase text-xs tracking-widest leading-relaxed">
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
            className="flex flex-col items-center p-8 bg-white/5 border-2 border-[#F06C22]/20 rounded-[40px] hover:border-[#F06C22] transition-all group hover:bg-[#F06C22]/[0.02] text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#F06C22] flex items-center justify-center mb-6 shadow-lg shadow-[#F06C22]/20 group-hover:scale-110 transition-transform">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-black uppercase italic mb-2 text-white">
              Auto-Populate
            </h3>
            <p className="text-[10px] text-[#68717A] font-bold uppercase tracking-widest leading-relaxed">
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
            <h3 className="text-xl font-black uppercase italic mb-2 text-white">
              Manual Entry
            </h3>
            <p className="text-[10px] text-[#68717A] font-bold uppercase tracking-widest leading-relaxed">
              Start with a blank canvas. Ideal for clients with external
              history.
            </p>
          </motion.button>
        </div>

        <Button
          variant="ghost"
          onClick={onBack}
          className="text-slate-300 hover:text-white hover:bg-slate-800 font-black uppercase tracking-[0.3em] text-[10px] h-12 px-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Abort Mission
        </Button>
      </div>
    );
  }

  if (mode === "view") {
    return (
      <div className="min-h-screen bg-[#0A2E46] text-[#FAF9F6] selection:bg-[#F06C22]/30 selection:text-white print:bg-white">
        <style>{`
          @media print {
            @page { size: portrait; margin: 0.5cm; }
            body { background: white !important; color: black !important; font-size: 11px !important; }
            .print-area { padding: 0 !important; margin: 0 !important; max-width: none !important; background: white !important; width: 100% !important; zoom: 0.8; }
            .no-print { display: none !important; }
            .report-card { border: none !important; box-shadow: none !important; background: white !important; color: black !important; padding: 0 !important; border-radius: 0 !important; }
            .bg-[#0A2E46] { background: white !important; }
            .text-[#FAF9F6], .text-white { color: #0A2E46 !important; }
            .text-[#68717A] { color: #666 !important; }
            .bg-white\\/5 { background: #fdfdfd !important; border: 1px solid #eee !important; }
            .shadow-2xl, .shadow-xl, .shadow-lg { box-shadow: none !important; }
            .border-white\\/10 { border-color: #eee !important; }
            .text-[#F06C22] { color: #D95B16 !important; font-weight: 900 !important; }
            .bg-[#F06C22] { background: #D95B16 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .bg-emerald-500 { background-color: #10B981 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .bg-amber-400 { background-color: #FBBF24 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .bg-rose-500 { background-color: #F43F5E !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .rounded-[30px], .rounded-[40px] { border-radius: 0.5rem !important; }
            h1 { font-size: 1.8rem !important; margin-bottom: 0.25rem !important; }
            h2 { font-size: 1.1rem !important; margin-bottom: 0.25rem !important; }
            h3 { font-size: 0.9rem !important; margin-bottom: 0.25rem !important; }
            h4 { font-size: 0.75rem !important; margin-bottom: 0.25rem !important; }
            p, span { font-size: 0.7rem !important; }
            .space-y-4 > * + * { margin-top: 0.5rem !important; }
            .space-y-6 > * + * { margin-top: 0.75rem !important; }
            .scale-indicator { gap: 2px !important; }
            .scale-block { height: 6px !important; border-radius: 2px !important; }
            .gap-3 { gap: 0.5rem !important; }
            .gap-4 { gap: 0.75rem !important; }
            .p-4 { padding: 0.5rem !important; }
            .p-5, .p-6 { padding: 0.75rem !important; }
            .pb-4 { padding-bottom: 0.5rem !important; }
          }
        `}</style>

        <div className="max-w-4xl mx-auto px-6 py-4 space-y-4 print-area print:m-0 print:p-0">
          {/* Controls */}
          <div className="flex justify-between items-center no-print print:hidden">
            <Button
              variant="ghost"
              onClick={onBack}
              className="text-white hover:bg-white/10 rounded-2xl gap-2 font-black uppercase italic tracking-widest px-6 print:hidden"
            >
              <ArrowLeft className="w-5 h-5" /> Back
            </Button>
            <div className="flex gap-3 print:hidden">
              <Button
                onClick={() => setMode("editing")}
                variant="outline"
                className="text-white bg-transparent border-white/20 hover:bg-white/10 rounded-2xl gap-2 font-black uppercase italic tracking-widest px-6 print:hidden"
              >
                Edit Data
              </Button>
              <Button
                onClick={() => window.print()}
                className="bg-[#F06C22] hover:bg-[#D95B16] text-white rounded-2xl gap-2 font-black uppercase italic tracking-widest px-8 shadow-lg shadow-[#F06C22]/20 print:hidden"
              >
                <Printer className="w-5 h-5" /> Print Report
              </Button>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="report-card space-y-3"
          >
            {/* 1. HERO HEADER: ATTENDANCE & DEDICATION */}
            <header className="space-y-3 print:break-inside-avoid">
              <div className="flex flex-col md:flex-row md:items-end justify-between border-b-2 border-[#F06C22] pb-4 gap-4">
                <div>
                  <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-3 print:text-[#0A2E46]">
                    Performance <br />
                    <span className="text-[#F06C22]">Report Card</span>
                  </h1>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[8px] font-black uppercase tracking-[0.25em] text-[#68717A]">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[#F06C22]" />
                      <span className="text-white print:text-[#0A2E46]">
                        {client.firstName} {client.lastName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#F06C22]" />
                      Report:{" "}
                      <span className="text-white print:text-[#0A2E46]">
                        {new Date(report.date + "T12:00:00").toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-80">
                      <CheckCircle2 className="w-3 h-3 text-[#F06C22]/60" />
                      Joined:{" "}
                      <span className="text-white/60 print:text-slate-500">
                        Jan 15, 2026
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-80">
                      <CheckCircle2 className="w-3 h-3 text-[#F06C22]/60" />
                      Prev Report:{" "}
                      <span className="text-white/60 print:text-slate-500">
                        Mar 01, 2026
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end md:text-right">
                  <p className="text-[7px] font-black uppercase tracking-[0.4em] text-[#68717A] mb-1">
                    Authenticated By
                  </p>
                  <p className="text-base font-black uppercase italic tracking-tight print:text-[#0A2E46] leading-none mb-1">
                    {trainer.fullName}
                  </p>
                  <div className="bg-[#F06C22] px-2 py-0.5 rounded-md">
                    <p className="text-[7px] font-black text-white uppercase tracking-widest">
                      Lead Practitioner • MSF Studio
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 mt-6">
                {/* Highlighted Primary Stats & Narrative */}
                <div className="flex flex-col md:flex-row gap-4">
                  {report.attendance.toggles?.totalSessions !== false && (
                    <div className="bg-[#F06C22] p-6 rounded-[25px] text-white flex flex-col justify-center items-center text-center shadow-xl shadow-[#F06C22]/30 relative overflow-hidden group min-w-[200px]">
                      <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                      <Award className="w-8 h-8 mb-2 opacity-50 relative z-10" />
                      <p className="text-5xl font-black italic tracking-tighter leading-none relative z-10">
                        {report.attendance.totalSessions}
                      </p>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-90 mt-2 relative z-10">
                        Total Sessions
                      </p>
                      <div className="mt-3 pt-3 border-t border-white/20 w-full relative z-10">
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/80">
                          First Session
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-tighter opacity-100 italic">
                          {report.attendance.firstSessionDate
                            ? new Date(
                                report.attendance.firstSessionDate +
                                  "T12:00:00",
                              ).toLocaleDateString()
                            : "--"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 bg-white/5 backdrop-blur-md p-6 rounded-[25px] border border-white/10 flex flex-col justify-center print:bg-slate-50 relative">
                    <Quote className="w-12 h-12 text-[#F06C22] absolute top-4 right-4 opacity-10" />
                    <p className="text-lg md:text-xl font-black italic uppercase tracking-tight leading-tight text-white print:text-[#0A2E46] max-w-[90%]">
                      "
                      {report.attendance.narrative ||
                        `Incredible work, ${client.firstName}. Your dedication to this clinical protocol is exactly what drives meaningful biological change.`}
                      "
                    </p>
                  </div>
                </div>

                {/* Secondary Toggled Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {report.attendance.toggles?.totalVolume !== false && (
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center print:border-slate-200">
                      <h4 className="text-[8px] font-black uppercase tracking-widest text-[#68717A] mb-1">
                        Total Volume Lifted
                      </h4>
                      <p className="text-2xl font-black text-[#0A2E46] italic">
                        {(report.attendance.totalVolume || 0).toLocaleString()}
                        <span className="text-[10px] text-[#68717A] ml-1 not-italic">
                          lbs
                        </span>
                      </p>
                    </div>
                  )}
                  {report.attendance.toggles?.totalReps !== false && (
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center print:border-slate-200">
                      <h4 className="text-[8px] font-black uppercase tracking-widest text-[#68717A] mb-1">
                        Total Reps
                      </h4>
                      <p className="text-2xl font-black text-[#0A2E46] italic">
                        {(report.attendance.totalReps || 0).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {report.attendance.toggles?.totalGoodReps !== false && (
                    <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm text-center print:border-slate-200 bg-emerald-50/10">
                      <h4 className="text-[8px] font-black uppercase tracking-widest text-emerald-700 mb-1">
                        Green Quality Reps
                      </h4>
                      <p className="text-2xl font-black text-emerald-600 italic">
                        {(
                          report.attendance.totalGoodReps || 0
                        ).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {report.attendance.toggles?.avgRestDays !== false && (
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center print:border-slate-200">
                      <h4 className="text-[8px] font-black uppercase tracking-widest text-[#68717A] mb-1">
                        Average Rest
                      </h4>
                      <p className="text-2xl font-black text-[#0A2E46] italic">
                        {report.attendance.avgRestDays || 0}
                        <span className="text-[10px] text-[#68717A] ml-1 not-italic">
                          days
                        </span>
                      </p>
                    </div>
                  )}
                  {report.attendance.toggles?.avgDuration !== false && (
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center print:border-slate-200">
                      <h4 className="text-[8px] font-black uppercase tracking-widest text-[#68717A] mb-1">
                        Avg Session Length
                      </h4>
                      <p className="text-2xl font-black text-[#0A2E46] italic">
                        {report.attendance.avgDuration || 0}
                        <span className="text-[10px] text-[#68717A] ml-1 not-italic">
                          mins
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* 2. THE TROPHIES: HIGHLIGHTED MOVEMENTS */}
            <section className="space-y-3 print:break-inside-avoid">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full border border-white/10">
                  <TrendingUp className="w-3.5 h-3.5 text-[#F06C22]" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FAF9F6] print:text-[#0A2E46]">
                    Elite Strength Progress
                  </h3>
                </div>
                <div className="h-px bg-white/10 flex-1 print:bg-slate-100"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {report.highlights.map((h, i) => {
                  let heroText = "";
                  let heroColor = "text-white";
                  let contextText = "";

                  switch (h.metricType) {
                    case "strength_gain":
                      heroText = `+${h.percentageIncrease || 0}%`;
                      heroColor = "text-[#F06C22]";
                      contextText = `Increase from ${h.startValue} to ${h.currentValue}`;
                      break;
                    case "total_volume":
                      heroText = `${(h.totalVolume || 0).toLocaleString()} lbs Volume`;
                      heroColor = "text-white";
                      contextText = "Total weight moved this period";
                      break;
                    case "consistent_quality":
                      heroText = `${h.perfectSets || 0} Perfect Sets`;
                      heroColor = "text-emerald-400";
                      contextText = "Flawless Form";
                      break;
                    case "time_under_tension":
                      heroText = `${h.timeUnderTension || 0} Secs Under Load`;
                      heroColor = "text-white";
                      contextText = "Total time spent under tension";
                      break;
                    case "custom":
                      heroText = h.customText || "Outstanding Progress";
                      heroColor = "text-[#F06C22]";
                      contextText = "Trainer Highlight";
                      break;
                    default:
                      heroText = `+${h.percentageIncrease || 0}%`;
                      heroColor = "text-[#F06C22]";
                      contextText = `Increase from ${h.startValue} to ${h.currentValue}`;
                  }

                  return (
                    <div
                      key={i}
                      className="bg-slate-800/50 p-6 rounded-[25px] shadow-xl flex flex-col justify-between min-h-[160px] border border-white/5 relative group overflow-hidden print:bg-slate-50 print:border-slate-200"
                    >
                      <div className="absolute top-0 right-0 p-3 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                        <Award className="w-24 h-24 text-white" />
                      </div>

                      <div className="relative z-10 space-y-4">
                        <div className="text-xs text-slate-400 font-bold tracking-wider uppercase mb-2">
                          {h.label || "Movement Slot"}
                        </div>

                        <p
                          className={cn(
                            "text-3xl font-black italic tracking-tighter leading-tight drop-shadow-sm",
                            heroColor,
                          )}
                        >
                          {heroText}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-white/10 w-full relative z-10 print:border-slate-200">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest print:text-slate-500">
                          {contextText}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 3. REINSTATED 4 P'S MATRIX - THE CENTERPIECE */}
            <section className="space-y-4 print:break-inside-avoid">
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#F06C22] shrink-0">
                  Methodology Mastery: The 4 P's
                </h3>
                <div className="h-px bg-[#F06C22]/20 flex-1 print:bg-slate-100"></div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["posture", "pace", "path", "purpose"] as const).map((p) => {
                  const matrixItem = report.performanceMatrix?.[p];
                  const score = matrixItem?.score ?? 100;
                  const rank = Math.round(score / 20) || 1;
                  const data = FOUR_PILLARS_DATA[p];
                  
                  let colorClasses = { text: "text-emerald-500", bg: "bg-emerald-500" };
                  if (rank === 1) colorClasses = { text: "text-rose-500", bg: "bg-rose-500" };
                  else if (rank === 2 || rank === 3) colorClasses = { text: "text-amber-400", bg: "bg-amber-400" };

                  return (
                    <div
                      key={p}
                      className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex flex-col justify-between print:bg-white print:border-slate-100 shadow-xl print:shadow-none"
                    >
                      <div>
                        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-white print:text-[#0A2E46]">
                          {data.title}
                        </h4>
                        
                        <div className="mt-4 flex flex-col gap-1.5">
                          <span className={cn("text-[10px] font-black italic", colorClasses.text)}>
                            {rank} / 5
                          </span>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((step) => (
                              <div
                                key={step}
                                className={cn(
                                  "w-full h-1.5 rounded-[1px] transition-all print:border print:border-slate-200",
                                  step <= rank
                                    ? colorClasses.bg
                                    : "bg-white/5 print:bg-transparent",
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      {matrixItem?.note && (
                        <div className="mt-3 bg-black/20 p-2 rounded-lg border border-white/5 print:bg-slate-50 print:border-slate-100">
                          <p className="text-[8px] font-bold text-white/80 leading-relaxed italic print:text-slate-600">
                            "{matrixItem.note}"
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {(report.performanceMatrix.includedNotes || []).length > 0 && (
                <div className="bg-[#FAF9F6] p-5 rounded-3xl border border-slate-100 shadow-inner mt-4 print:border-slate-200">
                  <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-[#68717A] mb-3">
                    Clinical Highlights
                  </h4>
                  <ul className="space-y-2">
                    {(report.performanceMatrix.includedNotes || []).map(
                      (note, idx) => (
                        <li
                          key={idx}
                          className="flex gap-2 items-start opacity-90"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#F06C22] shrink-0 mt-0.5" />
                          <span className="text-xs font-bold text-[#0A2E46] leading-relaxed italic">
                            "{note}"
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
            </section>

            {/* 4. STRATEGIC ROADMAP */}
            <section className="print:break-inside-avoid space-y-4">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[#F06C22]" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#F06C22] shrink-0">Strategic Road Map</h3>
                <div className="h-px bg-[#F06C22]/20 flex-1 print:bg-slate-100"></div>
              </div>

              {report.roadmap && (
                <>
                  <div className="relative">
                    {/* Horizontal Connector Line */}
                    <div className="hidden md:block absolute top-1/2 left-0 w-full h-[2px] border-t-2 border-dashed border-[#F06C22]/40 -translate-y-1/2 z-0" />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
                      {/* Step 1 */}
                      <div className="bg-[#0A2E46] p-5 rounded-2xl border border-white/10 shadow-lg print:bg-slate-50 print:border-slate-100">
                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#F06C22] mb-2 flex items-center gap-1.5"><Quote className="w-3 h-3" /> Step 1: Your Motivation</div>
                        <p className="text-white print:text-[#0A2E46] italic font-medium leading-relaxed">
                          "{report.roadmap.emotionalAnchor}"
                        </p>
                      </div>

                      {/* Step 2 */}
                      <div className="bg-[#FAF9F6] p-5 rounded-2xl border border-slate-200 shadow-lg print:border-slate-100">
                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#68717A] mb-2 flex items-center gap-1.5"><MapIcon className="w-3 h-3" /> Step 2: The Milestone</div>
                        <p className="text-[#0A2E46] font-bold leading-relaxed">
                          {report.roadmap.smartGoal}
                        </p>
                      </div>

                      {/* Step 3 */}
                      <div className="bg-white p-5 rounded-2xl border-2 border-[#F06C22] shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                          <Zap className="w-12 h-12 text-[#F06C22]" />
                        </div>
                        <div className="relative z-10">
                          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#F06C22] mb-2 flex items-center gap-1.5"><Dumbbell className="w-3 h-3" /> Step 3: Our Clinical Prescription</div>
                          <div className="space-y-3">
                            <div className="text-xs font-black uppercase text-[#0A2E46] tracking-widest border-b border-slate-100 pb-2">
                              {machines.find(m => m.id === report.roadmap?.inStudioPrescription.targetMachine)?.name || 'Machine TBD'}
                              <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] tracking-widest">{report.roadmap.inStudioPrescription.timeframe}</span>
                            </div>
                            
                            {report.roadmap.prescriptionType === 'quantitative' ? (
                              <div className="space-y-1">
                                <p className="text-base font-black text-[#F06C22]">{report.roadmap.inStudioPrescription.targetMetric}</p>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">...with perfect Level 5 Posture and Pace.</p>
                              </div>
                            ) : (
                              <p className="text-sm font-bold text-[#F06C22] italic leading-tight">
                                {report.roadmap.inStudioPrescription.qualitativeFocus}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Auto-Generated Educational Snippets */}
                  <div className={cn(
                    "mt-4 p-4 rounded-xl border-l-4 shadow-sm relative overflow-hidden print:bg-slate-50 print:border-slate-300",
                    report.roadmap.anchorCategory === 'weight_loss' ? "bg-slate-900 border-[#38BDF8]" :
                    report.roadmap.anchorCategory === 'eih_management' ? "bg-slate-900 border-amber-500" :
                    "bg-slate-900 border-slate-500"
                  )}>
                    <div className="flex gap-3 relative z-10">
                      <Info className={cn("w-5 h-5 shrink-0 mt-0.5", 
                        report.roadmap.anchorCategory === 'weight_loss' ? "text-[#38BDF8]" :
                        report.roadmap.anchorCategory === 'eih_management' ? "text-amber-500" :
                        "text-slate-400"
                      )} />
                      <div className="space-y-1">
                        <p className={cn("text-[10px] font-black uppercase tracking-widest",
                          report.roadmap.anchorCategory === 'weight_loss' ? "text-[#38BDF8]" :
                          report.roadmap.anchorCategory === 'eih_management' ? "text-amber-500" :
                          "text-slate-400"
                        )}>Clinical Insight</p>
                        
                        {report.roadmap.anchorCategory === 'weight_loss' && (
                          <p className="text-xs text-white/90 leading-relaxed print:text-slate-700">
                            Physical conditioning is 80% exercise and 20% nutrition. However, fat loss is 80% nutrition and 20% exercise. We will maximize your metabolic engine in the studio, but your kitchen habits will dictate the scale.
                          </p>
                        )}
                        {report.roadmap.anchorCategory === 'eih_management' && (
                          <p className="text-xs text-white/90 leading-relaxed print:text-slate-700">
                            Due to your history of Exercise Induced Headaches, your 'failure' point is redefined. Your set ends the instant you perceive head discomfort, not at muscular failure. Safety is our only priority.
                          </p>
                        )}
                        {report.roadmap.anchorCategory !== 'weight_loss' && report.roadmap.anchorCategory !== 'eih_management' && (
                          <p className="text-xs text-white/90 leading-relaxed print:text-slate-700">
                            The assumed goal of exercise is to lift heavier weights. The REAL objective is to increase Motor Unit Recruitment by pushing your muscles to deep fatigue safely. Do not chase numbers; chase the quality of the effort.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* 5. NOTES & FOOTER */}
            <div className="grid grid-cols-3 gap-4 items-stretch print:break-inside-avoid">
              <div className="col-span-2 bg-[#FAF9F6] p-3 rounded-[20px] border border-slate-100 print:border-slate-200 relative">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-3 h-3 text-[#F06C22]" />
                  <h4 className="text-[8px] font-black uppercase tracking-[0.3em] text-[#0A2E46]">
                    Summative Analysis
                  </h4>
                </div>
                <div className="bg-white rounded-xl p-2 shadow-inner min-h-[50px] print:p-0 print:bg-transparent print:shadow-none">
                  <p className="text-[10px] font-medium italic text-[#0A2E46] leading-relaxed print:text-black">
                    {report.trainerNotes ||
                      "Incredible work this quarter. Your neurological adaptations are now clearly visible in the data. Your force output is reaching peak clinical efficiency. Keep showing up."}
                  </p>
                </div>
              </div>
              <div className="col-span-1 flex flex-col justify-end text-right space-y-2 pb-2">
                <div className="space-y-1">
                  <div className="text-[7px] font-black uppercase tracking-[0.3em] text-[#68717A] mb-1">
                    Document Ref: MSF-
                    {report.id?.slice(-8).toUpperCase() || "SYSTEM-NEW"}
                  </div>
                  <div className="h-px bg-[#F06C22]/20 w-3/4 ml-auto" />
                  <div className="text-[12px] font-black italic text-[#F06C22] uppercase tracking-[0.2em] leading-none pt-1">
                    Max Strength <br />
                    Professional
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Selection view handled at start

  // Editing view (Standard form-based UI but matching themes)
  return (
    <div className="min-h-screen bg-[#0A2E46] p-4 sm:p-8 lg:p-12 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-8 pb-32">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10 no-print print:hidden sticky top-4 z-50">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="text-white hover:bg-white/10 rounded-2xl w-10 h-10 print:hidden"
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div>
              <h1 className="text-xl font-black uppercase italic tracking-tighter text-white">
                Refining Report
              </h1>
              <p className="text-[10px] font-bold text-[#68717A] uppercase tracking-widest mt-0.5">
                {client.firstName}'s Performance Data
              </p>
            </div>
          </div>
          <div className="flex gap-3 w-full sm:w-auto print:hidden">
            <Button
              variant="outline"
              onClick={() => handleSave("Draft")}
              disabled={saving}
              className="flex-1 sm:flex-none border-white/20 bg-[#0A2E46]/50 text-white hover:bg-[#0A2E46] hover:text-white rounded-2xl font-black uppercase tracking-widest h-12 print:hidden"
            >
              Save Draft
            </Button>
            <Button
              onClick={() => handleSave("Finalized")}
              disabled={saving}
              className="flex-1 sm:flex-none bg-[#F06C22] hover:bg-[#D95B16] text-white rounded-2xl font-black uppercase tracking-widest h-12 shadow-lg shadow-[#F06C22]/20 print:hidden"
            >
              Finalize Report
            </Button>
          </div>
        </header>

        <div className="space-y-8">
          {/* Section 1: Attendance */}
          <section className="bg-white rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-[#F06C22]" />
            <div className="flex items-center gap-3 mb-8">
              <Calendar className="w-6 h-6 text-[#F06C22]" />
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[#0A2E46]">
                Attendance & Dedication
              </h2>
            </div>

            <div className="flex flex-col gap-8">
              {/* Date Filter & Narrative */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-[#68717A]">
                        Timeframe Start Date (Blank = All Time)
                      </Label>
                      {report.attendance.firstSessionDate && (
                        <button 
                          onClick={() => handleRecalculateAttendance(report.attendance.firstSessionDate!)}
                          className="text-[9px] font-black text-primary uppercase hover:underline"
                        >
                          Use First Session: {new Date(report.attendance.firstSessionDate).toLocaleDateString()}
                        </button>
                      )}
                    </div>
                    <Input
                      type="date"
                      value={report.attendance.customStartDate || ""}
                      onChange={(e) =>
                        handleRecalculateAttendance(e.target.value)
                      }
                      className="h-12 rounded-xl font-medium border-2 border-slate-100 focus:border-[#F06C22] transition-all"
                    />
                    <p className="text-[9px] text-[#68717A] italic mt-1 pb-2">
                      Changing this will auto-recalculate the metrics below
                      based on the selected timeframe.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-[#68717A]">
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
                      className="min-h-[100px] rounded-3xl font-medium border-2 border-slate-100 focus:border-[#F06C22] transition-all p-4"
                      placeholder="Celebrate their wins and consistency here..."
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-[#68717A]">
                    Report Metrics Configuration
                  </Label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      {
                        key: "totalSessions",
                        label: "Total Sessions Attended (Auto-Top)",
                        value: report.attendance.totalSessions,
                        unit: "",
                      },
                      {
                        key: "totalVolume",
                        label: "Total Volume Lifted",
                        value: (
                          report.attendance.totalVolume || 0
                        ).toLocaleString(),
                        unit: "lbs",
                      },
                      {
                        key: "totalReps",
                        label: "Total Reps",
                        value: (
                          report.attendance.totalReps || 0
                        ).toLocaleString(),
                        unit: "",
                      },
                      {
                        key: "totalGoodReps",
                        label: "Green Quality Reps",
                        value: (
                          report.attendance.totalGoodReps || 0
                        ).toLocaleString(),
                        unit: "reps",
                      },
                      {
                        key: "avgRestDays",
                        label: "Average Rest",
                        value: report.attendance.avgRestDays || 0,
                        unit: "days",
                      },
                      {
                        key: "avgDuration",
                        label: "Average Session Length",
                        value: report.attendance.avgDuration || 0,
                        unit: "mins",
                      },
                    ].map((metric) => (
                      <div
                        key={metric.key}
                        className={cn(
                          "p-3 rounded-2xl border-2 flex items-center justify-between transition-all",
                          report.attendance.toggles?.[
                            metric.key as keyof typeof report.attendance.toggles
                          ]
                            ? "border-[#F06C22] bg-[#F06C22]/5"
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
                                ? "bg-[#F06C22] justify-end"
                                : "bg-slate-300 justify-start",
                            )}
                          >
                            <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                          </button>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#0A2E46]">
                              {metric.label}
                            </p>
                            <p className="text-[12px] font-bold text-[#F06C22]">
                              {metric.value}{" "}
                              <span className="text-[9px] text-[#68717A] uppercase">
                                {metric.unit}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Highlights */}
          <section className="bg-white rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-[#0A2E46]" />
            <div className="flex items-center gap-3 mb-8">
              <Award className="w-6 h-6 text-[#0A2E46]" />
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[#0A2E46]">
                Highlighted Movements
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {report.highlights.map((h, i) => (
                <div
                  key={i}
                  className="flex flex-col p-6 rounded-3xl bg-slate-800 text-white shadow-xl"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                    Slot #{i + 1}
                  </p>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-widest text-slate-400">
                        Machine Selector
                      </Label>
                      <Select
                        value={h.machineId || "none"}
                        onValueChange={(v) =>
                          handleHighlightConfigChange(i, "machineId", v)
                        }
                      >
                        <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-white">
                          <SelectValue placeholder="Select Machine" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-white max-h-72 overflow-y-auto min-w-[300px]">
                          <SelectItem value="none">None</SelectItem>
                          {machines.map((m) => {
                            const stats = machineHistory[m.id!];
                            return (
                              <SelectItem key={m.id!} value={m.id!}>
                                <div className="flex justify-between items-center w-full gap-4">
                                  <span className="font-medium">{m.name}</span>
                                  {stats && (
                                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                      <span className="text-emerald-400 shrink-0">
                                        +{stats.percentageIncrease || 0}%
                                      </span>
                                      <span className="shrink-0">
                                        {Math.round(
                                          (stats.totalVolume || 0) / 1000,
                                        )}
                                        k Vol
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-widest text-slate-400">
                        Metric Type
                      </Label>
                      <Select
                        value={h.metricType || "strength_gain"}
                        onValueChange={(v) =>
                          handleHighlightConfigChange(i, "metricType", v)
                        }
                      >
                        <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-white">
                          <SelectValue placeholder="Select Metric" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-white">
                          <SelectItem value="strength_gain">
                            Strength Gain
                          </SelectItem>
                          <SelectItem value="total_volume">
                            Total Volume Moved
                          </SelectItem>
                          <SelectItem value="consistent_quality">
                            Consistent Quality
                          </SelectItem>
                          <SelectItem value="time_under_tension">
                            Time Under Tension
                          </SelectItem>
                          <SelectItem value="custom">
                            Custom Highlight
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {h.metricType === "custom" && (
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase tracking-widest text-[#F06C22]">
                          Custom Metric
                        </Label>
                        <Input
                          value={h.customText || ""}
                          onChange={(e) => {
                            const newHighlights = [...report.highlights];
                            newHighlights[i].customText = e.target.value;
                            setReport({ ...report, highlights: newHighlights });
                          }}
                          placeholder="e.g. Mastered eccentric breathing!"
                          className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-[#F06C22]"
                        />
                      </div>
                    )}

                    {h.machineId && h.machineId !== "none" && (
                      <div className="mt-4 p-4 bg-slate-900 rounded-xl border border-slate-700 shadow-inner">
                        <Label className="text-[9px] uppercase tracking-widest text-slate-400 mb-2 block">
                          Available Data To Highlight
                        </Label>
                        <ul className="space-y-2 text-[11px] font-medium text-slate-300">
                          <li className="flex justify-between items-center bg-slate-800/50 p-2 rounded">
                            <span className="text-slate-400 uppercase tracking-widest text-[9px]">
                              Strength Gain:
                            </span>
                            <span className="font-bold text-[#F06C22]">
                              +{h.percentageIncrease || 0}%
                            </span>
                          </li>
                          <li className="flex justify-between items-center bg-slate-800/50 p-2 rounded">
                            <span className="text-slate-400 uppercase tracking-widest text-[9px]">
                              Total Volume:
                            </span>
                            <span className="font-bold text-white">
                              {(h.totalVolume || 0).toLocaleString()} lbs
                            </span>
                          </li>
                          <li className="flex justify-between items-center bg-slate-800/50 p-2 rounded">
                            <span className="text-slate-400 uppercase tracking-widest text-[9px]">
                              Flawless Sets:
                            </span>
                            <span className="font-bold text-emerald-400">
                              {h.perfectSets || 0}
                            </span>
                          </li>
                          <li className="flex justify-between items-center bg-slate-800/50 p-2 rounded">
                            <span className="text-slate-400 uppercase tracking-widest text-[9px]">
                              Time Under Load:
                            </span>
                            <span className="font-bold text-white">
                              {h.timeUnderTension || 0} s
                            </span>
                          </li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 3: Performance Matrix */}
          <section className="bg-white rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-[#68717A]" />
            <div className="flex items-center gap-3 mb-8">
              <LayoutGrid className="w-6 h-6 text-[#68717A]" />
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[#0A2E46]">
                Clinical Performance Matrix
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(["posture", "pace", "path", "purpose"] as const).map((p) => {
                const data = FOUR_PILLARS_DATA[p];
                const score = report.performanceMatrix[p]?.score ?? 100;
                const rank = Math.round(score / 20) || 1;

                let talkingPoint = data.rank3;
                if (rank >= 5) talkingPoint = data.rank5;
                if (rank <= 2) talkingPoint = data.rank1;

                const included = (
                  report.performanceMatrix.includedNotes || []
                ).includes(talkingPoint);
                
                let colorClasses = { text: "text-emerald-500", bg: "bg-emerald-500", border: "border-emerald-500" };
                if (rank === 1) colorClasses = { text: "text-rose-500", bg: "bg-rose-500", border: "border-rose-500" };
                else if (rank === 2 || rank === 3) colorClasses = { text: "text-amber-400", bg: "bg-amber-400", border: "border-amber-400" };

                return (
                  <div
                    key={p}
                    className="bg-slate-800 border-slate-700 border p-6 rounded-3xl flex flex-col space-y-6"
                  >
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tighter text-white">
                        {data.title}
                      </h3>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1 leading-relaxed">
                        {data.definition}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className={cn("flex justify-between items-center text-[10px] font-black uppercase tracking-widest", colorClasses.text)}>
                        <span>Rank</span>
                        <span className="text-sm">{rank} / 5</span>
                      </div>
                      <div className="flex gap-1.5 w-full">
                        {[1, 2, 3, 4, 5].map((step) => (
                          <button
                            key={step}
                            onClick={() => {
                              setReport({
                                ...report,
                                performanceMatrix: {
                                  ...report.performanceMatrix,
                                  [p]: {
                                    ...report.performanceMatrix[p],
                                    score: step * 20,
                                  },
                                },
                              });
                            }}
                            className={cn(
                              "flex-1 h-8 rounded-lg transition-all duration-300 border-2",
                              step <= rank
                                ? cn(colorClasses.bg, colorClasses.border)
                                : "bg-slate-900 border-slate-900 hover:border-slate-700",
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Personalized Note (Optional)</Label>
                       <Textarea 
                          value={report.performanceMatrix[p]?.note || ''}
                          onChange={(e) => {
                              setReport({
                                ...report,
                                performanceMatrix: {
                                  ...report.performanceMatrix,
                                  [p]: {
                                    ...report.performanceMatrix[p],
                                    note: e.target.value,
                                  },
                                },
                              });
                          }}
                          placeholder={`Add a specific note about their ${data.title.toLowerCase()}...`}
                          className="bg-slate-900 border-slate-700 text-sm h-16 resize-none focus:border-slate-500 rounded-xl placeholder:text-slate-600 italic text-white"
                       />
                    </div>

                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex-1 flex flex-col justify-between gap-4">
                      <p className="text-xs text-slate-300 font-medium leading-relaxed italic">
                        "{talkingPoint}"
                      </p>

                      <Button
                        variant="ghost"
                        onClick={() => {
                          const notes =
                            report.performanceMatrix.includedNotes || [];
                          if (!included) {
                            setReport({
                              ...report,
                              performanceMatrix: {
                                ...report.performanceMatrix,
                                includedNotes: [...notes, talkingPoint],
                              },
                            });
                          } else {
                            setReport({
                              ...report,
                              performanceMatrix: {
                                ...report.performanceMatrix,
                                includedNotes: notes.filter(
                                  (n) => n !== talkingPoint,
                                ),
                              },
                            });
                          }
                        }}
                        className={cn(
                          "w-full text-[10px] font-black uppercase tracking-widest h-10 transition-all",
                          included
                            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                            : "bg-white/10 hover:bg-white/20 text-white",
                        )}
                      >
                        {included
                          ? "✓ Included in Summary"
                          : "+ Include in Summary"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {(report.performanceMatrix.includedNotes || []).length > 0 && (
              <div className="mt-8 p-6 bg-slate-50 rounded-3xl border border-slate-100 shadow-inner">
                <Label className="text-[10px] font-black uppercase tracking-widest text-[#0A2E46] mb-4 block">
                  Included Talking Points Summary
                </Label>
                <ul className="space-y-3">
                  {(report.performanceMatrix.includedNotes || []).map(
                    (note, idx) => (
                      <li
                        key={idx}
                        className="flex gap-3 text-sm text-[#0A2E46] items-start"
                      >
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="font-medium italic leading-relaxed">
                          "{note}"
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </section>

          {/* Section 4: Roadmap (MSF Evolution) */}
          <section className="bg-white rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-[#F06C22]" />
            <div className="flex items-center gap-3 mb-8">
              <MapIcon className="w-6 h-6 text-[#F06C22]" />
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[#0A2E46]">
                Strategic Roadmap
              </h2>
            </div>
            
            <div className="space-y-8">
              {/* Category Anchor */}
              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase tracking-widest text-[#68717A] ml-1">
                  1. Clinical Health Anchor (80/20 & EIH Safeguards)
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { id: 'weight_loss', label: 'Weight Loss Focus', description: 'Metabolic engine vs Kitchen habits' },
                    { id: 'eih_management', label: 'EIH / Safety First', description: 'Pain-limited failure points' },
                    { id: 'general_conditioning', label: 'Inroad / Mastery', description: 'The REAL objective vs numbers' }
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setReport({
                        ...report,
                        roadmap: { ...report.roadmap!, anchorCategory: cat.id as any }
                      })}
                      className={cn(
                        "p-4 rounded-2xl border-2 text-left transition-all",
                        report.roadmap?.anchorCategory === cat.id 
                          ? "bg-[#0A2E46] border-[#0A2E46] text-white shadow-lg shadow-[#0A2E46]/20" 
                          : "bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200"
                      )}
                    >
                      <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{cat.label}</p>
                      <p className="text-[8px] font-bold opacity-60 uppercase">{cat.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Motivation & Milestone */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-[#68717A] ml-1">
                      2. The Emotional Anchor (Your "Why")
                    </Label>
                    <Textarea
                      value={report.roadmap?.emotionalAnchor || ""}
                      onChange={(e) => setReport({
                        ...report,
                        roadmap: { ...report.roadmap!, emotionalAnchor: e.target.value }
                      })}
                      className="min-h-[100px] rounded-3xl font-medium border-2 border-slate-100 focus:border-[#F06C22] p-4 placeholder:italic"
                      placeholder="e.g., Playing with grandkids without knee pain..."
                    />
                  </div>
                  <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-[#68717A] ml-1">
                      3. The Measurable Milestone (SMART)
                    </Label>
                    <Textarea
                      value={report.roadmap?.smartGoal || ""}
                      onChange={(e) => setReport({
                        ...report,
                        roadmap: { ...report.roadmap!, smartGoal: e.target.value }
                      })}
                      className="min-h-[100px] rounded-3xl font-medium border-2 border-slate-100 focus:border-[#F06C22] p-4"
                      placeholder="e.g., Skiing trip ready by Christmas..."
                    />
                  </div>
                </div>

                {/* Prescription */}
                <div className="bg-[#FAF9F6] p-6 rounded-[32px] border-2 border-slate-100 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#F06C22]/10 flex items-center justify-center">
                      <Crosshair className="w-5 h-5 text-[#F06C22]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black uppercase italic tracking-tighter text-[#0A2E46] leading-tight">Clinical Prescription</h3>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Step 3: Studio Implementation</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <button
                        onClick={() => setReport({
                          ...report,
                          roadmap: { ...report.roadmap!, prescriptionType: 'quantitative' }
                        })}
                        className={cn(
                          "py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                          report.roadmap?.prescriptionType === 'quantitative' 
                            ? "bg-[#F06C22] text-white" 
                            : "bg-slate-200 text-slate-500"
                        )}
                      >
                        Quantitative (Number)
                      </button>
                      <button
                        onClick={() => setReport({
                          ...report,
                          roadmap: { ...report.roadmap!, prescriptionType: 'qualitative' }
                        })}
                        className={cn(
                          "py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                          report.roadmap?.prescriptionType === 'qualitative' 
                            ? "bg-[#F06C22] text-white" 
                            : "bg-slate-200 text-slate-500"
                        )}
                      >
                        Qualitative (Skill)
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Target Machine</Label>
                        <Select
                          value={report.roadmap?.inStudioPrescription.targetMachine || ""}
                          onValueChange={(v) => setReport({
                            ...report,
                            roadmap: {
                              ...report.roadmap!,
                              inStudioPrescription: { ...report.roadmap!.inStudioPrescription, targetMachine: v }
                            }
                          })}
                        >
                          <SelectTrigger className="bg-white border-slate-200 text-xs font-bold">
                            <SelectValue placeholder="Select Machine" />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-200">
                            {machines.map(m => (
                              <SelectItem key={m.id} value={m.id!}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {report.roadmap?.prescriptionType === 'quantitative' ? (
                        <div className="space-y-2">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Target Weight/Metric</Label>
                          <Input
                            value={report.roadmap?.inStudioPrescription.targetMetric || ""}
                            onChange={(e) => setReport({
                              ...report,
                              roadmap: {
                                ...report.roadmap!,
                                inStudioPrescription: { ...report.roadmap!.inStudioPrescription, targetMetric: e.target.value }
                              }
                            })}
                            className="bg-white border-slate-200 text-xs font-bold"
                            placeholder="e.g., 250 lbs for 90 seconds"
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Specific Form Mastery Focus</Label>
                          <Input
                            value={report.roadmap?.inStudioPrescription.qualitativeFocus || ""}
                            onChange={(e) => setReport({
                              ...report,
                              roadmap: {
                                ...report.roadmap!,
                                inStudioPrescription: { ...report.roadmap!.inStudioPrescription, qualitativeFocus: e.target.value }
                              }
                            })}
                            className="bg-white border-slate-200 text-xs font-bold"
                            placeholder="e.g., Zero momentum on turnarounds"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Timeframe</Label>
                        <Input
                          value={report.roadmap?.inStudioPrescription.timeframe || ""}
                          onChange={(e) => setReport({
                            ...report,
                            roadmap: {
                              ...report.roadmap!,
                              inStudioPrescription: { ...report.roadmap!.inStudioPrescription, timeframe: e.target.value }
                            }
                          })}
                          className="bg-white border-slate-200 text-xs font-bold"
                          placeholder="e.g., Next 12 Weeks"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 5: Trainer Notes */}
          <section className="bg-white rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-[#0A2E46]" />
            <div className="flex items-center gap-3 mb-8">
              <FileText className="w-6 h-6 text-[#0A2E46]" />
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-[#0A2E46]">
                Closing Trainer Notes
              </h2>
            </div>
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-[#68717A]">
                Lead Practitioner Wrap-Up
              </Label>
              <Textarea
                value={report.trainerNotes}
                onChange={(e) =>
                  setReport({ ...report, trainerNotes: e.target.value })
                }
                className="min-h-[120px] rounded-3xl font-medium border-2 border-slate-100 focus:border-[#F06C22] transition-all p-4 print:border-none print:p-0 print:bg-transparent"
                placeholder="Incredible work this quarter... Keep showing up."
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
