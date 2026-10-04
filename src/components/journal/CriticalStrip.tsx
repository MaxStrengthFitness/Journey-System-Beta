/**
 * "Read this before you touch the client."
 *
 * Sits above everything else and only exists when there is something to say.
 * It is the briefing's "Before you start" strip and the flags sheet's
 * "Critical". It no longer heads the record's Notes (client codex, Sep 2026):
 * there a critical note is drawn once, as a card in Open, and every other
 * page of Notes & Profile carries `features/client-notes/CriticalLine`
 * instead — one line, whole sentences, a button to the note.
 * Same selection the pre-session briefing uses — critical, unresolved, and
 * still inside its effective window — so the Journal and the briefing can
 * never disagree about what matters.
 */
import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { JournalEntryCard } from "./JournalEntryCard";
import type { JournalEntry } from "../../types/journal";
import type { Machine } from "../../types";

const PREVIEW = 3;

export function CriticalStrip({
  entries,
  machines,
  title = "Before you start",
  footer,
}: {
  entries: JournalEntry[];
  machines: Machine[];
  /** The flags sheet calls it "Critical". (The Notes catalog's "Critical & pinned" is gone.) */
  title?: string;
  /**
   * One line under each card. The briefing puts the thread's latest update
   * and "no need to remind me" here (Notes round, Sep 2026).
   */
  footer?: (entry: JournalEntry) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;

  const shown = expanded ? entries : entries.slice(0, PREVIEW);
  const hidden = entries.length - shown.length;

  return (
    // The one Critical crimson (--eq-alert, the colour of rep quality), on
    // its own opaque fill, in both themes (the Navy Frame, Oct 4 2026). A
    // Tailwind rose wash over the navy greyed out, and rose was a second red
    // for a trainer to learn beside the one on the Hub. The count line is the
    // quiet ink, not the crimson at 70%: that measured 3.7:1 on the fill.
    <section className="rounded-2xl border border-(--eq-alert)/30 bg-(--eq-alert-fill) p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--eq-alert)/15 text-(--eq-alert)">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-(--eq-alert)">
            {title}
          </h3>
          <p className="text-[11px] text-(--eq-ink-muted)">
            {entries.length} critical {entries.length === 1 ? "note" : "notes"} · also shown in the pre-session briefing
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {shown.map((e) => (
          <div key={e.id}>
            <JournalEntryCard entry={e} machines={machines} dense />
            {footer?.(e)}
          </div>
        ))}
      </div>

      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex h-10 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-(--eq-alert) transition-colors hover:text-(--eq-alert)"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Show fewer" : `${hidden} more`}
        </button>
      )}
    </section>
  );
}
