import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { auth } from '../firebase';
import { db } from '../firebase';
import { doc, setDoc, getDocs, collection, query, where, writeBatch } from 'firebase/firestore';
import { parseSessionDate, cn, getMuscleGroupColor, isBig5Machine } from '../lib/utils';
import { Wrench, RefreshCw, Star } from 'lucide-react';

const calculateConservativeLoad = (machineId: string, bodyWeight: number, level: string) => {
  const isLowerBody = ['leg_press', 'squat', 'leg_extension', 'leg_curl'].includes(machineId.toLowerCase()) || machineId.includes('leg');
  
  let percentage = isLowerBody ? 0.40 : 0.20;
  
  if (level === 'Intermediate') {
    percentage *= 1.2;
  }
  
  if (machineId.includes('chest_press')) percentage = 0.20;
  if (machineId.includes('compound_row')) percentage = 0.25;
  if (machineId.includes('leg_press')) percentage = 0.40;

  const calculated = Math.round(bodyWeight * percentage);
  return Math.round(calculated / 5) * 5;
};

export const formatMachineSettings = (settings: any): string => {
  if (!settings || typeof settings !== 'object' || Object.keys(settings).length === 0) return "Not set";

  const entries = Object.entries(settings);
  
  const gap = entries.find(([k]) => k.toLowerCase().includes('gap'));
  const back = entries.find(([k]) => k.toLowerCase().includes('back') || k.toLowerCase().includes('chest'));
  const seat = entries.find(([k]) => k.toLowerCase().includes('seat'));
  
  const others = entries.filter(([k]) => {
    const lower = k.toLowerCase();
    return !lower.includes('gap') && !lower.includes('back') && !lower.includes('chest') && !lower.includes('seat');
  }).sort((a, b) => a[0].localeCompare(b[0]));

  const ordered = [];
  if (gap) ordered.push(gap);
  if (back) ordered.push(back);
  if (seat) ordered.push(seat);
  ordered.push(...others);

  return ordered.map(([k, v]) => {
    const formattedKey = k
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
    return `${formattedKey} ${v}`;
  }).join(', ');
};

export const calculateWeightPercentile = (currentWeight: number, machineId: string, allClientData: any[]): string => {
  if (!allClientData || !Array.isArray(allClientData)) return "N/A";
  
  const maxWeightPerClient = new Map<string, number>();
  
  allClientData.forEach(log => {
      if (log.machineId === machineId && log.weight && log.clientId) {
          const w = parseFloat(log.weight);
          if (!isNaN(w)) {
              const existing = maxWeightPerClient.get(log.clientId) || 0;
              maxWeightPerClient.set(log.clientId, Math.max(existing, w));
          }
      }
  });

  const allWeights = Array.from(maxWeightPerClient.values()).sort((a, b) => a - b);
  if (allWeights.length === 0) return "N/A";

  let rank = 0;
  for (let w of allWeights) {
      if (currentWeight > w) {
          rank++;
      } else if (currentWeight === w) {
          // If tied, count half as below? Let's just say equal is ranked same and we increment.
          rank += 0.5;
      }
  }

  const p = Math.max(1, Math.min(99, Math.round((rank / allWeights.length) * 100)));
  return `${p}th Percentile`;
};

export function ClientEquipmentPrescriptions({ 
  clientId, 
  machines, 
  clientSettings, 
  clientBodyWeight,
  allLogs = []
}: any) {
  const [selectedMachine, setSelectedMachine] = useState<any>(null);
  const [startingWeight, setStartingWeight] = useState<number | ''>('');
  const [currentWeight, setCurrentWeight] = useState<number | ''>('');
  const [fitnessLevel, setFitnessLevel] = useState('Novice');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshWeights = async () => {
    setIsRefreshing(true);
    try {
      const logsMap = new Map<string, any>();

      // Fetch logs directly by clientId
      const logsSnap = await getDocs(query(collection(db, 'exerciseLogs'), where('clientId', '==', clientId)));
      logsSnap.docs.forEach(docSnap => {
        logsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
      });

      // Fetch all sessions for this client (no limit) to get older logs that might lack clientId
      const sessionsSnap = await getDocs(query(collection(db, 'sessions'), where('clientId', '==', clientId)));
      const sessionIds = sessionsSnap.docs.map(doc => doc.id).filter(Boolean);

      const chunks = [];
      for (let i = 0; i < sessionIds.length; i += 30) {
        chunks.push(sessionIds.slice(i, i + 30));
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          const q = query(collection(db, 'exerciseLogs'), where('sessionId', 'in', chunk));
          const snap = await getDocs(q);
          snap.docs.forEach(docSnap => {
            logsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
          });
        })
      );

      const machineLogs: Record<string, any[]> = {};
      
      Array.from(logsMap.values()).forEach(data => {
        if (!data.machineId || !data.weight) return;
        const w = parseFloat(data.weight);
        if (isNaN(w) || w <= 0) return;
        
        if (!machineLogs[data.machineId]) {
          machineLogs[data.machineId] = [];
        }
        machineLogs[data.machineId].push(data);
      });

      const batch = writeBatch(db);
      let operations = 0;

      for (const [mId, logs] of Object.entries(machineLogs)) {
        if (logs.length === 0) continue;

        logs.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || new Date(a.createdAt).getTime() || 0;
          const timeB = b.createdAt?.toMillis?.() || new Date(b.createdAt).getTime() || 0;
          return timeA - timeB;
        });

        const oldest = logs[0];
        const newest = logs[logs.length - 1];

        const startingWt = Number(oldest.weight);
        const startingWtDate = oldest.createdAt?.toDate?.()?.toISOString() || new Date(oldest.createdAt).toISOString();
        const currentWt = Number(newest.weight);

        const settingId = `${clientId}_${mId}`;
        const settingRef = doc(db, 'clientMachineSettings', settingId);

        batch.set(settingRef, {
          clientId,
          machineId: mId,
          settings: clientSettings[mId]?.settings || {},
          updatedBy: auth.currentUser?.uid || 'Unknown',
          startingWeight: startingWt,
          startingWeightDate: startingWtDate,
          currentWeight: currentWt,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        operations++;
      }

      if (operations > 0) {
        await batch.commit();
      }

    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleInitialize = (machine: any) => {
    setSelectedMachine(machine);
    
    if (machine.hasUsed) {
       setStartingWeight(machine.startingWeight || '');
       setCurrentWeight(machine.currentWeight || '');
       setFitnessLevel('Novice'); // default
    } else {
       const calcWeight = calculateConservativeLoad(machine.id, clientBodyWeight || 150, 'Novice');
       setStartingWeight(calcWeight);
       setCurrentWeight('');
       setFitnessLevel('Novice');
    }
  };

  const handleFitnessLevelChange = (val: string) => {
    setFitnessLevel(val);
    if (selectedMachine && !selectedMachine.hasUsed) {
      setStartingWeight(calculateConservativeLoad(selectedMachine.id, clientBodyWeight || 150, val));
    }
  };

  const handleSave = async () => {
    if (!clientId || !selectedMachine) return;
    
    const settingId = `${clientId}_${selectedMachine.id}`;
    
    const payload: any = {
      clientId,
      machineId: selectedMachine.id,
      settings: clientSettings[selectedMachine.id]?.settings || {},
      updatedBy: auth.currentUser?.uid || 'Unknown',
      updatedAt: new Date().toISOString()
    };
    
    if (startingWeight !== '') {
       payload.startingWeight = Number(startingWeight);
       // Only set date if not already set, or if we want to default to today:
       const existingDate = clientSettings[selectedMachine.id]?.startingWeightDate;
       if (!existingDate) {
          payload.startingWeightDate = new Date().toISOString();
       }
    }
    
    if (currentWeight !== '') {
       payload.currentWeight = Number(currentWeight);
    }
    
    await setDoc(doc(db, 'clientMachineSettings', settingId), payload, { merge: true });
    
    setSelectedMachine(null);
  };

  const machineData = useMemo(() => {
    return machines.map((m: any) => {
      const logsForMachine = allLogs.filter((l: any) => l.machineId === m.id && l.clientId === clientId && l.weight)
        .sort((a: any, b: any) => {
          const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
          const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
          return dateB - dateA; // newest first
        });

      const setting = clientSettings[m.id];
      const hasUsed = logsForMachine.length > 0 || setting?.startingWeight > 0 || setting?.currentWeight > 0;
      
      const newestLog = logsForMachine.length > 0 ? logsForMachine[0] : null;
      const oldestLog = logsForMachine.length > 0 ? logsForMachine[logsForMachine.length - 1] : null;
      
      const currentWeight = setting?.currentWeight !== undefined ? setting.currentWeight : (newestLog ? parseFloat(newestLog.weight) : 0);
      const startingWeight = setting?.startingWeight !== undefined ? setting.startingWeight : (oldestLog ? parseFloat(oldestLog.weight) : 0);
      
      let startingDate = setting?.startingWeightDate ? new Date(setting.startingWeightDate) : null;
      
      if (!startingDate && oldestLog) {
         startingDate = oldestLog?.createdAt?.toMillis 
           ? new Date(oldestLog.createdAt.toMillis()) 
           : oldestLog?.createdAt 
             ? new Date(oldestLog.createdAt) 
             : null;
      }
      
      const settingsStr = formatMachineSettings(setting?.settings);

      const percentileStr = hasUsed && !isNaN(currentWeight) ? calculateWeightPercentile(currentWeight, m.id, allLogs) : "N/A";
      const pNum = hasUsed && !isNaN(currentWeight) ? parseInt(percentileStr) : 0;

      return {
        ...m,
        hasUsed,
        currentWeight,
        startingWeight,
        startingDate,
        settingsStr,
        percentileStr,
        pNum
      };
    }).sort((a: any, b: any) => {
      if (a.hasUsed && !b.hasUsed) return -1;
      if (!a.hasUsed && b.hasUsed) return 1;
      return (a.order || 0) - (b.order || 0);
    });
  }, [machines, allLogs, clientId, clientSettings]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end items-center mb-0">
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleRefreshWeights}
          disabled={isRefreshing}
          className="h-7 text-[10px] uppercase font-bold text-[#115E8D] border-[#115E8D]/30 shadow-sm transition-all hover:bg-[#115E8D]/5"
        >
          <RefreshCw className={`w-3 h-3 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Sync Weights
        </Button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-[#115E8D]/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-full">
            <thead>
              <tr className="bg-[#115E8D] text-white uppercase text-[8px] sm:text-[9px] font-black tracking-widest leading-none h-[28px]">
                <th className="px-1.5 py-1.5 sm:px-2 w-[22%]">Machine</th>
                <th className="px-1.5 py-1.5 sm:px-2">Settings</th>
                <th className="px-1.5 py-1.5 sm:px-2 text-right">Starting Wt</th>
                <th className="px-1.5 py-1.5 sm:px-2 text-right">Current Wt</th>
                <th className="px-1.5 py-1.5 sm:px-2 text-center">Percentile</th>
                <th className="px-1.5 py-1.5 sm:px-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {machineData.map((m: any) => (
                <tr key={m.id} className={`transition-colors hover:bg-slate-50 ${m.hasUsed ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <td className="px-1.5 py-1.5 sm:px-2 align-middle">
                    <span className={cn(
                      "font-black text-[9px] sm:text-[10px] uppercase tracking-tighter px-1.5 py-0.5 rounded-[4px] border inline-flex items-center justify-between leading-none max-w-[120px] sm:max-w-[150px]",
                      getMuscleGroupColor(m.name),
                      !m.hasUsed && "opacity-60 grayscale"
                    )}>
                      <span className="truncate">{m.name}</span>
                      {isBig5Machine(m.name) && (
                        <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-1 fill-amber-400 text-amber-500 shrink-0" />
                      )}
                    </span>
                  </td>
                  <td className={`px-1.5 py-1.5 sm:px-2 text-[9px] sm:text-[10px] ${m.hasUsed ? 'text-slate-600 font-medium whitespace-nowrap' : 'text-slate-400'}`}>
                    {m.settingsStr}
                  </td>
                  <td className={`px-1.5 py-1.5 sm:px-2 text-right font-medium text-[9px] sm:text-[10px] ${m.hasUsed ? 'text-slate-700' : 'text-slate-400'}`}>
                    {m.hasUsed ? (
                       <div className="flex flex-col items-end leading-none">
                         <span className="font-bold mb-0.5">{m.startingWeight} lbs</span>
                         {m.startingDate && (
                           <span className="text-[7px] sm:text-[8px] text-slate-400 font-medium uppercase tracking-wider">
                             {m.startingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                           </span>
                         )}
                       </div>
                    ) : '--'}
                  </td>
                  <td className={`px-1.5 py-1.5 sm:px-2 text-right font-black text-[10px] sm:text-xs ${m.hasUsed ? 'text-[#F06C22]' : 'text-slate-400'}`}>
                    {m.hasUsed ? `${m.currentWeight} lbs` : '--'}
                  </td>
                  <td className="px-1.5 py-1.5 sm:px-2 text-center">
                    {m.hasUsed ? (
                      <Badge 
                        variant="secondary" 
                        className={`text-[8px] uppercase tracking-wider font-bold px-1 sm:px-1.5 py-0 h-4 ${
                          m.pNum >= 75 ? 'bg-[#F06C22]/10 text-[#F06C22] border border-[#F06C22]/20 shadow-sm' : 
                          m.pNum >= 25 ? 'bg-[#115E8D]/10 text-[#115E8D] border border-[#115E8D]/20 shadow-sm' : 
                          'bg-zinc-100 text-zinc-600 border border-zinc-200'
                        }`}
                      >
                        {m.percentileStr}
                      </Badge>
                    ) : (
                      <span className="text-[9px] sm:text-[10px] text-slate-300">--</span>
                    )}
                  </td>
                  <td className="px-1.5 py-1.5 sm:px-2 text-right">
                    {!m.hasUsed ? (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleInitialize(m)}
                        className="h-5 sm:h-6 px-1.5 sm:px-2 text-[8px] sm:text-[9px] uppercase font-bold text-[#F06C22] hover:text-white hover:bg-[#F06C22] border-[#F06C22]/50 shadow-sm transition-all"
                      >
                        <Wrench className="w-2.5 h-2.5 sm:mr-1" /> Setup
                      </Button>
                    ) : (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleInitialize(m)}
                        className="h-5 sm:h-6 px-1.5 sm:px-2 text-[8px] sm:text-[9px] uppercase font-bold text-slate-400 hover:text-[#115E8D] hover:bg-[#115E8D]/10 transition-all"
                      >
                        Adjust
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selectedMachine} onOpenChange={(open) => !open && setSelectedMachine(null)}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="uppercase font-black text-xl italic tracking-tighter text-[#115E8D]">Initialize: {selectedMachine?.name}</DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
               Calculate a conservative starting load for continuous-tension protocols.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
             <Button variant="outline" className="w-full border-[#115E8D]/20 hover:bg-[#115E8D]/5 text-[#115E8D] uppercase text-[10px] font-black tracking-widest shadow-sm h-8" onClick={() => window.open(`/knowledge?machine=${selectedMachine?.id || ''}`, '_blank')}>
               Open Clinical Setup Guide
             </Button>
             
             <div className="bg-slate-50 p-4 rounded-xl space-y-4 border border-slate-200">
               <div className="flex gap-4">
                 <div className="space-y-2 flex-1">
                   <Label className="text-[10px] uppercase font-black tracking-widest text-[#68717A]">Body Weight (lbs)</Label>
                   <Input 
                     type="number" 
                     className="bg-white border-slate-200 text-slate-900 text-xs font-bold h-8"
                     value={clientBodyWeight || ''}
                     disabled
                     placeholder="Not set"
                   />
                 </div>
                 <div className="space-y-2 flex-1">
                   <Label className="text-[10px] uppercase font-black tracking-widest text-[#68717A]">Fitness Level</Label>
                   <Select value={fitnessLevel} onValueChange={handleFitnessLevelChange}>
                     <SelectTrigger className="bg-white border-slate-200 text-[#115E8D] font-bold text-xs h-8">
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent className="bg-white border-slate-200 text-slate-900">
                       <SelectItem value="Novice" className="text-xs font-medium">Novice</SelectItem>
                       <SelectItem value="Intermediate" className="text-xs font-medium">Intermediate</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
               </div>
               
               <div className="flex gap-4 pt-3 border-t border-slate-200">
                 <div className="space-y-2 flex-1">
                   <Label className="text-[10px] uppercase font-black tracking-widest text-[#F06C22]">Starting Weight (lbs)</Label>
                   <Input 
                     type="number" 
                     value={startingWeight}
                     onChange={e => setStartingWeight(Number(e.target.value) || '')}
                     className="bg-white border-[#F06C22]/30 text-xl font-black focus-visible:ring-[#F06C22]/50 text-[#115E8D] shadow-sm h-10"
                   />
                 </div>
                 <div className="space-y-2 flex-1">
                   <Label className="text-[10px] uppercase font-black tracking-widest text-[#115E8D]">Current Weight (lbs)</Label>
                   <Input 
                     type="number" 
                     value={currentWeight}
                     onChange={e => setCurrentWeight(Number(e.target.value) || '')}
                     className="bg-white border-[#115E8D]/30 text-xl font-black focus-visible:ring-[#115E8D]/50 text-[#115E8D] shadow-sm h-10"
                   />
                 </div>
               </div>
               
               {!selectedMachine?.hasUsed && (
                 <p className="text-[9px] text-slate-500 font-medium uppercase tracking-wider">Starting weight is initialized based on Body Weight & Fitness Level. You can manually override.</p>
               )}
             </div>
          </div>
          
          <DialogFooter>
            <Button variant="ghost" className="uppercase font-black tracking-widest text-[10px] text-slate-400 hover:text-[#115E8D] h-8" onClick={() => setSelectedMachine(null)}>Cancel</Button>
            <Button className="bg-[#F06C22] hover:bg-[#D95B16] text-white uppercase font-black tracking-widest text-[10px] h-8 shadow-md shadow-[#F06C22]/20" onClick={handleSave}>Save Prescription</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
