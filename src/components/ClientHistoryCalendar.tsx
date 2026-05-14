
import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  writeBatch, 
  doc,
  Timestamp,
  addDoc,
  getDocs,
  limit,
  increment
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  ChevronLeft, 
  ChevronRight, 
  Dumbbell, 
  Calendar as CalendarIcon,
  Save,
  CheckCircle2,
  Clock,
  AlertCircle,
  PlusCircle,
  Trash2,
  Maximize
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkoutSession, ExerciseLog, Machine, Trainer, RepQuality } from '../types';
import { cn, parseSessionDate, calculateExerciseVolume } from '../lib/utils';
import { OperationType, handleFirestoreError } from '../lib/firestore-errors';

export function ClientHistoryCalendar({ 
  clientId, 
  machines,
  trainers,
  user,
  allLogs = []
}: { 
  clientId: string, 
  machines: Machine[],
  trainers: Trainer[],
  user?: any,
  allLogs?: ExerciseLog[]
}) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [localAllLogs, setLocalAllLogs] = useState<ExerciseLog[]>([]);
  const [viewDate, setViewDate] = useState(new Date()); // For month navigation
  const [viewType, setViewType] = useState<'calendar' | 'list'>('calendar');
  const [selectedDaySessions, setSelectedDaySessions] = useState<WorkoutSession[]>([]);
  const [activeSessionIndex, setActiveSessionIndex] = useState(0);
  const [selectedSessionLogs, setSelectedSessionLogs] = useState<ExerciseLog[]>([]);
  const [editedLogs, setEditedLogs] = useState<Record<string, Partial<ExerciseLog>>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const [editedSessionNotes, setEditedSessionNotes] = useState<string>('');
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [showManualLog, setShowManualLog] = useState(false);
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualTrainerId, setManualTrainerId] = useState('');

  const selectedSession = selectedDaySessions[activeSessionIndex] || null;

  // Fetch all sessions for calendar
  useEffect(() => {
    if (!clientId || !user) return;
    const q = query(
      collection(db, 'sessions'),
      where('clientId', '==', clientId),
      orderBy('date', 'desc'),
      limit(30)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkoutSession)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'sessions');
    });
    return () => unsubscribe();
  }, [clientId, user?.uid]);

  // No longer fetching ALL logs here, using allLogs prop or specific session fetches

  // Fetch logs for selected session
  useEffect(() => {
    if (!selectedSession || !user) {
      setSelectedSessionLogs([]);
      setEditedLogs({});
      setIsEditMode(false);
      setEditedSessionNotes('');
      return;
    }
    setEditedSessionNotes(selectedSession.notes || '');
    const q = query(
      collection(db, 'exerciseLogs'),
      where('sessionId', '==', selectedSession.id),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setSelectedSessionLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExerciseLog)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'exerciseLogs');
    });
    return () => unsubscribe();
  }, [selectedSession?.id, user?.uid]);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getFullYear() === d2.getFullYear();
  };

  const sessionsOnDay = (date: Date) => {
    return sessions.filter(s => {
      const timestamp = parseSessionDate(s.date);
      if (timestamp === 0) return false;
      const d = new Date(timestamp);
      return isSameDay(d, date);
    });
  };

  const handleLogEdit = (logId: string, field: keyof ExerciseLog, value: any) => {
    setEditedLogs(prev => ({
      ...prev,
      [logId]: {
        ...prev[logId],
        [field]: value
      }
    }));
  };

  const handleDeleteSession = async () => {
    if (!selectedSession) return;
    setIsDeletingSession(true);
    try {
      const batch = writeBatch(db);
      const sessionRef = doc(db, 'sessions', selectedSession.id!);
      batch.delete(sessionRef);

      // delete logs
      selectedSessionLogs.forEach(log => {
        batch.delete(doc(db, 'exerciseLogs', log.id!));
      });

      // decrement client's session count if completed
      if (selectedSession.status === 'Completed' && clientId) {
        batch.update(doc(db, 'clients', clientId), {
          completedSessions: increment(-1),
          sessionCount: increment(-1)
        });
      }

      await batch.commit();

      if (selectedDaySessions.length <= 1) {
        setSelectedDaySessions([]);
        setActiveSessionIndex(0);
      } else {
        const newSessions = [...selectedDaySessions];
        newSessions.splice(activeSessionIndex, 1);
        setSelectedDaySessions(newSessions);
        setActiveSessionIndex(Math.max(0, activeSessionIndex - 1));
      }
      setShowDeleteConfirm(false);
      setIsEditMode(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'sessions');
    } finally {
      setIsDeletingSession(false);
    }
  };

  const handleCreateManualLog = async () => {
    setIsSaving(true);
    try {
      const qs = query(collection(db, 'sessions'), where('clientId', '==', clientId), orderBy('date', 'desc'), limit(1));
      const res = await getDocs(qs);
      let sessionNumber = 1;
      if (!res.empty) {
        sessionNumber = res.docs[0].data().sessionNumber + 1;
      }
      const trainer = trainers.find(t => t.id === manualTrainerId);
      
      const newSession: WorkoutSession = {
        clientId,
        date: manualDate,
        sessionType: 'Standard',
        startTime: manualDate + 'T12:00:00.000Z',
        endTime: manualDate + 'T12:30:00.000Z',
        trainerInitials: trainer?.initials || 'TR',
        status: 'Completed',
        sessionNumber,
        notes: "Manually inputted past session.",
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'sessions'), newSession);

      // Create empty logs for their top machines to seed
      const recentLogsQ = query(collection(db, 'exerciseLogs'), where('clientId', '==', clientId), orderBy('date', 'desc'), limit(15));
      const recentLogsRes = await getDocs(recentLogsQ);
      const recentMachineIds = Array.from(new Set(recentLogsRes.docs.map(d => d.data().machineId))).slice(0, 5);

      const batch = writeBatch(db);
      recentMachineIds.forEach(mId => {
         const machine = machines.find(m => m.id === mId);
         if (machine) {
           const logRef = doc(collection(db, 'exerciseLogs'));
           const mockLog: ExerciseLog = {
             clientId,
             sessionId: docRef.id,
             machineId: mId,
             weight: '0',
             reps: '0',
             seconds: '0',
             machineSettings: {},
             createdAt: new Date().toISOString()
           };
           batch.set(logRef, mockLog);
         }
      });
      await batch.commit();

      setShowManualLog(false);
      setManualTrainerId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'sessions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchUpdate = async () => {
    if (Object.keys(editedLogs).length === 0 && editedSessionNotes === selectedSession?.notes) {
      setIsEditMode(false);
      return;
    }
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      Object.entries(editedLogs).forEach(([logId, data]) => {
        const logRef = doc(db, 'exerciseLogs', logId);
        batch.update(logRef, {
          ...(data as object),
          updatedAt: Timestamp.now()
        });
      });
      if (selectedSession && editedSessionNotes !== selectedSession.notes) {
        const sessionRef = doc(db, 'sessions', selectedSession.id!);
        batch.update(sessionRef, {
          notes: editedSessionNotes,
          updatedAt: Timestamp.now()
        });
      }
      await batch.commit();
      setEditedLogs({});
      setIsEditMode(false);
      
      // Update local state for immediate feedback
      setSelectedSessionLogs(prev => prev.map(log => {
        if (editedLogs[log.id!]) {
            return { ...log, ...editedLogs[log.id!] };
        }
        return log;
      }));
      
      if (selectedSession) {
         const newSessions = [...selectedDaySessions];
         newSessions[activeSessionIndex] = { ...selectedSession, notes: editedSessionNotes };
         setSelectedDaySessions(newSessions);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'exerciseLogs');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0A2E46] overflow-hidden rounded-[40px] border border-white/10 shadow-2xl p-2 sm:p-6 text-white">
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#F06C22]/10 rounded-2xl flex items-center justify-center border border-[#F06C22]/20 shadow-[0_0_15px_rgba(240,108,34,0.1)] shrink-0">
              <CalendarIcon className="w-7 h-7 text-[#F06C22]" />
            </div>
            <div>
              <div className="flex items-center gap-4">
                <h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none shrink-0">
                  {viewType === 'calendar' ? (viewDate instanceof Date && !isNaN(viewDate.getTime()) ? viewDate.toLocaleString('default', { month: 'long' }) : 'Invalid Date') : 'Client History'}
                </h2>
                {viewType === 'calendar' && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="text-[#68717A] hover:text-white hover:bg-white/10 rounded-2xl h-8 w-8 transition-all">
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleNextMonth} className="text-[#68717A] hover:text-white hover:bg-white/10 rounded-2xl h-8 w-8 transition-all">
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#68717A] mt-1">
                {viewType === 'calendar' ? viewDate.getFullYear() : `${sessions.length} Sessions Total`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-800 p-1 rounded-full border border-slate-700 shadow-sm">
               <button
                  onClick={() => setViewType('calendar')}
                  className={cn("px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all", viewType === 'calendar' ? "bg-[#38BDF8] text-white shadow-sm" : "text-slate-400 hover:text-white")}
               >Calendar View</button>
               <button
                  onClick={() => setViewType('list')}
                  className={cn("px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all", viewType === 'list' ? "bg-[#38BDF8] text-white shadow-sm" : "text-slate-400 hover:text-white")}
               >List View</button>
            </div>
            <Button 
               onClick={() => setShowManualLog(true)}
               variant="outline" 
               className="border-[#F06C22]/50 text-[#F06C22] hover:bg-[#F06C22]/10 font-black tracking-widest uppercase text-[10px] h-12 rounded-2xl px-6"
             >
               <PlusCircle className="w-4 h-4 mr-2" /> Log Past Session
            </Button>
          </div>
        </div>

        {viewType === 'calendar' ? (
          <>
            <div className="grid grid-cols-7 gap-2 mb-2 shrink-0">
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                <div key={d} className="text-center pb-2">
                  <span className="text-xs font-black uppercase tracking-widest text-[#68717A]">{d}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2 flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar pb-6">
              {(() => {
                const year = viewDate.getFullYear();
                const month = viewDate.getMonth();
                const firstDay = firstDayOfMonth(year, month);
                const totalDays = daysInMonth(year, month);

                const matrix: (Date | null)[] = [];
                for (let i = 0; i < firstDay; i++) matrix.push(null);
                for (let i = 1; i <= totalDays; i++) matrix.push(new Date(year, month, i));

                return matrix.map((date, idx) => {
                if (!date) return <div key={`empty-${idx}`} className="min-h-[100px]" />;
                
                const daySessions = sessionsOnDay(date);
                const timestamp = selectedSession ? parseSessionDate(selectedSession.date) : 0;
                const isSelected = selectedSession && timestamp > 0 && isSameDay(new Date(timestamp), date);
                const today = isSameDay(new Date(), date);

                return (
                  <div 
                    key={idx}
                    onClick={() => {
                      if (daySessions.length > 0) {
                        setSelectedDaySessions(daySessions);
                        setActiveSessionIndex(0);
                      }
                    }}
                    className={cn(
                      "min-h-[100px] p-4 rounded-3xl border transition-all relative group flex flex-col items-center justify-between",
                      daySessions.length > 0 ? "cursor-pointer hover:border-white/30" : "cursor-default",
                      isSelected ? "bg-[#F06C22]/10 border-[#F06C22] shadow-[0_0_30px_rgba(240,108,34,0.15)]" : "bg-white/[0.02] border-white/5 hover:border-white/10",
                      today && !isSelected && "bg-[#115E8D]/10 border-[#115E8D]/30"
                    )}
                  >
                    <span className={cn(
                      "text-xl font-black leading-none",
                      isSelected ? "text-[#F06C22]" : today ? "text-[#38BDF8]" : daySessions.length > 0 ? "text-white" : "text-white/20"
                    )}>
                      {date.getDate()}
                    </span>
                    
                    <div className="flex flex-col gap-1 w-full mt-auto">
                      {daySessions.map((s, sIdx) => (
                        <div 
                          key={s.id || sIdx} 
                          className={cn(
                            "h-6 rounded-xl px-2 flex items-center justify-between border shadow-sm",
                            s.routineName?.toUpperCase().includes('B') 
                              ? "bg-[#F06C22]/20 border-[#F06C22]/30 text-[#F06C22]" 
                              : (s.routineName?.toUpperCase().includes('A') 
                                ? "bg-[#115E8D]/20 border-[#115E8D]/30 text-[#38BDF8]"
                                : (s.trainerId === 'legacy-trainer' || s.trainerInitials === 'Legacy' || s.trainerInitials === 'Chart'
                                  ? "bg-slate-700/50 border-[#F06C22]/30 text-[#F06C22]/70"
                                  : "bg-slate-700/30 border-slate-700 text-slate-500"))
                          )}
                        >
                          <span className="text-[10px] font-black italic">
                            {s.routineName?.toUpperCase().includes('B') 
                              ? 'B' 
                              : (s.routineName?.toUpperCase().includes('A') 
                                ? 'A' 
                                : (s.trainerId === 'legacy-trainer' || s.trainerInitials === 'Legacy' || s.trainerInitials === 'Chart' ? 'I' : '•'))}
                          </span>
                          <span className="text-[9px] font-bold opacity-80">{s.trainerInitials || '--'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
              })()}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 custom-scrollbar flex flex-col gap-4">
            {sessions.map((session, index, arr) => {
               const timestamp = parseSessionDate(session.date);
               const sDate = timestamp > 0 ? new Date(timestamp) : null;
               const completedSessions = arr.filter(s => s.status === 'Completed');
               const completedIndex = completedSessions.findIndex(s => s.id === session.id);
               const calculatedSessionNumber = completedIndex >= 0 ? completedSessions.length - completedIndex : '?';
               
               // Calculate days since previous session (which is the next item in the reverse-chronological array)
               let daysSincePrev = null;
               if (index < arr.length - 1) {
                 const prevTimestamp = parseSessionDate(arr[index + 1].date);
                 if (timestamp > 0 && prevTimestamp > 0) {
                   daysSincePrev = Math.round((timestamp - prevTimestamp) / (1000 * 60 * 60 * 24));
                 }
               }
               
               const isLegacy = session.legacy_filemaker_id || session.trainerId === 'legacy-trainer' || session.trainerInitials === 'Legacy' || session.trainerInitials === 'Chart';

               const sessionLogs = (allLogs || localAllLogs).filter(l => l.sessionId === session.id);
               const totalVolume = Math.round(sessionLogs.reduce((acc, log) => acc + calculateExerciseVolume(log), 0));
               const machineNames = sessionLogs.map(l => {
                 const m = machines.find(mac => mac.id === l.machineId);
                 return m?.name || 'Unknown';
               }).filter(Boolean);
               const shorthandMachines = machineNames.length > 0 ? machineNames.filter(n => n !== 'Unknown').join(', ') : '';

               return (
                 <div
                   key={session.id}
                   onClick={() => {
                     setSelectedDaySessions([session]);
                     setActiveSessionIndex(0);
                   }}
                   className="flex items-center gap-3 sm:gap-6 p-4 sm:p-6 rounded-[32px] bg-slate-800 border border-slate-700 cursor-pointer hover:border-white/30 transition-all hover:bg-slate-800/80 relative overflow-hidden flex-wrap sm:flex-nowrap"
                 >
                   {isLegacy && (
                     <div className="absolute top-0 right-0 bg-[#F06C22] text-white text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl shadow-sm z-10">
                       Imported
                     </div>
                   )}
                   <div className="flex flex-col items-center justify-center min-w-[80px]">
                      <span className="text-3xl font-black text-white">{sDate ? sDate.getDate() : '--'}</span>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{sDate ? sDate.toLocaleDateString('default', { month: 'short' }) + " '" + sDate.getFullYear().toString().substring(2) : 'Invalid'}</span>
                   </div>
                   
                   <div className="w-12 h-12 shrink-0 bg-slate-900 rounded-full flex items-center justify-center border border-slate-700 z-10">
                     <span className="text-sm font-black text-slate-300">{session.trainerInitials || 'TR'}</span>
                   </div>

                   <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <span className="text-lg font-black text-white uppercase tracking-tighter shrink-0 flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px] font-black text-[#38BDF8] uppercase tracking-widest border-[#38BDF8]/30 bg-[#38BDF8]/10 py-0 leading-tight h-5">S{calculatedSessionNumber}</Badge>
                          {isLegacy ? 'Import Session' : session.startTime && timestamp > 0 ? new Date(session.startTime?.toMillis?.() || session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (sDate ? '12:00 PM' : '--:--')}
                        </span>
                        {daysSincePrev !== null && (
                          <Badge variant="outline" className="text-[9px] font-black text-[#38BDF8] uppercase tracking-widest border-[#38BDF8]/30 bg-[#38BDF8]/10">
                            {daysSincePrev === 1 ? '1 Day Since Last' : `${daysSincePrev} Days Since Last`}
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">
                        {session.routineName ? `Routine ${session.routineName}` : (isLegacy ? 'Imported Session' : '')}
                        {(session.routineName || isLegacy) && shorthandMachines ? ' • ' : ''}
                        {shorthandMachines || (!session.routineName && !isLegacy ? 'No Machines Logged' : '')}
                      </p>
                   </div>
                   
                   <div className="flex flex-col items-end justify-center shrink-0 ml-2 sm:ml-4">
                     <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 text-right">Total Volume</span>
                     <div className="flex items-baseline gap-1">
                       <span className="text-xl sm:text-2xl font-black text-white">{totalVolume.toLocaleString()}</span>
                       <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">lbs</span>
                     </div>
                   </div>
                 </div>
               );
            })}
          </div>
        )}

      <Dialog open={!!selectedSession} onOpenChange={(open) => {
        if (!open) {
          setSelectedDaySessions([]);
          setActiveSessionIndex(0);
          setIsEditMode(false);
          setEditedLogs({});
        }
      }}>
        <DialogContent className="max-w-4xl sm:max-w-4xl max-h-[95vh] w-full border border-slate-700 rounded-2xl bg-[#0A2E46] p-0 overflow-hidden shadow-2xl flex flex-col">
          {selectedSession && (
            <>
              {/* Header Banner */}
              <div className="bg-slate-900 border-b border-slate-700 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 transition-all">
                <div>
                  <h2 className="text-xl font-black uppercase text-white tracking-widest flex items-center gap-2">
                    <span className="text-[#38BDF8]">
                      {(() => {
                        if (!selectedSession) return '';
                        const timestamp = parseSessionDate(selectedSession.date);
                        if (timestamp > 0) {
                          return new Date(timestamp).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                        }
                        return 'Invalid Date';
                      })()}
                    </span>
                  </h2>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                     <Badge variant="outline" className="border-slate-700 text-slate-300">TR: {selectedSession.trainerInitials || 'N/A'}</Badge> 
                     {selectedSessionLogs.length} Units Logged
                  </p>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-slate-500 tracking-widest">Routine:</span>
                    <span className={cn(
                      "text-xl font-black italic uppercase leading-none",
                      selectedSession.routineName?.includes('B') ? "text-[#F06C22]" : "text-[#38BDF8]"
                    )}>
                      {selectedSession.routineName || 'Special'}
                    </span>
                  </div>
                  {isEditMode && (
                    <Button
                      variant="ghost" 
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-red-500/50 hover:text-red-500 hover:bg-red-500/10 h-10 w-10 p-0 rounded-xl transition-all shrink-0"
                      title="Delete Session"
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  )}
                  {!isEditMode && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditedSessionNotes(selectedSession.notes || '');
                        setIsEditMode(true);
                      }}
                      className="font-black uppercase tracking-widest h-10 px-6 rounded-xl border-white/20 text-white bg-white/10 hover:bg-white/20 transition-all shrink-0"
                    >
                      Enter Edit Mode
                    </Button>
                  )}
                </div>
              </div>

              {/* Multi-Session Tabs if > 1 */}
              {selectedDaySessions.length > 1 && (
                <div className="bg-[#0A2E46]/90 border-b border-slate-700 px-6 py-2 flex gap-2 shrink-0 overflow-x-auto hide-scrollbar">
                   {selectedDaySessions.map((sess, i) => {
                     const globalIdx = sessions.findIndex(s => s.id === sess.id);
                     const sessNum = globalIdx >= 0 ? sessions.length - globalIdx : '?';
                     return (
                       <button
                         key={sess.id}
                         onClick={() => {
                            setActiveSessionIndex(i);
                            setIsEditMode(false);
                         }}
                         className={cn(
                           "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border",
                           activeSessionIndex === i 
                             ? "bg-[#38BDF8]/20 border-[#38BDF8]/50 text-[#38BDF8]" 
                             : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                         )}
                       >
                          S{sessNum} - {sess.legacy_filemaker_id ? 'Imported' : sess.startTime ? new Date(sess.startTime?.toMillis?.() || sess.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'No Time'}
                       </button>
                     );
                   })}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#0A2E46] min-h-0">
                {selectedSessionLogs.length > 0 ? (
                  <div className="max-w-7xl mx-auto space-y-6 pb-6">
                    {/* Machine Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {selectedSessionLogs.map((log) => {
                        const machine = machines.find(m => m.id === log.machineId);
                        const isEdited = !!editedLogs[log.id!];
                        const currentData = { ...log, ...editedLogs[log.id!] };
                        const rawQuality = currentData.repQuality || 0;
                        // Tiered Fallback: Normalize 1-3, map legacy > 3 or odd values to 2 (Completed)
                        const quality = (rawQuality === 1 || rawQuality === 2 || rawQuality === 3) 
                          ? rawQuality 
                          : (rawQuality > 0 ? 2 : 0);
                        
                        let displayBorder = "border-slate-700 bg-slate-800";
                        if (quality === 3) displayBorder = "border-emerald-500 bg-emerald-500/10";
                        else if (quality === 2) displayBorder = "border-amber-500 bg-amber-500/10";
                        else if (quality === 1) displayBorder = "border-rose-500 bg-rose-500/10";

                        const isCardio = machine?.name.toLowerCase().includes('cardio') || log.type === 'Cardio';
                        const isStaticHold = Boolean(currentData.isStaticHold);
                        const displayMetricType = isCardio ? 'Cardio' : (isStaticHold ? 'TSC' : 'Strength');
                        
                        const wVal = parseFloat(String(currentData.weight || '').replace(/[^0-9.]/g, '')) || 0;
                        const rVal = isCardio || isStaticHold ? (parseFloat(String(currentData.seconds || '').replace(/[^0-9.]/g, '')) || 0) : (parseFloat(String(currentData.reps || '').replace(/[^0-9.]/g, '')) || 0);

                        return (
                          <div 
                            key={log.id} 
                            className={cn(
                              "flex flex-col p-3 rounded-2xl border-2 transition-all",
                              displayBorder,
                              isEdited && isEditMode ? "shadow-[0_0_15px_rgba(56,189,248,0.2)]" : ""
                            )}
                          >
                             {!isEditMode ? (
                               <div className="flex flex-col h-full justify-between">
                                 <div>
                                   <div className="flex justify-between items-start gap-2">
                                     <h4 className="text-sm font-black uppercase tracking-tight text-white leading-none truncate mb-1">{machine?.name || 'Unknown'}</h4>
                                     {isStaticHold && <span className="px-1.5 py-0.5 rounded-md bg-[#38BDF8]/20 text-[#38BDF8] text-[8px] font-black tracking-widest uppercase">TSC</span>}
                                   </div>
                                   <p className="text-xs font-bold text-slate-400">
                                     {currentData.weight || '-'} lbs | {isCardio || isStaticHold ? currentData.seconds : currentData.reps} {isCardio || isStaticHold ? 'sec' : 'reps'}
                                   </p>
                                 </div>
                                  <div className="mt-2 text-[10px] font-black tracking-widest uppercase flex gap-1 items-center">
                                     <span className="text-[#68717A]">Quality:</span>
                                     {quality === 1 && <span className="text-rose-500">Bad</span>}
                                     {quality === 2 && <span className="text-amber-500">Completed</span>}
                                     {quality === 3 && <span className="text-emerald-500">Good</span>}
                                     {quality === 0 && <span className="text-slate-600">N/A</span>}
                                  </div>
                               </div>
                             ) : (
                               <div className="flex flex-col gap-3">
                                  <div className="flex justify-between items-center bg-slate-900/50 p-2 rounded-xl">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-white leading-none truncate">{machine?.name || 'Unknown'}</h4>
                                    {!isCardio && (
                                       <button
                                         onClick={() => {
                                           const newIsHold = !isStaticHold;
                                           handleLogEdit(log.id!, 'isStaticHold', newIsHold);
                                           if (newIsHold) {
                                             handleLogEdit(log.id!, 'seconds', currentData.reps || "0");
                                             handleLogEdit(log.id!, 'reps', "0");
                                           } else {
                                             handleLogEdit(log.id!, 'reps', currentData.seconds || "0");
                                             handleLogEdit(log.id!, 'seconds', "0");
                                           }
                                         }}
                                         className={cn("px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors",
                                           isStaticHold ? "bg-[#38BDF8] text-white" : "bg-slate-800 text-slate-500 hover:text-white"
                                         )}
                                       >
                                         TSC
                                       </button>
                                    )}
                                    {isCardio && <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cardio</span>}
                                  </div>

                                  {/* Weight Stepper */}
                                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-1.5 flex items-center justify-between shrink-0">
                                     <button 
                                       onClick={() => handleLogEdit(log.id!, 'weight', Math.max(0, wVal - 2).toString())}
                                       className="w-10 h-10 shrink-0 flex items-center justify-center text-slate-400 bg-slate-800 rounded-lg hover:bg-slate-700 hover:text-white transition-all focus:outline-none"
                                     >
                                       <span className="text-xl font-medium leading-none mb-1">-2</span>
                                     </button>
                                     <div className="flex flex-col items-center flex-1">
                                       <input 
                                         type="number"
                                         value={wVal || ''}
                                         onChange={(e) => handleLogEdit(log.id!, 'weight', (parseFloat(e.target.value) || 0).toString())}
                                         className="w-16 min-w-[4rem] bg-transparent text-center text-xl font-black text-white focus:outline-none p-0"
                                       />
                                       <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold leading-none mt-0.5">Lbs</span>
                                     </div>
                                     <button 
                                       onClick={() => handleLogEdit(log.id!, 'weight', (wVal + 2).toString())}
                                       className="w-10 h-10 shrink-0 flex items-center justify-center text-slate-400 bg-slate-800 rounded-lg hover:bg-slate-700 hover:text-white transition-all focus:outline-none"
                                     >
                                       <span className="text-xl font-medium leading-none mb-1">+2</span>
                                     </button>
                                  </div>

                                  {/* Reps/Time Stepper */}
                                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-1.5 flex items-center justify-between shrink-0">
                                     <button 
                                       onClick={() => handleLogEdit(log.id!, isCardio || isStaticHold ? 'seconds' : 'reps', Math.max(0, rVal - 1).toString())}
                                       className="w-10 h-10 shrink-0 flex items-center justify-center text-slate-400 bg-slate-800 rounded-lg hover:bg-slate-700 hover:text-white transition-all focus:outline-none"
                                     >
                                       <span className="text-xl font-medium leading-none mb-1">-1</span>
                                     </button>
                                     <div className="flex flex-col items-center flex-1">
                                       <input 
                                         type="number"
                                         value={rVal || ''}
                                         onChange={(e) => handleLogEdit(log.id!, isCardio || isStaticHold ? 'seconds' : 'reps', (parseFloat(e.target.value) || 0).toString())}
                                         className="w-16 min-w-[4rem] bg-transparent text-center text-xl font-black text-white focus:outline-none p-0"
                                         disabled={isCardio && false} 
                                       />
                                       <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold leading-none mt-0.5">{isCardio || isStaticHold ? 'Secs' : 'Reps'}</span>
                                     </div>
                                     <button 
                                       onClick={() => handleLogEdit(log.id!, isCardio || isStaticHold ? 'seconds' : 'reps', (rVal + 1).toString())}
                                       className="w-10 h-10 shrink-0 flex items-center justify-center text-slate-400 bg-slate-800 rounded-lg hover:bg-slate-700 hover:text-white transition-all focus:outline-none"
                                     >
                                       <span className="text-xl font-medium leading-none mb-1">+1</span>
                                     </button>
                                  </div>

                                  {/* Quality Bar */}
                                  <div>
                                     <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1.5 block px-1">Quality Grade</span>
                                     <div className="flex gap-1">
                                        {[
                                          { label: 'Bad', val: 1, activeBg: 'bg-rose-500/20 text-rose-500 border-rose-500' },
                                          { label: 'Completed', val: 2, activeBg: 'bg-amber-500/20 text-amber-500 border-amber-500' },
                                          { label: 'Good', val: 3, activeBg: 'bg-emerald-500/20 text-emerald-500 border-emerald-500' }
                                        ].map(btn => {
                                          const isActive = quality === btn.val;
                                          return (
                                            <button
                                              key={btn.label}
                                              onClick={() => handleLogEdit(log.id!, 'repQuality', btn.val as RepQuality)}
                                              className={cn(
                                                "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all focus:outline-none border",
                                                isActive ? btn.activeBg : "bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800"
                                              )}
                                            >
                                              {btn.label}
                                            </button>
                                          );
                                        })}
                                     </div>
                                  </div>
                               </div>
                             )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Integrated Session Briefings */}
                    <div className="mt-8 rounded-2xl bg-slate-800/80 border border-slate-700 p-4 sm:p-6 shadow-xl">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-8 h-8 rounded-xl bg-[#F06C22]/20 border border-[#F06C22]/30 flex items-center justify-center">
                          <span className="text-[#F06C22] font-black">N</span>
                        </div>
                        <h3 className="text-sm sm:text-base font-black uppercase tracking-[0.2em] text-[#F8F9FA]">Session Briefings & Notes</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                           <div className="flex justify-between items-center mb-1">
                             <h4 className="text-xs font-black uppercase tracking-widest text-[#38BDF8]">Notes Overview</h4>
                           </div>
                           {isEditMode ? (
                             <Textarea
                               value={editedSessionNotes}
                               onChange={(e) => setEditedSessionNotes(e.target.value)}
                               placeholder="Add or update session notes & briefings here..."
                               className="min-h-[140px] bg-slate-900 border-slate-700 border text-white placeholder:text-slate-600 resize-none focus-visible:ring-1 focus-visible:ring-[#F06C22] font-medium text-sm leading-relaxed p-4 rounded-xl shadow-inner"
                             />
                           ) : (
                             <div className="min-h-[140px] bg-slate-900 border border-slate-700 rounded-xl p-4">
                               <p className="whitespace-pre-wrap text-slate-300 font-medium text-sm leading-relaxed">
                                 {selectedSession.notes || <span className="text-slate-600 italic">No historical briefings recorded.</span>}
                               </p>
                             </div>
                           )}
                        </div>
                        
                        {/* We could add Post-Session / Client Feel inputs here if needed. 
                            For now, using the combined notes as the primary field for this session edit interface. */}
                        <div className="flex flex-col gap-2">
                           <div className="flex justify-between items-center mb-1">
                             <h4 className="text-xs font-black uppercase tracking-widest text-[#F06C22]">Client Status / Additional Context</h4>
                             {isEditMode && (
                               <Select defaultValue="Medium">
                                 <SelectTrigger className="w-[100px] h-6 bg-slate-900 border-slate-700 text-[10px] uppercase font-black tracking-widest px-2 py-0 text-slate-400">
                                   <SelectValue placeholder="Priority" />
                                 </SelectTrigger>
                                 <SelectContent className="bg-slate-800 border-slate-700">
                                   <SelectItem value="High" className="text-rose-400 text-xs font-bold">High</SelectItem>
                                   <SelectItem value="Medium" className="text-amber-400 text-xs font-bold">Medium</SelectItem>
                                   <SelectItem value="Low" className="text-emerald-400 text-xs font-bold">Low</SelectItem>
                                 </SelectContent>
                               </Select>
                             )}
                           </div>
                           {isEditMode ? (
                             <Textarea
                               placeholder="Add client feel, post-session debrief..."
                               className="min-h-[140px] bg-slate-900 border-slate-700 border text-white placeholder:text-slate-600 resize-none focus-visible:ring-1 focus-visible:ring-[#F06C22] font-medium text-sm leading-relaxed p-4 rounded-xl shadow-inner"
                             />
                           ) : (
                             <div className="min-h-[140px] bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center justify-center">
                               <span className="text-slate-600 italic text-sm font-medium">Context stored in historical notes.</span>
                             </div>
                           )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 opacity-30 text-center gap-6 h-full">
                    <Clock className="w-16 h-16 text-white" />
                    <p className="text-lg font-black uppercase tracking-widest text-[#68717A]">No exercise logs found for this session</p>
                  </div>
                )}
              </div>
              
              {/* Fixed Footer for Save Button */}
              {isEditMode && (
                <div className="shrink-0 p-4 bg-slate-900 border-t border-slate-700 mt-auto flex justify-end">
                  <Button 
                    onClick={handleBatchUpdate}
                    disabled={isSaving}
                    className="w-full sm:w-auto bg-[#F06C22] hover:bg-[#d95d18] text-white font-black uppercase tracking-widest h-14 px-12 rounded-xl shadow-[0_4px_20px_rgba(240,108,34,0.3)] text-lg"
                  >
                    {isSaving ? "Saving..." : "[ SAVE HISTORICAL CHANGES ]"}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-md sm:max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-500" />
              Delete Session?
            </DialogTitle>
            <DialogDescription className="text-slate-400 font-medium">
              Are you sure you want to permanently delete this session? This action cannot be undone and all associated logs will be lost.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} className="text-slate-400 hover:text-white uppercase font-black tracking-widest text-xs h-12 rounded-xl px-6">Cancel</Button>
            <Button 
              onClick={handleDeleteSession} 
              disabled={isDeletingSession}
              className="bg-red-500 hover:bg-red-600 text-white uppercase font-black tracking-widest text-xs h-12 rounded-xl px-6 transition-all"
            >
              {isDeletingSession ? "Deleting..." : "Permanently Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Session Log Dialog */}
      <Dialog open={showManualLog} onOpenChange={setShowManualLog}>
        <DialogContent className="max-w-md sm:max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <PlusCircle className="w-6 h-6 text-[#F06C22]" />
              Log Past Session
            </DialogTitle>
            <DialogDescription className="text-slate-400 font-medium">
              Create an empty session backbone to retroactively log exercises.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Session Date</label>
              <Input 
                type="date" 
                value={manualDate} 
                onChange={e => setManualDate(e.target.value)} 
                className="h-12 bg-slate-800 border-slate-700 text-white rounded-xl font-medium"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Assigned Trainer</label>
              <select
                value={manualTrainerId}
                onChange={e => setManualTrainerId(e.target.value)}
                className="w-full h-12 bg-slate-800 border-slate-700 text-white rounded-xl font-medium px-4 focus:ring-1 focus:ring-[#F06C22] outline-none"
              >
                <option value="" disabled>Select Trainer...</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id}>{t.fullName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4 border-t border-slate-800 pt-6">
            <Button variant="ghost" onClick={() => setShowManualLog(false)} className="text-slate-400 hover:text-white uppercase font-black tracking-widest text-xs h-12 rounded-xl px-6">Cancel</Button>
            <Button 
              onClick={handleCreateManualLog} 
              disabled={isSaving || !manualDate || !manualTrainerId}
              className="bg-[#F06C22] hover:bg-[#d95d18] text-white uppercase font-black tracking-widest text-xs h-12 rounded-xl px-6 transition-all"
            >
              {isSaving ? "Creating..." : "Create Backbone"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
