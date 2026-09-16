import { Bell, Building2, Clock, Dumbbell, Trash2, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { Client } from "../../types";
import type { ResolvedMachine } from "../../types/machines";
import { Seg, Toggle } from "../planner/kit";
import {
  normaliseTime,
  problemsFor,
  REMIND_OPTIONS,
  taskSentence,
  WIZARD_STEP_LABEL,
  WIZARD_STEPS,
  nextStep,
  prevStep,
  type WizardStep,
} from "./task-wizard";
import {
  categoryLabel,
  CLIENT_ACTION_LABEL,
  SHIFT_LABEL,
  taskScopeOf,
  TASK_SHIFTS,
  type ClientTaskAction,
  type RecurrenceType,
  type StudioTaskCategory,
  type TaskKind,
  type TaskShift,
  type TaskTemplate,
} from "./types";
import "../planner/kit.css";

/**
 * THE TASK WIZARD — three short steps instead of one long form.
 *
 * Round: Planner rework, Sep 2026. The rules (what each step needs, the
 * review sentence) are in ./task-wizard.ts; TaskManager owns the draft and the
 * save. A new task walks What → When → Rules; an edit opens on Rules with
 * every step one tap away.
 */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const KINDS: { value: TaskKind; label: string; icon: ReactNode; category: string }[] = [
  { value: "machine", label: "Machines", icon: <Dumbbell size={15} aria-hidden />, category: "cleaning" },
  { value: "facility", label: "Facility", icon: <Building2 size={15} aria-hidden />, category: "ops" },
  { value: "client", label: "With a client", icon: <UsersRound size={15} aria-hidden />, category: "client-service" },
];

const HOW_OFTEN: { value: RecurrenceType; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Some days" },
  { value: "monthly", label: "Monthly" },
  { value: "once", label: "Once" },
];

export interface TaskWizardProps {
  draft: TaskTemplate;
  onChange: (next: TaskTemplate) => void;
  isNew: boolean;
  step: WizardStep;
  onStep: (step: WizardStep) => void;
  /** Show problems for the steps walked past. */
  showProblems: boolean;
  onShowProblems: () => void;
  machines: ResolvedMachine[];
  categories: StudioTaskCategory[];
  clients: Client[];
  todayKey: string;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  confirmDelete: boolean;
  onDelete: () => void;
}

export function TaskWizard({
  draft,
  onChange,
  isNew,
  step,
  onStep,
  showProblems,
  onShowProblems,
  machines,
  categories,
  clients,
  todayKey,
  busy,
  onSave,
  onCancel,
  confirmDelete,
  onDelete,
}: TaskWizardProps) {
  const personal = taskScopeOf(draft) === "personal";
  const set = <K extends keyof TaskTemplate>(k: K, v: TaskTemplate[K]) => onChange({ ...draft, [k]: v });
  const setRecurrence = (patch: Partial<TaskTemplate["recurrence"]>) =>
    onChange({ ...draft, recurrence: { ...draft.recurrence, ...patch } });

  const problems = problemsFor(draft);
  const problemFor = (field: string) =>
    showProblems ? problems.find((p) => p.field === field)?.message : undefined;
  const stepHasProblem = (s: WizardStep) => problems.some((p) => p.step === s);

  const machineName = (id: string) => machines.find((m) => m.machineId === id)?.name ?? "";
  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : "";
  };
  const sentence = taskSentence(draft, { todayKey, machineName, clientName });

  const goNext = () => {
    const here = problemsFor(draft, step);
    if (here.length) {
      onShowProblems();
      return;
    }
    const n = nextStep(step);
    if (n) onStep(n);
  };
  const save = () => {
    if (problems.length) {
      onShowProblems();
      const first = problems[0].step;
      if (first !== step) onStep(first);
      return;
    }
    onSave();
  };

  const stepIndex = WIZARD_STEPS.indexOf(step);

  return (
    <div className="tw">
      <nav className="pk-steps" aria-label="Steps">
        {WIZARD_STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            className="pk-step"
            aria-current={s === step ? "step" : undefined}
            data-state={i < stepIndex || (!isNew && s !== step) ? "done" : undefined}
            // A new task walks forward; an edit can jump anywhere.
            disabled={isNew && i > stepIndex}
            onClick={() => onStep(s)}
          >
            {i + 1}. {WIZARD_STEP_LABEL[s]}
            {showProblems && stepHasProblem(s) ? " •" : ""}
          </button>
        ))}
      </nav>

      <div className="pk-body">
        {step === "what" && (
          <>
            <label className="pk-field">
              <span className="pk-label">Title</span>
              <input
                className="pk-input"
                value={draft.title}
                autoFocus
                maxLength={160}
                onChange={(e) => set("title", e.target.value)}
                placeholder={personal ? "Call Priya's physio" : "Wipe down and sanitize"}
                aria-invalid={Boolean(problemFor("title"))}
              />
              {problemFor("title") && <p className="pk-problem">{problemFor("title")}</p>}
            </label>

            <label className="pk-field">
              <span className="pk-label">Instructions (optional)</span>
              <textarea
                className="pk-textarea"
                value={draft.detail ?? ""}
                maxLength={2000}
                onChange={(e) => set("detail", e.target.value)}
                placeholder={personal ? "Anything you'll want to remember." : "Pads, handles and any contact surface."}
              />
            </label>

            <div className="pk-field">
              <span className="pk-label">What is it about</span>
              <Seg
                label="What is it about"
                value={draft.kind}
                options={KINDS}
                onChange={(kind) => {
                  const k = KINDS.find((x) => x.value === kind)!;
                  onChange({
                    ...draft,
                    kind,
                    category: k.category,
                    target:
                      kind === "machine"
                        ? { kind: "machine", machineIds: "all" }
                        : kind === "facility"
                          ? { kind: "facility" }
                          : { kind: "client" },
                  });
                }}
              />
            </div>

            {draft.target.kind === "machine" && (
              <div className="pk-field">
                <span className="pk-label">Which machines</span>
                <div className="pk-chips">
                  <button
                    type="button"
                    className="pk-chip"
                    aria-pressed={draft.target.machineIds === "all"}
                    onClick={() => set("target", { kind: "machine", machineIds: "all" })}
                  >
                    Every machine
                  </button>
                  <button
                    type="button"
                    className="pk-chip"
                    aria-pressed={draft.target.machineIds !== "all"}
                    onClick={() => set("target", { kind: "machine", machineIds: [] })}
                  >
                    Choose
                  </button>
                </div>
                {draft.target.machineIds === "all" ? (
                  <p className="pk-hint">Equipment added later is included automatically.</p>
                ) : (
                  <div className="pk-chips pk-chips--scroll" role="group" aria-label="Machines">
                    {machines.map((m) => {
                      const ids = draft.target.kind === "machine" && draft.target.machineIds !== "all" ? draft.target.machineIds : [];
                      const on = ids.includes(m.machineId);
                      return (
                        <button
                          key={m.machineId}
                          type="button"
                          className="pk-chip"
                          aria-pressed={on}
                          onClick={() =>
                            set("target", {
                              kind: "machine",
                              machineIds: on ? ids.filter((x) => x !== m.machineId) : [...ids, m.machineId],
                            })
                          }
                        >
                          {m.name}
                        </button>
                      );
                    })}
                    {machines.length === 0 && (
                      <p className="pk-hint">
                        No equipment is set up for this studio yet. Add machines in Operations → Machines, or pick
                        “Every machine”.
                      </p>
                    )}
                  </div>
                )}
                {problemFor("machines") && <p className="pk-problem">{problemFor("machines")}</p>}
              </div>
            )}

            {draft.target.kind === "client" && (
              <div className="pk-row">
                <label className="pk-field">
                  <span className="pk-label">Which client</span>
                  <select
                    className="pk-select"
                    value={draft.target.clientId ?? ""}
                    onChange={(e) =>
                      set("target", {
                        kind: "client",
                        action: draft.target.kind === "client" ? draft.target.action : undefined,
                        ...(e.target.value ? { clientId: e.target.value } : {}),
                      })
                    }
                    aria-invalid={Boolean(problemFor("client"))}
                  >
                    <option value="">{personal ? "Choose a client…" : "Any client (a general follow-up)"}</option>
                    {[...clients]
                      .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.firstName} {c.lastName}
                        </option>
                      ))}
                  </select>
                  <span className="pk-hint">Today's clients. For anyone else, link them from a note or a job.</span>
                  {problemFor("client") && <p className="pk-problem">{problemFor("client")}</p>}
                </label>
                <label className="pk-field">
                  <span className="pk-label">Tapping it opens</span>
                  <select
                    className="pk-select"
                    value={draft.target.action ?? "custom"}
                    onChange={(e) =>
                      set("target", {
                        ...(draft.target as { kind: "client"; clientId?: string }),
                        kind: "client",
                        action: e.target.value as ClientTaskAction,
                      })
                    }
                  >
                    {(Object.keys(CLIENT_ACTION_LABEL) as ClientTaskAction[]).map((a) => (
                      <option key={a} value={a}>
                        {a === "custom" ? "Their profile" : CLIENT_ACTION_LABEL[a]}
                      </option>
                    ))}
                  </select>
                  <span className="pk-hint">The task opens the real screen rather than being a tick that claims it.</span>
                </label>
              </div>
            )}
          </>
        )}

        {step === "when" && (
          <>
            <div className="pk-field">
              <span className="pk-label">How often</span>
              <Seg
                label="How often"
                value={draft.recurrence.type}
                options={HOW_OFTEN}
                onChange={(type) =>
                  setRecurrence({
                    type,
                    ...(type === "once" && !draft.recurrence.onDate ? { onDate: todayKey } : {}),
                    ...(type === "monthly" && !draft.recurrence.dayOfMonth ? { dayOfMonth: 1 } : {}),
                  })
                }
              />
            </div>

            {draft.recurrence.type === "weekly" && (
              <div className="pk-field">
                <span className="pk-label">Which days</span>
                <div className="pk-chips" role="group" aria-label="Which days">
                  {DAYS.map((d, i) => {
                    const days = draft.recurrence.daysOfWeek ?? [];
                    const on = days.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        className="pk-chip tw-day"
                        aria-pressed={on}
                        onClick={() =>
                          setRecurrence({ daysOfWeek: on ? days.filter((x) => x !== i) : [...days, i].sort() })
                        }
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                {(draft.recurrence.daysOfWeek ?? []).length === 0 && (
                  <p className="pk-hint">No days picked — it runs every day until you choose some.</p>
                )}
              </div>
            )}

            {draft.recurrence.type === "monthly" && (
              <label className="pk-field">
                <span className="pk-label">Day of the month</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="pk-input tw-narrow"
                  value={draft.recurrence.dayOfMonth ?? 1}
                  onChange={(e) => setRecurrence({ dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                />
                {(draft.recurrence.dayOfMonth ?? 1) > 28 && (
                  <p className="pk-hint">Months without this day are skipped, never moved.</p>
                )}
              </label>
            )}

            {draft.recurrence.type === "once" && (
              <label className="pk-field">
                <span className="pk-label">Which day</span>
                <input
                  type="date"
                  className="pk-input tw-narrow"
                  value={draft.recurrence.onDate ?? ""}
                  onChange={(e) => setRecurrence({ onDate: e.target.value })}
                  aria-invalid={Boolean(problemFor("date"))}
                />
                {problemFor("date") && <p className="pk-problem">{problemFor("date")}</p>}
              </label>
            )}

            <div className="pk-field">
              <span className="pk-label">When in the day</span>
              <div className="pk-chips" role="group" aria-label="When in the day">
                {TASK_SHIFTS.map((sft: TaskShift) => {
                  const shifts = draft.recurrence.shifts ?? ["any"];
                  const on = shifts.includes(sft);
                  return (
                    <button
                      key={sft}
                      type="button"
                      className="pk-chip"
                      aria-pressed={on}
                      onClick={() => {
                        // 'any' is exclusive: all day, or specific shifts.
                        const next =
                          sft === "any"
                            ? (["any"] as TaskShift[])
                            : on
                              ? shifts.filter((x) => x !== sft)
                              : [...shifts.filter((x) => x !== "any"), sft];
                        setRecurrence({ shifts: next.length ? next : ["any"] });
                      }}
                    >
                      {SHIFT_LABEL[sft]}
                    </button>
                  );
                })}
              </div>
              {(draft.recurrence.shifts ?? []).filter((s) => s !== "any").length > 1 && (
                <p className="pk-hint">Opening and closing are separate — closing isn't done by having opened.</p>
              )}
            </div>

            <div className="pk-row">
              <label className="pk-field">
                <span className="pk-label">
                  <Clock size={12} aria-hidden /> At a set time (optional)
                </span>
                <span className="tw-time">
                  <input
                    type="time"
                    className="pk-input tw-narrow"
                    value={normaliseTime(draft.timeOfDay) ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      onChange({
                        ...draft,
                        timeOfDay: v || undefined,
                        // No time, no reminder.
                        remindMinutesBefore: v ? draft.remindMinutesBefore ?? null : null,
                      });
                    }}
                    aria-invalid={Boolean(problemFor("time"))}
                  />
                  {draft.timeOfDay && (
                    <button
                      type="button"
                      className="pl__btn"
                      onClick={() => onChange({ ...draft, timeOfDay: undefined, remindMinutesBefore: null })}
                    >
                      Clear
                    </button>
                  )}
                </span>
                <span className="pk-hint">
                  {personal ? "Orders your list, and lets the bell remind you." : "Orders the list. Nothing enforces it."}
                </span>
                {problemFor("time") && <p className="pk-problem">{problemFor("time")}</p>}
              </label>
            </div>

            {personal && (
              <div className="pk-field">
                <Toggle
                  checked={typeof draft.remindMinutesBefore === "number"}
                  disabled={!normaliseTime(draft.timeOfDay)}
                  onChange={(on) => set("remindMinutesBefore", on ? 0 : null)}
                  title="Remind me"
                  body={
                    normaliseTime(draft.timeOfDay)
                      ? "Your bell rings on the iPad you're signed in to. Nothing is texted or emailed."
                      : "Set a time above first."
                  }
                />
                {typeof draft.remindMinutesBefore === "number" && (
                  <div className="pk-chips" role="group" aria-label="How early">
                    {REMIND_OPTIONS.map((o) => (
                      <button
                        key={o.minutes}
                        type="button"
                        className="pk-chip"
                        aria-pressed={draft.remindMinutesBefore === o.minutes}
                        onClick={() => set("remindMinutesBefore", o.minutes)}
                      >
                        <Bell size={13} aria-hidden />
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                {problemFor("remind") && <p className="pk-problem">{problemFor("remind")}</p>}
              </div>
            )}
          </>
        )}

        {step === "rules" && (
          <>
            <label className="pk-field">
              <span className="pk-label">Category</span>
              <select className="pk-select" value={draft.category} onChange={(e) => set("category", e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                {!categories.some((c) => c.id === draft.category) && (
                  <option value={draft.category}>{categoryLabel(draft.category, categories)}</option>
                )}
              </select>
            </label>

            <Toggle
              checked={Boolean(draft.requiresNote)}
              onChange={(v) => set("requiresNote", v)}
              title="Require a note to complete"
              body="For inspections, where “done” without a finding isn't an answer."
            />
            {!personal && (
              <Toggle
                checked={draft.notifyCreatorOnComplete ?? draft.recurrence.type === "once"}
                onChange={(v) => set("notifyCreatorOnComplete", v)}
                title="Tell me when someone finishes this"
                body="In your bell only. Off by default for repeating tasks — forty cleaning receipts a day is how a studio learns to ignore the bell."
              />
            )}

            <p className="pk-summary" aria-live="polite">
              {sentence}
            </p>
            {showProblems && problems.length > 0 && (
              <p className="pk-problem">
                {problems[0].message} ({WIZARD_STEP_LABEL[problems[0].step]} step)
              </p>
            )}
          </>
        )}
      </div>

      <div className="pk-foot">
        {!isNew && (
          <div className="pk-foot__left">
            <button type="button" className={`pl__btn${confirmDelete ? " pl__btn--danger" : ""}`} onClick={onDelete} disabled={busy}>
              <Trash2 size={14} aria-hidden />
              {confirmDelete ? "Delete for good?" : "Delete"}
            </button>
          </div>
        )}
        {prevStep(step) && isNew ? (
          <button type="button" className="pl__btn" onClick={() => onStep(prevStep(step)!)} disabled={busy}>
            Back
          </button>
        ) : (
          <button type="button" className="pl__btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        {isNew && nextStep(step) ? (
          <button type="button" className="pl__btn pl__btn--primary" onClick={goNext}>
            Next: {WIZARD_STEP_LABEL[nextStep(step)!]}
          </button>
        ) : (
          <button type="button" className="pl__btn pl__btn--primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : isNew ? (personal ? "Add to my list" : "Add to the studio") : "Save changes"}
          </button>
        )}
      </div>
      {confirmDelete && (
        <p className="pk-hint">
          Finished days point at this task; deleting it loses the record of every time it was done. Retiring it (from
          the list) keeps the history and stops it appearing.
        </p>
      )}
    </div>
  );
}
