import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Activity, Replace, ShieldAlert, TrendingUp, AlertTriangle } from 'lucide-react';
import { generateClinicalStrategy, ClinicalStrategyResult } from '../services/geminiService';
import { Machine, Client } from '../types';
import { MACHINE_LIST } from '../data/machine-database';

interface Props {
  client: Client;
  machine: Machine;
}

export function MachineClinicalStrategist({ client, machine }: Props) {
  const [clientDetails, setClientDetails] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ClinicalStrategyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const referenceData = MACHINE_LIST.find(m => m.id === machine.id || m.name === machine.name);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const refTextContext = [
        `Target: ${referenceData?.target || 'N/A'}`,
        `Setup: ${referenceData?.setup || 'N/A'}`,
        `Execution: ${referenceData?.execution || 'N/A'}`
      ].join("\n");

      // We explicitly pull medical history and injuries from the client object for the prompt
      const defaultDetails = clientDetails.trim() || `Client: ${client.firstName} ${client.lastName}. Medical History/Injuries: ${client.medicalHistory || 'None noted'}. Clinical Profile: ${(client.clinicalProfile || []).join(', ') || 'None noted'}. Notes: ${client.globalNotes || 'None'}`;

      const generated = await generateClinicalStrategy(
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

  return (
    <div className="space-y-4">
      {/* Input Section */}
      <Card className="rounded-2xl border-none shadow-sm shadow-slate-200/50 bg-[#0e171e] text-white">
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-900/30 rounded-xl flex items-center justify-center border border-rose-500/30">
              <Activity className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-[#F8F9FA]">Clinical & Progression</h3>
              <p className="text-[10px] uppercase tracking-widest text-[#68717A] mt-0.5">AI-Powered Modifications & Strategy</p>
            </div>
          </div>
          
          <Textarea 
            placeholder="Add specific limitations, pain points, or notes for this session (leave blank to use client's core medical profile)..."
            value={clientDetails}
            onChange={e => setClientDetails(e.target.value)}
            className="h-20 resize-none bg-white/5 border-white/10 text-white placeholder:text-slate-500 text-sm focus-visible:ring-rose-500"
          />

          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || !referenceData}
            className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black uppercase tracking-widest text-xs h-12 rounded-xl transition-all shadow-[0_4px_20px_rgba(225,29,72,0.3)]"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Clinical Feasibility...
              </>
            ) : (
              <>
                Generate Strategy Guide
              </>
            )}
          </Button>

          {!referenceData && (
            <p className="text-[10px] text-red-400 font-bold tracking-widest text-center">Missing reference data for this machine.</p>
          )}
          {error && (
            <p className="text-[10px] text-red-500 font-bold tracking-widest text-center bg-red-500/10 p-2 rounded-lg">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Output Section */}
      {result && (
        <div className="grid gap-4 mt-6 animate-in slide-in-from-bottom-2">
          
          {/* Contraindications Warning */}
          {result.contraindications.length > 0 && (
            <div className="bg-rose-900/10 border-l-[6px] border-rose-500 rounded-r-2xl p-4 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none">
                 <ShieldAlert className="w-20 h-20 text-rose-500" />
               </div>
               <div className="flex items-center gap-2 mb-2 relative z-10">
                 <ShieldAlert className="w-5 h-5 text-rose-500" />
                 <span className="text-[10px] font-black uppercase tracking-widest text-rose-600">Contraindications & Red Flags</span>
               </div>
               <ul className="space-y-1 mt-2">
                 {result.contraindications.map((contra, idx) => (
                   <li key={idx} className="text-sm text-rose-900 font-semibold leading-relaxed relative z-10 flex gap-2">
                     <span className="text-rose-400">•</span> {contra}
                   </li>
                 ))}
               </ul>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* Dynamic Modifications */}
            <Card className="rounded-2xl border-none shadow-lg bg-white overflow-hidden relative md:col-span-2">
               <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
               <CardContent className="p-5">
                 <div className="flex items-center gap-2 mb-3">
                   <AlertTriangle className="w-4 h-4 text-amber-500" />
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-800">Dynamic Modifications</h4>
                 </div>
                 <p className="text-sm font-semibold text-slate-700 leading-snug">
                   {result.dynamicModifications}
                 </p>
               </CardContent>
            </Card>

            {/* Static Protocol */}
            <Card className="rounded-2xl border-none shadow-lg bg-teal-50 overflow-hidden relative md:col-span-2">
               <div className="absolute top-0 left-0 w-1 h-full bg-teal-500" />
               <CardContent className="p-5">
                 <div className="flex items-center gap-2 mb-3">
                   <Activity className="w-4 h-4 text-teal-600" />
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-teal-800">Static Hold / TSC Protocol</h4>
                 </div>
                 {result.staticAlternativeProtocol.isRecommended ? (
                   <p className="text-sm font-semibold text-teal-900 leading-snug">
                     {result.staticAlternativeProtocol.setupAndExecution}
                   </p>
                 ) : (
                   <p className="text-xs font-semibold text-teal-800/60 uppercase tracking-widest">
                     Not presently recommended based on constraints.
                   </p>
                 )}
               </CardContent>
            </Card>

            {/* Substitutions */}
            <Card className="rounded-2xl border-none shadow-lg bg-white overflow-hidden relative">
               <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
               <CardContent className="p-5">
                 <div className="flex items-center gap-2 mb-3">
                   <Replace className="w-4 h-4 text-indigo-500" />
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-800">Approved Substitutions</h4>
                 </div>
                 <ul className="space-y-2 text-sm font-semibold text-slate-700">
                   {result.approvedSubstitutions.map((sub, idx) => (
                     <li key={idx} className="flex gap-2">
                       <span className="text-indigo-300">•</span> {sub}
                     </li>
                   ))}
                   {result.approvedSubstitutions.length === 0 && (
                     <p className="text-slate-400 italic text-xs">No specific substitutions reported.</p>
                   )}
                 </ul>
               </CardContent>
            </Card>

            {/* Progression Advice */}
            <Card className="rounded-2xl border border-emerald-100 shadow-lg bg-emerald-50/30 overflow-hidden relative">
               <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
               <CardContent className="p-5">
                 <div className="flex items-center gap-2 mb-3">
                   <TrendingUp className="w-4 h-4 text-emerald-600" />
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Progression Rules</h4>
                 </div>
                 <p className="text-sm font-semibold text-slate-700 leading-snug">
                   {result.progressionAdvice}
                 </p>
               </CardContent>
            </Card>

          </div>
        </div>
      )}
    </div>
  );
}
