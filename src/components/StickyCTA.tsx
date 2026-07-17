import React from "react";
import { cn } from "@/lib/utils";

export interface StickyCTAProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon?: React.ReactNode;
  bottomOffset?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export function StickyCTA({ label, icon, bottomOffset = "0", className, ...props }: StickyCTAProps) {
  return (
    <div 
      className="absolute left-0 w-full h-[100px] px-6 pb-6 pt-3 flex items-end justify-center z-20 pointer-events-none"
      style={{ 
        bottom: bottomOffset,
        background: 'linear-gradient(to top, var(--bg-dark) 60%, rgba(13,26,43,0) 100%)' 
      }}
    >
      <button 
        {...props}
        className={cn(
          "w-full h-[60px] min-h-[44px] rounded-[30px] font-display italic text-[18px] uppercase tracking-wide",
          "bg-gradient-to-br from-cta to-cta-strong text-white",
          "shadow-[0_4px_24px_rgba(243,116,39,0.3)] hover:shadow-[0_6px_32px_rgba(243,116,39,0.4)]",
          "border border-white/20 transition-all pointer-events-auto",
          "flex items-center justify-center gap-2",
          className
        )}
      >
        {icon}
        {label}
      </button>
    </div>
  );
}
