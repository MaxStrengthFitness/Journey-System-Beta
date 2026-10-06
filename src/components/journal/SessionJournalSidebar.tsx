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
 *
 * A DRAFT FOR THE FLOOR'S NOTES (machine menu, Oct 2026). The machine menu
 * writes into this same draft, and its "The machine itself" switch marks it
 * `toFloor`: words for the studio's notes on the unit, never the client's
 * record. The composer here has no such switch, saves to the client's
 * journal, and rebuilds the draft from its own fields on every keystroke,
 * so mounted on that draft it would either file a machine fault on the
 * client or quietly drop the mark. So on a floor draft the Note tab shows
 * the words read only, says where they go, and opens the machine's card,
 * where they are added or made about the client. The Wrap-up still carries
 * them to the floor's notes at Finish.
 */
import { useEffect, useMemo, useState } from "react";
import { X, NotebookPen, Loader2, Heart, HeartPulse } from "lucide-react";
import { motion } from "motion/react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { handleFirestoreError, OperationType } from "../../lib/firestore-errors";
import { Button } from "@/components/ui/button";
import type { Client, Machine, Trainer, WorkoutSession } from "../../types";
import { toDate, type JournalDraft, type JournalEntry } from "../../types/journal";
import { createJournalEntry, type JournalAuthor, type JournalStream } from "../../hooks/useClientJournal";
import { sessionJournalOf } from "../../features/session-record/session-journal";
import { JournalComposer } from "./JournalComposer";
import { JournalEntryCard } from "./JournalEntryCard";
import { FordQuickCapture } from "../../features/ford/FordQuickCapture";
import { useClientFord } from "../../features/ford/useClientFord";
import { fordStudioIdOf } from "../../features/ford/ford-write";
import { FORD_READ_NOTICE } from "../../features/ford/read-status";
import { NoteSweep } from "../../features/client-notes/NoteSweep";
import { discardUnfiledEntry, fileUnfiledEntry } from "../../features/client-notes/file-unfiled";
import { splitUnfiled } from "../../features/client-notes/note-catalog";
import { sessionLinkOf } from "../../features/client-notes/session-link";
import { studioTodayKey } from "../../lib/studio-time";
import { PulseQuickLog } from "../../features/subjective-report";
import type { SessionNoteDraft } from "../../features/client-notes/session-draft";
import { floorDraftElsewhereWords, targetOf } from "../../features/machine-menu/note-target";
// Its FORD notice draws with ford.css; a component imports the stylesheet it
// draws with rather than lean on a neighbour in the same chunk (ford-css.test.ts).
import "../../features/ford/ford.css";

export interface SessionJournalSidebarProps {
  session: WorkoutSession;
  clientId: string;
  clientFirstName: string;
  studioId: string;
  author: JournalAuthor;
  machines: Machine[];
  /** The machine being performed right now — pre-selected in the composer. */
  defaultMachineId?: string | null;
  /**
   * The session's note draft, owned by the tracker (fluidity round, Sep
   * 2026) so it survives this sheet closing, a tab switch and a focus change.
   */
  draft?: SessionNoteDraft | null;
  onDraftChange?: (draft: SessionNoteDraft) => void;
  /** Which mode to land on. The session bar's Notes button opens on "note". */
  defaultMode?: SidebarMode;
  /** For the Pulse tab. Without them the tab says "Open the client to update Pulse". */
  client?: Client | null;
  trainer?: Trainer | null;
  /** Where a floor draft goes (the session's studio): named on the Note tab while the draft is one. */
  floorStudioName?: string | null;
  /** A floor draft is finished on its machine's card: open it (the sheet closes first). */
  onOpenMachine?: (machineId: string) => void;
  /**
   * The client's journal stream the Active Session already holds (speed
   * round R11): this session's notes are taken from it, with no query of
   * their own. Without it, or if it failed, the sheet reads them itself.
   */
  journalStream?: JournalStream | null;
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
  draft = null,
  onDraftChange,
  floorStudioName = null,
  onOpenMachine,
  journalStream,
  onClose,
}: SessionJournalSidebarProps) {
  const [mode, setMode] = useState<SidebarMode>(defaultMode);
  const fromStream = useMemo(() => sessionJournalOf(journalStream, session.id), [journalStream, session.id]);
  const [ownEntries, setOwnEntries] = useState<JournalEntry[]>([]);
  const [ownLoading, setOwnLoading] = useState(true);
  const readsOwn = fromStream === null;
  const entries = useMemo(() => {
    if (!fromStream) return ownEntries;
    const rows = fromStream.entries.filter((e) => !e.isArchived);
    rows.sort((a, b) => (toDate(b.occurredAt)?.getTime() ?? 0) - (toDate(a.occurredAt)?.getTime() ?? 0));
    return rows;
  }, [fromStream, ownEntries]);
  const isLoading = fromStream ? fromStream.loading : ownLoading;

  // Only streamed to show what was already caught this session, so the trainer
  // does not save the same sentence twice. Cheap: one client subcollection.
  // It needs the client to read at all — the query names the client's studio
  // (client codex, phase 1) — and a capture is stamped with that same studio,
  // so what is saved here is what the list reads back.
  const { entries: fordEntries, status: fordStatus } = useClientFord({
    clientId,
    client,
    enabled: mode === "ford",
  });
  const fordStudioId = fordStudioIdOf(client) || studioId;
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
    // Read here only when the session's stream can't answer (R11).
    if (!session.id || !readsOwn) return;
    const q = query(collection(db, "journalEntries"), where("sessionId", "==", session.id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as JournalEntry);
        rows.sort((a, b) => (toDate(b.occurredAt)?.getTime() ?? 0) - (toDate(a.occurredAt)?.getTime() ?? 0));
        setOwnEntries(rows.filter((e) => !e.isArchived));
        setOwnLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, "journalEntries");
        setOwnLoading(false);
      },
    );
    return () => unsub();
  }, [session.id, readsOwn]);

  // Unfiled notes go to the To-file tray; the rest are listed as cards.
  const { unfiled, filed } = useMemo(() => splitUnfiled(entries), [entries]);

  const defaultMachineName = useMemo(
    () => (defaultMachineId ? machines.find((m) => m.id === defaultMachineId)?.name : undefined),
    [machines, defaultMachineId],
  );

  // A draft the machine menu marked for the floor's notes: never this composer's (see the header).
  const floorDraft = draft && targetOf(draft) === "floor" && (draft.body ?? "").trim() !== "" ? draft : null;
  const floorMachineId = floorDraft?.machineId ?? null;
  const floorWords = floorDraft
    ? floorDraftElsewhereWords(floorStudioName, machines.find((m) => m.id === floorMachineId)?.name ?? null, clientFirstName)
    : null;

  const handleSubmit = async (draft: JournalDraft) => {
    await createJournalEntry(clientId, studioId, author, {
      ...draft,
      origin: "in_session",
      // The session's id, number and day (client-notes/session-link.ts), so
      // Notes says "From session #12 · Sep 30" and opens it.
      ...sessionLinkOf(session, studioTodayKey()),
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-(--scrim) backdrop-blur-sm"
      />

      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-background pt-safe pb-safe shadow-2xl dark:border-slate-800"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex flex-col">
            <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.01em] text-foreground">
              {mode === "note" ? (
                <>
                  <NotebookPen className="h-5 w-5 text-(--eq-hero)" /> Session notes
                </>
              ) : mode === "ford" ? (
                <>
                  <Heart className="h-5 w-5 text-(--eq-hero)" /> Remember this
                </>
              ) : (
                <>
                  <HeartPulse className="h-5 w-5 text-(--eq-hero)" /> Update Pulse
                </>
              )}
            </h2>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
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
            className="rounded-full hover:bg-card dark:hover:bg-surface-1/10"
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
                  ? "bg-primary hover:bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
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
                <p className="text-sm text-ink-d2">
                  Open the client to update Pulse
                </p>
              </div>
            )}
          </div>
        ) : mode === "ford" ? (
          <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
            {fordStatus === "denied" ? (
              // A visiting trainer: the rules refuse both the read and the
              // write, so a box to type into would only lose the sentence.
              <p className="ford-notice" role="status" data-testid="ford-read-notice">
                {FORD_READ_NOTICE.denied}
              </p>
            ) : (
              <>
                {fordStatus === "failed" ? (
                  // A failed READ is no reason to refuse a WRITE: the capture
                  // stays, and only the "caught this session" list is unknown.
                  <p className="ford-notice mb-3" role="status" data-testid="ford-read-notice">
                    Couldn&apos;t load what was already caught this session. Anything you save here is still kept.
                  </p>
                ) : null}
                <FordQuickCapture
                  clientId={clientId}
                  clientFirstName={clientFirstName || "them"}
                  studioId={fordStudioId}
                  author={author}
                  sessionId={session.id ?? null}
                  origin="in_session"
                  recent={caughtThisSession}
                />
              </>
            )}
          </div>
        ) : (
        <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
          {/* Not keyed on the focused machine any more. It used to be, "so a
              new focused machine re-seeds the machine picker" — and every
              focus change destroyed whatever the trainer was typing. The
              "About <machine>" toggle reads the current machine live; the
              draft belongs to the session. */}
          {floorDraft && floorWords ? (
            <div
              className="space-y-3 rounded-2xl border border-(--eq-border-strong) bg-(--eq-surface) p-4"
              role="note"
              data-testid="floor-draft"
            >
              <p className="text-sm font-bold text-(--eq-ink-2) [overflow-wrap:anywhere]">{floorWords.title}</p>
              <p className="whitespace-pre-wrap text-base text-(--eq-ink) [overflow-wrap:anywhere]">{floorDraft.body}</p>
              <p className="text-sm text-(--eq-ink-2) [overflow-wrap:anywhere]">{floorWords.foot}</p>
              {onOpenMachine && floorMachineId ? (
                <button
                  type="button"
                  onClick={() => onOpenMachine(floorMachineId)}
                  className="min-h-11 rounded-xl border border-(--eq-border-strong) bg-(--eq-surface-2) px-4 text-sm font-bold text-(--eq-ink) [overflow-wrap:anywhere]"
                >
                  {floorWords.button}
                </button>
              ) : null}
            </div>
          ) : (
            <JournalComposer
              clientFirstName={clientFirstName}
              machines={machines}
              defaultMachineId={defaultMachineId ?? undefined}
              origin="in_session"
              onSubmit={handleSubmit}
              onPickFord={() => setMode("ford")}
              draft={draft}
              onDraftChange={onDraftChange}
            />
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-ink-d2">
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
                <p className="text-sm text-ink-d2">
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
