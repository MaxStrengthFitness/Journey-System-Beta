import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserCog, Plus, RefreshCcw, User, Trash2, Link, Trophy } from 'lucide-react';
import { Trainer, Studio } from '../types';
import { cn, getRoleColor, getRoleDisplayName } from '@/lib/utils';
import { CreateTrainerModal } from './CreateTrainerModal';
import { DataMigrationTool } from './DataMigrationTool';

interface Props {
  trainers: Trainer[];
  studios: Studio[];
  authTrainer: Trainer;
  isAdmin: boolean;
  activeStudioId: string | null;
}

export function FranchiseTeamManagement({ trainers, studios, authTrainer, isAdmin, activeStudioId }: Props) {
  const [trainerSearchQuery, setTrainerSearchQuery] = useState('');
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [trainerToDelete, setTrainerToDelete] = useState<Trainer | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingTrainerId, setSyncingTrainerId] = useState<string | null>(null);

  const [editingIcalId, setEditingIcalId] = useState<string | null>(null);
  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [isUpdatingIcal, setIsUpdatingIcal] = useState(false);

  // An admin or franchiser can see staff across their locations
  const ownedStudios = studios.filter(s =>
    isAdmin || s.ownerId === authTrainer.id
  );
  const ownedStudioIds = ownedStudios.map(s => s.id);

  const visibleTrainers = isAdmin ? trainers : trainers.filter(t => 
    (t.primaryHomeStudioId && ownedStudioIds.includes(t.primaryHomeStudioId)) ||
    (t.accessibleStudioIds?.some(id => ownedStudioIds.includes(id)))
  );

  const filteredTrainers = visibleTrainers.filter(t => 
    t.fullName.toLowerCase().includes(trainerSearchQuery.toLowerCase())
  );

  const currentSelectedTrainer = trainers.find(t => t.id === selectedTrainer?.id) || (filteredTrainers.length > 0 ? filteredTrainers[0] : null);

  const handleCreateTrainer = async (data: any) => {
    try {
      await addDoc(collection(db, 'trainers'), {
        ...data,
        primaryHomeStudioId: activeStudioId,
        createdAt: serverTimestamp()
      });
    } catch (e: any) {
      alert("Error creating trainer: " + e.message);
    }
  };

  const handleDeleteTrainer = async () => {
    if (!trainerToDelete?.id) return;
    try {
      await deleteDoc(doc(db, 'trainers', trainerToDelete.id));
      setTrainerToDelete(null);
    } catch (e: any) {
      alert("Error deleting trainer: " + e.message);
    }
  };

  const handleUpdateHomeStudio = async (id: string, newStudioId: string) => {
    try {
      await updateDoc(doc(db, 'trainers', id), {
        primaryHomeStudioId: newStudioId === 'unassigned' ? '' : newStudioId
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleAccessibleStudio = async (trainer: Trainer, studioId: string, isAdding: boolean) => {
    try {
      const current = trainer.accessibleStudioIds || [];
      const updated = isAdding 
        ? [...current, studioId]
        : current.filter(id => id !== studioId);
      await updateDoc(doc(db, 'trainers', trainer.id!), { accessibleStudioIds: updated });
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleVisibility = async (id: string, currentValue: boolean) => {
    try {
      await updateDoc(doc(db, 'trainers', id), { isVisibleOnCalendar: !currentValue });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateIcal = async (trainerId: string) => {
    setIsUpdatingIcal(true);
    try {
      await updateDoc(doc(db, 'trainers', trainerId), {
        thirdPartyCalendarUrl: newIcalUrl
      });
      setEditingIcalId(null);
      setNewIcalUrl('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdatingIcal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Detail Headers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button 
              onClick={() => setIsCreateModalOpen(true)}
              className="rounded-xl bg-orange-500 dark:bg-orange-600 text-white h-10 px-4 font-black uppercase text-[10px] tracking-widest gap-2 shadow-sm dark:shadow-none"
            >
              <Plus className="w-4 h-4" />
              Add New
            </Button>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Master List */}
        <div className="space-y-4">
          <Label className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">Roster</Label>
          <div className="relative">
            <Input 
              type="search" 
              placeholder="Search trainers..." 
              value={trainerSearchQuery}
              onChange={e => setTrainerSearchQuery(e.target.value)}
              className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white pl-9 h-10 rounded-xl text-xs font-bold"
            />
            <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredTrainers.length === 0 ? (
              <p className="text-center py-6 text-slate-500 dark:text-slate-400 font-medium italic text-xs">No matching trainers.</p>
            ) : (
              filteredTrainers.map((t) => {
                const isSelected = currentSelectedTrainer?.id === t.id;
                return (
                  <div 
                    key={t.id}
                    onClick={() => setSelectedTrainer(t)}
                    className={cn(
                      "p-4 rounded-2xl cursor-pointer transition-all border flex items-center justify-between text-left group",
                      isSelected 
                        ? "bg-slate-100 dark:bg-slate-800 border-l-4 border-l-sky-500 border-slate-300 dark:border-slate-700 shadow-sm"
                        : "bg-slate-50 hover:bg-slate-100/50 dark:bg-slate-950 dark:hover:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs italic shrink-0", 
                        getRoleColor(t.role)
                      )}>
                        {t.initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 dark:text-white uppercase italic truncate">{t.fullName}</p>
                        <p className={cn("text-[9px] font-bold uppercase tracking-widest truncate mt-0.5", getRoleColor(t.role).split(' ')[0])}>
                          {getRoleDisplayName(t.role)}
                        </p>
                      </div>
                    </div>

                    {isAdmin && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setTrainerToDelete(t);
                        }}
                        className="p-1 px-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0"
                        title="Delete Trainer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detail Panel */}
        <div className="md:col-span-2">
          {currentSelectedTrainer ? (
            <div className="p-6 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-[24px] space-y-6">
              {/* Profile Detail Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4">
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl italic shrink-0", getRoleColor(currentSelectedTrainer.role))}>
                    {currentSelectedTrainer.initials}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase italic leading-none">{currentSelectedTrainer.fullName}</h3>
                    </div>
                    <p className={cn("text-[10px] font-bold uppercase tracking-widest leading-none mt-2", getRoleColor(currentSelectedTrainer.role).split(' ')[0])}>
                      {getRoleDisplayName(currentSelectedTrainer.role)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 px-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 cursor-pointer mr-3">Show on Hub Calendar</Label>
                  <Switch 
                    checked={currentSelectedTrainer.isVisibleOnCalendar !== false} 
                    onCheckedChange={() => handleToggleVisibility(currentSelectedTrainer.id!, currentSelectedTrainer.isVisibleOnCalendar ?? true)}
                    className="data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-slate-700"
                  />
                </div>
              </div>

              {/* Home Studio Assignment */}
              <div className="flex flex-col gap-2 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <Label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest leading-none">Primary Home Studio</Label>
                <Select value={currentSelectedTrainer.primaryHomeStudioId || 'unassigned'} onValueChange={(val) => handleUpdateHomeStudio(currentSelectedTrainer.id!, val)}>
                  <SelectTrigger className="h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white font-bold">
                    <SelectValue placeholder="Select Studio" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {studios.map(s => (
                      <SelectItem key={s.id} value={s.id!}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Accessible Studios (Cross-Training) */}
              <div className="flex flex-col gap-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <Label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest leading-none">Accessible Studios (Cross-Training)</Label>
                <div className="flex flex-wrap gap-2">
                  {(currentSelectedTrainer.accessibleStudioIds || []).length === 0 ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400 italic">No secondary locations assigned</span>
                  ) : (
                    (currentSelectedTrainer.accessibleStudioIds || []).map(studioId => {
                      const s = studios.find(st => st.id === studioId);
                      if (!s) return null;
                      return (
                        <div key={studioId} className="flex items-center gap-1.5 pl-3 pr-1 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/30 text-sky-900 dark:text-sky-300 font-bold text-xs">
                          <span>{s.name}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleAccessibleStudio(currentSelectedTrainer, studioId, false)}
                            className="p-1 text-sky-500 hover:text-sky-700 dark:hover:text-sky-200 hover:bg-sky-150 rounded-lg transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5 rotate-45" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {studios.filter(s => !(currentSelectedTrainer.accessibleStudioIds || []).includes(s.id!)).length > 0 && (
                  <div className="flex items-center gap-2 max-w-xs mt-1">
                    <Select 
                      value="" 
                      onValueChange={(val) => {
                        if (val) {
                          handleToggleAccessibleStudio(currentSelectedTrainer, val, true);
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white font-bold">
                        <SelectValue placeholder="+ Grant Studio Access" />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                        {studios
                          .filter(s => !(currentSelectedTrainer.accessibleStudioIds || []).includes(s.id!))
                          .map(s => (
                            <SelectItem key={s.id} value={s.id!}>{s.name}</SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  Toggle secondary locations this trainer teaches at so their scheduled bookings propagate across those live floor calendars.
                </p>
              </div>

              {/* iCal feed and MindBody integrations */}
              <div className="flex flex-col gap-2 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <Label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest leading-none">iCal Mindbody Sync URL</Label>
                {editingIcalId === currentSelectedTrainer.id ? (
                  <div className="space-y-3">
                    <Input
                      value={newIcalUrl}
                      onChange={e => setNewIcalUrl(e.target.value)}
                      placeholder="https://clients.mindbodyonline.com/api/..."
                      className="bg-white dark:bg-slate-900 font-mono text-xs border border-slate-200 dark:border-slate-800 h-10"
                    />
                    <div className="flex items-center gap-2">
                       <Button
                          disabled={isUpdatingIcal}
                          onClick={() => handleUpdateIcal(currentSelectedTrainer.id!)}
                          className="h-8 text-xs font-bold bg-[#10B981] hover:bg-emerald-600 dark:text-emerald-950"
                        >
                          Save URL
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setEditingIcalId(null)}
                          className="h-8 text-xs font-bold"
                        >
                          Cancel
                        </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                     <p className="text-xs font-mono text-slate-600 dark:text-slate-400 break-all pr-4">
                      {currentSelectedTrainer.thirdPartyCalendarUrl || 'No sync URL configured'}
                     </p>
                     <Button 
                        variant="outline"
                        onClick={() => {
                          setNewIcalUrl(currentSelectedTrainer.thirdPartyCalendarUrl || '');
                          setEditingIcalId(currentSelectedTrainer.id!);
                        }}
                        className="h-8 text-[10px] font-bold uppercase tracking-widest"
                     >
                        Edit
                     </Button>
                  </div>
                )}
                <p className="text-[10px] text-slate-400 italic">Paste the private trainer schedule iCal URL here to enable automated sync into the Daily Hub Calendar.</p>
              </div>

            </div>
          ) : (
            <div className="h-full min-h-[400px] bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 border-dashed rounded-[32px] flex items-center justify-center p-8">
              <div className="text-center space-y-3 max-w-sm">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center">
                  <UserCog className="w-8 h-8 text-sky-200 dark:text-sky-900" />
                </div>
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">Select a Team Member</p>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Choose a trainer from the roster list to view and manage their schedule and studio access.</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <CreateTrainerModal 
        isOpen={isCreateModalOpen} 
        onOpenChange={(open) => !open && setIsCreateModalOpen(false)} 
        onSubmit={handleCreateTrainer} 
      />

      {trainerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-lg font-black uppercase italic mb-2">Delete Trainer</h3>
            <p className="text-xs text-slate-500 font-medium mb-6">Are you sure you want to permanently delete {trainerToDelete.fullName}? This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setTrainerToDelete(null)} className="h-10 text-xs font-bold uppercase">Cancel</Button>
              <Button onClick={handleDeleteTrainer} className="h-10 text-xs font-bold uppercase bg-rose-500 hover:bg-rose-600 text-white">Delete Permanently</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
