import React from 'react';
import { Lock, Hourglass, CheckCircle, Users } from 'lucide-react';
import { cn } from '../../lib/utils';

type ForeignVisitorBannerProps =
  | {
      variant: 'profile';
      clientFirstName: string;
      homeStudioName: string;
      accessState: 'locked' | 'pending' | 'granted';
      grantedAt?: Date;
      onRequestAccess?: () => void;
      className?: string;
    }
  | {
      variant: 'roster-summary';
      visitorCount: number;
      onClick?: () => void;
      className?: string;
    };

function getGrantedAtRelative(date?: Date): string {
  if (!date) return '';

  const ms = Math.max(0, Date.now() - date.getTime());
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (s < 60) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return date.toLocaleDateString();
}

/**
 * ForeignVisitorBanner
 *
 * Surfaces cross-location integration and access constraints.
 * WCAG Note: 'amber' and 'cyan' states use these colors as background fills
 * with a dark text/foreground to ensure AA+ contrast ratios. Do not use them
 * as text colors against a light default background.
 */
export default function ForeignVisitorBanner(
  props: ForeignVisitorBannerProps
): React.ReactElement | null {
  if (props.variant === 'roster-summary') {
    if (props.visitorCount === 0) return null;

    const copy =
      props.visitorCount === 1
        ? `1 cross-region visitor today — review access.`
        : `${props.visitorCount} cross-region visitors today — review access.`;

    const commonClasses = cn(
      "w-full flex items-center justify-start gap-2 px-3 py-2 rounded-md",
      "bg-amber dark:bg-yellow text-ink-l1",
      props.onClick && "hover:bg-amber/90 dark:hover:bg-yellow/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors",
      props.className
    );

    const content = (
      <>
        <Users className="size-4 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">{copy}</span>
      </>
    );

    if (props.onClick) {
      return (
        <button
          onClick={props.onClick}
          className={commonClasses}
          role="region"
          aria-label={copy}
        >
          {content}
        </button>
      );
    }
    return (
      <div className={commonClasses} role="region" aria-label={copy}>
        {content}
      </div>
    );
  }

  // Profile variant
  const {
    clientFirstName,
    homeStudioName,
    accessState,
    grantedAt,
    onRequestAccess,
    className,
  } = props;

  if (accessState === 'locked') {
    const copy = `${clientFirstName} trains at ${homeStudioName}. Cross-train access required.`;
    return (
      <div
        className={cn(
          "w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-4 rounded-lg",
          "bg-amber dark:bg-yellow text-ink-l1",
          className
        )}
        role="region"
        aria-label={copy}
      >
        <div className="flex items-center gap-3">
          <Lock className="size-5 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium">{copy}</span>
        </div>
        {onRequestAccess && (
          <button
            onClick={onRequestAccess}
            className="shrink-0 px-3 py-1.5 text-sm font-semibold rounded-md border border-ink-l1/30 bg-ink-l1 text-amber hover:bg-ink-l1/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-l1 focus-visible:ring-offset-2 focus-visible:ring-offset-amber"
            aria-label={`Request cross-train access for ${clientFirstName}`}
          >
            Request Access
          </button>
        )}
      </div>
    );
  }

  if (accessState === 'pending') {
    const copy = `Cross-train request submitted to ${homeStudioName} leadership.`;
    return (
      <div
        className={cn(
          "w-full flex items-center justify-start gap-3 px-4 py-4 rounded-lg",
          "bg-cyan text-ink-l1",
          className
        )}
        role="region"
        aria-label={copy}
      >
        <Hourglass className="size-5 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">{copy}</span>
      </div>
    );
  }

  if (accessState === 'granted') {
    const relativeTime = getGrantedAtRelative(grantedAt);
    const suffix = relativeTime ? ` ${relativeTime}.` : '.';
    const copy = `${clientFirstName}'s home studio is ${homeStudioName} — permanent cross-train access granted${suffix}`;
    return (
      <div
        className={cn(
          "w-full flex items-center justify-start gap-3 px-4 py-4 rounded-lg",
          "bg-green/10 border border-green text-ink-l1 dark:bg-green/15 dark:text-ink-d1",
          className
        )}
        role="region"
        aria-label={copy}
      >
        <CheckCircle className="size-5 shrink-0 text-green" aria-hidden="true" />
        <span className="text-sm font-medium">{copy}</span>
      </div>
    );
  }

  return null;
}
