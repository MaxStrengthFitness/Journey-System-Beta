import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { settleOrQueue } from "../session-record/finish-wait";
import { useUnsavedChanges } from "../unsaved-changes";
import { awayLabel } from "./present";
import { MAX_AWAY, MAX_AWAY_NOTE, isDateKey, newAwayId, upcomingAway, type AwayRange } from "./week";
import "./standing-week.css";

/**
 * AWAY — the days a trainer is away from the studio (voice review follow-up,
 * Sep 27 2026). AJ: "if someone has a vacation then it should block it out."
 *
 * One control, two doors: the trainer on My Profile → My standing week, and a
 * leader in the Review on My Studio → Team. Each range saves as it is added
 * or removed: being away needs no agreement, and a trainer with no proposal
 * can still set it. Only today's and later ranges are shown; a past one drops
 * off at the next save. The week check leaves those days alone.
 *
 * Offline, a save is on the iPad at once and reaches the database when the
 * connection is back; its promise waits for the database, so the editor
 * waits only a moment (session-record's settleOrQueue) and then says "Saved
 * on this iPad" rather than "Saving…" until the Wi-Fi returns. Each save
 * writes the whole list, so the last save wins: two people changing the same
 * person's dates at the same moment, or an offline iPad's list sent later,
 * can undo the other's change (rare; noted in the README).
 *
 * The note is read by everyone at the studio (a colleague's card on My
 * Profile shows it), and a line under the field says so.
 */

export interface AwayEditorProps {
  /** The days away as stored. */
  away: readonly AwayRange[] | undefined;
  /** The studio's day, YYYY-MM-DD. */
  today: string;
  tz?: string;
  /** Whose they are, as the sentence says it: "your", "Sam's". */
  whose: string;
  /** Write the whole list (store.setAway). Throwing keeps the typing and says so. */
  onSave: (next: AwayRange[]) => Promise<void>;
  disabled?: boolean;
}

export function AwayEditor({ away, today, tz, whose, onSave, disabled = false }: AwayEditorProps) {
  const shown = upcomingAway(away, today);
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Saved on this iPad, not yet answered by the database.
  const [queued, setQueued] = useState(false);
  const noteHint = useId();

  const reset = () => {
    setAdding(false);
    setFrom(today);
    setTo(today);
    setNote("");
  };
  const typed = adding && (from !== today || to !== today || note.trim() !== "");
  const unsaved = useUnsavedChanges(typed && !busy, `${whose} dates away`, { onDiscard: reset });

  // The first day may be past (a vacation already under way reads "away
  // until ..."); the last day may not, or there is nothing left to block out.
  const valid = isDateKey(from) && isDateKey(to) && from <= to && to >= today;
  const full = shown.length >= MAX_AWAY;

  const save = async (next: AwayRange[], after?: () => void) => {
    setBusy(true);
    setError(null);
    setQueued(false);
    let write: Promise<void>;
    try {
      write = onSave(next);
    } catch (err) {
      write = Promise.reject(err);
    }
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    const outcome = await settleOrQueue(write, online);
    setBusy(false);
    if (outcome.kind === "failed") {
      console.warn("[standing-week] away save failed:", outcome.error);
      setError("Couldn't save the dates just now. Check the connection and try again.");
      return;
    }
    after?.();
    if (outcome.kind === "queued") {
      setQueued(true);
      write.then(
        () => setQueued(false),
        (err) => {
          console.warn("[standing-week] away save refused:", err);
          setQueued(false);
          setError("Couldn't save the dates. Check the connection and try again.");
        },
      );
    }
  };

  const add = () => {
    if (!valid || busy) return;
    const trimmed = note.trim().slice(0, MAX_AWAY_NOTE);
    const range: AwayRange = { id: newAwayId(shown), from, to, ...(trimmed ? { note: trimmed } : {}) };
    void save([...shown, range], reset);
  };

  return (
    <section className="stw-away" aria-label="Away">
      <h3 className="stw-away__head">Away</h3>
      {shown.length === 0 ? (
        <p className="stw-hint">No dates away.</p>
      ) : (
        <ul className="stw-away__list" aria-label="Dates away">
          {shown.map((r) => (
            <li key={r.id} className="stw-away__range">
              <span className="stw-away__when">{awayLabel(r, tz)}</span>
              {r.note && <span className="stw-away__note">{r.note}</span>}
              <button
                type="button"
                className="stw-x"
                aria-label={`Remove away ${awayLabel(r, tz)}`}
                disabled={disabled || busy}
                onClick={() => void save(shown.filter((x) => x.id !== r.id))}
              >
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="stw-adder" role="group" aria-label="Add dates away">
          <div className="stw-adder__row">
            <label className="stw-field">
              <span className="stw-field__label">From</span>
              <input
                className="stw-input stw-input--date"
                type="date"
                value={from}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value;
                  setFrom(next);
                  if (isDateKey(next) && to < next) setTo(next);
                }}
              />
            </label>
            <label className="stw-field">
              <span className="stw-field__label">To</span>
              <input
                className="stw-input stw-input--date"
                type="date"
                value={to}
                min={isDateKey(from) ? from : today}
                disabled={busy}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <label className="stw-field">
            <span className="stw-field__label">Note (optional)</span>
            <input
              className="stw-input"
              type="text"
              value={note}
              maxLength={MAX_AWAY_NOTE}
              placeholder="Vacation"
              disabled={busy}
              aria-describedby={noteHint}
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="stw-hint" id={noteHint}>
              Everyone at the studio can read this note.
            </span>
          </label>
          {!valid && <p className="stw-hint">Pick a first and last day: the last on or after the first, and today or later.</p>}
          <div className="stw-actions stw-actions--tight">
            {/* An editor's Cancel asks before it throws typing away (WikiEditor's rule). */}
            <button type="button" className="stw-btn stw-btn--quiet" disabled={busy} onClick={() => unsaved.guard(reset)}>
              Cancel
            </button>
            <button type="button" className="stw-btn stw-btn--save" disabled={!valid || busy || disabled} onClick={add}>
              {busy ? "Saving…" : "Save dates away"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="stw-add" disabled={disabled || busy || full} onClick={() => setAdding(true)}>
          <Plus size={15} aria-hidden />
          Dates away
        </button>
      )}
      {full && !adding && <p className="stw-hint">Up to {MAX_AWAY} ranges at a time.</p>}
      {queued && (
        <p className="stw-hint" role="status">
          Saved on this iPad. It sends when the connection is back.
        </p>
      )}
      {error && (
        <p className="stw-actions__msg stw-actions__msg--error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
