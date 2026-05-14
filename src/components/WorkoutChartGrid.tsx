
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ChevronLeft, 
  Dumbbell, 
  Settings,
  X,
  Plus,
  ArrowRight,
  TrendingUp,
  History,
  Activity,
  UserCircle,
  Clock,
  AlertCircle,
  Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  limit, 
  setDoc,
  doc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LineChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, AreaChart, Area } from 'recharts';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Client, Machine, WorkoutSession, ExerciseLog, ClientMachineSetting, Routine } from '../types';
import { cn, parseSessionDate, getMuscleGroupColor, calculateExerciseVolume, isBig5Machine } from '../lib/utils';
import { OperationType, handleFirestoreError } from '../lib/firestore-errors';
import { MachineSettingsDashboardModal } from './MachineSettingsDashboardModal';

interface WorkoutChartGridProps {
  clientId: string;
  clients: Client[];
  machines: Machine[];
  routines: Routine[];
  onBack: () => void;
  user?: any;
  preloadedSessions?: WorkoutSession[];
  preloadedLogs?: ExerciseLog[];
  onLoadMoreHistory?: () => void;
}

export function WorkoutChartGrid({ 
  clientId, 
  clients,
  machines,
  routines,
  onBack,
  user,
  preloadedSessions,
  preloadedLogs,
  onLoadMoreHistory
}: WorkoutChartGridProps) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [clientSettings, setClientSettings] = useState<ClientMachineSetting[]>([]);
  const [editingSettings, setEditingSettings] = useState<{machineId: string, settings: Record<string, string>} | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionLimit, setSessionLimit] = useState(30);

  // Sync with props
  useEffect(() => {
    if (preloadedSessions) {
      setSessions([...preloadedSessions].filter(s => s.status === 'Completed').reverse());
    }
  }, [preloadedSessions]);

  useEffect(() => {
    if (preloadedLogs) {
      setExerciseLogs(preloadedLogs);
    }
  }, [preloadedLogs]);
  
  // Memoized log lookup map for O(1) rendering performance
  const logMap = React.useMemo(() => {
    const map = new Map<string, ExerciseLog>();
    exerciseLogs.forEach(log => {
      map.set(`${log.machineId}_${log.sessionId}`, log);
    });
    return map;
  }, [exerciseLogs]);
  
  // Filtering states
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'A' | 'B'>('ALL');
  const [machineSearchQuery, setMachineSearchQuery] = useState('');
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const client = clients.find(c => c.id === clientId);
  if (!client) return null;

  // Real-time Data Fetching for this specific client
  useEffect(() => {
    if (!clientId || !user) return;

    let unsubscribeSessions = () => {};

    if (!preloadedSessions) {
      // Session History with limit for performance
      const sessionsQ = query(
        collection(db, 'sessions'),
        where('clientId', '==', clientId),
        where('status', '==', 'Completed'),
        orderBy('date', 'desc'),
        limit(sessionLimit)
      );

      unsubscribeSessions = onSnapshot(sessionsQ, async (snap) => {
        const sessData = snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutSession));
        sessData.sort((a, b) => parseSessionDate(b.date) - parseSessionDate(a.date));
        
        // Grid view: Left -> Right: Oldest -> Newest
        const finalSessions = sessData.reverse();
        setSessions(finalSessions);

        // Only fetch logs for these specific sessions to save reads and memory
        if (finalSessions.length > 0 && !preloadedLogs) {
          const sessionIds = finalSessions.map(s => s.id!).filter(Boolean);
          
          // Split into chunks if exceeds 30 due to Firestore 'in' limit
          const chunks = [];
          for (let i = 0; i < sessionIds.length; i += 30) {
            chunks.push(sessionIds.slice(i, i + 30));
          }

          let allFetchedLogs: ExerciseLog[] = [];
          for (const chunk of chunks) {
            const logsQSub = query(
              collection(db, 'exerciseLogs'),
              where('sessionId', 'in', chunk)
            );
            const logSnap = await getDocs(logsQSub);
            allFetchedLogs = [
              ...allFetchedLogs,
              ...logSnap.docs.map(d => ({ id: d.id, ...d.data() } as ExerciseLog))
            ];
          }
          setExerciseLogs(allFetchedLogs);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'sessions');
      });
    }

    // Client Settings (Master Reference)
    const settingsQ = query(
      collection(db, 'clientMachineSettings'),
      where('clientId', '==', clientId)
    );

    const unsubscribeSettings = onSnapshot(settingsQ, (snap) => {
      setClientSettings(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClientMachineSetting)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clientMachineSettings');
    });

    return () => {
      unsubscribeSessions();
      unsubscribeSettings();
    };
  }, [clientId, user?.uid, sessionLimit]);

  useEffect(() => {
    // Auto-scroll to the far right (newest sessions) when sessions are loaded
    if (scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
        }
      }, 0);
    }
  }, [sessions]);

  const handleUpdateSettings = async () => {
    if (!editingSettings || !clientId) return;
    setIsSaving(true);
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
      setIsSaving(false);
    }
  };

  const getLog = (machineId: string, sessionId: string) => {
    return logMap.get(`${machineId}_${sessionId}`);
  };

  const getSetting = (machineId: string) => {
    return clientSettings.find(s => s.machineId === machineId)?.settings || {};
  };

  const chartData = useMemo(() => {
    return sessions.map((session, idx) => {
      const logs = exerciseLogs.filter(l => l.sessionId === session.id);
      const volume = logs.reduce((acc, log) => acc + calculateExerciseVolume(log), 0);
      const dateLabel = new Date(parseSessionDate(session.date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        name: `Sess ${idx + 1}`,
        date: dateLabel,
        volume
      };
    });
  }, [sessions, exerciseLogs]);

  const filteredSortedMachines = [...machines]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .filter(m => {
      // Name Search
      if (machineSearchQuery && !m.name.toLowerCase().includes(machineSearchQuery.toLowerCase())) return false;
      
      // Routine Filter
      if (activeFilter === 'ALL') return true;
      const targetRoutine = routines.find(r => r.name === `Routine ${activeFilter}`);
      if (!targetRoutine) return false;
      return targetRoutine.machineIds.includes(m.id!);
    });

  return (
    <div className="fixed inset-0 bg-[#0A2E46] z-[100] flex flex-col overflow-hidden font-sans">
      {/* High-Impact Header - Optimized for iPad Contrast */}
      <header className="h-20 bg-[#0e171e] px-6 sm:px-8 flex items-center justify-between shrink-0 border-b-4 border-[#F06C22]">
        <div className="flex items-center gap-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onBack}
            className="rounded-xl h-10 w-10 sm:h-12 sm:w-12 bg-slate-800 border-2 border-slate-700 text-white hover:bg-slate-700 transition-all active:scale-95"
          >
            <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
          </Button>
          
          <div className="space-y-0.5">
            <h1 className="text-2xl sm:text-3xl font-black italic tracking-tighter uppercase text-white leading-none">
              {client.firstName} {client.lastName}
            </h1>
            <div className="flex items-center gap-3">
              <Badge className="bg-[#F06C22] text-white text-[8px] font-black uppercase tracking-[0.2em] px-2 h-4 border-none">
                Expanded Matrix
              </Badge>
              <div className="hidden sm:flex gap-1.5 ml-4">
                <Button
                  size="sm"
                  onClick={() => setActiveFilter('ALL')}
                  className={cn(
                    "h-6 px-3 rounded-md text-[9px] font-black uppercase tracking-widest border-none transition-all",
                    activeFilter === 'ALL' 
                      ? "bg-[#F06C22] text-white shadow-[0_0_10px_rgba(240,108,34,0.4)]" 
                      : "bg-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                  )}
                >
                  All Machines
                </Button>
                <Button
                  size="sm"
                  onClick={() => setActiveFilter('A')}
                  className={cn(
                    "h-6 px-3 rounded-md text-[9px] font-black uppercase tracking-widest border-none transition-all",
                    activeFilter === 'A' 
                      ? "bg-[#F06C22] text-white shadow-[0_0_10px_rgba(240,108,34,0.4)]" 
                      : "bg-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                  )}
                >
                  Routine A
                </Button>
                {client.isRoutineBActive && (
                  <Button
                    size="sm"
                    onClick={() => setActiveFilter('B')}
                    className={cn(
                      "h-6 px-3 rounded-md text-[9px] font-black uppercase tracking-widest border-none transition-all",
                      activeFilter === 'B' 
                        ? "bg-[#F06C22] text-white shadow-[0_0_10px_rgba(240,108,34,0.4)]" 
                        : "bg-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                    )}
                  >
                    Routine B
                  </Button>
                )}
                
                <div className="h-6 w-[1px] bg-slate-700/50 mx-2 self-center hidden sm:block" />
                <Button
                  size="sm"
                  onClick={() => onLoadMoreHistory ? onLoadMoreHistory() : setSessionLimit(prev => prev + 20)}
                  className="h-6 px-3 rounded-md text-[9px] font-black uppercase tracking-widest bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/20 hover:bg-[#38BDF8]/20 transition-all font-mono"
                >
                  More History (+20)
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-8">
           <div className="hidden md:flex items-center mr-4">
             <div className="relative">
               <input 
                 type="text" 
                 placeholder="SEARCH MACHINES..." 
                 value={machineSearchQuery}
                 onChange={(e) => setMachineSearchQuery(e.target.value)}
                 className="h-10 bg-slate-800 border-2 border-slate-700 rounded-xl px-4 pl-10 text-[10px] font-black uppercase tracking-widest text-white placeholder:text-slate-400 focus:outline-none focus:border-[#F06C22] w-[200px]"
               />
               <Dumbbell className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
             </div>
           </div>
           
           <div className="text-right">
              <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest leading-none mb-1">Historical Span</p>
              <p className="text-lg sm:text-2xl font-black italic text-white tracking-tighter leading-none">{sessions.length} Sessions</p>
           </div>
           <Activity className="w-8 h-8 text-[#F06C22] opacity-50 hidden sm:block" />
        </div>
      </header>

      {/* Sparkline Trend (Volume) */}
      <div className="h-16 sm:h-24 bg-[#0e171e] shrink-0 border-b border-slate-800 relative z-40">
         <ResponsiveContainer width="100%" height="100%">
           <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 220, bottom: 0 }}>
             <defs>
               <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                 <stop offset="5%" stopColor="#F06C22" stopOpacity={0.4}/>
                 <stop offset="95%" stopColor="#F06C22" stopOpacity={0}/>
               </linearGradient>
             </defs>
             <RechartsTooltip 
               contentStyle={{ backgroundColor: '#0e171e', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '10px', color: '#fff' }} 
               itemStyle={{ color: '#F06C22', fontWeight: 900 }} 
               formatter={(value: any) => [`${value.toLocaleString()} lbs`, "Total Volume"]}
             />
             <Area type="monotone" dataKey="volume" stroke="#F06C22" strokeWidth={2} fillOpacity={1} fill="url(#colorVol)" />
           </AreaChart>
         </ResponsiveContainer>
         <div className="absolute top-2 left-6 sm:left-8 flex flex-col">
           <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Total Volume Trend</span>
         </div>
      </div>

      {/* Grid Container with Sticky logic */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto relative bg-[#0e171e] custom-scrollbar scroll-smooth">
        <table className="border-collapse table-fixed min-w-max w-full">
          <thead>
            <tr className="sticky top-0 z-50">
              {/* Sticky Corner Corner */}
              <th className="sticky left-0 z-50 w-[180px] sm:w-[200px] h-[50px] bg-[#0e171e] border-r border-b border-[#F06C22]/20 px-3 sm:px-4 text-left shadow-md">
                 <div className="flex flex-col">
                    <h3 className="text-[12px] sm:text-[14px] font-black italic uppercase tracking-tighter text-white leading-none">Machine & Setup</h3>
                 </div>
              </th>

              {/* Session Column Headers */}
              {sessions.map((session, idx) => {
                const clientObj = clients.find(c => c.id === clientId);
                const totalRecords = Math.max(clientObj?.sessionCount || 0, sessions.length);
                const globalIndexIdx = sessions.findIndex(sess => sess.id === session.id);
                // sessions are rendered left-to-right from oldest to newest (of the visible batch).
                // Example: total 40, showing 30. The newest session is at idx=29.
                // However, since it is rendered reverse, wait: WorkoutChartGrid reverses sessions.
                // "grid view: left -> right: oldest -> newest"
                // Newest is at index 29 (rightmost).
                // Its original index in the decreasingly sorted array would be 0!
                // Let's just use: (totalRecords - sessions.length) + idx + 1
                // For showing 30, idx 29 -> 40 - 30 + 29 + 1 = 40.
                const sessionNum = (totalRecords - sessions.length) + idx + 1;
                return (
                  <th 
                    key={session.id || idx} 
                    className="w-[84px] h-[50px] bg-slate-800 border-r border-b border-slate-700 px-1 text-center group transition-colors hover:bg-slate-700 relative"
                  >
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <div className="bg-slate-900 border border-slate-700 rounded-md px-2 py-0.5 shadow-sm group-hover:border-[#F06C22]/50 transition-colors">
                        <span className="text-[#F06C22] font-black tabular-nums text-[10px] leading-none">
                          {sessionNum.toString().padStart(2, '0')}
                        </span>
                      </div>
                      <p className="text-[10px] font-bold tracking-tighter text-slate-400 tabular-nums leading-none uppercase">
                        {new Date(parseSessionDate(session.date)).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
                      </p>
                    </div>
                  </th>
                );
              })}
              {/* Fillers to ensure columns span screen if few sessions exist */}
              {Array.from({ length: Math.max(0, 11 - sessions.length) }).map((_, i) => (
                <th key={`empty-h-${i}`} className="w-[84px] h-[50px] bg-[#0e171e]/50 border-r border-b border-slate-700 opacity-20" />
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/50">
            {filteredSortedMachines.map((machine) => {
              const currentSettings = getSetting(machine.id!);
              
              return (
                <tr key={machine.id} className="group hover:bg-slate-800/50 transition-colors h-[48px]">
                  {/* Sticky Machine Name & Settings (The Master Reference) */}
                  <th 
                    onClick={() => setEditingSettings({ machineId: machine.id!, settings: { ...currentSettings } })}
                    className="sticky left-0 z-30 w-[180px] sm:w-[200px] bg-[#0A2E46] border-r border-slate-800 px-2.5 py-1 text-left group-hover:bg-slate-800/80 transition-colors shadow-[2px_0_10px_rgba(0,0,0,0.02)] cursor-pointer hover:border-r-[#F06C22]"
                  >
                    <div className="flex flex-col h-full justify-center space-y-0.5">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                         <span className={cn(
                            "text-[8px] font-black uppercase tracking-tighter leading-none truncate px-1.5 py-0.5 rounded-[4px] border shrink-0 inline-block max-w-[150px] flex items-center justify-between",
                            getMuscleGroupColor(machine.name)
                         )}>
                            <span>{machine.name}</span>
                            {isBig5Machine(machine.name) && (
                              <Star className="w-2.5 h-2.5 ml-1 fill-amber-400 text-amber-500 inline shrink-0" />
                            )}
                         </span>
                         {clientSettings.find(s => s.machineId === machine.id)?.machineNotes?.some(n => n.isImportant) && (
                           <AlertCircle className="w-3 h-3 text-red-500 shrink-0 inline" />
                         )}
                      </div>

                      {/* Settings Component */}
                      <div className="flex flex-wrap gap-x-2 gap-y-0 bg-slate-900/50 px-1 py-0.5 rounded-md border border-slate-700 transition-all group/settings mt-0.5">
                         {clientSettings.find(s => s.machineId === machine.id)?.settings && Object.entries(clientSettings.find(s => s.machineId === machine.id)?.settings || {}).map(([opt, val]) => (
                           <div key={opt} className="flex items-baseline gap-0.5">
                              <span className="text-[7px] font-black uppercase tracking-tighter text-slate-400 group-hover/settings:text-[#F06C22] transition-colors line-clamp-1 truncate max-w-[40px]">
                                {opt}:
                              </span>
                              <span className="text-[9px] font-black text-slate-200 tabular-nums leading-none">
                                {val}
                              </span>
                           </div>
                         ))}
                         {(!currentSettings || Object.keys(currentSettings).length === 0) && (
                            <span className="text-[7px] font-black uppercase text-slate-300 italic">No config</span>
                         )}
                      </div>
                    </div>
                  </th>

                  {/* Weight / Reps History Cells */}
                  {sessions.map((session) => {
                    const log = getLog(machine.id!, session.id!);
                    return (
                      <td key={session.id} className="w-[84px] px-1 border-r border-slate-700 text-center align-middle hover:bg-slate-700/50">
                         {log ? (
                           (log.reps === '0' && log.seconds === '0') ? (
                             <div className="flex items-center justify-center opacity-40 grayscale">
                               <span className="text-[8px] font-black pointer-events-none text-slate-500 tracking-tighter">[SKIPPED]</span>
                             </div>
                           ) : (
                             <div className="flex flex-col items-center justify-center">
                              <div className="flex items-baseline gap-0.5">
                                 <span className="text-[14px] font-black tracking-tighter text-white tabular-nums leading-none">
                                   {log.weight}
                                 </span>
                              </div>
                              <div className="inline-flex items-center gap-0.5 mt-0.5 px-1 py-0.5 bg-slate-800 rounded-[4px]">
                                 <span className={`text-[9px] font-black tabular-nums leading-none ${
                                    log.repQuality === 3 ? 'text-emerald-600' : 
                                    log.repQuality === 2 ? 'text-amber-600' : 
                                    log.repQuality === 1 ? 'text-[#F06C22]' : 
                                    'text-slate-300'
                                 }`}>
                                   {log.repsLeft !== undefined && log.repsRight !== undefined ? (
                                      `${log.repsLeft}L|${log.repsRight}R`
                                    ) : (
                                      log.isStaticHold || log.isTSC || (log.seconds && (!log.reps || parseInt(log.reps) === 0)) ? (log.seconds || '--') : (log.reps || '--')
                                    )}
                                 </span>
                                 <span className="text-[7px] font-black uppercase text-slate-400 tabular-nums">
                                    {log.repsLeft !== undefined && log.repsRight !== undefined ? '' : (log.isStaticHold || log.isTSC || (log.seconds && (!log.reps || parseInt(log.reps) === 0)) ? 's' : 'r')}
                                 </span>
                              </div>
                              {log.totalTimeUnderLoad !== undefined && (
                                <div className="text-[7px] font-bold text-[#F06C22] uppercase tracking-tighter mt-0.5 leading-none">
                                  {log.totalTimeUnderLoad}s {log.averageTimePerRep !== undefined && `(${log.averageTimePerRep}s avg)`}
                                </div>
                              )}
                           </div>
                           )
                         ) : (
                           <div className="flex items-center justify-center opacity-10">
                              <div className="w-1 h-1 rounded-full bg-slate-600" />
                           </div>
                         )}
                      </td>
                    );
                  })}
                  {/* Fillers for empty sessions */}
                  {Array.from({ length: Math.max(0, 11 - sessions.length) }).map((_, i) => (
                    <td key={`empty-c-${i}`} className="w-[84px] bg-[#0e171e]/[0.02]" />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* FOOTER / STATUS BAR */}
      <footer className="h-16 bg-[#0A2E46] border-t-2 border-slate-700 px-8 flex items-center justify-between text-slate-400 text-[10px] font-black uppercase tracking-widest shrink-0">
         <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-[#F06C22]" />
               <span>Live Studio Sync Active</span>
            </div>
            <div className="w-px h-6 bg-slate-800" />
            <span>iPad Native Layout Optimized</span>
         </div>
         <p>© 2026 Imagine Strength Analytics</p>
      </footer>

      {/* SETTINGS EDITOR DIALOG */}
      <MachineSettingsDashboardModal
        editingSettings={editingSettings}
        setEditingSettings={setEditingSettings}
        machines={machines}
        exerciseLogs={exerciseLogs}
        sessions={sessions}
        isSaving={isSaving}
        onSave={handleUpdateSettings}
      />
    </div>
  );
}
