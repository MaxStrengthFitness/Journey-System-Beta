import { studioTodayKey } from "../../lib/studio-time";
import type { Trainer } from "../../types";
import { timeLabel } from "./check";
import { NO_BLOCKS, awayLabel, blocksLabel, daysOf, teamWeekSentence } from "./present";
import { uidOf } from "./team";
import { useStandingWeek } from "./useStandingWeeks";
import { upcomingAway } from "./week";
import "./standing-week.css";

/**
 * A COLLEAGUE'S STANDING WEEK, READ ONLY (voice review follow-up, Sep 27
 * 2026). AJ: "Trainers can see the whole studios schedule ... schedules are
 * open to all." On a colleague's profile, at the studio the iPad is in: their
 * AGREED week (when they take clients, and their regulars) and any days away
 * that haven't ended. A proposal nobody has agreed yet is theirs and their
 * leader's, so it reads "No agreed week yet"; the week's note is for the
 * leader, so it isn't shown. Nothing here is editable, and nothing ranks
 * anyone.
 *
 * The rules already let the studio's people read the weeks (firestore.rules,
 * standingWeeks). Styled as one of the profile's own cards.
 */

export interface ColleagueStandingWeekProps {
  /** The colleague whose profile this is. */
  trainer: Pick<Trainer, "id" | "fullName"> & Partial<Pick<Trainer, "authUid">>;
  studioId: string;
  studioName: string;
  tz?: string;
}

export function ColleagueStandingWeek({ trainer, studioId, studioName, tz }: ColleagueStandingWeekProps) {
  const { doc, loading, error } = useStandingWeek(studioId, uidOf(trainer));
  const today = studioTodayKey(new Date(), tz);
  const name = trainer.fullName?.trim() || "This trainer";
  const first = name.split(/\s+/)[0] || name;
  const week = doc?.final ?? null;
  const days = week ? daysOf(week).filter((d) => d.hours.length > 0 || d.regulars.length > 0) : [];
  const away = upcomingAway(doc?.away, today);

  return (
    <section className="tp-card" aria-labelledby="colleague-standing-week" data-testid="colleague-standing-week">
      <div className="tp-card__head">
        <h2 className="tp-card__title" id="colleague-standing-week">
          Standing week
        </h2>
        <span className="tp-card__count">{studioName}</span>
      </div>
      <div className="tp-card__body">
        {loading ? (
          <p className="stw-hint">Reading {first}'s week…</p>
        ) : error ? (
          <p className="stw-hint" role="status">
            {error}
          </p>
        ) : (
          <>
            {week ? (
              <>
                <p className="stw-status">{teamWeekSentence(doc ? { ...doc, proposed: doc.final } : null, name, tz)}</p>
                {days.length === 0 ? (
                  <p className="stw-hint">An empty week.</p>
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
                                  {timeLabel(r.start)} · {r.clientName || "A client"}
                                </li>
                              ))}
                            </ul>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            ) : (
              <p className="stw-status">No agreed week yet.</p>
            )}
            {away.length > 0 && (
              <div className="stw-away">
                <h3 className="stw-away__head">Away</h3>
                <ul className="stw-away__list" aria-label={`${first}'s dates away`}>
                  {away.map((r) => (
                    <li key={r.id} className="stw-away__range">
                      <span className="stw-away__when">{awayLabel(r, tz)}</span>
                      {r.note && <span className="stw-away__note">{r.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
