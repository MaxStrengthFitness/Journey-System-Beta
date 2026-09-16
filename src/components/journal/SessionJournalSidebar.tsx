/**
 * In-session notes — the "Notes" button in the Active Session header.
 *
 * A slide-over that puts the same JournalComposer the Notes area uses in
 * front of the trainer mid-set, so a note taken between machines lands in the
 * client's journal with everything the catalog expects: its category (the
 * same six chips as the Notes area — Coaching tip, Equipment, Incident,
 * Injury, Preference, FORD / Life), importance, the machine it is about, and
 * the session it happened in. Origin is stamped `in_session`; the machine
 * being performed is offered as "About <machine>" so the common case is
 * pick → type → save.
 *
 * Below the composer: every journal entry written during THIS session, live,
 * so two coaches sharing a floor see each other's notes as they are saved.
 *
 * THREE MODES, ONE BUTTON (Note · Remember this · Pulse)
 * ---------------------------------------------------------
 * The sheet has a second mode — REMEMBER THIS — for the FORD framework
 * (Family, Occupation, Recreation, Dreams): the personal detail a client
 * mentions between sets. It deliberately lives behind the Notes button a
 * trainer already knows rather than a new control competing for room on the
 * session bar, which is already the busiest strip on the screen.
 *
 * The two modes are not the same shape and should not be merged. A coaching
 * note is deliberate and structured — category, importance, machine. A FORD
 * capture has exactly one required field and no decisions, because it is
 * typed while a client is mid-sentence. Giving the personal detail its own
 * mode is what keeps the journal composer from growing a fifth dropdown, and
 * keeps the capture down to type-and-save. Tapping the composer's
 * "FORD / Life" chip switches to this mode (notes catalog round, Sep 2026),
 * so the chips mean the same thing here as everywhere else.
 *
 * The third mode — PULSE (reporting round, Sep 2026) — mounts `PulseQuickLog`
 * (one area, one Dial, Done) so a trainer can update the living assessment
 * and get straight back to the session without leaving the sheet. It needs
 * the client and trainer; when the host has not passed them yet the tab
 * still shows and says so, rather than vanishing.
 *
 * CAPTURE NOW, TAG AT TEARDOWN. A note saved here with no category is
 * unfiled; under "This session" it comes back as a To-file card
 * (`NoteSweep`) — one tap files it between machines — and the filed notes
 * of the session are listed beneath.
 */
import React, { useEffect, useMemo, useState } from "react";
import { X, NotebookPen, Loader2, Heart, HeartPulse } from "lucide-react";
import { motion } from "motion/react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { handleFirestoreError, OperationType } from "../../lib/firestore-errors";
import { Button } from "@/components/ui/button";
import type { Client, Machine, Trainer, WorkoutSession } from "../../types";
import { toDate, type JournalDraft, type JournalEntry } from "../../types/journal";
import { createJournalEntry, type JournalAuthor } from "../../hooks/useClientJournal";
import { JournalComposer } from "./JournalComposer";
import { JournalEntryCard } from "./JournalEntryCard";
import { FordQuickCapture } from "../../features/ford/FordQuickCapture";
import { useClientFord } from "../../features/ford/useClientFord";
import { NoteSweep } from "../../features/notes/NoteSweep";
import { discardUnfiledEntry, fileUnfiledEntry } from "../../features/notes/file-unfiled";
import { splitUnfiled } from "../../features/notes/note-catalog";
import { PulseQuickLog } from "../../features/subjective-report";

export interface SessionJournalSidebarProps {
  session: WorkoutSession;
  clientId: string;
  clientFirstName: string;
  studioId: string;
  author: JournalAuthor;
  machines: Machine[];
  /** The machine being performed right now — pre-selected in the composer. */
  defaultMachineId?: string | null;
  /** Which mode to land on. The session bar's Notes button opens on "note". */
  defaultMode?: SidebarMode;
  /** For the Pulse tab. Without them the tab says "Open the client to update Pulse". */
  client?: Client | null;
  trainer?: Trainer | null;
  onClose: () => void;
}

export type SidebarMode = "note" | "ford" | "pulse";

export function SessionJournalSidebar({
  session,
  clientId,
  clientFirstName,
  studioId,
  author,
  machines,
  defaultMachineId,
  defaultMode = "note",
  client = null,
  trainer = null,
  onClose,
}: SessionJournalSidebarProps) {
  const [mode, setMode] = useState<SidebarMode>(defaultMode);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Only streamed to show what was already caught this session, so the trainer
  // does not save the same sentence twice. Cheap: one client subcollection.
  const { entries: fordEntries } = useClientFord({
    clientId,
    client: null,
    enabled: mode === "ford",
  });
  const caughtThisSession = useMemo(
    () =>
      fordEntries
        .filter((e) => e.sessionId && e.sessionId === session.id)
        .map((e) => ({ id: e.id, body: e.body, pillar: e.pillar })),
    [fordEntries, session.id],
  );

  // Everything written during this session, newest first. A single-field
  // equality query, so it needs no composite index.
  useEffect(() => {
    if (!session.id) return;
    const q = query(collection(db, "journalEntries"), where("sessionId", "==", session.id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as JournalEntry);
        rows.sort((a, b) => (toDate(b.occurredAt)?.getTime() ?? 0) - (toDate(a.occurredAt)?.getTime() ?? 0));
        setEntries(rows.filter((e) => !e.isArchived));
        setIsLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, "journalEntries");
        setIsLoading(false);
      },
    );
    return () => unsub();
  }, [session.id]);

  // Unfiled notes go to the To-file tray; the rest are listed as cards.
  const { unfiled, filed } = useMemo(() => splitUnfiled(entries), [entries]);

  const defaultMachineName = useMemo(
    () => (defaultMachineId ? machines.find((m) => m.id === defaultMachineId)?.name : undefined),
    [machines, defaultMachineId],
  );

  const handleSubmit = async (draft: JournalDraft) => {
    await createJournalEntry(clientId, studioId, author, {
      ...draft,
      origin: "in_session",
      sessionId: session.id ?? null,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
      />

      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex flex-col">
            <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-foreground">
              {mode === "note" ? (
                <>
                  <NotebookPen className="h-5 w-5 text-orange-500" /> Session notes
                </>
              ) : mode === "ford" ? (
                <>
                  <Heart className="h-5 w-5 text-orange-500" /> Remember this
                </>
              ) : (
                <>
                  <HeartPulse className="h-5 w-5 text-orange-500" /> Update Pulse
                </>
              )}
            </h2>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {mode === "note" ? (
                <>
                  Filed to {clientFirstName || "the client"}&apos;s journal
                  {defaultMachineName ? ` · now on ${defaultMachineName}` : ""}
                </>
              ) : mode === "ford" ? (
                <>Filed to {clientFirstName || "the client"}&apos;s profile</>
              ) : (
                <>{clientFirstName || "The client"}&apos;s Pulse · saves as you tap</>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close notes"
            className="rounded-full hover:bg-white dark:hover:bg-surface-1/10"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>

        {/* Three modes, one sheet. Equal widths, 40px targets — this is
            tapped mid-session, often without looking. */}
        <div
          role="tablist"
          aria-label="What are you writing down?"
          className="flex shrink-0 gap-1 border-b border-slate-200 p-2 dark:border-slate-800"
        >
          {(
            [
              { id: "note" as const, label: "Note" },
              { id: "ford" as const, label: "Remember this" },
              { id: "pulse" as const, label: "Pulse" },
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              onClick={() => setMode(tab.id)}
              className={`h-10 min-w-0 flex-1 basis-0 rounded-lg text-[13px] font-bold transition-colors ${
                mode === tab.id
                  ? "bg-orange-500 text-white"
                  : "text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "pulse" ? (
          <div className="custom-scrollbar flex-1 overflow-y-auto p-5" data-testid="sheet-pulse">
            {client ? (
              <PulseQuickLog
                key={client.id}
                client={client}
                trainer={trainer}
                machines={machines}
                compact
                onDone={() => setMode("note")}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center dark:border-slate-800">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Open the client to update Pulse
                </p>
              </div>
            )}
          </div>
        ) : mode === "ford" ? (
          <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
            <FordQuickCapture
              clientId={clientId}
              clientFirstName={clientFirstName || "them"}
              studioId={studioId}
              author={author}
              sessionId={session.id ?? null}
              origin="in_session"
              recent={caughtThisSession}
            />
          </div>
        ) : (
        <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
          {/* keyed so a new focused machine re-seeds the machine picker */}
          <React.Fragment key={defaultMachineId ?? "none"}>
            <JournalComposer
              clientFirstName={clientFirstName}
              machines={machines}
              defaultMachineId={defaultMachineId ?? undefined}
              origin="in_session"
              onSubmit={handleSubmit}
              onPickFord={() => setMode("ford")}
            />
          </React.Fragment>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                This session
              </span>
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <NoteSweep
              entries={unfiled}
              machines={machines}
              clientFirstName={clientFirstName}
              onFile={fileUnfiledEntry}
              onDiscard={discardUnfiledEntry}
            />
            {entries.length === 0 && !isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center dark:border-slate-800">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Nothing logged yet this session
                </p>
              </div>
            ) : (
              filed.map((entry) => <JournalEntryCard key={entry.id} entry={entry} machines={machines} dense />)
            )}
          </div>
        </div>
        )}
      </motion.div>
    </div>
  );
}
