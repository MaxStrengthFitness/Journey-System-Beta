/**
 * Panels — the dashboard's building blocks. Each takes a slice of `Report`
 * and renders it; none fetches or computes beyond formatting.
 */
import { memo, useMemo, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Table2, LayoutGrid } from "lucide-react";
import type { Correlation, Heatmap, Insight, LevelStat, MachinePlateau, OutcomeKey, Summary } from "./types";
import { compact, formatMinutes, OUTCOMES, OUTCOME_BY_KEY, pct, shortDate, shortDateYear, signed } from "./analytics";
import { deltaPct } from "./report";
import { Sparkline } from "./charts";

/* ------------------------------------------------------------------ *
 * KPI strip
 * ------------------------------------------------------------------ */

function Delta({ value, unit = "%", goodWhenUp = true, digits = 0 }: { value: number | null; unit?: string; goodWhenUp?: boolean; digits?: number }) {
  if (value === null || !Number.isFinite(value)) return null;
  const flat = Math.abs(value) < 0.5;
  const cls = flat ? "cr-delta--flat" : (value > 0) === goodWhenUp ? "cr-delta--up" : "cr-delta--down";
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`cr-delta ${cls}`}>
      <Icon size={11} strokeWidth={2.5} style={{ display: "inline", verticalAlign: "-1px" }} /> {signed(value, digits, unit)}
    </span>
  );
}

function Kpi({ label, value, unit, sub, hero }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; hero?: boolean }) {
  return (
    <div className={`cr-kpi ${hero ? "cr-kpi--hero" : ""}`}>
      <span className="cr-kpi__label">{label}</span>
      <span className="cr-kpi__value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {sub && <span className="cr-kpi__sub">{sub}</span>}
    </div>
  );
}

export function KpiStrip({ summary, prior }: { summary: Summary; prior: Summary | null }) {
  const s = summary;
  const priorNote = prior ? "vs prior period" : null;
  return (
    <div className="cr-kpis" role="list" aria-label="Headline numbers">
      <Kpi
        label="Sessions"
        value={s.sessions}
        sub={
          <>
            {s.sessionsPerWeek !== null && <span>{s.sessionsPerWeek.toFixed(1)} / week</span>}
            {prior && <Delta value={s.sessions - prior.sessions} unit="" />}
          </>
        }
      />
      <Kpi
        label="Tonnage"
        value={compact(s.tonnage)}
        unit="lb"
        hero
        sub={
          <>
            <span>{s.reps.toLocaleString()} reps</span>
            {prior && <Delta value={deltaPct(s.tonnage, prior.tonnage)} />}
          </>
        }
      />
      <Kpi
        label="Time under tension"
        value={s.tutSeconds > 0 ? formatMinutes(s.tutSeconds) : "—"}
        sub={
          s.tutCoverage < 0.999 ? (
            <span>recorded on {Math.round(s.tutCoverage * 100)}% of sets</span>
          ) : (
            prior && <Delta value={deltaPct(s.tutSeconds, prior.tutSeconds)} />
          )
        }
      />
      <Kpi
        label="Max strength"
        value={s.maxRate === null ? "—" : `${Math.round(s.maxRate * 100)}%`}
        sub={
          <>
            <span>{s.setsMax} of {s.setsRated} rated sets</span>
            {prior && s.maxRate !== null && prior.maxRate !== null && <Delta value={(s.maxRate - prior.maxRate) * 100} unit=" pts" />}
          </>
        }
      />
      <Kpi
        label="Poor quality"
        value={s.poorRate === null ? "—" : `${Math.round(s.poorRate * 100)}%`}
        sub={
          <>
            <span>{s.setsPoor} sets</span>
            {prior && s.poorRate !== null && prior.poorRate !== null && <Delta value={(s.poorRate - prior.poorRate) * 100} unit=" pts" goodWhenUp={false} />}
          </>
        }
      />
      <Kpi
        label="Median rest"
        value={s.medianRestDays === null ? "—" : s.medianRestDays}
        unit={s.medianRestDays === null ? undefined : "days"}
        sub={s.longestGapDays !== null ? <span>longest gap {s.longestGapDays} d</span> : undefined}
      />
      <Kpi
        label="Check-ins"
        value={`${Math.round(s.checkInCoverage * 100)}%`}
        sub={<span>of sessions have sleep / stress / energy</span>}
      />
      <Kpi
        label="Span"
        value={s.spanDays}
        unit="days"
        sub={s.firstDate && s.lastDate ? <span>{shortDate(s.firstDate)} → {shortDate(s.lastDate)}</span> : priorNote ?? undefined}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Insight cards
 * ------------------------------------------------------------------ */

const KIND_LABEL: Record<Insight["kind"], string> = {
  correlation: "Pattern",
  rhythm: "Rhythm",
  plateau: "Progression",
  volume: "Volume",
  coverage: "Data coverage",
  form: "Form",
};

export function InsightCards({ insights, emptyHint }: { insights: Insight[]; emptyHint: string }) {
  if (!insights.length) return <div className="cr-empty">{emptyHint}</div>;
  return (
    <div className="cr-insights">
      {insights.map((i) => (
        <article key={i.id} className={`cr-insight cr-insight--${i.tone}`}>
          <span className="cr-insight__kind">{KIND_LABEL[i.kind]}</span>
          <h4 className="cr-insight__title">{i.title}</h4>
          <p className="cr-insight__body">{i.body}</p>
          <span className="cr-insight__evidence">{i.evidence}</span>
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Subjective × objective matrix
 * ------------------------------------------------------------------ */

const SUBJECTIVE_ORDER = ["sleep", "stress", "energy", "mood", "stiffness", "postFeel"];
const RHYTHM_ORDER = ["restGap", "timeOfDay", "dayOfWeek"];
const CONTEXT_ORDER = ["trainer", "crossTrain"];

// Components rendered in lists are memo()-wrapped: this repo has no @types/react,
// so a bare function component's props type would reject the `key` attribute.
const LevelBar = memo(function LevelBar({ level, outcome, maxAbs }: { level: LevelStat; outcome: OutcomeKey; maxAbs: number }) {
  const spec = OUTCOME_BY_KEY[outcome];
  const signedScale = spec.unit === "%";
  const v = level.mean;
  const thin = level.confidence === "insufficient";
  let width = 0;
  if (v !== null && maxAbs > 0) width = Math.min(100, (Math.abs(v) / maxAbs) * (signedScale ? 50 : 100));
  const isBad = level.delta !== null && Math.abs(level.delta) >= spec.meaningfulDelta && (spec.higherIsBetter ? level.delta < 0 : level.delta > 0);
  const isGood = level.delta !== null && Math.abs(level.delta) >= spec.meaningfulDelta && (spec.higherIsBetter ? level.delta > 0 : level.delta < 0);
  const barCls = ["cr-level__bar", isBad && !thin ? "cr-level__bar--poor" : "", isGood && !thin ? "cr-level__bar--good" : "", thin ? "cr-level__bar--thin" : "", v !== null && v < 0 ? "is-neg" : ""]
    .filter(Boolean)
    .join(" ");
  const label =
    v === null ? "—" : spec.unit === "pp" ? `${Math.round(v)}%` : spec.unit === "%" ? signed(v, 0, "%") : v.toFixed(1);
  return (
    <div className="cr-level" title={`${level.label}: ${label} (${level.n} sessions, ${level.confidence})`}>
      <span className="cr-level__label">
        <span className={`cr-conf cr-conf--${level.confidence}`} aria-hidden="true" />
        <span>{level.label}</span>
        <span className="cr-level__n">n={level.n}</span>
      </span>
      <div className={`cr-level__track ${signedScale ? "cr-level__track--signed" : ""}`} aria-hidden="true">
        <div className={barCls} style={{ width: `${width}%` }} />
      </div>
      <span className={`cr-level__value ${thin ? "cr-level__value--muted" : ""}`}>{label}</span>
    </div>
  );
});

const DimensionCard = memo(function DimensionCard({ c }: { c: Correlation }) {
  const spec = OUTCOME_BY_KEY[c.outcome];
  const maxAbs = Math.max(1e-9, ...c.levels.map((l) => Math.abs(l.mean ?? 0)));
  return (
    <div className="cr-card cr-dim">
      <div className="cr-dim__head">
        <span className="cr-dim__title">{c.dimensionLabel}</span>
        <span className="cr-dim__n">{c.n} sessions</span>
      </div>
      <div className="cr-levels">
        {c.levels.map((l) => (
          <LevelBar key={l.level} level={l} outcome={c.outcome} maxAbs={maxAbs} />
        ))}
      </div>
      <div className="cr-dim__foot">
        {c.overallMean !== null && (
          <>
            Overall {spec.unit === "pp" ? `${Math.round(c.overallMean)}%` : spec.unit === "%" ? signed(c.overallMean, 0, "%") : c.overallMean.toFixed(1)}
            {c.spread !== null && ` · spread ${spec.unit === "pp" ? `${Math.round(c.spread)} pts` : spec.unit === "%" ? `${Math.round(c.spread)}%` : c.spread.toFixed(1)}`}
          </>
        )}
      </div>
    </div>
  );
});

export function CorrelationMatrix({ correlations }: { correlations: Correlation[] }) {
  const available = useMemo(() => OUTCOMES.filter((o) => correlations.some((c) => c.outcome === o.key)), [correlations]);
  const [outcome, setOutcome] = useState<OutcomeKey>(available[0]?.key ?? "poorRate");
  const active = available.some((o) => o.key === outcome) ? outcome : available[0]?.key;
  if (!available.length) return <div className="cr-empty">No session has both a check-in and rated sets yet — the matrix fills in as briefings are completed.</div>;

  const rows = correlations.filter((c) => c.outcome === active);
  const order = [...SUBJECTIVE_ORDER, ...RHYTHM_ORDER, ...CONTEXT_ORDER];
  rows.sort((a, b) => order.indexOf(a.dimension) - order.indexOf(b.dimension));
  const group = (keys: string[]) => rows.filter((r) => keys.includes(r.dimension));

  return (
    <div className="cr-section" style={{ gap: 10 }}>
      <div className="cr-seg" role="radiogroup" aria-label="Outcome">
        {available.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={o.key === active} className={`cr-seg__btn ${o.key === active ? "is-on" : ""}`} onClick={() => setOutcome(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
      {[
        { title: "How the client arrived", items: group(SUBJECTIVE_ORDER) },
        { title: "Rhythm", items: group(RHYTHM_ORDER) },
        { title: "Context", items: group(CONTEXT_ORDER) },
      ]
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.title} className="cr-section" style={{ gap: 8 }}>
            <span className="cr-section__sub" style={{ fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 10.5 }}>
              {g.title}
            </span>
            <div className="cr-matrix">
              {g.items.map((c) => (
                <DimensionCard key={`${c.dimension}:${c.outcome}`} c={c} />
              ))}
            </div>
          </div>
        ))}
      <div className="cr-legend">
        <span className="cr-legend__item"><span className="cr-conf cr-conf--solid" /> 6+ sessions</span>
        <span className="cr-legend__item"><span className="cr-conf cr-conf--early" /> 3–5 sessions (early)</span>
        <span className="cr-legend__item"><span className="cr-conf" /> under 3 (shown, not trusted)</span>
        <span className="cr-legend__item"><span className="cr-legend__swatch cr-legend__swatch--poor" /> worse than the client's own average</span>
        <span className="cr-legend__item"><span className="cr-legend__swatch cr-legend__swatch--max" /> better</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Form-breakdown heatmap
 * ------------------------------------------------------------------ */

/** Sequential plum ramp — one hue, light → dark, five steps + empty. */
function heatStyle(rate: number | null, maxRate: number): { background: string; color: string; ink: boolean } {
  if (rate === null) return { background: "transparent", color: "var(--cr-ink-faint)", ink: false };
  if (rate === 0) return { background: "var(--cr-surface-2)", color: "var(--cr-ink-2)", ink: false };
  const top = Math.max(0.25, maxRate);
  const t = Math.min(1, rate / top); // 0..1
  const alpha = 0.18 + t * 0.82;
  return { background: `color-mix(in srgb, var(--cr-poor) ${Math.round(alpha * 100)}%, var(--cr-surface))`, color: alpha > 0.55 ? "#fff" : "var(--cr-ink)", ink: alpha > 0.55 };
}

export function FormHeatmapPanel({ heatmap, period }: { heatmap: Heatmap; period: "week" | "month" }) {
  const [view, setView] = useState<"grid" | "table">("grid");
  if (!heatmap.rows.length) return <div className="cr-empty">No rated sets in this range — quality ratings come from live sessions, not imported charts.</div>;
  const cols = heatmap.columns;
  const template = `minmax(150px, max-content) repeat(${cols.length}, 46px) 60px`;
  const steps = [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => heatStyle(t * Math.max(0.25, heatmap.maxRate), heatmap.maxRate));
  return (
    <div className="cr-card">
      <div className="cr-section__head" style={{ marginBottom: 10 }}>
        <div>
          <p className="cr-card__title">Poor-quality share by machine, per {period}</p>
          <p className="cr-card__sub" style={{ marginBottom: 0 }}>
            Darker = a larger share of that machine's rated sets broke form. Cells with fewer than four sets show the count (poor / rated). Worst machines float to the top.
          </p>
        </div>
        <span className="cr-section__spacer" />
        <div className="cr-scale" aria-label="Scale">
          <span>0%</span>
          {steps.map((s, i) => (
            <span key={i} className="cr-scale__step" style={{ background: s.background }} />
          ))}
          <span>{Math.round(Math.max(0.25, heatmap.maxRate) * 100)}%</span>
        </div>
        <button type="button" className="cr-iconbtn" onClick={() => setView((v) => (v === "grid" ? "table" : "grid"))} aria-pressed={view === "table"}>
          {view === "grid" ? <Table2 size={14} /> : <LayoutGrid size={14} />} {view === "grid" ? "Table" : "Grid"}
        </button>
      </div>

      {view === "grid" ? (
        <div className="cr-heat">
          <div className="cr-heat__grid" style={{ gridTemplateColumns: template }} role="table" aria-label="Form breakdown heatmap">
            <div className="cr-heat__colhead" role="columnheader" style={{ textAlign: "left" }}>Machine</div>
            {cols.map((c) => (
              <div key={c.key} className="cr-heat__colhead" role="columnheader">{c.label}</div>
            ))}
            <div className="cr-heat__colhead" role="columnheader">Range</div>
            {heatmap.rows.map((r) => (
              <HeatRowView key={r.machineId} row={r} maxRate={heatmap.maxRate} />
            ))}
            <div className="cr-heat__divider" aria-hidden="true" />
            {heatmap.groups.map((g) => (
              <HeatRowView key={g.machineId} row={g} maxRate={heatmap.maxRate} group />
            ))}
          </div>
        </div>
      ) : (
        <div className="cr-heat">
          <table className="cr-heat__table">
            <thead>
              <tr>
                <th>Machine</th>
                {cols.map((c) => <th key={c.key}>{c.label}</th>)}
                <th>Range</th>
              </tr>
            </thead>
            <tbody>
              {[...heatmap.rows, ...heatmap.groups].map((r) => (
                <tr key={r.machineId}>
                  <td>{r.machineName}</td>
                  {r.cells.map((c, i) => <td key={i}>{c.rated ? `${c.poor}/${c.rated}` : "—"}</td>)}
                  <td><b>{r.total.rated ? `${r.total.poor}/${r.total.rated} (${pct(r.total.rate)})` : "—"}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const HeatRowView = memo(function HeatRowView({ row, maxRate, group = false }: { row: Heatmap["rows"][number]; maxRate: number; group?: boolean }) {
  return (
    <div className={`contents cr-heat__row ${group ? "cr-heat__row--group" : ""}`} role="row" style={{ display: "contents" }}>
      <div className="cr-heat__machine" role="rowheader">
        {row.machineName}
        {!group && <span className="cr-heat__group">{row.group}</span>}
      </div>
      {row.cells.map((c, i) => {
        const st = heatStyle(c.rate, maxRate);
        return (
          <div
            key={i}
            role="cell"
            className={`cr-heat__cell ${c.rated === 0 ? "cr-heat__cell--empty" : ""} ${st.ink ? "is-ink" : ""}`}
            style={{ background: st.background, color: st.color }}
            title={c.rated ? `${c.poor} of ${c.rated} sets poor (${pct(c.rate)})` : "not performed"}
          >
            {/* One set a week is the norm for a single-set protocol, so a
                weekly cell is usually 0 or 1 poor set: show the count, not a
                percentage that would read as 0% / 100%. Percentages start
                once a cell holds four or more rated sets. */}
            {c.rated ? (c.rated >= 4 ? `${Math.round((c.rate ?? 0) * 100)}` : `${c.poor}/${c.rated}`) : "·"}
          </div>
        );
      })}
      {(() => {
        const st = heatStyle(row.total.rate, maxRate);
        return (
          <div role="cell" className={`cr-heat__cell cr-heat__cell--total ${st.ink ? "is-ink" : ""}`} style={{ background: st.background, color: st.color }} title={`${row.total.poor} of ${row.total.rated} sets`}>
            {pct(row.total.rate)}
          </div>
        );
      })()}
    </div>
  );
});

/* ------------------------------------------------------------------ *
 * Plateaus
 * ------------------------------------------------------------------ */

export function PlateauPanel({ plateaus }: { plateaus: MachinePlateau[] }) {
  const flagged = plateaus.filter((p) => p.status === "plateau" || p.status === "regressing" || p.stalled);
  const moving = plateaus.filter((p) => p.status === "progressing" && !p.stalled);
  const thin = plateaus.filter((p) => p.status === "insufficient");
  if (!plateaus.length) return <div className="cr-empty">No machine was logged in this range.</div>;
  return (
    <div className="cr-section" style={{ gap: 10 }}>
      {flagged.length ? (
        <div className="cr-plateaus">
          {flagged.map((p) => <PlateauCard key={p.machineId} p={p} />)}
        </div>
      ) : (
        <div className="cr-empty">Every machine with four or more sessions moved in this range. Nothing is stuck.</div>
      )}
      {moving.length > 0 && (
        <div className="cr-card" style={{ padding: "10px 14px" }}>
          <p className="cr-card__title" style={{ marginBottom: 6 }}>Progressing ({moving.length})</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {moving.map((p) => (
              <span key={p.machineId} className="cr-pill cr-pill--progressing" title={`${p.firstWeight} → ${p.lastWeight} lb over ${p.sessions} sessions`}>
                {p.machineName} {p.weightChangePct !== null && p.weightChangePct !== 0 ? signed(p.weightChangePct, 0, "%") : "+reps"}
              </span>
            ))}
          </div>
        </div>
      )}
      {thin.length > 0 && (
        <p className="cr-section__sub">
          Not enough sessions to judge: {thin.map((p) => p.machineName).join(", ")}.
        </p>
      )}
    </div>
  );
}

const PlateauCard = memo(function PlateauCard({ p }: { p: MachinePlateau }) {
  const pill = p.status === "plateau" ? "plateau" : p.status === "regressing" ? "regressing" : "stalled";
  const pillLabel = p.status === "plateau" ? "0% over range" : p.status === "regressing" ? "Regressing" : `Stalled ${p.sessionsAtCurrentWeight} sessions`;
  const outcomeUnit = p.isTSC ? "s hold" : " reps";
  return (
    <div className="cr-card cr-plateau">
      <div>
        <div className="cr-plateau__name">
          {p.machineName}
          <span className={`cr-pill cr-pill--${pill}`}>{pillLabel}</span>
        </div>
        <div className="cr-plateau__meta">
          {p.lastWeight !== null && (
            <>
              <b>{p.lastWeight} lb</b>
              {p.firstWeight !== null && p.firstWeight !== p.lastWeight && <> (from {p.firstWeight})</>}
              {" · "}
            </>
          )}
          {p.repsAtCurrentFirst !== null && p.repsAtCurrentLast !== null && (
            <>
              {p.repsAtCurrentFirst === p.repsAtCurrentLast ? `${p.repsAtCurrentLast}${outcomeUnit} every time` : `${p.repsAtCurrentFirst} → ${p.repsAtCurrentLast}${outcomeUnit}`}
              {" · "}
            </>
          )}
          {p.sessions} sessions{p.firstDate && p.lastDate ? ` · ${shortDate(p.firstDate)} → ${shortDateYear(p.lastDate)}` : ""}
          {p.poorRate !== null && p.poorRate > 0 && ` · ${Math.round(p.poorRate * 100)}% poor quality`}
        </div>
      </div>
      <Sparkline series={p.series} />
    </div>
  );
});

/* ------------------------------------------------------------------ *
 * Methodology footnote
 * ------------------------------------------------------------------ */

export function MethodNote() {
  return (
    <p className="cr-method">
      <b>How to read this.</b> Rates (max strength, poor quality) are shares of the sets that carried a quality rating. Tonnage, reps and time
      under tension are compared as an <b>index against the client's own trailing baseline</b> (the five sessions before each one), so a session
      counts as strong or weak relative to where the client was — a rising trend does not masquerade as a correlation. Every level shows its
      session count; anything under three is displayed but never turned into a finding. Time under tension only counts sets that recorded it.
    </p>
  );
}
