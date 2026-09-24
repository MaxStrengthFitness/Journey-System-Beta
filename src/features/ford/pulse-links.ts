/**
 * PULSE LINES ON FORD — what the Pulse says beside the pillar it is about,
 * shown side by side and never copied.
 *
 * Client codex, Sep 2026. Two things a client tells the team overlap: FORD
 * holds "her mother moved into assisted living", and the Pulse holds a stress
 * anchor, "Caring for someone: Moderate". The mockup puts the Pulse's words
 * under the pillar they belong to so a trainer sees both — and says, on the
 * page, that nothing is copied between them.
 *
 * Nothing here writes, and this module imports no Firestore: FORD is the
 * home studio's to read, while the Pulse (`progressReports`) is readable by
 * every signed-in user, so FORD text must never travel into it, and the
 * Pulse's words are only quoted, never stored under FORD.
 *
 * Words, never numbers: an intensity is the Dial's own word on the intensity
 * scale, and a statement's answer its word on the frequency scale
 * (`dialWord`), so "Moderate" here means what it means on the Pulse. The
 * statement text is looked up by id in SUBJECTIVE_CATEGORIES and the stress
 * labels are STRESS_CATEGORY_LABELS — both verbatim, never retyped.
 *
 * Which rounds: the newest two that said anything about the thing. A Pulse is
 * filled a piece at a time, so a round that never touched stress says
 * nothing about stress — "not raised" is only said of a round that talked
 * about stress and did not raise this worry.
 *
 * Pure: pulse-links.test.ts.
 */
import {
  FREQUENCY_SCALE,
  INTENSITY_SCALE,
  dialWord,
  tenToAbsolute,
} from "../rating/scales";
import { SUBJECTIVE_CATEGORIES, STRESS_CATEGORY_LABELS } from "../subjective-report/questions";
import { dayOrInstantMs, statementAnswer, type AssessmentHistoryReport } from "../subjective-report/assessment-history";
import type { StressAnchor, StressCategory } from "../subjective-report/types";
import type { FordPillar } from "./types";

/** The Pulse's stress worries each pillar sits beside. Dreams has none. */
export const FORD_PULSE_STRESS: Readonly<Record<FordPillar, readonly StressCategory[]>> = {
  family: ["caregiving", "family_health"],
  occupation: ["work", "retirement"],
  recreation: [],
  dreams: [],
};

/** The Pulse statements each pillar sits beside, by statement id. */
export const FORD_PULSE_STATEMENTS: Readonly<Record<FordPillar, readonly string[]>> = {
  family: [],
  occupation: [],
  recreation: ["lifestyleAlignment_2"],
  dreams: [],
};

export interface PulseLink {
  key: string;
  sentence: string;
}

/** A statement's text, verbatim, by its id; null for an id the Pulse does not have. */
export function statementText(id: string): string | null {
  for (const c of SUBJECTIVE_CATEGORIES) {
    for (const s of c.statements) if (s.id === id) return s.text;
  }
  return null;
}

/** "Mar 10" — "Mar 10, 2025" when it is not `now`'s year. A day key is read at local noon. */
function dayLabel(report: AssessmentHistoryReport, now: Date): string | null {
  const ms = dayOrInstantMs(report.date);
  if (ms === null) return null;
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Newest first, by the round's day (the history is newest first already; this makes sure). */
function newestFirst(rounds: readonly AssessmentHistoryReport[]): AssessmentHistoryReport[] {
  const t = (r: AssessmentHistoryReport) => dayOrInstantMs(r.date) ?? r.savedAtMs ?? 0;
  return rounds.slice().sort((a, b) => t(b) - t(a));
}

/** Did this round talk about stress at all? */
function touchedStress(r: AssessmentHistoryReport): boolean {
  const a = r.assessment;
  return (
    (Array.isArray(a?.stressAnchors) && a.stressAnchors.length > 0) ||
    (typeof a?.overallStressLevel === "number" && Number.isFinite(a.overallStressLevel)) ||
    r.sectionsReviewed.includes("stress")
  );
}

/** What one round said about one worry: raised (the word), resolved, or not raised. */
function stressPart(r: AssessmentHistoryReport, cat: StressCategory, date: string): string {
  const anchors = (r.assessment?.stressAnchors ?? []).filter((x: StressAnchor) => x?.category === cat);
  if (anchors.length === 0) return `not raised on ${date}`;
  const live = anchors.filter((x) => x.status !== "resolved" && Number.isFinite(x.intensity));
  if (live.length === 0) return `resolved on ${date}`;
  const worst = Math.max(...live.map((x) => x.intensity));
  return `${dialWord(INTENSITY_SCALE, tenToAbsolute(worst, INTENSITY_SCALE))} on ${date}`;
}

/**
 * The Pulse lines for each pillar. A stress line appears only when one of the
 * two rounds raised that worry; a statement line only when a round answered
 * it. Parts read oldest to newest: "Moderate on Dec 9, Mild on Mar 10."
 */
export function fordPulseLinks(
  rounds: readonly AssessmentHistoryReport[],
  now: Date = new Date(),
): Record<FordPillar, PulseLink[]> {
  const out: Record<FordPillar, PulseLink[]> = { family: [], occupation: [], recreation: [], dreams: [] };
  const sorted = newestFirst(rounds);
  const stressRounds = sorted.filter(touchedStress).slice(0, 2).reverse();

  for (const pillar of Object.keys(out) as FordPillar[]) {
    for (const cat of FORD_PULSE_STRESS[pillar]) {
      const raised = stressRounds.some((r) => (r.assessment?.stressAnchors ?? []).some((x) => x?.category === cat));
      if (!raised) continue;
      const parts: string[] = [];
      for (const r of stressRounds) {
        const date = dayLabel(r, now);
        if (date) parts.push(stressPart(r, cat, date));
      }
      if (parts.length === 0) continue;
      out[pillar].push({
        key: `stress:${cat}`,
        sentence: `Pulse stress, “${STRESS_CATEGORY_LABELS[cat]}”: ${parts.join(", ")}.`,
      });
    }

    for (const id of FORD_PULSE_STATEMENTS[pillar]) {
      const text = statementText(id);
      if (!text) continue;
      const answered = sorted
        .map((r) => ({ r, v: r.assessment ? statementAnswer(r.assessment, id) : null }))
        .filter((x): x is { r: AssessmentHistoryReport; v: number } => x.v !== null)
        .slice(0, 2)
        .reverse();
      const parts: string[] = [];
      for (const { r, v } of answered) {
        const date = dayLabel(r, now);
        if (date) parts.push(`${dialWord(FREQUENCY_SCALE, tenToAbsolute(v, FREQUENCY_SCALE))} on ${date}`);
      }
      if (parts.length === 0) continue;
      out[pillar].push({ key: `statement:${id}`, sentence: `Pulse, “${text}” ${parts.join(", ")}.` });
    }
  }
  return out;
}
