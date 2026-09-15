/**
 * THE SUB-TOGGLE — one control, three tabs, one piece of muscle memory.
 *
 * Ergonomics, stated once so every tab inherits them
 * ---------------------------------------------------
 * The iPad is HELD. It is held in one hand at the edge, in a room, often
 * while the trainer is looking at the client rather than the screen. That
 * rules out three things the old profile did:
 *
 *   - a control that moves. The sub-toggle is always the first thing under
 *     the tab row, always the same height, in all three tabs that have one.
 *     Once the thumb has learnt "second row, first third", it is right
 *     forever, and the trainer can change view without looking down.
 *
 *   - a control that scrolls away. It is sticky. The panes below it are long
 *     — a year of sessions, twenty machines — and a switch you have to scroll
 *     back up to find is a switch you stop using.
 *
 *   - targets sized to their text. Segments are EQUAL fractions of the full
 *     width, not content-width pills, so "All Machines" and "B" are the same
 *     size and the same distance apart. Position, not reading, is what picks
 *     a segment when you are not looking at it. At the narrowest supported
 *     width (744pt portrait) four segments are still ~175px wide and 48px
 *     tall — four times the 40px floor in CLAUDE.md, on both axes.
 *
 * Colour: brand blue, because this is an interactive control. Hero orange is
 * reserved for Start Session and for good findings, and nothing here is
 * either. The active segment is a filled blue block rather than an underline
 * — at arm's length, on a screen with a fingerprint on it, fill survives and
 * a 2px rule does not.
 *
 * A segment is NEVER hidden. `meta` carries the state instead: Routine B when
 * the client has no B reads "B · off", and tapping it explains how to turn it
 * on. Hiding it is how the whole feature stops existing.
 */
import { useCallback, useRef } from "react";
import "./profile-nav.css";

export interface SubnavItem<T extends string> {
  id: T;
  /** The word on the button. Never truncated — keep it to two words. */
  label: string;
  /** A count, or a state word ("off", "none yet"). Rendered quieter, below. */
  meta?: string | null;
  /** Draws the small attention dot. For "there is something here to see". */
  flag?: boolean;
}

export interface ProfileSubnavProps<T extends string> {
  /** Screen-reader name: "Programming views", "Clinical history views". */
  label: string;
  items: SubnavItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /**
   * Rendered on the row above, full width — the tab's persistent context
   * line (what is prescribed, what the clinical flags are). It sticks with
   * the toggle, because the sentence and the switch are read together.
   */
  context?: React.ReactNode;
}

export function ProfileSubnav<T extends string>({
  label,
  items,
  value,
  onChange,
  context,
}: ProfileSubnavProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  // Arrow keys walk the row and select as they go, the way a segmented
  // control behaves everywhere else. Home/End jump to the ends.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = items.findIndex((i) => i.id === value);
      if (idx < 0) return;
      let next = idx;
      if (e.key === "ArrowRight") next = (idx + 1) % items.length;
      else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      else return;
      e.preventDefault();
      onChange(items[next].id);
      const btns = listRef.current?.querySelectorAll<HTMLButtonElement>(".psub__btn");
      btns?.[next]?.focus();
    },
    [items, value, onChange],
  );

  return (
    <div className="psub-shell">
      {context ? <div className="psub-context">{context}</div> : null}
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className="psub"
        style={{ "--psub-n": items.length } as React.CSSProperties}
        onKeyDown={onKeyDown}
      >
        {items.map((item) => {
          const on = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              className="psub__btn"
              data-on={on || undefined}
              onClick={() => onChange(item.id)}
            >
              <span className="psub__label">
                {item.label}
                {item.flag ? <i className="psub__dot" aria-hidden="true" /> : null}
              </span>
              {item.meta ? <span className="psub__meta">{item.meta}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
