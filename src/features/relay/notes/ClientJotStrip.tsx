import { useEffect, useMemo, useState } from "react";
import { limit, onSnapshot, query, where } from "firebase/firestore";
import { NotebookPen, Send } from "lucide-react";
import { auth } from "../../../firebase";
import type { Client } from "../../../types";
import { clientFirstName } from "../../../lib/client-name";
import type { Pronouns } from "../../client-codex/kit/pronouns";
import { requestPlanner } from "../intent";
import { appendNoteLog, newNoteId, notesRef, saveNote } from "./mutations";
import { blankDraft, logEntry, noteFromDoc, whenLabel } from "./notes";
import type { NoteLogEntry, TrainerNote } from "./types";
import "./notes.css";

/**
 * YOUR WORKING NOTES, ON THE CLIENT'S RECORD — jot from where it occurred.
 *
 * Round: Relay, Sep 2026. The one addition outside Relay. A trainer reading
 * a client's record sees a private strip — the last few working-note jots
 * they wrote about this client, and a box to add one — without opening the
 * Planner. The jot lands on the newest of their own notes about this client
 * (one not on the record, preferring the working-notes one), or starts one.
 *
 * Private by path: trainers/{uid}/notes, read with one query filtered to
 * this client (clientIds array-contains), no order clause, so it needs no
 * index; sorted here. Only ever the signed-in trainer's own notes.
 *
 * A FAILED READ IS NOT "NO NOTES" (client codex, Sep 2026, phase 14). The
 * read used to settle as `ready` with an empty list when it failed, and a jot
 * then STARTED a brand-new "working notes" note — a duplicate of the one the
 * trainer already had, which the read simply could not see. Now a failed
 * read says so, and the box and Add stay off, so nothing can be written on a
 * guess. A listener that failed does not come back while the profile stays
 * open, so the words send the trainer to reopen it rather than promise the
 * notes will load. On Goals & Focus the strip sits inside the Plans from the team
 * panel, on the codex's scale; `pronouns` word it the way the page does.
 */
const SHOWN = 3;

type JotRead = { notes: TrainerNote[]; state: "loading" | "ready" | "failed" };

function useMyNotesAbout(uid: string | null, clientId: string | null): JotRead {
  // Keyed by who and which client, so the last client's answer never stands
  // for this one while its read is on the way.
  const key = uid && clientId ? `${uid}|${clientId}` : null;
  const [read, setRead] = useState<JotRead & { key: string | null }>({ key: null, notes: [], state: "loading" });
  useEffect(() => {
    if (!uid || !clientId) return;
    const k = `${uid}|${clientId}`;
    const unsub = onSnapshot(
      query(notesRef(uid), where("clientIds", "array-contains", clientId), limit(20)),
      (snap) => {
        setRead({ key: k, notes: snap.docs.map((d) => noteFromDoc(d.id, d.data() as Record<string, unknown>)), state: "ready" });
      },
      (err) => {
        console.warn("[notes] jot strip read failed:", err);
        setRead({ key: k, notes: [], state: "failed" });
      },
    );
    return unsub;
  }, [uid, clientId]);
  if (!key) return { notes: [], state: "ready" };
  return read.key === key ? { notes: read.notes, state: read.state } : { notes: [], state: "loading" };
}

const ms = (v: unknown): number => {
  const t = v as { toMillis?: () => number } | Date | undefined;
  if (t instanceof Date) return t.getTime();
  return typeof (t as { toMillis?: () => number })?.toMillis === "function" ? (t as { toMillis: () => number }).toMillis() : 0;
};

export function ClientJotStrip({
  client,
  onOpenPlanner,
  pronouns,
}: {
  client: Client;
  onOpenPlanner?: () => void;
  /** How the strip refers to the client (the codex's pronouns). Left out: the first name. */
  pronouns?: Pick<Pronouns, "object">;
}) {
  const uid = auth.currentUser?.uid ?? null;
  const clientId = client.id ?? null;
  const name = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "this client";
  const first = clientFirstName(client) || name;
  const them = pronouns?.object ?? first;
  const { notes, state } = useMyNotesAbout(uid, clientId);
  const ready = state === "ready";
  const failed = state === "failed";
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where a jot lands: the newest note about them that is not on the record.
  const home = useMemo(() => {
    const sorted = [...notes].sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
    return sorted.find((n) => !n.sharedWith) ?? sorted[0] ?? null;
  }, [notes]);

  const recent = useMemo(() => {
    const all: { entry: NoteLogEntry; note: TrainerNote }[] = [];
    for (const n of notes) for (const entry of n.log) if (!entry.clientId || entry.clientId === clientId) all.push({ entry, note: n });
    return all.sort((a, b) => b.entry.at - a.entry.at).slice(0, SHOWN);
  }, [notes, clientId]);

  const add = async () => {
    // Only on a read that answered: a failed or pending read cannot tell
    // "no note yet" from "a note it could not see".
    if (!uid || !clientId || !ready) return;
    const entry = logEntry(text, clientId);
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      let noteId = home?.id ?? null;
      if (!noteId) {
        noteId = newNoteId(uid);
        const draft = { ...blankDraft({ id: clientId, name }), title: `${name} — working notes` };
        await saveNote({ uid, noteId, draft, before: null, author: { id: uid, name: "" } });
      }
      await appendNoteLog(uid, noteId, entry);
      setText("");
    } catch (err) {
      console.warn("[notes] jot from the record failed:", err);
      setError("Couldn't save that jot. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (!uid || !clientId) return null;

  return (
    <div className="jot" data-testid="jot-strip" data-state={state}>
      <div className="jot__head">
        <span className="jot__title">
          <NotebookPen size={14} aria-hidden="true" /> Your working notes · only you
        </span>
        {failed ? (
          <span className="jot__error" role="status">
            Couldn't load your working notes, so a jot can't be added here now. Reopen the profile to try again.
          </span>
        ) : ready ? (
          <span className="jot__sub">{home ? `Filed on “${home.title}”.` : `A note about ${them} starts when you jot.`}</span>
        ) : null}
      </div>
      {recent.length > 0 && (
        <ul className="jot__list">
          {recent.map(({ entry, note }) => (
            <li key={entry.id} className="jot__item">
              <span className="jot__when">{whenLabel(new Date(entry.at))}</span>
              <span className="jot__text">{entry.text}</span>
              {onOpenPlanner && (
                <button
                  type="button"
                  className="jot__open"
                  onClick={() => {
                    requestPlanner({ kind: "open-note", noteId: note.id });
                    onOpenPlanner();
                  }}
                >
                  Open
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="jot__box">
        <textarea
          className="jot__input"
          rows={2}
          value={text}
          aria-label="A working note, only for you"
          placeholder={
            failed ? "Your working notes couldn't be loaded." : ready ? `What did you notice about ${them} today?` : "Loading your notes…"
          }
          disabled={!ready || busy}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void add();
          }}
        />
        <button type="button" className="jot__add" disabled={!ready || busy || !text.trim()} onClick={() => void add()} aria-label="Add the jot">
          <Send size={14} aria-hidden="true" /> Add
        </button>
      </div>
      {error && <p className="jot__error">{error}</p>}
    </div>
  );
}
