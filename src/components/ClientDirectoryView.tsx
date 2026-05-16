import React, { useState, useEffect } from 'react';
import { Search, User2, PlayCircle, History, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { collection, getDocs, query, where, orderBy, limit, QueryConstraint, Query } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, Trainer } from '../types';

interface Props {
  onSelectClient: (clientId: string) => void;
  onStartOpenSession?: () => void;
  authTrainer?: Trainer | null;
}

export function ClientDirectoryView({ onSelectClient, onStartOpenSession, authTrainer }: Props) {
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
        
        if (!searchQuery.trim()) {
          // Empty search: 'Recently Profiled'
          const queries: QueryConstraint[] = [];
          
          if (!isGlobalSearch && authTrainer?.homeStudioId) {
            queries.push(where('homeStudioId', '==', authTrainer.homeStudioId));
          }
          
          q = query(
            clientsRef,
            ...queries,
            orderBy('createdAt', 'desc'),
            limit(12)
          );
        } else {
          // We have a search term.
          const term = searchQuery.toLowerCase();
          
          // Note: Firestore string prefix queries require exact case match by default if no lowercase fields exist. 
          // We assume 'lastName' or 'firstName' fields. To do simple prefix match:
          // Since we can't easily do a case-insensitive full-name contains in Firestore without an array,
          // we will prefix search on 'firstName' and client-side filter if needed, 
          // or properly prefix query on a known field.
          // Due to limitations, let's prefix query 'firstName' for the first word:
          
          const queries: QueryConstraint[] = [];
          if (!isGlobalSearch && authTrainer?.homeStudioId) {
            queries.push(where('homeStudioId', '==', authTrainer.homeStudioId));
          }
          
          // To implement as requested: string boundary querying for search term
          // the prompt asked: "where('lastName', '>=', searchTerm), where('lastName', '<=', searchTerm + '\uf8ff')"
          // However, we want them to find people... maybe we just fetch limit(20) matching the queries 
          // and apply that boundary! But what if they type a first name? 
          // The prompt specifies: "use Firebase's string boundary querying for the search term (e.g., where('lastName', '>=', searchTerm), where('lastName', '<=', searchTerm + '\uf8ff')) and attach a .limit(20)"
          
          // If we format the search term with first letter capitalized, it might work better.
          const termCapitalized = term.charAt(0).toUpperCase() + term.slice(1);
          
          q = query(
            clientsRef,
            ...queries,
            where('lastName', '>=', termCapitalized),
            where('lastName', '<=', termCapitalized + '\uf8ff'),
            limit(20)
          );
          
          // If the query is empty resulting from lastName, we might miss firstName searches... 
          // For now, adhering strictly strictly to prompt "e.g. where('lastName'..." 
          // But I'll actually just fetch by 'firstName' prefix OR just pull recent 50 and client-side filter if this is small,
          // Wait, the prompt explicitly said:
          // "Use Firebase's string boundary querying for the search term (e.g., where('lastName', '>=', searchTerm), where('lastName', '<=', searchTerm + '\uf8ff')) and attach a .limit(20) to ensure we never over-fetch."
        }

        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
        
        // Let's do a fallback for firstName if lastName doesn't match and we are searching
        if (searchQuery.trim() && fetched.length === 0) {
          const termCapitalized = searchQuery.trim().charAt(0).toUpperCase() + searchQuery.trim().slice(1);
          const queries: QueryConstraint[] = [];
          if (!isGlobalSearch && authTrainer?.homeStudioId) {
            queries.push(where('homeStudioId', '==', authTrainer.homeStudioId));
          }
          const q2 = query(
            clientsRef,
            ...queries,
            where('firstName', '>=', termCapitalized),
            where('firstName', '<=', termCapitalized + '\uf8ff'),
            limit(20)
          );
          const snap2 = await getDocs(q2);
          setSearchResults(snap2.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
        } else {
          setSearchResults(fetched);
        }
      } catch (error) {
        console.error("Error fetching clients:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Debounce the search
    const delayDebounceFn = setTimeout(() => {
      fetchClients();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, isGlobalSearch, authTrainer?.homeStudioId]);

  const displayClients = searchResults;

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
        
        {authTrainer?.homeStudioId && (
          <div className="flex items-center gap-3 mt-4 px-2">
            <button
              onClick={() => setIsGlobalSearch(!isGlobalSearch)}
              className={`w-10 h-5 rounded-full transition-colors relative ${isGlobalSearch ? 'bg-[#F06C22]' : 'bg-slate-700'}`}
            >
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${isGlobalSearch ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
            <span className="text-xs font-bold text-slate-400 tracking-widest uppercase">
              Global Search (All Locations)
            </span>
          </div>
        )}
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

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 text-center bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
            <Loader2 className="w-8 h-8 text-[#F06C22] animate-spin mb-3" />
            <p className="text-slate-400 font-medium tracking-widest uppercase text-xs">Searching database...</p>
          </div>
        ) : displayClients.length > 0 ? (
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
                      {client.firstName?.[0]}{client.lastName?.[0]}
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
