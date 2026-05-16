import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Studio, Trainer } from '../types';
import { 
  Building2, 
  Users, 
  ChevronRight, 
  MapPin, 
  Mail, 
  Phone, 
  Clock, 
  Save, 
  ArrowLeft,
  Search,
  BadgeInfo,
  ShieldCheck,
  UserCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'motion/react';
import { OperationType, handleFirestoreError } from '../lib/firestore-errors';

interface Props {
  authTrainer: Trainer;
  studios: Studio[];
  onBack?: () => void;
}

export function OwnerStudioManager({ authTrainer, studios, onBack }: Props) {
  const [selectedStudioId, setSelectedStudioId] = useState<string | null>(null);
  const [staff, setStaff] = useState<Trainer[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filter studios to only those owned by the current trainer
  const ownedStudios = studios.filter(s => authTrainer.ownedStudioIds?.includes(s.id!) || s.ownerId === authTrainer.id);

  const selectedStudio = studios.find(s => s.id === selectedStudioId);

  useEffect(() => {
    if (!selectedStudioId) {
      setStaff([]);
      return;
    }

    const fetchStaff = async () => {
      setLoadingStaff(true);
      try {
        // Query 1: Permanent Staff
        const q1 = query(
          collection(db, 'trainers'),
          where('accessibleStudioIds', 'array-contains', selectedStudioId)
        );
        
        // Query 2: Guest Staff
        const q2 = query(
          collection(db, 'trainers'),
          where('activeGuestStudioIds', 'array-contains', selectedStudioId)
        );

        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        
        const staffMap = new Map<string, Trainer>();
        snap1.docs.forEach(doc => staffMap.set(doc.id, { id: doc.id, ...doc.data() } as Trainer));
        snap2.docs.forEach(doc => staffMap.set(doc.id, { id: doc.id, ...doc.data() } as Trainer));
        
        setStaff(Array.from(staffMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName)));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'trainers');
      } finally {
        setLoadingStaff(false);
      }
    };

    fetchStaff();
  }, [selectedStudioId]);

  const handleUpdateStudio = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStudio?.id) return;

    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const updates = {
      name: formData.get('name') as string,
      contactEmail: formData.get('contactEmail') as string,
      phone: formData.get('phone') as string,
      address: formData.get('address') as string,
      timezone: formData.get('timezone') as string,
      mindbodySiteId: formData.get('mindbodySiteId') as string,
    };

    try {
      await updateDoc(doc(db, 'studios', selectedStudio.id), updates);
      // Optionally update local studios state if passed as prop and parent supports it, 
      // but usually high-level state refreshes via snapshot
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `studios/${selectedStudio.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedStudioId) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-sky-400 shadow-xl">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter text-slate-800">Studio Management</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Owner Control Panel</p>
            </div>
          </div>
          {onBack && (
            <Button variant="ghost" onClick={onBack} className="rounded-xl font-bold uppercase tracking-widest text-[10px] h-10 px-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Overview
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ownedStudios.map(studio => (
            <motion.div
              key={studio.id}
              whileHover={{ y: -5 }}
              onClick={() => setSelectedStudioId(studio.id!)}
              className="cursor-pointer"
            >
              <Card className="rounded-[32px] border-slate-200 overflow-hidden hover:border-sky-500/50 hover:shadow-2xl transition-all group">
                <div className="h-2 bg-slate-900" />
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-800">
                      {studio.name}
                    </CardTitle>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-sky-500 transition-colors" />
                  </div>
                  <CardDescription className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <MapPin className="w-3 h-3" />
                    {studio.address || 'Address not set'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 pt-2">
                    <div className="px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">ID: {studio.id?.slice(0, 8)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {ownedStudios.length === 0 && (
            <div className="col-span-full py-20 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-sm font-bold uppercase tracking-widest text-slate-400">No owned studios found.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 pb-32">
       <button 
        onClick={() => setSelectedStudioId(null)}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-800 transition-colors mb-4 group"
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em]">All Studios</span>
      </button>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-slate-200">
        <div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter text-slate-800 leading-none mb-2">
            {selectedStudio?.name}
          </h1>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="rounded-lg bg-teal-50 text-teal-700 border-teal-200 font-black uppercase tracking-widest text-[9px]">
              Studio Active
            </Badge>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Location System ID: {selectedStudio?.id}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Studio Details Form */}
        <div className="lg:col-span-2 space-y-8">
          <section>
            <h2 className="text-lg font-black uppercase tracking-tight text-slate-800 mb-6 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-600">
                <BadgeInfo className="w-5 h-5" />
              </div>
              Studio Configuration
            </h2>
            
            <Card className="rounded-[40px] shadow-sm border-slate-200">
              <CardContent className="p-8">
                <form onSubmit={handleUpdateStudio} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Studio Display Name</Label>
                    <Input 
                      id="name" 
                      name="name" 
                      defaultValue={selectedStudio?.name} 
                      className="rounded-2xl border-slate-200 h-12 focus:ring-sky-500 focus:border-sky-500 font-bold" 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="contactEmail" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Business Email</Label>
                    <Input 
                      id="contactEmail" 
                      name="contactEmail" 
                      defaultValue={selectedStudio?.contactEmail} 
                      className="rounded-2xl border-slate-200 h-12 font-bold" 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Location Phone</Label>
                    <Input 
                      id="phone" 
                      name="phone" 
                      defaultValue={selectedStudio?.phone} 
                      className="rounded-2xl border-slate-200 h-12 font-bold" 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="timezone" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Local Timezone</Label>
                    <Input 
                      id="timezone" 
                      name="timezone" 
                      defaultValue={selectedStudio?.timezone} 
                      className="rounded-2xl border-slate-200 h-12 font-bold" 
                    />
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="address" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Physical Address</Label>
                    <Input 
                      id="address" 
                      name="address" 
                      defaultValue={selectedStudio?.address} 
                      className="rounded-2xl border-slate-200 h-12 font-bold" 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="mindbodySiteId" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">MindBody Site ID</Label>
                    <Input 
                      id="mindbodySiteId" 
                      name="mindbodySiteId" 
                      defaultValue={selectedStudio?.mindbodySiteId} 
                      className="rounded-2xl border-slate-200 h-12 font-bold" 
                    />
                  </div>

                  <div className="md:col-span-2 pt-4 border-t flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={isSaving}
                      className="bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest text-xs h-12 px-8 rounded-2xl shadow-xl shadow-slate-900/20"
                    >
                      {isSaving ? 'Synchronizing...' : (
                        <div className="flex items-center gap-2">
                          <Save className="w-4 h-4" />
                          Update Foundation
                        </div>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </section>

          {/* Staff Roster Section */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-800 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-600">
                  <Users className="w-5 h-5" />
                </div>
                Staff Roster
              </h2>
              <span className="px-4 py-1.5 bg-slate-100 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-500">
                {staff.length} Authorized Professionals
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence mode="popLayout">
                {loadingStaff ? (
                  [1,2,3,4].map(i => (
                    <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-[24px]" />
                  ))
                ) : (
                  staff.map(trainer => (
                    <motion.div
                      key={trainer.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="group"
                    >
                      <Card className="rounded-[24px] border-slate-200 hover:border-sky-500 transition-colors shadow-sm overflow-hidden flex items-stretch">
                        <div className="w-2 bg-sky-500 group-hover:w-4 transition-all" />
                        <CardContent className="p-4 flex items-center gap-4 w-full">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-black text-slate-800 shadow-sm">
                            {trainer.initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black uppercase tracking-tight text-slate-800 truncate">
                              {trainer.fullName}
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="px-2 py-0 h-4 rounded-md text-[8px] font-black uppercase tracking-tighter bg-slate-800 text-white">
                                {trainer.role}
                              </Badge>
                              {trainer.primaryHomeStudioId === selectedStudioId && (
                                <Badge variant="outline" className="px-2 py-0 h-4 rounded-md text-[8px] font-black uppercase tracking-tighter border-emerald-500 text-emerald-600">
                                  Primary Home
                                </Badge>
                              )}
                              {trainer.activeGuestStudioIds?.includes(selectedStudioId!) && (
                                <Badge variant="outline" className="px-2 py-0 h-4 rounded-md text-[8px] font-black uppercase tracking-tighter border-amber-500 text-amber-600">
                                  Guest Access
                                </Badge>
                              )}
                            </div>
                          </div>
                          <UserCircle className="w-5 h-5 text-slate-200 group-hover:text-sky-500 transition-colors shrink-0" />
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
            
            {staff.length === 0 && !loadingStaff && (
              <div className="py-20 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-sm font-bold uppercase tracking-widest text-slate-400">No staff members linked to this location.</p>
              </div>
            )}
          </section>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <Card className="rounded-[32px] bg-indigo-900 text-white shadow-2xl border-none overflow-hidden">
            <div className="p-6 bg-white/5 border-b border-white/10">
              <h3 className="text-sm font-black uppercase tracking-widest text-indigo-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Access Summary
              </h3>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Permanent Access</p>
                <div className="text-2xl font-black tracking-tighter">
                  {staff.filter(t => t.accessibleStudioIds?.includes(selectedStudioId!)).length}
                </div>
                <p className="text-xs text-indigo-200/60 leading-relaxed font-medium">
                  Staff members with persistent permissions to view clients and log workouts at this location.
                </p>
              </div>
              
              <div className="pt-6 border-t border-white/10 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Temporary Guest Pool</p>
                <div className="text-2xl font-black tracking-tighter text-amber-400">
                  {staff.filter(t => t.activeGuestStudioIds?.includes(selectedStudioId!)).length}
                </div>
                <p className="text-xs text-indigo-200/60 leading-relaxed font-medium">
                  Remote trainers currently authorized for guest training sessions.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
