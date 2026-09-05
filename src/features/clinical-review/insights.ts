/**
 * INSIGHTS — the numbers, as sentences a trainer can say out loud.
 *
 * Every insight is generated from a rule with an explicit evidence gate:
 * a level must be at least "early" (3+ sessions) and the effect must clear
 * the outcome's `meaningfulDelta`. The `score` orders the cards; solid
 * evidence on a big effect wins, thin evidence on a small effect never
 * appears at all. Wording is deliberately plain — "poor-quality sets run
 * 14 points higher", not "a statistically significant association".
 */

import type { Correlation, Heatmap, Insight, LevelStat, MachinePlateau, Summary, WeekBucket } from "./types";
import { OUTCOME_BY_KEY, shortDate, signed } from "./analytics";

const RHYTHM_DIMENSIONS = new Set(["restGap", "timeOfDay", "dayOfWeek"]);
const DAY_NAMES: Record<string, string> = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };
const CONTEXT_DIMENSIONS = new Set(["trainer", "crossTrain"]);
/** Rates are the cleanest signal; the baseline indexes are noisier and rank a notch lower. */
const OUTCOME_WEIGHT: Record<string, number> = { poorRate: 1, maxRate: 1, tonnageIndex: 0.9, repsIndex: 0.8, tutIndex: 0.7, avgRpe: 0.7 };

function fmtLevelValue(value: number, unit: "pp" | "%" | ""): string {
  if (unit === "pp") return `${Math.round(value)}%`;
  if (unit === "%") return `${signed(value, 0, "%")}`;
  return value.toFixed(1);
}

function fmtDelta(delta: number, unit: "pp" | "%" | ""): string {
  if (unit === "pp") return `${signed(delta, 0)} pts`;
  if (unit === "%") return `${signed(delta, 0, "%")}`;
  return signed(delta, 1);
}

function levelPhrase(dimension: string, level: LevelStat): string {
  switch (dimension) {
    case "sleep":
      return `when sleep is ${level.label.toLowerCase()}`;
    case "stress":
      return `when stress is ${level.label.toLowerCase().replace(/ \(.*\)/, "")}`;
    case "energy":
      return `when energy is ${level.label.toLowerCase()}`;
    case "mood":
      return `when mood is ${level.label.toLowerCase()}`;
    case "stiffness":
      return level.level === "stiff" ? "when something feels stiff" : level.level === "prime" ? "when the body feels prime" : "when nothing is flagged";
    case "postFeel":
      return `in sessions that end "${level.label.toLowerCase()}"`;
    case "restGap":
      return level.level === "1" ? "after a single rest day" : `after ${level.label.toLowerCase()} off`;
    case "timeOfDay":
      return `in ${level.label.toLowerCase().replace(/ \(.*\)/, "")} sessions`;
    case "dayOfWeek":
      return `on ${DAY_NAMES[level.label] ?? level.label}s`;
    case "trainer":
      return `with ${level.label}`;
    case "crossTrain":
      return level.level === "cross" ? "on cross-train visits" : "at the home studio";
    default:
      return `when ${dimension} is ${level.label}`;
  }
}

function outcomePhrase(outcome: string, level: LevelStat, overall: number, unit: "pp" | "%" | ""): { verb: string; body: string } {
  const delta = level.delta ?? 0;
  switch (outcome) {
    case "poorRate":
      return {
        verb: delta > 0 ? "break down more" : "hold form better",
        body: `poor-quality sets run at ${fmtLevelValue(level.mean!, unit)} of rated sets vs ${fmtLevelValue(overall, unit)} overall (${fmtDelta(delta, unit)}).`,
      };
    case "maxRate":
      return {
        verb: delta > 0 ? "hit max strength more often" : "reach max strength less often",
        body: `max-strength sets land at ${fmtLevelValue(level.mean!, unit)} vs ${fmtLevelValue(overall, unit)} overall (${fmtDelta(delta, unit)}).`,
      };
    case "tonnageIndex":
      return {
        verb: delta > 0 ? "move more weight" : "move less weight",
        body: `tonnage comes in ${fmtLevelValue(level.mean!, unit)} against the trailing baseline, vs ${fmtLevelValue(overall, unit)} overall.`,
      };
    case "repsIndex":
      return {
        verb: delta > 0 ? "get more reps" : "get fewer reps",
        body: `total reps come in ${fmtLevelValue(level.mean!, unit)} against the trailing baseline, vs ${fmtLevelValue(overall, unit)} overall.`,
      };
    case "tutIndex":
      return {
        verb: delta > 0 ? "hold tension longer" : "hold tension for less time",
        body: `time under tension comes in ${fmtLevelValue(level.mean!, unit)} against the trailing baseline, vs ${fmtLevelValue(overall, unit)} overall.`,
      };
    case "avgRpe":
      return {
        verb: delta > 0 ? "feel harder" : "feel easier",
        body: `average RPE is ${level.mean!.toFixed(1)} vs ${overall.toFixed(1)} overall (${fmtDelta(delta, unit)}).`,
      };
    default:
      return { verb: "differ", body: `${fmtLevelValue(level.mean!, unit)} vs ${fmtLevelValue(overall, unit)} overall.` };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------------------------------------------ */

export function correlationInsights(correlations: Correlation[], firstName: string): Insight[] {
  const out: Insight[] = [];
  for (const c of correlations) {
    const spec = OUTCOME_BY_KEY[c.outcome];
    if (!c.standout || c.overallMean === null || c.standout.delta === null) continue;
    const level = c.standout;
    if (Math.abs(level.delta!) < spec.meaningfulDelta) continue;
    // Trainer/studio splits are context, never a verdict on a coach: keep
    // them to the matrix panel rather than the headline cards.
    if (CONTEXT_DIMENSIONS.has(c.dimension)) continue;

    const isGood = spec.higherIsBetter ? level.delta! > 0 : level.delta! < 0;
    const { verb, body } = outcomePhrase(c.outcome, level, c.overallMean, spec.unit);
    // Capped: a single noisy index (time under tension jumping when timing
    // started being recorded, say) must not crowd out four quieter facts.
    const strength = Math.min(3, Math.abs(level.delta!) / spec.meaningfulDelta);
    const conf = level.confidence === "solid" ? 1 : 0.6;
    const nWeight = Math.min(1, level.n / 8);
    const outcomeWeight = OUTCOME_WEIGHT[c.outcome] ?? 1;
    out.push({
      id: `corr:${c.dimension}:${level.level}:${c.outcome}`,
      kind: RHYTHM_DIMENSIONS.has(c.dimension) ? "rhythm" : "correlation",
      tone: isGood ? "good" : "notable",
      title: `${capitalize(levelPhrase(c.dimension, level))}, ${firstName}'s sets ${verb}`,
      body: capitalize(body),
      evidence: `${level.n} of ${c.n} sessions · ${fmtDelta(level.delta!, spec.unit)}${level.confidence === "early" ? " · early signal" : ""}`,
      score: strength * conf * nWeight * outcomeWeight * (RHYTHM_DIMENSIONS.has(c.dimension) ? 0.95 : 1),
      dimension: c.dimension,
      outcome: c.outcome,
    });
  }
  // One card per dimension+outcome is plenty; keep the strongest level.
  const dedup = new Map<string, Insight>();
  for (const i of out) {
    const k = `${i.dimension}:${i.outcome}`;
    const cur = dedup.get(k);
    if (!cur || i.score > cur.score) dedup.set(k, i);
  }
  return [...dedup.values()];
}

/** ISO date of the first session in the machine's current same-load run. */
function runStart(p: MachinePlateau): string {
  const weighted = p.series.filter((s) => s.weight !== null);
  const start = weighted[Math.max(0, weighted.length - p.sessionsAtCurrentWeight)];
  return start?.date ?? p.firstDate ?? "";
}

export function plateauInsights(plateaus: MachinePlateau[]): Insight[] {
  const out: Insight[] = [];
  for (const p of plateaus) {
    if (p.stalled && (p.status === "plateau" || p.status === "progressing") && p.lastWeight !== null) {
      const unit = p.isTSC ? "hold" : "reps";
      const repsNote =
        p.repsAtCurrentFirst !== null && p.repsAtCurrentLast !== null
          ? p.repsAtCurrentLast === p.repsAtCurrentFirst
            ? `${unit} flat at ${p.repsAtCurrentLast}${p.isTSC ? "s" : ""}`
            : `${unit} ${p.repsAtCurrentFirst} → ${p.repsAtCurrentLast}${p.isTSC ? "s" : ""}`
          : `no ${p.isTSC ? "time" : "rep"} gain`;
      out.push({
        id: `plateau:${p.machineId}`,
        kind: "plateau",
        tone: "notable",
        title: `${p.machineName} has sat at ${p.lastWeight} lb for ${p.sessionsAtCurrentWeight} sessions`,
        body: `Same load since ${shortDate(runStart(p))}, ${repsNote}. Worth a deliberate progression, a cadence change or a different machine for the same target.`,
        evidence: `${p.sessions} sessions in range · ${p.status === "plateau" ? "0% load change" : `progressed earlier, flat for ${p.sessionsAtCurrentWeight}`}${p.poorRate !== null && p.poorRate > 0.2 ? ` · ${Math.round(p.poorRate * 100)}% poor quality` : ""}`,
        score: 0.9 + Math.min(0.6, p.sessionsAtCurrentWeight * 0.05),
        machineId: p.machineId,
      });
    } else if (p.status === "regressing" && p.firstWeight !== null && p.lastWeight !== null) {
      const dropped = p.lastWeight < p.firstWeight;
      out.push({
        id: `regress:${p.machineId}`,
        kind: "plateau",
        tone: "notable",
        title: dropped
          ? `${p.machineName} is down from ${p.firstWeight} to ${p.lastWeight} lb`
          : `${p.machineName} reps are slipping at ${p.lastWeight} lb`,
        body: dropped
          ? `Load fell ${Math.abs(Math.round(p.weightChangePct ?? 0))}% across the range. Check the setup, the pain notes and the recovery pattern before pushing it back up.`
          : `Reps at the current load went ${p.repsAtCurrentFirst} → ${p.repsAtCurrentLast}. A backslide at the same weight usually means recovery, not strength.`,
        evidence: `${p.sessions} sessions in range${p.poorRate !== null ? ` · ${Math.round(p.poorRate * 100)}% poor quality` : ""}`,
        score: 1.1,
        machineId: p.machineId,
      });
    }
  }
  return out;
}

export function formInsights(heat: Heatmap, summary: Summary, firstName: string): Insight[] {
  if (!heat.rows.length || !summary.setsPoor) return [];
  const top = heat.rows[0];
  const share = top.total.poor / summary.setsPoor;
  const out: Insight[] = [];
  if (top.total.rate !== null && summary.poorRate !== null && top.total.rated >= 4 && top.total.rate >= summary.poorRate * 1.5 && share >= 0.2) {
    out.push({
      id: `form:${top.machineId}`,
      kind: "form",
      tone: "notable",
      title: `${top.machineName} is where ${firstName}'s form breaks`,
      body: `${Math.round(top.total.rate * 100)}% of rated sets on it were poor quality — ${(top.total.rate / summary.poorRate).toFixed(1)}× the overall rate — and it accounts for ${Math.round(share * 100)}% of all poor-quality sets in the range.`,
      evidence: `${top.total.poor} of ${top.total.rated} sets`,
      score: 0.8 + Math.min(0.5, share),
      machineId: top.machineId,
    });
  }
  const worstGroup = heat.groups[0];
  if (worstGroup && worstGroup.total.rate !== null && summary.poorRate !== null && worstGroup.total.rate >= summary.poorRate * 1.4 && worstGroup.total.rated >= 8) {
    out.push({
      id: `form-group:${worstGroup.group}`,
      kind: "form",
      tone: "info",
      title: `${worstGroup.group} work carries the most breakdown`,
      body: `${Math.round(worstGroup.total.rate * 100)}% poor quality across ${worstGroup.group.toLowerCase()} machines, against ${Math.round(summary.poorRate * 100)}% overall.`,
      evidence: `${worstGroup.total.poor} of ${worstGroup.total.rated} sets`,
      score: 0.55,
    });
  }
  return out;
}

export function volumeInsights(weeks: WeekBucket[], summary: Summary, firstName: string): Insight[] {
  const out: Insight[] = [];
  const active = weeks.filter((w) => w.sessions > 0);
  if (active.length >= 6) {
    const recent = active.slice(-3);
    const prior = active.slice(-6, -3);
    const r = recent.reduce((a, w) => a + w.tonnage, 0) / recent.length;
    const p = prior.reduce((a, w) => a + w.tonnage, 0) / prior.length;
    if (p > 0) {
      const change = ((r - p) / p) * 100;
      if (Math.abs(change) >= 8) {
        out.push({
          id: "volume:trend",
          kind: "volume",
          tone: change > 0 ? "good" : "notable",
          title: change > 0 ? `Weekly tonnage is up ${Math.round(change)}%` : `Weekly tonnage is down ${Math.abs(Math.round(change))}%`,
          body: `The last three training weeks averaged ${Math.round(r).toLocaleString()} lb per week against ${Math.round(p).toLocaleString()} lb for the three before.`,
          evidence: `6 training weeks compared`,
          score: 0.5 + Math.min(0.5, Math.abs(change) / 40),
        });
      }
    }
  }
  if (summary.longestGapDays !== null && summary.longestGapDays >= 14) {
    out.push({
      id: "volume:gap",
      kind: "rhythm",
      tone: "info",
      title: `Longest break in the range: ${summary.longestGapDays} days`,
      body: `Median rest between sessions is ${summary.medianRestDays ?? "—"} days. The "Days since last session" row below shows how ${firstName} performs coming back from a layoff.`,
      evidence: `${summary.sessions} sessions over ${summary.spanDays} days`,
      score: 0.35,
    });
  }
  return out;
}

export function coverageInsights(summary: Summary): Insight[] {
  const out: Insight[] = [];
  if (summary.sessions >= 3 && summary.tutCoverage < 0.5) {
    out.push({
      id: "coverage:tut",
      kind: "coverage",
      tone: "info",
      title: `Time under tension is recorded on ${Math.round(summary.tutCoverage * 100)}% of sets`,
      body: "The TUT trend and its correlations fill in as trainers log timed sets. Nothing here is estimated.",
      evidence: `${summary.sessions} sessions`,
      score: 0.2,
    });
  }
  if (summary.sessions >= 3 && summary.checkInCoverage < 0.5) {
    out.push({
      id: "coverage:checkin",
      kind: "coverage",
      tone: "info",
      title: `Pre-session check-ins cover ${Math.round(summary.checkInCoverage * 100)}% of sessions`,
      body: "Sleep, stress, energy and mood correlations need the briefing check-in filled in. Two taps per session is enough.",
      evidence: `${summary.sessions} sessions`,
      score: 0.2,
    });
  }
  if (summary.setsRated === 0 && summary.sessions > 0) {
    out.push({
      id: "coverage:quality",
      kind: "coverage",
      tone: "info",
      title: "No rep-quality ratings in this range",
      body: "Imported paper charts carry no quality rating, so the form heatmap and quality correlations stay empty until live sessions are logged.",
      evidence: `${summary.sessions} sessions`,
      score: 0.25,
    });
  }
  return out;
}

/**
 * Rank with breadth: the first pass takes the single best card per subject
 * (a dimension, a machine, or the kind for volume/coverage cards) so the top
 * eight cover eight different things; the second pass fills any remaining
 * slots by raw score.
 */
export function rankInsights(all: Insight[], limit = 8): Insight[] {
  const sorted = [...all].sort((a, b) => b.score - a.score);
  const subject = (i: Insight) => i.dimension ?? i.machineId ?? i.kind;
  const seen = new Set<string>();
  const first: Insight[] = [];
  for (const i of sorted) {
    const key = subject(i);
    if (seen.has(key)) continue;
    seen.add(key);
    first.push(i);
    if (first.length >= limit) break;
  }
  if (first.length >= limit) return first;
  const chosen = new Set(first.map((i) => i.id));
  for (const i of sorted) {
    if (first.length >= limit) break;
    if (!chosen.has(i.id)) first.push(i);
  }
  return first;
}
