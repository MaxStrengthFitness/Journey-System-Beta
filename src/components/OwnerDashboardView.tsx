import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { WorkoutSession, Studio } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Network, MapPin, Activity, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

export function OwnerDashboardView() {
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
          statisticalStudioId: session.clientHomeStudioId || session.studioId
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
    const physicallyHostedSessions = sessions.filter(s => s.studioId === studio.id);
    
    return {
      ...studio,
      creditedCount: creditedSessions.length,
      hostedCount: physicallyHostedSessions.length,
      hostedCrossTrains: physicallyHostedSessions.filter(s => s.isCrossTrain).length
    };
  });

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-lg">
          <Network className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-black uppercase text-slate-800 tracking-tight">Owner Dashboard</h1>
          <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Enterprise Network Overview</p>
        </div>
        
        <div className="ml-auto flex items-center bg-white rounded-2xl border border-slate-200 shadow-sm p-1">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors rounded-xl outline-none">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="px-4 py-2 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-bold uppercase tracking-widest text-slate-700 w-[120px] text-center">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          </div>
          <button onClick={handleNextMonth} className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors rounded-xl outline-none">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-slate-900 text-white rounded-3xl border-slate-800 shadow-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold tracking-widest text-slate-400 uppercase">Total Network Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-black tracking-tighter">{loading ? '-' : totalNetworkSessions}</div>
          </CardContent>
        </Card>

        <Card className="bg-indigo-600 text-white rounded-3xl border-indigo-500 shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold tracking-widest text-indigo-200 uppercase flex items-center gap-2">
              <Activity className="w-4 h-4" /> 
              Total Cross-Trains
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-black tracking-tighter">{loading ? '-' : crossTrainSessions}</div>
            <p className="text-indigo-200 text-xs mt-2 font-medium">Sessions completed outside home studio</p>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-black uppercase tracking-tight text-slate-800 mt-10 mb-4 flex items-center gap-2">
        <MapPin className="w-5 h-5 text-[#F06C22]" /> 
        Studio Statistical Breakdown
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {studioStats.map((stat, i) => (
          <Card key={i} className="rounded-3xl border-slate-200 shadow-lg relative overflow-hidden">
            <div className="h-1.5 w-full bg-[#F06C22] absolute top-0 left-0" />
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-black uppercase tracking-tight text-slate-800">
                {stat.name}
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-[#10B981]">
                Strict Adherence
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center border border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Credited Sessions<br/>(Home Clients)</span>
                <span className="text-2xl font-black text-slate-800">{loading ? '-' : stat.creditedCount}</span>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center border border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Hosted<br/>(Physical Foot-Traffic)</span>
                <span className="text-xl font-black text-slate-600">{loading ? '-' : stat.hostedCount}</span>
              </div>
              {stat.hostedCrossTrains > 0 && (
                <div className="flex justify-between items-center px-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Included Cross-Trains</span>
                  <span className="text-xs font-black text-indigo-500">+{stat.hostedCrossTrains}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {studioStats.length === 0 && !loading && (
          <div className="text-sm font-medium text-slate-500 p-4">No studios configured.</div>
        )}
      </div>

      {/* Cross-Train Visual Snippet Demonstration */}
      <div className="mt-12 p-6 bg-slate-50 border border-slate-200 rounded-3xl">
         <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Phase 2: UI Badge Demonstration</h3>
         <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm max-w-sm flex items-center justify-between">
            <div>
              <p className="font-black text-slate-800">Session #42</p>
              <p className="text-xs text-slate-500 font-medium tracking-wide">Oct 12, 2026</p>
            </div>
            
            {/* THIS IS THE CROSS-TRAIN BADGE */}
            <div className="bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
                <Network className="w-3 h-3 text-indigo-500" />
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600">Cross-Train</span>
            </div>
         </div>
      </div>
    </div>
  );
}
