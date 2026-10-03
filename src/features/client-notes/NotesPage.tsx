/**
 * THE NOTES PAGE — Notes & Profile, page 2 of 7 (client codex, Sep 2026).
 *
 * Every note about a client, as threads. Top to bottom:
 *
 *   BANNERS     only when there is something to say: a record past the read
 *               guard rail, an index not deployed yet, and — new — notes that
 *               could not be read. A failed read is unknown, never "No notes".
 *   COMPOSER    folded behind one "Write a note…" bar. The composer is drawn
 *               but hidden when closed, never unmounted, so Close keeps the
 *               words ("Finish your note…"). Choosing FORD / Life turns the
 *               typed words into a FORD capture in place, saved to FORD and
 *               never to the journal.
 *   TO FILE     notes saved without a category, one tap each (`NoteSweep`).
 *   THE THREADS `NotesCatalog`: one filter row, then Open, Standing context
 *               and Resolved, and the critical line when a filter hides a
 *               critical note.
 *   FORD        one line saying where a client's life is kept, and the door.
 *
 * ONE LOAD. It is handed the tab's journal, its note selection
 * (`notesOnRecord`) and this trainer's dismissals, and opens no listener of
 * its own — there is no fallback `useClientJournal` here, so a second one is
 * impossible, and switching pages reads nothing.
 *
 * DOORS INTO IT. The shell passes one-shot requests from the navigation: open
 * one thread (`note-{id}` — from the critical line, the Overview's rows),
 * open the composer (`notes-compose` — the Overview's "Write a note"), or
 * unfold Resolved (`notes-resolved`). Each is acted on once per move, in an
 * effect (never a layout effect), and a request made while the notes are
 * still loading waits for them. A critical note can sit in the To-file tray
 * (unfiled): "Open the note" then brings its tray card into view.
 *
 * The page's own words use the client's pronoun, never the name — the header
 * owns the name (the shared composer keeps its own "a note about Judy").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Info, PenLine } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useToast } from "../../contexts/ToastContext";
import type { Client, Machine, Trainer, WorkoutSession } from "../../types";
import type { JournalDraft, JournalEntry } from "../../types/journal";
import { canQuoteSessionNumber } from "../../lib/client-coverage";
import { SessionDetailDialog } from "../client-history/SessionDetailDialog";
import { trainerLookup } from "../client-history/trainers";
import type { HistorySession } from "../client-history/model";
import { sessionLinkLabel } from "./session-link";
import {
  HEADS_UP_WINDOW_DAYS,
  createJournalEntry,
  type JournalAuthor,
  type JournalLoad,
  type UseClientJournalResult,
} from "../../hooks/useClientJournal";
import type { HistoryCoverage } from "../../lib/prior-history";
import { JournalComposer } from "../../components/journal/JournalComposer";
import type { SessionNoteDraft } from "./session-draft";
import { NoteSweep } from "./NoteSweep";
import { isNextTrainerNoteOfSessions } from "./note-catalog";
import { NotesCatalog } from "./NotesCatalog";
import { AskAnswer, AskBar } from "./AskBar";
import { askLenses, type AskId, type AskPronouns } from "./ask";
import type { RecordPage } from "../client-profile/profile-nav";
import type { CatalogIntent, NotesIntent } from "./notes-intent";
import { discardUnfiledEntry, fileUnfiledEntry } from "./file-unfiled";
import { dismissThread, restoreThread, type NoteDismissalsState } from "./dismissal-store";
import type { NotesOnRecord } from "./record-selectors";
import type { NoteThread } from "./threads";
import "./notes.css";
import "./notes-page.css";

export interface NotesPageProps {
  client: Client;
  /** The tab's ONE journal load. Required: this page never loads its own. */
  journal: UseClientJournalResult;
  /** `notesOnRecord` over that load: the zones' threads, the tray, the settled life notes. */
  record: NotesOnRecord;
  /** Whether the notes answered (`journal.loadState.notes`). */
  notesState: JournalLoad;
  /** This trainer's dismissals, and whether they were read. */
  dismissals: NoteDismissalsState;
  machines: Machine[];
  /** Who writes: the Auth uid, which the rules pin. Null makes the threads read-only. */
  author: JournalAuthor | null;
  /** The studio's day (yyyy-mm-dd). */
  today: string;
  coverage: HistoryCoverage;
  /** "her" / "his" / "their" — the page's own words never print the name. */
  possessive: string;
  /**
   * The rest of the client's pronouns, for the questions at the top ("What's
   * going on with her right now?"). Left out, they follow `possessive`.
   */
  pronouns?: AskPronouns;
  /** The sub-toggle's line for each page, for the questions whose answer is a page (FORD, Story). */
  pageLines?: Partial<Record<RecordPage, string | null>>;
  /** Open one of the record's pages: a question's door. Left out, no door is drawn. */
  onOpenPage?: (page: RecordPage) => void;
  /** The question the page opens on. "now" unless a host asks for another. */
  initialAsk?: AskId;
  /**
   * May this reader write the client's FORD? Then FORD / Life in the composer
   * saves in place; otherwise it says where FORD is kept.
   */
  fordWritable: boolean;
  /**
   * May this reader READ the client's FORD? With `fordWritable` false it
   * tells the composer why FORD / Life doesn't save here: adding isn't
   * offered (an administrator who works elsewhere), rather than FORD being
   * out of reach (a cross-train visitor). Left out, it is the latter.
   */
  fordReadable?: boolean;
  /** The studio a FORD detail is stamped with (`fordStudioIdOf`), the one the FORD read filters on. */
  fordStudioId: string;
  /** How many things FORD holds (`fordDoorCount`); null when unknown. */
  fordDoorCount: number | null;
  /** Go to the FORD page. */
  onOpenFord: () => void;
  /** A one-shot request from a door, with a key that is new per move. */
  intent?: { key: unknown; request: NotesIntent } | null;
  /** Who coached each session, for the session pop-up a note opens. */
  trainers?: Trainer[];
  /** The studio the iPad is in: stamped on a set added in the session pop-up. */
  activeStudioId?: string | null;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** The pronouns a possessive implies, for a host that passes only that one. */
function pronounsFromPossessive(possessive: string): AskPronouns {
  if (possessive === "his") return { object: "him", possessive: "his", subject: "he", plural: false };
  if (possessive === "their") return { object: "them", possessive: "their", subject: "they", plural: true };
  return { object: "her", possessive: "her", subject: "she", plural: false };
}
const NO_TRAINERS: Trainer[] = [];

export function NotesPage({
  client,
  journal,
  record,
  notesState,
  dismissals,
  machines,
  author,
  today,
  coverage,
  possessive,
  fordWritable,
  fordReadable = false,
  fordStudioId,
  fordDoorCount,
  onOpenFord,
  intent = null,
  trainers = NO_TRAINERS,
  activeStudioId = null,
  pronouns,
  pageLines,
  onOpenPage,
  initialAsk = "now",
}: NotesPageProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [composeOpen, setComposeOpen] = useState(false);
  const [hasText, setHasText] = useState(false);
  const [fordMode, setFordMode] = useState(false);
  const composeRef = useRef<HTMLDivElement | null>(null);
  // Focus the box when the composer is OPENED (a tap or a door), never on
  // mount: this page mounts hidden too, and `autoFocus` would steal focus.
  // The tick is new per open, so a door to a composer that was already open
  // (left open on Notes, then "Write a note" from the Overview) still puts
  // the cursor in it.
  const focusOnOpen = useRef(false);
  const [focusTick, setFocusTick] = useState(0);

  const clientId = client.id ?? null;
  const isLoading = notesState === "loading";
  const readFailed = notesState === "failed";

  /* ------------------------------ writing ------------------------------ */

  const handleCreate = useCallback(
    async (draft: JournalDraft) => {
      if (!clientId || !author) return;
      try {
        await createJournalEntry(clientId, client.homeStudioId || "", author, draft);
        toastSuccess("Note saved.");
        setComposeOpen(false);
      } catch (err) {
        toastError("Could not save that note. Check your connection and try again.");
        // Rethrown so the composer keeps the words: it clears only on success.
        throw err;
      }
    },
    [clientId, client.homeStudioId, author, toastSuccess, toastError],
  );

  const fordContext = useMemo(
    () =>
      fordWritable && clientId && author && fordStudioId
        ? { clientId, studioId: fordStudioId, author, sessionId: null, origin: "profile" as const }
        : null,
    [fordWritable, clientId, author, fordStudioId],
  );

  const openComposer = useCallback(() => {
    focusOnOpen.current = true;
    setComposeOpen(true);
    setFocusTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!composeOpen || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    const box = composeRef.current?.querySelector("textarea");
    if (box && typeof box.focus === "function") box.focus({ preventScroll: true });
  }, [composeOpen, focusTick]);

  /* ------------------------ the session a note is from ------------------------ *
   * FileMaker parity, Oct 1 2026 (AJ: "if made within a session it should
   * link that session"). The line under a note written in a session, from
   * the note's own fields or the sessions the tab already streams; the
   * number only past the session-number gate. A tap opens the session in
   * Activity Archive's pop-up, read from the stream, or ONCE from the
   * server for an older session the stream doesn't hold. */
  const quotable = canQuoteSessionNumber(client, coverage);
  const sessionsById = useMemo(() => {
    const m = new Map<string, WorkoutSession>();
    for (const s of journal.recentSessions ?? []) if (s.id) m.set(s.id, s);
    return m;
  }, [journal.recentSessions]);
  const sessionLabelOf = useCallback(
    (entry: JournalEntry) => sessionLinkLabel(entry, entry.sessionId ? sessionsById.get(entry.sessionId) : null, quotable, today),
    [sessionsById, quotable, today],
  );
  const [openedSession, setOpenedSession] = useState<{ key: number; sessions: HistorySession[] } | null>(null);
  const onOpenSession = useCallback(
    async (sessionId: string) => {
      const held = sessionsById.get(sessionId);
      if (held) {
        setOpenedSession({ key: Date.now(), sessions: [held] });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "sessions", sessionId));
        if (!snap.exists()) {
          toastError("That session is no longer in Journey.");
          return;
        }
        setOpenedSession({ key: Date.now(), sessions: [{ id: snap.id, ...snap.data() } as HistorySession] });
      } catch {
        toastError("Could not open that session. Check your connection and try again.");
      }
    },
    [sessionsById, toastError],
  );
  const trainerFor = useMemo(() => trainerLookup(trainers), [trainers]);

  /* --------------------------- the briefing line --------------------------- */

  // The dismissals document is keyed by the Auth uid — never authTrainer.id.
  const uid = auth.currentUser?.uid ?? null;
  const dismissalsRead = dismissals.status === "ready" ? dismissals.dismissals : null;
  const onHush = useMemo(
    () =>
      uid && dismissals.status === "ready"
        ? (t: NoteThread) => {
            dismissThread(uid, t.id)
              .then(() => toastSuccess("Hushed on your briefing. Any update brings it back."))
              .catch(() => toastError("Could not change your briefing. Check your connection and try again."));
          }
        : undefined,
    [uid, dismissals.status, toastSuccess, toastError],
  );
  const onRestore = useMemo(
    () =>
      uid && dismissals.status === "ready"
        ? (t: NoteThread) => {
            restoreThread(uid, t.id)
              .then(() => toastSuccess("Back on your briefing."))
              .catch(() => toastError("Could not change your briefing. Check your connection and try again."));
          }
        : undefined,
    [uid, dismissals.status, toastSuccess, toastError],
  );

  /* ------------------------------ the questions ------------------------------ *
   * Notes round, Oct 3 2026 (ask.ts). The page opens on "what's going on
   * right now"; every other question, and every note, is one tap away. A
   * door into one thread (the critical line, the Overview) asks the catalog,
   * which goes back to every note when the question leaves that thread out. */
  const [askId, setAskId] = useState<AskId>(initialAsk);
  const said = pronouns ?? pronounsFromPossessive(possessive);
  const criticalIdSet = useMemo(() => new Set(journal.criticalEntries.map((e) => e.id)), [journal.criticalEntries]);
  const headsUpIdSet = useMemo(
    () => new Set((journal.headsUpEntries ?? []).map((e) => e.id)),
    [journal.headsUpEntries],
  );
  const lenses = useMemo(
    () =>
      askLenses({
        threads: record.listed,
        criticalIds: criticalIdSet,
        headsUpIds: headsUpIdSet,
        machines,
        today,
        pronouns: said,
        pageLines,
        known: !isLoading && !readFailed,
      }),
    [record.listed, criticalIdSet, headsUpIdSet, machines, today, said, pageLines, isLoading, readFailed],
  );
  const lens = lenses.find((l) => l.id === askId) ?? lenses[0];
  // Resolved notes wait at the bottom with a way back under every question:
  // when this question's answer holds none, the line that leads to them is
  // the page's Resolved anchor, drawn once.
  const resolvedCount = useMemo(
    () => record.listed.filter((t) => t.root.resolvedAt && !t.root.isArchived).length,
    [record.listed],
  );
  const lensHasResolved = lens.showsNotes && lens.threads.some((t) => t.root.resolvedAt);
  const resolvedElsewhere = lens.id !== "all" && resolvedCount > 0 && !lensHasResolved;
  const catalogLens = useMemo(
    () =>
      lens.id === "all"
        ? null
        : {
            id: lens.id,
            threadIds: new Set(lens.threads.map((t) => t.id)),
            // The chips that can answer this question, and no others.
            categories:
              lens.id === "health"
                ? (["health", "incident"] as const)
                : lens.id === "train"
                  ? (["coaching", "preference"] as const)
                  : null,
            empty: lens.empty,
          },
    [lens],
  );

  /* ------------------------------ the doors ------------------------------ */

  const handled = useRef<unknown>(undefined);
  const [catalogIntent, setCatalogIntent] = useState<{ key: unknown; request: CatalogIntent } | null>(null);
  useEffect(() => {
    if (!intent || handled.current === intent.key) return;
    const req = intent.request;
    if (req.kind === "compose") {
      handled.current = intent.key;
      openComposer();
      const bar = composeRef.current;
      try {
        if (bar && typeof bar.scrollIntoView === "function") bar.scrollIntoView({ block: "start" });
      } catch {
        // No scroll in this browser: the composer is still open.
      }
      return;
    }
    // A thread in the To-file tray: its card is there, not in a zone.
    if (req.kind === "thread") {
      if (isLoading) return; // not "missing" yet: the notes have not arrived
      const unfiled = record.unfiled.find((e) => e.id === req.threadId);
      if (unfiled) {
        handled.current = intent.key;
        const card = composeRef.current?.ownerDocument.getElementById(`sweep-${unfiled.id}`);
        if (card) {
          try {
            if (typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "center" });
          } catch {
            // No scroll in this browser.
          }
          card.classList.add("nx-focus");
          window.setTimeout(() => card.classList.remove("nx-focus"), 2000);
        }
        return;
      }
    }
    handled.current = intent.key;
    // Resolved is under every note: a door to it leaves the question.
    if (req.kind === "resolved") setAskId("all");
    setCatalogIntent({ key: intent.key, request: req });
  }, [intent, isLoading, record.unfiled, openComposer]);

  /* -------------------------------- drawing -------------------------------- */

  const Possessive = cap(possessive);
  const composerTitle = fordMode ? `Something about ${possessive} life` : "New note";

  return (
    <section className="nx-notes" data-testid="notes-page">
      {journal.capped ? (
        <p className="nx-banner" role="note">
          <Info className="nx-banner__icon" size={16} aria-hidden />
          <span>
            This record is unusually large: one of its collections has more than 200 items, and only the first 200
            are loaded. Counts on this page may run short.
          </span>
        </p>
      ) : null}
      {journal.needsIndex ? (
        <p className="nx-banner" role="note">
          <Info className="nx-banner__icon" size={16} aria-hidden />
          <span>
            Reading the journal unsorted because its Firestore index has not been deployed yet. Entries are sorted in
            the browser instead, so nothing is missing. Run <code>firebase deploy --only firestore:indexes</code> to
            switch to the fast path.
          </span>
        </p>
      ) : null}
      {readFailed ? (
        <p className="nx-banner" role="alert" data-testid="notes-failed">
          <Info className="nx-banner__icon" size={16} aria-hidden />
          <span>
            Some of {possessive} notes couldn’t be loaded, so what’s below may be missing some. Open {possessive}{" "}
            profile again to try again.
          </span>
        </p>
      ) : null}

      <div className="nx-compose-wrap" ref={composeRef} id="notes-compose" data-cx-anchor="notes-compose">
        {composeOpen ? null : (
          <button type="button" className="nx-compose-bar" aria-controls="notes-composer" onClick={openComposer}>
            <PenLine className="nx-compose-bar__icon" size={18} aria-hidden />
            {hasText ? "Finish your note…" : "Write a note…"}
            <span className="nx-compose-bar__meta">or use the Note button up top, from any tab</span>
          </button>
        )}
        <div className="nx-compose" id="notes-composer" hidden={!composeOpen}>
          <div className="nx-compose__head">
            <p className="nx-compose__title">{composerTitle}</p>
            <button type="button" className="nt-btn nt-btn--quiet" onClick={() => setComposeOpen(false)}>
              Close
            </button>
          </div>
          <JournalComposer
            clientFirstName={client.firstName || ""}
            machines={machines}
            onSubmit={handleCreate}
            disabled={!clientId || !author}
            ford={fordContext}
            onOpenFord={onOpenFord}
            fordReadOnly={fordReadable && !fordWritable}
            onFordSaved={() => {
              toastSuccess("Saved to FORD.");
              setComposeOpen(false);
            }}
            onDraftChange={(d: SessionNoteDraft) => {
              setHasText(!!d.body.trim());
              setFordMode(d.category === "ford");
            }}
          />
        </div>
      </div>

      <NoteSweep
        entries={record.unfiled}
        machines={machines}
        clientFirstName={client.firstName || ""}
        onFile={fileUnfiledEntry}
        onDiscard={author ? discardUnfiledEntry : undefined}
        isNextTrainerNote={(e) => isNextTrainerNoteOfSessions(e, journal.recentSessions ?? [])}
      />

      <AskBar lenses={lenses} value={lens.id} onChange={setAskId} object={said.object} />
      <AskAnswer lens={lens} onOpenPage={onOpenPage} />

      {lens.showsNotes ? (
      <NotesCatalog
        lens={catalogLens}
        onLeaveLens={() => setAskId("all")}
        threads={record.listed}
        archivedThreads={journal.archivedThreads ?? []}
        machines={machines}
        author={author}
        today={today}
        criticalEntries={journal.criticalEntries}
        headsUpEntries={journal.headsUpEntries ?? []}
        dismissals={dismissalsRead}
        headsUpWindowDays={HEADS_UP_WINDOW_DAYS}
        headsUpContextOf={journal.headsUpContextOf ?? null}
        onHush={onHush}
        onRestore={onRestore}
        fordDoorCount={fordDoorCount}
        onOpenFord={onOpenFord}
        isLoading={isLoading}
        readFailed={readFailed}
        unfiledCount={record.unfiled.length}
        coverage={coverage}
        intent={catalogIntent}
        onIntentHandled={() => setCatalogIntent(null)}
        sessionLabelOf={sessionLabelOf}
        onOpenSession={clientId ? (id) => void onOpenSession(id) : undefined}
      />
      ) : null}

      {resolvedElsewhere ? (
        <div className="nx-resolved-elsewhere" id="notes-resolved" data-cx-anchor="notes-resolved">
          <span className="nx-answer__line">
            {resolvedCount === 1 ? "1 resolved note waits" : `${resolvedCount} resolved notes wait`} under Every note.
          </span>
          <button
            type="button"
            className="nt-btn"
            onClick={() => {
              setAskId("all");
              setCatalogIntent({ key: Date.now(), request: { kind: "resolved" } });
            }}
          >
            Show {resolvedCount === 1 ? "it" : "them"}
          </button>
        </div>
      ) : null}

      {openedSession && clientId ? (
        <SessionDetailDialog
          key={openedSession.key}
          initialSessions={openedSession.sessions}
          onClose={() => setOpenedSession(null)}
          clientId={clientId}
          machines={machines}
          trainerFor={trainerFor}
          trainers={trainers}
          activeStudioId={activeStudioId}
          clientHomeStudioId={client.homeStudioId}
        />
      ) : null}

      <div className="nx-fordline">
        <p className="nx-fordline__text">
          {Possessive} family, work and trips are kept in FORD, which only {possessive} home studio’s team can read.
        </p>
        <button type="button" className="nt-btn" onClick={onOpenFord}>
          Open FORD
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </section>
  );
}
