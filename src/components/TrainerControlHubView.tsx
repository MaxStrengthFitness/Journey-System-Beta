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
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, CheckCircle2, AlertCircle, Loader2, Database, Link, RefreshCcw, ShieldCheck, LogOut, Plus, Trash2, Shield, Settings2, Building2, HardDrive, Lock, ShieldAlert, MonitorPlay, Trash, UserCog, TrendingUp, Trophy, Sparkles, Megaphone, Gift, ChevronDown, ChevronUp, Users, Clock, User, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreateTrainerModal } from './CreateTrainerModal';
import { TrainerMachineEditor } from './TrainerMachineEditor';
import { Machine, Client, Trainer, WorkoutSession, ScheduleEntry, Studio, HubAnnouncement } from '../types';
import { useTheme } from './ThemeProvider';
import { Bug } from 'lucide-react';
import { findMatchingTrainer, normalizeName, cleanAlphanumeric } from '../lib/sync-utils';
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
  const [lifespan, setLifespan] = useState('24h');
  const [newAnnouncement, setNewAnnouncement] = useState<Partial<HubAnnouncement>>({
    title: '',
    shortContent: '',
    longContent: '',
    studioId: 'all',
    priority: 'low',
    isActive: true
  });

  // Layout State
  const [activeTab, setActiveTab] = useState<'equipment_settings' | 'app_settings'>('equipment_settings');

  // iCal Edit State
  const [editingIcalId, setEditingIcalId] = useState<string | null>(null);

  const { theme, setTheme } = useTheme();

  const [bugReport, setBugReport] = useState({ issueType: 'UI Problem', description: '' });
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);

  const submitBug = async () => {
    if (!bugReport.description) return;
    setIsSubmittingBug(true);
    try {
      await addDoc(collection(db, 'bug_reports'), {
        ...bugReport,
        userId: authTrainer?.id || 'unknown',
        userEmail: authTrainer?.email || 'unknown',
        userName: authTrainer?.fullName || 'unknown',
        studioId: authTrainer?.primaryHomeStudioId || 'unassigned',
        createdAt: serverTimestamp(),
        browser: window.navigator.userAgent,
        platform: window.navigator.platform,
        status: 'open'
      });
      setBugReport({ issueType: 'UI Problem', description: '' });
      alert("Bug report submitted successfully! Thank you.");
    } catch (e: any) {
      alert("Failed to submit bug report: " + e.message);
    } finally {
      setIsSubmittingBug(false);
    }
  };
  const [newIcalUrl, setNewIcalUrl] = useState('');
  const [isUpdatingIcal, setIsUpdatingIcal] = useState(false);

  // New states for Create/Delete overrides
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [trainerToDelete, setTrainerToDelete] = useState<Trainer | null>(null);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [trainerSearchQuery, setTrainerSearchQuery] = useState('');
  
  const [newStudioName, setNewStudioName] = useState('');
  const [isAddingStudio, setIsAddingStudio] = useState(false);
  const [isEquipmentExpanded, setIsEquipmentExpanded] = useState(false);

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

  // Fetch Announcements (Hybrid One-Time Fetch to save read quota)
  React.useEffect(() => {
    let active = true;
    const fetchAnnouncements = async () => {
      try {
        const q = query(collection(db, 'hub_announcements'));
        const snap = await getDocs(q);
        if (!active) return;
        
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as HubAnnouncement));
        
        // Filter and sort in memory to be resilient to missing indexes
        const filtered = data
          .filter(a => a.isActive !== false) // Handle active only
          .filter((a) => {
             if (a.expiresAt) {
               const expTime = a.expiresAt.toDate ? a.expiresAt.toDate().getTime() : (typeof a.expiresAt === 'number' ? a.expiresAt : 0);
               if (expTime > 0 && expTime < Date.now()) return false;
             }
             return true;
          })
          .filter(a => 
            a.targetScope === 'universal' ||
            a.studioId === 'all' || 
            (activeStudioId && a.studioId === activeStudioId)
          )
          .sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;
          });
          
        setAnnouncements(filtered);
      } catch (error) {
        console.error("Announcements collection error:", error);
      }
    };

    fetchAnnouncements();
    return () => {
      active = false;
    };
  }, [activeStudioId]);

  const handleCreateAnnouncement = async () => {
    if (!authTrainer || !newAnnouncement.title || !newAnnouncement.shortContent) return;
    setIsCreatingAnnouncement(true);
    try {
      const isSuperUser = isAdmin || authTrainer?.role === 'Admin' || authTrainer?.role === 'Overseer';
      const assignedStudioIds = !isSuperUser ? [authTrainer?.primaryHomeStudioId, ...(authTrainer?.accessibleStudioIds || [])].filter(Boolean) : [];
      const filteredStudiosForAnnouncement = studios.filter(s => isSuperUser || (assignedStudioIds as string[]).includes(s.id!));
      const defaultStudioId = isSuperUser ? 'all' : (filteredStudiosForAnnouncement[0]?.id || '');
      const finalStudioId = newAnnouncement.studioId === 'all' && !isSuperUser ? defaultStudioId : (newAnnouncement.studioId || defaultStudioId);
      const isUniversal = finalStudioId === 'all';
      
      const now = new Date();
      let expiresAt = new Date(now);
      if (lifespan === '24h') expiresAt.setHours(expiresAt.getHours() + 24);
      else if (lifespan === '1w') expiresAt.setDate(expiresAt.getDate() + 7);
      else expiresAt.setMonth(expiresAt.getMonth() + 1);

      const docRef = await addDoc(collection(db, 'hub_announcements'), {
        ...newAnnouncement,
        studioId: finalStudioId,
        targetScope: isUniversal ? 'universal' : 'studio',
        type: newAnnouncement.type || 'news',
        authorId: authTrainer.id,
        authorName: authTrainer.fullName,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
        isActive: true,
        readBy: []
      });
      
      const createdObj: HubAnnouncement = {
        id: docRef.id,
        title: newAnnouncement.title,
        shortContent: newAnnouncement.shortContent,
        longContent: newAnnouncement.longContent || '',
        authorId: authTrainer.id!,
        authorName: authTrainer.fullName,
        studioId: finalStudioId,
        targetScope: isUniversal ? 'universal' : 'studio',
        type: newAnnouncement.type || 'news',
        createdAt: { toMillis: () => Date.now(), toDate: () => new Date() }, // Local mock of timestamp
        expiresAt: expiresAt,
        isActive: true,
        priority: newAnnouncement.priority as any,
        readBy: []
      };

      setAnnouncements(prev => [createdObj, ...prev]);

      setNewAnnouncement({
        title: '',
        shortContent: '',
        longContent: '',
        studioId: 'all',
        priority: 'low',
        type: 'news',
        isActive: true
      });
      alert("Announcement published!");
    } catch (err: any) {
      alert("Error creating announcement: " + err.message);
    } finally {
      setIsCreatingAnnouncement(false);
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

  const filteredTrainers = visibleTrainers.filter(t => 
    t.fullName.toLowerCase().includes(trainerSearchQuery.toLowerCase())
  );

  const currentSelectedTrainer = trainers.find(t => t.id === selectedTrainer?.id) || (filteredTrainers.length > 0 ? filteredTrainers[0] : null);

  const handleAllTrainersSync = async () => {
    setIsSyncingAll(true);
    try {
      const { executeFrontendMasterSync } = await import('../lib/frontend-sync');
      await executeFrontendMasterSync(null, false, trainers, clients, studios);
      alert("Master Sync completed successfully.");
    } catch (err: any) {
      alert("Mass sync failed: " + err.message);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleTrainerSync = async (trainerId: string) => {
    setSyncingTrainerId(trainerId);
    try {
      const { executeFrontendMasterSync } = await import('../lib/frontend-sync');
      await executeFrontendMasterSync(trainerId, false, trainers, clients, studios);
      alert("Trainer schedule sync completed.");
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
            const fullName = `${c.firstName || ''} ${c.lastName || ''}`;
            clientMap[normalizeName(fullName)] = d.id!;
            clientMap[cleanAlphanumeric(fullName)] = d.id!;
            if (c.mindbody_name) {
              clientMap[normalizeName(c.mindbody_name)] = d.id!;
              clientMap[cleanAlphanumeric(c.mindbody_name)] = d.id!;
            }
          });

          let successCount = 0;
          let failedCount = 0;

          let batch = writeBatch(db);
          let opCount = 0;

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

            const startTime = new Date(startTimeStr.replace(' ', 'T'));
            const endTime = endTimeStr ? new Date(endTimeStr.replace(' ', 'T')) : new Date(startTime.getTime() + 60 * 60 * 1000);

            if (isNaN(startTime.getTime())) {
              failedCount++;
              continue;
            }

            const clientId = clientMap[normalizeName(clientName)] || clientMap[cleanAlphanumeric(clientName)];
            const matchingTrainer = findMatchingTrainer(mbTrainerName, trainers);
            const trainerId = matchingTrainer?.id || null;

            const docRef = doc(collection(db, 'schedules'));
            batch.set(docRef, {
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
            opCount++;

            if (opCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }

          if (opCount > 0) {
            await batch.commit();
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

          let batch = writeBatch(db);
          let opCount = 0;
          const localSessionCache: Record<string, string> = {};

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
              
              const clientRef = doc(collection(db, 'clients'));
              clientId = clientRef.id;
              
              batch.set(clientRef, {
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
              clientCache[fullName.toLowerCase()] = clientId;
              clientCount++;
              opCount++;
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

            // High Performance Cache for Session Retrieval within loop
            let sessionId: string;
            const sessionCacheKey = `${clientId}_${sessionDate.toISOString().split('T')[0]}`;
            
            if (localSessionCache[sessionCacheKey]) {
              sessionId = localSessionCache[sessionCacheKey];
            } else {
              const q = query(
                collection(db, 'sessions'), 
                where('clientId', '==', clientId),
                where('date', '==', sessionDate.toISOString().split('T')[0])
              );
              const existingSessions = await getDocs(q);
              
              if (existingSessions.empty) {
                const sessionRef = doc(collection(db, 'sessions'));
                batch.set(sessionRef, {
                  clientId,
                  sessionType: 'Standard',
                  sessionNumber: 0, 
                  date: sessionDate.toISOString().split('T')[0],
                  trainerInitials,
                  status: 'Completed',
                  notes: row['Session Notes'] || '',
                  createdAt: Timestamp.fromDate(sessionDate)
                });
                sessionId = sessionRef.id;
                sessionCount++;
                opCount++;
              } else {
                sessionId = existingSessions.docs[0].id;
              }
              localSessionCache[sessionCacheKey] = sessionId;
            }

            const logRef = doc(collection(db, 'exerciseLogs'));
            batch.set(logRef, {
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
            opCount++;

            if (settingsStr) {
              const settings = parseMachineSettings(settingsStr);
              const settingsRef = doc(db, 'clientMachineSettings', `${clientId}_${machineId}`);
              
              batch.set(settingsRef, {
                clientId,
                machineId,
                settings,
                updatedBy: trainerInitials,
                updatedAt: Timestamp.fromDate(sessionDate)
              }, { merge: true });
              opCount++;
            }

            if (opCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }

          if (opCount > 0) {
            await batch.commit();
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
          {setView && authTrainer && ['Admin', 'Overseer', 'StudioOwner', 'HeadTrainer'].includes(authTrainer.role || '') && (
            <Button 
              onClick={() => setView('owner-dashboard')}
              className="rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:border-indigo-800/60 dark:text-indigo-300 dark:hover:text-white dark:hover:bg-indigo-900/50 h-12 px-6 font-black uppercase text-[10px] tracking-widest shadow-sm dark:shadow-none transition-colors"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Owner Portal
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
            { id: 'equipment_settings', label: 'Hardware Settings', icon: MonitorPlay },
            { id: 'app_settings', label: 'App Settings', icon: Settings },
          ].filter(tab => {
            if (tab.id === 'app_settings') {
              return isAdmin || authTrainer?.role === 'Admin' || authTrainer?.role === 'Overseer' || authTrainer?.role === 'StudioOwner';
            }
            return true;
          }).map(tab => {
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
          {false && (
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
                                      (t.role === 'StudioOwner' || t.role === 'Admin' || t.role === 'Overseer') || (t.fullName === 'Austin Jurgens' && isAdmin)
                                        ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-500 border border-orange-200 dark:border-orange-500/30' 
                                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                                    )}>
                                      {t.initials}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-black text-slate-900 dark:text-white uppercase italic truncate">{t.fullName}</p>
                                      <p className="text-[9px] font-bold uppercase tracking-widest text-sky-600 truncate mt-0.5">
                                        {(t.role === 'StudioOwner' || t.role === 'Admin' || t.role === 'Overseer') || (t.fullName === 'Austin Jurgens' && isAdmin) ? 'System Admin' : 'Performance Trainer'}
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
                                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl italic shrink-0", (currentSelectedTrainer.role === 'StudioOwner' || currentSelectedTrainer.role === 'Admin' || currentSelectedTrainer.role === 'Overseer') || (currentSelectedTrainer.fullName === 'Austin Jurgens' && isAdmin) ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-500 border border-orange-200 dark:border-orange-500/30' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800')}>
                                  {currentSelectedTrainer.initials}
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase italic leading-none">{currentSelectedTrainer.fullName}</h3>
                                    {((currentSelectedTrainer.role === 'StudioOwner' || currentSelectedTrainer.role === 'Admin' || currentSelectedTrainer.role === 'Overseer') || (currentSelectedTrainer.fullName === 'Austin Jurgens' && isAdmin)) && (
                                      <span className="bg-orange-50 dark:bg-orange-500/10 text-orange-500 border border-orange-200 dark:border-orange-500/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">Owner</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 leading-none mt-2">
                                    {(currentSelectedTrainer.role === 'StudioOwner' || currentSelectedTrainer.role === 'Admin' || currentSelectedTrainer.role === 'Overseer') || (currentSelectedTrainer.fullName === 'Austin Jurgens' && isAdmin) ? 'System Admin' : 'Performance Trainer'}
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
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                              <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                    <RefreshCcw className="w-3.5 h-3.5 text-sky-500" />
                                    <h4 className="font-bold uppercase text-[9px] tracking-widest leading-none">MindBody Sync Connection</h4>
                                  </div>
                                  {currentSelectedTrainer.mindbody_ical_url && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      disabled={syncingTrainerId === currentSelectedTrainer.id}
                                      onClick={() => handleTrainerSync(currentSelectedTrainer.id!)}
                                      className="h-7 text-[10px] flex items-center px-3 font-black uppercase text-sky-700 hover:text-sky-800 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg border border-sky-200 dark:border-sky-800"
                                    >
                                      {syncingTrainerId === currentSelectedTrainer.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                                      Sync Now
                                    </Button>
                                  )}
                                </div>

                                {editingIcalId === currentSelectedTrainer.id ? (
                                  <div className="flex flex-col gap-2">
                                    <Input 
                                      placeholder="https://..." 
                                      value={newIcalUrl}
                                      onChange={e => setNewIcalUrl(e.target.value)}
                                      className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white px-3 focus-visible:ring-sky-500"
                                    />
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button variant="ghost" size="sm" onClick={() => setEditingIcalId(null)} className="h-8 px-3 font-bold uppercase text-[10px] rounded-lg tracking-widest text-slate-500 dark:text-slate-400">Cancel</Button>
                                      <Button 
                                        size="sm"
                                        onClick={() => handleUpdateIcalUrl(currentSelectedTrainer.id!, newIcalUrl)}
                                        disabled={isUpdatingIcal}
                                        className="bg-sky-500 hover:bg-sky-600 text-slate-900 dark:text-white h-8 px-4 rounded-lg font-black uppercase text-[10px] tracking-widest"
                                      >
                                        {isUpdatingIcal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2 overflow-hidden group/link bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                                    {currentSelectedTrainer.mindbody_ical_url ? (
                                      <>
                                        <Link className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium truncate flex-1">{currentSelectedTrainer.mindbody_ical_url}</span>
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          onClick={() => {
                                            setEditingIcalId(currentSelectedTrainer.id!);
                                            setNewIcalUrl(currentSelectedTrainer.mindbody_ical_url || '');
                                          }}
                                          className="h-7 w-7 p-0 rounded-lg shrink-0 opacity-0 group-hover/link:opacity-100 border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        >
                                          <RefreshCcw className="w-3.5 h-3.5" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium italic select-none">No feed configured</span>
                                        <Button 
                                          variant="outline" 
                                          size="sm" 
                                          onClick={() => {
                                            setEditingIcalId(currentSelectedTrainer.id!);
                                            setNewIcalUrl('');
                                          }}
                                          className="h-8 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 hover:text-slate-00 dark:hover:bg-slate-800 rounded-lg px-4 font-black uppercase text-[9px] tracking-widest"
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
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center py-20 px-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-[24px] text-center bg-slate-50/50 dark:bg-slate-950/20">
                            <User className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4 animate-pulse" />
                            <h4 className="font-bold text-slate-700 dark:text-slate-300">No Trainer Selected</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">Select a trainer from the list to synchronize their scheduling feeds and control accessible home studios.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'equipment_settings' && (() => {
            const isSuperUser = isAdmin || authTrainer?.role === 'Admin' || authTrainer?.role === 'Overseer';
            const assignedStudioIds = !isSuperUser ? [authTrainer?.primaryHomeStudioId, ...(authTrainer?.accessibleStudioIds || [])].filter(Boolean) : [];
            const filteredStudiosForAnnouncement = studios.filter(s => isSuperUser || (assignedStudioIds as string[]).includes(s.id!));
            const defaultStudioId = isSuperUser ? 'all' : (filteredStudiosForAnnouncement[0]?.id || '');
            const currentAudienceValue = newAnnouncement.studioId === 'all' && !isSuperUser ? defaultStudioId : (newAnnouncement.studioId || defaultStudioId);

            return (
              <div className="space-y-8 animate-fade-in">
                {/* Step 1: Dashboard Grid Layout */}
                <div className="hidden">
                  
                  {/* Step 2: Column 1 - Operations & Telemetry */}
                  <div className="space-y-6">
                    {/* Live Floor Status Card */}
                    <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-[32px] overflow-hidden">
                      <CardHeader className="bg-slate-50 dark:bg-slate-950 pb-6 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-55/80 dark:bg-emerald-950/20 flex items-center justify-center border border-emerald-200 dark:border-emerald-800/40 shadow-inner">
                              <MonitorPlay className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div>
                              <CardTitle className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Live Floor Status</CardTitle>
                              <CardDescription className="text-slate-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-widest">Active sessions and concurrency monitoring.</CardDescription>
                            </div>
                          </div>
                          <div className="px-4 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
                            <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest animate-pulse">● System Live</span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-8 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-5 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-100 dark:border-emerald-900/10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1 leading-none">Total Active</p>
                            <p className="text-3xl font-black text-slate-900 dark:text-white italic mt-2 leading-none">{sessions.filter(s => s.status === 'In-Progress' && isSessionValid(s)).length}</p>
                          </div>
                          <div className="p-5 bg-amber-50/50 dark:bg-amber-950/30 rounded-2xl border border-amber-100 dark:border-amber-900/10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1 leading-none">Stale Sessions</p>
                            <p className="text-3xl font-black text-amber-500 italic mt-2 leading-none">{sessions.filter(s => s.status === 'In-Progress' && !isSessionValid(s)).length}</p>
                          </div>
                          <div className="p-5 bg-sky-50/50 dark:bg-sky-950/30 rounded-2xl border border-sky-100 dark:border-sky-900/10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-400 mb-1 leading-none">Current Sync</p>
                            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 italic mt-2.5 leading-none flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-sky-500" />
                              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 px-1">Active Floor Feed</h3>
                          <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                            {sessions.filter(s => s.status === 'In-Progress').map(session => {
                              const isValid = isSessionValid(session);
                              const client = clients.find(c => c.id === session.clientId);
                              return (
                                <div key={session.id} className={cn(
                                  "p-3.5 rounded-2xl border transition-all flex items-center justify-between group",
                                  isValid ? "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800" : "bg-slate-50 dark:bg-slate-950/50 border-amber-500/20 opacity-70 grayscale"
                                )}>
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className={cn(
                                      "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border shrink-0",
                                      isValid ? "bg-slate-100 dark:bg-slate-900 text-sky-600 border-slate-200 dark:border-slate-800" : "bg-amber-50 dark:bg-amber-950/40 text-amber-500 border-amber-200"
                                    )}>
                                      {client ? `${client.firstName[0]}${client.lastName[0]}` : "UN"}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <h4 className="font-bold text-slate-900 dark:text-white text-xs truncate max-w-[150px]">{client ? `${client.firstName} ${client.lastName}` : "Unassigned Session"}</h4>
                                        {!isValid && <span className="bg-amber-55 dark:bg-amber-950/20 text-amber-500 border border-amber-200/30 px-1 rounded-[4px] text-[7px] font-black uppercase">Abandoned</span>}
                                      </div>
                                      <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-0.5 leading-none">
                                        <Users className="w-3 h-3" /> TR: {session.trainerInitials || "---"} 
                                        <span className="text-slate-405 dark:text-slate-800">•</span>
                                        <Clock className="w-3 h-3" /> {session.lastHeartbeatAt ? (session.lastHeartbeatAt.toDate?.() || new Date(session.lastHeartbeatAt)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just Started"}
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
                                      className="h-8 px-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-500 hover:bg-amber-500/20 font-black uppercase text-[8px] tracking-widest border border-amber-200/40 opacity-0 group-hover:opacity-100 duration-200 transition-opacity shrink-0"
                                    >
                                      Sweep
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                            {sessions.filter(s => s.status === 'In-Progress').length === 0 && (
                              <div className="py-12 border border-slate-150 dark:border-slate-800 border-dashed rounded-2xl flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 italic text-xs">
                                Floor is currently empty.
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Studio Configuration Card */}
                    <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-[32px] overflow-hidden">
                      <CardHeader className="bg-slate-50 dark:bg-slate-950 pb-6 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center border border-amber-200 dark:border-amber-800/40 shadow-inner">
                            <Building2 className="w-6 h-6 text-amber-500" />
                          </div>
                          <div>
                            <CardTitle className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Studio Configuration</CardTitle>
                            <CardDescription className="text-slate-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-widest">Manage franchise locations.</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-8 space-y-5">
                        <div className="space-y-4">
                          {studios.length > 0 ? (
                            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                              {studios.map(studio => (
                                <div key={studio.id} className="flex items-center justify-between p-4 px-5 hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                                  <span className="text-xs font-black uppercase text-slate-800 dark:text-slate-100 tracking-wider font-mono">{studio.name}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-slate-400 hover:text-rose-500 p-1 px-2 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all"
                                    onClick={() => handleDeleteStudio(studio.id!)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm italic bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
                              No physical studios configured.
                            </div>
                          )}
                          
                          <div className="flex items-center gap-2 p-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md">
                            <Input 
                              value={newStudioName}
                              onChange={e => setNewStudioName(e.target.value)}
                              placeholder="Studio location name (e.g. Solon, OH)"
                              className="h-9 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-slate-900 dark:text-white font-medium text-xs placeholder:text-slate-450 dark:placeholder:text-slate-500 shadow-none"
                            />
                            <Button 
                              onClick={handleAddStudio} 
                              disabled={!newStudioName.trim() || isAddingStudio}
                              className="bg-sky-500 hover:bg-sky-600 text-white rounded-lg h-9 px-4 text-xs font-black uppercase tracking-wider shrink-0"
                            >
                              {isAddingStudio ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                              Add
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Step 3: Column 2 - Communications */}
                  <div className="space-y-6">
                    {(isAdmin || (authTrainer?.role === 'StudioOwner' || authTrainer?.role === 'Admin' || authTrainer?.role === 'Overseer')) && (
                      <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-[32px] overflow-hidden">
                        <CardHeader className="bg-slate-50 dark:bg-slate-950 pb-6 border-b border-slate-200 dark:border-slate-800">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-950/20 flex items-center justify-center border border-sky-200 dark:border-sky-850/30 shadow-inner">
                              <Megaphone className="w-6 h-6 text-sky-455" />
                            </div>
                            <div>
                              <CardTitle className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Hub Announcements</CardTitle>
                              <CardDescription className="text-slate-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-widest">Share informative insights with your team.</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                          {/* Compact Form */}
                          <div className="p-5 bg-slate-50/50 dark:bg-slate-950/20 rounded-[24px] border border-slate-200 dark:border-slate-800 space-y-4">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4.5 h-4.5 text-amber-500" />
                              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider italic leading-none">Draft New Message</h3>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Headline</Label>
                                <Input 
                                  value={newAnnouncement.title}
                                  onChange={e => setNewAnnouncement(prev => ({ ...prev, title: e.target.value }))}
                                  placeholder="e.g. Master the Turnaround"
                                  className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs h-9 rounded-xl font-medium"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Audience</Label>
                                <Select 
                                  value={currentAudienceValue} 
                                  onValueChange={v => setNewAnnouncement(prev => ({ ...prev, studioId: v }))}
                                >
                                  <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-bold text-xs h-9 rounded-xl">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                                    {isSuperUser && (
                                      <SelectItem value="all">Company Wide (All Trainers)</SelectItem>
                                    )}
                                    {filteredStudiosForAnnouncement.map(s => (
                                      <SelectItem key={s.id} value={s.id!}>Just {s.name} Trainers</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Short Snippet (Quick Header View)</Label>
                              <Input 
                                value={newAnnouncement.shortContent}
                                onChange={e => setNewAnnouncement(prev => ({ ...prev, shortContent: e.target.value }))}
                                placeholder="e.g. Why the 3-second turnaround pause is critical..."
                                className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs h-9 rounded-xl font-medium"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold uppercase text-slate-555 dark:text-slate-400">Full Details (Expanded View)</Label>
                              <Textarea 
                                value={newAnnouncement.longContent}
                                onChange={e => setNewAnnouncement(prev => ({ ...prev, longContent: e.target.value }))}
                                placeholder="Share the full depth of your knowledge here..."
                                className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs min-h-[80px] rounded-xl font-medium"
                              />
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                              <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mt-0.5">Priority:</Label>
                                  <Select 
                                    value={newAnnouncement.priority} 
                                    onValueChange={(v: any) => setNewAnnouncement(prev => ({ ...prev, priority: v }))}
                                  >
                                    <SelectTrigger className="w-24 h-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-[10px] uppercase font-black rounded-lg">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                                      <SelectItem value="low">Standard</SelectItem>
                                      <SelectItem value="medium">Growth</SelectItem>
                                      <SelectItem value="high">Urgent</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mt-0.5">Type:</Label>
                                  <Select 
                                    value={newAnnouncement.type || 'news'} 
                                    onValueChange={(v: any) => setNewAnnouncement(prev => ({ ...prev, type: v }))}
                                  >
                                    <SelectTrigger className="w-24 h-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-[10px] uppercase font-black rounded-lg">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                                      <SelectItem value="shout-out">Shout-out</SelectItem>
                                      <SelectItem value="tip">Tip</SelectItem>
                                      <SelectItem value="news">News</SelectItem>
                                      <SelectItem value="event">Event</SelectItem>
                                      <SelectItem value="holiday">Holiday</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mt-0.5">Lifespan:</Label>
                                  <Select 
                                    value={lifespan} 
                                    onValueChange={v => setLifespan(v)}
                                  >
                                    <SelectTrigger className="w-24 h-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-[10px] uppercase font-black rounded-lg">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                                      <SelectItem value="24h">24 Hours</SelectItem>
                                      <SelectItem value="1w">1 Week</SelectItem>
                                      <SelectItem value="1m">1 Month</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <Button 
                                onClick={handleCreateAnnouncement}
                                disabled={isCreatingAnnouncement || !newAnnouncement.title || !newAnnouncement.shortContent}
                                className="bg-sky-500 hover:bg-sky-600 text-white font-black uppercase text-[10px] tracking-widest h-9 px-5 rounded-xl gap-1.5 shadow-sm"
                              >
                                {isCreatingAnnouncement ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                Publish
                              </Button>
                            </div>
                          </div>

                          {/* Announcements Feed */}
                          <div className="space-y-3.5">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 px-1">Active Messages</h3>
                            {announcements.length === 0 ? (
                              <div className="py-12 border border-slate-150 dark:border-slate-800/85 border-dashed rounded-[24px] flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 italic text-xs">
                                No active announcements found.
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {announcements.map(a => (
                                  <div key={a.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between group">
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                      <div className={cn(
                                        "w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 mt-0.5",
                                        a.priority === 'high' ? "bg-rose-50 border-rose-200 text-rose-500" :
                                        a.priority === 'medium' ? "bg-amber-50 border-amber-200 text-amber-500" :
                                        "bg-sky-50 border-sky-200 text-sky-500"
                                      )}>
                                        <Megaphone className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <h4 className="font-black text-slate-900 dark:text-white italic text-xs truncate max-w-[155px]">{a.title}</h4>
                                          <span className="text-[7px] bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded uppercase font-black border border-slate-200 dark:border-slate-800">
                                            {a.studioId === 'all' ? 'Universal' : 'Studio Specific'}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">{a.shortContent}</p>
                                        <p className="text-[8px] text-slate-400 dark:text-slate-500 mt-2 font-bold uppercase tracking-widest">
                                          By {a.authorName} • {a.createdAt?.toDate?.()?.toLocaleDateString() || 'Recently'}
                                        </p>
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
                  </div>

                </div>

                {/* Step 4: The Hardware Editor (De-Cluttering) */}
                <div className="w-full">
                  <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-[32px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsEquipmentExpanded(!isEquipmentExpanded)}
                      className="w-full text-left p-8 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-950/40 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center border border-amber-200 dark:border-amber-800/40 shadow-inner">
                          <Settings className="w-6 h-6 text-amber-500" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Hardware & Equipment Configuration</h3>
                          <p className="text-slate-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-widest">Map, test, and calibrate live floor biometric machines.</p>
                        </div>
                      </div>
                      <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
                        <ChevronDown className={cn("w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform duration-200", isEquipmentExpanded && "rotate-180")} />
                      </div>
                    </button>
                    {isEquipmentExpanded && (
                      <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                        <TrainerMachineEditor machines={machines} />
                      </div>
                    )}
                  </div>
                </div>

              </div>
            );
          })()}

          {activeTab === 'app_settings' && (() => {
            const hasAccess = isAdmin || authTrainer?.role === 'Admin' || authTrainer?.role === 'Overseer' || authTrainer?.role === 'StudioOwner';
            if (!hasAccess) {
              return (
                <div className="flex items-center justify-center p-6 min-h-[400px] animate-fade-in">
                  <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-[32px] p-8 max-w-md w-full text-center space-y-6">
                    <div className="mx-auto w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-955/15 flex items-center justify-center border border-rose-100 dark:border-rose-900/30">
                      <Lock className="w-8 h-8 text-rose-500" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase italic tracking-tight">Access Restricted</h3>
                      <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed font-semibold">
                        System architecture and data pipelines are limited to System Administrators and Overseers.
                      </p>
                    </div>
                  </Card>
                </div>
              );
            }

            return (
              <div className="space-y-8 animate-fade-in">
                <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-[32px] overflow-hidden">
                  <CardHeader className="bg-slate-50 dark:bg-slate-950 pb-8 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center border border-amber-200 dark:border-amber-900/30 shadow-inner">
                        <Database className="w-6 h-6 text-amber-500" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Legacy Data Ingestion Pipeline</CardTitle>
                        <CardDescription className="text-slate-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-widest">Import historical client logs via CSV to populate the demographic engine.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 space-y-8">
                    {/* Interface Theme */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-2xl gap-6">
                      <div className="space-y-1">
                         <Label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 flex items-center gap-2 leading-none">
                           <Sparkles className="w-4 h-4 text-amber-500" />
                           Interface Theme
                         </Label>
                         <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-sm mt-1">
                           Toggle between dark mode, light mode, or system default.
                         </p>
                      </div>
                      <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
                         <Select value={theme} onValueChange={(val) => setTheme(val as any)}>
                            <SelectTrigger className="w-32 bg-transparent border-none text-xs font-bold uppercase tracking-widest outline-none focus:ring-0">
                              <SelectValue placeholder="Theme" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="light">Light</SelectItem>
                              <SelectItem value="dark">Dark</SelectItem>
                              <SelectItem value="system">System</SelectItem>
                            </SelectContent>
                         </Select>
                      </div>
                    </div>

                    <div className="p-6 bg-rose-50/30 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl space-y-4">
                      <div className="space-y-1">
                         <Label className="text-xs font-bold uppercase text-rose-500 dark:text-rose-400 flex items-center gap-2 leading-none">
                           <Bug className="w-4 h-4" />
                           Report a Bug
                         </Label>
                         <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-sm mt-1 mb-4">
                           Found an issue? Let us know so our engineering team can investigate.
                         </p>
                      </div>
                      
                      <div className="space-y-3 pt-2">
                        <Select value={bugReport.issueType} onValueChange={v => setBugReport(p => ({ ...p, issueType: v }))}>
                          <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="UI Problem">UI/Visual Problem</SelectItem>
                            <SelectItem value="Data Not Loading">Data Not Loading/Syncing</SelectItem>
                            <SelectItem value="Crash">App Crash</SelectItem>
                            <SelectItem value="Login Issue">Authentication Issue</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>

                        <Textarea 
                          value={bugReport.description}
                          onChange={e => setBugReport(p => ({ ...p, description: e.target.value }))}
                          placeholder="Please describe what happened, what you expected, and any steps to reproduce the issue."
                          className="min-h-[100px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm"
                        />
                        
                        <Button 
                          onClick={submitBug}
                          disabled={!bugReport.description || isSubmittingBug}
                          className="w-full bg-rose-500 hover:bg-rose-600 text-white font-black uppercase text-[10px] tracking-widest"
                        >
                          {isSubmittingBug ? "Submitting..." : "Submit Bug Report"}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label htmlFor="legacy-upload" className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 px-1">Historical Workout Data (CSV)</Label>
                      <div className="relative group">
                        {/* High-end SaaS drop zone */}
                        <div className="w-full h-44 border-2 border-dashed border-slate-350 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 rounded-3xl flex flex-col items-center justify-center p-6 text-center transition-all duration-200 group-hover:bg-slate-100/70 dark:group-hover:bg-slate-900/60 group-hover:border-sky-450">
                          {isLegacyImporting ? (
                            <div className="flex flex-col items-center gap-3">
                              <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
                              <span className="text-sm font-black uppercase italic tracking-wider text-sky-500">Processing Legacy Data...</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center space-y-3">
                              <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center shadow-sm text-slate-450 dark:text-slate-500 group-hover:text-sky-500 group-hover:border-sky-200 transition-colors">
                                <Database className="w-6 h-6" />
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Drag & drop or click to upload CSV</p>
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Supports legacy FileMaker schemas & metrics</p>
                              </div>
                            </div>
                          )}
                        </div>
                        <Input 
                          id="legacy-upload" 
                          type="file" 
                          accept=".csv" 
                          onChange={handleLegacyFileUpload}
                          disabled={isLegacyImporting}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                      </div>
                    </div>

                    {legacyStats && (
                      <div className="p-6 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/10 rounded-2xl flex items-start gap-4">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-black text-emerald-600 dark:text-emerald-400 uppercase italic tracking-wider text-sm">Import Success</p>
                          <div className="text-slate-600 dark:text-slate-400 font-bold uppercase tracking-widest grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2 mt-3 text-[9px]">
                            <p>Clients: <span className="font-mono text-xs text-slate-900 dark:text-white font-black">{legacyStats.clients}</span></p>
                            <p>Sessions: <span className="font-mono text-xs text-slate-900 dark:text-white font-black">{legacyStats.sessions}</span></p>
                            <p>Logs: <span className="font-mono text-xs text-slate-900 dark:text-white font-black">{legacyStats.logs}</span></p>
                            <p>Skipped: <span className="font-mono text-xs text-slate-900 dark:text-white font-black">{legacyStats.failed}</span></p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}

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
