import React, { useMemo, useState } from "react";
import { X, ChevronRight, Activity, TrendingUp, AlertTriangle, Play, Calendar, Search, ActivitySquare, CheckCircle, Clock, Check, RefreshCw } from "lucide-react";
import { 
  Client, 
  ExerciseLog, 
  WorkoutSession, 
  FocusRecord, 
  ClinicalIncident, 
  Machine, 
  ClinicalTagDefinition 
} from "../types";
import { AppHeader } from "./AppHeader";
import { StickyCTA } from "./StickyCTA";
import { BentoStatTile } from "./BentoStatTile";
import { cn } from "@/lib/utils";
import { computeClinicalMetrics } from "../lib/clinical-review-utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";

export interface ClientClinicalReviewViewProps {
  client: Client;
  logs: ExerciseLog[];
  sessions: WorkoutSession[];
  focusRecords: FocusRecord[];
  incidents: ClinicalIncident[];
  machines: Machine[];
  clinicalTags: ClinicalTagDefinition[];
  onOpenBriefing: () => void;
  onClose: () => void;
}

export function ClientClinicalReviewView({
  client,
  logs,
  sessions,
  focusRecords,
  incidents,
  machines,
  clinicalTags,
  onOpenBriefing,
  onClose
}: ClientClinicalReviewViewProps) {
  const [windowDays, setWindowDays] = useState<number>(30);

  const metrics = useMemo(() => 
    computeClinicalMetrics(client, logs, sessions, focusRecords, incidents, clinicalTags, machines, windowDays),
    [client, logs, sessions, focusRecords, incidents, clinicalTags, machines, windowDays]
  );
  
  const clientName = `${client.firstName} ${client.lastName}`;
  const openIncidents = incidents.filter(i => !i.resolvedAt && i.clientId === client.id);

  return (
    <div className="fixed inset-0 z-50 bg-bg-dark flex flex-col font-sans overflow-hidden">
      <AppHeader
        variant="dark"
        rightControls={
           <button onClick={onClose} className="w-10 h-10 flex flex-col items-center justify-center border border-div-d rounded-xl hover:bg-surface-2 transition-colors">
              <X className="w-5 h-5 text-white" />
           </button>
        }
      />
      
      <div className="flex-1 w-full max-w-[820px] mx-auto pt-[80px] md:pt-[20px] px-6 pb-32 overflow-y-auto no-scrollbar scroll-smooth">
        
        <div className="mb-6">
          <h1 className="text-3xl font-display italic font-bold tracking-tighter text-white">
            Clinical Review
          </h1>
          <p className="text-[13px] font-bold uppercase tracking-widest text-cyan mt-1">
            {clientName}
          </p>
        </div>

        {/* Top Controls */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center bg-surface-1 p-1 rounded-full border border-div-d">
             {[7, 30, 90].map(days => (
               <button
                 key={days}
                 onClick={() => setWindowDays(days)}
                 className={cn(
                   "px-4 min-h-[44px] rounded-full text-[13px] font-bold uppercase tracking-wide transition-all",
                   windowDays === days 
                     ? "bg-surface-2 text-white shadow-sm ring-1 ring-white/10" 
                     : "text-ink-d2 hover:text-white"
                 )}
               >
                 {days}d
               </button>
             ))}
             <button
                 onClick={() => setWindowDays(9999)}
                 className={cn(
                   "px-4 min-h-[44px] rounded-full text-[13px] font-bold uppercase tracking-wide transition-all",
                   windowDays === 9999 
                     ? "bg-surface-2 text-white shadow-sm ring-1 ring-white/10" 
                     : "text-ink-d2 hover:text-white"
                 )}
               >
                 All
               </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Dashboard Header grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <BentoStatTile
                id="age"
                label="Age"
                value={client.age?.toString() || "--"}
             />
             <BentoStatTile
                id="sessions"
                label="Remaining"
                value={metrics.sessionsRemaining.toString()}
             />
             <BentoStatTile
                id="last-seen"
                label="Last Seen"
                value={metrics.lastSeenDaysAgo !== null ? `${metrics.lastSeenDaysAgo}d ago` : "N/A"}
             />
             <BentoStatTile
                id="setup"
                label="Setup Self-Sufficiency"
                value={metrics.setupCorrectPercentage === -1 ? "--" : `${Math.round(metrics.setupCorrectPercentage)}%`}
                delta={{
                  tone: metrics.setupCorrectPercentage >= 80 ? 'up' : metrics.setupCorrectPercentage >= 60 ? 'flat' : 'down',
                  text: metrics.setupCorrectPercentage === -1 ? "" : "correctly set"
                }}
             />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* SCOREBOARD */}
            <div className="bg-surface-1 rounded-3xl p-6 border border-div-d flex flex-col gap-4">
               <div>
                  <h3 className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d2">Volume & Quality</h3>
                  <div className="font-display text-3xl italic tracking-tighter text-white mt-1">
                    {metrics.totalTonnage.toLocaleString()} <span className="text-xl text-cyan">LBS</span>
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-ink-d3 mt-1">
                    Across {metrics.totalReps} Reps
                  </div>
               </div>

               <div className="space-y-2 mt-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-green text-[13px] font-bold uppercase tracking-wider">Max Strength</span>
                    <span className="text-white font-mono">{metrics.repQualityBreakdown.elite}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-cyan text-[13px] font-bold uppercase tracking-wider">Completed</span>
                    <span className="text-white font-mono">{metrics.repQualityBreakdown.good}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-red-500 text-[13px] font-bold uppercase tracking-wider">Poor</span>
                    <span className="text-white font-mono">{metrics.repQualityBreakdown.poor}</span>
                  </div>
               </div>

               {metrics.meanRPEHistory.length > 0 && (
                 <div className="h-[60px] mt-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metrics.meanRPEHistory}>
                        <Line type="monotone" dataKey="value" stroke="var(--cyan)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="text-center text-[10px] uppercase font-bold text-ink-d3 tracking-widest mt-1">Avg RPE Trend</div>
                 </div>
               )}
            </div>

            {/* FORM BREAKDOWN HEATMAP */}
            <div className="bg-surface-1 rounded-3xl p-6 border border-div-d md:col-span-2 flex flex-col overflow-x-auto">
              <h3 className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d2 whitespace-nowrap mb-4">Form Breakdown Heatmap</h3>
              <div className="flex-1 min-w-[500px]">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className="pb-2 w-1/3"></th>
                      {metrics.formTagCountsByWeek.map(w => (
                         <th key={w.weekIndex} className="text-[10px] font-bold text-ink-d3 uppercase text-center pb-2 px-1">{w._weekLabel}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.topFormTags.map(tagId => {
                       const def = clinicalTags.find(t => t.id === tagId);
                       return (
                         <tr key={tagId} className="border-t border-div-d/50">
                           <td className="py-2 text-[12px] font-bold text-white pr-4 truncate max-w-[200px]">
                             {def?.label || tagId}
                           </td>
                           {metrics.formTagCountsByWeek.map(w => {
                              const count = w.tags[tagId] || 0;
                              const intensity = Math.min(count / 5, 1);
                              return (
                                <td key={w.weekIndex} className="p-1 text-center align-middle">
                                  <button 
                                    onClick={() => console.log('Drill down tags for week', w.weekIndex, tagId)}
                                    className="w-full min-h-[44px] rounded bg-cyan/20 border border-cyan hover:bg-cyan/40 transition-colors flex items-center justify-center font-mono text-[10px] text-white"
                                    style={{ backgroundColor: count > 0 ? `rgba(56, 189, 248, ${intensity})` : 'transparent', opacity: count > 0 ? 1 : 0.3 }}
                                    disabled={count === 0}
                                  >
                                    {count > 0 ? count : '-'}
                                  </button>
                                </td>
                              )
                           })}
                         </tr>
                       )
                    })}
                  </tbody>
                </table>
                {metrics.topFormTags.length === 0 && (
                   <div className="h-[100px] flex items-center justify-center text-[12px] text-ink-d3 uppercase tracking-widest font-bold">
                     No form data in window
                   </div>
                )}
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* SYMPTOM LOG */}
            <div className="bg-surface-1 rounded-3xl p-6 border border-div-d flex flex-col gap-4">
              <h3 className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d2">Symptom Log</h3>
              
              {openIncidents.length > 0 && (
                 <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
                   <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-amber-500">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-[11px] font-bold uppercase tracking-widest">Active Incident</span>
                        </div>
                        <p className="text-white text-sm mt-2">{openIncidents[0].description}</p>
                      </div>
                      <button className="min-h-[44px] px-3 bg-white/5 border border-div-d hover:bg-white/10 rounded-xl text-[11px] font-bold uppercase text-white tracking-widest">
                        Resolve
                      </button>
                   </div>
                 </div>
              )}

              <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto no-scrollbar pr-2">
                {Object.entries(metrics.symptomsByRegion).map(([region, syms]) => (
                   <div key={region} className="bg-surface-2 rounded-xl p-3 border border-div-l">
                     <span className="text-[10px] text-amber-500/80 font-bold uppercase tracking-widest">{region}</span>
                     {(syms as any[]).map((s, i) => (
                       <div key={i} className="flex justify-between text-sm mt-1 border-t border-div-l/50 pt-1 first:border-0 first:pt-0">
                         <span className="text-white">{s.note || `Intensity ${s.intensity}`}</span>
                         <span className="text-ink-d2 font-mono">L{s.intensity}</span>
                       </div>
                     ))}
                   </div>
                ))}
                {Object.keys(metrics.symptomsByRegion).length === 0 && (
                  <div className="text-center text-[12px] text-ink-d3 uppercase tracking-widest font-bold py-8">
                     No reported symptoms
                  </div>
                )}
              </div>
            </div>

            {/* PRE-SESSION STATE */}
            <div className="bg-surface-1 rounded-3xl p-6 border border-div-d flex flex-col gap-4">
              <h3 className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d2">Pre-Session Readiness</h3>
              
              {metrics.preSessionCheckIns.length > 0 ? (
                <div className="flex-1 min-h-[200px]">
                  {/* Simplistic mock chart for readiness - ideally using Recharts composed chart but keeping it simple */}
                  <div className="h-full flex items-end gap-2 px-2 pb-6 relative">
                     <div className="absolute inset-0 flex flex-col justify-between py-6">
                        <div className="border-b border-div-l/50 h-0 w-full" />
                        <div className="border-b border-div-l/50 h-0 w-full" />
                        <div className="border-b border-div-l/50 h-0 w-full" />
                     </div>
                     {metrics.preSessionCheckIns.map((ci, i) => {
                        const sleep = ci.checkIn?.sleepHours || 0;
                        const soreness = ci.checkIn?.sorenessLevel || 0;
                        return (
                          <div key={i} className="flex-1 flex flex-col justify-end items-center gap-1 z-10 group relative min-h-[44px]">
                             {/* Soreness bar */}
                             {soreness > 0 && <div className="w-full max-w-[20px] bg-red-500/50 rounded-t-sm" style={{ height: `${soreness * 15}%` }} />}
                             {/* Sleep dot */}
                             <div className="absolute bottom-[20%] w-2 h-2 rounded-full bg-cyan ring-2 ring-bg-dark" style={{ bottom: `${Math.min(sleep * 10, 100)}%` }} />
                             
                             <div className="opacity-0 group-hover:opacity-100 absolute -top-12 bg-surface-2 p-2 rounded-lg border border-div-l text-[10px] text-white whitespace-nowrap z-20 pointer-events-none">
                                Sleep: {sleep}hr | Sore: {soreness}/5
                             </div>
                          </div>
                        )
                     })}
                  </div>
                  <div className="flex justify-center gap-6 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-cyan" />
                      <span className="text-[10px] text-ink-d2 uppercase tracking-widest font-bold">Sleep (Hrs)</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="w-2 h-2 bg-red-500/50" />
                       <span className="text-[10px] text-ink-d2 uppercase tracking-widest font-bold">Soreness</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-div-l rounded-2xl">
                   <ActivitySquare className="w-8 h-8 text-ink-d3 mb-3" />
                   <p className="text-[12px] font-bold text-ink-d2 uppercase tracking-widest">No Check-in Data</p>
                   <p className="text-sm text-ink-d3 mt-2">Check-in metrics (sleep, soreness) will appear here when collected before sessions.</p>
                </div>
              )}
            </div>
            
          </div>

          {/* ACTIVE 4P FOCI */}
          {metrics.activeFociWithMatchCount.length > 0 && (
             <div className="bg-surface-1 rounded-3xl p-6 border border-div-d flex flex-col gap-4">
               <h3 className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d2">Active Focus Areas</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {metrics.activeFociWithMatchCount.map((f, i) => (
                   <div key={i} className="bg-surface-2 border border-div-l rounded-xl p-4 flex justify-between items-center">
                     <div>
                       <span className="text-[10px] text-cyan font-bold uppercase tracking-widest">{f.focus.category}</span>
                       <p className="text-white text-sm font-medium mt-1">{f.focus.notes}</p>
                     </div>
                     <div className="text-right">
                        <div className="text-2xl font-display italic text-white">{f.matchCount}</div>
                        <div className="text-[10px] text-ink-d3 font-bold uppercase tracking-widest">Tags in window</div>
                     </div>
                   </div>
                 ))}
               </div>
             </div>
          )}

          {/* MACHINE TRENDS */}
          <div className="bg-surface-1 rounded-3xl p-6 border border-div-d flex flex-col gap-4">
            <h3 className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d2">Top Machine Trends</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               {metrics.topMachines.map(tm => {
                 const mDef = machines.find(m => m.id === tm.id);
                 const chartData = tm.logs.slice(-6).map((log, index) => {
                    const weight = parseInt(log.weight || '0', 10);
                    const reps = parseInt(log.reps || '0', 10);
                    return {
                      index,
                      volume: weight * reps,
                      rpe: log.rpe || 0
                    }
                 });
                 
                 // top form tag for this machine
                 const formTags: Record<string, number> = {};
                 tm.logs.forEach(l => {
                    if (l.clinicalTags) l.clinicalTags.forEach(tid => formTags[tid] = (formTags[tid] || 0) + 1);
                 });
                 const topTagId = Object.entries(formTags).sort((a,b) => b[1] - a[1])[0]?.[0];
                 const topTagDef = topTagId ? clinicalTags.find(t => t.id === topTagId) : null;

                 return (
                   <div key={tm.id} className="bg-surface-2 border border-div-l rounded-xl p-4 flex flex-col group">
                     <span className="text-[12px] font-bold text-white uppercase tracking-wider">{mDef?.name || tm.id}</span>
                     
                     <div className="h-[80px] w-full mt-4">
                       <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                             <Bar dataKey="volume" fill="var(--cyan)" opacity={0.6} radius={[2,2,0,0]} />
                          </BarChart>
                       </ResponsiveContainer>
                     </div>

                     <div className="mt-4 pt-4 border-t border-div-l">
                        <span className="text-[10px] text-ink-d3 font-bold uppercase tracking-widest block mb-1">Dominant Form</span>
                        <div className="text-[11px] text-amber-500 font-medium truncate">
                           {topTagDef ? topTagDef.label : 'None recorded'}
                        </div>
                     </div>
                   </div>
                 )
               })}
               {metrics.topMachines.length === 0 && (
                 <div className="col-span-1 md:col-span-4 h-[100px] flex items-center justify-center text-[12px] text-ink-d3 uppercase tracking-widest font-bold">
                    No machine logs in window
                 </div>
               )}
            </div>
          </div>

        </div>
      </div>

      <StickyCTA 
        label="Open Briefing" 
        icon={<ChevronRight className="w-6 h-6" />} 
        onClick={onOpenBriefing}
      />
    </div>
  );
}
