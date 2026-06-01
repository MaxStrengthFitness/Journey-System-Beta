import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Layers, MapPin, Activity, BookOpen, Wrench, ShieldAlert, Wand2, Loader2, ShieldCheck, Target, UserCog, Settings2 } from 'lucide-react';
import { Machine } from '../types';
import {
  MACHINE_ANATOMY,
  MOVEMENT_PATTERN_ORDER,
  ANATOMICAL_REGION_ORDER,
  AnatomyView,
  MachineAnatomyMap,
} from '../data/machine-anatomy-map';
import { AnatomyFigure } from './AnatomyFigure';
import { MACHINE_DATABASE } from '../data/machine-database';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

type GroupingMode = 'movement' | 'region';
type Tab = 'anatomy' | 'profile';

interface MachineAnatomyCatalogViewProps {
  machines: Machine[];
  /** Called when the trainer taps "Setup Coach" / "View Machine Details" */
  onViewMachineDetails?: (machineId: string) => void;
}

export function MachineAnatomyCatalogView({
  machines,
  onViewMachineDetails,
}: MachineAnatomyCatalogViewProps) {
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [view, setView] = useState<AnatomyView>('front');
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('movement');
  const [activeTab, setActiveTab] = useState<Tab>('anatomy');
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  
  // Setup Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardConstraints, setWizardConstraints] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedGuide, setGeneratedGuide] = useState<any>(null);

  // Trainer Tips State
  const [trainerTips, setTrainerTips] = useState<string>('');
  const [isSavingTip, setIsSavingTip] = useState(false);

  const selectedMap: MachineAnatomyMap | null = selectedMachineId
    ? MACHINE_ANATOMY[selectedMachineId] ?? null
    : null;

  const selectedMachine = selectedMachineId
    ? machines.find((m) => m.id === selectedMachineId) ?? null
    : null;
    
  const machineKnowledge = selectedMachineId 
    ? MACHINE_DATABASE[selectedMachineId] ?? null 
    : null;

  React.useEffect(() => {
    if (selectedMachineId) {
      const tip = localStorage.getItem(`trainer_tips_${selectedMachineId}`);
      setTrainerTips(tip || '');
    }
  }, [selectedMachineId]);

  const handleSaveTip = () => {
    if (selectedMachineId) {
      setIsSavingTip(true);
      localStorage.setItem(`trainer_tips_${selectedMachineId}`, trainerTips);
      setTimeout(() => setIsSavingTip(false), 800);
    }
  };

  const handleSelectMachine = (machineId: string) => {
    setSelectedMachineId(machineId);
    const map = MACHINE_ANATOMY[machineId];
    if (map) setView(map.preferredView);
  };

  const handleGenerateGuide = async () => {
    if (!selectedMachineId) return;
    setIsGenerating(true);
    setGeneratedGuide(null);
    
    // Mock AI generation delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setGeneratedGuide({
      targetMuscles: ["Chest (Pectoralis Major)", "Triceps", "Anterior Deltoid"],
      initialAdjustments: [
        "Empty the weight stack to ensure zero active resistance during entry.",
        "Set seat height to standard (setting 4 typically) as baseline.",
        "Ensure back pad is at the standard 20-degree incline."
      ],
      entryAndSafety: [
        "Assist client into the seat smoothly, guiding their elbows.",
        "Check that head is neutral and not pushed forward.",
        "Fasten seatbelt securely across the pelvis."
      ],
      alignmentAndPosture: [
        "Chest up, sternum proud.",
        "Check joint stacking: wrists neutral, elbows slightly flared."
      ],
      clientModifications: wizardConstraints 
        ? "Applied constraint adjustment: Checked ROM and modified starting point to avoid pain points mentioned."
        : "Standard MSF setup applies."
    });
    
    setIsGenerating(false);
  };



  const toggleGroup = (groupKey: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  /* ── Group machines based on the current grouping mode ───── */
  const groupedMachines = useMemo(() => {
    if (groupingMode === 'movement') {
      const buckets: Record<string, Machine[]> = {};
      MOVEMENT_PATTERN_ORDER.forEach((p) => (buckets[p] = []));
      machines.forEach((m) => {
        const map = m.id ? MACHINE_ANATOMY[m.id] : undefined;
        if (map) {
          buckets[map.movementPattern]?.push(m);
        }
      });
      return MOVEMENT_PATTERN_ORDER
        .map((p) => ({ key: p, label: p, machines: buckets[p] }))
        .filter((g) => g.machines.length > 0);
    } else {
      const buckets: Record<string, Machine[]> = {};
      ANATOMICAL_REGION_ORDER.forEach((r) => (buckets[r] = []));
      machines.forEach((m) => {
        const r = (m.anatomicalRegion as string) || 'Other';
        if (!buckets[r]) buckets[r] = [];
        buckets[r].push(m);
      });
      return Object.entries(buckets)
        .filter(([, list]) => list.length > 0)
        .map(([k, list]) => ({ key: k, label: k, machines: list }));
    }
  }, [machines, groupingMode]);

  return (
    <div className="grid md:grid-cols-[288px_1fr] flex flex-col h-full min-h-0 bg-bg-dark text-ink-d1">
      {/* ───── LEFT MENU ───── */}
      <aside className="md:border-r md:border-div-d md:overflow-y-auto md:bg-surface-1 md:h-full
                        border-b border-div-d max-h-[35vh] md:max-h-none overflow-y-auto bg-surface-1 flex flex-col">
        {/* Grouping toggle (sticky) */}
        <div className="sticky top-0 z-10 bg-surface-1 border-b border-div-d p-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setGroupingMode('movement')}
              className={`flex-1 min-h-[44px] rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan flex items-center justify-center gap-1.5 ${
                groupingMode === 'movement'
                  ? 'bg-cyan text-bg-dark'
                  : 'bg-surface-2 text-ink-d2 border border-div-d hover:bg-bg-dark-3 hover:text-white'
              }`}
              aria-pressed={groupingMode === 'movement'}
            >
              <Layers className="w-3.5 h-3.5" />
              Movement
            </button>
            <button
              type="button"
              onClick={() => setGroupingMode('region')}
              className={`flex-1 min-h-[44px] rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan flex items-center justify-center gap-1.5 ${
                groupingMode === 'region'
                  ? 'bg-cyan text-bg-dark'
                  : 'bg-surface-2 text-ink-d2 border border-div-d hover:bg-bg-dark-3 hover:text-white'
              }`}
              aria-pressed={groupingMode === 'region'}
            >
              <MapPin className="w-3.5 h-3.5" />
              Target Area
            </button>
          </div>
        </div>

        {/* Group list */}
        <div className="flex-1 py-2">
          {groupedMachines.map((group) => {
            return (
              <div key={group.key} className="border-b border-div-d/40 last:border-b-0">
                <div
                  className="flex items-center justify-between w-full min-h-[44px] px-4 text-left text-[12px] font-bold uppercase tracking-widest text-ink-d2"
                >
                  <span>{group.label}</span>
                  <span className="flex items-center gap-2 text-ink-d3 text-[11px] tabular-nums">
                    {group.machines.length}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 px-3 pb-4">
                  {group.machines.map((m) => {
                    const isSelected = selectedMachineId === m.id;
                    const map = m.id ? MACHINE_ANATOMY[m.id] : undefined;
                    const movement = map?.movementPattern || '';
                    
                    let colorClass = 'bg-slate-500';
                    if (movement.includes('Push')) colorClass = 'bg-sky-500';
                    else if (movement.includes('Pull')) colorClass = 'bg-indigo-500';
                    else if (movement.includes('Quad')) colorClass = 'bg-emerald-500';
                    else if (movement.includes('Posterior')) colorClass = 'bg-emerald-600';
                    else if (movement.includes('Core')) colorClass = 'bg-orange-500';
                    else if (movement.includes('Isolation')) colorClass = 'bg-amber-500';

                    let shortBadge = 'Misc';
                    if (movement.includes('Horizontal Push')) shortBadge = 'H. Push';
                    else if (movement.includes('Vertical Push')) shortBadge = 'V. Push';
                    else if (movement.includes('Horizontal Pull')) shortBadge = 'H. Pull';
                    else if (movement.includes('Vertical Pull')) shortBadge = 'V. Pull';
                    else if (movement.includes('Quad')) shortBadge = 'Quad';
                    else if (movement.includes('Posterior')) shortBadge = 'Post. Chain';
                    else if (movement.includes('Flexion')) shortBadge = 'Flexion';
                    else if (movement.includes('Extension')) shortBadge = 'Extension';
                    else if (movement.includes('Rotary')) shortBadge = 'Rotary';
                    else if (movement.includes('Isolation')) shortBadge = 'Isolation';

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => m.id && handleSelectMachine(m.id)}
                        className={`relative flex items-center justify-between w-full p-3 rounded-xl border transition-all text-left group overflow-hidden ${
                          isSelected
                            ? 'bg-surface-2 border-div-d shadow-md'
                            : 'bg-surface-1 border-transparent hover:bg-surface-2 hover:border-div-d/50'
                        }`}
                        aria-pressed={isSelected}
                      >
                        {/* Color rail */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${colorClass}`} />
                        
                        <div className="flex flex-col pl-3">
                          <span className={`text-[12px] font-bold tracking-widest truncate uppercase ${isSelected ? 'text-white' : 'text-ink-d1 group-hover:text-white'}`}>
                            {m.name}
                          </span>
                        </div>

                        {/* Badges container */}
                        <div className="flex items-center">
                          {isSelected ? (
                            <Badge className="bg-cta text-bg-dark text-[9px] uppercase tracking-widest border-none px-1.5 py-0 font-bold rounded-sm h-5 flex items-center justify-center">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-ink-d3 border-div-d text-[9px] uppercase tracking-widest px-1.5 py-0 h-5 flex items-center justify-center rounded-sm group-hover:text-ink-d1 group-hover:border-ink-d3 transition-colors bg-surface-1">
                              {shortBadge}
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ───── STAGE & TABS ───── */}
      <main className="grid grid-rows-[auto_1fr_auto] min-h-0 p-4 md:p-6 gap-4 relative">
        {/* Tabs */}
        {selectedMachine && (
          <div className="flex gap-2 w-full max-w-[400px] mx-auto border border-div-d rounded-2xl p-1 bg-surface-1">
            <button
              onClick={() => setActiveTab('anatomy')}
              className={`flex-1 min-h-[36px] rounded-xl text-[12px] font-bold uppercase tracking-widest transition-all ${
                activeTab === 'anatomy' ? 'bg-bg-dark text-white shadow-md' : 'text-ink-d3 hover:text-ink-d1'
              }`}
            >
              Anatomy
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex-1 min-h-[36px] rounded-xl text-[12px] font-bold uppercase tracking-widest transition-all ${
                activeTab === 'profile' ? 'bg-bg-dark text-white shadow-md' : 'text-ink-d3 hover:text-ink-d1'
              }`}
            >
              Profile
            </button>
          </div>
        )}

        {/* Anatomy Tab */}
        {(!selectedMachine || activeTab === 'anatomy') && (
          <>
            {/* View toggle */}
            <div className="flex gap-2 w-full">
              {(['front', 'side', 'back'] as AnatomyView[]).map((v) => {
                const isActive = view === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`flex-1 min-h-[44px] rounded-xl text-[12px] font-bold uppercase tracking-widest transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
                      isActive
                        ? 'bg-cyan text-bg-dark shadow-lg'
                        : 'bg-surface-2 text-ink-d2 border border-div-d hover:bg-bg-dark-3 hover:text-white'
                    }`}
                    aria-pressed={isActive}
                  >
                    {v}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex flex-col items-center justify-center bg-surface-1 rounded-2xl border border-div-d relative overflow-hidden group">
              <AnatomyFigure
                view={view}
                primary={selectedMap?.primary ?? []}
                secondary={selectedMap?.secondary ?? []}
                onMuscleClick={(muscleId) => {
                  const targetMachine = Object.values(MACHINE_ANATOMY).find(m => m.primary.includes(muscleId));
                  if (targetMachine) {
                    handleSelectMachine(targetMachine.machineId);
                    setActiveTab('anatomy');
                  }
                }}
              />
              {!selectedMap && (
                <div className="absolute inset-x-0 bottom-4 text-center pointer-events-none">
                  <span className="text-[11px] uppercase tracking-widest text-ink-d3 font-bold group-hover:opacity-0 transition-opacity">
                    Select a machine or tap a muscle to test targeting
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Profile Tab */}
        {selectedMachine && activeTab === 'profile' && machineKnowledge && (
          <div className="min-h-0 overflow-y-auto w-full max-w-2xl mx-auto space-y-6">
            <div className="bg-surface-1 border border-div-d rounded-3xl p-6">
              <div className="text-[11px] uppercase tracking-widest text-cyan font-bold mb-1">
                {machineKnowledge.kinematicClassification}
              </div>
              <h2 className="text-2xl font-bold uppercase italic text-white tracking-tight mb-4">
                {machineKnowledge.name}
              </h2>
              <div className="grid grid-cols-2 gap-4 border-t border-div-d/40 pt-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-d3 font-bold mb-1">Base Rx (Male)</div>
                  <div className="text-white font-medium text-lg">{machineKnowledge.baseMale} lbs</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-d3 font-bold mb-1">Base Rx (Female)</div>
                  <div className="text-white font-medium text-lg">{machineKnowledge.baseFemale} lbs</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-widest text-ink-d3 font-bold mb-1">Execution Posture</div>
                  <div className="text-white font-medium">{machineKnowledge.executionPosture}</div>
                </div>
              </div>
            </div>

            <div className="bg-surface-1 border border-div-d rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-5 h-5 text-cta" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-white">Manual</h3>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ink-d3 font-bold mb-1">Setup Protocol</div>
                <p className="text-sm text-ink-d1 leading-relaxed">{machineKnowledge.setup}</p>
              </div>
              <div className="pt-2">
                <div className="text-[10px] uppercase tracking-widest text-ink-d3 font-bold mb-1">Execution Protocol</div>
                <p className="text-sm text-ink-d1 leading-relaxed">{machineKnowledge.execution}</p>
              </div>
            </div>

            {machineKnowledge.clinicalWarnings && machineKnowledge.clinicalWarnings.length > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-3xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert className="w-5 h-5 text-orange-500" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-orange-500">Clinical Warnings</h3>
                </div>
                <ul className="space-y-2">
                  {machineKnowledge.clinicalWarnings.map((warning, idx) => (
                    <li key={idx} className="text-sm text-orange-500/90 leading-relaxed flex items-start gap-2">
                       <span className="text-orange-500 shrink-0 mt-0.5">•</span>
                       <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-surface-1 border border-div-d rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <UserCog className="w-5 h-5 text-cyan" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-white">Studio Trainer Tips</h3>
              </div>
              <div>
                <Textarea 
                  placeholder="Add specific tips, cues, or adjustments for this machine in your studio..."
                  value={trainerTips}
                  onChange={(e) => setTrainerTips(e.target.value)}
                  className="min-h-[100px] bg-bg-dark-3 border border-div-d focus-visible:ring-cyan text-white placeholder:text-ink-d3 mb-3 resize-y"
                />
                <Button 
                  onClick={handleSaveTip}
                  disabled={isSavingTip}
                  className="w-full bg-surface-2 hover:bg-surface-3 text-white border border-div-d font-bold tracking-widest uppercase transition-all"
                >
                  {isSavingTip ? "Saved!" : "Save Tips"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Details card / Actions */}
        <div className="bg-surface-1 border border-div-d rounded-2xl p-4 flex items-center gap-4 min-h-[96px] mt-auto">
          <div className="flex-1 min-w-0">
            {selectedMachine && selectedMap ? (
              <>
                <div className="text-[11px] uppercase tracking-widest text-cta font-bold mb-1">
                  {selectedMap.movementPattern}
                </div>
                <div className="text-[18px] font-bold uppercase italic text-white tracking-tight leading-none mb-2 truncate">
                  {selectedMachine.name}
                </div>
                <div className="text-[11px] text-ink-d2 leading-snug">
                  {selectedMap.clinicalNote}
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] uppercase tracking-widest text-ink-d3 font-bold mb-1">
                  Dynamic Anatomical Targeting
                </div>
                <div className="text-[14px] text-ink-d2 leading-snug">
                  Tap a machine on the left to visualize its primary and synergist musculature.
                </div>
              </>
            )}
          </div>
          {selectedMachine && (
            <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
              <DialogTrigger
                className="shrink-0 min-h-[48px] px-5 rounded-xl bg-cyan text-bg-dark text-[12px] font-bold uppercase tracking-widest shadow-lg active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan flex items-center gap-2"
              >
                <Wand2 className="w-4 h-4" />
                AI Setup Wizard
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] bg-bg-dark text-white border border-div-d shadow-2xl rounded-3xl p-6">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold uppercase tracking-widest text-cyan">
                    <Wand2 className="w-5 h-5 text-cyan" />
                    AI Setup Wizard
                  </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="bg-surface-1 border border-div-d rounded-xl p-4">
                    <div className="text-[11px] uppercase tracking-widest text-ink-d3 font-bold mb-1">Targeting Machine</div>
                    <div className="text-lg font-bold italic uppercase tracking-tight text-white">{selectedMachine.name}</div>
                  </div>
                  <div>
                    <Textarea 
                      placeholder="Client Constraints (e.g., knee pain, short arms)..."
                      value={wizardConstraints}
                      onChange={(e) => setWizardConstraints(e.target.value)}
                      className="min-h-[100px] bg-surface-1 border border-div-d focus-visible:ring-cyan text-white placeholder:text-ink-d3"
                    />
                  </div>
                  <Button 
                    onClick={handleGenerateGuide}
                    disabled={isGenerating}
                    className="w-full bg-cyan hover:bg-cyan/90 text-bg-dark font-bold tracking-widest uppercase"
                  >
                    {isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : "Generate Custom Setup Guide"}
                  </Button>

                  {generatedGuide && (
                    <div className="mt-4 p-4 bg-surface-1 border border-div-d rounded-xl max-h-[400px] overflow-y-auto space-y-4 custom-scrollbar">
                      <div className="space-y-2">
                         <h4 className="text-[11px] font-bold uppercase tracking-widest text-[#38BDF8]">Target Muscles</h4>
                         <div className="flex flex-wrap gap-2">
                           {generatedGuide.targetMuscles.map((t: string) => (
                              <Badge key={t} className="bg-bg-dark-3 text-white border border-div-d">{t}</Badge>
                           ))}
                         </div>
                      </div>
                      
                      <div className="space-y-2">
                         <h4 className="text-[11px] font-bold uppercase tracking-widest text-cta">Initial Adjustments</h4>
                         <ul className="space-y-1">
                           {generatedGuide.initialAdjustments.map((a: string, i: number) => (
                              <li key={i} className="text-sm text-ink-d1 flex items-start gap-2">
                               <Settings2 className="w-4 h-4 text-cta shrink-0 mt-0.5" /> <span>{a}</span>
                             </li>
                           ))}
                         </ul>
                      </div>

                      <div className="space-y-2">
                         <h4 className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">Entry & Safety</h4>
                         <ul className="space-y-1">
                           {generatedGuide.entryAndSafety.map((a: string, i: number) => (
                              <li key={i} className="text-sm text-ink-d1 flex items-start gap-2">
                               <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> <span>{a}</span>
                             </li>
                           ))}
                         </ul>
                      </div>
                      
                      <div className="space-y-2">
                         <h4 className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">Alignment & Posture</h4>
                         <ul className="space-y-1">
                           {generatedGuide.alignmentAndPosture.map((a: string, i: number) => (
                              <li key={i} className="text-sm text-ink-d1 flex items-start gap-2">
                               <Target className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" /> <span>{a}</span>
                             </li>
                           ))}
                         </ul>
                      </div>

                      <div className="space-y-2">
                         <h4 className="text-[11px] font-bold uppercase tracking-widest text-amber-500">Client Modifications</h4>
                         <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-200 flex items-start gap-2">
                            <UserCog className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <span>{generatedGuide.clientModifications}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </main>
    </div>
  );
}
