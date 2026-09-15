import { memo, useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MIN_PROGRESSION_POINTS, progressionSentence, shortDay, type LoadPoint } from "./progression";

/**
 * Load progression — the trend the profile's old machine pop-up opened on,
 * kept when the pop-up became the one machine window (Sep 2026).
 *
 * One line, one colour, no legend: the title names the series. Blue, because
 * blue is load movement everywhere else in the app (the Journey grid's ▲2).
 * The sentence above it carries the claim and its sample; under two sessions
 * there is no line at all, only the sentence saying why.
 */

const LINE = "var(--eq-live)";
const GRID = "var(--eq-border)";
const MUTED = "var(--eq-ink-muted)";

const axis = {
  tick: { fontSize: 10.5, fill: MUTED },
  axisLine: false as const,
  tickLine: false as const,
};

type Row = LoadPoint & { label: string };

function Tip({ active, payload }: { active?: boolean; payload?: { payload?: Row }[] }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  const effort =
    p.reps !== null && p.reps > 0 ? `${p.reps} reps` : p.seconds !== null && p.seconds > 0 ? `${p.seconds} sec hold` : null;
  return (
    <div className="eq-prog__tip" role="status">
      <span>{p.label}</span>
      <b>{p.weight} lb</b>
      {effort && <span>{effort}</span>}
    </div>
  );
}

export const LoadProgressionCard = memo(function LoadProgressionCard({ points }: { points: LoadPoint[] }) {
  const data = useMemo<Row[]>(() => points.map((p) => ({ ...p, label: shortDay(p.day) })), [points]);
  const sentence = progressionSentence(points);
  const enough = points.length >= MIN_PROGRESSION_POINTS;

  return (
    <section className="eq-card eq-prog" aria-label="Load progression">
      <header className="eq-card__head">
        <h3 className="eq-card__title">Load progression</h3>
      </header>
      <div className="eq-card__body">
        <p className={enough ? "eq-prog__lead" : "eq-use__never"}>{sentence}</p>
        {enough && (
          <div className="eq-prog__chart" role="img" aria-label={`Chart of the heaviest performed load per session: ${sentence}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={28} />
                <YAxis
                  {...axis}
                  width={40}
                  allowDecimals={false}
                  domain={[(min: number) => Math.max(0, Math.floor(min - 5)), (max: number) => Math.ceil(max + 5)]}
                />
                <Tooltip
                  cursor={{ stroke: "var(--eq-border-strong)" }}
                  content={(p) => (
                    <Tip active={p.active} payload={p.payload as unknown as { payload?: Row }[] | undefined} />
                  )}
                />
                <Line
                  type="linear"
                  dataKey="weight"
                  stroke={LINE}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: LINE, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: LINE, stroke: "var(--eq-surface)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
});
