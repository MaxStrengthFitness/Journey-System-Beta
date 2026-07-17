import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { WorkoutSession, Studio } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Network, MapPin, Activity, CalendarDays, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AdminMetricsDashboard({ 
  onManageStudios,
  clients = [],
  networks = []
}: { 
  onManageStudios?: () => void;
  clients?: any[];
  networks?: any[];
}) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date range state
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    // 1. Fetch Studios
    const fetchStudios = async () => {
      try {
        const studiosSnap = await getDocs(collection(db, 'studios'));
        const studiosData = studiosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Studio));
        setStudios(studiosData);
      } catch (err) {
        console.error("Error fetching studios", err);
      }
    };
    fetchStudios();
  }, []);

  useEffect(() => {
    // 2. Fetch Sessions uses getDocs with date range to save reads
    const fetchSessions = async () => {
      setLoading(true);
      try {
        // Calculate the first and last day of the currently selected month
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
        
        const q = query(
          collection(db, 'sessions'),
          where('createdAt', '>=', Timestamp.fromDate(startOfMonth)),
          where('createdAt', '<=', Timestamp.fromDate(endOfMonth))
        );
        
        const snapshot = await getDocs(q);
        const sessionsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutSession));
        
        // Remove getDocs(collection(db, 'clients')) completely.
        // The statistical routing ID is strictly based on the denormalized clientHomeStudioId.
        const creditedSessions = sessionsData.map(session => ({
          ...session,
          statisticalStudioId: session.clientHomeStudioId || session.hostedAtStudioId
        }));

        setSessions(creditedSessions as any);
      } catch (err) {
        console.error("Error processing sessions", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSessions();
  }, [currentDate]);

  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };


  // Aggregate Data
  const totalNetworkSessions = sessions.length;
  const crossTrainSessions = sessions.filter(s => s.isCrossTrain).length;

  const studioStats = studios.map(studio => {
    // Filter sessions using the STRICT statistical routing ID derived above
    const creditedSessions = sessions.filter((s: any) => s.statisticalStudioId === studio.id);
    const physicallyHostedSessions = sessions.filter(s => s.hostedAtStudioId === studio.id);
    
    const activeClients = clients.filter(c => c.homeStudioId === studio.id && c.status !== 'churned');
    
    return {
      ...studio,
      creditedCount: creditedSessions.length,
      hostedCount: physicallyHostedSessions.length,
      hostedCrossTrains: physicallyHostedSessions.filter(s => s.isCrossTrain).length,
      activeClientCount: activeClients.length
    };
  });

  const networksWithStudios = networks.map(nw => ({
    ...nw,
    studios: studioStats.filter(s => s.networkId === nw.id || (s.networkId === undefined && studios.length === 1)) // Catch unassigned if singular
  })).concat(studioStats.some(s => !s.networkId) ? [{ id: 'unassigned', name: 'Independent Studios', studios: studioStats.filter(s => !s.networkId) }] : []);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 animate-fade-in text-slate-900 dark:text-slate-100">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-lg">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black uppercase text-slate-900 dark:text-white tracking-tight italic">
              Admin Dashboard
            </h1>
            <p className="text-xs font-bold uppercase tracking-widest text-[#F06C22]">
              Corporate Command Center & Demographic Intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start md:self-center">
          {onManageStudios && (
            <Button 
              onClick={onManageStudios}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-950/50 font-bold uppercase tracking-widest text-[11px] h-10 px-4 shadow-sm"
            >
              <Settings className="w-4 h-4 mr-2" />
              Manage Studios
            </Button>
          )}
          
          <div className="flex items-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-1">
            <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-855 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-xl outline-none">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="px-3 py-1 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 w-[110px] text-center">
                {currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            </div>
            <button onClick={handleNextMonth} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-855 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-xl outline-none">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="bg-slate-900 dark:bg-slate-950 text-white rounded-[32px] border border-slate-800 shadow-sm p-6 overflow-hidden relative">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-[11px] font-bold tracking-widest text-slate-400 uppercase leading-none">Total Network Sessions</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-2 flex items-baseline">
            <div className="text-5xl font-black tracking-tighter italic">{loading ? '-' : totalNetworkSessions}</div>
          </CardContent>
        </Card>

        <Card className="bg-indigo-650 dark:bg-indigo-950 text-white rounded-[32px] border border-indigo-500/20 shadow-sm p-6 overflow-hidden relative">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-[11px] font-bold tracking-widest text-indigo-200 uppercase flex items-center gap-2 leading-none">
              <Activity className="w-4 h-4 text-indigo-300" /> 
              Total Cross-Trains
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            <div className="text-5xl font-black tracking-tighter italic">{loading ? '-' : crossTrainSessions}</div>
            <p className="text-indigo-200 dark:text-indigo-400 text-[11px] mt-2 font-semibold uppercase tracking-wider">Sessions completed outside client home studio</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-12 space-y-12">
        {networksWithStudios.filter(nw => nw.studios && nw.studios.length > 0).map((network) => (
          <div key={network.id}>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white mb-6 flex items-center gap-2 italic">
              <Network className="w-5 h-5 text-[#F06C22]" /> 
              {network.name} Network
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {network.studios.map((stat: any, i: number) => (
                <Card key={i} className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden p-6 pt-8">
                  <div className="h-1.5 w-full bg-[#F06C22] absolute top-0 left-0" />
                  <CardHeader className="p-0 pb-4">
                    <CardTitle className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white italic">
                      {stat.name}
                    </CardTitle>
                    <CardDescription className="text-[11px] font-bold uppercase tracking-widest text-emerald-500 leading-none mt-1">
                      Strict Demographic Adherence
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-4 flex justify-between items-center border border-slate-100 dark:border-slate-850">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-relaxed">Active Clients<br/>(Enrolled System)</span>
                      <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 italic">{loading ? '-' : stat.activeClientCount}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-4 flex justify-between items-center border border-slate-100 dark:border-slate-850">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-relaxed">Credited Sessions<br/>(Home base)</span>
                      <span className="text-2xl font-black text-slate-900 dark:text-white italic">{loading ? '-' : stat.creditedCount}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-4 flex justify-between items-center border border-slate-100 dark:border-slate-850">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-relaxed">Total Foot Traffic<br/>(Physical Hosted)</span>
                      <span className="text-xl font-black text-slate-700 dark:text-slate-300 italic">{loading ? '-' : stat.hostedCount}</span>
                    </div>
                    {stat.hostedCrossTrains > 0 && (
                      <div className="flex justify-between items-center px-1 pt-1">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Included Cross-Trains</span>
                        <span className="text-xs font-black text-indigo-500 dark:text-indigo-400 font-mono">+{stat.hostedCrossTrains}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
        {networksWithStudios.length === 0 && !loading && (
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl text-center col-span-3">No physical studios configured.</div>
        )}
      </div>
    </div>
  );
}
