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
        "relative flex flex-col p-3 rounded-[14px] overflow-hidden justify-center h-[76px]",
        isScheduled
          ? "bg-bg-dark-2"
          : "bg-surface-subtle border-transparent"
      )}
    >
      <div className="flex flex-col z-10">
        <span
          className={cn(
            "text-[11px] font-medium tracking-wide opacity-60 uppercase mb-1",
            isScheduled ? "text-cyan" : "text-ink-d2"
          )}
        >
          {label}
        </span>
        <span className="text-[16px] text-white uppercase font-black tracking-wide leading-none mb-1">
          {title}
        </span>
        <span className={cn("text-[11px] font-medium font-sans opacity-80", isScheduled ? "text-cyan/80" : "text-ink-d3")}>
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
