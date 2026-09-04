import React from "react";
import { AlertTriangle, CloudOff, HeartPulse } from "lucide-react";
import { Client, WorkoutSession } from "../../types";
import { getClientAlertState } from "../../lib/client-alerts";
import { safeToDate, getMillis } from "../../lib/utils";
import { zonedHM } from "../../lib/studio-time";
import { cn } from "@/lib/utils";

interface ScheduleBlockProps {
  /** Declared explicitly: this repo has no @types/react, so JSX does not
   *  supply `key` through IntrinsicAttributes (house convention). */
  key?: string | number;
  /** Raw schedule doc (Mindbody-sourced). Untyped upstream — kept as-is. */
  session: any;
  /** Resolved Max Strength client, or null when the Mindbody link is missing. */
  client: Client | null;
  /** Today's workout session for this client, if one exists. */
  workoutSession?: WorkoutSession | null;
  onOpenClient: (clientId: string) => void;
}

const formatClientName = (name: string): string => {
  if (!name) return "";
  const parts = name.trim().split(" ");
  if (parts.length > 1) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  return parts[0];
};

/** "9:00" / "9:30 AM" in STUDIO time, so the label matches the row it sits in. */
const studioClock = (date: Date | null, withSuffix: boolean): string => {
  if (!date) return "";
  const hm = zonedHM(date);
  if (!hm) return "";
  const h12 = hm.hour % 12 === 0 ? 12 : hm.hour % 12;
  const mm = String(hm.minute).padStart(2, "0");
  return withSuffix ? `${h12}:${mm} ${hm.hour >= 12 ? "PM" : "AM"}` : `${h12}:${mm}`;
};

/**
 * One appointment on the Hub grid.
 *
 * Mindbody-style: a solid colored LEFT EDGE carries the status, the surface
 * stays quiet, and the content is a tight stack of name → time → session type.
 * No thick borders, minimal padding — the grid is dense on purpose.
 */
export function ScheduleBlock({
  session,
  client,
  workoutSession,
  onOpenClient,
}: ScheduleBlockProps) {
  const isUnavailable = Boolean(
    session?.clientName?.toLowerCase().includes("unavailab"),
  );
  const isInSession = workoutSession?.status === "In-Progress";
  const isAlreadyCompleted = workoutSession?.status === "Completed";
  const isCompleted = Boolean(
    session &&
      !isInSession &&
      (session.status === "Completed" ||
        getMillis(session.startTime || session.StartDateTime) < Date.now()),
  );
  const isUnlinked = !client && !isUnavailable;

  // Where the client is in their journey. Unknown until the profile resolves.
  const sessionNumber = client
    ? (client.sessionCount || 0) + (isAlreadyCompleted ? 0 : 1)
    : null;
  const isMilestone =
    sessionNumber !== null && (sessionNumber === 1 || sessionNumber % 25 === 0);

  const {
    hasPriorityNote,
    priorityLabel,
    hasClinicalHistory,
    hasCheckInRedFlag,
    checkInFlagLabel,
  } = getClientAlertState(client);
  const showFlags = !isCompleted && !isUnavailable;
  const flagPriority = hasPriorityNote && showFlags;
  const flagClinical = hasClinicalHistory && showFlags;
  const flagCheckIn = hasCheckInRedFlag && showFlags;

  const startDate = safeToDate(
    session.startTime || session.StartDateTime || session.date,
  );
  const endDate = safeToDate(session.endTime || session.EndDateTime);
  const timeLabel = endDate
    ? `${studioClock(startDate, false)} – ${studioClock(endDate, true)}`
    : studioClock(startDate, true);
  const serviceName: string = session?.serviceName || session?.sessionType || "";

  /**
   * An unlinked block is inert. There is deliberately no manual link or
   * "create profile" path: under strict mode a client lives at
   * `clients/{mindbodyClientId}` and nowhere else, so anything created by hand
   * here would be a duplicate outside the canonical path. The block stays greyed
   * out until the next sync creates the document.
   */
  const isInteractive = !isUnavailable && !!client;

  const handleClick = () => {
    if (!isInteractive) return;
    onOpenClient(client!.id!);
  };

  // Edge-bar color = status. Priority notes win because they must be read first.
  const edge = flagPriority
    ? "border-l-red-500"
    : isUnavailable
      ? "border-l-slate-300 dark:border-l-slate-600"
      : isUnlinked
        ? "border-l-slate-400 dark:border-l-slate-500"
        : isCompleted
          ? "border-l-slate-400 dark:border-l-slate-600"
          : isMilestone
            ? "border-l-orange-500"
            : "border-l-cyan";

  const surface = isUnavailable
    ? "bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_8px,#eef2f7_8px,#eef2f7_16px)] dark:bg-[repeating-linear-gradient(45deg,#0f172a,#0f172a_8px,#1e293b_8px,#1e293b_16px)] cursor-not-allowed"
    : isUnlinked
      ? "bg-slate-100/80 dark:bg-slate-800/40 outline outline-1 outline-dashed -outline-offset-1 outline-slate-300 dark:outline-slate-700 cursor-default"
      : isCompleted
        ? "bg-slate-100/70 dark:bg-slate-800/30 opacity-70 cursor-pointer"
        : isInSession
          ? isMilestone
            ? "bg-orange-500/15 dark:bg-orange-500/20 cursor-pointer"
            : "bg-cyan/15 dark:bg-cyan/20 cursor-pointer"
          : "bg-white dark:bg-slate-800/70 ring-1 ring-inset ring-slate-200/80 dark:ring-white/5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer";

  const nameTone = isUnavailable
    ? "text-slate-500 italic uppercase tracking-widest text-[10px]"
    : isUnlinked
      ? "text-slate-600 dark:text-slate-300"
      : "text-slate-900 dark:text-slate-50";

  const metaTone = isUnavailable
    ? "text-slate-400"
    : "text-slate-500 dark:text-slate-400";

  return (
    <div
      onClick={handleClick}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : -1}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      title={
        isUnlinked
          ? `${session?.clientName || "Reservation"} — no Max Strength profile yet. It will link itself once the next Mindbody sync creates one.`
          : priorityLabel || undefined
      }
      className={cn(
        "flex flex-col flex-1 min-h-0 w-full px-1.5 py-1 rounded-md border-l-4 relative overflow-hidden transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
        edge,
        surface,
      )}
    >
      {/* Line 1: client name + flags */}
      <div className="flex items-start justify-between gap-1 min-w-0">
        <span className={cn("truncate text-[13px] font-bold leading-tight", nameTone)}>
          {isUnavailable
            ? "Unavailable"
            : formatClientName(session?.clientName || "")}
        </span>
        <div className="flex items-center gap-1 shrink-0 mt-px">
          {isInSession && (
            <span
              aria-label="Session in progress"
              className={cn(
                "w-1.5 h-1.5 rounded-full animate-pulse",
                isMilestone ? "bg-orange-500" : "bg-cyan",
              )}
            />
          )}
          {/* LOUD: read this before the session starts. */}
          {flagPriority && (
            <span
              aria-label={priorityLabel || "Priority note"}
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-[4px] bg-red-500 text-white"
            >
              <AlertTriangle className="w-2.5 h-2.5" strokeWidth={3} />
            </span>
          )}
          {/* COACHING: the last 90-day check-in scored Red somewhere the
              reference document says to auto-flag. A conversation, not an
              emergency — so a pulse glyph, not the warning triangle. */}
          {flagCheckIn && (
            <span
              aria-label={checkInFlagLabel || "90-day check-in flag"}
              title={checkInFlagLabel || undefined}
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-[4px] bg-rose-500/15 text-rose-600 ring-1 ring-rose-500/40 dark:text-rose-300"
            >
              <HeartPulse className="w-2.5 h-2.5" strokeWidth={3} />
            </span>
          )}
          {/* SUBTLE: standing clinical history, background awareness only. */}
          {flagClinical && (
            <span
              aria-label="Clinical history on file"
              className="w-1.5 h-1.5 rounded-full bg-amber-400 ring-1 ring-amber-400/40"
            />
          )}
        </div>
      </div>

      {/* Line 2: time (studio clock) */}
      {!isUnavailable && timeLabel && (
        <span className={cn("text-[10px] font-semibold tabular-nums leading-tight truncate", metaTone)}>
          {timeLabel}
        </span>
      )}

      {/* Line 3: session type */}
      {!isUnavailable && serviceName && (
        <span className={cn("text-[10px] font-medium leading-tight truncate pr-6", metaTone)}>
          {serviceName}
        </span>
      )}

      {/* Bottom-right corner: sync state or journey number */}
      {!isUnavailable &&
        (isUnlinked ? (
          <CloudOff
            aria-label="Not synced to a Max Strength profile yet"
            className="absolute bottom-1 right-1 w-3 h-3 text-slate-400 dark:text-slate-500"
          />
        ) : (
          <span
            aria-label={`Session number ${sessionNumber}`}
            className={cn(
              "absolute bottom-0.5 right-1 text-[9px] font-bold tabular-nums leading-none",
              isCompleted
                ? "text-slate-400/70"
                : isMilestone
                  ? "text-orange-500"
                  : "text-cyan-700 dark:text-cyan",
            )}
          >
            #{sessionNumber}
          </span>
        ))}
    </div>
  );
}

export default ScheduleBlock;
