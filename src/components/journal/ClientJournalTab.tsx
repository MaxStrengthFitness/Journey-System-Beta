/**
 * THE JOURNAL AREAS — mounted inside the client record's spine.
 *
 *   1. PROGRESS REPORTS  — the shelf of finalized evaluations.
 *   2. ASSESSMENT        — the modular assessment, filled a piece at a time.
 *   3. FOCUS             — what each coach is working on (the 4 P's), with
 *                          check-in, extend, achieved and retire, and the
 *                          history of every past focus.
 *   4. NOTES             — the category-first composer, then the catalog:
 *                          critical & pinned, search, seven category tiles,
 *                          and a shelf per category (features/client-notes).
 *
 * SINCE THE PROFILE MERGE (Sep 2026) THIS IS NOT A TAB
 * ---------------------------------------------------
 * Details and Journal became one spine, and the areas were dealt out to its
 * sections: Focus, Notes, and Assessment. So this component is mounted once
 * per section, each with an `areas` list naming what to draw, and the spine
 * owns navigation. (The standalone tab's own jump nav and critical rail were
 * removed in the notes catalog round: every caller passes `areas`. The
 * critical notes now head the Notes catalog as "Critical & pinned".)
 *
 * `journal` lets the caller pass an already-loaded useClientJournal result
 * in. The dossier loads it once and hands the same object to every mount, so
 * several sections of journal UI cost one set of listeners. Left out, the
 * component loads its own.
 *
 * Each mount is its own component instance with its own state. Nothing may
 * rely on state set in one mount being seen by another — that is exactly how
 * focus check-ins used to lose their focus id (fixed in the Goals & Focus
 * round: the focus card files its own check-in).
 */
import React, { useMemo } from "react";
import { auth } from "../../firebase";
import { TriangleAlert } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import {
  archiveJournalEntry,
  createClientFocus,
  createJournalEntry,
  extendFocus,
  resolveJournalEntry,
  setFocusStatus,
  useClientJournal,
  type UseClientJournalResult,
} from "../../hooks/useClientJournal";
import type { ClientFocus, JournalDraft, JournalEntry } from "../../types/journal";
import type {
  Client,
  Machine,
  ProgressReport,
  Trainer,
} from "../../types";
import { FocusBoard } from "./FocusBoard";
import { JournalComposer } from "./JournalComposer";
import { ProgressReportArchive } from "./ProgressReportArchive";
import { ClientCheckInPanel } from "./ClientCheckInPanel";
import { NotesCatalog } from "../../features/client-notes/NotesCatalog";

/** The areas, by id. */
export type JournalAreaId = "progress-reports" | "check-in" | "focus" | "notes";

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
   * Which areas to draw. Omit for all four. Whoever composes the areas owns
   * the navigation; see the header.
   */
  areas?: JournalAreaId[];
  /** An already-loaded journal, so several mounts share one set of listeners. */
  journal?: UseClientJournalResult;
  /** Jump to the Life section, where FORD personal details live. */
  onOpenFord?: () => void;
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
  onOpenFord,
}: ClientJournalTabProps) {
  const { success: toastSuccess, error: toastError } = useToast();

  // Hooks cannot be called conditionally, so when a journal is handed in the
  // internal one is disabled rather than skipped. A disabled useClientJournal
  // opens no listeners, so this costs nothing but a few empty arrays.
  const ownJournal = useClientJournal({
    clientId,
    client,
    trainers,
    enabled: !hasQuotaError && !journal,
  });
  const { entries, focuses, criticalEntries, isLoading, needsIndex, capped } =
    journal ?? ownJournal;

  /** Composed into a spine? Then the section shell already printed a heading. */
  const composed = Boolean(areas);
  const shows = (id: JournalAreaId) => !areas || areas.includes(id);

  const author = useMemo(
    () => ({
      // The Auth uid: the journalEntries rule pins authorId to it, and it
      // differs from authTrainer.id on older accounts. The FORD rules pin it
      // the same way.
      id: auth.currentUser?.uid || authTrainer?.id || "unknown",
      initials: (authTrainer?.initials || "TR").toUpperCase(),
      fullName: authTrainer?.fullName || "Coach",
    }),
    [authTrainer],
  );

  /** Every id the signed-in coach may be stored under on a focus. */
  const viewerIds = useMemo(
    () =>
      [auth.currentUser?.uid, authTrainer?.id].filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      ),
    [authTrainer],
  );

  /** FORD / Life in the composer hands off to the FORD capture with these. */
  const fordContext = useMemo(
    () =>
      clientId && author.id !== "unknown"
        ? {
            clientId,
            studioId: client?.homeStudioId || "",
            author,
            sessionId: null,
            origin: "profile" as const,
          }
        : null,
    [clientId, client?.homeStudioId, author],
  );

  /* ------------------------------ actions ------------------------------ */

  const handleCreate = async (draft: JournalDraft) => {
    if (!clientId) return;
    try {
      await createJournalEntry(clientId, client?.homeStudioId || "", author, draft);
      toastSuccess("Note saved.");
    } catch {
      toastError("Could not save that note. Check your connection and try again.");
    }
  };

  const handleArchive = async (entry: JournalEntry) => {
    try {
      await archiveJournalEntry(entry.id);
      toastSuccess("Entry archived.");
    } catch {
      toastError("Could not archive that entry.");
    }
  };

  const handleResolve = async (entry: JournalEntry, resolved: boolean) => {
    try {
      await resolveJournalEntry(entry.id, resolved);
      toastSuccess(resolved ? "Marked resolved." : "Reopened.");
    } catch {
      toastError("Could not update that entry.");
    }
  };

  const handleCreateFocus = async (input: {
    category: any;
    intent: string;
    targetMachineId: string | null;
  }) => {
    if (!clientId) return;
    try {
      await createClientFocus(clientId, client?.homeStudioId || "", author, input);
      toastSuccess(`Focus set: ${input.category}.`);
    } catch {
      toastError("Could not set that focus.");
    }
  };

  const handleAchieve = async (focus: ClientFocus, rewardNote: string) => {
    try {
      await setFocusStatus(focus.id, "passed", { rewardNote });
      toastSuccess(`${focus.category} focus achieved. Nice work.`);
    } catch {
      toastError("Could not update that focus.");
    }
  };

  const handleExtend = async (focus: ClientFocus) => {
    try {
      await extendFocus(focus.id);
      toastSuccess("Focus extended by three weeks.");
    } catch {
      toastError("Could not extend that focus.");
    }
  };

  const handleRetire = async (focus: ClientFocus) => {
    try {
      await setFocusStatus(focus.id, "retired");
      toastSuccess("Focus retired.");
    } catch {
      toastError("Could not retire that focus.");
    }
  };

  /**
   * A check-in is filed right here, from the focus card, carrying the focus
   * id. It used to set state in THIS mount and scroll to the composer in the
   * Notes mount — a different component instance that never saw the focus —
   * so the note saved without `focusId` and the thread stayed empty.
   */
  const handleCheckIn = async (focus: ClientFocus, body: string): Promise<boolean> => {
    if (!clientId || !body.trim()) return false;
    try {
      await createJournalEntry(clientId, client?.homeStudioId || "", author, {
        kind: "coaching",
        category: focus.category,
        body: body.trim(),
        importance: "standard",
        machineId: focus.targetMachineId ?? null,
        focusId: focus.id,
        origin: "manual",
      });
      toastSuccess("Check-in logged.");
      return true;
    } catch {
      toastError("Could not save that check-in. Check your connection and try again.");
      return false;
    }
  };

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
          viewerIds={viewerIds}
          viewerRole={authTrainer?.role ?? null}
          onCreate={handleCreateFocus}
          onAchieve={handleAchieve}
          onExtend={handleExtend}
          onRetire={handleRetire}
          onCheckIn={handleCheckIn}
        />
      </JournalArea>
      )}

      {/* ---------------------------- 4 · NOTES -------------------------- */}
      {shows("notes") && (
      <JournalArea
        id="notes"
        bare={composed}
        title="Notes"
        blurb="Every note about this client, filed by category."
      >
        <div className="flex flex-col gap-5">
          <JournalComposer
            clientFirstName={client?.firstName || ""}
            machines={machines}
            onSubmit={handleCreate}
            disabled={!clientId}
            ford={fordContext}
            onOpenFord={onOpenFord}
          />
          <NotesCatalog
            entries={entries}
            criticalEntries={criticalEntries}
            machines={machines}
            isLoading={isLoading}
            onArchive={handleArchive}
            onResolve={handleResolve}
            onOpenFord={onOpenFord}
          />
        </div>
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
