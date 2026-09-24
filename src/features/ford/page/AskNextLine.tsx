/**
 * ASK NEXT — the last line of every pillar card: the one question worth
 * asking at the next session (`askNext()`), in curly quotes, and why this one.
 *
 * Two kinds:
 *   - a FOLLOW UP NEXT TIME someone wrote on one of this pillar's details
 *     ("Follow up from Jess Moreno, Mar 15"). "Asked it" opens a small panel:
 *     what the answer was (optional), "Save the answer" — a new FORD detail
 *     under this pillar, about the same subject, in the trainer's words — then
 *     the question is cleared; "Nothing new, clear it" clears it with no new
 *     detail; "Not yet" closes the panel and leaves the question up.
 *   - one of FORD's own prompts, rotated by day and aware of retirement. It
 *     has no button: the pillar's Add is how the answer is recorded.
 *
 * A write that fails keeps the words and says so. If the answer saved but
 * the question could not be cleared, it says THAT — and does not offer to
 * save the answer again, which would file it twice.
 *
 * WHILE "ASKED IT" IS OPEN THE LINE HOLDS ITS QUESTION. Firestore applies an
 * update to this iPad's cache before the server answers, so the one FORD
 * listener delivers the question as already cleared the moment "clear" is
 * tapped — and Ask next moves on to the next question or a prompt. If the
 * server then refuses, the question comes back. Following the live question
 * while the panel is open would close the panel as if the clear had worked,
 * lose "The answer is saved…", and bind a retry to a different detail. So
 * the panel keeps the question it was opened on (and its meta line) until it
 * closes; while that same detail is still the live one, its live words are
 * shown. Every write names the question it is for (`AskNextActions`), never
 * "whatever Ask next says now". The host gives this line no key per
 * question for the same reason: a remount would drop the held question.
 */
import { useState } from "react";
import { Btn, Eyebrow, TextArea, curly } from "../../client-codex/kit";
import type { AskNext, FollowUpAsk } from "../ask-next";
import { FORD_BODY_MAX } from "../ford-write";

export interface AskNextActions {
  /** Saves the answer to `ask` as a new detail; resolves false when it did not save. */
  answer: (ask: FollowUpAsk, body: string) => Promise<boolean>;
  /** Clears the follow-up `ask` came from; resolves false when it did not save. */
  clear: (ask: FollowUpAsk) => Promise<boolean>;
}

export function AskNextLine({
  ask,
  meta,
  actions = null,
}: {
  ask: AskNext;
  meta: string;
  /**
   * "Asked it" for a follow-up; null for a reader who may not write FORD.
   * A prompt never offers it, whatever this is.
   */
  actions?: AskNextActions | null;
}) {
  /** The question "Asked it" was opened on, and its meta line; null while closed. */
  const [held, setHeld] = useState<{ ask: FollowUpAsk; meta: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  /** failed: nothing saved · answer-only: the answer saved, the question is still up. */
  const [problem, setProblem] = useState<"failed" | "answer-only" | null>(null);

  // The held question, unless the live one is the same detail (then its live words).
  const hold = held !== null && !(ask.kind === "follow-up" && ask.entry.id === held.ask.entry.id) ? held : null;
  const shown: AskNext = hold ? hold.ask : ask;
  const shownMeta = hold ? hold.meta : meta;
  const followUp = shown.kind === "follow-up" ? shown : null;
  const canAsk = followUp !== null && actions !== null;
  const asking = held !== null;

  const open = () => {
    if (ask.kind !== "follow-up") return;
    setHeld({ ask, meta });
    setAnswer("");
    setProblem(null);
  };

  const close = () => {
    setHeld(null);
    setAnswer("");
    setProblem(null);
  };

  const run = async (target: FollowUpAsk, withAnswer: boolean) => {
    if (!actions || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (withAnswer) {
        const saved = await actions.answer(target, answer);
        if (!saved) {
          setProblem("failed");
          return;
        }
        // The answer is a detail now; never offer to save it a second time.
        setAnswer("");
      }
      const cleared = await actions.clear(target);
      if (cleared) close();
      else setProblem(withAnswer ? "answer-only" : "failed");
    } catch {
      setProblem("failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fordpg-ask" data-kind={shown.kind}>
      <div className="fordpg-ask__line">
        <Eyebrow>Ask next</Eyebrow>
        <b className="fordpg-ask__q">{curly(shown.question)}</b>
        <span className="fordpg-ask__why">{shownMeta}</span>
      </div>
      {canAsk && !asking ? (
        <div>
          <Btn onClick={open}>Asked it</Btn>
        </div>
      ) : null}
      {canAsk && asking && followUp ? (
        <div className="fordpg-ask__panel">
          <TextArea
            label="What was the answer?"
            hint="Optional. Saved as a new detail here, in your words."
            value={answer}
            rows={2}
            maxLength={FORD_BODY_MAX}
            onChange={setAnswer}
            disabled={busy || problem === "answer-only"}
          />
          <div className="fordpg-ask__acts">
            <Btn
              variant="solid"
              disabled={busy || answer.trim() === "" || problem === "answer-only"}
              onClick={() => void run(followUp, true)}
            >
              Save the answer
            </Btn>
            <Btn disabled={busy} onClick={() => void run(followUp, false)}>
              Nothing new, clear it
            </Btn>
            <Btn variant="quiet" disabled={busy} onClick={close}>
              Not yet
            </Btn>
          </div>
          {problem === "failed" ? (
            <p className="fordpg-ask__note" role="alert">
              Not saved — still here, try again.
            </p>
          ) : problem === "answer-only" ? (
            <p className="fordpg-ask__note" role="alert">
              The answer is saved. The question couldn't be cleared — tap “Nothing new, clear it” to try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
