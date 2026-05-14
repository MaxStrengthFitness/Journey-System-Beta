import React, { useState } from 'react';
import { MACHINE_LIST, MachineKnowledge } from '../data/machine-database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  PlayCircle, 
  X, 
  ChevronRight, 
  Activity, 
  Users, 
  TrendingUp, 
  Hand, 
  Wand2, 
  Loader2, 
  CheckCircle, 
  Target, 
  ShieldCheck, 
  Settings2, 
  UserCog, 
  Zap,
  Trophy
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

const CATEGORIES = [
  "All",
  "Lower Body",
  "Hips",
  "Upper Body - Push",
  "Upper Body - Pull",
  "Trunk/Spine/Core"
];

export function MachineKnowledgeDashboard({ setView, machines }: { setView: (view: any) => void; machines?: any[] }) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [activeMachineId, setActiveMachineId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedMachine, setEditedMachine] = useState<any>(null);

  // Sync edited machine when active machine changes
  React.useEffect(() => {
    if (activeMachineId) {
      const machine = MACHINE_LIST.find(m => m.id === activeMachineId);
      setEditedMachine(machine ? { ...machine } : null);
    } else {
      setEditedMachine(null);
      setIsEditMode(false);
    }
  }, [activeMachineId]);

  const handleToggleEdit = () => {
    if (isEditMode) {
      // In a real app, we'd save here
      console.log("Saving machine edits:", editedMachine);
    }
    setIsEditMode(!isEditMode);
  };

  const updateField = (field: string, value: any) => {
    setEditedMachine((prev: any) => ({ ...prev, [field]: value }));
  };

  // Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardSelectedMachine, setWizardSelectedMachine] = useState<string>('');
  const [wizardConstraints, setWizardConstraints] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedGuide, setGeneratedGuide] = useState<any>(null);

  const handleGenerateGuide = async () => {
    if (!wizardSelectedMachine) return;
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

  const filteredMachines = activeCategory === "All" 
    ? MACHINE_LIST 
    : MACHINE_LIST.filter(m => m.category === activeCategory);

  const activeMachine = MACHINE_LIST.find(m => m.id === activeMachineId);
  const syncedMachine = machines?.find(m => m.id === activeMachine?.id);
  const activeMachineIndex = activeMachine ? MACHINE_LIST.findIndex(m => m.id === activeMachine.id) + 1 : 0;

  return (
    <div className="flex flex-col bg-[#0A2E46] h-full overflow-hidden text-white w-full relative">
      
      {/* Header & Filters */}
      <div className="pt-8 px-6 pb-6 bg-[#0A2E46] border-b border-white/10 shrink-0 z-10 w-full relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h1 className="text-3xl lg:text-4xl font-black uppercase tracking-tighter text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-[#68717A]">
            Equipment Arsenal
          </h1>
          
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => setView('leaderboard')}
              className="bg-gradient-to-r from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-white font-black uppercase tracking-widest text-[10px] md:text-xs"
            >
              <Trophy className="w-4 h-4 mr-2" />
              Machine Leaderboard
            </Button>

            <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
              <DialogTrigger 
                render={
                  <Button className="bg-gradient-to-r from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white font-black uppercase tracking-widest text-[10px] md:text-xs">
                    <Wand2 className="w-4 h-4 mr-2" />
                    AI Setup Wizard
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-[600px] bg-[#0A2E46] text-white border-slate-700">
                <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-widest">
                  <Wand2 className="w-5 h-5 text-emerald-400" />
                  AI Setup Wizard
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Select value={wizardSelectedMachine} onValueChange={setWizardSelectedMachine}>
                  <SelectTrigger className="w-full bg-[#0e171e] border-slate-700 focus:ring-emerald-500 text-white">
                    <SelectValue placeholder="Select a machine..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0e171e] text-white border-slate-700 max-h-[300px]">
                    {MACHINE_LIST.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="focus:bg-[#115E8D] focus:text-white flex-1 cursor-pointer">
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div>
                  <Textarea 
                    placeholder="Client Constraints (e.g., knee pain, short arms)..."
                    value={wizardConstraints}
                    onChange={(e) => setWizardConstraints(e.target.value)}
                    className="min-h-[100px] bg-[#0e171e] border-slate-700 focus-visible:ring-emerald-500 text-white placeholder:text-slate-500"
                  />
                </div>
                <Button 
                  onClick={handleGenerateGuide}
                  disabled={!wizardSelectedMachine || isGenerating}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold tracking-widest uppercase"
                >
                  {isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : "Generate Custom Setup Guide"}
                </Button>

                {generatedGuide && (
                  <div className="mt-4 p-4 bg-[#0e171e] border border-slate-700 rounded-xl max-h-[400px] overflow-y-auto space-y-4">
                    <div className="space-y-2">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-[#38BDF8]">Target Muscles</h4>
                       <div className="flex flex-wrap gap-2">
                         {generatedGuide.targetMuscles.map((t: string) => (
                            <Badge key={t} className="bg-white/10 text-white hover:bg-white/20 border-0">{t}</Badge>
                         ))}
                       </div>
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-[#F06C22]">Initial Adjustments</h4>
                      <ul className="space-y-1">
                        {generatedGuide.initialAdjustments.map((a: string, i: number) => (
                           <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                             <Settings2 className="w-4 h-4 text-[#F06C22] shrink-0 mt-0.5" /> <span>{a}</span>
                           </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Entry & Safety</h4>
                      <ul className="space-y-1">
                        {generatedGuide.entryAndSafety.map((a: string, i: number) => (
                           <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                             <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> <span>{a}</span>
                           </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-[#115E8D]">Alignment & Posture</h4>
                      <ul className="space-y-1">
                        {generatedGuide.alignmentAndPosture.map((a: string, i: number) => (
                           <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                             <Target className="w-4 h-4 text-[#115E8D] shrink-0 mt-0.5" /> <span>{a}</span>
                           </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500">Client Modifications</h4>
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
        </div>
      </div>
      
      {/* Stationary Filter Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 w-full max-w-5xl">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`w-full text-center px-2 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all border ${
                activeCategory === cat
                  ? 'bg-[#F06C22] text-white border-[#F06C22] shadow-[0_4px_15px_rgba(240,108,34,0.3)]'
                  : 'bg-white/5 text-[#94A3B8] border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="line-clamp-1">{cat}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-32">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6 max-w-[1800px] mx-auto">
          {filteredMachines.map((machine, idx) => {
            const indexNumber = (MACHINE_LIST.findIndex(m => m.id === machine.id) + 1).toString().padStart(2, '0');
            
            return (
              <div 
                key={machine.id}
                onClick={() => setActiveMachineId(machine.id)}
                className="group relative bg-[#0e171e] border border-slate-700/50 rounded-xl cursor-pointer hover:border-[#38BDF8]/50 hover:shadow-[0_8px_30px_rgba(56,189,248,0.15)] hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden"
              >
                {/* Image Section (16:9 Aspect Ratio) */}
                <div className="relative aspect-video w-full overflow-hidden bg-slate-900 shrink-0">
                  <img 
                    src={
                      machine.imageUrl || `https://picsum.photos/seed/${machine.name.replace(/\s+/g, '-')}/400/250`
                    } 
                    alt={machine.name}
                    className="w-full h-full object-cover brightness-105 transition-all duration-700 ease-out scale-100 group-hover:scale-110"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${machine.name.replace(/\s+/g, '-')}/400/250`;
                    }}
                  />
                  <div className="absolute top-2 left-2 z-20">
                    <span className="text-[9px] font-black tracking-widest text-[#38BDF8] uppercase bg-[#0A2E46]/80 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm border border-[#38BDF8]/20">
                      Idx {indexNumber}
                    </span>
                  </div>
                </div>

                {/* Metadata Section (Expert Focus) */}
                <div className="p-4 flex flex-col flex-1 z-20 bg-gradient-to-b from-[#0e171e] to-[#0A2E46]/80 text-[#F8F9FA]">
                  <h3 className="text-lg font-black uppercase tracking-tighter mb-0.5 transition-colors line-clamp-1">
                    {machine.name}
                  </h3>
                  
                  {/* Highlighted Target Muscles */}
                  <p className="text-[#F06C22] text-[10px] sm:text-xs font-black uppercase tracking-widest mb-3 line-clamp-1">
                    {machine.target || 'General Base'}
                  </p>
                  
                  {/* Quick-Cue Data Grid */}
                  <div className="grid grid-cols-1 gap-1.5 mb-4 flex-1">
                    <div className="bg-white/5 border border-white/10 rounded-md p-2">
                       <span className="block text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-[#68717A] mb-0.5">Setup</span>
                       <span className="block text-[10px] sm:text-xs font-semibold text-[#F8F9FA] line-clamp-2 leading-tight">
                         {machine.setup}
                       </span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-md p-2">
                       <span className="block text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-[#68717A] mb-0.5">Turnarounds</span>
                       <span className="block text-[10px] sm:text-xs font-semibold text-[#F8F9FA] line-clamp-2 leading-tight">
                         {machine.execution}
                       </span>
                    </div>
                  </div>
                  
                  {/* Sleek Interaction Button */}
                  <div className="mt-auto">
                     <Button variant="ghost" className="w-full bg-white/5 hover:bg-white/10 text-[#CBD5E1] hover:text-white border border-white/10 hover:border-white/20 transition-all text-[9px] sm:text-[10px] font-black uppercase tracking-widest h-8 rounded-md">
                        Insights
                     </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Slide-out Modal / Gateway */}
      <AnimatePresence>
        {activeMachine && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setActiveMachineId(null)}
            />

            {/* Slide-out Panel */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute inset-y-0 right-0 w-full md:w-[700px] lg:w-[850px] bg-[#0A2E46] border-l border-white/10 z-50 flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Top Sticky Header with Close and Edit Toggle */}
              <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#061e30]/80 backdrop-blur-md z-30 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="text-4xl font-black text-[#115E8D]/40 italic tabular-nums leading-none">
                    {activeMachineIndex.toString().padStart(2, '0')}
                  </div>
                  <Badge variant="outline" className="bg-[#115E8D]/10 text-[#38BDF8] border-[#38BDF8]/20 uppercase text-[9px] font-black tracking-widest px-2 py-0.5">
                    {activeMachine.category}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={handleToggleEdit}
                    variant="ghost" 
                    className={cn(
                      "h-8 px-4 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all",
                      isEditMode 
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30" 
                        : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {isEditMode ? <><CheckCircle className="w-3.5 h-3.5 mr-2" /> Save Changes</> : <><UserCog className="w-3.5 h-3.5 mr-2" /> Edit Mode</>}
                  </Button>
                  <button 
                    onClick={() => setActiveMachineId(null)}
                    className="p-2 bg-white/5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-gradient-to-b from-[#0A2E46] to-[#061e30]">
                {/* Bento Grid Layout */}
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 md:gap-4 max-w-full">
                  
                  {/* CARD 1: Identity & Header (Col Span 6) */}
                  <div className="col-span-1 md:col-span-6 bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 md:p-6 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                      <Target className="w-32 h-32 text-white" />
                    </div>
                    {isEditMode ? (
                      <input 
                        value={editedMachine?.name || ''} 
                        onChange={(e) => updateField('name', e.target.value)}
                        className="w-full bg-slate-900/50 border-slate-600 border-2 rounded-xl text-3xl md:text-5xl font-black uppercase tracking-tighter text-white px-4 py-2 focus:border-[#F06C22] outline-none"
                      />
                    ) : (
                      <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white leading-tight">
                        {activeMachine.name}
                      </h2>
                    )}
                    
                    <div className="mt-4 flex flex-wrap gap-2">
                       {!isEditMode && activeMachine.kinematicClassification && (
                         <Badge className="bg-slate-700 text-slate-300 border-slate-600 uppercase text-[9px] font-black tracking-widest px-3 py-1">
                           {activeMachine.kinematicClassification}
                         </Badge>
                       )}
                       {!isEditMode && activeMachine.setupGap && (
                         <Badge className="bg-slate-700 text-slate-300 border-slate-600 uppercase text-[9px] font-black tracking-widest px-3 py-1">
                           {activeMachine.setupGap}
                         </Badge>
                       )}
                       {isEditMode ? (
                         <div className="flex flex-col gap-2 w-full mt-2">
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Target Muscles (Comma Separated)</span>
                            <input 
                              value={(editedMachine?.targetMuscles || []).join(', ')} 
                              onChange={(e) => updateField('targetMuscles', e.target.value.split(',').map((s: string) => s.trim()))}
                              className="w-full bg-slate-900 border-slate-700 border rounded-lg text-sm text-slate-300 px-3 py-1.5 focus:border-[#F06C22] outline-none"
                            />
                         </div>
                       ) : (
                         (activeMachine.targetMuscles || [activeMachine.target]).map((muscle: string, i: number) => (
                           <Badge key={i} className="bg-[#115E8D]/30 text-[#38BDF8] border border-[#38BDF8]/20 uppercase text-[9px] font-black tracking-widest px-3 py-1">
                             {muscle}
                           </Badge>
                         ))
                       )}
                    </div>
                    {!isEditMode && activeMachine.executionPosture === "Posterior Pelvic Tilt / Contracted Abdomen" && (
                      <div className="mt-4 w-full p-3 bg-amber-900/30 border border-amber-500/50 rounded-lg text-amber-400 text-xs font-black uppercase tracking-widest flex items-center justify-center text-center shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                        ⚠️ STRICT POSTURE: Ensure Contracted Abdomen / Posterior Pelvic Tilt
                      </div>
                    )}
                  </div>

                  {/* CARD 2: Analytics & Telemetry (Col Span 2) */}
                  <div className="col-span-1 md:col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3 block">Performance Analytics</span>
                      <div className="space-y-4">
                        <div>
                          <p className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] mb-1">Utilization</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white">1,284</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Reps</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] mb-1">Avg Quality</p>
                          <div className="flex items-center gap-3">
                            <span className="text-3xl font-black text-emerald-400">2.8</span>
                            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
                              <div className="h-full bg-emerald-500 w-[92%]" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/5">
                       <p className="text-[10px] font-semibold text-slate-500 leading-tight italic">
                         "Consistent high performance across 24 unique client profiles."
                       </p>
                    </div>
                  </div>

                  {/* CARD 3: Biomechanical Notes (Col Span 4) */}
                  <div className="col-span-1 md:col-span-4 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col shadow-lg">
                    <div className="flex items-center justify-between mb-3 shrink-0">
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-[#F06C22]" />
                        Biomechanical Notes & Execution
                      </span>
                      <Button variant="ghost" className="h-6 px-2 text-[9px] font-black uppercase tracking-widest text-[#F06C22] hover:bg-[#F06C22]/10">
                        Expert Cues
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[300px]">
                      {isEditMode ? (
                        <Textarea 
                          value={(editedMachine?.executionCues || []).join('\n')} 
                          onChange={(e) => updateField('executionCues', e.target.value.split('\n'))}
                          className="w-full bg-slate-900/50 border-slate-600 border rounded-xl text-sm text-slate-300 px-3 py-2 focus:border-[#F06C22] outline-none min-h-[120px]"
                        />
                      ) : (
                        <ul className="space-y-2.5">
                          {(activeMachine.executionCues || [activeMachine.execution]).map((cue: string, i: number) => (
                            <li key={i} className="flex gap-2.5 items-start">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#F06C22] mt-1.5 shrink-0" />
                              <span className="text-sm text-slate-300 leading-relaxed font-medium">{cue}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* CARD 4: Setup & Alignment (Col Span 3) */}
                  <div className="col-span-1 md:col-span-3 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col shadow-lg relative overflow-hidden">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3 flex items-center gap-2 shrink-0">
                      <Settings2 className="w-3.5 h-3.5 text-[#38BDF8]" />
                      Setup & Alignment Strategy
                    </span>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[250px]">
                      {syncedMachine?.standardSettings && Object.keys(syncedMachine.standardSettings).length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-[9px] font-black uppercase text-[#F06C22] tracking-widest mb-2 border-b border-white/10 pb-1">Standard Measurements</h4>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {Object.entries(syncedMachine.standardSettings).map(([key, val]) => (
                               <div key={key} className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 shadow-inner">
                                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{key}</p>
                                  <p className="text-white font-black text-sm">{String(val)}</p>
                               </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {isEditMode ? (
                        <Textarea 
                          value={(editedMachine?.setupCues || []).join('\n')} 
                          onChange={(e) => updateField('setupCues', e.target.value.split('\n'))}
                          className="w-full bg-slate-900/50 border-slate-600 border rounded-xl text-sm text-slate-300 px-3 py-2 focus:border-[#F06C22] outline-none min-h-[100px]"
                        />
                      ) : (
                        <ul className="space-y-2">
                           {(activeMachine.setupCues || [activeMachine.setup]).map((cue: string, i: number) => (
                            <li key={i} className="flex gap-3 items-center p-2 rounded-lg bg-white/5 border border-white/5">
                              <span className="w-5 h-5 flex items-center justify-center rounded bg-slate-900 text-[10px] font-black text-[#38BDF8] border border-[#38BDF8]/20">{i+1}</span>
                              <span className="text-xs text-slate-300 font-medium">{cue}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* CARD 5: Clinical Safety / Contraindications (Col Span 3) */}
                  <div className={cn(
                    "col-span-1 md:col-span-3 bg-slate-800/60 rounded-2xl p-5 flex flex-col shadow-lg border relative",
                    activeMachine.clinicalWarnings ? "border-rose-500/50" : "border-slate-700/50"
                  )}>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3 flex items-center gap-2 shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 text-rose-500" />
                      Clinical Safety & Contraindications
                    </span>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[250px]">
                       {isEditMode ? (
                         <div className="space-y-3">
                            <Textarea 
                              placeholder="Clinical Warnings (one per line)..."
                              value={(editedMachine?.clinicalWarnings || []).join('\n')} 
                              onChange={(e) => updateField('clinicalWarnings', e.target.value.split('\n'))}
                              className="w-full bg-slate-900/50 border-slate-600 border rounded-xl text-xs text-slate-300 px-3 py-2 focus:border-[#F06C22] outline-none min-h-[80px]"
                            />
                            <input 
                              placeholder="Contraindicated For (comma separated)..."
                              value={(editedMachine?.contraindicatedFor || []).join(', ')} 
                              onChange={(e) => updateField('contraindicatedFor', e.target.value.split(',').map((s: string) => s.trim()))}
                              className="w-full bg-slate-900 border-slate-700 border rounded-lg text-[10px] text-slate-300 px-3 py-1.5 focus:border-[#F06C22] outline-none"
                            />
                         </div>
                       ) : (
                         <div className="space-y-4">
                            {activeMachine.clinicalWarnings && (
                              <ul className="space-y-1.5">
                                {activeMachine.clinicalWarnings.map((warning: string, i: number) => (
                                  <li key={i} className="text-xs text-rose-200/80 font-medium leading-normal bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                                    {warning}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {activeMachine.contraindicatedFor && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {activeMachine.contraindicatedFor.map((c: string, idx: number) => (
                                  <Badge key={idx} variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/5 text-[8px] uppercase tracking-widest font-black">
                                    {c}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {!activeMachine.clinicalWarnings && !activeMachine.contraindicatedFor && (
                               <p className="text-xs text-slate-500 italic py-4 text-center">No clinical contraindications noted for this equipment.</p>
                            )}
                         </div>
                       )}
                    </div>
                  </div>

                  {/* CARD 6: Sequencing Contraindications (Col Span 6) */}
                  {!isEditMode && activeMachine.sequencingContraindications && activeMachine.sequencingContraindications.length > 0 && (
                    <div className="col-span-1 md:col-span-6 bg-rose-950/20 border border-rose-900 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                      <span className="text-[10px] uppercase tracking-wider text-rose-400 font-black mb-3 flex items-center gap-2 shrink-0">
                        <ShieldCheck className="w-4 h-4 text-rose-500" />
                        Sequencing Contraindications
                      </span>
                      <ul className="space-y-1.5 mt-2">
                        {activeMachine.sequencingContraindications.map((warning: string, i: number) => (
                          <li key={i} className="text-xs text-rose-200/90 font-medium leading-normal bg-rose-900/20 p-3 rounded-lg border border-rose-800/50">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* CARD 7: The AI Strategist (Col Span 6) */}
                  <div className="col-span-1 md:col-span-6 bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-[#F06C22]/5 to-transparent pointer-events-none" />
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-[#F06C22]/10 border border-[#F06C22]/30 rounded-xl flex items-center justify-center">
                            <Wand2 className="w-6 h-6 text-[#F06C22]" />
                          </div>
                          <div>
                            <h3 className="text-xs md:text-sm font-black uppercase tracking-[0.2em] text-[#F8F9FA]">The AI Clinical Strategist</h3>
                            <p className="text-[10px] text-slate-500 font-medium mt-1 font-mono uppercase tracking-widest">Generate neural-mapped setup protocols</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {!isEditMode && activeMachine.requiresHandoff && (
                          <Badge className="bg-sky-900/30 text-sky-400 border-sky-500/50 text-[10px] uppercase tracking-widest font-black py-2 px-3 flex items-center gap-2">
                            <Hand className="w-3.5 h-3.5" />
                            Intrapersonal Load Transfer Required
                          </Badge>
                        )}
                        <Button 
                          onClick={() => {
                            setWizardSelectedMachine(activeMachine.id);
                            setIsWizardOpen(true);
                          }}
                          className="bg-[#F06C22] hover:bg-[#D95B1B] text-white font-black uppercase tracking-widest text-[10px] h-11 px-8 rounded-full shadow-[0_8px_30px_rgba(240,108,34,0.3)] transition-all hover:scale-105 active:scale-95 flex items-center gap-2 group"
                        >
                          <Zap className="w-4 h-4 fill-white group-hover:animate-pulse" />
                          Generate Setup Strategy
                        </Button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Bottom Nav / Stats Summary Sticky */}
              <div className="p-4 bg-[#061e30] border-t border-white/5 shrink-0 flex items-center justify-between">
                 <div className="flex gap-4">
                    <div className="text-center">
                       <p className="text-[8px] uppercase tracking-widest text-slate-500 font-black">Base Male</p>
                       <p className="text-sm font-black text-white">{activeMachine.baseMale} <span className="text-[9px] text-slate-500">LBS</span></p>
                    </div>
                    <div className="text-center">
                       <p className="text-[8px] uppercase tracking-widest text-slate-500 font-black">Base Female</p>
                       <p className="text-sm font-black text-white">{activeMachine.baseFemale} <span className="text-[9px] text-slate-500">LBS</span></p>
                    </div>
                 </div>
                 <Button 
                    variant="link" 
                    className="text-[#38BDF8] text-[10px] font-black uppercase tracking-widest hover:no-underline"
                    onClick={() => {
                      // Navigate to full insights or something
                    }}
                  >
                    Load Full Telemetry <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
