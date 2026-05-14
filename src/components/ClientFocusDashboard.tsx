import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Plus, 
  CheckCircle2, 
  Trash2, 
  AlertCircle, 
  Layout, 
  Timer, 
  Orbit, 
  Target,
  ChevronRight,
  Clock,
  History,
  Calendar,
  MessageSquare,
  MoreVertical,
  Edit2,
  X,
  Crosshair
} from 'lucide-react';
import { FocusRecord, FocusCategory, FocusStatus, Client, Trainer, Machine } from '../types';
import { cn } from "../lib/utils";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

const CATEGORY_DEFINITIONS: Record<FocusCategory, { 
  icon: any, 
  color: string, 
  bg: string, 
  border: string,
  description: string,
  helper: string
}> = {
  Posture: { 
    icon: Layout, 
    color: "text-blue-400", 
    bg: "bg-blue-500/10", 
    border: "border-blue-500/20",
    description: "Rigid midsection and stable setup to prevent energy leaks and ensure precise loading.",
    helper: "Chest up? Posterior pelvic tilt? No momentum?"
  },
  Pace: { 
    icon: Timer, 
    color: "text-amber-400", 
    bg: "bg-amber-500/10", 
    border: "border-amber-500/20",
    description: "Smooth, continuous 6-to-10-second speed. No resting at turnarounds.",
    helper: "Constant tension. No 'clunking' at the end of the range."
  },
  Path: { 
    icon: Orbit, 
    color: "text-purple-400", 
    bg: "bg-purple-500/10", 
    border: "border-purple-500/20",
    description: "Maintaining limbs in the exact prescribed plane to force target muscle work.",
    helper: "Straight lines. No shifting load to fresh muscles."
  },
  Purpose: { 
    icon: Target, 
    color: "text-[#F06C22]", 
    bg: "bg-[#F06C22]/10", 
    border: "border-[#F06C22]/20",
    description: "Internal focus. Creating maximum tension by moving through resistance.",
    helper: "Mind-muscle connection. Intentional squeezing."
  }
};

interface ClientFocusDashboardProps {
  client: Client;
  trainer: Trainer;
  machines: Machine[];
}

export function ClientFocusDashboard({ client, trainer, machines }: ClientFocusDashboardProps) {
  const [focuses, setFocuses] = useState<FocusRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newFocus, setNewFocus] = useState<Partial<FocusRecord>>({
    category: 'Posture',
    targetMachineId: '',
    clinicalNotes: '',
  });

  useEffect(() => {
    if (!client.id) return;
    const q = query(
      collection(db, 'focusRecords'),
      where('clientId', '==', client.id),
      orderBy('dateAssigned', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FocusRecord[];
      setFocuses(data);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `focusRecords/${client.id}`);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [client.id]);

  const handleAddFocus = async () => {
    if (!newFocus.category || !newFocus.clinicalNotes) return;

    try {
      await addDoc(collection(db, 'focusRecords'), {
        clientId: client.id,
        category: newFocus.category,
        targetMachineId: newFocus.targetMachineId || null,
        clinicalNotes: newFocus.clinicalNotes,
        status: 'Active',
        assignedBy: trainer.initials,
        trainerId: trainer.id,
        dateAssigned: serverTimestamp()
      });
      setIsAdding(false);
      setNewFocus({ category: 'Posture', targetMachineId: '', clinicalNotes: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'focusRecords');
    }
  };

  const handleStatusUpdate = async (id: string, isAchieved: boolean) => {
    try {
      await updateDoc(doc(db, 'focusRecords', id), {
        status: isAchieved ? 'Achieved' : 'Active',
        dateUpdated: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `focusRecords/${id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0A2E46]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F06C22]" />
      </div>
    );
  }

  const activeFocuses = focuses.filter(f => f.status === 'Active');
  const historyFocuses = focuses.filter(f => f.status === 'Achieved');

  return (
    <div className="flex flex-col h-full bg-[#0A2E46] p-4 text-slate-200 overflow-hidden">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-6 shrink-0">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-[#F06C22]" />
              Client Focus Dashboard
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">MSF Clinical Continuity Protocol</p>
          </div>
          
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-[#F06C22] hover:bg-[#F06C22]/90 text-white px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 shadow-lg shadow-orange-950/20"
          >
            <Plus className="w-4 h-4" />
            Assign New Focus
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Active Missions */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-4 shrink-0">
              <AlertCircle className="w-4 h-4 text-[#F06C22]" />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-100">Live Focus Missions</h3>
              <span className="ml-auto bg-[#F06C22]/20 text-[#F06C22] text-[10px] px-2 py-0.5 rounded-full font-bold">{activeFocuses.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
              {activeFocuses.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-3xl p-8 text-center bg-slate-900/30">
                  <Target className="w-12 h-12 text-slate-700 mb-4 opacity-20" />
                  <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">No active focus assigned</p>
                  <p className="text-[10px] text-slate-600 mt-2 max-w-[200px]">Strategic training requires a singular clinical focus for every session.</p>
                </div>
              ) : (
                activeFocuses.map(focus => {
                  const def = CATEGORY_DEFINITIONS[focus.category];
                  const machine = machines.find(m => m.id === focus.targetMachineId);
                  
                  return (
                    <div key={focus.id} className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden group hover:border-[#F06C22]/30 transition-all duration-300">
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className={cn("px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] flex items-center gap-1.5", def.bg, def.color)}>
                            <def.icon className="w-3 h-3" />
                            {focus.category}
                          </div>
                          
                          <button 
                            onClick={() => handleStatusUpdate(focus.id, true)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-green-500/20 hover:text-green-400 text-slate-500 transition-all group/btn"
                          >
                            <CheckCircle2 className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                          </button>
                        </div>
                        
                        <div className="space-y-3">
                          {machine && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Target:</span>
                              <span className="text-[10px] font-bold text-[#F06C22] bg-[#F06C22]/10 px-2 py-0.5 rounded-md">{machine.name}</span>
                            </div>
                          )}
                          
                          <p className="text-sm font-bold text-white leading-relaxed italic border-l-2 border-[#F06C22]/40 pl-3">
                            "{focus.clinicalNotes}"
                          </p>
                          
                          <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-black text-[#F06C22]">
                                {focus.assignedBy}
                              </div>
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Assigning Coach</span>
                            </div>
                            
                            <div className="flex items-center gap-1 text-slate-600">
                              <Clock className="w-3 h-3" />
                              <span className="text-[9px] font-bold tracking-widest">
                                {focus.dateAssigned ? (focus.dateAssigned as any).toDate?.()?.toLocaleDateString() || 'Active' : 'Active'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Clinical History */}
          <div className="flex flex-col min-h-0 bg-slate-900/30 rounded-3xl border border-slate-800/50 p-6">
            <div className="flex items-center gap-2 mb-4 shrink-0">
              <History className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Mastery History</h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-slate-800/50">
              {historyFocuses.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-40">
                  <AwardIcon className="w-10 h-10 mb-2" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]">No history recorded</p>
                </div>
              ) : (
                historyFocuses.map(focus => (
                  <div key={focus.id} className="relative pl-6 pb-2 border-l border-slate-800">
                    <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-green-500/50 border-2 border-[#0A2E46]" />
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">{focus.category}</span>
                      <span className="text-[8px] font-bold text-slate-600">{focus.dateUpdated ? (focus.dateUpdated as any).toDate?.()?.toLocaleDateString() || '' : ''}</span>
                    </div>
                    <p className="text-[11px] font-medium text-slate-400 italic line-clamp-2">"{focus.clinicalNotes}"</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal Overlay (Simplified HTML version of Dialog) */}
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-[#0A2E46] border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
               <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                       <Plus className="w-5 h-5 text-[#F06C22]" />
                       Assign New Focus
                    </h2>
                    <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-white">
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="space-y-6">
                    {/* Category Selection */}
                    <div className="grid grid-cols-2 gap-3">
                      {(Object.keys(CATEGORY_DEFINITIONS) as FocusCategory[]).map((cat) => {
                        const def = CATEGORY_DEFINITIONS[cat];
                        const isActive = newFocus.category === cat;
                        return (
                          <button
                            key={cat}
                            onClick={() => setNewFocus({ ...newFocus, category: cat })}
                            className={cn(
                              "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all text-center",
                              isActive 
                                ? cn(def.border, "bg-slate-800 ring-2 ring-[#F06C22]/50") 
                                : "border-slate-800 bg-slate-900/50 hover:bg-slate-900 text-slate-500"
                            )}
                          >
                            <def.icon className={cn("w-5 h-5", isActive ? def.color : "opacity-40")} />
                            <span className={cn("text-[10px] font-black uppercase tracking-widest", isActive ? "text-white" : "text-slate-600")}>{cat}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Coach Helper:</p>
                      <p className="text-xs font-medium text-slate-300 italic">
                        {CATEGORY_DEFINITIONS[newFocus.category as FocusCategory].helper}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Target Machine (Optional)</label>
                        <select 
                          value={newFocus.targetMachineId}
                          onChange={(e) => setNewFocus({ ...newFocus, targetMachineId: e.target.value })}
                          className="w-full h-12 bg-slate-900 border border-slate-800 rounded-xl px-4 text-sm text-white focus:border-[#F06C22] outline-none"
                        >
                          <option value="">Specific Machine or Global Focus?</option>
                          {machines.slice().sort((a,b) => a.name.localeCompare(b.name)).map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">The \"One Thing\" Clinical Focus</label>
                        <textarea
                          placeholder="What is the singular focus for this mission?"
                          value={newFocus.clinicalNotes}
                          onChange={(e) => setNewFocus({ ...newFocus, clinicalNotes: e.target.value })}
                          className="w-full h-24 bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-[#F06C22] outline-none resize-none"
                        />
                      </div>
                    </div>

                    <button 
                      onClick={handleAddFocus}
                      disabled={!newFocus.clinicalNotes}
                      className="w-full h-14 bg-[#F06C22] hover:bg-[#F06C22]/90 disabled:opacity-50 disabled:hover:bg-[#F06C22] text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-orange-950/20 transition-all active:scale-[0.98] mt-2"
                    >
                      Deploy Mission
                    </button>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
  );
}

function AwardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
  );
}
