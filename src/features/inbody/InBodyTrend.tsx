/**
 * One line of the printout's "Body Composition History", as inline SVG so it
 * prints and needs no chart library (the same choice as the check-in trend
 * in features/subjective-report). The first and latest values are labeled,
 * so the line reads without hovering.
 *
 * A small change should look small: the vertical scale never spans less than
 * `minSpan`, or 0.3 lb of noise would fill the whole box.
 */

import React from "react";
import { cn } from "../../lib/utils";
import { formatMeasure, scanDateLabel, type MeasureKey, type TrendPoint } from "./scans";

export interface InBodyTrendProps {
  points: TrendPoint[];
  measure: MeasureKey;
  label: string;
  /** The smallest range the vertical axis shows, in the measure's units. */
  minSpan: number;
  today?: string;
  /** "report" draws for the navy progress report and its printout. */
  variant?: "card" | "report";
}

const W = 260;
const H = 86;
const PAD_X = 14;
const TOP = 20;
const BOTTOM = 20;

export function InBodyTrend({ points, measure, label, minSpan, today, variant = "card" }: InBodyTrendProps) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / (points.length - 1);
  const y = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * (H - TOP - BOTTOM);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = points.length - 1;
  const report = variant === "report";

  return (
    <figure className="min-w-0">
      <figcaption
        className={cn(
          "mb-1 text-[10px] font-black uppercase tracking-[0.14em]",
          report ? "text-white/60 print:text-[#0A2E46]/70" : "text-slate-500 dark:text-slate-400",
        )}
      >
        {label}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${label}: ${formatMeasure(points[0].value, measure)} on ${scanDateLabel(points[0].date, today)}, ${formatMeasure(points[last].value, measure)} on ${scanDateLabel(points[last].date, today)}`}
        className={cn(
          "block overflow-visible",
          report ? "text-[#F06C22]" : "text-sky-600 dark:text-sky-400",
        )}
      >
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={`${p.date}-${i}`} cx={x(i)} cy={y(p.value)} r={i === last ? 4.5 : 3} fill="currentColor">
            <title>
              {scanDateLabel(p.date, today)}: {formatMeasure(p.value, measure)}
            </title>
          </circle>
        ))}
        <g
          className={report ? "fill-white print:fill-[#0A2E46]" : "fill-slate-700 dark:fill-slate-200"}
          style={{ fontSize: 11, fontWeight: 800 }}
        >
          <text x={x(0)} y={y(points[0].value) - 8} textAnchor="start">
            {formatMeasure(points[0].value, measure)}
          </text>
          <text x={x(last)} y={y(points[last].value) - 8} textAnchor="end">
            {formatMeasure(points[last].value, measure)}
          </text>
        </g>
        <g
          className={report ? "fill-white/50 print:fill-[#0A2E46]/60" : "fill-slate-400 dark:fill-slate-500"}
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          <text x={x(0)} y={H - 4} textAnchor="start">
            {scanDateLabel(points[0].date, today)}
          </text>
          <text x={x(last)} y={H - 4} textAnchor="end">
            {scanDateLabel(points[last].date, today)}
          </text>
        </g>
      </svg>
    </figure>
  );
}
