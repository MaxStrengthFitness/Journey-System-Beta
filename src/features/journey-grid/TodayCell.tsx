import { memo } from "react";
import { SKIP_REASON_LABEL, SKIP_REASON_SHORT } from "../../lib/set-outcome";
import type { LiveSet } from "./types";
import { formatSeconds } from "./stats";
import { QualityMark } from "./QualityMark";

interface TodayCellProps {
  machineId: string;
  machineName: string;
  /** Unilateral machine: the cell summarises both sides. */
  sides?: boolean;
  value?: LiveSet;
  /** Shown faint when nothing has been logged yet -- the prescription. */
  prescribedWeight?: number;
  /** This is the machine the trainer is standing at. */
  isFocus: boolean;
  onFocus?: (machineId: string) => void;
}

/**
 * Today's cell -- the far-right column of the Active Session grid.
 *
 * It used to be the input itself: a 252px column of steppers, a reps field
 * and two quality buttons. In CSS Grid a row track is as tall as its tallest
 * item, so that one cell also forced every history cell beside it to 96px --
 * it cost width AND height at once, which is why only four sessions and six
 * machines fit on an iPad in portrait.
 *
 * So it reads instead of writes. Same anatomy as a historical cell, same
 * 84px width, and tapping it makes this machine the one the Now bar edits.
 * Entry lives in the bar; the grid is for reading a row like a sentence.
 *
 * A machine the trainer marked PRACTICE or SKIPPED in the Now bar wears the
 * same skin the history column will give it tomorrow (dashed frame / ⊘), so
 * the row reads the same today as it will next week.
 */
function TodayCellImpl({
  machineId,
  machineName,
  sides = false,
  value,
  prescribedWeight,
  isFocus,
  onFocus,
}: TodayCellProps) {
  const weight = value?.weight ?? prescribedWeight ?? null;
  const isTSC = !!value?.isTSC;
  const effort = isTSC ? value?.seconds : value?.reps;
  const effortR = isTSC ? value?.secondsR : value?.repsR;
  const logged = effort !== null && effort !== undefined;
  const quality = value?.quality ?? null;
  const outcome = value?.outcome ?? "performed";
  const skipReason = value?.skipReason ?? "unknown";

  const spokenEffort = logged
    ? isTSC
      ? formatSeconds(effort ?? 0) + " under tension"
      : effort + " reps"
    : "not logged yet";
  const spoken =
    outcome === "skipped"
      ? "skipped — " + SKIP_REASON_LABEL[skipReason].toLowerCase()
      : outcome === "practice"
        ? "practice set, " + (weight === null ? "no weight set" : weight + " lb") + ", " + spokenEffort
        : (weight === null ? "no weight set" : weight + " lb") + ", " + spokenEffort;

  const cls = [
    "jg-today",
    outcome === "skipped"
      ? "jg-today--skipped"
      : outcome === "practice"
        ? "jg-today--practice"
        : logged
          ? "jg-today--q" + (quality ?? 2)
          : "jg-today--pending",
    isFocus ? "is-focus" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (outcome === "skipped") {
    const why = SKIP_REASON_SHORT[skipReason];
    return (
      <button
        type="button"
        className={cls}
        role="gridcell"
        aria-current={isFocus ? "step" : undefined}
        aria-label={machineName + ", today: " + spoken + ". Tap to edit this machine."}
        onClick={() => onFocus?.(machineId)}
      >
        <span className="jg-today__skip" aria-hidden="true">
          <span className="jg-today__skip-glyph">⊘</span>
          {why && <span className="jg-today__skip-why">{why}</span>}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cls}
      /* The button IS the cell, so there is no nested interactive element
         for VoiceOver to trip over inside a gridcell. */
      role="gridcell"
      aria-current={isFocus ? "step" : undefined}
      aria-label={machineName + ", today: " + spoken + ". Tap to edit this machine."}
      onClick={() => onFocus?.(machineId)}
    >
      <span className="jg-today__w">{weight ?? "—"}</span>
      <span className="jg-today__r" aria-hidden="true">
        {logged ? (
          <>
            {isTSC ? <span className="jg-tut">{"⏱ " + formatSeconds(effort ?? 0)}</span> : effort}
            {sides && effortR !== null && effortR !== undefined && (
              <span className="jg-today__side">{" / " + effortR}</span>
            )}
          </>
        ) : (
          <span className="jg-today__dot">{"·"}</span>
        )}
      </span>
      {outcome === "practice" ? (
        <span className="jg-today__q jg-today__q--practice" aria-hidden="true">
          P
        </span>
      ) : (
        logged &&
        (quality === 1 || quality === 3) && (
          <span className="jg-today__q" aria-hidden="true">
            <QualityMark quality={quality} size={10} />
          </span>
        )
      )}
    </button>
  );
}

export const TodayCell = memo(TodayCellImpl);
