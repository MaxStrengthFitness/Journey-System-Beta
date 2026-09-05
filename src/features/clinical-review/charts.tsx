/**
 * Charts — three small multiples that share one x-axis (training weeks).
 *
 * Deliberately NOT one dual-axis chart: tonnage (thousands of lb) and time
 * under tension (seconds) on two y-scales would invent a correlation that is
 * not in the data. Side by side on the same weeks, the eye still reads them
 * together and each keeps an honest axis.
 */
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeekBucket } from "./types";
import { compact, formatMinutes } from "./analytics";

const BLUE = "var(--cr-live)";
const ORANGE = "var(--cr-hero)";
const SLATE = "var(--cr-done)";
const PLUM = "var(--cr-poor)";
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

/** Weekly tonnage, columns. Single series → no legend; the title names it. */
export function TonnageChart({ weeks, period = "week" }: { weeks: WeekBucket[]; period?: "week" | "month" }) {
  return (
    <div className="cr-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps} tickFormatter={(v: number) => compact(v)} width={44} />
          <Tooltip
            cursor={{ fill: "var(--cr-surface-2)" }}
            content={(p) => (
              <WeekTooltip
                {...(p as { active?: boolean; payload?: TipPayload })}
                period={period}
                rows={(w) => [
                  { key: "t", label: "Tonnage", value: `${w.tonnage.toLocaleString()} lb` },
                  { key: "s", label: "Sessions", value: String(w.sessions) },
                  { key: "r", label: "Reps", value: w.reps.toLocaleString() },
                ]}
              />
            )}
          />
          <Bar dataKey="tonnage" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
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

/** Weekly rep-quality mix, stacked: max (orange) · completed (slate) · poor (plum). */
export function QualityMixChart({ weeks, period = "week" }: { weeks: WeekBucket[]; period?: "week" | "month" }) {
  const data = weeks.map((w) => ({
    ...w,
    max: w.setsRated ? (w.setsMax / w.setsRated) * 100 : 0,
    done: w.setsRated ? (w.setsDone / w.setsRated) * 100 : 0,
    poor: w.setsRated ? (w.setsPoor / w.setsRated) * 100 : 0,
  }));
  return (
    <div>
      <div className="cr-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -12 }} barCategoryGap="30%" stackOffset="none">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...axisProps} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={44} />
            <Tooltip
              cursor={{ fill: "var(--cr-surface-2)" }}
              content={(p) => (
                <WeekTooltip
                  {...(p as { active?: boolean; payload?: TipPayload })}
                  period={period}
                  rows={(w) => [
                    { key: "m", label: "Max strength", value: `${w.setsMax} sets`, color: ORANGE },
                    { key: "d", label: "Completed", value: `${w.setsDone} sets`, color: SLATE },
                    { key: "p", label: "Poor quality", value: `${w.setsPoor} sets`, color: PLUM },
                  ]}
                />
              )}
            />
            {/* 2px surface gap between segments via stroke in the surface colour. */}
            <Bar dataKey="max" stackId="q" fill={ORANGE} stroke="var(--cr-surface)" strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
            <Bar dataKey="done" stackId="q" fill={SLATE} stroke="var(--cr-surface)" strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
            <Bar dataKey="poor" stackId="q" fill={PLUM} stroke="var(--cr-surface)" strokeWidth={1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="cr-legend" aria-label="Rep quality key">
        <span className="cr-legend__item"><span className="cr-legend__swatch cr-legend__swatch--max" /> Max strength</span>
        <span className="cr-legend__item"><span className="cr-legend__swatch cr-legend__swatch--done" /> Completed</span>
        <span className="cr-legend__item"><span className="cr-legend__swatch cr-legend__swatch--poor" /> Poor quality</span>
      </div>
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
