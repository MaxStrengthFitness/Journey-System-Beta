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
 *   - the Wrap-up (the post-session screen), with the session's unfiled
 *     notes. The Note for the next trainer is one of them (Finish writes it
 *     as an unfiled Heads up): its card says so and has no Discard, because
 *     it is on the next briefing and a discard would take it off. Filing it
 *     to the profile keeps it there (voice-review follow-up, Sep 27 2026);
 *   - the Notes page of the record, under the composer, for everything
 *     outstanding. A loud note wears its Loudness pill here (client codex):
 *     an unfiled critical note sits in this tray, not in Open, and the
 *     critical line's "Open the note" brings the trainer to its card.
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
import { Check, Dumbbell, Forward, Inbox, Trash2 } from "lucide-react";
import type { Machine } from "../../types";
import { FOCUS_CATEGORIES, IMPORTANCE_META, type FocusCategory, type JournalEntry } from "../../types/journal";
import { LOUDNESS_TONE } from "../rating/Loudness";
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
  /**
   * Which card is the Note for the next trainer (the Wrap-up passes it; see
   * `isNextTrainerNote` in note-catalog.ts). That card says so and offers no
   * Discard: it is on the next trainer's briefing, and a discard would take
   * it off. It can still be filed, which leaves it there. A tray with no mark
   * of its own answers with `isNextTrainerNoteOfSessions`; the Notes page does
   * not pass it yet (the client-notes README's known gap).
   */
  isNextTrainerNote?: (entry: JournalEntry) => boolean;
}

/*
 * It follows the app theme wherever it is mounted. Until Sep 27 2026 a `dark`
 * prop pinned it dark for the Wrap-up, which was dark in both themes once;
 * the Wrap-up follows the theme now, so the prop went.
 */
export function NoteSweep({
  entries,
  machines,
  clientFirstName,
  onFile,
  onDiscard,
  isNextTrainerNote,
}: NoteSweepProps) {
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
    if (!onDiscard || isNextTrainerNote?.(entry)) return;
    settle(entry.id);
    void onDiscard(entry.id).catch(() => {});
  };

  const name = clientFirstName || "this client";
  const cls = "nc-sweep";

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
        const forNextTrainer = isNextTrainerNote?.(entry) ?? false;
        return (
          <article key={entry.id} className="nc-sweep__card" id={`sweep-${entry.id}`} data-testid={`sweep-${entry.id}`}>
            {/* The End Session box's note: already on its way to the next
                trainer, so the card says where it is going before it asks
                for a category. Same quiet line as the machine below. */}
            {forNextTrainer ? (
              <span className="nc-sweep__machine" data-testid="sweep-next-trainer">
                <Forward className="h-3 w-3" aria-hidden /> Note for the next trainer · on the next briefing
              </span>
            ) : null}
            <p className="nc-sweep__quote">“{entry.body}”</p>
            {/* An unfiled note waits here rather than in Open, so a loud one
                must still look loud (client codex): the Loudness words and
                colours, the same as on a thread card. */}
            {entry.importance === "elevated" || entry.importance === "critical" ? (
              <span className="nc-loud" data-tone={LOUDNESS_TONE[entry.importance]}>
                {IMPORTANCE_META[entry.importance].short}
              </span>
            ) : null}
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
              {onDiscard && !forNextTrainer ? (
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
