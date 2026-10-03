import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";
import { addMachineNote, deleteMachineNote, type JournalContext, type MutationAuthor } from "./mutations";
import type { EquipmentMachine } from "./types";
import type { JournalEntry } from "../../types/journal";
import { archiveJournalEntries } from "../../hooks/useClientJournal";
import { machineNotesFor } from "./machine-notes";
import { useMachineJournal } from "./useMachineJournal";

/**
 * Machine-specific notes (box 11) — the things that are not settings.
 * "Needs extra chest padding on the compound row" is not a dial value, but it
 * is exactly what the next trainer needs to know.
 *
 * Every note filed here also lands in the client's Journal as an `equipment`
 * entry. A note flagged for maintenance files as CRITICAL, which is what puts
 * it in the pre-session briefing — so the next trainer learns the seat sticks
 * before they walk the client up to it, not after.
 */

function formatWhen(ts: unknown): string {
  const d = ts instanceof Date ? ts : new Date(String(ts));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export interface MachineNotesProps {
  machine: EquipmentMachine;
  clientId: string;
  author: MutationAuthor | null;
  journal?: JournalContext;
  onSaved?: (message: string) => void;
  onError?: (message: string) => void;
  /**
   * Wording for the flag. One field (`isImportant`), one effect (files as
   * CRITICAL, so it reaches the pre-session briefing) — but two honest
   * names for it. From the Equipment tab a trainer is usually reporting
   * kit: "flag for maintenance". Mid-session they are usually recording
   * something about the person on the machine — "hip pain if she goes too
   * fast" is not maintenance, and calling it that would have taught
   * trainers to leave the box unticked on exactly the notes that most need
   * to reach the next trainer.
   */
  flagLabel?: string;
  /**
   * Her journal, when the host already holds it (the Active Session). Left
   * out, the card reads her journal's machine notes itself
   * (useMachineJournal). Since Oct 2 2026 the card shows ONE list: her
   * journal's notes on this machine plus the old list's (machine-notes.ts).
   */
  journalEntries?: readonly JournalEntry[] | null;
}

export function MachineNotes({
  machine,
  clientId,
  author,
  journal,
  onSaved,
  onError,
  flagLabel = "Flag as important (maintenance or safety)",
  journalEntries,
}: MachineNotesProps) {
  const herJournal = useMachineJournal(clientId, journalEntries);
  const notes = useMemo(
    () => machineNotesFor({ machineId: machine.id, machineName: machine.name, legacy: machine.notes, journal: herJournal }),
    [machine.id, machine.name, machine.notes, herJournal],
  );
  const [draft, setDraft] = useState("");
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft("");
    setIsMaintenance(false);
  }, [machine.id]);

  const handleAdd = async () => {
    if (!author) {
      onError?.("Trainer session required.");
      return;
    }
    setBusy(true);
    try {
      const note = await addMachineNote({
        clientId,
        machineId: machine.id,
        machineName: machine.name,
        existingNotes: machine.notes,
        content: draft,
        isMaintenance,
        author,
        journal,
      });
      if (note) {
        setDraft("");
        setIsMaintenance(false);
        onSaved?.(
          isMaintenance
            ? "Maintenance note saved — it will show in the pre-session briefing."
            : "Note saved to the client's journal.",
        );
      }
    } catch (err) {
      console.error(err);
      onError?.("Failed to save note.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (noteId?: string) => {
    if (!author || !noteId) return;
    setBusy(true);
    try {
      // A journal note is archived there (it stays in the journal's
      // history); an old-list note is taken off the old list.
      const journalId = notes.find((n) => n.id === noteId)?.journalEntryId;
      if (journalId) {
        await archiveJournalEntries([journalId]);
        return;
      }
      await deleteMachineNote({
        clientId,
        machineId: machine.id,
        existingNotes: machine.notes,
        noteId,
        author,
      });
    } catch (err) {
      console.error(err);
      onError?.("Failed to remove note.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="eq-card">
      <header className="eq-card__head">
        <h3 className="eq-card__title">
          Notes{notes.length > 0 ? ` (${notes.length})` : ""}
        </h3>
      </header>

      <div className="eq-card__body">
        {notes.length === 0 ? (
          <p className="eq-field__help">
            No notes yet. Anything you add here also files into this client's journal.
          </p>
        ) : (
          <div>
            {notes.map((n) => (
                <article key={n.id} className={`eq-note ${n.isImportant ? "eq-note--flag" : ""}`}>
                  <p className="eq-note__body">{n.content}</p>
                  <div className="eq-note__meta">
                    {n.isImportant && (
                      <span className="eq-note__flag">
                        {/* One flag, two reasons to set it (see flagLabel): a
                            worn pad or "hip pain if she goes too fast". The
                            chip says what both have in common. */}
                        <TriangleAlert size={11} strokeWidth={2.8} aria-hidden /> Important
                      </span>
                    )}
                    <span>{n.authorName}</span>
                    <span>{formatWhen(n.timestamp)}</span>
                    <button
                      type="button"
                      className="eq-note__del"
                      onClick={() => handleDelete(n.id)}
                      disabled={busy}
                      aria-label="Remove note"
                    >
                      <Trash2 size={14} strokeWidth={2.2} aria-hidden />
                    </button>
                  </div>
                </article>
              ))}
          </div>
        )}

        <div className="eq-composer">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="About her on this machine — a cue, a pad she needs, where she feels it…"
            aria-label="New machine note"
            aria-describedby="machine-note-whose"
          />
          {/* A note here is HERS (notes round, Oct 3 2026): it files to her
              record and her briefing. A fault with the unit is the floor's,
              and filed here it reached one client's briefing and nobody
              else. */}
          <p className="eq-composer__whose" id="machine-note-whose">
            Something wrong with the machine itself — a sticky seat, a pin that jams? That&rsquo;s the floor&rsquo;s, not
            hers: flag it on My Studio → Relay so it&rsquo;s fixed for everyone.
          </p>
          <div className="eq-composer__row">
            <label className="eq-check">
              <input
                type="checkbox"
                checked={isMaintenance}
                onChange={(e) => setIsMaintenance(e.target.checked)}
              />
              {flagLabel}
            </label>
            <span className="eq-actions__spacer" />
            <button
              type="button"
              className="eq-btn eq-btn--hero"
              onClick={handleAdd}
              disabled={busy || !draft.trim()}
            >
              {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
              Add note
            </button>
          </div>
          {isMaintenance && (
            <span className="eq-field__help">
              Maintenance notes are marked critical and appear in the pre-session briefing.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
