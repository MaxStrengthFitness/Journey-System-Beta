import React from 'react';
import { cn } from '../../lib/utils';

export type ReliabilityCounts = {
  completed: number;
  reschedule: number;
  earlyCancel: number;
  lateCancel: number;
  noShow: number;
};

export type ClientReliabilityScoreProps = {
  score: number;
  counts: ReliabilityCounts;
  windowDays?: number;
  className?: string;
};

function getGradientClasses(score: number, total: number): string {
  if (total === 0) return 'from-yellow to-amber'; // Fair fallback for 0 total

  const clamped = Math.max(0, Math.min(100, score));
  if (clamped >= 90) return 'from-green to-cta';
  if (clamped >= 70) return 'from-cta to-yellow';
  if (clamped >= 50) return 'from-yellow to-amber';
  if (clamped >= 30) return 'from-amber to-red';
  return 'from-red to-red';
}

/**
 * ClientReliabilityScore
 * 
 * Aggregates LedgerEntry stats into a high-level hero tile for the StudioHubGrid.
 */
export default function ClientReliabilityScore({
  score,
  counts = { completed: 0, reschedule: 0, earlyCancel: 0, lateCancel: 0, noShow: 0 },
  windowDays = 90,
  className,
}: ClientReliabilityScoreProps): React.ReactElement {
  const total =
    counts.completed +
    counts.reschedule +
    counts.earlyCancel +
    counts.lateCancel +
    counts.noShow;

  const clampedScore = Math.max(0, Math.min(100, score));
  const gradient = getGradientClasses(score, total);

  return (
    <div
      className={cn(
        "col-span-4 row-span-2 rounded-2xl relative overflow-hidden p-4 sm:p-5 flex flex-col justify-between shadow-[0_12px_32px_rgba(0,0,0,0.12)] bg-gradient-to-br",
        gradient,
        className
      )}
      role="region"
      aria-label={`Client reliability score: ${clampedScore} out of 100 over the last ${windowDays} days`}
    >
      <div className="flex flex-col gap-1">
        <span className="font-display italic uppercase tracking-widest text-[11px] text-white/70">
          RELIABILITY · LAST {windowDays} DAYS
        </span>
        
        {total === 0 ? (
          <div>
            <span className="font-display italic text-[60px] sm:text-[80px] leading-none text-white tabular tracking-tight">
              —
            </span>
            <div className="mt-1">
              <span className="text-xs text-white/80">No sessions in window</span>
            </div>
          </div>
        ) : (
          <div>
            <span className="font-display italic text-[60px] sm:text-[80px] leading-none text-white tabular tracking-tight">
              {clampedScore}
            </span>
            <span className="font-display italic text-[20px] text-white/70 align-baseline ml-1">
              /100
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-white/60">
          Session Outcomes
        </span>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/10">
          {total > 0 && (
            <>
              {counts.completed > 0 && (
                <div className="bg-green h-full" style={{ width: `${(counts.completed / total) * 100}%` }} aria-hidden="true" />
              )}
              {counts.reschedule > 0 && (
                <div className="bg-yellow h-full" style={{ width: `${(counts.reschedule / total) * 100}%` }} aria-hidden="true" />
              )}
              {counts.earlyCancel > 0 && (
                <div className="bg-white/40 h-full" style={{ width: `${(counts.earlyCancel / total) * 100}%` }} aria-hidden="true" />
              )}
              {counts.lateCancel > 0 && (
                <div className="bg-amber h-full" style={{ width: `${(counts.lateCancel / total) * 100}%` }} aria-hidden="true" />
              )}
              {counts.noShow > 0 && (
                <div className="bg-red h-full" style={{ width: `${(counts.noShow / total) * 100}%` }} aria-hidden="true" />
              )}
            </>
          )}
        </div>
        <div className="text-[10px] text-white/70" role="list">
          <span role="listitem">{counts.completed}c</span>
          <span> · </span>
          <span role="listitem">{counts.reschedule}r</span>
          <span> · </span>
          <span role="listitem">{counts.earlyCancel}ec</span>
          <span> · </span>
          <span role="listitem">{counts.lateCancel}lc</span>
          <span> · </span>
          <span role="listitem">{counts.noShow}ns</span>
        </div>
      </div>
    </div>
  );
}
