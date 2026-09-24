/**
 * The Over time timeline, drawn: one strip per lane on ONE shared six-month
 * axis, in the order timeline.ts decided.
 *
 * Client codex, Sep 2026 (phase 13). Each lane is its title and lines in
 * HTML — so a long question or a sentence WRAPS at portrait widths instead of
 * being cut off at the edge of a drawing — over a plot strip that uses the
 * same x for the same day as every other strip, so a Monday at the door and
 * a Pulse round line up. The month axis sits under the last lane.
 *
 *   marks    a 4×10 bar per session where the question was asked, on five
 *            dashed rungs labelled with the scale's top and bottom words;
 *            below the centre in ink, the rest muted. A session where it was
 *            NOT asked draws nothing — never a mark on "As usual".
 *   rung     a Pulse answer: a ring on the Pulse's five words (better is
 *            higher), a dashed line between two or more
 *   measure  an InBody reading: a dot in the scanner's unit, a solid line,
 *            and for muscle and body fat the shaded band of the scanner's
 *            normal variation around her first scan (never for weight)
 *   gap      a lane that could not be read, or has nothing: its sentence
 *
 * Colours are the codex tokens through body.css — ink, muted ink, lines and
 * surfaces. Never red, never a heat map, never a traffic light.
 *
 * WIDTH. The strips are drawn at the container's own pixel width, measured in
 * a layout effect with a FEATURE-DETECTED ResizeObserver (a throw in a layout
 * effect takes the whole profile down — KNOWN-TRAPS → React), falling back to
 * TIMELINE_FALLBACK_WIDTH. A hidden page measures 0; the observer fires again
 * when it is shown. The SVGs also scale to the container through their
 * viewBox, so the fallback never overflows.
 *
 * Every strip is role="img" with a <title> and a <desc> that says the whole
 * lane in words — the dates and the answers — for a screen reader.
 */
import { useId, useLayoutEffect, useRef, useState } from "react";
import { LoadingMark } from "../../../components/LoadingMark";
import {
  LANE_PLOT_HEIGHT,
  type MarksLane,
  type MeasureLane,
  type RungLane,
  type TimelineLane,
  type TimelineModel,
  type TimelineMonth,
} from "./timeline";

/** Drawn at this width until the container has been measured (and where it cannot be). */
export const TIMELINE_FALLBACK_WIDTH = 640;
/** Narrower than this and the strips scale down rather than squeeze. */
const MIN_WIDTH = 360;
/** The words' gutter ends here (right-aligned); the plot starts at X0. */
const GUTTER = 112;
const X0 = 120;
/** Room right of the plot for "today" and a label on the newest point. */
const RIGHT = 70;
/** A point's label is drawn only this far (px) from the last labelled one. */
const LABEL_GAP = 48;
const AXIS_HEIGHT = 28;

interface Geometry {
  width: number;
  x0: number;
  x1: number;
  days: number;
}

const xOf = (g: Geometry, offset: number) => g.x0 + (offset / g.days) * (g.x1 - g.x0);
const px = (n: number) => Math.round(n * 10) / 10;

/** Month guides behind a plot, so a mark can be read against the axis below. */
function MonthGuides({ g, months, height }: { g: Geometry; months: readonly TimelineMonth[]; height: number }) {
  return (
    <g aria-hidden="true">
      {months.map((m) => {
        const x = px(xOf(g, m.offset));
        return <line key={m.day} className="bp-tl__guide" x1={x} x2={x} y1={2} y2={height - 2} />;
      })}
    </g>
  );
}

/** The five dashed rungs and the scale's bottom and top words in the gutter. */
function Rungs({ g, words, top, bottom }: { g: Geometry; words: readonly string[]; top: number; bottom: number }) {
  const y = (pos: number) => bottom - (pos / 4) * (bottom - top);
  return (
    <g aria-hidden="true">
      {[0, 1, 2, 3, 4].map((pos) => (
        <line
          key={pos}
          className="bp-tl__rung"
          data-centre={pos === 2 ? "" : undefined}
          x1={g.x0}
          x2={g.x1}
          y1={px(y(pos))}
          y2={px(y(pos))}
        />
      ))}
      <text className="bp-tl__word" x={GUTTER} y={px(y(4) + 4)} textAnchor="end">
        {words[4]}
      </text>
      <text className="bp-tl__word" x={GUTTER} y={px(y(0) + 4)} textAnchor="end">
        {words[0]}
      </text>
    </g>
  );
}

/** Newest first, a label only where it sits clear of the last one drawn. */
function labelled<T extends { offset: number }>(g: Geometry, points: readonly T[]): Set<T> {
  const out = new Set<T>();
  let last: number | null = null;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const x = xOf(g, points[i].offset);
    if (last === null || Math.abs(last - x) >= LABEL_GAP) {
      out.add(points[i]);
      last = x;
    }
  }
  return out;
}

/** Roughly half a 12px bold label's width, to keep it off the gutter's words and inside the strip. */
const halfWidth = (text: string) => text.length * 3.5;

/**
 * A point's word or number, centred over it — except near either end, where
 * it is anchored to the point's side instead, so it never runs over the
 * scale's words in the gutter or past the strip's edge.
 */
function PointLabel({ g, x, y, text }: { g: Geometry; x: number; y: number; text: string }) {
  let anchor: "start" | "middle" | "end" = "middle";
  let at = x;
  if (x - halfWidth(text) < g.x0 - 4) {
    anchor = "start";
    at = Math.max(x - 6, g.x0 - 4);
  } else if (x + halfWidth(text) > g.width - 2) {
    anchor = "end";
    at = Math.min(x + 6, g.width - 2);
  }
  return (
    <text className="bp-tl__label" x={px(at)} y={px(y)} textAnchor={anchor}>
      {text}
    </text>
  );
}

function MarksPlot({ g, lane }: { g: Geometry; lane: MarksLane }) {
  const h = LANE_PLOT_HEIGHT.marks;
  const top = 8;
  const bottom = h - 8;
  const y = (pos: number) => bottom - (pos / 4) * (bottom - top);
  return (
    <>
      <Rungs g={g} words={lane.words} top={top} bottom={bottom} />
      {lane.marks.map((m, i) => (
        <rect
          key={`${m.day}-${i}`}
          className="bp-tl__mark"
          data-below={m.below ? "" : undefined}
          x={px(xOf(g, m.offset) - 2)}
          y={px(y(m.pos) - 5)}
          width={4}
          height={10}
          rx={2}
        />
      ))}
    </>
  );
}

function RungPlot({ g, lane }: { g: Geometry; lane: RungLane }) {
  const h = LANE_PLOT_HEIGHT.rung;
  const top = 22;
  const bottom = h - 8;
  const y = (pos: number) => bottom - (pos / 4) * (bottom - top);
  const shown = labelled(g, lane.points);
  const d = lane.points.map((pt, i) => `${i ? "L" : "M"}${px(xOf(g, pt.offset))} ${px(y(pt.pos))}`).join(" ");
  return (
    <>
      <Rungs g={g} words={lane.words} top={top} bottom={bottom} />
      {lane.line ? <path className="bp-tl__link" d={d} /> : null}
      {lane.points.map((pt, i) => (
        <circle
          key={`${pt.day}-${i}`}
          className="bp-tl__ring"
          cx={px(xOf(g, pt.offset))}
          cy={px(y(pt.pos))}
          r={5.5}
        />
      ))}
      {lane.points.map((pt, i) =>
        shown.has(pt) ? <PointLabel key={`l-${pt.day}-${i}`} g={g} x={xOf(g, pt.offset)} y={y(pt.pos) - 10} text={pt.word} /> : null,
      )}
    </>
  );
}

function MeasurePlot({ g, lane }: { g: Geometry; lane: MeasureLane }) {
  const h = LANE_PLOT_HEIGHT.measure;
  const top = 22;
  const bottom = h - 10;
  const span = lane.hi - lane.lo || 1;
  const y = (v: number) => bottom - ((v - lane.lo) / span) * (bottom - top);
  const unit = (v: number) => (lane.unit === "%" ? `${v}%` : `${v} lb`);
  const shown = labelled(g, lane.points);
  const d = lane.points.map((pt, i) => `${i ? "L" : "M"}${px(xOf(g, pt.offset))} ${px(y(pt.value))}`).join(" ");
  return (
    <>
      {lane.band ? (
        <rect
          className="bp-tl__band"
          data-band=""
          x={g.x0}
          y={px(y(lane.band.hi))}
          width={px(g.x1 - g.x0)}
          height={px(Math.max(1, y(lane.band.lo) - y(lane.band.hi)))}
          rx={4}
        />
      ) : null}
      <g aria-hidden="true">
        <text className="bp-tl__word" x={GUTTER} y={px(top + 4)} textAnchor="end">
          {unit(lane.hi)}
        </text>
        <text className="bp-tl__word" x={GUTTER} y={px(bottom + 4)} textAnchor="end">
          {unit(lane.lo)}
        </text>
      </g>
      {lane.line ? <path className="bp-tl__line" d={d} /> : null}
      {lane.points.map((pt, i) => (
        <circle key={`${pt.day}-${i}`} className="bp-tl__dot" cx={px(xOf(g, pt.offset))} cy={px(y(pt.value))} r={5} />
      ))}
      {lane.points.map((pt, i) =>
        shown.has(pt) ? <PointLabel key={`l-${pt.day}-${i}`} g={g} x={xOf(g, pt.offset)} y={y(pt.value) - 10} text={pt.label} /> : null,
      )}
    </>
  );
}

function Plot({ g, lane, months, titleId }: { g: Geometry; lane: Exclude<TimelineLane, { kind: "gap" }>; months: readonly TimelineMonth[]; titleId: string }) {
  const h = LANE_PLOT_HEIGHT[lane.kind];
  return (
    <svg
      className="bp-tl__plot"
      data-lane={lane.key}
      viewBox={`0 0 ${g.width} ${h}`}
      width={g.width}
      height={h}
      role="img"
      aria-labelledby={`${titleId}-t ${titleId}-d`}
    >
      <title id={`${titleId}-t`}>{lane.title}</title>
      <desc id={`${titleId}-d`}>{lane.desc}</desc>
      <MonthGuides g={g} months={months} height={h} />
      {lane.kind === "marks" ? <MarksPlot g={g} lane={lane} /> : null}
      {lane.kind === "rung" ? <RungPlot g={g} lane={lane} /> : null}
      {lane.kind === "measure" ? <MeasurePlot g={g} lane={lane} /> : null}
    </svg>
  );
}

function Axis({ g, months }: { g: Geometry; months: readonly TimelineMonth[] }) {
  return (
    <svg
      className="bp-tl__axis"
      viewBox={`0 0 ${g.width} ${AXIS_HEIGHT}`}
      width={g.width}
      height={AXIS_HEIGHT}
      aria-hidden="true"
    >
      <line className="bp-tl__tick" x1={g.x0} x2={g.x1} y1={0.5} y2={0.5} />
      {months.map((m) => {
        const x = px(xOf(g, m.offset));
        // A month too close to "today" keeps its tick and gives up its word.
        const room = g.x1 - x >= 44;
        return (
          <g key={m.day}>
            <line className="bp-tl__tick" x1={x} x2={x} y1={0} y2={6} />
            {room ? (
              <text className="bp-tl__word" x={px(x + 3)} y={19}>
                {m.label}
              </text>
            ) : null}
          </g>
        );
      })}
      <line className="bp-tl__tick" x1={g.x1} x2={g.x1} y1={0} y2={6} />
      <text className="bp-tl__word" x={px(g.x1 + 4)} y={19}>
        today
      </text>
    </svg>
  );
}

export function BodyTimeline({ model, width: forced }: { model: TimelineModel; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const idBase = useId();

  useLayoutEffect(() => {
    if (forced) return;
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      // A hidden page measures 0: keep what we had until it is shown.
      if (w > 0) setMeasured(Math.round(w));
    };
    read();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [forced]);

  const width = Math.max(MIN_WIDTH, forced ?? measured ?? TIMELINE_FALLBACK_WIDTH);
  const g: Geometry = { width, x0: X0, x1: width - RIGHT, days: model.window.days };

  return (
    <div className="bp-tl" ref={ref} data-width={width}>
      <ol className="bp-tl__lanes">
        {model.lanes.map((lane, i) => {
          const titleId = `${idBase}-${i}`;
          return (
            <li key={lane.key} className="bp-tl__lane" data-kind={lane.kind} data-lane={lane.key}>
              <div className="bp-tl__head">
                <p className="bp-tl__title">{lane.title}</p>
                {lane.kind === "gap" && lane.state === "loading" ? (
                  <LoadingMark size="sm" label={lane.lines[0]} />
                ) : (
                  lane.lines.map((line, j) => (
                    <p key={j} className={lane.kind === "gap" ? "bp-tl__gap" : "bp-tl__src"}>
                      {line}
                    </p>
                  ))
                )}
              </div>
              {lane.kind === "gap" ? null : <Plot g={g} lane={lane} months={model.months} titleId={titleId} />}
            </li>
          );
        })}
      </ol>
      <Axis g={g} months={model.months} />
    </div>
  );
}
