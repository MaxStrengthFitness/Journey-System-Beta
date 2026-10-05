/**
 * The machine's story at the top of its window (AJ, Oct 2 2026: the grid's
 * stats live "only when you tap"). Five lines a trainer reads at a glance:
 * Started · Last · Best · Lowest · Most reps, each with the weight, the reps
 * and the day. See machine-story.ts.
 */
import type { StoryLine } from "./machine-story";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function day(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : ymd;
}

export function MachineStoryCard({ lines, partial }: { lines: StoryLine[]; partial: boolean }) {
  if (lines.length === 0) return null;
  return (
    <section className="mx-4 mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-card px-3 py-2" aria-label="This machine's story" data-testid="machine-story">
      <dl className="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1.5 items-baseline">
        {lines.map((l) => (
          <div key={l.key} className="contents" data-story={l.key}>
            <dt className="text-[12px] font-bold text-muted-foreground">{l.label}</dt>
            <dd className="text-[15px] font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {l.weight} lb
              {l.effort && <span className="ml-2 text-[12px] font-semibold text-muted-foreground">{l.effort}</span>}
            </dd>
            <dd className="text-[12px] font-medium tabular-nums text-muted-foreground text-right">{day(l.date)}</dd>
          </div>
        ))}
      </dl>
      {partial && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">From the sessions loaded on the profile.</p>
      )}
    </section>
  );
}
