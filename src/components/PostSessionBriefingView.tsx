import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Client, WorkoutSession, ExerciseLog, Trainer, ScheduleEntry } from '../types';
import { Activity, Trophy, Clock, Dumbbell, Star, ChevronRight, Check, Calendar, AlertTriangle } from 'lucide-react';
import { MACHINE_LIST } from '../data/machine-database';
import { calculateExerciseVolume } from '../lib/utils';

interface PostSessionBriefingViewProps {
  client: Client;
  session: WorkoutSession;
  logs: ExerciseLog[];
  allLogs?: ExerciseLog[];
  schedules?: ScheduleEntry[];
  authTrainer: Trainer | null;
  onFinalize: (postData: { clientFeel: string; noteContent: string; notePriority: 'High' | 'Medium' | 'Low' }) => void;
  isSyncing?: boolean;
}

export function PostSessionBriefingView({
  client,
  session,
  logs,
  allLogs = [],
  schedules = [],
  authTrainer,
  onFinalize,
  isSyncing
}: PostSessionBriefingViewProps) {
  const [clientFeel, setClientFeel] = useState<string>('Good');
  const [noteContent, setNoteContent] = useState('');
  const [notePriority, setNotePriority] = useState<'High' | 'Medium' | 'Low'>('Medium');

  const getEquivalentReps = (log: ExerciseLog) => {
    if (log.isTSC || log.isStaticHold) {
       const seconds = parseFloat(log.seconds || '0');
       return isNaN(seconds) || seconds <= 0 ? 0 : (seconds / 30) * 2;
    }
    const r = parseFloat(log.reps || '0');
    return isNaN(r) ? 0 : r;
  };

  // Auto-Calculated Data
  const totalTonnage = Math.round(logs.reduce((acc, log) => acc + calculateExerciseVolume(log), 0));
  const totalReps = Math.round(logs.reduce((acc, log) => acc + getEquivalentReps(log), 0));

  const totalTimeUnderLoad = logs.reduce((acc, log) => {
    const s = parseFloat(log.seconds || '0');
    return acc + (isNaN(s) ? 0 : s);
  }, 0);

  let dynamicTimeForTut = 0;
  let dynamicRepsForTut = 0;

  logs.forEach(log => {
      const r = parseFloat(log.reps || '0');
      const s = parseFloat(log.seconds || '0');
      if (!isNaN(r) && r > 0 && !isNaN(s) && s > 0) {
        dynamicTimeForTut += s;
        dynamicRepsForTut += r;
      }
  });

  const avgTutPerRep = dynamicRepsForTut > 0 ? (dynamicTimeForTut / dynamicRepsForTut) : 0;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const eliteSets = logs.filter(l => l.repQuality === 3).length;

  // Lifetime Metrics
  const lifetimeTonnage = Math.round(allLogs.reduce((acc, log) => acc + calculateExerciseVolume(log), 0));
  const lifetimeReps = Math.round(allLogs.reduce((acc, log) => acc + getEquivalentReps(log), 0));

  // Next Scheduled Session
  const now = new Date();
  const futureSchedules = schedules
    .filter(s => s.clientId === client.id && s.startTime && s.startTime.toDate() > now && s.status === 'Scheduled')
    .sort((a, b) => a.startTime.toDate().getTime() - b.startTime.toDate().getTime());
  
  const nextSession = futureSchedules.length > 0 ? futureSchedules[0] : null;

  const handleFinalize = () => {
    onFinalize({
      clientFeel,
      noteContent: noteContent.trim(),
      notePriority
    });
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-full flex flex-col overflow-hidden bg-[#0A2E46] text-white z-[105]">
      {/* Header */}
      <div className="shrink-0 px-6 py-8 border-b border-white/5 bg-[#0e171e]">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 text-[#38BDF8] mb-2">
              <Trophy className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Victory HUD</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter">
              Session Complete
            </h2>
            <p className="text-slate-400 font-medium mt-2">
              Great work. Here are {client.firstName}'s numbers for today.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">
        {/* Victory Metrics Board */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-4 flex flex-col justify-center relative overflow-hidden shadow-lg">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-400 relative z-10">Today's Tonnage</span>
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tighter mt-1 relative z-10 truncate">
              {(isNaN(totalTonnage) ? 0 : totalTonnage).toLocaleString()}<span className="text-sm text-slate-500 ml-1">lbs</span>
            </span>
          </div>

          <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-4 flex flex-col justify-center relative overflow-hidden shadow-lg">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-400 relative z-10">Today's Reps</span>
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tighter mt-1 relative z-10 truncate">
              {totalReps}
            </span>
          </div>

          <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-4 flex flex-col justify-center relative overflow-hidden shadow-lg">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-[#38BDF8] relative z-10">Avg TUT / Rep</span>
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tighter mt-1 relative z-10 truncate">
              {avgTutPerRep.toFixed(1)}<span className="text-sm text-slate-500 ml-1">s</span>
            </span>
          </div>

          <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-4 flex flex-col justify-center relative overflow-hidden shadow-lg">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-400 relative z-10">Elite Sets</span>
            <span className="text-2xl sm:text-3xl font-black text-emerald-500 tracking-tighter mt-1 relative z-10 flex items-baseline gap-1 truncate">
              {eliteSets} <span className="text-sm text-emerald-500/50 uppercase tracking-widest">/ {logs.length}</span>
            </span>
          </div>

          <div className="bg-slate-800 border border-[#F06C22]/30 rounded-2xl p-4 flex flex-col justify-center relative overflow-hidden shadow-lg">
            <div className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-[#F06C22]/10 via-[#F06C22]/5 to-transparent w-full pointer-events-none" />
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-[#F06C22]/80 relative z-10 flex items-center gap-1.5">
              <Dumbbell className="w-3 h-3" /> Lifetime Volume
            </span>
            <span className="text-2xl sm:text-3xl font-black text-[#F06C22] tracking-tighter mt-1 relative z-10 truncate">
              {(isNaN(lifetimeTonnage) ? 0 : lifetimeTonnage).toLocaleString()}<span className="text-sm opacity-50 ml-1">lbs</span>
            </span>
          </div>

          <div className="bg-slate-800 border border-[#F06C22]/30 rounded-2xl p-4 flex flex-col justify-center relative overflow-hidden shadow-lg">
            <div className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-[#F06C22]/10 via-[#F06C22]/5 to-transparent w-full pointer-events-none" />
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-[#F06C22]/80 relative z-10 flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> Lifetime Reps
            </span>
            <span className="text-2xl sm:text-3xl font-black text-[#F06C22] tracking-tighter mt-1 relative z-10 truncate">
              {(isNaN(lifetimeReps) ? 0 : lifetimeReps).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Clinical Logging Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Client Subjective Feel */}
          <div className="bg-[#0e171e] border border-slate-700/50 rounded-2xl p-4 md:p-6 shadow-lg space-y-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#68717A]">Recovery Tracking</span>
              <h3 className="text-lg font-black text-white mt-1">How does the client feel?</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {['Wiped Out', 'Good', 'Energized'].map(feel => (
                <button
                  key={feel}
                  onClick={() => setClientFeel(feel)}
                  className={`flex-1 py-3 px-4 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs transition-all ${
                    clientFeel === feel 
                      ? 'bg-[#38BDF8] text-[#0A2E46] shadow-[0_0_20px_rgba(56,189,248,0.2)]' 
                      : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                  }`}
                >
                  {feel}
                </button>
              ))}
            </div>
          </div>

          {/* Post-Session Notes */}
          <div className="bg-[#0e171e] border border-slate-700/50 rounded-2xl p-4 md:p-6 shadow-lg space-y-3 flex flex-col">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#68717A]">Clinical Log</span>
              <h3 className="text-lg font-black text-white mt-1">Post-Session Notes</h3>
            </div>
            <div className="flex-1 flex flex-col gap-3">
              <Textarea 
                placeholder="Log any closing observations. These feed into the next Briefing."
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                rows={3}
                className="w-full bg-slate-900 border-slate-700 text-white resize-none"
              />
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">Priority for Next Time:</span>
                <select 
                  value={notePriority} 
                  onChange={(e) => setNotePriority(e.target.value as any)}
                  className="w-[120px] bg-slate-900 border border-slate-700 text-white font-bold h-9 text-xs rounded-md px-3 outline-none focus:ring-1 focus:ring-[#38BDF8]"
                >
                  <option value="High" className="font-bold text-amber-500">High</option>
                  <option value="Medium" className="font-bold">Medium</option>
                  <option value="Low" className="font-bold text-slate-400">Low</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Next Scheduled Indicator */}
        <div className="pt-4">
          <div className="bg-slate-800/50 border border-slate-700/30 rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#0e171e] border border-slate-700/50 flex items-center justify-center">
                <Calendar className={`w-6 h-6 ${nextSession ? 'text-emerald-500' : 'text-amber-500'}`} />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#68717A]">Upcoming</span>
                {nextSession ? (
                  <h4 className="text-emerald-500 font-medium">
                    Next Session: {nextSession.startTime.toDate().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {nextSession.trainerName && ` with ${nextSession.trainerName}`}
                  </h4>
                ) : (
                  <h4 className="text-amber-500 font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Client is not currently scheduled for a future session.
                  </h4>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Footer */}
      <div className="shrink-0 bg-slate-900 border-t border-slate-700 p-4 md:p-6 flex justify-end">
        <Button 
          onClick={handleFinalize}
          disabled={isSyncing}
          className="w-full md:w-auto px-8 md:px-12 h-16 bg-[#F06C22] hover:bg-[#d95d18] text-white rounded-[1.5rem] shadow-[0_10px_30px_rgba(240,108,34,0.4)] transition-all font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:opacity-50"
        >
          {isSyncing ? (
            'Syncing...'
          ) : (
            <>
              Finalize Session & Return to Hub
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border border-white/30 hidden sm:flex">
                <ChevronRight className="w-4 h-4 text-white" />
              </div>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
