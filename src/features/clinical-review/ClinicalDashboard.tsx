/**
 * The compiled report. A pure function of `Report` — no fetching, no
 * Firestore, which is what lets the harness render it with synthetic data.
 *
 * Reading order, top to bottom, the way a trainer prepares for a client:
 *   1. the headline numbers with their deltas
 *   2. what moves the needle — the ranked findings
 *   3. volume & tension over time
 *   4. the subjective × objective matrix (pick an outcome, read every input)
 *   5. where form breaks (heatmap)
 *   6. what is stuck (plateaus)
 */
import { useState, type ReactNode } from "react";
import { Printer, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import type { Report } from "./report";
import { rangeLabel } from "./report";
import type { RangePreset } from "./types";
import { BrandTiles } from "../client-profile/BrandTiles";
import { KpiStrip, InsightCards, CorrelationMatrix, FormHeatmapPanel, PlateauPanel, MethodNote } from "./panels";
import { QualityMixChart, TonnageChart, TutChart } from "./charts";
import { shortDateYear } from "./analytics";

export interface ClinicalDashboardProps {
  report: Report;
  clientName: string;
  presets: { key: RangePreset; label: string }[];
  onPreset: (preset: RangePreset) => void;
  onRegenerate: () => void;
  loading?: boolean;
}

function Section({ title, sub, children, right }: { title: string; sub?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="cr-section">
      <div className="cr-section__head">
        <h3 className="cr-section__title">{title}</h3>
        {sub && <span className="cr-section__sub">{sub}</span>}
        {right && (
          <>
            <span className="cr-section__spacer" />
            {right}
          </>
        )}
      </div>
      {children}
    </section>
  );
}

export function ClinicalDashboard({ report, clientName, presets, onPreset, onRegenerate, loading = false }: ClinicalDashboardProps) {
  const [showAll, setShowAll] = useState(false);
  const { summary } = report;
  const generated = new Date(report.generatedAt);
  const insights = showAll ? report.allInsights : report.insights;
  const tutWorthShowing = summary.tutCoverage >= 0.25 && summary.tutSeconds > 0;

  return (
    <div className="cr" style={{ opacity: loading ? 0.6 : 1, transition: "opacity 160ms ease" }} aria-busy={loading}>
      {/* ---- sticky report bar ---- */}
      <div className="cr-bar">
        <div className="cr-bar__title">
          <BrandTiles size={7} gap={2} />
          <span className="cr-bar__name">Clinical review</span>
          <span className="cr-bar__meta">
            {clientName} · {rangeLabel(report.range)}
            {summary.firstDate && summary.lastDate ? ` · ${shortDateYear(summary.firstDate)} → ${shortDateYear(summary.lastDate)}` : ""} · generated{" "}
            {generated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
        <span className="cr-bar__spacer" />
        <div className="cr-seg" role="radiogroup" aria-label="Date range">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={report.range.preset === p.key}
              className={`cr-seg__btn ${report.range.preset === p.key ? "is-on" : ""}`}
              onClick={() => onPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" className="cr-iconbtn" onClick={onRegenerate} title="Reload from the database">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
        <button type="button" className="cr-iconbtn" onClick={() => window.print()} title="Print or save as PDF">
          <Printer size={13} /> Print
        </button>
      </div>

      {summary.sessions === 0 ? (
        <div className="cr-empty">No completed sessions with logged sets in this range. Widen the range or pick All time.</div>
      ) : (
        <>
          {/* ---- 1. headline numbers ---- */}
          <KpiStrip summary={summary} prior={report.prior} />

          {/* ---- 2. findings ---- */}
          <Section
            title="What moves the needle"
            sub={`${report.allInsights.length} findings · ranked by effect size and evidence`}
            right={
              report.allInsights.length > report.insights.length ? (
                <button type="button" className="cr-iconbtn" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {showAll ? "Top findings" : `All ${report.allInsights.length}`}
                </button>
              ) : undefined
            }
          >
            <InsightCards insights={insights} emptyHint="No pattern clears the evidence bar yet. Findings appear once a level has three or more sessions and the effect is meaningful." />
          </Section>

          {/* ---- 3. volume & tension ---- */}
          <Section title="Volume & tension" sub={`per ${report.trendPeriod} — three honest axes, not one dual axis`}>
            <div className="cr-charts">
              <div className="cr-card">
                <p className="cr-card__title">Tonnage</p>
                <p className="cr-card__sub">lb × reps, non-timed sets</p>
                <TonnageChart weeks={report.weeks} period={report.trendPeriod} />
              </div>
              <div className="cr-card">
                <p className="cr-card__title">Time under tension</p>
                <p className="cr-card__sub">{tutWorthShowing ? `minutes · recorded on ${Math.round(summary.tutCoverage * 100)}% of sets` : "not recorded on enough sets yet"}</p>
                {tutWorthShowing ? <TutChart weeks={report.weeks} period={report.trendPeriod} /> : <div className="cr-empty" style={{ height: 190, display: "grid", placeItems: "center" }}>Fills in as timed sets are logged.</div>}
              </div>
              <div className="cr-card">
                <p className="cr-card__title">Rep quality mix</p>
                <p className="cr-card__sub">share of rated sets</p>
                <QualityMixChart weeks={report.weeks} period={report.trendPeriod} />
              </div>
            </div>
          </Section>

          {/* ---- 4. matrix ---- */}
          <Section title="How the client arrived vs how the session went" sub="pick an outcome; each card shows it by the client's state, with the session count behind every bar">
            <CorrelationMatrix correlations={report.correlations} />
          </Section>

          {/* ---- 5. heatmap ---- */}
          <Section title="Where form breaks" sub="poor-quality share by machine over time">
            <FormHeatmapPanel heatmap={report.heatmap} period={report.heatmapPeriod} />
          </Section>

          {/* ---- 6. plateaus ---- */}
          <Section title="Progression check" sub="0% load change over the range, current stalls, and regressions">
            <PlateauPanel plateaus={report.plateaus} />
          </Section>

          <MethodNote />
        </>
      )}
    </div>
  );
}
