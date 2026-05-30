import React, { useState, useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { db } from "../firebase";
import { doc, setDoc, collection, addDoc } from "firebase/firestore";
import { cn, isBig5Machine, orderMachineSettings } from "../lib/utils";
import {
  Loader2,
  Star,
  Activity,
  Settings2,
  ClipboardPenLine,
  CircleDashed,
  Trash2,
  Wrench,
  TriangleAlert,
  Check,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { MACHINE_DATABASE } from "../data/machine-database";
import { useActiveStudio } from "../ActiveStudioContext";
import { CLINICAL_FLAGS_MATRIX } from "../data/clinical-matrix";

import { getMachineStyle } from "../lib/machine-colors";
import { ClinicalCard } from "./ClinicalCard";

const formatSettingsObj = (settings: Record<string, string>) => {
  if (!settings || Object.keys(settings).length === 0)
    return "No configuration";
  return orderMachineSettings(settings)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
};

function MachineCard({
  machine,
  clientSetting,
  clientId,
  authTrainer,
  clientGender,
  clientExperienceLevel,
  allLogs = [],
  isExpandedCompact = false,
  onCollapse,
}: any) {
  const machineLogs = [...(allLogs || [])]
    .filter((l: any) => l.machineId === machine.id && l.weight !== undefined && l.weight !== "" && !isNaN(Number(l.weight)))
    .sort((a, b) => {
       const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
       const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
       return timeA - timeB;
    });

  const startingWeightDisplay = clientSetting?.startingWeight !== undefined ? clientSetting.startingWeight : "";
  const currentWeightDisplay = clientSetting?.currentWeight !== undefined ? clientSetting.currentWeight : "";

  const currentSettings = clientSetting?.settings || {};
  const machineNotes = clientSetting?.machineNotes || [];
  const hasData =
    !!clientSetting?.startingWeight || !!clientSetting?.currentWeight || Object.keys(currentSettings).length > 0 || machineLogs.length > 0;

  const { activeStudio } = useActiveStudio();

  // Benchmarks
  const isMale =
    clientGender?.toLowerCase() === "male" ||
    clientGender === "Male" ||
    !clientGender;
  const dbMachineInfo = MACHINE_DATABASE[machine.id];
  const baselineWeight = dbMachineInfo
    ? isMale
      ? dbMachineInfo.baseMale
      : dbMachineInfo.baseFemale
    : 50;

  // Studio specific overrides or defaults
  const standardSettings =
    activeStudio?.machineSettings?.[machine.id] ||
    machine.standardSettings ||
    {};
  const options = machine.settingOptions || [];

  const kinematicClass =
    dbMachineInfo?.kinematicClassification ||
    machine.kinematicClassification ||
    machine.category;

  const baseColorStyles = getMachineStyle(machine.name);
  const colors = {
    border: `border-l-4 ${baseColorStyles.border} border-y lg:border border-slate-200 dark:border-slate-800`,
    bg: baseColorStyles.bg,
    text: baseColorStyles.text,
    activeText: `${baseColorStyles.text} font-semibold`,
    header: "bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/50",
    badge: `${baseColorStyles.bg} ${baseColorStyles.text} border ${baseColorStyles.border}`,
  };

  const [weightDialogOpen, setWeightDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [initDialogOpen, setInitDialogOpen] = useState(false);

  const [draftStartingWeight, setDraftStartingWeight] = useState(startingWeightDisplay?.toString() || "");
  const [draftCurrentWeight, setDraftCurrentWeight] = useState(currentWeightDisplay?.toString() || "");
  const [draftSettings, setDraftSettings] =
    useState<Record<string, string>>(currentSettings);
  const [reason, setReason] = useState("");
  const [newNote, setNewNote] = useState("");
  const [isMaintenanceNote, setIsMaintenanceNote] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const calculateSuggestedWeight = () => {
    const userLevel = clientExperienceLevel || "Beginner";
    const levelKey =
      "weight" + userLevel.charAt(0).toUpperCase() + userLevel.slice(1);

    // Check Studio Standard First
    const studioWeight =
      activeStudio?.machineSettings?.[machine.id]?.[levelKey];
    if (studioWeight) return Number(studioWeight);

    // Check Machine Default
    const defaultWeight =
      machine.standardWeights?.[
        userLevel as keyof typeof machine.standardWeights
      ];
    if (defaultWeight) return Number(defaultWeight);

    // Fallback Calculation
    if (userLevel === "Beginner") return Math.round(baselineWeight * 0.8);
    if (userLevel === "Advanced") return Math.round(baselineWeight * 1.5);
    return baselineWeight;
  };

  const hasMaintenance = machineNotes.some((n: any) => n.isImportant);
  const hasNotes = machineNotes.length > 0;

  const handleInitializeClick = () => {
    const suggestedWeight = calculateSuggestedWeight().toString();
    const initialSettings: Record<string, string> = {};
    options.forEach((opt: string) => {
      initialSettings[opt] = standardSettings[opt] || "";
      if (opt.toLowerCase().trim() === "gap" && !initialSettings[opt]) {
        initialSettings[opt] = "0";
      }
    });

    setDraftStartingWeight(suggestedWeight);
    setDraftCurrentWeight(suggestedWeight);
    setDraftSettings(initialSettings);
    setReason(`Initial Setup (${clientExperienceLevel || "Standard"})`);
    setInitDialogOpen(true);
  };

  const handleSaveInit = async () => {
    if (!authTrainer) {
      alert("Trainer session required.");
      return;
    }
    setIsSaving(true);
    try {
      const docRef = doc(
        db,
        "clientMachineSettings",
        `${clientId}_${machine.id}`,
      );

      const CleanSettings = { ...draftSettings };
      options.forEach((opt: string) => {
        if (!CleanSettings[opt]) delete CleanSettings[opt];
      });

      const logEntry = {
        clientId,
        timestamp: new Date().toISOString(),
        trainerId: authTrainer.id || "unknown",
        trainerName: authTrainer.fullName || authTrainer.initials || "Unknown",
        changeType: "INITIAL_SETUP",
        oldValue: "None",
        newValue: `Started: ${draftStartingWeight}, Current: ${draftCurrentWeight}, Settings: STD`,
        reason: reason || `Initial Setup`,
      };

      await setDoc(
        docRef,
        {
          clientId,
          machineId: machine.id,
          startingWeight: draftStartingWeight ? Number(draftStartingWeight) : null,
          currentWeight: draftCurrentWeight ? Number(draftCurrentWeight) : null,
          settings: CleanSettings,
          updatedAt: new Date(),
        },
        { merge: true },
      );

      await addDoc(
        collection(db, "machines", machine.id, "settingHistory"),
        logEntry,
      );
      setInitDialogOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to save initial setup.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveWeight = async () => {
    if (!authTrainer) return alert("Trainer session required.");
    if (draftStartingWeight === startingWeightDisplay?.toString() && draftCurrentWeight === currentWeightDisplay?.toString()) {
      setWeightDialogOpen(false);
      return;
    }
    setIsSaving(true);
    try {
      const docRef = doc(
        db,
        "clientMachineSettings",
        `${clientId}_${machine.id}`,
      );
      const logEntry = {
        clientId,
        timestamp: new Date().toISOString(),
        trainerId: authTrainer.id || "unknown",
        trainerName: authTrainer.fullName || authTrainer.initials || "Unknown",
        changeType: "WEIGHT",
        oldValue: `Start: ${startingWeightDisplay || "None"}, Cur: ${currentWeightDisplay || "None"}`,
        newValue: `Start: ${draftStartingWeight}, Cur: ${draftCurrentWeight}`,
        reason: "Weight Update",
      };
      await setDoc(
        docRef,
        {
          clientId,
          machineId: machine.id,
          startingWeight: draftStartingWeight !== "" ? Number(draftStartingWeight) : null,
          currentWeight: draftCurrentWeight !== "" ? Number(draftCurrentWeight) : null,
          updatedAt: new Date(),
        },
        { merge: true },
      );
      await addDoc(
        collection(db, "machines", machine.id, "settingHistory"),
        logEntry,
      );
      setWeightDialogOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to save weight.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!authTrainer) return alert("Trainer session required.");
    let changed = false;
    options.forEach((opt: string) => {
      if ((draftSettings[opt] || "") !== (currentSettings[opt] || ""))
        changed = true;
    });
    if (!changed) return setSettingsDialogOpen(false);
    if (hasData && !reason.trim())
      return alert("Please provide a reason for the setting adjustment.");
    setIsSaving(true);
    try {
      const docRef = doc(
        db,
        "clientMachineSettings",
        `${clientId}_${machine.id}`,
      );
      const actualReason = reason.trim() || "Settings Update";
      const logEntry = {
        clientId,
        timestamp: new Date().toISOString(),
        trainerId: authTrainer.id || "unknown",
        trainerName: authTrainer.fullName || authTrainer.initials || "Unknown",
        changeType: "SETTINGS",
        oldValue: formatSettingsObj(currentSettings),
        newValue: formatSettingsObj(draftSettings),
        reason: actualReason,
      };
      const CleanSettings = { ...draftSettings };
      options.forEach((opt: string) => {
        if (!CleanSettings[opt]) delete CleanSettings[opt];
      });
      await setDoc(
        docRef,
        {
          clientId,
          machineId: machine.id,
          settings: CleanSettings,
          updatedAt: new Date(),
        },
        { merge: true },
      );
      await addDoc(
        collection(db, "machines", machine.id, "settingHistory"),
        logEntry,
      );
      setSettingsDialogOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!authTrainer) return alert("Trainer session required.");
    if (!newNote.trim()) return;
    setIsSaving(true);
    try {
      const docRef = doc(
        db,
        "clientMachineSettings",
        `${clientId}_${machine.id}`,
      );
      const note = {
        id: Date.now().toString(),
        content: newNote.trim(),
        authorId: authTrainer.id || "unknown",
        authorName: authTrainer.fullName || authTrainer.initials || "Unknown",
        timestamp: new Date().toISOString(),
        isImportant: isMaintenanceNote,
      };
      await setDoc(
        docRef,
        {
          clientId,
          machineId: machine.id,
          machineNotes: [...machineNotes, note],
          updatedAt: new Date(),
        },
        { merge: true },
      );
      setNewNote("");
      setIsMaintenanceNote(false);
    } catch (err) {
      console.error(err);
      alert("Failed to add note.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!authTrainer) return alert("Trainer session required.");
    setIsSaving(true);
    try {
      const docRef = doc(
        db,
        "clientMachineSettings",
        `${clientId}_${machine.id}`,
      );
      const filtered = machineNotes.filter((n: any) => n.id !== noteId);
      await setDoc(
        docRef,
        { machineNotes: filtered, updatedAt: new Date() },
        { merge: true },
      );
    } catch (err) {
      console.error(err);
      alert("Failed to delete note.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ClinicalCard
      machineName={machine.name}
      hasMaintenanceNote={hasMaintenance}
      isRedAlert={hasMaintenance}
    >
      <div
        className={cn(
          "px-4 py-3 flex items-center justify-between gap-2",
          colors.header,
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h4
              className="font-black text-slate-900 dark:text-white uppercase tracking-tighter text-[14px] leading-tight truncate"
              title={machine.name}
            >
              {machine.name}
            </h4>
            {isBig5Machine(machine.id) && (
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest truncate">
              {machine.muscleGroup || dbMachineInfo?.target || kinematicClass}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-[11px] font-bold uppercase tracking-widest px-1.5 h-4 border-current leading-none",
                colors.badge,
              )}
            >
              {kinematicClass?.split(" ")[0] || "Machine"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isExpandedCompact && (
            <Button
              id={`collapse-btn-${machine.id}`}
              variant="outline"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onCollapse) onCollapse();
              }}
              className="h-11 min-w-[44px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300 font-black uppercase tracking-widest text-[11px]"
            >
              Minimize
            </Button>
          )}
          <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
            <DialogTrigger
              className={cn(
                "h-8 w-8 rounded-full bg-transparent hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center transition-colors relative shrink-0",
                hasMaintenance
                  ? "text-rose-500 hover:text-rose-600"
                  : hasNotes
                    ? "text-blue-500 hover:text-blue-600"
                    : "text-slate-400 hover:text-slate-900 dark:hover:text-white",
              )}
            >
              {hasMaintenance ? (
                <TriangleAlert className="w-4 h-4" />
              ) : hasNotes ? (
                <Wrench className="w-4 h-4" />
              ) : (
                <ClipboardPenLine className="w-4 h-4" />
              )}
              {hasNotes && (
                <span
                  className={cn(
                    "absolute top-1 right-1 w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-900",
                    hasMaintenance ? "bg-rose-500" : "bg-blue-500",
                  )}
                />
              )}
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-[32px] p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              <DialogHeader className="mb-4">
                <DialogTitle className="text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">
                  Maintenance & Clinical Notes
                </DialogTitle>
                <DialogDescription className="text-xs font-bold uppercase tracking-widest text-[#F06C22]">
                  {machine.name} Specifics
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {machineNotes.length === 0 ? (
                  <div className="text-center py-8 text-xs font-bold text-slate-400 uppercase tracking-widest border border-dashed rounded-2xl dark:border-slate-800">
                    No notes recorded
                  </div>
                ) : (
                  <div className="space-y-3">
                    {machineNotes.map((note: any) => (
                      <div
                        key={note.id}
                        className={cn(
                          "p-3 rounded-2xl border relative group flex flex-col",
                          note.isImportant
                            ? "bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/50"
                            : "bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-slate-800",
                        )}
                      >
                        {note.isImportant && (
                          <div className="text-[11px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 mb-1 flex items-center gap-1">
                            <TriangleAlert className="w-3 h-3" /> Maintenance
                            Required
                          </div>
                        )}
                        <p className="text-xs text-slate-700 dark:text-slate-300 pr-8">
                          {note.content}
                        </p>
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-2">
                          {note.authorName} •{" "}
                          {new Date(note.timestamp).toLocaleDateString()}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteNote(note.id)}
                          className="absolute right-1 top-1 h-6 w-6 text-slate-300 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-900 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`maintenance-${machine.id}`}
                    checked={isMaintenanceNote}
                    onCheckedChange={(c) => setIsMaintenanceNote(c as boolean)}
                  />
                  <Label
                    htmlFor={`maintenance-${machine.id}`}
                    className="text-xs font-bold text-slate-600 dark:text-slate-400"
                  >
                    Flag for Maintenance
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Machine issue, sticky seat, client form note..."
                    className="flex-1 bg-slate-50 dark:bg-slate-950 h-10 rounded-xl text-xs dark:border-slate-800"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddNote();
                    }}
                  />
                  <Button
                    disabled={isSaving || !newNote.trim()}
                    onClick={handleAddNote}
                    className="h-10 px-4 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 font-bold uppercase tracking-widest text-[11px]"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div
        className={cn(
          "p-4 flex-1 flex flex-col justify-between gap-4 relative",
          !hasData && "opacity-90",
        )}
      >
        {!hasData ? (
          <div className="flex-1 flex flex-col items-center justify-center py-5 text-center px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/50">
            <CircleDashed className="w-6 h-6 text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Not Performed
            </p>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className={cn("border-l-4 border border-slate-200 dark:border-slate-800 rounded-md p-2 px-3 bg-white dark:bg-slate-950", baseColorStyles.border)}>
              <div className="flex gap-4">
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 block mb-0.5">
                    Starting
                  </Label>
                  <div className="text-xl font-black text-slate-800 dark:text-slate-200 uppercase tracking-tighter leading-none flex items-baseline gap-1">
                    {startingWeightDisplay || "--"}
                    <span className="text-[11px] font-bold text-slate-400">
                      LBS
                    </span>
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 block mb-0.5">
                    Current
                  </Label>
                  <div className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none flex items-baseline gap-1">
                    {currentWeightDisplay || startingWeightDisplay || "--"}
                    <span className="text-[11px] font-bold text-slate-400">
                      LBS
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
                Configuration
              </Label>
              <div className="flex flex-col items-end gap-1">
                {orderMachineSettings(currentSettings, standardSettings, options).map(([shortKey, v, originalKey]) => {
                  const isStandard = v === standardSettings[originalKey];
                  return (
                    <span
                      key={originalKey}
                      className={cn(
                        "text-[11px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-md flex items-center justify-end min-w-[32px]",
                        isStandard
                          ? colors.activeText + " " + colors.bg
                          : "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80",
                      )}
                    >
                      {v}{" "}
                      <span className="opacity-50 text-[11px] ml-1">
                        {shortKey}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="mt-auto">
          {hasData ? (
            <div className="grid grid-cols-2 gap-2">
              <Dialog
                open={weightDialogOpen}
                onOpenChange={(open) => {
                  setWeightDialogOpen(open);
                  if (open) {
                    setDraftStartingWeight(startingWeightDisplay?.toString() || "");
                    setDraftCurrentWeight(currentWeightDisplay?.toString() || "");
                  }
                }}
              >
                <DialogTrigger className="h-10 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800 dark:border-slate-700 dark:text-slate-300 font-black uppercase tracking-widest text-[11px] flex items-center justify-center transition-colors">
                  <Activity className="w-3.5 h-3.5 mr-1.5" /> WGT
                </DialogTrigger>
                <DialogContent className="max-w-xs rounded-[32px] p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                  <DialogHeader className="mb-4 text-left">
                    <DialogTitle className="text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">
                      Update Weights
                    </DialogTitle>
                    <DialogDescription className="text-xs font-bold uppercase tracking-widest text-[#F06C22]">
                      Update prescribed weights.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Starting (LBS)
                        </Label>
                        <Input
                          type="number"
                          value={draftStartingWeight}
                          onChange={(e) => setDraftStartingWeight(e.target.value)}
                          className={cn(
                            "h-14 text-xl text-center font-black rounded-2xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 transition-all dark:text-white",
                             "focus-visible:ring-indigo-500",
                          )}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Current (LBS)
                        </Label>
                        <Input
                          type="number"
                          value={draftCurrentWeight}
                          onChange={(e) => setDraftCurrentWeight(e.target.value)}
                          className={cn(
                            "h-14 text-xl text-center font-black rounded-2xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 transition-all dark:text-white",
                             "focus-visible:ring-indigo-500",
                          )}
                        />
                      </div>
                    </div>
                    {((draftStartingWeight !== "" && Number(draftStartingWeight) === calculateSuggestedWeight()) || (draftCurrentWeight !== "" && Number(draftCurrentWeight) === calculateSuggestedWeight())) &&
                        calculateSuggestedWeight() > 0 && (
                          <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-1 text-center uppercase tracking-widest">
                            Studio Standard
                          </p>
                        )}
                    <Button
                      onClick={handleSaveWeight}
                      disabled={isSaving || (draftStartingWeight === startingWeightDisplay?.toString() && draftCurrentWeight === currentWeightDisplay?.toString())}
                      className="w-full h-14 rounded-2xl bg-black dark:bg-white dark:text-black hover:opacity-90 font-black uppercase tracking-widest"
                    >
                      {isSaving ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        "Confirm"
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog
                open={settingsDialogOpen}
                onOpenChange={(open) => {
                  setSettingsDialogOpen(open);
                  if (open) {
                    const normalizedCurrentSettings: Record<string, string> = {};
                    options.forEach((opt: string) => {
                      const lowerOpt = opt.toLowerCase().trim();
                      const hasChest = lowerOpt.includes('chest');
                      const hasBack = lowerOpt.includes('back');
                      
                      const foundKey = Object.keys(currentSettings).find(k => {
                        const lk = k.toLowerCase().trim();
                        if (lk === lowerOpt) return true;
                        if (hasChest && lk.includes('back')) return true;
                        if (hasBack && lk.includes('chest')) return true;
                        return false;
                      });
                      
                      if (foundKey) {
                        normalizedCurrentSettings[opt] = String(currentSettings[foundKey]);
                      } else {
                        normalizedCurrentSettings[opt] = "";
                      }

                      if (lowerOpt === "gap" && (normalizedCurrentSettings[opt] === undefined || normalizedCurrentSettings[opt] === null || normalizedCurrentSettings[opt] === "")) {
                        const stdGapKey = standardSettings ? Object.keys(standardSettings).find(k => k.toLowerCase() === 'gap') : undefined;
                        if (stdGapKey && standardSettings && standardSettings[stdGapKey] !== undefined && standardSettings[stdGapKey] !== null && standardSettings[stdGapKey] !== '') {
                          normalizedCurrentSettings[opt] = String(standardSettings[stdGapKey]);
                        } else {
                          normalizedCurrentSettings[opt] = "0";
                        }
                      }
                    });
                    setDraftSettings(normalizedCurrentSettings);
                    setReason("");
                  }
                }}
              >
                <DialogTrigger className="h-10 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800 dark:border-slate-700 dark:text-slate-300 font-black uppercase tracking-widest text-[11px] flex items-center justify-center transition-colors">
                  <Settings2 className="w-3.5 h-3.5 mr-1.5" /> SET
                </DialogTrigger>
                <DialogContent className="max-w-md rounded-[32px] p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                  <DialogHeader className="mb-4 text-left">
                    <DialogTitle className="text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">
                      Machine Settings
                    </DialogTitle>
                    <DialogDescription className="text-xs font-bold uppercase tracking-widest text-[#F06C22]">
                      Audit reason required.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6">
                    {options.length > 0 && (
                      <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                        {options.map((opt: string) => {
                          const isStandard =
                            draftSettings[opt] === standardSettings[opt];
                          return (
                            <div key={opt} className="space-y-1">
                              <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500 pl-1">
                                {opt}
                              </Label>
                              <Input
                                value={draftSettings[opt] || ""}
                                onChange={(e) =>
                                  setDraftSettings((prev) => ({
                                    ...prev,
                                    [opt]: e.target.value,
                                  }))
                                }
                                placeholder={standardSettings[opt] || "---"}
                                className={cn(
                                  "h-12 font-black text-lg text-center rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500 dark:text-white transition-all",
                                  isStandard
                                    ? "border-blue-500/50 ring-1 ring-blue-500/20"
                                    : "",
                                )}
                              />
                              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 text-center mt-1 flex items-center justify-center gap-1">
                                STD:{" "}
                                <span
                                  className={cn(
                                    isStandard
                                      ? "text-blue-500"
                                      : "text-slate-400",
                                  )}
                                >
                                  {standardSettings[opt] || "N/A"}
                                </span>
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase tracking-widest text-[#F06C22]">
                        Reason for Change (Required)
                      </Label>
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Needs more ROM, progressed past standard"
                        className="h-12 bg-slate-50 dark:bg-slate-950 border-[#F06C22]/30 focus-visible:ring-[#F06C22] rounded-2xl dark:text-white"
                      />
                    </div>
                    <Button
                      onClick={handleSaveSettings}
                      disabled={
                        isSaving ||
                        !reason.trim() ||
                        JSON.stringify(draftSettings) ===
                          JSON.stringify(currentSettings)
                      }
                      className="w-full h-14 rounded-2xl bg-black hover:opacity-90 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 font-black uppercase tracking-widest shadow-sm active:scale-95 transition-transform"
                    >
                      {isSaving ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        "Log & Save Setup"
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <>
              <Button
                onClick={handleInitializeClick}
                disabled={isSaving}
                className={cn(
                  "w-full h-12 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all disabled:opacity-50 border",
                  colors.bg,
                  baseColorStyles.border,
                  colors.text,
                  "hover:opacity-80 border-opacity-50",
                )}
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  "Set Up Machine"
                )}
              </Button>

              <Dialog open={initDialogOpen} onOpenChange={setInitDialogOpen}>
                <DialogContent className="max-w-md rounded-[32px] p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                  <DialogHeader className="mb-4 text-left">
                    <DialogTitle className="text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">
                      Initialize Parameters
                    </DialogTitle>
                    <DialogDescription className="text-xs font-bold uppercase tracking-widest text-[#F06C22]">
                      Review populated standards before saving.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Starting (LBS)
                        </Label>
                        <Input
                          type="number"
                          value={draftStartingWeight}
                          onChange={(e) => setDraftStartingWeight(e.target.value)}
                          className={cn(
                            "h-14 text-xl text-center font-black rounded-2xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 transition-all dark:text-white",
                             "focus-visible:ring-indigo-500",
                          )}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Current (LBS)
                        </Label>
                        <Input
                          type="number"
                          value={draftCurrentWeight}
                          onChange={(e) => setDraftCurrentWeight(e.target.value)}
                          className={cn(
                            "h-14 text-xl text-center font-black rounded-2xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 transition-all dark:text-white",
                             "focus-visible:ring-indigo-500",
                          )}
                        />
                      </div>
                    </div>
                    {((draftStartingWeight !== "" && Number(draftStartingWeight) === calculateSuggestedWeight()) || (draftCurrentWeight !== "" && Number(draftCurrentWeight) === calculateSuggestedWeight())) &&
                      calculateSuggestedWeight() > 0 && (
                        <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-1 text-center uppercase tracking-widest">
                          Studio Standard: {calculateSuggestedWeight()} LBS (
                          {clientExperienceLevel || "Beginner"})
                        </p>
                      )}
                    {options.length > 0 && (
                      <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                        {options.map((opt: string) => {
                          const isStandard =
                            draftSettings[opt] === standardSettings[opt];
                          return (
                            <div key={opt} className="space-y-1">
                              <Label className="text-[11px] font-black uppercase tracking-widest text-slate-500 pl-1">
                                {opt}
                              </Label>
                              <Input
                                value={draftSettings[opt] || ""}
                                onChange={(e) =>
                                  setDraftSettings((prev) => ({
                                    ...prev,
                                    [opt]: e.target.value,
                                  }))
                                }
                                placeholder={standardSettings[opt] || "---"}
                                className={cn(
                                  "h-12 font-black text-lg text-center rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500 dark:text-white transition-all",
                                  isStandard
                                    ? "border-blue-500/50 ring-1 ring-blue-500/20"
                                    : "",
                                )}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Button
                      onClick={handleSaveInit}
                      disabled={isSaving}
                      className="w-full h-14 rounded-2xl bg-black hover:opacity-90 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 font-black uppercase tracking-widest shadow-sm active:scale-95 transition-transform"
                    >
                      {isSaving ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        "Save Setup"
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>
    </ClinicalCard>
  );
}

export function ClientEquipmentPrescriptions({
  clientId,
  machines,
  client,
  clientSettings = {},
  authTrainer,
  allLogs = [],
}: any) {
  const [viewMode, setViewMode] = useState<"compact" | "full">("compact");
  const [expandedMachines, setExpandedMachines] = useState<Record<string, boolean>>({});
  const [massApplyOpen, setMassApplyOpen] = useState(false);
  const [isMassApplying, setIsMassApplying] = useState(false);

  const { activeStudio } = useActiveStudio();

  const safeClientSettings = clientSettings || {};

  const isMachinePerformed = (m: any) => {
    const cPreset = safeClientSettings[m.id];
    const hasWeight = cPreset && (
      (cPreset.startingWeight !== undefined && cPreset.startingWeight !== null && cPreset.startingWeight !== "") || 
      (cPreset.currentWeight !== undefined && cPreset.currentWeight !== null && cPreset.currentWeight !== "")
    );
    const hasSettings = cPreset && cPreset.settings && Object.keys(cPreset.settings).length > 0;
    const hasLogs = allLogs && allLogs.some((l: any) => l.machineId === m.id);
    return !!(hasWeight || hasSettings || hasLogs);
  };

  const sortedMachines = [...(machines || [])].sort((a: any, b: any) => {
    const aPerformed = isMachinePerformed(a);
    const bPerformed = isMachinePerformed(b);
    if (aPerformed !== bPerformed) {
      return aPerformed ? -1 : 1;
    }
    return Number(a.order || 999) - Number(b.order || 995);
  });

  // KPI calculations
  const machinesWithSettingsCount = sortedMachines.filter((machine: any) => {
    const settingObj = safeClientSettings[machine.id]?.settings;
    return settingObj && Object.keys(settingObj).length > 0;
  }).length;
  const pctSettings = sortedMachines.length > 0
    ? Math.round((machinesWithSettingsCount / sortedMachines.length) * 100)
    : 0;

  const machinesWithStartingWeightCount = sortedMachines.filter((machine: any) => {
    const startingW = safeClientSettings[machine.id]?.startingWeight;
    return startingW !== undefined && startingW !== null && startingW !== "";
  }).length;
  const pctStarting = sortedMachines.length > 0
    ? Math.round((machinesWithStartingWeightCount / sortedMachines.length) * 100)
    : 0;

  const clientFlags = client?.clinicalFlags || [];
  const machinesWithWarningsCount = sortedMachines.filter((machine: any) => {
    return CLINICAL_FLAGS_MATRIX.some((flag: any) =>
      clientFlags.includes(flag.id) &&
      flag.protocolHandling?.some((ph: any) => ph.affectedMachineIds?.includes(machine.id))
    );
  }).length;

  const handleToggleExpand = (machineId: string) => {
    setExpandedMachines((prev) => ({
      ...prev,
      [machineId]: !prev[machineId],
    }));
  };

  const handleMassApplyStandards = async () => {
    if (!authTrainer) {
      alert("Trainer session required.");
      return;
    }
    setIsMassApplying(true);
    try {
      const missingOverride = sortedMachines.filter((m: any) => {
        const settingObj = safeClientSettings[m.id];
        return !settingObj?.settings || Object.keys(settingObj.settings).length === 0;
      });

      if (missingOverride.length === 0) {
        alert("No machines are missing a per-client override setup.");
        setMassApplyOpen(false);
        return;
      }

      const promises = missingOverride.map(async (machine: any) => {
        const stdSettings = activeStudio?.machineSettings?.[machine.id] || machine.standardSettings || {};
        const docRef = doc(db, "clientMachineSettings", `${clientId}_${machine.id}`);

        const logEntry = {
          clientId,
          timestamp: new Date().toISOString(),
          trainerId: authTrainer.id || "unknown",
          trainerName: authTrainer.fullName || authTrainer.initials || "Unknown",
          changeType: "MASS_APPLY",
          oldValue: "None",
          newValue: `Standard settings mass-applied`,
          reason: "Mass-applied standard studio settings",
        };

        await setDoc(docRef, {
          clientId,
          machineId: machine.id,
          settings: stdSettings,
          updatedAt: new Date(),
        }, { merge: true });

        await addDoc(collection(db, "machines", machine.id, "settingHistory"), logEntry);
      });

      await Promise.all(promises);
      setMassApplyOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to mass-apply standards.");
    } finally {
      setIsMassApplying(false);
    }
  };

  return (
    <div className="pb-20">
      {/* 3-tile KPI strip & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="grid grid-cols-3 gap-3 flex-1 min-w-0">
          {/* Tile 1: % config */}
          <div className="h-20 bg-bg-l-card dark:bg-slate-900 border border-div-l dark:border-slate-800 rounded-2xl px-4 flex flex-col justify-center shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 leading-none mb-1">
              Configured
            </span>
            <span className="text-xl font-black text-slate-900 dark:text-white leading-none">
              {pctSettings}%
            </span>
          </div>

          {/* Tile 2: % starting logged */}
          <div className="h-20 bg-bg-l-card dark:bg-slate-900 border border-div-l dark:border-slate-800 rounded-2xl px-4 flex flex-col justify-center shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 leading-none mb-1">
              Starting Logged
            </span>
            <span className="text-xl font-black text-slate-900 dark:text-white leading-none">
              {pctStarting}%
            </span>
          </div>

          {/* Tile 3: clinical warnings */}
          <div className="h-20 bg-bg-l-card dark:bg-slate-900 border border-div-l dark:border-slate-800 rounded-2xl px-4 flex flex-col justify-center shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 leading-none mb-1">
              Warning Alerts
            </span>
            <span className={cn("text-xl font-black leading-none", machinesWithWarningsCount > 0 ? "text-red" : "text-slate-900 dark:text-white")}>
              {machinesWithWarningsCount}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Compact / Full View Switcher */}
          <div className="flex bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-0.5 h-11 items-center relative gap-0.5">
            <button
              id="toggle-compact"
              type="button"
              onClick={() => setViewMode("compact")}
              className={cn(
                "h-9 px-4 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all",
                viewMode === "compact"
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
              )}
            >
              Compact
            </button>
            <button
              id="toggle-full"
              type="button"
              onClick={() => setViewMode("full")}
              className={cn(
                "h-9 px-4 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all",
                viewMode === "full"
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
              )}
            >
              Full
            </button>
          </div>

          {/* Mass Apply Trigger */}
          <Dialog open={massApplyOpen} onOpenChange={setMassApplyOpen}>
            <DialogTrigger render={
              <Button
                id="mass-apply-trigger"
                type="button"
                className="h-11 rounded-xl bg-black dark:bg-white text-white dark:text-black hover:opacity-90 font-black uppercase tracking-widest text-[11px] px-5 shadow-sm border border-div-l"
              >
                Mass-apply standard settings
              </Button>
            } />
            <DialogContent className="max-w-md rounded-[32px] p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              <DialogHeader className="mb-4 text-left">
                <DialogTitle className="text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">
                  Mass-Apply Standards
                </DialogTitle>
                <DialogDescription className="text-xs font-bold uppercase tracking-widest text-red">
                  Caution: Confirm Standard Copy
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Are you sure you want to mass-apply standard settings from the current studio standard templates? This will initialize any unconfigured machines. Existing personalized configs will NOT be modified.
                </p>
                <div className="flex gap-2 justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setMassApplyOpen(false)}
                    className="h-11 px-4 rounded-xl font-black uppercase tracking-widest text-[11px]"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isMassApplying}
                    onClick={handleMassApplyStandards}
                    className="h-11 px-4 rounded-xl bg-red text-white hover:bg-rose-700 font-black uppercase tracking-widest text-[11px]"
                  >
                    {isMassApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply Standards"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {viewMode === "compact" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sortedMachines.map((machine: any) => {
            const isExpanded = !!expandedMachines[machine.id];
            if (isExpanded) {
              return (
                <div key={machine.id} className="col-span-1">
                  <MachineCard
                    machine={machine}
                    clientSetting={safeClientSettings[machine.id]}
                    clientId={clientId}
                    authTrainer={authTrainer}
                    clientGender={client?.gender || client?.infoForm?.gender}
                    clientExperienceLevel={
                      client?.experienceLevel || client?.infoForm?.experienceLevel
                    }
                    allLogs={allLogs}
                    isExpandedCompact={true}
                    onCollapse={() => handleToggleExpand(machine.id)}
                  />
                </div>
              );
            }

            const clientSetting = safeClientSettings[machine.id];
            const currentWeightDisplay = clientSetting?.currentWeight !== undefined ? clientSetting.currentWeight : "";
            const startingWeightDisplay = clientSetting?.startingWeight !== undefined ? clientSetting.startingWeight : "";
            const currentSettings = clientSetting?.settings || {};
            const baseColorStyles = getMachineStyle(machine.name);

            const gapKey = Object.keys(currentSettings).find(k => k.toLowerCase().trim() === 'gap');
            const isRomSet = !!(gapKey && currentSettings[gapKey]);
            const isSettingsConfigured = Object.keys(currentSettings).length > 0;

            const machineLogs = [...(allLogs || [])]
              .filter((l: any) => l.machineId === machine.id && l.weight !== undefined && l.weight !== "" && !isNaN(Number(l.weight)))
              .sort((a, b) => {
                 const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
                 const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
                 return timeA - timeB;
              });
            const lastLog = machineLogs[machineLogs.length - 1];
            const repsVal = lastLog
              ? lastLog.repsLeft !== undefined && lastLog.repsRight !== undefined
                ? `${lastLog.repsLeft}L|${lastLog.repsRight}R`
                : lastLog.reps || lastLog.seconds || "--"
              : "--";

            return (
              <div
                key={machine.id}
                onClick={() => handleToggleExpand(machine.id)}
                className={cn(
                  "h-[110px] rounded-xl bg-bg-l-card dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between cursor-pointer hover:border-[#F06C22]/50 transition-all select-none relative group border-l-4",
                  baseColorStyles.border
                )}
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <h4 className="font-display italic text-[16px] font-black uppercase text-slate-900 dark:text-white leading-tight truncate">
                        {machine.name}
                      </h4>
                      {isBig5Machine(machine.id) && (
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest truncate">
                      {machine.muscleGroup || machine.category}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {isRomSet && (
                      <Badge variant="outline" className="text-[11px] font-bold uppercase py-0 px-1.5 h-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 rounded-md">
                        ✓ ROM
                      </Badge>
                    )}
                    {isSettingsConfigured && (
                      <Badge variant="outline" className="text-[11px] font-bold uppercase py-0 px-1.5 h-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 rounded-md">
                        ✓ Config
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-baseline justify-between mt-auto">
                  <div className="font-mono tabular-nums text-xs text-slate-900 dark:text-slate-100 font-bold flex items-baseline gap-1">
                    <span className="text-lg font-black text-slate-900 dark:text-white">
                      {currentWeightDisplay || startingWeightDisplay || "--"}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">LBS</span>
                    {repsVal !== "--" && (
                      <>
                        <span className="text-slate-300 dark:text-slate-700 mx-1">•</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {repsVal}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400">REPS</span>
                      </>
                    )}
                  </div>

                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#F06C22] group-hover:text-amber-500 transition-colors">
                    Expand
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {sortedMachines.map((machine: any) => (
            <MachineCard
              key={machine.id}
              machine={machine}
              clientSetting={safeClientSettings[machine.id]}
              clientId={clientId}
              authTrainer={authTrainer}
              clientGender={client?.gender || client?.infoForm?.gender}
              clientExperienceLevel={
                client?.experienceLevel || client?.infoForm?.experienceLevel
              }
              allLogs={allLogs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
