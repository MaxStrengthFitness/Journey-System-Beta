/**
 * One entry in the stream.
 *
 * Reading order is deliberate and matches how a coach scans:
 *   edge colour  -> what kind of thing this is
 *   tag row      -> the specifics (which P, which machine, how urgent)
 *   body         -> the actual note, in the largest type on the card
 *   footer       -> who and when, deliberately quiet, because the brief says
 *                   the timing of a note is not what the reader is after
 */
import React, { useState } from "react";
import {
  AlertTriangle,
  Brain,
  CalendarClock,
  Check,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  Lock,
  MessageSquare,
  MoreHorizontal,
  PersonStanding,
  Route,
  Target,
  Timer,
  Undo2,
  Archive,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
  getEntryVisual,
  IMPORTANCE_META,
  relativeDay,
  toDate,
  type JournalEntry,
} from "../../types/journal";
import type { Machine } from "../../types";

const ICONS: Record<string, React.ElementType> = {
  PersonStanding,
  Route,
  Timer,
  Brain,
  HeartPulse,
  Dumbbell,
  AlertTriangle,
  ClipboardList,
  MessageSquare,
  Target,
};

const ORIGIN_LABELS: Record<string, string> = {
  manual: "Logged",
  consultation: "Consultation",
  pre_session: "Pre-session",
  in_session: "In session",
  post_session: "Post-session",
  mindbody: "Mindbody",
  profile: "Profile",
  legacy: "Archive",
};

export interface JournalEntryCardProps {
  /** React 19 types require key to be declared on the props type. */
  key?: React.Key;
  entry: JournalEntry;
  machines: Machine[];
  /** Highlight the machine chip when the card is shown in a machine context. */
  onArchive?: (entry: JournalEntry) => void;
  onResolve?: (entry: JournalEntry, resolved: boolean) => void;
  /** Compact variant used by the critical strip and the briefing screen. */
  dense?: boolean;
}

export function JournalEntryCard({
  entry,
  machines,
  onArchive,
  onResolve,
  dense = false,
}: JournalEntryCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const visual = getEntryVisual(entry.kind, entry.category);
  const Icon = ICONS[visual.icon] || MessageSquare;
  const importance = IMPORTANCE_META[entry.importance] || IMPORTANCE_META.standard;

  const occurred = toDate(entry.occurredAt);
  const until = toDate(entry.effectiveUntil);
  const machine = entry.machineId
    ? machines.find((m) => m.id === entry.machineId)
    : null;

  const isCritical = entry.importance === "critical" && !entry.resolvedAt;
  const isResolved = !!entry.resolvedAt;
  const isReadOnly = !!entry.isLegacy;

  // A window that has already closed: keep the record, drop the shouting.
  const isExpired = !!until && until.getTime() < Date.now();

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border transition-colors",
        "border-slate-200/80 dark:border-slate-800",
        "bg-white dark:bg-slate-900/70",
        dense ? "p-3 pl-4" : "p-4 pl-5",
        isCritical && [visual.tint, importance.ring],
        entry.importance === "elevated" && !isCritical && importance.ring,
        (isResolved || isExpired) && "opacity-55",
      )}
    >
      {/* Channel 1: the edge bar. Dashed when this app does not own the record. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 h-full w-[4px]",
          visual.edge,
          isReadOnly && "opacity-45",
        )}
        style={
          isReadOnly
            ? {
                maskImage:
                  "repeating-linear-gradient(to bottom, #000 0 6px, transparent 6px 11px)",
                WebkitMaskImage:
                  "repeating-linear-gradient(to bottom, #000 0 6px, transparent 6px 11px)",
              }
            : undefined
        }
      />

      {/* Tag row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-wider",
              visual.chip,
            )}
          >
            <Icon className="h-3 w-3 shrink-0" />
            {entry.kind === "coaching" && entry.category
              ? entry.category
              : visual.label}
          </span>

          {entry.kind === "life" && entry.category && (
            <span className={cn("rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-wider", visual.chip)}>
              {entry.category}
            </span>
          )}

          {machine && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-slate-300/60 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <Dumbbell className="h-3 w-3" />
              {machine.name}
            </span>
          )}

          {until && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
                isExpired
                  ? "border-slate-300/60 dark:border-slate-700 text-slate-500"
                  : "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-300",
              )}
            >
              <CalendarClock className="h-3 w-3" />
              {isExpired ? "Ended" : "Until"}{" "}
              {until.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Channel 2: importance as chrome, never as hue. */}
          {entry.importance !== "standard" && !isResolved && (
            <span
              className={cn(
                "rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-wider",
                importance.chip,
              )}
            >
              {importance.short}
            </span>
          )}
          {isResolved && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
              <Check className="h-3 w-3" /> Resolved
            </span>
          )}

          {!dense && (onArchive || onResolve) && (
            <div className="relative">
              <button
                type="button"
                aria-label="Entry actions"
                onClick={() => setMenuOpen((v) => !v)}
                onBlur={() => window.setTimeout(() => setMenuOpen(false), 120)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                {isReadOnly ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                  {isReadOnly ? (
                    <p className="px-3 py-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                      Read-only — {entry.legacySource || "imported record"}.
                      Edit it where it lives.
                    </p>
                  ) : (
                    <>
                      {onResolve && (
                        <button
                          type="button"
                          onClick={() => onResolve(entry, !isResolved)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          {isResolved ? (
                            <>
                              <Undo2 className="h-3.5 w-3.5" /> Reopen
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5" /> Mark resolved
                            </>
                          )}
                        </button>
                      )}
                      {onArchive && (
                        <button
                          type="button"
                          onClick={() => onArchive(entry)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
                        >
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* The note itself — biggest text on the card. */}
      <p
        className={cn(
          "mt-2.5 whitespace-pre-line font-medium leading-relaxed text-slate-800 dark:text-slate-100",
          dense ? "text-[13px]" : "text-sm",
        )}
      >
        {entry.body}
      </p>

      {/* Provenance, deliberately quiet. */}
      {!dense && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
          <span className="font-bold text-slate-500 dark:text-slate-400">
            {entry.authorInitials}
          </span>
          <span aria-hidden>·</span>
          <span>
            {occurred
              ? occurred.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Undated"}
          </span>
          <span aria-hidden>·</span>
          <span>{relativeDay(occurred)}</span>
          <span aria-hidden>·</span>
          <span>{entry.legacySource || ORIGIN_LABELS[entry.origin] || "Logged"}</span>
        </div>
      )}
    </article>
  );
}
