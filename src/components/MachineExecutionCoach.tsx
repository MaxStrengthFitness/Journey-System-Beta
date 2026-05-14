import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, ArrowDownUp, RefreshCcw, Hand, Volume2 } from 'lucide-react';
import { generateExecutionGuide, ExecutionGuideResult } from '../services/geminiService';
import { Machine } from '../types';
import { MACHINE_LIST } from '../data/machine-database';

interface Props {
  machine: Machine;
}

export function MachineExecutionCoach({ machine }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ExecutionGuideResult | null>(null);
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

      const generated = await generateExecutionGuide(
        machine.name,
        refTextContext
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
            <div className="w-10 h-10 bg-emerald-900/30 rounded-xl flex items-center justify-center border border-emerald-500/30">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-[#F8F9FA]">Execution & Cueing</h3>
              <p className="text-[10px] uppercase tracking-widest text-[#68717A] mt-0.5">AI-Powered Active Set Coaching</p>
            </div>
          </div>
          
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || !referenceData}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs h-12 rounded-xl transition-all shadow-[0_4px_20px_rgba(16,185,129,0.3)]"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Execution Flow...
              </>
            ) : (
              <>
                Extract Coaching Script
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
          <div className="grid md:grid-cols-2 gap-4">
            {/* Load Up */}
            <Card className="rounded-2xl border-none shadow-lg bg-white overflow-hidden relative md:col-span-2">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#115E8D]" />
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowDownUp className="w-4 h-4 text-[#115E8D]" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-800">1. Gradual Load Up</h4>
                </div>
                <p className="text-sm font-semibold text-slate-700 leading-snug">
                  {result.gradualLoadUp}
                </p>
              </CardContent>
            </Card>

            {/* Turnarounds */}
            <Card className="rounded-2xl border border-indigo-100 shadow-lg bg-indigo-50/30 overflow-hidden relative md:col-span-2">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <RefreshCcw className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-800">2. Turnaround Rules</h4>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-white p-3 rounded-xl border border-indigo-100/50">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-1">Lower Turn (Stretch)</span>
                    <span className="text-sm font-semibold text-slate-700 leading-snug">{result.turnaroundRules.lowerTurn}</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-indigo-100/50">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-1">Upper Turn (Contraction)</span>
                    <span className="text-sm font-semibold text-slate-700 leading-snug">{result.turnaroundRules.upperTurn}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Set Cues */}
            <Card className="rounded-2xl border-none shadow-lg bg-slate-900 text-white overflow-hidden relative md:col-span-2">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#38BDF8]" />
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Volume2 className="w-4 h-4 text-[#38BDF8]" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[#38BDF8]">3. Active Set Cues (What to say)</h4>
                </div>
                <ul className="space-y-3">
                  {result.activeSetCues.map((cue, idx) => (
                    <li key={idx} className="flex gap-3 items-start bg-white/5 p-3 rounded-xl">
                      <span className="text-[#F06C22] font-serif text-2xl leading-none mt-1">"</span>
                      <span className="text-sm font-semibold text-slate-200 leading-snug italic pt-1">{cue}</span>
                      <span className="text-[#F06C22] font-serif text-2xl leading-none mt-1 ml-auto">"</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Failure & Exit */}
            <Card className="rounded-2xl border border-rose-200 shadow-lg bg-rose-50/50 overflow-hidden relative md:col-span-2">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Hand className="w-4 h-4 text-rose-600" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-rose-800">4. Failure & Exit</h4>
                </div>
                <p className="text-sm font-semibold text-rose-900/90 leading-snug">
                  {result.failureAndExit}
                </p>
              </CardContent>
            </Card>

          </div>
        </div>
      )}
    </div>
  );
}
