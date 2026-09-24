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
 *
 * Seven segments: the wrap variant (client codex, Sep 2026)
 * ----------------------------------------------------------
 * Notes & Profile is seven pages, and at 744pt portrait a seventh of the width
 * is ~90px — not enough for "BODY & PULSE" on one line. The old answer, a
 * label that clips, breaks the rule that names are never truncated, so the
 * codex passes `wrap`: the label and the meta line wrap onto a second line
 * instead, and the row grows to hold them. Every segment in the row grows with
 * it, so they stay equal, and it stays where it is. On every portrait iPad
 * below the 13-inch (744, 820, 834pt) "Body & Pulse" and "Goals & Focus" take
 * two lines and the row is about 75px. In landscape, and on the 13-inch in
 * portrait while the meta lines are short, nothing wraps and the bar is still
 * 48px (a long meta there makes it ~52px). The meta line becomes sentence
 * case at 11px, because on the codex it says something ("3 open · 1
 * critical", "couldn't load") rather than labelling a count.
 *
 * The row's height follows its longest line, meta included, and the metas
 * usually arrive after the bar has drawn. At the portrait widths a meta much
 * past a dozen characters takes a second line of its own, so the row grows
 * when it lands and the page below moves down. Whoever writes the metas keeps
 * them short, or reserves the height; the top of the bar never moves either
 * way.
 *
 * `wrap` is opt-in and Programming and the Activity Archive do not pass it, so
 * they render exactly as they did: every wrap rule in profile-nav.css is
 * scoped to `[data-wrap]`. Moving them over is a separate change.
 */
import { useCallback, useLayoutEffect, useRef } from "react";
import { scrollParentOf } from "./use-scroller-pad";
import "./profile-nav.css";

export interface SubnavItem<T extends string> {
  id: T;
  /** The word on the button. Never truncated — keep it to two words. */
  label: string;
  /** A count, or a state word ("off", "none yet"). Rendered quieter, below. */
  meta?: string | null;
  /** Draws the small attention dot. For "there is something here to see". */
  flag?: boolean;
  /**
   * The dot's colour, when `flag` is set. "alert" (the default) is the crimson
   * every tab uses for "this one matters"; "warn" is plum, for a caution
   * rather than an alarm — the codex's Body & Pulse segment when the client
   * has clinical watch-outs, the same plum as the watch-out count above
   * Programming. On the selected segment both are drawn in the segment's ink.
   */
  flagTone?: "alert" | "warn";
}

export interface ProfileSubnavProps<T extends string> {
  /** Screen-reader name: "Programming views", "Activity archive views". */
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
  /**
   * Let a label or a meta line take a second line instead of clipping (see
   * "Seven segments" above). Off by default, which is today's bar exactly.
   */
  wrap?: boolean;
  /**
   * Gives each segment the id `{idPrefix}-tab-{id}` and points it at
   * `{idPrefix}-panel-{id}` with `aria-controls`, so a host whose panes are
   * `role="tabpanel"` can name them with `aria-labelledby`. A host that passes
   * it keeps an element with every panel id in the page from the start, or
   * `aria-controls` points at nothing. That does not mean every page mounts:
   * a page that mounts on first visit sits in an empty, hidden
   * `role="tabpanel"` placeholder until then. A host that does not pass it
   * leaves the ids off, as today.
   */
  idPrefix?: string;
}

export function ProfileSubnav<T extends string>({
  label,
  items,
  value,
  onChange,
  context,
  wrap = false,
  idPrefix,
}: ProfileSubnavProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  /*
   * Two measurements, both of them the same trap the History tab already hit
   * (see the note on --hist-stick-top in client-history.css):
   *
   *   1. The app shell is a bounded 100dvh column, so the document never
   *      scrolls — an inner `p-6` container does. Every engine pins a sticky
   *      box inside the scroll container's PADDING, so a plain `top: 0` would
   *      stick 24px down and let rows slide past in the strip above it. The
   *      scroller's padding, negated, is --psub-stick-top.
   *
   *   2. The History pane inside the Activity Archive has sticky month headers of
   *      its own, which want to stop UNDER this bar rather than slide beneath
   *      it. This publishes its own height as --psub-stuck-h on the enclosing
   *      .ptab, and client-history.css adds it to their offset. A CSS
   *      variable rather than a prop, because it has to reach a component
   *      three levels down that knows nothing about this one.
   */
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const host = shell.parentElement;
    const scroller = scrollParentOf(shell);

    const apply = () => {
      const pad = scroller ? parseFloat(getComputedStyle(scroller).paddingTop) || 0 : 0;
      shell.style.setProperty("--psub-stick-top", `${-pad}px`);
      host?.style.setProperty("--psub-stuck-h", `${Math.round(shell.offsetHeight)}px`);
    };

    apply();

    // The context line rewraps as the numbers change and as the iPad rotates
    // (and with `wrap`, so do the labels and the meta lines), so the height
    // is OBSERVED rather than measured once.
    //
    // Feature-detected, and not out of politeness: this runs in a layout
    // effect, and anything that throws in a layout effect takes the whole
    // profile down to the error boundary — which is exactly how this round
    // shipped its first crash. Every browser the studios use has
    // ResizeObserver; a context without it (an old webview, a test renderer)
    // simply falls back to the resize listener below and re-measures on
    // rotation, which is the case that matters on an iPad.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(apply);
      ro.observe(shell);
    }
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      host?.style.removeProperty("--psub-stuck-h");
    };
  }, []);

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
    <div className="psub-shell" ref={shellRef} data-wrap={wrap || undefined}>
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
              id={idPrefix ? `${idPrefix}-tab-${item.id}` : undefined}
              aria-controls={idPrefix ? `${idPrefix}-panel-${item.id}` : undefined}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              className="psub__btn"
              data-on={on || undefined}
              onClick={() => onChange(item.id)}
            >
              <span className="psub__label">
                {item.label}
                {item.flag ? (
                  <i className="psub__dot" data-tone={item.flagTone} aria-hidden="true" />
                ) : null}
              </span>
              {item.meta ? <span className="psub__meta">{item.meta}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
