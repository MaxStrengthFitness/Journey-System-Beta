import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { linesFor, type NextDaysLine } from "../next-days";
import { CHECK_IN_MINDBODY, READING_WEEKS, lineDetail, lineSentence, nextDaysStateSentence, nothingOpenedWithSentence } from "../present";
import type { BackFrom } from "../back-from";
import { useOpenings } from "./context";
import { lineKey, useNextSevenDays } from "./useNextSevenDays";
import type { OpeningsData } from "./useOpeningsData";
import { WhoseChips, useWhoseTimes } from "./WhoseChips";
import "../openings.css";

/**
 * NEXT 7 DAYS (Openings round, phase 5): what opened up, today and the six
 * studio days after it, one line per day and half-hour still ahead, in time
 * order. A line is a regular who isn't booked (the standing week check's
 * free slots, which Team listed until this round), a cancellation nobody
 * has booked into since, or a usually-full time with room (`nextDays`).
 *
 * Read live, the way Team read it: only the server's answer is one. While
 * it loads, or when it failed, came only from this iPad's cache, or the iPad
 * is offline, the whole list is one sentence: "Can't tell yet." A studio
 * whose Mindbody isn't linked says so and lists nothing; with no week agreed
 * it lists cancellations only, and says so.
 *
 * The chips narrow the lines, never the sentence about the studio: when a
 * chip alone empties the list ("With you" is where a trainer with an agreed
 * week starts), it says "Nothing has opened up with you" and that Anyone
 * shows the rest, never "Nothing has opened up in the next 7 days" while
 * Anyone has lines (the section's review, Sep 27 2026).
 *
 * A line names no client. A tap on it shows who, and what happened (the
 * client standing at the iPad never sees another client's name unasked),
 * then "Check it in Mindbody before you promise it." A line about one client
 * carries "booked again from" (one batched read, useNextSevenDays).
 */
export function NextDaysPart() {
  const data = useOpenings();
  const week = useNextSevenDays(data);
  const whose = useWhoseTimes(data);

  if (data.weeks.error) return <p className="op__lead">{data.weeks.error}</p>;
  if (data.weeks.loading) return <p className="op__lead">{READING_WEEKS}</p>;

  const lines = linesFor(week.next.lines, whose.narrowed);
  // The state is the whole studio's, so it is chosen from the unnarrowed list:
  // "Nothing has opened up in the next 7 days" only when nothing has.
  const state = nextDaysStateSentence(week.next, data.studioName);
  const ready = week.next.state === "ready";
  const chipEmptied = ready && whose.narrowed !== null && lines.length === 0 && week.next.lines.length > 0;

  return (
    <>
      {ready && <WhoseChips whose={whose} />}
      {state && (
        <p className="op__lead" data-testid="next-state">
          {state}
        </p>
      )}
      {chipEmptied && whose.narrowed && (
        <p className="op__lead" data-testid="next-narrowed">
          {nothingOpenedWithSentence(whose.narrowed, data.names, data.viewer)}
        </p>
      )}
      {lines.length > 0 && (
        <ul className="op-lines" aria-label="What opened up in the next 7 days">
          {lines.map((line) => (
            <NextLine key={lineKey(line)} line={line} data={data} backFrom={week.backFrom.get(lineKey(line)) ?? null} />
          ))}
        </ul>
      )}
    </>
  );
}

function NextLine({ line, data, backFrom }: { line: NextDaysLine; data: OpeningsData; backFrom: BackFrom | null }) {
  const [open, setOpen] = useState(false);
  const detail = open ? lineDetail(line, data.names, data.viewer, data.tz) : [];
  return (
    <li className="op-lines__item">
      <button type="button" className="op-line" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="op-line__text">{lineSentence(line, data.names, data.viewer, data.tz, backFrom)}</span>
        <ChevronDown className="op-line__chev" size={18} aria-hidden />
      </button>
      {open && (
        <div className="op-line__detail" data-testid="line-detail">
          {detail.length > 0 && (
            <ul className="op-line__who" aria-label="Who">
              {detail.map((d) => (
                <li key={d} className="op-line__text">
                  {d}
                </li>
              ))}
            </ul>
          )}
          <p className="op__foot">{CHECK_IN_MINDBODY}</p>
        </div>
      )}
    </li>
  );
}
