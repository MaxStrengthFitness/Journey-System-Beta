import React from "react";
import { cn } from "@/lib/utils";

interface ConditionChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  key?: number | string;
  label: string;
  severity: 'critical' | 'standard';
}

export function ConditionChip({ label, severity, ...props }: ConditionChipProps) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center px-2 py-1 rounded-md text-[10px] uppercase font-display italic tracking-wider whitespace-nowrap",
        severity === "critical"
          ? "bg-red-500/10 border border-cta/30 text-cta"
          : "bg-cyan-500/10 border border-cyan/30 text-[#84B5EE]"
      )}
    >
      {label}
    </span>
  );
}
