import React, { useState, useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { db } from '../firebase';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { cn, isBig5Machine, orderMachineSettings } from '../lib/utils';
import { Loader2, Star, Activity, Settings2 } from 'lucide-react';
import { MACHINE_DATABASE } from '../data/machine-database';

const formatSettingsObj = (settings: Record<string, string>) => {
  if (!settings || Object.keys(settings).length === 0) return "No configuration";
  return orderMachineSettings(settings).map(([k, v]) => `${k}: ${v}`).join(', ');
};

function MachineCard({
  machine,
  clientSetting,
  clientId,
  authTrainer,
  clientGender
}: any) {
  const currentWeight = clientSetting?.startingWeight || '';
  const currentSettings = clientSetting?.settings || {};
  const logs = clientSetting?.auditLogs || [];
  const hasData = !!clientSetting?.startingWeight || Object.keys(currentSettings).length > 0;

  // Benchmarks
  const isMale = clientGender?.toLowerCase() === 'male' || !clientGender;
  const dbMachineInfo = MACHINE_DATABASE[machine.id];
  const baselineWeight = dbMachineInfo ? (isMale ? dbMachineInfo.baseMale : dbMachineInfo.baseFemale) : '--';
  const standardSettings = machine.standardSettings || {};
  const options = machine.settingOptions || [];

  const [weightDialogOpen, setWeightDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  // Drafts
  const [draftWeight, setDraftWeight] = useState(currentWeight.toString());
  const [draftSettings, setDraftSettings] = useState<Record<string, string>>(currentSettings);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleQuickSet = async () => {
    if (!authTrainer) {
      alert("Trainer session required.");
      return;
    }
    setIsSaving(true);
    try {
      const docRef = doc(db, 'clientMachineSettings', `${clientId}_${machine.id}`);
      
      const initialSettings: Record<string, string> = {};
      options.forEach((opt: string) => initialSettings[opt] = standardSettings[opt] || '');

      const logEntry = {
        clientId,
        timestamp: new Date().toISOString(),
        trainerId: authTrainer.id || 'unknown',
        trainerName: authTrainer.fullName || authTrainer.initials || 'Unknown',
        changeType: 'INITIAL_SETUP',
        oldValue: 'None',
        newValue: `Weight: ${baselineWeight}, Settings: STD`,
        reason: 'Quick Set applied'
      };

      const CleanSettings = { ...initialSettings };
      options.forEach((opt: string) => {
        if (!CleanSettings[opt]) delete CleanSettings[opt];
      });

      // Write settings to the main document (without the bloated auditLogs array)
      await setDoc(docRef, {
        clientId,
        machineId: machine.id,
        startingWeight: baselineWeight.toString(),
        settings: CleanSettings,
        updatedAt: new Date()
      }, { merge: true });

      // Save historic record in sidecar subcollection to keep documents optimized
      await addDoc(collection(db, 'machines', machine.id, 'settingHistory'), logEntry);

    } catch (err) {
      console.error(err);
      alert('Failed to apply quick set.');
    } finally {
      setIsSaving(false);
    }
  }

  const handleSaveWeight = async () => {
    if (!authTrainer) {
       alert("Trainer session required.");
       return;
    }
    if (draftWeight === currentWeight) {
      setWeightDialogOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      const docRef = doc(db, 'clientMachineSettings', `${clientId}_${machine.id}`);
      
      const logEntry = {
        clientId,
        timestamp: new Date().toISOString(),
        trainerId: authTrainer.id || 'unknown',
        trainerName: authTrainer.fullName || authTrainer.initials || 'Unknown',
        changeType: 'WEIGHT',
        oldValue: currentWeight || 'None',
        newValue: draftWeight,
        reason: 'Weight Update'
      };

      await setDoc(docRef, {
        clientId,
        machineId: machine.id,
        startingWeight: draftWeight,
        updatedAt: new Date()
      }, { merge: true });

      // Save historic record in sidecar subcollection
      await addDoc(collection(db, 'machines', machine.id, 'settingHistory'), logEntry);

      setWeightDialogOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to save weight.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!authTrainer) {
       alert("Trainer session required.");
       return;
    }
    
    let isSettingsChanged = false;
    options.forEach((opt: string) => {
       if ((draftSettings[opt] || '') !== (currentSettings[opt] || '')) {
         isSettingsChanged = true;
       }
    });

    if (!isSettingsChanged) {
      setSettingsDialogOpen(false);
      return;
    }
    
    if (hasData && !reason.trim()) {
      alert("Please provide a reason for the setting adjustment.");
      return;
    }

    setIsSaving(true);
    try {
      const docRef = doc(db, 'clientMachineSettings', `${clientId}_${machine.id}`);
      const actualReason = reason.trim() || "Settings Update";

      const logEntry = {
        clientId,
        timestamp: new Date().toISOString(),
        trainerId: authTrainer.id || 'unknown',
        trainerName: authTrainer.fullName || authTrainer.initials || 'Unknown',
        changeType: 'SETTINGS',
        oldValue: formatSettingsObj(currentSettings),
        newValue: formatSettingsObj(draftSettings),
        reason: actualReason
      };

      const CleanSettings = { ...draftSettings };
      options.forEach((opt: string) => {
        if (!CleanSettings[opt]) delete CleanSettings[opt];
      });

      await setDoc(docRef, {
        clientId,
        machineId: machine.id,
        settings: CleanSettings,
        updatedAt: new Date()
      }, { merge: true });

      // Save historic record in sidecar subcollection
      await addDoc(collection(db, 'machines', machine.id, 'settingHistory'), logEntry);

      setSettingsDialogOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden h-full">
      <div className={cn("px-4 py-3 border-b flex items-center justify-between", hasData ? "border-slate-200 dark:border-slate-800" : "border-slate-100 dark:border-slate-800/40 opacity-70")}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-tighter text-[14px] leading-tight truncate" title={machine.name}>{machine.name}</h4>
            {isBig5Machine(machine.id) && <Star className="w-3 h-3 text-amber-500 fill-amber-400 shrink-0" />}
          </div>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest truncate">{machine.muscleGroup}</p>
        </div>
      </div>

      <div className={cn("p-4 flex-1 flex flex-col justify-between gap-4", !hasData && "opacity-70")}>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5">Target</Label>
            <div className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none">
              {hasData && currentWeight ? `${currentWeight}` : <span className="text-slate-300 dark:text-slate-700">{baselineWeight}</span>}
              <span className="text-[10px] font-bold text-slate-400 ml-1">LBS</span>
            </div>
          </div>
          <div className="text-right">
             <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5">Setup</Label>
             <div className="text-[10px] font-black tracking-widest text-slate-600 dark:text-slate-400 uppercase">
               {hasData && Object.keys(currentSettings).length > 0 ? (
                  Object.entries(currentSettings).map(([k,v]) => {
                     let short = k.substring(0, 2).toUpperCase();
                     if (k.toLowerCase() === 'gap') short = 'G';
                     else if (k.toLowerCase() === 'seat') short = 'S';
                     else if (k.toLowerCase().includes('back')) short = 'BP';
                     else if (k.toLowerCase().includes('chest')) short = 'CP';
                     return `${short}${v}`;
                  }).join(', ')
               ) : (
                  <span className="text-slate-300 dark:text-slate-700">STD</span>
               )}
             </div>
          </div>
        </div>

        {hasData ? (
          <div className="grid grid-cols-2 gap-2 mt-auto">
            <Dialog open={weightDialogOpen} onOpenChange={(open) => {
              setWeightDialogOpen(open);
              if (open) setDraftWeight(currentWeight.toString());
            }}>
              <DialogTrigger className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl bg-[#115E8D]/5 hover:bg-[#115E8D]/10 border-[#115E8D]/20 text-[#115E8D] dark:text-[#38BDF8] dark:border-[#38BDF8]/20 dark:bg-[#38BDF8]/10 dark:hover:bg-[#38BDF8]/20 font-black uppercase tracking-widest text-[10px]")}>
                  <Activity className="w-3.5 h-3.5 mr-1.5" /> WGT
              </DialogTrigger>
              <DialogContent className="max-w-xs rounded-[32px] p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <DialogHeader className="mb-4 text-left">
                  <DialogTitle className="text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">Update Weight</DialogTitle>
                  <DialogDescription className="text-xs font-bold uppercase tracking-widest text-slate-500">No reason required.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Target Weight (LBS)</Label>
                    <Input 
                      type="number" 
                      value={draftWeight} 
                      onChange={e => setDraftWeight(e.target.value)} 
                      className="h-14 text-2xl text-center font-black rounded-2xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-[#115E8D] dark:text-white"
                    />
                  </div>
                  <Button onClick={handleSaveWeight} disabled={isSaving || draftWeight === currentWeight} className="w-full h-14 rounded-2xl bg-[#115E8D] dark:bg-[#38BDF8] hover:bg-[#0c4467] dark:hover:bg-[#0ea5e9] text-white dark:text-slate-900 font-black uppercase tracking-widest">
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Weight'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={settingsDialogOpen} onOpenChange={(open) => {
              setSettingsDialogOpen(open);
              if (open) {
                setDraftSettings(currentSettings);
                setReason('');
              }
            }}>
              <DialogTrigger className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800 dark:border-slate-700 dark:text-slate-300 font-black uppercase tracking-widest text-[10px]")}>
                  <Settings2 className="w-3.5 h-3.5 mr-1.5" /> SET
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-[32px] p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <DialogHeader className="mb-4 text-left">
                  <DialogTitle className="text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">Machine Settings</DialogTitle>
                  <DialogDescription className="text-xs font-bold uppercase tracking-widest text-[#F06C22]">Reason required for audit logs.</DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  {options.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {options.map((opt: string) => (
                        <div key={opt} className="space-y-1">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-1">{opt}</Label>
                          <Input 
                            value={draftSettings[opt] || ''}
                            onChange={e => setDraftSettings(prev => ({...prev, [opt]: e.target.value}))}
                            placeholder={standardSettings[opt] || '---'}
                            className="h-14 font-black text-xl text-center rounded-2xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-[#F06C22] dark:text-white"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-[#F06C22]">Reason for Change (Required)</Label>
                    <Input 
                      value={reason} 
                      onChange={e => setReason(e.target.value)} 
                      placeholder="e.g. Needs more ROM, progressed past standard"
                      className="h-12 bg-slate-50 dark:bg-slate-950 border-[#F06C22]/30 focus-visible:ring-[#F06C22] rounded-2xl dark:text-white"
                    />
                  </div>
                  <Button 
                    onClick={handleSaveSettings} 
                    disabled={isSaving || !reason.trim() || JSON.stringify(draftSettings) === JSON.stringify(currentSettings)} 
                    className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 font-black uppercase tracking-widest shadow-sm active:scale-95 transition-transform"
                  >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Log & Save Setup'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="mt-auto">
            <Button onClick={handleQuickSet} disabled={isSaving} className="w-full h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white font-black uppercase tracking-widest text-[10px]">
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Quick Set (Base)'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ClientEquipmentPrescriptions({ 
  clientId, 
  machines, 
  client,
  clientSettings, 
  authTrainer
}: any) {
  const sortedMachines = [...(machines || [])].sort((a: any, b: any) => (a.order || 999) - (b.order || 999));

  return (
    <div className="pb-20">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
         {sortedMachines.map((machine: any) => (
           <MachineCard 
              key={machine.id} 
              machine={machine} 
              clientSetting={clientSettings[machine.id]} 
              clientId={clientId} 
              authTrainer={authTrainer}
              clientGender={client?.gender || client?.infoForm?.gender}
           />
         ))}
      </div>
    </div>
  );
}

