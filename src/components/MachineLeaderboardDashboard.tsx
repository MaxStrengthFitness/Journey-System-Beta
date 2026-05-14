import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { 
  Trophy, 
  Target, 
  Users, 
  MapPin, 
  Briefcase, 
  Calendar, 
  Settings2, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Info,
  Layers,
  Sparkles,
  Search,
  Filter,
  BarChart3,
  Weight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { OCCUPATIONS } from '../data/occupational-matrix';
import { MACHINE_DATABASE } from '../data/machine-database';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, ExerciseLog, ClientMachineSetting } from '../types';
import { OperationType, handleFirestoreError } from '../lib/firestore-errors';

// --- Types ---
interface LeaderboardEntry {
  id: string;
  name: string;
  weight: number;
  initialWeight: number;
  strengthGainPercent: number;
  reps: number;
  gap: number;
  setup: string;
  occupation: string;
  occupationCategory: string;
  age: number;
  gender: 'M' | 'F' | 'O';
  timeUnderLoad?: number;
  date: string;
}

// --- Mock Data Generation ---
const AGE_BRACKETS = [
  { label: 'All Ages', value: 'all' },
  { label: '30 - 40', value: '30-40' },
  { label: '40 - 50', value: '40-50' },
  { label: '50 - 60', value: '50-60' },
  { label: '60+', value: '60+' },
];

const GENDERS = [
  { label: 'All Genders', value: 'all' },
  { label: 'Male', value: 'M' },
  { label: 'Female', value: 'F' },
];

const GAP_OPTIONS = [
  { label: 'Gap 0 Only (True ROM)', value: '0' },
  { label: 'Gap 1-2', value: '1-2' },
  { label: 'Gap 3+', value: '3+' },
  { label: 'All Gaps (Mixed Data)', value: 'all' },
];

// --- Sub-component: Chart ---
const LeaderboardChart = ({ data, activeClientId, sortBy }: { data: LeaderboardEntry[], activeClientId?: string, sortBy: 'weight' | 'gain' }) => {
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const svg = d3.select(chartRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 10, right: 100, bottom: 20, left: 160 };
    const width = chartRef.current.clientWidth - margin.left - margin.right;
    const height = data.length * 54;

    svg.attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => sortBy === 'gain' ? d.strengthGainPercent : d.weight) || 100])
      .range([0, width]);

    const y = d3.scaleBand()
      .domain(data.map(d => d.id))
      .range([0, height])
      .padding(0.3);

    // Bars
    const bars = g.selectAll('.bar')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'bar-group');

    bars.append('rect')
      .attr('class', 'bar')
      .attr('y', d => y(d.id) || 0)
      .attr('x', 0)
      .attr('height', y.bandwidth())
      .attr('width', 0)
      .attr('rx', 6)
      .attr('fill', (d, i) => {
        if (d.id === activeClientId) return '#F06C22';
        if (i === 0) return 'url(#goldGradient)';
        if (i === 1) return '#94A3B8';
        if (i === 2) return '#92400E';
        return '#1E293B';
      })
      .attr('stroke', (d, i) => {
        if (i < 3) return 'rgba(255,255,255,0.1)';
        return 'none';
      })
      .transition()
      .duration(800)
      .attr('width', d => x(sortBy === 'gain' ? d.strengthGainPercent : d.weight));

    // Client Labels (Y Axis)
    bars.append('text')
      .attr('x', -10)
      .attr('y', d => (y(d.id) || 0) + y.bandwidth() / 2)
      .attr('dy', '.35em')
      .attr('text-anchor', 'end')
      .attr('fill', (d, i) => i < 3 ? '#F8F9FA' : '#94A3B8')
      .attr('font-size', '12px')
      .attr('font-weight', '700')
      .text(d => d.name);

    // Value Labels
    bars.append('text')
      .attr('x', d => x(sortBy === 'gain' ? d.strengthGainPercent : d.weight) + 8)
      .attr('y', d => (y(d.id) || 0) + y.bandwidth() / 2)
      .attr('dy', '.15em')
      .attr('fill', '#FFFFFF')
      .attr('font-size', '14px')
      .attr('font-weight', '900')
      .text(d => sortBy === 'gain' ? `+${d.strengthGainPercent}%` : `${d.weight} LBS`);

    // Badges (Small text below value)
    bars.append('text')
      .attr('x', d => x(sortBy === 'gain' ? d.strengthGainPercent : d.weight) + 8)
      .attr('y', d => (y(d.id) || 0) + y.bandwidth() / 2 + 14)
      .attr('dy', '.35em')
      .attr('fill', '#64748B')
      .attr('font-size', '9px')
      .attr('font-weight', '700')
      .attr('text-transform', 'uppercase')
      .attr('letter-spacing', '0.05em')
      .text(d => sortBy === 'gain' ? `FROM ${d.initialWeight} LBS TO ${d.weight} LBS` : `${d.reps} REPS • G:${d.gap} ${d.setup}`);

    // Rank numbers
    bars.append('text')
      .attr('x', -145)
      .attr('y', d => (y(d.id) || 0) + y.bandwidth() / 2)
      .attr('dy', '.35em')
      .attr('fill', '#475569')
      .attr('font-size', '10px')
      .attr('font-weight', '800')
      .text((d, i) => `#${(i + 1).toString().padStart(2, '0')}`);

    // Gradients
    const defs = svg.append('defs');
    const goldGradient = defs.append('linearGradient')
      .attr('id', 'goldGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%');
    
    goldGradient.append('stop').attr('offset', '0%').attr('stop-color', '#F59E0B');
    goldGradient.append('stop').attr('offset', '100%').attr('stop-color', '#D97706');

  }, [data, activeClientId, sortBy]);

  return (
    <div className="w-full overflow-x-auto min-h-[500px]">
      <svg ref={chartRef} className="w-full" />
    </div>
  );
};

// --- Main Component ---
export function MachineLeaderboardDashboard({ 
  onBack,
  clients 
}: { 
  onBack?: () => void;
  clients?: Client[];
}) {
  const [selectedMachine, setSelectedMachine] = useState<string>('leg_press');
  const [gapFilter, setGapFilter] = useState<string>('all');
  const [occupationFilter, setOccupationFilter] = useState<string>('all');
  const [ageFilter, setAgeFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'weight' | 'gain'>('weight');
  const [isLoading, setIsLoading] = useState(false);

  const [allEntries, setAllEntries] = useState<LeaderboardEntry[]>([]);
  
  useEffect(() => {
    async function fetchLeaderboardData() {
      if (!clients || clients.length === 0) return;
      setIsLoading(true);

      try {
        // Fetch machine settings for gaps
        const settingsQ = query(
          collection(db, 'clientMachineSettings'),
          where('machineId', '==', selectedMachine)
        );
        const settingsSnap = await getDocs(settingsQ);
        const settingsMap: Record<string, ClientMachineSetting> = {};
        settingsSnap.docs.forEach(d => {
          const s = d.data() as ClientMachineSetting;
          settingsMap[s.clientId] = s;
        });

        // We can't query by machineId without an index if we also order, 
        // so we just query all logs for this machine and sort in memory,
        // or query where machineId == selectedMachine
        const logsQ = query(
          collection(db, 'exerciseLogs'),
          where('machineId', '==', selectedMachine)
        );
        const logsSnap = await getDocs(logsQ);
        
        // Map over logs to find highest weight per client and also first weight
        const maxLogsByClient: Record<string, ExerciseLog> = {};
        const firstWeightByClient: Record<string, number> = {};

        // Sort logs descending by date to find max and first (first would be oldest)
        const sortedLogs = logsSnap.docs.map(d => d.data() as ExerciseLog).sort((a, b) => {
           const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
           const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
           return timeA - timeB; // ascending, so first is oldest
        });

        sortedLogs.forEach(log => {
          if (!log.clientId) return; // Need clientId
          
          const weight = parseInt(log.weight || '0', 10) || 0;
          if (weight === 0) return;

          // Record first weight seen for this client
          if (firstWeightByClient[log.clientId] === undefined) {
             firstWeightByClient[log.clientId] = weight;
          }

          const currentMax = maxLogsByClient[log.clientId];
          const currentMaxWeight = currentMax ? (parseInt(currentMax.weight || '0', 10) || 0) : 0;

          if (!currentMax || weight >= currentMaxWeight) {
             // For ties in weight, taking the one with more reps could be an optimization,
             // but taking the latest or just strictly weight is fine.
             if (weight > currentMaxWeight || !currentMax) {
               maxLogsByClient[log.clientId] = log;
             } else if (weight === currentMaxWeight) {
               // tie, check reps
               const reps = parseInt(log.reps || '0', 10) || 0;
               const currentMaxReps = parseInt(currentMax.reps || '0', 10) || 0;
               if (reps > currentMaxReps) {
                 maxLogsByClient[log.clientId] = log;
               }
             }
          }
        });

        const newEntries: LeaderboardEntry[] = [];

        Object.values(maxLogsByClient).forEach(log => {
           if (!log.clientId) return;
           const client = clients.find(c => c.id === log.clientId);
           if (!client) return;
           
           const cSettings = settingsMap[log.clientId];
           let gapValue = -1;
           let setupStr = 'Standard';

           if (cSettings && cSettings.settings) {
             const gapStr = cSettings.settings['Gap'] || cSettings.settings['Gap Option'] || '';
             const match = gapStr.match(/\d+/);
             if (match) {
               gapValue = parseInt(match[0], 10);
               setupStr = `Gap ${gapValue}`;
             } else {
               gapValue = 0;
               setupStr = 'Gap 0';
             }
           } else {
             // Default to gap 0 if not specified
             gapValue = 0;
             setupStr = 'Gap 0';
           }

           const maxWeight = parseInt(log.weight || '0', 10) || 0;
           const initialWeight = firstWeightByClient[log.clientId] || maxWeight;
           let strengthGainPercent = 0;
           if (initialWeight > 0 && maxWeight > initialWeight) {
              strengthGainPercent = Math.round(((maxWeight - initialWeight) / initialWeight) * 100);
           }

           newEntries.push({
             id: client.id!,
             name: `${client.firstName} ${client.lastName.charAt(0)}`,
             weight: maxWeight,
             initialWeight,
             strengthGainPercent,
             reps: parseInt(log.reps || '0', 10) || 0,
             gap: gapValue,
             setup: setupStr,
             occupation: client.occupation || 'Unspecified',
             occupationCategory: OCCUPATIONS.find(o => o.title === client.occupation)?.category || 'Other',
             age: client.age || 0,
             gender: client.gender?.startsWith('M') ? 'M' : client.gender?.startsWith('F') ? 'F' : 'O',
             timeUnderLoad: parseInt(log.seconds || '0', 10) || 0,
             date: log.createdAt?.toDate ? log.createdAt.toDate().toISOString() : new Date().toISOString()
           });
        });

        setAllEntries(newEntries);

      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'exerciseLogs/clientMachineSettings for Leaderboard');
      } finally {
        setIsLoading(false);
      }
    }

    fetchLeaderboardData();
  }, [selectedMachine, clients]);

  // Filtering Logic
  const filteredEntries = useMemo(() => {
    return allEntries
      .filter(entry => {
        // Gap Filter
        if (gapFilter === '0' && entry.gap !== 0) return false;
        if (gapFilter === '1-2' && (entry.gap < 1 || entry.gap > 2)) return false;
        if (gapFilter === '3+' && entry.gap < 3) return false;
        
        // Occupation Filter
        if (occupationFilter !== 'all' && entry.occupationCategory !== occupationFilter) return false;
        
        // Age Filter
        if (ageFilter === '30-40' && (entry.age < 30 || entry.age > 40)) return false;
        if (ageFilter === '40-50' && (entry.age < 40 || entry.age > 50)) return false;
        if (ageFilter === '50-60' && (entry.age < 50 || entry.age > 60)) return false;
        if (ageFilter === '60+' && entry.age < 60) return false;
        
        // Gender Filter
        if (genderFilter !== 'all' && entry.gender !== genderFilter) return false;
        
        // Search
        if (searchQuery && !entry.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'gain') {
          if (b.strengthGainPercent !== a.strengthGainPercent) return b.strengthGainPercent - a.strengthGainPercent;
          return b.weight - a.weight;
        } else {
          // Primary: Weight
          if (b.weight !== a.weight) return b.weight - a.weight;
          // Secondary: Reps
          if (b.reps !== a.reps) return b.reps - a.reps;
          // Tertiary: Time Under Load
          return (b.timeUnderLoad || 0) - (a.timeUnderLoad || 0);
        }
      })
      .slice(0, 20); // Top 20 for the dashboard
  }, [allEntries, gapFilter, occupationFilter, ageFilter, genderFilter, searchQuery, sortBy]);

  const topThree = filteredEntries.slice(0, 3);
  const others = filteredEntries.slice(3);

  const machineDetails = MACHINE_DATABASE[selectedMachine];
  const occupationCategories = Array.from(new Set(OCCUPATIONS.map(o => o.category)));

  return (
    <div className="flex flex-col bg-[#0A2E46] min-h-full w-full text-white overflow-hidden pb-20">
      
      {/* Control HUD */}
      <div className="p-6 bg-slate-900 border-b border-white/10 z-20 shrink-0 shadow-xl">
        <div className="max-w-7xl mx-auto space-y-6">
          
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {onBack && (
                <Button 
                  variant="ghost" 
                  onClick={onBack}
                  className="w-10 h-10 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
              )}
              <div className="w-12 h-12 rounded-2xl bg-[#F06C22]/10 border border-[#F06C22]/30 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-[#F06C22]" />
              </div>
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tighter italic">Machine Performance</h1>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <BarChart3 className="w-3 h-3" />
                  Clinical Ranking Distribution Analyzer
                </p>
              </div>
            </div>

            <div className="flex gap-2 w-full md:w-auto">
               <div className="flex bg-slate-800 rounded-xl p-1 border border-slate-700">
                  <button 
                    onClick={() => setSortBy('weight')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                      sortBy === 'weight' ? "bg-[#38BDF8] text-[#0A2E46]" : "text-slate-400 hover:text-white"
                    )}
                  >
                    Max Weight
                  </button>
                  <button 
                    onClick={() => setSortBy('gain')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                      sortBy === 'gain' ? "bg-[#F06C22] text-white" : "text-slate-400 hover:text-white"
                    )}
                  >
                    Strength Gain %
                  </button>
               </div>
               <div className="relative flex-1 md:w-64">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                 <input 
                   type="text"
                   placeholder="Search Client..."
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                   className="w-full h-11 pl-10 pr-4 bg-slate-800 border-slate-700 rounded-xl text-xs font-bold focus:ring-[#F06C22] focus:border-[#F06C22] transition-all outline-none"
                 />
               </div>
               <Select value={selectedMachine} onValueChange={setSelectedMachine}>
                <SelectTrigger className="w-full md:w-64 h-11 bg-slate-800 border-slate-700 rounded-xl font-bold text-xs">
                  <SelectValue placeholder="Select Machine" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white max-h-[300px]">
                  {Object.values(MACHINE_DATABASE).map(m => (
                    <SelectItem key={m.id} value={m.id} className="focus:bg-[#115E8D] focus:text-white cursor-pointer py-2.5">
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
               </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
             <div className="space-y-1.5">
               <label className="text-[9px] font-black uppercase tracking-widest text-[#F06C22] ml-1">Range of Motion (Gap)</label>
               <Select value={gapFilter} onValueChange={setGapFilter}>
                 <SelectTrigger className="w-full h-10 bg-slate-800 border-slate-700 rounded-xl font-bold text-xs">
                   <div className="flex items-center gap-2">
                     <Layers className={cn("w-3.5 h-3.5", gapFilter === '0' ? "text-[#38BDF8]" : "text-amber-500")} />
                     <SelectValue />
                   </div>
                 </SelectTrigger>
                 <SelectContent className="bg-slate-800 border-slate-700 text-white">
                   {GAP_OPTIONS.map(opt => (
                     <SelectItem key={opt.value} value={opt.value} className="focus:bg-[#115E8D] cursor-pointer">
                       {opt.label}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>

             <div className="space-y-1.5">
               <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Occupational Matrix</label>
               <Select value={occupationFilter} onValueChange={setOccupationFilter}>
                 <SelectTrigger className="w-full h-10 bg-slate-800 border-slate-700 rounded-xl font-bold text-xs">
                   <div className="flex items-center gap-2">
                     <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                     <SelectValue />
                   </div>
                 </SelectTrigger>
                 <SelectContent className="bg-slate-800 border-slate-700 text-white">
                   <SelectItem value="all" className="focus:bg-[#115E8D] cursor-pointer">All Industries</SelectItem>
                   {occupationCategories.map(cat => (
                     <SelectItem key={cat} value={cat} className="focus:bg-[#115E8D] cursor-pointer">
                       {cat}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>

             <div className="space-y-1.5">
               <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Age Bracket</label>
               <Select value={ageFilter} onValueChange={setAgeFilter}>
                 <SelectTrigger className="w-full h-10 bg-slate-800 border-slate-700 rounded-xl font-bold text-xs">
                   <div className="flex items-center gap-2">
                     <Calendar className="w-3.5 h-3.5 text-slate-500" />
                     <SelectValue />
                   </div>
                 </SelectTrigger>
                 <SelectContent className="bg-slate-800 border-slate-700 text-white">
                   {AGE_BRACKETS.map(opt => (
                     <SelectItem key={opt.value} value={opt.value} className="focus:bg-[#115E8D] cursor-pointer">
                       {opt.label}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>

             <div className="space-y-1.5">
               <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Gender Segment</label>
               <Select value={genderFilter} onValueChange={setGenderFilter}>
                 <SelectTrigger className="w-full h-10 bg-slate-800 border-slate-700 rounded-xl font-bold text-xs">
                   <div className="flex items-center gap-2">
                     <Users className="w-3.5 h-3.5 text-slate-500" />
                     <SelectValue />
                   </div>
                 </SelectTrigger>
                 <SelectContent className="bg-slate-800 border-slate-700 text-white">
                   {GENDERS.map(opt => (
                     <SelectItem key={opt.value} value={opt.value} className="focus:bg-[#115E8D] cursor-pointer">
                       {opt.label}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
          </div>
        </div>
      </div>

      {/* Main Content View */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-10">
          
          {isLoading ? (
            <div className="py-20 text-center">
              <Sparkles className="w-10 h-10 text-[#F06C22] mx-auto mb-4 animate-pulse opacity-50" />
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                Loading Leaderboard Data...
              </p>
            </div>
          ) : (
            <>
              {/* Top 3 Podium Section */}
              <section>
            <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-[#38BDF8] mb-6 flex items-center gap-3">
              <Sparkles className="w-4 h-4 fill-[#38BDF8]/20" />
              Elite Performance Tier
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {topThree.length > 0 ? topThree.map((entry, idx) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  className={cn(
                    "relative p-1 rounded-[32px] overflow-hidden",
                    idx === 0 ? "bg-gradient-to-br from-amber-200 via-amber-500 to-amber-700 shadow-2xl shadow-amber-500/20" :
                    idx === 1 ? "bg-gradient-to-br from-slate-200 via-slate-400 to-slate-600 shadow-xl shadow-slate-400/10" :
                    "bg-gradient-to-br from-amber-600 via-amber-800 to-amber-950 shadow-lg shadow-amber-900/10"
                  )}
                >
                  <div className="bg-slate-900 rounded-[30px] p-6 h-full flex flex-col items-center text-center relative">
                    <div className="absolute top-4 right-6 text-4xl font-black italic opacity-10">
                      {idx + 1}
                    </div>
                    
                    <div className="w-20 h-20 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center mb-4 overflow-hidden relative group">
                       <span className="text-2xl font-black text-white italic group-hover:scale-110 transition-transform">
                         {entry.name[0]}
                       </span>
                    </div>

                    <h3 className="text-xl font-black uppercase italic text-white tracking-tight mb-1">{entry.name}</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                      {entry.age}Y • {entry.occupation}
                    </p>

                    <div className="flex items-center gap-3 mb-6">
                      <div className="h-px w-8 bg-slate-700" />
                      <div className="px-4 py-1.5 bg-slate-800 rounded-full border border-slate-700">
                        <span className="text-xs font-black uppercase text-slate-300 tracking-widest">{entry.occupationCategory}</span>
                      </div>
                      <div className="h-px w-8 bg-slate-700" />
                    </div>

                    <div className="mt-auto space-y-1">
                      <div className="text-4xl font-black text-white italic tracking-tighter leading-none">
                        {sortBy === 'gain' ? (
                          <>+{entry.strengthGainPercent}<span className="text-[12px] font-bold uppercase text-slate-500 not-italic tracking-widest">%</span></>
                        ) : (
                          <>{entry.weight} <span className="text-[12px] font-bold uppercase text-slate-500 not-italic tracking-widest">LBS</span></>
                        )}
                      </div>
                      {sortBy === 'gain' && entry.initialWeight > 0 && (
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pb-1">
                          From {entry.initialWeight} LBS to {entry.weight} LBS
                        </div>
                      )}
                      <div className="py-2 px-4 bg-[#0A2E46] border border-[#38BDF8]/20 rounded-xl inline-flex items-center gap-3">
                         <span className="text-[10px] font-black uppercase text-[#38BDF8] tracking-widest">G:{entry.gap} • {entry.reps} REPS</span>
                         <div className="w-1 h-1 rounded-full bg-slate-600" />
                         <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{entry.setup}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )) : (
                <div className="col-span-3 py-20 text-center bg-slate-800/20 border border-dashed border-slate-700 rounded-[32px]">
                   <Info className="w-10 h-10 text-slate-600 mx-auto mb-4" />
                   <p className="text-sm font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                     No Data Matches These Strict Clinical Constraints.<br/>Try adjusting your filters.
                   </p>
                </div>
              )}
            </div>
          </section>

          {/* Visualization Section */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* The List / Rankings Grid */}
            <div className="lg:col-span-2 space-y-6">
               <div className="flex items-center justify-between">
                 <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 flex items-center gap-3">
                   <BarChart3 className="w-4 h-4 text-[#F06C22]" />
                   Cohort Distribution
                 </h2>
                 <Badge variant="outline" className="bg-[#0A2E46] text-[#38BDF8] border-[#38BDF8]/30 uppercase text-[9px] font-black px-2 py-1">
                   {filteredEntries.length} SAMPLES FOUND
                 </Badge>
               </div>

               <div className="bg-slate-900/50 border border-white/5 rounded-[32px] p-6 shadow-xl">
                 <LeaderboardChart data={filteredEntries} sortBy={sortBy} />
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 {others.map((entry, idx) => (
                   <motion.div 
                     key={entry.id}
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ delay: 0.3 + idx * 0.05 }}
                     className="bg-slate-800/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between hover:bg-slate-800/60 transition-all cursor-pointer group"
                   >
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-xs font-black text-slate-500 border border-slate-700">
                          {idx + 4}
                        </div>
                        <div>
                          <p className="text-sm font-black text-white italic uppercase">{entry.name}</p>
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                            {entry.age}Y • {entry.occupation}
                          </p>
                        </div>
                     </div>
                     <div className="text-right">
                       <p className="text-lg font-black text-white leading-none">
                         {sortBy === 'gain' ? `+${entry.strengthGainPercent}%` : `${entry.weight} LBS`}
                       </p>
                       <p className="text-[9px] font-bold text-[#F06C22] uppercase tracking-widest mt-1">
                         {sortBy === 'gain' && entry.initialWeight > 0 ? (
                           <>FROM {entry.initialWeight} LBS</>
                         ) : (
                           <>G:{entry.gap} • {entry.reps} REPS</>
                         )}
                       </p>
                     </div>
                   </motion.div>
                 ))}
               </div>
            </div>

            {/* Sidebar Context Panel */}
            <div className="space-y-6">
               <Card className="bg-[#0A2E46] border-[#38BDF8]/20 shadow-2xl rounded-[32px]">
                 <CardHeader>
                   <CardTitle className="text-lg font-black uppercase italic text-white flex items-center gap-2">
                     <Target className="w-5 h-5 text-[#F06C22]" />
                     Mechanical Disadvantage
                   </CardTitle>
                   <CardDescription className="text-slate-400 capitalize">Clinical context for {machineDetails?.name || 'this machine'}</CardDescription>
                 </CardHeader>
                 <CardContent className="space-y-6">
                   <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5">
                      <p className="text-[9px] font-black uppercase text-[#F06C22] tracking-[0.2em] mb-2 leading-none">The GAP Logic</p>
                      <p className="text-xs text-slate-300 leading-relaxed font-medium">
                        A lower Gap indicates full deep flexion and max mechanical disadvantage. 
                        Users with <span className="text-[#38BDF8] font-bold">Gap 0</span> results represent the baseline standard for true clinical ROM.
                      </p>
                   </div>

                   <div className="space-y-4">
                     <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest border-l-2 border-[#F06C22] pl-3">Machine Specs</h4>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900/30 p-3 rounded-xl border border-white/5">
                           <span className="block text-[8px] font-bold text-slate-500 uppercase mb-1">M-Base</span>
                           <span className="text-sm font-black text-white tabular-nums">{machineDetails?.baseMale || 0} LBS</span>
                        </div>
                        <div className="bg-slate-900/30 p-3 rounded-xl border border-white/5">
                           <span className="block text-[8px] font-bold text-slate-500 uppercase mb-1">F-Base</span>
                           <span className="text-sm font-black text-white tabular-nums">{machineDetails?.baseFemale || 0} LBS</span>
                        </div>
                     </div>
                   </div>

                   <div className="p-4 bg-[#F06C22]/5 border border-[#F06C22]/20 rounded-2xl">
                     <div className="flex items-start gap-4">
                        <Info className="w-5 h-5 text-[#F06C22] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-black text-white uppercase mb-1">Rank Tie-Breaking</p>
                          <ul className="text-[10px] text-slate-400 space-y-1 font-medium list-disc ml-3">
                            <li>Weight as primary rank</li>
                            <li>Reps as secondary rank</li>
                            <li>Time Under Load as tertiary</li>
                          </ul>
                        </div>
                     </div>
                   </div>

                   <Button className="w-full h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl">
                     View Historical Trends
                   </Button>
                 </CardContent>
               </Card>

               {/* Quick Insights Callout */}
               <div className="bg-gradient-to-br from-[#115E8D] to-[#0A2E46] p-8 rounded-[32px] border border-[#38BDF8]/30 shadow-xl relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                    <Weight className="w-24 h-24 text-white" />
                 </div>
                 <h3 className="text-lg font-black uppercase italic text-white mb-2 relative z-10">Peer Comparison</h3>
                 <p className="text-xs text-[#38BDF8] font-bold leading-relaxed mb-6 relative z-10">
                   You are currently viewing performance benchmarks filtered by demographic specific segments. 
                   This data is used to validate clinical efficacy across various patient populations.
                 </p>
                 <Button variant="link" className="p-0 h-auto text-white font-black uppercase tracking-widest text-[10px] flex items-center gap-2 group-hover:translate-x-2 transition-transform">
                   Generate Report <ChevronRight className="w-3 h-3" />
                 </Button>
               </div>
            </div>
          </section>
          </>
          )}
        </div>
      </main>

    </div>
  );
}
