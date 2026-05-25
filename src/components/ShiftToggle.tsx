import React from "react";
import { cn } from "@/lib/utils";

interface ShiftToggleProps {
  activeShift: "AM" | "PM";
  amCount: number;
  pmCount: number;
  onChange?: (shift: "AM" | "PM") => void;
}

export function ShiftToggle({
  activeShift,
  amCount,
  pmCount,
  onChange,
}: ShiftToggleProps) {
  return (
    <div className="flex bg-bg-dark-2 rounded-xl p-1 font-display italic border border-div-d min-h-[44px] max-w-[300px] flex-1">
      <button
        onClick={() => onChange?.("AM")}
        className={cn(
          "flex-1 rounded-lg flex items-center justify-center gap-1.5 transition-colors h-full",
          activeShift === "AM"
            ? "bg-cyan text-bg-dark font-bold"
            : "text-ink-d2 hover:text-ink-d1"
        )}
      >
        <span className="text-lg">AM</span>
        <span className="text-[11px] opacity-80 uppercase tabular-nums">· {amCount} SESS</span>
      </button>
      <button
        onClick={() => onChange?.("PM")}
        className={cn(
          "flex-1 rounded-lg flex items-center justify-center gap-1.5 transition-colors h-full",
          activeShift === "PM"
            ? "bg-cyan text-bg-dark font-bold"
            : "text-ink-d2 hover:text-ink-d1"
        )}
      >
        <span className="text-lg">PM</span>
        <span className="text-[11px] opacity-80 uppercase tabular-nums">· {pmCount} SESS</span>
      </button>
    </div>
  );
}
