import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, NotebookPen, X } from "lucide-react";
import { whenLabel } from "./notes";
import { NOTE_LOG_MAX, NOTE_LOG_TEXT_MAX, type NoteLogEntry } from "./types";

/**
 * WORKING NOTES — a note built up session by session.
 *
 * Round: Planner rework, Sep 2026. A jot is saved the moment it is added (it
 * is one array element, so it never waits on the note's Save), is always
 * private, and moves into the note itself with "Add to the note" when the
 * trainer is ready to write the plan up. See NoteLogEntry in ./types.ts.
 */
export function WorkingLog({
  log,
  clients,
  busy,
  full,
  autoFocus,
  onAdd,
  onRemove,
  onFold,
}: {
  log: NoteLogEntry[];
  /** The note's linked clients, when there is more than one to choose from. */
  clients: { id: string; name: string }[];
  busy: boolean;
  full: boolean;
  autoFocus?: boolean;
  onAdd: (text: string, clientId: string | null) => Promise<boolean>;
  onRemove: (entry: NoteLogEntry) => void;
  onFold: (entry: NoteLogEntry) => void;
}) {
  const [text, setText] = useState("");
  const [about, setAbout] = useState<string | null>(clients.length === 1 ? clients[0].id : null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) boxRef.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (clients.length === 1) setAbout(clients[0].id);
    else if (about && !clients.some((c) => c.id === about)) setAbout(null);
  }, [clients, about]);

  const add = async () => {
    const ok = await onAdd(text, about);
    if (ok) setText("");
  };

  const nameOf = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? "" : "");
  // The newest three, then the rest on request: a note built over a season
  // should not push the note itself off the screen.
  const [showAll, setShowAll] = useState(false);
  const allNewestFirst = [...log].reverse();
  const newestFirst = showAll ? allNewestFirst : allNewestFirst.slice(0, SHOWN);
  const hidden = allNewestFirst.length - newestFirst.length;

  return (
    <section className="wl" aria-labelledby="wl-title">
      <header className="wl__head">
        <h3 className="ne__label wl__title" id="wl-title">
          <NotebookPen size={13} aria-hidden />
          Working notes
          {log.length > 0 && <span className="wl__count">{log.length}</span>}
        </h3>
        <p className="wl__lede">Jot as you go, session by session. Only you ever see these — even once the note is shared.</p>
      </header>

      <div className="wl__compose">
        <textarea
          ref={boxRef}
          className="wl__input"
          value={text}
          maxLength={NOTE_LOG_TEXT_MAX}
          rows={2}
          placeholder="What did you notice today?"
          aria-label="New working note"
          disabled={busy || full}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void add();
          }}
        />
        <div className="wl__compose-row">
          {clients.length > 1 && (
            <select
              className="wl__about"
              value={about ?? ""}
              onChange={(e) => setAbout(e.target.value || null)}
              aria-label="Which client this is about"
            >
              <option value="">About all of them</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  About {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="pl__btn pl__btn--primary wl__add"
            disabled={busy || full || !text.trim()}
            onClick={() => void add()}
          >
            {busy ? "Saving…" : "Add"}
          </button>
        </div>
        {full && (
          <p className="ne__hint">
            This note holds {NOTE_LOG_MAX} jots — move some into the note or remove old ones to add more.
          </p>
        )}
      </div>

      {newestFirst.length > 0 && (
        <ol className="wl__list">
          {newestFirst.map((e) => (
            <li key={e.id} className="wl__entry">
              <span className="wl__when">
                {whenLabel(e.at)}
                {nameOf(e.clientId) && <span className="wl__who"> · {nameOf(e.clientId)}</span>}
              </span>
              <p className="wl__text">{e.text}</p>
              <span className="wl__actions">
                <button type="button" className="wl__btn" onClick={() => onFold(e)} disabled={busy}>
                  <ArrowDownToLine size={13} aria-hidden />
                  Add to the note
                </button>
                {confirming === e.id ? (
                  <>
                    <button
                      type="button"
                      className="wl__btn wl__btn--danger"
                      onClick={() => {
                        setConfirming(null);
                        onRemove(e);
                      }}
                      disabled={busy}
                    >
                      Remove it
                    </button>
                    <button type="button" className="wl__btn" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="wl__btn"
                    aria-label="Remove this working note"
                    onClick={() => setConfirming(e.id)}
                    disabled={busy}
                  >
                    <X size={13} aria-hidden />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {(hidden > 0 || showAll) && allNewestFirst.length > SHOWN && (
        <button type="button" className="wl__btn wl__more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show the newest only" : `Show ${hidden} older`}
        </button>
      )}
    </section>
  );
}

const SHOWN = 3;
