import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Download, Share, Target, Activity } from 'lucide-react';
import { Client, Machine } from '../types';
import { RoutineTemplate } from '../data/routine-templates';
import { MACHINE_LIST } from '../data/machine-database';

interface ClientPrescriptionVisualizerProps {
  client: Client;
  template: RoutineTemplate;
  machineIds: string[];
  onBack: () => void;
}

export function ClientPrescriptionVisualizer({ client, template, machineIds, onBack }: ClientPrescriptionVisualizerProps) {
  
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-900 overflow-hidden print:bg-white print:p-0">
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200 shrink-0 print:hidden shadow-sm z-10">
        <Button variant="ghost" onClick={onBack} className="text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Builder
        </Button>
        <div className="flex space-x-2">
          <Button variant="outline" className="text-slate-600 border-slate-300" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> Print PDF
          </Button>
          <Button className="bg-[#115E8D] hover:bg-[#0f537c] text-white">
            <Share className="w-4 h-4 mr-2" /> Share via Email
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto bg-white border border-slate-200 p-8 shadow-2xl print:border-none print:shadow-none print:p-0">
          
          {/* Header */}
          <div className="border-b-2 border-[#115E8D] pb-6 mb-8 flex items-end justify-between">
            <div>
              <h1 className="text-slate-400 font-bold uppercase tracking-[0.3em] text-xs mb-2">MaxStrength Clinical Protocol</h1>
              <h2 className="text-4xl font-black text-[#0A2E46] tracking-tight">{client.firstName} {client.lastName}</h2>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black italic text-[#F06C22] leading-none mb-1">MSF</div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Personalized Prescription</p>
            </div>
          </div>

          {/* Objective Summary */}
          <div className="bg-[#f0f6fa] rounded-xl p-6 mb-10 border border-[#e0eef6]">
            <h3 className="text-sm font-black uppercase tracking-widest text-[#115E8D] mb-3 flex items-center gap-2">
               <Target className="w-4 h-4" /> Protocol Objective
            </h3>
            <p className="text-slate-700 leading-relaxed font-medium text-lg">
              {template.objective}
            </p>
          </div>

          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4" /> The Sequence
          </h3>

          <div className="space-y-4">
            {machineIds.map((id, index) => {
              const machine = MACHINE_LIST.find(m => m.id === id);
              if (!machine) return null;

              // Translate dense technical classifications
              let friendlyType = "";
              if (machine.kinematicClassification?.includes("Push")) friendlyType = "Push Movement";
              if (machine.kinematicClassification?.includes("Pull")) friendlyType = "Pull Movement";
              if (machine.kinematicClassification?.includes("Rotary")) friendlyType = "Rotary Movement";

              return (
                <div key={index} className="flex gap-6 group">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-[#115E8D] text-white flex items-center justify-center font-black shadow-md mt-1">
                      {index + 1}
                    </div>
                    {index < machineIds.length - 1 && <div className="w-0.5 h-full bg-slate-200 my-2 group-last:hidden" />}
                  </div>
                  <div className="flex-1 pb-6 group-last:pb-0">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="text-xl font-black text-[#0A2E46] uppercase tracking-wide">{machine.name}</h4>
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 px-3 py-1 rounded-full">
                          {friendlyType}
                        </span>
                      </div>
                      <p className="text-slate-600 mb-3 text-sm font-medium">
                        Targeting: <span className="font-bold text-slate-800">{machine.targetMuscles}</span>
                      </p>
                      
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-sm text-slate-600 leading-relaxed">
                        {template.sequence.find(s => s.machineId === id)?.setupOverrides || machine.biomechanicalNotes || machine.setup}
                        {template.sequence.find(s => s.machineId === id)?.executionOverrides && (
                           <span className="block mt-2 pt-2 border-t border-slate-200">
                             {template.sequence.find(s => s.machineId === id)?.executionOverrides}
                           </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200 text-center">
            <p className="text-sm font-medium text-slate-600 max-w-2xl mx-auto italic leading-relaxed">
              "Your routine consists of exactly {machineIds.length} exercises performed in a strict 30-minute window. We sequence pushing and pulling movements specifically to protect your joints and maximize the hypertrophic stimulus across your entire body without overlapping fatigue."
            </p>
            <div className="mt-8 text-[10px] uppercase font-bold tracking-widest text-slate-400">
               Medical Grade Science. Extraordinary Results.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
