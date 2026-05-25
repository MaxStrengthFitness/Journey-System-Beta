import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Studio, Trainer, HubAnnouncement, FranchiseNetwork } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Network, Building2, Users, Megaphone, Loader2, Plus, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn, getAnnouncementStyle } from '@/lib/utils';
import { OperationType, handleFirestoreError } from '../lib/firestore-errors';

interface FranchiseDashboardViewProps {
  authTrainer: Trainer;
  allStudios: Studio[];
  allTrainers: Trainer[];
  networks: FranchiseNetwork[];
}

import { FranchiseTeamManagement } from './FranchiseTeamManagement';

export function FranchiseDashboardView({ authTrainer, allStudios, allTrainers, networks }: FranchiseDashboardViewProps) {
  const isSuperAdmin = authTrainer.role === 'Founder' || authTrainer.role === 'Admin' || authTrainer.role === 'Overseer';
  const displayNetworks = isSuperAdmin ? networks : networks.filter(n => (n.ownerIds || []).includes(authTrainer.id!) || n.ownerId === authTrainer.id);
  
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(displayNetworks[0]?.id || null);

  // Determine owned studios based on whether they are super-admin looking at a specific network
  // or an owner looking at their own stuff.
  const activeNetwork = displayNetworks.find(n => n.id === selectedNetworkId);
  const networkStudioIds = activeNetwork ? activeNetwork.studioIds || [] : [];
  
  const ownedStudios = isSuperAdmin && activeNetwork
    ? allStudios.filter(s => networkStudioIds.includes(s.id!))
    : allStudios.filter(s => s.ownerId === authTrainer.id || networkStudioIds.includes(s.id!));
    
  const ownedStudioIds = ownedStudios.map(s => s.id!);
  
  const staff = allTrainers.filter(t => 
    (t.primaryHomeStudioId && ownedStudioIds.includes(t.primaryHomeStudioId)) ||
    (t.accessibleStudioIds?.some(id => ownedStudioIds.includes(id)))
  );

  const [announcements, setAnnouncements] = useState<HubAnnouncement[]>([]);
  const [isCreatingAnnouncement, setIsCreatingAnnouncement] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState<Partial<HubAnnouncement>>({
    title: '',
    shortContent: '',
    longContent: '',
    targetScope: 'network',
    targetId: 'all_owned',
    type: 'shout-out',
    priority: 'medium'
  });
  const [lifespan, setLifespan] = useState('24h');

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const q = query(collection(db, 'hub_announcements'));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as HubAnnouncement));
        
        const filtered = data
          .filter(a => a.authorId === authTrainer.id)
          .filter(a => a.isActive !== false)
          .filter((a) => {
             if (a.expiresAt) {
               const expTime = a.expiresAt.toDate ? a.expiresAt.toDate().getTime() : (typeof a.expiresAt === 'number' ? a.expiresAt : 0);
               if (expTime > 0 && expTime < Date.now()) return false;
             }
             return true;
          })
          .sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;
          });
        setAnnouncements(filtered);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'hub_announcements');
      }
    };
    fetchAnnouncements();
  }, [authTrainer.id]);

  const handleCreateAnnouncement = async () => {
    if (!newAnnouncement.title || !newAnnouncement.shortContent) return;
    setIsCreatingAnnouncement(true);
    try {
      const now = new Date();
      let expiresAt = new Date(now);
      if (lifespan === '24h') expiresAt.setHours(expiresAt.getHours() + 24);
      else if (lifespan === '1w') expiresAt.setDate(expiresAt.getDate() + 7);
      else expiresAt.setMonth(expiresAt.getMonth() + 1);

      const docRef = await addDoc(collection(db, 'hub_announcements'), {
        ...newAnnouncement,
        authorId: authTrainer.id,
        authorName: authTrainer.fullName,
        studioId: newAnnouncement.targetScope === 'studio' ? newAnnouncement.targetId : 'all',
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
        isActive: true,
        readBy: []
      });

      const obj: HubAnnouncement = {
        ...newAnnouncement as any,
        id: docRef.id,
        authorId: authTrainer.id!,
        authorName: authTrainer.fullName,
        studioId: newAnnouncement.targetScope === 'studio' ? newAnnouncement.targetId : 'all',
        createdAt: { toMillis: () => Date.now(), toDate: () => new Date() },
        expiresAt: expiresAt,
        isActive: true,
        readBy: []
      };

      setAnnouncements(p => [obj, ...p]);
      setNewAnnouncement({ title: '', shortContent: '', longContent: '', targetScope: 'network', targetId: 'all_owned', type: 'shout-out', priority: 'medium' });
      alert("Franchise network message published successfully.");
    } catch (e: any) {
      alert("Error publishing message: " + e.message);
    } finally {
      setIsCreatingAnnouncement(false);
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 flex flex-col items-center justify-center border border-amber-500/20">
            <Network className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase text-slate-900 dark:text-white leading-none">
              Franchise Management
            </h1>
            <p className="text-xs md:text-sm font-bold uppercase tracking-widest text-slate-500 mt-1">
              Oversee your network of locations & Life Transformers
            </p>
          </div>
        </div>

        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">View Network:</Label>
            <Select value={selectedNetworkId || ''} onValueChange={setSelectedNetworkId}>
              <SelectTrigger className="w-[200px] h-10 font-bold uppercase text-[11px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
                <SelectValue placeholder="Select Network" />
              </SelectTrigger>
              <SelectContent>
                {displayNetworks.map(n => (
                  <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="rounded-[32px] border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          <CardHeader className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-sky-500" />
              <CardTitle className="text-xl font-black uppercase italic tracking-tight">Your Locations</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {ownedStudios.length === 0 ? (
                <div className="text-xs text-slate-500 font-medium">No locations registered to your account yet.</div>
              ) : (
                ownedStudios.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl">
                    <span className="font-bold text-slate-900 dark:text-white uppercase tracking-tight">{s.name}</span>
                    <Badge variant="outline">{staff.filter(t => t.primaryHomeStudioId === s.id).length} Transformers</Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          <CardHeader className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-amber-500" />
              <CardTitle className="text-xl font-black uppercase italic tracking-tight">Life Transformers</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <FranchiseTeamManagement 
              trainers={allTrainers}
              studios={ownedStudios}
              authTrainer={authTrainer}
              isAdmin={isSuperAdmin}
              activeStudioId={null}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[32px] border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <CardHeader className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Megaphone className="w-5 h-5 text-[#F06C22]" />
            <div>
              <CardTitle className="text-xl font-black uppercase italic tracking-tight">Franchise Internal Announcements</CardTitle>
              <CardDescription className="text-[11px] uppercase tracking-widest font-bold mt-1">Broadcast direct updates to your network</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">Select Scope</Label>
                <Select value={newAnnouncement.targetScope} onValueChange={(v: 'network' | 'studio') => setNewAnnouncement(p => ({ ...p, targetScope: v, targetId: v === 'network' ? 'all_owned' : ownedStudios[0]?.id }))}>
                  <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 font-bold uppercase text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="network">Entire Network</SelectItem>
                    <SelectItem value="studio">Specific Studio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {newAnnouncement.targetScope === 'studio' && (
                <div className="space-y-2 animate-in fade-in">
                   <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">Select Studio</Label>
                   <Select value={newAnnouncement.targetId} onValueChange={(v) => setNewAnnouncement(p => ({ ...p, targetId: v }))}>
                    <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 font-bold uppercase text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ownedStudios.map(s => <SelectItem key={s.id} value={s.id!}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">Headline</Label>
                <Input 
                  value={newAnnouncement.title || ''} 
                  onChange={e => setNewAnnouncement(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g., Happy Holidays Team!" 
                  className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">Main Message</Label>
                <Textarea 
                  value={newAnnouncement.longContent || ''} 
                  onChange={e => setNewAnnouncement(p => ({ ...p, longContent: e.target.value }))}
                  placeholder="The full inner communication message..." 
                  className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">Short Summary (Ticker)</Label>
                <Input 
                  placeholder="Appears on dashboard widgets..." 
                  className="h-10 bg-slate-50 dark:bg-slate-950"
                  value={newAnnouncement.shortContent}
                  onChange={e => setNewAnnouncement(p => ({ ...p, shortContent: e.target.value }))}
                />
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[120px] space-y-2">
                  <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">Type</Label>
                  <Select value={newAnnouncement.type || 'news'} onValueChange={(v: any) => setNewAnnouncement(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 font-bold uppercase text-[11px] tracking-widest border-slate-200 dark:border-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="news">News</SelectItem>
                      <SelectItem value="shout-out">Shout Outs</SelectItem>
                      <SelectItem value="event">Events</SelectItem>
                      <SelectItem value="tip">Tips</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[120px] space-y-2">
                  <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">Urgency</Label>
                  <Select value={newAnnouncement.priority || 'low'} onValueChange={(v: any) => setNewAnnouncement(p => ({ ...p, priority: v }))}>
                    <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 font-bold uppercase text-[11px] tracking-widest border-slate-200 dark:border-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Standard</SelectItem>
                      <SelectItem value="high">High & Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[120px] space-y-2">
                  <Label className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">Lifespan</Label>
                  <Select value={lifespan} onValueChange={v => setLifespan(v)}>
                    <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 font-bold uppercase text-[11px] tracking-widest border-slate-200 dark:border-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">24 Hours</SelectItem>
                      <SelectItem value="1w">1 Week</SelectItem>
                      <SelectItem value="1m">1 Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button 
                onClick={handleCreateAnnouncement}
                disabled={isCreatingAnnouncement || !newAnnouncement.title || !newAnnouncement.shortContent}
                className="w-full bg-[#F06C22] hover:bg-[#D95B16] text-white font-black uppercase tracking-widest h-12"
              >
                {isCreatingAnnouncement ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Megaphone className="w-4 h-4 mr-2" />}
                Broadcast
              </Button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-[24px] p-5 border border-slate-100 dark:border-slate-800 h-full max-h-[500px] overflow-y-auto w-full">
              <h3 className="text-[11px] tracking-widest font-black uppercase text-slate-500 mb-4 sticky top-0 bg-slate-50 dark:bg-slate-900/40 py-1">Recent Transmissions</h3>
              <div className="space-y-3">
                {announcements.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium py-8 text-center border-dashed border-2 dark:border-slate-800 rounded-2xl">No broadcasts sent yet.</p>
                ) : (
                  announcements.map(a => (
                    <div key={a.id} className={cn("p-4 rounded-2xl border flex flex-col gap-2 relative group", getAnnouncementStyle(a.type, a.priority))}>
                      <div className="flex gap-2 items-start justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-black text-sm uppercase italic tracking-tight">{a.title}</span>
                            {a.priority === 'high' && <Badge className="bg-rose-500 hover:bg-rose-600 text-white border-0 text-[11px] font-black uppercase px-1.5 h-4">Urgent</Badge>}
                            <Badge variant="outline" className="bg-white/50 dark:bg-black/20 text-[11px] font-black uppercase tracking-widest px-1.5 border-current opacity-70">
                              {a.type || 'news'}
                            </Badge>
                          </div>
                          <p className="text-xs font-bold leading-tight opacity-90">{a.shortContent}</p>
                        </div>
                      </div>
                      {a.longContent && (
                        <p className="text-xs italic mt-1 opacity-80 line-clamp-3">{a.longContent}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-current border-opacity-10 justify-between">
                        <span className="text-[11px] uppercase font-bold tracking-widest opacity-60">To: {a.targetScope === 'network' ? 'All Studios' : ownedStudios.find(s => s.id === a.studioId)?.name || 'Studio'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
