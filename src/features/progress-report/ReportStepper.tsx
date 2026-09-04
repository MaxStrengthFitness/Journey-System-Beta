/**
 * The step rail for the report editor: six tappable steps with a done-mark,
 * the plain-language guide for the active one, and Back / Next.
 *
 * The rail is the trainer's map of the conversation. It is rendered twice:
 * `<ReportStepper>` at the top (rail + guide) and `<ReportStepNav>` at the
 * bottom (Back / Next / Finalize), so the trainer never scrolls back up to
 * move on.
 */
import React from "react";
import { ArrowLeft, ArrowRight, Check, Info } from "lucide-react";
import { REPORT_STEPS, STEP_INDEX, type ReportStepId } from "./steps";

export interface ReportStepperProps {
  active: ReportStepId;
  onChange: (id: ReportStepId) => void;
  /** Which steps have enough filled in to count as done. */
  done: Partial<Record<ReportStepId, boolean>>;
}

export function ReportStepper({ active, onChange, done }: ReportStepperProps) {
  const step = REPORT_STEPS[STEP_INDEX[active]];
  return (
    <div className="space-y-4 print:hidden">
      <ol className="grid grid-cols-3 md:grid-cols-6 gap-2" aria-label="Report steps">
        {REPORT_STEPS.map((s) => {
          const isActive = s.id === active;
          const isDone = !!done[s.id];
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onChange(s.id)}
                aria-current={isActive ? "step" : undefined}
                className={[
                  "w-full min-h-[64px] rounded-2xl px-3 py-2 text-left border-2 transition-colors",
                  isActive
                    ? "bg-[#F06C22] border-[#F06C22] text-white shadow-lg shadow-[#F06C22]/20"
                    : "bg-white/5 border-white/10 text-white hover:border-white/30",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={[
                      "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
                      isActive
                        ? "bg-white text-[#F06C22]"
                        : isDone
                          ? "bg-emerald-500 text-white"
                          : "bg-white/10 text-white/70",
                    ].join(" ")}
                  >
                    {isDone && !isActive ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : s.n}
                  </span>
                  <span className="text-[13px] font-black uppercase italic tracking-tight leading-none truncate">
                    {s.title}
                  </span>
                </span>
                <span
                  className={[
                    "mt-1 block text-[11px] leading-tight truncate",
                    isActive ? "text-white/85" : "text-white/50",
                  ].join(" ")}
                >
                  {s.subtitle}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#F06C22]" />
          <div className="grid gap-3 md:grid-cols-3 text-[13px] leading-relaxed">
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#F06C22]">
                Step {step.n} · What it's for
              </p>
              <p className="text-white/90">{step.purpose}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#F06C22]">
                What to fill in
              </p>
              <p className="text-white/90">{step.howTo}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#F06C22]">
                The client will see
              </p>
              <p className="text-white/70">{step.clientSees}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportStepNav({
  active,
  onChange,
  onFinalize,
  saving,
}: {
  active: ReportStepId;
  onChange: (id: ReportStepId) => void;
  onFinalize: () => void;
  saving: boolean;
}) {
  const i = STEP_INDEX[active];
  const prev = REPORT_STEPS[i - 1];
  const next = REPORT_STEPS[i + 1];
  return (
    <div className="flex items-center justify-between gap-3 print:hidden">
      <button
        type="button"
        disabled={!prev}
        onClick={() => prev && onChange(prev.id)}
        className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/20 px-5 text-[12px] font-black uppercase tracking-widest text-white disabled:opacity-30"
      >
        <ArrowLeft className="h-4 w-4" />
        {prev ? prev.title : "Back"}
      </button>
      <span className="text-[11px] font-bold uppercase tracking-widest text-white/50">
        Step {i + 1} of {REPORT_STEPS.length}
      </span>
      {next ? (
        <button
          type="button"
          onClick={() => onChange(next.id)}
          className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-[12px] font-black uppercase tracking-widest text-[#0A2E46]"
        >
          {next.title}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onFinalize}
          disabled={saving}
          className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#F06C22] px-6 text-[12px] font-black uppercase tracking-widest text-white shadow-lg shadow-[#F06C22]/20 disabled:opacity-50"
        >
          Finalize report
          <Check className="h-4 w-4" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}
