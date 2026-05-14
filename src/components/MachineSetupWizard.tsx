import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wand2, ShieldCheck, Target, Settings2, UserCog, CheckCircle, AlertTriangle, History } from 'lucide-react';
import { generateMachineSetupGuide, SetupWizardResult } from '../services/geminiService';
import { Machine, Client, WorkoutSession, ExerciseLog } from '../types';
import { MACHINE_LIST } from '../data/machine-database';
import { parseSessionDate } from '../lib/utils';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';

interface Props {
  client: Client;
  machine: Machine;
}

export function MachineSetupWizard({ client, machine }: Props) {
  const [clientDetails, setClientDetails] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<SetupWizardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const referenceData = MACHINE_LIST.find(m => m.id === machine.id || m.name === machine.name);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      // 1. Fetch historical context for this machine
      let historicalContext = "No previous settings found for this specific machine.";
      try {
        const sessionsRef = collection(db, 'sessions');
        const q = query(
          sessionsRef, 
          where('clientId', '==', client.id),
          orderBy('date', 'desc')
        );
        const sessionSnap = await getDocs(q);
        const allSessions = sessionSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkoutSession));
        
        // Robust sort to handle any legacy string date discrepancies
        allSessions.sort((a, b) => parseSessionDate(b.date) - parseSessionDate(a.date));

        // Find the most recent session where this machine was performed
        let lastSession: WorkoutSession | null = null;
        let lastLog: ExerciseLog | null = null;

        for (const session of allSessions) {
          // We need to check logs for this session. 
          // Note: In an optimized production environment, we might query the logs collection directly,
          // but here we check for existence to build the prompt context.
          const logsRef = collection(db, 'sessions', session.id!, 'logs');
          const logsSnap = await getDocs(logsRef);
          const logs = logsSnap.docs.map(d => d.data() as ExerciseLog);
          
          const targetLog = logs.find(l => l.machineId === machine.id || l.machineId === referenceData?.id);
          if (targetLog) {
            lastSession = session;
            lastLog = targetLog;
            break;
          }
        }

        if (lastSession && lastLog) {
          historicalContext = `LAST PERFORMED SETTINGS (Session Date: ${lastSession.date}): 
- Settings: ${lastLog.machineSettings ? Object.entries(lastLog.machineSettings).map(([k, v]) => `${k}: ${v}`).join(', ') : 'N/A'}
- Weight: ${lastLog.weight} lbs
- Reps: ${lastLog.reps}
- Quality: ${lastLog.repQuality}/3 (1=Bad, 2=Completed, 3=Good)`;
        }
      } catch (historyErr) {
        console.warn("Could not retrieve historical context for wizard:", historyErr);
      }

      const refTextContext = [
        `Target: ${referenceData?.target || 'N/A'}`,
        `Setup: ${referenceData?.setup || 'N/A'}`,
        `Execution: ${referenceData?.execution || 'N/A'}`,
        `\n[HISTORICAL CONTEXT]\n${historicalContext}`
      ].join("\n");

      const defaultDetails = clientDetails.trim() || `Client: ${client.firstName} ${client.lastName}. Medical History: ${client.medicalHistory || 'None noted'}. Clinical Profile: ${(client.clinicalProfile || []).join(', ') || 'None noted'}. Notes: ${client.globalNotes || 'None'}`;

      const generated = await generateMachineSetupGuide(
        machine.name,
        defaultDetails,
        refTextContext,
        client.clinicalProfile?.join(', ') || '',
        machine.contraindicatedFor?.join(', ') || ''
      );
      
      setResult(generated);
    } catch (err: any) {
      setError(err.message || "Failed to generate wizard output.");
    } finally {
      setIsGenerating(false);
    }
  };

  const hasContraindication = client.clinicalProfile?.some(ailment => machine.contraindicatedFor?.includes(ailment));

  return (
    <div className="space-y-4">
      {/* Input Section */}
      <Card className="rounded-2xl border border-slate-700 shadow-sm shadow-black/50 bg-[#0e171e] text-white">
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#38BDF8]/10 rounded-xl flex items-center justify-center border border-[#38BDF8]/30">
              <Wand2 className="w-5 h-5 text-[#38BDF8]" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-[#F8F9FA]">Clinical Strategy Engine</h3>
              <p className="text-[10px] uppercase tracking-widest text-[#68717A] mt-0.5">Cross-Referencing Mechanics & Profile</p>
            </div>
          </div>
          
          {hasContraindication && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 flex items-start gap-3 mt-2 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
               <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
               <div>
                 <span className="text-xs font-black uppercase tracking-widest text-red-400 block mb-1">Contraindication Alert</span>
                 <p className="text-xs text-red-200">This client's clinical profile conflicts with known contraindications for this machine. Setup guide will prioritize strict safety modifications or alternative recommendations.</p>
               </div>
            </div>
          )}
          
          <Textarea 
            placeholder="Add specific constraints (e.g., 'short arms', 'history of lower back pain') or leave blank to use client profile notes..."
            value={clientDetails}
            onChange={e => setClientDetails(e.target.value)}
            className="h-20 resize-none bg-black/40 border-slate-800 text-emerald-400 font-mono placeholder:text-slate-600 text-sm focus-visible:ring-[#38BDF8]"
          />
          
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || !referenceData}
            className={`w-full ${hasContraindication ? 'bg-red-600 hover:bg-red-500 shadow-[0_4px_20px_rgba(220,38,38,0.4)]' : 'bg-[#115E8D] hover:bg-[#0c4a70] shadow-[0_4px_20px_rgba(17,94,141,0.4)]'} text-white font-black uppercase tracking-widest text-xs h-12 rounded-xl transition-all`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Biomechanics...
              </>
            ) : (
              <>
                Generate Protocol
              </>
            )}
          </Button>

          {!referenceData && (
            <p className="text-[10px] text-red-400 font-bold tracking-widest text-center mt-2">Missing reference data for this machine.</p>
          )}
          {error && (
            <p className="text-[10px] text-red-500 font-bold tracking-widest text-center bg-red-500/10 p-2 rounded-lg mt-2">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Output Section - Terminal Style */}
      {result && (
        <Card className="rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden mt-6 animate-in slide-in-from-bottom-2">
          {/* Mac-like terminal header */}
          <div className="bg-slate-950 px-4 py-2 flex items-center gap-2 border-b border-slate-800">
             <div className="flex gap-1.5">
               <div className="w-3 h-3 rounded-full bg-red-500" />
               <div className="w-3 h-3 rounded-full bg-amber-500" />
               <div className="w-3 h-3 rounded-full bg-emerald-500" />
             </div>
             <span className="text-[10px] font-mono text-slate-500 ml-2">msf_clinical_guidance.sh</span>
          </div>
          
          <CardContent className="p-5 font-mono text-sm">
            <div className="flex flex-wrap gap-2 mb-6">
              {result.targetMuscles.map(m => (
                <Badge key={m} className="bg-slate-800 text-[#38BDF8] border border-[#38BDF8]/30 uppercase text-[9px] font-black tracking-widest px-3 py-1">
                  {m}
                </Badge>
              ))}
            </div>

            <div className="space-y-6">
              {/* Box 1 */}
              <div>
                <span className="text-emerald-400 text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-2">
                  <span className="text-slate-600">&gt;</span> Initial Settings
                </span>
                <ul className="space-y-1.5 pl-4 border-l border-slate-800">
                  {result.initialAdjustments.map((step, idx) => (
                    <li key={idx} className="text-slate-300 leading-relaxed">
                      <span className="text-emerald-500/50 mr-2">[{idx+1}]</span>{step}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Box 2 */}
              <div>
                <span className="text-[#38BDF8] text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-2">
                  <span className="text-slate-600">&gt;</span> Entry & Safety Routine
                </span>
                <ul className="space-y-1.5 pl-4 border-l border-slate-800">
                  {result.entryAndSafety.map((step, idx) => (
                    <li key={idx} className="text-slate-300 leading-relaxed">
                      <span className="text-[#38BDF8]/50 mr-2">[{idx+1}]</span>{step}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Box 3 */}
              <div>
                <span className="text-purple-400 text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-2">
                  <span className="text-slate-600">&gt;</span> Alignment Validation
                </span>
                <ul className="space-y-1.5 pl-4 border-l border-slate-800">
                  {result.alignmentAndPosture.map((step, idx) => (
                    <li key={idx} className="text-slate-300 leading-relaxed flex items-start">
                      <span className="text-purple-400 mr-2 shrink-0">~</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Box 4 */}
              <div className={`p-4 rounded-xl border ${hasContraindication ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/20'}`}>
                <span className={`text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-2 ${hasContraindication ? 'text-red-400' : 'text-amber-400'}`}>
                  <span className="text-slate-600">&gt;</span> {hasContraindication ? 'CRITICAL MODIFICATIONS' : 'PROTOCOL MODIFICATIONS'}
                </span>
                <p className={`leading-relaxed text-sm ${hasContraindication ? 'text-red-200' : 'text-amber-200/90'}`}>
                  {result.clientModifications}
                </p>
              </div>

            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
