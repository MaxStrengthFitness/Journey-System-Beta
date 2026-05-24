import React from "react";
import { cn } from "@/lib/utils";

interface BottomTabBarProps {
  variant: "light" | "dark";
  activeTab: "HUB" | "CLIENT" | "SESSION" | "CATALOG" | "CALENDAR" | "INSIGHTS";
}

export function BottomTabBar({ variant, activeTab }: BottomTabBarProps) {
  const isLight = variant === "light";
  const tabs = ["HUB", "CLIENT", "SESSION", "CATALOG", "CALENDAR", "INSIGHTS"] as const;

  return (
    <div className={cn(
      "absolute bottom-0 w-full h-[72px] flex justify-between items-center px-4 pb-safe z-30",
      isLight 
        ? "bg-white border-t border-div-l shadow-[0_-4px_12px_rgba(0,0,0,0.02)]" 
        : "bg-bg-dark-2 border-t border-div-d shadow-[0_-4px_24px_rgba(0,0,0,0.5)]"
    )}>
      {tabs.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <button 
            key={tab}
            className={cn(
              "flex flex-col items-center justify-center w-[16%] min-h-[44px] h-full gap-1.5 transition-colors font-display italic tracking-widest",
              isActive 
                ? (isLight ? "text-cyan" : "text-cta drop-shadow-[0_0_8px_rgba(243,116,39,0.5)]") 
                : (isLight ? "text-ink-l3 hover:text-ink-l2" : "text-ink-d3 hover:text-ink-d2")
            )}
          >
            <div className={cn(
              "w-2 h-2 rounded-full",
              isActive 
                ? (isLight ? "bg-cyan" : "bg-cta shadow-[0_0_8px_rgba(243,116,39,1)]") 
                : "bg-transparent"
            )} />
            <span className="text-[11px] uppercase leading-none">{tab}</span>
          </button>
        );
      })}
    </div>
  );
}
