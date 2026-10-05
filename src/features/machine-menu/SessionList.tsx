/**
 * THE MACHINE MENU — Every session: the chart's exact numbers, as a table.
 *
 * Newest first, twenty rows at a time, a 48px row each: the day, the session
 * number (only through `sessionNumberTag`, so a migration client shows none),
 * the load, the reps (or the hold, or each side), the mark in words, what
 * happened, the set-up only where it changed ("Back pad 2, was 3", or "not
 * recorded"), the trainer's initials and the notes. Together with Weight by
 * weight it is the screen reader's view of the chart (the SVG is one image).
 *
 * Every word is timeline-words.ts's `sessionRow`; nothing here ranks a set.
 */
import { useState } from "react";
import type { TimelineModel } from "./timeline-model";
import { SESSION_HEADS, sessionRow, sessionsCaption, showMoreLabel, type WordsContext } from "./timeline-words";
import "./machine-menu.css";

/** Rows shown at a time. */
export const SESSION_PAGE = 20;

export function SessionList({ id, model, ctx }: { id?: string; model: TimelineModel; ctx: WordsContext }) {
  const [shown, setShown] = useState(SESSION_PAGE);
  const rows = model.columns
    .map((c) => sessionRow(model, c.index, ctx))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .reverse();
  const numbered = rows.some((r) => r.number !== null);
  const visible = rows.slice(0, shown);
  const more = rows.length - visible.length;

  return (
    <div className="mm-listbody" id={id} data-list="sessions">
      <div className="mm-sess-scroll">
        <table className="mm-sess">
          <caption className="sr-only">{sessionsCaption(model.machineName)}</caption>
          <thead>
            <tr>
              <th scope="col" className="mm-sess__h">{SESSION_HEADS.day}</th>
              {numbered ? <th scope="col" className="mm-sess__h">{SESSION_HEADS.number}</th> : null}
              <th scope="col" className="mm-sess__h">{SESSION_HEADS.lb}</th>
              <th scope="col" className="mm-sess__h">{SESSION_HEADS.effort}</th>
              <th scope="col" className="mm-sess__h">{SESSION_HEADS.mark}</th>
              <th scope="col" className="mm-sess__h">{SESSION_HEADS.outcome}</th>
              <th scope="col" className="mm-sess__h">{SESSION_HEADS.setup}</th>
              <th scope="col" className="mm-sess__h">{SESSION_HEADS.trainer}</th>
              <th scope="col" className="mm-sess__h">{SESSION_HEADS.notes}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.sessionId} data-row={r.sessionId}>
                <td className="mm-sess__c">{r.day}</td>
                {numbered ? <td className="mm-sess__c">{r.number ?? ""}</td> : null}
                <td className="mm-sess__c mm-sess__num">{r.lb}</td>
                <td className="mm-sess__c mm-sess__num">{r.effort}</td>
                <td className="mm-sess__c">{r.mark}</td>
                <td className="mm-sess__c">{r.outcome}</td>
                <td className="mm-sess__c">{r.setup}</td>
                <td className="mm-sess__c">{r.trainer}</td>
                <td className="mm-sess__c">{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more > 0 ? (
        <button type="button" className="mm-more-btn" onClick={() => setShown((s) => s + SESSION_PAGE)}>
          {showMoreLabel(Math.min(SESSION_PAGE, more))}
        </button>
      ) : null}
    </div>
  );
}
