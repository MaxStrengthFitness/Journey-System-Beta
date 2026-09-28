import { useState, type ReactNode } from "react";
import { WEEKDAY_NAME, WEEKDAY_SHORT } from "../../standing-week/week";
import { weekdayOf } from "../../studio-tasks/recurrence";
import { useRelay } from "../../relay/board/RelayContext";
import { READING_USUAL_WEEK, builtLine, notEnoughSentence, rotationDays, sinceLine, summaryStateSentence, unagreedLine, usualSentence, wordLabel } from "../present";
import { OPENINGS_WEEKDAYS, clockLabel, timeKey, timeName, type TimeKey } from "../rows";
import { isStale } from "../summary-doc";
import { firstWordsOn, type UsualTime, type UsualWord } from "../usual";
import { useOpenings } from "./context";
import { TimeSheet } from "./TimeSheet";
import "../openings.css";

/**
 * THE USUAL WEEK (Openings round, phase 4): when the studio is usually busy,
 * Monday to Saturday by half-hour, in words.
 *
 *   - Before MIN_WEEKS weeks are counted there is no grid, only ONE sentence
 *     (`notEnoughSentence`): a grid of identical empty buttons would say
 *     nothing.
 *   - Above the grid: when it was built ("an old date shows as old", in the
 *     caution plum), the weeks it counts, and whose week isn't agreed yet.
 *   - Each time is a 40px button showing its word; its label is the whole
 *     sentence, for VoiceOver. Colour only echoes the word (a hot spot in the
 *     heat's orange, a time with room in the action blue), never the only
 *     signal, and never the kaizen red.
 *   - A tap opens the time's sheet in the Context Panel. A tap on ANOTHER
 *     time asks first when a mark is half-written on the sheet that is open
 *     (`guard`, the parts' leave scope); the time already open asks nothing,
 *     because its sheet stays as it is. In portrait the sheet lies over the
 *     foot of the grid, so the part gets that much room at its foot while it
 *     is open (openings.css) and the time just tapped scrolls clear of it.
 *   - Narrower than 640px (the part's own width, not the screen's: the
 *     Context Panel may sit beside it), one day at a time with a day picker.
 *
 * The words, the sentences and every number are the pure core's (usual.ts,
 * present.ts); nothing is worked out here.
 */

type Tone = "always" | "full" | "room" | "mixed" | "booked" | "rotation" | "none" | "blank";

const TONE: Record<UsualWord, Tone> = {
  "always-full": "always",
  "usually-full": "full",
  "usually-room": "room",
  mixed: "mixed",
  booked: "booked",
  rotation: "rotation",
  "not-enough": "none",
  blank: "blank",
};

export interface UsualWeekPartProps {
  /** The parts' leave scope: asks about a half-written mark before another time's sheet replaces it. */
  guard?: (proceed: () => void) => void;
}

const straightThrough = (proceed: () => void) => proceed();

export function UsualWeekPart({ guard = straightThrough }: UsualWeekPartProps = {}) {
  const data = useOpenings();
  const { openPanel, panel } = useRelay();
  const todayWeekday = weekdayOf(data.today);
  const [day, setDay] = useState<number>(OPENINGS_WEEKDAYS.includes(todayWeekday) ? todayWeekday : 1);
  const [openKey, setOpenKey] = useState<TimeKey | null>(null);

  if (!data.connected) return <p className="op__lead">{summaryStateSentence("unlinked", data.studioName)}</p>;
  if (data.summary.state === "loading") return <p className="op__lead">{READING_USUAL_WEEK}</p>;
  if (data.summary.state === "none") return <p className="op__lead">{summaryStateSentence("never", data.studioName)}</p>;
  if (data.summary.state === "unreadable" || !data.usual) return <p className="op__lead">{summaryStateSentence("unreadable", data.studioName)}</p>;

  const summary = data.summary.summary;
  const usual = data.usual;
  if (!usual.enough) {
    return (
      <p className="op__lead" data-testid="not-enough-weeks">
        {notEnoughSentence(usual.weeksCounted, usual.since, firstWordsOn(summary.builtAt, usual.weeksCounted, data.tz), data.tz)}
      </p>
    );
  }

  const old = isStale(summary, data.now);
  const rotationDay = new Set(rotationDays(usual.times));
  const since = sinceLine(summary, usual.weeksCounted, data.tz);
  const weeksKnown = !data.weeks.loading && !data.weeks.error;
  const unagreed = weeksKnown
    ? unagreedLine(
        data.team.map((r) => ({ id: r.trainerId, name: r.name })),
        data.weeks.docs,
        data.studioName,
        data.names,
      )
    : null;

  const open = (u: UsualTime, cell: HTMLElement) => {
    // Set nothing before the answer: the whole move goes inside it.
    const go = () => {
      setOpenKey(u.key);
      // With the sheet beside it the part may narrow to one day at a time:
      // it stays on the day of the time just opened.
      setDay(u.weekday);
      openPanel({ kicker: "The usual week", title: timeName(u.key), body: <TimeSheet timeKey={u.key} /> });
      // Portrait: once the sheet (and the room it gives the part) is drawn,
      // bring the time just tapped above it (its scroll margin, openings.css).
      const later = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f: () => void) => setTimeout(f, 0);
      later(() => cell.scrollIntoView?.({ block: "nearest" }));
    };
    // The time already open keeps its sheet (the body is keyed by the time), so it never asks.
    if (panel && openKey === u.key) go();
    else guard(go);
  };

  return (
    <>
      <div className="op__meta">
        <p className={old ? "op__line op__line--old" : "op__line op__line--quiet"} data-testid="built-line">
          {builtLine(summary, data.tz)}
        </p>
        {since && <p className="op__line op__line--quiet">{since}</p>}
        {unagreed && (
          <p className="op__line" data-testid="unagreed-line">
            {unagreed}
          </p>
        )}
      </div>

      <div className="op-days" role="group" aria-label="Which day">
        {OPENINGS_WEEKDAYS.map((wd) => (
          <button key={wd} type="button" className="op-chip" aria-pressed={day === wd} aria-label={WEEKDAY_NAME[wd]} onClick={() => setDay(wd)}>
            {WEEKDAY_SHORT[wd]}
          </button>
        ))}
      </div>

      <div className="op-grid" data-day={day} aria-label="The usual week" role="group">
        <span className="op-grid__corner" aria-hidden />
        {OPENINGS_WEEKDAYS.map((wd) => (
          <span key={wd} className="op-grid__day" data-wd={wd}>
            {WEEKDAY_NAME[wd]}
          </span>
        ))}
        {usual.rows.map((row) => (
          <Row key={row} row={row}>
            {OPENINGS_WEEKDAYS.map((wd) => {
              const key = timeKey(wd, row);
              const u = usual.times.get(key);
              if (!u) return <span key={key} className="op-grid__gap" data-wd={wd} />;
              const marked = data.marks.byTime.has(key);
              const word = wordLabel(u);
              return (
                <button
                  key={key}
                  type="button"
                  className={`op-cell op-cell--${TONE[u.word]}`}
                  data-wd={wd}
                  data-key={key}
                  aria-label={marked ? `${usualSentence(u, rotationDay.has(wd))} Marked.` : usualSentence(u, rotationDay.has(wd))}
                  aria-current={panel && openKey === key ? "true" : undefined}
                  onClick={(e) => open(u, e.currentTarget)}
                >
                  {word && <span className="op-cell__word">{word}</span>}
                  {marked && <span className="op-cell__mark">Marked</span>}
                </button>
              );
            })}
          </Row>
        ))}
      </div>
    </>
  );
}

function Row({ row, children }: { row: number; children: ReactNode }) {
  return (
    <>
      <span className="op-grid__time">{clockLabel(row)}</span>
      {children}
    </>
  );
}
