import { useState } from "react";
import type { TeamWeekRow } from "../../standing-week/team";
import { timeLabel } from "../../standing-week/check";
import { EMPTY_WEEK, NO_AGREED_WEEK, NO_BLOCKS, awayLabel, blocksLabel, daysOf, teamWeekSentence } from "../../standing-week/present";
import { upcomingAway } from "../../standing-week/week";
import { useOpenings } from "./context";
import { HIDE_REGULARS, READING_WEEKS, SHOW_REGULARS, nobodyHereSentence } from "../present";
import type { OpeningsData } from "./useOpeningsData";
import "../../standing-week/standing-week.css";
import "../openings.css";

/**
 * WHO'S USUALLY IN (Openings round, Sep 27 2026): everyone who works at the
 * studio, in name order, each with their AGREED standing week, read only.
 * AJ: "Trainers can see the whole studios schedule ... schedules are open to
 * all." A colleague's profile can't be opened today, so the read-only
 * ColleagueStandingWeek card had nowhere to be seen; this is where
 * colleagues' weeks become reachable.
 *
 * It is ColleagueStandingWeek's pure parts (`daysOf`, `blocksLabel`,
 * `teamWeekSentence`, `upcomingAway`, `awayLabel`) drawn from the ONE read of
 * the studio's standing weeks the section already holds, rather than the card
 * itself, which reads one trainer's week per card: a list of them would be a
 * read per person.
 *
 * As on that card: the agreed week only (a proposal nobody has agreed is the
 * trainer's and their leader's, so it reads "No agreed week yet"), the
 * week's note stays the leader's, and the days away that haven't ended are
 * shown. Nothing is ranked and nothing is counted beside a name. Openings'
 * one rule for clients holds here too: a regular shows as "a regular" until
 * a tap shows the names.
 */
export function WhosInPart() {
  const data = useOpenings();
  if (data.weeks.error) return <p className="op__lead">{data.weeks.error}</p>;
  if (data.weeks.loading) return <p className="op__lead">{READING_WEEKS}</p>;
  if (data.team.length === 0) return <p className="op__lead">{nobodyHereSentence(data.studioName)}</p>;
  return (
    <ul className="op-people" aria-label={`Who works at ${data.studioName}`}>
      {data.team.map((row) => (
        <PersonWeek key={row.uid} row={row} data={data} />
      ))}
    </ul>
  );
}

function PersonWeek({ row, data }: { row: TeamWeekRow; data: OpeningsData }) {
  const [names, setNames] = useState(false);
  const doc = row.doc;
  const week = doc?.final ?? null;
  const first = row.name.trim().split(/\s+/)[0] || row.name;
  const days = week ? daysOf(week).filter((d) => d.hours.length > 0 || d.regulars.length > 0) : [];
  const regulars = days.some((d) => d.regulars.length > 0);
  const away = upcomingAway(doc?.away, data.today);
  const headId = `op-person-${row.uid}`;

  return (
    <li className="op-person" aria-labelledby={headId} data-testid="person-week">
      <div className="op-person__head">
        <h3 className="op-person__name" id={headId}>
          {row.name}
        </h3>
      </div>
      <div className="op-person__body">
        {week ? (
          <>
            {/* The agreed week, never the proposal waiting on a leader. */}
            <p className="stw-status">{teamWeekSentence(doc ? { ...doc, proposed: doc.final } : null, row.name, data.tz)}</p>
            {days.length === 0 ? (
              <p className="stw-hint">{EMPTY_WEEK}</p>
            ) : (
              <dl className="stw-read" aria-label={`${first}'s agreed week`}>
                {days.map((d) => (
                  <div key={d.weekday} className="stw-read__day">
                    <dt className="stw-read__name">{d.name}</dt>
                    <dd className="stw-read__body">
                      <span className="stw-read__hours">{d.hours.length > 0 ? blocksLabel(d.hours) : NO_BLOCKS}</span>
                      {d.regulars.length > 0 && (
                        <ul className="stw-read__regulars" aria-label={`Regulars on ${d.name}`}>
                          {d.regulars.map((r) => (
                            <li key={r.id}>
                              {timeLabel(r.start)} · {names ? r.clientName || "A client" : "a regular"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {regulars && (
              <button type="button" className="op-btn" aria-expanded={names} onClick={() => setNames((n) => !n)}>
                {names ? HIDE_REGULARS : SHOW_REGULARS}
              </button>
            )}
          </>
        ) : (
          <p className="stw-status">{NO_AGREED_WEEK}</p>
        )}
        {away.length > 0 && (
          <div className="stw-away">
            <h4 className="stw-away__head">Away</h4>
            <ul className="stw-away__list" aria-label={`${first}'s dates away`}>
              {away.map((r) => (
                <li key={r.id} className="stw-away__range">
                  <span className="stw-away__when">{awayLabel(r, data.tz)}</span>
                  {r.note && <span className="stw-away__note">{r.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
}
