import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { 
  Trophy, 
  Target, 
  Globe,
  Building2,
  ChevronLeft, 
  Info,
  Sparkles,
  Search,
  BarChart3,
  Weight,
  Loader2
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MACHINE_DATABASE } from '../data/machine-database';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, LeaderboardDocument, LeaderboardRank } from '../types';

// --- Sub-component: Chart ---
const LeaderboardChart = ({ 
  data, 
  sortBy 
}: { 
  data: LeaderboardRank[], 
  sortBy: 'weight' | 'gain' 
}) => {
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const svg = d3.select(chartRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 10, right: 100, bottom: 20, left: 160 };
    const width = chartRef.current.clientWidth - margin.left - margin.right;
    const height = Math.max(data.length * 54, 300);

    svg.attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => sortBy === 'gain' ? (d.strengthGainPercent || 0) : d.maxWeight) || 100])
      .range([0, width]);

    const y = d3.scaleBand()
      .domain(data.map(d => d.clientId))
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
      .attr('y', d => y(d.clientId) || 0)
      .attr('x', 0)
      .attr('height', y.bandwidth())
      .attr('width', 0)
      .attr('rx', 6)
      .attr('fill', (d, i) => {
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
      .attr('width', d => x(sortBy === 'gain' ? (d.strengthGainPercent || 0) : d.maxWeight));

    // Client Labels (Y Axis)
    bars.append('text')
      .attr('x', -10)
      .attr('y', d => (y(d.clientId) || 0) + y.bandwidth() / 2)
      .attr('dy', '.35em')
      .attr('text-anchor', 'end')
      .attr('fill', (d, i) => i < 3 ? '#F8F9FA' : '#94A3B8')
      .attr('font-size', '12px')
      .attr('font-weight', '700')
      .text(d => d.clientName);

    // Value Labels
    bars.append('text')
      .attr('x', d => x(sortBy === 'gain' ? (d.strengthGainPercent || 0) : d.maxWeight) + 8)
      .attr('y', d => (y(d.clientId) || 0) + y.bandwidth() / 2)
      .attr('dy', '.15em')
      .attr('fill', '#FFFFFF')
      .attr('font-size', '14px')
      .attr('font-weight', '900')
      .text(d => sortBy === 'gain' ? `+${d.strengthGainPercent || 0}%` : `${d.maxWeight} LBS`);

    // Rank numbers
    bars.append('text')
      .attr('x', -145)
      .attr('y', d => (y(d.clientId) || 0) + y.bandwidth() / 2)
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

  }, [data, sortBy]);

  return (
    <div className="w-full overflow-x-auto min-h-[500px]">
      <svg ref={chartRef} className="w-full" />
    </div>
  );
};

// --- Main Component ---
export function MachineLeaderboardDashboard({ 
  onBack,
  activeStudioId
}: { 
  onBack?: () => void;
  clients?: Client[];
  activeStudioId: string | null;
}) {
  const [selectedMachine, setSelectedMachine] = useState<string>('leg_press');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'weight' | 'gain'>('weight');
  const [viewScope, setViewScope] = useState<'studio' | 'global'>('studio');
  const [isLoading, setIsLoading] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardDocument | null>(null);

  useEffect(() => {
    async function fetchMaterializedLeaderboard() {
      setIsLoading(true);
      try {
        const docId = viewScope === 'global' ? 'global_latest' : `studio_${activeStudioId}_latest`;
        const docRef = doc(db, 'leaderboards', docId);
        const snap = await getDoc(docRef);
        
        if (snap.exists()) {
          setLeaderboardData(snap.data() as LeaderboardDocument);
        } else {
          setLeaderboardData(null);
        }
      } catch (err) {
        console.error("Error fetching materialized leaderboard:", err);
      } finally {
        setIsLoading(false);
      }
    }

    if (activeStudioId || viewScope === 'global') {
      fetchMaterializedLeaderboard();
    }
  }, [viewScope, activeStudioId]);

  const machineRankings = useMemo(() => {
    if (!leaderboardData || !leaderboardData.machineData[selectedMachine]) return [];
    
    let list = leaderboardData.machineData[selectedMachine].topRankings;

    if (searchQuery) {
      list = list.filter(r => r.clientName.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'gain') return (b.strengthGainPercent || 0) - (a.strengthGainPercent || 0);
      return b.maxWeight - a.maxWeight;
    });
  }, [leaderboardData, selectedMachine, searchQuery, sortBy]);

  const topThree = machineRankings.slice(0, 3);
  const others = machineRankings.slice(3, 20);

  const machineDetails = MACHINE_DATABASE[selectedMachine];

  return (
    <div className="flex flex-col bg-[#0A2E46] min-h-full w-full text-white overflow-hidden pb-20">
      
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
                  Materialized Rank Intelligence
                </p>
              </div>
            </div>

            <div className="flex gap-2 w-full md:w-auto">
               <div className="flex bg-slate-800 rounded-xl p-1 border border-slate-700">
                  <button 
                    onClick={() => setViewScope('studio')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                      viewScope === 'studio' ? "bg-[#38BDF8] text-[#0A2E46]" : "text-slate-400 hover:text-white"
                    )}
                  >
                    <Building2 className="w-3 h-3" /> My Studio
                  </button>
                  <button 
                    onClick={() => setViewScope('global')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                      viewScope === 'global' ? "bg-[#F06C22] text-white" : "text-slate-400 hover:text-white"
                    )}
                  >
                    <Globe className="w-3 h-3" /> Entire Network
                  </button>
               </div>
               <div className="relative flex-1 md:w-64">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                 <input 
                   type="text"
                   placeholder="Search Client..."
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                   className="w-full h-11 pl-10 pr-4 bg-slate-800 border-slate-700 rounded-xl text-xs font-bold transition-all outline-none"
                 />
               </div>
               <Select value={selectedMachine} onValueChange={setSelectedMachine}>
                <SelectTrigger className="w-full md:w-64 h-11 bg-slate-800 border-slate-700 rounded-xl font-bold text-xs">
                  <SelectValue placeholder="Select Machine" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white max-h-[300px]">
                  {Object.values(MACHINE_DATABASE).map(m => (
                    <SelectItem key={m.id} value={m.id} className="cursor-pointer py-2.5">
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
               </Select>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-10">
          {isLoading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-10 h-10 text-[#F06C22] mx-auto mb-4 animate-spin opacity-50" />
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                Fetching Materialized Rankings...
              </p>
            </div>
          ) : (
            <>
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-[#38BDF8] flex items-center gap-3">
                    <Sparkles className="w-4 h-4 fill-[#38BDF8]/20" />
                    {viewScope === 'global' ? 'Global Network Elite' : 'Studio Performance Hub'}
                  </h2>
                  {leaderboardData && (
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                      Last Sync: {leaderboardData.lastUpdated?.toDate?.()?.toLocaleDateString() || 'Today'}
                    </p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {topThree.length > 0 ? topThree.map((entry, idx) => (
                    <motion.div
                      key={entry.clientId}
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
                        <div className="absolute top-4 right-6 text-4xl font-black italic opacity-10">{idx + 1}</div>
                        <div className="w-20 h-20 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center mb-4 overflow-hidden">
                           <span className="text-2xl font-black text-white italic">{entry.clientName[0]}</span>
                        </div>
                        <h3 className="text-xl font-black uppercase italic text-white tracking-tight mb-1">{entry.clientName}</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">SYNCED RANKING</p>
                        <div className="mt-auto space-y-1">
                          <div className="text-4xl font-black text-white italic tracking-tighter leading-none">
                            {sortBy === 'gain' ? (
                              <>+{entry.strengthGainPercent || 0}<span className="text-[12px] font-bold uppercase text-slate-500 not-italic tracking-widest">%</span></>
                            ) : (
                              <>{entry.maxWeight} <span className="text-[12px] font-bold uppercase text-slate-500 not-italic tracking-widest">LBS</span></>
                            )}
                          </div>
                          <div className="py-2 px-4 bg-[#0A2E46] border border-[#38BDF8]/20 rounded-xl inline-flex items-center gap-3">
                             <span className="text-[10px] font-black uppercase text-[#38BDF8] tracking-widest">G:{entry.gap || 0} • {entry.reps || 0} REPS</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )) : (
                    <div className="col-span-3 py-20 text-center bg-slate-800/20 shadow-inner rounded-[32px]">
                       <Info className="w-10 h-10 text-slate-600 mx-auto mb-4" />
                       <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">No rankings found yet.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                   <div className="flex items-center justify-between">
                     <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 flex items-center gap-3">
                       <BarChart3 className="w-4 h-4 text-[#F06C22]" />
                       Materialized Distribution
                     </h2>
                   </div>
                   <div className="bg-slate-900/50 border border-white/5 rounded-[32px] p-6 shadow-xl">
                     <LeaderboardChart data={machineRankings} sortBy={sortBy} />
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     {others.map((entry, idx) => (
                       <div key={entry.clientId} className="bg-slate-800/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-xs font-black text-slate-500 border border-slate-700">
                              {idx + 4}
                            </div>
                            <p className="text-sm font-black text-white italic uppercase">{entry.clientName}</p>
                         </div>
                         <div className="text-right">
                           <p className="text-lg font-black text-white leading-none">
                             {sortBy === 'gain' ? `+${entry.strengthGainPercent || 0}%` : `${entry.maxWeight} LBS`}
                           </p>
                         </div>
                       </div>
                     ))}
                   </div>
                </div>

                <div className="space-y-6">
                   <Card className="bg-[#0A2E46] border-[#38BDF8]/20 shadow-2xl rounded-[32px]">
                     <CardHeader>
                       <CardTitle className="text-lg font-black uppercase italic text-white flex items-center gap-2">
                         <Target className="w-5 h-5 text-[#F06C22]" />
                         Percentile Thresholds
                       </CardTitle>
                       <CardDescription className="text-slate-400">Static benchmarks for {machineDetails?.name}</CardDescription>
                     </CardHeader>
                     <CardContent className="space-y-6">
                        {leaderboardData?.machineData[selectedMachine]?.percentileThresholds ? (
                          <div className="space-y-4">
                            {Object.entries(leaderboardData.machineData[selectedMachine].percentileThresholds)
                              .sort((a, b) => parseInt(b[0].slice(1)) - parseInt(a[0].slice(1)))
                              .map(([key, val]) => (
                                <div key={key} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-white/5">
                                  <span className="text-[10px] font-black uppercase text-slate-500">{key.toUpperCase()} Rank</span>
                                  <span className="text-sm font-black text-[#38BDF8] italic">{val} LBS</span>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic text-center py-4">Thresholds not yet synced.</p>
                        )}
                     </CardContent>
                   </Card>
                   <div className="bg-gradient-to-br from-[#115E8D] to-[#0A2E46] p-8 rounded-[32px] border border-[#38BDF8]/30 shadow-xl overflow-hidden group">
                     <h3 className="text-lg font-black uppercase italic text-white mb-2 relative z-10">Cross-Network Data</h3>
                     <p className="text-xs text-[#38BDF8] font-bold leading-relaxed relative z-10">
                        Materialized views allow for instant network-wide comparisons without the latency or cost of multi-collection aggregations.
                     </p>
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
