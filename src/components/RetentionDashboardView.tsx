import React, { useState, useMemo } from "react";
import { AlertTriangle, Clock, Calendar, Search, ShieldAlert, Phone, EyeOff, LayoutGrid, MoreVertical, User, CheckCircle } from "lucide-react";
import { Client, WorkoutSession, Studio, Trainer } from "../types";
import { AppHeader } from "./AppHeader";
import { safeToDate, cn } from "../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface RetentionDashboardViewProps {
  clients: Client[];
  sessions: WorkoutSession[];
  trainers: Trainer[];
  studio: Studio | undefined;
  authTrainer: Trainer | null;
  onClose: () => void;
  onUpdateStudio: (studioId: string, updates: Partial<Studio>) => Promise<void>;
  onUpdateClient: (clientId: string, updates: Partial<Client>) => Promise<void>;
  onNavigateProfile: (clientId: string) => void;
}

type TabType = "at-risk" | "mia" | "excluded";

export function RetentionDashboardView({
  clients,
  sessions,
  trainers,
  studio,
  authTrainer,
  onClose,
  onUpdateStudio,
  onUpdateClient,
  onNavigateProfile,
}: RetentionDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("at-risk");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  
  // Settings Default Values
  const settings = studio?.retentionSettings || {
    atRiskThresholdDays: 7,
    miaThresholdDays: 14,
    autoExcludeAfterDays: 90,
  };

  const [formSettings, setFormSettings] = useState(settings);

  // Compute Last Sessions per Client
  const clientLastSessionMap = useMemo(() => {
    const map: Record<string, WorkoutSession> = {};
    sessions.forEach(s => {
      const current = map[s.clientId];
      if (!current || (safeToDate(s.date) > safeToDate(current.date))) {
        map[s.clientId] = s;
      }
    });
    return map;
  }, [sessions]);

  // Compute Buckets
  const { atRisk, mia, excluded } = useMemo(() => {
    const now = new Date();
    const atRiskArr: any[] = [];
    const miaArr: any[] = [];
    const excludedArr: any[] = [];

    clients.forEach(c => {
      // Find their assigned trainer from last session, or fallback to first trainer matching studio
      const lastSession = clientLastSessionMap[c.id as string];
      const trainerId = lastSession?.trainerId;
      const trainer = trainers.find(t => t.id === trainerId) || trainers[0]; // fallback
      
      const lastDate = lastSession ? safeToDate(lastSession.date) : safeToDate(c.createdAt || now);
      const diffTime = Math.abs(now.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const entry = { client: c, lastSession, trainer, diffDays, lastDate };

      if (c.retentionMeta?.excludedFromMIA) {
        excludedArr.push(entry);
      } else if (c.remainingSessions > 0) {
        if (diffDays >= settings.miaThresholdDays) {
          if (diffDays <= settings.autoExcludeAfterDays) {
            miaArr.push(entry);
          } else {
            // Logic would normally auto-exclude them. We just exclude them here in view for now.
            excludedArr.push({ ...entry, autoExcluded: true });
          }
        } else if (diffDays >= settings.atRiskThresholdDays && diffDays < settings.miaThresholdDays) {
          atRiskArr.push(entry);
        }
      }
    });

    return { 
      atRisk: atRiskArr.sort((a, b) => b.diffDays - a.diffDays), 
      mia: miaArr.sort((a, b) => b.diffDays - a.diffDays), 
      excluded: excludedArr.sort((a, b) => b.diffDays - a.diffDays) 
    };
  }, [clients, clientLastSessionMap, trainers, settings]);

  const displayedList = activeTab === "at-risk" ? atRisk : activeTab === "mia" ? mia : excluded;
  const filteredList = displayedList.filter(item => 
    `${item.client.firstName} ${item.client.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSaveSettings = async () => {
    if (studio?.id) {
      await onUpdateStudio(studio.id, { retentionSettings: formSettings });
      setShowSettings(false);
    }
  };

  const markContacted = async (clientId: string) => {
    await onUpdateClient(clientId, {
      retentionMeta: {
        ...(clients.find(c => c.id === clientId)?.retentionMeta || {}),
        lastContactedDate: new Date(),
      }
    });
  };

  const toggleExclude = async (clientId: string, exclude: boolean) => {
    const defaultMeta = clients.find(c => c.id === clientId)?.retentionMeta || {};
    await onUpdateClient(clientId, {
      retentionMeta: {
        ...defaultMeta,
        excludedFromMIA: exclude,
        excludedBy: exclude ? authTrainer?.fullName : undefined,
        excludedReason: exclude ? "Manual override via Retention Dashboard" : undefined,
      }
    });
  };

  return (
    <div className="w-full h-full min-h-screen bg-bg-dark font-sans flex flex-col overflow-hidden">
      <div className="max-w-[820px] mx-auto w-full h-full relative flex flex-col pb-24 shadow-2xl">
        <AppHeader variant="dark" trainerInitials={authTrainer?.initials || "TR"} />
        
        <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 flex flex-col">
          <div className="px-5 py-5 flex-1 flex flex-col gap-4">
            
            {/* Header Area */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display italic font-bold uppercase text-[28px] text-white leading-tight">Retention</h1>
                <p className="text-[11px] uppercase tracking-wide opacity-70 text-ink-d2">Protect your active client base</p>
              </div>
              <button 
                onClick={() => setShowSettings(true)}
                className="flex items-center justify-center min-h-[44px] min-w-[44px] bg-surface-1 hover:bg-surface-2 border border-div-d rounded-xl text-ink-d2 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark"
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
            </div>

            {/* Metric Bento */}
            <div className="grid grid-cols-2 gap-3">
              <div 
                onClick={() => setActiveTab("at-risk")}
                className={cn(
                  "flex flex-col p-4 rounded-2xl border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark",
                  activeTab === "at-risk" ? "bg-surface-2 border-amber-500/30" : "bg-surface-1 border-div-d opacity-70 hover:opacity-100"
                )}
              >
                <Clock className={cn("w-5 h-5 mb-2", activeTab === "at-risk" ? "text-amber-500" : "text-ink-d3")} />
                <span className="text-[24px] font-display font-bold text-white leading-tight">{atRisk.length}</span>
                <span className="text-[11px] uppercase tracking-wide text-ink-d2">At Risk ({settings.atRiskThresholdDays}-{settings.miaThresholdDays}d)</span>
              </div>
              <div 
                onClick={() => setActiveTab("mia")}
                className={cn(
                  "flex flex-col p-4 rounded-2xl border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark",
                  activeTab === "mia" ? "bg-surface-2 border-cta/30" : "bg-surface-1 border-div-d opacity-70 hover:opacity-100"
                )}
              >
                <ShieldAlert className={cn("w-5 h-5 mb-2", activeTab === "mia" ? "text-cta" : "text-ink-d3")} />
                <span className="text-[24px] font-display font-bold text-white leading-tight">{mia.length}</span>
                <span className="text-[11px] uppercase tracking-wide text-ink-d2">MIA ({settings.miaThresholdDays}+ days)</span>
              </div>
            </div>

            {/* Expanded List Container */}
            <div className="flex-1 bg-surface-1 border border-div-d rounded-2xl flex flex-col overflow-hidden">
              <div className="p-4 border-b border-div-d flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setActiveTab("at-risk")}
                      className={cn("px-4 py-2 font-display italic font-bold uppercase rounded-lg text-[14px] transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark", activeTab === "at-risk" ? "bg-surface-2 text-white" : "text-ink-d3 hover:text-white")}
                    >
                      At Risk
                    </button>
                    <button 
                      onClick={() => setActiveTab("mia")}
                      className={cn("px-4 py-2 font-display italic font-bold uppercase rounded-lg text-[14px] transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark", activeTab === "mia" ? "bg-surface-2 text-white" : "text-ink-d3 hover:text-white")}
                    >
                      MIA
                    </button>
                    <button 
                      onClick={() => setActiveTab("excluded")}
                      className={cn("px-4 py-2 font-display italic font-bold uppercase rounded-lg text-[14px] transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark", activeTab === "excluded" ? "bg-surface-2 text-white" : "text-ink-d3 hover:text-white")}
                    >
                      Excluded
                    </button>
                  </div>
                </div>
                <div className="relative w-48 hidden sm:block">
                  <Search className="w-4 h-4 text-ink-d3 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    className="w-full bg-surface-2 border border-div-d rounded-xl h-10 pl-9 pr-3 text-[13px] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark placeholder:text-ink-d3"
                    placeholder="Search clients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Mobile Search */}
              <div className="p-3 border-b border-div-d sm:hidden relative">
                <Search className="w-4 h-4 text-ink-d3 absolute left-6 top-1/2 -translate-y-1/2" />
                <input 
                  className="w-full bg-surface-2 border border-div-d rounded-xl h-12 pl-10 pr-3 text-[13px] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark placeholder:text-ink-d3"
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar p-0">
                {filteredList.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center text-ink-d3">
                    <span className="text-[48px] mb-4">🏆</span>
                    <h3 className="font-display italic font-bold uppercase text-[18px] text-white mb-1">Clear Board</h3>
                    <p className="text-[13px]">No clients meet this criteria currently.</p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {filteredList.map(item => (
                      <div key={item.client.id} className="border-b border-div-d flex items-center justify-between p-4 bg-surface-1 hover:bg-surface-2 transition-colors group">
                        
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={cn("w-2 h-12 rounded-full shrink-0", 
                            activeTab === "at-risk" ? "bg-amber-500" :
                            activeTab === "mia" ? "bg-cta" : "bg-ink-d3"
                          )} />
                          
                          <div className="min-w-0">
                            <h4 className="font-display italic font-bold uppercase text-[16px] text-white truncate">
                              {item.client.firstName} {item.client.lastName}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={cn(
                                "text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm",
                                activeTab === "mia" ? "bg-cta/20 text-cta" : "bg-div-d text-ink-d2"
                              )}>
                                {item.diffDays} DAYS AGO
                              </span>
                              <span className="text-[11px] text-ink-d3 truncate">
                                Trainer: {item.trainer?.fullName}
                              </span>
                            </div>
                            {item.client.retentionMeta?.lastContactedDate && (
                              <div className="text-[11px] text-cyan mt-1 flex items-center gap-1">
                                <Phone className="w-3 h-3" /> 
                                Contacted: {safeToDate(item.client.retentionMeta.lastContactedDate).toLocaleDateString()}
                              </div>
                            )}
                            {item.client.retentionMeta?.excludedReason && (
                              <div className="text-[11px] text-ink-d3 mt-1 italic">
                                Excluded: {item.client.retentionMeta.excludedReason}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex flex-col items-end mr-4 hidden sm:flex">
                            <span className="font-display font-bold text-white text-[16px]">{item.client.remainingSessions}</span>
                            <span className="text-[11px] uppercase tracking-wide text-ink-d2">Sessions Left</span>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-div-d text-ink-d2 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark">
                              <MoreVertical className="w-5 h-5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[200px] bg-surface-2 border-div-d rounded-2xl p-1">
                              <DropdownMenuItem 
                                onClick={() => item.client.id && onNavigateProfile(item.client.id)}
                                className="min-h-[44px] rounded-xl text-[13px] font-bold uppercase tracking-wide text-white hover:bg-surface-1 focus:bg-surface-1 cursor-pointer"
                              >
                                <User className="w-4 h-4 mr-2" /> Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => item.client.id && markContacted(item.client.id)}
                                className="min-h-[44px] rounded-xl text-[13px] font-bold uppercase tracking-wide text-cyan hover:bg-cyan/10 focus:bg-cyan/10 cursor-pointer"
                              >
                                <Phone className="w-4 h-4 mr-2" /> Mark Contacted
                              </DropdownMenuItem>
                              {activeTab !== "excluded" ? (
                                <DropdownMenuItem 
                                  onClick={() => item.client.id && toggleExclude(item.client.id, true)}
                                  className="min-h-[44px] rounded-xl text-[13px] font-bold uppercase tracking-wide text-ink-d3 hover:bg-surface-1 focus:bg-surface-1 cursor-pointer"
                                >
                                  <EyeOff className="w-4 h-4 mr-2" /> Exclude
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem 
                                  onClick={() => item.client.id && toggleExclude(item.client.id, false)}
                                  className="min-h-[44px] rounded-xl text-[13px] font-bold uppercase tracking-wide text-white hover:bg-surface-1 focus:bg-surface-1 cursor-pointer"
                                >
                                  <CheckCircle className="w-4 h-4 mr-2" /> Re-Include
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-[400px] bg-bg-dark border-div-d rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="font-display italic font-bold uppercase text-[24px] text-white">Retention Settings</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-6 mt-4">
            
            <div className="flex flex-col gap-2">
              <label className="text-[11px] uppercase tracking-wide text-ink-d2">At Risk Threshold (Days)</label>
              <input 
                type="number"
                value={formSettings.atRiskThresholdDays}
                onChange={e => setFormSettings({ ...formSettings, atRiskThresholdDays: parseInt(e.target.value) || 0 })}
                className="w-full bg-surface-1 border border-div-d rounded-xl px-4 min-h-[44px] text-white text-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark"
              />
              <p className="text-[11px] text-ink-d3">Clients inactive this many days become At Risk.</p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] uppercase tracking-wide text-ink-d2">MIA Threshold (Days)</label>
              <input 
                type="number"
                value={formSettings.miaThresholdDays}
                onChange={e => setFormSettings({ ...formSettings, miaThresholdDays: parseInt(e.target.value) || 0 })}
                className="w-full bg-surface-1 border border-div-d rounded-xl px-4 min-h-[44px] text-white text-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark"
              />
              <p className="text-[11px] text-ink-d3">Clients inactive this many days are marked MIA.</p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] uppercase tracking-wide text-ink-d2">Auto-Exclude (Days)</label>
              <input 
                type="number"
                value={formSettings.autoExcludeAfterDays}
                onChange={e => setFormSettings({ ...formSettings, autoExcludeAfterDays: parseInt(e.target.value) || 0 })}
                className="w-full bg-surface-1 border border-div-d rounded-xl px-4 min-h-[44px] text-white text-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark"
              />
              <p className="text-[11px] text-ink-d3">Remove entirely from dashboard after this period.</p>
            </div>

            <Button 
              onClick={handleSaveSettings}
              className="w-full min-h-[44px] bg-cyan text-slate-900 hover:bg-cyan/90 font-display italic font-bold uppercase rounded-full text-[16px] mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark"
            >
              SAVE SETTINGS
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
