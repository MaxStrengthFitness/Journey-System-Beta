import { Fragment } from "react";
import {
  MARKS_UNKNOWN_TIME,
  cancellationsLine,
  markLines,
  markNoteLine,
  notCountedLines,
  outnumberedLine,
  regularsLine,
  summaryStateSentence,
  usualSentence,
  usuallyBookedLine,
  usuallyInLine,
} from "../present";
import { disagreement, needsReview } from "../marks";
import { regularsAt } from "../room";
import { parseTimeKey, type TimeKey } from "../rows";
import { usualTime, type UsualTime } from "../usual";
import { useRelayMaybe } from "../../relay/board/RelayContext";
import { useOpenings } from "./context";
import { MarkReview, MarkThisTimePart } from "./MarkThisTime";
import { useMarkThisTime } from "./useMarkThisTime";
import "../openings.css";

/**
 * A TIME'S SHEET (Openings round, phase 4; marks, phase 6): what a tap on a
 * time of the usual week shows, in the Context Panel beside the grid (a
 * right column in landscape, a sheet from the foot in portrait). Every line
 * about the time is present.ts's, from `usualTime`:
 *
 *   - the mark, when there is one, first (and the bookings' disagreement
 *     before it), with its note; otherwise the time's own sentence;
 *   - after 60 days, "Marked 64 days ago. Still true?" with Keep and Remove
 *     right under it;
 *   - how many are usually booked, and who is usually in (names for everyone:
 *     AJ's relaxed answer);
 *   - how many regulars today's agreed weeks put there;
 *   - the time's cancellations, and when the bookings outnumber the trainers in;
 *   - the days not counted or not judged, and why;
 *   - at the foot, "Mark this time" (MarkThisTime.tsx): set, change or remove
 *     the mark, as the person signed in.
 *
 * The sheet reads the section's data live, so a mark that arrives while it
 * is open shows at once. Its body is keyed by the time, so a half-written
 * mark can never be saved onto another time; while it is being written it is
 * registered with the leave warning (useMarkThisTime), inside the parts'
 * leave scope, so the panel's X and Escape (OpeningsSection) and a tap on
 * another time (UsualWeekPart) ask before they would replace the sheet.
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
  return <TimeSheetBody key={timeKey} u={u} weekday={t.weekday} row={t.row} />;
}

function TimeSheetBody({ u, weekday, row }: { u: UsualTime; weekday: number; row: number }) {
  const data = useOpenings();
  const relay = useRelayMaybe();
  const timeKey = u.key;
  const mark = data.marks.byTime.get(timeKey) ?? null;

  // Signed as the person at the iPad: the Auth uid, and their whole name.
  const uid = data.viewer.uid ?? null;
  const name = relay?.authTrainer?.fullName || data.refs.find((r) => r.id === data.viewer.trainerId)?.name || "";
  const m = useMarkThisTime({ studioId: data.studioId, timeKey, mark, signer: uid ? { uid, name } : null });

  const lead = mark ? markLines(u, mark, data.viewer, data.today, data.tz) : [usualSentence(u)];
  // The mark's note follows the line that says who marked it (after the bookings' disagreement, when there is one).
  const markedAt = mark ? (disagreement(u, mark) ? 1 : 0) : -1;
  const reviewing = Boolean(mark) && data.marks.read === "ready" && needsReview(mark!, data.today, data.tz);

  const weeksKnown = !data.weeks.loading && !data.weeks.error;
  const facts = [
    usuallyBookedLine(u),
    usuallyInLine(u, data.names, data.viewer),
    weeksKnown ? regularsLine(regularsAt(data.weeks.docs, weekday, row, data.worksHere), timeKey) : null,
    cancellationsLine(u),
    outnumberedLine(u),
  ].filter((line): line is string => Boolean(line));
  const left = notCountedLines(u, data.tz);
  const marksUnknown = data.marks.read === "failed" || data.marks.read === "offline";

  return (
    <div className="op-sheet" data-testid="time-sheet">
      <div className="op-sheet__lead">
        {lead.map((line, i) => (
          <Fragment key={line}>
            <p className="op-sheet__line op-sheet__line--lead">{line}</p>
            {i === markedAt && mark?.note && (
              <p className="op-sheet__line" data-testid="mark-note">
                {markNoteLine(mark.note)}
              </p>
            )}
          </Fragment>
        ))}
        {reviewing && <MarkReview m={m} studioName={data.studioName} />}
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
      {marksUnknown && <p className="op-sheet__line op-sheet__line--quiet">{MARKS_UNKNOWN_TIME}</p>}
      <MarkThisTimePart
        m={m}
        u={u}
        mark={mark}
        viewer={data.viewer}
        today={data.today}
        tz={data.tz}
        studioName={data.studioName}
        ready={data.marks.read === "ready"}
        reviewing={reviewing}
      />
    </div>
  );
}
