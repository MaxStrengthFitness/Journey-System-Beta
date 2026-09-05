/**
 * CLIENT CHECK-IN — the assessment, broken into pieces a 20-minute session
 * can actually swallow.
 *
 * It used to be a full-screen sheet with twelve topics in it, opened from
 * the briefing and expected to be finished in one sitting. Nobody has that
 * sitting. A coach has ninety seconds while the client works the lumbar
 * machine, and what they want to do with it is tick hydration and get back
 * on the floor.
 *
 * So this is a persistent panel over a draft that lives between sessions:
 * one topic open at a time, every edit autosaved, and a progress line that
 * says exactly how much is left. Pain and stress need an explicit "nothing
 * to report" because an empty list cannot otherwise be told apart from a
 * conversation that never happened.
 */
import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  HeartPulse,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { Client, Machine, Trainer } from "../../types";
import {
  CategoryCard,
  HydrationCard,
  PainMapCard,
  ProteinCard,
  StressCard,
  SUBJECTIVE_CATEGORIES,
  scoreCategory,
  useCheckInDraft,
  type CheckInSectionState,
} from "../../features/subjective-report";

export interface ClientCheckInPanelProps {
  client: Client | null;
  trainer: Trainer | null;
  machines: Machine[];
}

const relative = (ms: number | null): string | null => {
  if (!ms) return null;
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

function StatusDot({ section }: { section: CheckInSectionState }) {
  if (section.isComplete)
    return <CircleCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-label="answered" />;
  if (section.isReviewed)
    return <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-label="reviewed, nothing to report" />;
  if (section.isPartial)
    return <CircleAlert className="h-4 w-4 shrink-0 text-amber-500" aria-label="part answered" />;
  return <CircleDashed className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-label="not started" />;
}

export function ClientCheckInPanel({ client, trainer, machines }: ClientCheckInPanelProps) {
  const draft = useCheckInDraft({ client, trainer, machines });
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);

  // Land on the first thing still owed, once the draft is in.
  useEffect(() => {
    if (!draft.loading && openId === null && draft.hasDraft) setOpenId(draft.firstOpenSection);
  }, [draft.loading, draft.hasDraft, draft.firstOpenSection, openId]);

  if (!client) return null;

  const pct = draft.totalSections
    ? Math.round((draft.doneCount / draft.totalSections) * 100)
    : 0;
  const started = relative(draft.startedAt);
  const saved = relative(draft.savedAt);
  const canFinalize = draft.hasDraft && draft.doneCount > 0;

  const renderBody = (section: CheckInSectionState) => {
    const common = { value: draft.assessment, onChange: draft.update };
    if (section.id === "protein")
      return <ProteinCard {...common} bodyWeightLbs={draft.bodyWeightLbs} />;
    if (section.id === "hydration")
      return <HydrationCard {...common} bodyWeightLbs={draft.bodyWeightLbs} />;
    if (section.id === "pain")
      return (
        <PainMapCard
          {...common}
          previous={draft.previous}
          machines={machines}
          clientId={client.id}
        />
      );
    if (section.id === "stress")
      return <StressCard {...common} clientFirstName={client.firstName || ""} />;

    const def = SUBJECTIVE_CATEGORIES.find((c) => c.key === section.id);
    if (!def) return null;
    return (
      <CategoryCard
        def={def}
        value={draft.assessment}
        onChange={draft.update}
        score={scoreCategory(def.key, draft.assessment.answers, draft.assessment.scaleVersion)}
        previousScore={
          draft.previous
            ? scoreCategory(
                def.key,
                draft.previous.assessment.answers,
                draft.previous.assessment.scaleVersion,
              )
            : null
        }
      />
    );
  };

  return (
    <section
      id="client-check-in"
      className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70"
      aria-label="Client check-in"
    >
      {/* ---------------------------- header ---------------------------- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#F06C22]/25 bg-[#F06C22]/10 text-[#F06C22]">
          <HeartPulse className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-black uppercase italic tracking-tight text-slate-900 dark:text-white">
            Client Check-in
          </h3>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {draft.loading
              ? "Loading…"
              : draft.hasDraft
                ? [
                    `${draft.doneCount} of ${draft.totalSections} areas done`,
                    started && `started ${started}`,
                    draft.saveState === "saving"
                      ? "saving…"
                      : draft.saveState === "error"
                        ? "not saved — retry an answer"
                        : saved && `saved ${saved}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Nothing open. Answer anything below and it starts saving."}
          </p>
        </div>

        {draft.hasDraft && (
          <div className="flex items-center gap-2">
            <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-slate-200 sm:block dark:bg-slate-800">
              <span
                className="block h-full rounded-full bg-[#F06C22] transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="text-[11px] font-black tabular-nums text-slate-500 dark:text-slate-400">
              {pct}%
            </span>
          </div>
        )}
      </div>

      {/* --------------------------- sections --------------------------- */}
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {draft.sections.map((section) => {
          const open = openId === section.id;
          return (
            <li key={section.id}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`checkin-${section.id}`}
                onClick={() => setOpenId(open ? null : section.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <StatusDot section={section} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-slate-800 dark:text-slate-200">
                    {section.title}
                  </span>
                  <span className="block font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    {section.band}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                    open && "rotate-180",
                  )}
                />
              </button>

              {open && (
                <div id={`checkin-${section.id}`} className="px-4 pb-4">
                  {renderBody(section)}
                  {/* Pain and stress need this; the rest can use it to say
                      "we talked, nothing moved". */}
                  <button
                    type="button"
                    onClick={() => draft.toggleReviewed(section.id)}
                    className={cn(
                      "mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-black uppercase tracking-wider transition-colors",
                      section.isReviewed
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400",
                    )}
                  >
                    {section.isReviewed ? (
                      <>
                        <Check className="h-3 w-3" /> Reviewed
                      </>
                    ) : (
                      <>
                        <CircleDashed className="h-3 w-3" /> Mark reviewed
                      </>
                    )}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* ---------------------------- footer ---------------------------- */}
      {draft.hasDraft && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => void draft.discard()}
            className="mr-auto inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3 w-3" /> Discard draft
          </button>

          {confirmFinalize ? (
            <>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {draft.doneCount < draft.totalSections
                  ? `Finish with ${draft.totalSections - draft.doneCount} area${
                      draft.totalSections - draft.doneCount === 1 ? "" : "s"
                    } unanswered?`
                  : "Finish this check-in?"}
              </span>
              <button
                type="button"
                onClick={() => setConfirmFinalize(false)}
                className="h-10 rounded-xl border border-slate-200 px-3 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={draft.finalizing}
                onClick={async () => {
                  const ok = await draft.finalize();
                  if (ok) {
                    setConfirmFinalize(false);
                    setOpenId(null);
                  }
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#F06C22] px-4 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:brightness-105 disabled:opacity-60"
              >
                {draft.finalizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Finish check-in
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!canFinalize}
              onClick={() => setConfirmFinalize(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#F06C22]/40 bg-[#F06C22]/10 px-4 text-[10px] font-black uppercase tracking-wider text-[#F06C22] transition-colors hover:bg-[#F06C22]/20 disabled:opacity-40"
            >
              <Check className="h-3 w-3" /> Finish check-in
            </button>
          )}
        </div>
      )}
    </section>
  );
}
