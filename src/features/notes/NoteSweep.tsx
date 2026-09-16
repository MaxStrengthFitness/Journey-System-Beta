/**
 * THE TO-FILE TRAY — filing what was caught, one tap each.
 *
 * The notes twin of `features/ford/FordSweep.tsx`. A note saved with no
 * category ("capture now, tag at teardown", reporting round Sep 2026) comes
 * back here as a card: the words, the machine it was about, and the five
 * categories as chips underneath — plus the 4 P's, so a coaching tip can be
 * filed with its P in the same single tap. One tap files; the card is gone.
 *
 * WHERE IT IS MOUNTED
 *   - the Active Session sheet, under "This session", for this session's
 *     unfiled notes (so a trainer who has a second between machines can
 *     file the last one);
 *   - the post-session screen, with the session's unfiled notes;
 *   - the top of the Notes area on the record, for everything outstanding.
 *
 * THE RESTRAINT IT SHARES WITH THE FORD SWEEP
 *   - It renders NOTHING when there is nothing to file. Teardown is thirty
 *     seconds; an empty tray asking to be dismissed is worse than none.
 *   - It never blocks anything. A note left unfiled is still a note — in the
 *     record, on the briefing if it is loud — and the tray on the Notes area
 *     will still be offering it next week.
 *   - Filing is optimistic. The card leaves when tapped; if the write fails
 *     the stream brings it back, which is the honest outcome.
 *   - Unfiled is a tidy-up, not an error: the FORD unfiled tone (a quiet
 *     gold), never amber, never red.
 *
 * The parent supplies `onFile` (see `fileUnfiledEntry`) so the same tray
 * works wherever it is mounted and the test can assert the write.
 */
import { useMemo, useState } from "react";
import { Check, Dumbbell, Inbox, Trash2 } from "lucide-react";
import type { Machine } from "../../types";
import { FOCUS_CATEGORIES, type FocusCategory, type JournalEntry } from "../../types/journal";
import { FILING_CATEGORIES, isUnfiled, type FilingCategory } from "./note-catalog";
import { NoteCategoryChips } from "./NoteCategoryChips";
import "./notes.css";

export interface NoteSweepProps {
  /** Any list; only the unfiled ones (`isUnfiled`) are shown. */
  entries: JournalEntry[];
  machines: Machine[];
  clientFirstName: string;
  onFile: (entryId: string, category: FilingCategory, p?: FocusCategory | null) => Promise<void>;
  onDiscard?: (entryId: string) => Promise<void>;
  /** Mounted on a dark surface (the post-session screen): resolves the tokens for it. */
  dark?: boolean;
}

export function NoteSweep({ entries, machines, clientFirstName, onFile, onDiscard, dark = false }: NoteSweepProps) {
  // Cards leave the moment they are tapped. The write follows; if it fails
  // the stream puts the card back, because the note genuinely is not filed.
  const [settled, setSettled] = useState<Set<string>>(new Set());
  const [filed, setFiled] = useState(0);

  const queue = useMemo(
    () => entries.filter((e) => isUnfiled(e) && !e.isArchived && !settled.has(e.id)),
    [entries, settled],
  );

  const settle = (id: string) =>
    setSettled((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const file = (entry: JournalEntry, category: FilingCategory, p: FocusCategory | null = null) => {
    settle(entry.id);
    setFiled((n) => n + 1);
    void onFile(entry.id, category, p).catch(() => {
      /* the stream restores the card; nothing else to do here */
    });
  };

  const discard = (entry: JournalEntry) => {
    if (!onDiscard) return;
    settle(entry.id);
    void onDiscard(entry.id).catch(() => {});
  };

  const name = clientFirstName || "this client";
  const cls = `nc-sweep${dark ? " dark" : ""}`;

  if (queue.length === 0 && filed === 0) return null;

  if (queue.length === 0) {
    return (
      <section className={cls} aria-label="Notes filed" data-testid="note-sweep">
        <div className="nc-sweep__done">
          <Check className="h-4 w-4" aria-hidden />
          {filed === 1 ? "Filed. It is in the record under its category." : `All ${filed} filed. They are in the record under their categories.`}
        </div>
      </section>
    );
  }

  return (
    <section className={cls} aria-label="Notes to file" data-testid="note-sweep">
      <header className="nc-sweep__head">
        <Inbox className="nc-sweep__mark h-4 w-4" aria-hidden />
        <div className="min-w-0">
          <span className="nc-sweep__title">To file · {queue.length}</span>
          <span className="nc-sweep__sub">
            {queue.length === 1 ? "A note" : "Notes"} about {name} saved without a category. One tap each — or leave{" "}
            {queue.length === 1 ? "it" : "them"}, nothing is lost.
          </span>
        </div>
      </header>

      {queue.map((entry) => {
        const machine = entry.machineId ? machines.find((m) => m.id === entry.machineId) : null;
        return (
          <article key={entry.id} className="nc-sweep__card" data-testid={`sweep-${entry.id}`}>
            <p className="nc-sweep__quote">“{entry.body}”</p>
            {machine ? (
              <span className="nc-sweep__machine">
                <Dumbbell className="h-3 w-3" aria-hidden /> {machine.name}
              </span>
            ) : null}

            <div className="nc-sweep__rows">
              <NoteCategoryChips
                value={null}
                options={FILING_CATEGORIES}
                label={`File this note about ${name}`}
                small
                onChange={(c) => file(entry, c as FilingCategory)}
              />
              <div className="nc-sweep__ps">
                <span className="nc-kicker">…or a coaching tip by its P</span>
                <div className="nc-chips" role="group" aria-label="File as a coaching tip with its P">
                  {FOCUS_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="nc-chip nc-chip--small"
                      onClick={() => file(entry, "coaching", c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="nc-sweep__foot">
              <span>{entry.authorInitials}</span>
              {onDiscard ? (
                <button type="button" className="nc-btn nc-btn--quiet" onClick={() => discard(entry)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Discard
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
