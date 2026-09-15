/**
 * The linked-notes rail.
 *
 * This is the piece that closes the gap the brief describes: a coach logs a
 * "Surgery" note mid-session and it appears under Medical without anyone
 * re-typing it into a profile field. The notes are not copied here — they are
 * the same journalEntries documents, filtered by `entriesForSection`, so there
 * is exactly one place a note can be edited and exactly one version of it.
 *
 * Read-only on purpose. A rail that let you edit notes in place would give the
 * studio two editors for the same record and, sooner or later, two answers.
 */
import React, { useState } from "react";
import { ChevronDown, NotebookPen } from "lucide-react";
import { cn } from "../../lib/utils";
import { JournalEntryCard } from "../journal/JournalEntryCard";
import {
  entriesForSection,
  sectionForEntry,
  type DossierSection,
  type JournalEntry,
} from "../../types/journal";
import type { Machine } from "../../types";

const PREVIEW = 3;

/**
 * Profile fields the dossier section already shows as an editable box. The
 * journal adapter reads them as notes too (so the Notes catalog can shelve
 * them), but on their own section a card repeating the textarea right below
 * it is just the same words twice (notes catalog round, Sep 2026).
 */
const SHOWN_AS_FIELDS: Partial<Record<DossierSection, ReadonlySet<string>>> = {
  medical: new Set(["legacy:profile:medicalHistory", "legacy:profile:clinicalNotes"]),
};

export function JournalRail({
  section,
  entries,
  machines,
  onOpenJournal,
  emptyHint,
}: {
  section: DossierSection;
  entries: JournalEntry[];
  machines: Machine[];
  onOpenJournal?: () => void;
  emptyHint?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const own = SHOWN_AS_FIELDS[section];
  const linked = entriesForSection(entries, section).filter((e) => !own?.has(e.id));

  if (linked.length === 0) {
    if (!emptyHint) return null;
    return (
      <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 dark:border-slate-800">
        <p className="text-[11.5px] leading-snug text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  const shown = expanded ? linked : linked.slice(0, PREVIEW);
  const hidden = linked.length - shown.length;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
          <NotebookPen className="h-3 w-3" />
          From the journal
        </span>
        {onOpenJournal && (
          <button
            type="button"
            onClick={onOpenJournal}
            className="inline-flex h-10 items-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-[#38BDF8]"
          >
            Open journal
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {shown.map((entry) => {
          // A critical note pulled into Medical from somewhere else earns a
          // line saying so — otherwise it reads as if it were filed as medical.
          const borrowed =
            section === "medical" && sectionForEntry(entry) !== "medical";
          return (
            <div key={entry.id} className="flex flex-col gap-1">
              {borrowed && (
                <span className="pl-1 font-mono text-[9px] uppercase tracking-wider text-rose-500/80">
                  Flagged critical in the field · filed as {entry.kind}
                </span>
              )}
              <JournalEntryCard entry={entry} machines={machines} dense />
            </div>
          );
        })}
      </div>

      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex h-10 items-center gap-1 self-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-slate-600 dark:hover:text-slate-200"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Show fewer" : `${hidden} more`}
        </button>
      )}
    </div>
  );
}
