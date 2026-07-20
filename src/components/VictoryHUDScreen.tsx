import React, { useState } from "react";
import { AppHeader } from "./AppHeader";
import { StickyCTA } from "./StickyCTA";
import { FeelToggle } from "./FeelToggle";
import { BentoStatTile } from "./BentoStatTile";
import { Client, WorkoutSession, ExerciseLog, Trainer, ScheduleEntry, Machine } from "../types";
import { safeToDate } from "../lib/utils";
import { getBroadMuscleGroup } from "../lib/clinical-review-utils";

export interface VictoryHUDScreenProps {
  client: Client;
  session: WorkoutSession;
  logs: ExerciseLog[];
  allLogs?: ExerciseLog[];
  schedules?: ScheduleEntry[];
  authTrainer: Trainer | null;
  onFinalize: (postData: { clientFeel: string; noteContent: string; notePriority: 'High' | 'Medium' | 'Low' }) => void;
  isSyncing?: boolean;
  machines?: Machine[];
}

export function VictoryHUDScreen({ 
  client,
  session,
  logs,
  allLogs = [],
  schedules = [],
  authTrainer,
  onFinalize,
  isSyncing,
  machines = []
}: VictoryHUDScreenProps) {
  const [feel, setFeel] = useState<'great' | 'good' | 'fatigued' | 'sore' | 'pain'>('good');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');

  // Multi-format support for stats (handles both legacy import schemas and active live logged workout documents)
  const getLogLoad = (l: ExerciseLog) => parseFloat(l.loadLb || l.weight || '0') || 0;
  const getLogReps = (l: ExerciseLog) => {
    if (l.isTSC || l.isStaticHold) return 0;
    return parseFloat(l.outcomeReps || l.reps || '0') || 0;
  };
  const getLogTut = (l: ExerciseLog) => {
    return parseFloat(l.outcomeTut || l.seconds || ((l.isTSC || l.isStaticHold) ? l.reps : '') || '0') || 0;
  };

  // Calculate actual total tonnage from today's logs
  const totalTonnage = logs.reduce((sum, l) => sum + (getLogLoad(l) * getLogReps(l)), 0);
  
  // Calculate today's broad muscle grouping breakdown
  const todayBroad: Record<string, number> = {
    "Lower Body": 0,
    "Upper Body": 0,
    "Core & Spine": 0,
    "Other": 0
  };

  logs.forEach(l => {
    const machine = machines.find(m => m.id === l.machineId);
    const region = machine?.anatomicalRegion || "";
    const name = machine?.name || "";
    const group = getBroadMuscleGroup(region, name);
    const tonnage = getLogLoad(l) * getLogReps(l);
    todayBroad[group] += tonnage;
  });

  const todayBroadList = [
    { name: "Lower Body", value: todayBroad["Lower Body"], color: "bg-emerald-500" },
    { name: "Upper Body", value: todayBroad["Upper Body"], color: "bg-cyan" },
    { name: "Core & Spine", value: todayBroad["Core & Spine"], color: "bg-orange-500" },
    { name: "Other", value: todayBroad["Other"], color: "bg-indigo-500" }
  ].filter(item => item.value > 0 || item.name !== "Other");

  // Calculate average TUT
  const totalTimeUnderTension = logs.reduce((sum, l) => sum + getLogTut(l), 0);
  const totalReps = logs.reduce((sum, l) => sum + getLogReps(l), 0);
  const avgTutPerRep = totalReps > 0 ? (totalTimeUnderTension / totalReps).toFixed(1) : '0';

  // Calculate max strength sets (assuming quality >= 3 based on 1-3 scale)
  const maxStrengthSets = logs.filter(l => (l.repQuality || 0) >= 3).length;
  const totalSets = logs.length;

  // Total session duration calculated safely matching potential Firestore/local states
  const startD = safeToDate(session.startTime) || safeToDate(session.createdAt);
  const endD = safeToDate(session.endTime) || new Date();
  
  let durationFormat = "0:00";
  if (startD) {
    const durationMs = Math.max(0, endD.getTime() - startD.getTime());
    // Clamp to 12 hours max to prevent overflow errors
    if (durationMs < 1000 * 60 * 60 * 12) {
      const durationMins = Math.floor(durationMs / 60000);
      const durationSecs = Math.floor((durationMs % 60000) / 1000);
      durationFormat = `${durationMins}:${durationSecs.toString().padStart(2, '0')}`;
    }
  }

  // Lifetime stats
  const lifetimeVolume = allLogs.reduce((sum, l) => sum + (getLogLoad(l) * getLogReps(l)), 0);
  const lifetimeReps = allLogs.reduce((sum, l) => sum + getLogReps(l), 0);
  const sessionCount = new Set(allLogs.map(l => l.sessionId)).size;
  const avgRepsPerSession = sessionCount > 0 ? (lifetimeReps / sessionCount).toFixed(1) : '0';

  const tiles = [
    { id: 'tonnage',      label: "TODAY'S TONNAGE",  value: totalTonnage,    unit: 'lb', variant: 'hero' as const, broadBreakdown: todayBroadList },
    { id: 'tut',          label: 'AVG TUT / REP',    value: avgTutPerRep,  unit: 's',   variant: 'default' as const },
    { id: 'elite',        label: 'MAX STRENGTH SETS', value: maxStrengthSets.toString(), meta: `/ ${totalSets}`, progress: { current: maxStrengthSets, target: totalSets }, variant: 'default' as const },
    { id: 'reps',         label: 'TOTAL REPS',       value: totalReps,                  variant: 'default' as const },
    { id: 'duration',     label: 'DURATION',         value: durationFormat,             variant: 'default' as const },
    { id: 'lifetimeVol',  label: 'LIFETIME VOLUME',  value: lifetimeVolume.toLocaleString(), unit: 'lb', meta: `${sessionCount} sessions`, variant: 'elevated' as const },
    { id: 'lifetimeReps', label: 'LIFETIME REPS',    value: lifetimeReps.toLocaleString(),                 meta: `avg ${avgRepsPerSession} / session`, variant: 'elevated' as const },
  ];

  return (
    <div className="w-full h-full min-h-screen bg-bg-dark font-sans flex flex-col overflow-hidden">
      <div className="max-w-[820px] mx-auto w-full h-full relative flex flex-col pb-24 border-x border-div-d shadow-2xl">
        <AppHeader variant="dark" trainerInitials={authTrainer?.initials || "AJ"} />

      <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 flex flex-col pb-[120px]">
        {/* 2. Title block */}
        <div className="px-6 py-[14px]">
          <div className="font-display italic text-cyan text-[11px] uppercase tracking-[0.16em] mb-1">
            🏆 VICTORY HUD
          </div>
          <h1 className="font-display italic text-ink-d1 text-[38px] uppercase tracking-[-0.01em] leading-none mb-2 mt-2">
            SESSION COMPLETE
          </h1>
          <div className="flex items-center gap-2 text-ink-d2 text-[13px]">
            <span>Great work · {client.firstName}'s numbers for today.</span>
            <div className="font-mono text-[11px] bg-white/10 px-2 py-[3px] rounded-[10px] tracking-[0.04em] uppercase text-ink-d1 ml-2">
              SESSION · {session.id.substring(0, 8)}…
            </div>
          </div>
        </div>

        {/* 3. Bento stat grid */}
        <div className="px-5 mt-2">
          <div className="grid grid-cols-4 auto-rows-[86px] gap-2.5">
            {tiles.map(tile => (
              <BentoStatTile key={tile.id} {...tile} />
            ))}
          </div>
        </div>

        {/* 4. Feedback card */}
        <div className="mx-5 mt-4 p-[14px] px-4 bg-bg-dark-2 border border-div-d rounded-[14px] flex flex-col gap-3">
          <div className="font-display italic text-cyan text-[11px] uppercase tracking-[0.10em]">
            RECOVERY + CLINICAL LOG
          </div>
          
          <div className="font-display italic text-ink-d1 text-[17px] uppercase mt-[-4px]">
            How does {client.firstName} feel?
          </div>
          
          <FeelToggle 
            value={feel} 
            onChange={(val) => setFeel(val as any)} 
          />
          
          <textarea 
            className="w-full bg-black/25 border border-white/10 rounded-[10px] p-[10px] px-3 min-h-[60px] text-[13px] text-ink-d1 placeholder:text-ink-d3 placeholder:italic placeholder:font-sans resize-none outline-none focus:border-cyan transition-colors mt-1"
            placeholder="Post-session notes — any closing observations? These feed into next briefing."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          
          <div className="flex items-center justify-between mt-1">
            <span className="font-display italic text-[11px] text-ink-d3 uppercase tracking-wider">
              PRIORITY FOR NEXT TIME
            </span>
            <button 
              onClick={() => {
                const next: Record<string, 'High' | 'Medium' | 'Low'> = { High: 'Low', Low: 'Medium', Medium: 'High' };
                setPriority(next[priority]);
              }}
              className={`font-display italic text-[11px] uppercase px-4 min-h-[44px] min-w-[44px] rounded-xl flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark ${
                priority === 'High' ? 'bg-orange-500/20 border border-orange-500/30 text-orange-400 hover:bg-orange-500/30' :
                priority === 'Medium' ? 'bg-cyan/10 border border-cyan/30 text-cyan hover:bg-cyan/20' :
                'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              }`}
            >
              {priority} <span className="text-[11px] opacity-70">▼</span>
            </button>
          </div>
        </div>
      </div>

      <StickyCTA 
        label={isSyncing ? "SAVING..." : "FINALIZE & RETURN TO HUB"}
        icon={!isSyncing ? <span className="text-[13px] order-last ml-1">▶</span> : undefined}
        onClick={() => onFinalize({ clientFeel: feel, noteContent: notes, notePriority: priority })}
        className="mb-8"
      />
      </div>
    </div>
  );
}

