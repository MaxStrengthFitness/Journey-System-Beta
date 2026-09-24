/**
 * THE JOURNAL AREAS — mounted by area on the client record's pages.
 *
 *   1. PROGRESS REPORTS  — the shelf of finalized evaluations.
 *   2. ASSESSMENT        — the modular assessment (Pulse), filled a piece at
 *                          a time.
 *   3. FOCUS             — what each coach is working on (the 4 P's), with
 *                          check-in, extend, achieved and retire, and the
 *                          history of every past focus.
 *
 * NOTES LEFT THIS FILE in the client codex (Sep 2026): the Notes page is
 * `features/client-notes/NotesPage` — the composer, the To-file tray and the
 * threads — on the tab's one journal load. The Pulse and Focus areas are
 * still mounted here by the Body & Pulse and Goals & Focus pages until those
 * pages are rebuilt; then this file goes.
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
 *
 * Each mount is its own component instance with its own state. Nothing may
 * rely on state set in one mount being seen by another — that is exactly how
 * focus check-ins used to lose their focus id (fixed in the Goals & Focus
 * round: the focus card files its own check-in).
 */
import React from "react";
import { TriangleAlert } from "lucide-react";
import { useClientJournal, type UseClientJournalResult } from "../../hooks/useClientJournal";
import { useFocusActions } from "../../features/goals/useFocusActions";
import type {
  Client,
  Machine,
  ProgressReport,
  Trainer,
} from "../../types";
import { FocusBoard } from "./FocusBoard";
import { ProgressReportArchive } from "./ProgressReportArchive";
import { ClientCheckInPanel } from "./ClientCheckInPanel";

/** The areas, by id. */
export type JournalAreaId = "progress-reports" | "check-in" | "focus";

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
   * Which areas to draw. Omit for all three. Whoever composes the areas owns
   * the navigation; see the header.
   */
  areas?: JournalAreaId[];
  /** An already-loaded journal, so several mounts share one set of listeners. */
  journal?: UseClientJournalResult;
}

export function ClientJournalTab({
  clientId,
  client,
  machines,
  trainers,
  authTrainer,
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
  const { entries, focuses, needsIndex, capped } = journal ?? ownJournal;

  /** Composed into a spine? Then the section shell already printed a heading. */
  const composed = Boolean(areas);
  const shows = (id: JournalAreaId) => !areas || areas.includes(id);

  /** Set, achieve, extend, retire, check in — the Focus area's writes. */
  const focusActions = useFocusActions({ clientId, client, authTrainer });

  /* The focus actions (create, achieve, extend, retire, and the check-in
     that carries its focus id) live in features/goals/useFocusActions.ts,
     shared with the codex's Goals & Focus page. */

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

      {/* ----------------------- 2 · ASSESSMENT -------------------------- */}
      {shows("check-in") && (
      <JournalArea
        id="check-in"
        // Inside the record the section and the panel already say
        // "Assessment" — a third heading is noise.
        bare={composed}
        title="Pulse"
        blurb="A living record, filled in a piece at a time and saved as you go. Open one topic, answer it, come back next session."
      >
        <ClientCheckInPanel client={client} trainer={authTrainer ?? null} machines={machines} />
      </JournalArea>
      )}

      {/* ---------------------------- 3 · FOCUS -------------------------- */}
      {shows("focus") && (
      <JournalArea
        id="focus"
        bare={composed}
        title="Focus"
        blurb="What each coach is working on with this client, and whether it was achieved."
      >
        <FocusBoard
          focuses={focuses}
          entries={entries}
          machines={machines}
          viewerIds={focusActions.viewerIds}
          viewerRole={focusActions.viewerRole}
          onCreate={focusActions.onCreate}
          onAchieve={focusActions.onAchieve}
          onExtend={focusActions.onExtend}
          onRetire={focusActions.onRetire}
          onCheckIn={focusActions.onCheckIn}
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
