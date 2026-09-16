/**
 * The step rail for the report editor: five tappable steps with a done-mark,
 * the plain-language guide for the active one, and Back / Next.
 *
 * The rail is the trainer's map of the conversation. It is rendered twice:
 * `<ReportStepper>` at the top (rail + guide) and `<ReportStepNav>` at the
 * bottom (Back / Next / Finalize), so the trainer never scrolls back up to
 * move on.
 *
 * Reporting round, Sep 2026: five EQUAL columns found by position, a short
 * label per step that is never truncated, 56px tabs, tokens instead of hex
 * (progress-report.css).
 */
import React from "react";
import { ArrowLeft, ArrowRight, Check, Info } from "lucide-react";
import { REPORT_STEPS, STEP_INDEX, type ReportStepId } from "./steps";
import "./progress-report.css";

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
      <ol className="pr-steps" aria-label="Report steps">
        {REPORT_STEPS.map((s) => {
          const isActive = s.id === active;
          const isDone = !!done[s.id];
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onChange(s.id)}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${s.n}: ${s.title}`}
                data-done={isDone}
                className="pr-step"
              >
                <span className="pr-step__head">
                  <span className="pr-step__n" aria-hidden>
                    {isDone && !isActive ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : s.n}
                  </span>
                  <span className="pr-step__title">{s.label}</span>
                </span>
                <span className="pr-step__sub">{s.subtitle}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="pr-guide">
        <Info className="pr-guide__icon h-5 w-5" />
        <div className="pr-guide__cols">
          <div>
            <p className="pr-guide__label">
              Step {step.n} · {step.title} · What it's for
            </p>
            <p className="pr-guide__text">{step.purpose}</p>
          </div>
          <div>
            <p className="pr-guide__label">What to fill in</p>
            <p className="pr-guide__text">{step.howTo}</p>
          </div>
          <div>
            <p className="pr-guide__label">The client will see</p>
            <p className="pr-guide__text pr-guide__text--quiet">{step.clientSees}</p>
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
    <div className="pr-nav print:hidden">
      <button
        type="button"
        disabled={!prev}
        onClick={() => prev && onChange(prev.id)}
        className="pr-btn pr-btn--ghost"
      >
        <ArrowLeft className="h-4 w-4" />
        {prev ? prev.label : "Back"}
      </button>
      <span className="pr-nav__where">
        Step {i + 1} of {REPORT_STEPS.length}
      </span>
      {next ? (
        <button type="button" onClick={() => onChange(next.id)} className="pr-btn pr-btn--light">
          {next.label}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <button type="button" onClick={onFinalize} disabled={saving} className="pr-btn pr-btn--hero">
          Finalize report
          <Check className="h-4 w-4" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}
