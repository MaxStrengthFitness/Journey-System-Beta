import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Machine } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentMachineIds: string[];
  machines: Machine[];
  onSave: (machineIds: string[]) => void;
}

const getShorthand = (name: string) => {
  return name
    .replace(/Seated /gi, '')
    .replace(/Standing /gi, '')
    .replace(/Machine/gi, '')
    .replace(/Extension/gi, 'Ext')
    .replace(/Abdominal/gi, 'Abs')
    .replace(/Shoulder/gi, 'Shldr')
    .replace(/Pullover/gi, 'Pull O.')
    .replace(/Pulldown/gi, 'Pull D.')
    .trim();
};

export function SessionRoutineManagerModal({ isOpen, onOpenChange, currentMachineIds, machines, onSave }: Props) {
  const [localIds, setLocalIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setLocalIds(currentMachineIds);
    }
  }, [isOpen, currentMachineIds]);

  const toggleMachine = (id: string) => {
    if (localIds.includes(id)) {
      setLocalIds(localIds.filter(i => i !== id));
    } else {
      setLocalIds([...localIds, id]);
    }
  };

  const moveEarlier = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const idx = localIds.indexOf(id);
    if (idx > 0) {
      const newIds = [...localIds];
      [newIds[idx], newIds[idx - 1]] = [newIds[idx - 1], newIds[idx]];
      setLocalIds(newIds);
    }
  };

  const moveLater = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const idx = localIds.indexOf(id);
    if (idx > -1 && idx < localIds.length - 1) {
      const newIds = [...localIds];
      [newIds[idx], newIds[idx + 1]] = [newIds[idx + 1], newIds[idx]];
      setLocalIds(newIds);
    }
  };

  const sortedMachines = [...machines].sort((a, b) => {
    const aSelected = localIds.includes(a.id!);
    const bSelected = localIds.includes(b.id!);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    if (aSelected && bSelected) {
      return localIds.indexOf(a.id!) - localIds.indexOf(b.id!);
    }
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[95vw] md:max-w-[95vw] w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white p-0 overflow-hidden shadow-2xl rounded-3xl flex flex-col h-[70vh]">
        <DialogHeader className="p-4 md:p-6 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 relative z-20">
          <DialogTitle className="text-xl md:text-2xl font-black uppercase tracking-widest text-slate-900 dark:text-white">Edit Routine Sequence</DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-[10px] md:text-xs mt-1 md:mt-2">
            Tap a machine to toggle it. Use arrows to reorder. Active sequence: <span className="text-[#F06C22]">{localIds.length}</span>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 md:gap-3">
            <AnimatePresence>
              {sortedMachines.map((machine) => {
                const isSelected = localIds.includes(machine.id!);
                const selectedIndex = localIds.indexOf(machine.id!);

                return (
                  <motion.div
                    layout
                    key={machine.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => toggleMachine(machine.id!)}
                    className={`
                      group cursor-pointer relative overflow-hidden rounded-lg border-2 transition-all w-full h-full min-h-[4.5rem] flex items-center p-2.5 md:p-3
                      ${isSelected 
                        ? 'bg-orange-50/50 dark:bg-[#0A2E46] border-[#F06C22] shadow-[0_0_15px_rgba(240,108,34,0.15)] opacity-100 z-10 text-slate-900 dark:text-white' 
                        : 'bg-white dark:bg-[#115E8D]/10 border-slate-200 dark:border-slate-800/50 opacity-60 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-[#115E8D]/20 hover:border-slate-300 dark:hover:border-slate-700 text-slate-500 dark:text-slate-400'
                      }
                    `}
                  >
                    {/* Left Side Sequence Indicator */}
                    <div className="mr-3 md:mr-4 shrink-0 relative">
                      <AnimatePresence mode="wait">
                        {isSelected ? (
                          <motion.div 
                            key="selected"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            className="w-8 h-8 rounded-full bg-[#F06C22] text-white flex items-center justify-center text-sm font-black shadow-[0_0_10px_rgba(240,108,34,0.5)]"
                          >
                             {selectedIndex + 1}
                          </motion.div>
                        ) : (
                          <motion.div 
                            key="unselected"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="w-8 h-8 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center group-hover:border-slate-400 dark:group-hover:border-slate-500 transition-colors"
                          >
                            <span className="text-slate-400 dark:text-slate-500 font-black group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors text-[10px] uppercase">+</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Machine Details */}
                    <div className={`flex-1 text-left flex flex-col justify-center ${isSelected ? 'pr-6 md:pr-8' : ''}`}>
                      <h3 className={`text-xs md:text-sm font-black uppercase tracking-widest leading-tight ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`} title={machine.name}>
                        {getShorthand(machine.name || '')}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                         <p className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-[#F06C22]' : 'text-slate-400 dark:text-slate-600'}`}>
                           {isSelected ? '■ Active' : '□ Inactive'}
                         </p>
                      </div>
                    </div>
                    
                    {/* Reorder Controls */}
                    {isSelected && (
                      <div className="absolute right-1.5 md:right-3 flex flex-col gap-1 items-center justify-center">
                        <button 
                          onClick={(e) => moveEarlier(e, machine.id!)} 
                          className="p-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-[#F06C22] text-slate-600 dark:text-slate-300 hover:text-white disabled:opacity-30 transition-colors shadow-sm disabled:hover:bg-slate-200 dark:disabled:hover:bg-slate-800 disabled:cursor-not-allowed"
                          disabled={selectedIndex === 0}
                          title="Move Earlier"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={(e) => moveLater(e, machine.id!)} 
                          className="p-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-[#F06C22] text-slate-600 dark:text-slate-300 hover:text-white disabled:opacity-30 transition-colors shadow-sm disabled:hover:bg-slate-200 dark:disabled:hover:bg-slate-800 disabled:cursor-not-allowed"
                          disabled={selectedIndex === localIds.length - 1}
                          title="Move Later"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        <DialogFooter className="p-4 md:p-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 relative z-20 flex flex-row items-center justify-end gap-3">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white tracking-widest uppercase font-black"
          >
            Cancel
          </Button>
          <Button 
            onClick={() => { onSave(localIds); onOpenChange(false); }}
            className="bg-[#F06C22] hover:bg-[#D95B16] text-white font-black tracking-widest uppercase ml-4 px-8 shadow-[0_0_15px_rgba(240,108,34,0.3)]"
          >
            Save Sequence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
