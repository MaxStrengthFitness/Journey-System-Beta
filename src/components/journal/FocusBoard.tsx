/**
 * The focus board — "what is each coach working on with this client".
 *
 * A focus is owned by one trainer, carries one of the 4 P's, and accumulates
 * check-ins over time. It can be PASSED (client has it), EXTENDED (not there
 * yet, push the review date), or RETIRED (abandoned).
 *
 * Check-ins are ordinary journal entries carrying `focusId`, so a focus's
 * history and the client's timeline are literally the same records — there is
 * never a second thing to reconcile.
 */
import React, { useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Dumbbell,
  MessageSquarePlus,
  PersonStanding,
  Plus,
  RotateCw,
  Route,
  Timer,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
  FOCUS_BLURBS,
  FOCUS_CATEGORIES,
  FOCUS_VISUALS,
  relativeDay,
  toDate,
  type ClientFocus,
  type FocusCategory,
  type JournalEntry,
} from "../../types/journal";
import type { Machine } from "../../types";

const ICONS: Record<string, React.ElementType> = {
  PersonStanding,
  Route,
  Timer,
  Brain,
};

export interface FocusBoardProps {
  focuses: ClientFocus[];
  entries: JournalEntry[];
  machines: Machine[];
  currentTrainerId?: string;
  onCreate: (input: {
    category: FocusCategory;
    intent: string;
    targetMachineId: string | null;
  }) => Promise<void>;
  onPass: (focus: ClientFocus) => void;
  onExtend: (focus: ClientFocus) => void;
  onRetire: (focus: ClientFocus) => void;
  onCheckIn: (focus: ClientFocus) => void;
}

export function FocusBoard({
  focuses,
  entries,
  machines,
  currentTrainerId,
  onCreate,
  onPass,
  onExtend,
  onRetire,
  onCheckIn,
}: FocusBoardProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPassed, setShowPassed] = useState(false);

  const [draftCategory, setDraftCategory] = useState<FocusCategory>("Posture");
  const [draftIntent, setDraftIntent] = useState("");
  const [draftMachine, setDraftMachine] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const active = focuses.filter((f) => f.status === "active");
  const closed = focuses.filter((f) => f.status !== "active");
  const mine = active.find((f) => f.trainerId === currentTrainerId);

  const save = async () => {
    if (!draftIntent.trim()) return;
    setIsSaving(true);
    try {
      await onCreate({
        category: draftCategory,
        intent: draftIntent.trim(),
        targetMachineId: draftMachine || null,
      });
      setDraftIntent("");
      setDraftMachine("");
      setIsCreating(false);
    } finally {
      setIsSaving(false);
    }
  };

  const renderCard = (focus: ClientFocus) => {
    const visual = FOCUS_VISUALS[focus.category] || FOCUS_VISUALS.Posture;
    const Icon = ICONS[visual.icon] || PersonStanding;
    const isMine = focus.trainerId === currentTrainerId;
    const started = toDate(focus.startedAt);
    const reviewDue = toDate(focus.reviewDueAt);
    const overdue =
      focus.status === "active" && reviewDue && reviewDue.getTime() < Date.now();
    const machine = focus.targetMachineId
      ? machines.find((m) => m.id === focus.targetMachineId)
      : null;

    const checkIns = entries.filter((e) => e.focusId === focus.id);
    const isOpen = expandedId === focus.id;

    return (
      <div
        key={focus.id}
        className={cn(
          "relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white transition-all dark:bg-slate-900/70",
          "border-slate-200 dark:border-slate-800",
          isMine && focus.status === "active" && "ring-1 ring-[#F06C22]/40",
          focus.status !== "active" && "opacity-60",
        )}
      >
        <span aria-hidden className={cn("absolute left-0 top-0 h-full w-[4px]", visual.edge)} />

        <div className="p-3.5 pl-4.5">
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-wider",
                visual.chip,
              )}
            >
              <Icon className="h-3 w-3" />
              {focus.category}
            </span>
            <div className="flex items-center gap-1">
              {isMine && focus.status === "active" && (
                <span className="rounded-lg border border-[#F06C22]/30 bg-[#F06C22]/10 px-1.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#F06C22]">
                  Yours
                </span>
              )}
              {focus.status === "passed" && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                  <Check className="h-2.5 w-2.5" /> Passed
                </span>
              )}
              {overdue && (
                <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-1.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-300">
                  Review due
                </span>
              )}
            </div>
          </div>

          <p className="mt-2 text-[13px] font-semibold leading-snug text-slate-800 dark:text-slate-100">
            {focus.intent}
          </p>

          {machine && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-300/60 bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
              <Dumbbell className="h-3 w-3" />
              {machine.name}
            </span>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
            <span className="font-bold text-slate-500 dark:text-slate-400">
              {focus.trainerInitials}
            </span>
            <span aria-hidden>·</span>
            <span>started {relativeDay(started)}</span>
            {focus.extensionCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>extended {focus.extensionCount}x</span>
              </>
            )}
          </div>

          {focus.status === "active" && !focus.isLegacy && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-200 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => onCheckIn(focus)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <MessageSquarePlus className="h-3 w-3" /> Check in
              </button>
              {isMine && (
                <>
                  <button
                    type="button"
                    onClick={() => onPass(focus)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
                  >
                    <Check className="h-3 w-3" /> Pass
                  </button>
                  <button
                    type="button"
                    onClick={() => onExtend(focus)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <RotateCw className="h-3 w-3" /> Extend
                  </button>
                  <button
                    type="button"
                    onClick={() => onRetire(focus)}
                    aria-label="Retire focus"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-rose-500/10 hover:text-rose-500 dark:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}

          {checkIns.length > 0 && (
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : focus.id)}
              className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
              {checkIns.length} check-in{checkIns.length === 1 ? "" : "s"}
            </button>
          )}

          {isOpen && (
            <ol className="mt-2 space-y-2 border-l border-slate-200 pl-3 dark:border-slate-800">
              {checkIns.map((c) => (
                <li key={c.id} className="text-[11px] leading-snug">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
                    {c.authorInitials} · {relativeDay(toDate(c.occurredAt))}
                  </span>
                  <p className="text-slate-700 dark:text-slate-200">{c.body}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    );
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Coaching focus
          </h3>
          <p className="text-[11px] text-slate-400">
            What each coach is working on with this client.
          </p>
        </div>
        {!mine && !isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[#F06C22]/30 bg-[#F06C22]/10 px-3.5 text-[11px] font-black uppercase tracking-wider text-[#F06C22] transition-colors hover:bg-[#F06C22]/20"
          >
            <Plus className="h-3.5 w-3.5" /> Set my focus
          </button>
        )}
      </div>

      {isCreating && (
        <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Pick a P
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FOCUS_CATEGORIES.map((c) => {
              const v = FOCUS_VISUALS[c];
              const on = draftCategory === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraftCategory(c)}
                  className={cn(
                    "h-10 rounded-xl border px-3 text-[11px] font-black uppercase tracking-wider transition-all",
                    on
                      ? v.chip
                      : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:bg-slate-800",
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] italic text-slate-400">
            {FOCUS_BLURBS[draftCategory]}
          </p>

          <textarea
            value={draftIntent}
            onChange={(e) => setDraftIntent(e.target.value)}
            rows={2}
            placeholder="What are you chasing? e.g. Constant tension through the whole set — no dumping at the ends."
            className="mt-3 w-full resize-none rounded-xl bg-slate-100/70 px-3.5 py-3 text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:bg-white dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500"
          />

          <select
            value={draftMachine}
            onChange={(e) => setDraftMachine(e.target.value)}
            className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
          >
            <option value="">Applies everywhere</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                Target: {m.name}
              </option>
            ))}
          </select>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="h-10 rounded-xl px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!draftIntent.trim() || isSaving}
              className="h-10 rounded-xl bg-[#F06C22] px-5 text-[11px] font-black uppercase tracking-wider text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-40"
            >
              {isSaving ? "Saving" : "Set focus"}
            </button>
          </div>
        </div>
      )}

      {active.length === 0 && !isCreating ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-800">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            No active focus
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Set one so the next coach knows what you are working on.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map(renderCard)}
        </div>
      )}

      {closed.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowPassed((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", showPassed && "rotate-180")} />
            {closed.length} past focus{closed.length === 1 ? "" : "es"}
          </button>
          {showPassed && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {closed.map(renderCard)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
