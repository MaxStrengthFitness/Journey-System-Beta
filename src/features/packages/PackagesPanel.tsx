/**
 * PACKAGES — the client's view: what the trainer turns the iPad to show.
 *
 * Nothing a trainer reads for themselves is on it (the trainer notes are a
 * separate view, PackagesTrainerNotes, never on screen at the same time). No
 * dialog here either, so the consultation's packages step can mount this
 * panel as it is; PackagesSheet is the full-screen host the post-session
 * screen opens.
 *
 * Top to bottom, the way the Academy's price talk goes: the one line about
 * the training, the lengths side by side (months, name, sessions, price), the
 * chosen length in full (price, the bill, the whole, the dots), how every 4
 * weeks steps down, then the reassurance: the guarantee, your week, life
 * happens, and what happens after the last payment. Landscape puts the
 * reassurance in a second column (packages.css).
 */

import { useId, type Dispatch } from "react";
import { Minus, Plus } from "lucide-react";
import { BigNumber, Btn, Card, Chip, Source } from "../client-codex/kit/primitives";
import { Pick } from "../client-codex/kit/fields";
import {
  afterLastPayment,
  dotsCaption,
  GUARANTEE_LINES,
  GUARANTEE_TITLE,
  lede,
  lengthFacts,
  lifeHappensSentence,
  LOWERS_EVERY_PAYMENT,
  MISSION_QUOTE,
  MISSION_SOURCE,
  monthsText,
  monthsWord,
  payLines,
  SESSION_USE_RULE,
  timelineMark,
  weekPrompt,
} from "./package-copy";
import {
  dotGroups,
  figuresFor,
  formatMoney,
  frequencyOf,
  lowersEveryPayment,
  MAX_WEEKS_AWAY,
  priceAs,
  recommendationLabel,
  steps,
  stretch,
  type Lineup,
} from "./package-table";
import type { PackageTier } from "../renewals/types";
import type { PackagesAction, PackagesView } from "./packages-view";
import "./packages.css";

export interface PackagesPanelProps {
  lineup: Lineup;
  view: PackagesView;
  dispatch: Dispatch<PackagesAction>;
  studioName: string | null;
  clientFirstName: string | null;
  trainerFullName: string | null;
  /** Weekdays this client is booked on soon (0 = Sunday), facts only. */
  bookedWeekdays: readonly number[];
}

const WEEK: ReadonlyArray<{ day: number; short: string }> = [
  { day: 1, short: "Mon" },
  { day: 2, short: "Tue" },
  { day: 3, short: "Wed" },
  { day: 4, short: "Thu" },
  { day: 5, short: "Fri" },
  { day: 6, short: "Sat" },
  { day: 0, short: "Sun" },
];

/**
 * What stands in for a figure the table cannot give: a package with no
 * price at all, or a total left off because its payments and per-session
 * price don't multiply out.
 */
function missingWords(t: PackageTier): string {
  return figuresFor(t).priceMissing ? "Price not set yet" : "Total not shown";
}

/** The price a length shows in its column, in the unit the trainer chose. */
function columnPrice(t: PackageTier, view: PackagesView): string {
  const p = priceAs(figuresFor(t), view.showAs, view.pay);
  return p.amount === null ? missingWords(t) : `${formatMoney(p.amount)} ${p.shortUnit}`;
}

function LengthPick({
  tier,
  view,
  dispatch,
  recLabel,
  shownKey,
}: {
  tier: PackageTier;
  view: PackagesView;
  dispatch: Dispatch<PackagesAction>;
  recLabel: string;
  /** The length the card below describes: the one pressed, always. */
  shownKey: string | null;
}) {
  return (
    <Pick
      className="pk-length"
      pressed={shownKey === tier.key}
      onClick={() => dispatch({ type: "select", key: tier.key })}
    >
      <span className="pk-length__months">
        {tier.months}
        <span className="pk-length__unit">{monthsWord(tier.months)}</span>
      </span>
      <span className="pk-length__name">{tier.label}</span>
      <span className="pk-length__sessions">{lengthFacts(tier)}</span>
      <span className="pk-length__price">{columnPrice(tier, view)}</span>
      {view.recommendedKey === tier.key ? <Chip tone="live">{recLabel}</Chip> : null}
    </Pick>
  );
}

export function PackagesPanel({
  lineup: l,
  view,
  dispatch,
  studioName,
  clientFirstName,
  trainerFullName,
  bookedWeekdays,
}: PackagesPanelProps) {
  const lengthsId = useId();
  const alsoId = useId();
  const awayId = useId();
  const recLabel = recommendationLabel(trainerFullName);

  const extra: PackageTier[] = [...(view.showOnce ? l.once : []), ...(view.showOther ? l.other : [])];
  const intro = lede(l, extra.length > 0);
  const all = [...l.headline, ...extra];
  // The length the card describes. A selection that is no longer on the
  // screen (a row the trainer hid, a table that changed) falls back to the
  // recommendation, then the first length, and the pressed column follows,
  // so the columns and the card always name the same package.
  const selected =
    all.find((t) => t.key === view.selectedKey) ??
    all.find((t) => t.key === view.recommendedKey) ??
    l.headline[0] ??
    null;
  const shownKey = selected?.key ?? null;
  const twiceWeek = l.headlineIsTwiceAWeek && !!selected && frequencyOf(selected) === "twice";
  const f = selected ? figuresFor(selected) : null;
  const big = f ? priceAs(f, view.showAs, view.pay) : null;
  const dots = selected ? dotGroups(selected) : null;
  const caption = selected && dots ? dotsCaption(selected, dots.perGroup) : null;
  const stepRows = steps(l.headline);
  const lowers = lowersEveryPayment(l.headline);
  const life = selected ? stretch(selected, view.weeksAway) : null;
  const booked = new Set(bookedWeekdays);

  return (
    <div className="cx-kit pk-panel">
      <div className="pk-inner">
        <div className="pk-col">
          <div className="pk-lede">
            <p className="cx-lede">{intro.title}</p>
            <p className="pk-text pk-text--quiet">{intro.sub}</p>
          </div>

          <section className="pk-col" aria-labelledby={lengthsId}>
            <h3 className="cx-eyebrow" id={lengthsId}>
              How long
            </h3>
            <div className="pk-lengths" role="group" aria-labelledby={lengthsId} data-count={l.headline.length}>
              {l.headline.map((t) => (
                <LengthPick key={t.key} tier={t} view={view} dispatch={dispatch} recLabel={recLabel} shownKey={shownKey} />
              ))}
            </div>
            {extra.length > 0 ? (
              <>
                <h3 className="cx-eyebrow" id={alsoId}>
                  {studioName ? `Also at ${studioName}` : "Also here"}
                </h3>
                <div className="pk-lengths" role="group" aria-labelledby={alsoId} data-count={extra.length}>
                  {extra.map((t) => (
                    <LengthPick key={t.key} tier={t} view={view} dispatch={dispatch} recLabel={recLabel} shownKey={shownKey} />
                  ))}
                </div>
              </>
            ) : null}
          </section>

          {selected && f && big ? (
            <Card eyebrow={`${selected.label} · ${monthsText(selected.months)}`} className="pk-selected">
              <div className="pk-price" data-testid="pk-big-price">
                {big.amount === null ? (
                  <span className="pk-text">{missingWords(selected)}</span>
                ) : (
                  <>
                    <BigNumber>{formatMoney(big.amount)}</BigNumber>
                    <span className="pk-price__unit">{big.unit}</span>
                  </>
                )}
                {view.recommendedKey === selected.key ? <Chip tone="live">{recLabel}</Chip> : null}
              </div>
              <ul className="pk-lines">
                {payLines(f, view.pay).map((line) => (
                  <li key={line} className="pk-text">
                    {line}
                  </li>
                ))}
              </ul>
              {dots && caption ? (
                <>
                  <div className="pk-dots" role="img" aria-label={caption}>
                    {Array.from({ length: dots.groups }, (_, g) => (
                      <span key={g} className="pk-dots__group">
                        {Array.from({ length: dots.perGroup }, (_, i) => (
                          <span key={i} className="pk-dot" />
                        ))}
                      </span>
                    ))}
                  </div>
                  <Source>{caption}</Source>
                </>
              ) : (
                <Source>{`${selected.sessions} sessions over ${selected.payments} payments.`}</Source>
              )}
            </Card>
          ) : null}

          {view.pay === "monthly" && stepRows.length > 1 ? (
            <Card eyebrow="Every 4 weeks">
              <ul className="pk-steps">
                {stepRows.map((r) => (
                  <li key={r.key} className="pk-step" data-on={r.key === selected?.key ? "" : undefined}>
                    <span className="pk-step__amount">{r.amount === null ? "Not set" : formatMoney(r.amount)}</span>
                    <span
                      className="pk-step__bar"
                      aria-hidden="true"
                      style={{ height: `${Math.round(24 + 96 * r.share)}px` }}
                    />
                    <span className="pk-step__months">{monthsText(r.months)}</span>
                  </li>
                ))}
              </ul>
              {lowers ? <p className="pk-text">{LOWERS_EVERY_PAYMENT}</p> : null}
            </Card>
          ) : null}
        </div>

        <div className="pk-col">
          <Card eyebrow={GUARANTEE_TITLE}>
            <ol className="pk-guarantee">
              {GUARANTEE_LINES.map((g) => (
                <li key={g.lead} className="pk-text">
                  <span>
                    <b>{g.lead}</b> {g.rest}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          {twiceWeek ? (
            <Card eyebrow="Your week">
              <p className="pk-text">{`“${MISSION_QUOTE}”`}</p>
              <Source>{MISSION_SOURCE}</Source>
              <p className="pk-text pk-text--quiet">{weekPrompt(clientFirstName)}</p>
              <div className="pk-week" role="group" aria-label="Days of the week">
                {WEEK.map(({ day, short }) => {
                  const isBooked = booked.has(day);
                  return (
                    <Pick
                      key={day}
                      pressed={isBooked || view.pickedDays.includes(day)}
                      hint={isBooked ? "Booked" : undefined}
                      disabled={isBooked}
                      onClick={() => dispatch({ type: "day", day })}
                    >
                      {short}
                    </Pick>
                  );
                })}
              </div>
            </Card>
          ) : null}

          {selected && life ? (
            <Card eyebrow="Life happens">
              <p className="pk-text">{SESSION_USE_RULE}</p>
              <div className="pk-stepper" role="group" aria-labelledby={awayId}>
                <span className="pk-stepper__label" id={awayId}>
                  Weeks away
                </span>
                <Btn
                  icon={Minus}
                  aria-label="One week fewer away"
                  disabled={view.weeksAway <= 0}
                  onClick={() => dispatch({ type: "away", delta: -1 })}
                />
                <output className="pk-stepper__value">{`${view.weeksAway} ${view.weeksAway === 1 ? "week" : "weeks"}`}</output>
                <Btn
                  icon={Plus}
                  aria-label="One more week away"
                  disabled={view.weeksAway >= MAX_WEEKS_AWAY}
                  onClick={() => dispatch({ type: "away", delta: 1 })}
                />
              </div>
              <Timeline weeks={life.totalWeeks} away={life.awayWeeks} billingWeeks={life.billingWeeks} mark={timelineMark(selected, life.billingWeeks)} />
              <Source>Each stripe is a week. Hatched stripes are weeks away.</Source>
              <p className="pk-text" aria-live="polite" data-testid="pk-life-sentence">
                {lifeHappensSentence(life, selected, f?.visitsPerWeek ?? null)}
              </p>
            </Card>
          ) : null}

          {selected ? (
            <Card eyebrow="After your last payment">
              <ul className="pk-lines">
                {afterLastPayment(selected, studioName).map((line) => (
                  <li key={line} className="pk-text">
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The weeks as stripes, away weeks hatched, the last payment marked. Decorative: the sentence says it. */
function Timeline({ weeks, away, billingWeeks, mark }: { weeks: number; away: number[]; billingWeeks: number; mark: string }) {
  const awaySet = new Set(away);
  const pct = weeks > 0 ? Math.min(100, (100 * billingWeeks) / weeks) : 100;
  return (
    <div className="pk-timeline" aria-hidden="true">
      <div className="pk-timeline__bar">
        {Array.from({ length: weeks }, (_, w) => (
          <i key={w} data-away={awaySet.has(w) ? "" : undefined} />
        ))}
      </div>
      <span className="pk-timeline__tick" data-side={pct > 55 ? "left" : "right"} style={{ left: `${pct}%` }}>
        <span className="pk-timeline__label">{mark}</span>
      </span>
    </div>
  );
}
