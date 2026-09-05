/**
 * Client profile → Clinical tab.
 *
 * Nothing loads on open. The trainer picks a range and generates; the hook
 * fetches exactly that window (plus one window before it for the deltas and
 * baselines), `buildReport` compiles it, and the dashboard renders it. A
 * range change from the report bar re-uses cached data when it has it.
 */
import { useEffect, useMemo, useState } from "react";
import { Activity, Loader2, Play } from "lucide-react";
import type { Client, Machine, Trainer } from "../../types";
import type { RangePreset, ReportRange } from "./types";
import { useClinicalReport } from "./useClinicalReport";
import { buildReport, rangeForPreset, rangeLabel, todayIso } from "./report";
import { ClinicalDashboard } from "./ClinicalDashboard";
import { BrandTiles } from "../client-profile/BrandTiles";
import "./clinical-review.css";

export interface ClinicalReviewTabProps {
  client: Client;
  machines: Machine[];
  trainers: Trainer[];
  /** Studio time zone for hour-of-day patterns; defaults to US Eastern. */
  timeZone?: string;
  /** Firestore reads are suspended when the app is in quota trouble. */
  disabled?: boolean;
}

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "6m", label: "6 months" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];

export function ClinicalReviewTab({ client, machines, trainers, timeZone, disabled = false }: ClinicalReviewTabProps) {
  const clientId = client.id ?? null;
  const { status, progress, data, error, generate } = useClinicalReport(clientId, { enabled: !disabled });
  const [range, setRange] = useState<ReportRange>(() => rangeForPreset("90d"));
  const [customFrom, setCustomFrom] = useState<string>(rangeForPreset("30d").from ?? "");
  const [customTo, setCustomTo] = useState<string>(todayIso());
  const [showCustom, setShowCustom] = useState(false);

  // A different client → back to the gate.
  useEffect(() => {
    setRange(rangeForPreset("90d"));
    setShowCustom(false);
  }, [clientId]);

  const report = useMemo(() => {
    if (!data) return null;
    return buildReport({ client, machines, trainers, sessions: data.sessions, logs: data.logs, incidents: data.incidents, range: data.range, timeZone });
  }, [data, client, machines, trainers, timeZone]);

  const pick = (preset: RangePreset) => {
    if (preset === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    setRange(rangeForPreset(preset));
  };

  const customRange = (): ReportRange | null => {
    if (!customFrom || !customTo || customFrom > customTo) return null;
    return { preset: "custom", from: customFrom, to: customTo };
  };

  const run = (r: ReportRange, force = false) => {
    setRange(r);
    void generate(r, { force });
  };

  /* ---------------------------- the dashboard ---------------------------- */
  if (report && data) {
    return (
      <ClinicalDashboard
        report={report}
        clientName={`${client.firstName} ${client.lastName}`.trim()}
        presets={RANGE_PRESETS}
        onPreset={(p) => run(rangeForPreset(p))}
        onRegenerate={() => run(data.range, true)}
        loading={status === "loading"}
      />
    );
  }

  /* ------------------------------- the gate ------------------------------ */
  const activeRange = showCustom ? customRange() : range;
  return (
    <div className="cr">
      <div className="cr-gate">
        <div>
          <span className="cr-gate__eyebrow">
            <BrandTiles size={7} gap={2} /> Clinical review
          </span>
          <h2 className="cr-gate__title">Generate {client.firstName}'s clinical report</h2>
          <p className="cr-gate__lede">
            Compiles every completed session in the range and cross-references how {client.firstName} arrived — sleep, stress, energy, mood,
            stiffness, days since the last session, time of day — with how the session went: load, reps, time under tension and rep quality.
          </p>
          <ul className="cr-gate__list">
            <li>Correlations with the session count behind every number; nothing under three sessions becomes a finding.</li>
            <li>Weekly tonnage, time under tension and the rep-quality mix, side by side.</li>
            <li>A form-breakdown heatmap: which machines, which weeks, how often tension broke.</li>
            <li>Plateaus and stalls — machines at the same load with no rep or time gain.</li>
          </ul>
        </div>

        <div className="cr-range">
          <span className="cr-range__label">Date range</span>
          <div className="cr-seg" role="radiogroup" aria-label="Date range">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={!showCustom && range.preset === p.key}
                className={`cr-seg__btn ${!showCustom && range.preset === p.key ? "is-on" : ""}`}
                onClick={() => pick(p.key)}
              >
                {p.label}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={showCustom} className={`cr-seg__btn ${showCustom ? "is-on" : ""}`} onClick={() => pick("custom")}>
              Custom
            </button>
          </div>
          {showCustom && (
            <div className="cr-range__custom">
              <label>
                From <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label>
                To <input type="date" value={customTo} min={customFrom} max={todayIso()} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </div>
          )}

          <button
            type="button"
            className="cr-generate"
            disabled={disabled || status === "loading" || !activeRange}
            onClick={() => activeRange && run(activeRange)}
          >
            {status === "loading" ? <Loader2 size={18} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
              <span>{status === "loading" ? "Compiling…" : "Generate clinical report"}</span>
              <span className="cr-generate__sub">{status === "loading" ? progress : activeRange ? rangeLabel(activeRange) : "Pick a valid range"}</span>
            </span>
          </button>

          {status === "error" && (
            <p className="cr-section__sub" role="alert" style={{ color: "var(--cr-poor-text)" }}>
              <Activity size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {error ?? "Could not load the history."} Try again in a moment.
            </p>
          )}
          {disabled && <p className="cr-section__sub">Reads are paused while the app is over its Firestore quota.</p>}
          <p className="cr-section__sub" style={{ lineHeight: 1.45 }}>
            Reads only what the range needs, once. Nothing loads until you press the button.
          </p>
        </div>
      </div>
    </div>
  );
}
