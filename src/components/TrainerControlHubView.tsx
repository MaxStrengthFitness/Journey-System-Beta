import React, { useState } from 'react';
import Papa from 'papaparse';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  Timestamp, 
  query, 
  where, 
  getDocs,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, CheckCircle2, AlertCircle, Loader2, Database, Link, RefreshCcw, ShieldCheck, LogOut, Plus, Trash2, Shield, Settings2, Building2, HardDrive, Lock, ShieldAlert, MonitorPlay, Trash, UserCog, TrendingUp, Trophy, Sparkles, Megaphone, Gift, ChevronDown, ChevronUp, Users, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreateTrainerModal } from './CreateTrainerModal';
import { TrainerMachineEditor } from './TrainerMachineEditor';
import { Machine, Client, Trainer, WorkoutSession, ScheduleEntry, Studio, HubAnnouncement } from '../types';
import { findMatchingTrainer, normalizeName } from '../lib/sync-utils';
import { parseMachineSettings, isSessionValid } from '../lib/utils';

import { DataMigrationTool } from './DataMigrationTool';

export function TrainerControlHubView({ 
  trainers, 
  machines, 
  clients,
  sessions = [],
  authTrainer, 
  activeStudioId,
  isAdmin, 
  onAppCleanse,
  onSeedDemoClient,
  onRestoreMachines,
  onLogout,
  onReorderTrainers,
  setView,
  studios
}: { 
  trainers: Trainer[], 
  machines: Machine[], 
  clients: Client[],
  sessions?: WorkoutSession[],
  authTrainer: Trainer | null, 
  activeStudioId: string | null,
  isAdmin: boolean,
  onAppCleanse: () => void,
  onSeedDemoClient: () => void,
  onRestoreMachines: () => void,
  onLogout?: () => void,
  onReorderTrainers?: () => void,
  setView?: (v: string) => void,
  studios: Studio[]
}) {
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingTrainerId, setSyncingTrainerId] = useState<string | null>(null);
  const [isRestoringMachines, setIsRestoringMachines] = useState(false);
  const [isCleansingApp, setIsCleansingApp] = useState(false);

  // Announcements State
  const [announcements, setAnnouncements] = useState<HubAnnouncement[]>([]);
  const [isCreatingAnnouncement, setIsCreatingAnnouncement] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState<Partial<HubAnnouncement>>({
    title: '',
    shortContent: '',
    longContent: '',
    studioId: 'all',
    priority: 'low',
    isActive: true
  });

  // Layout State
  const [activeTab, setActiveTab] = useState<'operations' | 'facilities' | 'system'>('operations');

  // iCal Edit State
  const [editingIcalId, setEditingIcalId] = useState<string | null>(null);
  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [isUpdatingIcal, setIsUpdatingIcal] = useState(false);

  // New states for Create/Delete overrides
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [trainerToDelete, setTrainerToDelete] = useState<Trainer | null>(null);
  
  const [newStudioName, setNewStudioName] = useState('');
  const [isAddingStudio, setIsAddingStudio] = useState(false);

  const handleAddStudio = async () => {
    if (!newStudioName.trim()) return;
    setIsAddingStudio(true);
    try {
      await addDoc(collection(db, 'studios'), {
        name: newStudioName.trim(),
        createdAt: serverTimestamp()
      });
      setNewStudioName('');
    } catch (e: any) {
      alert("Error adding studio: " + e.message);
    } finally {
      setIsAddingStudio(false);
    }
  };

  const handleDeleteStudio = async (studioId: string) => {
    try {
      await deleteDoc(doc(db, 'studios', studioId));
    } catch (e: any) {
      alert("Error deleting studio: " + e.message);
    }
  };

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

  // Fetch Announcements
  React.useEffect(() => {
    // Basic query to avoid composite index requirements
    const q = query(collection(db, 'hub_announcements'));
    
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as HubAnnouncement));
      
      // Filter and sort in memory to be resilient to missing indexes
      const filtered = data
        .filter(a => a.isActive !== false) // Handle active only
        .filter(a => 
          a.studioId === 'all' || 
          (activeStudioId && a.studioId === activeStudioId)
        )
        .sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
        
      setAnnouncements(filtered);
    }, (error) => {
      console.error("Announcements collection error:", error);
    });
  }, [activeStudioId]);

  const handleCreateAnnouncement = async () => {
    if (!authTrainer || !newAnnouncement.title || !newAnnouncement.shortContent) return;
    setIsCreatingAnnouncement(true);
    try {
      await addDoc(collection(db, 'hub_announcements'), {
        ...newAnnouncement,
        authorId: authTrainer.id,
        authorName: authTrainer.fullName,
        createdAt: serverTimestamp(),
        isActive: true
      });
      setNewAnnouncement({
        title: '',
        shortContent: '',
        longContent: '',
        studioId: 'all',
        priority: 'low',
        isActive: true
      });
      alert("Announcement published!");
    } catch (err: any) {
      alert("Error creating announcement: " + err.message);
    } finally {
      setIsCreatingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      await deleteDoc(doc(db, 'hub_announcements', id));
    } catch (err: any) {
      alert("Error deleting: " + err.message);
    }
  };

  const handleToggleVisibility = async (trainerId: string, currentVal: boolean) => {
    try {
      await updateDoc(doc(db, 'trainers', trainerId), {
        isVisibleOnCalendar: !currentVal
      });
    } catch (e: any) {
      alert("Error updating visibility: " + e.message);
    }
  };

  const visibleTrainers = isAdmin 
    ? trainers 
    : trainers.filter(t => t.id === authTrainer?.id);

  const handleAllTrainersSync = async () => {
    setIsSyncingAll(true);
    try {
      const resp = await fetch('/api/trigger-master-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Failed to trigger sync');
      }
      
      const result = await resp.json();
      alert(result.message || "Master Sync completed successfully.");
    } catch (err: any) {
      alert("Mass sync failed: " + err.message);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleTrainerSync = async (trainerId: string) => {
    setSyncingTrainerId(trainerId);
    try {
      const resp = await fetch('/api/trigger-master-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainerId })
      });
      
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Sync failed');
      alert(result.message || "Trainer schedule sync completed.");
    } catch (err: any) {
      alert("Sync failed: " + err.message);
    } finally {
      setSyncingTrainerId(null);
    }
  };

  const handleUpdateHomeStudio = async (trainerId: string, studioId: string) => {
    try {
      await updateDoc(doc(db, 'trainers', trainerId), {
        primaryHomeStudioId: studioId,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      alert("Failed to update home studio: " + err.message);
    }
  };

  const handleToggleAccessibleStudio = async (trainer: Trainer, studioId: string, isAccessible: boolean) => {
    try {
      const current = trainer.accessibleStudioIds || [];
      const updated = isAccessible 
        ? [...new Set([...current, studioId])]
        : current.filter(id => id !== studioId);
        
      await updateDoc(doc(db, 'trainers', trainer.id!), {
        accessibleStudioIds: updated,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      alert("Failed to update accessible studios: " + err.message);
    }
  };

  const handleUpdateIcalUrl = async (trainerId: string, url: string | null) => {
    setIsUpdatingIcal(true);
    try {
      await updateDoc(doc(db, 'trainers', trainerId), {
        mindbody_ical_url: url,
        updatedAt: serverTimestamp()
      });
      setEditingIcalId(null);
      setNewIcalUrl('');
    } catch (err: any) {
      alert("Failed to update URL: " + err.message);
    } finally {
      setIsUpdatingIcal(false);
    }
  };

  const [isImporting, setIsImporting] = useState(false);
  const [isLegacyImporting, setIsLegacyImporting] = useState(false);
  const [importStats, setImportStats] = useState<{ success: number; failed: number } | null>(null);
  const [legacyStats, setLegacyStats] = useState<{ clients: number; sessions: number; logs: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [legacyError, setLegacyError] = useState<string | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setImportStats(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const data = results.data as any[];
          const importId = `import_${Date.now()}`;
          
          const [clientsSnap] = await Promise.all([
            getDocs(collection(db, 'clients'))
          ]);

          const clientMap: Record<string, string> = {};
          clientsSnap.forEach(d => {
            const c = d.data() as Client;
            clientMap[normalizeName(`${c.firstName} ${c.lastName}`)] = d.id;
          });

          let successCount = 0;
          let failedCount = 0;

          for (const row of data) {
            const clientName = row['Client Name'] || row['Client'] || row['Student'] || '';
            const mbTrainerName = row['Trainer'] || row['Staff'] || row['Teacher'] || '';
            const startTimeStr = row['Start Time'] || row['Start'] || '';
            const endTimeStr = row['End Time'] || row['End'] || '';
            const status = row['Status'] || 'Scheduled';
            const serviceName = row['Service'] || row['Class'] || 'Personal Training';

            if (!clientName || !startTimeStr) {
              failedCount++;
              continue;
            }

            const startTime = new Date(startTimeStr);
            const endTime = endTimeStr ? new Date(endTimeStr) : new Date(startTime.getTime() + 60 * 60 * 1000);

            if (isNaN(startTime.getTime())) {
              failedCount++;
              continue;
            }

            const clientId = clientMap[normalizeName(clientName)];
            const matchingTrainer = findMatchingTrainer(mbTrainerName, trainers);
            const trainerId = matchingTrainer?.id || null;

            await addDoc(collection(db, 'schedules'), {
              clientName,
              trainerName: mbTrainerName,
              clientId: clientId || null,
              trainerId,
              startTime: Timestamp.fromDate(startTime),
              endTime: Timestamp.fromDate(endTime),
              status,
              serviceName,
              source: 'MindBody',
              importId,
              createdAt: serverTimestamp(),
            });
            successCount++;
          }

          setImportStats({ success: successCount, failed: failedCount });
        } catch (err: any) {
          console.error('Import error:', err);
          setError(err.message || 'Failed to import schedule');
        } finally {
          setIsImporting(false);
          event.target.value = '';
        }
      },
      error: (err) => {
        setError(err.message);
        setIsImporting(false);
        event.target.value = '';
      }
    });
  };

  const handleLegacyFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLegacyImporting(true);
    setLegacyError(null);
    setLegacyStats(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const data = results.data as any[];
          let clientCount = 0;
          let sessionCount = 0;
          let logCount = 0;
          let failedCount = 0;

          const clientCache: Record<string, string> = {}; 
          const machineCache: Record<string, string> = {}; 

          const machinesSnap = await getDocs(collection(db, 'machines'));
          machinesSnap.forEach(doc => {
            const m = doc.data() as Machine;
            machineCache[m.name.toLowerCase()] = doc.id;
            if (m.fullName) machineCache[m.fullName.toLowerCase()] = doc.id;
          });

          const clientsSnap = await getDocs(collection(db, 'clients'));
          clientsSnap.forEach(doc => {
            const c = doc.data() as Client;
            clientCache[`${c.firstName} ${c.lastName}`.toLowerCase()] = doc.id;
          });

          for (const row of data) {
            const firstName = row['First Name'] || row['FirstName'] || '';
            const lastName = row['Last Name'] || row['LastName'] || '';
            const fullName = row['Client Name'] || row['Client'] || row['Full Name'] || `${firstName} ${lastName}`.trim();
            
            const machineName = row['Machine'] || row['Exercise'] || row['Equipment'] || '';
            const weight = row['Weight'] || row['Resistance'] || '';
            const reps = row['Reps'] || row['Repetitions'] || '';
            const dateStr = row['Date'] || row['Timestamp'] || row['Workout Date'] || '';
            const trainerInitials = (row['Trainer'] || row['Staff'] || row['Initials'] || 'FM').toUpperCase();
            const notes = row['Notes'] || row['Comments'] || '';
            const settingsStr = row['Settings'] || row['Machine Settings'] || '';

            if (!fullName || !machineName || !dateStr) {
              failedCount++;
              continue;
            }

            let clientId = clientCache[fullName.toLowerCase()];
            if (!clientId) {
              const nameParts = fullName.split(' ');
              const fName = nameParts[0] || 'Imported';
              const lName = nameParts.slice(1).join(' ') || 'Client';
              
              const clientDoc = await addDoc(collection(db, 'clients'), {
                firstName: fName,
                lastName: lName,
                gender: 'Other',
                height: row['Height'] || 'N/A',
                isActive: true,
                remainingSessions: 0,
                consultationCompleted: true,
                globalNotes: row['Client Notes'] || '',
                createdAt: serverTimestamp()
              });
              clientId = clientDoc.id;
              clientCache[fullName.toLowerCase()] = clientId;
              clientCount++;
            }

            const machineId = machineCache[machineName.toLowerCase()];
            if (!machineId) {
              failedCount++;
              continue;
            }

            const sessionDate = new Date(dateStr);
            if (isNaN(sessionDate.getTime())) {
              failedCount++;
              continue;
            }

            const q = query(
              collection(db, 'sessions'), 
              where('clientId', '==', clientId),
              where('date', '==', sessionDate.toISOString().split('T')[0])
            );
            const existingSessions = await getDocs(q);
            let sessionId: string;

            if (existingSessions.empty) {
              const sessionDoc = await addDoc(collection(db, 'sessions'), {
                clientId,
                sessionType: 'Standard',
                sessionNumber: 0, 
                date: sessionDate.toISOString().split('T')[0],
                trainerInitials,
                status: 'Completed',
                notes: row['Session Notes'] || '',
                createdAt: Timestamp.fromDate(sessionDate)
              });
              sessionId = sessionDoc.id;
              sessionCount++;
            } else {
              sessionId = existingSessions.docs[0].id;
            }

            await addDoc(collection(db, 'exerciseLogs'), {
              sessionId,
              clientId,
              machineId,
              weight,
              reps,
              notes,
              machineSettings: settingsStr ? parseMachineSettings(settingsStr) : {},
              createdAt: Timestamp.fromDate(sessionDate)
            });
            logCount++;

            if (settingsStr) {
              const settings = parseMachineSettings(settingsStr);
              
              await setDoc(doc(db, 'clientMachineSettings', `${clientId}_${machineId}`), {
                clientId,
                machineId,
                settings,
                updatedBy: trainerInitials,
                updatedAt: Timestamp.fromDate(sessionDate)
              }, { merge: true });
            }
          }

          setLegacyStats({ clients: clientCount, sessions: sessionCount, logs: logCount, failed: failedCount });
        } catch (err: any) {
          console.error('Legacy import error:', err);
          setLegacyError(err.message || 'Failed to import legacy data');
        } finally {
          setIsLegacyImporting(false);
          event.target.value = '';
        }
      },
      error: (err) => {
        setLegacyError(err.message);
        setIsLegacyImporting(false);
        event.target.value = '';
      }
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="max-w-6xl mx-auto w-full overflow-x-hidden px-4 sm:px-8 py-8"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black tracking-tight uppercase italic text-slate-900 dark:text-white">Hub Settings</h2>
          <p className="text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black tracking-widest leading-relaxed">
            Manage your schedule sync and standard studio settings.
          </p>
        </div>
        
        <div className="flex gap-2 ml-auto">
          {isAdmin && setView && (
            <Button 
              onClick={() => setView('owner-dashboard')}
              className="rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-500 hover:text-slate-900 dark:text-white dark:hover:text-slate-50 h-12 px-6 font-black uppercase text-[10px] tracking-widest shadow-sm dark:shadow-none"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Owner Portal
            </Button>
          )}
          {isAdmin && setView && (
            <Button 
              onClick={() => setView('leaderboard')}
              className="rounded-2xl bg-orange-50 dark:bg-slate-900 border border-orange-200 dark:border-orange-500/30 text-orange-600 dark:text-orange-500 hover:bg-orange-500 dark:hover:bg-orange-600 hover:text-white dark:hover:text-white h-12 px-6 font-black uppercase text-[10px] tracking-widest shadow-sm dark:shadow-none"
            >
              <Trophy className="w-4 h-4 mr-2" />
              Elite Leaderboard
            </Button>
          )}
          {isAdmin && setView && (
            <Button 
              onClick={() => setView('dashboard')}
              className="rounded-2xl bg-sky-50 text-sky-600 border border-sky-300 hover:bg-sky-500 hover:text-slate-900 dark:text-white dark:hover:text-slate-50 h-12 px-6 font-black uppercase text-[10px] tracking-widest shadow-sm dark:shadow-none"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Open Insights
            </Button>
          )}
          {onLogout && (
            <Button 
              variant="outline" 
              onClick={onLogout}
              className="rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800 h-12 px-6 font-black uppercase text-[10px] tracking-widest"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Switch Trainer
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Nav */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2">
          {[
            { id: 'operations', label: 'Staff & Operations', icon: UserCog },
            { id: 'facilities', label: 'Facilities & Floor', icon: Building2 },
            { id: 'system', label: 'Database & Architecture', icon: Database },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-3 px-4 py-4 rounded-2xl transition-all border text-left font-bold uppercase text-[11px] tracking-widest",
                  activeTab === tab.id 
                    ? "bg-sky-50 border-sky-500 text-sky-900 shadow-sm"
                    : "bg-slate-50 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-700"
                )}
              >
                <Icon className={cn("w-5 h-5", activeTab === tab.id ? "text-sky-600" : "opacity-50")} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 space-y-6">
          {activeTab === 'operations' && (
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl dark:shadow-none rounded-[32px] overflow-hidden">
              <CardHeader className="bg-slate-50 dark:bg-slate-950 pb-8 border-b border-slate-200 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-800 shadow-inner">
                      <UserCog className="w-6 h-6 text-sky-600" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Team Management</CardTitle>
                      <CardDescription className="text-slate-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-widest">Manage individual Schedule Sync URLs.</CardDescription>
                    </div>
                  </div>
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
                    {isAdmin && onReorderTrainers && (
                      <Button 
                        variant="outline" 
                        onClick={onReorderTrainers}
                        className="rounded-xl border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white h-10 px-4 font-black uppercase text-[10px] tracking-widest gap-2"
                      >
                        <RefreshCcw className="w-3 h-3" />
                        Sort
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="space-y-6">
                  {visibleTrainers.length === 0 ? (
                    <p className="text-center py-8 text-slate-500 dark:text-slate-400 font-medium italic">No matching trainer records found.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {visibleTrainers.map((t) => (
                        <div key={t.id} className="p-6 bg-slate-50 dark:bg-slate-950 rounded-[24px] border border-slate-200 dark:border-slate-800 space-y-6 flex flex-col justify-between relative overflow-hidden group">
                          {isAdmin && (
                            <button 
                              onClick={() => setTrainerToDelete(t)}
                              className="absolute top-4 right-4 p-2 text-slate-500 dark:text-slate-400 hover:text-rose-400 hover:bg-rose-50 rounded-xl transition-all"
                              title="Delete Trainer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        
                          <div className="flex items-start gap-4">
                            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl italic mt-1 shrink-0", (t.role === 'StudioOwner' || t.role === 'Admin' || t.role === 'Overseer') || (t.fullName === 'Austin Jurgens' && isAdmin) ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-500 border border-orange-200 dark:border-orange-500/30' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800')}>
                               {t.initials}
                            </div>
                            <div className="flex flex-col flex-1 pr-8">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-black text-slate-900 dark:text-white uppercase italic leading-none">{t.fullName}</p>
                                {(t.role === 'StudioOwner' || t.role === 'Admin' || t.role === 'Overseer') && <span className="bg-orange-50 dark:bg-orange-500/10 text-orange-500 border border-orange-200 dark:border-orange-500/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">Owner</span>}
                                {t.fullName === 'Austin Jurgens' && isAdmin && (t.role !== 'StudioOwner' && t.role !== 'Admin' && t.role !== 'Overseer') && <span className="bg-sky-50 dark:bg-sky-500/10 text-sky-400 border border-sky-200 dark:border-sky-500/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">System Admin</span>}
                              </div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 leading-none mt-2">
                                {(t.role === 'StudioOwner' || t.role === 'Admin' || t.role === 'Overseer') || (t.fullName === 'Austin Jurgens' && isAdmin) ? 'System Admin' : 'Performance Trainer'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 cursor-pointer">Show on Hub Calendar</Label>
                            <Switch 
                              checked={t.isVisibleOnCalendar !== false} 
                              onCheckedChange={() => handleToggleVisibility(t.id!, t.isVisibleOnCalendar ?? true)}
                              className="data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-slate-700"
                            />
                          </div>

                          <div className="flex flex-col gap-2 p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <Label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest">Primary Home Studio</Label>
                            <Select value={t.primaryHomeStudioId || 'unassigned'} onValueChange={(val) => handleUpdateHomeStudio(t.id!, val)}>
                              <SelectTrigger className="h-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white">
                                <SelectValue placeholder="Select Studio" />
                              </SelectTrigger>
                              <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {studios.map(s => (
                                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <Label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest leading-none">Accessible Studios</Label>
                            <div className="space-y-3">
                              {studios.map(s => (
                                <div key={s.id} className="flex items-center justify-between col-span-1 rounded-xl bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-200 dark:border-slate-800">
                                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{s.name}</span>
                                  <Switch 
                                    checked={(t.accessibleStudioIds || []).includes(s.id!)}
                                    onCheckedChange={(checked) => handleToggleAccessibleStudio(t, s.id!, checked)}
                                    className="scale-75 data-[state=checked]:bg-sky-500 data-[state=unchecked]:bg-slate-700"
                                  />
                                </div>
                              ))}
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Toggle all secondary locations this trainer teaches at to allow their schedules to appear on that studio's calendar.</p>
                          </div>

                          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                  <RefreshCcw className="w-3.5 h-3.5" />
                                  <h4 className="font-bold uppercase text-[9px] tracking-widest leading-none">MindBody Sync URL</h4>
                                </div>
                                {t.mindbody_ical_url && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    disabled={syncingTrainerId === t.id}
                                    onClick={() => handleTrainerSync(t.id!)}
                                    className="h-6 text-[9px] flex items-center px-2 py-0 font-black uppercase text-sky-600 hover:text-sky-600 hover:bg-sky-50 rounded-md"
                                  >
                                    {syncingTrainerId === t.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                    Sync Now
                                  </Button>
                                )}
                              </div>

                              {editingIcalId === t.id ? (
                                <div className="flex flex-col gap-2">
                                  <Input 
                                    placeholder="https://..." 
                                    value={newIcalUrl}
                                    onChange={e => setNewIcalUrl(e.target.value)}
                                    className="h-8 rounded-lg bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white px-2 focus-visible:ring-orange-500"
                                  />
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => setEditingIcalId(null)} className="h-6 px-2 font-bold rounded-md text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white">Cancel</Button>
                                    <Button 
                                      size="sm"
                                      onClick={() => handleUpdateIcalUrl(t.id!, newIcalUrl)}
                                      disabled={isUpdatingIcal}
                                      className="bg-[#10B981] h-6 px-3 rounded-md font-black uppercase text-[9px] hover:bg-[#10B981]/80 text-slate-900 dark:text-white"
                                    >
                                      {isUpdatingIcal ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2 overflow-hidden group/link bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                                  {t.mindbody_ical_url ? (
                                    <>
                                      <Link className="w-3 h-3 text-slate-500 dark:text-slate-400 shrink-0" />
                                      <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium truncate flex-1">{t.mindbody_ical_url}</span>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => {
                                          setEditingIcalId(t.id!);
                                          setNewIcalUrl(t.mindbody_ical_url || '');
                                        }}
                                        className="h-6 w-6 p-0 rounded-md shrink-0 opacity-0 group-hover/link:opacity-100 border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white"
                                      >
                                        <RefreshCcw className="w-3 h-3" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium italic select-none">No feed configured</span>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => {
                                          setEditingIcalId(t.id!);
                                          setNewIcalUrl('');
                                        }}
                                        className="h-6 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white rounded-md px-3 font-black uppercase text-[9px]"
                                      >
                                        Add Link
                                      </Button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'system' && (
            <TrainerMachineEditor machines={machines} />
          )}

          {activeTab === 'operations' && (isAdmin || (authTrainer?.role === 'StudioOwner' || authTrainer?.role === 'Admin' || authTrainer?.role === 'Overseer')) && (
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl dark:shadow-none rounded-[32px] overflow-hidden">
              <CardHeader className="bg-slate-50 dark:bg-slate-950 pb-8 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center border border-sky-200 shadow-inner">
                    <Megaphone className="w-6 h-6 text-sky-400" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Hub Announcements</CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-widest">Share fruitful information with your team.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                {/* Create New Announcement */}
                <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-[24px] border border-slate-200 dark:border-slate-800 space-y-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase italic">Draft New Message</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Headline</Label>
                      <Input 
                        value={newAnnouncement.title}
                        onChange={e => setNewAnnouncement(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="e.g. Master the Turnaround Pause"
                        className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Audience</Label>
                      <Select 
                        value={newAnnouncement.studioId} 
                        onValueChange={v => setNewAnnouncement(prev => ({ ...prev, studioId: v }))}
                      >
                        <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                          <SelectItem value="all">Company Wide (All Trainers)</SelectItem>
                          {studios.map(s => (
                            <SelectItem key={s.id} value={s.id!}>Just {s.name} Trainers</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Short Snippet (Viewed at Top)</Label>
                    <Input 
                      value={newAnnouncement.shortContent}
                      onChange={e => setNewAnnouncement(prev => ({ ...prev, shortContent: e.target.value }))}
                      placeholder="e.g. Quick tip on why the 3-second turnaround pause is critical for neural recruitment..."
                      className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Full Details (Expanded View)</Label>
                    <Textarea 
                      value={newAnnouncement.longContent}
                      onChange={e => setNewAnnouncement(prev => ({ ...prev, longContent: e.target.value }))}
                      placeholder="Share the full depth of your knowledge here..."
                      className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white min-h-[120px]"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Priority:</Label>
                        <Select 
                          value={newAnnouncement.priority} 
                          onValueChange={(v: any) => setNewAnnouncement(prev => ({ ...prev, priority: v }))}
                        >
                          <SelectTrigger className="w-24 h-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-[10px] uppercase font-black">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                            <SelectItem value="low">Standard</SelectItem>
                            <SelectItem value="medium">Growth</SelectItem>
                            <SelectItem value="high">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button 
                      onClick={handleCreateAnnouncement}
                      disabled={isCreatingAnnouncement || !newAnnouncement.title || !newAnnouncement.shortContent}
                      className="bg-sky-600 hover:bg-sky-700 text-slate-900 dark:text-white font-black uppercase text-[10px] tracking-widest h-10 px-6 rounded-xl gap-2"
                    >
                      {isCreatingAnnouncement ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Publish to Hub
                    </Button>
                  </div>
                </div>

                {/* Manage Active Announcements */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-4 px-2">Active Messages</h3>
                  {announcements.length === 0 ? (
                    <div className="py-12 border-slate-200 dark:border-slate-800 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 italic text-sm">
                      No active announcements found.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {announcements.map(a => (
                        <div key={a.id} className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between group">
                          <div className="flex items-start gap-4">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center border",
                              a.priority === 'high' ? "bg-rose-50 border-rose-200 text-rose-500" :
                              a.priority === 'medium' ? "bg-amber-50 border-amber-200 text-amber-500" :
                              "bg-sky-50 border-sky-200 text-sky-500"
                            )}>
                              <Megaphone className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-slate-900 dark:text-white italic text-base">{a.title}</h4>
                                <span className="text-[8px] bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded uppercase font-black border border-slate-200 dark:border-slate-800">
                                  {a.studioId === 'all' ? 'Universal' : 'Studio Specific'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md line-clamp-1">{a.shortContent}</p>
                              <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-2 font-bold uppercase tracking-widest">
                                By {a.authorName} • {a.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'}
                              </p>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            onClick={() => handleDeleteAnnouncement(a.id!)}
                            className="h-10 w-10 p-0 text-slate-600 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'facilities' && (
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl dark:shadow-none rounded-[32px] overflow-hidden">
              <CardHeader className="bg-slate-50 dark:bg-slate-950 pb-8 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center border border-emerald-200 shadow-inner">
                      <MonitorPlay className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Live Floor Status</CardTitle>
                      <CardDescription className="text-slate-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-widest">Active sessions and concurrency monitoring.</CardDescription>
                    </div>
                  </div>
                  <div className="px-4 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest animate-pulse">● System Live</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Total Active</p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white italic">{sessions.filter(s => s.status === 'In-Progress' && isSessionValid(s)).length}</p>
                  </div>
                  <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Stale/Expired</p>
                    <p className="text-3xl font-black text-amber-500 italic">{sessions.filter(s => s.status === 'In-Progress' && !isSessionValid(s)).length}</p>
                  </div>
                  <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Current Sync</p>
                    <p className="text-3xl font-black text-sky-600 italic">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 px-2">Active Sessions (Lazy Cleanup Applied)</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {sessions.filter(s => s.status === 'In-Progress').map(session => {
                      const isValid = isSessionValid(session);
                      const client = clients.find(c => c.id === session.clientId);
                      return (
                        <div key={session.id} className={cn(
                          "p-4 rounded-2xl border transition-all flex items-center justify-between group",
                          isValid ? "bg-white border-slate-200 dark:border-slate-800" : "bg-slate-50 border-amber-500/30 opacity-60 grayscale"
                        )}>
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm border",
                              isValid ? "bg-slate-100 text-slate-800 text-sky-600 border-slate-200 dark:border-slate-800" : "bg-amber-50 text-amber-500 border-amber-200"
                            )}>
                              {client ? `${client.firstName[0]}${client.lastName[0]}` : "UN"}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">{client ? `${client.firstName} ${client.lastName}` : "Unassigned Session"}</h4>
                                {!isValid && <span className="bg-amber-50 text-amber-500 px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase">Abandoned</span>}
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2 mt-0.5">
                                <Users className="w-3 h-3" /> TR: {session.trainerInitials || "---"} 
                                <span className="text-slate-600 dark:text-slate-400">•</span>
                                <Clock className="w-3 h-3" /> Last Active: {session.lastHeartbeatAt ? (session.lastHeartbeatAt.toDate?.() || new Date(session.lastHeartbeatAt)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently Started"}
                              </p>
                            </div>
                          </div>
                          {!isValid && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                if (window.confirm("Manually terminate this abandoned session?")) {
                                  try {
                                    await updateDoc(doc(db, 'sessions', session.id!), { status: 'Completed', updatedAt: serverTimestamp() });
                                  } catch (e: any) { alert(e.message); }
                                }
                              }}
                              className="h-9 px-4 rounded-xl bg-amber-50 text-amber-500 hover:bg-amber-500/20 font-black uppercase text-[9px] tracking-widest border border-amber-200 opacity-0 group-hover:opacity-100"
                            >
                              Sweep Session
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    {sessions.filter(s => s.status === 'In-Progress').length === 0 && (
                      <div className="py-12 border-slate-200 dark:border-slate-800 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 italic text-sm">
                        Floor is currently empty.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'facilities' && (
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl dark:shadow-none rounded-[32px] overflow-hidden">
              <CardHeader className="bg-slate-50 dark:bg-slate-950 pb-8 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-200 shadow-inner">
                    <Building2 className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Studio Configuration</CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-widest">Manage available home studios for clients.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col gap-4 p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className="space-y-1">
                      <Label className="text-sm font-bold text-slate-900 dark:text-white">Studios</Label>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Add multiple studios to support franchise locations.</p>
                    </div>
                    
                    {studios.length > 0 ? (
                      <div className="space-y-2">
                        {studios.map(studio => (
                          <div key={studio.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{studio.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-500 dark:text-slate-400 hover:text-red-400"
                              onClick={() => handleDeleteStudio(studio.id!)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-sm italic bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 border-dashed">
                        No studios added yet.
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3">
                      <Input 
                        value={newStudioName}
                        onChange={e => setNewStudioName(e.target.value)}
                        placeholder="Enter studio name (e.g. Solon, Ohio)"
                        className="h-10 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus-visible:ring-orange-500"
                      />
                      <Button 
                        onClick={handleAddStudio} 
                        disabled={!newStudioName.trim() || isAddingStudio}
                        className="bg-sky-500 dark:bg-sky-600text-white rounded-xl h-10 px-4 whitespace-nowrap"
                      >
                        {isAddingStudio ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                        Add Studio
                      </Button>
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>
          )}
          {activeTab === 'system' && (
            <div className="space-y-8">
              <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl dark:shadow-none rounded-[32px] overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-slate-950 pb-8 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-800 shadow-inner">
                      <HardDrive className="w-6 h-6 text-sky-600" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Data & Telemetry</CardTitle>
                      <CardDescription className="text-slate-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-widest">Network status and synchronization.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl gap-6">
                    <div className="space-y-2">
                       <Label className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                         <Sparkles className="w-4 h-4 text-amber-400" />
                         Interface Theme
                       </Label>
                       <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-sm">
                         Toggle between dark mode, light mode, or system default via the header control.
                       </p>
                    </div>
                    <div className="flex bg-white dark:bg-slate-900 rounded-xl p-1 border border-slate-200 dark:border-slate-800">
                       <div className="px-4 py-2 text-xs font-black uppercase tracking-widest text-sky-600 bg-sky-600 text-slate-900 dark:text-white rounded-lg shadow-inner">
                         See Header Icon
                       </div>
                    </div>
                  </div>

                  {/* Cloud Sync Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-slate-50 dark:bg-slate-950 border border-sky-200 rounded-2xl gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-[#10B981] shadow-none"></div>
                         <Label className="text-sm font-bold text-slate-900 dark:text-white">Cloud Sync Active</Label>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-sm">All changes sync gracefully. Force sync if network dropouts occur.</p>
                    </div>
                    <Button 
                      onClick={handleAllTrainersSync} 
                      disabled={isSyncingAll}
                      className="h-12 px-6 rounded-xl font-black bg-sky-600 text-slate-900 dark:text-white hover:bg-sky-700 text-slate-900 dark:text-white text-slate-900 dark:text-white shadow-lg text-[10px] uppercase tracking-widest shrink-0"
                    >
                      {isSyncingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2 text-sky-600" />}
                      Force Sync All
                    </Button>
                  </div>

                  <div className="h-px bg-slate-700/50 w-full my-6"></div>

                  <div className="grid gap-4">
                    <Label htmlFor="legacy-upload" className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">Historical Workout Data (CSV)</Label>
                    <div className="relative">
                      <Input 
                        id="legacy-upload" 
                        type="file" 
                        accept=".csv" 
                        onChange={handleLegacyFileUpload}
                        disabled={isLegacyImporting}
                        className="h-24 border-slate-200 dark:border-slate-800 border-dashed border-slate-300 dark:border-slate-700 bg-white/30 rounded-2xl cursor-pointer file:hidden flex items-center justify-center text-center font-bold text-slate-500 dark:text-slate-400 hover:border-orange-500/50 hover:bg-slate-50 transition-all"
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {isLegacyImporting ? (
                          <div className="flex items-center gap-3">
                            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                            <span className="text-lg font-black uppercase italic text-orange-500">Processing...</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Click to select CSV</span>
                            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">Legacy/FileMaker Format</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {legacyStats && (
                    <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-4">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0 mt-1" />
                      <div>
                        <p className="font-black text-emerald-400 text-lg">Import Success</p>
                        <div className="text-emerald-200/80 font-medium grid grid-cols-2 gap-x-8 gap-y-1 mt-2 text-xs">
                          <p>Clients: <span className="font-black text-emerald-400">{legacyStats.clients}</span></p>
                          <p>Sessions: <span className="font-black text-emerald-400">{legacyStats.sessions}</span></p>
                          <p>Logs: <span className="font-black text-emerald-400">{legacyStats.logs}</span></p>
                          <p>Skipped: <span className="font-black text-emerald-400">{legacyStats.failed}</span></p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Destructive Actions */}
              {isAdmin && (
                <>
                <Card className="border border-rose-200 bg-white dark:bg-slate-900 shadow-2xl dark:shadow-none rounded-[32px] overflow-hidden">
                  <CardHeader className="bg-rose-50 pb-8 border-b border-rose-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center border border-rose-200">
                        <Trash className="w-6 h-6 text-rose-500" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Danger Zone</CardTitle>
                        <CardDescription className="text-rose-400/80 font-medium uppercase text-[10px] tracking-widest">Critical database maintenance.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 space-y-4">
                     <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-rose-50 border border-rose-200 rounded-3xl gap-6">
                        <div className="space-y-1">
                          <p className="font-black text-slate-900 dark:text-white uppercase italic tracking-tight">Factory Reset</p>
                          <p className="text-[10px] font-black text-rose-400/70 uppercase">
                            Wipe session data or re-push standard equipment defaults.
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4">
                          <Button 
                            onClick={async () => {
                              setIsRestoringMachines(true);
                              try {
                                await onRestoreMachines();
                              } finally {
                                setIsRestoringMachines(false);
                              }
                            }}
                            disabled={isRestoringMachines}
                            variant="outline"
                            className="h-12 px-6 rounded-xl font-black border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:bg-slate-100 text-slate-900 dark:text-white text-[10px] uppercase tracking-widest"
                          >
                            Re-Sync Masters
                          </Button>
                          <Button 
                            onClick={() => {
                               if (window.confirm("Are you sure you want to clear the local cache? This will force a fresh pull of data next startup.")) {
                                  alert("Local cache cleared.");
                               }
                            }}
                            variant="outline"
                            className="h-12 px-6 rounded-xl font-black border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:bg-slate-100 text-slate-900 dark:text-white text-[10px] uppercase tracking-widest"
                          >
                            Clear Local Cache
                          </Button>
                          <Button 
                            onClick={async () => {
                              setIsCleansingApp(true);
                              try {
                                await onAppCleanse();
                              } finally {
                                setIsCleansingApp(false);
                              }
                            }}
                            disabled={isCleansingApp}
                            className="h-12 px-6 rounded-xl font-black bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-900/20 text-slate-900 dark:text-white border-none text-[10px] uppercase tracking-widest"
                          >
                            {isCleansingApp ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                            Total Cleanse
                          </Button>
                        </div>
                     </div>
                  </CardContent>
                </Card>

                <DataMigrationTool />
                </>
              )}
            </div>
          )}

        </div>
      </div>

      <CreateTrainerModal 
        isOpen={isCreateModalOpen} 
        onOpenChange={setIsCreateModalOpen} 
        onSubmit={handleCreateTrainer}
      />

      {/* Delete Confirmation Modal */}
      {trainerToDelete && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl dark:shadow-none flex flex-col items-center text-center space-y-6"
          >
            <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
              <AlertCircle className="w-8 h-8 text-rose-500" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white italic tracking-tighter uppercase">Delete Trainer?</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed">
                Are you sure you want to remove <strong className="text-slate-900 dark:text-white">{trainerToDelete?.fullName}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <Button onClick={() => setTrainerToDelete(null)} variant="outline" className="flex-1 rounded-xl h-12 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white hover:bg-slate-100 text-slate-900 dark:text-white font-bold uppercase tracking-widest text-[10px]">
                Cancel
              </Button>
              <Button onClick={handleDeleteTrainer} variant="destructive" className="flex-1 rounded-xl h-12 bg-rose-600 hover:bg-rose-700 text-slate-900 dark:text-white font-black uppercase tracking-widest shadow-sm dark:shadow-none border-none text-[10px]">
                Confirm
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
