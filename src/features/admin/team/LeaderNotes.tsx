/**
 * "YOUR NOTES" AND "NOTE FOR OUR 1:1" — on a person's card on Operations →
 * Team, for a leader (notes round, Oct 3 2026; the rules are leader-notes.ts).
 *
 * The leader's own record of a person: how many Team member notes they have
 * about them in their Journal, and when the newest was, read ONCE when the
 * page opens (the Journal's own query over the leader's own notes — no new
 * read shape, no index). "Note for our 1:1" writes one more, there: What
 * happened · What I'll do. Private to the leader, like every Journal note;
 * never shown to the person or to anyone else; nothing is sent.
 *
 * The calm round (Oct 3 2026): with nothing in the Journal about a person the
 * card shows only the button. "None in your Journal yet. Only you would read
 * them." was on every card; that it is private is said once, under the Team
 * page's (i), and on the form.
 */
import { useCallback, useEffect, useState } from "react";
import { getDocs, limit, orderBy, query } from "firebase/firestore";
import { NotebookPen } from "lucide-react";
import { notesRef, newNoteId, saveNote } from "../../relay/notes/mutations";
import { noteFromDoc } from "../../relay/notes/notes";
import type { TrainerNote } from "../../relay/notes/types";
import { studioDateKey } from "../../../lib/studio-time";
import { useUnsavedChanges } from "../../unsaved-changes";
import { AdminButton, AdminField, AdminTextarea } from "../primitives";
import { notesByPerson, oneToOneDraft, oneToOneReady, recordFor, type PersonRecord } from "./leader-notes";

const ESTIMATE = { serverTimestamps: "estimate" } as const;

export type LeaderNotesRead = { status: "loading" } | { status: "failed" } | { status: "ready"; records: Map<string, PersonRecord> };

/** The signed-in leader's Team member notes, by person — read once. `refresh` reads again after a save. */
export function useLeaderNotes(uid: string | null): { read: LeaderNotesRead; refresh: () => void } {
  const [read, setRead] = useState<LeaderNotesRead>({ status: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      setRead({ status: "ready", records: new Map() });
      return;
    }
    Promise.resolve()
      .then(() => getDocs(query(notesRef(uid), orderBy("updatedAt", "desc"), limit(500))))
      .then((snap) => {
        if (cancelled) return;
        const notes: TrainerNote[] = snap.docs.map((d) => noteFromDoc(d.id, d.data(ESTIMATE) as Record<string, unknown>));
        setRead({ status: "ready", records: notesByPerson(notes) });
      })
      .catch(() => {
        if (!cancelled) setRead({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [uid, tick]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { read, refresh };
}

const lastWords = (ms: number | null) => {
  if (ms === null) return null;
  const day = studioDateKey(new Date(ms));
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function LeaderNotes({
  name,
  uid,
  authorName,
  read,
  onSaved,
}: {
  /** The person, as the team list spells them. */
  name: string;
  /** The leader's Auth uid: their Journal is theirs by path. */
  uid: string;
  authorName: string;
  read: LeaderNotesRead;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const first = name.split(/\s+/)[0] || name;
  const dirty = Boolean(what.trim() || next.trim());
  useUnsavedChanges(dirty, `A 1:1 note about ${first}`, {
    onDiscard: () => {
      setWhat("");
      setNext("");
    },
  });

  const record = read.status === "ready" ? recordFor(read.records, name) : null;
  const line =
    read.status === "failed"
      ? "Your Journal couldn't be read just now."
      : record && record.count > 0
        ? `${record.count} in your Journal${lastWords(record.lastMs) ? ` · last ${lastWords(record.lastMs)}` : ""}`
        : null;

  const save = async () => {
    if (!oneToOneReady({ what, next }) || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveNote({
        uid,
        noteId: newNoteId(uid),
        draft: oneToOneDraft(name, { what, next }),
        before: null,
        author: { id: uid, name: authorName },
      });
      setWhat("");
      setNext("");
      setOpen(false);
      setSaved(true);
      onSaved();
    } catch {
      setError("Not saved — the words are still here. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {(line || (saved && !open)) && (
        <p className="ops-tr__l" data-testid={`leader-notes-${first}`}>
          <span className="ops-tr__lab">Your notes</span>
          {saved && !open ? "Saved to your Journal. " : ""}
          {line}
        </p>
      )}
      {open ? (
        <form
          className="ops-convo__form"
          aria-label={`Note for our 1:1 with ${first}`}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <AdminField label="What happened" wide htmlFor={`oto-what-${first}`} hint="What you saw, said or agreed.">
            <AdminTextarea id={`oto-what-${first}`} rows={2} maxLength={2000} value={what} onChange={(e) => setWhat(e.target.value)} />
          </AdminField>
          <AdminField label="What I'll do" wide htmlFor={`oto-next-${first}`} hint="The follow-up, and when. Only you can read it; Journey sends nothing to anyone.">
            <AdminTextarea id={`oto-next-${first}`} rows={2} maxLength={2000} value={next} onChange={(e) => setNext(e.target.value)} />
          </AdminField>
          {error && (
            <p className="adm-hint adm-hint--error" role="alert">
              {error}
            </p>
          )}
          <div className="ops-tr__acts">
            <AdminButton size="sm" variant="primary" busy={saving} disabled={!dirty} onClick={() => void save()}>
              Save to my Journal
            </AdminButton>
            <AdminButton size="sm" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
              Not now
            </AdminButton>
          </div>
        </form>
      ) : (
        <div className="ops-tr__acts">
          <AdminButton size="sm" variant="quiet" onClick={() => setOpen(true)}>
            <NotebookPen className="w-3.5 h-3.5" aria-hidden />
            Note for our 1:1
          </AdminButton>
        </div>
      )}
    </>
  );
}
