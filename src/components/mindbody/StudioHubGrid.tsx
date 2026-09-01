import React, { useId } from "react";
import { cn } from "../../lib/utils";
import { ErrorBoundary } from "../ErrorBoundary";

import { AlertTriangle } from "lucide-react";

export type StudioHubRole = "trainer" | "leader";

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
    ? [
        dailyPulse.shiftRoster,
        dailyPulse.waitlistRecovery,
        dailyPulse.foreignVisitorSummary,
      ].filter(Boolean)
    : [];

  const lifecycleNodes = lifecycle
    ? [
        lifecycle.newLeads,
        lifecycle.crucialFirst10,
        lifecycle.milestones,
      ].filter(Boolean)
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
  const tiers: {
    name: "daily" | "lifecycle" | "retention";
    nodes: React.ReactNode[];
  }[] = [];

  if (role === "trainer") {
    if (dailyNodes.length > 0) tiers.push({ name: "daily", nodes: dailyNodes });
    if (lifecycleNodes.length > 0)
      tiers.push({ name: "lifecycle", nodes: lifecycleNodes });
    if (retentionNodes.length > 0)
      tiers.push({ name: "retention", nodes: retentionNodes });
  } else {
    if (retentionNodes.length > 0)
      tiers.push({ name: "retention", nodes: retentionNodes });
    if (dailyNodes.length > 0) tiers.push({ name: "daily", nodes: dailyNodes });
    if (lifecycleNodes.length > 0)
      tiers.push({ name: "lifecycle", nodes: lifecycleNodes });
  }

  const headingText = studioName ? `${studioName} · Hub` : "Studio Hub";

  return (
    <main
      role="main"
      aria-label="Studio hub dashboard"
      className={cn(
        "flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full",
        className,
      )}
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
            (tier.name === "daily" && role === "trainer") ||
            (tier.name === "retention" && role === "leader");

          const label =
            tier.name === "daily"
              ? "DAILY PULSE"
              : tier.name === "lifecycle"
                ? "LIFECYCLE"
                : "RETENTION";

          const headingId = `${baseId}-${tier.name}`;

          return (
            <section
              key={tier.name}
              aria-labelledby={headingId}
              className={cn(
                "rounded-3xl border p-4 sm:p-5 transition-all overflow-hidden min-w-0",
                isHero
                  ? "border-amber-500/40 bg-white dark:bg-slate-900 shadow-sm relative"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
              )}
            >
              {isHero && (
                <span
                  role="status"
                  className="absolute top-3 right-4 text-[10px] font-display italic font-bold uppercase tracking-widest bg-[#F06C22] text-white px-2.5 py-0.5 rounded-full shadow-sm"
                >
                  HERO
                </span>
              )}
              <h2
                id={headingId}
                className="font-display italic uppercase text-xs sm:text-sm font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2"
              >
                <span
                  className="h-2 w-2 rounded-full bg-[#F06C22]"
                  aria-hidden="true"
                />
                {label}
              </h2>
              <div
                className={cn(
                  "grid grid-cols-1 lg:grid-cols-3 gap-4 w-full min-w-0 overflow-x-auto no-scrollbar",
                  isHero ? "min-h-90" : "min-h-50",
                )}
              >
                {tier.nodes.map((node, idx) => (
                  <ErrorBoundary
                    key={idx}
                    fallback={
                      <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl h-full text-center">
                        <AlertTriangle className="w-6 h-6 text-rose-500 mb-2 opacity-50" />
                        <p className="text-sm font-bold text-slate-500 max-w-37.5">
                          Widget unavailable
                        </p>
                      </div>
                    }
                  >
                    <div className="w-full min-w-0 overflow-x-auto no-scrollbar">
                      {node}
                    </div>
                  </ErrorBoundary>
                ))}
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
