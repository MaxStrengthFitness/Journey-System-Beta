import React from "react";
import { cn } from "@/lib/utils";
import { EliteProgressBar } from "./EliteProgressBar";

type StatTone = "up" | "down" | "flat";

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  key?: string | number;
  id: string;
  label: string;
  value: string | number;
  unit?: string;
  delta?: { text: string; tone: StatTone };
  variant?: "hero" | "default" | "elevated";
  meta?: string;
  progress?: { current: number; target: number };
  broadBreakdown?: any[];
}

export function BentoStatTile({
  label,
  value,
  unit,
  delta,
  variant = "default",
  meta,
  progress,
  broadBreakdown,
  ...props
}: StatTileProps) {
  const isZeroError = value === 0 || value === "0" || value === "0:00";

  if (variant === "hero") {
    const breakdown = broadBreakdown || [];
    return (
      <div
        {...props}
        className={cn(
          "w-full h-full rounded-2xl bg-linear-to-br from-cta to-cta-strong shadow-[0_8px_24px_rgba(240,108,34,0.15)] relative overflow-hidden p-4 sm:p-5 flex flex-col justify-between",
          isZeroError && "opacity-50 grayscale",
        )}
      >
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-5 items-center h-full w-full">
          <div className="md:col-span-2 flex flex-col justify-center">
            <span className="font-display italic text-[11px] uppercase tracking-widest text-white/70">
              {label}
            </span>
            <div className="flex items-baseline gap-1 leading-none mt-1">
              <span className="font-display italic text-[44px] xs:text-[52px] sm:text-[60px] lg:text-[68px] text-white tabular tracking-tight leading-none">
                {typeof value === "number" ? value.toLocaleString() : value}
              </span>
              {unit && (
                <span className="font-display italic text-[13px] text-white/80 ml-1">
                  {unit}
                </span>
              )}
            </div>
            {delta && (
              <span className="font-display italic text-[11px] text-white/95 mt-1.5 uppercase tracking-wide">
                {delta.text}
              </span>
            )}
          </div>

          <div className="md:col-span-3 flex flex-col justify-center border-t md:border-t-0 md:border-l border-white/10 pt-3 md:pt-0 md:pl-5 w-full h-full">
            <div className="font-display italic text-[10px] uppercase tracking-wider text-white/60 mb-2">
              TONNAGE BY MUSCLE GROUPING
            </div>
            <div className="space-y-2.5 w-full">
              {breakdown.length > 0 ? (
                breakdown.map((item: any) => {
                  const pct =
                    typeof value === "number" && value > 0
                      ? (item.value / value) * 100
                      : 0;
                  return (
                    <div key={item.name} className="flex flex-col gap-1 w-full">
                      <div className="flex justify-between items-center text-[11px] text-white font-medium">
                        <span className="flex items-center gap-1.5 tracking-wide font-sans">
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full inline-block",
                              item.color,
                            )}
                          />
                          {item.name}
                        </span>
                        <span className="font-mono text-white/90">
                          {item.value.toLocaleString()}{" "}
                          <span className="text-[9px] opacity-70">lb</span>{" "}
                          <span className="opacity-60 text-[9px] ml-1">
                            ({Math.round(pct)}%)
                          </span>
                        </span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-1.25 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300",
                            item.color,
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-white/40 italic text-[11px] py-1">
                  No muscle group volume logged yet this session.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      {...props}
      className={cn(
        "w-full h-full rounded-xl p-3 flex flex-col justify-between border",
        variant === "elevated"
          ? "bg-linear-to-br from-bg-dark-3 to-bg-dark-2 border-transparent shadow-sm"
          : "bg-bg-dark-2 border-div-d",
        isZeroError && "opacity-40",
      )}
    >
      <span className="font-display italic text-[11px] uppercase tracking-widest text-ink-d3 mb-1">
        {label}
      </span>

      <div className="flex items-baseline gap-1 mt-auto">
        <span
          className={cn(
            "font-display italic tabular-nums leading-none",
            variant === "elevated"
              ? "text-[24px] text-cta"
              : progress
                ? "text-[24px] text-green"
                : "text-[24px] text-ink-d1",
          )}
        >
          {value}
        </span>

        {(unit || meta) && (
          <span
            className={cn(
              "font-display italic text-[12px] leading-none opacity-80",
              variant === "elevated" && meta
                ? "text-ink-d3 font-sans opacity-100 italic-none text-[11px]"
                : "text-ink-d3",
            )}
          >
            {unit || meta}
          </span>
        )}
      </div>

      {progress && (
        <EliteProgressBar current={progress.current} target={progress.target} />
      )}

      {delta && !progress && (
        <span
          className={cn(
            "font-display italic text-[11px] uppercase tracking-wide mt-1.5 leading-none",
            delta.tone === "up"
              ? "text-green"
              : delta.tone === "down"
                ? "text-red"
                : "text-ink-d3",
          )}
        >
          {delta.text}
        </span>
      )}
    </div>
  );
}
