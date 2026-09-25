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

import { SUBJECTIVE_CATEGORIES, scoreCategory, type AssessmentHistory, type Rag } from "../subjective-report";
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

/**
 * The reading a saved Pulse gives an area: its colour when all three
 * statements were answered, "partial" when only some were, null when none.
 * The colour is `scoreCategory`'s own `status`, so this report never colours
 * an area the Pulse screen itself would show as part answered — one answered
 * statement is not enough to call an area red.
 */
function readingFor(area: (typeof SUBJECTIVE_CATEGORIES)[number], history: AssessmentHistory["reports"][number]): PulseRag | "partial" | null {
  const a = history.assessment;
  if (!a?.answers) return null;
  const score = scoreCategory(area.key, a.answers, a.scaleVersion ?? 2);
  if (score.status) return score.status;
  return score.answeredCount > 0 ? "partial" : null;
}

export function pulseTrend(history: AssessmentHistory | null, today = new Date()): PulseTrend {
  if (!history) return { status: "unavailable", areas: [], reports: 0, complete: true };
  // Oldest → newest, on the assessment's own day.
  const reports = [...history.reports].filter((r) => !!r.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!reports.length) return { status: "none", areas: [], reports: 0, complete: history.complete };

  const areas: PulseAreaTrend[] = SUBJECTIVE_CATEGORIES.map((area) => {
    let first: PulseAreaTrend["first"] = null;
    let latest: PulseAreaTrend["latest"] = null;
    // A part-answered Pulse is not a reading, but it is not silence either:
    // `anyPartial` stops "one Pulse so far" from being said when there were
    // more, and `partialSince` is the newest part answer after the last full
    // reading — the Pulse whose colour the trend cannot give.
    let anyPartial = false;
    let partialSince: string | null = null;
    for (const r of reports) {
      const reading = readingFor(area, r);
      if (!reading) continue;
      if (reading === "partial") {
        anyPartial = true;
        partialSince = r.date;
        continue;
      }
      if (!first) first = { date: r.date, rag: reading };
      latest = { date: r.date, rag: reading };
      partialSince = null;
    }
    if (!first || !latest) {
      const sentence = partialSince
        ? `${area.title}: not enough answered yet (part answered in ${monthWord(partialSince, today)})`
        : `${area.title}: not assessed yet`;
      return { key: area.key, title: area.title, first: null, latest: null, direction: null, sentence };
    }
    const single = first.date === latest.date;
    const direction: PulseDirection = single ? "single" : pulseDirection(first.rag, latest.rag);
    let sentence: string;
    if (single) sentence = `${area.title}: ${latest.rag} (${anyPartial ? "one full reading" : "one Pulse"} so far, ${monthWord(latest.date, today)})`;
    else if (direction === "same") sentence = `${area.title}: ${latest.rag} since ${monthWord(first.date, today)}, unchanged`;
    else sentence = `${area.title}: ${first.rag} → ${latest.rag} since ${monthWord(first.date, today)}`;
    if (partialSince) sentence += `; not enough answered in ${monthWord(partialSince, today)}`;
    return { key: area.key, title: area.title, first, latest, direction, sentence };
  });

  return { status: "ok", areas, reports: reports.length, complete: history.complete };
}
