import { useMemo, useState } from "react";
import { studioTodayKey } from "../../lib/studio-time";
import type { Studio } from "../../types";
import { sessionMinutesOf } from "../admin/hours/hours";
import { useYourWeek } from "./useYourWeek";
import {
  CANT_READ,
  COACHING_LOAD_DIFFERS,
  READING,
  TOO_MANY,
  cutoverLine,
  emptyWeekSentence,
  leftOutSentence,
  rangeLabel,
  sessionTimeSentence,
  spanDaySentence,
  spanTotalSentence,
  whatItCounts,
  yourWeek,
  yourWeekTitle,
  type WeekSummary,
} from "./your-week";

/**
 * MY PROFILE → YOUR WEEK (Openings round, phase 11, Sep 27 2026).
 *
 * The trainer's own profile only, at the studio the iPad is in: this week
 * and last week — clients trained, sessions, session time, and first session
 * to last each day. your-week.ts is the rule; useYourWeek the one read.
 *
 * Every state says what it knows: "Reading…", "Can't read the sessions just
 * now" (a failure, a refusal, or no connection — never zero), "Too many
 * sessions to count here", and a plain sentence when the server answered and
 * nothing is logged with you.
 */
export interface YourWeekProps {
  /** The trainer document id the sessions carry (`trainerId`). */
  trainerId: string;
  studioId: string;
  studioName: string;
  /** The studio's document: its session length and cutover date. */
  studio: Pick<Studio, "sessionMinutes" | "journeyCutoverDate"> | null;
  tz?: string;
}

export function YourWeek({ trainerId, studioId, studioName, studio, tz }: YourWeekProps) {
  const today = studioTodayKey(new Date(), tz);
  const read = useYourWeek({ studioId, trainerId, today, tz });
  const [whyOpen, setWhyOpen] = useState(false);
  const sessionMinutes = sessionMinutesOf(studio);

  const weeks = useMemo(
    () => (read.status === "ready" ? yourWeek(read.sessions, { today, trainerId, sessionMinutes }) : null),
    [read, today, trainerId, sessionMinutes],
  );
  const migrating = cutoverLine(studioName, studio?.journeyCutoverDate ?? null, today);

  return (
    <section className="tp-card" aria-labelledby="your-week-title" data-testid="your-week">
      <div className="tp-card__head">
        <h2 className="tp-card__title" id="your-week-title">
          {yourWeekTitle(studioName)}
        </h2>
        <span className="tp-card__count">This week and last</span>
      </div>

      <div className="tp-card__body">
        {read.status !== "ready" || !weeks ? (
          <p className="tp-yw__state" role="status" data-testid="your-week-state">
            {read.status === "loading" ? READING : read.status === "truncated" ? TOO_MANY : CANT_READ}
          </p>
        ) : (
          <div className="tp-yw">
            <WeekBlock label="This week" which="this" week={weeks.thisWeek} studioName={studioName} tz={tz} />
            <WeekBlock label="Last week" which="last" week={weeks.lastWeek} studioName={studioName} tz={tz} />
          </div>
        )}

        <div className="tp-yw__foot">
          {migrating && <p className="tp-yw__note">{migrating}</p>}
          <p className="tp-yw__note">{whatItCounts(studioName)}</p>
          <button
            type="button"
            className="tp-btn tp-btn--ghost"
            aria-expanded={whyOpen}
            aria-controls="your-week-why"
            onClick={() => setWhyOpen((v) => !v)}
          >
            Why this can differ from Coaching load
          </button>
          {whyOpen && (
            <p className="tp-yw__note" id="your-week-why">
              {COACHING_LOAD_DIFFERS}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function WeekBlock({
  label,
  which,
  week,
  studioName,
  tz,
}: {
  label: string;
  which: "this" | "last";
  week: WeekSummary;
  studioName: string;
  tz?: string;
}) {
  const leftOut = leftOutSentence(week.leftOut);
  return (
    <div className="tp-yw__week" data-testid={`your-week-${which}`}>
      <h3 className="tp-yw__heading">
        {label} <span className="tp-yw__range">{rangeLabel(week)}</span>
      </h3>

      {week.sessions === 0 ? (
        <p className="tp-yw__line">{emptyWeekSentence(which, studioName)}</p>
      ) : (
        <>
          <div className="tp-facts tp-yw__facts">
            <div className="tp-fact">
              <span className="tp-fact__k">Clients trained</span>
              <span className="tp-fact__v">{week.clients}</span>
            </div>
            <div className="tp-fact">
              <span className="tp-fact__k">Sessions</span>
              <span className="tp-fact__v">{week.sessions}</span>
            </div>
            <div className="tp-fact">
              <span className="tp-fact__k">Session time</span>
              <span className="tp-fact__v">{sessionTimeSentence(week)}</span>
            </div>
            <div className="tp-fact">
              <span className="tp-fact__k">First session to last</span>
              <span className="tp-fact__v">{week.days.length > 0 ? spanTotalSentence(week) : "No clock times"}</span>
            </div>
          </div>

          {week.days.length > 0 && (
            <ul className="tp-yw__days" aria-label={`${label}, first session to last, by day`}>
              {week.days.map((d) => (
                <li key={d.day}>{spanDaySentence(d, tz)}</li>
              ))}
            </ul>
          )}
          {leftOut && <p className="tp-yw__note">{leftOut}</p>}
        </>
      )}
    </div>
  );
}
