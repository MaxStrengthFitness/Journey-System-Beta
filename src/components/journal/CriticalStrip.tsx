/**
 * "Read this before you touch the client."
 *
 * Sits above everything else and only exists when there is something to say.
 * Same selection the pre-session briefing uses — critical, unresolved, and
 * still inside its effective window — so the Journal and the briefing can
 * never disagree about what matters.
 */
import React, { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { JournalEntryCard } from "./JournalEntryCard";
import type { JournalEntry } from "../../types/journal";
import type { Machine } from "../../types";

const PREVIEW = 3;

export function CriticalStrip({
  entries,
  machines,
}: {
  entries: JournalEntry[];
  machines: Machine[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;

  const shown = expanded ? entries : entries.slice(0, PREVIEW);
  const hidden = entries.length - shown.length;

  return (
    <section
      className={cn(
        "rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] p-3.5",
        "dark:border-rose-500/25 dark:bg-rose-500/[0.07]",
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-rose-600 dark:text-rose-300">
            Before you start
          </h3>
          <p className="text-[11px] text-rose-600/70 dark:text-rose-300/70">
            {entries.length} critical {entries.length === 1 ? "note" : "notes"} · also shown in the pre-session briefing
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {shown.map((e) => (
          <JournalEntryCard key={e.id} entry={e} machines={machines} dense />
        ))}
      </div>

      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-600/80 transition-colors hover:text-rose-600 dark:text-rose-300/80 dark:hover:text-rose-300"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Show fewer" : `${hidden} more`}
        </button>
      )}
    </section>
  );
}
