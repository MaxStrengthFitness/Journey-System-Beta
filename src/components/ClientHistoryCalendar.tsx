
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
  Maximize,
  Network
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkoutSession, ExerciseLog, Machine, Trainer, RepQuality, Studio, ClientEvent } from '../types';
import { cn, parseSessionDate, calculateExerciseVolume } from '../lib/utils';
import { OperationType, handleFirestoreError } from '../lib/firestore-errors';
import { useActiveStudio } from '../ActiveStudioContext';

function getTrainerChipStyles(initials: string) {
  if (!initials) return "bg-ink-l2 text-white";
  const colors = [
    "bg-cyan text-white",
    "bg-cta text-white",
    "bg-green text-ink-l1",
    "bg-amber text-white",
    "bg-ink-l2 text-white"
  ];
  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = initials.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

export function ClientHistoryCalendar({ 
  clientId, 
  clientHomeStudioId,
  machines,
  trainers,
  user,
  allLogs = [],
  clientEvents = [],
}: { 
  clientId: string, 
  clientHomeStudioId?: string,
  machines: Machine[],
  trainers: Trainer[],
  user?: any,
  allLogs?: ExerciseLog[],
  clientEvents?: ClientEvent[]
}) {
  const { activeStudioId } = useActiveStudio();
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
    if (!selectedSession || !selectedSession.id || !user) {
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

  const eventsOnDay = (date: Date) => {
    return clientEvents.filter(e => {
      if (!e.date) return false;
      const start = new Date(e.date);
      start.setHours(0,0,0,0);
      const end = e.endDate ? new Date(e.endDate) : start;
      end.setHours(23,59,59,999);
      return date >= start && date <= end;
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
        hostedAtStudioId: activeStudioId || 'unknown',
        clientHomeStudioId: clientHomeStudioId || activeStudioId || 'unknown',
        isCrossTrain: !!(clientHomeStudioId && activeStudioId && clientHomeStudioId !== activeStudioId),
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
             createdAt: new Date().toISOString(),
             studioId: activeStudioId || clientHomeStudioId || '',
             homeStudioId: clientHomeStudioId || activeStudioId || '',
             clientHomeStudioId: clientHomeStudioId || activeStudioId || ''
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
    <div className="flex flex-col h-full bg-bg-l overflow-hidden rounded-[40px] border border-div-l shadow-2xl p-2 sm:p-6 text-ink-l1">
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-cta/10 rounded-2xl flex items-center justify-center border border-cta/20 shadow-sm shrink-0">
              <CalendarIcon className="w-7 h-7 text-cta" />
            </div>
            <div>
              <div className="flex items-center gap-4">
                <h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none shrink-0 font-display">
                  {viewType === 'calendar' ? (viewDate instanceof Date && !isNaN(viewDate.getTime()) ? viewDate.toLocaleString('default', { month: 'long' }) : 'Invalid Date') : 'Client History'}
                </h2>
                {viewType === 'calendar' && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="text-ink-l3 hover:text-ink-l1 hover:bg-slate-100 rounded-2xl h-8 w-8 transition-all">
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleNextMonth} className="text-ink-l3 hover:text-ink-l1 hover:bg-slate-100 rounded-2xl h-8 w-8 transition-all">
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-ink-l3 mt-1">
                {viewType === 'calendar' ? viewDate.getFullYear() : `${sessions.length} Sessions Total`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-full border border-div-l shadow-sm">
               <button
                  onClick={() => setViewType('calendar')}
                  className={cn("px-6 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-all", viewType === 'calendar' ? "bg-cyan text-white shadow-sm" : "text-ink-l3 hover:text-ink-l1")}
               >Calendar View</button>
               <button
                  onClick={() => setViewType('list')}
                  className={cn("px-6 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-all", viewType === 'list' ? "bg-cyan text-white shadow-sm" : "text-ink-l3 hover:text-ink-l1")}
               >List View</button>
            </div>
            <Button 
               onClick={() => setShowManualLog(true)}
               variant="outline" 
               className="border-cta/50 text-cta hover:bg-cta/10 font-black tracking-widest uppercase text-[11px] h-12 rounded-2xl px-6 bg-white"
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
                  <span className="text-xs font-black uppercase tracking-widest text-ink-l3">{d}</span>
                </div>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar pb-6 flex flex-col gap-2">
              {(() => {
                const year = viewDate.getFullYear();
                const month = viewDate.getMonth();
                const firstDay = firstDayOfMonth(year, month);
                const totalDays = daysInMonth(year, month);

                const matrix: (Date | null)[] = [];
                for (let i = 0; i < firstDay; i++) matrix.push(null);
                for (let i = 1; i <= totalDays; i++) matrix.push(new Date(year, month, i));

                // Chunk matrix into weeks (7 days per week)
                const weeks: (Date | null)[][] = [];
                for (let i = 0; i < matrix.length; i += 7) {
                  weeks.push(matrix.slice(i, i + 7));
                }

                return weeks.map((week, wIdx) => {
                  // Determine if this weekly row contains the currently active/selected day, or today as fallback
                  const selectedTimestamp = selectedSession ? parseSessionDate(selectedSession.date) : 0;
                  const selectedDate = selectedTimestamp > 0 ? new Date(selectedTimestamp) : null;
                  const isWeekActive = week.some(date => 
                    date && (
                      (selectedDate && isSameDay(date, selectedDate)) || 
                      (!selectedDate && isSameDay(date, new Date()))
                    )
                  );

                  return (
                    <div 
                      key={`week-${wIdx}`} 
                      className={cn(
                        "grid grid-cols-7 gap-2 p-1 rounded-3xl transition-all duration-200",
                        isWeekActive ? "bg-bg-l-card border border-div-l shadow-sm" : ""
                      )}
                    >
                      {week.map((date, idx) => {
                        if (!date) return <div key={`empty-${wIdx}-${idx}`} className="min-h-[100px]" />;
                        
                        const daySessions = sessionsOnDay(date);
                        const dayEvents = eventsOnDay(date);
                        const timestamp = selectedSession ? parseSessionDate(selectedSession.date) : 0;
                        const isSelected = selectedSession && timestamp > 0 && isSameDay(new Date(timestamp), date);
                        const today = isSameDay(new Date(), date);

                        return (
                          <div 
                            key={`day-${idx}`}
                            onClick={() => {
                              if (daySessions.length > 0) {
                                setSelectedDaySessions(daySessions);
                                setActiveSessionIndex(0);
                              }
                            }}
                            className={cn(
                              "min-h-[100px] p-4 rounded-2xl border transition-all relative group flex flex-col justify-between selection-none",
                              daySessions.length > 0 ? "cursor-pointer hover:bg-slate-50" : "cursor-default",
                              isSelected 
                                ? "bg-bg-dark border-bg-dark text-ink-d1 shadow-md" 
                                : "bg-bg-l-card border-div-l hover:border-div-l/80",
                              today ? "ring-2 ring-green" : "",
                              (dayEvents.some(e => e.type === "Vacation" || e.type === "Medical" || e.type === "Snowbird")) ? "bg-red-50/50 border-red-100" : ""
                            )}
                          >
                            <span className={cn(
                              "text-[18px] font-black leading-none font-sans absolute top-3 left-3 z-10",
                              isSelected ? "text-ink-d1" : "text-ink-l1",
                              (dayEvents.some(e => e.type === "Vacation" || e.type === "Medical" || e.type === "Snowbird")) ? "text-red-500" : ""
                            )}>
                              {date.getDate()}
                            </span>
                            
                            {daySessions.length > 0 && (() => {
                              const s = daySessions[0];
                              const isB = s.routineName?.toUpperCase().includes('B');
                              const isA = s.routineName?.toUpperCase().includes('A');
                              const letter = isB ? 'B' : (isA ? 'A' : '•');
                              const routineBg = isB ? 'bg-cta text-white' : (isA ? 'bg-cyan text-white' : 'bg-ink-l3 text-white');
                              
                              return (
                                <div className={cn(
                                  "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black uppercase absolute top-2.5 right-2.5 shadow-sm",
                                  routineBg
                                )}>
                                  {letter}
                                </div>
                              );
                            })()}

                            {daySessions.length > 0 && (() => {
                              const initials = daySessions[0].trainerInitials || '--';
                              return (
                                <div className={cn(
                                  "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black uppercase absolute bottom-2.5 right-2.5 shadow-sm z-10",
                                  getTrainerChipStyles(initials)
                                )}>
                                  {initials}
                                </div>
                              );
                            })()}

                            {dayEvents.length > 0 && (
                              <div className="absolute bottom-2 left-2 right-12 flex flex-col gap-1 z-10 w-fit max-w-[80%]">
                                {dayEvents.map(e => (
                                  <div key={e.id} className={cn("text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded text-white overflow-hidden text-ellipsis whitespace-nowrap", 
                                    e.type === 'Alert' ? 'bg-amber-500' :
                                    e.type === 'Medical' || e.type === 'Snowbird' || e.type === 'Vacation' ? 'bg-red-500' :
                                    'bg-cyan-500'
                                  )}>
                                    {e.title || e.type}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
                   className="flex items-center gap-3 sm:gap-6 p-4 sm:p-6 rounded-[32px] bg-bg-l-card border border-div-l cursor-pointer hover:border-cta/30 transition-all hover:bg-slate-50 shadow-sm text-ink-l1 relative overflow-hidden flex-wrap sm:flex-nowrap"
                 >
                   {session.isCrossTrain && (
                     <div className="absolute top-0 left-0 bg-cyan text-white text-[11px] sm:text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-br-xl shadow-sm z-10 flex items-center gap-1">
                       <Network className="w-3 h-3" />
                       Cross-Train
                     </div>
                   )}
                   {isLegacy && (
                     <div className="absolute top-0 right-0 bg-cta text-white text-[11px] sm:text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl shadow-sm z-10">
                       Imported
                     </div>
                   )}
                   <div className="flex flex-col items-center justify-center min-w-[80px]">
                      <span className="text-3xl font-black text-ink-l1 font-display">{sDate ? sDate.getDate() : '--'}</span>
                      <span className="text-[11px] font-black uppercase text-ink-l3 tracking-widest">{sDate ? sDate.toLocaleDateString('default', { month: 'short' }) + " '" + sDate.getFullYear().toString().substring(2) : 'Invalid'}</span>
                   </div>
                   
                   <div className={cn("w-12 h-12 shrink-0 rounded-full flex items-center justify-center border border-div-l/50 z-10 font-black", getTrainerChipStyles(session.trainerInitials))}>
                     <span className="text-sm font-black">{session.trainerInitials || 'TR'}</span>
                   </div>

                   <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <span className="text-lg font-black text-ink-l1 uppercase tracking-tighter shrink-0 flex items-center gap-2">
                          <Badge variant="outline" className="text-[11px] font-black text-cyan uppercase tracking-widest border-cyan/30 bg-cyan/10 py-0 leading-tight h-5">S{calculatedSessionNumber}</Badge>
                          {isLegacy ? 'Import Session' : session.startTime && timestamp > 0 ? new Date(session.startTime?.toMillis?.() || session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (sDate ? '12:00 PM' : '--:--')}
                        </span>
                        {daysSincePrev !== null && (
                          <Badge variant="outline" className="text-[11px] font-black text-cyan uppercase tracking-widest border-cyan/30 bg-cyan/10">
                            {daysSincePrev === 1 ? '1 Day Since Last' : `${daysSincePrev} Days Since Last`}
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-[11px] font-bold text-ink-l3 uppercase tracking-widest mt-1 truncate">
                        {session.routineName ? `Routine ${session.routineName}` : (isLegacy ? 'Imported Session' : '')}
                        {(session.routineName || isLegacy) && shorthandMachines ? ' • ' : ''}
                        {shorthandMachines || (!session.routineName && !isLegacy ? 'No Machines Logged' : '')}
                      </p>
                   </div>
                   
                   <div className="flex flex-col items-end justify-center shrink-0 ml-2 sm:ml-4">
                     <span className="text-[11px] sm:text-[11px] font-bold text-ink-l3 uppercase tracking-widest mb-1 text-right font-sans">Total Volume</span>
                     <div className="flex items-baseline gap-1">
                       <span className="text-xl sm:text-2xl font-black text-ink-l1 font-display">{totalVolume.toLocaleString()}</span>
                       <span className="text-[11px] sm:text-[11px] font-bold text-ink-l3 uppercase">lbs</span>
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
        <DialogContent className="max-w-4xl sm:max-w-4xl max-h-[95vh] w-full border border-div-l rounded-2xl bg-bg-l p-0 overflow-hidden shadow-2xl flex flex-col text-ink-l1">
          {selectedSession && (
            <>
              {/* Header Banner */}
              <div className="bg-bg-l-card border-b border-div-l px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 transition-all">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest flex items-center gap-2 font-display">
                    <span className="text-cyan">
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
                  <p className="text-sm font-bold text-ink-l3 uppercase tracking-widest mt-1 flex items-center gap-2">
                     <Badge variant="outline" className="border-div-l text-ink-l2 bg-slate-50">TR: {selectedSession.trainerInitials || 'N/A'}</Badge> 
                     {selectedSessionLogs.length} Units Logged
                  </p>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="bg-bg-l px-4 py-2 rounded-xl border border-div-l flex items-center gap-2 shadow-xs">
                    <span className="text-[11.5px] font-black uppercase text-ink-l3 tracking-widest font-sans">Routine:</span>
                    <span className={cn(
                      "text-xl font-black italic uppercase leading-none font-display",
                      selectedSession.routineName?.toUpperCase().includes('B') ? "text-cta" : "text-cyan"
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
                      className="font-black uppercase tracking-widest h-10 px-6 rounded-xl border-div-l text-ink-l1 bg-white hover:bg-slate-50 transition-all shrink-0 text-[11px] shadow-xs"
                    >
                      Enter Edit Mode
                    </Button>
                  )}
                </div>
              </div>

              {/* Pinned Analytics Header Strip */}
              <div className="bg-bg-l-card border-b border-div-l px-6 py-2.5 flex items-center justify-between sm:justify-start gap-4 flex-wrap shrink-0">
                {/* Routine Chip */}
                <div className="flex items-center gap-2 bg-bg-l border border-div-l rounded-2xl px-3 py-1.5 shadow-xs">
                  <span className="text-[11px] font-black uppercase text-ink-l3 tracking-widest font-sans">Routine:</span>
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black uppercase text-white shadow-xs font-sans",
                    selectedSession.routineName?.toUpperCase().includes('B') 
                      ? "bg-cta" 
                      : (selectedSession.routineName?.toUpperCase().includes('A') 
                        ? "bg-cyan" 
                        : "bg-ink-l3")
                  )}>
                    {selectedSession.routineName?.toUpperCase().includes('B') ? 'B' : (selectedSession.routineName?.toUpperCase().includes('A') ? 'A' : '•')}
                  </div>
                </div>

                {/* Trainer Chip */}
                <div className="flex items-center gap-2 bg-bg-l border border-div-l rounded-2xl px-3 py-1.5 shadow-xs">
                  <span className="text-[11px] font-black uppercase text-ink-l3 tracking-widest font-sans">Trainer:</span>
                  <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black uppercase shadow-xs font-sans", getTrainerChipStyles(selectedSession.trainerInitials || '--'))}>
                    {selectedSession.trainerInitials || '--'}
                  </div>
                </div>

                {/* Session count / logs badge */}
                <div className="flex items-center gap-2 bg-bg-l border border-div-l rounded-2xl px-3 py-1.5 shadow-xs">
                  <span className="text-[11px] font-black uppercase text-ink-l3 tracking-widest font-sans">Units:</span>
                  <span className="text-[11px] font-black uppercase text-ink-l1 font-display bg-slate-100 rounded-md px-1.5 py-0.5 border border-div-l/50">
                    {selectedSessionLogs.length} Checked
                  </span>
                </div>

                {/* Total tonnage volume volume */}
                <div className="flex items-center gap-2 bg-bg-l border border-div-l rounded-2xl px-3 py-1.5 shadow-xs sm:ml-auto">
                  <span className="text-[11px] font-black uppercase text-ink-l3 tracking-widest font-sans">Total Volume:</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-black text-cta font-display">{(() => {
                      const selectedSessionTotalVolume = Math.round(selectedSessionLogs.reduce((acc, log) => acc + calculateExerciseVolume(log), 0));
                      return selectedSessionTotalVolume.toLocaleString();
                    })()}</span>
                    <span className="text-[11px] font-bold text-ink-l3 uppercase font-sans">lbs</span>
                  </div>
                </div>
              </div>

              {/* Multi-Session Tabs if > 1 */}
              {selectedDaySessions.length > 1 && (
                <div className="bg-bg-l border-b border-div-l px-6 py-2 flex gap-2 shrink-0 overflow-x-auto hide-scrollbar">
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
                           "px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all border",
                           activeSessionIndex === i 
                             ? "bg-cyan/10 border-cyan/50 text-cyan" 
                             : "bg-bg-l-card border-div-l text-ink-l3 hover:text-ink-l1"
                         )}
                       >
                          S{sessNum} - {sess.legacy_filemaker_id ? 'Imported' : sess.startTime ? new Date(sess.startTime?.toMillis?.() || sess.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'No Time'}
                       </button>
                     );
                   })}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-bg-l min-h-0">
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
                        
                        let displayBorder = "border-div-l bg-bg-l-card text-ink-l1";
                        if (quality === 3) displayBorder = "border-green bg-green/10 text-ink-l1";
                        else if (quality === 2) displayBorder = "border-amber bg-amber/10 text-ink-l1";
                        else if (quality === 1) displayBorder = "border-cta bg-cta/10 text-ink-l1";

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
                                     <h4 className="text-sm font-black uppercase tracking-tight text-ink-l1 leading-none truncate mb-1 font-display">{machine?.name || 'Unknown'}</h4>
                                     {isStaticHold && <span className="px-1.5 py-0.5 rounded-md bg-cyan/10 text-cyan text-[11px] font-black tracking-widest uppercase">TSC</span>}
                                   </div>
                                   <p className="text-xs font-semibold text-ink-l2">
                                     {currentData.weight || '-'} lbs | {isCardio || isStaticHold ? currentData.seconds : currentData.reps} {isCardio || isStaticHold ? 'sec' : 'reps'}
                                   </p>
                                 </div>
                                  <div className="mt-2 text-[11px] font-black tracking-widest uppercase flex gap-1 items-center">
                                     <span className="text-ink-l3">Quality:</span>
                                     {quality === 1 && <span className="text-cta">Poor</span>}
                                     {quality === 2 && <span className="text-amber">Completed</span>}
                                     {quality === 3 && <span className="text-green">Max Strength</span>}
                                     {quality === 0 && <span className="text-ink-l3">N/A</span>}
                                  </div>
                               </div>
                             ) : (
                               <div className="flex flex-col gap-3">
                                  <div className="flex justify-between items-center bg-slate-100 p-2 rounded-xl">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-ink-l1 leading-none truncate font-display">{machine?.name || 'Unknown'}</h4>
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
                                         className={cn("px-2 py-0.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors",
                                           isStaticHold ? "bg-cyan text-white shadow-xs" : "bg-white border border-div-l text-ink-l3 hover:text-ink-l1"
                                         )}
                                       >
                                         TSC
                                       </button>
                                    )}
                                    {isCardio && <span className="text-[11px] font-bold text-ink-l3 uppercase tracking-widest">Cardio</span>}
                                  </div>

                                  {/* Weight Stepper */}
                                  <div className="bg-bg-l border border-div-l rounded-xl p-1.5 flex items-center justify-between shrink-0">
                                     <button 
                                       onClick={() => handleLogEdit(log.id!, 'weight', Math.max(0, wVal - 2).toString())}
                                       className="w-10 h-10 shrink-0 flex items-center justify-center text-ink-l2 bg-slate-100 rounded-lg hover:bg-slate-200 hover:text-ink-l1 transition-all focus:outline-none"
                                     >
                                       <span className="text-xl font-medium leading-none mb-1">-2</span>
                                     </button>
                                     <div className="flex flex-col items-center flex-1">
                                       <input 
                                         type="number"
                                         value={wVal || ''}
                                         onChange={(e) => handleLogEdit(log.id!, 'weight', (parseFloat(e.target.value) || 0).toString())}
                                         className="w-16 min-w-[4rem] bg-transparent text-center text-xl font-black text-ink-l1 focus:outline-none p-0"
                                       />
                                       <span className="text-[11px] uppercase tracking-widest text-ink-l3 font-bold leading-none mt-0.5 font-sans">Lbs</span>
                                     </div>
                                     <button 
                                       onClick={() => handleLogEdit(log.id!, 'weight', (wVal + 2).toString())}
                                       className="w-10 h-10 shrink-0 flex items-center justify-center text-ink-l2 bg-slate-100 rounded-lg hover:bg-slate-200 hover:text-ink-l1 transition-all focus:outline-none"
                                     >
                                       <span className="text-xl font-medium leading-none mb-1">+2</span>
                                     </button>
                                  </div>

                                  {/* Reps/Time Stepper */}
                                  <div className="bg-bg-l border border-div-l rounded-xl p-1.5 flex items-center justify-between shrink-0">
                                     <button 
                                       onClick={() => handleLogEdit(log.id!, isCardio || isStaticHold ? 'seconds' : 'reps', Math.max(0, rVal - 1).toString())}
                                       className="w-10 h-10 shrink-0 flex items-center justify-center text-ink-l2 bg-slate-100 rounded-lg hover:bg-slate-200 hover:text-ink-l1 transition-all focus:outline-none"
                                     >
                                       <span className="text-xl font-medium leading-none mb-1">-1</span>
                                     </button>
                                     <div className="flex flex-col items-center flex-1">
                                       <input 
                                         type="number"
                                         value={rVal || ''}
                                         onChange={(e) => handleLogEdit(log.id!, isCardio || isStaticHold ? 'seconds' : 'reps', (parseFloat(e.target.value) || 0).toString())}
                                         className="w-16 min-w-[4rem] bg-transparent text-center text-xl font-black text-ink-l1 focus:outline-none p-0"
                                         disabled={isCardio && false} 
                                       />
                                       <span className="text-[11px] uppercase tracking-widest text-ink-l3 font-bold leading-none mt-0.5 font-sans">{isCardio || isStaticHold ? 'Secs' : 'Reps'}</span>
                                     </div>
                                     <button 
                                       onClick={() => handleLogEdit(log.id!, isCardio || isStaticHold ? 'seconds' : 'reps', (rVal + 1).toString())}
                                       className="w-10 h-10 shrink-0 flex items-center justify-center text-ink-l2 bg-slate-100 rounded-lg hover:bg-slate-200 hover:text-ink-l1 transition-all focus:outline-none"
                                     >
                                       <span className="text-xl font-medium leading-none mb-1">+1</span>
                                     </button>
                                  </div>

                                  {/* Quality Bar */}
                                  <div>
                                     <span className="text-[11px] font-black uppercase text-ink-l3 tracking-widest mb-1.5 block px-1 font-sans">Quality Grade</span>
                                     <div className="flex gap-1">
                                        {[
                                          { label: 'Poor', val: 1, activeBg: 'bg-cta/10 text-cta border-cta shadow-xs' },
                                          { label: 'Completed', val: 2, activeBg: 'bg-amber/10 text-amber border-amber shadow-xs' },
                                          { label: 'Max Strength', val: 3, activeBg: 'bg-green/10 text-green border-green shadow-xs' }
                                        ].map(btn => {
                                          const isActive = quality === btn.val;
                                          return (
                                            <button
                                              key={btn.label}
                                              onClick={() => handleLogEdit(log.id!, 'repQuality', btn.val as RepQuality)}
                                              className={cn(
                                                "flex-1 py-2 rounded-lg text-[11px] font-black uppercase tracking-tighter transition-all focus:outline-none border",
                                                isActive ? btn.activeBg : "bg-bg-l border-div-l text-ink-l3 hover:bg-slate-50"
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
                    <div className="mt-8 rounded-2xl bg-bg-l-card border border-div-l p-4 sm:p-6 shadow-xl text-ink-l1">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-8 h-8 rounded-xl bg-cta/10 border border-cta/30 flex items-center justify-center">
                          <span className="text-cta font-black font-sans">N</span>
                        </div>
                        <h3 className="text-sm sm:text-base font-black uppercase tracking-[0.2em] text-ink-l1 font-display">Session Briefings & Notes</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                           <div className="flex justify-between items-center mb-1">
                             <h4 className="text-xs font-black uppercase tracking-widest text-cyan font-sans">Notes Overview</h4>
                           </div>
                           {isEditMode ? (
                             <Textarea
                               value={editedSessionNotes}
                               onChange={(e) => setEditedSessionNotes(e.target.value)}
                               placeholder="Add or update session notes & briefings here..."
                               className="min-h-[140px] bg-slate-900 border-slate-700 border text-white placeholder:text-slate-600 resize-none focus-visible:ring-1 focus-visible:ring-[#F06C22] font-medium text-sm leading-relaxed p-4 rounded-xl shadow-inner"
                             />
                           ) : (
                             <div className="min-h-[140px] bg-bg-l border border-div-l rounded-xl p-4">
                               <p className="whitespace-pre-wrap text-ink-l2 font-medium text-sm leading-relaxed font-sans">
                                 {selectedSession.notes || <span className="text-ink-l4 italic font-sans text-xs">No historical briefings recorded.</span>}
                               </p>
                             </div>
                           )}
                        </div>
                        
                        {/* We could add Post-Session / Client Feel inputs here if needed. 
                            For now, using the combined notes as the primary field for this session edit interface. */}
                        <div className="flex flex-col gap-2">
                           <div className="flex justify-between items-center mb-1">
                             <h4 className="text-cta font-sans font-black uppercase tracking-widest">Client Status / Additional Context</h4>
                             {isEditMode && (
                               <Select defaultValue="Medium">
                                 <SelectTrigger className="w-[100px] h-6 bg-slate-900 border-slate-700 text-[11px] uppercase font-black tracking-widest px-2 py-0 text-slate-400">
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
                             <div className="min-h-[140px] bg-bg-l border border-div-l rounded-xl p-4 flex items-center justify-center font-sans">
                               <span className="text-ink-l4 italic text-sm font-medium font-sans">Context stored in historical notes.</span>
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
        <DialogContent className="max-w-md sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-500" />
              Delete Session?
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium">
              Are you sure you want to permanently delete this session? This action cannot be undone and all associated logs will be lost.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white uppercase font-black tracking-widest text-xs h-12 rounded-xl px-6">Cancel</Button>
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
        <DialogContent className="max-w-md sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <PlusCircle className="w-6 h-6 text-[#F06C22]" />
              Log Past Session
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium">
              Create an empty session backbone to retroactively log exercises.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Session Date</label>
              <Input 
                type="date" 
                value={manualDate} 
                onChange={e => setManualDate(e.target.value)} 
                className="h-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl font-medium px-4"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Assigned Trainer</label>
              <select
                value={manualTrainerId}
                onChange={e => setManualTrainerId(e.target.value)}
                className="w-full h-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl font-medium px-4 focus:ring-1 focus:ring-[#F06C22] outline-none"
              >
                <option value="" disabled>Select Trainer...</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{t.fullName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4 border-t border-slate-200 dark:border-slate-800 pt-6">
            <Button variant="ghost" onClick={() => setShowManualLog(false)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white uppercase font-black tracking-widest text-xs h-12 rounded-xl px-6">Cancel</Button>
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
