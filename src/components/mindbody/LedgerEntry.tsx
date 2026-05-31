import React from 'react';
import { Building2, Zap, Settings, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';

export type LedgerEntryState =
  | 'early_cancel'
  | 'late_cancel'
  | 'no_show'
  | 'reschedule'
  | 'completed';

export type LedgerEntryOrigin = 'mindbody' | 'journey' | 'system';

export type LedgerEntryFinancialImpact =
  | 'session_deducted'
  | 'fee_charged'
  | 'none';

export type LedgerEntryData = {
  id: string;
  state: LedgerEntryState;
  origin: LedgerEntryOrigin;
  scheduledTime: Date;
  eventTime: Date;
  scheduledServiceName: string;
  financialImpact?: LedgerEntryFinancialImpact;
  trainerName?: string;
  correctionNote?: string;
};

type LedgerEntryProps = {
  entry: LedgerEntryData;
  compact?: boolean;
  className?: string;
};

function formatTimeFull(date: Date): string {
  const d = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const t = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${d} · ${t}`;
}

function formatTimeRelative(date: Date): string {
  const ms = Math.max(0, Date.now() - date.getTime());
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (s < 60) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;

  return formatTimeFull(date);
}

const STATE_CONFIG: Record<LedgerEntryState, { rail: string; label: string; verb: string }> = {
  early_cancel: { rail: 'bg-ink-l3 dark:bg-ink-d3', label: 'Early Cancel', verb: 'Cancelled' },
  late_cancel: { rail: 'bg-amber', label: 'Late Cancel', verb: 'Cancelled' },
  no_show: { rail: 'bg-red', label: 'No Show', verb: 'Marked no-show' },
  reschedule: { rail: 'bg-yellow', label: 'Rescheduled', verb: 'Rescheduled' },
  completed: { rail: 'bg-green', label: 'Completed', verb: 'Completed' },
};

const ORIGIN_CONFIG: Record<LedgerEntryOrigin, { icon: React.ElementType; toneClass: string; bgClass: string }> = {
  mindbody: { icon: Building2, toneClass: 'text-brand', bgClass: 'bg-brand/10' },
  journey: { icon: Zap, toneClass: 'text-cta', bgClass: 'bg-cta/10' },
  system: { icon: Settings, toneClass: 'text-muted-foreground', bgClass: 'bg-muted' },
};

/**
 * LedgerEntry
 *
 * Renders an immutable history row representing an appointment lifecycle outcome.
 */
export default function LedgerEntry({ entry, compact = false, className }: LedgerEntryProps): React.ReactElement {
  const stateCfg = STATE_CONFIG[entry.state];
  const originCfg = ORIGIN_CONFIG[entry.origin];
  const IconComponent = originCfg.icon;

  let financialText = '';
  if (entry.financialImpact === 'session_deducted') {
    financialText = 'Session deducted';
  } else if (entry.financialImpact === 'fee_charged') {
    financialText = 'Fee charged';
  }

  let ariaLabel = `${stateCfg.label}`;
  if (financialText) {
    ariaLabel += `, ${financialText}`;
  }
  ariaLabel += `, scheduled ${formatTimeFull(entry.scheduledTime)}, ${stateCfg.verb.toLowerCase()} ${formatTimeRelative(entry.eventTime)}`;
  if (entry.trainerName) {
    ariaLabel += `, with ${entry.trainerName}`;
  }

  return (
    <div
      className={cn(
        "flex w-full items-stretch overflow-hidden rounded-md border border-border/40 bg-card hover:bg-muted/30 transition-colors",
        className
      )}
      role="listitem"
      aria-label={ariaLabel}
    >
      {/* 4px Colored Rail */}
      <div className={cn("w-1 shrink-0", stateCfg.rail)} aria-hidden="true" />

      {/* Main Content Area */}
      <div className="flex flex-1 items-start p-3 gap-3">
        {/* Origin Avatar */}
        <div
          className={cn("flex size-6 items-center justify-center rounded-full shrink-0", originCfg.bgClass)}
          aria-hidden="true"
        >
          <IconComponent className={cn("size-3.5", originCfg.toneClass)} />
        </div>

        {compact ? (
          /* Compact View: Single line */
          <div className="flex w-full items-center gap-2 overflow-hidden text-sm">
            <span className="font-bold whitespace-nowrap">{stateCfg.label}</span>
            <span className="text-muted-foreground">·</span>
            <span className="truncate">{entry.scheduledServiceName}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground whitespace-nowrap">
              {formatTimeRelative(entry.eventTime)}
            </span>
          </div>
        ) : (
          /* Default View: Two lines + optional correction */
          <div className="flex w-full flex-col gap-1">
            {/* Line 1 */}
            <div className="flex items-center gap-2">
              <span className="font-display italic uppercase tracking-tight text-foreground">
                {stateCfg.label}
              </span>
              {financialText && (
                <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  {financialText}
                </span>
              )}
            </div>

            {/* Line 2 */}
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <span>Scheduled {formatTimeFull(entry.scheduledTime)}</span>
              <span>·</span>
              <span>
                {stateCfg.verb} {formatTimeRelative(entry.eventTime)}
              </span>
              {entry.trainerName && (
                <>
                  <span>·</span>
                  <span>w/ {entry.trainerName}</span>
                </>
              )}
            </div>

            {/* Line 3 (Optional Correction Note) */}
            {entry.correctionNote && (
              <div className="mt-1 flex items-start gap-1.5 text-xs italic text-ink-l3 dark:text-ink-d3">
                <MessageSquare className="size-3 mt-0.5 shrink-0" aria-hidden="true" />
                <span>Correction: {entry.correctionNote}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
