/**
 * In-session notes — the "Notes" button in the Active Session header.
 *
 * A slide-over that puts the same JournalComposer the Journal tab uses in
 * front of the trainer mid-set, so a note taken between machines lands in the
 * client's journal with everything the Journal expects: kind (the 4 P's,
 * equipment, personal, incident, general), category, importance, the
 * machine it is about, and the session it happened in. Origin is stamped
 * `in_session`; the machine being performed is pre-selected so the common
 * case is type → save.
 *
 * Below the composer: every journal entry written during THIS session, live,
 * so two coaches sharing a floor see each other's notes as they are saved.
 */
import React, { useEffect, useMemo, useState } from "react";
import { X, NotebookPen, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { handleFirestoreError, OperationType } from "../../lib/firestore-errors";
import { Button } from "@/components/ui/button";
import type { Machine, WorkoutSession } from "../../types";
import { toDate, type JournalDraft, type JournalEntry } from "../../types/journal";
import { createJournalEntry, type JournalAuthor } from "../../hooks/useClientJournal";
import { JournalComposer } from "./JournalComposer";
import { JournalEntryCard } from "./JournalEntryCard";

export interface SessionJournalSidebarProps {
  session: WorkoutSession;
  clientId: string;
  clientFirstName: string;
  studioId: string;
  author: JournalAuthor;
  machines: Machine[];
  /** The machine being performed right now — pre-selected in the composer. */
  defaultMachineId?: string | null;
  onClose: () => void;
}

export function SessionJournalSidebar({
  session,
  clientId,
  clientFirstName,
  studioId,
  author,
  machines,
  defaultMachineId,
  onClose,
}: SessionJournalSidebarProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
            <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">
              <NotebookPen className="h-5 w-5 text-orange-500" /> Session notes
            </h2>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Filed to {clientFirstName || "the client"}&apos;s journal
              {defaultMachineName ? ` · now on ${defaultMachineName}` : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close notes"
            className="rounded-full hover:bg-white dark:hover:bg-surface-1/10"
          >
            <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </Button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
          {/* keyed so a new focused machine re-seeds the machine picker */}
          <React.Fragment key={defaultMachineId ?? "none"}>
            <JournalComposer
              clientFirstName={clientFirstName}
              machines={machines}
              defaultMachineId={defaultMachineId ?? undefined}
              origin="in_session"
              onSubmit={handleSubmit}
            />
          </React.Fragment>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                This session
              </span>
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            </div>
            {entries.length === 0 && !isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center dark:border-slate-800">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Nothing logged yet this session
                </p>
              </div>
            ) : (
              entries.map((entry) => <JournalEntryCard key={entry.id} entry={entry} machines={machines} dense />)
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
