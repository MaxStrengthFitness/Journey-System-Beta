import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Layers, MapPin, Activity, BookOpen, Wrench, ShieldAlert, Wand2, Loader2, ShieldCheck, Target, UserCog, Settings2, Users } from 'lucide-react';
import { Machine } from '../types';
import {
  MACHINE_ANATOMY,
  MOVEMENT_PATTERN_ORDER,
  ANATOMICAL_REGION_ORDER,
  AnatomyView,
  MachineAnatomyMap,
} from '../data/machine-anatomy-map';
import Body, { ExtendedBodyPart, Slug } from '../../react-muscle-highlighter-main';
import { machineMuscleMap } from '../data/machineMuscleMap';
import { MACHINE_DATABASE } from '../data/machine-database';
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
  const [view, setView] = useState<'front' | 'back'>('front');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('movement');
  const [activeTab, setActiveTab] = useState<Tab>('anatomy');
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  
  // Trainer Tips State
  const [trainerTips, setTrainerTips] = useState<string>('');
  const [isSavingTip, setIsSavingTip] = useState(false);

  const selectedMap: MachineAnatomyMap | null = selectedMachineId
    ? MACHINE_ANATOMY[selectedMachineId] ?? null
    : null;

  const selectedMachine = selectedMachineId
    ? machines.find((m) => m.id === selectedMachineId) ?? null
    : null;
    
  const machineKnowledge = useMemo(() => {
    if (!selectedMachineId) return null;
    if (MACHINE_DATABASE[selectedMachineId]) return MACHINE_DATABASE[selectedMachineId];
    
    // Attempt fallback lookup by formatting the ID
    const fallbackId = selectedMachineId.replace(/^m-/, '').replace(/-/g, '_');
    if (MACHINE_DATABASE[fallbackId]) return MACHINE_DATABASE[fallbackId];
    
    // Additional hardcoded fallbacks for mismatched keys
    if (selectedMachineId === 'm-neck') return MACHINE_DATABASE['4_way_neck'];
    if (selectedMachineId === 'm-ext') return MACHINE_DATABASE['leg_extension'];
    if (selectedMachineId === 'm-hip-abd') return MACHINE_DATABASE['abduction'];
    if (selectedMachineId === 'm-hip-add') return MACHINE_DATABASE['adduction'];
    if (selectedMachineId === 'm-tricep-ext') return MACHINE_DATABASE['triceps_extension'];
    if (selectedMachineId === 'm-chest-fly') return MACHINE_DATABASE['chest_flye'];
    if (selectedMachineId === 'm-bicep') return MACHINE_DATABASE['biceps_curl'];
    
    // If still not found, try ignoring case or finding closest string via name
    const m = machines.find((m) => m.id === selectedMachineId);
    if (m) {
      const match = Object.values(MACHINE_DATABASE).find(db => db.name.toLowerCase() === m.name.toLowerCase() || m.name.toLowerCase().includes(db.name.toLowerCase()));
      if (match) return match;
    }
    
    return null;
  }, [selectedMachineId, machines]);

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

  const highlightData = useMemo(() => {
    const data: ExtendedBodyPart[] = [];
    if (!selectedMachineId) return data;
    
    // Fallback logic for machines not mapped in machineMuscleMap:
    const mapping = machineMuscleMap[selectedMachineId];
    if (!mapping) return data;

    // Primary muscles = CTA color
    mapping.primary.forEach(muscle => {
      data.push({ slug: muscle, color: '#FF6B00' });
    });

    // Synergist muscles = Cyan color
    mapping.synergist.forEach(muscle => {
      data.push({ slug: muscle, color: '#00A3FF' });
    });

    return data;
  }, [selectedMachineId]);

  const handleMuscleClick = (part: ExtendedBodyPart) => {
    if (!part.slug) return;
    // Find a machine that targets this muscle
    const targetMachineId = Object.keys(machineMuscleMap).find(id => 
      machineMuscleMap[id].primary.includes(part.slug as Slug) || 
      machineMuscleMap[id].synergist.includes(part.slug as Slug)
    );
    
    if (targetMachineId) {
      handleSelectMachine(targetMachineId);
      setActiveTab('anatomy');
    }
  };

  const handleSelectMachine = (machineId: string) => {
    setSelectedMachineId(machineId);
    const map = MACHINE_ANATOMY[machineId];
    if (map && (map.preferredView === 'front' || map.preferredView === 'back')) {
      setView(map.preferredView);
    }
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
                    
                    let colorClass = 'bg-secondary';
                    if (movement.includes('Push')) colorClass = 'bg-cta';
                    else if (movement.includes('Pull')) colorClass = 'bg-cyan';
                    else if (movement.includes('Quad')) colorClass = 'bg-green';
                    else if (movement.includes('Posterior')) colorClass = 'bg-yellow';
                    else if (movement.includes('Core')) colorClass = 'bg-amber';
                    else if (movement.includes('Isolation')) colorClass = 'bg-brand';

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
            <div className="min-h-0 flex flex-col items-center justify-center bg-surface-1 rounded-2xl border border-div-d relative overflow-hidden group mt-2 py-4">
              {/* View options toggle */}
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                <div className="flex bg-bg-dark-3 rounded-lg p-1 border border-div-d">
                  <button 
                    onClick={() => setView('front')}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'front' ? 'bg-cyan text-bg-dark shadow-sm' : 'text-ink-d3 hover:text-white'}`}
                  >
                    Front
                  </button>
                  <button 
                    onClick={() => setView('back')}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'back' ? 'bg-cyan text-bg-dark shadow-sm' : 'text-ink-d3 hover:text-white'}`}
                  >
                    Back
                  </button>
                </div>
                <div className="flex bg-bg-dark-3 rounded-lg p-1 border border-div-d">
                  <button 
                    onClick={() => setGender('male')}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${gender === 'male' ? 'bg-cyan text-bg-dark shadow-sm' : 'text-ink-d3 hover:text-white'}`}
                  >
                    Male
                  </button>
                  <button 
                    onClick={() => setGender('female')}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${gender === 'female' ? 'bg-cyan text-bg-dark shadow-sm' : 'text-ink-d3 hover:text-white'}`}
                  >
                    Female
                  </button>
                </div>
              </div>

              <div className="relative w-full max-w-[280px] flex justify-center py-4">
                <Body 
                  data={highlightData} 
                  side={view} 
                  gender={gender} 
                  scale={1.2} 
                  onBodyPartPress={handleMuscleClick}
                />
                
                {/* Legend overlay */}
                {selectedMachine && (
                  <div className="absolute bottom-0 left-0 flex flex-col gap-2 p-3 bg-bg-dark/80 backdrop-blur-sm border border-div-d rounded-xl shadow-lg">
                    <div className="flex items-center gap-2">
                       <span className="w-2.5 h-2.5 rounded-sm bg-[#FF6B00]"></span>
                       <span className="text-[9px] font-bold uppercase tracking-widest text-ink-d1">Primary</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <span className="w-2.5 h-2.5 rounded-sm bg-[#00A3FF]"></span>
                       <span className="text-[9px] font-bold uppercase tracking-widest text-ink-d1">Synergist</span>
                    </div>
                  </div>
                )}
              </div>
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
        {selectedMachine && activeTab === 'profile' && (
          <div className="min-h-0 overflow-y-auto w-full mx-auto space-y-6 pb-20 pr-2">
            {!machineKnowledge ? (
              <div className="flex flex-col items-center justify-center p-12 bg-surface-1 rounded-3xl border border-div-d text-ink-d3">
                 <ShieldAlert className="w-8 h-8 mb-3 opacity-50" />
                 <p className="text-sm font-bold uppercase tracking-widest">No detailed profile found</p>
                 <p className="text-xs mt-1">This machine is missing clinical mapping in the database.</p>
              </div>
            ) : (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Core Information Panel */}
              <div className="bg-surface-1 border border-div-d rounded-3xl p-6 flex flex-col gap-6">
                
                {machineKnowledge.imageUrl && (
                  <div className="w-full aspect-video rounded-xl bg-bg-dark-3 flex items-center justify-center overflow-hidden border border-div-d">
                     <img src={machineKnowledge.imageUrl} alt={machineKnowledge.name} className="w-full h-full object-cover opacity-80 mix-blend-screen" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-ink-d3 flex items-center gap-1">
                      <Activity className="w-3 h-3 text-cyan" /> Kinematic Class
                    </div>
                    <div className="text-[13px] text-white font-medium">{machineKnowledge.kinematicClassification || 'N/A'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-ink-d3 flex items-center gap-1">
                      <Target className="w-3 h-3 text-cta" /> Posture
                    </div>
                    <div className="text-[13px] text-white font-medium truncate" title={machineKnowledge.executionPosture}>{machineKnowledge.executionPosture || 'N/A'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-ink-d3 flex items-center gap-1">
                      <Settings2 className="w-3 h-3 text-green" /> Setup Gap
                    </div>
                    <div className="text-[13px] text-white font-medium">{machineKnowledge.setupGap || 'Standard Gap'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-ink-d3 flex items-center gap-1">
                      <Users className="w-3 h-3 text-brand" /> Handoff
                    </div>
                    <div className="text-[13px] text-white font-medium">{machineKnowledge.requiresHandoff ? 'Required' : 'None'}</div>
                  </div>
                </div>

                <div className="space-y-3">
                   <h3 className="text-sm font-bold uppercase tracking-widest text-white border-b border-div-d/40 pb-2">Target Musculature</h3>
                   <div className="flex flex-col gap-2">
                     {machineKnowledge.targetMuscles && machineKnowledge.targetMuscles.map((tm, idx) => (
                       <div key={'t'+idx} className="flex gap-2">
                         <div className="w-1.5 rounded-full bg-cta shrink-0 mt-1.5 mb-1.5"></div>
                         <div className="text-sm text-ink-d1 leading-snug">{tm}</div>
                       </div>
                     ))}
                     {machineKnowledge.synergists && machineKnowledge.synergists.map((syn, idx) => (
                       <div key={'s'+idx} className="flex gap-2">
                         <div className="w-1.5 rounded-full bg-cyan/50 shrink-0 mt-1.5 mb-1.5"></div>
                         <div className="text-sm text-ink-d2 leading-snug">{syn}</div>
                       </div>
                     ))}
                     {(!machineKnowledge.targetMuscles?.length && !machineKnowledge.synergists?.length) && (
                        <div className="text-sm text-ink-d3 italic">Musculature data not available</div>
                     )}
                   </div>
                </div>
              </div>

              {/* Specific Instructions Panel */}
              <div className="flex flex-col gap-6">
                
                {machineKnowledge.clinicalWarnings && machineKnowledge.clinicalWarnings.length > 0 && (
                  <div className="bg-amber/10 border border-amber/20 rounded-3xl p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldAlert className="w-5 h-5 text-amber" />
                      <h3 className="text-sm font-bold uppercase tracking-widest text-amber">Clinical Warnings</h3>
                    </div>
                    <ul className="space-y-2">
                      {machineKnowledge.clinicalWarnings.map((w, idx) => (
                        <li key={idx} className="text-sm text-amber/90 leading-relaxed flex items-start gap-2">
                           <span className="text-amber shrink-0 mt-0.5">•</span>
                           <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-surface-1 border border-div-d rounded-3xl p-6 space-y-5">
                   <div>
                     <h4 className="text-[11px] font-bold uppercase tracking-widest text-cyan pb-1 border-b border-div-d/40 mb-3 flex items-center gap-1">
                       <Wrench className="w-3.5 h-3.5" /> Setup Notes
                     </h4>
                     <p className="text-sm text-ink-d1 leading-relaxed font-bold">{machineKnowledge.setup}</p>
                     
                     {machineKnowledge.setupCues && machineKnowledge.setupCues.length > 0 && (
                       <ul className="mt-3 space-y-2">
                         {machineKnowledge.setupCues.map((cue, idx) => (
                           <li key={idx} className="text-[13px] text-ink-d2 flex items-start gap-2">
                             <div className="w-1 h-1 rounded-full bg-div-d shrink-0 mt-1.5"></div>
                             <span>{cue}</span>
                           </li>
                         ))}
                       </ul>
                     )}
                   </div>

                   <div>
                     <h4 className="text-[11px] font-bold uppercase tracking-widest text-green pb-1 border-b border-div-d/40 mb-3 flex items-center gap-1">
                       <Activity className="w-3.5 h-3.5" /> Execution Guide
                     </h4>
                     <p className="text-sm text-ink-d1 leading-relaxed font-bold">{machineKnowledge.execution}</p>

                     {machineKnowledge.executionCues && machineKnowledge.executionCues.length > 0 && (
                       <ul className="mt-3 space-y-2">
                         {machineKnowledge.executionCues.map((cue, idx) => (
                           <li key={idx} className="text-[13px] text-ink-d2 flex items-start gap-2">
                             <div className="w-1 h-1 rounded-full bg-div-d shrink-0 mt-1.5"></div>
                             <span>{cue}</span>
                           </li>
                         ))}
                       </ul>
                     )}
                   </div>
                </div>

                {/* Trainer Tips Input */}
                <div className="bg-surface-1 border border-div-d rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <UserCog className="w-5 h-5 text-brand" />
                      <h3 className="text-sm font-bold uppercase tracking-widest text-white">Studio Trainer Tips</h3>
                    </div>
                  </div>
                  <div>
                    <Textarea 
                      placeholder="Add specific cues or adjustments for this machine in your studio..."
                      value={trainerTips}
                      onChange={(e) => setTrainerTips(e.target.value)}
                      className="min-h-[80px] bg-bg-dark-3 border border-div-d focus-visible:ring-brand text-white placeholder:text-ink-d3 mb-3 resize-none text-[13px]"
                    />
                    <Button 
                      onClick={handleSaveTip}
                      disabled={isSavingTip}
                      className="w-full bg-brand/10 hover:bg-brand/20 text-brand border border-brand/20 font-bold tracking-widest uppercase transition-all"
                    >
                      {isSavingTip ? "Saved to Studio" : "Save Tip"}
                    </Button>
                  </div>
                </div>

              </div>
            </div>
            )}
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
        </div>
      </main>
    </div>
  );
}
