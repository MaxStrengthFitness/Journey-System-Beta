import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Timer, TrendingUp, ChevronRight, GripVertical, X } from 'lucide-react';
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
  onRemove,
  className
}: ExecutionSequenceCardProps) {
  // Sliced to max 6 entries per requirement, safely fallback
  const displayHistory = history.slice(-6);

  return (
    <Card
      className={cn(
        "relative overflow-hidden flex flex-col justify-between bg-[#0B151F] text-zinc-50 border-slate-700/50 shadow-sm transition-all group",
        isStaticHold && "border-l-[3px] border-l-[#F06C22] bg-[#F06C22]/5",
        showDragHandle && "cursor-move",
        className
      )}
    >
      <div className="p-2 sm:p-3 flex items-center gap-2">
        {showDragHandle && (
          <div className="flex-shrink-0 cursor-move text-slate-600 hover:text-slate-400">
            <GripVertical className="w-4 h-4 pointer-events-none" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex flex-row items-center gap-3 sm:gap-6">
              {/* Level 1: The Anchor */}
              <h2 className="text-sm sm:text-base font-black italic tracking-tighter uppercase text-white leading-none truncate w-[100px] sm:w-[140px]">
                {machineName}
              </h2>

              {/* Level 2: The Load & Stimulus */}
              <div className="flex items-baseline gap-3 sm:gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black tracking-tighter tabular-nums leading-none text-[#38BDF8]">
                    {weight || 0}
                  </span>
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-slate-500">
                    lbs
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black tracking-tighter tabular-nums leading-none">
                    {repsOrSeconds || 0}
                  </span>
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-[#F06C22]">
                    {isStaticHold ? 'sec' : 'reps'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions / Protocol Override (TSC Badge) */}
            <div className="flex items-center gap-2 shrink-0">
              {isStaticHold && (
                <Badge 
                  variant="outline" 
                  className="px-1.5 py-0.5 flex items-center gap-1 bg-[#F06C22]/10 text-[#F06C22] border-[#F06C22]/30 uppercase tracking-widest font-black text-[8px]"
                >
                  <Timer className="w-2.5 h-2.5" />
                  TSC
                </Badge>
              )}
              {onRemove && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                  className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Level 3: The Delta (History Micro-Timeline) */}
      {displayHistory.length > 0 && (
        <div className="px-3 py-1.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2 overflow-hidden h-6">
          <TrendingUp className="w-3 h-3 text-slate-600 shrink-0" />
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar whitespace-nowrap text-[9px] font-mono font-medium text-slate-400">
            {displayHistory.map((entry, index) => (
              <React.Fragment key={index}>
                <div className="flex items-baseline opacity-80 hover:opacity-100 hover:text-white transition-opacity">
                  <span className="font-bold">{entry.weight}</span>
                  <span className="text-slate-600 mx-0.5 text-[8px]">x</span>
                  <span>{entry.repsOrSeconds}</span>
                </div>
                {index < displayHistory.length - 1 && (
                  <ChevronRight className="w-2.5 h-2.5 text-slate-700 shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
