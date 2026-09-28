import { useMemo } from "react";
import { offers, type Offer } from "../offer";
import { NO_OFFERS, OFFER_FOOT, SAFE_TO_SHOW, notEnoughSentence, offerSentence, offerWho, summaryStateSentence, thisWeekSentence } from "../present";
import { firstWordsOn } from "../usual";
import { useOpenings } from "./context";
import { useComingWeeks, useNextSevenDays } from "./useNextSevenDays";
import type { OpeningsData } from "./useOpeningsData";
import { WhoseChips, useWhoseTimes } from "./WhoseChips";
import "../openings.css";

/**
 * A NEW REGULAR TIME (Openings round, phase 5): AJ's "we always have that
 * 10:30 available on Tuesdays. So if you wanted to, we could just take that
 * for good for you."
 *
 * The times that usually have room (or are marked so), checked against
 * today by the core (`offers`): no agreed regular there, free on the next 3
 * coming weeks on file, and this week beside it. The coming weeks are read
 * once, when this part opens, and only when the month was read in full today
 * (`useComingWeeks`); otherwise each time says it can't check them.
 *
 * It names no client, so it is safe to turn the iPad to one. Every offer ends
 * "Check it in Mindbody before you promise it. Journey doesn't book."
 */
export function NewRegularPart() {
  const data = useOpenings();
  const week = useNextSevenDays(data, { bookedAgain: false });
  const monthRead = week.monthRead;
  const coming = useComingWeeks(data, monthRead === true);
  const whose = useWhoseTimes(data);

  const list = useMemo<Offer[]>(() => {
    if (data.summary.state !== "ok" || !data.usual) return [];
    return offers({
      today: data.today,
      now: data.now,
      tz: data.tz,
      usual: data.usual.times,
      marks: data.marks.byTime,
      docs: data.weeks.docs,
      trainers: data.refs,
      worksHere: data.worksHere,
      forTrainer: whose.narrowed,
      thisWeek: { read: week.read, bookings: week.input.bookings },
      // While the sync lease is still coming, the coming weeks are "checking", not "can't check".
      coming: monthRead === null ? null : coming,
      monthRead: monthRead !== false,
    });
  }, [data, whose.narrowed, week.read, week.input.bookings, monthRead, coming]);

  return (
    <>
      <p className="op__safe">{SAFE_TO_SHOW}</p>
      <Body data={data} list={list} whose={whose} />
    </>
  );
}

function Body({ data, list, whose }: { data: OpeningsData; list: Offer[]; whose: ReturnType<typeof useWhoseTimes> }) {
  if (!data.connected) return <p className="op__lead">{summaryStateSentence("unlinked", data.studioName)}</p>;
  if (data.weeks.error) return <p className="op__lead">{data.weeks.error}</p>;
  if (data.weeks.loading || data.summary.state === "loading") return <p className="op__lead">Reading the usual week…</p>;
  if (data.summary.state === "none") return <p className="op__lead">{summaryStateSentence("never", data.studioName)}</p>;
  if (data.summary.state === "unreadable" || !data.usual) return <p className="op__lead">{summaryStateSentence("unreadable", data.studioName)}</p>;

  const usual = data.usual;
  const empty =
    list.length > 0
      ? null
      : !usual.enough
        ? notEnoughSentence(usual.weeksCounted, usual.since, firstWordsOn(data.summary.summary.builtAt, usual.weeksCounted, data.tz), data.tz)
        : NO_OFFERS;

  return (
    <>
      <WhoseChips whose={whose} />
      {empty ? (
        <p className="op__lead" data-testid="no-offers">
          {empty}
        </p>
      ) : (
        <ul className="op-offers" aria-label="Times to offer for good">
          {list.map((o) => {
            const thisWeek = thisWeekSentence(o, data.tz);
            return (
              <li key={o.key} className="op-offer">
                <p className="op-offer__text">{offerSentence(o, data.tz)}</p>
                {thisWeek && <p className="op-offer__meta">{thisWeek}</p>}
                <p className="op-offer__meta">{offerWho(o, data.names, data.viewer)}</p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="op__foot" data-testid="offer-foot">
        {OFFER_FOOT}
      </p>
    </>
  );
}
