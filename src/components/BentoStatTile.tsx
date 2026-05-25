import React from "react";
import { cn } from "@/lib/utils";
import { EliteProgressBar } from "./EliteProgressBar";

type StatTone = 'up' | 'down' | 'flat';

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  key?: string | number;
  id: string;
  label: string;
  value: string | number;
  unit?: string;
  delta?: { text: string; tone: StatTone };
  variant?: 'hero' | 'default' | 'elevated';
  meta?: string;
  progress?: { current: number; target: number };
}

export function BentoStatTile({
  label,
  value,
  unit,
  delta,
  variant = 'default',
  meta,
  progress,
  ...props
}: StatTileProps) {
  const isZeroError = value === 0 || value === "0" || value === "0:00";

  if (variant === 'hero') {
    return (
      <div {...props} className={cn(
        "col-span-4 row-span-2 flex flex-col justify-end p-[14px] px-3.5 rounded-2xl bg-gradient-to-br from-cta to-cta-strong shadow-[0_12px_32px_var(--color-cta)] relative overflow-hidden",
        isZeroError && "opacity-50 grayscale"
      )}>
        <span className="font-display italic text-[11px] uppercase tracking-widest text-white/70 mb-1 z-10">
          {label}
        </span>
        <div className="flex items-baseline gap-1.5 leading-none z-10">
          <span className="font-display italic text-[64px] text-white tabular tracking-tight leading-[0.8] mt-2 mb-1">
            {value}
          </span>
          {unit && <span className="font-display italic text-[13px] text-white/80">{unit}</span>}
        </div>
        {delta && (
          <span className="font-display italic text-[11px] text-white/95 mt-1 uppercase tracking-wide z-10">
            {delta.text}
          </span>
        )}
      </div>
    );
  }

  return (
    <div {...props} className={cn(
      "col-span-2 row-span-1 rounded-xl p-3 flex flex-col justify-between border",
      variant === 'elevated'
        ? "bg-gradient-to-br from-bg-dark-3 to-bg-dark-2 border-transparent shadow-sm"
        : "bg-bg-dark-2 border-div-d",
      isZeroError && "opacity-40"
    )}>
      <span className="font-display italic text-[11px] uppercase tracking-widest text-ink-d3 mb-1">
        {label}
      </span>
      
      <div className="flex items-baseline gap-1 mt-auto">
        <span className={cn(
          "font-display italic tabular-nums leading-none",
          variant === 'elevated' ? "text-[24px] text-cta" 
            : progress ? "text-[24px] text-green" 
            : "text-[24px] text-white"
        )}>
          {value}
        </span>
        
        {(unit || meta) && (
          <span className={cn(
            "font-display italic text-[12px] leading-none opacity-80",
            (variant === 'elevated' && meta) ? "text-ink-d3 font-sans opacity-100 italic-none text-[11px]" : "text-ink-d3"
          )}>
            {unit || meta}
          </span>
        )}
      </div>

      {progress && (
        <EliteProgressBar current={progress.current} target={progress.target} />
      )}

      {delta && !progress && (
        <span className={cn(
          "font-display italic text-[11px] uppercase tracking-wide mt-1.5 leading-none",
          delta.tone === 'up' ? "text-green" :
          delta.tone === 'down' ? "text-red" : "text-ink-d3"
        )}>
          {delta.text}
        </span>
      )}
    </div>
  );
}
