import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
const DraggableAny = Draggable as any;
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertTriangle, Info, Play, Plus, Trash2, Settings2, Hand, X, Share } from 'lucide-react';
import { Client, Machine } from '../types';
import { MACHINE_LIST } from '../data/machine-database';
import { ROUTINE_TEMPLATES, validateRoutineSequence, ValidationRuleViolation } from '../data/routine-templates';
import { ClientPrescriptionVisualizer } from './ClientPrescriptionVisualizer';

interface RoutineBuilderViewProps {
  client: Client;
  onSaveRoutine: (machineIds: string[]) => void;
  onBack: () => void;
}

export function RoutineBuilderView({ client, onSaveRoutine, onBack }: RoutineBuilderViewProps) {
  const [selectedSequence, setSelectedSequence] = useState<string[]>([]);
  const [violations, setViolations] = useState<ValidationRuleViolation[]>([]);
  const [recommendedTemplate, setRecommendedTemplate] = useState(ROUTINE_TEMPLATES[0]);
  const [previewMode, setPreviewMode] = useState(false);

  // Recommendation logic
  useEffect(() => {
    const isBackIssues = client.medicalHistory?.toLowerCase().includes('back') || client.clinicalProfile?.includes('Lower Back Pain');
    const isAgingOrBalance = client.age && client.age > 65 || client.clinicalProfile?.includes('Balance Issues');
    const isDeskWorker = ['software', 'developer', 'desk', 'office', 'executive', 'admin'].some(k => client.occupation?.toLowerCase().includes(k));

    if (isBackIssues) {
      setRecommendedTemplate(ROUTINE_TEMPLATES[1]);
    } else if (isAgingOrBalance) {
      setRecommendedTemplate(ROUTINE_TEMPLATES[2]);
    } else {
      setRecommendedTemplate(ROUTINE_TEMPLATES[0]);
    }
  }, [client]);

  useEffect(() => {
    if (selectedSequence.length > 0) {
      setViolations(validateRoutineSequence(selectedSequence));
    } else {
      setViolations([]);
    }
  }, [selectedSequence]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    // Dropping in the sequence list
    if (result.source.droppableId === 'sequence' && result.destination.droppableId === 'sequence') {
      const newSequence = Array.from(selectedSequence);
      const [reorderedItem] = newSequence.splice(result.source.index, 1);
      newSequence.splice(result.destination.index, 0, reorderedItem);
      setSelectedSequence(newSequence);
    } 
    // Dropping from machine pool to sequence list
    else if (result.source.droppableId === 'machines' && result.destination.droppableId === 'sequence') {
      const machineId = result.draggableId.replace('pool-', '');
      const newSequence = Array.from(selectedSequence);
      newSequence.splice(result.destination.index, 0, machineId);
      setSelectedSequence(newSequence);
    }
  };

  const removeMachine = (index: number) => {
    const newSequence = [...selectedSequence];
    newSequence.splice(index, 1);
    setSelectedSequence(newSequence);
  };

  const loadTemplate = (templateId: string) => {
    const template = ROUTINE_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedSequence(template.sequence.map(s => s.machineId));
    }
  };

  if (previewMode) {
    const templateForPreview = ROUTINE_TEMPLATES.find(t => 
      t.sequence.length === selectedSequence.length && 
      t.sequence.every((seq, i) => seq.machineId === selectedSequence[i])
    ) || { 
      id: "custom", 
      name: "Custom Prescription", 
      targetDemographic: client.firstName, 
      objective: "Personalized to your unique biomechanics and goals.", 
      sequence: selectedSequence.map(id => ({ machineId: id, setupOverrides: "", executionOverrides: "" })) 
    };

    return (
      <ClientPrescriptionVisualizer 
        client={client}
        template={templateForPreview}
        machineIds={selectedSequence}
        onBack={() => setPreviewMode(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0A2E46] p-4 lg:p-8 text-white overflow-hidden">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-white">Routine Engineer</h1>
          <p className="text-slate-400 text-sm font-medium">Deterministic protocol prescription for {client.firstName} {client.lastName}</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" onClick={onBack} className="bg-transparent border-white/20 text-white hover:bg-white/10">Back to Profile</Button>
          <Button onClick={() => setPreviewMode(true)} disabled={selectedSequence.length === 0} className="bg-sky-600 hover:bg-sky-500 text-white font-bold uppercase tracking-widest text-[10px]">
             <Share className="w-4 h-4 mr-2" /> Share / Present
          </Button>
          <Button onClick={() => onSaveRoutine(selectedSequence)} className="bg-[#F06C22] hover:bg-[#D95B1B] text-white font-bold uppercase tracking-widest text-[10px]">
            Save Routine
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full overflow-hidden">
        {/* Recommendation Panel */}
        <div className="lg:col-span-4 flex flex-col gap-4 h-full overflow-y-auto pr-2 pb-20">
          <Card className="bg-slate-900 border-sky-500/30 shadow-[0_0_20px_rgba(14,165,233,0.15)] relative overflow-hidden shrink-0">
            <div className="absolute top-0 left-0 w-1 h-full bg-sky-500" />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-sky-400 flex items-center gap-2">
                <Settings2 className="w-4 h-4" /> AI Recommended Prescription
              </CardTitle>
            </CardHeader>
            <CardContent>
              <h3 className="text-lg font-bold text-white mb-1">{recommendedTemplate.name}</h3>
              <p className="text-xs text-slate-400 mb-3">{recommendedTemplate.objective}</p>
              
              <div className="bg-slate-950 p-3 rounded-lg mb-4 text-xs font-mono text-slate-400 border border-slate-800">
                <span className="text-white">Analysis:</span> Client ({client.occupation || 'No job listed'}, {client.medicalHistory || 'No history'}) matched with {recommendedTemplate.targetDemographic}
              </div>

              <Button onClick={() => loadTemplate(recommendedTemplate.id)} className="w-full bg-sky-600 hover:bg-sky-500 font-bold uppercase tracking-widest text-[10px]">
                Apply Recommmended Template
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-700/50 shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-300">Other Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ROUTINE_TEMPLATES.map(t => t.id !== recommendedTemplate.id && (
                <Button key={t.id} variant="outline" onClick={() => loadTemplate(t.id)} className="w-full justify-start h-auto py-3 bg-slate-800/50 border-slate-700 hover:bg-slate-700 text-left hover:text-white">
                  <div>
                    <div className="font-bold text-xs uppercase tracking-wider text-slate-300">{t.name}</div>
                    <div className="text-[10px] text-slate-500 font-normal mt-0.5 line-clamp-1">{t.objective}</div>
                  </div>
                </Button>
              ))}
            </CardContent>
          </Card>

          <div className="pt-4 border-t border-slate-800">
           <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3 ml-1">Machine Arsenal</h3>
           <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="machines" isDropDisabled={true}>
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {MACHINE_LIST.filter(m => !selectedSequence.includes(m.id)).map((machine, index) => (
                      <DraggableAny key={`pool-${machine.id}`} draggableId={`pool-${machine.id}`} index={index}>
                        {(provided: any, snapshot: any) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-slate-800 border ${snapshot.isDragging ? 'border-sky-500 shadow-xl' : 'border-slate-700'} p-3 rounded-lg flex items-center justify-between`}
                          >
                            <div>
                               <div className="text-xs font-bold text-white uppercase tracking-wider">{machine.name}</div>
                               <div className="text-[9px] text-slate-400 uppercase tracking-widest">{machine.kinematicClassification || 'N/A'}</div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700" onClick={() => setSelectedSequence([...selectedSequence, machine.id])}>
                              <Plus className="w-4 h-4"/>
                            </Button>
                          </div>
                        )}
                      </DraggableAny>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </div>

        {/* Builder Panel */}
        <div className="lg:col-span-8 flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 overflow-hidden">
          <div className="flex justify-between items-end mb-4 shrink-0">
            <h2 className="text-lg font-black uppercase tracking-widest text-[#F8F9FA]">Draft Protocol</h2>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-800 px-3 py-1 rounded-full">
              {selectedSequence.length} / 8 Exercises
            </div>
          </div>
          
          {violations.length > 0 && (
             <div className="bg-rose-950/40 border border-rose-900 rounded-xl p-4 mb-4 shrink-0 shadow-inner">
                <h4 className="text-xs font-black uppercase text-rose-500 flex items-center gap-2 mb-2 tracking-widest">
                  <AlertTriangle className="w-4 h-4" /> System Guardrails Triggered
                </h4>
                <ul className="space-y-2">
                  {violations.map((v, i) => (
                    <li key={i} className={`text-xs p-2 rounded-md ${v.severity === 'error' ? 'bg-rose-900/30 text-rose-200 border border-rose-800/50' : 'bg-amber-900/30 text-amber-200 border border-amber-800/50'}`}>
                      <strong className="uppercase mr-2 font-bold">{v.ruleName}:</strong> 
                      {v.message}
                    </li>
                  ))}
                </ul>
             </div>
          )}

          <div className="flex-1 overflow-y-auto pr-2 pb-10">
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="sequence">
                {(provided, snapshot) => (
                  <div 
                    {...provided.droppableProps} 
                    ref={provided.innerRef} 
                    className={`min-h-[200px] border-2 border-dashed rounded-xl transiton-all p-2 ${snapshot.isDraggingOver ? 'border-sky-500/50 bg-sky-950/20' : 'border-slate-800'}`}
                  >
                    {selectedSequence.length === 0 && !snapshot.isDraggingOver && (
                      <div className="h-full flex items-center justify-center text-slate-500 text-sm font-medium uppercase tracking-widest h-[200px]">
                         Drag machines here or select a template
                      </div>
                    )}
                    
                    <Accordion type="multiple" className="w-full space-y-2">
                      {selectedSequence.map((machineId, index) => {
                        const machine = MACHINE_LIST.find(m => m.id === machineId);
                        if (!machine) return null;
                        
                        const isErrorTarget = violations.some(v => v.indices?.includes(index) && v.severity === 'error');

                        return (
                          <DraggableAny key={`seq-${machineId}-${index}`} draggableId={machineId} index={index}>
                            {(provided: any, snapshot: any) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`rounded-xl overflow-hidden border ${snapshot.isDragging ? 'border-sky-500 shadow-xl z-50 relative' : isErrorTarget ? 'border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.2)]' : 'border-slate-700'}`}
                              >
                                <AccordionItem value={`acc-${machineId}-${index}`} className="border-b-0">
                                  <div className="flex items-center bg-slate-800 pl-2">
                                     <div {...provided.dragHandleProps} className="p-2 cursor-grab text-slate-500 hover:text-white">
                                       <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-grip-vertical w-4 h-4"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                                     </div>
                                     <AccordionTrigger className="hover:no-underline py-3 px-2 flex-1 [&[data-state=open]>div>svg]:rotate-180">
                                        <div className="flex items-center gap-3 text-left">
                                           <div className="w-6 h-6 rounded bg-slate-900 border border-slate-700 flex items-center justify-center text-[10px] font-black text-slate-400 shrink-0">
                                              {index + 1}
                                           </div>
                                           <div>
                                             <div className={`font-black uppercase tracking-wider text-sm ${isErrorTarget ? 'text-rose-400' : 'text-white'}`}>{machine.name}</div>
                                             <div className="text-[9px] uppercase tracking-widest text-[#38BDF8] flex items-center gap-2 mt-0.5">
                                               {machine.kinematicClassification || 'N/A'}
                                               {machine.setupGap && <span className="text-slate-400 border-l border-slate-600 pl-2">{machine.setupGap}</span>}
                                             </div>
                                           </div>
                                        </div>
                                     </AccordionTrigger>
                                     <div className="pr-3 flex items-center gap-2">
                                       {machine.requiresHandoff && <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[9px] px-1 py-0 hidden sm:inline-flex" title="Handoff Required"><Hand className="w-3 h-3"/></Badge>}
                                       <Button variant="ghost" size="icon" onClick={() => removeMachine(index)} className="h-8 w-8 text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 rounded-lg">
                                         <Trash2 className="w-4 h-4"/>
                                       </Button>
                                     </div>
                                  </div>
                                  <AccordionContent className="bg-slate-900/50 p-4 border-t border-slate-700">
                                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                       <div className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                                          <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">Setup Overrides</h5>
                                          <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                            {machine.setupGap ? <span className="text-sky-400 block mb-1">Gap: {machine.setupGap}</span> : null}
                                            {ROUTINE_TEMPLATES.flatMap(t => t.sequence).find(s => s.machineId === machine.id)?.setupOverrides || machine.setup || 'Standard setup protocol.'}
                                          </p>
                                       </div>
                                       <div className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                                          <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">Execution & Posture</h5>
                                          <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                            {machine.executionPosture && <span className={`block mb-1 ${machine.executionPosture.includes('Posterior') ? 'text-amber-400' : 'text-emerald-400'}`}>Posture: {machine.executionPosture}</span>}
                                            {ROUTINE_TEMPLATES.flatMap(t => t.sequence).find(s => s.machineId === machine.id)?.executionOverrides || machine.execution || 'Standard execution, maintain control.'}
                                          </p>
                                       </div>
                                     </div>
                                  </AccordionContent>
                                </AccordionItem>
                                </div>
                              )}
                            </DraggableAny>
                          );
                       })}
                     </Accordion>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </div>
      </div>
    </div>
  );
}
