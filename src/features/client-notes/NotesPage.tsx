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
import { auth } from "../../firebase";
import { useToast } from "../../contexts/ToastContext";
import type { Client, Machine } from "../../types";
import type { JournalDraft } from "../../types/journal";
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
import { NotesCatalog } from "./NotesCatalog";
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
   * May this reader write the client's FORD? Then FORD / Life in the composer
   * saves in place; otherwise it says where FORD is kept.
   */
  fordWritable: boolean;
  /** The studio a FORD detail is stamped with (`fordStudioIdOf`), the one the FORD read filters on. */
  fordStudioId: string;
  /** How many things FORD holds (`fordDoorCount`); null when unknown. */
  fordDoorCount: number | null;
  /** Go to the FORD page. */
  onOpenFord: () => void;
  /** A one-shot request from a door, with a key that is new per move. */
  intent?: { key: unknown; request: NotesIntent } | null;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

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
  fordStudioId,
  fordDoorCount,
  onOpenFord,
  intent = null,
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
      />

      <NotesCatalog
        threads={record.listed}
        machines={machines}
        author={author}
        today={today}
        criticalEntries={journal.criticalEntries}
        headsUpEntries={journal.headsUpEntries ?? []}
        dismissals={dismissalsRead}
        headsUpWindowDays={HEADS_UP_WINDOW_DAYS}
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
      />

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
