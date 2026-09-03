import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * The date stepper.
 *
 * The bug it fixes: the old header put the title BETWEEN the arrows, so
 * "September" and "May" pushed them to different x positions. Stepping through
 * months meant the arrow moved out from under your thumb every tap — on a
 * tablet that is a genuine mis-tap generator, not a cosmetic wobble.
 *
 * The label now sits in a fixed-width track (`min-width` in CSS), so the arrows
 * are pinned regardless of what the label says. The label is itself a button:
 * tapping it returns to today, which is what the old separate "TODAY" pill did.
 */

export interface DateNavigatorProps {
  /** Big line — the month, the week range, or the date. */
  primary: string;
  /** Small line under it — the year, or the weekday. */
  secondary?: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  prevLabel?: string;
  nextLabel?: string;
}

export function DateNavigator({
  primary,
  secondary,
  onPrev,
  onNext,
  onToday,
  prevLabel = "Previous",
  nextLabel = "Next",
}: DateNavigatorProps) {
  return (
    <div className="cal-nav">
      <button type="button" className="cal-nav__btn" onClick={onPrev} aria-label={prevLabel}>
        <ChevronLeft size={18} strokeWidth={2.6} aria-hidden />
      </button>

      <button type="button" className="cal-nav__label" onClick={onToday} title="Jump to today">
        <span className="cal-nav__primary">{primary}</span>
        {secondary && <span className="cal-nav__secondary">{secondary}</span>}
      </button>

      <button type="button" className="cal-nav__btn" onClick={onNext} aria-label={nextLabel}>
        <ChevronRight size={18} strokeWidth={2.6} aria-hidden />
      </button>
    </div>
  );
}
