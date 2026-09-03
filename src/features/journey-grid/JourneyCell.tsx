import { memo } from "react";
import type { JourneySet, JourneySession } from "./types";
import { formatSeconds, formatLongDate, QUALITY_LABEL, trendVsPrevious, type Trend } from "./stats";

interface JourneyCellProps {
  session: JourneySession;
  machineName: string;
  set?: JourneySet;
  /** The previous logged set on this machine — drives the tiny trend glyph. */
  previous?: JourneySet;
  /** This column is the most recent logged session (the baseline). */
  isLatest: boolean;
  /** This column was tapped in the header. */
  isSpot: boolean;
  /** The Analytics column's current metric came from this set. */
  isStatHit: boolean;
}

const TREND_GLYPH: Record<NonNullable<Trend>, string> = {
  up: "▲",
  down: "▼",
  "reps-up": "↑",
  "reps-down": "↓",
  flat: "·",
};

/**
 * One historical cell. Pure and memoised: it re-renders only when its own
 * set or flags change. With ~20 rows × ~15 columns that is the difference
 * between 300 renders and 1 when the trainer taps something.
 */
function JourneyCellImpl({ session, machineName, set, previous, isLatest, isSpot, isStatHit }: JourneyCellProps) {
  const cls = [
    "jg-cell",
    set ? `jg-cell--q${set.quality}` : "",
    isLatest ? "is-latest" : "",
    isSpot ? "is-spot" : "",
    isStatHit ? "is-stat-hit" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const when = `${formatLongDate(session.date)}${isLatest ? " (most recent session)" : ""}`;

  if (!set) {
    return (
      <div className={cls} role="gridcell" aria-label={`${machineName}, ${when}: not performed`}>
        <span className="jg-cell__empty" aria-hidden="true">
          —
        </span>
      </div>
    );
  }

  const trend = trendVsPrevious(set, previous);
  const effort = set.isTSC ? `${formatSeconds(set.seconds ?? 0)} under tension` : `${set.reps ?? 0} reps`;

  return (
    <div
      className={cls}
      role="gridcell"
      aria-label={`${machineName}, ${when}: ${set.weight} lb, ${effort}, ${QUALITY_LABEL[set.quality]}`}
    >
      <span className="jg-cell__w">{set.weight}</span>
      <span className="jg-cell__r" aria-hidden="true">
        {set.isTSC ? <span className="jg-tut">⏱ {formatSeconds(set.seconds ?? 0)}</span> : <>{set.reps}</>}
        {trend && trend !== "flat" && <span className={`jg-trend jg-trend--${trend}`}>{TREND_GLYPH[trend]}</span>}
      </span>
      {set.quality === 3 && (
        <span className="jg-cell__q" aria-hidden="true">
          ★
        </span>
      )}
      {set.quality === 1 && (
        <span className="jg-cell__q" aria-hidden="true">
          ◐
        </span>
      )}
    </div>
  );
}

export const JourneyCell = memo(JourneyCellImpl);
