import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import {
  awayEventFor,
  describeRange,
  describeSpan,
  monthName,
  parseKey,
  perWeekLabel,
  shortDate,
  type CadenceStats,
  type TimelineEvent,
} from "./model";

/**
 * Four numbers, each answering one question a trainer asks about attendance:
 *
 *   VISITS          how often lately, a week    (last 12 weeks, vs overall)
 *   TYPICAL GAP     how regular                 (middle half of the gaps)
 *   BREAKS          how often they drop off     (gaps of two weeks or more)
 *   LONGEST BREAK   the worst one, with dates
 *
 * Every figure is a count or a span a person could check by hand against the
 * calendar below it — no scores, no grades.
 */

function Stat({
  label,
  value,
  unit,
  sub,
  alert,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  alert?: boolean;
}) {
  return (
    <div className={`hist-stat ${alert ? "hist-stat--alert" : ""}`}>
      <span className="hist-stat__label">{label}</span>
      <span className="hist-stat__value">
        <b>{value}</b>
        {unit ? <span>{unit}</span> : null}
      </span>
      <span className="hist-stat__sub" title={sub}>
        {sub}
      </span>
    </div>
  );
}

/** "5 weeks" → ["5", "weeks"], so the number can be big and the unit small. */
function splitSpan(days: number): [string, string] {
  const [n, ...rest] = describeSpan(days).split(" ");
  return [n, rest.join(" ")];
}

function monthYear(key: string): string {
  const { year, month } = parseKey(key);
  return `${monthName(month).slice(0, 3)} ${year}`;
}

export interface HistoryStatsProps {
  cadence: CadenceStats;
  currentYear: number;
}

export const HistoryStats = memo(function HistoryStats({ cadence, currentYear }: HistoryStatsProps) {
  const c = cadence;
  const since = c.first ? monthYear(c.first) : null;

  const range = c.typicalGapRange;
  const gapValue = range ? (range[0] === range[1] ? String(range[0]) : `${range[0]}–${range[1]}`) : "—";
  const gapUnit = range ? (range[0] === 1 && range[1] === 1 ? "day" : "days") : undefined;

  const longest = c.longestBreak;
  const [longValue, longUnit] = longest ? splitSpan(longest.days) : ["—", ""];

  return (
    <div className="hist-stats">
      <Stat
        label="Visits"
        value={perWeekLabel(c.perWeekRecent)}
        unit={c.perWeekRecent !== null ? "a week" : undefined}
        sub={
          c.perWeekRecent === null
            ? "no visits yet"
            : c.recentCoversAll
              ? // Under twelve weeks of history, "last 12 wks" would claim a window the client has not had.
                `since ${shortDate(c.first!, currentYear)}`
              : `last 12 wks · ${perWeekLabel(c.perWeekOverall)} overall`
        }
      />
      <Stat label="Typical gap" value={gapValue} unit={gapUnit} sub="between visits" />
      <Stat
        label="Breaks of 2+ weeks"
        value={String(c.breaks.length)}
        sub={since ? `since ${since}` : "no visits yet"}
      />
      <Stat
        label="Longest break"
        value={longValue}
        unit={longUnit}
        alert={Boolean(longest?.ongoing)}
        sub={
          !longest
            ? "none on record"
            : longest.ongoing
              ? `still going · since ${shortDate(longest.from, currentYear)}`
              : describeRange(longest.from, longest.to, currentYear, true)
        }
      />
    </div>
  );
});

export const OnBreakNotice = memo(function OnBreakNotice({
  cadence,
  events,
  currentYear,
}: HistoryStatsProps & { events: TimelineEvent[] }) {
  const open = cadence.breaks.find((b) => b.ongoing);
  if (!cadence.onBreak || !open) return null;
  const away = awayEventFor(open, events);
  return (
    <div className="hist-notice" role="status">
      <AlertTriangle size={16} strokeWidth={2.6} aria-hidden />
      <span>
        <b>No visit in {describeSpan(open.days)}</b> — last visit {shortDate(open.from, currentYear)}
      </span>
      {away && <span className="hist-tag hist-tag--away hist-notice__away">{away.title}</span>}
    </div>
  );
});

export function HistoryLegend() {
  return (
    <div className="hist-legend" aria-label="Legend">
      <span className="hist-legend__item">
        <i className="hist-swatch hist-swatch--visit" aria-hidden /> Visit
      </span>
      <span className="hist-legend__item">
        <i className="hist-swatch hist-swatch--break" aria-hidden /> Break (2+ weeks)
      </span>
      <span className="hist-legend__item">
        <i className="hist-swatch hist-swatch--away" aria-hidden /> Away
      </span>
      <span className="hist-legend__item">
        <i className="hist-swatch hist-swatch--today" aria-hidden /> Today
      </span>
      <span className="hist-legend__hint">Tap a day to open it · tap a month for its list</span>
    </div>
  );
}
