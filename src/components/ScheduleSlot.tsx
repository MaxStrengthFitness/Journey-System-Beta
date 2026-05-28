import React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ScheduleSlotProps {
  clientName: string;
  isNextUp?: boolean;
}

export function ScheduleSlot({ clientName, isNextUp }: ScheduleSlotProps) {
  const content = (
    <div className={cn(
      "group flex min-h-[44px] h-full items-center justify-between px-2 rounded-lg font-display italic cursor-pointer transition-colors relative min-w-0 w-full",
      isNextUp 
        ? "bg-gradient-to-br from-cta to-cta-strong text-white shadow-[0_4px_12px_var(--color-cta)]" 
        : "bg-white text-ink-l1 border-[1.5px] border-cta hover:bg-slate-50"
    )}>
      <div className="flex-1 min-w-0 flex items-center pr-2">
        <span className={cn(
          "text-[12px] uppercase truncate text-ellipsis",
          !isNextUp && "font-medium"
        )}>
          {clientName}
        </span>
      </div>
      <div className={cn(
        "flex items-center justify-center w-4 h-4 rounded-full text-[11px] tabular-nums leading-none shrink-0",
        isNextUp ? "bg-white text-cta" : "bg-cta text-white"
      )}>
        1
      </div>
    </div>
  );

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger render={content} />
        <TooltipContent side="top" className="bg-slate-900 text-white border-slate-800 text-[11px] font-sans font-medium uppercase tracking-wide">
          <p>{clientName}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
