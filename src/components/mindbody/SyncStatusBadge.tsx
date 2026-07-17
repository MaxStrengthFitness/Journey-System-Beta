// AMBIGUITY: Used @/components/ui/tooltip instead of ../../components/ui/tooltip because there is no ui directory in src/components.
import React from "react";
import { AlertTriangle } from "lucide-react";
import {
  useMindbodyHealth,
  MindbodyHealth,
} from "../../contexts/MindbodyHealthContext";
import { cn } from "../../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DisplayState {
  visual: "healthy" | "degraded" | "error" | "offline";
  label: string;
}

function deriveDisplay(health: MindbodyHealth): DisplayState {
  if (health.subscriptionError) {
    return { visual: "error", label: "Health sync error" };
  }

  const visual = health.status;
  let label = "";

  if (visual === "healthy") {
    label = "";
  } else if (visual === "degraded") {
    if (!health.lastSuccessfulEventAt) {
      label = "Stale (never synced)";
    } else {
      const ms = Math.max(
        0,
        Date.now() - health.lastSuccessfulEventAt.getTime(),
      );
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);

      if (s < 60) label = `Stale ${s}s`;
      else if (m < 60) label = `Stale ${m}m`;
      else if (h < 24) label = `Stale ${h}h`;
      else label = `Stale 1d+`;
    }
  } else if (visual === "error") {
    label = "⚠️ Mindbody Sync Delayed";
  } else if (visual === "offline") {
    label = "Offline";
  }

  return { visual, label };
}

/**
 * Universal sync health indicator for the Mindbody integration.
 * Reads real-time status from the MindbodyHealthContext and displays a glanceable pill.
 * Returns null automatically for brand-new deployments (no data yet) unless there's an error.
 */
export default function SyncStatusBadge({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}): React.ReactElement | null {
  const health = useMindbodyHealth();

  if (health.hasData === false && health.subscriptionError === null) {
    return null;
  }

  const { visual, label } = deriveDisplay(health);

  const badgeClasses = cn(
    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border border-border/40 bg-foreground/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
    onClick && "cursor-pointer hover:bg-foreground/10 hover:border-border/60",
  );

  const innerContent = (
    <>
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full shrink-0", {
          "bg-green": visual === "healthy",
          "bg-amber": visual === "degraded",
          "bg-red": visual === "error",
          "bg-secondary": visual === "offline",
        })}
      />
      {visual === "error" && (
        <AlertTriangle
          className="size-3 text-red shrink-0"
          aria-hidden="true"
        />
      )}
      {label && <span>{label}</span>}
    </>
  );

  const BadgeComp = onClick ? (
    <button
      onClick={onClick}
      className={badgeClasses}
      role="status"
      aria-live="polite"
    >
      {innerContent}
    </button>
  ) : (
    <span className={badgeClasses} role="status" aria-live="polite">
      {innerContent}
    </span>
  );

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger render={BadgeComp} />
        <TooltipContent
          side="bottom"
          className="flex flex-col gap-1 px-3 py-2 text-xs"
        >
          <p className="font-semibold text-sm">
            {visual.charAt(0).toUpperCase() + visual.slice(1)}
          </p>
          <p className="text-muted-foreground">
            Last sync:{" "}
            {health.lastSuccessfulEventAt
              ? health.lastSuccessfulEventAt.toLocaleString()
              : "Never"}
          </p>
          {health.dlqDepth > 0 && (
            <p className="text-muted-foreground font-medium">
              DLQ depth: {health.dlqDepth}
            </p>
          )}
          {health.signatureFailures24h > 0 && (
            <p className="text-muted-foreground font-medium">
              Signature failures (24h): {health.signatureFailures24h}
            </p>
          )}
          {health.subscriptionError && (
            <p className="text-red font-medium mt-1">
              {health.subscriptionError.message}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
