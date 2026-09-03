import { memo } from "react";
import type { StatMetric } from "./types";
import { formatLongDate, formatSeconds, formatShortDate, STAT_LABEL, type StatHit } from "./stats";

interface StatCellProps {
  machineName: string;
  metric: StatMetric;
  hit: StatHit | null;
  /** True when the hit's column is currently rendered in the timeline. */
  isVisible: boolean;
  /** Tap → scroll the timeline to that session and spotlight it. */
  onJump?: (sessionId: string) => void;
}

/**
 * One cell of the Analytics column. Shows the aggregate as a number, the
 * date it happened, and the other half of that set as context (reps for a
 * weight metric, weight for a rep metric) — so "Highest 116" and "Most reps
 * 15 @ 116" answer the follow-up question before it is asked.
 */
function StatCellImpl({ machineName, metric, hit, isVisible, onJump }: StatCellProps) {
  const label = STAT_LABEL[metric];

  if (!hit) {
    return (
      <div className="jg-stat jg-stat--empty" role="gridcell" aria-label={`${machineName}: ${label.long} — no sets`}>
        <span className="jg-cell__empty" aria-hidden="true">—</span>
      </div>
    );
  }

  const { set, session } = hit;
  const isRepMetric = metric === "mostReps" || metric === "fewestReps";
  const value = isRepMetric ? String(set.reps ?? 0) : String(set.weight);
  const unit = isRepMetric ? "reps" : "lb";
  const context = isRepMetric
    ? `@ ${set.weight} lb`
    : set.isTSC
      ? `⏱ ${formatSeconds(set.seconds ?? 0)}`
      : `${set.reps ?? 0} reps`;
  const date = formatShortDate(session.date);

  const body = (
    <>
      <span className="jg-stat__value">
        {value}
        <span className="jg-stat__unit">{unit}</span>
      </span>
      <span className="jg-stat__meta">
        <span className="jg-stat__date">{date}</span>
        <span className="jg-stat__ctx">{context}</span>
      </span>
      {!isVisible && (
        <span className="jg-stat__older" aria-hidden="true">
          ‹ older
        </span>
      )}
    </>
  );

  const aria = `${machineName}: ${label.long} ${value} ${unit}, ${formatLongDate(session.date)}, ${context}${
    isVisible ? ". Tap to show that session." : ". That session is not loaded yet."
  }`;

  return (
    <div className="jg-stat" role="gridcell">
      {onJump ? (
        <button type="button" className="jg-stat__btn" aria-label={aria} onClick={() => onJump(session.id)}>
          {body}
        </button>
      ) : (
        <div className="jg-stat__btn" aria-label={aria}>
          {body}
        </div>
      )}
    </div>
  );
}

export const StatCell = memo(StatCellImpl);
