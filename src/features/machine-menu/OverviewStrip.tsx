/**
 * THE MACHINE MENU — the overview strip under the Staircase.
 *
 * Drawn only when the loaded columns don't fit in one window
 * (`needsOverview`), between ‹ Older and Newer ›. It is the one place the
 * chart shows CALENDAR time, from the oldest loaded column to today: a thin
 * step line of the performed loads (broken where a gap was folded, so a break
 * shows as empty space), one tick a session (full height counted, half
 * height not), and a box round what the chart shows. No quality colour.
 *
 * A tap moves the window there and selects the nearest session; a drag moves
 * the box, with pointer capture (only the box refuses the browser's own
 * gestures, `touch-action: none`). ‹ Older and Newer › do the same with no
 * gesture at all, so nothing here is drag-only.
 *
 * WIDTH. Measured in a layout effect with a feature-detected ResizeObserver
 * (a throw there takes the screen down — KNOWN-TRAPS → React), falling back
 * to what the controls row leaves it.
 */
import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { nearestColumnAt, overviewLayout, type ViewWindow } from "./timeline-geometry";
import type { TimelineModel } from "./timeline-model";
import { overviewLabel } from "./timeline-words";
import "./machine-menu.css";

export const OVERVIEW_HEIGHT = 44;
/** The step line lives in the top 28px; the ticks in the bottom 8. */
const LINE_H = 28;
const TICK_TOP = 36;
/** A pointer that moves this far is a drag, not a tap. */
const DRAG_PX = 6;
/** Room at each end, so the first and last ticks and the box's edge are whole. */
const PAD = 8;

const f = (n: number) => Math.round(n * 10) / 10;

export interface OverviewStripProps {
  model: TimelineModel;
  view: ViewWindow;
  today: string;
  /** The width to draw at until the strip has been measured. */
  fallbackWidth: number;
  /** A tap: move the window to this column and select it. */
  onTap: (index: number) => void;
  /** A drag: move the window to this column. */
  onDrag: (index: number) => void;
}

export function OverviewStrip({ model, view, today, fallbackWidth, onTap, onDrag }: OverviewStripProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const drag = useRef<{ id: number; x0: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      if (w > 0) setMeasured(Math.round(w));
    };
    read();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = Math.max(80, measured ?? fallbackWidth);
  const ov = overviewLayout(model, view, today, width - 2 * PAD, LINE_H);
  if (!ov) return null;

  /** A pointer's x in the drawing's own units. */
  const xOf = (e: PointerEvent<HTMLDivElement>): number => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    return (r.width > 0 ? (x * width) / r.width : x) - PAD;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { id: e.pointerId, x0: e.clientX, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A browser without pointer capture still gets the tap.
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (Math.abs(e.clientX - d.x0) > DRAG_PX) d.moved = true;
    if (!d.moved) return;
    const i = nearestColumnAt(xOf(e), ov);
    if (i !== null) onDrag(i);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || d.moved) return;
    const i = nearestColumnAt(xOf(e), ov);
    if (i !== null) onTap(i);
  };
  const onPointerCancel = () => {
    drag.current = null;
  };

  return (
    <div
      ref={ref}
      className="mm-ov"
      role="img"
      aria-label={overviewLabel(model, today)}
      data-overview=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <svg width={width} height={OVERVIEW_HEIGHT} viewBox={`0 0 ${width} ${OVERVIEW_HEIGHT}`} aria-hidden="true" focusable="false">
        <g transform={`translate(${PAD} 0)`}>
          <rect className="mm-ov__under" x={f(ov.box.x)} y={1} width={f(ov.box.width)} height={OVERVIEW_HEIGHT - 2} rx={6} />
          {ov.lines.map((pts, k) => (
            <path
              key={k}
              className="mm-ov__line"
              d={pts.map((p, i) => (i === 0 ? `M${f(p.x)} ${f(p.y)}` : `H${f(p.x)}V${f(p.y)}`)).join("")}
            />
          ))}
          {ov.ticks.map((t) => (
            <rect
              key={t.index}
              className={t.counted ? "mm-ov__tick" : "mm-ov__tick mm-ov__tick--uncounted"}
              x={f(t.x - 1)}
              y={t.counted ? TICK_TOP : TICK_TOP + 4}
              width={2}
              height={t.counted ? 8 : 4}
            />
          ))}
          <rect
            className="mm-ov__box"
            data-box=""
            x={f(ov.box.x)}
            y={1}
            width={f(ov.box.width)}
            height={OVERVIEW_HEIGHT - 2}
            rx={6}
          />
        </g>
      </svg>
    </div>
  );
}
