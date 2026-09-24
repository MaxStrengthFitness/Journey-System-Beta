/**
 * THE JOURNAL AREAS — mounted by area on the client record's pages.
 *
 *   1. PROGRESS REPORTS  — the shelf of finalized evaluations.
 *
 * WHAT LEFT THIS FILE in the client codex (Sep 2026): NOTES (phase 9) — the
 * Notes page is `features/client-notes/NotesPage`, the composer, the To-file
 * tray and the threads on the tab's one journal load. THE PULSE (phase 12) —
 * Body & Pulse owns the client's one Pulse draft and mounts
 * `ClientCheckInPanel` itself, with that draft. THE FOCUS BOARD (phase 14) —
 * Goals & Focus mounts `FocusBoard` itself, on the tab's one journal load,
 * with its writes from `features/goals/useFocusActions`. Nothing mounts this
 * file any more; the codex's cleanup phase deletes it.
 *
 * SINCE THE PROFILE MERGE (Sep 2026) THIS IS NOT A TAB
 * ---------------------------------------------------
 * Details and Journal became one spine, and the areas were dealt out to its
 * sections. So this component is mounted once per section, each with an
 * `areas` list naming what to draw, and the host owns navigation.
 *
 * `journal` lets the caller pass an already-loaded useClientJournal result
 * in. The codex loads it once and hands the same object to every mount, so
 * several areas of journal UI cost one set of listeners. Left out, the
 * component loads its own.
 */
import React from "react";
import { TriangleAlert } from "lucide-react";
import { useClientJournal, type UseClientJournalResult } from "../../hooks/useClientJournal";
import type {
  Client,
  Machine,
  ProgressReport,
  Trainer,
} from "../../types";
import { ProgressReportArchive } from "./ProgressReportArchive";

/** The areas, by id. */
export type JournalAreaId = "progress-reports";

export interface ClientJournalTabProps {
  clientId: string | null;
  client: Client | null;
  machines: Machine[];
  trainers: Trainer[];
  authTrainer?: Trainer | null;
  progressReports: ProgressReport[];
  onSelectReport: (id: string) => void;
  onDeleteReport: (report: ProgressReport) => void;
  onNewReport: () => void;
  hasQuotaError?: boolean;
  /**
   * Which areas to draw. Omit for all. Whoever composes the areas owns
   * the navigation; see the header.
   */
  areas?: JournalAreaId[];
  /** An already-loaded journal, so several mounts share one set of listeners. */
  journal?: UseClientJournalResult;
}

export function ClientJournalTab({
  clientId,
  client,
  trainers,
  progressReports,
  onSelectReport,
  onDeleteReport,
  onNewReport,
  hasQuotaError,
  areas,
  journal,
}: ClientJournalTabProps) {
  // Hooks cannot be called conditionally, so when a journal is handed in the
  // internal one is disabled rather than skipped. A disabled useClientJournal
  // opens no listeners, so this costs nothing but a few empty arrays.
  const ownJournal = useClientJournal({
    clientId,
    client,
    trainers,
    enabled: !hasQuotaError && !journal,
  });
  const { needsIndex, capped } = journal ?? ownJournal;

  /** Composed into a spine? Then the section shell already printed a heading. */
  const composed = Boolean(areas);
  const shows = (id: JournalAreaId) => !areas || areas.includes(id);

  /* -------------------------------- render ----------------------------- */

  return (
    <div className="space-y-6">
      {capped && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            This record is unusually large: one of its collections has more than
            200 items, and only the first 200 are loaded. Counts on this page may
            run short.
          </span>
        </div>
      )}
      {needsIndex && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Reading the journal unsorted because its Firestore index has not been
            deployed yet. Entries are sorted in the browser instead, so nothing is
            missing. Run{" "}
            <code className="rounded bg-amber-500/15 px-1 font-mono">
              firebase deploy --only firestore:indexes
            </code>{" "}
            to switch to the fast path.
          </span>
        </div>
      )}

      {/* ------------------ 1 · CLIENT PROGRESS REPORTS ------------------ */}
      {shows("progress-reports") && (
      <JournalArea
        id="progress-reports"
        bare={composed}
        title="Client Progress Reports"
        blurb="Finalized evaluations, newest first. The shelf a coach reads before a review conversation."
      >
        <ProgressReportArchive
          reports={progressReports}
          onSelect={onSelectReport}
          onDelete={onDeleteReport}
          onNew={onNewReport}
        />
      </JournalArea>
      )}
    </div>
  );
}

/**
 * One of the areas. A titled band with a one-line brief. Inside the profile
 * spine (`bare`) the section shell has already printed the heading.
 */
function JournalArea({
  id,
  title,
  blurb,
  bare = false,
  children,
}: {
  id: string;
  title: string;
  blurb: string;
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16">
      {!bare && (
        <>
          <div className="mb-3 flex items-baseline gap-3">
            <h3 className="font-display text-lg font-black uppercase italic tracking-tight text-foreground">
              {title}
            </h3>
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
          <p className="mb-3 text-[11px] font-medium text-muted-foreground">{blurb}</p>
        </>
      )}
      {children}
    </section>
  );
}
