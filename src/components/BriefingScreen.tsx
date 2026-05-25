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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableSequenceItem({
  id,
  children,
  showAddMachine,
  onRemove
}: {
  id: string;
  children: React.ReactNode;
  showAddMachine: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        "flex items-center gap-2 group transition-all rounded-xl",
        isDragging && "opacity-95 scale-[1.02] shadow-2xl drop-shadow-2xl brightness-110 relative bg-bg-dark z-50 ring-2 ring-cyan/30"
      )}
    >
      {showAddMachine && (
        <div 
          {...attributes} 
          {...listeners}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] cursor-grab active:cursor-grabbing bg-white/5 hover:bg-white/10 text-ink-d2 hover:text-white rounded-xl transition-colors border border-transparent hover:border-div-d touch-none shrink-0"
        >
          <GripVertical className="w-5 h-5 pointer-events-none" />
        </div>
      )}
      <div className="flex-1 min-w-0 pointer-events-none">
        {children}
      </div>
      {showAddMachine && (
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] text-red-500 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors shrink-0"
        >
          <X className="w-5 h-5 pointer-events-none" />
        </button>
      )}
    </div>
  );
}

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

  const getCurrentBaseSequence = () => {
    if (isAdjusting || ['Free', 'Create_A', 'Create_B'].includes(selectedRoutineType)) return adjustedMachineIds;
    return selectedRoutineType === 'A' ? (routineA?.machineIds || []) : (routineB?.machineIds || []);
  };

  const removeMachine = (index: number) => {
    const currentItems = getCurrentBaseSequence();
    const newSequence = [...currentItems];
    newSequence.splice(index, 1);
    setAdjustedMachineIds(newSequence);
    setIsAdjusting(true);
  };
  
  const addMachine = (machineId: string) => {
    const currentItems = getCurrentBaseSequence();
    setAdjustedMachineIds([...currentItems, machineId]);
    setIsAdjusting(true);
    setShowAddMachine(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const currentItems = getCurrentBaseSequence();
      const oldIndex = currentItems.indexOf(active.id as string);
      const newIndex = currentItems.indexOf(over.id as string);
      const newSequence = arrayMove(currentItems, oldIndex, newIndex);
      setAdjustedMachineIds(newSequence);
      setIsAdjusting(true);
    }
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
    <div className="w-full h-full min-h-screen bg-bg-dark font-sans flex flex-col overflow-hidden">
      <div className="max-w-[820px] mx-auto w-full h-full relative flex flex-col pb-24 shadow-2xl">
        <AppHeader variant="dark" trainerInitials={authTrainer?.initials || "AJ"} />

      <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 flex flex-col">
        <div className="px-5 py-5 flex-1 flex flex-col gap-4 pb-[180px]">
          {/* 2. Client hero card */}
          <div 
            className="rounded-2xl p-[16px] border border-cyan border-opacity-20 shadow-sm relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, var(--color-surface-2) 0%, var(--color-surface-1) 100%)' }}
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
              <button onClick={onClose} className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center text-ink-d2 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-wrap gap-1.5 mt-3 relative z-10">
              {clientFlags.map((cond, i) => (
                <ConditionChip key={i} label={cond.label} severity={cond.severity === 'High Risk' || cond.severity === 'Absolute Contraindication' ? 'critical' : 'standard'} />
              ))}
            </div>

            <div className="mt-4 bg-surface-1 rounded-xl p-3 relative z-10 border-transparent">
              <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide opacity-60 text-ink-d2 uppercase mb-1">
                <Lightbulb className="w-3.5 h-3.5" /> GLOBAL GOAL
              </div>
              <div className="italic text-white text-[15px] font-medium opacity-95">
                "{client.globalNotes || 'No specific global goal set.'}"
              </div>
            </div>

            {/* Note displays below goal */}
            {displayNotes.length > 0 && (
              <div className="mt-2 space-y-1.5 relative z-10">
                {displayNotes.map(n => (
                  <div key={n.id} className="bg-surface-1 rounded-2xl p-3 border-transparent">
                    <div className="flex items-center justify-between mb-1">
                       <span className="text-[11px] font-medium tracking-wide opacity-60 text-ink-d2 uppercase flex items-center gap-1.5">
                         <Info className="w-3.5 h-3.5" /> HIGH PRIORITY
                       </span>
                       <span className="text-[11px] text-ink-d3 font-medium opacity-60 uppercase">{n.trainerInitials}</span>
                    </div>
                    <div className="text-[14px] text-white font-medium">
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
                   <div key={f.id} className="bg-surface-1 rounded-2xl p-3 flex flex-col w-full border-transparent">
                      <span className="text-[11px] font-medium tracking-wide opacity-60 text-ink-d2 uppercase flex items-center gap-1.5 mb-1">
                        {f.category === 'Posture' ? '🦴' : f.category === 'Pace' ? '⏱️' : f.category === 'Path' ? '🛤️' : f.category === 'Purpose' ? '🧠' : '🎯' }
                        ACTIVE FOCUS: {f.category}
                      </span>
                      <span className="text-[14px] text-white font-medium italic">"{f.clinicalNotes}"</span>
                      {f.targetMachineId && (
                        <span className="text-[11px] font-medium tracking-wide opacity-60 text-cyan mt-1.5 uppercase">
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
            <div className="flex justify-between items-end mb-2 px-1">
              <div className="flex items-center gap-1.5 text-white text-[16px] font-bold uppercase tracking-wide">
                <Activity className="w-4 h-4 text-cyan" />
                <span className="mt-0.5">Execution Sequence</span>
              </div>
              <button 
                type="button"
                className="text-cyan font-medium text-[11px] uppercase tracking-wide cursor-pointer hover:text-white transition-colors min-h-[44px] px-4 -mr-2 bg-cyan/5 hover:bg-cyan/10 rounded-full flex items-center justify-center opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark"
                onClick={() => setShowAddMachine(!showAddMachine)}
              >
                {showAddMachine ? '✓ DONE EDITING' : '⇅ EDIT ROUTINE'}
              </button>
            </div>

            {selectedRoutineIds.length === 0 ? (
               <div className="flex flex-col items-center justify-center p-12 min-h-[200px] border border-dashed border-div-l rounded-2xl bg-bg-l-card mt-2">
                 <button 
                   onClick={() => setShowAddMachine(true)}
                   className="bg-cta hover:bg-cta-strong text-white font-display italic px-6 py-3 rounded-full tracking-wide transition-all hover:scale-105 active:scale-95 flex items-center gap-2 text-sm shadow-md"
                 >
                   <Plus className="w-4 h-4" /> ADD FIRST MACHINE
                 </button>
               </div>
            ) : (
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
              <SortableContext 
                items={selectedRoutineIds}
                strategy={verticalListSortingStrategy}
              >
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
                    <SortableSequenceItem 
                      key={machineId}
                      id={machineId}
                      showAddMachine={showAddMachine}
                      onRemove={() => removeMachine(idx)}
                    >
                      <SequenceRow machine={displayMachine as any} />
                    </SortableSequenceItem>
                  );
                })}
              </SortableContext>
            </DndContext>
            )}
            
            {showAddMachine && (
              <div className="mt-4 p-4 border border-dashed border-cyan/20 rounded-xl bg-cyan/5">
                 <div className="text-[11px] font-medium tracking-wide opacity-60 text-cyan mb-3 uppercase">ADD MACHINE</div>
                 <div className="flex flex-wrap gap-2">
                   {machines.filter(m => !selectedRoutineIds.includes(m.id)).map(m => (
                      <button 
                        key={m.id}
                        onClick={() => addMachine(m.id)}
                        className="text-[12px] font-medium text-white bg-surface-2 hover:bg-surface-1 border border-div-d px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                         <Plus className="w-3.5 h-3.5 text-cyan" /> {m.name}
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
        className="mb-8"
      />
      </div>
    </div>
  );
}
