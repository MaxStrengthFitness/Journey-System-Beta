import React from "react";

interface EliteProgressBarProps {
  current: number;
  target: number;
}

export function EliteProgressBar({ current, target }: EliteProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (current / target) * 100));
  
  return (
    <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden mt-1.5 flex-shrink-0">
      <div 
        className="h-full bg-green rounded-full transition-all duration-500"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
