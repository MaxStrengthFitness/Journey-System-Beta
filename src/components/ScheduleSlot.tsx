import React from "react";
import { cn } from "@/lib/utils";

interface ScheduleSlotProps {
  clientName: string;
  isNextUp?: boolean;
}

export function ScheduleSlot({ clientName, isNextUp }: ScheduleSlotProps) {
  if (isNextUp) {
    return (
      <div className="flex min-h-[44px] h-full items-center justify-between px-2 bg-gradient-to-br from-cta to-cta-strong text-white rounded-lg shadow-[0_4px_12px_var(--color-cta)] font-display italic cursor-pointer">
        <span className="text-[12px] uppercase truncate max-w-[85%]">{clientName}</span>
        <div className="flex items-center justify-center w-4 h-4 rounded-full bg-white text-cta text-[10px] tabular-nums leading-none">
          1
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[44px] h-full items-center justify-between px-2 bg-white text-ink-l1 border-[1.5px] border-cta rounded-lg font-display italic cursor-pointer hover:bg-slate-50 transition-colors">
      <span className="text-[12px] uppercase truncate max-w-[85%] font-medium">{clientName}</span>
      <div className="flex items-center justify-center w-4 h-4 rounded-full bg-cta text-white text-[10px] tabular-nums leading-none">
        1
      </div>
    </div>
  );
}
