import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Timer, ChevronUp, ChevronDown, TrendingUp, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HistoryEntry {
  weight: number;
  repsOrSeconds: number;
}

interface ExecutionSequenceCardProps {
  machineName: string;
  weight: number;
  repsOrSeconds: number;
  isStaticHold: boolean;
  history?: HistoryEntry[];
  showDragHandle?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function ExecutionSequenceCard({
  machineName,
  weight,
  repsOrSeconds,
  isStaticHold,
  history = [],
  showDragHandle,
  onMoveUp,
  onMoveDown,
  onRemove,
  className
}: ExecutionSequenceCardProps) {
  // Sliced to max 6 entries per requirement, safely fallback
  const displayHistory = history.slice(-6);

  return (
    <Card
      className={cn(
        "relative overflow-hidden flex flex-col justify-between bg-[#0B151F] text-zinc-50 border-slate-700/50 shadow-sm transition-all group",
        isStaticHold && "border-l-[4px] border-l-[#F06C22] bg-gradient-to-r from-[#F06C22]/10 to-transparent",
        className
      )}
    >
      <div className="p-3 sm:p-4 flex items-center gap-3">
        {/* Reordering Controls */}
        <div className="flex flex-col gap-1 items-center justify-center -ml-1 shrink-0">
          <button 
            type="button" 
            onClick={onMoveUp} 
            className={cn("p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 active:scale-95 transition-all text-[10px]", !onMoveUp && "opacity-0 pointer-events-none")}
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button 
            type="button" 
            onClick={onMoveDown} 
            className={cn("p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 active:scale-95 transition-all text-[10px]", !onMoveDown && "opacity-0 pointer-events-none")}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black italic tracking-tighter uppercase text-white leading-none truncate">
                  {machineName}
                </h2>
                {isStaticHold && (
                  <Badge 
                    variant="outline" 
                    className="px-1.5 py-0.5 flex items-center gap-1 bg-[#F06C22]/20 text-[#F06C22] border-[#F06C22]/50 uppercase tracking-widest font-black text-[9px]"
                  >
                    <Timer className="w-3 h-3" />
                    Timed Static Contraction
                  </Badge>
                )}
              </div>
            </div>

            {/* Target Load & Stimulus */}
            <div className="flex items-center gap-4 bg-slate-800/80 px-4 py-2 rounded-xl shrink-0 border border-slate-700/50">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-0.5">Last Load</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black tracking-tighter tabular-nums leading-none text-[#38BDF8]">
                    {weight || 0}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    lbs
                  </span>
                </div>
              </div>
              <div className="w-[1px] h-8 bg-slate-700/50" />
              <div className="flex flex-col items-start">
                 <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-0.5">Last Effort</span>
                 <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black tracking-tighter tabular-nums leading-none text-white">
                    {repsOrSeconds || 0}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[#F06C22]">
                    {isStaticHold ? 's' : 'reps'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Remove Action */}
        <div className="pl-2 border-l border-slate-800 shrink-0 self-stretch flex items-center">
          {onRemove && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-white bg-slate-800/50 hover:bg-rose-500 hover:shadow-[0_0_15px_rgba(244,63,94,0.3)] transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Level 3: The Delta (History Micro-Timeline) */}
      {displayHistory.length > 0 && (
        <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center gap-3">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#68717A] shrink-0">Historical Log</span>
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar whitespace-nowrap text-[10px] font-mono font-medium text-slate-400 pb-0.5">
            {displayHistory.map((entry, index) => (
              <React.Fragment key={index}>
                <div className="flex items-baseline opacity-80 hover:opacity-100 hover:text-white transition-opacity bg-slate-800 px-2 py-0.5 rounded">
                  <span className="font-bold text-slate-200">{entry.weight}</span>
                  <span className="text-slate-500 mx-1 text-[8px]">x</span>
                  <span className="font-bold">{entry.repsOrSeconds}{isStaticHold ? 's' : ''}</span>
                </div>
                {index < displayHistory.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-slate-700 shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
