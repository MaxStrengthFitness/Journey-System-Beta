import React, { useState, useEffect } from "react";
import { Moon, Bell, Settings, X, Plus, Activity, GripVertical, Info, Lightbulb, Target } from "lucide-react";
import { MaxStrengthLogo } from "./MaxStrengthLogo";
import { Button } from "@/components/ui/button";
import { ConditionChip } from "./ConditionChip";
import { RoutineCompareCard } from "./RoutineCompareCard";
import { SequenceRow } from "./SequenceRow";
import { cn } from "@/lib/utils";
import { AppHeader } from "./AppHeader";
import { StickyCTA } from "./StickyCTA";
import { Machine, Routine, SessionNote, Trainer, Client, WorkoutSession, TrainerFocus, FocusRecord, ExerciseLog } from "../types";
import { CLINICAL_FLAGS_MATRIX } from "../data/clinical-matrix";
import { safeToDate } from "../lib/utils";

export interface BriefingScreenProps {
  authTrainer: Trainer | null;
  client: Client;
  targetRoutine: Routine | null;
  lastSession: WorkoutSession | null;
  onStart: (routineType: 'A' | 'B' | 'Free', customMachines?: string[], note?: string) => void;
  onClose: () => void;
  machines: Machine[];
  routines: Routine[];
  trainerFocuses: TrainerFocus[];
  focusRecords?: FocusRecord[]; // Added optional FocusRecords
  sessionNotes: SessionNote[];
  logs?: ExerciseLog[];
  isIntroSession?: boolean;
}

export function BriefingScreen({ 
  authTrainer,
  client,
  targetRoutine,
  lastSession,
  onStart,
  onClose,
  machines,
  routines,
  trainerFocuses,
  focusRecords = [],
  sessionNotes,
  logs = [],
  isIntroSession = false
}: BriefingScreenProps) {
  const [selectedRoutineType, setSelectedRoutineType] = useState<'A' | 'B' | 'Free' | 'Create_A' | 'Create_B'>('A');
  const [adjustedMachineIds, setAdjustedMachineIds] = useState<string[]>([]);
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [showAddMachine, setShowAddMachine] = useState(false);

  const routineA = routines.find(r => r.name.includes('Routine A'));
  const routineB = routines.find(r => r.name.includes('Routine B'));

  useEffect(() => {
    if (isIntroSession) {
      const demoRoutine = routines.find(r => r.name === 'Demo Routine');
      if (demoRoutine && demoRoutine.machineIds && demoRoutine.machineIds.length > 0) {
         setSelectedRoutineType(routineA ? 'A' : 'Create_A');
         setAdjustedMachineIds(demoRoutine.machineIds);
         setIsAdjusting(true);
         return;
      }
    }

    let type: 'A' | 'B' | 'Free' | 'Create_A' | 'Create_B' = 'Create_A';
    if (targetRoutine) {
      if (targetRoutine.name.includes('Routine A')) type = 'A';
      else if (targetRoutine.name.includes('Routine B')) type = 'B';
    } else if (routineA) {
      type = 'A';
    }
    
    if (type === 'B' && !routineB) {
      type = 'Create_B';
    }

    if (selectedRoutineType !== 'Create_A') {
      setSelectedRoutineType(type);
      if ((type as string) === 'Create_B' || (type as string) === 'Free') setAdjustedMachineIds([]);
      else setAdjustedMachineIds(targetRoutine?.name.includes('Routine B') ? (routineB?.machineIds || []) : (routineA?.machineIds || []));
    }
  }, [targetRoutine, routineA, routineB]);

  const removeMachine = (index: number) => {
    const newSequence = [...adjustedMachineIds];
    newSequence.splice(index, 1);
    setAdjustedMachineIds(newSequence);
    setIsAdjusting(true);
  };
  
  const addMachine = (machineId: string) => {
    setAdjustedMachineIds([...adjustedMachineIds, machineId]);
    setIsAdjusting(true);
    setShowAddMachine(false);
  };

  const moveMachineUp = (index: number) => {
    if (index === 0) return;
    const newSequence = [...adjustedMachineIds];
    const temp = newSequence[index - 1];
    newSequence[index - 1] = newSequence[index];
    newSequence[index] = temp;
    setAdjustedMachineIds(newSequence);
    setIsAdjusting(true);
  };

  const moveMachineDown = (index: number) => {
    if (index === adjustedMachineIds.length - 1) return;
    const newSequence = [...adjustedMachineIds];
    const temp = newSequence[index + 1];
    newSequence[index + 1] = newSequence[index];
    newSequence[index] = temp;
    setAdjustedMachineIds(newSequence);
    setIsAdjusting(true);
  };

  const handleStart = () => {
    onStart(
      selectedRoutineType === 'Create_B' ? 'B' : selectedRoutineType === 'Create_A' ? 'A' : selectedRoutineType as any, 
      isAdjusting || ['Free', 'Create_A', 'Create_B'].includes(selectedRoutineType) ? adjustedMachineIds : undefined, 
      adjustmentNote
    );
  };

  const orthopedics = client.medicalHistory;
  const globalNotes = client.globalNotes;
  
  const clientFlags = (client.clinicalFlags || [])
    .map(flagId => CLINICAL_FLAGS_MATRIX.find(f => f.id === flagId))
    .filter(Boolean) as typeof CLINICAL_FLAGS_MATRIX;

  const severityOrder = { "Absolute Contraindication": 0, "High Risk": 1, "Moderate / Needs Modification": 2 };
  clientFlags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const displayNotes = sessionNotes.filter(n => n.priority === 'High');

  const lastRoutineName = lastSession 
    ? routines.find(r => r.id === lastSession.routineId)?.name || ((lastSession.sessionType as string) === 'Free' ? 'Open Session' : lastSession.sessionType)
    : 'None';
  
  const lastSessionDate = safeToDate(lastSession?.endTime)
    ? safeToDate(lastSession.endTime)!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Never';

  const scheduledRoutineName = targetRoutine?.name.includes('Routine B') ? (routineB?.name || 'Routine B') : (routineA?.name || 'Routine A');

  const activeFocuses = focusRecords.filter(f => f.status === 'Active' && f.clientId === client.id);

  const selectedRoutineIds = (isAdjusting || ['Free', 'Create_A', 'Create_B'].includes(selectedRoutineType))
    ? adjustedMachineIds 
    : (selectedRoutineType === 'A' ? (routineA?.machineIds || []) : (routineB?.machineIds || []));

  return (
    <div className="w-[820px] h-[1180px] bg-bg-dark mx-auto relative flex flex-col font-sans overflow-hidden border border-div-d shadow-2xl">
      <AppHeader variant="dark" trainerInitials={authTrainer?.initials || "AJ"} />

      <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 flex flex-col">
        <div className="px-5 py-5 flex-1 flex flex-col gap-4 pb-[180px]">
          {/* 2. Client hero card */}
          <div 
            className="rounded-[20px] p-[16px] border border-cyan border-opacity-20 shadow-sm relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, var(--bg-dark-3) 0%, var(--bg-dark-2) 100%)' }}
          >
            <div className="flex justify-between items-start relative z-10">
              <div>
                <h1 className="font-display italic text-white text-[28px] leading-[1.1] uppercase">
                  {client.firstName} {client.lastName}
                </h1>
                <div className="font-display italic text-ink-d2 text-[11px] tracking-[0.08em] uppercase mt-1">
                  LAST SESSION · {lastSessionDate.toUpperCase()} · {lastRoutineName.toUpperCase()}
                </div>
              </div>
              <button onClick={onClose} className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center text-ink-d2 hover:bg-white/10 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-wrap gap-1.5 mt-3 relative z-10">
              {clientFlags.map((cond, i) => (
                <ConditionChip key={i} label={cond.label} severity={cond.severity === 'High Risk' || cond.severity === 'Absolute Contraindication' ? 'critical' : 'standard'} />
              ))}
            </div>

            <div className="mt-3 bg-white/5 rounded-[10px] p-[10px] px-3 relative z-10 border border-white/5">
              <div className="flex items-center gap-1.5 font-display italic text-cyan text-[10px] uppercase mb-1">
                <Lightbulb className="w-3 h-3" /> GLOBAL GOAL
              </div>
              <div className="italic text-white text-[13px] opacity-95">
                "{client.globalNotes || 'No specific global goal set.'}"
              </div>
            </div>

            {/* Note displays below goal */}
            {displayNotes.length > 0 && (
              <div className="mt-2 space-y-1.5 relative z-10">
                {displayNotes.map(n => (
                  <div key={n.id} className="bg-orange-500/10 border border-orange-500/20 rounded-[10px] p-2.5 px-3">
                    <div className="flex items-center justify-between mb-0.5">
                       <span className="font-display italic text-orange-400 text-[9px] uppercase tracking-wider flex items-center gap-1">
                         <Info className="w-3 h-3" /> HIGH PRIORITY
                       </span>
                       <span className="text-[9px] text-orange-500/60 uppercase">{n.trainerInitials}</span>
                    </div>
                    <div className="text-[12px] text-white">
                      {n.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Display active Focuses */}
            {activeFocuses.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 relative z-10">
                {activeFocuses.map(f => (
                   <div key={f.id} className="bg-[#F06C22]/10 border border-[#F06C22]/20 rounded-[8px] px-2.5 py-1.5 flex flex-col w-full">
                      <span className="text-[8px] uppercase tracking-wider text-[#F06C22] font-bold mb-0.5 flex items-center gap-1">
                        <Target className="w-2.5 h-2.5" />
                        ACTIVE FOCUS: {f.category}
                      </span>
                      <span className="text-[11px] text-white font-medium italic">"{f.clinicalNotes}"</span>
                      {f.targetMachineId && (
                        <span className="text-[9px] text-[#F06C22]/80 mt-1 uppercase tracking-wider">
                           TARGET: {machines.find(m => m.id === f.targetMachineId)?.name || 'Unknown Machine'}
                        </span>
                      )}
                   </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Routine compare strip */}
          <div className="grid grid-cols-2 gap-2.5">
            <RoutineCompareCard 
              variant="scheduled"
              label="SCHEDULED TODAY"
              title={scheduledRoutineName}
              meta={`${selectedRoutineIds.length} machines`}
            />
            <RoutineCompareCard 
              variant="previous"
              label="LAST PERFORMED"
              title={lastRoutineName}
              meta={`${lastSessionDate.toUpperCase()}`}
            />
          </div>

          {/* 4. Execution sequence */}
          <div className="mt-2 flex flex-col gap-1.5 min-h-[400px]">
            <div className="flex justify-between items-end mb-1 px-1">
              <div className="flex items-center gap-1.5 text-white font-display italic text-[14px]">
                <Activity className="w-4 h-4 text-cyan" />
                <span className="mt-0.5 uppercase">Execution Sequence</span>
              </div>
              <div 
                className="text-cyan font-display italic text-[10px] uppercase tracking-wide cursor-pointer hover:text-white transition-colors py-1 px-2 -mr-2 bg-cyan/10 rounded-full"
                onClick={() => setShowAddMachine(!showAddMachine)}
              >
                {showAddMachine ? '✓ DONE EDITING' : '⇅ EDIT ROW'}
              </div>
            </div>

            {selectedRoutineIds.map((machineId, idx) => {
              const machine = machines.find(m => m.id === machineId);
              if (!machine) return null;
              
              const mLogs = logs.filter(l => l.machineId === machineId).sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
              const lastLog = mLogs[0];
              
              const isTSC = machine.targetRepRange?.toLowerCase().includes('tsc') || 
                            machine.targetRepRange?.toLowerCase().includes('static') ||
                            machine.targetRepRange?.toLowerCase().includes('time');
              
              const displayMachine = {
                idx: idx + 1,
                name: machine.name,
                lastLb: lastLog?.loadLb !== undefined ? lastLog?.loadLb : null,
                lastReps: (isTSC && lastLog?.outcomeTut) ? lastLog.outcomeTut : (lastLog?.outcomeReps !== undefined ? lastLog.outcomeReps : null),
                lastUnit: isTSC ? 'sec' : 'reps',
                isTSC: isTSC
              };

              return (
                <div key={`${machineId}-${idx}`} className="flex items-center gap-2 group transition-all">
                  <div className="flex-1">
                    <SequenceRow machine={displayMachine as any} />
                  </div>
                  {showAddMachine && (
                    <div className="flex flex-col gap-1 bg-white/5 p-1 rounded border border-div-d">
                      <button onClick={() => moveMachineUp(idx)} className="text-ink-d2 hover:text-white bg-white/5 hover:bg-white/10 p-0.5 rounded leading-none">▲</button>
                      <button onClick={() => moveMachineDown(idx)} className="text-ink-d2 hover:text-white bg-white/5 hover:bg-white/10 p-0.5 rounded leading-none">▼</button>
                      <button onClick={() => removeMachine(idx)} className="text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 p-0.5 rounded mt-1"><X className="w-3.5 h-3.5 mx-auto" /></button>
                    </div>
                  )}
                </div>
              );
            })}
            
            {showAddMachine && (
              <div className="mt-4 p-4 border border-dashed border-cyan/30 rounded-xl bg-cyan/5">
                 <div className="text-[11px] font-display italic text-cyan mb-2 uppercase">ADD MACHINE</div>
                 <div className="flex flex-wrap gap-2">
                   {machines.filter(m => !selectedRoutineIds.includes(m.id)).map(m => (
                      <button 
                        key={m.id}
                        onClick={() => addMachine(m.id)}
                        className="text-[11px] text-white bg-bg-dark-2 hover:bg-white/10 border border-div-d px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                         <Plus className="w-3 h-3 text-cyan" /> {m.name}
                      </button>
                   ))}
                 </div>
              </div>
            )}
            
          </div>
        </div>
      </div>

      <StickyCTA 
        label="START SESSION" 
        icon={<div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[8px] border-l-white border-b-[5px] border-b-transparent mr-1" />}
        onClick={handleStart}
      />
    </div>
  );
}
