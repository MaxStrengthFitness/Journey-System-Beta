import React from "react";
import { cn } from "@/lib/utils";

interface FeelToggleProps {
  value: 'wiped' | 'good' | 'energized' | null;
  onChange: (val: 'wiped' | 'good' | 'energized') => void;
}

export function FeelToggle({ value, onChange }: FeelToggleProps) {
  const options = [
    { id: 'wiped', label: 'Wiped Out' },
    { id: 'good', label: 'Good' },
    { id: 'energized', label: 'Energized' },
  ] as const;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            "min-h-[44px] rounded-lg font-display italic text-[11px] uppercase tracking-wider transition-colors flex items-center justify-center",
            value === opt.id
              ? "bg-cyan text-bg-dark font-bold"
              : "bg-white/5 text-ink-d2 hover:bg-white/10 hover:text-white"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
