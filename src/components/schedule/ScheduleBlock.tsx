import React from "react";
import { AlertTriangle, Unlink } from "lucide-react";
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

  const { hasPriorityNote, priorityLabel, hasClinicalHistory } =
    getClientAlertState(client);
  const showFlags = !isCompleted && !isUnavailable;
  const flagPriority = hasPriorityNote && showFlags;
  const flagClinical = hasClinicalHistory && showFlags;

  const sDate = safeToDate(
    session.startTime || session.StartDateTime || session.date,
  );
  const isOffTheHalfHour = sDate && (zonedHM(sDate)?.minute ?? 0) % 30 !== 0;
  const exactTimeStr = sDate
    ? sDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

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
        "flex flex-col p-2 sm:p-2.5 rounded-xl shadow-sm transition-all h-full box-border relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
        isUnavailable
          ? "bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_10px,#f1f5f9_10px,#f1f5f9_20px)] dark:bg-[repeating-linear-gradient(45deg,#0f172a,#0f172a_10px,#1e293b_10px,#1e293b_20px)] border-2 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-90"
          : isUnlinked
            ? "bg-slate-50 dark:bg-surface-2 border-2 border-dashed border-slate-300 dark:border-slate-600 cursor-default opacity-75"
            : isCompleted
              ? "opacity-60 grayscale bg-slate-50 dark:bg-surface-2 border-2 border-slate-200 dark:border-slate-700/80 cursor-pointer"
              : isInSession
                ? isMilestone
                  ? "bg-[#F06C22] border-2 border-[#F06C22] shadow-[0_0_15px_rgba(240,108,34,0.65)] cursor-pointer hover:shadow-[0_0_20px_rgba(240,108,34,0.8)] text-white"
                  : "bg-cyan border-2 border-cyan shadow-[0_0_12px_rgba(56,189,248,0.5)] cursor-pointer hover:shadow-[0_0_16px_rgba(56,189,248,0.7)] text-slate-955"
                : isMilestone
                  ? "bg-white dark:bg-surface-1 border-2 border-[#F06C22]/85 shadow-[0_0_10px_rgba(240,108,34,0.4)] dark:shadow-[0_0_12px_rgba(240,108,34,0.55)] cursor-pointer hover:border-[#F06C22] hover:shadow-[0_0_16px_rgba(240,108,34,0.7)]"
                  : "bg-white dark:bg-surface-1 border-2 border-cyan/85 shadow-[0_0_8px_rgba(56,189,248,0.3)] dark:shadow-[0_0_10px_rgba(56,189,248,0.45)] cursor-pointer hover:border-cyan hover:shadow-[0_0_14px_rgba(56,189,248,0.6)]",
        // LOUD signal: an outstanding priority note claims the whole left edge.
        flagPriority ? "border-l-4 border-l-red-500" : "",
      )}
    >
      <div className="flex flex-col w-full h-full justify-between items-start gap-1 relative z-10">
        <div className="w-full">
          <div className="flex items-start justify-between gap-1 mb-0.5 relative z-20">
            <span
              className={cn(
                "leading-tight truncate text-sm font-bold",
                isUnavailable
                  ? "text-slate-500 italic uppercase tracking-widest text-[11px]"
                  : isUnlinked
                    ? "text-slate-600 dark:text-slate-300"
                    : isInSession
                      ? isMilestone
                        ? "text-white font-black"
                        : "text-slate-955 font-black"
                      : "text-slate-900 dark:text-slate-50",
              )}
            >
              {isUnavailable
                ? "Unavailable"
                : formatClientName(session?.clientName || "")}
            </span>

            <div className="flex items-center gap-1 shrink-0 mt-0.5">
              {/* LOUD: read this before the session starts. */}
              {flagPriority && (
                <span
                  aria-label={priorityLabel || "Priority note"}
                  className="inline-flex items-center justify-center w-4 h-4 rounded-[5px] bg-red-500 text-white shadow-[0_0_6px_rgba(239,68,68,0.55)]"
                >
                  <AlertTriangle className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
              )}
              {/* SUBTLE: standing clinical history, background awareness only. */}
              {flagClinical && (
                <span
                  aria-label="Clinical history on file"
                  className="w-1.5 h-1.5 rounded-full bg-amber-400 ring-1 ring-amber-400/40 mt-1"
                />
              )}
            </div>
          </div>

          {isOffTheHalfHour && exactTimeStr && (
            <div className="text-[10px] font-black text-amber-500 uppercase tracking-tight">
              {exactTimeStr}
            </div>
          )}
        </div>

        {!isUnavailable && (
          <div className="w-full flex items-end justify-end mt-auto pt-1 relative z-20">
            {isUnlinked ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-tight leading-none px-1.5 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400">
                <Unlink className="w-2.5 h-2.5" />
                Not synced
              </span>
            ) : (
              <span
                aria-label={`Session number ${sessionNumber}`}
                className={cn(
                  "inline-flex items-center text-[11px] sm:text-[12px] font-black leading-none px-1.5 py-0.5 rounded-md border font-mono",
                  isCompleted
                    ? "text-slate-500/50 border-slate-200/50 bg-slate-100/50 dark:bg-surface-2"
                    : isInSession
                      ? isMilestone
                        ? "text-white bg-white/20 border-white/30 shadow-[0_0_5px_rgba(255,255,255,0.25)]"
                        : "text-slate-955 bg-black/10 border-black/20"
                      : isMilestone
                        ? "text-[#F06C22] bg-[#F06C22]/10 border-[#F06C22]/30 shadow-[0_0_5px_rgba(240,108,34,0.15)]"
                        : "text-cyan bg-cyan/10 border-cyan/20",
                )}
              >
                #{sessionNumber}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ScheduleBlock;
