import React from "react";
import { cn } from "@/lib/utils";

/**
 * THE IDS ARE THE STORED VALUES, AND THEY ARE `ClientFeel` (Sep 2026).
 *
 * They used to be 'wiped' | 'good' | 'energized'. Those strings went straight
 * into `session.clientFeel`, and the only thing that reads that field —
 * `postFeelOf` in features/clinical-review/facts.ts — matches "Wiped Out" |
 * "Good" | "Energized" and returns null for anything else. So every
 * post-session feel a trainer recorded was dropped on the floor by the
 * clinical review, silently, and the unit tests passed because their fixture
 * used the Title Case spelling the UI never produced.
 *
 * The mismatch survived because VictoryHUDScreen declared its state as a
 * THIRD vocabulary ("great" | "fatigued" | "sore" | ...) and reconciled the
 * two with `as any`. Typing this against ClientFeel is what makes the three
 * agree, and what would have caught it.
 */
import type { ClientFeel } from "../types";

interface FeelToggleProps {
  value: ClientFeel | null;
  onChange: (val: ClientFeel) => void;
}

export function FeelToggle({ value, onChange }: FeelToggleProps) {
  const options = [
    { id: 'Wiped Out', label: 'Wiped Out' },
    { id: 'Good', label: 'Good' },
    { id: 'Energized', label: 'Energized' },
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
