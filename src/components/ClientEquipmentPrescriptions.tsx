import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../firebase';
import { doc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { cn, getMuscleGroupColor, isBig5Machine } from '../lib/utils';
import { Wrench, RefreshCw, Star, Loader2, Gauge } from 'lucide-react';
import { LeaderboardDocument } from '../types';

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

export function ClientEquipmentPrescriptions({ 
  clientId, 
  machines, 
  clientSettings, 
  clientBodyWeight,
  activeStudioId,
  allLogs = []
}: any) {
  const [selectedMachine, setSelectedMachine] = useState<any>(null);
  const [startingWeight, setStartingWeight] = useState<number | ''>('');
  const [trainingLevel, setTrainingLevel] = useState('Beginner');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);

  const getPercentileRank = (machineId: string) => {    
    
    // Find client's current max weight from logs
    const clientLogs = allLogs.filter((l: any) => l.machineId === machineId);
    if (clientLogs.length === 0) return "New";
    
    const maxWeight = Math.max(...clientLogs.map((l: any) => parseInt(l.weight || '0', 10)));
    if (maxWeight === 0) return "New";

    // Compare against static thresholds
    // Leaderboard Data has been migrated to dynamic calculation on the leaderboard view,
    // so we can fallback to N/A instead of failing on prescriptions
    return "N/A";
  };

  const handleSyncAllLevels = async () => {
    if (!trainingLevel || !clientBodyWeight) return;
    setIsSyncing(true);
    const batch = writeBatch(db);

    try {
      machines.forEach((machine: any) => {
        const conservativeLoad = calculateConservativeLoad(machine.id, clientBodyWeight, trainingLevel);
        const docRef = doc(db, 'clientMachineSettings', `${clientId}_${machine.id}`);
        batch.set(docRef, {
          clientId,
          machineId: machine.id,
          startingWeight: conservativeLoad.toString(),
          trainingLevel,
          updatedAt: new Date()
        }, { merge: true });
      });

      await batch.commit();
      window.location.reload();
    } catch (error) {
      console.error("Batch sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveStartingWeight = async () => {
    if (!selectedMachine || startingWeight === '') return;
    
    try {
      const docRef = doc(db, 'clientMachineSettings', `${clientId}_${selectedMachine.id}`);
      await setDoc(docRef, {
        clientId,
        machineId: selectedMachine.id,
        startingWeight: startingWeight.toString(),
        updatedAt: new Date()
      }, { merge: true });
      
      setSelectedMachine(null);
      setStartingWeight('');
      window.location.reload();
    } catch (error) {
       console.error("Failed to save starting weight:", error);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-[#115E8D] rounded-3xl p-6 border border-white/10 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-[#38BDF8]" />
              Prescription Infrastructure
            </h3>
            <p className="text-sm text-slate-300 mt-1">
              Initialize starting loads based on body weight and clinical expertise.
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Select value={trainingLevel} onValueChange={setTrainingLevel}>
              <SelectTrigger className="w-full md:w-40 bg-[#0A2E46] border-white/10 text-white font-bold h-12 rounded-xl">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent className="bg-[#0A2E46] border-white/10 text-white">
                <SelectItem value="Beginner">Beginner (Slow)</SelectItem>
                <SelectItem value="Intermediate">Intermediate</SelectItem>
                <SelectItem value="Advanced">Advanced (1-on-1)</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              onClick={handleSyncAllLevels} 
              disabled={isSyncing}
              className="flex-1 md:flex-none h-12 bg-[#F06C22] hover:bg-[#D45A1AB3] text-white font-black uppercase tracking-widest px-8 rounded-xl shadow-lg border-b-4 border-[#A3430F]"
            >
              {isSyncing ? <RefreshCw className="w-5 h-5 animate-spin" /> : "Sync All Bases"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {machines.map((machine: any) => {
          const settings = clientSettings[machine.id];
          const hasSettings = settings && settings.startingWeight;
          const isBig5 = isBig5Machine(machine.id);
          const rankLabel = getPercentileRank(machine.id);

          return (
            <div 
              key={machine.id}
              onClick={() => setSelectedMachine(machine)}
              className={cn(
                "group relative bg-[#0A2E46] border border-white/5 rounded-3xl p-5 hover:bg-[#115E8D] transition-all cursor-pointer overflow-hidden",
                isBig5 && "border-[#F06C22]/30 ring-1 ring-[#F06C22]/10"
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", getMuscleGroupColor(machine.muscleGroup))}>
                    <Dumbbell className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-black text-white italic uppercase text-sm leading-tight group-hover:text-[#38BDF8] transition-colors">{machine.name}</h4>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{machine.muscleGroup}</p>
                  </div>
                </div>
                {isBig5 && (
                  <Badge className="bg-[#F06C22] hover:bg-[#F06C22] text-white font-black text-[9px] uppercase tracking-tighter italic">Big 5</Badge>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-black/20 rounded-2xl border border-white/5">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Base Load</span>
                   <span className="text-lg font-black text-white tabular-nums">
                     {hasSettings ? `${settings.startingWeight} LBS` : '---'}
                   </span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-black/20 rounded-2xl border border-white/5">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setup Configuration</span>
                   <span className="text-[10px] font-black text-[#38BDF8] uppercase text-right leading-tight max-w-[120px] line-clamp-1">
                     {formatMachineSettings(settings?.settings)}
                   </span>
                </div>

                <div className="pt-2 flex items-center justify-between">
                   <Badge variant="outline" className="bg-transparent border-slate-700 text-slate-500 font-bold text-[9px] uppercase">
                     {trainingLevel} Base
                   </Badge>
                   <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/10 group-hover:border-[#F06C22]/50 transition-colors">
                      <Gauge className="w-3 h-3 text-[#F06C22]" />
                      <span className="text-[10px] font-bold text-white uppercase italic">
                        {isLoadingLeaderboard ? <Loader2 className="w-3 h-3 animate-spin" /> : rankLabel}
                      </span>
                   </div>
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          );
        })}
      </div>

      <Dialog open={!!selectedMachine} onOpenChange={() => setSelectedMachine(null)}>
        <DialogContent className="bg-[#0A2E46] border-white/10 text-white rounded-[32px] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase italic tracking-tight text-white">Adjust Base Prescription</DialogTitle>
            <DialogDescription className="text-slate-400">
              Update the clinical starting load for {selectedMachine?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-8 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="weight" className="text-xs font-black uppercase text-slate-500 tracking-widest">Recommended Start</Label>
              <div className="flex items-center gap-4">
                <Input 
                  id="weight"
                  type="number" 
                  value={startingWeight} 
                  onChange={(e) => setStartingWeight(e.target.value ? parseInt(e.target.value) : '')}
                  className="h-14 bg-slate-900 border-white/10 text-2xl font-black italic rounded-2xl flex-1 text-center"
                  placeholder="---"
                />
                <span className="text-xl font-bold text-slate-500 uppercase italic">LBS</span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium italic mt-2">
                * Based on {trainingLevel} protocol for {clientBodyWeight} LBS body weight.
              </p>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-3">
            <Button 
              variant="ghost" 
              onClick={() => setSelectedMachine(null)}
              className="h-14 rounded-2xl font-bold text-slate-400 hover:text-white hover:bg-white/5 order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveStartingWeight}
              className="h-14 flex-1 bg-[#F06C22] hover:bg-[#D45A1A] text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-[#F06C22]/20 order-1 sm:order-2"
            >
              Apply Prescription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Dumbbell = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.767a2 2 0 1 1-2.829-2.828l-1.767 1.767a2 2 0 1 1-2.829-2.828l1.768-1.767a2 2 0 1 1-2.828-2.829l2.121-2.121a2 2 0 0 1 2.829 0l2.828 2.828a2 2 0 0 1 0 2.828l2.828 2.829a2 2 0 0 1 0 2.828l2.829 2.829a2 2 0 0 1 0 2.828l-2.122 2.121Z"/><path d="m6.457 11.485 2.121-2.121a2 2 0 0 1 2.829 0l2.828 2.828a2 2 0 0 1 0 2.828l2.121-2.121a2 2 0 0 1 2.829 0l2.121 2.121" />
  </svg>
);
