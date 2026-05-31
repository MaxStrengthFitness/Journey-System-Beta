import React from 'react';
import { Zap, CheckCircle, Receipt, ArrowRight, Lock, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '../../lib/utils';

export type AppointmentState =
  | 'scheduled'
  | 'arrived'
  | 'active'
  | 'completed'
  | 'late_cancel'
  | 'no_show'
  | 'reschedule';

export type AppointmentSyncState = 'fresh' | 'syncing' | 'stale' | 'error';

export type AppointmentCardProps = {
  appointmentId: string;
  clientName: string;
  time: string;
  state: AppointmentState;
  syncState?: AppointmentSyncState;
  isNextUp?: boolean;
  isForeign?: boolean;
  isLocked?: boolean;
  rescheduledToTime?: string;
  onClick?: () => void;
  className?: string;
};

function getStateLabel(state: AppointmentState): string {
  switch (state) {
    case 'scheduled': return 'scheduled';
    case 'arrived': return 'arrived';
    case 'active': return 'active session';
    case 'completed': return 'completed';
    case 'late_cancel': return 'late cancel';
    case 'no_show': return 'no show';
    case 'reschedule': return 'rescheduled';
    default: return state;
  }
}

function formatTimeChip(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  let hour = parseInt(h, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${m} ${period}`;
}

function getStateClasses(state: AppointmentState, isNextUp?: boolean): string {
  switch (state) {
    case 'scheduled':
      if (isNextUp) {
        return 'bg-gradient-to-br from-cta to-cta-strong text-white shadow-[0_4px_12px_var(--color-cta)] border-transparent border-[1.5px]';
      }
      return 'bg-white border-[1.5px] border-cta text-ink-l1 dark:bg-bg-dark-2 dark:text-ink-d1';
    case 'arrived':
      return 'bg-white border-[1.5px] border-l-4 border-cyan border-r-cta border-y-cta dark:bg-bg-dark-2 text-ink-l1 dark:text-ink-d1';
    case 'active':
      return 'bg-cta text-white shadow-[0_0_24px_var(--color-cta)] animate-pulse border-transparent border-[1.5px]';
    case 'completed':
      return 'bg-white text-ink-l3 dark:bg-bg-dark-2 dark:text-ink-d3 border-[1.5px] border-green/40';
    case 'late_cancel':
      return 'bg-white border-[1.5px] border-amber dark:bg-bg-dark-2 text-ink-l1 dark:text-ink-d1';
    case 'no_show':
      return 'bg-white border-[1.5px] border-l-4 border-red border-r-red border-y-red dark:bg-bg-dark-2 text-ink-l1 dark:text-ink-d1';
    case 'reschedule':
      return 'bg-white border-[1.5px] border-yellow dark:bg-bg-dark-2 text-ink-l1 dark:text-ink-d1';
    default:
      return '';
  }
}

/**
 * AppointmentCard
 * 
 * Trainer-facing summary of an individual session outcome, supporting multi-state syncing indicators
 * and structured visual overlays for foreign cross-training clients.
 */
export default function AppointmentCard({
  appointmentId,
  clientName,
  time,
  state,
  syncState = 'fresh',
  isNextUp,
  isForeign,
  isLocked,
  rescheduledToTime,
  onClick,
  className,
}: AppointmentCardProps): React.ReactElement {
  const formattedTime = formatTimeChip(time);

  let leftNode: React.ReactNode = null;
  let nameClass = 'uppercase truncate text-[12px]';
  let trailingNode: React.ReactNode = null;

  switch (state) {
    case 'scheduled':
      if (isNextUp) {
        leftNode = <div className="shrink-0 rounded bg-white text-cta px-1.5 py-0.5 text-[10px] font-bold">{formattedTime}</div>;
      } else {
        leftNode = <div className="shrink-0 rounded bg-cta text-white px-1.5 py-0.5 text-[10px] font-bold">{formattedTime}</div>;
        nameClass += ' font-medium';
      }
      break;
    case 'arrived':
      leftNode = (
        <div className="shrink-0 flex w-6 items-center justify-center">
          <div className="size-2.5 rounded-full bg-cyan animate-pulse" aria-hidden="true" />
        </div>
      );
      nameClass += ' font-medium';
      break;
    case 'active':
      leftNode = <div className="shrink-0 text-[10px] font-bold opacity-90">{formattedTime}</div>;
      nameClass += ' font-bold';
      trailingNode = <Zap className="size-4 shrink-0" aria-hidden="true" />;
      break;
    case 'completed':
      nameClass += ' font-medium';
      trailingNode = <CheckCircle className="size-4 text-green shrink-0" aria-hidden="true" />;
      break;
    case 'late_cancel':
      leftNode = <div className="shrink-0 text-[10px] font-bold opacity-80">{formattedTime}</div>;
      nameClass += ' line-through text-ink-l3 dark:text-ink-d3';
      trailingNode = <Receipt className="size-4 text-amber shrink-0" aria-hidden="true" />;
      break;
    case 'no_show':
      leftNode = <div className="shrink-0 rounded bg-red text-white px-1.5 py-0.5 text-[10px] font-bold">NS</div>;
      nameClass += ' line-through text-red';
      break;
    case 'reschedule':
      leftNode = (
        <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold">
          <span className="text-ink-l1 dark:text-ink-d1">{formattedTime}</span>
          <ArrowRight className="size-3 text-yellow" aria-hidden="true" />
          <span className="text-ink-l1 dark:text-ink-d1">
            {rescheduledToTime ? formatTimeChip(rescheduledToTime) : ''}
          </span>
        </div>
      );
      break;
  }

  let ariaLabel = `${clientName}, ${getStateLabel(state)}, scheduled ${formattedTime}`;
  if (state === 'reschedule' && rescheduledToTime) {
    ariaLabel += `, now ${formatTimeChip(rescheduledToTime)}`;
  }
  if (isForeign) {
    ariaLabel += ', foreign visitor';
  }

  const containerClasses = cn(
    "flex min-h-[44px] w-full items-center justify-start rounded-lg relative overflow-hidden transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    getStateClasses(state, isNextUp),
    isForeign && "outline outline-2 outline-dashed outline-amber/70 outline-offset-2 dark:outline-yellow/70",
    onClick && state !== 'completed' && "hover:translate-y-[-1px] hover:shadow-md",
    onClick && isLocked && "cursor-not-allowed",
    className
  );

  const InnerContent = (
    <>
      {/* Sync Indicators */}
      {syncState === 'syncing' && (
        <div className="absolute top-0.5 left-0.5 size-1.5 rounded-full bg-cyan animate-pulse" aria-hidden="true" />
      )}
      {syncState === 'stale' && (
        <div className="absolute top-0.5 left-0.5 size-1.5 rounded-full bg-amber" aria-hidden="true" />
      )}
      {syncState === 'error' && (
        <span className="absolute top-0.5 left-0.5" aria-hidden="true">
          <AlertCircle className="size-3 text-red" />
        </span>
      )}

      {/* Foreign Overlay Lock */}
      {isForeign && isLocked && (
        <Lock className="absolute top-0.5 right-0.5 size-3 text-ink-l1 bg-amber dark:bg-yellow rounded-full p-0.5" aria-hidden="true" />
      )}

      {/* Central Flow Content */}
      <div className="flex w-full flex-1 items-center justify-between gap-2 overflow-hidden px-3 py-1.5 font-display italic">
        <div className="flex flex-1 items-center gap-2 overflow-hidden w-full text-left">
          {leftNode}
          <div className={nameClass}>{clientName}</div>
        </div>
        {trailingNode && (
          <div className="flex shrink-0 items-center justify-center">
            {trailingNode}
          </div>
        )}
      </div>

      {/* TUT animating bar placeholder */}
      {state === 'active' && (
        <div className="absolute bottom-0 left-0 h-0.5 w-[70%] animate-pulse bg-white/80" aria-hidden="true" />
      )}
    </>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            onClick ? (
              <button 
                type="button"
                onClick={onClick} 
                className={containerClasses} 
                aria-label={ariaLabel}
              >
                {InnerContent}
              </button>
            ) : (
              <div 
                className={containerClasses} 
                aria-label={ariaLabel}
              >
                {InnerContent}
              </div>
            )
          }
        />
        <TooltipContent side="bottom" align="center">
          <div>{clientName}</div>
          {syncState === 'error' && (
            <div className="text-red text-[10px] mt-1">Sync error — data may be stale</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
