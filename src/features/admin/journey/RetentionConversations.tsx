/**
 * CONVERSATIONS ABOUT STAYING — on a client's case in Operations (notes
 * round, Oct 3 2026; the rule is client-notes/retention.ts).
 *
 * AJ: retention conversations "need to get into our notes", and the whole
 * team reads them (his answer 1A). The case above stays the leaders' working
 * record (owner, next step, outcome); this is what was SAID, written as a
 * Retention note on her record: the first conversation opens a thread, every
 * later one is an update on it. The trainer who sees her next hears it on the
 * briefing while it is a live Heads up, and her Notes answer "Is she staying
 * with us?" with the whole story.
 *
 * ONE READ when the case opens: her notes, newest first, through the index
 * the profile already uses (clientId + occurredAt), with the Retention ones
 * kept. A failed read says so and still offers the box — never block a save
 * — and then a conversation starts a new thread rather than guessing one.
 * Nothing here contacts anyone.
 */
import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, limit as fsLimit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { handleFirestoreError, OperationType } from "../../../lib/firestore-errors";
import { firstSentences } from "../../../lib/first-sentences";
import { studioDateKey, toDate } from "../../../lib/studio-time";
import type { JournalEntry } from "../../../types/journal";
import type { JournalAuthor } from "../../../hooks/useClientJournal";
import { useUnsavedChanges } from "../../unsaved-changes";
import { openRetentionThread, retentionThreads, writeRetentionConversation } from "../../client-notes/retention";
import type { NoteThread } from "../../client-notes/threads";
import { AdminButton, AdminField, AdminTextarea } from "../primitives";

/** How many of her newest notes the one read looks through for Retention threads. */
const READ_LIMIT = 100;

type Read = { status: "loading" } | { status: "failed" } | { status: "ready"; threads: NoteThread[] };

const dayOf = (v: unknown) => {
  const d = toDate(v as Parameters<typeof toDate>[0]);
  return d ? studioDateKey(d) : null;
};

export function RetentionConversations({
  clientId,
  homeStudioId,
  firstName,
  author,
}: {
  clientId: string;
  /** Her home studio: every note about her is filed there. */
  homeStudioId: string;
  firstName: string;
  /** Who writes: the Auth uid (the rules pin it). Null reads only. */
  author: JournalAuthor | null;
}) {
  const [read, setRead] = useState<Read>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useUnsavedChanges(text.trim().length > 0, `A conversation about ${firstName}`, { onDiscard: () => setText("") });

  useEffect(() => {
    let cancelled = false;
    setRead({ status: "loading" });
    getDocs(
      query(collection(db, "journalEntries"), where("clientId", "==", clientId), orderBy("occurredAt", "desc"), fsLimit(READ_LIMIT)),
    )
      .then((snap) => {
        if (cancelled) return;
        const entries = snap.docs.map((d) => ({ ...(d.data() as JournalEntry), id: d.id }));
        setRead({ status: "ready", threads: retentionThreads(entries) });
      })
      .catch((err) => {
        handleFirestoreError(err, OperationType.GET, "journalEntries");
        if (!cancelled) setRead({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, tick]);

  const threads = read.status === "ready" ? read.threads : [];
  const open = openRetentionThread(threads);

  const save = useCallback(async () => {
    if (!author || !text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await writeRetentionConversation({ clientId, studioId: homeStudioId, author, text, open });
      setText("");
      setSaved(true);
      setTick((n) => n + 1);
    } catch {
      setError("Not saved — the words are still here. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [author, text, saving, clientId, homeStudioId, open]);

  return (
    <div className="ops-case__b" data-testid="retention-conversations">
      <h3 className="ops-case__lab">Conversations about staying</h3>
      {read.status === "loading" && <p className="ops-quiet">Reading the retention notes…</p>}
      {read.status === "failed" && (
        <p className="ops-quiet">The retention notes couldn't be read just now, so a conversation saved here starts a new thread.</p>
      )}
      {read.status === "ready" && open && (
        <ol className="ops-convo" aria-label="The open conversation, oldest first">
          {open.entries.map((e) => (
            <li key={e.id} className="ops-line">
              <b>{(e.authorName ?? "").split(/\s+/)[0] || "Someone"}{dayOf(e.occurredAt) ? `, ${dayOf(e.occurredAt)}` : ""}:</b>{" "}
              {firstSentences(e.body, 200) || e.body}
            </li>
          ))}
        </ol>
      )}
      {read.status === "ready" && !open && (
        <p className="ops-quiet">
          {threads.length > 0
            ? "No open conversation about staying — the last one was closed. A new one starts a new thread."
            : "Nothing written about staying yet."}
        </p>
      )}
      {author ? (
        <form
          className="ops-convo__form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <AdminField
            label={open ? "Add to the conversation" : "Write down a conversation"}
            wide
            htmlFor={`convo-${clientId}`}
            hint="It goes on the client's notes as Retention, for the whole team: the next trainer's briefing while it is new, and the staying question on Notes. Journey contacts no one."
          >
            <AdminTextarea
              id={`convo-${clientId}`}
              rows={3}
              maxLength={5000}
              value={text}
              placeholder="What the client said, and what was said back — renewing, the package, staying or leaving."
              onChange={(e) => {
                setText(e.target.value);
                setSaved(false);
              }}
            />
          </AdminField>
          {error && (
            <p className="adm-hint adm-hint--error" role="alert">
              {error}
            </p>
          )}
          {saved && !text && (
            <p className="ops-quiet" role="status">
              Saved to the client's notes.
            </p>
          )}
          <div className="ops-case__acts">
            <AdminButton variant="primary" busy={saving} disabled={!text.trim()} onClick={() => void save()}>
              Save to the client's notes
            </AdminButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
