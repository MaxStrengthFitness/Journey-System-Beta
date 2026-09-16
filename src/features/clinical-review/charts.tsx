/**
 * Charts — the time-under-tension line (per week or month) and the machine
 * sparkline. The weekly tonnage column chart and the rep-quality mix were
 * retired in the reporting round: tonnage rises with attendance, not
 * strength, and form lives in the heat map.
 */
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeekBucket } from "./types";
import { formatMinutes } from "./analytics";

const BLUE = "var(--cr-live)";
const GRID = "var(--cr-border)";
const MUTED = "var(--cr-ink-muted)";

const axisProps = {
  tick: { fontSize: 10.5, fill: MUTED },
  axisLine: false as const,
  tickLine: false as const,
};

type TipPayload = { payload?: WeekBucket }[];

function WeekTooltip({ active, payload, rows, period = "week" }: { active?: boolean; payload?: TipPayload; period?: "week" | "month"; rows: (w: WeekBucket) => { key: string; label: string; value: string; color?: string }[] }) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const w = payload[0].payload;
  return (
    <div className="cr-tooltip" role="status">
      <div className="cr-tooltip__title">{period === "week" ? `Week of ${w.label}` : w.label}</div>
      {rows(w).map((r) => (
        <div key={r.key} className="cr-tooltip__row">
          <span>
            {r.color && <span className="cr-tooltip__key" style={{ background: r.color }} />}
            {r.label}
          </span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

/** Weekly time under tension, line — only weeks that recorded any. */
export function TutChart({ weeks, period = "week" }: { weeks: WeekBucket[]; period?: "week" | "month" }) {
  const data = weeks.map((w) => ({ ...w, tutMin: w.tutSeconds > 0 ? Math.round(w.tutSeconds / 60) : null }));
  return (
    <div className="cr-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps} tickFormatter={(v: number) => `${v}m`} width={44} />
          <Tooltip
            cursor={{ stroke: "var(--cr-border-strong)" }}
            content={(p) => (
              <WeekTooltip
                {...(p as { active?: boolean; payload?: TipPayload })}
                period={period}
                rows={(w) => [
                  { key: "t", label: "Under tension", value: w.tutSeconds ? formatMinutes(w.tutSeconds) : "not recorded" },
                  { key: "c", label: "Sets with TUT", value: `${w.setsWithTut} of ${w.sets}` },
                ]}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="tutMin"
            stroke={BLUE}
            strokeWidth={2}
            dot={{ r: 4, fill: BLUE, stroke: "var(--cr-surface)", strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Inline sparkline for a machine's load over the range. Pure SVG, no library. */
export function Sparkline({ series, width = 120, height = 44 }: { series: { weight: number | null; quality: 1 | 2 | 3 | null }[]; width?: number; height?: number }) {
  const pts = series.map((s, i) => ({ i, w: s.weight, q: s.quality })).filter((p) => p.w !== null) as { i: number; w: number; q: 1 | 2 | 3 | null }[];
  if (pts.length < 2) return <svg className="cr-plateau__spark" width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...pts.map((p) => p.w));
  const max = Math.max(...pts.map((p) => p.w));
  const pad = 6;
  const x = (i: number) => pad + (i / Math.max(1, series.length - 1)) * (width - pad * 2);
  const y = (w: number) => (max === min ? height / 2 : height - pad - ((w - min) / (max - min)) * (height - pad * 2));
  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.w).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className="cr-plateau__spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--cr-live)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.length <= 16 &&
        pts.map((p) =>
        p.q === 1 || p.q === 3 ? (
          <circle key={p.i} cx={x(p.i)} cy={y(p.w)} r={3} fill={p.q === 3 ? "var(--cr-hero)" : "var(--cr-poor)"} stroke="var(--cr-surface)" strokeWidth={1.5} />
        ) : null,
      )}
      <circle cx={x(last.i)} cy={y(last.w)} r={4} fill="var(--cr-live)" stroke="var(--cr-surface)" strokeWidth={2} />
    </svg>
  );
}
