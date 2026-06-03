import React, { useMemo, useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Layers, MapPin, Activity, Wrench, ShieldAlert, Target, UserCog, Settings2, Users } from 'lucide-react';
import { Machine } from '../types';
import {
  MACHINE_ANATOMY,
  MOVEMENT_PATTERN_ORDER,
  ANATOMICAL_REGION_ORDER,
  MachineAnatomyMap,
} from '../data/machine-anatomy-map';
import Body, { ExtendedBodyPart, Slug } from 'react-body-highlighter';
import { machineMuscleMap } from '../data/machineMuscleMap';
import { MACHINE_DATABASE } from '../data/machine-database';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

type GroupingMode = 'movement' | 'region';

interface MachineAnatomyCatalogViewProps {
  machines: Machine[];
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
  
  // Trainer Tips State
  const [trainerTips, setTrainerTips] = useState<string>('');
  const [isSavingTip, setIsSavingTip] = useState(false);

  // Carousel Refs & Syncing
  const carouselRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const isProgrammaticScroll = useRef(false);
  const scrollSpyTimeoutRef = useRef<NodeJS.Timeout>();
  const programmaticScrollTimeoutRef = useRef<NodeJS.Timeout>();
  const [centerIndex, setCenterIndex] = useState<number>(() => machines.length);
  const hasInitializedScroll = useRef(false);

  const extendedMachines = useMemo(() => [...machines, ...machines, ...machines], [machines]);

  useLayoutEffect(() => {
    if (machines.length > 0 && carouselRef.current && !hasInitializedScroll.current) {
      const container = carouselRef.current;
      const oneCopyWidth = container.scrollWidth / 3;
      if (oneCopyWidth > 0 && container.scrollLeft === 0) {
        container.scrollLeft = oneCopyWidth;
        hasInitializedScroll.current = true;
      }
    }
  }, [machines]);

  useEffect(() => {
    if (selectedMachineId && carouselRef.current) {
      const container = carouselRef.current;
      const originalIndex = machines.findIndex(m => m.id === selectedMachineId);
      const targetIndex = originalIndex !== -1 ? machines.length + originalIndex : machines.length;
      const card = cardRefs.current[`${selectedMachineId}-${targetIndex}`];
      
      if (card && isProgrammaticScroll.current) {        
        container.style.scrollBehavior = 'smooth';
        container.scrollTo({
          left: card.offsetLeft - container.clientWidth / 2 + card.clientWidth / 2,
        });

        if (programmaticScrollTimeoutRef.current) clearTimeout(programmaticScrollTimeoutRef.current);
        programmaticScrollTimeoutRef.current = setTimeout(() => {
          isProgrammaticScroll.current = false;
        }, 600);
      }
    }
  }, [selectedMachineId, machines]);

  const handleCarouselScroll = useCallback(() => {
    const container = carouselRef.current;
    if (!container) return;

    const oneCopyWidth = container.scrollWidth / 3;

    if (container.scrollLeft < oneCopyWidth) {
      container.style.scrollBehavior = 'auto';
      container.scrollLeft += oneCopyWidth;
    } else if (container.scrollLeft > 2 * oneCopyWidth) {
      container.style.scrollBehavior = 'auto';
      container.scrollLeft -= oneCopyWidth;
    }

    if (isProgrammaticScroll.current) return;

    if (scrollSpyTimeoutRef.current) clearTimeout(scrollSpyTimeoutRef.current);

    scrollSpyTimeoutRef.current = setTimeout(() => {
      const containerCenter = container.scrollLeft + container.clientWidth / 2;
      let closestCardId: string | null = null;
      let minDistance = Infinity;
      let closestIdx = centerIndex;

      Object.entries(cardRefs.current).forEach(([key, cardRaw]) => {
        const card = cardRaw as HTMLButtonElement | null;
        if (!card) return;
        const cardCenter = card.offsetLeft + card.clientWidth / 2;
        const distance = Math.abs(containerCenter - cardCenter);
        if (distance < minDistance) {
          minDistance = distance;
          const splitIdx = key.lastIndexOf('-');
          closestCardId = key.slice(0, splitIdx);
          closestIdx = parseInt(key.slice(splitIdx + 1), 10);
        }
      });

      if (closestIdx !== centerIndex) {
        setCenterIndex(closestIdx);
      }
      if (closestCardId && closestCardId !== selectedMachineId) {
        setSelectedMachineId(closestCardId);
      }
    }, 100);
  }, [selectedMachineId, centerIndex]);

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
    
    // Additional hardcoded fallbacks
    if (selectedMachineId === 'm-neck') return MACHINE_DATABASE['4_way_neck'];
    if (selectedMachineId === 'm-ext') return MACHINE_DATABASE['leg_extension'];
    if (selectedMachineId === 'm-hip-abd') return MACHINE_DATABASE['abduction'];
    if (selectedMachineId === 'm-hip-add') return MACHINE_DATABASE['adduction'];
    if (selectedMachineId === 'm-tricep-ext') return MACHINE_DATABASE['triceps_extension'];
    if (selectedMachineId === 'm-chest-fly') return MACHINE_DATABASE['chest_flye'];
    if (selectedMachineId === 'm-bicep') return MACHINE_DATABASE['biceps_curl'];
    if (selectedMachineId === 'm-dip') return MACHINE_DATABASE['seated_dip'];
    if (selectedMachineId === 'm-abs') return MACHINE_DATABASE['abdominals'];
    if (selectedMachineId === 'm-lumbar') return MACHINE_DATABASE['lumbar_extension'];
    
    const m = machines.find((m) => m.id === selectedMachineId);
    if (m) {
      const match = Object.values(MACHINE_DATABASE).find(db => db.name.toLowerCase() === m.name.toLowerCase() || m.name.toLowerCase().includes(db.name.toLowerCase()));
      if (match) return match;
    }
    
    return null;
  }, [selectedMachineId, machines]);

  useEffect(() => {
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
    
    const mapping = machineMuscleMap[selectedMachineId];
    if (!mapping) return data;

    mapping.primary.forEach(muscle => {
      data.push({ slug: muscle, color: 'var(--cta)' });
    });

    mapping.synergist.forEach(muscle => {
      data.push({ slug: muscle, color: 'var(--cyan)' });
    });

    return data;
  }, [selectedMachineId]);

  const handleMuscleClick = (part: ExtendedBodyPart) => {
    if (!part.slug) return;
    const targetMachineId = Object.keys(machineMuscleMap).find(id => 
      machineMuscleMap[id].primary.includes(part.slug as Slug) || 
      machineMuscleMap[id].synergist.includes(part.slug as Slug)
    );
    
    if (targetMachineId) {
      handleSelectMachine(targetMachineId);
    }
  };

  const handleSelectMachine = (machineId: string) => {
    isProgrammaticScroll.current = true;
    if (scrollSpyTimeoutRef.current) clearTimeout(scrollSpyTimeoutRef.current);
    if (programmaticScrollTimeoutRef.current) clearTimeout(programmaticScrollTimeoutRef.current);
    
    setSelectedMachineId(machineId);
    const originalIndex = machines.findIndex(m => m.id === machineId);
    if (originalIndex !== -1) {
      setCenterIndex(machines.length + originalIndex);
    }

    const map = MACHINE_ANATOMY[machineId];
    if (map && (map.preferredView === 'front' || map.preferredView === 'back')) {
      setView(map.preferredView);
    }
  };

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

  const catalogContent = (
    <>
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/5 to-transparent"></div>
      
      <div className="relative z-10 p-5 border-b border-white/10">
        <h2 className="text-2xl font-black uppercase tracking-[0.2em] text-white mb-5">Database</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setGroupingMode('movement')}
            className={`flex-1 min-h-[44px] rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
              groupingMode === 'movement'
                ? 'bg-cyan text-foreground shadow-[0_0_15px_rgba(0,255,255,0.3)]'
                : 'bg-black/40 text-muted-foreground border border-white/10 hover:bg-black/60 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            Kinematics
          </button>
          <button
            type="button"
            onClick={() => setGroupingMode('region')}
            className={`flex-1 min-h-[44px] rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
              groupingMode === 'region'
                ? 'bg-cyan text-foreground shadow-[0_0_15px_rgba(0,255,255,0.3)]'
                : 'bg-black/40 text-muted-foreground border border-white/10 hover:bg-black/60 hover:text-white'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Region
          </button>
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-3 space-y-5 lg:pb-[120px]">
        {groupedMachines.map((group) => (
          <div key={group.key} className="space-y-1">
            <div className="flex items-center justify-between px-2 py-1 text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              <span>{group.label}</span>
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-black/40 text-muted-foreground text-[10px]">
                {group.machines.length}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 px-1 pb-2">
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

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => m.id && handleSelectMachine(m.id)}
                    className={`relative flex items-center justify-between p-3.5 rounded-2xl transition-all text-left group overflow-hidden ${
                      isSelected
                        ? 'bg-white/10 border border-white/20 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md'
                        : 'bg-black/20 border border-transparent hover:bg-black/40 hover:border-white/10'
                    }`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${colorClass}`} />
                    <div className="flex flex-col pl-3 pr-2 overflow-hidden flex-1">
                      <span className={`text-[12px] font-bold tracking-widest truncate uppercase ${isSelected ? 'text-white' : 'text-muted-foreground group-hover:text-white'}`}>
                        {m.name}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-cyan shadow-[0_0_8px_var(--color-cyan)] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="relative h-[calc(100vh-5rem)] bg-background overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row w-full no-scrollbar">
      
      {/* ───── MOBILE STICKY HEADER & CONTROLS ───── */}
      <div className="lg:hidden sticky top-0 left-0 w-full z-50 flex items-center justify-between pt-4 pb-4 px-4 bg-gradient-to-b from-background via-background/80 to-transparent pointer-events-none shrink-0">
        <div className="pointer-events-auto shrink-0 mr-4">
          <Sheet>
            <SheetTrigger className="bg-background/80 backdrop-blur-xl border border-white/10 hover:bg-white/10 text-white shadow-xl h-12 w-12 rounded-full flex items-center justify-center transition-all cursor-pointer">
              <Layers className="w-5 h-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[320px] sm:w-[380px] p-0 bg-background/95 backdrop-blur-3xl border-r border-white/10 flex flex-col">
               {catalogContent}
            </SheetContent>
          </Sheet>
        </div>

        {/* Mobile View Controls */}
        <div className="pointer-events-auto flex flex-1 bg-background/80 backdrop-blur-xl rounded-2xl p-1.5 border border-white/10 shadow-2xl overflow-x-auto no-scrollbar justify-center">
          <button 
            onClick={() => setView('front')}
            className={`flex-1 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap ${view === 'front' ? 'bg-white text-foreground shadow-lg' : 'text-muted-foreground hover:text-white hover:bg-white/10'}`}
          >
            Anterior
          </button>
          <button 
            onClick={() => setView('back')}
            className={`flex-1 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap ${view === 'back' ? 'bg-white text-foreground shadow-lg' : 'text-muted-foreground hover:text-white hover:bg-white/10'}`}
          >
            Posterior
          </button>
          <div className="w-px bg-white/10 mx-1 my-2 shrink-0"></div>
          <button 
            onClick={() => setGender('male')}
            className={`flex-1 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap ${gender === 'male' ? 'bg-white text-foreground shadow-lg' : 'text-muted-foreground hover:text-white hover:bg-white/10'}`}
          >
            Type M
          </button>
          <button 
            onClick={() => setGender('female')}
            className={`flex-1 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap ${gender === 'female' ? 'bg-white text-foreground shadow-lg' : 'text-muted-foreground hover:text-white hover:bg-white/10'}`}
          >
            Type F
          </button>
        </div>
      </div>

      {/* ───── MODEL LAYER ───── */}
      <div className="relative shrink-0 lg:absolute lg:inset-0 flex items-center justify-center z-0 pointer-events-auto min-h-[50vh] max-h-[60vh] lg:h-full lg:min-h-0 lg:max-h-none mb-4 lg:mb-0">
        <div className="relative w-full max-w-[600px] h-full flex justify-center p-4 lg:p-12 lg:mt-0">
          <Body 
            data={highlightData} 
            side={view} 
            gender={gender} 
            scale={1.5} 
            onBodyPartPress={handleMuscleClick}
          />
        </div>
      </div>

      {/* ───── GLASS OVERLAYS (Interaction Hack) ───── */}
      <div className="absolute inset-0 z-10 pointer-events-none p-4 md:p-8 flex flex-col md:flex-row justify-between gap-4">
        
        {/* LEFT SIDEBAR (Catalog) Desktop */}
        <aside className="pointer-events-auto w-[360px] bg-background/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl hidden lg:flex flex-col overflow-hidden max-h-full shrink-0 relative">
          {catalogContent}
        </aside>

        {/* RIGHT SIDEBAR (Details HUD) Desktop */}
        {selectedMachine && machineKnowledge ? (
          <aside className="pointer-events-auto w-[440px] bg-background/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl hidden lg:flex flex-col overflow-hidden max-h-full shrink-0 relative animate-in fade-in slide-in-from-right-8 duration-300">
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/5 to-transparent"></div>
            
            {/* Header Area */}
            <div className="relative z-10 p-6 border-b border-white/10">
              <div className="text-[11px] uppercase tracking-[0.2em] text-cyan font-bold mb-2">
                {selectedMap?.movementPattern || 'Kinematic Info'}
              </div>
              <h2 className="text-3xl font-black uppercase italic text-white tracking-tight leading-none mb-4">
                {selectedMachine.name}
              </h2>
              <div className="text-[12px] text-muted-foreground leading-relaxed font-medium bg-black/40 p-4 rounded-2xl border border-white/5">
                {selectedMap?.clinicalNote || 'Clinical details unavailable.'}
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/40 p-3.5 rounded-2xl border border-white/5">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Activity className="w-3 h-3 text-cyan" /> Class
                  </div>
                  <div className="text-[13px] text-white font-semibold">{machineKnowledge.kinematicClassification || 'N/A'}</div>
                </div>
                <div className="bg-black/40 p-3.5 rounded-2xl border border-white/5">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Target className="w-3 h-3 text-cta" /> Posture
                  </div>
                  <div className="text-[13px] text-white font-semibold truncate" title={machineKnowledge.executionPosture}>{machineKnowledge.executionPosture || 'N/A'}</div>
                </div>
                <div className="bg-black/40 p-3.5 rounded-2xl border border-white/5">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Settings2 className="w-3 h-3 text-green" /> Setup
                  </div>
                  <div className="text-[13px] text-white font-semibold">{machineKnowledge.setupGap || 'Standard Gap'}</div>
                </div>
                <div className="bg-black/40 p-3.5 rounded-2xl border border-white/5">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Users className="w-3 h-3 text-brand" /> Handoff
                  </div>
                  <div className="text-[13px] text-white font-semibold">{machineKnowledge.requiresHandoff ? 'Required' : 'None'}</div>
                </div>
              </div>

              <div className="space-y-4">
                 <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white flex items-center gap-3">
                   <div className="h-px bg-white/20 flex-1"></div>
                   Musculature
                   <div className="h-px bg-white/20 flex-1"></div>
                 </h3>
                 <div className="flex flex-col gap-2.5">
                   {machineKnowledge.targetMuscles && machineKnowledge.targetMuscles.map((tm, idx) => (
                     <div key={'t'+idx} className="flex items-center gap-3 bg-black/20 p-2.5 rounded-xl border border-white/5">
                       <div className="w-2.5 h-2.5 rounded-full bg-cta shadow-[0_0_8px_var(--color-cta)]/80 shrink-0"></div>
                       <div className="text-[13px] font-bold text-white leading-snug">{tm}</div>
                       <div className="ml-auto text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Primary</div>
                     </div>
                   ))}
                   {machineKnowledge.synergists && machineKnowledge.synergists.map((syn, idx) => (
                     <div key={'s'+idx} className="flex items-center gap-3 bg-black/10 p-2.5 rounded-xl border border-white/5">
                       <div className="w-2.5 h-2.5 rounded-full bg-cyan shadow-[0_0_8px_var(--color-cyan)]/60 shrink-0"></div>
                       <div className="text-[13px] text-muted-foreground leading-snug">{syn}</div>
                       <div className="ml-auto text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">Synergist</div>
                     </div>
                   ))}
                 </div>
              </div>

              {machineKnowledge.clinicalWarnings && machineKnowledge.clinicalWarnings.length > 0 && (
                <div className="bg-amber/10 border border-amber/30 rounded-2xl p-5 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldAlert className="w-5 h-5 text-amber" />
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-amber">Clinical Warnings</h3>
                  </div>
                  <ul className="space-y-2">
                    {machineKnowledge.clinicalWarnings.map((w, idx) => (
                      <li key={idx} className="text-[13px] text-amber/90 leading-relaxed flex items-start gap-2.5">
                         <span className="text-amber shrink-0 mt-0.5">•</span>
                         <span className="font-medium">{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-5">
                 <div>
                   <h4 className="text-[11px] font-bold uppercase tracking-widest text-cyan mb-2.5 flex items-center gap-2">
                     <Wrench className="w-4 h-4" /> Setup Notes
                   </h4>
                   <p className="text-[13px] text-white leading-relaxed font-semibold bg-black/40 p-4 rounded-xl border border-white/5">{machineKnowledge.setup}</p>
                   {machineKnowledge.setupCues && machineKnowledge.setupCues.length > 0 && (
                     <ul className="mt-3 space-y-2 pl-1">
                       {machineKnowledge.setupCues.map((cue, idx) => (
                         <li key={idx} className="text-[12px] text-muted-foreground flex items-start gap-2.5">
                           <div className="w-1.5 h-1.5 rounded-full bg-cyan/50 shrink-0 mt-1.5"></div>
                           <span className="font-medium">{cue}</span>
                         </li>
                       ))}
                     </ul>
                   )}
                 </div>

                 <div>
                   <h4 className="text-[11px] font-bold uppercase tracking-widest text-green mb-2.5 flex items-center gap-2">
                     <Activity className="w-4 h-4" /> Execution
                   </h4>
                   <p className="text-[13px] text-white leading-relaxed font-semibold bg-black/40 p-4 rounded-xl border border-white/5">{machineKnowledge.execution}</p>
                 </div>
              </div>

              {/* Trainer Tips */}
              <div className="pt-4 border-t border-white/10 mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <UserCog className="w-4 h-4 text-brand" />
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-white">Studio Notes</h3>
                </div>
                <Textarea 
                  placeholder="Record custom setup params or cues for this specific machine..."
                  value={trainerTips}
                  onChange={(e) => setTrainerTips(e.target.value)}
                  className="min-h-[100px] bg-black/60 border border-white/10 focus-visible:ring-brand text-white placeholder:text-muted-foreground/50 mb-3 resize-none text-[13px] rounded-xl p-4"
                />
                <Button 
                  onClick={handleSaveTip}
                  disabled={isSavingTip}
                  className={`w-full font-black tracking-[0.2em] uppercase transition-all rounded-xl h-12 ${
                    isSavingTip 
                      ? 'bg-green/20 text-green border border-green/30' 
                      : 'bg-brand/20 hover:bg-brand/40 text-brand border border-brand/30 shadow-[0_0_15px_var(--color-brand)]/15'
                  }`}
                >
                  {isSavingTip ? "Stored Successfully" : "Save Notes"}
                </Button>
              </div>

            </div>
          </aside>
        ) : (
          <aside className="pointer-events-auto w-[440px] hidden lg:flex items-center justify-center p-8 bg-transparent">
             <div className="text-center space-y-4 p-8 bg-background/40 backdrop-blur-xl border border-white/5 rounded-3xl w-full">
               <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
               <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">Awaiting Selection</p>
               <p className="text-[11px] text-muted-foreground/60 font-medium tracking-wide">Target a kinematic entity to initialize profile data.</p>
             </div>
          </aside>
        )}
      </div>

      {/* ───── MOBILE MIDDLE BAND CAROUSEL (Lazy Susan) ───── */}
      <div className="lg:hidden relative w-full z-40 pointer-events-auto -mt-20 shrink-0">
        
        {/* Center selection indicator — stationary above the scroll row */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[160px] pointer-events-none z-10 border-l-2 border-r-2 border-cta/40 bg-cta/5 rounded-2xl" />

        <div 
          ref={carouselRef}
          onScroll={handleCarouselScroll}
          className="flex relative overflow-x-auto snap-x snap-mandatory gap-4 px-6 pb-6 no-scrollbar"
        >
          {extendedMachines.map((m, idx) => {
            const map = m.id ? MACHINE_ANATOMY[m.id] : undefined;
            const movement = map?.movementPattern || '';
            const distance = Math.abs(centerIndex - idx);
            
            let colorClass = 'bg-secondary';
            if (movement.includes('Push')) colorClass = 'bg-cta';
            else if (movement.includes('Pull')) colorClass = 'bg-cyan';
            else if (movement.includes('Quad')) colorClass = 'bg-green';
            else if (movement.includes('Posterior')) colorClass = 'bg-yellow';
            else if (movement.includes('Core')) colorClass = 'bg-amber';
            else if (movement.includes('Isolation')) colorClass = 'bg-brand';

            return (
              <button
                key={`${m.id}-${idx}`}
                ref={(el) => {
                  if (m.id) {
                    cardRefs.current[`${m.id}-${idx}`] = el;
                  }
                }}
                onClick={() => {
                  if (m.id) handleSelectMachine(m.id);
                }}
                className={`relative shrink-0 snap-center min-w-[160px] p-4 rounded-2xl bg-background/60 backdrop-blur-xl border transition-all duration-200 text-left flex flex-col justify-end overflow-hidden ${
                  distance === 0 
                    ? 'scale-100 opacity-100 border-cta shadow-[0_0_20px_var(--color-cta)]/30' 
                    : distance <= 1
                      ? 'scale-95 opacity-80 border-transparent hover:bg-background/80'
                      : 'scale-90 opacity-60 border-transparent hover:bg-background/80'
                }`}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${colorClass}`} />
                <div className="pl-2 w-full">
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1 block truncate">
                    {map?.movementPattern || 'Equipment'}
                  </span>
                  <span className={`text-[13px] font-black italic uppercase tracking-tight truncate block ${distance === 0 ? 'text-white' : 'text-muted-foreground'}`}>
                    {m.name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ───── MOBILE DETAILS OVERLAY (Tablet/Mobile) ───── */}
      <div className="lg:hidden relative w-full z-40 pointer-events-none flex flex-col justify-end px-4 pb-24 shrink-0">
        {selectedMachine && machineKnowledge && (
           <div className="pointer-events-auto w-full bg-black/80 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-3xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4">
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/5 to-transparent"></div>
              
              {/* Header Area (Sticky) */}
              <div className="relative z-10 p-5 border-b border-white/10 shrink-0 bg-background/80 backdrop-blur-md sticky top-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-cyan font-bold mb-1">
                  {selectedMap?.movementPattern || 'Kinematic Info'}
                </div>
                <h2 className="text-xl font-black uppercase italic text-white tracking-tight leading-none mb-3">
                  {selectedMachine.name}
                </h2>
                <div className="text-[11px] text-muted-foreground leading-relaxed font-medium bg-black/40 p-3 rounded-xl border border-white/5 line-clamp-2">
                  {selectedMap?.clinicalNote || 'Clinical details unavailable.'}
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="relative z-10 flex-1 p-5 space-y-5">
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-1.5">
                      <Activity className="w-3 h-3 text-cyan" /> Class
                    </div>
                    <div className="text-[12px] text-white font-semibold">{machineKnowledge.kinematicClassification || 'N/A'}</div>
                  </div>
                  <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-1.5">
                      <Target className="w-3 h-3 text-cta" /> Posture
                    </div>
                    <div className="text-[12px] text-white font-semibold truncate" title={machineKnowledge.executionPosture}>{machineKnowledge.executionPosture || 'N/A'}</div>
                  </div>
                  <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-1.5">
                      <Settings2 className="w-3 h-3 text-green" /> Setup
                    </div>
                    <div className="text-[12px] text-white font-semibold">{machineKnowledge.setupGap || 'Standard Gap'}</div>
                  </div>
                  <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-1.5">
                      <Users className="w-3 h-3 text-brand" /> Handoff
                    </div>
                    <div className="text-[12px] text-white font-semibold">{machineKnowledge.requiresHandoff ? 'Required' : 'None'}</div>
                  </div>
                </div>

                <div className="space-y-3">
                   <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white flex items-center gap-3">
                     <div className="h-px bg-white/20 flex-1"></div>
                     Musculature
                     <div className="h-px bg-white/20 flex-1"></div>
                   </h3>
                   <div className="flex flex-col gap-2">
                     {machineKnowledge.targetMuscles && machineKnowledge.targetMuscles.map((tm, idx) => (
                       <div key={'m_t'+idx} className="flex items-center gap-2.5 bg-black/20 p-2.5 rounded-xl border border-white/5">
                         <div className="w-2 h-2 rounded-full bg-cta shadow-[0_0_8px_var(--color-cta)]/80 shrink-0"></div>
                         <div className="text-[12px] font-bold text-white leading-snug">{tm}</div>
                         <div className="ml-auto text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Primary</div>
                       </div>
                     ))}
                     {machineKnowledge.synergists && machineKnowledge.synergists.map((syn, idx) => (
                       <div key={'m_s'+idx} className="flex items-center gap-2.5 bg-black/10 p-2.5 rounded-xl border border-white/5">
                         <div className="w-2 h-2 rounded-full bg-cyan shadow-[0_0_8px_var(--color-cyan)]/60 shrink-0"></div>
                         <div className="text-[12px] text-muted-foreground leading-snug">{syn}</div>
                         <div className="ml-auto text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest">Synergist</div>
                       </div>
                     ))}
                   </div>
                </div>

                {machineKnowledge.clinicalWarnings && machineKnowledge.clinicalWarnings.length > 0 && (
                  <div className="bg-amber/10 border border-amber/30 rounded-2xl p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-2.5">
                      <ShieldAlert className="w-4 h-4 text-amber" />
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-amber">Clinical Warnings</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {machineKnowledge.clinicalWarnings.map((w, idx) => (
                        <li key={idx} className="text-[12px] text-amber/90 leading-relaxed flex items-start gap-2.5">
                           <span className="text-amber shrink-0 mt-0.5">•</span>
                           <span className="font-medium">{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-4">
                   <div>
                     <h4 className="text-[10px] font-bold uppercase tracking-widest text-cyan mb-2 flex items-center gap-2">
                       <Wrench className="w-3.5 h-3.5" /> Setup Notes
                     </h4>
                     <p className="text-[12px] text-white leading-relaxed font-semibold bg-black/40 p-3.5 rounded-xl border border-white/5">{machineKnowledge.setup}</p>
                     {machineKnowledge.setupCues && machineKnowledge.setupCues.length > 0 && (
                       <ul className="mt-2.5 space-y-1.5 pl-1">
                         {machineKnowledge.setupCues.map((cue, idx) => (
                           <li key={idx} className="text-[11px] text-muted-foreground flex items-start gap-2.5">
                             <div className="w-1.5 h-1.5 rounded-full bg-cyan/50 shrink-0 mt-1"></div>
                             <span className="font-medium">{cue}</span>
                           </li>
                         ))}
                       </ul>
                     )}
                   </div>

                   <div>
                     <h4 className="text-[10px] font-bold uppercase tracking-widest text-green mb-2 flex items-center gap-2">
                       <Activity className="w-3.5 h-3.5" /> Execution
                     </h4>
                     <p className="text-[12px] text-white leading-relaxed font-semibold bg-black/40 p-3.5 rounded-xl border border-white/5">{machineKnowledge.execution}</p>
                   </div>
                </div>

                {/* Trainer Tips */}
                <div className="pt-4 border-t border-white/10 mt-5">
                  <div className="flex items-center gap-2 mb-3">
                    <UserCog className="w-4 h-4 text-brand" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-white">Studio Notes</h3>
                  </div>
                  <Textarea 
                    placeholder="Record custom setup params or cues for this specific machine..."
                    value={trainerTips}
                    onChange={(e) => setTrainerTips(e.target.value)}
                    className="min-h-[80px] bg-black/60 border border-white/10 focus-visible:ring-brand text-white placeholder:text-muted-foreground/50 mb-3 resize-none text-[12px] rounded-xl p-3"
                  />
                  <Button 
                    onClick={handleSaveTip}
                    disabled={isSavingTip}
                    className={`w-full font-black tracking-[0.2em] uppercase transition-all rounded-xl h-10 text-[10px] ${
                      isSavingTip 
                        ? 'bg-green/20 text-green border border-green/30' 
                        : 'bg-brand/20 hover:bg-brand/40 text-brand border border-brand/30 shadow-[0_0_15px_var(--color-brand)]/15'
                    }`}
                  >
                    {isSavingTip ? "Stored Successfully" : "Save Notes"}
                  </Button>
                </div>

              </div>
           </div>
        )}
      </div>

      {/* ───── DESKTOP BOTTOM CENTER CONTROLS ───── */}
      <div className="hidden lg:flex absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto z-50 flex-col gap-3 items-center">
        <div className="flex bg-background/80 backdrop-blur-xl rounded-2xl p-1.5 border border-white/10 shadow-2xl">
          <button 
            onClick={() => setView('front')}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${view === 'front' ? 'bg-white text-foreground shadow-lg' : 'text-muted-foreground hover:text-white hover:bg-white/10'}`}
          >
            Anterior
          </button>
          <button 
            onClick={() => setView('back')}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${view === 'back' ? 'bg-white text-foreground shadow-lg' : 'text-muted-foreground hover:text-white hover:bg-white/10'}`}
          >
            Posterior
          </button>
          <div className="w-px bg-white/10 mx-2 my-2"></div>
          <button 
            onClick={() => setGender('male')}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${gender === 'male' ? 'bg-white text-foreground shadow-lg' : 'text-muted-foreground hover:text-white hover:bg-white/10'}`}
          >
            Type M
          </button>
          <button 
            onClick={() => setGender('female')}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${gender === 'female' ? 'bg-white text-foreground shadow-lg' : 'text-muted-foreground hover:text-white hover:bg-white/10'}`}
          >
            Type F
          </button>
        </div>
      </div>
    </div>
  );
}
