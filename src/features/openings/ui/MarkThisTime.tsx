import { useEffect, useId, useRef, type ReactNode } from "react";
import { MAX_MARK_NOTE, disagreement, type MarkWord, type OpeningsMark } from "../marks";
import { markLines, type Viewer } from "../present";
import type { UsualTime } from "../usual";
import {
  CANCEL,
  CHANGE_THE_MARK,
  KEEP,
  KEEP_FAILED,
  MARK_CHOICE_LABEL,
  MARK_INTRO,
  MARK_NOTE_LABEL,
  MARK_QUEUED,
  MARK_THIS_TIME,
  MARK_WORD,
  REMOVE,
  REMOVE_FAILED,
  REMOVE_IT,
  REMOVE_THE_MARK,
  SAVE_FAILED,
  SAVE_THE_MARK,
  SAVING_THE_MARK,
  markChangeLine,
  markNoteHint,
  removeQuestion,
} from "./mark-words";
import type { MarkThisTime } from "./useMarkThisTime";
import "../../relay/kit.css";
import "../../relay/planner.css";
import "../openings.css";

/**
 * "MARK THIS TIME" (Openings round, Sep 27 2026, phase 6;
 * docs/rounds/2026-09-27-openings.md, "Marks: how a person disagrees").
 *
 * The foot of a time's sheet, where a person puts their word on a time in
 * the grid's own words, "Always full" or "Usually has room", with a short
 * note. Anyone who works at the studio may set, change or remove the mark,
 * always as themselves (marks-store.ts; the rules pin who and when).
 *
 *   - Nothing is offered until the marks have been read from the server
 *     (`data.marks.read === "ready"`): with the marks unknown, a new mark
 *     could silently replace a colleague's, so the sheet says it can't tell
 *     instead (TimeSheet). A form already open stays open.
 *   - Choosing a word the bookings clearly disagree with shows their
 *     disagreement FIRST, in the caution plum, before the save: the core's
 *     own line (`markLines`), never a second sentence.
 *   - What the chosen word changes FOR THIS TIME is said under the choice
 *     (`markChangeLine`: the core's `offerable` decides, so a time that
 *     reads Always full is never promised as an offer).
 *   - Removing asks once: the mark goes for everyone at the studio.
 *   - A write never hangs the sheet (useMarkThisTime, `settleOrQueue`):
 *     offline, the form or the question closes at once and the foot says
 *     "Saved on this iPad. It goes to the studio when the connection is
 *     back." A refusal that comes after that is said at the foot too.
 *
 * `MarkReview` is the 60-day review's two answers, drawn by the sheet right
 * under "Marked 64 days ago. Still true?": Keep signs the mark again, as the
 * person keeping it, today; Remove asks, then removes. The mark keeps
 * working while it waits; nothing drops on its own.
 *
 * Every Save is the solid brand blue (.pl__btn--primary); a removal's
 * confirmation is the app's critical colour (.pl__btn--danger). Nothing
 * tappable is under 40px.
 */

export interface MarkPartProps {
  m: MarkThisTime;
  u: UsualTime;
  mark: OpeningsMark | null;
  viewer: Viewer;
  today: string;
  tz: string;
  studioName: string;
  /** The marks have been read from the server: only then may a new one be offered. */
  ready: boolean;
  /** The mark is up for its 60-day review, so Keep and Remove stand under the question. */
  reviewing: boolean;
}

/** The bookings' disagreement with a word about to be saved, in the core's own words, or null. */
function disagreementLine(u: UsualTime, word: MarkWord | null, viewer: Viewer, today: string, tz: string): string | null {
  if (!word) return null;
  const provisional: OpeningsMark = { id: u.key, weekday: u.weekday, time: "", mark: word, note: "", by: { id: viewer.uid ?? "", name: "" }, at: null };
  if (!disagreement(u, provisional)) return null;
  // markLines puts the disagreement first.
  return markLines(u, provisional, viewer, today, tz)[0] ?? null;
}

function RemoveQuestion({ m, studioName }: { m: MarkThisTime; studioName: string }) {
  return (
    <div className="rk-field" role="group" aria-label={REMOVE_THE_MARK} data-testid="mark-remove-question">
      <p className="op-sheet__line">{removeQuestion(studioName)}</p>
      <div className="rk-row">
        <button type="button" className="pl__btn pl__btn--danger" disabled={m.busy !== null} onClick={() => void m.remove()}>
          {REMOVE_IT}
        </button>
        <button type="button" className="pl__btn" disabled={m.busy !== null} onClick={m.dontRemove}>
          {CANCEL}
        </button>
      </div>
      {m.failed === "remove" && <p className="rk-problem">{REMOVE_FAILED}</p>}
    </div>
  );
}

/** The review's Keep and Remove, under "Marked 64 days ago. Still true?". */
export function MarkReview({ m, studioName }: { m: MarkThisTime; studioName: string }) {
  if (!m.canWrite || m.editing) return null;
  if (m.confirmingRemove) return <RemoveQuestion m={m} studioName={studioName} />;
  return (
    <div className="rk-field" data-testid="mark-review">
      <div className="rk-row">
        <button type="button" className="pl__btn pl__btn--primary" disabled={m.busy !== null} onClick={() => void m.keep()}>
          {KEEP}
        </button>
        <button type="button" className="pl__btn" disabled={m.busy !== null} onClick={m.askRemove}>
          {REMOVE}
        </button>
      </div>
      {m.failed === "keep" && <p className="rk-problem">{KEEP_FAILED}</p>}
    </div>
  );
}

/** The form: the word, the bookings' disagreement first, what the word changes, the note, and Save. */
function MarkForm({ m, u, viewer, today, tz, studioName }: MarkPartProps) {
  const noteId = useId();
  const hintId = useId();
  const against = disagreementLine(u, m.draft.word, viewer, today, tz);
  return (
    <>
      <div className="rk-field" role="group" aria-label={MARK_CHOICE_LABEL}>
        <span className="rk-label" aria-hidden>
          {MARK_CHOICE_LABEL}
        </span>
        <div className="op-chips">
          {(["full", "room"] as const).map((word) => (
            <button key={word} type="button" className="op-chip" aria-pressed={m.draft.word === word} disabled={m.busy !== null} onClick={() => m.choose(word)}>
              {MARK_WORD[word]}
            </button>
          ))}
        </div>
        {against && (
          <p className="rk-problem" data-testid="mark-disagree">
            {against}
          </p>
        )}
        {m.draft.word && (
          <p className="rk-hint" data-testid="mark-changes">
            {markChangeLine(u, m.draft.word)}
          </p>
        )}
      </div>

      <div className="rk-field">
        <label className="rk-label" htmlFor={noteId}>
          {MARK_NOTE_LABEL}
        </label>
        <textarea
          id={noteId}
          className="rk-textarea"
          rows={2}
          maxLength={MAX_MARK_NOTE}
          value={m.draft.note}
          aria-describedby={hintId}
          disabled={m.busy !== null}
          onChange={(e) => m.setNote(e.target.value)}
        />
        <p id={hintId} className="rk-hint">
          {markNoteHint(studioName, m.draft.note.length)}
        </p>
      </div>

      <div className="rk-row">
        <button type="button" className="pl__btn pl__btn--primary" disabled={!m.draft.word || m.busy !== null} onClick={() => void m.save()}>
          {m.busy === "save" ? SAVING_THE_MARK : SAVE_THE_MARK}
        </button>
        <button type="button" className="pl__btn" disabled={m.busy !== null} onClick={m.cancel}>
          {CANCEL}
        </button>
      </div>
      {m.failed === "save" && <p className="rk-problem">{SAVE_FAILED}</p>}
    </>
  );
}

/**
 * What the foot says after the form or the question has closed: a write
 * saved on this iPad and on its way, or one refused after that. A refusal
 * while the form or the question is open is said there, and Keep's under
 * the review's question while the mark is still up for review.
 */
function AfterLine({ m, reviewing }: { m: MarkThisTime; reviewing: boolean }) {
  if (m.editing || m.confirmingRemove) return null;
  if (m.queued) {
    return (
      <p className="rk-hint" role="status" data-testid="mark-queued">
        {MARK_QUEUED[m.queued]}
      </p>
    );
  }
  const failed = m.failed === "save" ? SAVE_FAILED : m.failed === "remove" ? REMOVE_FAILED : m.failed === "keep" && !reviewing ? KEEP_FAILED : null;
  if (!failed) return null;
  return (
    <p className="rk-problem" role="alert">
      {failed}
    </p>
  );
}

/** The foot of a time's sheet: "Mark this time", or the mark's own doors, or the form. */
export function MarkThisTimePart(props: MarkPartProps) {
  const { m, mark, studioName, ready, reviewing } = props;
  const headId = useId();
  const partRef = useRef<HTMLElement>(null);

  // The form opens at the foot of the sheet: bring it into view (in portrait
  // the sheet may be at its half-height detent). Nothing is focused, so no
  // keyboard jumps up before a word is chosen.
  useEffect(() => {
    if (m.editing) partRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [m.editing]);

  if (!m.canWrite) return null;
  // The marks aren't known: TimeSheet says it can't tell. A form already open stays.
  if (!m.editing && !ready) return null;

  if (!m.editing && !mark) {
    // Nobody has marked the time: the button names itself, so no heading.
    return (
      <section className="rk-field" aria-label={MARK_THIS_TIME} data-testid="mark-this-time">
        <p className="rk-hint">{MARK_INTRO}</p>
        <div className="rk-row">
          <button type="button" className="pl__btn" onClick={m.open}>
            {MARK_THIS_TIME}
          </button>
        </div>
        <AfterLine m={m} reviewing={reviewing} />
      </section>
    );
  }

  let body: ReactNode;
  if (m.editing) {
    body = <MarkForm {...props} />;
  } else if (m.confirmingRemove && !reviewing) {
    body = <RemoveQuestion m={m} studioName={studioName} />;
  } else {
    // Under review, Keep and Remove stand under the review's question
    // (MarkReview); a change is still offered here.
    body = (
      <div className="rk-row">
        <button type="button" className="pl__btn" disabled={m.busy !== null} onClick={m.open}>
          {CHANGE_THE_MARK}
        </button>
        {!reviewing && (
          <button type="button" className="pl__btn" disabled={m.busy !== null} onClick={m.askRemove}>
            {REMOVE_THE_MARK}
          </button>
        )}
      </div>
    );
  }

  return (
    <section ref={partRef} className="rk-field" aria-labelledby={headId} data-testid="mark-this-time">
      <h3 id={headId} className="rk-label">
        {MARK_THIS_TIME}
      </h3>
      {body}
      <AfterLine m={m} reviewing={reviewing} />
    </section>
  );
}
