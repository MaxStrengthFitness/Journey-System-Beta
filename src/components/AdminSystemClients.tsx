import React, { useState, useMemo, useEffect } from "react";
import { Search, Building2, User, Filter, Users as UsersIcon } from "lucide-react";
import { Client, Studio } from "../types";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { db } from "../firebase";
import { collection, query, getDocs, limit, where, getCountFromServer } from "firebase/firestore";

interface Props {
  // clients prop usually only contains active/live schedule clients. 
  // We'll keep it for fallback but dynamically fetch from firestore.
  clients: Client[];
  studios: Studio[];
}

export function AdminSystemClients({ clients: propClients, studios }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudioId, setSelectedStudioId] = useState<string>("all");
  const [totalClientsCount, setTotalClientsCount] = useState<number | null>(null);
  
  const [dbClients, setDbClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch total count once
  useEffect(() => {
    async function fetchCount() {
      try {
        const coll = collection(db, "clients");
        const snapshot = await getCountFromServer(coll);
        setTotalClientsCount(snapshot.data().count);
      } catch (err) {
        console.error("Failed to fetch total clients count:", err);
      }
    }
    fetchCount();
  }, []);

  // Fetch clients based on search & filter
  useEffect(() => {
    async function fetchClients() {
      setIsLoading(true);
      try {
        const clientsRef = collection(db, "clients");
        // If not searching, fetch 50 recent/arbitrary clients for the studio or overall
        let constraints: any[] = [];
        
        if (selectedStudioId !== "all") {
          constraints.push(where("homeStudioId", "==", selectedStudioId));
        }

        const term = searchTerm.trim().toLowerCase();
        
        if (term) {
             const alphaOnly = term.replace(/[^a-z]/g, "");
             const prefixLen = alphaOnly.length > 3 ? 3 : alphaOnly.length;
             const prefix = alphaOnly.slice(0, prefixLen);
             const prefixCapitalized = prefix.charAt(0).toUpperCase() + prefix.slice(1);
             
             if (prefixCapitalized) {
               // Due to firestore limitations, we do multiple queries or fetch and filter.
               // For simplicity, we'll fetch using the first name prefix
               constraints.push(where("firstName", ">=", prefixCapitalized));
               constraints.push(where("firstName", "<=", prefixCapitalized + "\uf8ff"));
             }
        }

        constraints.push(limit(100)); // limit to 100 to prevent enormous reads

        const q = query(clientsRef, ...constraints);
        const snap = await getDocs(q);
        
        const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
        
        // Custom javascript re-filter to ensure accuracy if multiple conditions were hard to query
        const filtered = results.filter(client => {
           let matches = true;
           if (term) {
             const clientName = `${client.firstName || ''} ${client.lastName || ''}`.toLowerCase();
             matches = clientName.includes(term) || !!client.mindbodyId?.toLowerCase().includes(term);
           }
           if (selectedStudioId !== "all") {
             matches = matches && client.homeStudioId === selectedStudioId;
           }
           return matches;
        });

        setDbClients(filtered);
      } catch (error) {
        console.error("Error fetching admin clients:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    // Simple debounce
    const timeout = setTimeout(fetchClients, 500);
    return () => clearTimeout(timeout);
  }, [searchTerm, selectedStudioId]);

  return (
    <div className="space-y-6">
      {/* Total Count Display */}
      {totalClientsCount !== null && (
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/20 p-4 rounded-2xl shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
            <UsersIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white leading-tight">
              {totalClientsCount.toLocaleString()}
            </h2>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Total Journey System Clients
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Search by client name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 h-12 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl font-bold w-full"
          />
        </div>

        {/* Studio Filter */}
        <div className="w-full md:w-64">
          <Select value={selectedStudioId} onValueChange={setSelectedStudioId}>
            <SelectTrigger className="h-12 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl font-bold w-full">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Filter className="w-4 h-4" />
                <SelectValue placeholder="Filter by Studio" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-bold">All Studios</SelectItem>
              {studios.map(s => (
                <SelectItem key={s.id} value={s.id!} className="font-bold">{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-0 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Client Name</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">MindBody ID</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Primary Studio</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {dbClients.map(client => {
                const studio = studios.find(s => s.id === client.homeStudioId);
                return (
                  <tr key={client.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-slate-500" />
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white truncate max-w-[150px] md:max-w-none">{`${client.firstName} ${client.lastName}`}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-mono text-[13px] font-bold text-slate-600 dark:text-slate-300">
                      {client.mindbodyId || "—"}
                    </td>
                    <td className="py-4 px-6">
                      {studio ? (
                        <Badge variant="outline" className="font-bold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 whitespace-nowrap">
                          <Building2 className="w-3 h-3 mr-1.5 shrink-0" />
                          <span className="truncate max-w-[120px] md:max-w-none">{studio.name}</span>
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400 italic font-medium whitespace-nowrap">Unassigned</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-black uppercase text-[10px] tracking-widest whitespace-nowrap">
                        Active
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {dbClients.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={4} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <Search className="w-8 h-8 mb-3 opacity-20" />
                      <span className="font-bold">No clients found matching criteria.</span>
                    </div>
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-500 font-bold">
                    <div className="flex items-center justify-center gap-3 text-sm">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      Searching system records...
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
