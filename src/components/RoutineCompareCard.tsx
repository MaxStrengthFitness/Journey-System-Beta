import React from "react";
import { cn } from "@/lib/utils";
import { Target, List } from "lucide-react";

interface RoutineCompareCardProps {
  variant: "scheduled" | "previous";
  label: string;
  title: string;
  meta: string;
}

export function RoutineCompareCard({ variant, label, title, meta }: RoutineCompareCardProps) {
  const isScheduled = variant === "scheduled";
  
  return (
    <div
      className={cn(
        "relative flex flex-col p-3 rounded-xl border overflow-hidden h-[76px] justify-center",
        isScheduled
          ? "bg-cyan-900/20 border-cyan/30"
          : "bg-bg-dark-2 border-div-d"
      )}
    >
      <div className="flex flex-col z-10">
        <span
          className={cn(
            "text-[10px] uppercase font-display italic tracking-wider mb-0.5",
            isScheduled ? "text-cyan" : "text-ink-d3"
          )}
        >
          {label}
        </span>
        <span className="text-[16px] text-white uppercase font-display italic leading-none mb-1">
          {title}
        </span>
        <span className={cn("text-[11px] font-display italic opacity-80", isScheduled ? "text-cyan/80" : "text-ink-d2")}>
          {meta}
        </span>
      </div>
      
      {/* Decorative Icon Background */}
      <div className="absolute right-[-10px] bottom-[-10px] opacity-20 pointer-events-none">
        {isScheduled ? (
          <Target className="w-16 h-16 text-cyan" strokeWidth={1} />
        ) : (
          <List className="w-16 h-16 text-white" strokeWidth={1} />
        )}
      </div>
    </div>
  );
}
