/**
 * Two views of the same numbers.
 *
 *  - <SubjectiveDashboard>  the COACH view. Everything the reference document
 *    asks for: current / previous / change / status per category, overall,
 *    protein compliance, largest improvement, largest opportunity,
 *    categories in Red, and the automatic flags — plus hydration, the pain
 *    map trend and the stress anchors. Shown while editing (live) and on the
 *    finalized report on screen. Never prints.
 *
 *  - <SubjectiveClientCopy>  the CLIENT view. Honours the client-copy
 *    switches, leads with the win, names one thing to work on, and is laid
 *    out for paper.
 *
 * Both take the raw assessment and recompute; the cached `summary` on the
 * report is not trusted for rendering.
 */
import React, { useMemo } from "react";
import type { CategoryComparison, PainPoint, SubjectiveAssessment } from "./types";
import {
  BODY_REGION_LABELS,
  BODY_SIDE_LABELS,
  LEGACY_CATEGORY_MAX,
  LEGACY_OVERALL_MAX,
  PAIN_FREQUENCY_LABELS,
  PAIN_TYPE_LABELS,
  STRESS_CATEGORY_LABELS,
  TRAINING_IMPACT_LABELS,
} from "./questions";
import { scoreAllCategories, scoreOverall, summarize, type PreviousAssessmentRef } from "./scoring";
import { Delta, RAG_LABEL, RagPill, fmtDate } from "./ui";

export interface HistoryPoint {
  date: string;
  assessment: SubjectiveAssessment;
}

const painName = (p: PainPoint) =>
  `${BODY_REGION_LABELS[p.region]}${p.side === "center" ? "" : ` (${BODY_SIDE_LABELS[p.side]})`}`;

/* ====================================================================== *
 * Coach dashboard
 * ====================================================================== */

export function SubjectiveDashboard({
  assessment,
  previous,
  history,
  machines,
}: {
  assessment: SubjectiveAssessment;
  previous: PreviousAssessmentRef | null;
  /** Older finalized check-ins, oldest first, for the trend line. */
  history?: HistoryPoint[];
  machines?: { id?: string; name: string }[];
}) {
  const s = useMemo(() => summarize(assessment, previous), [assessment, previous]);
  const prevOverall = previous ? scoreOverall(scoreAllCategories(previous.assessment)) : null;
  const overallDelta =
    s.overall.legacyScore !== null && prevOverall?.legacyScore != null
      ? s.overall.legacyScore - prevOverall.legacyScore
      : null;
  const redFlags = s.flags.filter((f) => f.severity === "red");
  const watchFlags = s.flags.filter((f) => f.severity === "watch");
  const machineName = (id: string) => machines?.find((m) => m.id === id)?.name ?? id;

  const trend = useMemo(() => {
    const pts = [...(history ?? []), { date: assessment.completedAt ?? "", assessment }]
      .map((h) => ({ date: h.date, score: scoreOverall(scoreAllCategories(h.assessment)).legacyScore }))
      .filter((h) => h.score !== null) as { date: string; score: number }[];
    return pts;
  }, [history, assessment]);

  return (
    <div className="sr sr-dash">
      {/* ---- headline tiles ---- */}
      <div className="sr-tiles">
        <div className={`sr-tile${s.overall.status ? ` sr-tile--${s.overall.status}` : ""}`}>
          <span className="sr-tile__label">Overall</span>
          <span className="sr-tile__value">
            {s.overall.legacyScore ?? "—"}
            <small>/ {LEGACY_OVERALL_MAX}</small>
          </span>
          <span className="sr-tile__sub">
            {s.overall.status ? RAG_LABEL[s.overall.status] : "Incomplete"}
            {overallDelta !== null && (
              <>
                {" "}· <Delta value={overallDelta} /> since {fmtDate(previous?.date)}
              </>
            )}
          </span>
        </div>
        <div className={`sr-tile${s.protein.status ? ` sr-tile--${s.protein.status}` : ""}`}>
          <span className="sr-tile__label">Protein compliance</span>
          <span className="sr-tile__value">
            {assessment.protein.daysPerWeekOnTarget ?? "—"}
            <small>days / wk</small>
          </span>
          <span className="sr-tile__sub">
            {s.protein.targetG ? `target ${s.protein.targetG} g` : "no target yet"}
            {s.protein.intakeRatio !== null && ` · eating ~${Math.round(s.protein.intakeRatio * 100)}%`}
          </span>
        </div>
        <div className={`sr-tile${s.hydration.status ? ` sr-tile--${s.hydration.status}` : ""}`}>
          <span className="sr-tile__label">Hydration</span>
          <span className="sr-tile__value">
            {s.hydration.ratio !== null ? Math.round(s.hydration.ratio * 100) : "—"}
            <small>% of target</small>
          </span>
          <span className="sr-tile__sub">
            {assessment.hydration.typicalPerDay ?? "—"} / {assessment.hydration.targetPerDay ?? "—"}{" "}
            {assessment.hydration.unit} a day
          </span>
        </div>
        <div className={`sr-tile${redFlags.length ? " sr-tile--red" : watchFlags.length ? "" : " sr-tile--green"}`}>
          <span className="sr-tile__label">Flags</span>
          <span className="sr-tile__value">
            {redFlags.length}
            <small>red · {watchFlags.length} watch</small>
          </span>
          <span className="sr-tile__sub">
            {redFlags.length ? "Talk about these today" : watchFlags.length ? "Worth a look" : "Nothing raised"}
          </span>
        </div>
      </div>

      {/* ---- flags ---- */}
      {s.flags.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {[...redFlags, ...watchFlags].map((f, i) => (
            <div className={`sr-flag${f.severity === "watch" ? " sr-flag--watch" : ""}`} key={`${f.code}-${i}`}>
              <span className="sr-flag__icon" aria-hidden="true">
                {f.severity === "red" ? "!" : "?"}
              </span>
              <div>
                <p className="sr-flag__label">{f.label}</p>
                <p className="sr-flag__detail">{f.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- highlights the document asks for ---- */}
      <div className="sr-tiles" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className={`sr-tile${s.largestImprovement ? " sr-tile--green" : ""}`}>
          <span className="sr-tile__label">Largest improvement</span>
          <span className="sr-tile__value" style={{ fontSize: 17 }}>
            {s.largestImprovement ? s.largestImprovement.title : previous ? "No topic improved" : "First check-in"}
          </span>
          {s.largestImprovement && (
            <span className="sr-tile__sub">
              <Delta value={s.largestImprovement.changeLegacy} /> of {LEGACY_CATEGORY_MAX} · now{" "}
              {s.largestImprovement.legacyScore}
            </span>
          )}
        </div>
        <div className={`sr-tile${s.largestOpportunity ? ` sr-tile--${s.largestOpportunity.status ?? "yellow"}` : ""}`}>
          <span className="sr-tile__label">Largest opportunity</span>
          <span className="sr-tile__value" style={{ fontSize: 17 }}>
            {s.largestOpportunity ? s.largestOpportunity.title : "—"}
          </span>
          {s.largestOpportunity && (
            <span className="sr-tile__sub">
              lowest topic · {s.largestOpportunity.legacyScore} / {LEGACY_CATEGORY_MAX}
            </span>
          )}
        </div>
        <div className={`sr-tile${s.redCategories.length ? " sr-tile--red" : ""}`}>
          <span className="sr-tile__label">Topics in Red</span>
          <span className="sr-tile__value">{s.redCategories.length}</span>
          <span className="sr-tile__sub">
            {s.redCategories.length
              ? s.categories.filter((c) => c.status === "red").map((c) => c.title).join(" · ")
              : "none"}
          </span>
        </div>
      </div>

      {/* ---- the comparison table ---- */}
      <div className="sr-card">
        <div className="sr-card__head">
          <h3 className="sr-card__title">Topic by topic</h3>
          {previous && <span className="sr-hint">vs {fmtDate(previous.date)}</span>}
        </div>
        <div className="sr-table-wrap">
          <table className="sr-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th style={{ textAlign: "right" }}>Previous</th>
                <th style={{ textAlign: "right" }}>Current</th>
                <th style={{ textAlign: "right" }}>Change</th>
                <th>Status</th>
                <th className="sr-table__bar" />
              </tr>
            </thead>
            <tbody>
              {s.categories.map((c) => (
                <CategoryRow key={c.key} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- trend ---- */}
      {trend.length >= 2 && (
        <div className="sr-card">
          <div className="sr-card__head">
            <h3 className="sr-card__title">Overall score over time</h3>
            <span className="sr-hint">{trend.length} check-ins</span>
          </div>
          <Sparkline points={trend} />
        </div>
      )}

      {/* ---- pain + stress ---- */}
      <div className="sr-grid">
        <div className="sr-card">
          <div className="sr-card__head">
            <h3 className="sr-card__title">Pain map</h3>
            <RagPill
              status={
                s.pain.worstSeverity === null ? "green" : s.pain.worstSeverity >= 7 ? "red" : s.pain.worstSeverity >= 4 ? "yellow" : "green"
              }
              label={s.pain.activeCount ? `${s.pain.activeCount} active · worst ${s.pain.worstSeverity}/10` : "None active"}
            />
          </div>
          {s.pain.trends.length === 0 && s.pain.resolvedSinceLast.length === 0 ? (
            <div className="sr-empty">Nothing recorded.</div>
          ) : (
            <table className="sr-table">
              <tbody>
                {s.pain.trends.map((t) => (
                  <tr key={t.point.id}>
                    <td>
                      <div className="sr-table__title">
                        {painName(t.point)}{" "}
                        <span className="sr-hint">
                          {PAIN_TYPE_LABELS[t.point.type]} · {PAIN_FREQUENCY_LABELS[t.point.frequency]}
                        </span>
                      </div>
                      {t.point.aggravatingMachineIds.length > 0 && (
                        <div className="sr-hint">on {t.point.aggravatingMachineIds.map(machineName).join(", ")}</div>
                      )}
                      {t.point.linkedJournalEntryIds.length > 0 && (
                        <div className="sr-hint">
                          linked to {t.point.linkedJournalEntryIds.length} session note
                          {t.point.linkedJournalEntryIds.length > 1 ? "s" : ""}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {t.point.severity}
                      <small> / 10</small>
                    </td>
                    <td className="num">
                      {t.isNew ? <span className="sr-hint">new</span> : <Delta value={t.severityChange} invert />}
                    </td>
                    <td>
                      <RagPill
                        status={t.point.status === "resolved" ? "green" : t.point.status === "improving" ? "yellow" : "red"}
                        label={t.point.status}
                      />
                    </td>
                  </tr>
                ))}
                {s.pain.resolvedSinceLast.map((p) => (
                  <tr key={`res-${p.id}`}>
                    <td>
                      <div className="sr-table__title" style={{ opacity: 0.7 }}>
                        {painName(p)} <span className="sr-hint">was {p.severity}/10 last time</span>
                      </div>
                    </td>
                    <td className="num">—</td>
                    <td className="num" />
                    <td>
                      <RagPill status="green" label="gone" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="sr-card">
          <div className="sr-card__head">
            <h3 className="sr-card__title">Stress anchors</h3>
            <RagPill
              status={
                assessment.overallStressLevel === null
                  ? null
                  : assessment.overallStressLevel >= 7
                    ? "red"
                    : assessment.overallStressLevel >= 4
                      ? "yellow"
                      : "green"
              }
              label={
                assessment.overallStressLevel === null ? "Not rated" : `Life load ${assessment.overallStressLevel} / 10`
              }
            />
          </div>
          {assessment.stressAnchors.length === 0 ? (
            <div className="sr-empty">Nothing recorded.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {assessment.stressAnchors.map((a) => (
                <div
                  key={a.id}
                  className={`sr-stress${a.status === "resolved" ? " sr-stress--resolved" : a.trainingImpact === "high" ? " sr-stress--high" : ""}`}
                  style={{ padding: "10px 12px", gap: 4 }}
                >
                  <div className="sr-table__title">
                    {STRESS_CATEGORY_LABELS[a.category]}
                    {a.label && <span className="sr-hint"> — “{a.label}”</span>}
                  </div>
                  <div className="sr-hint">
                    intensity {a.intensity}/10 · {TRAINING_IMPACT_LABELS[a.trainingImpact]} · {a.status}
                  </div>
                  {a.coachResponse && <div style={{ fontSize: 13 }}>Plan: {a.coachResponse}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryRow({ c }: { key?: string; c: CategoryComparison }) {
  const pct = c.percent === null ? 0 : Math.round(c.percent * 100);
  return (
    <tr className={c.status === "red" ? "is-red" : ""}>
      <td className="sr-table__title">{c.title}</td>
      <td className="num">
        {c.previousLegacyScore ?? "—"}
        {c.previousLegacyScore !== null && <small> / {LEGACY_CATEGORY_MAX}</small>}
      </td>
      <td className="num">
        {c.legacyScore ?? "—"}
        {c.legacyScore !== null && <small> / {LEGACY_CATEGORY_MAX}</small>}
      </td>
      <td className="num">
        <Delta value={c.changeLegacy} />
      </td>
      <td>
        <RagPill status={c.status} label={c.isComplete ? undefined : `${c.answeredCount}/3`} />
      </td>
      <td className="sr-table__bar">
        <div className="sr-score__bar">
          <div className={`sr-score__fill${c.status ? ` sr-score__fill--${c.status}` : ""}`} style={{ width: `${pct}%` }} />
        </div>
      </td>
    </tr>
  );
}

/** Inline SVG so it prints and needs no chart library. Bands are the
 *  document's three colours; every point is labelled so a trend of three
 *  numbers reads without hovering. */
function Sparkline({ points }: { points: { date: string; score: number }[] }) {
  const w = 600;
  const h = 132;
  const top = 18;
  const bottom = 22;
  const padX = 28;
  const plotH = h - top - bottom;
  const y = (frac: number) => top + (1 - frac) * plotH;
  const xs = points.map((_, i) => padX + (i * (w - padX * 2)) / Math.max(1, points.length - 1));
  const ys = points.map((p) => y(p.score / LEGACY_OVERALL_MAX));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg className="sr-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Overall score trend">
      <rect x={0} y={y(1)} width={w} height={y(0.75) - y(1)} fill="var(--sr-green-fill)" />
      <rect x={0} y={y(0.75)} width={w} height={y(0.5) - y(0.75)} fill="var(--sr-yellow-fill)" />
      <rect x={0} y={y(0.5)} width={w} height={y(0) - y(0.5)} fill="var(--sr-red-fill)" />
      <text x={4} y={y(0.75) - 4} fill="var(--sr-green)">72</text>
      <text x={4} y={y(0.5) - 4} fill="var(--sr-yellow)">48</text>
      <path d={d} fill="none" stroke="var(--sr-navy)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {xs.map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={ys[i]} r={5} fill="var(--sr-navy)" stroke="var(--sr-surface)" strokeWidth={2}>
            <title>
              {fmtDate(points[i].date)}: {points[i].score} / {LEGACY_OVERALL_MAX}
            </title>
          </circle>
          <text x={x} y={ys[i] - 10} textAnchor="middle">
            {points[i].score}
          </text>
          <text x={x} y={h - 6} textAnchor={i === 0 ? "start" : i === xs.length - 1 ? "end" : "middle"} style={{ fontWeight: 600, fill: "var(--sr-ink-muted)" }}>
            {fmtDate(points[i].date)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ====================================================================== *
 * Client copy
 * ====================================================================== */

export function SubjectiveClientCopy({
  assessment,
  previous,
  clientFirstName,
  machines,
}: {
  assessment: SubjectiveAssessment;
  previous: PreviousAssessmentRef | null;
  clientFirstName: string;
  machines?: { id?: string; name: string }[];
}) {
  const s = useMemo(() => summarize(assessment, previous), [assessment, previous]);
  const copy = assessment.clientCopy;
  const machineName = (id: string) => machines?.find((m) => m.id === id)?.name ?? id;
  const activePain = s.pain.trends.filter((t) => t.point.status !== "resolved");

  return (
    <div className="sr sr-client">
      {/* lead with the win */}
      {(s.largestImprovement || s.largestOpportunity) && (
        <div className="sr-tiles" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div className="sr-tile sr-tile--green">
            <span className="sr-tile__label">Biggest win</span>
            <span className="sr-tile__value" style={{ fontSize: 18 }}>
              {s.largestImprovement
                ? s.largestImprovement.title
                : s.categories.filter((c) => c.isComplete).sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0]?.title ?? "—"}
            </span>
            <span className="sr-tile__sub">
              {s.largestImprovement ? (
                <>
                  up <Delta value={s.largestImprovement.changeLegacy} /> since {fmtDate(previous?.date)}
                </>
              ) : (
                "your strongest area right now"
              )}
            </span>
          </div>
          <div className="sr-tile sr-tile--yellow">
            <span className="sr-tile__label">One thing to work on</span>
            <span className="sr-tile__value" style={{ fontSize: 18 }}>
              {s.largestOpportunity?.title ?? "—"}
            </span>
            <span className="sr-tile__sub">the topic with the most room to grow</span>
          </div>
        </div>
      )}

      {copy.includeCategoryScores && (
        <>
          <div className="sr-ragrid">
            {s.categories.map((c) => (
              <div key={c.key} className={`sr-ragrid__cell${c.status ? ` sr-ragrid__cell--${c.status}` : ""}`}>
                <span className="sr-ragrid__title">{c.title}</span>
                <span className="sr-ragrid__score">
                  {c.legacyScore ?? "—"}
                  <small> / {LEGACY_CATEGORY_MAX}</small>
                </span>
                <span className="sr-ragrid__delta">
                  {c.changeLegacy === null ? (
                    <span className="sr-hint">{c.status ? RAG_LABEL[c.status] : ""}</span>
                  ) : (
                    <>
                      <Delta value={c.changeLegacy} /> <span className="sr-hint">since last time</span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className={`sr-tile${s.overall.status ? ` sr-tile--${s.overall.status}` : ""}`}>
            <span className="sr-tile__label">Overall — how life is going</span>
            <span className="sr-tile__value">
              {s.overall.legacyScore ?? "—"}
              <small>/ {LEGACY_OVERALL_MAX}</small>
            </span>
            <span className="sr-tile__sub">Green 72–96 · Yellow 48–71 · Red 0–47</span>
          </div>
        </>
      )}

      {copy.includeProteinHydration && (
        <div className="sr-tiles" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div className={`sr-tile${s.protein.status ? ` sr-tile--${s.protein.status}` : ""}`}>
            <span className="sr-tile__label">Protein</span>
            <span className="sr-tile__value">
              {assessment.protein.daysPerWeekOnTarget ?? "—"}
              <small>days a week on target</small>
            </span>
            <span className="sr-tile__sub">
              {s.protein.targetG ? `Your target: about ${s.protein.targetG} g a day (${s.protein.targetLowG}–${s.protein.targetHighG} g)` : "Target to be set"}
            </span>
          </div>
          <div className={`sr-tile${s.hydration.status ? ` sr-tile--${s.hydration.status}` : ""}`}>
            <span className="sr-tile__label">Hydration</span>
            <span className="sr-tile__value">
              {assessment.hydration.typicalPerDay ?? "—"}
              <small>{assessment.hydration.unit} a day</small>
            </span>
            <span className="sr-tile__sub">
              {assessment.hydration.targetPerDay ? `Target: ${assessment.hydration.targetPerDay} ${assessment.hydration.unit} a day` : "Target to be set"}
            </span>
          </div>
        </div>
      )}

      {copy.includePainMap && (activePain.length > 0 || s.pain.resolvedSinceLast.length > 0) && (
        <div className="sr-card">
          <h3 className="sr-card__title">Where things hurt — and how it's going</h3>
          <table className="sr-table">
            <tbody>
              {activePain.map((t) => (
                <tr key={t.point.id}>
                  <td className="sr-table__title">
                    {painName(t.point)}
                    {t.point.aggravatingMachineIds.length > 0 && (
                      <div className="sr-hint">we're watching this on {t.point.aggravatingMachineIds.map(machineName).join(", ")}</div>
                    )}
                  </td>
                  <td className="num">
                    {t.point.severity}
                    <small> / 10</small>
                  </td>
                  <td className="num">{t.isNew ? <span className="sr-hint">new</span> : <Delta value={t.severityChange} invert />}</td>
                </tr>
              ))}
              {s.pain.resolvedSinceLast.map((p) => (
                <tr key={`r-${p.id}`}>
                  <td className="sr-table__title" style={{ opacity: 0.75 }}>
                    {painName(p)}
                  </td>
                  <td className="num" colSpan={2}>
                    <RagPill status="green" label="Resolved since last time" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {copy.includeStressAnchors && assessment.stressAnchors.some((a) => a.status !== "resolved") && (
        <div className="sr-card">
          <h3 className="sr-card__title">What we're working around</h3>
          {assessment.stressAnchors
            .filter((a) => a.status !== "resolved")
            .map((a) => (
              <div key={a.id} style={{ fontSize: 14 }}>
                <b>{STRESS_CATEGORY_LABELS[a.category]}</b>
                {a.label && <> — {a.label}</>}
                {a.coachResponse && <div className="sr-hint">Our plan: {a.coachResponse}</div>}
              </div>
            ))}
        </div>
      )}

      {assessment.coachSummary && (
        <div className="sr-card">
          <h3 className="sr-card__title">From your coach</h3>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{assessment.coachSummary}</p>
        </div>
      )}

      {!copy.includeCategoryScores && !copy.includeProteinHydration && !copy.includePainMap && !assessment.coachSummary && (
        <div className="sr-empty">{clientFirstName}'s check-in is on file for the coaching team.</div>
      )}
    </div>
  );
}
