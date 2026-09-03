/**
 * Quick add.
 *
 * Always visible at the top of the stream — not a modal — because the common
 * case is a coach typing one line between sets on an iPad. The 90% path is
 * two taps: type, pick a kind, save. Everything else (machine, importance,
 * effective dates, back-dating) lives behind "More" so it never taxes the
 * common case.
 */
import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  Dumbbell,
  HeartPulse,
  Loader2,
  MessageSquare,
  PersonStanding,
  Route,
  Timer,
  Target,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
  COMPOSER_KINDS,
  FOCUS_BLURBS,
  FOCUS_CATEGORIES,
  getEntryVisual,
  IMPORTANCE_META,
  LIFE_CATEGORIES,
  type JournalDraft,
  type JournalImportance,
  type JournalKind,
  type JournalOrigin,
} from "../../types/journal";
import type { Machine } from "../../types";

const ICONS: Record<string, React.ElementType> = {
  PersonStanding,
  Route,
  Timer,
  Brain,
  HeartPulse,
  Dumbbell,
  AlertTriangle,
  MessageSquare,
  Target,
};

const PLACEHOLDERS: Record<JournalKind, string> = {
  coaching: 'e.g. "Stop dumping the last two reps — cue \'own the bottom\' at rep 8."',
  equipment: 'e.g. "Needs extra padding on the chest pad for compound row."',
  life: 'e.g. "Rotator cuff surgery on the 14th. No pressing until cleared."',
  incident: 'e.g. "Reported sharp left knee pain on leg press. Stopped the set."',
  general: "Anything the next coach should know…",
  consultation: "Consultation note…",
};

export interface JournalComposerProps {
  clientFirstName: string;
  machines: Machine[];
  /** When set, the entry is filed as a check-in against this focus. */
  focusContext?: { id: string; label: string } | null;
  onClearFocusContext?: () => void;
  onSubmit: (draft: JournalDraft) => Promise<void>;
  disabled?: boolean;
  /** Pre-select a machine (the one being performed in an Active Session). */
  defaultMachineId?: string;
  /** Provenance stamped on the entry. The Journal tab leaves it "manual". */
  origin?: JournalOrigin;
}

export function JournalComposer({
  clientFirstName,
  machines,
  focusContext,
  onClearFocusContext,
  onSubmit,
  disabled = false,
  defaultMachineId,
  origin = "manual",
}: JournalComposerProps) {
  const [kind, setKind] = useState<JournalKind>("coaching");
  const [category, setCategory] = useState<string | null>("Posture");
  const [body, setBody] = useState("");
  const [importance, setImportance] = useState<JournalImportance>("standard");
  const [machineId, setMachineId] = useState<string>(defaultMachineId ?? "");
  const [showMore, setShowMore] = useState(false);
  const [occurredOn, setOccurredOn] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isExpanded = body.trim().length > 0 || showMore;

  const categoryOptions = useMemo(() => {
    if (kind === "coaching") return FOCUS_CATEGORIES as readonly string[];
    if (kind === "life") return LIFE_CATEGORIES as readonly string[];
    return [];
  }, [kind]);

  const showMachine = kind === "coaching" || kind === "equipment" || kind === "incident";

  const pickKind = (next: JournalKind) => {
    setKind(next);
    if (next === "coaching") setCategory("Posture");
    else if (next === "life") setCategory("Surgery");
    else setCategory(null);
    if (next === "incident") setImportance("critical");
    else if (importance === "critical" && kind === "incident") setImportance("standard");
  };

  const reset = () => {
    setBody("");
    setImportance("standard");
    setMachineId(defaultMachineId ?? "");
    setOccurredOn("");
    setEffectiveUntil("");
    setShowMore(false);
  };

  const submit = async () => {
    if (!body.trim() || isSaving || disabled) return;
    setIsSaving(true);
    try {
      await onSubmit({
        kind,
        category: (category as any) ?? null,
        body: body.trim(),
        importance,
        machineId: showMachine && machineId ? machineId : null,
        focusId: focusContext?.id ?? null,
        origin,
        occurredAt: occurredOn ? new Date(`${occurredOn}T12:00:00`) : null,
        effectiveUntil: effectiveUntil ? new Date(`${effectiveUntil}T23:59:59`) : null,
      });
      reset();
      onClearFocusContext?.();
    } finally {
      setIsSaving(false);
    }
  };

  const activeVisual = getEntryVisual(kind, category);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all dark:bg-slate-900/70",
        "border-slate-200 dark:border-slate-800",
        isExpanded && "ring-1 ring-slate-300 dark:ring-slate-700",
      )}
    >
      <span
        aria-hidden
        className={cn("absolute left-0 top-0 h-full w-[4px]", activeVisual.edge)}
      />

      {focusContext && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/50">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Check-in on: <span className="text-slate-700 dark:text-slate-200">{focusContext.label}</span>
          </span>
          <button
            type="button"
            onClick={onClearFocusContext}
            className="text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            Clear
          </button>
        </div>
      )}

      <div className="p-4 pl-5">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            body || showMore
              ? PLACEHOLDERS[kind]
              : `Log something about ${clientFirstName || "this client"}…`
          }
          rows={isExpanded ? 3 : 2}
          className={cn(
            "w-full resize-none rounded-xl border border-transparent bg-slate-100/70 px-3.5 py-3 text-sm font-medium leading-relaxed text-slate-800 outline-none transition-all",
            "placeholder:text-slate-400 focus:border-slate-300 focus:bg-white",
            "dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-600 dark:focus:bg-slate-800",
          )}
        />

        {/* Kind strip — the one required choice. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {COMPOSER_KINDS.map(({ kind: k, label }) => {
            const v = getEntryVisual(k, k === "coaching" ? "Posture" : null);
            const Icon = ICONS[v.icon] || MessageSquare;
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => pickKind(k)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-black uppercase tracking-wider transition-all",
                  on
                    ? v.chip
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:bg-slate-800",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        {isExpanded && (
          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            {categoryOptions.length > 0 && (
              <div>
                <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {kind === "coaching" ? "Which P" : "What kind"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {categoryOptions.map((c) => {
                    const v = getEntryVisual(kind, c);
                    const on = category === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
                        title={kind === "coaching" ? FOCUS_BLURBS[c as never] : undefined}
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
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  How loud
                </p>
                <div className="flex gap-1.5">
                  {(["standard", "elevated", "critical"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setImportance(lvl)}
                      className={cn(
                        "h-10 flex-1 rounded-xl border px-2 text-[11px] font-black uppercase tracking-wider transition-all",
                        importance === lvl
                          ? IMPORTANCE_META[lvl].chip
                          : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:bg-slate-800",
                      )}
                    >
                      {IMPORTANCE_META[lvl].short}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] leading-tight text-slate-400">
                  {IMPORTANCE_META[importance].hint}
                </p>
              </div>

              {showMachine && (
                <div>
                  <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Machine (optional)
                  </p>
                  <select
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
                  >
                    <option value="">No specific machine</option>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {showMore && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Happened on
                  </p>
                  <input
                    type="date"
                    value={occurredOn}
                    onChange={(e) => setOccurredOn(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Leave blank for now. Back-date a surgery or a trip.
                  </p>
                </div>
                <div>
                  <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Stops mattering on
                  </p>
                  <input
                    type="date"
                    value={effectiveUntil}
                    onChange={(e) => setEffectiveUntil(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    After this it stops showing in the briefing.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="inline-flex h-10 items-center gap-1 rounded-xl px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", showMore && "rotate-180")}
            />
            {showMore ? "Fewer options" : "More options"}
          </button>

          <div className="flex items-center gap-2">
            {body.trim() && (
              <button
                type="button"
                onClick={reset}
                className="h-10 rounded-xl px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!body.trim() || isSaving || disabled}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-xl px-5 text-[11px] font-black uppercase tracking-wider transition-all",
                "bg-[#F06C22] text-white shadow-sm shadow-[#F06C22]/20 hover:brightness-110",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
              )}
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isSaving ? "Saving" : "Save entry"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
