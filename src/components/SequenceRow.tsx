import React from "react";
import { ChevronRight, GripHorizontal, Timer } from "lucide-react";

interface SeqMachine {
  idx: number;
  name: string;
  lastLb: number | null;
  lastReps: number | null;
  lastUnit?: 'reps' | 'sec';
  isTSC?: boolean;
}

interface SequenceRowProps extends React.HTMLAttributes<HTMLDivElement> {
  key?: number | string;
  machine: SeqMachine;
}

export function SequenceRow({ machine, ...props }: SequenceRowProps) {
  return (
    <div {...props} className="flex items-center bg-bg-dark-2 border border-div-d rounded-[10px] px-3.5 py-2.5 h-[52px]">
      <div className="w-5 text-cta font-display italic text-[12px] font-bold">
        {machine.idx}
      </div>

      <div className="flex-1 flex gap-2 items-center text-white font-display italic text-[14px] uppercase tracking-[0.02em] truncate">
        <span>{machine.name}</span>
        {machine.isTSC && (
           <span className="flex items-center gap-1 bg-cyan/10 text-cyan rounded-full px-1.5 py-0.5 text-[11px]">
              <Timer className="w-3 h-3" />
              <span>TSC</span>
           </span>
        )}
      </div>

      <div className="flex items-center gap-4 mr-3">
        <div className="flex flex-col items-end justify-center">
          <span className="text-[11px] text-ink-d3 font-medium tracking-wide opacity-60 uppercase mb-0.5">LAST LB</span>
          <span className="text-[15px] text-white font-black italic tabular-nums leading-none">
            {machine.lastLb !== null ? machine.lastLb : <span className="text-ink-d3">—</span>}
          </span>
        </div>
        <div className="flex flex-col items-end justify-center w-12">
          <span className="text-[11px] text-ink-d3 font-medium tracking-wide opacity-60 uppercase mb-0.5">
            LAST {machine.lastUnit === 'sec' ? 'SEC' : 'REPS'}
          </span>
          <span className="text-[15px] text-white font-black italic tabular-nums leading-none">
            {machine.lastReps !== null ? machine.lastReps : <span className="text-ink-d3">—</span>}
          </span>
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-ink-d3 opacity-50" />
    </div>
  );
}
