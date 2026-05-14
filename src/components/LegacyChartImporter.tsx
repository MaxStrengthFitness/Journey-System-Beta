import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  X, 
  Maximize, 
  CheckCircle2, 
  AlertTriangle, 
  History, 
  FileText, 
  ArrowRight,
  Edit2,
  Trash2,
  Calendar,
  User,
  Activity,
  Dumbbell,
  Copy,
  Plus
} from 'lucide-react';
import { Client, Machine, Trainer, WorkoutSession, ExerciseLog } from '../types';
import { processLegacyChart, extractMachineSettingsFromImage, OCRMachineSetting, ValidationSession, ValidationLog, sanitizeImportedSessions } from '../services/geminiService';
import { db } from '../firebase';
import { collection, writeBatch, doc, serverTimestamp, getDocs, query, where, increment } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn, parseSessionDate } from '../lib/utils';

interface ImporterProps {
  clients: Client[];
  machines: Machine[];
  trainers: Trainer[];
  initialClientId?: string;
  onComplete?: () => void;
}



const legacyMachineMap: Record<string, string> = {
  "cx": "4 Way Neck",
  "hip add": "Hip Adduction",
  "hip abd": "Hip Abduction",
  "leg curl": "Leg Curl",
  "leg ext": "Leg Extension",
  "leg ext.": "Leg Extension",
  "leg press": "Leg Press",
  "pull down": "Pull Down",
  "chest press": "Chest Press",
  "comp row": "Compound Row",
  "comp. row": "Compound Row",
  "overhead": "Overhead Press",
  "pull over": "Seated Pull Over",
  "seated dip": "Seated Dip",
  "tricep ext": "Tricep Extension",
  "tricep ext.": "Tricep Extension",
  "bicep": "Biceps",
  "chest fly": "Chest/Pec Fly",
  "lateral raise": "Lateral Raise",
  "lumbar": "Lumbar Extension",
  "torso rotation": "Torso Rotation",
  "abs": "Seated Abdominals"
};

const normalizeMachineName = (rawName: string): string => {
  const clean = rawName.toLowerCase().trim();
  if (legacyMachineMap[clean]) {
    return legacyMachineMap[clean];
  }
  // Fallback: capitalize properly
  return rawName.charAt(0).toUpperCase() + rawName.slice(1);
};

export function LegacyChartImporter({ clients, machines, trainers, initialClientId, onComplete }: ImporterProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>(initialClientId || '');
  const [expectedSessions, setExpectedSessions] = useState<number>(10);
  const [files, setFiles] = useState<{ name: string; base64: string; mimeType: string; previewUrl: string }[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isScanningSettings, setIsScanningSettings] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [scanPercentage, setScanPercentage] = useState(0);
  const [validationSessions, setValidationSessions] = useState<ValidationSession[]>([]);
  const [extractedSettings, setExtractedSettings] = useState<OCRMachineSetting[]>([]);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeProgress, setFinalizeProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement> | { target: { files: FileList | null } }) => {
    const files = e.target.files;
    if (files) {
      (Array.from(files) as File[]).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Content = (event.target?.result as string).split(',')[1];
          setFiles(prev => [...prev, {
            name: file.name,
            base64: base64Content,
            mimeType: file.type,
            previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
          }]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    setValidationSessions([]);
  };

  const runOCR = async () => {
    if (!selectedClientId || files.length === 0 || !expectedSessions) return;

    setIsScanning(true);
    setScanPercentage(0);
    setScanProgress('Waking Vision Engine...');
    setValidationSessions([]);

    // Simulated progress increment while AI is working
    const progressInterval = setInterval(() => {
      setScanPercentage(prev => {
        if (prev < 30) return prev + 2;
        if (prev < 60) return prev + 1;
        if (prev < 90) return prev + 0.5;
        if (prev < 98) return prev + 0.1;
        return prev;
      });
    }, 500);

    try {
      const imageFiles = files.map(f => ({ base64: f.base64, mimeType: f.mimeType }));
      setScanProgress(`Analyzing ${files.length} images simultaneously...`);
      const ocrResult = await processLegacyChart(imageFiles, expectedSessions);
      
      clearInterval(progressInterval);
      setScanPercentage(100);
      setScanProgress('OCR Pipeline Complete');

      // Reconstructed Merge Logic
      const sessionsMap: Record<number, ValidationSession> = {};

      // 1. Map over headers first to establish sessions
      ocrResult.sessionHeaders.forEach((header, index, array) => {
        const sNum = header.sessionNumber;
        
        let dateString = header.date?.trim();
        let isInferredDate = false;

        // Date Fallback Rule
        if (!dateString || dateString.toLowerCase() === 'confirm' || dateString === '0') {
            isInferredDate = true;
            // Let's defer calculating the date until we have sorted them chronologically
        }

        // Find matching trainer initials in our database
        const trainerMatch = trainers.find(t => 
          t.initials.toLowerCase() === (header.trainer || '').toLowerCase()
        );

        sessionsMap[sNum] = {
          id: `v-sess-${sNum}-${Date.now()}-${Math.random()}`,
          sessionNumber: sNum,
          date: dateString || '',
          trainer: header.trainer || 'Legacy',
          trainerId: trainerMatch?.id || 'legacy-trainer',
          machines: [],
          isInferredDate
        };
      });

      // Stitch performances to headers
      ocrResult.performances.forEach(perf => {
        const sNum = perf.sessionNumber;
        
        // Ensure session exists even if header was missed
        if (!sessionsMap[sNum]) {
          sessionsMap[sNum] = {
            id: `v-sess-${sNum}-${Date.now()}-${Math.random()}`,
            sessionNumber: sNum,
            date: '',
            trainer: 'Legacy',
            trainerId: 'legacy-trainer',
            machines: [],
            isInferredDate: true
          };
        }

        const repStr = String(perf.reps || '').toLowerCase().trim();

        // The "Ghost Rep" Rule (Skips)
        if (repStr === '.' || repStr === '-' || repStr === '' || repStr === '0' || perf.reps === undefined) {
          return; // Skip completely
        }

        let finalReps: number | string = Number(perf.reps) || 0;
        let isTSC = perf.isStaticHold || false;
        
        // Static Hold (TSC) Detection
        if (repStr.includes('s') || repStr.includes('sec') || repStr.includes('hold')) {
          isTSC = true;
          const match = repStr.match(/\d+/);
          if (match) {
             finalReps = parseInt(match[0], 10);
          }
        } else if (Number(perf.reps) > 20 || repStr.includes('sh')) {
          isTSC = true;
        }

        const rawMachineName = perf.machineName;
        const normalizedName = normalizeMachineName(rawMachineName);

        const machineMatch = machines.find(mach => 
          mach.name.toLowerCase() === normalizedName.toLowerCase() ||
          normalizedName.toLowerCase().includes(mach.name.toLowerCase())
        );

        // Map into validation format
        sessionsMap[sNum].machines.push({
          id: `v-log-${sNum}-${perf.machineName}-${Date.now()}-${Math.random()}`,
          name: normalizedName,
          rawName: rawMachineName,
          settings: perf.settings,
          weight: Number(perf.weight) || 0,
          reps: finalReps,
          isStaticHold: isTSC,
          timeUnderLoad: isTSC ? (Number(finalReps) || 90) : 0,
          machineId: machineMatch?.id,
          isAnomalous: !machineMatch,
          anomalyReason: !machineMatch ? `Unknown Machine: ${normalizedName}` : undefined
        });
      });

      // 3. Convert to sorted array
      let mappedSessions = Object.values(sessionsMap).sort((a, b) => a.sessionNumber - b.sessionNumber);

      // Apply Date Fallback and One Session Per Day Rules using Chronology Engine
      mappedSessions = sanitizeImportedSessions(mappedSessions);

      setValidationSessions(mappedSessions);
      setScanProgress('OCR Pipeline Complete');
    } catch (err) {
      clearInterval(progressInterval);
      console.error(err);
      setScanProgress('Engine Failure: Check Logs');
    } finally {
      setIsScanning(false);
    }
  };

  const runSettingsOCR = async () => {
    if (!selectedClientId || files.length === 0) return;

    setIsScanningSettings(true);
    setScanProgress('Scanning Settings Column...');
    
    try {
      const imageFiles = files.map(f => ({ base64: f.base64, mimeType: f.mimeType }));
      const settings = await extractMachineSettingsFromImage(imageFiles);
      setExtractedSettings(settings);
      setScanProgress('Settings Extraction Complete');
    } catch (err) {
      console.error(err);
      setScanProgress('Settings Extraction Failed');
    } finally {
      setIsScanningSettings(false);
    }
  };

  const updateLogData = (sessionId: string, logId: string, field: string, value: any) => {
    setValidationSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      return {
        ...s,
        hasConflict: false, // Clear conflict warning upon edit
        machines: s.machines.map(l => {
          if (l.id !== logId) return l;
          return { ...l, [field]: value };
        })
      };
    }));
  };

  const duplicateLog = (sessionId: string, logId: string) => {
    setValidationSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      const logToDup = s.machines.find(l => l.id === logId);
      if (!logToDup) return s;
      
      const newLog = { 
        ...logToDup, 
        id: `v-log-dup-${Date.now()}-${Math.random()}`,
        name: logToDup.name.includes('(Set 2)') ? logToDup.name : `${logToDup.name} (Set 2)`
      };
      
      return {
        ...s,
        machines: [...s.machines, newLog]
      };
    }));
  };

  const finalizeImport = async () => {
    if (!selectedClientId || isFinalizing) return;
    setIsFinalizing(true);
    setFinalizeProgress(0);

    try {
      // Calculate total operations to track progress
      // 1 for each session, 1 for each log, 1 for client update, potentially many for settings
      const totalSessions = validationSessions.length;
      const totalLogs = validationSessions.reduce((acc, s) => acc + s.machines.filter(m => m.machineId).length, 0);
      const totalSettings = extractedSettings.length;
      const totalOps = totalSessions + totalLogs + 1 + (totalSettings > 0 ? totalSettings : 0);
      
      let completedOps = 0;
      const updateProgress = () => {
        completedOps++;
        setFinalizeProgress(Math.min(Math.round((completedOps / totalOps) * 100), 99));
      };

      const MAX_BATCH_SIZE = 450; // Safety margin below 500
      let currentBatch = writeBatch(db);
      let opCount = 0;

      const commitBatchIfNeeded = async (force = false) => {
        if (opCount >= MAX_BATCH_SIZE || (force && opCount > 0)) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          opCount = 0;
        }
      };
      
      // 1. Process Sessions & Logs
      for (const vSess of validationSessions) {
        const sessionRef = doc(collection(db, 'sessions'));
        
        let formattedDate = vSess.date;
        if (vSess.date) {
          const timestamp = parseSessionDate(vSess.date);
          if (timestamp > 0) {
            const dateObj = new Date(timestamp);
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dateObj.getDate()).padStart(2, '0');
            const yyyy = dateObj.getFullYear();
            formattedDate = `${yyyy}-${mm}-${dd}`;
          }
        }

        const fallbackDate = () => {
          const now = new Date();
          return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        };

        const sessionData: WorkoutSession = {
          clientId: selectedClientId,
          sessionType: 'Standard',
          sessionNumber: vSess.sessionNumber,
          date: formattedDate || fallbackDate(),
          trainerInitials: vSess.trainer,
          trainerId: vSess.trainerId || 'legacy-trainer',
          status: 'Completed',
          createdAt: serverTimestamp(),
          endTime: serverTimestamp()
        };
        
        currentBatch.set(sessionRef, sessionData);
        opCount++;
        updateProgress();
        await commitBatchIfNeeded();

        for (const vLog of vSess.machines) {
          if (!vLog.machineId) continue;
          const logRef = doc(collection(db, 'exerciseLogs'));
          const logData: ExerciseLog = {
            sessionId: sessionRef.id,
            clientId: selectedClientId,
            machineId: vLog.machineId,
            weight: String(vLog.weight),
            reps: vLog.isStaticHold ? '' : String(vLog.reps || ''),
            seconds: vLog.isStaticHold ? String(vLog.timeUnderLoad || '') : '',
            isTSC: vLog.isStaticHold,
            isStaticHold: vLog.isStaticHold,
            machineSettings: vLog.settings ? { "Seat": vLog.settings } : {},
            repQuality: 2,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          currentBatch.set(logRef, logData);
          opCount++;
          updateProgress();
          await commitBatchIfNeeded();
        }
      }

      // 2. Update client session count and profile
      const maxSessionNum = validationSessions.length > 0 
        ? Math.max(...validationSessions.map(s => s.sessionNumber)) 
        : 0;
      
      const clientRef = doc(db, 'clients', selectedClientId);
      currentBatch.update(clientRef, {
        completedSessions: increment(validationSessions.length),
        sessionCount: maxSessionNum,
        updatedAt: serverTimestamp()
      });
      opCount++;
      updateProgress();
      await commitBatchIfNeeded();

      // 3. Save Global Machine Settings
      if (extractedSettings.length > 0) {
        const trainer = trainers.find(t => t.id === 'legacy-trainer') || trainers[0];
        
        for (const setting of extractedSettings) {
          const settingId = `${selectedClientId}_${setting.machineId}`;
          const settingRef = doc(db, 'clientMachineSettings', settingId);
          
          const finalSettings: Record<string, string> = {};
          if (setting.seat) finalSettings['Seat'] = setting.seat;
          if (setting.gap) finalSettings['Gap'] = setting.gap;
          if (setting.backPad) finalSettings['Back Pad'] = setting.backPad;
          if (setting.handles) finalSettings['Handles'] = setting.handles;
          if (setting.armPad) finalSettings['Arm Pad'] = setting.armPad;

          currentBatch.set(settingRef, {
            clientId: selectedClientId,
            machineId: setting.machineId,
            settings: finalSettings,
            updatedBy: trainer?.initials || 'OCR',
            updatedAt: serverTimestamp(),
            notes: 'Extracted from legacy chart'
          }, { merge: true });
          
          opCount++;
          updateProgress();
          await commitBatchIfNeeded();
        }
      }

      // Final commit for any leftover operations
      await commitBatchIfNeeded(true);
      setFinalizeProgress(100);

      if (onComplete) onComplete();
    } catch (err) {
      console.error(err);
      alert('Finalization failed. Check Firestore quotas.');
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 p-4 sm:p-6 bg-slate-950 min-h-screen text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-2">
            <Maximize className="w-8 h-8 text-[#F06C22]" />
            OCR Legacy Pipeline
          </h1>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
            Multimodal Chart Recognition Engine v3.1
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger className="w-[240px] bg-slate-900 border-slate-800 text-white font-bold h-11">
              <SelectValue placeholder="Select Target Client..." />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-white">
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id!} className="hover:bg-slate-800 focus:bg-slate-800">
                  {c.firstName} {c.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {validationSessions.length > 0 && (
            <Button 
              onClick={finalizeImport}
              disabled={isFinalizing || validationSessions.some(s => !s.date)}
              className="bg-[#F06C22] hover:bg-[#F06C22]/90 text-white font-black px-6 h-11 tracking-widest uppercase text-xs disabled:opacity-50"
            >
              {isFinalizing ? 'Committing...' : '[ Finalize & Import Data ]'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input/Upload */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="bg-[#0A2E46]/30 border-slate-800 overflow-hidden">
            <CardHeader className="bg-slate-900/50 py-3 border-b border-slate-800">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">
                Data Source Upload
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="mb-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Expected Sessions to Extract</label>
                  <div className="flex items-center gap-4 bg-slate-900 border border-slate-700 rounded-xl p-3">
                    <Input 
                      type="number"
                      value={expectedSessions}
                      onChange={(e) => setExpectedSessions(parseInt(e.target.value) || 0)}
                      className="w-24 bg-slate-800 border-slate-700 text-center font-black text-lg focus:ring-[#F06C22] h-10"
                    />
                    <p className="text-[10px] text-slate-400 font-medium leading-tight">
                      Bounding cross-grid search space to maximize extraction speed.
                    </p>
                  </div>
                </div>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  handleFileSelect({ target: { files: e.dataTransfer.files } } as any);
                }}
                className="w-full h-40 border-2 border-dashed border-slate-700 bg-slate-900/50 rounded-xl flex flex-col items-center justify-center p-6 cursor-pointer hover:border-[#F06C22]/50 hover:bg-slate-800/30 transition-all group relative"
              >
                <input 
                  type="file" 
                  multiple 
                  accept="image/*,application/pdf" 
                  ref={fileInputRef}
                  className="hidden" 
                  onChange={handleFileSelect}
                />
                <Upload className="w-10 h-10 text-slate-600 group-hover:text-[#F06C22] mb-3 transition-colors" />
                <p className="text-sm font-black text-slate-300 uppercase tracking-tighter text-center">Drop Multiple Chart Images</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase mt-2 text-center">Batch Processing (Up to 8 Images)</p>
              </div>

              {files.length > 0 && (
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Queue ({files.length})</p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={clearFiles}
                        className="text-[9px] font-black text-red-500 hover:text-red-400 hover:bg-red-500/10 h-6 uppercase px-2"
                      >
                        Clear All
                      </Button>
                    </div>
                    
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800">
                      {files.map((file, idx) => (
                        <div key={idx} className="relative group bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shrink-0 w-24 h-24">
                          {file.previewUrl ? (
                            <img src={file.previewUrl} className="w-full h-full object-cover opacity-60" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-800">
                              <FileText className="w-6 h-6 text-slate-600" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button onClick={() => removeFile(idx)} className="p-1.5 bg-red-600/20 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all">
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div className="absolute bottom-1 left-1 right-1 px-1 py-0.5 bg-black/50 backdrop-blur-sm rounded text-[7px] font-black truncate text-white">
                            {file.name}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="space-y-3 mt-6">
                      <Button 
                        className={cn(
                          "w-full text-white font-black h-14 tracking-widest uppercase text-xs transition-all shadow-xl shadow-[#F06C22]/10",
                          expectedSessions > 0 && selectedClientId ? "bg-[#F06C22] hover:bg-[#D95B16] border-none" : "bg-slate-800 border-slate-700 opacity-50 cursor-not-allowed"
                        )}
                        onClick={runOCR}
                        disabled={isScanning || !selectedClientId || expectedSessions <= 0}
                      >
                        <Maximize className={cn("w-4 h-4 mr-2", isScanning && "animate-spin")} />
                        {isScanning ? 'SCANNING GRID...' : 'FULL CLINICAL EXTRACTION'}
                      </Button>

                      <div className="relative py-2 flex items-center">
                        <div className="flex-grow border-t border-slate-800"></div>
                        <span className="flex-shrink mx-4 text-[8px] font-black uppercase text-slate-600 tracking-widest">OR</span>
                        <div className="flex-grow border-t border-slate-800"></div>
                      </div>

                      <Button 
                        variant="ghost"
                        className="w-full border border-slate-800 text-slate-400 font-bold h-12 tracking-widest uppercase text-[10px] hover:bg-slate-800 hover:text-white transition-all shadow-inner"
                        onClick={runSettingsOCR}
                        disabled={isScanningSettings || !selectedClientId || files.length === 0}
                      >
                        <Plus className={cn("w-3 h-3 mr-2", isScanningSettings && "animate-spin")} />
                        {isScanningSettings ? 'EXTRACTING...' : 'Import Machine Settings Only'}
                      </Button>
                      <p className="text-[7px] font-bold text-slate-600 uppercase text-center tracking-tighter">Use this to only import seat/pad setup without sessions</p>
                    </div>
                  </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Validation HUD */}
        <div className="lg:col-span-8 flex flex-col">
          <Card className="bg-[#0A2E46] border-slate-800 flex-1 flex flex-col min-h-[600px] shadow-2xl">
            <CardHeader className="py-4 border-b border-slate-800 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-widest text-[#F06C22]">
                  Validation HUD
                </CardTitle>
                <CardDescription className="text-[10px] font-bold text-slate-400">
                  Verify extracted patterns before database commit
                </CardDescription>
              </div>
              {validationSessions.length > 0 && (
                <div className="flex gap-4 items-center">
                  <div className="text-right px-4 border-r border-slate-800">
                    <p className="text-[10px] font-black text-white uppercase">Expected Sessions: {expectedSessions}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Trainer Bounding Box</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-[#F06C22] uppercase">Extracted Found: {validationSessions.length}</p>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">Verified Alignment</p>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0 overflow-hidden flex-1 relative">
              <AnimatePresence mode="wait">
                {validationSessions.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex flex-col items-center justify-center p-12 text-center"
                  >
                    {isScanning ? (
                      <div className="flex flex-col items-center space-y-6">
                        <div className="relative">
                          <div className="w-24 h-24 rounded-full border-4 border-[#0A2E46] border-t-[#F06C22] animate-spin"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Maximize className="w-10 h-10 text-[#F06C22]" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-lg font-black text-white uppercase tracking-widest animate-pulse">Analyzing Grid Intersections</h3>
                          <div className="w-64 h-2 bg-white/5 border border-white/5 rounded-full overflow-hidden mx-auto mt-4 mb-2">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${scanPercentage}%` }}
                              className="h-full bg-gradient-to-r from-[#F06C22] to-[#FF8C42] shadow-[0_0_15px_rgba(240,108,34,0.3)]"
                            />
                          </div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest max-w-xs mx-auto">
                            Performing row-by-row clinical extraction. This may take 30-60 seconds depending on data density.
                          </p>
                        </div>
                        <Badge variant="outline" className="bg-[#0A2E46] text-[#F06C22] border-[#F06C22]/30 px-4 py-1">
                          {scanProgress}
                        </Badge>
                      </div>
                    ) : (
                      <>
                        <div className="w-20 h-20 bg-slate-900/50 rounded-full flex items-center justify-center mb-6">
                          <History className="w-10 h-10 text-slate-700" />
                        </div>
                        <h3 className="text-lg font-black text-slate-500 uppercase tracking-widest mb-2 italic">Idle - Waiting for Feed</h3>
                        <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
                          Enter target session count and upload high-resolution scans to initiate the multimodal clinical extraction pipeline.
                        </p>
                      </>
                    )}
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 space-y-6 overflow-y-auto max-h-[60vh] scrollbar-thin scrollbar-thumb-slate-700"
                  >
                    {/* Macro Summary Panel */}
                    <div className="bg-[#0A2E46] border border-[#F06C22]/30 rounded-xl p-4 mb-4 flex items-center justify-between shadow-[0_0_20px_rgba(240,108,34,0.05)]">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-[#F06C22]/10 rounded-full text-[#F06C22]">
                          <CheckCircle2 size={24} />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white uppercase tracking-widest">Clinical History Consolidated</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">
                            Successfully extracted {
                              Array.from(new Set(validationSessions.flatMap(s => s.machines.map(m => m.name)))).length
                            } unique machines spanning {validationSessions.length} total sessions.
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="border-[#F06C22] text-[#F06C22] font-black uppercase text-[8px] px-3">
                        CONTINUITY VERIFIED
                      </Badge>
                    </div>

                    {/* Extraction Frequency Panel */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Historical Machine Settings</h3>
                        {extractedSettings.length > 0 && (
                          <Badge className="bg-[#F06C22] text-white text-[8px] font-black">
                            {extractedSettings.length} MACHINES FOUND
                          </Badge>
                        )}
                      </div>
                      
                      {extractedSettings.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {extractedSettings.map((s, idx) => (
                            <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded-lg p-2 flex flex-col gap-1">
                              <p className="text-[9px] font-black text-[#F06C22] truncate uppercase">{s.machineId.replace(/_/g, ' ')}</p>
                              <div className="flex flex-wrap gap-1">
                                {s.seat && <span className="text-[7px] bg-slate-900 px-1 rounded text-slate-400">S:{s.seat}</span>}
                                {s.gap && <span className="text-[7px] bg-slate-900 px-1 rounded text-slate-400">G:{s.gap}</span>}
                                {s.backPad && <span className="text-[7px] bg-slate-900 px-1 rounded text-slate-400">B:{s.backPad}</span>}
                                {s.handles && <span className="text-[7px] bg-slate-900 px-1 rounded text-slate-400">H:{s.handles}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[9px] text-slate-600 italic">No global settings extracted yet. Use the "Extract Machine Settings Only" button.</p>
                      )}
                    </div>

                    {/* Extraction Frequency Panel */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-4">
                      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">Machine Extraction Frequency</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(
                          validationSessions.reduce((acc, sess) => {
                            sess.machines.forEach(m => {
                              acc[m.name] = (acc[m.name] || 0) + 1;
                            });
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([name, count]) => (
                          <Badge key={name} variant="secondary" className="bg-slate-800 text-slate-300 text-[9px] font-bold px-2 py-1 rounded-md border border-slate-700">
                            {name}: {count} logs
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="overflow-x-auto pb-6">
                      <table className="border-collapse table-fixed min-w-max w-full">
                        <thead>
                          <tr>
                            <th className="sticky left-0 z-20 bg-[#0A2E46] border-r border-b border-slate-700 w-[200px] p-2 text-left">
                              <span className="text-[10px] font-black italic uppercase text-[#F06C22]">Machine / Session</span>
                            </th>
                            {validationSessions.map(session => (
                              <th key={session.id} className={cn(
                                "w-[120px] p-2 bg-slate-900 border-r border-b border-slate-800 text-center relative group",
                                session.isInferredDate && "border-amber-500/50 shadow-[inset_0_0_10px_rgba(245,158,11,0.1)]"
                              )}>
                                <div className="flex flex-col items-center">
                                  <Badge className={cn("text-[9px] font-black h-4 px-1 rounded-sm mb-1", session.isInferredDate ? "bg-amber-600 border-none text-white" : "bg-slate-800 border-slate-700 text-white")}>
                                    S#{session.sessionNumber}
                                  </Badge>
                                  <input 
                                    type="date"
                                    className={cn("bg-slate-900 border focus:bg-slate-800 focus:border-[#F06C22] w-[90px] text-[10px] uppercase font-bold text-center outline-none transition-all rounded p-1", session.isInferredDate ? "border-amber-500/50 text-amber-400" : "border-slate-700 text-white")}
                                    value={session.date}
                                    onChange={e => setValidationSessions(prev => prev.map(s => s.id === session.id ? { ...s, date: e.target.value, isInferredDate: false } : s))}
                                  />
                                  <input 
                                    className="bg-transparent border-b border-transparent focus:border-[#F06C22] w-[40px] text-[9px] text-slate-400 text-center outline-none transition-all mt-0.5 uppercase"
                                    value={session.trainer}
                                    placeholder="INI"
                                    onChange={e => setValidationSessions(prev => prev.map(s => s.id === session.id ? { ...s, trainer: e.target.value } : s))}
                                  />
                                  {session.isInferredDate && (
                                    <div className="absolute -top-3 right-1/2 translate-x-1/2 whitespace-nowrap bg-amber-500 text-slate-950 font-black text-[7px] px-1 py-0.5 rounded uppercase flex items-center shadow-lg pointer-events-none">
                                      <AlertTriangle size={8} className="mr-0.5" /> ⚠️ Date Inferred
                                    </div>
                                  )}
                                  {session.hasConflict && (
                                    <div className="absolute -top-8 right-1/2 translate-x-1/2 whitespace-nowrap bg-red-600 text-white font-black text-[7px] px-1 py-0.5 rounded uppercase flex items-center shadow-lg pointer-events-none z-50">
                                      🚨 Merge Conflict: Check Machine Weights
                                    </div>
                                  )}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {Array.from(new Set(validationSessions.flatMap(s => s.machines.map(m => m.name)))).map(machineName => (
                            <tr key={machineName} className="group hover:bg-slate-800/30 transition-colors">
                              <th className="sticky left-0 z-10 bg-[#0A2E46] border-r border-slate-700 p-2 text-left align-middle group-hover:bg-slate-800/80 shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
                                <div className="flex flex-col justify-center">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <div className="w-4 h-4 rounded-md bg-slate-800 flex items-center justify-center shrink-0 shadow-sm shadow-zinc-200">
                                      <Dumbbell className="w-2.5 h-2.5 text-white" />
                                    </div>
                                    <span className="text-[11px] font-black uppercase text-white truncate max-w-[150px]">{machineName}</span>
                                  </div>
                                </div>
                              </th>
                              {validationSessions.map(session => {
                                const log = session.machines.find(m => m.name === machineName);
                                return (
                                  <td key={session.id} className="border-r border-slate-700/50 p-2 align-middle hover:bg-slate-700/50 transition-colors h-[64px]">
                                    {log ? (
                                      <div className="flex flex-col items-center gap-1 group/cell">
                                        <div className="flex items-baseline justify-center gap-1">
                                          <input 
                                            className="bg-transparent text-white font-black w-10 text-center border-b border-transparent focus:bg-slate-800 focus:border-[#F06C22] hover:border-slate-700/50 focus:outline-none text-sm transition-all rounded-t-sm"
                                            value={log.weight}
                                            onChange={e => updateLogData(session.id, log.id, 'weight', parseInt(e.target.value) || 0)}
                                            placeholder="LBS"
                                            title="Weight (lbs)"
                                          />
                                          <span className="text-slate-600 text-[8px] font-black">X</span>
                                          <input 
                                            className={cn("bg-transparent font-black w-10 text-center border-b border-transparent focus:bg-slate-800 focus:border-[#F06C22] hover:border-slate-700/50 focus:outline-none text-sm transition-all rounded-t-sm", log.isStaticHold ? "text-blue-400" : "text-white")}
                                            value={log.isStaticHold ? (log.timeUnderLoad ?? 0) : (log.reps ?? 0)}
                                            onChange={e => updateLogData(session.id, log.id, log.isStaticHold ? 'timeUnderLoad' : 'reps', parseInt(e.target.value) || 0)}
                                            placeholder={log.isStaticHold ? "SEC" : "REP"}
                                            title={log.isStaticHold ? "Seconds" : "Reps"}
                                          />
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                          <label className="flex items-center gap-1 cursor-pointer" title="Static Hold (TSC)">
                                            <input 
                                              type="checkbox" 
                                              checked={log.isStaticHold} 
                                              onChange={e => updateLogData(session.id, log.id, 'isStaticHold', e.target.checked)}
                                              className="w-2.5 h-2.5 bg-slate-900 border-slate-700 rounded text-[#F06C22] focus:ring-[#F06C22] focus:ring-offset-0"
                                            />
                                            <span className={cn("text-[7px] font-black uppercase tracking-tighter", log.isStaticHold ? "text-blue-400" : "text-slate-600")}>
                                              TSC
                                            </span>
                                          </label>
                                          
                                          <button 
                                            onClick={() => {
                                              setValidationSessions(prev => prev.map(s => {
                                                if (s.id !== session.id) return s;
                                                return { ...s, machines: s.machines.filter(l => l.id !== log.id) };
                                              }))
                                            }}
                                            className="text-slate-600 hover:text-red-500 opacity-0 group-hover/cell:opacity-100 transition-all p-0.5 hover:bg-slate-800 rounded"
                                            title="Delete Log"
                                          >
                                            <Trash2 size={10} />
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center opacity-10">
                                        <div className="w-1 h-1 rounded-full bg-slate-600" />
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {validationSessions.length > 0 && (
                      <div className="mt-8 mb-4">
                        <Button 
                          onClick={finalizeImport}
                          disabled={isFinalizing || validationSessions.some(s => !s.date)}
                          className="w-full flex items-center justify-center gap-3 bg-[#F06C22] hover:bg-[#D95B16] text-white font-black text-lg h-20 tracking-widest uppercase transition-all shadow-[0_10px_40px_rgba(240,108,34,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isFinalizing ? (
                            <div className="flex flex-col items-center gap-3 w-full max-w-md px-6">
                              <div className="flex justify-between w-full mb-1">
                                <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Database Sync Integrity</span>
                                <span className="text-[10px] font-black text-white uppercase">{finalizeProgress}%</span>
                              </div>
                              <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden border border-white/5">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${finalizeProgress}%` }}
                                  className="h-full bg-gradient-to-r from-[#F06C22] to-[#FF8C42] shadow-[0_0_10px_rgba(240,108,34,0.5)]"
                                />
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
                                <p className="text-[11px] font-bold text-white uppercase tracking-tighter">Committing Clinical Records...</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <ArrowRight className="w-8 h-8" />
                              [ Confirm & Write to Client History ]
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
