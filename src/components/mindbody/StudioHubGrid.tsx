import React, { useId } from 'react';
import { cn } from '../../lib/utils';

export type StudioHubRole = 'trainer' | 'leader';

export type StudioHubGridProps = {
  role: StudioHubRole;
  studioName?: string;
  dailyPulse?: {
    shiftRoster?: React.ReactNode;
    waitlistRecovery?: React.ReactNode;
    foreignVisitorSummary?: React.ReactNode;
  };
  lifecycle?: {
    newLeads?: React.ReactNode;
    crucialFirst10?: React.ReactNode;
    milestones?: React.ReactNode;
  };
  retention?: {
    reliabilityScore?: React.ReactNode;
    atRiskQuickKeys?: React.ReactNode;
    noShowQueue?: React.ReactNode;
    waiverBillingAlerts?: React.ReactNode;
  };
  className?: string;
};

/**
 * StudioHubGrid
 *
 * An orchestration layout component that arranges dashboard tiles into three tiers.
 * The order of tiers and the visual "hero" treatment are driven by the user's role.
 */
export default function StudioHubGrid({
  role,
  studioName,
  dailyPulse,
  lifecycle,
  retention,
  className,
}: StudioHubGridProps): React.ReactElement {
  const baseId = useId();

  // Extract valid slot nodes per tier
  const dailyNodes = dailyPulse
    ? [dailyPulse.shiftRoster, dailyPulse.waitlistRecovery, dailyPulse.foreignVisitorSummary].filter(Boolean)
    : [];

  const lifecycleNodes = lifecycle
    ? [lifecycle.newLeads, lifecycle.crucialFirst10, lifecycle.milestones].filter(Boolean)
    : [];

  const retentionNodes = retention
    ? [
        retention.reliabilityScore,
        retention.atRiskQuickKeys,
        retention.noShowQueue,
        retention.waiverBillingAlerts,
      ].filter(Boolean)
    : [];

  // Determine rendering order based on role
  const tiers: { name: 'daily' | 'lifecycle' | 'retention'; nodes: React.ReactNode[] }[] = [];

  if (role === 'trainer') {
    if (dailyNodes.length > 0) tiers.push({ name: 'daily', nodes: dailyNodes });
    if (lifecycleNodes.length > 0) tiers.push({ name: 'lifecycle', nodes: lifecycleNodes });
    if (retentionNodes.length > 0) tiers.push({ name: 'retention', nodes: retentionNodes });
  } else {
    if (retentionNodes.length > 0) tiers.push({ name: 'retention', nodes: retentionNodes });
    if (dailyNodes.length > 0) tiers.push({ name: 'daily', nodes: dailyNodes });
    if (lifecycleNodes.length > 0) tiers.push({ name: 'lifecycle', nodes: lifecycleNodes });
  }

  const headingText = studioName ? `${studioName} · Hub` : 'Studio Hub';

  return (
    <main
      role="main"
      aria-label="Studio hub dashboard"
      className={cn("flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full", className)}
    >
      <h1 className="font-display italic uppercase text-2xl tracking-tight text-foreground mb-2">
        {headingText}
      </h1>

      {tiers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center text-muted-foreground">
          No tiles configured for this view yet.
        </div>
      ) : (
        tiers.map((tier) => {
          const isHero =
            (tier.name === 'daily' && role === 'trainer') ||
            (tier.name === 'retention' && role === 'leader');

          const label =
            tier.name === 'daily'
              ? 'DAILY PULSE'
              : tier.name === 'lifecycle'
              ? 'LIFECYCLE'
              : 'RETENTION';

          const headingId = `${baseId}-${tier.name}`;

          return (
            <section
              key={tier.name}
              aria-labelledby={headingId}
              className={
                isHero
                  ? "relative rounded-3xl border-2 border-cta/40 bg-card/40 p-4 sm:p-5 shadow-[0_8px_32px_rgba(243,116,39,0.12)]"
                  : undefined
              }
            >
              {isHero && (
                <span
                  role="status"
                  className="absolute top-2 right-3 text-[10px] font-display italic uppercase tracking-widest bg-cta text-white px-2 py-0.5 rounded-full"
                >
                  HERO
                </span>
              )}
              <h2
                id={headingId}
                className="font-display italic uppercase text-sm tracking-widest text-muted-foreground mb-3 flex items-center gap-2"
              >
                <span className="size-1.5 rounded-full bg-cta" aria-hidden="true" />
                {label}
              </h2>
              <div
                className={cn(
                  "grid grid-cols-1 lg:grid-cols-3 gap-4",
                  isHero ? "min-h-[480px]" : "min-h-[220px]"
                )}
              >
                {tier.nodes.map((node, idx) => (
                  <React.Fragment key={idx}>{node}</React.Fragment>
                ))}
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
