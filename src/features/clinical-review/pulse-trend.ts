/**
 * PULSE TREND (reporting round, Sep 2026) — the eight Pulse areas, first
 * saved reading against the latest, as words.
 *
 * The Deep Dive's data is the sets; the Pulse is the client's own account.
 * Putting the two side by side is the point of the pain / incident panel:
 * "Sleep & Recovery went yellow → green in July" next to "the leg press
 * stalled in July" is a question worth asking. Pure — the loader in
 * useClinicalReport.ts hands it the `AssessmentHistory` the Pulse feature
 * already reads (`loadAssessmentHistory`), and a failed read arrives as
 * `null`, which this file reports as "unavailable", never as "no Pulse".
 *
 * Imports ONLY from the subjective-report barrel.
 */

import { SUBJECTIVE_CATEGORIES, ragForFraction, scoreCategory, type AssessmentHistory, type Rag } from "../subjective-report";
import type { PulseAreaTrend, PulseDirection, PulseRag, PulseTrend } from "./types";
import { shortDate } from "./analytics";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jul" or "Jul 2025" when the year is not this one — the Pulse moves in months, not days. */
export function monthWord(iso: string, today = new Date()): string {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return shortDate(iso);
  return y === today.getFullYear() ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`;
}

const RAG_RANK: Record<Rag, number> = { red: 0, yellow: 1, green: 2 };

export function pulseDirection(first: PulseRag, latest: PulseRag): PulseDirection {
  if (RAG_RANK[latest] > RAG_RANK[first]) return "up";
  if (RAG_RANK[latest] < RAG_RANK[first]) return "down";
  return "same";
}

/** The reading a saved Pulse gives an area, or null when it answered nothing there. */
function ragFor(area: (typeof SUBJECTIVE_CATEGORIES)[number], history: AssessmentHistory["reports"][number]): PulseRag | null {
  const a = history.assessment;
  if (!a?.answers) return null;
  const score = scoreCategory(area.key, a.answers, a.scaleVersion ?? 2);
  return ragForFraction(score.percent);
}

export function pulseTrend(history: AssessmentHistory | null, today = new Date()): PulseTrend {
  if (!history) return { status: "unavailable", areas: [], reports: 0, complete: true };
  // Oldest → newest, on the assessment's own day.
  const reports = [...history.reports].filter((r) => !!r.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!reports.length) return { status: "none", areas: [], reports: 0, complete: history.complete };

  const areas: PulseAreaTrend[] = SUBJECTIVE_CATEGORIES.map((area) => {
    let first: PulseAreaTrend["first"] = null;
    let latest: PulseAreaTrend["latest"] = null;
    for (const r of reports) {
      const rag = ragFor(area, r);
      if (!rag) continue;
      if (!first) first = { date: r.date, rag };
      latest = { date: r.date, rag };
    }
    if (!first || !latest) {
      return { key: area.key, title: area.title, first: null, latest: null, direction: null, sentence: `${area.title}: not assessed yet` };
    }
    const single = first.date === latest.date;
    const direction: PulseDirection = single ? "single" : pulseDirection(first.rag, latest.rag);
    let sentence: string;
    if (single) sentence = `${area.title}: ${latest.rag} (one Pulse so far, ${monthWord(latest.date, today)})`;
    else if (direction === "same") sentence = `${area.title}: ${latest.rag} since ${monthWord(first.date, today)}, unchanged`;
    else sentence = `${area.title}: ${first.rag} → ${latest.rag} since ${monthWord(first.date, today)}`;
    return { key: area.key, title: area.title, first, latest, direction, sentence };
  });

  return { status: "ok", areas, reports: reports.length, complete: history.complete };
}
