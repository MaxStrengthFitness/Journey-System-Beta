import React from 'react';
import { 
  UserCircle, 
  Calendar, 
  History, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  TrendingDown,
  Dumbbell,
  Star,
  ShieldCheck,
  Award,
  MapPin,
  Building2,
  Briefcase
} from 'lucide-react';
import { motion } from 'motion/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScheduleEntry, WorkoutSession, Client, Trainer, Studio } from '../types';
import { parseSessionDate } from '../lib/utils';

interface TrainerProfileViewProps {
  trainer: Trainer;
  schedules: ScheduleEntry[];
  sessions: WorkoutSession[];
  clients: Client[];
  studios: Studio[];
  onSelectClient: (clientId: string) => void;
  setView: (view: any) => void;
}

export function TrainerProfileView({ 
  trainer, 
  schedules, 
  sessions, 
  clients, 
  studios,
  onSelectClient, 
  setView 
}: TrainerProfileViewProps) {
  const now = new Date();

  // Filter schedules for this trainer
  const upcomingSchedules = schedules.filter(s => {
    const sDate = s.startTime.toDate();
    const isTrainerMatch = s.trainerId === trainer.id || 
                          (s.trainerName && s.trainerName.toLowerCase().includes(trainer.fullName.toLowerCase()));
    return isTrainerMatch && sDate >= now && s.status !== 'Cancelled' && s.status !== 'Completed';
  }).sort((a, b) => a.startTime.toDate().getTime() - b.startTime.toDate().getTime());

  // Filter completed sessions for this trainer
  const recentSessions = sessions.filter(s => 
    s.trainerInitials === trainer.initials && s.status === 'Completed'
  ).sort((a, b) => parseSessionDate(b.date) - parseSessionDate(a.date));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="max-w-[1400px] mx-auto space-y-8 pb-20 p-6 bg-[#0A2E46] min-h-[calc(100vh-100px)] rounded-[40px] shadow-2xl relative overflow-hidden"
    >
      <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
        <Dumbbell className="w-96 h-96 text-white" />
      </div>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-700/50 pb-6 relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-[32px] bg-slate-800 flex items-center justify-center text-[#38BDF8] border-2 border-slate-700 shadow-xl shadow-black/20">
            <UserCircle className="w-12 h-12" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#38BDF8] italic leading-none">Tactical Command Center</p>
            <h2 className="text-4xl font-black tracking-tighter uppercase italic text-white">{trainer.fullName}</h2>
            <div className="flex items-center gap-3 mt-1">
              <Badge variant="outline" className="rounded-md border-slate-700 text-slate-300 bg-slate-800 font-black uppercase text-[9px] h-5">
                {trainer.initials}
              </Badge>
              {trainer.role === 'Owner' && (
                 <Badge className="rounded-md bg-amber-500 hover:bg-amber-600 text-white font-black uppercase text-[9px] h-5 shadow-[0_0_10px_rgba(245,158,11,0.5)] border-none">
                  Owner
                </Badge>
              )}
              {trainer.fullName === 'Austin Jurgens' && (
                 <Badge className="rounded-md bg-sky-500 hover:bg-sky-600 text-white font-black uppercase text-[9px] h-5 shadow-[0_0_10px_rgba(56,189,248,0.5)] border-none">
                  Admin
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <Button 
            variant="outline" 
            onClick={() => setView('calendar')}
            className="h-14 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-xs border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-[#38BDF8] hover:text-white hover:border-[#38BDF8] transition-all shadow-xl shadow-black/20"
          >
            Studio Calendar
            <Calendar className="w-4 h-4 ml-3 opacity-60" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-10 relative z-10">
        {/* Professional Intelligence Section (New Details) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-2xl font-black uppercase italic text-white tracking-tighter">Professional Dossier</h3>
              <p className="text-[#38BDF8] text-[10px] font-black uppercase tracking-widest">Authorized expertise & qualifications</p>
            </div>

            <Card className="rounded-[40px] bg-slate-900/50 border-slate-700 shadow-2xl overflow-hidden backdrop-blur-sm">
              <div className="h-1 bg-gradient-to-r from-[#38BDF8] to-indigo-500" />
              <CardContent className="p-8 space-y-8">
                {/* Bio */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#38BDF8]">
                    <ShieldCheck className="w-5 h-5" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest leading-none">Intelligence Summary</h4>
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed font-medium italic border-l-2 border-slate-700 pl-4 py-1">
                    {trainer.bio || "No tactical biography provided. Field experience and specialized training confirmed through system authorization."}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* Certifications */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-[#38BDF8]">
                      <Award className="w-5 h-5" />
                      <h4 className="text-[10px] font-black uppercase tracking-widest leading-none">Combat Grade Certifications</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {trainer.certifications && trainer.certifications.length > 0 ? (
                        trainer.certifications.map((cert, idx) => (
                          <Badge key={idx} variant="outline" className="rounded-xl border-slate-700 bg-slate-800/80 text-white font-bold px-3 py-1.5 text-[10px]">
                            {cert}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-slate-500 text-[10px] uppercase font-bold italic tracking-widest">Level 1 Practitioner</p>
                      )}
                    </div>
                  </div>

                  {/* Core Stats */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-[#38BDF8]">
                      <Clock className="w-5 h-5" />
                      <h4 className="text-[10px] font-black uppercase tracking-widest leading-none">Service Timeline</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Duty Start Date</span>
                        <span className="text-white font-bold text-xs">
                          {trainer.employmentStartDate ? new Date(trainer.employmentStartDate.toDate?.() || trainer.employmentStartDate).toLocaleDateString() : "Baseline Personnel"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Total Ops Vol</span>
                        <span className="text-white font-bold text-xs">{recentSessions.length} Logged Sessions</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-2xl font-black uppercase italic text-white tracking-tighter">Network Access</h3>
              <p className="text-amber-500 text-[10px] font-black uppercase tracking-widest">Verified Multi-Location Footprint</p>
            </div>

            <div className="space-y-4">
              {/* Home Studio */}
              <div className="p-6 rounded-[32px] bg-slate-900 border-2 border-indigo-500/30 shadow-xl relative overflow-hidden group">
                <Building2 className="w-12 h-12 absolute -right-3 -top-3 text-white/[0.03] group-hover:text-indigo-500/[0.05] transition-all" />
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <MapPin className="w-3 h-3" />
                  Primary Home Base
                </p>
                <p className="text-xl font-black text-white uppercase italic tracking-tighter">
                  {studios.find(s => s.id === trainer.primaryHomeStudioId)?.name || "Unknown Location"}
                </p>
              </div>

              {/* Other Access */}
              <div className="p-6 rounded-[32px] bg-slate-900/50 border border-slate-700 space-y-4">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Station Access (Permanent)</p>
                  <div className="flex flex-wrap gap-2">
                    {trainer.accessibleStudioIds?.filter(id => id !== trainer.primaryHomeStudioId).map(id => (
                      <Badge key={id} variant="secondary" className="bg-slate-800 text-slate-300 font-bold uppercase text-[9px] px-2 py-1 border-none">
                        {studios.find(s => s.id === id)?.name || id}
                      </Badge>
                    ))}
                    {(!trainer.accessibleStudioIds || trainer.accessibleStudioIds.filter(id => id !== trainer.primaryHomeStudioId).length === 0) && (
                      <p className="text-slate-600 text-[9px] font-black uppercase italic">Single Base Clearance</p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-3">Guest Credentials (Temporary)</p>
                  <div className="flex flex-wrap gap-2">
                    {trainer.activeGuestStudioIds?.map(id => (
                      <Badge key={id} variant="outline" className="border-amber-500/30 text-amber-500 font-bold uppercase text-[9px] px-2 py-1 bg-amber-500/5">
                        {studios.find(s => s.id === id)?.name || id}
                      </Badge>
                    ))}
                    {(!trainer.activeGuestStudioIds || trainer.activeGuestStudioIds.length === 0) && (
                      <p className="text-slate-600 text-[9px] font-black uppercase italic">No Active Guest Ops</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Roster Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h3 className="text-2xl font-black uppercase italic text-white tracking-tighter">Daily Roster</h3>
              <p className="text-[#38BDF8] text-[10px] font-black uppercase tracking-widest">Upcoming appointments • {upcomingSchedules.length} Scheduled</p>
            </div>
          </div>
          
          {upcomingSchedules.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {upcomingSchedules.slice(0, 12).map((s, i) => {
                const sTime = s.startTime.toDate();
                const isToday = sTime.toDateString() === now.toDateString();
                const client = clients.find(c => c.id === s.clientId);
                
                return (
                  <motion.div 
                    key={s.id || i}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex flex-col p-5 bg-[#115E8D]/20 border-2 border-slate-700 hover:border-[#38BDF8] hover:bg-[#115E8D]/40 transition-all rounded-[32px] group cursor-pointer shadow-lg relative overflow-hidden h-full"
                    onClick={() => {
                      if (s.clientId) {
                        onSelectClient(s.clientId);
                        setView('profile');
                      }
                    }}
                  >
                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity pointer-events-none">
                      <UserCircle className="w-32 h-32 text-white" />
                    </div>

                    <div className="flex justify-between items-start mb-6">
                      <div className="flex flex-col gap-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-2xl text-white uppercase italic tracking-tight truncate leading-none pt-1">
                            {s.clientName}
                          </p>
                          {client?.packageTier === "18-Month" && (
                            <Star className="w-4 h-4 text-slate-300 fill-slate-300 drop-shadow-[0_0_5px_rgba(203,213,225,0.8)] mt-1" />
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isToday && (
                           <Badge className="bg-rose-500 text-white font-black uppercase text-[9px] px-2 shadow-[0_0_10px_rgba(244,63,94,0.4)] border-none">
                              Today
                           </Badge>
                        )}
                        <div className="flex gap-2">
                          <div className="bg-[#F06C22] text-white font-black uppercase text-[11px] px-3 py-1 rounded-lg shadow-[0_0_15px_rgba(240,108,34,0.6)] border border-[#F06C22]/50 whitespace-nowrap">
                            Session #{client?.sessionCount ?? 0}
                          </div>
                          {client?.remainingSessions != null && (
                            <div className="bg-emerald-500/10 text-emerald-400 font-black uppercase text-[11px] px-3 py-1 rounded-lg shadow-[0_0_15px_rgba(52,211,153,0.2)] border border-emerald-500/30 whitespace-nowrap">
                              {client.remainingSessions} Left
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 text-slate-400 mt-auto pt-4 border-t border-slate-700/50">
                      <div className="flex items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800 shadow-inner">
                        <Clock className="w-4 h-4 text-[#38BDF8]" />
                        <span className="text-[12px] font-black uppercase text-slate-200">
                          {sTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 ml-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          {sTime.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="ml-auto w-10 h-10 rounded-2xl bg-slate-800 group-hover:bg-[#38BDF8] flex items-center justify-center transition-colors shadow-inner border border-slate-700 group-hover:border-[#38BDF8]">
                        <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-24 bg-slate-800/30 border-2 border-dashed border-slate-700 rounded-[40px] flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mb-2 shadow-inner border border-slate-700">
                <Calendar className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-sm font-black uppercase tracking-widest leading-relaxed text-slate-400">No upcoming sessions<br/>found in schedule.</p>
            </div>
          )}
        </div>

        {/* Recently Trained */}
        <div className="space-y-4 pt-8 border-t border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h3 className="text-xl font-black uppercase italic text-white tracking-tighter">Recently Logged</h3>
              <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest">Historical sessions</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {recentSessions.length > 0 ? (
              recentSessions.slice(0, 6).map((s, i) => {
                const client = clients.find(c => c.id === s.clientId);
                const ts = parseSessionDate(s.date);
                const sessionDate = ts > 0 ? new Date(ts) : new Date();
                
                return (
                  <motion.div 
                    key={s.id || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex flex-col p-4 bg-slate-800/40 border-2 border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all rounded-3xl group cursor-pointer"
                    onClick={() => {
                      if (s.clientId) {
                        onSelectClient(s.clientId);
                        setView('history');
                      }
                    }}
                  >
                    <div className="flex justify-between items-center mb-3">
                        <p className="font-black text-white text-lg uppercase italic tracking-tight truncate">
                          {client ? `${client.firstName} ${client.lastName}` : 'System Log'}
                        </p>
                         <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 group-hover:text-white transition-colors" />
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-auto">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Calendar className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">
                            {sessionDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-emerald-500 border-none bg-emerald-500/10 font-black uppercase text-[9px] tracking-widest px-2 shadow-inner">
                          Logged
                        </Badge>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-full text-center py-12 bg-slate-800/30 border-2 border-dashed border-slate-700 rounded-[32px] flex flex-col items-center gap-3">
                <TrendingDown className="w-10 h-10 text-slate-600 mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed text-slate-500">No recent activity recorded.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
