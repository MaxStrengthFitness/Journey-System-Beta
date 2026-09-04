/**
 * Step 6 — goal continuity. Sits above the training-track picker.
 *
 * Three beats: why they started (carried forward every report), how the
 * goal from last time went, and the goal for the next 90 days with a date
 * and two or three checkpoints. The follow-up date is what the trainer
 * chases in 90 days — it is the retention hook.
 */
import React from "react";
import type { GoalOutcome, ReportGoals } from "../../types";
import { GOAL_OUTCOME_LABELS } from "./steps";

const field =
  "w-full rounded-2xl border-2 border-slate-100 p-3 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white";
const label = "mb-2 block text-[11px] font-bold uppercase tracking-widest text-[#68717A]";

export function GoalsBlock({
  value,
  onChange,
  clientFirstName,
  previousReportDate,
}: {
  value: ReportGoals;
  onChange: (next: ReportGoals) => void;
  clientFirstName: string;
  previousReportDate: string | null;
}) {
  const set = (p: Partial<ReportGoals>) => onChange({ ...value, ...p });
  const checkpoints = value.checkpoints ?? [];

  return (
    <div className="space-y-6">
      {/* Why */}
      <div>
        <label className={label}>Why {clientFirstName} started (carried forward every report)</label>
        <textarea
          className={`${field} min-h-[64px]`}
          placeholder="In their words — “I want to get on the floor with my grandkids and get back up.”"
          value={value.originalWhy}
          onChange={(e) => set({ originalWhy: e.target.value })}
        />
      </div>

      {/* Last goal */}
      <div className="rounded-3xl border-2 border-slate-100 p-5 dark:border-slate-800">
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-[#0A2E46] dark:text-white">
          The goal from last time{" "}
          {previousReportDate
            ? `· set ${new Date(`${previousReportDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
            : ""}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={label}>What it was</label>
            <input
              className={field}
              placeholder="Leg press 200 lb by September"
              value={value.previousGoal}
              onChange={(e) => set({ previousGoal: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>How it went</label>
            <div className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
              {(Object.keys(GOAL_OUTCOME_LABELS) as GoalOutcome[]).map((k) => {
                const on = value.previousGoalOutcome === k;
                const tone =
                  k === "achieved"
                    ? "bg-emerald-500 text-white"
                    : k === "on_track"
                      ? "bg-[#0A548B] text-white"
                      : k === "stalled"
                        ? "bg-rose-500 text-white"
                        : "bg-slate-500 text-white";
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ previousGoalOutcome: on ? null : k })}
                    className={[
                      "h-11 rounded-xl text-[11px] font-black uppercase tracking-wide",
                      on ? tone : "text-slate-600 dark:text-slate-300",
                    ].join(" ")}
                  >
                    {GOAL_OUTCOME_LABELS[k]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <label className={label}>Say it to them (prints on the client copy)</label>
          <textarea
            className={`${field} min-h-[64px]`}
            placeholder="“You set out to hit 200 on the leg press. You're at 210 — and you got there with better form than you had at 150.”"
            value={value.previousGoalNote}
            onChange={(e) => set({ previousGoalNote: e.target.value })}
          />
        </div>
      </div>

      {/* Next goal */}
      <div className="rounded-3xl border-2 border-[#F06C22]/40 bg-[#F06C22]/5 p-5">
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-[#F06C22]">
          The next 90 days
        </p>
        <div>
          <label className={label}>The goal — something you can measure, with a date</label>
          <textarea
            className={`${field} min-h-[64px]`}
            placeholder="Carry both grocery bags up the stairs without stopping — and compound row at 120 lb — by December 3."
            value={value.nextGoal}
            onChange={(e) => set({ nextGoal: e.target.value })}
          />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={label}>Goal date</label>
            <input
              type="date"
              className={field}
              value={value.nextGoalTargetDate}
              onChange={(e) => set({ nextGoalTargetDate: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Next progress report (what you follow up on)</label>
            <input
              type="date"
              className={field}
              value={value.followUpDate}
              onChange={(e) => set({ followUpDate: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4">
          <label className={label}>Checkpoints on the way (two or three)</label>
          <div className="space-y-2">
            {checkpoints.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-6 text-center text-[11px] font-black text-[#F06C22]">{i + 1}</span>
                <input
                  className={field}
                  placeholder={
                    i === 0
                      ? "By week 4: leg press 180 lb"
                      : i === 1
                        ? "By week 8: 6 days of protein on target"
                        : "By week 12: …"
                  }
                  value={c.text}
                  onChange={(e) =>
                    set({ checkpoints: checkpoints.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)) })
                  }
                />
                <button
                  type="button"
                  aria-label="Remove checkpoint"
                  className="h-10 w-10 shrink-0 rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
                  onClick={() => set({ checkpoints: checkpoints.filter((x) => x.id !== c.id) })}
                >
                  ✕
                </button>
              </div>
            ))}
            {checkpoints.length < 3 && (
              <button
                type="button"
                className="h-10 rounded-xl border border-dashed border-[#F06C22]/60 px-4 text-[11px] font-black uppercase tracking-wider text-[#F06C22]"
                onClick={() =>
                  set({
                    checkpoints: [
                      ...checkpoints,
                      { id: `cp_${Date.now().toString(36)}`, text: "", done: false },
                    ],
                  })
                }
              >
                + Add checkpoint
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
