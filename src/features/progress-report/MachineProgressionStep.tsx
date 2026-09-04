/**
 * Step 3 — Machine progression.
 *
 * The report page already computes start / current / % for EVERY machine
 * (it feeds the highlight dropdown). This step finally shows that table and
 * lets the trainer tick which rows the client sees. Rows are captured onto
 * the report at tick time so the printed copy never changes after the fact.
 */
import React, { useEffect } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { MachineProgression, MachineProgressionRow } from "../../types";

export interface MachineStats {
  startWeight: number;
  currentWeight: number;
  percentageIncrease: number;
  totalVolume?: number;
  perfectSets?: number;
  timeUnderTension?: number;
}

export interface MachineProgressionStepProps {
  machines: { id?: string; name: string }[];
  /** machineId → stats, as loaded by the report page. */
  history: Record<string, MachineStats | undefined>;
  value: MachineProgression;
  onChange: (next: MachineProgression) => void;
  /** How many to pre-tick the first time (biggest % gains). */
  autoPick?: number;
}

export function rowsFromHistory(
  machines: { id?: string; name: string }[],
  history: Record<string, MachineStats | undefined>,
): MachineProgressionRow[] {
  return machines
    .filter((m) => m.id && history[m.id])
    .map((m) => {
      const h = history[m.id!]!;
      return {
        machineId: m.id!,
        label: m.name,
        startWeight: h.startWeight,
        currentWeight: h.currentWeight,
        percentageIncrease: h.percentageIncrease,
        totalVolume: h.totalVolume,
        perfectSets: h.perfectSets,
        timeUnderTension: h.timeUnderTension,
      };
    })
    .filter((r) => r.startWeight > 0 || r.currentWeight > 0)
    .sort((a, b) => b.percentageIncrease - a.percentageIncrease);
}

export function MachineProgressionStep({
  machines,
  history,
  value,
  onChange,
  autoPick = 5,
}: MachineProgressionStepProps) {
  const rows = rowsFromHistory(machines, history);

  // First time the history lands and nothing is ticked: pre-tick the biggest
  // gains so a trainer in a hurry still ships a useful table.
  useEffect(() => {
    if (rows.length === 0) return;
    if (value.includedMachineIds.length === 0 && value.rows.length === 0) {
      onChange({
        ...value,
        rows,
        includedMachineIds: rows.filter((r) => r.percentageIncrease > 0).slice(0, autoPick).map((r) => r.machineId),
      });
    } else if (value.rows.length !== rows.length) {
      onChange({ ...value, rows });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const toggle = (id: string) =>
    onChange({
      ...value,
      rows,
      includedMachineIds: value.includedMachineIds.includes(id)
        ? value.includedMachineIds.filter((x) => x !== id)
        : [...value.includedMachineIds, id],
    });

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
        No machine history in this window yet. Widen the timeframe in step 1, or skip this step.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#68717A]">
          {value.includedMachineIds.length} of {rows.length} shown to the client
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="h-9 rounded-xl border border-slate-200 px-3 text-[11px] font-black uppercase tracking-wider text-[#0A2E46] dark:border-slate-700 dark:text-white"
            onClick={() => onChange({ ...value, rows, includedMachineIds: rows.map((r) => r.machineId) })}
          >
            Show all
          </button>
          <button
            type="button"
            className="h-9 rounded-xl border border-slate-200 px-3 text-[11px] font-black uppercase tracking-wider text-[#0A2E46] dark:border-slate-700 dark:text-white"
            onClick={() => onChange({ ...value, rows, includedMachineIds: [] })}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-[#68717A] dark:bg-slate-800/60">
            <tr>
              <th className="p-3 text-left">Show</th>
              <th className="p-3 text-left">Machine</th>
              <th className="p-3 text-right">Start</th>
              <th className="p-3 text-right">Now</th>
              <th className="p-3 text-right">Change</th>
              <th className="hidden p-3 text-right md:table-cell">Perfect sets</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = value.includedMachineIds.includes(r.machineId);
              const delta = r.currentWeight - r.startWeight;
              const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
              const tone = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-500" : "text-slate-400";
              return (
                <tr
                  key={r.machineId}
                  onClick={() => toggle(r.machineId)}
                  className={[
                    "cursor-pointer border-t border-slate-100 dark:border-slate-800",
                    on ? "bg-[#F06C22]/5" : "opacity-70",
                  ].join(" ")}
                >
                  <td className="p-3">
                    <span
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`Show ${r.label}`}
                      className={[
                        "inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 text-white",
                        on ? "border-[#F06C22] bg-[#F06C22]" : "border-slate-300 dark:border-slate-600",
                      ].join(" ")}
                    >
                      {on ? "✓" : ""}
                    </span>
                  </td>
                  <td className="p-3 font-bold text-[#0A2E46] dark:text-white">{r.label}</td>
                  <td className="p-3 text-right tabular-nums text-slate-500">{r.startWeight} lb</td>
                  <td className="p-3 text-right font-black tabular-nums text-[#0A2E46] dark:text-white">
                    {r.currentWeight} lb
                  </td>
                  <td className={`p-3 text-right font-black tabular-nums ${tone}`}>
                    <span className="inline-flex items-center gap-1">
                      <Icon className="h-3.5 w-3.5" />
                      {delta > 0 ? "+" : ""}
                      {delta} lb · {r.percentageIncrease > 0 ? "+" : ""}
                      {r.percentageIncrease}%
                    </span>
                  </td>
                  <td className="hidden p-3 text-right tabular-nums text-slate-500 md:table-cell">
                    {r.perfectSets ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-[#68717A]">
          The story behind the numbers (optional)
        </label>
        <textarea
          className="min-h-[72px] w-full rounded-2xl border-2 border-slate-100 p-3 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          placeholder="e.g. We rested the leg press for three weeks after the knee flare-up and still came back stronger."
          value={value.narrative ?? ""}
          onChange={(e) => onChange({ ...value, narrative: e.target.value })}
        />
      </div>
    </div>
  );
}
