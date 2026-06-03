import React from 'react';
import { motion } from 'motion/react';
import { Building2, ChevronLeft, MapPin, ShieldCheck } from 'lucide-react';
import { Studio, FranchiseNetwork } from '../types';
import { Button } from '@/components/ui/button';
import { MaxStrengthLogo } from './MaxStrengthLogo';

interface StudioSelectionViewProps {
  studios: Studio[];
  networks?: FranchiseNetwork[];
  onSelectStudio: (studioId: string) => void;
  onBack: () => void;
}

export function StudioSelectionView({ 
  studios, 
  networks = [], 
  onSelectStudio, 
  onBack 
}: StudioSelectionViewProps) {

  const [selectedNetworkId, setSelectedNetworkId] = React.useState<string | null>(null);

  // Group studios by Network ID
  const groupedStudios = React.useMemo(() => {
    const networkMap: Record<string, Studio[]> = {};
    const unassociated: Studio[] = [];

    studios.forEach(studio => {
      // Find space network association either by studio.networkId, or if it lies in network.studioIds
      const parentNet = networks.find(net => net.studioIds.includes(studio.id || ''));
      if (parentNet) {
        if (!networkMap[parentNet.id]) {
          networkMap[parentNet.id] = [];
        }
        networkMap[parentNet.id].push(studio);
      } else if (studio.networkId && networks.some(n => n.id === studio.networkId)) {
        if (!networkMap[studio.networkId]) {
          networkMap[studio.networkId] = [];
        }
        networkMap[studio.networkId].push(studio);
      } else {
        unassociated.push(studio);
      }
    });

    return { networkMap, unassociated };
  }, [studios, networks]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-start p-6 md:p-12 text-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-5xl"
      >
        <div className="text-center mb-10 flex flex-col items-center">
          <MaxStrengthLogo size="xl" className="mb-6" />
          <h2 className="text-3xl font-black uppercase italic tracking-tight text-white mb-2 leading-none">
            Enterprise Station Entry
          </h2>
          <p className="text-zinc-500 font-bold uppercase tracking-widest text-[11px] max-w-md mt-1">
            {selectedNetworkId 
              ? "Select your assigned studio and tap your profile badge to verify credentials"
              : "Select your Network or Franchise Territory to view available locations"}
          </p>
        </div>

        {/* --- STEP 1: SELECT NETWORK --- */}
        {!selectedNetworkId && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {networks.map(network => {
                const networkStudios = groupedStudios.networkMap[network.id] || [];
                if (networkStudios.length === 0) return null;
                return (
                  <button
                    key={network.id}
                    onClick={() => setSelectedNetworkId(network.id)}
                    className="bg-slate-900 border border-slate-800/80 rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-[160px] relative overflow-hidden group hover:border-[#F06C22] transition-colors text-left"
                  >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#F06C22]/40 to-transparent group-hover:from-[#F06C22] transition-colors" />
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 text-[#F06C22]">
                          <ShieldCheck className="w-4 h-4" />
                        </span>
                        <span className="text-[11px] font-black uppercase bg-[#F06C22]/10 text-[#F06C22] px-2 py-0.5 rounded-full border border-[#F06C22]/15">
                          {networkStudios.length} Locations
                        </span>
                      </div>
                      
                      <h4 className="font-extrabold uppercase italic tracking-tight text-lg text-white mb-1 leading-none">
                        {network.name}
                      </h4>
                      <p className="text-[11px] font-bold text-zinc-550 uppercase tracking-widest leading-none mt-1">
                        Franchise System Territory
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* Independent / Corporate Locations */}
              {groupedStudios.unassociated.length > 0 && (
                <button
                  onClick={() => setSelectedNetworkId('independent')}
                  className="bg-slate-900 border border-slate-800/80 rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-[160px] relative overflow-hidden group hover:border-zinc-500 transition-colors text-left"
                >
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-zinc-750/40 to-transparent group-hover:from-zinc-500 transition-colors" />
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 text-zinc-400">
                        <Building2 className="w-4 h-4" />
                      </span>
                      <span className="text-[11px] font-black uppercase bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700/30">
                        {groupedStudios.unassociated.length} Locations
                      </span>
                    </div>
                    
                    <h4 className="font-extrabold uppercase italic tracking-tight text-lg text-white mb-1 leading-none">
                      Corporate / Independent
                    </h4>
                    <p className="text-[11px] font-bold text-zinc-550 uppercase tracking-widest leading-none mt-1">
                      Unassociated Bases
                    </p>
                  </div>
                </button>
              )}
            </div>

            {studios.length === 0 && (
              <div className="py-20 text-center bg-slate-900/60 rounded-[40px] border border-dashed border-slate-800">
                <Building2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                <p className="text-sm font-black uppercase tracking-widest text-zinc-450">No Authorized Studios Configuration Found</p>
                <p className="text-[11px] uppercase tracking-wider text-zinc-600 mt-2">Check corporate firestore database state</p>
              </div>
            )}
            
            <div className="mt-12 flex justify-center">
              <Button
                variant="ghost"
                onClick={onBack}
                className="text-zinc-500 hover:text-white font-black uppercase text-[11px] tracking-widest gap-2 bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
                Clear active session
              </Button>
            </div>
          </div>
        )}

        {/* --- STEP 2: SELECT STUDIO (network selected) --- */}
        {selectedNetworkId && selectedNetworkId !== 'independent' && (
          <div className="space-y-12">
            {(() => {
              const network = networks.find(n => n.id === selectedNetworkId);
              const networkStudios = groupedStudios.networkMap[selectedNetworkId] || [];
              if (!network || networkStudios.length === 0) return null;

              return (
                <div key={network.id} className="space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
                  <div className="w-1.5 h-6 bg-[#F06C22] rounded-full" />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#F06C22] italic">
                      {network.name}
                    </h3>
                    <p className="text-[11px] font-bold text-zinc-550 uppercase tracking-widest leading-none mt-0.5">
                      Franchise System Territory
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {networkStudios.map((studio) => {
                    return (
                      <button 
                        key={studio.id}
                        onClick={() => onSelectStudio(studio.id!)}
                        className="bg-slate-900 border border-slate-800/80 rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-[180px] relative overflow-hidden text-left hover:border-[#F06C22] transition-colors group"
                      >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#F06C22]/40 to-transparent group-hover:from-[#F06C22] transition-colors" />
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 text-zinc-400">
                              <Building2 className="w-4 h-4" />
                            </span>
                            <span className="text-[11px] font-black uppercase bg-[#F06C22]/10 text-[#F06C22] px-2 py-0.5 rounded-full border border-[#F06C22]/15">
                              Active
                            </span>
                          </div>
                          
                          <h4 className="font-extrabold uppercase italic tracking-tight text-lg text-white mb-1 leading-none">{studio.name}</h4>
                          <div className="flex items-center gap-1 text-zinc-500 mt-2">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="text-[11px] font-bold uppercase tracking-wider truncate">
                              {studio.address || 'Active Territory'}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                </div>
              );
            })()}

            <div className="mt-12 flex justify-center border-t border-slate-800/80 pt-8">
              <Button
                variant="ghost"
                onClick={() => setSelectedNetworkId(null)}
                className="text-zinc-500 hover:text-white font-black uppercase text-[11px] tracking-widest gap-2 bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Networks
              </Button>
            </div>
          </div>
        )}

        {/* --- STEP 2: SELECT STUDIO (independent/corporate selected) --- */}
        {selectedNetworkId === 'independent' && groupedStudios.unassociated.length > 0 && (
          <div className="space-y-12">
            <div className="space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
                <div className="w-1.5 h-6 bg-zinc-700 rounded-full" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 italic">
                    Corporate & Independent Locations
                  </h3>
                  <p className="text-[11px] font-bold text-zinc-550 uppercase tracking-widest leading-none mt-0.5">
                    Corporate Owned or Unassociated Bases
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedStudios.unassociated.map((studio) => {
                  return (
                    <button 
                      key={studio.id}
                      onClick={() => onSelectStudio(studio.id!)}
                      className="bg-slate-900 border border-slate-800/80 rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-[180px] relative overflow-hidden text-left hover:border-zinc-500 transition-colors group"
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-zinc-750/40 to-transparent group-hover:from-zinc-500 transition-colors" />
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 text-zinc-400">
                            <Building2 className="w-4 h-4" />
                          </span>
                          <span className="text-[11px] font-black uppercase bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700/30">
                            Corporate
                          </span>
                        </div>
                        
                        <h4 className="font-extrabold uppercase italic tracking-tight text-lg text-white mb-1 leading-none">{studio.name}</h4>
                        <div className="flex items-center gap-1 text-zinc-500 mt-2">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="text-[11px] font-bold uppercase tracking-wider truncate">
                            {studio.address || 'Corporate Location'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-12 flex justify-center border-t border-slate-800/80 pt-8">
              <Button
                variant="ghost"
                onClick={() => setSelectedNetworkId(null)}
                className="text-zinc-500 hover:text-white font-black uppercase text-[11px] tracking-widest gap-2 bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Networks
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
