/**
 * ASK NEXT — the last line of every pillar card: the one question worth
 * asking at the next session (`askNext()`), in curly quotes, and why this one.
 *
 * Today it is always one of FORD's own prompts, rotated by day and aware of
 * retirement. It has no button: the pillar's Add is how the answer is
 * recorded. (A question someone writes down for next time — "Follow up next
 * time" — joins it in its own phase.)
 */
import { Eyebrow, curly } from "../../client-codex/kit";
import type { AskNext } from "../ask-next";

export function AskNextLine({ ask, meta }: { ask: AskNext; meta: string }) {
  return (
    <div className="fordpg-ask">
      <Eyebrow>Ask next</Eyebrow>
      <b className="fordpg-ask__q">{curly(ask.question)}</b>
      <span className="fordpg-ask__why">{meta}</span>
    </div>
  );
}
