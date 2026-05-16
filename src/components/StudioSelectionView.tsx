
import React from 'react';
import { motion } from 'motion/react';
import { Building2, ChevronLeft, MapPin, Check } from 'lucide-react';
import { Studio } from '../types';
import { Button } from '@/components/ui/button';
import { MaxStrengthLogo } from './MaxStrengthLogo';

interface StudioSelectionViewProps {
  studios: Studio[];
  onSelect: (studioId: string) => void;
  onBack: () => void;
}

export function StudioSelectionView({ studios, onSelect, onBack }: StudioSelectionViewProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl"
      >
        <div className="text-center mb-12 flex flex-col items-center">
          <MaxStrengthLogo size="xl" className="mb-8" />
          <h2 className="text-2xl font-black uppercase italic tracking-tight text-white mb-2">Select Your Studio</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] opacity-50">
            Please choose the location you are training at today
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {studios.map((studio) => (
            <motion.button
              key={studio.id}
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(studio.id!)}
              className="group relative bg-[#1d2736]/40 backdrop-blur-xl border-2 border-slate-700/50 hover:border-[#38BDF8]/50 p-6 rounded-[32px] flex flex-col items-start gap-4 transition-all shadow-xl text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#38BDF8]/10 text-[#38BDF8] flex items-center justify-center shadow-lg border border-[#38BDF8]/20">
                <Building2 className="w-6 h-6" />
              </div>
              
              <div>
                <h3 className="font-black uppercase italic tracking-tight text-xl text-white leading-none mb-1">
                  {studio.name}
                </h3>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <MapPin className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase tracking-widest truncate max-w-[180px]">
                    {studio.address || 'Active Location'}
                  </span>
                </div>
              </div>

              <div className="absolute top-6 right-6 w-8 h-8 rounded-full bg-[#38BDF8]/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Check className="w-4 h-4 text-[#38BDF8]" />
              </div>

              {/* Decorative background glow */}
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.button>
          ))}
          {studios.length === 0 && (
            <div className="col-span-full py-20 text-center bg-[#1d2736]/20 rounded-[40px] border-2 border-dashed border-slate-700/50">
              <Building2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-sm font-bold uppercase tracking-widest text-slate-500">No Authorized Studios Found</p>
              <p className="text-[10px] uppercase text-slate-600 mt-2">Contact your administrator for access credentials</p>
            </div>
          )}
        </div>

        <div className="mt-12 flex justify-center">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-slate-500 hover:text-white font-black uppercase text-[10px] tracking-widest gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Team Selection
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
