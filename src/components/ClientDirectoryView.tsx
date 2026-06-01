import React, { useState, useEffect } from 'react';
import { Search, User2, PlayCircle, History, Loader2, MapPin, MoreVertical, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useActiveStudio } from '../ActiveStudioContext';
import { collection, getDocs, query, where, orderBy, limit, QueryConstraint, Query } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, Trainer } from '../types';

interface Props {
  onSelectClient: (clientId: string) => void;
  onStartOpenSession?: () => void;
  authTrainer?: Trainer | null;
}

export function ClientDirectoryView({ onSelectClient, onStartOpenSession, authTrainer }: Props) {
  const { availableStudios, activeStudioId } = useActiveStudio();
  const [searchQuery, setSearchQuery] = useState('');
  const [isGlobalSearch, setIsGlobalSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    const fetchClients = async () => {
      setIsLoading(true);
      try {
        let q: Query;
        const clientsRef = collection(db, 'clients');
        
        // Allowed studios is defined as the home studio PLUS all accessible studios
        const allowedStudioIds = [
          authTrainer?.primaryHomeStudioId,
          ...(authTrainer?.accessibleStudioIds || [])
        ].filter(Boolean) as string[];

        if (activeStudioId && !allowedStudioIds.includes(activeStudioId)) {
          allowedStudioIds.push(activeStudioId);
        }

        if (!searchQuery.trim()) {
          // Empty search: 'Recently Profiled' lists
          const queries: QueryConstraint[] = [];
          
          if (!isGlobalSearch && allowedStudioIds.length > 0) {
            if (allowedStudioIds.length === 1) {
              queries.push(where('homeStudioId', '==', allowedStudioIds[0]));
            } else {
              queries.push(where('homeStudioId', 'in', allowedStudioIds.slice(0, 10)));
            }
          }
          
          q = query(
            clientsRef,
            ...queries,
            orderBy('createdAt', 'desc'),
            limit(16)
          );
        } else {
          // We have a search terms constraints.
          // Prefix queries are index-safe, and we filter by Studio client-side to prevent Composite Index requirement crashes.
          const term = searchQuery.toLowerCase();
          const termCapitalized = term.charAt(0).toUpperCase() + term.slice(1);
          
          q = query(
            clientsRef,
            where('lastName', '>=', termCapitalized),
            where('lastName', '<=', termCapitalized + '\uf8ff'),
            limit(100)
          );
        }

        const snap = await getDocs(q);
        let fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
        
        // If results not found on lastName query, try firstName first
        if (searchQuery.trim() && fetched.length === 0) {
          const termCapitalized = searchQuery.trim().charAt(0).toUpperCase() + searchQuery.trim().slice(1);
          const q2 = query(
            clientsRef,
            where('firstName', '>=', termCapitalized),
            where('firstName', '<=', termCapitalized + '\uf8ff'),
            limit(100)
          );
          const snap2 = await getDocs(q2);
          fetched = snap2.docs.map(d => ({ id: d.id, ...d.data() } as Client));
        }

        // Apply Cross-Studio or Home Studio Territory Filtering client-side if isGlobalSearch is turned off
        if (searchQuery.trim() && !isGlobalSearch && allowedStudioIds.length > 0) {
          fetched = fetched.filter(c => c.homeStudioId && allowedStudioIds.includes(c.homeStudioId));
        }

        setSearchResults(fetched);
      } catch (error) {
        console.error("Error fetching clients:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    const delayDebounceFn = setTimeout(() => {
      fetchClients();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, isGlobalSearch, activeStudioId, authTrainer]);

  const displayClients = searchResults;

  const renderTierBadge = (tier?: string) => {
    if (!tier || tier === "None") return <span className="text-sm text-slate-500">None</span>;
    if (tier.toLowerCase().includes('18')) return <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 uppercase tracking-widest text-[10px] font-bold px-2 py-0.5">Silver</Badge>;
    if (tier.toLowerCase().includes('12')) return <Badge className="bg-[#F06C22]/10 text-[#d95d1a] dark:text-[#F06C22] border-[#F06C22]/20 uppercase tracking-widest text-[10px] font-bold px-2 py-0.5">Orange</Badge>;
    if (tier.toLowerCase().includes('6')) return <Badge className="bg-[#115E8D]/10 text-[#115E8D] dark:text-[#38BDF8] border-[#115E8D]/20 dark:border-[#38BDF8]/20 uppercase tracking-widest text-[10px] font-bold px-2 py-0.5">Blue</Badge>;
    return <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 uppercase tracking-widest text-[10px] font-bold px-2 py-0.5">{tier}</Badge>;
  };

  return (
    <div className="h-full bg-slate-50 dark:bg-slate-950 p-6 lg:p-10 flex flex-col pt-12 transition-colors duration-200 overflow-hidden">
      <div className="max-w-7xl mx-auto w-full mb-6 shrink-0 flex items-center justify-between">
        <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
          <User2 className="w-8 h-8 text-[#F06C22]" />
          Client Directory
        </h1>
      </div>

      <div className="max-w-7xl mx-auto w-full mb-8 shrink-0">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative group flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400 dark:text-slate-500 group-focus-within:text-[#F06C22] transition-colors" />
            </div>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clients..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 h-12 pl-12 rounded-xl text-base font-medium focus-visible:ring-2 focus-visible:ring-[#F06C22]/20 focus-visible:border-[#F06C22] shadow-sm transition-all"
            />
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {onStartOpenSession && (
              <Button
                onClick={onStartOpenSession}
                className="bg-[#F06C22] hover:bg-[#d95d1a] text-white font-bold uppercase tracking-widest rounded-xl h-12 px-6 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Client
              </Button>
            )}
          </div>
        </div>
        
        {authTrainer?.primaryHomeStudioId && (
          <div className="flex items-center gap-3 mt-4 px-2">
            <button
              onClick={() => setIsGlobalSearch(!isGlobalSearch)}
              className={`w-10 h-5 rounded-full transition-colors relative ${isGlobalSearch ? 'bg-[#F06C22]' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${isGlobalSearch ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase">
              Search Entire Corporate Network
            </span>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto w-full flex-1 overflow-y-auto custom-scrollbar pr-2 pb-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Loader2 className="w-8 h-8 text-[#F06C22] animate-spin mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium tracking-widest uppercase text-xs">Accessing registries...</p>
          </div>
        ) : displayClients.length > 0 ? (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20">
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">Client</th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">Membership</th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">Sessions</th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">Last Session</th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">Next Session</th>
                  <th className="py-4 px-6 text-right text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {displayClients.map((client) => {
                  const isCrossTrainer = activeStudioId && client.homeStudioId && client.homeStudioId !== activeStudioId;
                  const originalStudioName = availableStudios?.find(s => s.id === client.homeStudioId)?.name || 'HQ Network';
                  const nextSessionDate = (client as any).nextSessionDate;

                  return (
                    <tr 
                      key={client.id} 
                      className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                      onClick={() => onSelectClient(client.id!)}
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#0A2E46] border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-sm dark:shadow-inner group-hover:border-[#F06C22] transition-colors">
                            <span className="text-slate-900 dark:text-white font-black text-sm tracking-widest uppercase">
                              {client.firstName?.[0]}{client.lastName?.[0]}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[#F06C22] transition-colors">
                              {client.firstName} {client.lastName}
                            </span>
                            {isCrossTrainer ? (
                              <span className="text-[10px] font-bold text-[#F06C22] uppercase tracking-widest flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" />
                                Visiting: {originalStudioName}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" />
                                {originalStudioName}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 align-middle">
                        {renderTierBadge(client.packageTier)}
                      </td>
                      <td className="py-4 px-6 align-middle">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {client.sessionCount || 0}
                        </span>
                      </td>
                      <td className="py-4 px-6 align-middle">
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {(client as any).lastSessionDate || 'N/A'}
                        </span>
                      </td>
                      <td className="py-4 px-6 align-middle">
                        {nextSessionDate ? (
                          <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                            {nextSessionDate}
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 dark:text-amber-500 border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5">
                            Unscheduled
                          </Badge>
                        )}
                      </td>
                      <td className="py-4 px-6 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                            {onStartOpenSession && (
                              <DropdownMenuItem className="cursor-pointer font-medium text-slate-700 dark:text-slate-300 focus:bg-slate-100 dark:focus:bg-slate-800" onClick={() => onStartOpenSession()}>
                                <PlayCircle className="w-4 h-4 mr-2 text-slate-400" />
                                Start Session
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="cursor-pointer font-medium text-slate-700 dark:text-slate-300 focus:bg-slate-100 dark:focus:bg-slate-800" onClick={() => onSelectClient(client.id!)}>
                              <User2 className="w-4 h-4 mr-2 text-slate-400" />
                              View Profile
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Search className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium tracking-tight">No clients found matching your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
