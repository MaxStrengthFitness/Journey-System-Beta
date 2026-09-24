/**
 * Panels — the Deep Dive's building blocks. Each takes a slice of `Report`
 * and renders it; none fetches or computes beyond formatting.
 *
 * Order on the page (ClinicalDashboard.tsx), and the question each answers:
 *   Progression stalls     — what is stuck?
 *   Readiness vs output    — does how she arrives change how she lifts?
 *   Attendance rhythm      — is she coming in as she usually does?
 *   Pain & incidents       — what hurt, when, and what does her Pulse say?
 *   Time under tension     — is the work getting longer?
 *   Where form breaks      — which machines, which weeks?
 *
 * Every panel obeys the rule of three: under `RULE_OF_THREE` sessions it
 * says so and shows no number that could be mistaken for a finding.
 */
import { memo, useMemo, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Table2, LayoutGrid, AlertTriangle } from "lucide-react";
import type { AttendanceRhythm, Correlation, Heatmap, Insight, LevelStat, MachinePlateau, OutcomeKey, PainTimeline, PulseTrend, Summary } from "./types";
import { RULE_OF_THREE } from "./types";
import { DIMENSION_BY_KEY, NOT_ENOUGH_SESSIONS, OUTCOMES, OUTCOME_BY_KEY, dialLevelKey, formatMinutes, pct, shortDate, signed } from "./analytics";
import { stallSentence } from "./insights";
import { deltaPct } from "./report";
import { Sparkline } from "./charts";

/* ------------------------------------------------------------------ *
 * The frame's fixed line
 * ------------------------------------------------------------------ */

export const DEEP_DIVE_CAVEAT =
  "Built by the app from this client's sessions and Pulse. It can be wrong — treat every line as a question to ask, not a fact to act on. Nothing under three sessions counts.";

export function CaveatLine() {
  return (
    <p className="cr-caveat" role="note">
      <AlertTriangle size={14} aria-hidden="true" />
      <span>{DEEP_DIVE_CAVEAT}</span>
    </p>
  );
}

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

/** Headline numbers. Tonnage is gone (reporting round); the sets' own facts stay. */
export function KpiStrip({ summary, prior }: { summary: Summary; prior: Summary | null }) {
  const s = summary;
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
        label="Time under tension"
        value={s.tutSeconds > 0 ? formatMinutes(s.tutSeconds) : "—"}
        hero
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
      <Kpi label="Dials tapped" value={`${Math.round(s.checkInCoverage * 100)}%`} sub={<span>of sessions asked sleep, energy, recovery, stress or a region</span>} />
      <Kpi
        label="Span"
        value={s.spanDays}
        unit="days"
        sub={s.firstDate && s.lastDate ? <span>{shortDate(s.firstDate)} → {shortDate(s.lastDate)}</span> : undefined}
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
 * 1. Progression stalls
 * ------------------------------------------------------------------ */

/**
 * One sentence per machine. Stalls and regressions first, progress last,
 * and anything under three sessions says so instead of a verdict.
 */
export function StallPanel({ plateaus }: { plateaus: MachinePlateau[] }) {
  if (!plateaus.length) return <div className="cr-empty">No machine was logged in this range.</div>;
  const stuck = plateaus.filter((p) => p.status === "plateau" || p.status === "regressing" || (p.stalled && p.status !== "insufficient"));
  const moving = plateaus.filter((p) => p.status === "progressing" && !p.stalled);
  const thin = plateaus.filter((p) => p.status === "insufficient");
  return (
    <div className="cr-section" style={{ gap: 10 }}>
      {stuck.length ? (
        <ul className="cr-stalls" aria-label="Machines that have stalled or slipped">
          {stuck.map((p) => (
            <StallRow key={p.machineId} p={p} />
          ))}
        </ul>
      ) : (
        <div className="cr-empty">Every machine with {RULE_OF_THREE} or more sessions moved in this range. Nothing is stuck.</div>
      )}
      {moving.length > 0 && (
        <div className="cr-card" style={{ padding: "10px 14px" }}>
          <p className="cr-card__title" style={{ marginBottom: 6 }}>Progressing ({moving.length})</p>
          <ul className="cr-sentences">
            {moving.map((p) => (
              <li key={p.machineId}>{stallSentence(p)}</li>
            ))}
          </ul>
        </div>
      )}
      {thin.length > 0 && (
        <p className="cr-section__sub">
          {NOT_ENOUGH_SESSIONS.charAt(0).toUpperCase() + NOT_ENOUGH_SESSIONS.slice(1)} on {thin.map((p) => p.machineName).join(", ")}.
        </p>
      )}
    </div>
  );
}

const StallRow = memo(function StallRow({ p }: { p: MachinePlateau }) {
  const pill = p.status === "plateau" ? "plateau" : p.status === "regressing" ? "regressing" : "stalled";
  const pillLabel = p.status === "plateau" ? "Same load all range" : p.status === "regressing" ? "Slipping" : `Stalled ${p.sessionsAtCurrentWeight} sessions`;
  return (
    <li className="cr-card cr-stall">
      <div className="cr-stall__text">
        <span className="cr-stall__sentence">{stallSentence(p)}</span>
        <span className="cr-stall__meta">
          <span className={`cr-pill cr-pill--${pill}`}>{pillLabel}</span>
          {p.firstDate && p.lastDate ? `${p.sessions} sessions · ${shortDate(p.firstDate)} → ${shortDate(p.lastDate)}` : `${p.sessions} sessions`}
          {p.poorRate !== null && p.poorRate > 0 && ` · ${Math.round(p.poorRate * 100)}% poor quality`}
        </span>
      </div>
      <Sparkline series={p.series} />
    </li>
  );
});

/* ------------------------------------------------------------------ *
 * 2. Readiness vs output — the Dial × the sets
 * ------------------------------------------------------------------ */

const SUBJECTIVE_ORDER = ["sleep", "energy", "recovery", "stress", "stiffness", "dose"];
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
  if (v !== null && maxAbs > 0 && !thin) width = Math.min(100, (Math.abs(v) / maxAbs) * (signedScale ? 50 : 100));
  const isBad = level.delta !== null && Math.abs(level.delta) >= spec.meaningfulDelta && (spec.higherIsBetter ? level.delta < 0 : level.delta > 0);
  const isGood = level.delta !== null && Math.abs(level.delta) >= spec.meaningfulDelta && (spec.higherIsBetter ? level.delta > 0 : level.delta < 0);
  const barCls = ["cr-level__bar", isBad && !thin ? "cr-level__bar--poor" : "", isGood && !thin ? "cr-level__bar--good" : "", v !== null && v < 0 ? "is-neg" : ""]
    .filter(Boolean)
    .join(" ");
  // The rule of three, on the bar itself: a thin level draws no bar and no
  // number — a value there would read as a finding.
  const label = thin ? `needs ${RULE_OF_THREE}` : v === null ? "—" : spec.unit === "pp" ? `${Math.round(v)}%` : signed(v, 0, "%");
  const title = thin ? `${level.label}: ${level.n} ${level.n === 1 ? "session" : "sessions"} — ${NOT_ENOUGH_SESSIONS}` : `${level.label}: ${label} (${level.n} sessions, ${level.confidence})`;
  return (
    <div className="cr-level" title={title}>
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
  const dim = DIMENSION_BY_KEY[c.dimension];
  const solid = c.levels.filter((l) => l.confidence !== "insufficient");
  const maxAbs = Math.max(1e-9, ...solid.map((l) => Math.abs(l.mean ?? 0)));
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
        {solid.length === 0 ? (
          <>No level has {RULE_OF_THREE} sessions yet.</>
        ) : (
          c.overallMean !== null && (
            <>
              Overall {spec.unit === "pp" ? `${Math.round(c.overallMean)}%` : signed(c.overallMean, 0, "%")}
              {c.spread !== null && ` · spread ${spec.unit === "pp" ? `${Math.round(c.spread)} pts` : `${Math.round(c.spread)}%`}`}
            </>
          )
        )}
        {dim?.scale && <div className="cr-dim__key">{dialLevelKey(dim.scale)}</div>}
      </div>
    </div>
  );
});

export function CorrelationMatrix({ correlations }: { correlations: Correlation[] }) {
  const available = useMemo(() => OUTCOMES.filter((o) => correlations.some((c) => c.outcome === o.key)), [correlations]);
  const [outcome, setOutcome] = useState<OutcomeKey>(available[0]?.key ?? "poorRate");
  const active = available.some((o) => o.key === outcome) ? outcome : available[0]?.key;
  if (!available.length) return <div className="cr-empty">No session has both a Dial reading and rated sets yet — this fills in as briefings are tapped. {NOT_ENOUGH_SESSIONS}.</div>;

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
        { title: "How the client arrived, on the Dial", items: group(SUBJECTIVE_ORDER) },
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
        <span className="cr-legend__item"><span className="cr-conf cr-conf--early" /> 3–5 sessions (early signal)</span>
        <span className="cr-legend__item"><span className="cr-conf" /> under {RULE_OF_THREE} — {NOT_ENOUGH_SESSIONS}</span>
        <span className="cr-legend__item"><span className="cr-legend__swatch cr-legend__swatch--poor" /> worse than the client's own average</span>
        <span className="cr-legend__item"><span className="cr-legend__swatch cr-legend__swatch--max" /> better</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 3. Attendance rhythm
 * ------------------------------------------------------------------ */

export function AttendancePanel({ rhythm }: { rhythm: AttendanceRhythm }) {
  if (rhythm.status !== "ok") return <div className="cr-empty">{rhythm.sentence}</div>;
  return (
    <div className={`cr-card cr-rhythm ${rhythm.belowUsual ? "cr-rhythm--below" : ""}`}>
      <p className="cr-rhythm__sentence">{rhythm.sentence}</p>
      <p className="cr-card__sub" style={{ margin: 0 }}>
        {rhythm.sessions} sessions in range
        {rhythm.belowUsual === null ? " · too little history to say what \"usual\" is (needs eight weeks)" : rhythm.belowUsual ? "" : " · the last four weeks are on the usual pace"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 4. Pain & incidents + the Pulse trend
 * ------------------------------------------------------------------ */

export function PainPulsePanel({ pain, pulse }: { pain: PainTimeline; pulse: PulseTrend }) {
  return (
    <div className="cr-painpulse">
      <div className="cr-card">
        <p className="cr-card__title">Pain &amp; incidents</p>
        <p className="cr-card__sub">
          Every region below the centre of its Dial, every symptom flagged during a set, every incident. Oldest first.
          {pain.sessions > 0 && ` ${pain.quietSessions} of ${pain.sessions} sessions raised nothing.`}
        </p>
        {pain.events.length === 0 ? (
          <div className="cr-empty">{pain.sessions === 0 ? "No sessions in this range." : "Nothing hurt, nothing was flagged and no incident was filed in this range."}</div>
        ) : (
          <ol className="cr-timeline" aria-label="Pain and incident timeline">
            {pain.events.map((e, i) => (
              <li key={`${e.sessionId}:${e.kind}:${i}`} className={`cr-timeline__row cr-timeline__row--${e.kind}${e.dial === -2 ? " is-pain" : ""}`}>
                <span className="cr-timeline__date">{shortDate(e.date)}</span>
                <span className="cr-timeline__dot" aria-hidden="true" />
                <span className="cr-timeline__text">{e.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="cr-card">
        <p className="cr-card__title">Pulse trend</p>
        <p className="cr-card__sub">Each Pulse area, first full reading → latest (a full reading answers all three statements). The client's own account beside the sets.</p>
        {pulse.status === "unavailable" ? (
          <div className="cr-empty">Pulse history unavailable — the read did not complete. The sets above stand on their own.</div>
        ) : pulse.status === "none" ? (
          <div className="cr-empty">No Pulse saved for this client yet.</div>
        ) : (
          <>
            <ul className="cr-pulse" aria-label="Pulse trend by area">
              {pulse.areas.map((a) => (
                <li key={a.key} className={`cr-pulse__row ${a.latest ? `cr-pulse__row--${a.latest.rag}` : ""}`}>
                  <span className="cr-pulse__dot" aria-hidden="true" />
                  <span className="cr-pulse__text">
                    {/* The sentence always opens with the area's title. */}
                    <b>{a.title}</b>
                    {a.sentence.slice(a.title.length)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="cr-card__sub" style={{ margin: "8px 0 0" }}>
              {pulse.reports} saved {pulse.reports === 1 ? "Pulse" : "Pulses"}
              {!pulse.complete && " · older Pulses exist that this read did not reach"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 6. Form-breakdown heatmap
 * ------------------------------------------------------------------ */

/** Sequential plum ramp — one hue, light → dark, five steps + empty. */
function heatStyle(rate: number | null, maxRate: number): { background: string; color: string; ink: boolean } {
  if (rate === null) return { background: "transparent", color: "var(--cr-ink-faint)", ink: false };
  if (rate === 0) return { background: "var(--cr-surface-2)", color: "var(--cr-ink-2)", ink: false };
  const top = Math.max(0.25, maxRate);
  const t = Math.min(1, rate / top); // 0..1
  const alpha = 0.18 + t * 0.82;
  return { background: `color-mix(in srgb, var(--cr-poor) ${Math.round(alpha * 100)}%, var(--cr-surface))`, color: alpha > 0.55 ? "var(--cr-on-dark)" : "var(--cr-ink)", ink: alpha > 0.55 };
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
 * Methodology footnote
 * ------------------------------------------------------------------ */

export function MethodNote() {
  return (
    <p className="cr-method">
      <b>How to read this.</b> Rates (max strength, poor quality) are shares of the sets that carried a quality rating. Reps and time under tension
      are compared as an <b>index against the client's own trailing baseline</b> (the five sessions before each one), so a session counts as
      strong or weak relative to where the client was — a rising trend does not masquerade as a pattern. Sleep, energy, recovery, stress and how
      the session landed are read off the Dial, grouped below the centre · as usual · above it; sessions from before the Dial are converted onto
      the same axis. Every level shows its session count and <b>nothing under {RULE_OF_THREE} sessions is a finding</b>. Time under tension only
      counts sets that recorded it.
    </p>
  );
}
