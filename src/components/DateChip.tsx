import React from "react";
import { cn } from "@/lib/utils";

interface DateChipProps {
  dayOfWeek: string;
  dayOfMonth: number;
  isActive?: boolean;
}

export function DateChip({ dayOfWeek, dayOfMonth, isActive }: DateChipProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center h-[56px] rounded-xl cursor-pointer transition-colors font-display italic",
        isActive
          ? "bg-cyan text-bg-dark"
          : "bg-div-d text-ink-d2 hover:text-ink-d1 hover:bg-white/10"
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide opacity-70 opacity-80 leading-tight">
        {dayOfWeek}
      </span>
      <span className="text-xl leading-none tabular">{dayOfMonth}</span>
    </div>
  );
}
