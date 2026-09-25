/**
 * The compiled Kaizen Deep Dive. A pure function of `Report` — no fetching,
 * no Firestore, which is what lets a render test mount it with synthetic
 * data.
 *
 * Reading order, top to bottom, the way a trainer prepares off the floor —
 * in prep time, when a client stalls, or in an investigation (reporting
 * round, Sep 2026):
 *   0. the fixed caveat: the app built this, it can be wrong, rule of three
 *   1. the headline numbers with their deltas
 *   2. what moves the needle — the ranked findings
 *   3. Progression stalls
 *   4. Readiness vs output (the Dial × the sets)
 *   5. Attendance rhythm
 *   6. Pain & incidents + the Pulse trend
 *   7. Time under tension
 *   8. Where form breaks (the heat map), last
 */
import { useState, type ReactNode } from "react";
import { Printer, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import type { Report } from "./report";
import { rangeLabel } from "./report";
import type { RangePreset } from "./types";
import { RULE_OF_THREE } from "./types";
import { BrandTiles } from "../client-profile/BrandTiles";
import { AttendancePanel, CaveatLine, CorrelationMatrix, FormHeatmapPanel, InsightCards, KpiStrip, MethodNote, PainPulsePanel, StallPanel } from "./panels";
import { TutChart } from "./charts";
import { shortDateYear } from "./analytics";
import { allTimeLabel } from "../../lib/history-claims";
import type { HistoryCoverage } from "../../lib/prior-history";

export const DEEP_DIVE_TITLE = "Kaizen Deep Dive";

export interface ClinicalDashboardProps {
  report: Report;
  clientName: string;
  presets: { key: RangePreset; label: string }[];
  onPreset: (preset: RangePreset) => void;
  onRegenerate: () => void;
  loading?: boolean;
  /** How much of the client's story Journey holds; names the widest range. Cautious by default. */
  coverage?: HistoryCoverage;
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

export function ClinicalDashboard({
  report,
  clientName,
  presets,
  onPreset,
  onRegenerate,
  loading = false,
  coverage = "unknown",
}: ClinicalDashboardProps) {
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
          <span className="cr-bar__name">{DEEP_DIVE_TITLE}</span>
          <span className="cr-bar__meta">
            {clientName} · {rangeLabel(report.range, coverage)}
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

      {/* ---- 0. the fixed caveat, always, even on an empty range ---- */}
      <CaveatLine />

      {summary.sessions === 0 ? (
        <div className="cr-empty">
          No completed sessions with logged sets in this range. Widen the range or pick {allTimeLabel(coverage)}.
        </div>
      ) : (
        <>
          {/* ---- 1. headline numbers ---- */}
          <KpiStrip summary={summary} prior={report.prior} />

          {/* ---- 2. findings ---- */}
          <Section
            title="What moves the needle"
            sub={`${report.allInsights.length} findings · ranked by effect size and evidence · questions, not verdicts`}
            right={
              report.allInsights.length > report.insights.length ? (
                <button type="button" className="cr-iconbtn" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {showAll ? "Top findings" : `All ${report.allInsights.length}`}
                </button>
              ) : undefined
            }
          >
            <InsightCards
              insights={insights}
              emptyHint={`No pattern clears the evidence bar yet. Findings appear once a level has ${RULE_OF_THREE} or more sessions and the effect is meaningful.`}
            />
          </Section>

          {/* ---- 3. progression stalls ---- */}
          <Section title="Progression stalls" sub="machines at the same load with no gain — stalls and slips first, progress last">
            <StallPanel plateaus={report.plateaus} />
          </Section>

          {/* ---- 4. readiness vs output ---- */}
          <Section title="Readiness vs output" sub="pick an outcome; each card shows it by where the Dial sat, with the session count behind every bar">
            <CorrelationMatrix correlations={report.correlations} />
          </Section>

          {/* ---- 5. attendance rhythm ---- */}
          <Section title="Attendance rhythm" sub="sessions per week, the longest gap, and whether the last month is below the client's own pace">
            <AttendancePanel rhythm={report.rhythm} />
          </Section>

          {/* ---- 6. pain & incidents + Pulse ---- */}
          <Section title="Pain & incidents, and the Pulse" sub="what hurt and when, beside what the client says in her Pulse">
            <PainPulsePanel pain={report.pain} pulse={report.pulse} />
          </Section>

          {/* ---- 7. time under tension ---- */}
          <Section title="Time under tension" sub={`per ${report.trendPeriod} — only sets that recorded it`}>
            <div className="cr-card">
              <p className="cr-card__sub">{tutWorthShowing ? `minutes · recorded on ${Math.round(summary.tutCoverage * 100)}% of sets` : "not recorded on enough sets yet"}</p>
              {tutWorthShowing ? (
                <TutChart weeks={report.weeks} period={report.trendPeriod} />
              ) : (
                <div className="cr-empty" style={{ height: 190, display: "grid", placeItems: "center" }}>Fills in as timed sets are logged.</div>
              )}
            </div>
          </Section>

          {/* ---- 8. heat map, last ---- */}
          <Section title="Where form breaks" sub="poor-quality share by machine over time">
            <FormHeatmapPanel heatmap={report.heatmap} period={report.heatmapPeriod} />
          </Section>

          <MethodNote />
        </>
      )}
    </div>
  );
}
