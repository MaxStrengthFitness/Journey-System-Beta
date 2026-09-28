import { useMemo } from "react";
import { offers, type Offer } from "../offer";
import { NO_OFFERS, OFFER_FOOT, SAFE_TO_SHOW, notEnoughSentence, offerSentence, offerWho, summaryStateSentence, thisWeekSentence } from "../present";
import { firstWordsOn } from "../usual";
import { useOpenings } from "./context";
import { useComingWeeks, useNextSevenDays } from "./useNextSevenDays";
import type { OpeningsData } from "./useOpeningsData";
import { WhoseChips, useWhoseTimes } from "./WhoseChips";
import { MARKS_UNKNOWN_OFFERS, READING_USUAL_WEEK, noOffersWithSentence } from "./words";
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
 *
 * NOTHING IS OFFERED UNTIL THE MARKS ARE READ. A time a colleague marked
 * Always full is never offered (marks.ts `offerable`), and the core can only
 * leave out a mark it is given. So while the marks load the part says it is
 * reading, and when they can't be read (refused, offline, or only this
 * iPad's cache answered) it says it can't tell, rather than offering as if
 * nothing were marked (the section's review, Sep 27 2026).
 *
 * A chip that narrows the list to nothing, while Anyone still has times to
 * offer, says so by the chip's name: "No usual times with room right now" is
 * only ever said about the whole studio.
 */
export function NewRegularPart() {
  const data = useOpenings();
  const week = useNextSevenDays(data, { bookedAgain: false });
  const monthRead = week.monthRead;
  const coming = useComingWeeks(data, monthRead === true);
  const whose = useWhoseTimes(data);

  // The offers for whose times the chips show and, when a chip narrows them
  // to nothing, whether Anyone still has some (then the sentence names the chip).
  const { list, anyoneHas } = useMemo<{ list: Offer[]; anyoneHas: boolean }>(() => {
    const usual = data.usual;
    if (data.summary.state !== "ok" || !usual || data.marks.read !== "ready") return { list: [], anyoneHas: false };
    const offersFor = (forTrainer: string | null) =>
      offers({
        today: data.today,
        now: data.now,
        tz: data.tz,
        usual: usual.times,
        marks: data.marks.byTime,
        docs: data.weeks.docs,
        trainers: data.refs,
        worksHere: data.worksHere,
        forTrainer,
        thisWeek: { read: week.read, bookings: week.input.bookings },
        // While the sync lease is still coming, the coming weeks are "checking", not "can't check".
        coming: monthRead === null ? null : coming,
        monthRead: monthRead !== false,
      });
    const narrowed = offersFor(whose.narrowed);
    return { list: narrowed, anyoneHas: narrowed.length === 0 && whose.narrowed !== null && offersFor(null).length > 0 };
  }, [data, whose.narrowed, week.read, week.input.bookings, monthRead, coming]);

  return (
    <>
      <p className="op__safe">{SAFE_TO_SHOW}</p>
      <Body data={data} list={list} anyoneHas={anyoneHas} whose={whose} />
    </>
  );
}

function Body({
  data,
  list,
  anyoneHas,
  whose,
}: {
  data: OpeningsData;
  list: Offer[];
  anyoneHas: boolean;
  whose: ReturnType<typeof useWhoseTimes>;
}) {
  if (!data.connected) return <p className="op__lead">{summaryStateSentence("unlinked", data.studioName)}</p>;
  if (data.weeks.error) return <p className="op__lead">{data.weeks.error}</p>;
  if (data.weeks.loading || data.summary.state === "loading") return <p className="op__lead">{READING_USUAL_WEEK}</p>;
  if (data.summary.state === "none") return <p className="op__lead">{summaryStateSentence("never", data.studioName)}</p>;
  if (data.summary.state === "unreadable" || !data.usual) return <p className="op__lead">{summaryStateSentence("unreadable", data.studioName)}</p>;
  // A mark can take a time off the list, so nothing is offered off marks not yet read.
  if (data.marks.read === "loading") return <p className="op__lead">{READING_USUAL_WEEK}</p>;
  if (data.marks.read !== "ready") {
    return (
      <>
        <p className="op__lead" data-testid="marks-unknown">
          {MARKS_UNKNOWN_OFFERS}
        </p>
        <p className="op__foot" data-testid="offer-foot">
          {OFFER_FOOT}
        </p>
      </>
    );
  }

  const usual = data.usual;
  const empty =
    list.length > 0
      ? null
      : !usual.enough
        ? notEnoughSentence(usual.weeksCounted, usual.since, firstWordsOn(data.summary.summary.builtAt, usual.weeksCounted, data.tz), data.tz)
        : anyoneHas && whose.narrowed
          ? noOffersWithSentence(whose.narrowed, data.names, data.viewer)
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
