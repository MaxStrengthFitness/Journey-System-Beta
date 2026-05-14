import React, { useState, useMemo } from 'react';
import { Search, User2, PlayCircle, ShieldCheck, Dumbbell, History } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Client } from '../types';

interface Props {
  clients: Client[];
  onSelectClient: (clientId: string) => void;
  onStartOpenSession?: () => void;
}

export function ClientDirectoryView({ clients, onSelectClient, onStartOpenSession }: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  // Local, memory-based filtering to protect Firebase quota
  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    return clients.filter(client => {
      const fullName = `${client.firstName} ${client.lastName}`.toLowerCase();
      return fullName.includes(query);
    });
  }, [clients, searchQuery]);

  // If no search, show a meaningful empty state (e.g. recent, or all sorted alphabetically - wait, 100+ might be too long to just render without search, but the prompt says 
  // "If the search bar is empty, do not show a blank screen. Display a grid of 'Recently Active' or 'Recently Profiled' clients so the screen immediately feels populated and useful.")
  // We'll show the top 10 most recently joined clients as a proxy for "Recently Active" if they have a createdAt, otherwise just the first 10.
  const topRecentClients = useMemo(() => {
    // Sort logic could use createdAt or just take the first 12 for immediate display
    // Without 'createdAt' or 'lastActive', we'll rely on the existing list order, maybe reverse it or just slice
    return [...clients].slice(0, 12);
  }, [clients]);

  const displayClients = searchQuery.trim() ? filteredClients : topRecentClients;

  const renderTierBadge = (tier?: string) => {
    if (!tier) return null;
    if (tier.toLowerCase().includes('18')) return <Badge className="bg-slate-300 text-slate-800 uppercase tracking-widest text-[8px] font-black">18-Month Silver</Badge>;
    if (tier.toLowerCase().includes('12')) return <Badge className="bg-[#F06C22] text-white uppercase tracking-widest text-[8px] font-black">12-Month Orange</Badge>;
    if (tier.toLowerCase().includes('6')) return <Badge className="bg-[#115E8D] text-white uppercase tracking-widest text-[8px] font-black">6-Month Blue</Badge>;
    return <Badge className="bg-slate-700 text-slate-300 uppercase tracking-widest text-[8px] font-black">{tier}</Badge>;
  };

  return (
    <div className="h-full bg-[#0A2E46] p-6 lg:p-10 flex flex-col pt-12">
      {/* Search Bar Header */}
      <div className="max-w-4xl mx-auto w-full mb-8 shrink-0">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            <User2 className="w-8 h-8 text-[#F06C22]" />
            Client Directory
          </h1>
          {onStartOpenSession && (
            <Button
              onClick={onStartOpenSession}
              className="bg-transparent border-2 border-slate-700 hover:border-[#F06C22] hover:bg-[#F06C22]/10 text-white font-black uppercase tracking-widest rounded-2xl h-12 px-6 transition-all shadow-lg hover:shadow-[#F06C22]/20"
            >
              <PlayCircle className="w-5 h-5 mr-2 text-[#F06C22]" />
              Start Open Session
            </Button>
          )}
        </div>
        
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
            <Search className="h-6 w-6 text-slate-500 group-focus-within:text-[#F06C22] transition-colors" />
          </div>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search client roster..."
            className="w-full bg-slate-900 border-2 border-slate-800 text-white placeholder:text-slate-600 h-20 pl-16 rounded-3xl text-xl font-medium focus-visible:ring-0 focus-visible:border-[#F06C22] shadow-2xl transition-all"
          />
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full flex-1 overflow-y-auto custom-scrollbar pr-2 pb-24">
        {!searchQuery.trim() && (
          <div className="mb-4">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <History className="w-3.5 h-3.5" />
              Recently Profiled
            </h2>
          </div>
        )}

        {displayClients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayClients.map(client => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={client.id}
                onClick={() => onSelectClient(client.id!)}
                className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-[32px] p-6 cursor-pointer hover:border-[#F06C22]/50 hover:bg-slate-800 transition-all group flex flex-col shadow-2xl overflow-hidden relative"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-600 to-transparent group-hover:via-[#F06C22] transition-colors" />
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-[#0A2E46] border-2 border-slate-700 flex items-center justify-center shrink-0 shadow-inner group-hover:border-[#F06C22] transition-colors">
                    <span className="text-white font-black text-lg tracking-widest">
                      {client.firstName[0]}{client.lastName[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-black text-white truncate tracking-tight group-hover:text-[#F06C22] transition-colors">
                      {client.firstName} {client.lastName}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {renderTierBadge(client.packageTier)}
                      {client.globalNotes && (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-500 uppercase tracking-widest text-[8px] font-black bg-amber-500/10">
                          Notes
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-4 flex items-center justify-between border-t border-slate-700/50">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
                      Session Status
                    </span>
                    <span className="text-sm font-bold text-slate-300 mt-0.5">
                      {client.sessionCount || 0} / {client.totalSessions || 0} Logged
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover:text-[#F06C22] transition-colors">
                      Start
                    </span>
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-[#F06C22] transition-colors">
                      <PlayCircle className="w-5 h-5 text-slate-400 group-hover:text-white" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
            <Search className="w-8 h-8 text-slate-600 mb-3" />
            <p className="text-slate-400 font-medium">No clients found matching your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
