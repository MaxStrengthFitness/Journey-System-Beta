import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Timer, GripVertical, TrendingUp, ChevronRight, X } from 'lucide-react';
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
  dragListeners?: any;
  dragAttributes?: any;
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
  dragListeners,
  dragAttributes,
  onRemove,
  className
}: ExecutionSequenceCardProps) {
  // Sliced to max 6 entries per requirement, safely fallback
  const displayHistory = history.slice(-6);

  return (
    <Card
      className={cn(
        "relative overflow-hidden flex flex-col justify-between bg-surface-1 text-ink-d1 border-div-d shadow-sm transition-all group",
        isStaticHold && "border-l-[4px] border-l-[#F06C22] bg-gradient-to-r from-[#F06C22]/10 to-transparent",
        className
      )}
    >
      <div className="p-3 sm:p-4 flex items-center gap-3">
        {/* Reordering Controls */}
        {showDragHandle && (
          <div className="flex flex-col gap-1 items-center justify-center -ml-1 shrink-0">
            <div 
              {...dragListeners}
              {...dragAttributes}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] cursor-grab active:cursor-grabbing text-ink-d2 hover:text-white bg-surface-2 hover:bg-surface-2/80 rounded-xl transition-colors border border-transparent hover:border-div-d touch-none"
            >
              <GripVertical className="w-5 h-5 pointer-events-none" />
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-display italic font-bold tracking-tighter uppercase text-white leading-none truncate">
                  {machineName}
                </h2>
                {isStaticHold && (
                  <Badge 
                    variant="outline" 
                    className="px-1.5 py-0.5 flex items-center gap-1 bg-cta/20 text-cta border-cta/50 uppercase tracking-widest font-bold text-[11px]"
                  >
                    <Timer className="w-3 h-3" />
                    Timed Static Contraction
                  </Badge>
                )}
              </div>
            </div>

            {/* Target Load & Stimulus */}
            <div className="flex items-center gap-4 bg-surface-2 px-4 py-2 rounded-xl shrink-0 border border-div-d">
              <div className="flex flex-col items-end">
                <span className="text-[11px] font-bold uppercase text-ink-d3 tracking-widest mb-0.5">Last Load</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-bold tracking-tighter tabular-nums leading-none text-cyan">
                    {weight || 0}
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d2">
                    lbs
                  </span>
                </div>
              </div>
              <div className="w-[1px] h-8 bg-surface-2/50" />
              <div className="flex flex-col items-start">
                 <span className="text-[11px] font-bold uppercase text-ink-d3 tracking-widest mb-0.5">Last Effort</span>
                 <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-bold tracking-tighter tabular-nums leading-none text-white">
                    {repsOrSeconds || 0}
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-cta">
                    {isStaticHold ? 's' : 'reps'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Remove Action */}
        <div className="pl-2 border-l border-div-d shrink-0 self-stretch flex items-center">
          {onRemove && (
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-ink-d3 hover:text-white bg-surface-2 hover:bg-rose-500 hover:shadow-[0_0_15px_rgba(244,63,94,0.3)] transition-all"
            >
              <X className="w-5 h-5 pointer-events-none" />
            </button>
          )}
        </div>
      </div>

      {/* Level 3: The Delta (History Micro-Timeline) */}
      {displayHistory.length > 0 && (
        <div className="px-4 py-2 bg-bg-dark border-t border-div-d flex items-center gap-3">
          <span className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d3 shrink-0">Historical Log</span>
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar whitespace-nowrap text-[11px] font-mono font-medium text-ink-d2 pb-0.5">
            {displayHistory.map((entry, index) => (
              <React.Fragment key={index}>
                <div className="flex items-baseline opacity-80 hover:opacity-100 hover:text-white transition-opacity bg-surface-1 px-2 py-0.5 rounded">
                  <span className="font-bold text-ink-d1">{entry.weight}</span>
                  <span className="text-ink-d3 mx-1 text-[11px]">x</span>
                  <span className="font-bold">{entry.repsOrSeconds}{isStaticHold ? 's' : ''}</span>
                </div>
                {index < displayHistory.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-ink-l2 shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
