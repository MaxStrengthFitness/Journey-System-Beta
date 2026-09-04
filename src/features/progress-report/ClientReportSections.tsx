/**
 * Client-copy renderers for the two new report sections (finalized view +
 * print). Styled to sit inside the existing navy report card: white ink,
 * translucent surfaces, the orange rule.
 */
import React from "react";
import { Dumbbell, Flag, Target } from "lucide-react";
import type { MachineProgression, ReportGoals } from "../../types";
import { GOAL_OUTCOME_LABELS } from "./steps";

const fmt = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

function Rule({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h3 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.3em] text-[#F06C22]">{title}</h3>
      <div className="h-px flex-1 bg-[#F06C22]/20" />
    </div>
  );
}

export function MachineProgressionCard({ value }: { value: MachineProgression }) {
  const rows = value.rows.filter((r) => value.includedMachineIds.includes(r.machineId));
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3 break-inside-avoid">
      <Rule icon={<Dumbbell className="h-4 w-4 text-[#F06C22]" />} title="Machine Progression" />
      <div className="overflow-hidden rounded-[20px] border border-white/10 bg-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-widest text-white/60">
              <th className="p-3 text-left">Machine</th>
              <th className="p-3 text-right">Start</th>
              <th className="p-3 text-right">Now</th>
              <th className="p-3 text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.currentWeight - r.startWeight;
              return (
                <tr key={r.machineId} className="border-t border-white/10">
                  <td className="p-3 font-bold text-white">{r.label}</td>
                  <td className="p-3 text-right tabular-nums text-white/60">{r.startWeight} lb</td>
                  <td className="p-3 text-right font-black tabular-nums text-white">{r.currentWeight} lb</td>
                  <td
                    className={`p-3 text-right font-black tabular-nums ${
                      delta > 0 ? "text-[#F06C22]" : delta < 0 ? "text-rose-300" : "text-white/50"
                    }`}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta} lb
                    <span className="ml-1 text-[11px] font-bold text-white/60">
                      ({r.percentageIncrease > 0 ? "+" : ""}
                      {r.percentageIncrease}%)
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {value.narrative && (
        <p className="px-1 text-sm italic leading-relaxed text-white/85">“{value.narrative}”</p>
      )}
    </section>
  );
}

export function GoalsCard({ value, clientFirstName }: { value: ReportGoals; clientFirstName: string }) {
  const hasPrev = value.previousGoal || value.previousGoalNote;
  const checkpoints = (value.checkpoints ?? []).filter((c) => c.text.trim());
  if (!value.originalWhy && !hasPrev && !value.nextGoal) return null;

  const outcomeTone =
    value.previousGoalOutcome === "achieved"
      ? "bg-emerald-500 text-white"
      : value.previousGoalOutcome === "on_track"
        ? "bg-[#0A548B] text-white"
        : value.previousGoalOutcome === "stalled"
          ? "bg-rose-500 text-white"
          : "bg-white/20 text-white";

  return (
    <section className="space-y-3 break-inside-avoid">
      <Rule icon={<Target className="h-4 w-4 text-[#F06C22]" />} title="Your Goals" />
      <div className="grid gap-3 md:grid-cols-3">
        {value.originalWhy && (
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/60">Why you started</p>
            <p className="text-sm font-bold italic leading-snug text-white">“{value.originalWhy}”</p>
          </div>
        )}
        {hasPrev && (
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Last time's goal</p>
              {value.previousGoalOutcome && (
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${outcomeTone}`}>
                  {GOAL_OUTCOME_LABELS[value.previousGoalOutcome]}
                </span>
              )}
            </div>
            {value.previousGoal && <p className="text-sm font-bold text-white">{value.previousGoal}</p>}
            {value.previousGoalNote && (
              <p className="mt-1 text-[13px] italic leading-snug text-white/80">“{value.previousGoalNote}”</p>
            )}
          </div>
        )}
        {value.nextGoal && (
          <div className="rounded-[20px] bg-[#F06C22] p-4 text-white shadow-xl shadow-[#F06C22]/30">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/85">
              <Flag className="h-3 w-3" /> The next 90 days
            </div>
            <p className="text-base font-black italic leading-tight">{value.nextGoal}</p>
            {value.nextGoalTargetDate && (
              <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-white/85">
                by {fmt(value.nextGoalTargetDate)}
              </p>
            )}
          </div>
        )}
      </div>
      {(checkpoints.length > 0 || value.followUpDate) && (
        <div className="flex flex-col gap-3 rounded-[20px] border border-white/10 bg-white/5 p-4 md:flex-row md:items-start md:justify-between">
          {checkpoints.length > 0 && (
            <ol className="space-y-1.5">
              {checkpoints.map((c, i) => (
                <li key={c.id} className="flex items-start gap-2 text-sm text-white">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F06C22] text-[10px] font-black">
                    {i + 1}
                  </span>
                  {c.text}
                </li>
              ))}
            </ol>
          )}
          {value.followUpDate && (
            <div className="shrink-0 text-left md:text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/60">We check in again</p>
              <p className="text-lg font-black italic text-[#F06C22]">{fmt(value.followUpDate)}</p>
              <p className="text-[11px] text-white/60">See you there, {clientFirstName}.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
