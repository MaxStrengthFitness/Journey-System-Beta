import {
  cancellationsLine,
  markLines,
  notCountedLines,
  outnumberedLine,
  regularsLine,
  summaryStateSentence,
  usualSentence,
  usuallyBookedLine,
  usuallyInLine,
} from "../present";
import { regularsAt } from "../room";
import { parseTimeKey, type TimeKey } from "../rows";
import { usualTime } from "../usual";
import { useOpenings } from "./context";
import "../openings.css";

/**
 * A TIME'S SHEET (Openings round, phase 4): what a tap on a time of the usual
 * week shows, in the Context Panel beside the grid (a right column in
 * landscape, a sheet from the foot in portrait). Every line is present.ts's,
 * from `usualTime`:
 *
 *   - the mark, when there is one, first (and the bookings' disagreement
 *     before it); otherwise the time's own sentence;
 *   - how many are usually booked, and who is usually in (names for everyone:
 *     AJ's relaxed answer);
 *   - how many regulars today's agreed weeks put there;
 *   - the time's cancellations, and when the bookings outnumber the trainers in;
 *   - the days not counted or not judged, and why.
 *
 * Marks are shown, never set, here: "Mark this time" is the marks phase's,
 * and it goes at the foot of this sheet. The sheet reads the section's data
 * live, so a mark that arrives while it is open shows at once.
 */
export function TimeSheet({ timeKey }: { timeKey: TimeKey }) {
  const data = useOpenings();
  const t = parseTimeKey(timeKey);
  const u = data.usual?.times.get(timeKey) ?? (data.summary.state === "ok" ? usualTime(data.summary.summary, timeKey) : null);

  if (!u || !t) {
    return (
      <div className="op-sheet">
        <p className="op-sheet__line">{summaryStateSentence(data.summary.state === "none" ? "never" : "unreadable", data.studioName)}</p>
      </div>
    );
  }

  const mark = data.marks.byTime.get(timeKey) ?? null;
  const lead = mark ? markLines(u, mark, data.viewer, data.today, data.tz) : [usualSentence(u)];
  const weeksKnown = !data.weeks.loading && !data.weeks.error;
  const facts = [
    usuallyBookedLine(u),
    usuallyInLine(u, data.names, data.viewer),
    weeksKnown ? regularsLine(regularsAt(data.weeks.docs, t.weekday, t.row, data.worksHere), timeKey) : null,
    cancellationsLine(u),
    outnumberedLine(u),
  ].filter((line): line is string => Boolean(line));
  const left = notCountedLines(u, data.tz);
  const marksUnknown = data.marks.read === "failed" || data.marks.read === "offline";

  return (
    <div className="op-sheet" data-testid="time-sheet">
      <div className="op-sheet__lead">
        {lead.map((line) => (
          <p key={line} className="op-sheet__line op-sheet__line--lead">
            {line}
          </p>
        ))}
      </div>
      {facts.length > 0 && (
        <ul className="op-sheet__list" aria-label="What the weeks say">
          {facts.map((line) => (
            <li key={line} className="op-sheet__line">
              {line}
            </li>
          ))}
        </ul>
      )}
      {left.length > 0 && (
        <ul className="op-sheet__list op-sheet__list--quiet" aria-label="Days left out">
          {left.map((line) => (
            <li key={line} className="op-sheet__line op-sheet__line--quiet">
              {line}
            </li>
          ))}
        </ul>
      )}
      {marksUnknown && <p className="op-sheet__line op-sheet__line--quiet">Can't tell just now whether anyone has marked this time.</p>}
    </div>
  );
}
